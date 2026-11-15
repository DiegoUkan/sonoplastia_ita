/** Números por extenso (até 199) para algarismos, numa lista de palavras já normalizadas. */

const UNIDADES: Record<string, number> = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9 }
const DEZ_A_DEZENOVE: Record<string, number> = {
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  quatorze: 14,
  catorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezasseis: 16,
  dezessete: 17,
  dezassete: 17,
  dezoito: 18,
  dezenove: 19,
  dezanove: 19,
}
const DEZENAS: Record<string, number> = { vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90 }
const CENTENAS: Record<string, number> = { cem: 100, cento: 100 }

// classe de grandeza: só junta "vinte e três" quando a parte seguinte é menor (não "três e quatro")
const CLASSE = new Map<string, number>()
const VALOR = new Map<string, number>()
for (const [tabela, classe] of [
  [UNIDADES, 0],
  [DEZ_A_DEZENOVE, 1],
  [DEZENAS, 2],
  [CENTENAS, 3],
] as const) {
  for (const [p, v] of Object.entries(tabela)) {
    CLASSE.set(p, classe)
    VALOR.set(p, v)
  }
}

/** "um" e "uma" também são artigos: "um dia", "uma palavra". */
const FRACOS = new Set(['um', 'uma'])

/** Token e se ele veio de "um"/"uma" (número fraco, pode ser artigo). */
export type Token = [string, boolean]

/** Troca sequências por extenso pelo número: "cento e vinte e três" → "123". */
export function converter(palavras: string[]): Token[] {
  const saida: Token[] = []
  let i = 0
  while (i < palavras.length) {
    const p = palavras[i]!
    if (!VALOR.has(p)) {
      saida.push([p, false])
      i++
      continue
    }
    let total = VALOR.get(p)!
    let classe = CLASSE.get(p)!
    let fraco = FRACOS.has(p)
    let j = i + 1
    while (j + 1 < palavras.length && palavras[j] === 'e' && VALOR.has(palavras[j + 1]!)) {
      const seguinte = palavras[j + 1]!
      const cs = CLASSE.get(seguinte)!
      if (cs >= classe || classe === 1 || (classe === 2 && cs !== 0)) break
      total += VALOR.get(seguinte)!
      classe = cs
      fraco = false
      j += 2
    }
    saida.push([String(total), fraco])
    i = j
  }
  return saida
}
