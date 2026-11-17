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
      this.emit('erro', MENSAGENS[tipo] ?? `ElevenLabs (${tipo || 'erro'}): ${String(msg.error)}`, fatal)
      if (fatal) this.fecharJa()
    }
  }
}

const MENSAGENS: Record<string, string> = {
  auth_error: 'O ElevenLabs recusou a chave. Em Configurações → Bíblia automática, "Testar o ElevenLabs" mostra o motivo.',
  quota_exceeded: 'Acabaram os créditos do ElevenLabs.',
  unaccepted_terms: 'Falta aceitar os termos de uso no site do ElevenLabs.',
}

/** Chave de API do ElevenLabs: "sk_" + letras e números (51 caracteres hoje). */
export const pareceChaveElevenLabs = (chave: string) => /^sk_[A-Za-z0-9]{20,}$/.test(chave)

/**
 * Por que o ElevenLabs recusou a chave. A transcrição em tempo real só diz "You must be authenticated" (igual sem
 * chave e com chave errada); a API comum diz o motivo. null se não deu para perguntar.
 */
export async function explicarChaveElevenLabs(chave: string, buscar: (url: string, init?: RequestInit) => Promise<Response>): Promise<string | null> {
  try {
    const r = await buscar('https://api.elevenlabs.io/v1/user', { headers: { 'xi-api-key': chave }, signal: AbortSignal.timeout(10_000) })
    if (r.ok) return 'A chave é válida, mas o ElevenLabs não liberou a transcrição para ela: na página da chave (Developers → API Keys), ligue a permissão "Speech to Text".'
    const j = (await r.json().catch(() => null)) as { detail?: { status?: string; message?: string } } | null
    switch (j?.detail?.status) {
      // o caso do usuário em 16/11: colou o ID da chave (64 caracteres) no lugar da chave
      case 'api_key_id_used_as_api_key':
        return 'Isto é o ID da chave, não a chave. No ElevenLabs a chave (começa com sk_) só aparece uma vez, quando é criada: em elevenlabs.io → Developers → API Keys, crie uma nova (ou renove a atual), copie a que começa com sk_ e cole aqui.'
      case 'invalid_api_key':
        return 'O ElevenLabs não reconhece esta chave (apagada, de outra conta ou copiada pela metade). Crie uma nova em elevenlabs.io → Developers → API Keys e cole aqui.'
      case 'missing_permissions':
        return 'A chave existe, mas está sem permissão: na página dela (Developers → API Keys), ligue "Speech to Text".'
      case 'needs_authorization':
        return 'A chave não chegou ao ElevenLabs.'
      case 'quota_exceeded':
        return 'Acabaram os créditos do ElevenLabs.'
      default:
        return `O ElevenLabs recusou a chave: ${j?.detail?.message ?? `HTTP ${r.status}`}.`
    }
  } catch {
    return null
  }
}
