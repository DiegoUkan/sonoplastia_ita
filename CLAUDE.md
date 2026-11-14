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
- **2026-11-07 (noite): Fases 1, 2 e 3 implementadas + pedidos de interface.** Testado só com o
  autoteste oculto e os testes (67 passando, inclusive com o Louvor JA e a ARA reais deste PC);
  **ainda não visto nos projetores**. Feito:
  - **Interface:** tema claro suave (padrão; escuro nas Configurações); player embaixo das miniaturas,
    sempre visível (as miniaturas encolhem para caber); coluna lateral recolhível, que vira só o
    player na vertical (tocar, parar, ±10 s, repetir, volume vertical, mudo); "Enviar para" (Público /
    Palco / Todas) no topo das páginas de conteúdo.
  - **Miniaturas ao vivo:** capturam a própria página de cada saída (`webContents.getMediaSourceId`
    + `getUserMedia` com `chromeMediaSource: 'tab'`), reduzida na placa, sem decodificar o vídeo de
    novo. Funciona até com a janela oculta (o autoteste confere o vídeo andando). Sem janela, mostra o
    desenho de reserva (`Camadas` em escala). Aceitam arrastar mídia, música ou arquivo do Explorer.
  - **Fase 1 — Mídias:** biblioteca em `C:\Sonoplastia\midias\<tipo>\` (cópia, sha256 contra
    repetidos), janela oculta "sonda" que abre cada arquivo no Chromium (duração, tamanho, se toca,
    miniatura JPEG), conversão automática pelo ffmpeg do que não toca (fila, prioridade baixa,
    progresso), lixeira, renomear. Player com buscar, ±10 s, repetir, volume e mudo, para o vídeo de
    cada saída e para a trilha de áudio. Escolha da saída de som (`setSinkId`). Palco não decodifica
    vídeo: mostra nome + tempo que falta (opção "Mostrar vídeos nesta saída").
  - **Fase 2 — Músicas:** importador do Louvor JA (SQLite em somente leitura; "Importar todas" ou
    "Só a liturgia"); busca por título, nº do hino e trecho da letra (FTS5); cantado / playback /
    manual; a **janela de áudio oculta** é o relógio: a cada 50 ms calcula o trecho pelo tempo do
    áudio (antecipação configurável) e avisa o motor. Clicar num trecho pula o áudio para ele (ou para
    de seguir o áudio, conforme a configuração). Palco com o próximo trecho e sem fundo. Editor de
    letra e tempos com "marcar tempos" (Espaço). Passador: PageDown/PageUp.
  - **Fase 3 — Bíblia:** importa as versões achadas no PC (projeto de transcrição e
    `C:\Sonoplastia\biblias`), de arquivo .json ou de um endereço; 31 mil versículos em <1 s.
    Referências digitadas ("jo 3 16", "1 co 13 4-7", "primeira aos coríntios 13", "jó 1"), livro
    ambíguo pede escolha, palavras viram busca FTS. Versículo longo dividido em telas; segunda versão
    junto; histórico; passador anda versículo a versículo e troca de capítulo.
  - Texto que ajusta o tamanho sozinho (`TextoAjustado`, em % da altura da tela).
  - Banco `C:\Sonoplastia\dados\sonoplastia.db` pelo **`node:sqlite` embutido no Electron 45**
    (Node 24.22, SQLite 3.53 com FTS5): nenhum módulo nativo para compilar.
- **2026-11-14: Fase 4 (apresentações) implementada, sem o "modo PowerPoint" (animações).** Testado
  com os testes (Vitest) e o autoteste oculto; **ainda não visto nos projetores**. Feito:
  - Página **Apresentações**: importa .pptx/.ppsx/.pdf (botão ou arrastar; recusa .ppt/.pptm/.ppsm),
    cópia em `C:\Sonoplastia\midias\apresentacao\`, conversão em segundo plano (fila, progresso),
    grade de slides (ocultos apagados, ícones de vídeo/áudio/anotações), renomear, converter de novo,
    excluir (pergunta antes). Barra de baixo: anterior/próximo, slide no ar, anotações e o próximo.
  - **PPTX → PNG pelo PowerPoint (COM)**: `scripts/powershell/pptx-exportar.ps1` (anotações e slides
    ocultos junto). **PDF → PNG pelo leitor de PDF do Windows** (`Windows.Data.Pdf`):
    `scripts/powershell/pdf-exportar.ps1`. Nada novo para instalar. Imagens e miniaturas em
    `C:\Sonoplastia\cache\slides\<id>\<versão>\`; largura configurável (padrão 1920).
  - **Vídeos e áudios embutidos**: lidos do XML do .pptx (leitor de ZIP próprio, `src/main/apresentacoes/`),
    com posição, "no clique"/"sozinho", repetir e "tocar entre slides". Vídeo toca por cima do slide,
    no lugar dele; áudio vai para a trilha de áudio. O 1º "próximo" começa a mídia "no clique", o 2º
    troca de slide (como no PowerPoint). O player controla o vídeo do slide; "parar" volta ao começo.
  - Saídas: slide inteiro (faixas pretas se a proporção for outra); **Palco** com slide atual, próximo
    e número do slide (opção nova por saída) e, se ligar, as anotações; o Palco não decodifica o vídeo
    (selo com o tempo que falta).
  - **Passador**: PageDown/PageUp/setas, Home/End, número + Enter; em outra página (que não use o
    passador) PageDown/PageUp ainda andam a apresentação no ar. "." também liga o Preto.
  - Autoteste real neste PC: "IDEAIS EQUIPE aventureiros" (74 MB, 10 slides, áudio no 3, vídeo no 7)
    + "Mordomia.pdf" (16 páginas) importados em 24 s; vídeo esperou o clique e tocou sem perder quadros.
- **2026-11-14: músicas do dia importadas + controle remoto pelo celular.** Feito em paralelo com a
  Fase 4, por outra sessão, na mesma pasta.
  - Banco real (`C:\Sonoplastia\dados\sonoplastia.db`, cópia de antes em
    `sonoplastia.antes-musicas-2026-11-14.db`) com 8 músicas do Louvor JA, versões escolhidas pelo
    usuário: Casa de Benção (LJA 1676, só cantado), Intensamente (4767), Porque Ele Vive HA 471 (2218),
    Somos Teus Senhor HA 235 (1972), Mensageiro (136), Verei Jesus "Adoradores 2" (1321), Fortes (904),
    Unidos pela Palavra HA 54 (1781). Importadas com o próprio `importarLouvorJa` (lista de ids).
  - **Controle remoto**: servidor HTTP no processo principal (`src/main/remoto/`), porta 8090, em todas
    as placas de rede. O celular abre `http://<IP>:8090` (IP deste PC hoje: 192.168.3.11, rede "Particular"),
    digita o PIN (criado sozinho no 1º uso; o usuário escolheu um e, logo depois, **pediu para ficar
    sem PIN**: desligar "Pedir PIN" em Configurações → Controle remoto. Com o programa aberto, mudar
    pela tela, não no config.json, que o programa regrava). Página própria `remoto.html` (React, mesma aparência): Preto/Limpar/Logo em todas
    e por saída, o que está no ar, player (tocar/pausar, ±10 s, parar, volume, mudo), Músicas
    (busca, cantado/playback/só letra, trechos, seguir o áudio), Bíblia (referência, versículos,
    capítulos), Mídias, "Enviar para" e o **passador** fixo embaixo.
  - Testado com Vitest (`tests/remoto.test.ts`) e no autoteste (passo `remoto`: API + a página numa janela
    oculta de 390×844). **Ainda não aberto num celular de verdade.** O Firewall do Windows já tem regra
    "Permitir" para o electron.exe na rede Particular.
- **2026-11-14 (tarde): pedidos do usuário durante o uso real.** Testado com Vitest (109), typecheck e
  build numa pasta à parte (o programa estava aberto, então `out\` não foi recompilado). **Ainda não visto
  na tela:** precisa fechar o programa e abrir pelo `abrir.cmd`.
  - **Barra da música no ar** (`src/renderer/comando/BarraMusica.tsx`), no alto da coluna da música na
    página Músicas, aparece sempre que há música no ar (mesmo com outra escolhida na lista): tocar/pausar,
    tempo, trilha com uma marca no começo de cada trecho (clicar/arrastar pula), "Trecho 15/50" e "Seguir
    áudio". No manual, a trilha é pelos trechos e clicar vai ao trecho.
  - **Importar do Louvor JA saiu da página Músicas** ("Importar todas" e "Só a liturgia"). Agora só
    "Importar todas de novo…" em Configurações → Músicas, com explicação e confirmação. O programa recusa
    uma segunda importação ao mesmo tempo. O `modo 'liturgia'` ainda existe no código, sem botão.
  - **Configurações em pastas** (cartões; clicar entra; "← Configurações" volta). A pasta aberta fica
    lembrada enquanto o programa está aberto.
  - **Fundo padrão** (Configurações → Fundos) e **a música fecha sozinha quando o áudio termina** (antes a
    saída ficava parada na foto da música). Regras em "Decisões".
- **2026-11-14 (tarde): Fase 5 (liturgia) implementada, com SEÇÕES** (pedido do usuário: "cada seção tem
  uma imagem de fundo e agrupa os itens: Escola Sabatina, Louvor, Mensagem, Momento Infantil…").
  Testado com Vitest (125, 16 novos em `tests/liturgia.test.ts`), typecheck e **autoteste às 14h30,
  depois do culto** (build separado em `out-teste`, ver "Como rodar"; o programa de verdade continuou
  aberto): texto no ar com o fundo da seção no Público, passador de João 3:16 para 3:17, painel
  "Adicionar". As capturas mostraram a tela apertada a 1366 px; corrigido (painel lateral só quando em
  uso, botão "Abertura" vira ícone em seção estreita, linha de informações da seção com a largura toda).
  **Ainda não visto nos projetores nem usado pelo operador.** Feito:
  - Página **Liturgia** (primeira do menu e a que abre ao iniciar): escolher o culto (cultos por data e
    modelos), "Novo culto" a partir de um modelo (data = próximo sábado), nome, data, horário de início,
    "Modelo" (salva cópia como modelo), duplicar, excluir. Grava sozinho 0,5 s depois de cada mudança.
  - **Seções**: nome, imagem de fundo (clicar no quadrado ou arrastar uma imagem até ele; a imagem é
    copiada para `C:\Sonoplastia\midias\fundos\`), "fundo também nas músicas", subir/descer, remover,
    **Abertura** (mostra a imagem da seção em tela cheia, ou o nome sem imagem). Modelo padrão criado no
    1º uso: "Culto de sábado" com Escola Sabatina, Louvor, Momento Infantil, Mensagem (9:00).
  - **Itens**: música (cantado/playback/só letra), mídia (vídeo/imagem/áudio), apresentação, versículo
    (referência digitada + versão), texto, tela preta/logo. Painel "Adicionar" (busca na biblioteca) e
    "Editar" (título, saída própria, duração, "passar sozinho no fim", ligado/desligado, observação).
    Arrastar para reordenar ou mudar de seção; arrastar arquivos do Explorer para a seção importa e
    acrescenta; arrastar um item até a miniatura de uma saída põe no ar só nela.
  - **Modo culto** (barra de baixo): item no ar + observação, Anterior / **Próximo item** (teclas P / N),
    o que vem depois, relógio e atraso em relação ao horário previsto (só no dia do culto). Horário
    previsto de cada seção e item = início + durações dos itens ligados. "encerrar" tira o fundo da seção.
  - Execução no processo principal (`src/main/liturgia/executor.ts`): o passador anda DENTRO do item no ar
    (versículos e partes dos longos, slides, trechos da música); vídeo/áudio/música com "passar sozinho"
    vão para o próximo item quando terminam (telemetria do vídeo; `audio:terminou` do áudio). Item com
    problema (mídia apagada) avisa e fica marcado, para o próximo clique passar dele.
  - Banco: migração 3, tabela `liturgias` (seções e itens num JSON validado por zod em
    `src/shared/liturgia.ts`).

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
  opcional para animações (ainda não feito). **PDF pelo leitor de PDF do Windows** (`Windows.Data.Pdf`
  num script PowerShell), também na importação, no lugar do pdf.js (decidido em 2026-11-14: sem
  dependência nova, sem worker nem fontes para configurar; testado neste PC).
- O script do PowerPoint nunca fecha um PowerPoint que já estava aberto (só a apresentação que abriu);
  se travar por 2 min, o programa encerra o script e só o PowerPoint que ele mesmo abriu.
- Apresentações seguem a regra da música: o passador só atualiza as saídas que ainda mostram a
  apresentação; se nenhuma mostra mais, o "próximo" traz de volta o mesmo slide (não avança escondido).
  Clicar num slide mostra no "Enviar para" atual.
- Notas do orador ficam no estado do motor (são transmitidas só quando o slide muda).
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
- Tema da tela de comando: **claro suave por padrão** (pedido do usuário: "que não cansa o olho");
  cores só por tokens em `estilos.css` (`--color-*`), nunca cor fixa nos componentes.
- Comandos de mídia são eventos com contador (`ordem`, `busca.seq`): quem toca reaplica mesmo sem
  mudança de valor (ex.: tocar de novo um vídeo que terminou).
- Mostrar outra coisa numa saída que estava com a letra da música: a música continua (áudio e as
  outras saídas), mas para de atualizar aquela saída.
- Palco por padrão: sem vídeo (só nome e tempo), música sem fundo e com o próximo trecho. Configs
  antigas ganham esses padrões no Palco (`completarPadroesDoPalco`).
- Controles deslizantes e listas largam o foco depois de usados (o passador de slides manda setas).
- **Controle remoto** (`src/main/remoto/`, `src/renderer/remoto/`): HTTP + Server-Sent Events, sem
  biblioteca nova. Só os métodos de `METODOS_REMOTO` (`src/shared/remoto.ts`); comandos conferidos por
  `comandoRemoto` (arquivos só por `midia://`); PIN com cookie `HttpOnly; SameSite=Strict`; corpo só
  JSON; espera crescente depois de 5 PINs errados. Ligado por padrão, pedindo PIN.
- Passador do celular = PageDown/PageUp na tela de comando (`window.dispatchEvent` em
  `usePassadorRemoto`), pelo mesmo caminho do teclado: a página aberta decide; sem ela, a apresentação
  no ar. Exceções na própria página do celular: na aba Bíblia com versículo no ar, anda os versículos
  dela; com a letra de uma música no ar, anda os trechos.
- **Fundo de cada saída vem do tipo de conteúdo** (`fundoDe` no motor, aplicado a cada "mostrar"): letra
  usa a imagem da música (ou o fundo padrão, se ela não tem ou se "usar a imagem da própria música" está
  desligado); versículo e texto usam o fundo padrão; imagem, vídeo, slide e vazio ficam sem fundo. Trocar o
  fundo padrão muda na hora o que está no ar (`definirFundoPadrao`). O comando `fundo` manual (página
  Teste) vale até o próximo conteúdo. Por saída: "Bíblia e textos: mostrar o fundo padrão" (`textoComFundo`;
  o Palco vem desligado, como o fundo das músicas).
- **Fim do áudio da música:** a janela de áudio manda `audio:terminou` com a url, e o motor só aceita se
  for o áudio que está tocando e sem "repetir". O que acontece depende de `musicas.aoTerminar`: fechar a
  música (padrão, a tela fica vazia), fechar e mostrar o Logo (o Preto continua) ou manter como antes.
  Esse comando não está na lista do controle remoto.
- Configurações: cada pasta é um item de `PASTAS` em `PaginaConfiguracoes.tsx`. Uma opção nova entra no
  esquema da pasta dela (e aparece sozinha); uma pasta nova é um item novo em `PASTAS`.
- Montar o versículo para as saídas: `conteudoDoVersiculo` (`src/shared/biblia/mostrar.ts`), usado pelo
  celular. A página Bíblia do computador ainda tem a mesma lógica dentro dela (unificar depois).
  A liturgia (executor) também usa `conteudoDoVersiculo`.
- **Liturgia em seções; o fundo é da seção.** O motor guarda a liturgia em andamento (`estado.liturgia`:
  item no ar, seção e o fundo dela). Regra dos fundos (`fundoDe` no motor): com seção no ar e imagem
  nela, versículo e texto usam o fundo da seção no lugar do padrão; a letra também, se a seção tem
  "fundo também nas músicas" (padrão ligado); senão a imagem da música. "encerrar" volta tudo ao padrão.
  Mostrar outra coisa por outra página não encerra a liturgia (o versículo do pregador na Mensagem
  fica com o fundo da Mensagem).
- Liturgia guardada como documento JSON (seções + itens) numa linha da tabela `liturgias`, validado
  pelo esquema zod a cada gravação; os itens apontam para a biblioteca pelo id (música, mídia,
  apresentação). Item que aponta para algo apagado só dá erro na hora de pôr no ar.
- Passador na página Liturgia anda DENTRO do item (nunca pula para o próximo item sozinho: isso é o
  "Próximo item", tecla N, ou o "passar sozinho" no fim de vídeo/áudio/música). Item sem "dentro"
  (vídeo, imagem, texto): a tecla segue para a apresentação no ar, se houver.
- "Item ligado/desligado": o desligado fica na lista (para outra vez), mas o "Próximo item" pula ele e
  ele não conta no horário previsto.

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

Gera PNGs de cada janela em cada passo e `relatorio.json`. Passos: padrão de teste; vídeo (buscar
para 30 s, miniaturas ao vivo andando); Bíblia (importa a ARA do projeto de transcrição e digita
"jo 3 16" + Enter na página); música (importa do Louvor JA, toca cantado e confere a troca de trecho
aos 8 s); biblioteca (importa e analisa um vídeo); apresentação (importa um .pptx com vídeo/áudio e um
PDF reais deste PC, mostra, dá o clique do vídeo); controle remoto (PIN, métodos proibidos, passador,
e a página do celular numa janela oculta, com PNGs `r*-celular.png`); liturgia (culto de hoje do
modelo, seção com fundo, texto → versículo com o passador, PNGs `L*`); coluna recolhida; emergência.
`SONOPLASTIA_AUTOTESTE_PULAR=apresentacao,video` pula passos. **Abre o PowerPoint
(oculto) e pesa no computador: não rodar durante o culto.** Janela oculta só
pinta quando é capturada, por isso o autoteste captura duas vezes, e as transições CSS aparecem
congeladas no meio. Isso não acontece nas janelas visíveis.

Cuidados descobertos:
- O Electron 45 **não baixa o binário no `npm install`**. Rodar `node install.js` dentro de
  `node_modules\electron` (o `abrir.cmd` já faz isso).
- O ffmpeg usado (vídeo de teste e conversões) é o do Holyrics (`C:\Holyrics\Holyrics\files\ffmpeg.exe`),
  de **2014**: não tem `testsrc2`, o `aac` precisa de `-strict -2`; tem `libx264` e `libmp3lame`. Um
  `resources\ffmpeg.exe` tem prioridade, se for colocado lá.
- Electron rodando como Node (`ELECTRON_RUN_AS_NODE=1`) só mostra a saída se ela for redirecionada
  (`Start-Process -RedirectStandardOutput`).
- `SONOPLASTIA_DADOS` troca a pasta de dados (padrão `C:\Sonoplastia`).
- **Autoteste com o programa aberto** (não recompilar `out\`, que ele está usando): compilar em
  `out-teste` com caminho ABSOLUTO (`npx electron-vite build --outDir "<projeto>\out-teste"`; relativo, as
  telas vão parar em `src\renderer\out-teste`), criar `out-teste\package.json` com
  `{"name":"sonoplastia-teste","main":"./main/index.js"}` (outro nome = outra pasta de perfil do
  Chromium), copiar `scripts\powershell\*.ps1` para `out-teste\scripts\powershell\` e rodar
  `electron.exe out-teste --autoteste` com `SONOPLASTIA_DADOS`/`SONOPLASTIA_AUTOTESTE`. Apagar
  `out-teste` depois (não está no `.gitignore`).
- O `git` instalado depois não está no PATH do shell do Claude: usar `"C:\Program Files\Git\cmd\git.exe"`.

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
2. ~~Enviar ao GitHub~~ feito em 2026-11-07: `https://github.com/DiegoUkan/sonoplastia_ita` (ramo
   `main`). O shell do Claude **não consegue pedir login** (contêiner MSIX): se o login salvo for
   removido, enviar por um `.cmd` aberto com `explorer.exe`, que mostra a janela do GitHub.
3. **Conferir as Fases 1–3 no PC de verdade** (fora do culto): Configurações → Músicas → "Importar todas de novo…" (1.886
   músicas), Bíblia → importar ARA e NVI, Mídias → arrastar alguns vídeos do Holyrics; tocar uma
   música cantada e ver a letra trocar no projetor; escolher a saída de som (mesa) em Configurações.
   Medir memória e CPU com tudo aberto (miniaturas ao vivo ligadas).
4. ~~Commit e envio ao GitHub das Fases 1–3~~ feito (commit `20c3085`).
5. **Conferir a Fase 4 no PC de verdade** (fora do culto): Apresentações → importar um sermão .pptx
   e um .pdf; passar com o passador de slides no Público e ver o Palco (atual + próximo); um slide
   com vídeo (1º clique toca, 2º passa). Ligar "anotações" no Palco em Telas, se o pregador quiser.
6. Commit e envio ao GitHub da Fase 4: **o usuário decidiu (2026-11-14) fazer só depois do teste nos
   projetores** (item 5). Há outra sessão mexendo na mesma pasta (controle remoto pelo celular):
   combinar antes de fazer commit para não misturar as duas.
6a. **Abrir o controle remoto num celular de verdade** (mesmo Wi-Fi/roteador do PC): endereço e PIN na
   barra de baixo da tela de comando. Se não abrir, ver se o Wi-Fi é da mesma rede do cabo do PC
   (rede de visitantes costuma isolar os aparelhos). Commit do remoto junto ou separado da Fase 4
   (o usuário decide). Apagar a pasta de teste `C:\Sonoplastia-teste-remoto` se ainda existir.
7. ~~**Fase 5** (liturgia)~~ código pronto em 2026-11-14, com seções. **Conferir na tela** (fora do
   culto, programa reaberto pelo `abrir.cmd`): Liturgia → "Novo culto" do modelo; pôr imagem de fundo
   em cada seção; adicionar música, vídeo, versículo e texto; "Abertura" da seção; "Próximo item" (N)
   e o passador dentro do versículo; um vídeo com "passar sozinho". (O autoteste já passou, ver Status.)
   Commit da Fase 5 junto com a 4 e o remoto, depois do teste (o usuário decide).
8. **Fase 6** (`PLANO.md` §5.6): ferramentas (relógio, temporizador, QR code, sorteio), que depois
   entram como tipos de item da liturgia. (Modo PowerPoint com animações fica para depois, se fizer
   falta.)

## Pendências conhecidas

- "Limpar" esconde o conteúdo, mas um vídeo continua tocando (com som) por baixo. Falta a opção
  "ao limpar: pausar o vídeo" e o "ao terminar" do vídeo (preto / logo / congelar / próximo).
- Biblioteca: ainda sem coleções/etiquetas; arrastar para a lixeira não existe (só o botão).
- Bíblia: não há catálogo fixo para baixar versões (só arquivo ou endereço colado), porque não há uma
  fonte confirmada; ver com o usuário.
- Músicas: importar as que existem só no Holyrics ainda não foi feito.
- O pacote do renderer tem ~600 kB (React + ícones); não pesa porque carrega do disco.
- Apresentações: sem o modo PowerPoint (animações e transições do PowerPoint não aparecem: cada slide
  é uma imagem). Só o 1º vídeo de cada slide toca; vídeo dentro de grupo de formas pode ficar fora do
  lugar; áudio "no clique" com vários áudios no mesmo slide toca só o último.
- Instalador (Fase 8): copiar `scripts/powershell/*.ps1` para `resources\scripts` (o programa
  instalado procura lá; `extraResources` no electron-builder).
- Liturgia (falta do `PLANO.md` §5.5): itens ligados às séries do site (Fase 7); temporizador, relógio,
  QR e sorteio como itens (Fase 6); importar a liturgia do Louvor JA (`liturgia.ja`); transição por item.
  O controle remoto do celular ainda não mostra nem passa a liturgia. Sem desfazer: excluir item ou seção
  é na hora (a seção com itens pede confirmação).

## Perguntas em aberto

Lista completa no `PLANO.md` §10. As principais: onde está o "JSON do Louvor JA" que o usuário citou;
qual projetor é o Público e qual é o Palco (monitor 1 ou 3); nome do programa.

## Como trabalhar neste projeto

- Responder em português (pt-BR).
- Testar no PC da igreja fora do horário de culto e com o Holyrics fechado.
- Ao terminar uma sessão, atualizar "Status", "Decisões", "Próximos passos" e "Perguntas em aberto"
  aqui, e o `PLANO.md` se o desenho mudar.
