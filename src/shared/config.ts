/**
 * Esquema único das configurações.
 *
 * Cada opção tem tipo, valor padrão e textos (`title`, `description`) para a tela de configurações,
 * que é gerada a partir deste esquema (`z.toJSONSchema`). Opção sem `title` não aparece na tela.
 * Chaves extras usadas pela tela:
 *   'x-ui'     'cor' | 'deslizante' | 'arquivo-imagem' | 'dispositivo-audio' | 'dispositivo-entrada' | 'versao-biblia' | 'pasta'
 *              | 'segredo' | 'modelo-ia'
 *   'x-passo'  passo do controle deslizante
 *   'x-dica'   texto de exemplo dentro do campo vazio
 *   'x-opcoes' rótulos das opções de um enum
 * Para criar uma opção nova, basta acrescentá-la aqui com `.default()` e `.meta()`.
 */
import { z } from 'zod'
import { POSICOES, ROTULOS_POSICAO } from './ferramentas'

export const AJUSTES = ['ajustar', 'preencher', 'esticar'] as const
export type Ajuste = (typeof AJUSTES)[number]

export const EsquemaMonitorRef = z.object({
  id: z.number(),
  rotulo: z.string(),
  /** limites do monitor em pixels lógicos (DIP), como o Electron informa */
  largura: z.number(),
  altura: z.number(),
  x: z.number(),
  y: z.number(),
})
export type MonitorRef = z.infer<typeof EsquemaMonitorRef>

export const MODOS_RELOGIO = ['nao', 'canto', 'tela'] as const
export { POSICOES, ROTULOS_POSICAO }

export const EsquemaSaida = z.object({
  id: z.string().min(1),
  nome: z.string().min(1).meta({ title: 'Nome', description: 'Como a saída aparece na tela de comando.' }),
  ativa: z.boolean().default(true).meta({ title: 'Saída ligada', description: 'Desligada, a saída não abre.' }),
  monitor: EsquemaMonitorRef.nullable().default(null),
  modoJanela: z.boolean().default(false).meta({
    title: 'Abrir como janela de teste',
    description: 'Abre como janela comum no monitor de comando, mesmo com um monitor escolhido. Para testar sem mexer no projetor.',
  }),
  sempreNoTopo: z.boolean().default(true).meta({
    title: 'Sempre por cima',
    description: 'Nenhuma outra janela aparece por cima da saída no projetor.',
  }),
  esconderCursor: z.boolean().default(true).meta({ title: 'Esconder o cursor do mouse na saída' }),
  margemPct: z.number().min(0).max(20).default(0).meta({
    title: 'Margem de segurança (%)',
    description: 'Afasta o conteúdo das bordas, para projetores que cortam a imagem.',
    'x-ui': 'deslizante',
    'x-passo': 0.5,
  }),
  ajuste: z.enum(AJUSTES).default('ajustar').meta({
    title: 'Ajuste de imagem e vídeo',
    'x-opcoes': {
      ajustar: 'Ajustar (mostra tudo, pode sobrar borda)',
      preencher: 'Preencher (corta o que sobra)',
      esticar: 'Esticar (deforma)',
    },
  }),
  corFundo: z.string().default('#000000').meta({ title: 'Cor de fundo', 'x-ui': 'cor' }),
  mostrarVideo: z.boolean().default(true).meta({
    title: 'Mostrar vídeos nesta saída',
    description:
      'Ligado, o vídeo toca aqui também (sem som: o som sai de uma saída só). Desligado, mostra só o nome do vídeo e o tempo que falta: use se o computador não der conta de dois vídeos.',
  }),
  videoMostrarTempo: z.boolean().default(false).meta({
    title: 'Vídeos: mostrar o tempo que falta por cima',
    description: 'Um selo pequeno no canto do vídeo (ex.: ▶ −3:25). Bom para o Palco.',
  }),
  musicaComFundo: z.boolean().default(true).meta({ title: 'Músicas: mostrar a imagem de fundo' }),
  textoComFundo: z.boolean().default(true).meta({
    title: 'Bíblia e textos: mostrar o fundo padrão',
    description: 'A imagem escolhida em Configurações → Fundos, atrás dos versículos e textos.',
  }),
  musicaMostrarProximo: z.boolean().default(false).meta({
    title: 'Músicas: mostrar o próximo trecho',
    description: 'Em letra menor, embaixo. Ajuda quem está cantando no palco.',
  }),
  textoMaiusculas: z.boolean().default(false).meta({ title: 'Letras e versículos em maiúsculas' }),
  textoTamanhoMax: z.number().min(4).max(20).default(11).meta({
    title: 'Tamanho máximo do texto (% da altura)',
    description: 'O texto diminui sozinho quando não cabe.',
    'x-ui': 'deslizante',
    'x-passo': 0.5,
  }),
  referenciaTamanho: z.number().min(3).max(14).default(7).meta({
    title: 'Tamanho da referência bíblica (% da altura)',
    description: 'A referência embaixo do versículo (ex.: Lucas 18:10). Antes era 4,4.',
    'x-ui': 'deslizante',
    'x-passo': 0.5,
  }),
  textoSombra: z.boolean().default(true).meta({
    title: 'Sombra atrás do texto',
    description: 'Uma sombra escura em volta das letras, para ler bem sobre imagens claras.',
  }),
  fundoEscurecer: z.number().min(0).max(80).default(10).meta({
    title: 'Escurecer a imagem atrás de letras e versículos (%)',
    description: '0 mostra a imagem como ela é. Mais alto deixa a imagem mais escura e o texto mais fácil de ler.',
    'x-ui': 'deslizante',
    'x-passo': 5,
  }),
  slideMostrarProximo: z.boolean().default(false).meta({
    title: 'Apresentações: mostrar o próximo slide',
    description: 'O slide atual fica menor, com o próximo e o número do slide ao lado. Bom para o Palco.',
  }),
  slideAvisarFim: z.boolean().default(false).meta({
    title: 'Apresentações: avisar no último slide',
    description: 'Mostra "Último slide" em vermelho quando não há mais slides. Bom para o Palco (o público não precisa ver).',
  }),
  slideMostrarNotas: z.boolean().default(false).meta({
    title: 'Apresentações: mostrar as anotações do orador',
    description: 'O texto das anotações do PowerPoint, embaixo do slide.',
  }),
  relogio: z.enum(MODOS_RELOGIO).default('nao').meta({
    title: 'Relógio',
    description:
      'A hora certa, por cima do que estiver na tela. Em tela cheia, só enquanto não há nada no ar: com conteúdo, ele vai para o canto. Posição e tamanho na página Ferramentas.',
    'x-opcoes': { nao: 'Não mostrar', canto: 'No canto', tela: 'Tela cheia (com conteúdo no ar, vai para o canto)' },
  }),
  // posição e tamanho (% da altura) das ferramentas no canto: escolhidos na página Ferramentas
  relogioPosicao: z.enum(POSICOES).default('sup-dir'),
  relogioTamanho: z.number().min(3).max(30).default(7),
  temporizadorPosicao: z.enum(POSICOES).default('sup-esq'),
  temporizadorTamanho: z.number().min(3).max(40).default(10),
  qrPosicao: z.enum(POSICOES).default('inf-dir'),
  qrTamanho: z.number().min(10).max(60).default(26),
})
export type ConfigSaida = z.infer<typeof EsquemaSaida>

/**
 * O Palco vem diferente do Público: sem fundo nas músicas, com o próximo trecho, o próximo slide, o aviso
 * de último slide, o relógio no canto e o tempo que falta por cima do vídeo. O vídeo toca nos dois
 * (pedido de 21/11; antes o Palco só mostrava o nome e o tempo).
 */
export const PADROES_PALCO = {
  mostrarVideo: true,
  videoMostrarTempo: true,
  musicaComFundo: false,
  textoComFundo: false,
  musicaMostrarProximo: true,
  slideMostrarProximo: true,
  slideAvisarFim: true,
  relogio: 'canto',
} as const

export const EsquemaTelaEspera = z.object({
  texto: z.string().default('IASD Itaqui').meta({ title: 'Texto principal' }),
  subtitulo: z.string().default('Igreja Adventista do Sétimo Dia').meta({ title: 'Subtítulo' }),
  imagem: z.string().nullable().default(null).meta({
    title: 'Imagem (logo)',
    description: 'Se escolhida, aparece no lugar dos textos.',
    'x-ui': 'arquivo-imagem',
  }),
  corFundo: z.string().default('#0b0d12').meta({ title: 'Cor de fundo', 'x-ui': 'cor' }),
  corTexto: z.string().default('#ffffff').meta({ title: 'Cor do texto', 'x-ui': 'cor' }),
})
export type ConfigTelaEspera = z.infer<typeof EsquemaTelaEspera>

export const EsquemaFundos = z.object({
  padrao: z.string().nullable().default(null).meta({
    title: 'Imagem de fundo padrão',
    description: 'Fica atrás dos versículos, dos textos e das músicas que não têm imagem própria. Sem imagem, fica a cor de fundo de cada saída.',
    'x-ui': 'arquivo-imagem',
  }),
  musicaImagemPropria: z.boolean().default(true).meta({
    title: 'Músicas: usar a imagem da própria música',
    description: 'A imagem que vem do Louvor JA. Desligado, as músicas também ficam com o fundo padrão.',
  }),
})
export type ConfigFundos = z.infer<typeof EsquemaFundos>

export const TEMAS = ['claro', 'escuro'] as const

export const EsquemaGeral = z.object({
  tema: z.enum(TEMAS).default('claro').meta({
    title: 'Tema da tela de comando',
    'x-opcoes': { claro: 'Claro (suave)', escuro: 'Escuro' },
  }),
  abrirSaidasAoIniciar: z.boolean().default(true).meta({ title: 'Abrir as saídas ao iniciar o programa' }),
  confirmarAoFechar: z.boolean().default(true).meta({
    title: 'Pedir confirmação ao fechar',
    description: 'Evita fechar o programa sem querer durante o culto.',
  }),
  transicaoMs: z.number().int().min(0).max(3000).default(300).meta({
    title: 'Duração da transição (ms)',
    description: 'Tempo do esmaecimento ao trocar de conteúdo. 0 = corte seco.',
    'x-ui': 'deslizante',
    'x-passo': 50,
  }),
  miniaturasAoVivo: z.boolean().default(true).meta({
    title: 'Miniaturas ao vivo',
    description: 'Mostra nas miniaturas exatamente o que está em cada projetor, com o vídeo andando. Desligue se o computador ficar lento.',
  }),
  quadrosMiniatura: z.number().int().min(5).max(30).default(20).meta({
    title: 'Quadros por segundo das miniaturas',
    'x-ui': 'deslizante',
    'x-passo': 1,
  }),
  /** volume de tudo o que toca, mexido no player (gravado para a próxima vez) */
  volume: z.number().min(0).max(1).default(1),
  saidaAudio: z.string().default('').meta({
    title: 'Saída de som',
    description: 'Para onde vai o som das músicas, áudios e vídeos (ex.: a mesa de som).',
    'x-ui': 'dispositivo-audio',
  }),
})
export type ConfigGeral = z.infer<typeof EsquemaGeral>

export const EsquemaMusicas = z.object({
  antecipacaoMs: z.number().int().min(0).max(1000).default(250).meta({
    title: 'Antecipação da troca de trecho (ms)',
    description: 'A letra troca um pouco antes de cantarem, para dar tempo de ler.',
    'x-ui': 'deslizante',
    'x-passo': 50,
  }),
  tituloNaIntroducao: z.boolean().default(true).meta({ title: 'Mostrar o título durante a introdução' }),
  clicarPulaAudio: z.boolean().default(true).meta({
    title: 'Clicar num trecho pula o áudio para ele',
    description: 'Desligado, clicar num trecho só mostra a letra e o programa para de seguir o áudio.',
  }),
  pastaLouvorJa: z.string().default('C:\\Program Files (x86)\\Louvor JA\\config').meta({
    title: 'Pasta do Louvor JA',
    description: 'A pasta "config" do Louvor JA, onde ficam o database.db e as músicas.',
    'x-ui': 'pasta',
  }),
  focoNoManual: z.boolean().default(true).meta({
    title: 'Só a letra: abrir o painel grande dos trechos',
    description: 'Sem áudio, quem passa os trechos é você: o resto da tela de comando escurece e ficam só a letra e os botões de passar (→, PageDown ou Espaço).',
  }),
  aoTerminar: z.enum(['fechar', 'logo', 'manter']).default('fechar').meta({
    title: 'Quando o áudio da música termina',
    'x-opcoes': {
      fechar: 'Fecha a música (a tela fica vazia)',
      logo: 'Fecha a música e mostra a tela de espera (Logo)',
      manter: 'Continua no último trecho, com a imagem da música',
    },
  }),
})
export type ConfigMusicas = z.infer<typeof EsquemaMusicas>

/** Vídeos e som (pedidos de 21/11): fim do vídeo, Esc, vídeos pesados e o lembrete do canal do PC na mesa. */
export const EsquemaVideos = z.object({
  aoTerminar: z.enum(['sair', 'logo', 'congelar']).default('sair').meta({
    title: 'Quando um vídeo termina',
    description: 'Vale para os vídeos avulsos (os de dentro de um slide ficam no slide, como no PowerPoint).',
    'x-opcoes': {
      sair: 'Sai do ar: volta o que estava esperando (relógio, cronômetro, mensagem em tela cheia) ou o fundo',
      logo: 'Sai do ar e mostra a tela de espera (Logo)',
      congelar: 'Fica parado no último quadro (como era antes)',
    },
  }),
  limparPausa: z.boolean().default(true).meta({
    title: 'Limpar (Esc) e Logo pausam o vídeo',
    description: 'Ao voltar para a tela normal, o vídeo continua de onde parou. Desligado, o vídeo continua tocando, com som, escondido. O Preto nunca pausa.',
  }),
  converterPesados: z.boolean().default(true).meta({
    title: 'Converter sozinho os vídeos pesados para este computador',
    description:
      'Vídeo em AV1, HEVC ou VP9, maior que 1080p ou 1080p com mais de 30 quadros por segundo pode travar aqui. O programa converte para H.264 1080p em segundo plano (prioridade baixa) e troca o arquivo quando termina, sem tirar nada do ar.',
  }),
  lembreteCanal: z.boolean().default(true).meta({
    title: 'Lembrete: abrir o canal do PC na mesa de som',
    description: 'Quando um vídeo, música ou áudio começa a tocar, a tela de comando (e o celular) mostra um aviso grande para abrir o canal do computador na mesa.',
  }),
  lembreteIntervaloMin: z.number().int().min(0).max(120).default(0).meta({
    title: 'Depois de "Já abri", não lembrar de novo por (minutos)',
    description: '0 = lembra toda vez que algo com som começa a tocar.',
    'x-ui': 'deslizante',
    'x-passo': 5,
  }),
})
export type ConfigVideos = z.infer<typeof EsquemaVideos>

export const EsquemaBiblia = z.object({
  versaoPadrao: z.string().default('').meta({ title: 'Versão padrão', 'x-ui': 'versao-biblia' }),
  segundaVersao: z.string().default('').meta({
    title: 'Segunda versão (opcional)',
    description: 'Aparece junto, embaixo da primeira.',
    'x-ui': 'versao-biblia',
  }),
  maxCaracteres: z.number().int().min(120).max(700).default(320).meta({
    title: 'Tamanho máximo de cada tela (letras)',
    description: 'Versículo maior que isso é dividido em mais de uma tela.',
    'x-ui': 'deslizante',
    'x-passo': 10,
  }),
  mostrarNumero: z.boolean().default(false).meta({ title: 'Mostrar o número do versículo antes do texto' }),
  siglaNaReferencia: z.boolean().default(true).meta({
    title: 'Mostrar a sigla da versão na referência',
    description: 'Ex.: "João 3:16 (ARA)". As editoras costumam pedir a sigla visível.',
  }),
})
export type ConfigBiblia = z.infer<typeof EsquemaBiblia>

export const MODOS_MIDIAS_SLIDES = ['como-no-arquivo', 'sozinho', 'no-clique'] as const
export const LARGURAS_SLIDES = ['1280', '1920', '2560'] as const

export const EsquemaApresentacoes = z.object({
  pularOcultos: z.boolean().default(true).meta({
    title: 'Pular os slides ocultos',
    description: 'Como no PowerPoint: o passador não para nos slides marcados como ocultos. Clicando no slide, ele aparece.',
  }),
  midiasDosSlides: z.enum(MODOS_MIDIAS_SLIDES).default('como-no-arquivo').meta({
    title: 'Vídeos e áudios dos slides começam',
    'x-opcoes': {
      'como-no-arquivo': 'Como foi configurado no PowerPoint',
      sozinho: 'Sozinhos, quando o slide aparece',
      'no-clique': 'No próximo clique do passador',
    },
  }),
  largura: z.enum(LARGURAS_SLIDES).default('1920').meta({
    title: 'Resolução das imagens dos slides',
    description: 'Largura em pixels. Maior fica mais nítido, mas ocupa mais disco. Vale para as próximas importações.',
    'x-opcoes': { '1280': '1280 (HD)', '1920': '1920 (Full HD)', '2560': '2560' },
  }),
})
export type ConfigApresentacoes = z.infer<typeof EsquemaApresentacoes>

export const EsquemaRemoto = z.object({
  ativo: z.boolean().default(true).meta({
    title: 'Ligar o controle remoto',
    description: 'Celular ou tablet na mesma rede (Wi-Fi) do computador abre o endereço mostrado aqui no navegador.',
  }),
  porta: z.number().int().min(1024).max(65535).default(8090).meta({
    title: 'Porta',
    description: 'Número que vai depois do IP no endereço (ex.: 192.168.0.10:8090).',
  }),
  exigirPin: z.boolean().default(true).meta({
    title: 'Pedir PIN',
    description: 'Quem abrir o endereço digita o PIN uma vez. Deixe ligado se o Wi-Fi é aberto à igreja.',
  }),
  pin: z
    .string()
    .regex(/^\d{0,8}$/, 'Só números (até 8)')
    .default('')
    .meta({ title: 'PIN (só números)', description: 'Em branco, o programa cria um novo.' }),
})
export type ConfigRemoto = z.infer<typeof EsquemaRemoto>

export const EsquemaFerramentas = z.object({
  relogioSegundos: z.boolean().default(false).meta({ title: 'Relógio: mostrar os segundos' }),
  relogioData: z.boolean().default(false).meta({ title: 'Relógio: mostrar a data', description: 'Embaixo da hora, em letra menor.' }),
  relogioTextoGrandePct: z.number().min(30).max(100).default(55).meta({
    title: 'Relógio no canto com texto grande (% do tamanho)',
    description:
      'Quando a letra da música, o versículo ou um texto chega até a altura do relógio, ele diminui para não cobrir as palavras e volta ao tamanho normal depois. 100 = não diminui.',
    'x-ui': 'deslizante',
    'x-passo': 5,
  }),
  fundoNoCanto: z.boolean().default(true).meta({
    title: 'Fundo escuro atrás do relógio e do temporizador no canto',
    description: 'Ajuda a ler por cima de imagens, vídeos e slides claros.',
  }),
  temporizadorAmareloMin: z.number().int().min(0).max(60).default(5).meta({
    title: 'Temporizador: amarelo quando faltar (min)',
    description: '0 = não fica amarelo.',
    'x-ui': 'deslizante',
    'x-passo': 1,
  }),
  temporizadorVermelhoMin: z.number().int().min(0).max(30).default(1).meta({
    title: 'Temporizador: vermelho quando faltar (min)',
    description: '0 = só fica vermelho no fim.',
    'x-ui': 'deslizante',
    'x-passo': 1,
  }),
  temporizadorAoTerminar: z.enum(['negativo', 'parar']).default('negativo').meta({
    title: 'Quando o tempo acaba',
    'x-opcoes': { negativo: 'Continua contando o tempo passado (−0:35), em vermelho', parar: 'Para no 0:00' },
  }),
  temporizadorPiscar: z.boolean().default(true).meta({ title: 'Temporizador: piscar quando o tempo acabar' }),
  temporizadorMensagem: z.string().max(80).default('Tempo esgotado').meta({
    title: 'Mensagem quando o tempo acaba',
    description: 'Aparece embaixo do temporizador em tela cheia. Em branco, sem mensagem.',
  }),
  qrMostrarLink: z.boolean().default(true).meta({ title: 'QR code: escrever o link embaixo (tela cheia)' }),
  sorteioDuracaoS: z.number().min(0).max(15).default(4).meta({
    title: 'Sorteio: duração da animação (s)',
    description: 'Os nomes passam na tela antes de aparecer o sorteado. 0 = mostra direto.',
    'x-ui': 'deslizante',
    'x-passo': 0.5,
  }),
  // listas editadas na própria página Ferramentas (sem `title`: não aparecem no formulário)
  predefinicoes: z
    .array(z.object({ nome: z.string().max(60), minutos: z.number().min(0).max(1440) }))
    .max(30)
    .default(() => [
      { nome: 'Sermão', minutos: 40 },
      { nome: 'Escola Sabatina', minutos: 45 },
    ]),
  qrSalvos: z
    .array(z.object({ nome: z.string().max(60), link: z.string().max(2000), texto: z.string().max(300) }))
    .max(30)
    .default(() => []),
  mensagensRapidas: z
    .array(z.string().max(120))
    .max(20)
    .default(() => ['Faltam 5 minutos', 'Faltam 2 minutos', 'Pode encerrar']),
})
export type ConfigFerramentas = z.infer<typeof EsquemaFerramentas>

export const EsquemaIluminacao = z.object({
  ativo: z.boolean().default(true).meta({
    title: 'Mostrar o botão das luzes',
    description: 'Na barra de baixo da tela de comando: abre o painel para ligar, desligar e escolher um cenário.',
  }),
  endereco: z.string().max(200).default('http://luz.local').meta({
    title: 'Endereço do sistema de iluminação',
    description: 'O mesmo que abre a página das luzes no navegador.',
  }),
  usuario: z.string().max(40).default('Sonoplastia').meta({
    title: 'Nome no histórico das luzes',
    description: 'Aparece no histórico do sistema de iluminação quando o programa mexe nas luzes.',
  }),
  automacao: z.boolean().default(true).meta({
    title: 'Liturgia: trocar o cenário das luzes nos itens que pedirem',
    description: 'Cada item da liturgia pode ter um cenário para quando começa e outro para quando termina (ex.: apagar a frente no vídeo).',
  }),
})
export type ConfigIluminacao = z.infer<typeof EsquemaIluminacao>

export const EsquemaSite = z.object({
  ativo: z.boolean().default(true).meta({
    title: 'Buscar os arquivos do site sozinho',
    description:
      'Confere o site a cada 5 minutos e baixa para a biblioteca de Mídias o que é deste sábado: Avisos, Provai e Vede, Informativo das Missões, Vida e Saúde, materiais fixos e os arquivos enviados pelas pessoas.',
  }),
  endereco: z.string().max(2000).default('').meta({
    title: 'Endereço do manifesto',
    description: 'O link do manifest.json que a equipe do site passou. Ele tem uma chave de leitura: não mande para ninguém nem publique.',
    'x-ui': 'segredo',
  }),
})
export type ConfigSite = z.infer<typeof EsquemaSite>

/**
 * Bíblia automática: a fala do microfone vira texto (ElevenLabs) e a IA sugere os versículos.
 * As chaves ficam só no config.json deste computador: não vão para o controle remoto nem para o log.
 */
export const MOTORES_TRANSCRICAO = ['local', 'elevenlabs'] as const
export const MODELOS_WHISPER = ['base', 'small', 'turbo'] as const

export const EsquemaTranscricaoEscuta = z.object({
  motor: z.enum(MOTORES_TRANSCRICAO).default('local').meta({
    title: 'Onde a fala vira texto',
    description: 'Neste computador não precisa de internet nem custa nada. A IA que escolhe os versículos continua pela internet.',
    'x-opcoes': { local: 'Neste computador (Whisper)', elevenlabs: 'Na nuvem (ElevenLabs, com chave)' },
  }),
  modeloLocal: z.enum(MODELOS_WHISPER).default('base').meta({
    title: 'Whisper: modelo',
    description:
      'Quanto maior, mais acerta e mais pesa. O turbo acerta quase tudo, mas precisa de um computador forte (no i3 da igreja não dá conta). Depois de escolher, use "Testar a velocidade".',
    'x-opcoes': {
      base: 'Base (60 MB): rápido, erra bastante',
      small: 'Small (190 MB): erra menos, ~3× mais lento',
      turbo: 'Turbo (574 MB): quase não erra, só em PC forte',
    },
  }),
  threadsLocal: z.number().int().min(1).max(16).default(2).meta({
    title: 'Whisper: núcleos do processador',
    description: 'Mais núcleos = mais rápido, e menos sobra para o programa e os vídeos. No i3 da igreja, 2; num PC de 6 núcleos (12 threads), até 8.',
    'x-ui': 'deslizante',
    'x-passo': 1,
  }),
  chaveElevenLabs: z.string().max(300).default('').meta({
    title: 'Chave de API do ElevenLabs (só na nuvem)',
    description:
      'Começa com sk_ (elevenlabs.io → Developers → API Keys, com a permissão Speech to Text). Cerca de US$ 0,40 por hora de fala; só é cobrado enquanto alguém fala.',
    'x-ui': 'segredo',
    'x-dica': 'sk_…',
  }),
  microfone: z.string().default('').meta({
    title: 'Microfone',
    description: 'De onde vem a voz do pregador. O melhor é a saída da mesa de som; um microfone na sala também serve.',
    'x-ui': 'dispositivo-entrada',
  }),
})
export type ConfigTranscricaoEscuta = z.infer<typeof EsquemaTranscricaoEscuta>

export const TIPOS_API_IA = ['anthropic', 'openai'] as const
export type TipoApiIA = (typeof TIPOS_API_IA)[number]

export const EsquemaTranscricaoIA = z.object({
  tipo: z.enum(TIPOS_API_IA).default('anthropic').meta({
    title: 'Formato da API',
    'x-opcoes': { anthropic: 'Anthropic (Claude)', openai: 'Compatível com OpenAI (OpenRouter, New API, Ollama…)' },
  }),
  url: z.string().max(500).default('').meta({
    title: 'URL da API',
    description: 'Em branco, o endereço oficial (api.anthropic.com ou api.openai.com). Para um servidor próprio basta o endereço (ex.: http://meu-servidor.com).',
  }),
  chave: z.string().max(300).default('').meta({ title: 'Chave da API', 'x-ui': 'segredo', 'x-dica': 'cole a chave aqui' }),
  modelo: z.string().max(120).default('claude-haiku-5-5').meta({
    title: 'Modelo',
    description: 'Um modelo rápido e barato basta: a IA só escolhe referências (o texto sempre vem da Bíblia do programa).',
    'x-ui': 'modelo-ia',
  }),
  intervaloS: z.number().int().min(3).max(120).default(5).meta({
    title: 'Chamar a IA a cada (segundos)',
    description: 'No máximo uma chamada nesse tempo, e só se houve fala nova. Menos tempo = sugestões mais rápidas e mais chamadas.',
    'x-ui': 'deslizante',
    'x-passo': 1,
  }),
  janelaS: z.number().int().min(10).max(180).default(40).meta({
    title: 'Fala analisada (últimos segundos)',
    description: 'Quanto da fala recente a IA lê em cada chamada. Mais tempo dá mais contexto e custa mais.',
    'x-ui': 'deslizante',
    'x-passo': 5,
  }),
  minPalavras: z.number().int().min(3).max(60).default(12).meta({
    title: 'Palavras novas para chamar a IA',
    description: 'Pausa curta ou um "amém" não geram outra chamada.',
    'x-ui': 'deslizante',
    'x-passo': 1,
  }),
  rigor: z.number().int().min(0).max(100).default(55).meta({
    title: 'Rigor das sugestões (%)',
    description: '100 = só citação direta; 70 = também alusões (a história, o personagem); 30 = também temas parecidos.',
    'x-ui': 'deslizante',
    'x-passo': 5,
  }),
})
export type ConfigTranscricaoIA = z.infer<typeof EsquemaTranscricaoIA>

export const MOSTRAR_SOZINHO = ['nao', 'referencia', 'leitura'] as const
export type MostrarSozinho = (typeof MOSTRAR_SOZINHO)[number]

export const EsquemaTranscricaoAuto = z.object({
  mostrarSozinho: z.enum(MOSTRAR_SOZINHO).default('leitura').meta({
    title: 'Citação direta: pôr na tela sozinho',
    description:
      'Vai para o "Enviar para" escolhido no alto da tela. Só troca versículo, texto, imagem ou tela vazia: com vídeo, música, slide, Logo, Preto ou Limpar no ar, fica só a sugestão.',
    'x-opcoes': {
      nao: 'Não: só sugere',
      referencia: 'Quando diz a referência ("João 3:16")',
      leitura: 'Quando diz a referência ou lê o texto',
    },
  }),
  sensibilidade: z.enum(['alta', 'media', 'baixa']).default('media').meta({
    title: 'Sensibilidade à voz',
    description: 'Alta percebe voz mais baixa (e também mais barulho). Baixa só conta voz bem mais alta que o ruído da sala.',
    'x-opcoes': { alta: 'Alta', media: 'Média', baixa: 'Baixa' },
  }),
  silencioS: z.number().int().min(5).max(300).default(20).meta({
    title: 'Pausar depois de quantos segundos sem fala',
    description: 'Sem ninguém falando, a transcrição e a IA param (não gastam) e voltam sozinhas na próxima fala.',
    'x-ui': 'deslizante',
    'x-passo': 5,
  }),
  pausarComMidia: z.boolean().default(true).meta({
    title: 'Pausar enquanto toca música, áudio ou vídeo pelo programa',
    description: 'O som que sai pela mesa não é o pregador: não precisa transcrever nem gastar.',
  }),
})
export type ConfigTranscricaoAuto = z.infer<typeof EsquemaTranscricaoAuto>

export const EsquemaTranscricao = z.object({
  escuta: EsquemaTranscricaoEscuta.prefault({}),
  ia: EsquemaTranscricaoIA.prefault({}),
  auto: EsquemaTranscricaoAuto.prefault({}),
})
export type ConfigTranscricao = z.infer<typeof EsquemaTranscricao>

/** Preferências da própria tela de comando (sem texto: não aparecem no formulário). */
export const EsquemaInterface = z.object({
  painelRecolhido: z.boolean().default(false),
})

export function saidasPadrao(): ConfigSaida[] {
  return [
    EsquemaSaida.parse({ id: 'publico', nome: 'Público' }),
    EsquemaSaida.parse({ id: 'palco', nome: 'Palco', ...PADROES_PALCO }),
  ]
}

/** Versão do config.json; `migrarConfig` leva um arquivo mais velho até ela. */
export const VERSAO_CONFIG = 2

export const EsquemaConfig = z.object({
  versao: z.number().int().min(1).default(VERSAO_CONFIG),
  geral: EsquemaGeral.prefault({}),
  telaEspera: EsquemaTelaEspera.prefault({}),
  fundos: EsquemaFundos.prefault({}),
  musicas: EsquemaMusicas.prefault({}),
  videos: EsquemaVideos.prefault({}),
  biblia: EsquemaBiblia.prefault({}),
  apresentacoes: EsquemaApresentacoes.prefault({}),
  remoto: EsquemaRemoto.prefault({}),
  ferramentas: EsquemaFerramentas.prefault({}),
  iluminacao: EsquemaIluminacao.prefault({}),
  site: EsquemaSite.prefault({}),
  transcricao: EsquemaTranscricao.prefault({}),
  interface: EsquemaInterface.prefault({}),
  saidas: z
    .array(EsquemaSaida)
    .min(1)
    .refine((s) => new Set(s.map((x) => x.id)).size === s.length, 'IDs de saída repetidos')
    .default(saidasPadrao),
})
export type Config = z.infer<typeof EsquemaConfig>

export function configPadrao(): Config {
  return EsquemaConfig.parse({})
}

/**
 * Antes de validar um config.json antigo: opções novas da saída Palco ganham os padrões do Palco
 * (e não os do Público).
 */
/**
 * Leva um config.json antigo até a versão atual (antes de `completarPadroesDoPalco` e da validação). Cada passo
 * roda uma vez só: depois o arquivo é gravado com a versão nova, e o que o operador mudar fica.
 *  1 → 2 (21/11): o vídeo passa a tocar também no Palco, com o tempo que falta por cima.
 */
export function migrarConfig(bruto: unknown): unknown {
  const c = bruto as { versao?: unknown; saidas?: Array<Record<string, unknown>> }
  if (!c || typeof c !== 'object') return bruto
  const versao = typeof c.versao === 'number' ? c.versao : 1
  if (versao < 2 && Array.isArray(c.saidas)) {
    for (const s of c.saidas) {
      if (s?.id !== 'palco') continue
      s.mostrarVideo = true
      s.videoMostrarTempo = true
    }
  }
  if (versao < VERSAO_CONFIG) c.versao = VERSAO_CONFIG
  return bruto
}

export function completarPadroesDoPalco(bruto: unknown): unknown {
  const c = bruto as { saidas?: Array<Record<string, unknown>> }
  if (!c || !Array.isArray(c.saidas)) return bruto
  for (const s of c.saidas) {
    if (s?.id !== 'palco') continue
    for (const [k, v] of Object.entries(PADROES_PALCO)) if (!(k in s)) s[k] = v
  }
  return bruto
}
