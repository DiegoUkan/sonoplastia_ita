/** Página "Mídias": biblioteca de vídeos, imagens e áudios. Importa pelo botão ou arrastando arquivos. */
import { AudioLines, Film, ImageIcon, LoaderCircle, Pencil, Play, Plus, Search, Trash2, TriangleAlert, Undo2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { Midia, ResultadoImportacao } from '../../shared/dados'
import { formatarTempo } from '../compartilhado/Camadas'
import { api } from '../compartilhado/ganchos'
import { mensagemDeErro, mostrarMidia } from './acoes'
import { arquivosDoArraste, iniciarArraste } from './arrastar'
import { Botao, classeEntrada, Segmentado } from './ui'

type Filtro = 'todos' | 'video' | 'imagem' | 'audio' | 'lixeira'

const ICONES = { video: Film, imagem: ImageIcon, audio: AudioLines }

function tamanho(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} kB`
}

function resumoImportacao(r: ResultadoImportacao): string {
  const partes: string[] = []
  if (r.importadas.length) partes.push(`${r.importadas.length} importada(s)`)
  if (r.repetidas.length) partes.push(`${r.repetidas.length} já estava(m) na biblioteca`)
  if (r.ignoradas.length) partes.push(`não importado: ${r.ignoradas.join('; ')}`)
  return partes.join(' · ') || 'Nada importado.'
}

export function PaginaMidias({ alvo }: { alvo: string }) {
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [busca, setBusca] = useState('')
  const [lista, setLista] = useState<Midia[]>([])
  const [sobre, setSobre] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [renomeando, setRenomeando] = useState<{ id: number; nome: string } | null>(null)

  const carregar = useCallback(async () => {
    setLista(await api.listarMidias({ tipo: filtro === 'lixeira' ? 'todos' : filtro, busca, lixeira: filtro === 'lixeira' }))
  }, [filtro, busca])
  useEffect(() => {
    void carregar()
  }, [carregar])
  useEffect(() => api.aoMudarMidias(() => void carregar()), [carregar])

  const importar = async (caminhos?: string[]) => {
    setAviso('Importando…')
    try {
      const r = caminhos ? await api.importarMidias(caminhos) : await api.escolherEImportarMidias()
      setAviso(resumoImportacao(r))
    } catch (e) {
      setAviso(mensagemDeErro(e))
    }
  }

  const acao = (f: () => Promise<void>) => f().catch((e) => setAviso(mensagemDeErro(e)))

  return (
    <div
      className="relative flex h-full flex-col"
      onDragOver={(e) => {
        if (![...e.dataTransfer.types].includes('Files')) return
        e.preventDefault()
        setSobre(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setSobre(false)
      }}
      onDrop={(e) => {
        const arquivos = arquivosDoArraste(e)
        if (!arquivos.length) return
        e.preventDefault()
        setSobre(false)
        void importar(arquivos)
      }}
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-borda px-5 py-3">
        <Segmentado
          valor={filtro}
          aoMudar={setFiltro}
          opcoes={[
            { valor: 'todos', rotulo: 'Todas' },
            { valor: 'video', rotulo: 'Vídeos' },
            { valor: 'imagem', rotulo: 'Imagens' },
            { valor: 'audio', rotulo: 'Áudios' },
            { valor: 'lixeira', rotulo: 'Lixeira' },
          ]}
        />
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-apagado" />
          <input className={`${classeEntrada} w-64 pl-8`} placeholder="Buscar pelo nome" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Botao variante="primario" icone={Plus} className="ml-auto" onClick={() => void importar()}>
          Importar…
        </Botao>
      </div>
      {aviso && (
        <div className="flex items-center justify-between gap-3 border-b border-borda bg-painel-2 px-5 py-2 text-sm text-suave">
          <span>{aviso}</span>
          <button type="button" className="cursor-pointer text-xs text-apagado hover:text-texto" onClick={() => setAviso(null)}>
            fechar
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {lista.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-suave">
            <Film className="size-10 text-apagado" />
            <p className="text-sm">
              {filtro === 'lixeira' ? 'A lixeira está vazia.' : 'Arraste vídeos, imagens ou áudios para cá, ou use “Importar…”.'}
            </p>
            {filtro !== 'lixeira' && <p className="text-xs">Os arquivos são copiados para C:\Sonoplastia\midias. O original não é mexido.</p>}
          </div>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(176px, 1fr))' }}>
            {lista.map((m) => {
              const Icone = ICONES[m.tipo]
              const pronto = m.situacao === 'pronto' || m.situacao === 'analisando'
              return (
                <div
                  key={m.id}
                  draggable={!m.excluida && pronto}
                  onDragStart={(e) => iniciarArraste(e, { tipo: 'midia', midia: { id: m.id, tipo: m.tipo, nome: m.nome, url: m.url } })}
                  onDoubleClick={() => !m.excluida && pronto && void acao(() => mostrarMidia(m, alvo))}
                  className="group overflow-hidden rounded-lg border border-borda bg-painel"
                  title={m.excluida ? m.nome : `${m.nome}\nDuplo clique: mostrar · Arraste até uma miniatura para escolher a saída`}
                >
                  <div className="relative aspect-video bg-tela">
                    {m.miniaturaUrl ? (
                      <img src={m.miniaturaUrl} alt="" draggable={false} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <Icone className="size-9 text-white/40" />
                      </div>
                    )}
                    {m.duracao ? (
                      <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 text-[11px] tabular-nums text-white">{formatarTempo(m.duracao)}</span>
                    ) : null}
                    {m.situacao === 'analisando' && <Faixa icone={LoaderCircle} texto="Analisando…" />}
                    {m.situacao === 'convertendo' && <Faixa icone={LoaderCircle} texto={`Convertendo ${m.progresso ? Math.round(m.progresso * 100) + '%' : '…'}`} />}
                    {m.situacao === 'erro' && <Faixa icone={TriangleAlert} texto="Erro" perigo />}
                    {!m.excluida && pronto && (
                      <button
                        type="button"
                        onClick={() => void acao(() => mostrarMidia(m, alvo))}
                        className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100"
                        title={m.tipo === 'audio' ? 'Tocar' : 'Mostrar'}
                      >
                        <span className="flex items-center gap-1.5 rounded-full bg-destaque px-3 py-1.5 text-sm font-semibold text-sobre-destaque">
                          <Play className="size-4" /> {m.tipo === 'audio' ? 'Tocar' : 'Mostrar'}
                        </span>
                      </button>
                    )}
                  </div>
                  <div className="flex items-start gap-1 p-2">
                    <div className="min-w-0 flex-1">
                      {renomeando?.id === m.id ? (
                        <input
                          autoFocus
                          className={`${classeEntrada} h-7 w-full text-xs`}
                          value={renomeando.nome}
                          onChange={(e) => setRenomeando({ id: m.id, nome: e.target.value })}
                          onBlur={() => {
                            void acao(() => api.renomearMidia(m.id, renomeando.nome))
                            setRenomeando(null)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur()
                            if (e.key === 'Escape') setRenomeando(null)
                          }}
                        />
                      ) : (
                        <div className="truncate text-[13px] font-medium" title={m.nome}>
                          {m.nome}
                        </div>
                      )}
                      <div className="truncate text-[11px] text-suave" title={m.detalhe ?? undefined}>
                        {m.situacao === 'erro' ? m.detalhe : `${m.largura && m.altura ? `${m.largura}×${m.altura} · ` : ''}${tamanho(m.bytes)}`}
                      </div>
                    </div>
                    {m.excluida ? (
                      <>
                        <Botao tamanho="xs" variante="fantasma" icone={Undo2} title="Restaurar" onClick={() => void acao(() => api.restaurarMidia(m.id))} />
                        <Botao tamanho="xs" variante="fantasma" icone={Trash2} title="Apagar de vez" onClick={() => void acao(() => api.apagarMidia(m.id))} />
                      </>
                    ) : (
                      <div className="flex opacity-0 transition-opacity group-hover:opacity-100">
                        <Botao tamanho="xs" variante="fantasma" icone={Pencil} title="Renomear" onClick={() => setRenomeando({ id: m.id, nome: m.nome })} />
                        <Botao tamanho="xs" variante="fantasma" icone={Trash2} title="Mandar para a lixeira" onClick={() => void acao(() => api.excluirMidia(m.id))} />
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {sobre && (
        <div className="pointer-events-none absolute inset-3 flex items-center justify-center rounded-xl border-2 border-dashed border-destaque bg-destaque/10 text-lg font-semibold text-destaque-texto">
          Soltar para importar
        </div>
      )}
    </div>
  )
}

function Faixa({ icone: Icone, texto, perigo }: { icone: typeof Film; texto: string; perigo?: boolean }) {
  return (
    <div className={`absolute inset-x-0 bottom-0 flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold text-white ${perigo ? 'bg-perigo/85' : 'bg-black/70'}`}>
      <Icone className={`size-3.5 ${perigo ? '' : 'animate-spin'}`} />
      {texto}
    </div>
  )
}
