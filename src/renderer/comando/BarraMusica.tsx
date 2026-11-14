/**
 * Barra da música no ar (página Músicas): tocar/pausar, onde o áudio está, com uma marca no começo de
 * cada trecho (clicar ou arrastar pula), o trecho atual ("15/50") e "seguir o áudio".
 * No modo manual não há áudio: a barra mostra em que trecho está e clicar vai para o trecho daquele ponto.
 */
import { Hand, Pause, Play, Square } from 'lucide-react'
import { useRef, useState } from 'react'
import { AUDIO, type EstadoMotor, type TelemetriaVideo, type VersaoMusica } from '../../shared/estado'
import { formatarTempo } from '../compartilhado/Camadas'
import { api } from '../compartilhado/ganchos'
import { Botao, Interruptor } from './ui'

export const NOMES_VERSAO: Record<VersaoMusica, string> = { cantado: 'Cantado', playback: 'Playback', manual: 'Manual' }

const pct = (x: number) => `${Math.min(1, Math.max(0, x)) * 100}%`

export function BarraMusicaNoAr({
  estado,
  telemetria,
  selecionada,
  aoAbrir,
  tentar,
}: {
  estado: EstadoMotor
  /** telemetria da janela de áudio */
  telemetria: TelemetriaVideo | null
  /** a música no ar é a que está aberta na página */
  selecionada: boolean
  aoAbrir: () => void
  tentar: (p: Promise<unknown>) => void
}) {
  const m = estado.musica
  if (!m) return null
  const f = estado.audio.fonte
  const comAudio = m.versao !== 'manual' && f?.tipo === 'musica' && f.musicaId === m.musicaId
  const duracao = comAudio ? (telemetria?.duracao ?? 0) : 0
  const posicao = comAudio ? (telemetria?.posicao ?? 0) : 0
  const tocando = comAudio && (telemetria ? telemetria.tocando : estado.audio.controle.tocando)
  const total = m.slides.length
  const i = m.indice

  // trilha: pelo tempo do áudio, ou (manual / áudio ainda carregando) pelos trechos
  let trilha: { valor: number; marcas: number[]; faixa: [number, number] | null; escolher: (x: number) => void; rotulo: (x: number) => string }
  if (comAudio && duracao > 0) {
    const inicio = (k: number) => (k < 0 ? 0 : (m.slides[k]?.ms ?? 0) / 1000)
    const proximoInicio = m.slides.slice(i + 1).find((s) => s.ms > 0)
    trilha = {
      valor: posicao / duracao,
      marcas: m.slides.map((s) => s.ms / 1000 / duracao).filter((x) => x > 0 && x < 1),
      faixa: [inicio(i) / duracao, proximoInicio ? proximoInicio.ms / 1000 / duracao : 1],
      escolher: (x) => tentar(api.comando({ tipo: 'buscar', alvo: AUDIO, segundos: x * duracao })),
      rotulo: (x) => formatarTempo(x * duracao),
    }
  } else {
    const trechoEm = (x: number) => Math.min(total - 1, Math.floor(x * total))
    trilha = {
      valor: total ? (i + 1) / total : 0,
      marcas: Array.from({ length: Math.max(0, total - 1) }, (_, k) => (k + 1) / total),
      faixa: i >= 0 && total ? [i / total, (i + 1) / total] : null,
      escolher: (x) => tentar(api.comando({ tipo: 'musica:slide', indice: trechoEm(x), origem: 'operador' })),
      rotulo: (x) => `Trecho ${trechoEm(x) + 1}`,
    }
  }

  return (
    <div className="flex items-center gap-3 border-b border-borda bg-painel-2 px-4 py-2">
      {comAudio ? (
        <Botao
          variante="primario"
          icone={tocando ? Pause : Play}
          className="w-10"
          title={tocando ? 'Pausar a música' : 'Continuar a música'}
          onClick={(e) => {
            e.currentTarget.blur()
            tentar(api.comando({ tipo: 'midia', alvo: AUDIO, acao: tocando ? 'pausar' : 'tocar' }))
          }}
        />
      ) : (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-borda bg-painel text-suave" title="Manual: sem áudio, o operador passa os trechos">
          <Hand className="size-4" />
        </span>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[13px]">
          <span className="size-2 shrink-0 rounded-full bg-ok" title="No ar" />
          <span className="truncate font-semibold">{m.titulo}</span>
          <span className="shrink-0 text-xs text-suave">{NOMES_VERSAO[m.versao]}</span>
          {!selecionada && (
            <>
              <button type="button" className="shrink-0 cursor-pointer text-xs font-medium text-destaque-texto hover:underline" onClick={aoAbrir}>
                abrir
              </button>
              <Botao
                tamanho="xs"
                variante="fantasma"
                icone={Square}
                className="ml-auto"
                title="Fechar a música"
                onClick={() => tentar(api.comando({ tipo: 'musica:fechar' }))}
              />
            </>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          {comAudio && <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-suave">{formatarTempo(posicao)}</span>}
          <Trilha {...trilha} desativado={comAudio ? duracao <= 0 : total === 0} rotuloAria={comAudio ? 'Posição da música' : 'Trecho da música'} />
          {comAudio && <span className="w-10 shrink-0 text-[11px] tabular-nums text-suave">−{formatarTempo(Math.max(0, duracao - posicao))}</span>}
        </div>
      </div>

      <div className="shrink-0 text-right leading-none" title={i < 0 ? 'Introdução (antes do primeiro trecho)' : `Trecho ${i + 1} de ${total}`}>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-suave">{i < 0 ? 'Intro' : 'Trecho'}</div>
        <div className="mt-1 text-xl font-bold tabular-nums">
          {i + 1}
          <span className="text-sm font-semibold text-suave">/{total}</span>
        </div>
      </div>

      {m.versao !== 'manual' && (
        <div className="flex shrink-0 flex-col items-center gap-1 border-l border-borda pl-3" title="Desligado, a letra não troca sozinha: você passa os trechos">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-suave">Seguir áudio</span>
          <Interruptor ligado={m.seguirAudio} aoMudar={(v) => tentar(api.comando({ tipo: 'musica:seguir', valor: v }))} rotulo="Seguir o áudio" />
        </div>
      )}
    </div>
  )
}

/** Trilha de progresso com as marcas dos trechos; clicar ou arrastar escolhe o ponto. */
function Trilha({
  valor,
  marcas,
  faixa,
  desativado,
  escolher,
  rotulo,
  rotuloAria,
}: {
  valor: number
  marcas: number[]
  faixa: [number, number] | null
  desativado: boolean
  escolher: (x: number) => void
  rotulo: (x: number) => string
  rotuloAria: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [arrastando, setArrastando] = useState<number | null>(null)
  const fracao = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect()
    return Math.min(1, Math.max(0, (clientX - r.left) / Math.max(1, r.width)))
  }
  const v = arrastando ?? valor
  return (
    <div
      ref={ref}
      role="slider"
      aria-label={rotuloAria}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      className={`relative h-6 min-w-0 flex-1 touch-none select-none ${desativado ? 'opacity-50' : 'cursor-pointer'}`}
      onPointerDown={(e) => {
        if (desativado) return
        e.currentTarget.setPointerCapture(e.pointerId)
        setArrastando(fracao(e.clientX))
      }}
      onPointerMove={(e) => {
        if (arrastando !== null) setArrastando(fracao(e.clientX))
      }}
      onPointerUp={(e) => {
        if (arrastando === null) return
        setArrastando(null)
        escolher(fracao(e.clientX))
      }}
      onPointerCancel={() => setArrastando(null)}
    >
      <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full bg-borda">
        {/* trecho que está no ar */}
        {faixa && <div className="absolute inset-y-0 bg-destaque/25" style={{ left: pct(faixa[0]), width: pct(faixa[1] - faixa[0]) }} />}
        <div className="absolute inset-y-0 left-0 bg-destaque" style={{ width: pct(v) }} />
        {/* começo de cada trecho */}
        {marcas.map((x, k) => (
          <span key={k} className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-painel-2" style={{ left: pct(x) }} />
        ))}
      </div>
      {!desativado && (
        <span className="pointer-events-none absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-painel bg-destaque shadow" style={{ left: pct(v) }} />
      )}
      {arrastando !== null && (
        <span className="pointer-events-none absolute -top-5 -translate-x-1/2 whitespace-nowrap rounded bg-texto px-1.5 py-0.5 text-[11px] tabular-nums text-painel" style={{ left: pct(arrastando) }}>
          {rotulo(arrastando)}
        </span>
      )}
    </div>
  )
}
