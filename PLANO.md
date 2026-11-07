# Plano de implementação — Sistema de sonoplastia (IASD Itaqui)

> Plano decidido em 2026-11-07, a partir da conversa com o usuário. O `CLAUDE.md` guarda o status e as
> decisões resumidas; este arquivo guarda o desenho completo. Ao mudar uma decisão, atualize aqui **e**
> registre a mudança em "Decisões" no `CLAUDE.md`.

## 1. Objetivo

Substituir o Holyrics no culto por um programa próprio, com interface limpa e profissional, feito para
o que a igreja precisa. O programa controla **3 telas**: o monitor de comando (do operador) e **2
projetores que mostram coisas diferentes** (chamados aqui de **Público** e **Palco**).

Os projetores precisam abrir **sozinhos**, no monitor certo, em tela cheia, como no Holyrics. Nada de
abrir navegador e arrastar janela.

### O que foi pedido

| # | Pedido | Seção |
|---|---|---|
| 1 | Apresentações dos pregadores: PPTX e PDF | 5.4 |
| 2 | Músicas com imagem de fundo e letra trocando no tempo do áudio, importadas do Louvor JA (importador atualizável) | 5.2 |
| 3 | Bíblia: baixar versões e apresentar de forma fácil. Depois: integrar a transcrição em tempo real (`..\Transcrição_tempo_real`) | 5.3, 5.11 |
| 4 | Pasta de vídeos, importação pela interface e download automático do site `itaqui.diegoukan.com/sonoplastia` | 5.1, 5.7 |
| 5 | Liturgia: sequência de itens de qualquer tipo (vídeo, imagem, áudio, pptx, pdf, música…) | 5.5 |
| 6 | Ferramentas: sorteio, temporizador, relógio, QR code (grande ou no canto, com link e texto) | 5.6 |
| 7 | Player de mídia: play, pause, stop, volume etc. | 4.5 |
| 8 | Miniaturas das telas Público e Palco acima do player, aceitando arrastar arquivos para tocar nelas | 4.5 |
| 9 | Configurações generosas: quase tudo liga e desliga, por tela (ex.: relógio só no projetor 1, só no 2 ou nos dois) | 5.8 |

## 2. Hardware e ambiente (PC da igreja, conferido em 2026-11-07)

| Item | Valor |
|---|---|
| Sistema | Windows 10 Pro 19045 |
| CPU / RAM | Intel i3-7100 (2 núcleos / 4 threads), 8 GB |
| Placas de vídeo | NVIDIA GeForce GT 730 (driver 475.06, geração Kepler) + Intel HD 630 (do processador) |
| Telas | 2 ligadas na GT 730 e 1 na Intel (informação do usuário) |
| `\\.\DISPLAY4` | 1366×768, posição (0,0): **principal**, monitor de comando ("SMB1630N"); no programa: monitor 2 |
| `\\.\DISPLAY1` | 1024×768 (4:3), à esquerda (x = −1024): projetor, sem nome informado; no programa: monitor 1 |
| `\\.\DISPLAY3` | 1024×606, à direita (x = 1366): projetor "EPSON PJ"; no programa: monitor 3 |
| PowerPoint | Instalado: Office 16, 32 bits (`C:\Program Files (x86)\Microsoft Office\Root\Office16\POWERPNT.EXE`) |
| LibreOffice | Não instalado |
| Node / npm | v22.16.0 / 10.9.2 |
| Git | **Não instalado** (instalar o Git for Windows antes de começar) |
| Louvor JA | Instalado: `C:\Program Files (x86)\Louvor JA\config\database.db` |
| Holyrics | Instalado em `C:\Holyrics\Holyrics` (tem `files\ffmpeg.exe`, mas é de 2014: sem `testsrc2`, `aac` só com `-strict -2`) |

Consequências:
- **Os dois projetores têm proporções diferentes** (4:3 e ~16:9,5). Cada saída precisa ser desenhada no
  tamanho real da tela dela, com ajuste próprio. Não dá para presumir 1920×1080.
- A GT 730 (Kepler) decodifica **H.264** na placa, mas **não** HEVC/H.265 nem VP9. Vídeos fora de H.264
  são convertidos na importação (ffmpeg em segundo plano, com prioridade baixa).
- O PC é fraco: **nunca decodificar o mesmo vídeo duas vezes** (ver miniaturas e regras do Palco), não
  carregar tudo na memória e não deixar processos pesados rodando no culto.
- Duas placas: uma das saídas fica na placa "errada" para o Chromium, e o Windows copia a imagem entre
  as placas. Funciona, mas pode custar desempenho. **Testar vídeo nos dois projetores logo na Fase 0.** Se
  um deles engasgar, deixar o Público (que toca vídeo) na GT 730.
- O Claude (app de desktop) roda num contêiner MSIX neste PC: o que o shell do Claude grava em `AppData`
  vai para `%LOCALAPPDATA%\Packages\Claude_*\LocalCache` (ver `..\Transcrição_tempo_real\CLAUDE.md`). Por
  isso os dados do programa ficam em `C:\Sonoplastia\`, fora do AppData (seção 6). Se o `npm`/Electron der
  problema rodando pelo shell do Claude, rodar por um `.cmd` com clique duplo.

## 3. Tecnologia

**Decisão: programa de desktop em Electron + TypeScript, interface em React.**

Por que não servidor + navegador no projetor: alguém teria que abrir e posicionar a janela a cada culto;
o navegador bloqueia vídeo/áudio com som sem um clique; pop-ups e avisos podem aparecer na frente da
igreja. O próprio projeto de transcrição já sofreu com isso (o Opera GX bloqueava a conexão em localhost).

Por que Electron:
- Lista os monitores e abre uma janela sem borda, em tela cheia, em cada projetor. Reabre sozinho
  quando o projetor é desligado e religado.
- Interface em tecnologia web: é onde fica mais fácil fazer uma interface bonita (a queixa contra o
  Holyrics).
- Vídeo com decodificação na placa, escolha do dispositivo de saída de áudio, PDF nativo (pdf.js).
- Gera instalador `.exe` e permite atualização automática.
- A transcrição (Python/FastAPI, eventos SSE) se integra por HTTP, sem reescrever.

Alternativas descartadas: Tauri (memória parecida, backend em Rust mais difícil de manter), C#/WPF
(interface bonita dá muito mais trabalho), Python/Qt (vídeo e interface piores).

### Bibliotecas previstas

| Função | Escolha |
|---|---|
| Build e dev | `electron-vite` (Vite para main, preload e renderer) |
| Interface | React + TypeScript, Tailwind CSS + shadcn/ui (Radix), ícones `lucide-react` |
| Estado na interface | Zustand |
| Arrastar e soltar | `dnd-kit` dentro da interface; arquivos vindos do Explorer pelo drag nativo do HTML |
| Banco | SQLite via `better-sqlite3` (FTS5 para a busca na Bíblia e nas letras), migrações versionadas |
| Esquema de configurações | `zod` (tipos, valores padrão e validação; a tela de configurações é gerada a partir do esquema) |
| PDF | `pdfjs-dist` |
| PPTX | PowerPoint via COM, por scripts PowerShell (seção 5.4) |
| Vídeo/áudio: miniaturas, duração, conversão | `ffmpeg` e `ffprobe` empacotados em `resources/` |
| QR code | `qrcode` |
| Instalador / atualização | `electron-builder` (NSIS) / `electron-updater` (opcional) |
| Testes | Vitest (lógica); Playwright para Electron (interface, opcional) |

Fixar versões exatas no `package.json`. Ao escolher a versão do Electron, confirmar que ainda suporta o
Windows 10.

## 4. Arquitetura

```
┌──────────────────────────── Processo principal (motor) ────────────────────────────┐
│  Telas (monitores → saídas)   Estado das saídas (fonte da verdade)   Configurações │
│  Biblioteca (SQLite + arquivos)   Importadores (Louvor JA, Bíblia, PPTX, PDF)      │
│  Sincronização com o site   Conversões (ffmpeg, PowerPoint)   Servidor remoto*     │
└──────────┬──────────────────────┬────────────────────┬─────────────────────┬───────┘
           │ IPC                  │ IPC                │ IPC                 │ IPC
   Janela de comando        Saída "Público"       Saída "Palco"       Janela de áudio
   (monitor principal)      (projetor A)          (projetor B)        (oculta)
                                                                       * fase futura
```

- **O motor é a única fonte da verdade.** A interface manda comandos (`mostrar item X na saída Y`,
  `pausar`, `próximo slide`…). O motor atualiza o estado e o transmite para todas as janelas. Se uma
  saída recarregar ou travar e voltar, ela recebe o estado completo e volta exatamente igual.
- **Janelas de saída** só desenham o estado (camadas, seção 4.2). Não têm lógica de negócio.
- **Janela de áudio oculta:** toca as músicas e os áudios avulsos. Assim o som não para se uma saída
  recarregar, e o relógio da música (que comanda a troca de slides) fica num lugar só. O som de um
  **vídeo** sai da própria saída onde ele toca (para não perder a sincronia).
- Os contratos de IPC (tipos dos comandos e do estado) ficam em `src/shared/` e são usados pelos dois
  lados.

### 4.1 Telas e saídas

- As saídas são configuráveis (não fixas em 2): nome (Público, Palco…), monitor, ativa/inativa.
- Mapeamento saída → monitor: guarda `display.id`, rótulo, resolução e posição. Ao abrir, procura pelo
  id; se não achar, pela resolução e posição. Botão **"Identificar telas"** mostra um número grande em
  cada tela.
- Janela de saída: sem borda, tela cheia no monitor, sempre no topo, fora da barra de tarefas, cursor
  escondido, fundo preto, `autoplayPolicy: 'no-user-gesture-required'`, `backgroundThrottling: false`.
- Eventos `display-added` / `display-removed` / `display-metrics-changed`: fecha ou reabre a saída no
  lugar certo e avisa na tela de comando.
- **Modo janela** (teste fora do culto, ou monitor faltando): a saída abre como janela comum,
  redimensionável, no monitor de comando.
- Cada saída é desenhada no tamanho real da tela dela. Imagem e vídeo têm modo de ajuste (ajustar,
  preencher, esticar) e margem de segurança configuráveis por saída.
- Ao iniciar: abrir as saídas configuradas automaticamente (configurável) e mostrar a tela de espera
  (logo ou preto).

### 4.2 Camadas de cada saída

De baixo para cima:
1. **Fundo**: cor, imagem ou vídeo em loop (ex.: fundo da música).
2. **Conteúdo**: slide de música, versículo, slide de PPTX/PDF, vídeo, imagem, texto livre.
3. **Sobreposições**: relógio, temporizador, QR code, logo/marca d'água, rodapé de aviso, sorteio.
   Cada uma tem visibilidade **por saída**, posição (9 pontos + personalizada), tamanho e estilo.
4. **Controles de tela** (por saída e "todas"): **Preto**, **Limpar texto** (mantém o fundo), **Logo /
   espera**.

Transições: corte ou esmaecimento (duração configurável), por tipo de conteúdo e por saída.

### 4.3 O que cada saída mostra (padrões, todos configuráveis)

| Conteúdo | Público | Palco |
|---|---|---|
| Música | fundo + letra | letra sem fundo, trecho seguinte menor, relógio |
| Bíblia | versículo + referência | versículo (fonte própria) |
| PPTX / PDF | slide | slide atual + próximo (opção: anotações) |
| Vídeo | vídeo | "▶ Nome do vídeo — 02:31 restantes" (sem decodificar o vídeo de novo); opção de espelhar |
| Imagem | imagem | imagem ou nada |
| Temporizador | nada | temporizador |
| Relógio | nada | relógio no canto |

Cada tipo de conteúdo pode ser enviado a uma saída, à outra ou às duas. A regra padrão de cada tipo fica
nas configurações, e cada item da liturgia pode sobrescrever a regra.

### 4.4 Prévia × no ar

Dois modos (configurável): **direto** (clicar já põe no ar) ou **com prévia** (clicar carrega na
prévia; Enter ou "Enviar" põe no ar). A tela de comando sempre mostra o que está no ar em cada saída.

### 4.5 Miniaturas das saídas e player de mídia

Na tela de comando, à direita: miniatura do **Público** e do **Palco** (lado a lado ou empilhadas) e,
logo abaixo, o **player**.

- A miniatura usa **os mesmos componentes** da saída, em escala: mostra exatamente o que está no ar. Para
  vídeo, mostra quadros capturados da saída (`webContents.capturePage`) algumas vezes por segundo
  (padrão 4, configurável), para não decodificar o vídeo duas vezes.
- **Arrastar e soltar** na miniatura: um item da biblioteca, da liturgia ou um arquivo do Explorer
  começa a tocar naquela saída. Arquivo de fora é importado para a biblioteca antes. Soltar em "Todas"
  manda para as duas.
- Player: play/pause, stop, voltar/avançar 10 s, barra de posição (decorrido e restante), volume, mudo,
  repetir, fade de entrada e saída, "ao terminar" (preto, logo, congelar o último quadro, próximo item da
  liturgia) e dispositivo de saída de áudio (`setSinkId`, ex.: direto para a mesa de som). Se as duas
  saídas tiverem mídia tocando, o player ganha uma aba para cada uma.

### 4.6 Tela de comando (layout)

Tema escuro por padrão (a sala de som é escura), botões grandes, pouco texto.

```
┌──────────────┬───────────────────────────────────┬───────────────────────┐
│ Liturgia     │                                   │ [Público]  [Palco]    │
│ Músicas      │   Conteúdo da aba escolhida       │  miniaturas (soltar   │
│ Bíblia       │   (slides da música, versículos,  │  arquivos aqui)       │
│ Mídias       │   slides da apresentação…)        ├───────────────────────┤
│ Apresentações│                                   │ Player de mídia       │
│ Ferramentas  │                                   ├───────────────────────┤
│              │                                   │ Preto · Limpar · Logo │
├──────────────┴───────────────────────────────────┴───────────────────────┤
│ status: site sincronizado · relógio · avisos                              │
└───────────────────────────────────────────────────────────────────────────┘
```

Busca global (Ctrl+K): músicas, versículos, mídias e itens da liturgia num campo só.

## 5. Módulos

### 5.1 Biblioteca de mídias

- Tipos: vídeo, imagem, áudio, apresentação (pptx/pdf).
- Importar pelo botão ou arrastando arquivos para a janela. O arquivo é **copiado** para
  `C:\Sonoplastia\midias\<tipo>\` (o original não é mexido). Duplicados detectados por sha256.
- Na importação: `ffprobe` (duração, resolução, codec), miniatura (`ffmpeg`), conversão para H.264/AAC se
  o codec não for suportado pela GT 730. Opção "otimizar para os projetores" (reduzir para 720p ou
  1080p). Tudo em fila de segundo plano com prioridade baixa; o item mostra o progresso.
- Pastas/coleções, etiquetas, busca, ordenação, renomear e excluir (lixeira interna antes de apagar de
  vez).
- Coleção automática **"Sábado"** com o que veio do site (5.7).

### 5.2 Músicas

**Importador do Louvor JA** (porta para TypeScript do `..\Integração holyrics\louvorja\lja.py`):
- Lê `C:\Program Files (x86)\Louvor JA\config\database.db` em **somente leitura**.
- Tabelas: `musics` (nome, MP3 cantado `id_file_music`, MP3 playback `id_file_instrumental_music`,
  imagem `id_file_image`, `id_language`), `lyrics` (`lyric`, `aux_lyric`, `time`, `instrumental_time`,
  `show_slide`, `"order"`), `albums` / `albums_musics` (álbum e faixa; nos álbuns "Hinário Adventista" e
  "Hinário Adventista 1996" a faixa é o número do hino), `files` (`subdirectory` + `file_name`, relativo a
  `config\`; MP3s em `config\musicas\`).
- Tempo dos slides: texto `HH:MM:SS(.fff)` → milissegundos (`_ms` no `lja.py`). Cada slide tem tempo de
  início na versão cantada e na playback.
- Só português (`id_language='pt'`) por padrão. Importar tudo (~1.900 músicas), um álbum ou só as da
  liturgia do Louvor JA (`%APPDATA%\LouvorJA\liturgia.ja`, formato INI, `tipo=musica`, `musica=<id>`).
- **Atualização:** cada música guarda a origem `LJA-<id_music>`. Reimportar atualiza o que mudou no Louvor
  JA e **não sobrescreve** músicas editadas aqui (marca "editada localmente"; o importador mostra a
  diferença e pergunta).
- Áudios e imagens: por padrão **referenciados no lugar** (pasta do Louvor JA, sem duplicar gigabytes);
  opção de copiar para a biblioteca.
- O usuário disse que o Louvor JA "disponibiliza JSON". O que existe hoje é o banco SQLite (acima) e o
  `exportar_para_holyrics.py`, que gera JSON para o Holyrics. Se houver um JSON online, ele vira uma
  segunda fonte do importador (pergunta em aberto).

**Tocar a música:**
- Modos: **cantado**, **playback** e **sem áudio** (troca manual). No playback, usa `instrumental_time`
  se existir; senão, o tempo do cantado.
- O áudio toca na janela de áudio oculta. O slide atual é calculado pelo tempo do áudio, com
  **antecipação** configurável (padrão 250 ms, como no `player_sincronia.py`). Pausar, voltar ou avançar
  o áudio mantém a letra certa.
- Clicar num slide durante a música: pula o áudio para o tempo daquele slide (configurável: pular o
  áudio ou só mostrar o slide e parar de seguir o áudio). Botão "voltar a seguir o áudio".
- Slide sem texto = parte instrumental (mostra só o fundo, ou mantém o anterior; configurável).
- Estilo: fonte, tamanho automático (mínimo e máximo), contorno, sombra, caixa alta, alinhamento,
  posição, escurecer o fundo (%), título no primeiro slide. Por saída.
- Fundo: imagem da música (Louvor JA), fundo padrão ou escolhido por música.

**Biblioteca e editor:**
- Busca por título, número do hino, álbum e trecho da letra (FTS5).
- Criar e editar música: letra por slides, fundo, áudios. **"Marcar tempos"**: toca o áudio e o operador
  aperta espaço a cada troca de slide; o editor grava os tempos.
- Futuro: importar as músicas que existem só no Holyrics (avaliar o formato de exportação dele).

### 5.3 Bíblia

- Formato das versões: JSON igual ao do projeto de transcrição (repositório `damarals/biblias`):
  lista de livros `[{"abbrev": "Gn", "chapters": [["v1", "v2", …], …]}, …]`. ARA e NVI já estão em
  `..\Transcrição_tempo_real\data\biblia\`. Os nomes dos livros vêm da tabela de 66 livros (portar de
  `..\Transcrição_tempo_real\src\igreja\biblia\livros.py`).
- **Baixar versões:** catálogo de versões disponíveis (lista com URL, sigla, nome, tamanho) + importar
  de arquivo. Ao importar, os versículos entram no SQLite com índice FTS5 (busca por palavra rápida, sem
  carregar 4 MB por versão na memória).
- Direitos autorais: NVI (Biblica) e ARA (SBB) costumam permitir a projeção no culto com a sigla
  visível. Sempre mostrar a sigla na referência. Os arquivos das versões não vão para o git.
- **Busca por referência digitada:** "jo 3 16", "joão 3:16-18", "1 co 13", "sl 23" (portar a parte de
  texto do parser de `..\Transcrição_tempo_real\src\igreja\refs\`). Sugestões enquanto digita.
- **Busca por palavras:** FTS5, com destaque do termo.
- Apresentar: um ou vários versículos. Versículo longo é dividido em mais de uma tela automaticamente
  (máximo de linhas configurável). Próximo e anterior versículo a versículo, com prévia do próximo.
- Segunda versão: lado a lado, embaixo, ou uma versão por saída.
- Formato da referência configurável ("João 3:16 (NVI)"), número do versículo visível ou não.
- Histórico dos versículos mostrados no culto; favoritos; versículos podem entrar na liturgia.

### 5.4 Apresentações (PPTX e PDF)

PPTX, com o PowerPoint instalado no PC:
- **Modo imagem (padrão):** na importação, um script PowerShell abre o arquivo pelo PowerPoint (COM,
  invisível) e exporta cada slide como PNG na resolução das saídas (`Slide.Export`), junto com as
  anotações do orador. Fica igual ao original, mas **sem animações**. Os vídeos embutidos
  (`ppt/media/*.mp4` dentro do pptx) são extraídos e o slide é marcado como "tem vídeo", para tocar o
  vídeo por cima do slide.
- **Modo PowerPoint (opcional, por apresentação):** para apresentações com animações. O programa abre a
  apresentação de slides do próprio PowerPoint, move a janela para o monitor da saída e controla
  próximo/anterior por COM. Nesse modo a miniatura mostra a imagem exportada do slide atual.
- Recusar `.pptm`, `.ppsm` e `.ppt` (podem ter macros), como o site já faz.

PDF:
- `pdfjs-dist` desenha cada página no tamanho da saída; miniaturas geradas na importação.

Comum aos dois:
- Grade de slides, próximo/anterior, ir para slide, anotações visíveis só na tela de comando.
- Passador de slides (envia PageDown/PageUp/setas): funciona com a janela de comando em foco; opção de
  atalho global (cuidado: rouba as teclas de outros programas, por isso vem desligada).

### 5.5 Liturgia

- Um roteiro por culto (data + nome), com itens em ordem. Tipos: música, vídeo, imagem, áudio, PPTX,
  PDF, versículo(s), texto livre/aviso, temporizador, relógio, QR code, sorteio, tela preta, logo.
- Por item: saída(s) de destino (sobrescreve a regra padrão), transição, **avanço automático** (ex.: o
  vídeo terminou → próximo item, ou para), horário previsto, duração estimada e observações para o
  operador.
- **Modelos:** "Culto de sábado" salvo como modelo → "Novo culto a partir do modelo".
- **Itens ligados ao site:** um item pode ser "série Provai e Vede" em vez de um arquivo fixo. Ele usa
  sempre o vídeo da semana que a sincronização baixou (5.7). Se o vídeo da semana não chegou, o item fica
  vermelho com o motivo, em vez do vídeo de erro de 1 segundo que existe hoje para o Holyrics.
- Modo culto: item atual em destaque, botão grande "Próximo", prévia do próximo item, tempo total
  previsto e atraso em relação ao horário.
- Arrastar da biblioteca para a liturgia; reordenar arrastando; duplicar; ativar e desativar item.
- Opcional: importar a liturgia do Louvor JA (`liturgia.ja`).

### 5.6 Ferramentas

Todas aparecem como sobreposição ou tela cheia, com **visibilidade por saída** e posição e estilo
configuráveis, e podem ser itens da liturgia.

- **Relógio:** formato (HH:MM, HH:MM:SS, 12/24 h), data opcional, posição, tamanho, cor, fundo. Por
  saída (só Público, só Palco, ambas).
- **Temporizador:**
  - regressivo por duração (ex.: 30 min de sermão) ou até um horário (ex.: "o culto começa às 9h00");
  - cronômetro progressivo;
  - alertas de cor configuráveis (ex.: amarelo nos últimos 5 min, vermelho no fim), piscar e mensagem
    ao terminar ("Tempo esgotado"); continuar contando negativo ou parar;
  - predefinições ("Sermão 40 min", "Escola Sabatina 45 min"); vários temporizadores salvos;
  - padrão: só no Palco.
- **QR code:**
  - link + texto opcional (nome ou descrição);
  - modo **grande** (tela cheia, centralizado, texto embaixo) ou **canto** (tamanho e canto
    configuráveis, texto ao lado ou embaixo);
  - cores, margem e o link escrito embaixo (opcional);
  - predefinições salvas ("Site da igreja", "Instagram"…).
- **Sorteio:**
  - lista de nomes (colar, digitar ou importar CSV/TXT) ou intervalo de números;
  - animação de nomes passando, com duração configurável; som opcional;
  - sem repetir os já sorteados (opcional); histórico; sortear vários de uma vez;
  - mostrar na(s) saída(s) escolhida(s).
- Sugestões (não pedidas, avaliar com o usuário): **mensagem rápida para o Palco** (ex.: "Faltam 5
  minutos", só no Palco); **rodapé de aviso** no Público.

### 5.7 Sincronização com o site da sonoplastia

Porta para TypeScript do `..\Integração holyrics\sonoplastia_sync.py`, sem a parte do "nome fixo no
Holyrics" (aqui a liturgia aponta para a série, e não para um arquivo).

- Lê `https://itaqui.diegoukan.com/sonoplastia/status.json?t=<timestamp>`. Contrato atual: `sabado_alvo`,
  `executado_em`, `itens[]` com `serie` (`avisos`, `provai`, `informativo`, `saude`), `status`
  (`"OK"`/`"Erro"`), `arquivo` (nome simples dentro de `videos/`, com a data do sábado no nome),
  `detalhe`, `titulo`, `midia.bytes` e, quando houver, `sha256` e `atualizado_em`.
- Quando o site publicar o `manifest.json` (pedido em `..\Integração holyrics\prompt-site-sonoplastia.md`):
  ler com `Authorization: Bearer <chave de leitura>`. Ele inclui os envios das pessoas (mensagem musical,
  apresentações, vídeos, imagens, áudios) com `id`, `categoria`, `tipo_midia`, `status`
  (`OK`/`Erro`/`Pendente`), `arquivo`, `bytes`, `sha256`, `titulo`.
- Regras herdadas do script atual:
  - só baixa item `"OK"` para o sábado de referência (hoje, se for sábado; senão, o próximo) e com a
    data desse sábado no nome;
  - automático só de sexta 00:00 até sábado 10:00, a cada 5 min (tudo configurável); botão "Atualizar
    agora" ignora a janela;
  - aceita só nomes simples e caminhos relativos ao site (sem `..`, sem URL externa);
  - baixa para uma pasta temporária, confere tamanho e sha256 e só então move para a biblioteca;
  - baixa de novo só quando o nome, o tamanho ou o sha256 mudam; guarda backups por série (padrão 2);
  - arquivo em uso no ar não é trocado: tenta de novo na próxima passada;
  - limite de banda opcional; `User-Agent: SonoplastiaSync/1.0` (o servidor fica atrás do Cloudflare,
    que bloqueia o User-Agent padrão de algumas bibliotecas).
- Painel de status: cada série/envio com OK / Erro / Pendente, motivo e horário da última verificação;
  notificação na tela de comando quando chega algo novo.
- **Transição:** enquanto o Holyrics estiver em uso, o `sonoplastia_sync.py` continua alimentando o
  Holyrics. Os dois baixam para pastas separadas, sem conflito.

### 5.8 Configurações ("generosas")

- **Um esquema único** (`zod`) define cada opção: tipo, valor padrão, texto de ajuda e seção. A tela de
  configurações é gerada a partir dele, então cada opção nova custa pouco.
- Configuração **por saída** onde fizer sentido (texto, sobreposições, regras de conteúdo).
- **Perfis** (ex.: "Culto de sábado", "Evento jovem"), exportar/importar em JSON e "voltar ao padrão"
  por seção.
- Seções e exemplos:
  - **Telas:** monitor de cada saída, nome, ativa, abrir ao iniciar, modo janela, ajuste de imagem,
    margem de segurança, tela de espera, cursor.
  - **Conteúdo por saída:** a tabela da seção 4.3, item por item.
  - **Texto:** fonte, tamanhos, contorno, sombra, caixa alta, alinhamento, posição, cor (separado para
    música, Bíblia e texto livre, por saída).
  - **Transições:** tipo e duração por tipo de conteúdo.
  - **Músicas:** antecipação (ms), seguir o áudio, comportamento do clique, parte instrumental, título no
    primeiro slide, escurecer fundo.
  - **Bíblia:** versão padrão, segunda versão, formato da referência, número do versículo, máximo de
    linhas por tela.
  - **Vídeo e áudio:** volume padrão, fade, "ao terminar", dispositivo de saída de áudio, conversão
    automática, espelhar vídeo no Palco.
  - **Ferramentas:** relógio, temporizador, QR e sorteio (tudo da 5.6).
  - **Sincronização:** URL do site, chave de leitura, janela de horário, intervalo, limite de banda.
  - **Atalhos de teclado.**
  - **Geral:** prévia × direto, pasta de dados, iniciar com o Windows, backup automático, tema claro ou
    escuro, miniaturas (quadros por segundo).

### 5.9 Atalhos e passador

Atalhos configuráveis. Padrões: ←/→ e PageUp/PageDown (anterior/próximo slide ou versículo), Espaço
(play/pause), Esc (limpar), B (preto), L (logo), Ctrl+K (busca), F1/F2 (foco na saída 1/2). Mesmas teclas
do telão da transcrição, onde coincidirem.

### 5.10 Backup e registros

- Backup automático diário do banco e das configurações (`C:\Sonoplastia\backups\`, guarda os últimos
  N) + botão "Fazer backup agora" e "Restaurar".
- Registros com rotação em `C:\Sonoplastia\logs\` (importações, sincronização, erros das saídas).

### 5.11 Futuro: controle remoto e transcrição

- **Controle remoto pela rede (opcional, desligado por padrão):** o motor abre um servidor HTTP na rede
  local com PIN: passar slides pelo celular, ver e ajustar o temporizador, tela simples para o pregador.
  Usar SSE + POST (não WebSocket), pelo mesmo motivo do projeto de transcrição. Os projetores nunca
  dependem desse servidor.
- **Transcrição em tempo real:** o projeto `..\Transcrição_tempo_real` já é um servidor FastAPI que
  publica sugestões de versículos por SSE em `/eventos`. Integração: um painel "Sugestões" na aba Bíblia
  lê esses eventos; clicar numa sugestão mostra o versículo **pela saída deste programa** (o texto vem
  da base de Bíblia daqui, nunca da IA). A transcrição continua sendo um processo separado, ligado só
  quando for usar (ela ocupa ~2,3 GB de RAM com o `bge-m3`).

## 6. Dados e pastas

Tudo em `C:\Sonoplastia\` (configurável), fora do AppData (problema do contêiner MSIX) e num caminho sem
espaços (o perfil do Windows tem espaços: `IASD - ITAQUI`).

```
C:\Sonoplastia\
  dados\sonoplastia.db     banco SQLite
  dados\config.json        configurações (tem a chave do site: não vai para o git)
  midias\video\ imagem\ audio\ apresentacao\
  cache\miniaturas\ cache\slides\<id da apresentação>\
  biblias\                 JSON das versões baixadas
  sync\temp\ sync\backup\
  backups\  logs\
```

Banco (visão geral): `midias`, `colecoes`, `musicas`, `musica_slides` (texto, ms_cantado, ms_playback),
`biblia_versoes`, `biblia_versiculos` (+ FTS5), `apresentacoes`, `apresentacao_slides`, `liturgias`,
`liturgia_itens`, `modelos_liturgia`, `predefinicoes` (temporizadores, QR, listas de sorteio),
`sync_itens`, `migracoes`.

## 7. Estrutura do código

```
Sistema_sonoplastia\
  CLAUDE.md  PLANO.md  package.json  electron.vite.config.ts  electron-builder.yml
  src\
    main\                processo principal (motor)
      telas\             monitores, janelas de saída, identificar telas
      motor\             estado das saídas, camadas, comandos, transmissão
      biblioteca\        banco, migrações, importação de mídias, ffmpeg
      musicas\           importador Louvor JA, cronograma dos slides
      biblia\            versões, busca, parser de referências
      apresentacoes\     PPTX (PowerPoint COM), PDF
      liturgia\
      ferramentas\       temporizadores, sorteio
      sync\              site da sonoplastia
      config\            esquema zod, padrões, perfis
      remoto\            servidor na rede (fase futura)
    preload\
    renderer\
      comando\           janela de comando (React)
      saida\             janela de saída (React, só desenha camadas)
      audio\             janela de áudio oculta
      compartilhado\     componentes das camadas (usados na saída e nas miniaturas)
    shared\              tipos, contratos de IPC, esquema de configurações
  scripts\powershell\    pptx-exportar.ps1, pptx-apresentar.ps1
  resources\             ffmpeg.exe, ffprobe.exe, ícones
  tests\
```

## 8. Fases

Cada fase termina com algo testável no PC da igreja. Testar fora do horário de culto, com o Holyrics
fechado (os dois programas brigam pelos projetores).

| Fase | Entrega | Pronto quando |
|---|---|---|
| **0. Fundação** (código pronto em 2026-11-07; falta o teste nos projetores) | Git, projeto Electron + React + TS, motor de estado, saídas automáticas nos monitores, identificar telas, modo janela, camadas, Preto/Limpar/Logo, esquema de configurações e tela básica | Ao abrir o programa, as duas saídas aparecem sozinhas nos projetores certos, voltam ao religar o projetor e mostram uma imagem de teste. Um vídeo de teste roda liso nos **dois** projetores (teste das duas placas). |
| **1. Mídias, player e miniaturas** | Biblioteca (importar, arrastar, ffmpeg, conversão), vídeo/imagem/áudio nas saídas, player completo, saída de áudio, miniaturas com arrastar e soltar, regra do Palco para vídeo | Arrastar um vídeo para a miniatura do Público toca no projetor; o player controla; o Palco mostra o tempo restante. |
| **2. Músicas** | Importador Louvor JA, biblioteca e busca, tocar com letra no tempo (cantado/playback/manual), fundos, estilos, Palco com próximo trecho, editor e "marcar tempos" | Uma música do Louvor JA toca com a letra trocando no tempo certo, inclusive pausando e pulando. |
| **3. Bíblia** | Importar ARA/NVI, catálogo para baixar versões, FTS, parser de referência, apresentação com divisão automática, navegação, segunda versão | Digitar "jo 3 16" e mostrar em menos de 1 segundo; avançar versículo a versículo. |
| **4. Apresentações** | PPTX por PowerPoint COM (imagens + anotações + vídeos embutidos), PDF por pdf.js, passador, modo PowerPoint | Um pptx de pregador importado fica igual ao original e passa pelo passador. |
| **5. Liturgia** | Roteiro com todos os tipos, modelos, avanço automático, horários, itens ligados às séries do site | Um culto inteiro roda pela liturgia com o botão "Próximo". |
| **6. Ferramentas** | Relógio, temporizador, QR code, sorteio (sobreposição/tela cheia, por saída) | Relógio só no Palco, QR no canto do Público, temporizador com alertas. |
| **7. Sincronização do site** | Porta do `sonoplastia_sync.py`, painel de status, `manifest.json` quando existir | Na sexta, os vídeos da semana aparecem sozinhos e a liturgia já aponta para eles. |
| **8. Acabamento** | Todas as configurações, perfis, atalhos, backup, registros, instalador NSIS, iniciar com o Windows, atualização automática (opcional), teste de desempenho num culto inteiro | Instalado pelo `.exe` no PC da igreja e usado num culto real no lugar do Holyrics. |
| **9. Futuro** | Controle remoto pela rede; integração com a transcrição; importar músicas do Holyrics | — |

Ordem pensada para o primeiro culto real logo após a Fase 5 (com as ferramentas mais simples, como o
relógio, adiantadas se fizer falta). Até lá, o Holyrics continua no culto.

## 9. Riscos e cuidados técnicos

- **Duas placas de vídeo:** testar já na Fase 0 (ver seção 2). Plano B: definir no Windows (Configurações
  → Sistema → Tela → Elementos gráficos) a GT 730 para o programa, e deixar a saída com vídeo na GT 730.
- **IDs dos monitores mudam** quando se troca o cabo de porta ou se atualiza o driver: por isso o
  mapeamento também usa resolução e posição, e existe o botão "Identificar telas".
- **PowerPoint por COM:** pode deixar processos `POWERPNT.EXE` presos se um script falhar. Sempre fechar
  em `finally`, com tempo limite e encerrando o processo se travar. Converter na importação, nunca
  durante o culto.
- **Vídeo no mesmo instante nas duas saídas** (se alguém configurar espelhar): duas decodificações no
  i3. O padrão do Palco evita isso. Se for usado, sincronizar pela posição do Público e soltar o som só
  de uma saída.
- **Memória:** o Electron com 4 janelas deve ficar em ~500 MB. Junto com a transcrição (~2,3 GB) fica
  apertado nos 8 GB: medir num culto inteiro na Fase 8.
- **Módulo nativo** (`better-sqlite3`): precisa ser compilado para a versão do Electron
  (`electron-builder install-app-deps`). Se der problema no Windows, avaliar o `node:sqlite` embutido.
- **Contêiner MSIX do Claude:** ver seção 2.

## 10. Perguntas em aberto

- Onde está o "JSON do Louvor JA" que o usuário citou? (Hoje o importador lê o banco SQLite.)
- Nome do programa (provisório: "Sonoplastia").
- Qual projetor é o Público e qual é o Palco (1024×768 à esquerda, na Intel; 1024×606 à direita, na
  GT 730)? Por que um deles está em 1024×606 (resolução nativa do aparelho ou ajuste do Windows)?
- Logo e identidade visual da igreja para a tela de espera e a interface.
- Atualização automática: publicar as versões onde (GitHub? servidor `diegoukan.com`)?
- As sugestões da seção 5.6 (mensagem rápida para o Palco, rodapé de aviso) entram?
