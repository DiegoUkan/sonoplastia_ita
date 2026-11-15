/**
 * Acha referências bíblicas faladas no texto da transcrição (porta de `refs/parser.py`).
 *
 * Reconhece: "Romanos 8", "João 3:16", "João capítulo três, versículo dezesseis", "primeira aos
 * Coríntios 13", "Salmo 23", "Gênesis 1 do 1 ao 3", "Filipenses 4, 6 e 7". Também entende
 * "versículo 17" (ou "capítulo 4") logo depois de uma referência, usando o livro/capítulo dito antes.
 */
import { LIVROS_FALADOS, type LivroFalado } from './livrosFalados'
import { converter, type Token } from './numeros'
import { type ContagemBiblia, type Passagem, passagem, validar } from './passagem'

const ORDINAIS: Record<string, number> = {
  '1': 1,
  i: 1,
  primeiro: 1,
  primeira: 1,
  '2': 2,
  ii: 2,
  segundo: 2,
  segunda: 2,
  '3': 3,
  iii: 3,
  terceiro: 3,
  terceira: 3,
}
/** palavras que podem aparecer entre o ordinal e o nome: "primeira carta aos Coríntios" */
const LIGACAO_ORDINAL = new Set(['a', 'o', 'aos', 'ao', 'as', 'de', 'do', 'da', 'carta', 'epistola', 'livro'])
const PALAVRAS_CAPITULO = new Set(['capitulo', 'capitulos', 'cap'])
const PALAVRAS_VERSICULO = new Set(['versiculo', 'versiculos', 'verso', 'versos', 'vers', 'v'])
const LIGACAO_FAIXA = new Set(['-', 'a', 'ao', 'ate', 'e', ','])
const VERSICULO_OU_PONTUACAO = new Set([...PALAVRAS_VERSICULO, ':', ',', '.'])
/** "versículo 17" usa o capítulo citado nos últimos 5 minutos */
export const CONTEXTO_VALE_S = 300

export interface Achado {
  passagem: Passagem
  /** posição (token) onde a referência começa */
  inicio: number
  /** posição logo depois do fim */
  fim: number
  /** false quando usou o livro/capítulo dito antes */
  explicita: boolean
}

export function normalizar(texto: string): Token[] {
  const t = texto
    .toLowerCase()
    .replace(/(?<![\p{L}\p{N}_])jó(?![\p{L}\p{N}_])/gu, 'job')
    .replace(/(?<![\p{L}\p{N}_])evangelho segundo(?![\p{L}\p{N}_])/gu, 'evangelho de')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
  const palavras = t.match(/\d+|[a-z]+|[:\-–,.]/g) ?? []
  return converter(palavras.map((p) => (p === '–' ? '-' : p)))
}

/** (palavras do nome, livros com esse nome), do nome mais longo para o mais curto. */
const NOMES: Array<[string[], LivroFalado[]]> = (() => {
  const porNome = new Map<string, { palavras: string[]; livros: LivroFalado[] }>()
  for (const l of LIVROS_FALADOS) {
    for (const nome of l.nomes) {
      const x = porNome.get(nome) ?? { palavras: nome.split(' '), livros: [] }
      x.livros.push(l)
      porNome.set(nome, x)
    }
  }
  return [...porNome.values()].sort((a, b) => b.palavras.length - a.palavras.length).map((x) => [x.palavras, x.livros] as [string[], LivroFalado[]])
})()

const casa = (tokens: Token[], i: number, palavras: string[]) =>
  i + palavras.length <= tokens.length && palavras.every((p, k) => tokens[i + k]![0] === p)

function numero(tokens: Token[], i: number): number | null {
  const t = tokens[i]
  return t && /^\d+$/.test(t[0]) ? Number(t[0]) : null
}

/** Lê os trechos da transcrição em ordem e lembra o último livro/capítulo citado. */
export class Rastreador {
  private ultimo: { livro: number; capitulo: number } | null = null
  private ultimoEm = 0
  /** fim do trecho anterior, se ele terminou num nome de livro sem número */
  private cauda: Token[] = []

  constructor(private readonly biblia: ContagemBiblia) {}

  /** `agora` em segundos (para os testes; o padrão é o relógio do computador). */
  processar(texto: string, agora = Date.now() / 1000): Achado[] {
    if (this.ultimo && agora - this.ultimoEm > CONTEXTO_VALE_S) this.ultimo = null
    const tokens = [...this.cauda, ...normalizar(texto)]
    const achados = this.varrer(tokens, agora)
    // guarda as últimas palavras se o trecho terminou num livro sem número ("…vamos abrir em Romanos" | "capítulo oito")
    this.cauda = tokens.length && terminaEmLivro(tokens) ? tokens.slice(-4) : []
    return achados
  }

  private varrer(tokens: Token[], agora: number): Achado[] {
    const achados: Achado[] = []
    let i = 0
    while (i < tokens.length) {
      const a = this.livroEm(tokens, i) ?? this.contextoEm(tokens, i)
      if (!a) {
        i++
        continue
      }
      achados.push(a)
      this.ultimo = { livro: a.passagem.livro, capitulo: a.passagem.capitulo }
      this.ultimoEm = agora
      i = a.fim
    }
    return achados
  }

  private livroEm(tokens: Token[], i: number): Achado | null {
    // livros numerados primeiro: "primeira aos coríntios 13"
    const ordinal = ORDINAIS[tokens[i]![0]]
    if (ordinal !== undefined) {
      let j = i + 1
      while (j < tokens.length && LIGACAO_ORDINAL.has(tokens[j]![0]) && j - i <= 3) j++
      for (const [palavras, livros] of NOMES) {
        if (!casa(tokens, j, palavras)) continue
        const l = livros.find((x) => x.numero === ordinal)
        if (!l) continue
        const a = this.referencia(tokens, i, j + palavras.length, l.n)
        if (a) return a
      }
    }
    for (const [palavras, livros] of NOMES) {
      if (!casa(tokens, i, palavras)) continue
      // nome sem número: só vale para livros não numerados ("João" é o evangelho)
      const l = livros.find((x) => x.numero === null)
      if (l) return this.referencia(tokens, i, i + palavras.length, l.n)
    }
    return null
  }

  private referencia(tokens: Token[], inicio: number, j: number, livro: number): Achado | null {
    const lido = lerCapituloEVersos(tokens, j)
    if (!lido) return null
    const p = validar(this.biblia, passagem(livro, lido.capitulo, lido.v1, lido.v2))
    return p ? { passagem: p, inicio, fim: lido.fim, explicita: true } : null
  }

  private contextoEm(tokens: Token[], i: number): Achado | null {
    if (!this.ultimo) return null
    const { livro, capitulo } = this.ultimo
    const palavra = tokens[i]![0]
    let p: Passagem | null
    let fim: number
    if (PALAVRAS_VERSICULO.has(palavra) && palavra !== 'v') {
      const lido = lerVersos(tokens, i + 1)
      if (!lido) return null
      p = validar(this.biblia, passagem(livro, capitulo, lido.v1, lido.v2))
      fim = lido.fim
    } else if (PALAVRAS_CAPITULO.has(palavra)) {
      const lido = lerCapituloEVersos(tokens, i)
      if (!lido) return null
      p = validar(this.biblia, passagem(livro, lido.capitulo, lido.v1, lido.v2))
      fim = lido.fim
    } else return null
    return p ? { passagem: p, inicio: i, fim, explicita: false } : null
  }
}

/** Atalho sem contexto entre chamadas. */
export function encontrar(texto: string, biblia: ContagemBiblia): Passagem[] {
  return new Rastreador(biblia).processar(texto).map((a) => a.passagem)
}

/** Depois do nome do livro: [,] [capítulo] N [parte dos versículos]. */
function lerCapituloEVersos(tokens: Token[], j: number): { capitulo: number; v1: number | null; v2: number | null; fim: number } | null {
  let depoisDeCapitulo = false
  while (j < tokens.length && (PALAVRAS_CAPITULO.has(tokens[j]![0]) || tokens[j]![0] === ',')) {
    if (PALAVRAS_CAPITULO.has(tokens[j]![0])) depoisDeCapitulo = true
    j++
  }
  const capitulo = numero(tokens, j)
  if (capitulo === null || capitulo === 0) return null
  // "João um dia disse…" não é João 1
  if (tokens[j]![1] && !depoisDeCapitulo && !vemVersiculo(tokens, j + 1)) return null
  j++
  const versos = parteDosVersos(tokens, j)
  if (!versos) return { capitulo, v1: null, v2: null, fim: j }
  return { capitulo, ...versos }
}

function vemVersiculo(tokens: Token[], j: number): boolean {
  return j >= tokens.length || VERSICULO_OU_PONTUACAO.has(tokens[j]![0])
}

/** ":16", ", 16", "versículo 16", ", versículo 16", "do 1 ao 3", "de 1 a 3". */
function parteDosVersos(tokens: Token[], j: number): { v1: number; v2: number; fim: number } | null {
  if (j >= tokens.length) return null
  const t = tokens[j]![0]
  if ((t === ':' || t === '.' || t === ',') && numero(tokens, j + 1) !== null) return lerVersos(tokens, j + 1)
  const k = t === ',' || t === 'e' ? j + 1 : j
  if (k < tokens.length && PALAVRAS_VERSICULO.has(tokens[k]![0])) return lerVersos(tokens, k + 1)
  if (
    (t === 'do' || t === 'de') &&
    numero(tokens, j + 1) !== null &&
    j + 2 < tokens.length &&
    ['ao', 'a', 'ate'].includes(tokens[j + 2]![0]) &&
    numero(tokens, j + 3) !== null
  ) {
    return lerVersos(tokens, j + 1)
  }
  return null
}

/** N [até M], aceitando "16 a 18", "16-18", "16 e 17", "16, 17 e 18", "16 ao versículo 18". */
function lerVersos(tokens: Token[], j: number): { v1: number; v2: number; fim: number } | null {
  const v1 = numero(tokens, j)
  if (v1 === null || v1 === 0) return null
  let v2 = v1
  j++
  while (j < tokens.length && LIGACAO_FAIXA.has(tokens[j]![0])) {
    let k = j + 1
    if (k < tokens.length && (PALAVRAS_VERSICULO.has(tokens[k]![0]) || tokens[k]![0] === 'o')) k++
    const seguinte = numero(tokens, k)
    if (seguinte === null || seguinte <= v2) break
    v2 = seguinte
    j = k + 1
  }
  return { v1, v2, fim: j }
}

function terminaEmLivro(tokens: Token[]): boolean {
  return NOMES.some(([palavras]) => tokens.length >= palavras.length && casa(tokens, tokens.length - palavras.length, palavras))
}
