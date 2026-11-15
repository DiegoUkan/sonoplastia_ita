# Estudo: vídeos do YouTube no Sonoplastia

> Feito em 2026-11-15, a pedido do usuário ("faça um estudo antes, para verificarmos as possibilidades e
> os problemas"). **Nada disto foi implementado ainda**: falta o usuário escolher o caminho.

## Resumo

Há dois jeitos de verdade de tocar um vídeo do YouTube no programa, e eles têm problemas diferentes:

| | A. Tocar direto (player do YouTube na saída) | B. Baixar antes e tocar como mídia comum |
|---|---|---|
| Internet durante o culto | **Precisa** (1080p ≈ 5 Mbit/s; 720p ≈ 2,5) | Não precisa |
| Anúncio no meio do culto | **Pode aparecer** (se o canal ganha com anúncios) | Nunca |
| Regras do YouTube | Permitido (é o player oficial) | **Proibido** pelos Termos (só pode baixar onde o YouTube mostra "baixar") |
| Funciona sempre? | Alguns vídeos não deixam ser incorporados (erro 101/150) | O baixador quebra quando o YouTube muda (precisa atualizar) |
| Peso no PC da igreja | Maior: o YouTube manda VP9/AV1, que a GT 730 não decodifica | Igual aos vídeos de hoje (H.264 na placa) |
| Saída de som (mesa) | Difícil (o vídeo fica dentro da página do YouTube) | Igual a hoje |
| Palco, player, liturgia, "passar sozinho" | Dá para fazer (pelo controle do player) | Já funciona hoje |
| Transmissão ao vivo (live) | Funciona | Não serve |

**Recomendação:** fazer o **A (tocar direto)**, com as proteções da seção "Como faríamos o A", e
para os vídeos fixos da igreja continuar pelo caminho que já existe (o site da igreja manda o arquivo
para a biblioteca, Fase 7). O **B** só se a igreja aceitar o risco das regras do YouTube; nesse caso,
dá para fazer como um botão "Baixar para a biblioteca" com o aviso.

## A. Tocar direto: o player oficial dentro da saída

Como funciona: a saída Público ganha um tipo de conteúdo novo, "YouTube", que mostra o player oficial
(`youtube-nocookie.com/embed/<id>`) em tela cheia, sem os controles do YouTube. O programa comanda o
player por mensagens (`postMessage`, a mesma API do "IFrame Player"): tocar, pausar, ir para um tempo,
volume, mudo, e recebe o tempo e o fim do vídeo.

O que dá certo:

- Colar o link (ou o código do vídeo) numa página/aba nova, ver a miniatura e o título, mandar para o
  Público pelo "Enviar para" de sempre.
- Player embaixo das miniaturas: tocar/pausar, ±10 s, buscar, volume e mudo (pela API do player).
- Palco sem decodificar de novo (regra do projeto): mostra o título e o tempo que falta, como já faz
  com os vídeos.
- Liturgia: item "YouTube", com "passar sozinho no fim" (o player avisa quando termina).
- Miniatura ao vivo: a captura da janela da saída pega o vídeo do YouTube também.
- Quando o vídeo termina, o programa troca na hora para o Logo (ou preto), antes de o YouTube mostrar a
  tela de "outros vídeos" do fim.
- Lives (uma transmissão de outra igreja ou de um evento) funcionam do mesmo jeito.

Problemas e o que fazer com cada um:

1. **Anúncios.** O YouTube põe nos vídeos incorporados os mesmos anúncios do youtube.com, e o dono do
   vídeo decide; não há como desligar só no player incorporado
   ([ajuda do YouTube](https://support.google.com/youtube/answer/132596)). Vídeo de canal de igreja
   costuma vir sem anúncio, mas não dá para garantir. Bloquear anúncio vai contra os Termos e quebra a
   toda hora: não recomendo. O que dá para fazer: botão **"Preparar"** que carrega e deixa o vídeo
   pronto antes (o anúncio do começo, se houver, aparece na prévia da tela de comando, não no
   telão); e entrar com uma conta YouTube Premium dentro do programa *talvez* tire os anúncios (o
   YouTube não confirma que vale para vídeo incorporado; teria de testar).
2. **Erro 153 ("erro de configuração do player").** Desde julho de 2025 o YouTube exige que o player
   diga de que site ele está sendo aberto (cabeçalho Referer)
   ([histórico da API](https://developers.google.com/youtube/iframe_api_revision_history),
   [explicação](https://til.simonwillison.net/youtube/fixing-153-embed)). As telas do programa abrem
   como arquivo do disco (`file://`), que não manda esse cabeçalho, então o player daria erro 153.
   Soluções: abrir o player por uma página servida pelo próprio programa em `http://localhost` (o
   servidor do controle remoto já existe), ou acrescentar o cabeçalho pelo Electron
   (`session.webRequest`). Precisa testar qual funciona.
3. **Vídeo que não deixa incorporar** (erros 101/150). O dono desligou. O programa avisa e não há o que
   fazer (só o caminho B).
4. **Peso no PC da igreja.** A GT 730 só decodifica H.264; o YouTube prefere mandar VP9 ou AV1, que
   ficariam no processador (i3-7100). 1080p em AV1 pode perder quadros. Saída: forçar o H.264 dentro do
   player (o mesmo truque da extensão "h264ify": dizer ao YouTube que VP9/AV1 não são aceitos) e limitar
   a 1080p. Precisa medir no projetor, com a coluna "Quadros perdidos" da aba Teste.
5. **Som na mesa.** O "Saída de som" das Configurações usa `setSinkId` no vídeo; o vídeo do YouTube
   fica numa página de outro site, que o programa não controla direto. Dá para fazer pelo Electron
   (rodar um comando dentro do quadro do YouTube), mas é a parte mais incerta: precisa testar. Se não
   der, o som do YouTube sai no dispositivo padrão do Windows.
6. **Internet.** Sem internet ou com Wi-Fi ruim, o vídeo trava no meio. O "Preparar" ajuda (já começa
   carregado), mas não resolve uma queda. Se a igreja transmite o culto ao vivo, é bom ver se a internet
   aguenta as duas coisas.
7. **Marca e telas do YouTube.** O logotipo do YouTube pode aparecer no começo e na pausa (a opção que
   tirava isso foi removida pelo YouTube em 2023). Os controles e as legendas automáticas ficam
   escondidos. As regras exigem player de pelo menos 200×200 e não cobrir o player nem os anúncios
   ([regras mínimas](https://developers.google.com/youtube/terms/required-minimum-functionality)): o
   programa troca de conteúdo, nunca põe o Logo *por cima* do vídeo tocando.
8. **Segurança.** O player é de outro site dentro da saída: ele não enxerga o programa (fica isolado
   pelo Chromium, sem acesso ao `window.api`), e clicar no logotipo não abre nada (o programa já
   bloqueia janelas novas). A página da saída precisa liberar só `youtube-nocookie.com` (e
   `youtube.com`) na política de segurança; o script do YouTube não entra na página do programa.

Direitos: mostrar um vídeo publicamente no culto depende da licença do vídeo, esteja ele no YouTube ou
não; a licença CCLI não cobre vídeos do YouTube. O fabricante do ProPresenter lembra disso e recomenda
ter uma cópia local para tocar ([Renewed Vision](https://support.renewedvision.com/hc/en-us/articles/360011789813-YouTube-and-ProPresenter)).

## B. Baixar antes (yt-dlp) e tocar como mídia comum

Como funcionaria: colar o link → o programa baixa com o `yt-dlp` em MP4 H.264 + AAC até 1080p → o
arquivo entra na biblioteca de Mídias e toca como qualquer vídeo (sem anúncio, sem internet, com tudo o
que já existe: Palco, player, liturgia, mesa de som).

Problemas:

1. **Termos do YouTube**: só pode baixar onde o YouTube mostra um botão "baixar". Não é crime, mas é
   quebra de contrato com o YouTube; a decisão é da igreja.
2. **Programas a mais**: o `yt-dlp.exe` (~18 MB) e, desde novembro de 2025, um interpretador de
   JavaScript (o Deno, ~100 MB), sem o qual o download do YouTube "provavelmente não funciona"
   ([anúncio do yt-dlp](https://github.com/yt-dlp/yt-dlp/issues/15012)). E um ffmpeg novo: o do Holyrics
   é de 2014 e pode não juntar o vídeo e o áudio que o YouTube manda separados.
3. **Quebra com frequência**: o YouTube muda e o `yt-dlp` precisa de atualização (o programa teria de
   atualizar sozinho). Às vezes o YouTube pede "confirme que você não é um robô" e bloqueia o download.
4. **Tempo**: um vídeo de 5 min em 1080p tem 100–200 MB; precisa baixar antes do culto.

## C. O que já existe e resolve parte

Os vídeos fixos da igreja (Informativo das Missões, Provai e Vede…) já chegam pelo site da igreja
(Fase 7, `manifest.json`), como arquivo, sem YouTube. Para vídeo que a equipe do site consegue
baixar de forma legítima (o próprio canal da igreja, materiais com botão de download), esse continua
sendo o melhor caminho.

## Se for o A: plano de implementação

1. Tipo de conteúdo `youtube` no motor (`{ videoId, titulo, inicio? }`), com o mesmo controle de mídia
   dos vídeos (tocar, pausar, buscar, volume, mudo) e telemetria (tempo, duração, fim).
2. Na saída (`Camadas.tsx`): o player em `youtube-nocookie.com/embed/<id>?enablejsapi=1&controls=0&rel=0&iv_load_policy=3&playsinline=1&disablekb=1&fs=0`,
   comandado por `postMessage`, servido de forma que mande o Referer (ver o problema 2). Palco: título +
   tempo que falta.
3. Página Mídias → aba **YouTube**: colar o link, prévia (miniatura e título pela página oEmbed do
   YouTube, sem chave), "Preparar" e "Mostrar". Links usados ficam numa lista.
4. Item de liturgia "YouTube", com "passar sozinho no fim".
5. No fim do vídeo: Logo (ou preto), antes da tela de "outros vídeos".
6. Forçar H.264 dentro do player e testar o som na mesa (problemas 4 e 5).
7. **Teste no PC da igreja, fora do culto, com o projetor:** um vídeo de canal de igreja (sem anúncio)
   e um de canal grande (com anúncio), quadros perdidos, CPU, som na mesa, erro 153, internet lenta.

Estimativa: um dia de trabalho para o A, mais o teste no projetor. O B seria mais meio dia, mais os
downloads dos programas (com a autorização do usuário).

## Perguntas para o usuário

- Qual caminho: A (tocar direto), B (baixar antes), os dois, ou só o que já existe pelo site?
- Que tipo de vídeo do YouTube costuma passar (canal da igreja, clipes de música, lives)? Isso diz
  quanto o problema dos anúncios pesa.
- A igreja tem (ou teria) uma conta YouTube Premium para testar se tira os anúncios?
- A internet da igreja aguenta vídeo em 1080p junto com a transmissão do culto (se houver)?
