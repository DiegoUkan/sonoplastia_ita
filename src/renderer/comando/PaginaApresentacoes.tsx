/**
 * Página "Apresentações": biblioteca de PPTX e PDF (importar pelo botão ou arrastando), grade de
 * slides da apresentação escolhida e a barra do que está no ar. Clique num slide para mostrar;
 * passador (PageDown/PageUp), setas, Home/End e "número + Enter" andam pelos slides.
 */
import {
  AudioLines,
  ChevronLeft,
  ChevronRight,
  EyeOff,
  FileText,
  Film,
  LoaderCircle,
  Pencil,
  Play,
  Plus,
  Presentation,
  RefreshCw,
  Search,
  StickyNote,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { type Apresentacao, comecaSozinha, type ResumoApresentacao } from '../../shared/apresentacao'
import type { Config } from '../../shared/config'
import type { ResultadoImportacao } from '../../shared/dados'
import type { EstadoMotor } from '../../shared/estado'
import { api } from '../compartilhado/ganchos'
import type { TeclaPagina } from './App'
import { mensagemDeErro } from './acoes'
import { arquivosDoArraste, iniciarArraste } from './arrastar'
import { BarraProgresso, Botao, classeEntrada, Selo } from './ui'

const digitando = (e: KeyboardEvent) => !!(e.target as HTMLElement | null)?.closest?.('input, textarea, select')

function resumoImportacao(r: ResultadoImportacao): string {
  const partes: string[] = []
  if (r.importadas.length) partes.push(`${r.importadas.length} importada(s): convertendo os slides em segundo plano`)
  if (r.repetidas.length) partes.push(`${r.repetidas.length} já estava(m) na lista`)
  if (r.ignoradas.length) partes.push(`não importado: ${r.ignoradas.join('; ')}`)
  return partes.join(' · ') || 'Nada importado.'
}

interface Props {
  alvo: string
  estado: EstadoMotor
  config: Config
  registrarTeclas: (f: TeclaPagina | null) => void
}

export function PaginaApresentacoes({ alvo, estado, config, registrarTeclas }: Props) {
  const [busca, setBusca] = useState('')
  const [lista, setLista] = useState<ResumoApresentacao[] | null>(null)
  const [selId, setSelId] = useState<number | null>(null)
  const [aberta, setAberta] = useState<Apresentacao | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [sobre, setSobre] = useState(false)
  const [renomeando, setRenomeando] = useState<string | null>(null)
  const grade = useRef<HTMLDivElement>(null)
  const noAr = estado.apresentacao

  const carregar = useCallback(async () => setLista(await api.listarApresentacoes(busca)), [busca])
  useEffect(() => {
    void carregar()
  }, [carregar])
  useEffect(() => api.aoMudarApresentacoes(() => void carregar()), [carregar])

  // escolhida: a que está no ar; senão a primeira da lista
  useEffect(() => {
    if (!lista) return
    if (selId !== null && lista.some((a) => a.id === selId)) return
    const doAr = lista.find((a) => a.id === noAr?.apresentacaoId)
    setSelId(doAr?.id ?? lista[0]?.id ?? null)
  }, [lista, selId, noAr?.apresentacaoId])

  // quando outra apresentação vai ao ar (arrastada para a miniatura, por exemplo), a grade passa a ser a dela
  useEffect(() => {
    if (noAr?.apresentacaoId !== undefined) setSelId(noAr.apresentacaoId)
  }, [noAr?.apresentacaoId])

  const sel = lista?.find((a) => a.id === selId) ?? null
  const chaveSel = sel ? `${sel.id}:${sel.situacao}:${sel.total}:${sel.nome}` : ''
  useEffect(() => {
    if (!sel) {
      setAberta(null)
      return
    }
    let vivo = true
    void api.obterApresentacao(sel.id).then((a) => vivo && setAberta(a))
    return () => {
      vivo = false
    }
    // recarrega quando a escolhida termina de converter ou muda de nome
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveSel])

  const acao = (f: () => Promise<unknown>) => f().catch((e) => setAviso(mensagemDeErro(e)))

  const importar = async (caminhos?: string[]) => {
    setAviso('Importando…')
    try {
      const r = caminhos ? await api.importarApresentacoes(caminhos) : await api.escolherEImportarApresentacoes()
      setAviso(resumoImportacao(r))
      const id = r.importadas[0] ?? r.repetidas[0]
      if (id !== undefined) setSelId(id)
    } catch (e) {
      setAviso(mensagemDeErro(e))
    }
  }

  const estaNoAr = !!aberta && noAr?.apresentacaoId === aberta.id
  const indiceNoAr = estaNoAr ? noAr.indice : null

  const mostrar = useCallback(
    (indice: number) => {
      if (!aberta) return
      if (noAr?.apresentacaoId === aberta.id) void acao(() => api.comando({ tipo: 'apresentacao:slide', indice, alvo }))
      else void acao(() => api.abrirApresentacao(aberta.id, alvo, indice))
    },
    [aberta, noAr?.apresentacaoId, alvo],
  )

  /** O passador mexe no que está no ar; sem nada no ar, começa a escolhida. */
  const andar = useCallback(
    (passo: 1 | -1) => {
      if (noAr) void acao(() => api.comando({ tipo: 'apresentacao:passo', passo }))
      else if (aberta?.situacao === 'pronto') void acao(() => api.abrirApresentacao(aberta.id, alvo))
    },
    [noAr, aberta, alvo],
  )

  // slide no ar sempre à vista na grade
  useEffect(() => {
    if (indiceNoAr === null) return
    grade.current?.querySelector(`[data-slide="${indiceNoAr}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [indiceNoAr])

  // teclas: passador, setas, Home/End e "número + Enter" (como no PowerPoint)
  const digitos = useRef('')
  const atual = useRef({ andar, mostrar, noAr, aberta })
  atual.current = { andar, mostrar, noAr, aberta }
  useEffect(() => {
    registrarTeclas((e) => {
      const { andar: an, mostrar: mo, noAr: na, aberta: ab } = atual.current
      if (digitando(e)) return false
      const k = e.key
      if (/^[0-9]$/.test(k)) {
        digitos.current = (digitos.current + k).slice(-3)
        return true
      }
      if (k === 'Enter' && digitos.current) {
        const n = Number(digitos.current) - 1
        digitos.current = ''
        if (na) void api.comando({ tipo: 'apresentacao:slide', indice: n })
        else if (ab) mo(n)
        return true
      }
      digitos.current = ''
      if (k === 'PageDown' || k === 'ArrowRight' || k === 'ArrowDown') an(1)
      else if (k === 'PageUp' || k === 'ArrowLeft' || k === 'ArrowUp') an(-1)
      else if (k === 'Home' && na) void api.comando({ tipo: 'apresentacao:slide', indice: 0 })
      else if (k === 'End' && na) void api.comando({ tipo: 'apresentacao:slide', indice: na.slides.length - 1 })
      else return false
      return true
    })
    return () => registrarTeclas(null)
  }, [registrarTeclas])

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
      {aviso && (
        <div className="flex items-center justify-between gap-3 border-b border-borda bg-painel-2 px-5 py-2 text-sm text-suave">
          <span>{aviso}</span>
          <button type="button" className="cursor-pointer text-xs text-apagado hover:text-texto" onClick={() => setAviso(null)}>
            fechar
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* lista de apresentações */}
        <div className="flex w-72 shrink-0 flex-col border-r border-borda">
          <div className="flex items-center gap-2 border-b border-borda p-3">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-apagado" />
              <input className={`${classeEntrada} w-full pl-8`} placeholder="Buscar" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <Botao variante="primario" icone={Plus} onClick={() => void importar()} title="Importar .pptx ou .pdf">
              Importar
            </Botao>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {lista?.length === 0 && (
              <p className="p-3 text-sm text-suave">Nenhuma apresentação. Arraste arquivos .pptx ou .pdf para cá, ou use “Importar”.</p>
            )}
            {lista?.map((a) => (
              <ItemLista
                key={a.id}
                a={a}
                escolhida={a.id === selId}
                noAr={noAr?.apresentacaoId === a.id}
                aoEscolher={() => {
                  setSelId(a.id)
                  setRenomeando(null)
                }}
              />
            ))}
          </div>
        </div>

        {/* apresentação escolhida */}
        <div className="flex min-w-0 flex-1 flex-col">
          {!sel ? (
            <Vazio />
          ) : (
            <>
              <div className="flex items-center gap-2 border-b border-borda px-5 py-2.5">
                {renomeando !== null ? (
                  <input
                    autoFocus
                    className={`${classeEntrada} h-8 min-w-0 flex-1`}
                    value={renomeando}
                    onChange={(e) => setRenomeando(e.target.value)}
                    onBlur={() => {
                      void acao(() => api.renomearApresentacao(sel.id, renomeando))
                      setRenomeando(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur()
                      if (e.key === 'Escape') setRenomeando(null)
                    }}
                  />
                ) : (
                  <h2 className="min-w-0 truncate text-[15px] font-semibold" title={sel.nome}>
                    {sel.nome}
                  </h2>
                )}
                <Selo tom="apagado">{sel.tipo.toUpperCase()}</Selo>
                {sel.total > 0 && <span className="shrink-0 text-xs text-suave">{sel.total} slides</span>}
                <div className="ml-auto flex shrink-0 items-center gap-1">
                  {sel.situacao === 'pronto' && (
                    <Botao variante="primario" icone={Play} onClick={() => void acao(() => api.abrirApresentacao(sel.id, alvo))} title="Mostrar a partir do primeiro slide">
                      Do início
                    </Botao>
                  )}
                  <Botao variante="fantasma" icone={Pencil} onClick={() => setRenomeando(sel.nome)} title="Renomear" />
                  <Botao
                    variante="fantasma"
                    icone={RefreshCw}
                    disabled={sel.situacao === 'convertendo' || sel.situacao === 'na-fila'}
                    onClick={() => void acao(() => api.reconverterApresentacao(sel.id))}
                    title="Converter de novo (depois de mudar a resolução, ou se deu erro)"
                  />
                  <Botao
                    variante="fantasma"
                    icone={Trash2}
                    onClick={() =>
                      void acao(async () => {
                        if (await api.excluirApresentacao(sel.id)) setSelId(null)
                      })
                    }
                    title="Excluir"
                  />
                </div>
              </div>

              {sel.situacao !== 'pronto' ? (
                <Andamento a={sel} aoTentarDeNovo={() => void acao(() => api.reconverterApresentacao(sel.id))} />
              ) : (
                <div ref={grade} className="min-h-0 flex-1 overflow-y-auto p-4">
                  <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}>
                    {aberta?.id === sel.id &&
                      aberta.slides.map((s, i) => {
                        const ehNoAr = indiceNoAr === i
                        const video = s.midias.some((m) => m.tipo === 'video')
                        const audio = s.midias.some((m) => m.tipo === 'audio')
                        return (
                          <button
                            key={i}
                            type="button"
                            data-slide={i}
                            draggable
                            onDragStart={(e) => iniciarArraste(e, { tipo: 'apresentacao', id: aberta.id, nome: aberta.nome, indice: i })}
                            onClick={(e) => {
                              e.currentTarget.blur()
                              mostrar(i)
                            }}
                            title={`Slide ${i + 1}${s.oculto ? ' (oculto)' : ''}${s.notas ? `\n\n${s.notas.slice(0, 300)}` : ''}\n\nClique: mostrar · Arraste até uma miniatura para escolher a saída`}
                            className={`group relative cursor-pointer overflow-hidden rounded-lg bg-tela ring-offset-2 ring-offset-fundo transition-shadow ${
                              ehNoAr ? 'ring-[3px] ring-destaque' : 'ring-1 ring-borda hover:ring-2 hover:ring-destaque/50'
                            }`}
                          >
                            <img
                              src={s.miniaturaUrl}
                              alt=""
                              draggable={false}
                              loading="lazy"
                              className={`block w-full ${s.oculto ? 'opacity-40' : ''}`}
                              style={{ aspectRatio: `${s.largura} / ${s.altura}`, objectFit: 'contain' }}
                            />
                            <span className={`absolute left-1.5 top-1.5 rounded px-1.5 text-[11px] font-semibold tabular-nums ${ehNoAr ? 'bg-destaque text-sobre-destaque' : 'bg-black/70 text-white'}`}>
                              {i + 1}
                            </span>
                            <span className="absolute bottom-1.5 right-1.5 flex gap-1">
                              {s.oculto && <Marca icone={EyeOff} dica="Slide oculto (o passador pula)" />}
                              {video && <Marca icone={Film} dica="Tem vídeo" />}
                              {audio && <Marca icone={AudioLines} dica="Tem áudio" />}
                              {s.notas && <Marca icone={StickyNote} dica="Tem anotações" />}
                            </span>
                          </button>
                        )
                      })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <BarraNoAr estado={estado} config={config} aoAndar={andar} />

      {sobre && (
        <div className="pointer-events-none absolute inset-3 flex items-center justify-center rounded-xl border-2 border-dashed border-destaque bg-destaque/10 text-lg font-semibold text-destaque-texto">
          Soltar para importar (.pptx ou .pdf)
        </div>
      )}
    </div>
  )
}

function Marca({ icone: Icone, dica }: { icone: typeof Film; dica: string }) {
  return (
    <span title={dica} className="flex size-5 items-center justify-center rounded bg-black/70 text-white">
      <Icone className="size-3" />
    </span>
  )
}

function ItemLista({ a, escolhida, noAr, aoEscolher }: { a: ResumoApresentacao; escolhida: boolean; noAr: boolean; aoEscolher: () => void }) {
  const convertendo = a.situacao === 'convertendo' || a.situacao === 'na-fila'
  return (
    <button
      type="button"
      draggable={a.situacao === 'pronto'}
      onDragStart={(e) => iniciarArraste(e, { tipo: 'apresentacao', id: a.id, nome: a.nome, indice: 0 })}
      onClick={(e) => {
        e.currentTarget.blur()
        aoEscolher()
      }}
      className={`mb-1 flex w-full cursor-pointer items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors ${escolhida ? 'bg-destaque/12' : 'hover:bg-hover'}`}
    >
      <div className="relative flex aspect-video w-20 shrink-0 items-center justify-center overflow-hidden rounded bg-tela">
        {a.miniaturaUrl ? (
          <img src={a.miniaturaUrl} alt="" draggable={false} className="h-full w-full object-contain" />
        ) : a.tipo === 'pdf' ? (
          <FileText className="size-6 text-white/40" />
        ) : (
          <Presentation className="size-6 text-white/40" />
        )}
        {noAr && <span className="absolute inset-x-0 bottom-0 bg-destaque text-center text-[9px] font-bold uppercase text-sobre-destaque">no ar</span>}
      </div>
      <div className="min-w-0 flex-1">
        <div className={`truncate text-[13px] ${escolhida ? 'font-semibold text-destaque-texto' : 'font-medium'}`} title={a.nome}>
          {a.nome}
        </div>
        <div className="flex items-center gap-1 truncate text-[11px] text-suave">
          {convertendo ? (
            <>
              <LoaderCircle className="size-3 animate-spin" />
              {a.situacao === 'na-fila' ? 'Na fila' : `Convertendo ${a.progresso !== null ? Math.round(a.progresso * 100) + '%' : '…'}`}
            </>
          ) : a.situacao === 'erro' ? (
            <span className="flex items-center gap-1 text-perigo-texto">
              <TriangleAlert className="size-3" /> Erro
            </span>
          ) : (
            `${a.total} slides · ${a.tipo.toUpperCase()}`
          )}
        </div>
      </div>
    </button>
  )
}

function Andamento({ a, aoTentarDeNovo }: { a: ResumoApresentacao; aoTentarDeNovo: () => void }) {
  if (a.situacao === 'erro') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <TriangleAlert className="size-10 text-perigo" />
        <p className="max-w-lg text-sm">{a.detalhe ?? 'Não foi possível converter esta apresentação.'}</p>
        <Botao icone={RefreshCw} onClick={aoTentarDeNovo}>
          Tentar de novo
        </Botao>
      </div>
    )
  }
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-suave">
      <LoaderCircle className="size-10 animate-spin text-apagado" />
      <p className="text-sm">
        {a.situacao === 'na-fila' ? 'Esperando a vez para converter…' : a.tipo === 'pptx' ? 'O PowerPoint está transformando os slides em imagens…' : 'Transformando as páginas em imagens…'}
      </p>
      <div className="w-72">
        <BarraProgresso fracao={a.progresso ?? 0} texto={`${Math.round((a.progresso ?? 0) * 100)}%`} />
      </div>
      <p className="max-w-md text-xs">Importe antes do culto: a conversão usa o computador por alguns segundos ou minutos.</p>
    </div>
  )
}

function Vazio() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-suave">
      <Presentation className="size-10 text-apagado" />
      <p className="text-sm">Arraste arquivos .pptx ou .pdf para cá, ou use “Importar”.</p>
      <p className="max-w-md text-xs">
        Os slides viram imagens na importação: ficam iguais ao original, mas sem as animações. Vídeos e áudios do PowerPoint tocam no lugar deles. Para .pptx, o
        PowerPoint precisa estar instalado.
      </p>
    </div>
  )
}

/** Barra de baixo: o que está no ar, anterior/próximo, anotações e o próximo slide. */
function BarraNoAr({ estado, config, aoAndar }: { estado: EstadoMotor; config: Config; aoAndar: (p: 1 | -1) => void }) {
  const a = estado.apresentacao
  const s = a ? a.slides[a.indice] : null
  const pendente = !!a && !a.midiasIniciadas && !!s?.midias.some((m) => !comecaSozinha(m, config.apresentacoes.midiasDosSlides))
  const ocultos = a?.slides.map((x) => x.oculto) ?? []
  let proximo: number | null = null
  if (a) for (let i = a.indice + 1; i < a.slides.length; i++) if (!config.apresentacoes.pularOcultos || !ocultos[i]) { proximo = i; break }

  return (
    <div className="flex h-28 shrink-0 items-stretch gap-3 border-t border-borda bg-painel px-5 py-2.5">
      <div className="flex shrink-0 flex-col justify-center gap-1.5">
        <div className="flex gap-2">
          <Botao icone={ChevronLeft} onClick={() => aoAndar(-1)} title="Anterior (PageUp)">
            Anterior
          </Botao>
          <Botao variante="primario" icone={ChevronRight} onClick={() => aoAndar(1)} title="Próximo (PageDown)">
            {pendente ? 'Tocar mídia' : 'Próximo'}
          </Botao>
        </div>
        <div className="flex items-center gap-2 text-xs text-suave">
          {a && s ? (
            <>
              <span className="truncate" title={a.nome}>
                No ar: <b className="text-texto">slide {a.indice + 1}</b> de {a.slides.length}
              </span>
              <button
                type="button"
                className="flex cursor-pointer items-center gap-0.5 rounded px-1 text-apagado hover:bg-hover hover:text-texto"
                onClick={() => void api.comando({ tipo: 'apresentacao:fechar' })}
                title="Tirar a apresentação do ar"
              >
                <X className="size-3" /> fechar
              </button>
            </>
          ) : (
            'Nenhuma apresentação no ar.'
          )}
        </div>
      </div>
      <div className="min-w-0 flex-1 overflow-y-auto rounded-md bg-painel-2 px-3 py-2 text-sm leading-snug">
        {pendente && <div className="mb-1 text-xs font-semibold text-aviso-texto">O próximo clique começa o vídeo/áudio deste slide.</div>}
        {s?.notas ? (
          <span className="whitespace-pre-line">{s.notas}</span>
        ) : (
          <span className="text-apagado">{a ? 'Sem anotações neste slide.' : 'As anotações do orador aparecem aqui.'}</span>
        )}
      </div>
      <div className="flex w-36 shrink-0 flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-suave">Próximo</span>
        <div className="min-h-0 flex-1 overflow-hidden rounded bg-tela">
          {a && proximo !== null ? (
            <img src={a.slides[proximo]!.url} alt="" draggable={false} className="h-full w-full object-contain" />
          ) : (
            <div className="flex h-full items-center justify-center text-[11px] text-white/50">{a ? 'Fim' : ''}</div>
          )}
        </div>
      </div>
    </div>
  )
}
