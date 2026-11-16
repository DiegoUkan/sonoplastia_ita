/**
 * Palavras da fala e dos versículos para a busca e para reconhecer leitura literal.
 * Porta de `busca/texto.py` do projeto de transcrição.
 */

/** Palavras sem conteúdo, incluindo vícios de fala de pregação ("né", "gente", "amém"). */
export const STOPWORDS = new Set(
  `a ao aos as ate com como da das de dela dele deles do dos e ela elas ele eles em entre era eram
essa essas esse esses esta estas este estes eu foi for foram ha isso isto ja la lhe lhes mais mas
me mesmo meu minha minhas meus muito na nas nem no nos nossa nossas nosso nossos num numa o os ou
para pela pelas pelo pelos por qual quando que quem se sem ser seu seus sua suas tambem te tem
tinha tu tua tuas teu teus um uma umas uns voce voces vos sao esta estao estava estavam sobre
porque pois so ai aqui ali entao ne tipo gente pra pro pras pros ta to tava vai vou vamos
igreja amem aleluia irmao irmaos irma irmas gloria hoje agora coisa coisas assim olha sabe
dizer disse diz fala falar falou ver vem veio fazer faz fez dia dias vez vezes todo toda todos todas`.split(/\s+/),
)

/** minúsculas, sem acento, só letras */
export function palavrasDe(texto: string): string[] {
  return (
    texto
      .normalize('NFKD')
      .toLowerCase()
      .replace(/\p{M}/gu, '')
      .match(/[a-z]+/g) ?? []
  )
}

/** Palavras com conteúdo (sem as de ligação e sem as muito curtas). */
export function termosDe(texto: string): string[] {
  return palavrasDe(texto).filter((p) => p.length > 2 && !STOPWORDS.has(p))
}

/** Pares de palavras seguidas, menos os formados só por palavras de ligação ("de um"). */
export function paresDe(palavras: string[]): string[] {
  const r: string[] = []
  for (let i = 0; i + 1 < palavras.length; i++) {
    const a = palavras[i]!
    const b = palavras[i + 1]!
    if (STOPWORDS.has(a) && STOPWORDS.has(b)) continue
    r.push(`${a}_${b}`)
  }
  return r
}

export interface Cobertura {
  /** pares do versículo que aparecem na fala */
  pares: number
  /** pares do versículo */
  total: number
  /** pares / total (0 a 1) */
  fracao: number
}

/**
 * Quanto do versículo foi dito com as mesmas palavras e na mesma ordem (pares de palavras seguidas).
 * Leitura em voz alta dá 0,5–1 mesmo com erros da transcrição; tema parecido, perto de 0.
 */
export function cobertura(textoVersiculo: string, paresDaFala: ReadonlySet<string>): Cobertura {
  const pares = [...new Set(paresDe(palavrasDe(textoVersiculo)))]
  const achados = pares.filter((p) => paresDaFala.has(p)).length
  return { pares: achados, total: pares.length, fracao: pares.length ? achados / pares.length : 0 }
}

export const conjuntoDePares = (texto: string): Set<string> => new Set(paresDe(palavrasDe(texto)))

/** Leitura literal: boa parte do versículo, com um mínimo de pares (versículo curto engana). */
export const pareceLeitura = (c: Cobertura) => c.pares >= 3 && c.fracao >= 0.4
