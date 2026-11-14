/** Monta o conteúdo de um versículo para as saídas (dividido em telas quando é longo). */
import type { ConfigBiblia } from '../config'
import type { Conteudo } from '../estado'
import { dividirTexto } from '../texto'
import { formatarReferencia } from './referencia'

export interface PedidoVersiculo {
  livro: number
  capitulo: number
  versiculo: number
  texto: string
  /** parte do versículo (os longos viram mais de uma tela); fora do intervalo vira a primeira/última */
  parte: number
  sigla: string
  cfg: ConfigBiblia
  /** o mesmo versículo na segunda versão, se houver */
  segundo?: { sigla: string; texto: string } | null
}

export function conteudoDoVersiculo(p: PedidoVersiculo): { conteudo: Extract<Conteudo, { tipo: 'versiculo' }>; parte: number; partes: number } {
  const partes = dividirTexto(p.texto, p.cfg.maxCaracteres)
  const n = Math.max(1, partes.length)
  const parte = Math.min(Math.max(p.parte, 0), n - 1)
  let t = partes[parte] ?? ''
  if (p.cfg.mostrarNumero && parte === 0) t = `${p.versiculo} ${t}`
  const sufixoParte = partes.length > 1 ? ` (${parte + 1}/${partes.length})` : ''
  const sufixoSigla = p.cfg.siglaNaReferencia ? ` (${p.sigla})` : ''
  const referencia = `${formatarReferencia(p.livro, p.capitulo, p.versiculo)}${sufixoParte}${sufixoSigla}`
  const segundo = p.segundo ? { texto: p.segundo.texto, referencia: `(${p.segundo.sigla})` } : null
  return { conteudo: { tipo: 'versiculo', texto: t, referencia, segundo }, parte, partes: n }
}
