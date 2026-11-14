/**
 * Apresentações (PPTX e PDF). Na importação cada slide vira uma imagem (PowerPoint pelo COM, PDF pelo
 * leitor do Windows); vídeos e áudios embutidos no PPTX são extraídos e tocam por cima do slide.
 */

export type TipoApresentacao = 'pptx' | 'pdf'
export type SituacaoApresentacao = 'na-fila' | 'convertendo' | 'pronto' | 'erro'

/** Como os vídeos e áudios dos slides começam (configuração). */
export type ModoMidiasSlides = 'como-no-arquivo' | 'sozinho' | 'no-clique'

/** Vídeo ou áudio embutido (ou vinculado) num slide do PowerPoint. */
export interface MidiaSlide {
  tipo: 'video' | 'audio'
  url: string
  nome: string
  /** como foi configurado no PowerPoint: sozinho quando o slide aparece, ou no clique */
  inicio: 'sozinho' | 'clique'
  repetir: boolean
  /** áudio que continua nos slides seguintes ("tocar entre slides" no PowerPoint) */
  continua: boolean
  /** posição e tamanho no slide, em frações (0 a 1) da largura e da altura do slide */
  x: number
  y: number
  l: number
  a: number
}

export interface SlideDados {
  url: string
  miniaturaUrl: string
  largura: number
  altura: number
  oculto: boolean
  notas: string
  midias: MidiaSlide[]
}

export interface ResumoApresentacao {
  id: number
  nome: string
  tipo: TipoApresentacao
  /** número de slides (0 enquanto converte) */
  total: number
  situacao: SituacaoApresentacao
  detalhe: string | null
  /** 0 a 1 durante a conversão */
  progresso: number | null
  miniaturaUrl: string | null
  bytes: number
  criadoEm: string
}

export interface Apresentacao extends ResumoApresentacao {
  slides: SlideDados[]
}

/** Extensões aceitas e as recusadas (com o motivo). */
export const EXTENSOES_APRESENTACAO: Record<string, TipoApresentacao> = { '.pptx': 'pptx', '.ppsx': 'pptx', '.pdf': 'pdf' }
export const EXTENSOES_RECUSADAS: Record<string, string> = {
  '.ppt': 'formato antigo do PowerPoint: abra no PowerPoint e salve como .pptx',
  '.pps': 'formato antigo do PowerPoint: abra no PowerPoint e salve como .pptx',
  '.pptm': 'pode ter macros: abra no PowerPoint e salve como .pptx',
  '.ppsm': 'pode ter macros: abra no PowerPoint e salve como .pptx',
  '.potx': 'é um modelo, não uma apresentação',
}

export function extensao(nome: string): string {
  const m = /\.[^.\\/]+$/.exec(nome)
  return m ? m[0].toLowerCase() : ''
}

export function ehApresentacao(nome: string): boolean {
  const e = extensao(nome)
  return e in EXTENSOES_APRESENTACAO || e in EXTENSOES_RECUSADAS
}

/**
 * Slide vizinho na direção `passo`, pulando os ocultos se pedir (como o PowerPoint faz na
 * apresentação). Devolve null quando não há mais slides nessa direção.
 */
export function slideVizinho(ocultos: boolean[], indice: number, passo: 1 | -1, pularOcultos: boolean): number | null {
  for (let i = indice + passo; i >= 0 && i < ocultos.length; i += passo) {
    if (!pularOcultos || !ocultos[i]) return i
  }
  return null
}

/** Primeiro slide a mostrar ao abrir (o primeiro que não está oculto). */
export function primeiroSlide(ocultos: boolean[], pularOcultos: boolean): number {
  return slideVizinho(ocultos, -1, 1, pularOcultos) ?? 0
}

/** A mídia começa sozinha quando o slide aparece? */
export function comecaSozinha(m: Pick<MidiaSlide, 'inicio'>, modo: ModoMidiasSlides): boolean {
  if (modo === 'sozinho') return true
  if (modo === 'no-clique') return false
  return m.inicio === 'sozinho'
}
