/**
 * Player das mídias que estão tocando: vídeo de cada saída e a trilha de áudio (músicas e áudios).
 * Duas formas: horizontal (embaixo das miniaturas) e vertical (coluna recolhida).
 */
import { Music, Pause, Play, Repeat, RotateCcw, RotateCw, Square, Volume2, VolumeX } from 'lucide-react'
import type { Config } from '../../shared/config'
import { AUDIO, type ControleMidia, type EstadoMotor, type Telemetria, type TelemetriaVideo, TODAS } from '../../shared/estado'
import { formatarTempo } from '../compartilhado/Camadas'
import { api } from '../compartilhado/ganchos'
import { Botao, Deslizante } from './ui'

export interface FontePlayer {
  id: string
  rotulo: string
  curto: string
  nome: string
  controle: ControleMidia
  telemetria: TelemetriaVideo | null
}

/** O que dá para controlar agora: vídeos nas saídas que mostram vídeo e a trilha de áudio. */
export function fontesDoPlayer(estado: EstadoMotor, config: Config, telemetrias: Record<string, Telemetria>): FontePlayer[] {
  const fontes: FontePlayer[] = []
  const comVideo = config.saidas.filter((s) => s.mostrarVideo && estado.saidas[s.id]?.conteudo.tipo === 'video')
  for (const s of comVideo) {
    const e = estado.saidas[s.id]!
    const c = e.conteudo as { nome: string }
    fontes.push({ id: s.id, rotulo: s.nome, curto: s.nome.slice(0, 3), nome: c.nome, controle: e.video, telemetria: telemetrias[s.id]?.video ?? null })
  }
  if (comVideo.length > 1) {
    const urls = new Set(comVideo.map((s) => (estado.saidas[s.id]!.conteudo as { url: string }).url))
    if (urls.size === 1) fontes.unshift({ ...fontes[0]!, id: TODAS, rotulo: 'Todas', curto: 'Tod' })
  }
  if (estado.audio.fonte) {
    fontes.push({
      id: AUDIO,
      rotulo: estado.audio.fonte.tipo === 'musica' ? 'Música' : 'Áudio',
      curto: estado.audio.fonte.tipo === 'musica' ? 'Mús' : 'Áud',
      nome: estado.audio.fonte.nome,
      controle: estado.audio.controle,
      telemetria: telemetrias[AUDIO]?.video ?? null,
    })
  }
  return fontes
}

function acoes(f: FontePlayer) {
  const tocando = f.telemetria ? f.telemetria.tocando : f.controle.tocando
  return {
    tocando,
    alternar: () => api.comando({ tipo: 'midia', alvo: f.id, acao: tocando ? 'pausar' : 'tocar' }),
    parar: () => api.comando({ tipo: 'midia', alvo: f.id, acao: 'parar' }),
    pular: (s: number) => api.comando({ tipo: 'buscar', alvo: f.id, segundos: s, relativo: true }),
    buscar: (s: number) => api.comando({ tipo: 'buscar', alvo: f.id, segundos: s }),
    volume: (v: number) => api.comando({ tipo: 'volume', alvo: f.id, volume: v }),
    mudo: () => api.comando({ tipo: 'volume', alvo: f.id, mudo: !f.controle.mudo }),
    repetir: () => api.comando({ tipo: 'repetir', alvo: f.id, valor: !f.controle.repetir }),
  }
}

interface PropsPlayer {
  fontes: FontePlayer[]
  selecionada: FontePlayer | null
  aoSelecionar: (id: string) => void
}

export function PlayerHorizontal({ fontes, selecionada: f, aoSelecionar }: PropsPlayer) {
  const a = f ? acoes(f) : null
  const t = f?.telemetria
  const duracao = t?.duracao ?? 0
  const posicao = t?.posicao ?? 0
  return (
    <div className="rounded-lg border border-borda bg-painel p-2.5">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-suave">Player</span>
        {fontes.length > 1 && (
          <div className="ml-auto flex gap-1">
            {fontes.map((x) => (
              <button
                key={x.id}
                type="button"
                onClick={(e) => {
                  e.currentTarget.blur()
                  aoSelecionar(x.id)
                }}
                className={`h-6 cursor-pointer rounded px-2 text-[11px] font-semibold ${x.id === f?.id ? 'bg-destaque text-sobre-destaque' : 'bg-painel-2 text-suave hover:text-texto'}`}
              >
                {x.rotulo}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 truncate text-sm font-medium" title={f?.nome}>
        {f?.id === AUDIO && <Music className="size-3.5 shrink-0 text-suave" />}
        <span className="truncate">{f ? f.nome : <span className="text-apagado">Nada tocando</span>}</span>
      </div>
      <Deslizante
        rotulo="Posição"
        className="mt-1.5 w-full"
        min={0}
        max={Math.max(duracao, 0.1)}
        passo={0.1}
        valor={posicao}
        desativado={!f || duracao <= 0}
        aoSoltar={(v) => a?.buscar(v)}
      />
      <div className="flex justify-between text-[11px] tabular-nums text-suave">
        <span>{formatarTempo(posicao)}</span>
        <span>−{formatarTempo(Math.max(0, duracao - posicao))}</span>
      </div>
      <div className="mt-1 flex items-center gap-1">
        <Botao tamanho="sm" variante="fantasma" icone={RotateCcw} disabled={!f} onClick={() => a?.pular(-10)} title="Voltar 10 s">
          10
        </Botao>
        <Botao tamanho="md" variante="primario" icone={a?.tocando ? Pause : Play} disabled={!f} onClick={() => a?.alternar()} title={a?.tocando ? 'Pausar' : 'Tocar'} className="w-11" />
        <Botao tamanho="sm" variante="fantasma" icone={Square} disabled={!f} onClick={() => a?.parar()} title="Parar" />
        <Botao tamanho="sm" variante="fantasma" icone={RotateCw} disabled={!f} onClick={() => a?.pular(10)} title="Avançar 10 s">
          10
        </Botao>
        <Botao tamanho="sm" variante="fantasma" icone={Repeat} ativo={!!f?.controle.repetir} disabled={!f} onClick={() => a?.repetir()} title="Repetir" className="ml-auto" />
      </div>
      <div className="mt-1 flex items-center gap-1.5">
        <Botao tamanho="sm" variante="fantasma" icone={f?.controle.mudo ? VolumeX : Volume2} ativo={!!f?.controle.mudo} corAtivo="aviso" disabled={!f} onClick={() => a?.mudo()} title="Sem som" />
        <Deslizante rotulo="Volume" className="min-w-0 flex-1" min={0} max={1} passo={0.02} valor={f?.controle.volume ?? 1} desativado={!f} aoMudar={(v) => a?.volume(v)} />
        <span className="w-9 text-right text-[11px] tabular-nums text-suave">{f ? `${Math.round(f.controle.volume * 100)}%` : ''}</span>
      </div>
    </div>
  )
}

export function PlayerVertical({ fontes, selecionada: f, aoSelecionar }: PropsPlayer) {
  const a = f ? acoes(f) : null
  const t = f?.telemetria
  const duracao = t?.duracao ?? 0
  const posicao = t?.posicao ?? 0
  const pct = duracao > 0 ? (posicao / duracao) * 100 : 0
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center gap-1.5">
      {fontes.length > 1 && (
        <div className="flex flex-col gap-1">
          {fontes.map((x) => (
            <button
              key={x.id}
              type="button"
              title={x.rotulo}
              onClick={(e) => {
                e.currentTarget.blur()
                aoSelecionar(x.id)
              }}
              className={`h-6 w-14 cursor-pointer rounded text-[11px] font-semibold ${x.id === f?.id ? 'bg-destaque text-sobre-destaque' : 'bg-painel-2 text-suave'}`}
            >
              {x.curto}
            </button>
          ))}
        </div>
      )}
      <div className="w-full truncate px-1 text-center text-[10px] text-suave" title={f?.nome}>
        {f ? f.nome : 'Nada tocando'}
      </div>
      <div className="h-1 w-14 overflow-hidden rounded-full bg-borda">
        <div className="h-full bg-destaque" style={{ width: `${pct}%` }} />
      </div>
      <div className="text-center text-[11px] leading-tight tabular-nums">
        <div>{formatarTempo(posicao)}</div>
        <div className="text-suave">−{formatarTempo(Math.max(0, duracao - posicao))}</div>
      </div>
      <Botao tamanho="lg" variante="primario" icone={a?.tocando ? Pause : Play} disabled={!f} onClick={() => a?.alternar()} title={a?.tocando ? 'Pausar' : 'Tocar'} className="w-14" />
      <Botao tamanho="md" variante="padrao" icone={Square} disabled={!f} onClick={() => a?.parar()} title="Parar" className="w-14" />
      <Botao tamanho="sm" variante="fantasma" icone={RotateCcw} disabled={!f} onClick={() => a?.pular(-10)} title="Voltar 10 s" className="w-14">
        10
      </Botao>
      <Botao tamanho="sm" variante="fantasma" icone={RotateCw} disabled={!f} onClick={() => a?.pular(10)} title="Avançar 10 s" className="w-14">
        10
      </Botao>
      <Botao tamanho="sm" variante="fantasma" icone={Repeat} ativo={!!f?.controle.repetir} disabled={!f} onClick={() => a?.repetir()} title="Repetir" className="w-14" />
      <div className="flex min-h-16 flex-1 flex-col items-center py-1">
        <Deslizante rotulo="Volume" vertical className="min-h-0 w-6 flex-1" min={0} max={1} passo={0.02} valor={f?.controle.volume ?? 1} desativado={!f} aoMudar={(v) => a?.volume(v)} />
      </div>
      <Botao tamanho="sm" variante="fantasma" icone={f?.controle.mudo ? VolumeX : Volume2} disabled={!f} onClick={() => a?.mudo()} title="Sem som" className="w-14" />
    </div>
  )
}
