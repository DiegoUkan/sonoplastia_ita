/**
 * Transcrição na nuvem com ElevenLabs Scribe v2 Realtime (WebSocket). Porta de `stt/elevenlabs.py`.
 * O servidor detecta as pausas (commit_strategy=vad) e manda texto parcial enquanto a pessoa fala.
 * Uma conexão vale enquanto alguém fala: o serviço abre na voz e fecha depois do silêncio (economia).
 * Docs: https://elevenlabs.io/docs/api-reference/speech-to-text/v-1-speech-to-text-realtime
 */
import { EventEmitter } from 'node:events'
import { TAXA_AMOSTRAS } from '../../shared/transcricao/voz'

export const URL_ELEVENLABS = 'wss://api.elevenlabs.io/v1/speech-to-text/realtime'
export const MODELO_ELEVENLABS = 'scribe_v2_realtime'

/** erros em que não adianta reconectar */
const ERROS_FATAIS = new Set(['auth_error', 'quota_exceeded', 'unaccepted_terms', 'invalid_request', 'input_error', 'chunk_size_exceeded'])
/** áudio guardado enquanto a conexão abre (30 s) */
const MAX_FILA = 300

export interface OpcoesElevenLabs {
  chave: string
  idioma?: string
  /** silêncio que fecha uma frase no servidor */
  pausaS?: number
  /** outro endereço (testes) */
  url?: string
}

export type CriarSoquete = (url: string, cabecalhos: Record<string, string>) => WebSocket

/** WebSocket do Node (undici): aceita cabeçalhos, o do navegador não. */
const soqueteDoNode: CriarSoquete = (url, cabecalhos) => new WebSocket(url, { headers: cabecalhos } as unknown as string[])

export function urlElevenLabs(o: OpcoesElevenLabs): string {
  const p = new URLSearchParams([
    ['model_id', MODELO_ELEVENLABS],
    ['audio_format', `pcm_${TAXA_AMOSTRAS}`],
    ['language_code', o.idioma ?? 'pt'],
    ['commit_strategy', 'vad'],
    ['vad_silence_threshold_secs', String(o.pausaS ?? 0.8)],
  ])
  return `${o.url ?? URL_ELEVENLABS}?${p}`
}

/**
 * Uma sessão de transcrição. Eventos:
 *   'aberta'
 *   'parcial' (texto)          o que está sendo falado (muda até virar final)
 *   'final' (texto)            frase fechada (texto pode vir vazio)
 *   'erro' (mensagem, fatal)
 *   'fechada' (inesperado)     inesperado = não foi `encerrar()`/`fecharJa()`
 */
export class ConexaoElevenLabs extends EventEmitter {
  private readonly ws: WebSocket
  private fila: string[] = []
  private aberta = false
  private encerrando = false
  private fechada = false
  /** já abriu alguma vez (para saber se a falha foi na abertura) */
  abriu = false

  constructor(o: OpcoesElevenLabs, criar: CriarSoquete = soqueteDoNode) {
    super()
    this.ws = criar(urlElevenLabs(o), { 'xi-api-key': o.chave })
    this.ws.onopen = () => {
      this.aberta = true
      this.abriu = true
      for (const m of this.fila) this.ws.send(m)
      this.fila = []
      this.emit('aberta')
    }
    this.ws.onmessage = (ev) => this.receber(ev.data)
    this.ws.onerror = () => {
      // o 'close' vem logo depois
    }
    this.ws.onclose = () => {
      this.aberta = false
      this.fechada = true
      this.emit('fechada', !this.encerrando)
    }
  }

  get estaFechada(): boolean {
    return this.fechada
  }

  /** PCM 16 bits mono 16 kHz. Antes de abrir, fica na fila. */
  enviar(pcm: Int16Array): void {
    if (this.fechada || this.encerrando) return
    const msg = JSON.stringify({
      message_type: 'input_audio_chunk',
      audio_base_64: Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength).toString('base64'),
      commit: false,
      sample_rate: TAXA_AMOSTRAS,
    })
    if (this.aberta) this.ws.send(msg)
    else {
      this.fila.push(msg)
      if (this.fila.length > MAX_FILA) this.fila.shift()
    }
  }

  /** Pede o texto final do que falta, espera por ele (até 3 s) e fecha. */
  async encerrar(): Promise<void> {
    if (this.fechada || this.encerrando) return
    this.encerrando = true
    if (!this.aberta) {
      this.fecharSoquete()
      return
    }
    await new Promise<void>((resolver) => {
      const fim = () => {
        clearTimeout(t)
        this.off('final', fim)
        this.off('fechada', fim)
        resolver()
      }
      const t = setTimeout(fim, 3000)
      this.once('final', fim)
      this.once('fechada', fim)
      try {
        this.ws.send(JSON.stringify({ message_type: 'input_audio_chunk', audio_base_64: '', commit: true, sample_rate: TAXA_AMOSTRAS }))
      } catch {
        fim()
      }
    })
    this.fecharSoquete()
  }

  fecharJa(): void {
    this.encerrando = true
    this.fecharSoquete()
  }

  private fecharSoquete(): void {
    try {
      this.ws.close(1000)
    } catch {
      // já fechado
    }
  }

  private receber(dado: unknown): void {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(typeof dado === 'string' ? dado : Buffer.from(dado as ArrayBuffer).toString('utf8')) as Record<string, unknown>
    } catch {
      return
    }
    const tipo = String(msg.message_type ?? '')
    const texto = String(msg.text ?? '').trim()
    if (tipo === 'partial_transcript') {
      if (texto) this.emit('parcial', texto)
    } else if (tipo === 'committed_transcript') {
      this.emit('final', texto)
    } else if ('error' in msg) {
      const fatal = ERROS_FATAIS.has(tipo)
      this.emit('erro', `ElevenLabs (${tipo || 'erro'}): ${String(msg.error)}`, fatal)
      if (fatal) this.fecharJa()
    }
  }
}
