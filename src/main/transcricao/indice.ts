/**
 * Busca por palavras na Bíblia inteira (todas as versões juntas), na memória, para a Bíblia automática:
 * acha os versículos parecidos com a fala para a IA escolher. BM25 com as palavras de conteúdo; entre
 * os melhores, conta os pares de palavras seguidas, e a leitura literal sobe para o topo.
 *
 * Porta simplificada de `busca/lexica.py` + `buscador.py` do projeto de transcrição, sem a busca por tema
 * com vetores (o modelo bge-m3 ocupa ~2,3 GB de memória, pesado demais para o PC da igreja): o tema fica
 * com a IA, que conhece a Bíblia.
 */
import { type Cobertura, cobertura, conjuntoDePares, termosDe } from '../../shared/transcricao/texto'
import { respirar } from '../banco'

export interface FonteIndice {
  versiculosDoLivro(livro: number): Array<{ capitulo: number; versiculo: number; texto: string }>
}

export interface Candidato {
  livro: number
  capitulo: number
  versiculo: number
  /** nota final (palavras + pares) */
  nota: number
  /** nota BM25 só das palavras */
  lexica: number
  /** quanto do versículo foi dito com as mesmas palavras (melhor versão) */
  cobertura: Cobertura
}

const K1 = 1.5
const B = 0.75
/** quantos dos melhores por palavras são conferidos pelos pares */
const CONFERIR = 40
/** peso de cada par de palavras igual (leitura literal) */
const PESO_PAR = 4

interface Lista {
  docs: Int32Array
  tf: Uint16Array
  idf: number
}

export class IndiceBiblia {
  private constructor(
    /** livro * 1_000_000 + capítulo * 1_000 + versículo, na ordem da Bíblia */
    private readonly chaves: Int32Array,
    private readonly tamanhos: Float32Array,
    private readonly media: number,
    private readonly listas: Map<string, Lista>,
  ) {}

  get versiculos(): number {
    return this.chaves.length
  }

  /** Monta livro a livro, cedendo a vez entre eles (o programa não trava). ~1 s para duas versões. */
  static async montar(fonte: FonteIndice): Promise<IndiceBiblia> {
    const chaves: number[] = []
    const tamanhos: number[] = []
    const docs = new Map<string, number[]>()
    const tfs = new Map<string, number[]>()
    for (let livro = 1; livro <= 66; livro++) {
      const linhas = fonte.versiculosDoLivro(livro)
      let i = 0
      while (i < linhas.length) {
        const { capitulo, versiculo } = linhas[i]!
        // as versões do mesmo versículo vêm juntas (ordem por capítulo e versículo)
        const textos: string[] = []
        while (i < linhas.length && linhas[i]!.capitulo === capitulo && linhas[i]!.versiculo === versiculo) textos.push(linhas[i++]!.texto)
        const termos = termosDe(textos.join(' '))
        const doc = chaves.length
        chaves.push(livro * 1_000_000 + capitulo * 1_000 + versiculo)
        tamanhos.push(termos.length)
        const contagem = new Map<string, number>()
        for (const t of termos) contagem.set(t, (contagem.get(t) ?? 0) + 1)
        for (const [t, n] of contagem) {
          let d = docs.get(t)
          if (!d) {
            d = []
            docs.set(t, d)
            tfs.set(t, [])
          }
          d.push(doc)
          tfs.get(t)!.push(n)
        }
      }
      await respirar()
    }
    const total = chaves.length
    const listas = new Map<string, Lista>()
    for (const [t, d] of docs) {
      listas.set(t, { docs: Int32Array.from(d), tf: Uint16Array.from(tfs.get(t)!), idf: Math.log(1 + (total - d.length + 0.5) / (d.length + 0.5)) })
    }
    const tam = Float32Array.from(tamanhos)
    const media = total ? tamanhos.reduce((a, b) => a + b, 0) / total : 1
    return new IndiceBiblia(Int32Array.from(chaves), tam, media || 1, listas)
  }

  private pontuar(texto: string, notas: Float32Array): void {
    const contagem = new Map<string, number>()
    for (const t of termosDe(texto)) contagem.set(t, (contagem.get(t) ?? 0) + 1)
    const parcial = new Float32Array(notas.length)
    for (const [t, qtd] of contagem) {
      const l = this.listas.get(t)
      if (!l) continue
      const peso = l.idf * (1 + Math.log(qtd))
      for (let k = 0; k < l.docs.length; k++) {
        const d = l.docs[k]!
        const tf = l.tf[k]!
        parcial[d] += (peso * tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * this.tamanhos[d]!) / this.media))
      }
    }
    for (let d = 0; d < notas.length; d++) if (parcial[d]! > notas[d]!) notas[d] = parcial[d]!
  }

  /**
   * `textos[0]` é a fala analisada inteira; os outros, trechos recentes (uma citação no meio de 40 s de
   * fala some na janela inteira, mas aparece forte no trecho em que foi dita). `textosDe` devolve o
   * versículo em cada versão (para contar os pares de palavras).
   */
  buscar(textos: string[], n: number, textosDe: (livro: number, capitulo: number, versiculo: number) => string[]): Candidato[] {
    if (!textos.length || !textos[0]!.trim() || !this.chaves.length) return []
    const notas = new Float32Array(this.chaves.length)
    for (const t of textos) this.pontuar(t, notas)
    const comNota: number[] = []
    for (let d = 0; d < notas.length; d++) if (notas[d]! > 0) comNota.push(d)
    comNota.sort((a, b) => notas[b]! - notas[a]!)
    const pares = conjuntoDePares(textos.join(' '))
    const candidatos = comNota.slice(0, CONFERIR).map((d): Candidato => {
      const k = this.chaves[d]!
      const livro = Math.floor(k / 1_000_000)
      const capitulo = Math.floor((k % 1_000_000) / 1_000)
      const versiculo = k % 1_000
      let melhor: Cobertura = { pares: 0, total: 0, fracao: 0 }
      for (const texto of textosDe(livro, capitulo, versiculo)) {
        const c = cobertura(texto, pares)
        if (c.pares > melhor.pares || (c.pares === melhor.pares && c.fracao > melhor.fracao)) melhor = c
      }
      return { livro, capitulo, versiculo, lexica: notas[d]!, cobertura: melhor, nota: notas[d]! + PESO_PAR * melhor.pares }
    })
    return candidatos.sort((a, b) => b.nota - a.nota).slice(0, n)
  }
}

/** Junta versículos seguidos do mesmo capítulo (Fp 4:6 + 4:7 → Fp 4:6-7), mantendo a ordem. */
export function agruparVizinhos(cands: Candidato[], maximo: number): Array<Candidato & { fim: number }> {
  const saida: Array<Candidato & { fim: number }> = []
  const usados = new Set<number>()
  cands.forEach((c, i) => {
    if (usados.has(i) || saida.length >= maximo) return
    let inicio = c.versiculo
    let fim = c.versiculo
    let mudou = true
    while (mudou) {
      mudou = false
      cands.forEach((o, j) => {
        if (usados.has(j) || j === i || o.livro !== c.livro || o.capitulo !== c.capitulo) return
        if (o.versiculo === fim + 1 || o.versiculo === inicio - 1) {
          inicio = Math.min(inicio, o.versiculo)
          fim = Math.max(fim, o.versiculo)
          usados.add(j)
          mudou = true
        }
      })
    }
    saida.push({ ...c, versiculo: inicio, fim })
  })
  return saida
}
