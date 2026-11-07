/** Utilidades de texto (sem acento, divisão de versículos longos). */

export function semAcento(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

const SEPARADORES: Array<[RegExp, number]> = [
  [/[.!?…]["”’)]?\s/g, 3],
  [/[;:]\s/g, 2],
  [/,\s/g, 1],
  [/\s/g, 0],
]

/**
 * Divide um texto longo em partes de até `max` letras, de tamanho parecido, cortando de preferência
 * no fim de frase, depois em ; e :, depois em vírgula e por último em espaço.
 */
export function dividirTexto(texto: string, max: number): string[] {
  const t = texto.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t ? [t] : []
  const partes: string[] = []
  let resto = t
  while (resto.length > max) {
    const quantas = Math.ceil(resto.length / max)
    const ideal = resto.length / quantas
    const minimo = Math.floor(ideal * 0.6)
    const limite = Math.min(max, Math.ceil(ideal * 1.3))
    let melhor = -1
    let melhorNota = -Infinity
    for (const [re, peso] of SEPARADORES) {
      re.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = re.exec(resto))) {
        const fim = m.index + m[0].trimEnd().length // corta depois da pontuação
        if (fim < minimo) continue
        if (fim > limite) break
        const nota = peso * 1000 - Math.abs(fim - ideal)
        if (nota > melhorNota) {
          melhorNota = nota
          melhor = fim
        }
      }
      if (melhor > 0 && peso > 0) break // achou um separador forte: não desce para os fracos
    }
    if (melhor <= 0) melhor = limite
    partes.push(resto.slice(0, melhor).trim())
    resto = resto.slice(melhor).trim()
  }
  if (resto) partes.push(resto)
  return partes
}
