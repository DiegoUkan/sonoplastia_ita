/**
 * Regras puras de vídeo: sincronia entre duas saídas que tocam o mesmo vídeo e o que pesa demais para o PC
 * da igreja (i3-7100; GT 730 Kepler, que só decodifica H.264 na placa; Intel HD 630, que faz H.264, HEVC e
 * VP9). Em 21/11 um vídeo AV1 2560×1440 do site travou no meio: o processador decodificava sozinho.
 */

export interface PassoSincronia {
  /** velocidade para esta saída (1 = normal) */
  velocidade: number
  /** posição para onde pular agora (null = não pula) */
  pular: number | null
}

/** Diferença a partir da qual a saída pula de vez (em vez de acelerar ou frear). */
const PULAR_ACIMA_S = 1
/** Depois de um pulo, espera o vídeo assentar antes de pular de novo. */
const ESPERA_ENTRE_PULOS_MS = 3000
/** Diferença que ninguém percebe. */
const TOLERANCIA_S = 0.05

/**
 * Como a saída que acompanha deve andar. `esperado`: onde a saída de referência está agora; `atual`: onde esta
 * está; `tocando`: as duas tocando (pausado não mexe). Diferença pequena: até 10% mais rápido ou mais devagar
 * (corrige 0,1 s por segundo, sem som nesta saída ninguém percebe); grande: pula.
 */
export function passoDeSincronia(esperado: number, atual: number, tocando: boolean, desdeUltimoPuloMs: number): PassoSincronia | null {
  if (!tocando || !Number.isFinite(esperado) || !Number.isFinite(atual)) return null
  const dif = esperado - atual // > 0: esta saída está atrasada
  if (Math.abs(dif) > PULAR_ACIMA_S && desdeUltimoPuloMs > ESPERA_ENTRE_PULOS_MS) return { velocidade: 1, pular: Math.max(0, esperado + 0.15) }
  if (Math.abs(dif) <= TOLERANCIA_S) return { velocidade: 1, pular: null }
  const ajuste = Math.max(-0.1, Math.min(0.1, dif * 0.3))
  return { velocidade: Math.round((1 + ajuste) * 1000) / 1000, pular: null }
}

export type CodecVideo = 'h264' | 'hevc' | 'av1' | 'vp9' | 'vp8' | 'mpeg4' | 'outro'

export const NOME_CODEC: Record<CodecVideo, string> = {
  h264: 'H.264',
  hevc: 'HEVC (H.265)',
  av1: 'AV1',
  vp9: 'VP9',
  vp8: 'VP8',
  mpeg4: 'MPEG-4',
  outro: 'outro formato',
}

export interface FormatoVideo {
  codec: CodecVideo | null
  largura: number | null
  altura: number | null
  /** quadros por segundo (null = não deu para saber) */
  qps: number | null
}

/** 1920×1080 com uma folga (há vídeos com 1088 linhas). */
const PIXELS_1080P = 1920 * 1088
const PIXELS_720P = 1280 * 736

/**
 * Por que o vídeo pesa demais para o PC da igreja (null = não pesa, ou não deu para saber). Pesa: formato
 * diferente de H.264 (a placa não ajuda), mais pixels que 1080p, ou mais que 720p acima de 30 quadros por
 * segundo. Vídeo em pé (1080×1920) conta pelos pixels, como o deitado.
 */
export function motivoPesado(f: FormatoVideo): string | null {
  const motivos: string[] = []
  if (f.codec && f.codec !== 'h264') motivos.push(NOME_CODEC[f.codec])
  const pixels = f.largura && f.altura ? f.largura * f.altura : 0
  if (pixels > PIXELS_1080P) motivos.push(`${f.largura}×${f.altura}`)
  if (f.qps && f.qps > 31 && pixels > PIXELS_720P) motivos.push(`${Math.round(f.qps)} quadros/s`)
  return motivos.length ? motivos.join(', ') : null
}

/** "AV1 2560×1440 30 qps": o que aparece no cartão da mídia. */
export function descreverFormato(f: FormatoVideo): string {
  const partes: string[] = []
  if (f.codec) partes.push(NOME_CODEC[f.codec])
  if (f.largura && f.altura) partes.push(`${f.largura}×${f.altura}`)
  if (f.qps) partes.push(`${Math.round(f.qps)} qps`)
  return partes.join(' ')
}
