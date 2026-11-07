# Sistema de sonoplastia — IASD Itaqui

> **Este arquivo é a memória compartilhada entre contas do Claude.** O usuário troca de conta quando a
> cota acaba, e o histórico da conversa não passa de uma conta para outra. Ao fim de cada sessão (ou
> antes de uma tarefa longa), atualize "Status", "Decisões" e "Próximos passos" aqui.
>
> **O desenho completo está em [`PLANO.md`](PLANO.md). Leia antes de implementar qualquer coisa.**

## Objetivo

Programa de desktop próprio para substituir o Holyrics no culto: interface limpa e profissional, 3 telas
(monitor de comando + 2 projetores com conteúdos diferentes, "Público" e "Palco"), abrindo os projetores
sozinho. Faz: apresentações PPTX/PDF, músicas do Louvor JA com letra no tempo do áudio, Bíblia, vídeos
(com download automático do site da sonoplastia), liturgia, player de mídia, miniaturas das saídas com
arrastar e soltar, relógio, temporizador, QR code, sorteio e configurações bem amplas (quase tudo por
saída).

## Status

- **2026-11-07:** ideia, requisitos e arquitetura definidos com o usuário; `PLANO.md` escrito.
- **2026-11-07 (noite): Fase 0 implementada, falta o teste nos projetores reais.** Feito:
  - Projeto Electron 45.2.3 + electron-vite 6 + Vite 8 + React 19 + TypeScript 7 + Tailwind 4 + zod 4
    (versões fixas no `package.json`).
  - Motor (`src/main/motor.ts`): estado de cada saída (conteúdo, chave, fundo, tela, vídeo), comandos
    `mostrar`/`fundo`/`tela`/`video`/`volume`, alvo = id da saída ou `todas`.
  - Telas (`src/main/telas/`): numera monitores da esquerda para a direita; cada saída abre sem borda
    no monitor escolhido, por cima de tudo e sem pegar o foco; reage a monitor ligado/desligado;
    "Identificar telas"; sem monitor escolhido a saída abre como **janela de teste** (padrão no 1º uso,
    então o programa não toma os projetores sozinho até alguém escolher o monitor).
  - Saída em camadas (`src/renderer/compartilhado/Camadas.tsx`): fundo → conteúdo (vazio, padrão de
    teste, texto, imagem, vídeo) → logo → preto, com esmaecimento sem "vazar" o que está embaixo.
  - Tela de comando: páginas Teste, Telas e Configurações; miniaturas das saídas com Preto / Limpar /
    Logo por saída e para todas (atalhos B, Esc, L); telemetria de vídeo (quadros perdidos por saída).
  - Configurações com esquema zod que gera o formulário (`FormularioEsquema.tsx`).
  - Protocolo `midia://` com suporte a Range (vídeo pula), só para arquivos liberados.
  - 28 testes (Vitest) e um **autoteste** (`--autoteste`) que roda tudo com janelas ocultas e sem som.
- Resultado do autoteste no PC da igreja: tudo desenhou; vídeo 1080p de teste tocou (5 s, 168
  quadros, 1 perdido), pausa funcionou. **Ainda não foi visto em nenhum projetor** (o Holyrics estava
  aberto no sábado à noite, então nada foi mostrado nas telas).
- **2026-11-07 ~18h35: primeiro teste real do usuário travou a tela de comando.** Ele pôs o Público
  no monitor 3 e o Palco no 1 (funcionou). Depois escolheu o "Monitor 2" (a tela de comando) para uma
  saída. A saída (sem borda, por cima de tudo, sem receber clique nem foco) cobriu o monitor de preto e
  o programa ficou inacessível, inclusive ao abrir de novo (a escolha estava salva). Correções:
  - o monitor principal **nunca** recebe saída: opção desativada na lista e, se uma configuração
    antiga apontar para ele, a saída abre como janela de teste com aviso;
  - **atalho de emergência Ctrl+Shift+F12** (registrado no Windows inteiro): fecha todas as saídas e
    traz a tela de comando; voltam com "Reabrir saídas". Aparece na barra de status;
  - as listas de opção perdem o foco depois da escolha (as setas e o passador mudavam o monitor sem
    querer; provavelmente foi assim que o Palco ficou sem monitor);
  - "Identificar telas" no monitor de comando é só um cartão no meio, não a tela inteira;
  - o log registra para onde cada saída foi (`C:\Sonoplastia\logs\sonoplastia.log`).
  - Configuração do usuário restaurada: Público → monitor 3 (EPSON PJ), Palco → monitor 1. A versão
    com defeito ficou em `C:\Sonoplastia\dados\config.antes-da-correcao.json`.
- **2026-11-07:** Git for Windows 2.56 instalado; repositório iniciado (ramo `main`, identidade
  "IASD Itaqui" só neste repositório), primeiro commit feito. Envio para um repositório privado no
  GitHub combinado com o usuário (login pela janela do Git Credential Manager, removido depois).

## Decisões

- **Electron + TypeScript + React** (programa instalável), não servidor + navegador. Motivos e
  alternativas no `PLANO.md` §3. O usuário recebeu a recomendação e seguiu para o plano sem objeção.
- Os dois projetores mostram **coisas diferentes** (Público e Palco). Saídas configuráveis, cada conteúdo
  com regra por saída (`PLANO.md` §4.3).
- O motor (processo principal) é a única fonte da verdade; as janelas de saída só desenham o estado.
  Músicas e áudios tocam numa janela de áudio oculta.
- **Nunca decodificar o mesmo vídeo duas vezes** (PC fraco): o Palco mostra "vídeo tocando + tempo
  restante" e as miniaturas usam quadros capturados.
- PPTX: exportar slides como imagem pelo **PowerPoint (COM)** na importação; modo PowerPoint nativo
  opcional para animações. PDF por pdf.js.
- Músicas: importador lê o banco SQLite do Louvor JA em somente leitura (porta do `lja.py`), guarda a
  origem `LJA-<id>` e não sobrescreve edições locais.
- Bíblia: JSON no formato `damarals/biblias` (ARA e NVI já existem no projeto de transcrição), busca
  FTS5 no SQLite. Sempre mostrar a sigla da versão.
- Sincronização com o site: porta do `sonoplastia_sync.py` (mesmas regras), sem o truque do nome fixo; a
  liturgia aponta para a série.
- Dados em `C:\Sonoplastia\` (fora do AppData por causa do contêiner MSIX do Claude, e sem espaços no
  caminho).
- Configurações definidas num esquema único (`zod`) que gera a tela de configurações.
- Saída sem monitor escolhido abre como janela de teste no monitor de comando; o programa só ocupa um
  projetor depois que alguém escolhe o monitor em Telas.
- **O monitor principal do Windows (a tela de comando) nunca recebe saída**, nem escolhido nem "por
  semelhança". Regra em `planejarSaidas` (`src/main/telas/combinar.ts`), com teste.
- **Sempre existe saída de emergência:** Ctrl+Shift+F12 fecha todas as saídas (`globalShortcut`, e
  também pela tela de comando se outro programa já usar a combinação). Qualquer janela nova que fique
  por cima de tudo tem que respeitar essa regra.
- Janelas de saída não pegam o foco (o teclado e o passador ficam sempre na tela de comando). Por isso
  controles que mudam com as setas (listas de opção) perdem o foco depois de usados.
- Conteúdo novo tira "Limpar" e "Logo", mas **não** tira o Preto (só sai com comando explícito).
- Mesmo vídeo em várias saídas: só a primeira solta o som.

## PC da igreja (onde o programa vai rodar)

Windows 10 Pro, i3-7100, 8 GB, GeForce GT 730 (Kepler: só H.264 na placa) + Intel HD 630. Telas, como o
programa numera (esquerda → direita):
1. 1024×768, x = −1024, sem nome informado (Intel)
2. 1366×768, principal, "SMB1630N": monitor de comando
3. 1024×606, x = 1366, "EPSON PJ" (GT 730)

PowerPoint 2016+ (32 bits) instalado, LibreOffice não. Node 22.16 / npm 10.9. Detalhes e consequências no
`PLANO.md` §2.

## Como rodar

```
abrir.cmd                 # clique duplo: instala o que faltar, compila e abre (dados em C:\Sonoplastia)
npm run dev               # desenvolvimento com recarga automática (F12 = DevTools, F5 = recarregar)
npm test                  # testes (Vitest)
npm run typecheck         # verificação de tipos
npm run build             # compila para out/
```

**Autoteste sem mexer nos projetores** (janelas ocultas, sem som, dados numa pasta à parte):

```powershell
$env:SONOPLASTIA_DADOS = "<pasta temporária>\dados-teste"; $env:SONOPLASTIA_AUTOTESTE = "<pasta temporária>\autoteste"
npm run build; node_modules\electron\dist\electron.exe . --autoteste
```

Gera PNGs de cada janela em cada passo e `relatorio.json` (telas, telemetria do vídeo, estado final).
Janela oculta só pinta quando é capturada, por isso o autoteste captura duas vezes, e as transições
CSS aparecem congeladas no meio. Isso não acontece nas janelas visíveis.

Cuidados descobertos:
- O Electron 45 **não baixa o binário no `npm install`**. Rodar `node install.js` dentro de
  `node_modules\electron` (o `abrir.cmd` já faz isso).
- O ffmpeg do Holyrics (`C:\Holyrics\Holyrics\files\ffmpeg.exe`) é de **2014**: não tem `testsrc2`, e o
  `aac` precisa de `-strict -2`. Tem `libx264`. Na Fase 1, trazer um ffmpeg atual em `resources/`.
- `SONOPLASTIA_DADOS` troca a pasta de dados (padrão `C:\Sonoplastia`).

**O Claude (app de desktop) roda num contêiner MSIX neste PC:** o que o shell do Claude grava em
`AppData` vai para `%LOCALAPPDATA%\Packages\Claude_*\LocalCache`. Se instalar ou rodar algo pelo shell do
Claude falhar, rodar por um `.cmd` com clique duplo (ou `explorer.exe "<arquivo>.cmd"`).

## Projetos relacionados (mesma pasta `Projetos`)

- `..\Integração holyrics\` — o que existe hoje em produção com o Holyrics:
  - `louvorja\lja.py`: leitura do banco do Louvor JA (base do importador de músicas).
  - `louvorja\player_sincronia.py`: troca de slides pelo tempo do áudio (antecipação de 250 ms).
  - `sonoplastia_sync.py`: download dos vídeos do sábado a partir do `status.json` do site.
  - `prompt-site-sonoplastia.md`: contrato do `status.json` e do futuro `manifest.json` do site.
  - `holyrics-config.json` tem token do Holyrics: não copiar para este projeto.
- `..\Transcrição_tempo_real\` — sugestões de versículos ao vivo (Python, FastAPI, SSE em `/eventos`).
  Integração prevista para depois (`PLANO.md` §5.11). Tem o parser de referências e a tabela de livros.

## Próximos passos

1. **Fechar a Fase 0 nos projetores reais** (fora do horário de culto, com o Holyrics fechado). Os
   monitores já estão configurados (Público = 3, Palco = 1). `abrir.cmd` → aba Teste:
   padrão de teste (círculo redondo, setas dos cantos visíveis, barra laranja lisa) e "Vídeo de teste
   1080p" em cada projetor, olhando a coluna "Quadros perdidos". Desligar e religar um projetor para
   ver a saída voltar sozinha. Fechar e abrir o programa para ver as saídas voltarem nos lugares.
2. Enviar o repositório ao GitHub (se ainda não foi): o usuário cria um repositório privado vazio e
   passa o endereço; `git remote add origin <endereço>` e `git push -u origin main`.
3. **Fase 1** (`PLANO.md` §8): biblioteca de mídias, player completo, miniaturas com quadros reais do
   vídeo e arrastar e soltar, regra do Palco para vídeo, ffmpeg atual em `resources/`.

## Pendências conhecidas (Fase 0)

- "Limpar" esconde o conteúdo, mas um vídeo continua tocando (com som) por baixo. Decidir na Fase 1
  (opção "ao limpar: pausar o vídeo").
- O texto ainda não ajusta o tamanho da fonte ao espaço (vem com as músicas, na Fase 2).
- O pacote do renderer tem ~590 kB (React + ícones); não pesa porque carrega do disco, mas dá para
  enxugar depois.

## Perguntas em aberto

Lista completa no `PLANO.md` §10. As principais: onde está o "JSON do Louvor JA" que o usuário citou;
qual projetor é o Público e qual é o Palco (monitor 1 ou 3); nome do programa.

## Como trabalhar neste projeto

- Responder em português (pt-BR).
- Testar no PC da igreja fora do horário de culto e com o Holyrics fechado.
- Ao terminar uma sessão, atualizar "Status", "Decisões", "Próximos passos" e "Perguntas em aberto"
  aqui, e o `PLANO.md` se o desenho mudar.
