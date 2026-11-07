/**
 * Entende referências digitadas: "jo 3 16", "joão 3:16-18", "1 co 13 4 a 7", "sl 23", "1co13.4",
 * "cantares 2", "primeira aos coríntios 13". Texto que não é referência vira busca por palavras.
 */
import { semAcento } from '../texto'
import { acharLivros, type Livro, LIVROS } from './livros'

export interface Referencia {
  livro: number
  /** null quando só o livro foi digitado */
  capitulo: number | null
  inicio: number | null
  fim: number | null
}

export type ResultadoReferencia =
  | { tipo: 'vazio' }
  | { tipo: 'referencia'; ref: Referencia }
  | { tipo: 'ambiguo'; livros: Livro[] }
  | { tipo: 'texto' }

const NUMERO_DO_LIVRO: Record<string, string> = {
  '1': '1',
  '2': '2',
  '3': '3',
  i: '1',
  ii: '2',
  iii: '3',
  primeira: '1',
  primeiro: '1',
  segunda: '2',
  segundo: '2',
  terceira: '3',
  terceiro: '3',
}

export function interpretarReferencia(entrada: string): ResultadoReferencia {
  const bruto = entrada.trim()
  if (!bruto) return { tipo: 'vazio' }
  // "Jó" com acento é o livro de Jó; "jo" sem acento é João (abreviação mais usada)
  const ehJo = /^j[óò](?![a-zà-ü])/i.test(bruto)

  let t = semAcento(bruto)
    .toLowerCase()
    .replace(/[:.,;]/g, ' ')
    .replace(/\s*-\s*/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim()

  // número do livro: algarismo pode vir colado ("1co"); romano e por extenso só separados
  // ("i co", "primeira aos corintios"), para não confundir com "isaias"
  let prefixo = ''
  const mNum = /^(?:([123])\s*|(iii|ii|i|primeir[ao]|segund[ao]|terceir[ao])\s+)(?=[a-z])/.exec(t)
  if (mNum) {
    prefixo = NUMERO_DO_LIVRO[mNum[1] ?? mNum[2]!] ?? ''
    t = t.slice(mNum[0].length).replace(/^(aos|ao|a)\s+/, '')
  }

  const m = /^([a-z]+(?: [a-z]+)*?)\s*(?:(\d+)(?:\s+(\d+))?(?:\s*(?:-|a|ate)\s*(\d+))?)?$/.exec(t)
  if (!m) return { tipo: 'texto' }

  const palavras = m[1]!.replace(/ /g, '')
  let livros: Livro[]
  if (ehJo && !prefixo) livros = [LIVROS[17]!]
  else livros = acharLivros(prefixo + palavras)
  if (livros.length === 0) return { tipo: 'texto' }
  if (livros.length > 1) return { tipo: 'ambiguo', livros }

  const capitulo = m[2] ? Number(m[2]) : null
  let inicio = m[3] ? Number(m[3]) : null
  let fim = m[4] ? Number(m[4]) : null
  if (inicio === null && fim !== null) {
    // "sl 23 - 25" sem versículo: intervalo de capítulos não é suportado; fica no primeiro
    fim = null
  }
  if (inicio !== null && fim !== null && fim < inicio) [inicio, fim] = [fim, inicio]
  if (capitulo === 0 || inicio === 0) return { tipo: 'texto' }
  return { tipo: 'referencia', ref: { livro: livros[0]!.n, capitulo, inicio, fim } }
}

/** "João 3:16", "João 3:16-18", "Salmos 23" */
export function formatarReferencia(livroN: number, capitulo: number, inicio?: number | null, fim?: number | null): string {
  const nome = LIVROS[livroN - 1]?.nome ?? '?'
  if (!inicio) return `${nome} ${capitulo}`
  return `${nome} ${capitulo}:${inicio}${fim && fim !== inicio ? `-${fim}` : ''}`
}
