/** Músicas no celular: a que está no ar (trechos, seguir o áudio) e a busca para abrir outra. */
import { Mic, Search, Square, Type, Volume2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ResumoMusica } from '../../shared/dados'
import type { EstadoMotor, VersaoMusica } from '../../shared/estado'
import { Botao, Interruptor } from '../comando/ui'
import { api } from './cliente'

const NOMES_VERSAO: Record<VersaoMusica, string> = { cantado: 'cantado', playback: 'playback', manual: 'só a letra' }

export function AbaMusicas({ estado, alvo, tentar }: { estado: EstadoMotor; alvo: string; tentar: (p: Promise<unknown>) => void }) {
  const [busca, setBusca] = useState('')
  const [lista, setLista] = useState<ResumoMusica[] | null>(null)
  const [aberta, setAberta] = useState<number | null>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      api
        .listarMusicas(busca)
        .then(setLista)
        .catch(() => setLista([]))
    }, 200)
    return () => clearTimeout(t)
  }, [busca])

  const m = estado.musica
  return (
    <div className="flex flex-col gap-3">
      {m && <MusicaNoAr estado={estado} tentar={tentar} />}

      <section className="rounded-xl border border-borda bg-painel p-3">
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-3 top-3 size-4 text-apagado" />
          <input
            type="search"
            className="h-10 w-full rounded-lg border border-borda bg-entrada pl-9 pr-3 text-[15px] text-texto outline-none placeholder:text-apagado focus:border-destaque"
            placeholder="Título, nº do hino ou trecho da letra"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        {lista === null && <p className="py-3 text-center text-sm text-suave">Carregando…</p>}
        {lista?.length === 0 && (
          <p className="py-3 text-center text-sm text-suave">{busca ? 'Nenhuma música com isso.' : 'Nenhuma música importada ainda (importe no computador, em Músicas).'}</p>
        )}
        <div className="flex flex-col">
          {lista?.map((x) => {
            const noAr = m?.musicaId === x.id
            const abrir = (versao: VersaoMusica) => {
              setAberta(null)
              tentar(api.abrirMusica(x.id, versao, alvo))
            }
            return (
              <div key={x.id} className="border-b border-borda last:border-b-0">
                <button
                  type="button"
                  onClick={() => setAberta(aberta === x.id ? null : x.id)}
                  className={`flex w-full flex-col items-start px-1 py-2.5 text-left active:bg-hover ${noAr ? 'text-destaque-texto' : ''}`}
                >
                  <span className="text-[15px] font-medium leading-snug">{x.titulo}</span>
                  <span className="text-xs text-suave">
                    {x.album || 'Sem álbum'}
                    {noAr ? ' · no ar' : ''}
                    {!x.temCantado && !x.temPlayback ? ' · sem áudio' : ''}
                  </span>
                </button>
                {aberta === x.id && (
                  <div className="grid grid-cols-3 gap-2 pb-3">
                    <Botao tamanho="lg" variante="primario" icone={Mic} disabled={!x.temCantado} onClick={() => abrir('cantado')}>
                      Cantado
                    </Botao>
                    <Botao tamanho="lg" icone={Volume2} disabled={!x.temPlayback} onClick={() => abrir('playback')}>
                      Playback
                    </Botao>
                    <Botao tamanho="lg" icone={Type} onClick={() => abrir('manual')}>
                      Só letra
                    </Botao>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function MusicaNoAr({ estado, tentar }: { estado: EstadoMotor; tentar: (p: Promise<unknown>) => void }) {
  const m = estado.musica!
  const lista = useRef<HTMLDivElement>(null)
  useEffect(() => {
    lista.current?.querySelector(`[data-indice="${m.indice}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [m.indice, m.musicaId])
  const ir = (i: number) => tentar(api.comando({ tipo: 'musica:slide', indice: i, origem: 'operador' }))
  const itens = [{ i: -1, texto: m.tituloNaIntroducao ? `Introdução · ${m.titulo}` : 'Introdução (tela vazia)' }, ...m.slides.map((s, i) => ({ i, texto: s.texto }))]

  return (
    <section className="rounded-xl border border-destaque/40 bg-painel p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-destaque-texto">Música no ar · {NOMES_VERSAO[m.versao]}</div>
          <div className="truncate text-[15px] font-semibold">{m.titulo}</div>
        </div>
        <Botao tamanho="md" variante="perigo" icone={Square} onClick={() => tentar(api.comando({ tipo: 'musica:fechar' }))}>
          Fechar
        </Botao>
      </div>
      {m.versao !== 'manual' && (
        <label className="mt-2 flex items-center gap-2 text-sm">
          <Interruptor ligado={m.seguirAudio} aoMudar={(valor) => tentar(api.comando({ tipo: 'musica:seguir', valor }))} rotulo="Seguir o áudio" />
          A letra segue o áudio
          {!m.seguirAudio && <span className="text-xs text-aviso-texto">(parado: troca só no toque)</span>}
        </label>
      )}
      <div ref={lista} className="mt-2 flex max-h-[45dvh] flex-col gap-1 overflow-y-auto overscroll-contain">
        {itens.map(({ i, texto }) => (
          <button
            key={i}
            type="button"
            data-indice={i}
            onClick={() => ir(i)}
            className={`flex gap-2 rounded-lg border px-2.5 py-2 text-left text-sm leading-snug ${
              i === m.indice ? 'border-destaque bg-destaque/12 font-semibold' : 'border-transparent active:bg-hover'
            }`}
          >
            <span className="w-6 shrink-0 text-right text-xs tabular-nums text-apagado">{i < 0 ? '' : i + 1}</span>
            <span className="whitespace-pre-line">{texto}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
