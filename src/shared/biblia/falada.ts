/**
 * Referências bíblicas FALADAS (a transcrição do pregador): "Romanos 8", "João capítulo três,
 * versículo dezesseis", "primeira aos Coríntios 13", "Salmo 23", "Gênesis 1 do 1 ao 3",
 * "Filipenses 4, 6 e 7". Também entende "versículo 17" (ou "capítulo 4") logo depois de uma
 * referência, usando o livro e o capítulo citados antes.
 *
 * Porta de `refs/parser.py` e `refs/numeros.py` do projeto de transcrição (mesmos casos de teste).
 * Diferente de `referencia.ts`, que entende o que o operador DIGITA ("jo 3 16").
 */
import { LIVROS } from './livros'

/** Um versículo, uma sequência do mesmo capítulo ou o capítulo inteiro (`inicio` nulo). */
export interface Passagem {
  livro: number
  capitulo: number
  inicio: number | null
  fim: number | null
}

/** Quantos versículos tem cada capítulo (0 = o capítulo não existe). */
export interface TamanhosBiblia {
  versiculosNoCapitulo(livro: number, capitulo: number): number
}

/** Ajusta o fim ao tamanho do capítulo; null se a referência não existe. */
export function validarPassagem(t: TamanhosBiblia, p: Passagem): Passagem | null {
  const total = t.versiculosNoCapitulo(p.livro, p.capitulo)
  if (!total) return null
  if (p.inicio === null) return { ...p, fim: null }
  if (p.inicio < 1 || p.inicio > total) return null
  return { ...p, fim: Math.min(Math.max(p.fim ?? p.inicio, p.inicio), total) }
}

export function sobrepoe(a: Passagem, b: Passagem): boolean {
  if (a.livro !== b.livro || a.capitulo !== b.capitulo) return false
  if (a.inicio === null || b.inicio === null) return true
  return a.inicio <= (b.fim ?? b.inicio) && b.inicio <= (a.fim ?? a.inicio)
}

export const mesmaPassagem = (a: Passagem, b: Passagem) =>
  a.livro === b.livro && a.capitulo === b.capitulo && a.inicio === b.inicio && (a.fim ?? a.inicio) === (b.fim ?? b.inicio)

/** "Jo 3:16", "Fp 4:6-7", "Sl 23" (curta, para a IA) */
export function referenciaCurta(p: Passagem): string {
  const sigla = LIVROS[p.livro - 1]?.abrev ?? '?'
  if (p.inicio === null) return `${sigla} ${p.capitulo}`
  const fim = p.fim ?? p.inicio
  return `${sigla} ${p.capitulo}:${p.inicio}${fim !== p.inicio ? `-${fim}` : ''}`
}

// ------------------------------------------------------------------ números por extenso

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
const CLASSE: Record<string, number> = {
  ...Object.fromEntries(Object.keys(UNIDADES).map((p) => [p, 0])),
  ...Object.fromEntries(Object.keys(DEZ_A_DEZENOVE).map((p) => [p, 1])),
  ...Object.fromEntries(Object.keys(DEZENAS).map((p) => [p, 2])),
  ...Object.fromEntries(Object.keys(CENTENAS).map((p) => [p, 3])),
}
const VALOR: Record<string, number> = { ...UNIDADES, ...DEZ_A_DEZENOVE, ...DEZENAS, ...CENTENAS }
/** também são artigos: "um dia", "uma palavra" */
const FRACOS = new Set(['um', 'uma'])

/** [palavra, veio de "um"/"uma"] */
export type Token = [string, boolean]

/** Troca sequências por extenso pelo número ("cento e dezenove" → "119"). */
export function converterNumeros(palavras: string[]): Token[] {
  const saida: Token[] = []
  let i = 0
  while (i < palavras.length) {
    const p = palavras[i]!
    if (!(p in VALOR)) {
      saida.push([p, false])
      i++
      continue
    }
    let total = VALOR[p]!
    let classe = CLASSE[p]!
    let fraco = FRACOS.has(p)
    let j = i + 1
    // "cento e vinte e três": continua enquanto vier "e" + palavra de classe menor
    while (j + 1 < palavras.length && palavras[j] === 'e' && palavras[j + 1]! in VALOR) {
      const seguinte = palavras[j + 1]!
      if (CLASSE[seguinte]! >= classe || classe === 1 || (classe === 2 && CLASSE[seguinte] !== 0)) break
      total += VALOR[seguinte]!
      classe = CLASSE[seguinte]!
      fraco = false
      j += 2
    }
    saida.push([String(total), fraco])
    i = j
  }
  return saida
}

// ------------------------------------------------------------------ nomes falados dos livros

/**
 * [número do livro, número no nome (1, 2, 3) ou null, formas faladas em minúsculas e sem acento].
 * Livros numerados guardam só o nome-base; "primeira aos", "segundo", "1", "I" ficam com o leitor.
 * "Jó" vira "job" antes de tirar os acentos, para não confundir com "jo" (João).
 */
const NOMES_FALADOS: Array<[number, number | null, string[]]> = [
  [1, null, ['genesis']],
  [2, null, ['exodo']],
  [3, null, ['levitico']],
  [4, null, ['numeros']],
  [5, null, ['deuteronomio']],
  [6, null, ['josue']],
  [7, null, ['juizes']],
  [8, null, ['rute']],
  [9, 1, ['samuel']],
  [10, 2, ['samuel']],
  [11, 1, ['reis']],
  [12, 2, ['reis']],
  [13, 1, ['cronicas']],
  [14, 2, ['cronicas']],
  [15, null, ['esdras']],
  [16, null, ['neemias']],
  [17, null, ['ester']],
  [18, null, ['job']],
  [19, null, ['salmos', 'salmo', 'sl']],
  [20, null, ['proverbios', 'pv']],
  [21, null, ['eclesiastes']],
  [22, null, ['cantares de salomao', 'cantico dos canticos', 'canticos', 'cantares']],
  [23, null, ['isaias']],
  [24, null, ['jeremias']],
  [25, null, ['lamentacoes de jeremias', 'lamentacoes']],
  [26, null, ['ezequiel']],
  [27, null, ['daniel']],
  [28, null, ['oseias', 'oseas']],
  [29, null, ['joel']],
  [30, null, ['amos']],
  [31, null, ['obadias']],
  [32, null, ['jonas']],
  [33, null, ['miqueias']],
  [34, null, ['naum']],
  [35, null, ['habacuque', 'abacuque']],
  [36, null, ['sofonias']],
  [37, null, ['ageu']],
  [38, null, ['zacarias']],
  [39, null, ['malaquias']],
  [40, null, ['mateus']],
  [41, null, ['marcos']],
  [42, null, ['lucas']],
  [43, null, ['evangelho de joao', 'joao', 'jo']],
  [44, null, ['atos dos apostolos', 'atos']],
  [45, null, ['romanos']],
  [46, 1, ['corintios']],
  [47, 2, ['corintios']],
  [48, null, ['galatas']],
  [49, null, ['efesios']],
  [50, null, ['filipenses']],
  [51, null, ['colossenses']],
  [52, 1, ['tessalonicenses']],
  [53, 2, ['tessalonicenses']],
  [54, 1, ['timoteo']],
  [55, 2, ['timoteo']],
  [56, null, ['tito']],
  [57, null, ['filemom', 'filemon']],
  [58, null, ['hebreus']],
  [59, null, ['tiago']],
  [60, 1, ['pedro']],
  [61, 2, ['pedro']],
  [62, 1, ['joao']],
  [63, 2, ['joao']],
  [64, 3, ['joao']],
  [65, null, ['judas']],
  [66, null, ['apocalipse']],
]

interface LivroFalado {
  n: number
  numero: number | null
}

/** (palavras do nome, livros com esse nome), do nome mais longo para o mais curto */
const NOMES: Array<[string[], LivroFalado[]]> = (() => {
  const porNome = new Map<string, LivroFalado[]>()
  for (const [n, numero, nomes] of NOMES_FALADOS) {
    for (const nome of nomes) {
      const l = porNome.get(nome) ?? []
      l.push({ n, numero })
      porNome.set(nome, l)
    }
  }
  return [...porNome.entries()].map(([nome, l]): [string[], LivroFalado[]] => [nome.split(' '), l]).sort((a, b) => b[0].length - a[0].length)
})()

const chaveLivro = (t: string) =>
  t
    .normalize('NFC')
    .toLowerCase()
    .replace(/jó/g, 'job')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]/g, '')

/** "Fp", "Filipenses", "1 Coríntios", "1Co", "Salmo", "Jó", "jo" → número do livro (null se não reconhecer). */
const RESOLVEDOR: Map<string, number> = (() => {
  const m = new Map<string, number>()
  const por = (forma: string, n: number) => {
    const k = chaveLivro(forma)
    if (k && !m.has(k)) m.set(k, n)
  }
  // "Jó" (com acento) primeiro: "jo" sem acento continua sendo João
  por('Jó', 18)
  for (const l of LIVROS) {
    por(l.nome, l.n)
    por(l.abrev, l.n)
  }
  for (const [n, numero, nomes] of NOMES_FALADOS) {
    const prefixos = numero ? [String(numero), 'i'.repeat(numero)] : ['']
    for (const nome of nomes) for (const p of prefixos) por(p + nome, n)
  }
  for (const l of LIVROS) for (const k of l.chaves) if (!m.has(k)) m.set(k, l.n)
  return m
})()

export function resolverLivro(texto: string): number | null {
  return RESOLVEDOR.get(chaveLivro(texto)) ?? null
}

// ------------------------------------------------------------------ leitor

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
/** "versículo 17" usa o capítulo citado nos últimos 5 minutos */
export const CONTEXTO_VALE_MS = 300_000

export interface Achado {
  passagem: Passagem
  /** posição (token) onde a referência começa e logo depois do fim */
  inicio: number
  fim: number
  /** false quando usou o livro/capítulo citado antes ("versículo 17") */
  explicita: boolean
}

export function tokensDaFala(texto: string): Token[] {
  let t = texto.normalize('NFC').toLowerCase()
  t = t.replace(/(?<![\p{L}\p{N}])jó(?![\p{L}\p{N}])/gu, 'job')
  t = t.replace(/\bevangelho segundo\b/g, 'evangelho de')
  t = t.normalize('NFKD').replace(/\p{M}/gu, '')
  const palavras = t.match(/\d+|[a-z]+|[:\-–,.]/g) ?? []
  return converterNumeros(palavras.map((p) => (p === '–' ? '-' : p)))
}

const casa = (tokens: Token[], i: number, palavras: string[]) => palavras.every((p, k) => tokens[i + k]?.[0] === p)
const numero = (tokens: Token[], i: number): number | null => (i < tokens.length && /^\d+$/.test(tokens[i]![0]) ? Number(tokens[i]![0]) : null)
const vemVersiculo = (tokens: Token[], j: number) => j >= tokens.length || PALAVRAS_VERSICULO.has(tokens[j]![0]) || [':', ',', '.'].includes(tokens[j]![0])

/** N [até M]: "16 a 18", "16-18", "16 e 17", "16, 17 e 18", "16 ao versículo 18" */
function lerVersos(tokens: Token[], j: number): [number, number, number] | null {
  const v1 = numero(tokens, j)
  if (!v1) return null
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
  return [v1, v2, j]
}

/** ":16", ", 16", "versículo 16", ", versículo 16", "do 1 ao 3", "de 1 a 3" */
function parteDosVersos(tokens: Token[], j: number): [number, number, number] | null {
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

/** Depois do nome do livro: [,] [capítulo] N [parte dos versículos]. */
function lerCapituloEVersos(tokens: Token[], j: number): [number, number | null, number | null, number] | null {
  let depoisDeCapitulo = false
  while (j < tokens.length && (PALAVRAS_CAPITULO.has(tokens[j]![0]) || tokens[j]![0] === ',')) {
    depoisDeCapitulo ||= PALAVRAS_CAPITULO.has(tokens[j]![0])
    j++
  }
  const capitulo = numero(tokens, j)
  if (!capitulo) return null
  // "João um dia disse..." não é João 1
  if (tokens[j]![1] && !depoisDeCapitulo && !vemVersiculo(tokens, j + 1)) return null
  j++
  const versos = parteDosVersos(tokens, j)
  if (!versos) return [capitulo, null, null, j]
  return [capitulo, versos[0], versos[1], versos[2]]
}

function terminaEmLivro(tokens: Token[]): boolean {
  return NOMES.some(([palavras]) => tokens.length >= palavras.length && casa(tokens, tokens.length - palavras.length, palavras))
}

/** Lê os trechos da transcrição em ordem e lembra o último livro/capítulo citado. */
export class Rastreador {
  private ultimo: { livro: number; capitulo: number } | null = null
  private ultimoEm = 0
  /** fim do trecho anterior, se ficou um nome de livro solto ("…vamos abrir em Romanos" | "capítulo oito") */
  private cauda: Token[] = []

  constructor(private readonly biblia: TamanhosBiblia) {}

  processar(texto: string, agora = Date.now()): Achado[] {
    if (this.ultimo && agora - this.ultimoEm > CONTEXTO_VALE_MS) this.ultimo = null
    const tokens = [...this.cauda, ...tokensDaFala(texto)]
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
    // o Whisper fecha cada trecho com ponto ("…comigo em Filipenses." | "Capítulo 4, versículo 6."):
    // a pontuação do fim não esconde o livro
    const semPontuacao = [...tokens]
    while (semPontuacao.length && [':', '-', ',', '.'].includes(semPontuacao.at(-1)![0])) semPontuacao.pop()
    this.cauda = semPontuacao.length && terminaEmLivro(semPontuacao) ? semPontuacao.slice(-4) : []
    return achados
  }

  private livroEm(tokens: Token[], i: number): Achado | null {
    const t = tokens[i]![0]
    // livros numerados primeiro: "primeira aos coríntios 13"
    if (t in ORDINAIS) {
      const num = ORDINAIS[t]!
      let j = i + 1
      while (j < tokens.length && LIGACAO_ORDINAL.has(tokens[j]![0]) && j - i <= 3) j++
      for (const [palavras, livros] of NOMES) {
        if (!casa(tokens, j, palavras)) continue
        const l = livros.find((x) => x.numero === num)
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
    const [capitulo, v1, v2, fim] = lido
    const passagem = validarPassagem(this.biblia, { livro, capitulo, inicio: v1, fim: v2 })
    return passagem ? { passagem, inicio, fim, explicita: true } : null
  }

  private contextoEm(tokens: Token[], i: number): Achado | null {
    if (!this.ultimo) return null
    const { livro } = this.ultimo
    const palavra = tokens[i]![0]
    let passagem: Passagem | null = null
    let fim = i
    if (PALAVRAS_VERSICULO.has(palavra) && palavra !== 'v') {
      const lido = lerVersos(tokens, i + 1)
      if (!lido) return null
      passagem = validarPassagem(this.biblia, { livro, capitulo: this.ultimo.capitulo, inicio: lido[0], fim: lido[1] })
      fim = lido[2]
    } else if (PALAVRAS_CAPITULO.has(palavra)) {
      const lido = lerCapituloEVersos(tokens, i)
      if (!lido) return null
      passagem = validarPassagem(this.biblia, { livro, capitulo: lido[0], inicio: lido[1], fim: lido[2] })
      fim = lido[3]
    } else {
      return null
    }
    return passagem ? { passagem, inicio: i, fim, explicita: false } : null
  }
}

/** Atalho sem contexto entre chamadas. */
export function encontrarReferencias(texto: string, biblia: TamanhosBiblia): Passagem[] {
  return new Rastreador(biblia).processar(texto).map((a) => a.passagem)
}
