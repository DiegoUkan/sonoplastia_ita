/**
 * Formato de um arquivo de vídeo (codec, tamanho e quadros por segundo) lido direto das "caixas" do MP4/MOV,
 * sem ffmpeg: o do Holyrics (2014) nem reconhece AV1. WebM/MKV: só o codec (procura o CodecID no começo do
 * arquivo); o tamanho vem da janela-sonda.
 *
 * MP4 (ISO BMFF): moov → trak (a de vídeo: hdlr = 'vide') → tkhd (tamanho na tela) e
 * mdia → mdhd (escala de tempo), minf → stbl → stsd (código das amostras: avc1, hvc1, av01…) e stts (duração das
 * amostras → quadros por segundo).
 */
import { promises as fsp } from 'node:fs'
import type { CodecVideo, FormatoVideo } from '../../shared/video'

const CODECS: Record<string, CodecVideo> = {
  avc1: 'h264',
  avc3: 'h264',
  hvc1: 'hevc',
  hev1: 'hevc',
  av01: 'av1',
  vp09: 'vp9',
  vp08: 'vp8',
  mp4v: 'mpeg4',
}

/** O moov passa disso só em arquivo estranho: não lê. */
const MOOV_MAXIMO = 64 * 1024 * 1024

interface Caixa {
  tipo: string
  /** onde começa o conteúdo (depois do cabeçalho) */
  inicio: number
  /** onde a caixa acaba */
  fim: number
}

/** Caixas filhas dentro de `b` entre `de` e `ate`. */
function caixas(b: Buffer, de: number, ate: number): Caixa[] {
  const r: Caixa[] = []
  let p = de
  while (p + 8 <= ate) {
    let tamanho = b.readUInt32BE(p)
    const tipo = b.toString('latin1', p + 4, p + 8)
    let cabecalho = 8
    if (tamanho === 1) {
      if (p + 16 > ate) break
      tamanho = Number(b.readBigUInt64BE(p + 8))
      cabecalho = 16
    } else if (tamanho === 0) tamanho = ate - p
    if (tamanho < cabecalho || p + tamanho > ate) break
    r.push({ tipo, inicio: p + cabecalho, fim: p + tamanho })
    p += tamanho
  }
  return r
}

const filha = (b: Buffer, c: Caixa | undefined, tipo: string) => (c ? caixas(b, c.inicio, c.fim).find((x) => x.tipo === tipo) : undefined)

/** Formato da faixa de vídeo dentro do `moov` (já lido na memória). */
export function formatoDoMoov(moov: Buffer): FormatoVideo | null {
  for (const trak of caixas(moov, 0, moov.length).filter((c) => c.tipo === 'trak')) {
    const mdia = filha(moov, trak, 'mdia')
    const hdlr = filha(moov, mdia, 'hdlr')
    // hdlr: versão e flags (4) + pre_defined (4) + handler_type (4)
    if (!hdlr || hdlr.inicio + 12 > hdlr.fim || moov.toString('latin1', hdlr.inicio + 8, hdlr.inicio + 12) !== 'vide') continue
    const f: FormatoVideo = { codec: null, largura: null, altura: null, qps: null }

    const stbl = filha(moov, filha(moov, mdia, 'minf'), 'stbl')
    const stsd = filha(moov, stbl, 'stsd')
    if (stsd && stsd.inicio + 16 <= stsd.fim) {
      // stsd: versão e flags (4) + quantidade (4) + a primeira entrada (tamanho 4, código 4, …)
      const codigo = moov.toString('latin1', stsd.inicio + 12, stsd.inicio + 16)
      f.codec = CODECS[codigo] ?? 'outro'
      // VisualSampleEntry: 6 reservados + 2 data_reference_index + 16 pre_defined/reservados, depois largura e altura (16 bits)
      const e = stsd.inicio + 16
      if (e + 28 <= stsd.fim) {
        const l = moov.readUInt16BE(e + 24)
        const a = moov.readUInt16BE(e + 26)
        if (l > 0 && a > 0) {
          f.largura = l
          f.altura = a
        }
      }
    }
    // sem o tamanho da amostra, o do tkhd (16.16, os últimos 8 bytes)
    const tkhd = filha(moov, trak, 'tkhd')
    if (!f.largura && tkhd && tkhd.fim - tkhd.inicio >= 84) {
      const l = Math.round(moov.readUInt32BE(tkhd.fim - 8) / 65536)
      const a = Math.round(moov.readUInt32BE(tkhd.fim - 4) / 65536)
      if (l > 0 && a > 0) {
        f.largura = l
        f.altura = a
      }
    }

    const mdhd = filha(moov, mdia, 'mdhd')
    const stts = filha(moov, stbl, 'stts')
    if (mdhd && stts && mdhd.inicio + 24 <= mdhd.fim && stts.inicio + 8 <= stts.fim) {
      const v = moov.readUInt8(mdhd.inicio)
      const escala = v === 1 ? moov.readUInt32BE(mdhd.inicio + 20) : moov.readUInt32BE(mdhd.inicio + 12)
      const n = moov.readUInt32BE(stts.inicio + 4)
      let amostras = 0
      let duracao = 0
      for (let i = 0, p = stts.inicio + 8; i < n && p + 8 <= stts.fim; i++, p += 8) {
        const qtd = moov.readUInt32BE(p)
        amostras += qtd
        duracao += qtd * moov.readUInt32BE(p + 4)
      }
      if (escala > 0 && duracao > 0 && amostras > 1) f.qps = Math.round(((amostras * escala) / duracao) * 100) / 100
    }
    return f
  }
  return null
}

const CODECS_MATROSKA: Array<[string, CodecVideo]> = [
  ['V_AV1', 'av1'],
  ['V_VP9', 'vp9'],
  ['V_VP8', 'vp8'],
  ['V_MPEGH/ISO/HEVC', 'hevc'],
  ['V_MPEG4/ISO/AVC', 'h264'],
]

/** Lê o formato do arquivo; null se não for MP4/MOV/WebM/MKV ou se não der para ler. */
export async function lerFormatoVideo(caminho: string): Promise<FormatoVideo | null> {
  const fh = await fsp.open(caminho, 'r')
  try {
    const { size } = await fh.stat()
    const cab = Buffer.alloc(16)
    await fh.read(cab, 0, 16, 0)
    // WebM/MKV (EBML): o CodecID fica no começo
    if (cab.readUInt32BE(0) === 0x1a45dfa3) {
      const inicio = Buffer.alloc(Math.min(size, 1024 * 1024))
      await fh.read(inicio, 0, inicio.length, 0)
      const texto = inicio.toString('latin1')
      for (const [id, codec] of CODECS_MATROSKA) if (texto.includes(id)) return { codec, largura: null, altura: null, qps: null }
      return { codec: 'outro', largura: null, altura: null, qps: null }
    }
    if (cab.toString('latin1', 4, 8) !== 'ftyp') return null
    // caixas do nível de cima, uma a uma, sem ler o mdat (que é o vídeo inteiro)
    let p = 0
    while (p + 8 <= size) {
      await fh.read(cab, 0, 16, p)
      let tamanho = cab.readUInt32BE(0)
      const tipo = cab.toString('latin1', 4, 8)
      let cabecalho = 8
      if (tamanho === 1) {
        tamanho = Number(cab.readBigUInt64BE(8))
        cabecalho = 16
      } else if (tamanho === 0) tamanho = size - p
      if (tamanho < cabecalho) return null
      if (tipo === 'moov') {
        const n = tamanho - cabecalho
        if (n > MOOV_MAXIMO || p + tamanho > size) return null
        const moov = Buffer.alloc(n)
        await fh.read(moov, 0, n, p + cabecalho)
        return formatoDoMoov(moov)
      }
      p += tamanho
    }
    return null
  } finally {
    await fh.close()
  }
}
