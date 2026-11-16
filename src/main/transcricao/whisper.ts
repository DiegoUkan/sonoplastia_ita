/**
 * Transcrição LOCAL com o whisper.cpp (na CPU, sem internet e sem custo), pedida pelo usuário em 2026-11-16.
 *
 *  - Instalação: o programa baixa o executável oficial (GitHub, ggml-org/whisper.cpp) e o modelo (HuggingFace,
 *    ggerganov/whisper.cpp) para `C:\Sonoplastia\whisper`, conferindo o SHA-256 de cada um (valores fixos abaixo).
 *  - `ServidorWhisper`: o `whisper-server.exe` fica aberto (modelo carregado) enquanto o Automático está ligado,
 *    com prioridade baixa do Windows, só no endereço local.
 *  - `ConexaoWhisper`: a mesma interface da conexão do ElevenLabs. Corta a fala em frases nas pausas e manda uma
 *    por vez ao servidor; cada frase transcrita vira um texto "final".
 *
 * Medido em 2026-11-16 (frases de 6 a 18 s; Ryzen 5 7600 com 2 threads, ~2,5× o i3-7100 da igreja):
 * base ~0,9 s por frase (~2,3 s no i3), small ~3,1 s (~7,5 s no i3, no limite). Por isso o padrão é o base.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { createReadStream, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { constants as constantesSo, setPriority } from 'node:os'
import { basename, dirname, join } from 'node:path'
import type { InstalacaoWhisper } from '../../shared/transcricao/tipos'
import { TAXA_AMOSTRAS } from '../../shared/transcricao/voz'
import { ArquivoZip } from '../apresentacoes/zip'
import { baixarArquivo, type Buscar, descartarParcial } from '../site/baixar'

export type ModeloWhisper = 'base' | 'small'

/** O que o programa baixa (versão fixa; trocar = conferir de novo o SHA-256). */
export const WHISPER = {
  versao: 'whisper.cpp v1.9.5 (build b5454)',
  zip: {
    // os arquivos ficam no release de build "b5454"; a URL com a tag v1.9.5 dá 404
    url: 'https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-x64.zip',
    bytes: 8_928_640,
    sha256: '6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb',
  },
  modelos: {
    base: {
      arquivo: 'ggml-base-q5_1.bin',
      url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin',
      bytes: 59_707_625,
      sha256: '422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898',
    },
    small: {
      arquivo: 'ggml-small-q5_1.bin',
      url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin',
      bytes: 190_085_487,
      sha256: 'ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb',
    },
  },
} as const

/** Ajuda o Whisper a escrever os nomes difíceis (sem isso ele escreveu "Abacuque" no projeto Python). */
export const PROMPT_WHISPER =
  'Pregação em culto adventista. Leitura da Bíblia: Gênesis, Deuteronômio, Eclesiastes, Habacuque, Sofonias, Ageu, Filipenses, Colossenses, Coríntios, Tessalonicenses, Filemom, Apocalipse, capítulo 3, versículo 16.'

/** Janela do Whisper em "quadros" de 20 ms: 900 = 18 s (a frase mais longa que mandamos é 17 s). Menor = mais rápido. */
const CONTEXTO_AUDIO = 900

export const caminhosWhisper = (pasta: string) => ({
  exe: join(pasta, 'bin', 'whisper-server.exe'),
  modelo: (m: ModeloWhisper) => join(pasta, 'modelos', WHISPER.modelos[m].arquivo),
})

export type { InstalacaoWhisper }

export function situacaoWhisper(pasta: string): InstalacaoWhisper {
  const c = caminhosWhisper(pasta)
  return { pasta, versao: WHISPER.versao, exe: existsSync(c.exe), modelos: { base: existsSync(c.modelo('base')), small: existsSync(c.modelo('small')) } }
}

export async function sha256DoArquivo(caminho: string): Promise<string> {
  const h = createHash('sha256')
  for await (const pedaco of createReadStream(caminho)) h.update(pedaco as Buffer)
  return h.digest('hex')
}

/** Baixa (com retomada) e confere o SHA-256; só então põe no lugar. Arquivo errado é apagado. */
async function baixarConferido(buscar: Buscar, url: string, bytes: number, sha256: string, destino: string, aoProgresso: (feito: number, total: number) => void): Promise<void> {
  mkdirSync(dirname(destino), { recursive: true })
  const parcial = `${destino}.part`
  await baixarArquivo({ buscar, url, parcial, tamanho: bytes, aoProgresso })
  const h = await sha256DoArquivo(parcial)
  if (h !== sha256) {
    descartarParcial(parcial)
    throw new Error(`${basename(destino)} chegou diferente do esperado (SHA-256 não confere). Foi apagado; tente de novo.`)
  }
  renameSync(parcial, destino)
}

/**
 * Instala o que falta: o executável (zip de ~9 MB, só o servidor e as DLLs são extraídos) e o modelo pedido.
 * `aoProgresso` recebe bytes e o nome do que está baixando.
 */
export async function instalarWhisper(o: { pasta: string; modelo: ModeloWhisper; buscar: Buscar; aoProgresso: (feito: number, total: number, texto: string) => void }): Promise<void> {
  const c = caminhosWhisper(o.pasta)
  if (!existsSync(c.exe)) {
    const zip = join(o.pasta, 'whisper-bin-x64.zip')
    await baixarConferido(o.buscar, WHISPER.zip.url, WHISPER.zip.bytes, WHISPER.zip.sha256, zip, (f, t) => o.aoProgresso(f, t, 'o Whisper'))
    const z = new ArquivoZip(zip)
    try {
      const bin = dirname(c.exe)
      mkdirSync(bin, { recursive: true })
      for (const nome of z.nomes) {
        const arquivo = basename(nome)
        if (!/^Release\//.test(nome) || !(/\.dll$/i.test(arquivo) || arquivo === 'whisper-server.exe')) continue
        writeFileSync(join(bin, arquivo), await z.lerAsync(nome))
      }
    } finally {
      z.fechar()
    }
    rmSync(zip, { force: true })
    if (!existsSync(c.exe)) throw new Error('O pacote do Whisper não tinha o whisper-server.exe.')
  }
  const m = WHISPER.modelos[o.modelo]
  if (!existsSync(c.modelo(o.modelo))) {
    await baixarConferido(o.buscar, m.url, m.bytes, m.sha256, c.modelo(o.modelo), (f, t) => o.aoProgresso(f, t, `o modelo ${o.modelo}`))
  }
}

// ------------------------------------------------------------------ áudio

/** PCM 16 bits mono 16 kHz → WAV. */
export function wavDe(pcm: Int16Array): Buffer {
  const dados = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
  const cab = Buffer.alloc(44)
  cab.write('RIFF', 0)
  cab.writeUInt32LE(36 + dados.length, 4)
  cab.write('WAVE', 8)
  cab.write('fmt ', 12)
  cab.writeUInt32LE(16, 16)
  cab.writeUInt16LE(1, 20)
  cab.writeUInt16LE(1, 22)
  cab.writeUInt32LE(TAXA_AMOSTRAS, 24)
  cab.writeUInt32LE(TAXA_AMOSTRAS * 2, 28)
  cab.writeUInt16LE(2, 32)
  cab.writeUInt16LE(16, 34)
  cab.write('data', 36)
  cab.writeUInt32LE(dados.length, 40)
  return Buffer.concat([cab, dados])
}

/**
 * O Whisper "inventa" frases conhecidas em trechos sem fala (vícios das legendas com que foi treinado) e às vezes
 * repete uma palavra sem parar. Isso não pode virar fala do pregador.
 */
export function limparTextoWhisper(texto: string): string {
  let t = texto
    .replace(/\[[^\]]*\]|\([^)]*\)|[♪♫]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const comparar = t
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9. ]/g, '')
    .trim()
  if (
    !comparar ||
    comparar.includes('amara.org') ||
    /^(legendas?|legendado|transcricao|traducao)( (pela|por|de|da) .*)?$/.test(comparar) ||
    // só as frases exatas que ele inventa (uma oração "Obrigado, Senhor, por mais um dia" passa)
    /^(obrigad[oa]( por assistir)?|tchau( tchau)?|inscrevase( no canal)?|e ai|ate a proxima)\.?$/.test(comparar) ||
    /^\.*$/.test(comparar)
  ) {
    return ''
  }
  // "e e e e e" / "Deus Deus Deus Deus": a mesma palavra mais de 3 vezes seguidas fica uma vez só
  t = t.replace(/(\b[\p{L}\p{N}]+\b)(?:[\s,]+\1\b){3,}/giu, '$1')
  return t
}

// ------------------------------------------------------------------ servidor

export interface OpcoesServidorWhisper {
  exe: string
  modelo: string
  threads: number
  log?: { info: (...p: unknown[]) => void; aviso: (...p: unknown[]) => void }
}

/** O que a conexão precisa do servidor (o de verdade ou um de mentira nos testes). */
export interface Transcritor {
  transcrever(pcm: Int16Array): Promise<string>
}

function portaLivre(): Promise<number> {
  return new Promise((ok, falha) => {
    const s = createServer()
    s.once('error', falha)
    s.listen(0, '127.0.0.1', () => {
      const p = (s.address() as { port: number }).port
      s.close(() => ok(p))
    })
  })
}

/** O `whisper-server.exe` aberto, com o modelo carregado. Eventos: 'caiu' (mensagem). */
export class ServidorWhisper extends EventEmitter implements Transcritor {
  private processo: ChildProcess | null = null
  private porta = 0
  private parando = false
  private saida = ''

  constructor(readonly opcoes: OpcoesServidorWhisper) {
    super()
  }

  get vivo(): boolean {
    return !!this.processo && this.processo.exitCode === null
  }

  async iniciar(): Promise<void> {
    if (!existsSync(this.opcoes.exe)) throw new Error('O Whisper não está instalado (Configurações → Bíblia automática).')
    if (!existsSync(this.opcoes.modelo)) throw new Error('O modelo do Whisper não está baixado (Configurações → Bíblia automática).')
    this.porta = await portaLivre()
    const args = [
      '-m', this.opcoes.modelo,
      '-l', 'pt',
      '-t', String(this.opcoes.threads),
      '-nt',
      '-sns',
      '-ac', String(CONTEXTO_AUDIO),
      '--prompt', PROMPT_WHISPER,
      '--host', '127.0.0.1',
      '--port', String(this.porta),
    ]
    const p = spawn(this.opcoes.exe, args, { cwd: dirname(this.opcoes.exe), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    this.processo = p
    this.parando = false
    const guardar = (d: Buffer) => {
      this.saida = (this.saida + d.toString('utf8')).slice(-4000)
    }
    p.stdout?.on('data', guardar)
    p.stderr?.on('data', guardar)
    try {
      // não disputa a CPU com os vídeos e a tela de comando
      if (p.pid) setPriority(p.pid, constantesSo.priority.PRIORITY_BELOW_NORMAL)
    } catch {
      // sem permissão para mudar a prioridade: segue normal
    }
    const saiu = new Promise<never>((_ok, falha) => {
      p.once('error', (e) => falha(new Error(`O Whisper não abriu: ${e.message}`)))
      p.once('exit', (codigo) => falha(new Error(`O Whisper fechou ao abrir (código ${codigo}). ${this.saida.trim().split('\n').slice(-3).join(' ')}`)))
    })
    p.once('exit', (codigo) => {
      if (this.processo === p) this.processo = null
      if (!this.parando) this.emit('caiu', `O Whisper fechou sozinho (código ${codigo}).`)
    })
    const t0 = Date.now()
    await Promise.race([saiu, this.esperarPronto()])
    this.opcoes.log?.info(`Bíblia automática: Whisper aberto em ${Date.now() - t0} ms (${basename(this.opcoes.modelo)}, ${this.opcoes.threads} threads).`)
  }

  private async esperarPronto(): Promise<void> {
    const limite = Date.now() + 60_000
    while (Date.now() < limite) {
      try {
        await fetch(`http://127.0.0.1:${this.porta}/`, { signal: AbortSignal.timeout(1000) })
        return
      } catch {
        await new Promise((r) => setTimeout(r, 300))
      }
    }
    throw new Error('O Whisper demorou demais para abrir (mais de 60 s).')
  }

  async transcrever(pcm: Int16Array): Promise<string> {
    if (!this.vivo) throw new Error('O Whisper não está aberto.')
    const corpo = new FormData()
    corpo.append('file', new Blob([new Uint8Array(wavDe(pcm))], { type: 'audio/wav' }), 'frase.wav')
    corpo.append('response_format', 'json')
    corpo.append('temperature', '0')
    const r = await fetch(`http://127.0.0.1:${this.porta}/inference`, { method: 'POST', body: corpo, signal: AbortSignal.timeout(60_000) })
    const texto = await r.text()
    if (!r.ok) throw new Error(`O Whisper respondeu ${r.status}: ${texto.slice(0, 200)}`)
    try {
      return String((JSON.parse(texto) as { text?: unknown }).text ?? '')
    } catch {
      throw new Error('O Whisper respondeu algo que não é JSON.')
    }
  }

  parar(): void {
    this.parando = true
    const p = this.processo
    this.processo = null
    if (p && p.exitCode === null) p.kill()
  }
}

// ------------------------------------------------------------------ conexão (uma por "sessão de fala")

/** pausa que fecha uma frase (5 × 100 ms) */
const PAUSA_QUADROS = 5
/** fala mínima numa frase: menos que isso é tosse, clique, "é…" */
const VOZ_MINIMA_QUADROS = 6
/** frase mais longa: corta no próximo silêncio depois de 14 s, ou à força aos 17 s (cabe na janela de 18 s) */
const FRASE_LONGA_QUADROS = 140
const FRASE_MAXIMA_QUADROS = 170
/** fila maior que isso (em quadros, 30 s) = o computador não dá conta: as frases mais velhas são descartadas */
const FILA_MAXIMA_QUADROS = 300

/**
 * Mesma interface da `ConexaoElevenLabs` (eventos 'aberta', 'parcial', 'final', 'erro', 'fechada'). Recebe os
 * quadros com a marca de voz da porta, junta em frases e manda uma por vez ao Whisper.
 */
export class ConexaoWhisper extends EventEmitter {
  abriu = false
  private frase: Int16Array[] = []
  private comVoz = 0
  private silencio = 0
  private fila: Int16Array[][] = []
  private trabalhando = false
  private fechada = false
  private encerrando = false
  private ultimoAvisoAtraso = 0

  constructor(private readonly pronto: () => Promise<Transcritor>) {
    super()
    pronto().then(
      () => {
        if (this.fechada) return
        this.abriu = true
        this.emit('aberta')
        void this.processar()
      },
      (e: unknown) => {
        if (this.fechada) return
        this.emit('erro', e instanceof Error ? e.message : String(e), true)
        this.fechar(true)
      },
    )
  }

  enviar(pcm: Int16Array, voz = true): void {
    if (this.fechada || this.encerrando) return
    // antes da primeira voz, guarda só ~0,5 s (o começo da palavra)
    if (!this.comVoz && !voz) {
      this.frase.push(pcm)
      if (this.frase.length > PAUSA_QUADROS) this.frase.shift()
      return
    }
    this.frase.push(pcm)
    if (voz) {
      this.comVoz++
      this.silencio = 0
    } else {
      this.silencio++
    }
    const n = this.frase.length
    if ((this.silencio >= PAUSA_QUADROS && this.comVoz >= VOZ_MINIMA_QUADROS) || (n >= FRASE_LONGA_QUADROS && !voz) || n >= FRASE_MAXIMA_QUADROS) this.fecharFrase()
    else if (this.silencio >= PAUSA_QUADROS * 4) this.descartarFrase() // só um ruído no meio do silêncio
  }

  private descartarFrase(): void {
    this.frase = []
    this.comVoz = 0
    this.silencio = 0
  }

  private fecharFrase(): void {
    if (this.comVoz >= VOZ_MINIMA_QUADROS) {
      // tira o silêncio do fim (deixa 0,2 s): o Whisper inventa texto em silêncio longo
      const manter = Math.max(1, this.frase.length - Math.max(0, this.silencio - 2))
      this.fila.push(this.frase.slice(0, manter))
      this.cortarAtraso()
      void this.processar()
    }
    this.descartarFrase()
  }

  private cortarAtraso(): void {
    let total = this.fila.reduce((s, f) => s + f.length, 0)
    let descartou = false
    while (total > FILA_MAXIMA_QUADROS && this.fila.length > 1) {
      total -= this.fila.shift()!.length
      descartou = true
    }
    if (descartou && Date.now() - this.ultimoAvisoAtraso > 60_000) {
      this.ultimoAvisoAtraso = Date.now()
      this.emit('erro', 'O computador não está dando conta de transcrever tudo: algumas frases foram puladas. Use o modelo base ou mais núcleos.', false)
    }
  }

  private async processar(): Promise<void> {
    if (this.trabalhando || !this.abriu) return
    this.trabalhando = true
    try {
      const transcritor = await this.pronto()
      while (this.fila.length && !this.fechada) {
        const quadros = this.fila.shift()!
        const pcm = new Int16Array(quadros.reduce((s, q) => s + q.length, 0))
        let pos = 0
        for (const q of quadros) {
          pcm.set(q, pos)
          pos += q.length
        }
        this.emit('parcial', '…')
        try {
          const texto = limparTextoWhisper(await transcritor.transcrever(pcm))
          if (!this.fechada) this.emit('final', texto)
        } catch (e) {
          // fechada no meio (voltou para o Manual): a frase não interessa mais
          if (this.fechada) break
          this.emit('final', '')
          this.emit('erro', `Whisper: ${e instanceof Error ? e.message : String(e)}`, false)
        }
      }
    } finally {
      this.trabalhando = false
    }
    if (this.encerrando && !this.fila.length) this.fechar(false)
  }

  /** Transcreve a frase em andamento e o que está na fila (até 20 s) e fecha. */
  async encerrar(): Promise<void> {
    if (this.fechada || this.encerrando) return
    if (this.comVoz >= VOZ_MINIMA_QUADROS) this.fecharFrase()
    this.encerrando = true
    if (!this.abriu || (!this.fila.length && !this.trabalhando)) {
      this.fechar(false)
      return
    }
    await new Promise<void>((ok) => {
      const t = setTimeout(() => {
        this.fechar(false)
        ok()
      }, 20_000)
      this.once('fechada', () => {
        clearTimeout(t)
        ok()
      })
    })
  }

  fecharJa(): void {
    this.encerrando = true
    this.fila = []
    this.fechar(false)
  }

  private fechar(inesperado: boolean): void {
    if (this.fechada) return
    this.fechada = true
    this.emit('fechada', inesperado)
  }
}
