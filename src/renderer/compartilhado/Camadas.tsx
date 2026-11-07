/**
 * Desenho de uma saída em camadas: fundo → conteúdo → sobreposições → logo/preto.
 * Usado pela janela de saída e, em escala, pelas miniaturas da tela de comando. Os tamanhos usam
 * unidades de contêiner (cqh/cqw), então a miniatura fica proporcional à saída real.
 */
import { Film } from 'lucide-react'
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react'
import type { Ajuste, ConfigSaida, ConfigTelaEspera } from '../../shared/config'
import type { Conteudo, ControleVideo, EstadoSaida, Fundo, ModoTela, TelemetriaVideo } from '../../shared/estado'
import { urlMidia } from '../../shared/midia'

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
  telemetriaVideo?: TelemetriaVideo | null
  aoTelemetriaVideo?: (v: TelemetriaVideo | null) => void
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
  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ background: config.corFundo, containerType: 'size' }}
    >
      <CamadaFundo fundo={saida.fundo} ms={ms} />
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
              ajuste={AJUSTE_CSS[config.ajuste]}
              controle={saida.video}
              nomeSaida={config.nome}
              resolucao={p.resolucao}
              miniatura={p.miniatura}
              telemetriaVideo={p.telemetriaVideo}
              aoTelemetriaVideo={p.aoTelemetriaVideo}
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
    <div
      className="pointer-events-none absolute inset-0"
      style={{ opacity: visivel ? 1 : 0, transition: transicao }}
    >
      {children}
    </div>
  )
}

function CamadaFundo({ fundo, ms }: { fundo: Fundo; ms: number }) {
  if (fundo.tipo === 'nenhum') return null
  return (
    <img
      key={fundo.url}
      src={fundo.url}
      alt=""
      draggable={false}
      className="absolute inset-0 h-full w-full"
      style={{ objectFit: 'cover', animation: ms > 0 ? `entrar ${ms}ms ease both` : undefined }}
    />
  )
}

interface ItemTransicao {
  chave: number
  conteudo: Conteudo
  saindo: boolean
}

/** Mantém o conteúdo anterior enquanto ele esmaece e o novo aparece. */
function ConteudoComTransicao(props: {
  chave: number
  conteudo: Conteudo
  ms: number
  children: (c: Conteudo, ativo: boolean) => ReactNode
}) {
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
  ajuste: CSSProperties['objectFit']
  controle: ControleVideo
  nomeSaida: string
  resolucao: string
  miniatura?: boolean
  telemetriaVideo?: TelemetriaVideo | null
  aoTelemetriaVideo?: (v: TelemetriaVideo | null) => void
}

function CamadaConteudo(p: PropsConteudo) {
  const c = p.conteudo
  switch (c.tipo) {
    case 'vazio':
      return null
    case 'teste':
      return <PadraoTeste nome={p.nomeSaida} resolucao={p.resolucao} />
    case 'texto':
      return (
        <div className="flex h-full w-full flex-col items-center justify-center text-center" style={{ padding: '6cqh 7cqw' }}>
          <p
            style={{
              margin: 0,
              fontSize: '8.5cqh',
              lineHeight: 1.25,
              fontWeight: 600,
              color: '#fff',
              whiteSpace: 'pre-line',
              textShadow: '0 0.4cqh 1.4cqh rgba(0,0,0,.85)',
            }}
          >
            {c.texto}
          </p>
          {c.referencia && (
            <p style={{ margin: '3.5cqh 0 0', fontSize: '4.6cqh', color: 'rgba(255,255,255,.85)', fontWeight: 500 }}>
              {c.referencia}
            </p>
          )}
        </div>
      )
    case 'imagem':
      return <img src={c.url} alt="" draggable={false} className="h-full w-full" style={{ objectFit: p.ajuste }} />
    case 'video':
      if (p.miniatura) return <VideoNaMiniatura nome={c.nome} telemetria={p.telemetriaVideo} />
      return (
        <VideoSaida
          url={c.url}
          loop={c.loop}
          ajuste={p.ajuste}
          controle={p.controle}
          ativo={p.ativo}
          aoTelemetria={p.aoTelemetriaVideo}
        />
      )
  }
}

function VideoSaida(p: {
  url: string
  loop: boolean
  ajuste: CSSProperties['objectFit']
  controle: ControleVideo
  ativo: boolean
  aoTelemetria?: (v: TelemetriaVideo | null) => void
}) {
  const ref = useRef<HTMLVideoElement>(null)
  const { controle, ativo, aoTelemetria } = p

  useEffect(() => {
    const v = ref.current
    if (!v) return
    v.volume = controle.volume
    v.muted = controle.mudo
  }, [controle.volume, controle.mudo])

  useEffect(() => {
    const v = ref.current
    if (!v || !ativo) return
    if (controle.tocando) v.play().catch(() => {})
    else v.pause()
  }, [controle.tocando, ativo])

  const reinicioInicial = useRef(controle.reinicio)
  useEffect(() => {
    const v = ref.current
    if (!v || controle.reinicio === reinicioInicial.current) return
    v.currentTime = 0
    v.play().catch(() => {})
  }, [controle.reinicio])

  useEffect(() => {
    if (!aoTelemetria || !ativo) return
    const id = setInterval(() => {
      const v = ref.current
      if (!v) return
      const q = v.getVideoPlaybackQuality()
      aoTelemetria({
        posicao: v.currentTime,
        duracao: Number.isFinite(v.duration) ? v.duration : 0,
        tocando: !v.paused && !v.ended,
        quadros: q.totalVideoFrames,
        perdidos: q.droppedVideoFrames,
      })
    }, 250)
    return () => clearInterval(id)
  }, [aoTelemetria, ativo])

  return (
    <video
      ref={ref}
      src={p.url}
      autoPlay={controle.tocando}
      loop={p.loop}
      playsInline
      className="h-full w-full"
      style={{ objectFit: p.ajuste }}
    />
  )
}

export function formatarTempo(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60)
  const seg = Math.floor(s % 60)
  return `${m}:${String(seg).padStart(2, '0')}`
}

function VideoNaMiniatura({ nome, telemetria }: { nome: string; telemetria?: TelemetriaVideo | null }) {
  const pct = telemetria && telemetria.duracao > 0 ? (telemetria.posicao / telemetria.duracao) * 100 : 0
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-[#0b0d12] text-white" style={{ gap: '3cqh' }}>
      <Film style={{ width: '16cqh', height: '16cqh', opacity: 0.7 }} />
      <div style={{ fontSize: '7cqh', fontWeight: 600, maxWidth: '90%' }} className="truncate">
        {nome}
      </div>
      {telemetria && (
        <div style={{ fontSize: '6cqh', opacity: 0.75 }}>
          {telemetria.tocando ? '▶' : '❚❚'} {formatarTempo(telemetria.posicao)} / {formatarTempo(telemetria.duracao)}
        </div>
      )}
      <div className="absolute bottom-0 left-0 h-[3cqh] bg-destaque" style={{ width: `${pct}%` }} />
    </div>
  )
}

export function TelaEspera({ espera }: { espera: ConfigTelaEspera }) {
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center text-center"
      style={{ background: espera.corFundo, color: espera.corTexto }}
    >
      {espera.imagem ? (
        <img
          src={urlMidia(espera.imagem)}
          alt=""
          draggable={false}
          style={{ maxWidth: '70%', maxHeight: '70%', objectFit: 'contain' }}
        />
      ) : (
        <>
          <div style={{ fontSize: '12cqh', fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.1 }}>{espera.texto}</div>
          {espera.subtitulo && (
            <div style={{ fontSize: '4.6cqh', opacity: 0.7, marginTop: '2.5cqh' }}>{espera.subtitulo}</div>
          )}
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
