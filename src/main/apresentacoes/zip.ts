/**
 * Leitor mínimo de ZIP (um .pptx é um ZIP): lê o diretório central e extrai uma entrada por vez,
 * sem carregar o arquivo inteiro na memória. Só o que o Office grava: sem ZIP64 e sem criptografia,
 * compressão "guardado" (0) ou "deflate" (8).
 */
import { closeSync, fstatSync, openSync, readSync } from 'node:fs'
import { promisify } from 'node:util'
import { inflateRaw, inflateRawSync } from 'node:zlib'

const inflar = promisify(inflateRaw)

interface Entrada {
  nome: string
  metodo: number
  comprimido: number
  tamanho: number
  deslocamento: number
}

const ASSINATURA_FIM = 0x06054b50
const ASSINATURA_CENTRAL = 0x02014b50
const ASSINATURA_LOCAL = 0x04034b50

export class ArquivoZip {
  private readonly fd: number
  private readonly entradas = new Map<string, Entrada>()

  constructor(caminho: string) {
    this.fd = openSync(caminho, 'r')
    try {
      this.lerDiretorio()
    } catch (e) {
      closeSync(this.fd)
      throw e
    }
  }

  get nomes(): string[] {
    return [...this.entradas.keys()]
  }

  tem(nome: string): boolean {
    return this.entradas.has(nome)
  }

  /** Conteúdo de uma entrada (descomprimido). */
  ler(nome: string): Buffer {
    const { dados, metodo } = this.bruto(nome)
    return metodo === 8 ? inflateRawSync(dados) : dados
  }

  /** O mesmo que `ler`, sem travar o programa em arquivos grandes (vídeos). */
  async lerAsync(nome: string): Promise<Buffer> {
    const { dados, metodo } = this.bruto(nome)
    return metodo === 8 ? inflar(dados) : dados
  }

  texto(nome: string): string {
    return this.ler(nome).toString('utf8')
  }

  fechar(): void {
    closeSync(this.fd)
  }

  private bytes(posicao: number, n: number): Buffer {
    const b = Buffer.alloc(n)
    let lidos = 0
    while (lidos < n) {
      const r = readSync(this.fd, b, lidos, n - lidos, posicao + lidos)
      if (r === 0) break
      lidos += r
    }
    return lidos === n ? b : b.subarray(0, lidos)
  }

  private lerDiretorio(): void {
    const tamanho = fstatSync(this.fd).size
    const n = Math.min(tamanho, 22 + 0xffff)
    const fim = this.bytes(tamanho - n, n)
    let i = fim.length - 22
    while (i >= 0 && fim.readUInt32LE(i) !== ASSINATURA_FIM) i--
    if (i < 0) throw new Error('O arquivo não é um .pptx válido (não é um ZIP).')
    const total = fim.readUInt16LE(i + 10)
    const tamDiretorio = fim.readUInt32LE(i + 12)
    const posDiretorio = fim.readUInt32LE(i + 16)
    if (posDiretorio === 0xffffffff || total === 0xffff) throw new Error('Arquivo grande demais (ZIP64), não suportado.')
    const dir = this.bytes(posDiretorio, tamDiretorio)
    let p = 0
    for (let k = 0; k < total; k++) {
      if (p + 46 > dir.length || dir.readUInt32LE(p) !== ASSINATURA_CENTRAL) throw new Error('O arquivo .pptx está danificado.')
      const flags = dir.readUInt16LE(p + 8)
      const nNome = dir.readUInt16LE(p + 28)
      const nExtra = dir.readUInt16LE(p + 30)
      const nComentario = dir.readUInt16LE(p + 32)
      const nome = dir.toString(flags & 0x800 ? 'utf8' : 'latin1', p + 46, p + 46 + nNome)
      this.entradas.set(nome, {
        nome,
        metodo: dir.readUInt16LE(p + 10),
        comprimido: dir.readUInt32LE(p + 20),
        tamanho: dir.readUInt32LE(p + 24),
        deslocamento: dir.readUInt32LE(p + 42),
      })
      p += 46 + nNome + nExtra + nComentario
    }
  }

  private bruto(nome: string): { dados: Buffer; metodo: number } {
    const e = this.entradas.get(nome)
    if (!e) throw new Error(`"${nome}" não existe dentro do arquivo.`)
    if (e.metodo !== 0 && e.metodo !== 8) throw new Error(`"${nome}": compressão ${e.metodo} não suportada.`)
    const cab = this.bytes(e.deslocamento, 30)
    if (cab.length < 30 || cab.readUInt32LE(0) !== ASSINATURA_LOCAL) throw new Error('O arquivo .pptx está danificado.')
    const inicio = e.deslocamento + 30 + cab.readUInt16LE(26) + cab.readUInt16LE(28)
    return { dados: this.bytes(inicio, e.comprimido), metodo: e.metodo }
  }
}
