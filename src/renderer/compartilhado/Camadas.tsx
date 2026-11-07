/**
 * Desenho de uma saída em camadas: fundo → conteúdo → sobreposições → logo/preto.
 * Usado pela janela de saída e, em escala, pela miniatura de reserva da tela de comando. Os tamanhos
 * usam unidades de contêiner (cqh/cqw), então a miniatura fica proporcional à saída real.
 */
import { Film } from 'lucide-react'
import { type CSSProperties, type ReactNode, type RefObject, useEffect, useRef, useState } from 'react'
import type { Ajuste, ConfigSaida, ConfigTelaEspera } from '../../shared/config'
import type { Conteudo, ControleMidia, EstadoSaida, Fundo, ModoTela, TelemetriaVideo } from '../../shared/estado'
import { urlMidia } from '../../shared/midia'
import { TextoAjustado } from './TextoAjustado'

const AJUSTE_CSS: Record<Ajuste, CSSProperties['objectFit']> = {
  ajustar: 'contain',
  preencher: 'cover',
  esticar: 'fill',
}

export interface PropsCamadas {
  saida: EstadoSaida
  config: ConfigSaida
  espera: ConfigTelaEspera
  transicaoMs: number
  /** resolução mostrada no padrão de teste */
  resolucao: string
  /** na miniatura o vídeo não é decodificado de novo: mostra só nome e posição */
  miniatura?: boolean
  /** posição do vídeo (de outra saída, quando esta não mostra vídeo) */
  telemetriaVideo?: TelemetriaVideo | null
  aoTelemetriaVideo?: (v: TelemetriaVideo | null) => void
  /** dispositivo de som (deviceId) para o vídeo */
  saidaAudio?: string
}

const COBRE_CONTEUDO: ModoTela[] = ['logo', 'preto']
const COBRE_LOGO: ModoTela[] = ['preto']

/** Último valor diferente do atual (para saber de onde a tela veio). */
function useTelaAnterior(tela: ModoTela): ModoTela {
  const r = useRef({ atual: tela, anterior: tela })
  if (r.current.atual !== tela) r.current = { atual: tela, anterior: r.current.atual }
  return r.current.anterior
}

/**
 * Transição de uma camada que fica embaixo de coberturas (logo, preto). Para nada "vazar" durante a
 * troca: se uma cobertura está entrando, a camada de baixo só muda depois que ela ficou opaca; se a
 * cobertura está saindo, a camada de baixo muda na hora, ainda escondida.
 */
function transicaoSobCobertura(tela: ModoTela, anterior: ModoTela, coberturas: ModoTela[], ms: number): string {
  if (ms <= 0) return 'none'
  if (coberturas.includes(tela)) return `opacity ${ms}ms ease ${ms}ms`
  if (coberturas.includes(anterior)) return 'none'
  return `opacity ${ms}ms ease`
}

export function Camadas(p: PropsCamadas) {
  const { saida, config, transicaoMs: ms } = p
  const anterior = useTelaAnterior(saida.tela)
  const ehTexto = saida.conteudo.tipo === 'letra' || saida.conteudo.tipo === 'versiculo'
  const semFundo = saida.conteudo.tipo === 'letra' && !config.musicaComFundo
  return (
    <div data-tela className="relative h-full w-full overflow-hidden" style={{ background: config.corFundo, containerType: 'size' }}>
      {!semFundo && <CamadaFundo fundo={saida.fundo} ms={ms} escurecer={ehTexto} />}
      <div
        className="absolute"
        style={{
          inset: `${config.margemPct}%`,
          opacity: saida.tela === 'limpar' ? 0 : 1,
          transition: transicaoSobCobertura(saida.tela, anterior, COBRE_CONTEUDO, ms),
        }}
      >
        <ConteudoComTransicao chave={saida.chave} conteudo={saida.conteudo} ms={ms}>
          {(conteudo, ativo) => (
            <CamadaConteudo
              conteudo={conteudo}
              ativo={ativo}
              config={config}
              controle={saida.video}
              resolucao={p.resolucao}
              miniatura={p.miniatura}
              telemetriaVideo={p.telemetriaVideo}
              aoTelemetriaVideo={p.aoTelemetriaVideo}
              saidaAudio={p.saidaAudio}
            />
          )}
        </ConteudoComTransicao>
      </div>
      {/* sobreposições (relógio, temporizador, QR…) entram aqui na Fase 6 */}
      <Cortina visivel={saida.tela === 'logo'} transicao={transicaoSobCobertura(saida.tela, anterior, COBRE_LOGO, ms)}>
        <TelaEspera espera={p.espera} />
      </Cortina>
      <Cortina visivel={saida.tela === 'preto'} transicao={ms > 0 ? `opacity ${ms}ms ease` : 'none'}>
        <div className="h-full w-full bg-black" />
      </Cortina>
    </div>
  )
}

function Cortina({ visivel, transicao, children }: { visivel: boolean; transicao: string; children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-0" style={{ opacity: visivel ? 1 : 0, transition: transicao }}>
      {children}
    </div>
  )
}

function CamadaFundo({ fundo, ms, escurecer }: { fundo: Fundo; ms: number; escurecer: boolean }) {
  if (fundo.tipo === 'nenhum') return null
  return (
    <>
      <img
        key={fundo.url}
        src={fundo.url}
        alt=""
        draggable={false}
        className="absolute inset-0 h-full w-full"
        style={{ objectFit: 'cover', animation: ms > 0 ? `entrar ${ms}ms ease both` : undefined }}
      />
      {/* escurece um pouco o fundo atrás de letra e versículo, para o texto ficar legível */}
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,.35)', opacity: escurecer ? 1 : 0, transition: `opacity ${ms}ms ease` }} />
    </>
  )
}

interface ItemTransicao {
  chave: number
  conteudo: Conteudo
  saindo: boolean
}

/** Mantém o conteúdo anterior enquanto ele esmaece e o novo aparece. */
function ConteudoComTransicao(props: { chave: number; conteudo: Conteudo; ms: number; children: (c: Conteudo, ativo: boolean) => ReactNode }) {
  const { chave, conteudo, ms } = props
  const [itens, setItens] = useState<ItemTransicao[]>(() => [{ chave, conteudo, saindo: false }])
  const ultimaChave = useRef(chave)

  useEffect(() => {
    if (ultimaChave.current === chave) return
    ultimaChave.current = chave
    if (ms <= 0) {
      setItens([{ chave, conteudo, saindo: false }])
      return
    }
    setItens((atual) => [...atual.map((i) => ({ ...i, saindo: true })), { chave, conteudo, saindo: false }])
    const t = setTimeout(() => setItens((atual) => atual.filter((i) => !i.saindo)), ms + 60)
    return () => clearTimeout(t)
    // o conteúdo só muda junto com a chave (o motor troca a chave a cada "mostrar")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, ms])

  return (
    <>
      {itens.map((i) => (
        <div
          key={i.chave}
          className="absolute inset-0"
          style={ms > 0 ? { animation: `${i.saindo ? 'sair' : 'entrar'} ${ms}ms ease both` } : undefined}
        >
          {props.children(i.conteudo, !i.saindo)}
        </div>
      ))}
    </>
  )
}

interface PropsConteudo {
  conteudo: Conteudo
  ativo: boolean
  config: ConfigSaida
  controle: ControleMidia
  resolucao: string
  miniatura?: boolean
  telemetriaVideo?: TelemetriaVideo | null
  aoTelemetriaVideo?: (v: TelemetriaVideo | null) => void
  saidaAudio?: string
}

const sombraTexto = (ligada: boolean) => (ligada ? '0 0.35cqh 1.2cqh rgba(0,0,0,.85), 0 0 0.35cqh rgba(0,0,0,.9)' : 'none')

function CamadaConteudo(p: PropsConteudo) {
  const c = p.conteudo
  const cfg = p.config
  switch (c.tipo) {
    case 'vazio':
      return null
    case 'teste':
      return <PadraoTeste nome={cfg.nome} resolucao={p.resolucao} />
    case 'texto':
      return (
        <div className="flex h-full w-full flex-col" style={{ padding: '6cqh 7cqw' }}>
          <div className="min-h-0 flex-1">
            <TextoAjustado
              chave={c.texto}
              maxPct={cfg.textoTamanhoMax}
              estilo={{ textAlign: 'center', fontWeight: 600, lineHeight: 1.25, color: '#fff', whiteSpace: 'pre-line', textShadow: sombraTexto(cfg.textoSombra) }}
            >
              {c.texto}
            </TextoAjustado>
          </div>
          {c.referencia && <Referencia texto={c.referencia} sombra={cfg.textoSombra} />}
        </div>
      )
    case 'letra': {
      const caixa = cfg.textoMaiusculas ? 'uppercase' : 'none'
      const intro = c.indice < 0
      return (
        <div className="flex h-full w-full flex-col" style={{ padding: '5cqh 6cqw' }}>
          <div className="min-h-0 flex-1">
            <TextoAjustado
              chave={c.texto}
              maxPct={cfg.textoTamanhoMax}
              estilo={{
                textAlign: 'center',
                fontWeight: intro ? 600 : 700,
                lineHeight: 1.2,
                color: intro ? 'rgba(255,255,255,.92)' : '#fff',
                whiteSpace: 'pre-line',
                textShadow: sombraTexto(cfg.textoSombra),
                textTransform: caixa,
              }}
            >
              {c.texto}
            </TextoAjustado>
          </div>
          {cfg.musicaMostrarProximo && c.proximo && (
            <div style={{ height: '19cqh', marginTop: '2cqh', borderTop: '0.3cqh solid rgba(255,255,255,.25)', paddingTop: '1.5cqh' }}>
              <TextoAjustado
                chave={c.proximo}
                maxPct={6.5}
                estilo={{ textAlign: 'center', fontWeight: 600, lineHeight: 1.2, color: 'rgba(255,255,255,.6)', whiteSpace: 'pre-line', textTransform: caixa }}
              >
                {c.proximo}
              </TextoAjustado>
            </div>
          )}
        </div>
      )
    }
    case 'versiculo':
      return (
        <div className="flex h-full w-full flex-col" style={{ padding: '5cqh 6cqw' }}>
          <div className="min-h-0 flex-1">
            <TextoAjustado
              chave={c.texto + (c.segundo?.texto ?? '')}
              maxPct={cfg.textoTamanhoMax}
              estilo={{
                textAlign: 'center',
                fontWeight: 600,
                lineHeight: 1.3,
                color: '#fff',
                textShadow: sombraTexto(cfg.textoSombra),
                textTransform: cfg.textoMaiusculas ? 'uppercase' : 'none',
              }}
            >
              {c.texto}
              {c.segundo && (
                <span style={{ display: 'block', marginTop: '0.7em', fontSize: '0.82em', color: 'rgba(255,255,255,.82)' }}>{c.segundo.texto}</span>
              )}
            </TextoAjustado>
          </div>
          <Referencia texto={c.segundo ? `${c.referencia} · ${c.segundo.referencia}` : c.referencia} sombra={cfg.textoSombra} />
        </div>
      )
    case 'imagem':
      return <img src={c.url} alt="" draggable={false} className="h-full w-full" style={{ objectFit: AJUSTE_CSS[cfg.ajuste] }} />
    case 'video':
      if (p.miniatura || !cfg.mostrarVideo) return <VideoResumido nome={c.nome} telemetria={p.telemetriaVideo} />
      return (
        <VideoSaida
          url={c.url}
          ajuste={AJUSTE_CSS[cfg.ajuste]}
          controle={p.controle}
          ativo={p.ativo}
          aoTelemetria={p.aoTelemetriaVideo}
          saidaAudio={p.saidaAudio}
        />
      )
  }
}

function Referencia({ texto, sombra }: { texto: string; sombra: boolean }) {
  return (
    <div style={{ marginTop: '2.5cqh', textAlign: 'center', fontSize: '4.4cqh', fontWeight: 600, color: 'rgba(255,255,255,.88)', textShadow: sombraTexto(sombra) }}>
      {texto}
    </div>
  )
}

/** Aplica o controle (tocar/pausar/buscar/volume/repetir) num elemento de áudio ou vídeo. */
export function useControleMidia(ref: RefObject<HTMLMediaElement | null>, controle: ControleMidia, ativo: boolean, saidaAudio?: string) {
  useEffect(() => {
    const m = ref.current
    if (!m) return
    m.volume = controle.volume
    m.muted = controle.mudo
    m.loop = controle.repetir
  }, [ref, controle.volume, controle.mudo, controle.repetir])

  useEffect(() => {
    const m = ref.current
    if (!m || !ativo) return
    if (controle.tocando) m.play().catch(() => {})
    else m.pause()
  }, [ref, controle.tocando, controle.ordem, ativo])

  const buscaInicial = useRef(controle.busca.seq)
  useEffect(() => {
    const m = ref.current
    if (!m || controle.busca.seq === buscaInicial.current) return
    buscaInicial.current = controle.busca.seq
    const alvo = controle.busca.relativo ? m.currentTime + controle.busca.segundos : controle.busca.segundos
    const limite = Number.isFinite(m.duration) ? m.duration : alvo
    m.currentTime = Math.min(Math.max(0, alvo), Math.max(0, limite - 0.05))
    if (controle.tocando) m.play().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, controle.busca.seq])

  useEffect(() => {
    const m = ref.current as (HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> }) | null
    if (!m?.setSinkId || saidaAudio === undefined) return
    m.setSinkId(saidaAudio).catch(() => m.setSinkId?.('').catch(() => {}))
  }, [ref, saidaAudio])
}

/** Telemetria a cada 250 ms (posição, duração, quadros perdidos). */
export function useTelemetriaMidia(ref: RefObject<HTMLMediaElement | null>, ativo: boolean, enviar?: (v: TelemetriaVideo | null) => void) {
  useEffect(() => {
    if (!enviar || !ativo) return
    const id = setInterval(() => {
      const m = ref.current
      if (!m) return
      const q = m instanceof HTMLVideoElement ? m.getVideoPlaybackQuality() : null
      enviar({
        posicao: m.currentTime,
        duracao: Number.isFinite(m.duration) ? m.duration : 0,
        tocando: !m.paused && !m.ended,
        quadros: q?.totalVideoFrames ?? 0,
        perdidos: q?.droppedVideoFrames ?? 0,
      })
    }, 250)
    return () => clearInterval(id)
  }, [ref, ativo, enviar])
}

function VideoSaida(p: {
  url: string
  ajuste: CSSProperties['objectFit']
  controle: ControleMidia
  ativo: boolean
  aoTelemetria?: (v: TelemetriaVideo | null) => void
  saidaAudio?: string
}) {
  const ref = useRef<HTMLVideoElement>(null)
  useControleMidia(ref, p.controle, p.ativo, p.saidaAudio)
  useTelemetriaMidia(ref, p.ativo, p.aoTelemetria)
  return <video ref={ref} src={p.url} autoPlay={p.controle.tocando} playsInline className="h-full w-full" style={{ objectFit: p.ajuste }} />
}

export function formatarTempo(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60)
  const seg = Math.floor(s % 60)
  return `${m}:${String(seg).padStart(2, '0')}`
}

/** Vídeo sem decodificar: nome, tempo que falta e barra de progresso (Palco e miniatura de reserva). */
function VideoResumido({ nome, telemetria }: { nome: string; telemetria?: TelemetriaVideo | null }) {
  const pct = telemetria && telemetria.duracao > 0 ? (telemetria.posicao / telemetria.duracao) * 100 : 0
  const falta = telemetria ? telemetria.duracao - telemetria.posicao : null
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-[#0b0d12] text-white" style={{ gap: '3cqh' }}>
      <Film style={{ width: '14cqh', height: '14cqh', opacity: 0.6 }} />
      <div style={{ fontSize: '7cqh', fontWeight: 600, maxWidth: '90%' }} className="truncate">
        {nome}
      </div>
      {telemetria && falta !== null && (
        <div style={{ fontSize: '9cqh', fontWeight: 700, fontVariantNumeric: 'tabular-nums', opacity: 0.9 }}>
          {telemetria.tocando ? '▶' : '❚❚'} −{formatarTempo(falta)}
        </div>
      )}
      <div className="absolute bottom-0 left-0 bg-[#4f8cff]" style={{ height: '2.5cqh', width: `${pct}%` }} />
    </div>
  )
}

export function TelaEspera({ espera }: { espera: ConfigTelaEspera }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center text-center" style={{ background: espera.corFundo, color: espera.corTexto }}>
      {espera.imagem ? (
        <img src={urlMidia(espera.imagem)} alt="" draggable={false} style={{ maxWidth: '70%', maxHeight: '70%', objectFit: 'contain' }} />
      ) : (
        <>
          <div style={{ fontSize: '12cqh', fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.1 }}>{espera.texto}</div>
          {espera.subtitulo && <div style={{ fontSize: '4.6cqh', opacity: 0.7, marginTop: '2.5cqh' }}>{espera.subtitulo}</div>}
        </>
      )}
    </div>
  )
}

/**
 * Padrão para conferir o projetor: o círculo tem que ficar redondo (proporção certa), as setas dos
 * cantos visíveis (nada cortado) e a barra tem que correr sem trancos (desempenho).
 */
function PadraoTeste({ nome, resolucao }: { nome: string; resolucao: string }) {
  const [segundos, setSegundos] = useState(0)
  useEffect(() => {
    const inicio = Date.now()
    const id = setInterval(() => setSegundos(Math.floor((Date.now() - inicio) / 1000)), 250)
    return () => clearInterval(id)
  }, [])
  const grade =
    'repeating-linear-gradient(to right, rgba(255,255,255,.12) 0 1px, transparent 1px 10%),' +
    'repeating-linear-gradient(to bottom, rgba(255,255,255,.12) 0 1px, transparent 1px 10%)'
  const cores = ['#ffffff', '#ffff00', '#00ffff', '#00ff00', '#ff00ff', '#ff0000', '#0000ff', '#000000']
  const canto = (pos: CSSProperties, seta: string) => (
    <div className="absolute font-bold text-white" style={{ ...pos, fontSize: '6cqh', lineHeight: 1 }}>
      {seta}
    </div>
  )
  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: '#15181f', backgroundImage: grade }}>
      <div className="absolute inset-0" style={{ border: '0.6cqh solid #4f8cff' }} />
      {canto({ left: '1.2cqh', top: '0.6cqh' }, '↖')}
      {canto({ right: '1.2cqh', top: '0.6cqh' }, '↗')}
      {canto({ left: '1.2cqh', bottom: '0.6cqh' }, '↙')}
      {canto({ right: '1.2cqh', bottom: '0.6cqh' }, '↘')}
      <div
        className="absolute left-1/2 top-1/2 rounded-full"
        style={{ width: '70cqh', height: '70cqh', transform: 'translate(-50%, -50%)', border: '0.5cqh solid rgba(255,255,255,.8)' }}
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-white">
        <div style={{ fontSize: '11cqh', fontWeight: 700, lineHeight: 1.05 }}>{nome}</div>
        <div style={{ fontSize: '5.5cqh', opacity: 0.85, marginTop: '1.5cqh' }}>{resolucao}</div>
        <div style={{ fontSize: '4cqh', opacity: 0.6, marginTop: '1cqh', fontVariantNumeric: 'tabular-nums' }}>{segundos} s</div>
      </div>
      <div className="absolute flex" style={{ left: '20%', right: '20%', bottom: '9cqh', height: '6cqh' }}>
        {cores.map((c) => (
          <div key={c} className="flex-1" style={{ background: c, outline: '1px solid rgba(255,255,255,.25)' }} />
        ))}
      </div>
      <div className="absolute" style={{ top: 0, bottom: 0, width: '1.2cqw', background: '#f5a524', animation: 'varrer 4s linear infinite' }} />
    </div>
  )
}
