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
- **2026-11-14 ~15h45: commit `59391f8` (Fases 4, 5 e controle remoto) enviado ao GitHub** (o usuário
  pediu o push antes do teste nos projetores).
- **2026-11-14 (fim da tarde): Fase 6 (ferramentas) + pedidos do usuário.** Testado com Vitest (145,
  20 novos em `tests/ferramentas.test.ts`), typecheck e autoteste às 16h15–16h23 (build em `out-teste`,
  passos leves; o programa de verdade e o Holyrics continuaram abertos; o usuário autorizou). **Ainda não
  visto nos projetores nem usado pelo operador. Nada disto foi commitado.** Feito:
  - **Ferramentas** (`src/shared/ferramentas.ts`, `src/renderer/compartilhado/Ferramentas.tsx`, página
    **Ferramentas** `PaginaFerramentas.tsx`): relógio, temporizador (regressivo, até um horário,
    cronômetro; amarelo/vermelho, piscar e mensagem no fim, ±1 min, atalhos "Sermão 40", "Escola
    Sabatina 45"), QR code (`qrcode-generator` 1.4.4, única dependência nova; links guardados), mensagem
    rápida (faixa amarela embaixo; atalhos "Faltam 5 minutos"…) e sorteio (nomes ou números, quantos,
    sem repetir, animação). Cada uma, por saída: Não / Canto (posição em 9 pontos + tamanho) / Tela cheia.
    **Relógio pedido pelo usuário: no Palco por padrão** (`relogio: 'canto'` em `PADROES_PALCO`, também
    nas configurações antigas), no Público só se ligar.
  - Itens novos na liturgia: **temporizador** (ex.: contagem até 9:00; "passar sozinho" no 0:00), **QR
    code** e **sorteio** (o passador sorteia). Saem da tela quando a liturgia passa para outro item, a
    não ser que o item peça para continuar.
  - **Música "escolher na hora"** (pedido): na liturgia, música pode ser Cantado / Playback / Só a letra /
    Escolher na hora. Ao entrar no ar, a tela de comando pergunta (C, P ou L) e nada muda nos projetores
    até a escolha (`EstadoLiturgia.escolherVersao`, `FocoMusica.tsx`). No painel Adicionar, clicar na
    música mostra as 4 opções com explicação.
  - **Painel grande da música só com a letra** (pedido): com música manual no ar, a tela de comando
    escurece e fica a letra grande, o próximo trecho, a lista de trechos e Anterior/Próximo; →, PageDown e
    Espaço passam em qualquer página; dá para minimizar (fica um botão). Configurações → Músicas → "Só a
    letra: abrir o painel grande dos trechos".
  - **Volume único e gravado** (pedido: "trocar de vídeo para áudio voltava ao máximo"): o volume vale
    para vídeos, áudios e músicas, e fica em `geral.volume` (grava 0,8 s depois de soltar). O mudo
    continua de cada um.
  - **Iluminação (luz.local)** (pedido): API descoberta lendo a página do sistema (só leitura):
    `/status`, `/get-names`, `/list-scenarios`, `/toggle?id&user`, `/load-scenario?name&user` (não há
    "ligar/desligar", só alternar). 8 relés (5 com nome) e 4 cenários ("1. Ligar tudo", "2. Desligar
    tudo", "3. Laterais", "4. Projetor"). Botão **Luzes** na barra de baixo abre o painel (relés e
    cenários); cada item da liturgia pode ter cenário ao começar e ao sair (`luzInicio`/`luzFim`).
    O processo principal fala com as luzes (`src/main/iluminacao.ts`; a página delas não libera CORS) e
    guarda o IP (achar "luz.local" leva ~3 s no Windows). **No autoteste nada é mandado para as luzes.
    Nenhum comando foi testado nas luzes de verdade** (só leitura).
  - **Bíblia em tabela** (pedido, com imagem de modelo): livros em grade 11×6 com cores por grupo
    (tokens `--color-biblia-*`), capítulos e versículos em botões; passar o mouse mostra o texto.
    Botões Tabela / Texto; digitar volta para o Texto.
  - **Miniaturas nos itens da liturgia** (pedido): imagem do vídeo/imagem, 1º slide, imagem da música,
    o próprio QR; os outros, o ícone do tipo.
- **2026-11-14 ~16h30: pedidos para o Palco e o Público** (`Camadas.tsx`, `config.ts`). Testado com Vitest
  (146), typecheck e autoteste leve às 16h29 (`out\` recompilado: o programa estava fechado). **Ainda não
  visto nos projetores. Nada commitado.**
  - Palco: o **próximo trecho da música** e a **linha que divide** agora são brancos (antes cinza).
  - Público: a imagem atrás de letra/versículo/texto escurece **10%** (antes 35% fixo), opção nova por
    saída `fundoEscurecer` (0–80%, deslizante em Telas); a **sombra do texto** ficou mais forte (contorno +
    esfumado largo, em `em`, cresce com a letra). `TextoAjustado` corta com `overflow: clip` e 4cqh de
    folga, para a sombra não ficar com borda reta.
  - **Último slide só no Palco**: opção `slideAvisarFim` (Palco ligado por padrão, também nas configurações
    antigas; Público desligado). Com o próximo slide ao lado: no lugar dele uma caixa vermelha "ÚLTIMO
    SLIDE", rótulo "FIM" e o número em vermelho. Sem o próximo: selo vermelho no alto do slide. "Último" =
    o motor não acha próximo (`proximoUrl` nulo; slides ocultos contam).
  - Autoteste: captura `9b-ultimo-slide` (último slide do PDF) e `SONOPLASTIA_AUTOTESTE_PULAR=pptx` (só o
    PDF, sem abrir o PowerPoint).
- **2026-11-14 ~18h15: commit `70d04b8` (Fase 6 e os pedidos de 14/11 à tarde) enviado ao GitHub** (o "nada
  commitado" das duas entradas acima ficou para trás).
- **2026-11-15: projeto clonado num PC de desenvolvimento** (`E:\Pastas\Projetos\sonoplastia-ita`; Node 26, sem
  `C:\Sonoplastia`, sem Holyrics e sem Louvor JA: os 6 testes com dados reais pulam sozinhos).
- **2026-11-15: Fase 7 (arquivos do site) implementada pelo catálogo `manifest.json`, sem senha.** Testado com Vitest
  (175; 25 novos em `tests/site.test.ts`, contra um site de mentira local com chave falsa), typecheck, build e uma
  leitura do manifesto real (só o JSON; nada baixado; 8 itens lidos sem erro). Depois, o programa foi aberto neste
  PC com uma pasta de dados de teste e o endereço real: baixou só a imagem fixa (os semanais eram de 14/11, sábado de
  referência 21/11), telas conferidas por captura (Do site, selos, Configurações, aviso na liturgia), sem erros no
  console e sem a chave no log. **Ainda não rodou no PC da igreja.** Enviado ao GitHub em 2026-11-15. Feito:
  - O site ganhou um catálogo só de leitura (`manifest.json`, schema_version 1) num endereço com uma chave aleatória:
    não precisa de senha, cookie nem login. **O modelo antigo (senha da igreja + `safeStorage` + ler as páginas do
    site) nunca chegou a ser implementado** (só estava no plano) e foi trocado por este.
  - `src/main/site/manifesto.ts` (leitura e regras puras: versão 1, item estranho vira aviso, nome de arquivo seguro,
    mesma origem, chave escondida no log), `baixar.ts` (streaming para `.part` em `C:\Sonoplastia\cache\site`, retomada
    com Range + If-Range/ETag, desiste após 60 s sem dados, confere `size_bytes`), `sincronizador.ts` (a passada).
  - A cada `refresh_after_seconds` (300 s) lê o manifesto; baixa só `available` + `valid_for_sabbath` + `download_url`
    do mesmo site; vídeo/imagem/áudio vão para Mídias (o arquivo é MOVIDO, sem cópia dupla), .pptx/.ppsx/.pdf para
    Apresentações, o resto fica "Tipo não usado". Falha: tenta de novo em 30 s, 1 min, 2 min… até 5 min.
  - **Séries semanais e fixos = uma mídia só** (`substituirArquivo`): a versão nova troca o arquivo e mantém o id, então
    os itens da liturgia que usam a série já pegam o vídeo novo; o antigo é apagado. Com a mídia no ar, a troca espera.
  - Liturgia: item de série semanal cujo arquivo não é deste sábado fica com aviso amarelo na lista e **não entra no
    ar** pela liturgia (erro explicando; pela página Mídias ainda dá). Envios e fixos não bloqueiam.
  - **Envios** entram como mídias novas; quando `expires_at` passa (ou somem do site), vão para a lixeira de Mídias,
    só se o manifesto veio sem `warnings`. O que o operador tirar da biblioteca não volta (a versão nova de uma série
    volta e a mídia sai da lixeira).
  - "Novo": selo nos cartões, contador no menu Mídias e na aba **Mídias → Do site** (status de cada arquivo, última
    e próxima conferida, "Marcar como vistos"); ir ao ar também tira o "novo". O botão **"Atualizar do site"** fica
    na barra da página Mídias, ao lado do "Importar…" (pedido do usuário: dentro da aba ficava escondido). Configurações → **Site da
    igreja** (ligar e o endereço, num campo escondido, `x-ui: 'segredo'`). Barra de baixo mostra o download.
  - Banco: migração 4, tabela `site_itens`. Miniaturas das mídias agora têm a versão no nome (`<id>-<versão>.jpg`).
- **2026-11-15 (noite, no PC da igreja, durante um culto): primeira versão das sugestões de versículos ao vivo + estudo
  do YouTube** (commit `7a3ce58`, outra sessão). Porta do projeto de transcrição com painel "Sugestões" e "Ouvir", sem
  projetar sozinho. **Substituída em 2026-11-16 pela Bíblia automática** (abaixo), que segue o pedido mais novo do
  usuário. Dela ficaram: a seção "Sugestões ao vivo" no celular, o botão "Copiar do projeto de transcrição", a chave
  também em `X-Api-Key` com endereço próprio, a instalação do SDK pelo `abrir.cmd` e o `ESTUDO-YOUTUBE.md` (tocar
  direto × baixar antes; nada implementado, esperando a escolha). O código dela continua no histórico do git.
- **2026-11-16: Bíblia automática (transcrição + IA) implementada no programa**, a partir do projeto Python
  `Z:\Arquivos\Projetos\Hermes\Transcrição_igreja` (neste PC de desenvolvimento; é o `Transcrição_tempo_real` do PC da
  igreja). Reescrita em TypeScript dentro do Electron, sem o processo Python. Testado com Vitest (241; 66 novos em
  `tests/transcricao.test.ts`, com servidor de IA e WebSocket do ElevenLabs de mentira), typecheck, build e autoteste
  (passo `transcricao`: microfone de mentira com um .wav, clique em "Automático", "João capítulo três, versículo
  dezesseis" foi para a tela sozinho, PageDown foi para 3:17, "Testar a IA" nos dois formatos pelo `net.fetch`).
  **Nenhuma chamada real ao ElevenLabs nem à IA foi feita** (não usei as chaves do projeto Python). **Ainda não rodou
  no PC da igreja nem com microfone de verdade.** Juntada (rebase) com a versão de 15/11 e enviada ao GitHub. Feito:
  - Página **Bíblia**: `Manual | Automático` no alto (o programa sempre abre no Manual). No Automático, a vista
    **Sugestões**: situação (ouvindo / em espera / pausado / erro), medidor do microfone, gasto (chamadas, tokens,
    tempo de transcrição), a fala ao vivo e os cartões (Citado, Lido, Citação, Paráfrase, Alusão, Tema…; "na tela
    sozinho"). Clicar mostra no "Enviar para" e o passador continua dali. Barra de baixo: "Bíblia automática: ouvindo".
  - **Configurações → Bíblia automática (IA)**: chave do ElevenLabs, microfone; formato da API (Anthropic ou compatível
    com OpenAI), URL, chave, modelo (padrão `claude-haiku-5-5`, com "Buscar modelos"), **chamar a IA a cada N s**
    (padrão 5), **fala analisada (últimos N s)** (40), palavras novas para chamar (12), rigor (55); citação direta
    (Não / referência dita / referência ou leitura, padrão), sensibilidade à voz, segundos de silêncio para pausar
    (20), pausar com música/áudio/vídeo do programa. Botões "Copiar do projeto de transcrição", "Testar a IA" e "Testar o ElevenLabs".
  - Microfone numa janela oculta própria (`escuta.html`, AudioWorklet, 100 ms em 16 kHz), aberta só no Automático.
    Processo principal: `src/main/transcricao/` (porta de voz, ElevenLabs, índice BM25 na memória, IA, analisador,
    serviço). Leitor de referências faladas portado do Python em `src/shared/biblia/falada.ts`.
- **2026-11-16 (tarde): transcrição LOCAL com o Whisper (whisper.cpp), agora o padrão.** Testado com Vitest (252; 10
  novos em `tests/whisper.test.ts` com um servidor de mentira), typecheck, build, **download de verdade pelo instalador
  do programa** (19 arquivos, 73,8 MB, SHA-256 conferido) e autoteste com o **Whisper de verdade** (passo
  `transcricao-local`): o microfone de mentira tocou uma pregação em voz sintética ("Irmãos, abram a Bíblia comigo em
  Filipenses, capítulo quatro, versículo seis…") e Filipenses 4:6 foi para a tela sozinho ~1 s depois do fim da frase;
  Habacuque 3:17 e 1 Coríntios 13:4 também. Corrigido no caminho: o ponto final que o Whisper põe ao cortar na pausa
  ("…em Filipenses." | "Capítulo 4, versículo 6.") escondia o livro do trecho seguinte. **Ainda não rodou no PC da
  igreja** (ver passo 13).

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
- **Arquivos do site: pelo catálogo `manifest.json`** (contrato em "Arquivos do site", abaixo), não pelo
  `status.json` antigo nem pelas páginas com senha. A liturgia aponta para a série porque a série é UMA mídia que
  troca de arquivo.
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
- Palco por padrão: sem vídeo (só nome e tempo), música sem fundo e com o próximo trecho (branco, como o
  atual), aviso de último slide. Configs antigas ganham esses padrões no Palco (`completarPadroesDoPalco`).
- Fundo atrás de texto: pouco escurecido (`fundoEscurecer`, 10%) + sombra forte no texto (pedido do
  usuário: "imagem mais clara, sombra atrás do texto").
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
- **Ferramentas: relógio na configuração, o resto no motor.** O relógio é opção fixa de cada saída
  (`relogio`, posição e tamanho em `EsquemaSaida`); temporizador, QR, mensagem e sorteio ligam/desligam na
  hora (`estado.ferramentas.exibicao`). Posição e tamanho no canto ficam na configuração da saída.
- Tempos guardados como instantes (`desde`, `alvoEm`, `inicioEm`): cada janela calcula o que mostrar
  com o relógio do PC; o motor não emite estado a cada segundo. Sorteio: o motor escolhe (`randomInt`),
  para todas as saídas mostrarem o mesmo nome.
- Camadas: ferramenta em tela cheia fica por cima do conteúdo e **embaixo** do Logo; no canto fica **por
  cima** do Logo (relógio e contagem continuam na tela de espera); o Preto cobre tudo. Limpar não tira
  ferramentas. Só uma ferramenta em tela cheia por saída (ordem: sorteio, mensagem, QR, temporizador,
  relógio).
- Ferramentas do motor não estão na lista do controle remoto (`TIPOS_DE_COMANDO`); entram quando o
  celular ganhar o temporizador.
- Volume único (`Motor.volume`, `definirVolume`, evento `volume`); o comando `volume` com número vale
  para tudo, o `mudo` continua por alvo.
- Luzes na liturgia: ao trocar de item, aplica o cenário de começo do novo; se ele não tem, o de fim do
  anterior (os dois seguidos fariam a luz piscar). "encerrar" aplica o fim do item no ar. Música
  "escolher na hora" só mexe nas luzes depois da escolha.
- **O cenário de fim roda uma vez, no que vier primeiro** (pedido do usuário, 2026-11-14): a mídia
  terminou sozinha (vídeo pela telemetria, áudio/música pelo `audio:terminou`) **ou** o operador saiu
  dela (Parar no player, outra coisa no lugar do vídeo, música fechada, apresentação fechada, próximo
  item, abertura, encerrar). O executor ouve o `estado` do motor e confere se a mídia do item ainda
  está no ar (`ItemNoAr.presenca`; só conta depois de ter sido vista no ar). Limpar e Preto não contam
  como saída.
- Teclas que precisam passar na frente da página (pergunta da versão, painel da letra) usam
  `addEventListener('keydown', …, true)` + `stopImmediatePropagation` (`useTeclasNaFrente`).
- **Arquivos do site (2026-11-15).** O site de envio e o editor continuam com senha, mas o programa não usa
  nada disso: lê o catálogo `manifest.json` por GET, sem credencial. O endereço tem uma **chave de leitura**:
  fica só no `config.json` local (Configurações → Site da igreja), **nunca no código, nos testes, no GitHub,
  neste arquivo nem no log** (`ocultarChave`). O controle remoto não recebe essa opção (`configPublica`). Link
  vazado: pedir outro à equipe do site e colar no programa.
  - Contrato (schema_version 1): `sabbath_date` (sábado de referência; vira domingo 0h), `refresh_after_seconds`,
    `items[]` com `id` estável (`automatico-avisos|provai|informativo|saude`, `fixo-*`, `enviado-<id>`),
    `category`, `filename` (só nome), `size_bytes`, `revision` (opaca, comparar por igualdade), `available`,
    `valid_for_sabbath`, `media_date`, `expires_at`, `download_url`; e `warnings[]`. Outra versão: para tudo e avisa.
  - Só vai para a biblioteca o que tem `available` + `valid_for_sabbath` + `download_url` do mesmo site. "Deste
    sábado" no programa = `media_date` do arquivo daqui igual ao próximo sábado (fixo vale sempre).
  - `warnings` não vazio (ou item ilegível) = nenhuma limpeza (falha de fonte não é ordem de apagar). Só sai o que o
    programa baixou (`gerenciada`); o resto é do operador.
  - A troca de arquivo de uma série nunca acontece com ela no ar (`emUsoNoMotor`: saídas, trilha de áudio, apresentação).
  - Mesmo conteúdo já na biblioteca (sha256): liga o item do site à mídia existente sem tomar conta dela.
- **Bíblia automática (2026-11-16)** — reescrita no Electron (não chama o servidor Python, como o PLANO previa).
  Substitui a decisão de 15/11 "sugere, nunca projeta sozinho": em 16/11 o usuário pediu a opção de pôr na tela.
  - **Transcrição LOCAL por padrão** (pedido do usuário em 16/11: "precisava que a transcrição de palavras fosse
    local"): **whisper.cpp na CPU**, modelo **base** com **2 núcleos** (`src/main/transcricao/whisper.ts`). O ElevenLabs
    (Scribe v2 Realtime, WebSocket com `xi-api-key` no cabeçalho, que o WebSocket do Node no Electron 45 aceita) ficou
    como opção ("Onde a fala vira texto"). A IA que escolhe os versículos continua pela internet.
  - Whisper: o programa baixa pelas Configurações o executável oficial (`whisper-bin-x64.zip` do release de build
    `b5454` = v1.9.5; extrai só o `whisper-server.exe` e as DLLs) e o modelo, para `C:\Sonoplastia\whisper`
    (`bin\`, `modelos\`), **conferindo o SHA-256 fixado no código** (arquivo diferente é apagado). O `whisper-server`
    abre ao ligar o Automático (modelo carregado em ~0,3 s), com prioridade baixa e só em 127.0.0.1, e fecha no
    Manual. Cada frase (cortada nas pausas de 0,5 s; no máximo 17 s; fala mínima 0,6 s) vai por HTTP; `-ac 900`
    (janela de 18 s em vez de 30) deixa ~40% mais rápido. Prompt com os nomes dos livros. Fila > 30 s = frases mais
    velhas descartadas com aviso. Frases que o Whisper inventa no silêncio ("Legendas pela comunidade Amara.org",
    "Obrigado.") e palavras repetidas sem parar são limpas (`limparTextoWhisper`).
  - **Medido em 16/11** (frases de 6–18 s de voz sintética em português; Ryzen 5 7600 com 2 threads ≈ 2,5× o i3):
    base ~0,9 s por frase (~2,3 s no i3: dá conta); small ~3,1 s (~7,5 s no i3: no limite, ocuparia a CPU). O base
    erra grafias ("voças peticões"), mas acerta as referências ("Habacuque 3, 17", "Filipenses, capítulo 4,
    versículo 6"); o small acerta a leitura literal. Transcrição do áudio inteiro de uma vez (whisper-cli) pulou uma
    frase no small: por isso frase por frase.
  - O Whisper **não manda texto parcial**: o texto aparece ~1 s (aqui) a ~2,5 s (i3) depois do fim de cada frase
    (enquanto isso a fala ao vivo mostra "…"). Isso pesa no 2º passo ("seguir a leitura").
  - Rodar o executável baixado no PC de desenvolvimento precisou de autorização do usuário (o classificador de
    segurança bloqueou a primeira vez); no programa, quem baixa é o operador, pelo botão.
  - **Sem a busca por tema com vetores** (bge-m3 = ~2,3 GB de RAM e torch). Candidatos pela busca por palavras (BM25 na
    memória, todas as versões juntas, ~0,6 s para montar, só no Automático) + pares de palavras seguidas (leitura
    literal). O tema fica com a IA, que pode sugerir fora dos candidatos se tiver certeza da referência.
  - IA pelo **SDK oficial da Anthropic** (`@anthropic-ai/sdk` 1.8.0; o `abrir.cmd` instala se faltar) ou `fetch` para APIs compatíveis com OpenAI, ambos
    pelo `net.fetch` do Electron. Pedido com `thinking: disabled` + `effort: low` + JSON com esquema (economia do
    projeto Python); se o modelo recusar um ajuste (400), ele sai e o programa lembra. **O SDK 1.x manda a chave como
    `Authorization: Bearer`** (API 2026-10-21); com URL própria (servidor intermediário, como o New API do
    usuário) a mesma chave vai também em `X-Api-Key`, que é o que esses servidores costumam ler.
  - O texto da tela sempre vem da Bíblia do programa; a IA só devolve referências (conferidas: livro, capítulo,
    versículo existem; rigor filtrado no código).
  - **Economia:** porta de voz por energia (piso = 10% mais baixos dos últimos 10 s; voz = 3 de 5 quadros acima do piso
    + margem): sem voz por `silencioS`, a conexão do ElevenLabs fecha (com "commit" para não perder a última frase) e
    a IA não é chamada (só chama com ≥ `minPalavras` novas). 1,5 s de áudio de antes da voz vai junto ao abrir. Com
    música/áudio/vídeo **tocando de verdade** (telemetria, não só "no ar") a escuta pausa. Começa sempre no Manual.
  - **Citação direta na tela sozinha** vai para o "Enviar para" do alto da tela (o App avisa o processo principal) e
    só troca versículo, texto, imagem ou tela vazia, com a tela normal (nunca vídeo, música, slide, teste, Logo, Preto
    ou Limpar). Referência dita com versículo vai na hora; "leitura" exige a IA dizer citação (força ≥ 95) **e** as
    palavras confirmarem (≥ 40% dos pares e ≥ 3 pares do versículo na fala); vai o versículo lido por último. Só a
    primeira referência de uma frase vai; as outras ficam como sugestão. Alusão/tema nunca vão sozinhos.
  - Chaves só no `config.json` local (seção `transcricao`, fora da `biblia`, porque `configPublica` manda a `biblia` ao
    celular). Não vão para o log nem para o controle remoto. "Copiar do projeto de transcrição" lê `data\config.json`
    e `.env` do projeto Python (pergunta a pasta se não achar) e só mostra o nome do que copiou.
  - Celular: seção "Sugestões ao vivo" na aba Bíblia (Automático liga/desliga, tocar mostra). Recebe o estado sem a
    fala em andamento e só quando muda (`paraCelular`); a fala vai à parte, no máximo 2 vezes por segundo.
  - A página Bíblia acompanha o que foi sozinho para a tela (`EstadoTranscricao.mostrado.seq`) para o passador continuar.

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
modelo, seção com fundo, texto → versículo com o passador, PNGs `L*`); ferramentas (canto e tela
cheia, sorteio, painel da letra, pergunta da versão, painel das luzes só lendo, PNGs `F*`); coluna
recolhida; emergência. O passo da Bíblia também captura a tabela (`3b-biblia-tabela`). Bíblia automática (passo
`transcricao`, PNGs `T*`): microfone de mentira do Chromium tocando um .wav gerado na hora (ou
`SONOPLASTIA_AUTOTESTE_AUDIO`), ElevenLabs e IA de mentira (nada sai do PC), e "Testar a IA" nos dois formatos contra
um servidor local. Passo `transcricao-local` (PNGs `T4`, `T5`): o Whisper de verdade, se estiver em
`<SONOPLASTIA_DADOS>\whisper` (baixar uma vez pelo botão das Configurações e copiar a pasta), ouvindo o
`SONOPLASTIA_AUTOTESTE_AUDIO` (uma pregação gravada; sem ele, só um tom). `SONOPLASTIA_AUTOTESTE_BIBLIA` aponta outro ARA.json (neste PC de desenvolvimento:
`Z:\Arquivos\Projetos\Hermes\Transcrição_igreja\data\biblia\ARA.json`).
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
  - `sonoplastia_sync.py`: download dos vídeos do sábado a partir do `status.json` do site (o `status.json` passou a
    dar 401; este programa usa o `manifest.json`, ver Decisões).
  - `prompt-site-sonoplastia.md`: o pedido original do `manifest.json` (o contrato que valeu é o de Decisões).
  - `holyrics-config.json` tem token do Holyrics: não copiar para este projeto.
- `..\Transcrição_tempo_real\` — sugestões de versículos ao vivo (Python, FastAPI, SSE em `/eventos`). No PC de
  desenvolvimento está em `Z:\Arquivos\Projetos\Hermes\Transcrição_igreja`. **Já integrado** (2026-11-16) como a
  Bíblia automática, reescrito em TypeScript (ver Decisões): o programa não precisa mais dele. O `data/config.json` de
  lá tem chaves de verdade: não copiar para este projeto (o botão "Copiar do projeto de transcrição" põe as chaves no `config.json` local).

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
6. ~~Commit e envio ao GitHub da Fase 4~~ feito (commit `59391f8`, junto com a Fase 5 e o remoto).
6a. **Abrir o controle remoto num celular de verdade** (mesmo Wi-Fi/roteador do PC): endereço e PIN na
   barra de baixo da tela de comando. Se não abrir, ver se o Wi-Fi é da mesma rede do cabo do PC
   (rede de visitantes costuma isolar os aparelhos). Commit do remoto junto ou separado da Fase 4
   (o usuário decide). Apagar a pasta de teste `C:\Sonoplastia-teste-remoto` se ainda existir.
7. ~~**Fase 5** (liturgia)~~ código pronto em 2026-11-14, com seções. **Conferir na tela** (fora do
   culto, programa reaberto pelo `abrir.cmd`): Liturgia → "Novo culto" do modelo; pôr imagem de fundo
   em cada seção; adicionar música, vídeo, versículo e texto; "Abertura" da seção; "Próximo item" (N)
   e o passador dentro do versículo; um vídeo com "passar sozinho". (O autoteste já passou, ver Status.)
8. ~~**Fase 6**~~ código pronto em 2026-11-14 (ver Status). **Conferir na tela** (programa reaberto
   pelo `abrir.cmd`): relógio no canto do Palco; página Ferramentas (temporizador no Palco, mensagem,
   QR, sorteio); Bíblia → Tabela; música só com a letra (painel grande); item de música "Escolher na
   hora"; volume (vídeo → áudio não volta ao máximo); botão **Luzes** (testar um cenário **com o
   usuário olhando**, fora do culto). (Commit da Fase 6 feito: `70d04b8`.)
8a. **Conferir nos projetores** os pedidos de 14/11 à tarde: próximo trecho e linha brancos no Palco;
   imagem mais clara com sombra no texto no Público (se precisar, ajustar "Escurecer a imagem…" em Telas);
   "ÚLTIMO SLIDE" no Palco no fim de uma apresentação. O relógio no canto do Palco (sup-dir) cobre o canto
   do próximo slide/da caixa vermelha: se incomodar, mudar a posição dele em Ferramentas.
9. ~~**Fase 7 — arquivos do site**~~ código pronto em 2026-11-15 (ver Status). **Falta no PC da igreja:**
   abrir pelo `abrir.cmd`, colar o endereço do manifesto em Configurações → Site da igreja (o usuário tem o link no
   documento "Integração de mídias" da equipe do site) e olhar Mídias → Do site. Numa sexta, conferir que os vídeos
   da semana chegam, que o item "Provai e Vede" da liturgia passa a tocar o novo e que o Vida e Saúde antigo não é
   baixado (818 MB, `valid_for_sabbath: false`). (Commit e envio ao GitHub da Fase 7 feitos em 2026-11-15.)
9a. (A versão de 15/11 das sugestões foi substituída pela Bíblia automática: ver o passo 11.)
9b. **YouTube**: o usuário lê o `ESTUDO-YOUTUBE.md` e escolhe (A tocar direto, B baixar antes, ou só o site). Recomendado: A.
10. (Depois) Modo PowerPoint com animações, se fizer falta.
11. **Conferir a Bíblia automática no PC da igreja** (fora do culto): Configurações → Bíblia automática →
    "Copiar do projeto de transcrição" (ou o usuário cola as chaves; o Claude não copia chaves), "Testar a IA" e "Testar
    o ElevenLabs"; ligar a saída da mesa de som na entrada de linha (hoje nada está ligado no PC) e escolher a entrada
    em "Microfone". Conferir no New API se o pedido com `Authorization: Bearer` + `X-Api-Key` passa e se o preço do
    `claude-haiku-5-5` está configurado lá (antes ele cobrava ~US$ 10 a cada 2–3 min por falta de preço). Ver no celular
    (aba Bíblia → Sugestões ao vivo). Página Bíblia → Automático:
    falar "João 3:16" e ler um texto; ver o medidor, o "em espera" no silêncio e a pausa com música. Medir CPU/memória.
    Conferir o custo depois de um culto (contador da página e o painel do New API).
12. **2º passo: seguir a leitura e passar sozinho para o próximo versículo** (avaliado em 2026-11-16, não feito):
    **dá**, porque não precisa de IA: é comparação de palavras no próprio PC, sobre o texto **parcial** que o
    ElevenLabs já manda enquanto a pessoa fala (~0,5–1 s de atraso). Com um versículo no ar: avançar quando boa parte
    dele já foi lida (pares de palavras, `cobertura` em `src/shared/transcricao/texto.ts`) **e** as 3–4 últimas
    palavras ditas batem com o começo do próximo (ou da próxima parte, nos versículos divididos). Na prática a tela
    troca 1–3 palavras depois que o leitor entra no versículo seguinte (dá para antecipar nas últimas palavras do
    atual). Cuidados: leitor numa versão diferente da tela (detectar a versão pela fala), comentários no meio,
    versículos pulados, começos comuns ("E", "Porque": exigir palavras distintas), erros da transcrição. Custo extra:
    zero. Fazer como opção ("Seguir a leitura", desligada por padrão) e calibrar com uma gravação real de culto
    (rodar uma gravação pelo microfone de mentira do autoteste com o ElevenLabs de verdade custa centavos).
    **O usuário se preocupa com três riscos (2026-11-16); o desenho precisa resolver cada um:**
    - *Leitor numa versão diferente da tela:* comparar a fala com o versículo em **todas** as versões importadas e
      seguir pela que mais bate (a tela continua na versão da página). Versão não importada (ACF, NTLH…): as
      palavras não batem e o programa **não passa sozinho** (mostrar "não reconheci a versão lida").
    - *Comentário no meio da leitura:* só passa com prova positiva de que o próximo versículo começou a ser lido
      (várias palavras dele, em ordem); pausa, tempo ou comentário nunca passam. Depois de um comentário, a
      leitura recomeça e o acompanhamento continua de onde estava.
    - *Começos comuns ("E", "Porque", "E disse"):* exigir pelo menos 3 palavras **de conteúdo** do começo do próximo
      versículo, em ordem (as de ligação não contam), e boa parte do versículo atual já lida.
    Regra geral: na dúvida, não passa (o operador passa com o Próximo/PageDown, e PageUp desfaz). Mostrar na tela de
    comando o que o programa está seguindo e por quê.
13. **Transcrição local (Whisper): conferir no PC da igreja** (feito em 2026-11-16, ver Decisões). Configurações →
    Bíblia automática → "Baixar" (~70 MB, uma vez) → "Testar a velocidade" (bom: até ~4 s por frase; se passar, deixar
    no base e/ou subir para 3 núcleos e testar de novo). Depois, Bíblia → Automático com a mesa ligada e alguém
    falando; olhar o Gerenciador de Tarefas durante um vídeo (o `whisper-server` fica com prioridade baixa). Se o base
    errar demais na leitura e o i3 aguentar, testar o small. Para o 2º passo (passo 12), o Whisper não manda texto
    parcial: seguir a leitura com ele teria ~2,5 s de atraso no i3 (pensar em frases mais curtas ou no
    `whisper-stream`, ou usar o ElevenLabs só para isso).

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
- Liturgia (falta do `PLANO.md` §5.5): itens ligados às séries do site (Fase 7); importar a liturgia do
  Louvor JA (`liturgia.ja`); transição por item.
- Ferramentas (falta do `PLANO.md` §5.6): som no sorteio; relógio 12 h; vários temporizadores ao mesmo
  tempo (hoje é um só, com atalhos); importar lista do sorteio de CSV (hoje é colar); temporizador e
  mensagem no controle remoto do celular; opção de ferramentas por cima do Preto.
- Luzes: o sistema só "alterna" um relé (sem ligar/desligar direto); se alguém mexer no interruptor ao
  mesmo tempo, o clique do painel pode inverter. Os cenários são criados na página das luzes.
- Painel da letra: reabrir a mesma música só com a letra não abre o painel de novo se ele foi
  minimizado (fica o botão "Letra no ar").
  O controle remoto do celular ainda não mostra nem passa a liturgia. Sem desfazer: excluir item ou seção
  é na hora (a seção com itens pede confirmação).
- Whisper local: sem texto parcial; só Windows x64 com CPU (sem GPU); o instalador (Fase 8) ainda não traz o Whisper
  junto (baixa pelo botão). O executável e os modelos ficam fora do git.
- Bíblia automática: sem busca por tema com vetores (a IA cuida do tema); `keyterms` do ElevenLabs (nomes dos livros)
  não usados, como no Python; porta de voz por energia (sem modelo de voz: canto e barulho alto também abrem a
  transcrição, mas a IA só é chamada com palavras novas); a liturgia não liga o Automático sozinha; as sugestões
  somem ao fechar o programa; o nível do microfone só aparece no computador; não detecta a
  versão que o pregador lê (a tela usa a da página Bíblia). Sem "seguir a leitura" (próximo passo 12).
- Site: apresentações (.pdf/.pptx) que vêm de envios não saem sozinhas quando o prazo acaba (Apresentações não tem
  lixeira; excluir lá é para sempre). Sem limite de banda nos downloads. Um item de mídia da liturgia guarda o tipo
  (`midiaTipo`) de quando foi posto: se a série trocar de vídeo para imagem, o rótulo do item fica desatualizado.

## Perguntas em aberto

Lista completa no `PLANO.md` §10. As principais: onde está o "JSON do Louvor JA" que o usuário citou;
qual projetor é o Público e qual é o Palco (monitor 1 ou 3); nome do programa.

## Como trabalhar neste projeto

- Responder em português (pt-BR).
- Testar no PC da igreja fora do horário de culto e com o Holyrics fechado.
- Ao terminar uma sessão, atualizar "Status", "Decisões", "Próximos passos" e "Perguntas em aberto"
  aqui, e o `PLANO.md` se o desenho mudar.
