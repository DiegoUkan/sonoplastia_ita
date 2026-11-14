/** Mídias no celular: toque para mandar vídeo/imagem às saídas ou tocar um áudio. */
import { Film, Image, Music2, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Midia, TipoMidia } from '../../shared/dados'
import { Segmentado } from '../comando/ui'
import { api, urlMiniatura } from './cliente'

const duracao = (s: number | null) => {
  if (!s) return ''
  const t = Math.round(s)
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}
const ICONES = { video: Film, imagem: Image, audio: Music2 }

export function AbaMidias({ alvo, tentar, versao, visivel }: { alvo: string; tentar: (p: Promise<unknown>) => void; versao: number; visivel: boolean }) {
  const [tipo, setTipo] = useState<TipoMidia | 'todos'>('todos')
  const [busca, setBusca] = useState('')
  const [lista, setLista] = useState<Midia[] | null>(null)

  useEffect(() => {
    if (!visivel) return
    const t = setTimeout(() => {
      api
        .listarMidias(tipo, busca)
        .then(setLista)
        .catch(() => setLista([]))
    }, 200)
    return () => clearTimeout(t)
  }, [tipo, busca, versao, visivel])

  const mostrar = (m: Midia) => {
    if (m.tipo === 'audio') return tentar(api.comando({ tipo: 'audio', fonte: { tipo: 'audio', url: m.url, nome: m.nome, midiaId: m.id } }))
    if (m.tipo === 'imagem') return tentar(api.comando({ tipo: 'mostrar', alvo, conteudo: { tipo: 'imagem', url: m.url, nome: m.nome } }))
    tentar(api.comando({ tipo: 'mostrar', alvo, conteudo: { tipo: 'video', url: m.url, nome: m.nome, loop: false } }))
  }

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-borda bg-painel p-3">
      <Segmentado
        valor={tipo}
        aoMudar={setTipo}
        opcoes={[
          { valor: 'todos', rotulo: 'Todas' },
          { valor: 'video', rotulo: 'Vídeos' },
          { valor: 'imagem', rotulo: 'Imagens' },
          { valor: 'audio', rotulo: 'Áudios' },
        ]}
      />
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3 size-4 text-apagado" />
        <input
          type="search"
          className="h-10 w-full rounded-lg border border-borda bg-entrada pl-9 pr-3 text-[15px] text-texto outline-none placeholder:text-apagado focus:border-destaque"
          placeholder="Nome da mídia"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>
      {lista === null && <p className="py-3 text-center text-sm text-suave">Carregando…</p>}
      {lista?.length === 0 && <p className="py-3 text-center text-sm text-suave">Nenhuma mídia{busca ? ' com esse nome' : ''}.</p>}
      <div className="flex flex-col">
        {lista?.map((m) => {
          const Icone = ICONES[m.tipo]
          return (
            <button key={m.id} type="button" onClick={() => mostrar(m)} className="flex items-center gap-3 border-b border-borda py-2 text-left last:border-b-0 active:bg-hover">
              <span className="flex h-11 w-[76px] shrink-0 items-center justify-center overflow-hidden rounded-md bg-tela">
                {m.miniaturaUrl ? (
                  <img src={urlMiniatura(m.miniaturaUrl)} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <Icone className="size-5 text-white/60" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{m.nome}</span>
                <span className="text-xs text-suave">
                  {m.tipo === 'video' ? 'Vídeo' : m.tipo === 'imagem' ? 'Imagem' : 'Áudio'}
                  {m.duracao ? ` · ${duracao(m.duracao)}` : ''}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
