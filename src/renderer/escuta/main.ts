/**
 * Janela oculta da Bíblia automática: abre o microfone escolhido e manda ao processo principal
 * quadros de 100 ms em PCM 16 bits, mono, 16 kHz. Só existe enquanto o modo automático está ligado.
 * Quem decide se há voz e se a transcrição abre é o processo principal.
 */
import type { PedidoEscuta } from '../../shared/ipc'

const api = window.api
const TAXA = 16000
const AMOSTRAS = 1600

/**
 * Processador do áudio (roda na thread de áudio). Converte para 16 kHz se o contexto não estiver nessa
 * taxa (interpolação linear) e junta 1600 amostras por quadro.
 */
const PROCESSADOR = `
class Pcm16k extends AudioWorkletProcessor {
  constructor() {
    super()
    this.passo = sampleRate / ${TAXA}
    // posição na entrada, relativa ao começo do bloco (-1 = última amostra do bloco anterior)
    this.pos = 0
    this.anterior = 0
    // passa-baixa simples antes de reduzir a taxa (sem ele, o agudo "dobra" e vira ruído na fala)
    this.alfa = 1 - Math.exp((-2 * Math.PI * 7000) / sampleRate)
    this.filtro = 0
    this.buf = new Int16Array(${AMOSTRAS})
    this.n = 0
  }
  empurrar(s) {
    const v = Math.max(-1, Math.min(1, s))
    this.buf[this.n++] = v < 0 ? v * 32768 : v * 32767
    if (this.n === ${AMOSTRAS}) {
      this.port.postMessage(this.buf.buffer, [this.buf.buffer])
      this.buf = new Int16Array(${AMOSTRAS})
      this.n = 0
    }
  }
  process(entradas) {
    const canal = entradas[0] && entradas[0][0]
    if (!canal) return true
    if (this.passo === 1) {
      for (let i = 0; i < canal.length; i++) this.empurrar(canal[i])
      return true
    }
    const filtrado = new Float32Array(canal.length)
    for (let i = 0; i < canal.length; i++) {
      this.filtro += this.alfa * (canal[i] - this.filtro)
      filtrado[i] = this.filtro
    }
    while (this.pos <= filtrado.length - 1) {
      const i = Math.floor(this.pos)
      const f = this.pos - i
      const a = i < 0 ? this.anterior : filtrado[i]
      const b = i + 1 < filtrado.length ? filtrado[i + 1] : a
      this.empurrar(a + (b - a) * f)
      this.pos += this.passo
    }
    this.pos -= filtrado.length
    this.anterior = filtrado[filtrado.length - 1]
    return true
  }
}
registerProcessor('pcm-16k', Pcm16k)
`

let fluxo: MediaStream | null = null
let contexto: AudioContext | null = null
let pedidoAtual = 0

async function parar(): Promise<void> {
  fluxo?.getTracks().forEach((t) => t.stop())
  fluxo = null
  const c = contexto
  contexto = null
  await c?.close().catch(() => {})
}

async function abrirMicrofone(microfone: string): Promise<MediaStream> {
  const restricoes = (id?: string): MediaStreamConstraints => ({
    audio: {
      ...(id ? { deviceId: { exact: id } } : {}),
      channelCount: 1,
      // a voz vem da mesa ou do microfone da sala como está: sem cancelar eco nem "melhorar"
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  })
  if (!microfone) return navigator.mediaDevices.getUserMedia(restricoes())
  try {
    return await navigator.mediaDevices.getUserMedia(restricoes(microfone))
  } catch (e) {
    // o microfone escolhido sumiu (desconectado): usa o padrão do Windows e avisa
    if ((e as DOMException)?.name !== 'OverconstrainedError' && (e as DOMException)?.name !== 'NotFoundError') throw e
    return navigator.mediaDevices.getUserMedia(restricoes())
  }
}

async function criarContexto(f: MediaStream): Promise<AudioContext> {
  const url = URL.createObjectURL(new Blob([PROCESSADOR], { type: 'application/javascript' }))
  const montar = async (ctx: AudioContext) => {
    await ctx.audioWorklet.addModule(url)
    const fonte = ctx.createMediaStreamSource(f)
    const no = new AudioWorkletNode(ctx, 'pcm-16k', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: 'explicit' })
    no.port.onmessage = (ev: MessageEvent<ArrayBuffer>) => api.enviarAudioEscuta(ev.data)
    // ligado a um volume zero: o navegador só processa o que chega até a saída (e nada sai na caixa)
    const mudo = ctx.createGain()
    mudo.gain.value = 0
    fonte.connect(no)
    no.connect(mudo)
    mudo.connect(ctx.destination)
    await ctx.resume()
    return ctx
  }
  try {
    return await montar(new AudioContext({ sampleRate: TAXA }))
  } catch {
    // alguns sistemas não abrem o contexto a 16 kHz: abre na taxa normal e o processador converte
    return await montar(new AudioContext())
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function iniciar(p: PedidoEscuta): Promise<void> {
  const meu = ++pedidoAtual
  await parar()
  try {
    const f = await abrirMicrofone(p.microfone)
    if (meu !== pedidoAtual) {
      f.getTracks().forEach((t) => t.stop())
      return
    }
    fluxo = f
    contexto = await criarContexto(f)
    const faixa = f.getAudioTracks()[0]
    faixa?.addEventListener('ended', () => api.statusEscuta({ ok: false, erro: 'O microfone foi desconectado.' }))
    const trocado = !!p.microfone && faixa?.getSettings().deviceId !== p.microfone
    api.statusEscuta({ ok: true, microfone: `${faixa?.label || 'Microfone padrão'}${trocado ? ' (o escolhido não foi encontrado)' : ''}` })
  } catch (e) {
    const nome = (e as DOMException)?.name
    const erro =
      nome === 'NotAllowedError'
        ? 'O Windows não deixou abrir o microfone (Configurações do Windows → Privacidade → Microfone: permitir apps da área de trabalho).'
        : nome === 'NotFoundError'
          ? 'Nenhum microfone encontrado neste computador.'
          : nome === 'NotReadableError'
            ? 'O microfone está em uso por outro programa ou com defeito.'
            : `Não consegui abrir o microfone: ${e instanceof Error ? e.message : String(e)}`
    api.statusEscuta({ ok: false, erro })
  }
}

api.aoPedidoEscuta((p) => {
  if (p) void iniciar(p)
  else {
    pedidoAtual++
    void parar()
  }
})
