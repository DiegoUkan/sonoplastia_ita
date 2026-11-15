/**
 * Esquema único das configurações.
 *
 * Cada opção tem tipo, valor padrão e textos (`title`, `description`) para a tela de configurações,
 * que é gerada a partir deste esquema (`z.toJSONSchema`). Opção sem `title` não aparece na tela.
 * Chaves extras usadas pela tela:
 *   'x-ui'     'cor' | 'deslizante' | 'arquivo-imagem' | 'dispositivo-audio' | 'versao-biblia' | 'pasta' | 'segredo'
 *   'x-passo'  passo do controle deslizante
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
    description: 'Desligado, mostra só o nome do vídeo e o tempo que falta, sem pesar o computador. Bom para o Palco.',
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
 * O Palco vem diferente do Público: sem vídeo, sem fundo nas músicas, com o próximo trecho, o próximo
 * slide, o aviso de último slide e o relógio no canto.
 */
export const PADROES_PALCO = {
  mostrarVideo: false,
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

export const EsquemaConfig = z.object({
  versao: z.literal(1).default(1),
  geral: EsquemaGeral.prefault({}),
  telaEspera: EsquemaTelaEspera.prefault({}),
  fundos: EsquemaFundos.prefault({}),
  musicas: EsquemaMusicas.prefault({}),
  biblia: EsquemaBiblia.prefault({}),
  apresentacoes: EsquemaApresentacoes.prefault({}),
  remoto: EsquemaRemoto.prefault({}),
  ferramentas: EsquemaFerramentas.prefault({}),
  iluminacao: EsquemaIluminacao.prefault({}),
  site: EsquemaSite.prefault({}),
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
export function completarPadroesDoPalco(bruto: unknown): unknown {
  const c = bruto as { saidas?: Array<Record<string, unknown>> }
  if (!c || !Array.isArray(c.saidas)) return bruto
  for (const s of c.saidas) {
    if (s?.id !== 'palco') continue
    for (const [k, v] of Object.entries(PADROES_PALCO)) if (!(k in s)) s[k] = v
  }
  return bruto
}
