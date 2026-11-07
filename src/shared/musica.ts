/** Regras de tempo das músicas (usadas pelo importador, pela janela de áudio e pelos testes). */

/** '00:01:23' ou '01:23.5' → milissegundos. */
export function msDeTempo(t: string | null | undefined): number {
  if (!t) return 0
  const partes = String(t).trim().split(':').map(Number)
  if (partes.some((p) => !Number.isFinite(p))) return 0
  while (partes.length < 3) partes.unshift(0)
  const [h, m, s] = partes as [number, number, number]
  return Math.round((h * 3600 + m * 60 + s) * 1000)
}

/** milissegundos → 'm:ss.d' */
export function formatarMs(ms: number): string {
  const total = Math.max(0, ms) / 1000
  const m = Math.floor(total / 60)
  const s = total - m * 60
  return `${m}:${s.toFixed(1).padStart(4, '0')}`
}

/** 'm:ss.d', 'ss' ou 'm:ss' → milissegundos (null se não der para ler). */
export function lerMs(texto: string): number | null {
  const t = texto.trim().replace(',', '.')
  if (!t) return 0
  const partes = t.split(':')
  if (partes.length > 2) return null
  const nums = partes.map(Number)
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null
  const [a, b] = nums as [number, number | undefined]
  return Math.round((b === undefined ? a : a * 60 + b) * 1000)
}

/**
 * Trecho que deve estar no ar no instante `msAtual`: o último cujo início já passou (com a
 * antecipação). Trechos sem tempo (0), fora o primeiro, não entram na troca automática, como no
 * player do Louvor JA. Devolve -1 antes do primeiro trecho (introdução).
 */
export function indiceNoTempo(slides: Array<{ ms: number }>, msAtual: number, antecipacaoMs: number): number {
  const pontos: Array<[number, number]> = []
  slides.forEach((s, i) => {
    if (s.ms > 0 || i === 0) pontos.push([s.ms, i])
  })
  pontos.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const agora = msAtual + antecipacaoMs
  let indice = -1
  for (const [ms, i] of pontos) {
    if (ms <= agora) indice = i
    else break
  }
  // o primeiro trecho com tempo 0 só entra quando o áudio começou de fato
  if (indice === 0 && slides[0]!.ms === 0 && msAtual <= 0) return -1
  return indice
}

/** Tempos de cada trecho na versão escolhida: o playback usa os próprios tempos, se existirem. */
export function temposDaVersao(slides: Array<{ msCantado: number; msPlayback: number }>, versao: 'cantado' | 'playback' | 'manual'): number[] {
  const usarPlayback = versao === 'playback' && slides.some((s) => s.msPlayback > 0)
  return slides.map((s) => (usarPlayback ? s.msPlayback : versao === 'manual' ? 0 : s.msCantado))
}
