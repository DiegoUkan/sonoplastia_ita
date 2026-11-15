/**
 * Download de um arquivo do site direto para o disco (sem carregar na memória: os vídeos passam de
 * 800 MB), num arquivo ".part". Se cair no meio, a próxima tentativa continua de onde parou
 * (Range + If-Range com o ETag da primeira resposta). Sem dado nenhum por um tempo, desiste.
 */
import { createWriteStream, promises as fsp, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as StreamWeb } from 'node:stream/web'

/** `fetch` (o `net.fetch` do Electron no programa; o do Node nos testes). */
export type Buscar = (url: string, init?: RequestInit) => Promise<Response>

export const AGENTE = 'SonoplastiaItaqui/1.0'

/** Resposta HTTP que não é o arquivo (404 = saiu do site). */
export class ErroHttp extends Error {
  constructor(
    readonly status: number,
    mensagem: string,
  ) {
    super(mensagem)
  }
}

export interface PedidoDownload {
  buscar: Buscar
  url: string
  /** arquivo ".part" (o ETag fica ao lado, em ".part.etag") */
  parcial: string
  /** tamanho esperado; 0 = desconhecido */
  tamanho: number
  /** desiste depois de tanto tempo sem receber nada (ms) */
  inativoMs?: number
  sinal?: AbortSignal
  aoProgresso?: (baixado: number, total: number) => void
}

function tamanhoDe(caminho: string): number {
  try {
    return statSync(caminho).size
  } catch {
    return 0
  }
}

/** Apaga o ".part" e o ETag dele. */
export function descartarParcial(parcial: string): void {
  rmSync(parcial, { force: true })
  rmSync(`${parcial}.etag`, { force: true })
}

/** Baixa (ou termina de baixar) e devolve o tamanho final do ".part". */
export async function baixarArquivo(p: PedidoDownload): Promise<number> {
  const arquivoEtag = `${p.parcial}.etag`
  let inicio = tamanhoDe(p.parcial)
  let etag: string | null = null
  try {
    etag = readFileSync(arquivoEtag, 'utf8').trim() || null
  } catch {
    // sem ETag guardado
  }
  // já está completo (de uma passada anterior que não conseguiu pôr na biblioteca)
  if (p.tamanho > 0 && inicio === p.tamanho) return inicio
  // maior que o esperado ou sem como conferir a continuação: começa de novo
  if ((p.tamanho > 0 && inicio > p.tamanho) || !etag) inicio = 0

  const ctrl = new AbortController()
  const desistir = () => ctrl.abort()
  p.sinal?.addEventListener('abort', desistir)
  const inativo = p.inativoMs ?? 60_000
  let relogio = setTimeout(desistir, inativo)
  const renovar = () => {
    clearTimeout(relogio)
    relogio = setTimeout(desistir, inativo)
  }
  try {
    const headers: Record<string, string> = { 'User-Agent': AGENTE, Accept: '*/*' }
    if (inicio > 0 && etag) {
      headers.Range = `bytes=${inicio}-`
      headers['If-Range'] = etag
    }
    let r: Response
    try {
      r = await p.buscar(p.url, { headers, signal: ctrl.signal })
    } catch (e) {
      if (ctrl.signal.aborted) throw new Error(p.sinal?.aborted ? 'Download cancelado.' : 'O site parou de responder.')
      throw new Error(`Não foi possível falar com o site (${e instanceof Error ? e.message : e}).`)
    }
    if (r.status === 404 || r.status === 410) throw new ErroHttp(r.status, 'O arquivo não está mais no site.')
    if (r.status === 416) {
      // o pedaço que faltava não existe (o arquivo mudou): recomeça do zero na próxima tentativa
      descartarParcial(p.parcial)
      throw new ErroHttp(416, 'O arquivo mudou no site durante o download. Ele será baixado de novo.')
    }
    let anexar = false
    if (r.status === 206 && inicio > 0) {
      const m = /^bytes\s+(\d+)-/i.exec(r.headers.get('content-range') ?? '')
      if (!m || Number(m[1]) !== inicio) throw new ErroHttp(206, 'O site mandou um pedaço diferente do pedido.')
      anexar = true
    } else if (r.status === 200) {
      inicio = 0
      const novo = r.headers.get('etag')
      if (novo) writeFileSync(arquivoEtag, novo, 'utf8')
      else rmSync(arquivoEtag, { force: true })
    } else {
      throw new ErroHttp(r.status, `O site respondeu ${r.status} ao baixar o arquivo.`)
    }
    if (/text\/html/i.test(r.headers.get('content-type') ?? '')) throw new ErroHttp(r.status, 'O site mandou uma página no lugar do arquivo.')
    if (!r.body) throw new ErroHttp(r.status, 'O site respondeu sem o arquivo.')

    const total = p.tamanho || inicio + (Number(r.headers.get('content-length')) || 0)
    let baixado = inicio
    const contar = new Transform({
      transform(pedaco: Buffer, _cod, feito) {
        baixado += pedaco.length
        renovar()
        p.aoProgresso?.(baixado, total)
        feito(null, pedaco)
      },
    })
    try {
      await pipeline(Readable.fromWeb(r.body as unknown as StreamWeb), contar, createWriteStream(p.parcial, { flags: anexar ? 'a' : 'w' }))
    } catch (e) {
      if (ctrl.signal.aborted) throw new Error(p.sinal?.aborted ? 'Download cancelado.' : 'O download parou no meio (o site parou de mandar). Continua na próxima tentativa.')
      throw new Error(`O download parou no meio (${e instanceof Error ? e.message : e}). Continua na próxima tentativa.`)
    }
    const final = (await fsp.stat(p.parcial)).size
    if (p.tamanho > 0 && final !== p.tamanho) {
      descartarParcial(p.parcial)
      throw new Error(`O arquivo chegou com ${final} bytes, mas o site disse ${p.tamanho}. Ele foi descartado e será baixado de novo.`)
    }
    return final
  } finally {
    clearTimeout(relogio)
    p.sinal?.removeEventListener('abort', desistir)
  }
}
