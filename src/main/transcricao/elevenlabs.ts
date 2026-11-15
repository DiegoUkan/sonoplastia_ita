/**
 * Transcrição na nuvem com a ElevenLabs Scribe v2 Realtime (WebSocket), porta de `stt/elevenlabs.py`.
 *
 * O servidor detecta as pausas (commit_strategy=vad) e manda texto parcial enquanto a pessoa fala.
 * Se a conexão cai, reconecta sozinho; o áudio desse meio-tempo fica numa fila (até ~30 s).
 * A chave vai no cabeçalho `xi-api-key` (o WebSocket do Node aceita cabeçalhos), nunca na URL nem no log.
 * Docs: https://elevenlabs.io/docs/api-reference/speech-to-text/v-1-speech-to-text-realtime
 */
import { EventEmitter } from 'node:events'

export const TAXA = 16000
const URL_BASE = 'wss://api.elevenlabs.io/v1/speech-to-text/realtime'
const MODELO = 'scribe_v2_realtime'
/** ~30 s de áudio em blocos de 128 ms */
const MAX_FILA = 240

/** Erros em que não adianta reconectar. */
const ERROS_FATAIS = new Set(['auth_error', 'quota_exceeded', 'unaccepted_terms', 'invalid_request', 'input_error', 'chunk_size_exceeded'])

const MENSAGEM_FATAL: Record<string, string> = {
  auth_error: 'A ElevenLabs recusou a chave. Confira a chave em Configurações → Sugestões de versículos.',
  quota_exceeded: 'Acabou o crédito da ElevenLabs.',
  unaccepted_terms: 'Falta aceitar os termos de uso no site da ElevenLabs.',
}

export function urlElevenLabs(idioma = 'pt', pausaS = 0.8): string {
  const q = new URLSearchParams({
    model_id: MODELO,
    audio_format: `pcm_${TAXA}`,
    language_code: idioma,
    commit_strategy: 'vad',
    vad_silence_threshold_secs: String(pausaS),
  })
  return `${URL_BASE}?${q}`
}

export type MensagemElevenLabs =
  | { tipo: 'parcial'; texto: string }
  | { tipo: 'final'; texto: string }
  | { tipo: 'erro'; fatal: boolean; mensagem: string }
  | { tipo: 'nada' }

/** O que fazer com uma mensagem do servidor. */
export function lerMensagem(bruto: string): MensagemElevenLabs {
  let m: { message_type?: unknown; text?: unknown; error?: unknown; warning?: unknown }
  try {
    m = JSON.parse(bruto)
  } catch {
    return { tipo: 'nada' }
  }
  const tipo = String(m.message_type ?? '')
  const texto = typeof m.text === 'string' ? m.text.trim() : ''
  if (tipo === 'partial_transcript') return texto ? { tipo: 'parcial', texto } : { tipo: 'nada' }
  if (tipo === 'committed_transcript') return texto ? { tipo: 'final', texto } : { tipo: 'nada' }
  if (tipo === 'error' || 'error' in m || ERROS_FATAIS.has(tipo)) {
    const fatal = ERROS_FATAIS.has(tipo)
    return { tipo: 'erro', fatal, mensagem: MENSAGEM_FATAL[tipo] ?? `ElevenLabs (${tipo || 'erro'}): ${String(m.error ?? '')}`.trim() }
  }
  return { tipo: 'nada' }
}

/** O pedaço do WebSocket que este arquivo usa (um falso nos testes). */
export interface SoqueteMinimo {
  readyState: number
  send(dado: string): void
  close(): void
  onopen: ((ev: unknown) => void) | null
  onmessage: ((ev: { data: unknown }) => void) | null
  onclose: ((ev: unknown) => void) | null
  onerror: ((ev: unknown) => void) | null
}

export interface OpcoesElevenLabs {
  chave: string
  idioma?: string
  pausaS?: number
  /** abre o WebSocket (o do Node, com o cabeçalho da chave) */
  abrir?: (url: string, cabecalhos: Record<string, string>) => SoqueteMinimo
  /** confere a chave quando a conexão não abre (para dar um erro claro) */
  conferirChave?: (chave: string) => Promise<'ok' | 'recusada' | 'sem-conexao'>
}

const abrirPadrao = (url: string, cabecalhos: Record<string, string>): SoqueteMinimo =>
  // o WebSocket do Node (undici) aceita cabeçalhos no segundo argumento
  new WebSocket(url, { headers: cabecalhos } as unknown as string[]) as unknown as SoqueteMinimo

async function conferirChavePadrao(chave: string): Promise<'ok' | 'recusada' | 'sem-conexao'> {
  try {
    const r = await fetch('https://api.elevenlabs.io/v1/single-use-token/realtime_scribe', { method: 'POST', headers: { 'xi-api-key': chave } })
    return r.status === 401 || r.status === 403 ? 'recusada' : 'ok'
  } catch {
    return 'sem-conexao'
  }
}

/**
 * Eventos: 'parcial' (texto), 'final' (texto), 'conectado', 'reconectando' (motivo),
 * 'erro' (mensagem; fatal, já parou).
 */
export class TranscritorElevenLabs extends EventEmitter {
  private ws: SoqueteMinimo | null = null
  private fila: string[] = []
  private parando = false
  private aberto = false
  private falhasSeguidas = 0
  private espera: NodeJS.Timeout | null = null
  private readonly abrir: NonNullable<OpcoesElevenLabs['abrir']>
  private readonly conferir: NonNullable<OpcoesElevenLabs['conferirChave']>

  constructor(private readonly op: OpcoesElevenLabs) {
    super()
    this.abrir = op.abrir ?? abrirPadrao
    this.conferir = op.conferirChave ?? conferirChavePadrao
  }

  iniciar(): void {
    this.parando = false
    this.conectar()
  }

  /** Um bloco de áudio PCM 16 bits, mono, 16 kHz. */
  enviar(pcm: Uint8Array): void {
    if (this.parando) return
    const msg = JSON.stringify({ message_type: 'input_audio_chunk', audio_base_64: Buffer.from(pcm).toString('base64'), commit: false, sample_rate: TAXA })
    if (this.ws && this.aberto && this.ws.readyState === 1) this.ws.send(msg)
    else {
      this.fila.push(msg)
      if (this.fila.length > MAX_FILA) this.fila.splice(0, this.fila.length - MAX_FILA)
    }
  }

  /** Fecha a conexão (manda o último pedaço para ser transcrito antes). */
  parar(): void {
    this.parando = true
    if (this.espera) clearTimeout(this.espera)
    this.espera = null
    this.fila = []
    const ws = this.ws
    this.ws = null
    if (!ws) return
    try {
      if (ws.readyState === 1) ws.send(JSON.stringify({ message_type: 'input_audio_chunk', audio_base_64: '', commit: true, sample_rate: TAXA }))
    } catch {
      // já caiu
    }
    // dá um instante para o último trecho chegar, sem segurar o resto
    setTimeout(() => {
      try {
        ws.close()
      } catch {
        // já fechado
      }
    }, 1500)
  }

  private conectar(): void {
    if (this.parando) return
    this.aberto = false
    let ws: SoqueteMinimo
    try {
      ws = this.abrir(urlElevenLabs(this.op.idioma, this.op.pausaS), { 'xi-api-key': this.op.chave })
    } catch (e) {
      this.falhou(e instanceof Error ? e.message : String(e))
      return
    }
    this.ws = ws
    ws.onopen = () => {
      if (this.ws !== ws) return
      this.aberto = true
      this.falhasSeguidas = 0
      this.emit('conectado')
      for (const m of this.fila.splice(0)) ws.send(m)
    }
    ws.onmessage = (ev) => {
      if (this.ws !== ws && !this.parando) return
      const m = lerMensagem(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data as ArrayBuffer).toString('utf8'))
      if (m.tipo === 'parcial') this.emit('parcial', m.texto)
      else if (m.tipo === 'final') this.emit('final', m.texto)
      else if (m.tipo === 'erro') {
        if (m.fatal) {
          this.parar()
          this.emit('erro', m.mensagem)
        } else {
          // sessão longa demais, servidor ocupado…: reconecta
          try {
            ws.close()
          } catch {
            // segue
          }
        }
      }
    }
    ws.onerror = () => {
      // o 'close' vem logo depois e decide
    }
    ws.onclose = () => {
      if (this.ws !== ws) return
      this.ws = null
      if (this.parando) return
      this.falhou(this.aberto ? 'a conexão caiu' : 'não conectou')
    }
  }

  private falhou(motivo: string): void {
    if (this.parando) return
    this.aberto = false
    this.falhasSeguidas++
    const atraso = Math.min(10_000, 1000 * 2 ** Math.min(this.falhasSeguidas - 1, 4))
    this.emit('reconectando', motivo)
    const tentarDeNovo = () => {
      this.espera = setTimeout(() => {
        this.espera = null
        this.conectar()
      }, atraso)
    }
    // três falhas seguidas sem abrir: confere se é a chave (aí não adianta insistir)
    if (this.falhasSeguidas === 3) {
      void this.conferir(this.op.chave).then((r) => {
        if (this.parando) return
        if (r === 'recusada') {
          this.parar()
          this.emit('erro', MENSAGEM_FATAL.auth_error)
        } else tentarDeNovo()
      })
    } else tentarDeNovo()
  }
}
