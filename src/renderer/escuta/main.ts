/**
 * Janela oculta da escuta: abre o microfone (ou a entrada de linha) escolhido, converte para PCM de
 * 16 bits a 16 kHz e manda ao processo principal, que repassa à ElevenLabs. Só existe enquanto
 * "ouvir e sugerir" está ligado; fechar a janela solta o microfone.
 */
const api = window.api
const microfone = new URLSearchParams(location.search).get('mic') ?? ''
const TAXA = 16000

function mensagemDeErro(e: unknown): string {
  const nome = (e as { name?: string } | null)?.name ?? ''
  if (nome === 'NotAllowedError' || nome === 'SecurityError')
    return 'O Windows não deixou usar o microfone. Em Configurações do Windows → Privacidade → Microfone, ligue "Permitir que aplicativos da área de trabalho acessem o microfone".'
  if (nome === 'OverconstrainedError') return 'O microfone escolhido não está conectado. Escolha outro em Configurações → Sugestões de versículos.'
  if (nome === 'NotFoundError') return 'Nenhum microfone ou entrada de áudio conectado a este computador.'
  if (nome === 'NotReadableError') return 'O microfone está ocupado por outro programa (ou deu erro no Windows).'
  return `Não consegui abrir o microfone: ${e instanceof Error ? e.message : String(e)}`
}

/** Converte um bloco para 16 kHz (média simples das amostras de cada intervalo; voz não precisa de mais). */
function reamostrar(f: Float32Array, taxa: number): Float32Array {
  if (taxa === TAXA) return f
  const razao = taxa / TAXA
  const n = Math.floor(f.length / razao)
  const r = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const ini = Math.floor(i * razao)
    const fim = Math.max(ini + 1, Math.floor((i + 1) * razao))
    let s = 0
    for (let k = ini; k < fim && k < f.length; k++) s += f[k]!
    r[i] = s / (fim - ini)
  }
  return r
}

async function iniciar(): Promise<void> {
  let fluxo: MediaStream
  try {
    fluxo = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...(microfone ? { deviceId: { exact: microfone } } : {}),
        channelCount: 1,
        // voz da mesa de som: sem cancelamento de eco nem supressão de ruído (deformam a fala)
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: true,
      },
    })
  } catch (e) {
    api.avisarEscuta({ ok: false, erro: mensagemDeErro(e) })
    return
  }
  const trilha = fluxo.getAudioTracks()[0]
  trilha?.addEventListener('ended', () => api.avisarEscuta({ ok: false, erro: 'O microfone foi desconectado.' }))

  try {
    // o próprio Chromium converte para 16 kHz; se não der, converte aqui
    let ctx: AudioContext
    let fonte: MediaStreamAudioSourceNode
    try {
      ctx = new AudioContext({ sampleRate: TAXA })
      fonte = ctx.createMediaStreamSource(fluxo)
    } catch {
      ctx = new AudioContext()
      fonte = ctx.createMediaStreamSource(fluxo)
    }
    const taxa = ctx.sampleRate
    // 2048 amostras = 128 ms a 16 kHz
    const processador = ctx.createScriptProcessor(taxa > 24000 ? 4096 : 2048, 1, 1)
    // o processador só trabalha ligado à saída; o ganho zero não deixa o som sair nas caixas
    const silencio = ctx.createGain()
    silencio.gain.value = 0
    processador.onaudioprocess = (ev) => {
      const f = reamostrar(ev.inputBuffer.getChannelData(0), taxa)
      const pcm = new Int16Array(f.length)
      for (let i = 0; i < f.length; i++) {
        const s = Math.max(-1, Math.min(1, f[i]!))
        pcm[i] = s < 0 ? s * 32768 : s * 32767
      }
      api.enviarAudioEscuta(new Uint8Array(pcm.buffer))
    }
    fonte.connect(processador)
    processador.connect(silencio)
    silencio.connect(ctx.destination)
    if (ctx.state !== 'running') await ctx.resume().catch(() => {})
    api.avisarEscuta({ ok: true, dispositivo: trilha?.label ?? '' })
  } catch (e) {
    for (const t of fluxo.getTracks()) t.stop()
    api.avisarEscuta({ ok: false, erro: `Não consegui ler o áudio do microfone: ${e instanceof Error ? e.message : String(e)}` })
  }
}

void iniciar()
