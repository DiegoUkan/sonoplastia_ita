/**
 * Esquema único das configurações.
 *
 * Cada opção tem tipo, valor padrão e textos (`title`, `description`) para a tela de configurações,
 * que é gerada a partir deste esquema (`z.toJSONSchema`). Chaves extras usadas pela tela:
 *   'x-ui'     'cor' | 'deslizante' | 'arquivo-imagem'
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
})
export type ConfigSaida = z.infer<typeof EsquemaSaida>

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

export const EsquemaGeral = z.object({
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
})
export type ConfigGeral = z.infer<typeof EsquemaGeral>

export function saidasPadrao(): ConfigSaida[] {
  return [EsquemaSaida.parse({ id: 'publico', nome: 'Público' }), EsquemaSaida.parse({ id: 'palco', nome: 'Palco' })]
}

export const EsquemaConfig = z.object({
  versao: z.literal(1).default(1),
  geral: EsquemaGeral.prefault({}),
  telaEspera: EsquemaTelaEspera.prefault({}),
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
