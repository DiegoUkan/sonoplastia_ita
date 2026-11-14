/**
 * Duas janelas por cima da tela de comando (o resto escurece; as miniaturas continuam visíveis):
 *
 * - "Como vai tocar?": música da liturgia marcada como "escolher na hora". Cantado (C), playback (P)
 *   ou só a letra (L).
 * - Painel da letra: música só com a letra (sem áudio). Quem passa os trechos é o operador, então a
 *   letra fica grande, com o próximo trecho e os botões de passar; → / PageDown / Espaço passam em
 *   qualquer página. Dá para minimizar (fica um botão para voltar).
 */
import { AudioLines, ChevronLeft, ChevronRight, Maximize2, Mic, Minimize2, Music, Type, X } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import type { Config } from '../../shared/config'
import type { Musica } from '../../shared/dados'
import type { EstadoMotor, VersaoMusica } from '../../shared/estado'
import { api } from '../compartilhado/ganchos'
import { mensagemDeErro } from './acoes'
import { Botao } from './ui'

/** Área escurecida: a tela de comando menos a coluna das miniaturas e a barra de baixo. */
function Escurecer({ direita, children }: { direita: number; children: ReactNode }) {
  return (
    <div className="absolute z-40 flex items-center justify-center bg-black/55 p-6" style={{ left: 0, top: 0, bottom: 28, right: direita }}>
      {children}
    </div>
  )
}

/** Teclas tratadas antes de tudo (página aberta e atalhos gerais) enquanto `ligado`. */
function useTeclasNaFrente(ligado: boolean, tratar: (e: KeyboardEvent) => boolean) {
  const ref = useRef(tratar)
  ref.current = tratar
  useEffect(() => {
    if (!ligado) return
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return
      if (!ref.current(e)) return
      e.preventDefault()
      e.stopImmediatePropagation()
    }
    window.addEventListener('keydown', aoTeclar, true)
    return () => window.removeEventListener('keydown', aoTeclar, true)
  }, [ligado])
}

// --- "Como vai tocar?"

const VERSOES: Array<{ versao: VersaoMusica; tecla: string; rotulo: string; dica: string; icone: typeof Mic }> = [
  { versao: 'cantado', tecla: 'C', rotulo: 'Cantado', dica: 'Áudio com voz. A letra troca sozinha.', icone: Mic },
  { versao: 'playback', tecla: 'P', rotulo: 'Playback', dica: 'Só o instrumental. A letra troca sozinha.', icone: AudioLines },
  { versao: 'manual', tecla: 'L', rotulo: 'Só a letra', dica: 'Sem áudio. Você passa os trechos.', icone: Type },
]

export function EscolhaVersao({ estado, alvo, direita }: { estado: EstadoMotor; alvo: string; direita: number }) {
  const lit = estado.liturgia
  const pedido = lit?.escolherVersao ?? null
  const [fechado, setFechado] = useState<number | null>(null)
  const [musica, setMusica] = useState<Musica | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const numero = pedido?.pedido ?? null
  useEffect(() => {
    setMusica(null)
    setErro(null)
    if (pedido) void api.obterMusica(pedido.musicaId).then(setMusica)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numero])
  const aberto = !!pedido && !!lit?.itemId && fechado !== numero
  const tem = (v: VersaoMusica) => v === 'manual' || !musica || (v === 'cantado' ? musica.temCantado : musica.temPlayback)

  const escolher = (v: VersaoMusica) => {
    if (!lit?.itemId || !tem(v)) return
    setErro(null)
    api.executarItemLiturgia(lit.liturgiaId, lit.itemId, alvo, v).catch((e) => setErro(mensagemDeErro(e)))
  }

  useTeclasNaFrente(aberto, (e) => {
    const k = e.key.toLowerCase()
    if (k === 'escape') setFechado(numero)
    else if (k === 'c' || k === '1') escolher('cantado')
    else if (k === 'p' || k === '2') escolher('playback')
    else if (k === 'l' || k === '3') escolher('manual')
    // as outras teclas não passam (N, setas…): primeiro a escolha
    return true
  })

  if (!aberto || !pedido) return null
  return (
    <Escurecer direita={direita}>
      <div role="dialog" aria-label="Como vai tocar a música?" className="w-full max-w-xl rounded-2xl border border-borda bg-painel p-6 shadow-2xl">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-suave">
          <Music className="size-4 text-destaque-texto" /> Como vai tocar?
        </div>
        <h2 className="mt-1 text-xl font-semibold">{pedido.titulo}</h2>
        <div className="mt-5 flex flex-col gap-2">
          {VERSOES.map((o) => {
            const ok = tem(o.versao)
            const Icone = o.icone
            return (
              <button
                key={o.versao}
                type="button"
                disabled={!ok}
                onClick={(e) => {
                  e.currentTarget.blur()
                  escolher(o.versao)
                }}
                className="flex cursor-pointer items-center gap-4 rounded-xl border border-borda bg-painel-2 px-4 py-3.5 text-left transition-colors hover:border-destaque hover:bg-destaque/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-destaque/12 text-destaque-texto">
                  <Icone className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">{o.rotulo}</span>
                  <span className="block text-[13px] text-suave">{ok ? o.dica : 'Esta música não tem este áudio.'}</span>
                </span>
                <kbd className="rounded-md border border-borda bg-entrada px-2 py-0.5 font-mono text-sm text-suave">{o.tecla}</kbd>
              </button>
            )
          })}
        </div>
        {erro && <p className="mt-3 text-sm text-perigo-texto">{erro}</p>}
        <div className="mt-5 flex items-center justify-between gap-3">
          <span className="text-xs text-apagado">Nada muda nos projetores até você escolher.</span>
          <Botao variante="fantasma" onClick={() => setFechado(numero)} title="Fecha sem tocar (Esc)">
            Agora não
          </Botao>
        </div>
      </div>
    </Escurecer>
  )
}

// --- painel da letra (música sem áudio)

export function FocoLetra({ estado, config, direita }: { estado: EstadoMotor; config: Config; direita: number }) {
  const m = estado.musica
  const ativo = !!m && m.versao === 'manual' && config.musicas.focoNoManual
  // minimizado para esta música (outra música só com a letra abre o painel de novo)
  const [minimizada, setMinimizada] = useState<number | null>(null)
  const aberto = ativo && minimizada !== m!.musicaId
  const ir = (indice: number) => {
    if (!m) return
    const i = Math.max(-1, Math.min(m.slides.length - 1, indice))
    if (i !== m.indice) void api.comando({ tipo: 'musica:slide', indice: i, origem: 'operador' })
  }
  const lista = useRef<HTMLDivElement>(null)
  const indice = m?.indice ?? -1
  useEffect(() => {
    lista.current?.querySelector('[data-no-ar="1"]')?.scrollIntoView({ block: 'nearest' })
  }, [indice, aberto])

  useTeclasNaFrente(aberto, (e) => {
    if (!m) return false
    const k = e.key
    if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'PageDown' || k === ' ' || k === 'Enter') ir(m.indice + 1)
    else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp') ir(m.indice - 1)
    else if (k === 'Home') ir(-1)
    else if (k === 'End') ir(m.slides.length - 1)
    // o resto (B = preto, Esc = limpar, L = logo, N = próximo item…) segue o caminho de sempre
    else return false
    return true
  })

  if (!ativo || !m) return null
  if (!aberto) {
    return (
      <div className="absolute z-30" style={{ left: 216, bottom: 40 }}>
        <Botao variante="primario" icone={Maximize2} onClick={() => setMinimizada(null)} title="Abre de novo o painel da letra" className="shadow-lg">
          Letra no ar: {m.titulo}
        </Botao>
      </div>
    )
  }

  const atual = m.indice >= 0 ? (m.slides[m.indice]?.texto ?? '') : m.tituloNaIntroducao ? m.titulo : ''
  const proximo = m.slides[m.indice + 1]?.texto ?? null
  const ultimo = m.indice >= m.slides.length - 1

  return (
    <Escurecer direita={direita}>
      <div role="dialog" aria-label="Letra no ar" className="flex h-full max-h-[640px] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-borda bg-painel shadow-2xl">
        <header className="flex shrink-0 items-center gap-3 border-b border-borda px-5 py-3">
          <Music className="size-5 text-destaque-texto" />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-suave">Só a letra · você passa os trechos</div>
            <div className="truncate text-[17px] font-semibold">{m.titulo}</div>
          </div>
          <Botao icone={Minimize2} onClick={() => setMinimizada(m.musicaId)} title="Esconde o painel (a música continua no ar)">
            Minimizar
          </Botao>
          <Botao variante="perigo" icone={X} onClick={() => api.comando({ tipo: 'musica:fechar' })} title="Tira a letra dos projetores">
            Fechar música
          </Botao>
        </header>

        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
            <div className="flex min-h-0 flex-1 flex-col rounded-xl bg-tela p-5 text-white">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-white/55">
                No ar
                <span className="ml-auto tabular-nums">{m.indice < 0 ? 'Introdução' : `Trecho ${m.indice + 1} de ${m.slides.length}`}</span>
              </div>
              <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden text-center text-[26px] font-semibold leading-snug whitespace-pre-line">
                {atual || <span className="text-white/40">(tela sem letra)</span>}
              </div>
            </div>
            <div className="shrink-0 rounded-xl border border-borda bg-painel-2 px-4 py-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-apagado">Próximo</div>
              <div className="line-clamp-2 text-[15px] whitespace-pre-line text-suave">{proximo ?? 'Fim da música'}</div>
            </div>
            <div className="flex shrink-0 gap-2">
              <Botao tamanho="lg" icone={ChevronLeft} disabled={m.indice < 0} onClick={() => ir(m.indice - 1)} className="flex-1">
                Anterior
              </Botao>
              <Botao tamanho="lg" variante="primario" disabled={ultimo} onClick={() => ir(m.indice + 1)} className="flex-[2]">
                {ultimo ? 'Último trecho' : 'Próximo'}
                {!ultimo && <ChevronRight className="size-5" />}
              </Botao>
            </div>
            <p className="shrink-0 text-center text-xs text-apagado">
              → , PageDown ou Espaço passam · ← ou PageUp voltam{estado.liturgia ? ' · N vai para o próximo item da liturgia' : ''}
            </p>
          </div>

          <div ref={lista} className="w-72 shrink-0 overflow-y-auto border-l border-borda p-2">
            <Trecho numero="—" texto={m.tituloNaIntroducao ? `${m.titulo} (título)` : 'Introdução (tela sem letra)'} noAr={m.indice === -1} aoClicar={() => ir(-1)} />
            {m.slides.map((s, i) => (
              <Trecho key={i} numero={String(i + 1)} texto={s.texto} noAr={m.indice === i} aoClicar={() => ir(i)} />
            ))}
          </div>
        </div>
      </div>
    </Escurecer>
  )
}

function Trecho({ numero, texto, noAr, aoClicar }: { numero: string; texto: string; noAr: boolean; aoClicar: () => void }) {
  return (
    <button
      type="button"
      data-no-ar={noAr ? '1' : undefined}
      onClick={(e) => {
        e.currentTarget.blur()
        aoClicar()
      }}
      className={`mb-1 flex w-full cursor-pointer gap-2 rounded-md px-2 py-1.5 text-left text-xs ${noAr ? 'bg-destaque text-sobre-destaque' : 'hover:bg-hover'}`}
    >
      <span className={`w-5 shrink-0 text-right font-semibold tabular-nums ${noAr ? 'text-sobre-destaque/80' : 'text-apagado'}`}>{numero}</span>
      <span className="line-clamp-2 min-w-0 flex-1 whitespace-pre-line">{texto}</span>
    </button>
  )
}
