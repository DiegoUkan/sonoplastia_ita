/**
 * A Bíblia em memória para as sugestões e a busca por palavras (BM25 com pares de palavras, porta de
 * `busca/lexica.py` e `busca/texto.py`). Os pares pegam citações literais: o pregador lendo um
 * versículo tira nota alta mesmo no meio de 45 s de fala.
 *
 * A busca por tema com vetores (`bge-m3`) do projeto Python não veio: ela ocupava ~2,3 GB de RAM.
 * O tema fica com a IA, que também pode sugerir uma passagem fora dos candidatos (sempre conferida aqui).
 */
import { type ContagemBiblia, type Passagem, passagem } from './passagem'

// palavras sem conteúdo, incluindo vícios de fala de pregação ("né", "gente", "amém")
const STOPWORDS = new Set(
  `a ao aos as ate com como da das de dela dele deles do dos e ela elas ele eles em entre era eram
essa essas esse esses esta estas este estes eu foi for foram ha isso isto ja la lhe lhes mais mas
me mesmo meu minha minhas meus muito na nas nem no nos nossa nossas nosso nossos num numa o os ou
para pela pelas pelo pelos por qual quando que quem se sem ser seu seus sua suas tambem te tem
tinha tu tua tuas teu teus um uma umas uns voce voces vos sao esta estao estava estavam sobre
porque pois so ai aqui ali entao ne tipo gente pra pro pras pros ta to tava vai vou vamos
igreja amem aleluia irmao irmaos irma irmas gloria hoje agora coisa coisas assim olha sabe
dizer disse diz fala falar falou ver vem veio fazer faz fez dia dias vez vezes todo toda todos todas`.split(/\s+/),
)

export function palavras(texto: string): string[] {
  return (
    texto
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .match(/[a-z]+/g) ?? []
  )
}

/** Palavras com conteúdo + pares de palavras seguidas (pegam citações literais). */
export function termos(texto: string): string[] {
  const ps = palavras(texto)
  const r: string[] = []
  for (const p of ps) if (!STOPWORDS.has(p) && p.length > 2) r.push(p)
  for (let i = 0; i + 1 < ps.length; i++) {
    const a = ps[i]!
    const b = ps[i + 1]!
    if (!(STOPWORDS.has(a) && STOPWORDS.has(b))) r.push(`${a}_${b}`)
  }
  return r
}

/** Vetor de inteiros que cresce (os índices da Bíblia têm milhões de entradas). */
class Crescente {
  dados: Int32Array
  n = 0
  constructor(inicial = 1 << 16) {
    this.dados = new Int32Array(inicial)
  }
  push(v: number): void {
    if (this.n === this.dados.length) {
      const novo = new Int32Array(this.dados.length * 2)
      novo.set(this.dados)
      this.dados = novo
    }
    this.dados[this.n++] = v
  }
}

/** BM25 com índice invertido compacto (um par de vetores para todos os termos). */
export class IndiceLexico {
  private readonly ids = new Map<string, number>()
  private tTermo = new Crescente(1 << 20)
  private tDoc = new Crescente(1 << 20)
  private tFreq = new Crescente(1 << 20)
  private tam = new Crescente()
  private inicioTermo = new Int32Array(0)
  private docs = new Int32Array(0)
  private freqs = new Uint16Array(0)
  private tamanhos = new Float32Array(0)
  private idf = new Float32Array(0)
  private media = 1
  n = 0

  constructor(
    private readonly k1 = 1.5,
    private readonly b = 0.75,
  ) {}

  adicionar(termosDoc: string[]): void {
    const cont = new Map<string, number>()
    for (const t of termosDoc) cont.set(t, (cont.get(t) ?? 0) + 1)
    for (const [t, f] of cont) {
      let id = this.ids.get(t)
      if (id === undefined) {
        id = this.ids.size
        this.ids.set(t, id)
      }
      this.tTermo.push(id)
      this.tDoc.push(this.n)
      this.tFreq.push(Math.min(f, 65535))
    }
    this.tam.push(termosDoc.length)
    this.n++
  }

  /** Arruma as listas por termo (chamar depois de adicionar todos os documentos). */
  finalizar(): void {
    const nTermos = this.ids.size
    const total = this.tTermo.n
    const inicio = new Int32Array(nTermos + 1)
    for (let i = 0; i < total; i++) inicio[this.tTermo.dados[i]! + 1]!++
    for (let t = 0; t < nTermos; t++) inicio[t + 1]! += inicio[t]!
    const pos = inicio.slice(0, nTermos)
    const docs = new Int32Array(total)
    const freqs = new Uint16Array(total)
    for (let i = 0; i < total; i++) {
      const t = this.tTermo.dados[i]!
      const p = pos[t]!++
      docs[p] = this.tDoc.dados[i]!
      freqs[p] = this.tFreq.dados[i]!
    }
    this.inicioTermo = inicio
    this.docs = docs
    this.freqs = freqs
    this.tamanhos = Float32Array.from(this.tam.dados.subarray(0, this.tam.n))
    let soma = 0
    for (const x of this.tamanhos) soma += x
    this.media = soma / Math.max(1, this.n) || 1
    this.idf = new Float32Array(nTermos)
    for (let t = 0; t < nTermos; t++) {
      const df = inicio[t + 1]! - inicio[t]!
      this.idf[t] = Math.log(1 + (this.n - df + 0.5) / (df + 0.5))
    }
    // as listas provisórias não servem mais
    this.tTermo = new Crescente(1)
    this.tDoc = new Crescente(1)
    this.tFreq = new Crescente(1)
    this.tam = new Crescente(1)
  }

  pontuar(consulta: string[]): Float32Array {
    const notas = new Float32Array(this.n)
    const cont = new Map<string, number>()
    for (const t of consulta) cont.set(t, (cont.get(t) ?? 0) + 1)
    for (const [termo, qtd] of cont) {
      const t = this.ids.get(termo)
      if (t === undefined) continue
      const peso = this.idf[t]! * (1 + Math.log(qtd))
      for (let p = this.inicioTermo[t]!; p < this.inicioTermo[t + 1]!; p++) {
        const d = this.docs[p]!
        const tf = this.freqs[p]!
        const norma = tf + this.k1 * (1 - this.b + (this.b * this.tamanhos[d]!) / this.media)
        notas[d]! += (peso * tf * (this.k1 + 1)) / norma
      }
    }
    return notas
  }
}

/** Uma linha da Bíblia como vem do banco. */
export interface LinhaVersiculo {
  livro: number
  capitulo: number
  versiculo: number
  texto: string
}

const codigo = (livro: number, capitulo: number, versiculo: number) => livro * 1_000_000 + capitulo * 1000 + versiculo

/** As versões importadas, em memória: texto de cada versículo, quantos versículos tem cada capítulo e o índice de palavras. */
export class BibliaMemoria implements ContagemBiblia {
  private readonly contagem = new Map<number, number>()
  private readonly lexico = new IndiceLexico()

  private constructor(
    readonly siglas: string[],
    private readonly codigos: Int32Array,
    /** [versão][versículo] ('' se a versão não tem o versículo) */
    private readonly textos: string[][],
  ) {
    for (const c of codigos) {
      const k = Math.floor(c / 1000)
      this.contagem.set(k, Math.max(this.contagem.get(k) ?? 0, c % 1000))
    }
  }

  /**
   * Monta a partir das linhas de cada versão. `respirar` cede a vez ao resto do programa de tempos em
   * tempos (o motor dos projetores roda no mesmo processo).
   */
  static async montar(versoes: Array<{ sigla: string; linhas: Iterable<LinhaVersiculo> }>, respirar: () => Promise<void>): Promise<BibliaMemoria> {
    const porVersao: Array<Map<number, string>> = []
    let contador = 0
    for (const v of versoes) {
      const m = new Map<number, string>()
      for (const l of v.linhas) {
        m.set(codigo(l.livro, l.capitulo, l.versiculo), l.texto)
        if (++contador % 3000 === 0) await respirar()
      }
      porVersao.push(m)
    }
    const todos = new Set<number>()
    for (const m of porVersao) for (const k of m.keys()) todos.add(k)
    const codigos = Int32Array.from([...todos].sort((a, b) => a - b))
    const textos = porVersao.map((m) => Array.from(codigos, (c) => m.get(c) ?? ''))
    const b = new BibliaMemoria(
      versoes.map((v) => v.sigla),
      codigos,
      textos,
    )
    // uma linha por versículo com o texto de todas as versões (o pregador pode ler qualquer uma)
    for (let i = 0; i < codigos.length; i++) {
      b.lexico.adicionar(termos(textos.map((t) => t[i]!).join(' ')))
      if (i % 800 === 0) await respirar()
    }
    b.lexico.finalizar()
    return b
  }

  get versiculos(): number {
    return this.codigos.length
  }

  versiculosNoCapitulo(livro: number, capitulo: number): number {
    return this.contagem.get(livro * 1000 + capitulo) ?? 0
  }

  /** índice do versículo (−1 se não existe) */
  private indice(livro: number, capitulo: number, versiculo: number): number {
    const alvo = codigo(livro, capitulo, versiculo)
    let lo = 0
    let hi = this.codigos.length - 1
    while (lo <= hi) {
      const m = (lo + hi) >> 1
      const c = this.codigos[m]!
      if (c === alvo) return m
      if (c < alvo) lo = m + 1
      else hi = m - 1
    }
    return -1
  }

  /** [(versículo, texto)] da passagem numa versão (pelo índice em `siglas`). Capítulo inteiro: todos. */
  texto(p: Passagem, versao: number): Array<[number, string]> {
    const total = this.versiculosNoCapitulo(p.livro, p.capitulo)
    const ini = p.inicio ?? 1
    const fim = Math.min(p.inicio === null ? total : (p.fim ?? p.inicio), total)
    const r: Array<[number, string]> = []
    for (let v = ini; v <= fim; v++) {
      const i = this.indice(p.livro, p.capitulo, v)
      const t = i >= 0 ? this.textos[versao]?.[i] : ''
      if (t) r.push([v, t])
    }
    return r
  }

  /** Busca por palavras. `textos[0]` é a fala inteira; os outros, os trechos mais recentes. */
  buscar(textos: string[], n = 20): Candidato[] {
    if (!textos.length || !textos[0]!.trim()) return []
    // a maior nota entre a janela e os trechos recentes (uma citação no meio de 45 s de fala some
    // na janela inteira, mas aparece forte no trecho em que foi dita)
    let lexica: Float32Array | null = null
    for (const t of textos) {
      const x = this.lexico.pontuar(termos(t))
      if (!lexica) lexica = x
      else for (let i = 0; i < x.length; i++) if (x[i]! > lexica[i]!) lexica[i] = x[i]!
    }
    const notas = lexica!
    // os n melhores, do maior para o menor (só os que têm alguma palavra em comum)
    const melhores: number[] = []
    for (let i = 0; i < notas.length; i++) {
      const v = notas[i]!
      if (v <= 0 || (melhores.length === n && v <= notas[melhores[n - 1]!]!)) continue
      let k = melhores.length
      while (k > 0 && notas[melhores[k - 1]!]! < v) k--
      melhores.splice(k, 0, i)
      if (melhores.length > n) melhores.pop()
    }
    return melhores.map((i) => {
      const c = this.codigos[i]!
      const l = notas[i]!
      return { passagem: passagem(Math.floor(c / 1_000_000), Math.floor(c / 1000) % 1000, c % 1000), lexica: l, nota: notaDaLexica(l) }
    })
  }
}

/** Nota BM25 típica de uma citação literal de 6+ palavras. */
const LEXICA_CITACAO = 50
const PESO_LEXICA = 2
/** Sem a busca por tema, a nota é só o bônus de palavras (0 a 4), como no projeto Python sem vetores. */
export const notaDaLexica = (lexica: number) => Math.min(lexica / LEXICA_CITACAO, 2) * PESO_LEXICA

export interface Candidato {
  passagem: Passagem
  nota: number
  /** nota BM25 */
  lexica: number
}

/** Junta versículos seguidos do mesmo capítulo (Fp 4:6 + 4:7 → Fp 4:6-7), mantendo a ordem. */
export function agruparVizinhos(candidatos: Candidato[], maximo = 3): Candidato[] {
  const saida: Candidato[] = []
  const usados = new Set<number>()
  for (let i = 0; i < candidatos.length; i++) {
    if (usados.has(i)) continue
    const c = candidatos[i]!
    const p = c.passagem
    let ini = p.inicio!
    let fim = p.fim!
    let mudou = true
    while (mudou) {
      mudou = false
      candidatos.forEach((o, j) => {
        const q = o.passagem
        if (usados.has(j) || j === i || q.livro !== p.livro || q.capitulo !== p.capitulo) return
        if (q.inicio === fim + 1 || q.fim === ini - 1) {
          ini = Math.min(ini, q.inicio!)
          fim = Math.max(fim, q.fim!)
          usados.add(j)
          mudou = true
        }
      })
    }
    saida.push({ ...c, passagem: passagem(p.livro, p.capitulo, ini, fim) })
    if (saida.length === maximo) break
  }
  return saida
}
