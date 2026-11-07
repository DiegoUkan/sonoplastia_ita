import { protocol } from 'electron'
import { createReadStream, promises as fsp } from 'node:fs'
import { extname, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import { caminhoDaUrlMidia, ESQUEMA_MIDIA, urlMidia } from '../shared/midia'

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
}

/** Só servimos arquivos dentro das pastas permitidas ou escolhidos pelo operador. */
const arquivosPermitidos = new Set<string>()
const raizesPermitidas: string[] = []

const normalizar = (p: string) => resolve(p).toLowerCase()

/** Precisa ser chamado antes de `app.whenReady()`. */
export function registrarEsquemaPrivilegiado(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: ESQUEMA_MIDIA, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  ])
}

export function permitirPasta(pasta: string): void {
  raizesPermitidas.push(normalizar(pasta))
}

/** Libera o arquivo para as janelas e devolve a URL dele. */
export function liberarArquivo(caminho: string): string {
  arquivosPermitidos.add(normalizar(caminho))
  return urlMidia(caminho)
}

function permitido(caminho: string): boolean {
  const n = normalizar(caminho)
  return arquivosPermitidos.has(n) || raizesPermitidas.some((r) => n.startsWith(r + sep))
}

function corpo(caminho: string, inicio: number, fim: number): ReadableStream | null {
  if (fim < inicio) return null
  return Readable.toWeb(createReadStream(caminho, { start: inicio, end: fim })) as ReadableStream
}

export function tratarProtocoloMidia(): void {
  protocol.handle(ESQUEMA_MIDIA, async (req) => {
    let caminho: string
    try {
      caminho = caminhoDaUrlMidia(req.url)
    } catch {
      return new Response('URL inválida', { status: 400 })
    }
    if (!permitido(caminho)) return new Response('Acesso negado', { status: 403 })

    let tamanho: number
    try {
      const st = await fsp.stat(caminho)
      if (!st.isFile()) return new Response('Não é arquivo', { status: 404 })
      tamanho = st.size
    } catch {
      return new Response('Arquivo não encontrado', { status: 404 })
    }

    const cabecalhos = {
      'Content-Type': MIME[extname(caminho).toLowerCase()] ?? 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache',
    }
    const range = req.headers.get('range')
    const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null
    if (m && (m[1] || m[2])) {
      let inicio: number
      let fim: number
      if (m[1]) {
        inicio = Number(m[1])
        fim = m[2] ? Math.min(Number(m[2]), tamanho - 1) : tamanho - 1
      } else {
        inicio = Math.max(0, tamanho - Number(m[2]))
        fim = tamanho - 1
      }
      if (inicio >= tamanho || inicio > fim) {
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${tamanho}` } })
      }
      return new Response(corpo(caminho, inicio, fim), {
        status: 206,
        headers: {
          ...cabecalhos,
          'Content-Range': `bytes ${inicio}-${fim}/${tamanho}`,
          'Content-Length': String(fim - inicio + 1),
        },
      })
    }
    return new Response(corpo(caminho, 0, tamanho - 1), {
      status: 200,
      headers: { ...cabecalhos, 'Content-Length': String(tamanho) },
    })
  })
}
