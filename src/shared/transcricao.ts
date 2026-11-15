/**
 * Sugestões de versículos ao vivo (porta do projeto `..\Transcrição_tempo_real`): o programa ouve o
 * pregador, transcreve pela ElevenLabs e sugere versículos ligados ao que acabou de ser dito. O
 * operador escolhe; nada vai sozinho para os projetores. Tipos usados pelo processo principal, pela
 * tela de comando e pelo celular.
 */

/** Como a fala se liga à passagem (a IA dá a força; sem IA, a busca diz "citacao" ou "tema"). */
export const LIGACOES = ['citacao', 'parafrase', 'alusao', 'tema_central', 'tema_relacionado', 'distante'] as const
export type Ligacao = (typeof LIGACOES)[number] | 'tema' | ''

export const ROTULO_LIGACAO: Record<string, string> = {
  citacao: 'Citação',
  parafrase: 'Paráfrase',
  alusao: 'Alusão',
  tema_central: 'Tema central',
  tema_relacionado: 'Tema',
  distante: 'Distante',
  tema: 'Tema',
}

export type OrigemSugestao = 'citada' | 'ia' | 'busca'

export interface SugestaoVersiculo {
  id: number
  /** livro 1–66 (Gênesis = 1) */
  livro: number
  capitulo: number
  /** null quando o pregador disse só o capítulo ("Romanos 8") */
  inicio: number | null
  fim: number | null
  /** "Filipenses 4:6-7" */
  referencia: string
  /** citada = a referência foi dita em voz alta; ia = escolhida pela IA; busca = citação achada sem IA */
  origem: OrigemSugestao
  ligacao: Ligacao
  motivo: string
  /** a fala que gerou a sugestão (fim dela) */
  trecho: string
  /** quando apareceu (ms desde 1970) */
  hora: number
  /** começo do texto, na versão padrão */
  previa: string
  sigla: string
}

export type FaseTranscricao = 'parado' | 'preparando' | 'ouvindo' | 'reconectando' | 'erro'

export interface EstadoTranscricao {
  /** o operador ligou "ouvir e sugerir" */
  ligado: boolean
  fase: FaseTranscricao
  mensagem: string
  /** a IA está configurada e ligada (sem ela, só referências ditas e citações quase literais) */
  ia: boolean
  /** últimas falas transcritas (a mais nova no fim) */
  falas: string[]
  /** mais nova primeiro */
  sugestoes: SugestaoVersiculo[]
  consumo: { chamadas: number; entrada: number; saida: number }
  /** último problema que não parou a escuta (ex.: a IA não respondeu) */
  aviso: string | null
}

/** O que está sendo dito agora (muda várias vezes por segundo) e o nível do microfone (0–1). */
export interface ParcialTranscricao {
  texto: string
  nivel: number
}

/** A janela oculta de escuta conseguiu (ou não) abrir o microfone. */
export interface AvisoEscuta {
  ok: boolean
  erro?: string
  /** nome do microfone aberto */
  dispositivo?: string
}

export interface ResultadoTesteIa {
  segundos: number
  escolhas: Array<{ referencia: string; motivo: string; forca: number }>
}

export function estadoTranscricaoVazio(): EstadoTranscricao {
  return { ligado: false, fase: 'parado', mensagem: '', ia: false, falas: [], sugestoes: [], consumo: { chamadas: 0, entrada: 0, saida: 0 }, aviso: null }
}
