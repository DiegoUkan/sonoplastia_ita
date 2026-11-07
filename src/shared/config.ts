/**
 * Esquema único das configurações.
 *
 * Cada opção tem tipo, valor padrão e textos (`title`, `description`) para a tela de configurações,
 * que é gerada a partir deste esquema (`z.toJSONSchema`). Opção sem `title` não aparece na tela.
 * Chaves extras usadas pela tela:
 *   'x-ui'     'cor' | 'deslizante' | 'arquivo-imagem' | 'dispositivo-audio' | 'versao-biblia' | 'pasta'
 *   'x-passo'  passo do controle deslizante
 *   'x-opcoes' rótulos das opções de um enum
 * Para criar uma opção nova, basta acrescentá-la aqui com `.default()` e `.meta()`.
 */
import { z } from 'zod'

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
  textoSombra: z.boolean().default(true).meta({ title: 'Sombra no texto', description: 'Ajuda a ler sobre imagens claras.' }),
})
export type ConfigSaida = z.infer<typeof EsquemaSaida>

/** O Palco vem diferente do Público: sem vídeo, sem fundo nas músicas e com o próximo trecho. */
export const PADROES_PALCO = { mostrarVideo: false, musicaComFundo: false, musicaMostrarProximo: true } as const

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
  musicas: EsquemaMusicas.prefault({}),
  biblia: EsquemaBiblia.prefault({}),
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
