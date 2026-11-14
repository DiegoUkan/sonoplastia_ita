/**
 * Página "Liturgia": o roteiro do culto em SEÇÕES (Escola Sabatina, Louvor, Momento Infantil,
 * Mensagem…). Cada seção tem a sua imagem de fundo, que fica atrás dos versículos, textos e músicas
 * enquanto um item dela está no ar. Monta e roda no mesmo lugar: clique num item para editar, ▶ (ou
 * duplo clique) para pôr no ar, "Próximo item" embaixo (tecla N; P volta).
 * O passador (PageDown/PageUp) anda DENTRO do item no ar: versículos, slides, trechos da música.
 * Tudo é gravado sozinho meio segundo depois de cada mudança.
 */
import {
  ArrowDown,
  ArrowUp,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  HelpCircle,
  FastForward,
  GripVertical,
  ImagePlus,
  LayoutTemplate,
  ListOrdered,
  Play,
  Plus,
  Square,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ehApresentacao } from '../../shared/apresentacao'
import type { Config } from '../../shared/config'
import type { EstadoMotor } from '../../shared/estado'
import {
  acharItem,
  type AlteracaoLiturgia,
  dataDeHoje,
  formatarData,
  formatarHora,
  horariosPrevistos,
  type ItemLiturgia,
  type Liturgia,
  minutosDe,
  moverItem,
  novoId,
  proximoSabado,
  type ResumoLiturgia,
  type SecaoLiturgia,
  secaoNova,
  tituloDoItem,
  vizinhoDoNoAr,
} from '../../shared/liturgia'
import { urlMidia } from '../../shared/midia'
import { api, useAgora } from '../compartilhado/ganchos'
import type { TeclaPagina } from './App'
import { mensagemDeErro } from './acoes'
import { arquivosDoArraste, TIPO_ARRASTE } from './arrastar'
import { completarItem, detalheDoItem, iconeDoItem, MiniaturaItem, PainelAdicionar, PainelEditar, useMiniaturasLiturgia } from './PainelItemLiturgia'
import { Botao, classeEntrada, Interruptor, Selo } from './ui'

const digitando = (e: KeyboardEvent) => !!(e.target as HTMLElement | null)?.closest?.('input, textarea, select')
/** reordenar itens arrastando (só dentro desta página) */
const TIPO_REORDENAR = 'application/x-sonoplastia-item-liturgia'

type Painel = { tipo: 'adicionar'; secaoId: string } | { tipo: 'editar'; itemId: string } | { tipo: 'dicas' } | null

interface Props {
  alvo: string
  estado: EstadoMotor
  config: Config
  registrarTeclas: (f: TeclaPagina | null) => void
}

/** Liturgia para abrir: a que está no ar, a de hoje, a próxima, a mais recente, ou um modelo. */
function escolherInicial(lista: ResumoLiturgia[], noAr: number | null): number | null {
  if (noAr !== null && lista.some((l) => l.id === noAr)) return noAr
  const cultos = lista.filter((l) => !l.modelo)
  const hoje = dataDeHoje()
  const deHoje = cultos.find((l) => l.data === hoje)
  if (deHoje) return deHoje.id
  const proximas = cultos.filter((l) => l.data && l.data > hoje).sort((a, b) => a.data!.localeCompare(b.data!))
  return proximas[0]?.id ?? cultos[0]?.id ?? lista[0]?.id ?? null
}

export function PaginaLiturgia({ alvo, estado, config, registrarTeclas }: Props) {
  const [lista, setLista] = useState<ResumoLiturgia[] | null>(null)
  const [selId, setSelId] = useState<number | null>(null)
  const [doc, setDoc] = useState<Liturgia | null>(null)
  const miniaturas = useMiniaturasLiturgia(doc?.secoes ?? null)
  const [painel, setPainel] = useState<Painel>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [novoAberto, setNovoAberto] = useState(false)
  const docRef = useRef<Liturgia | null>(null)
  const pendente = useRef<{ id: number; a: AlteracaoLiturgia } | null>(null)
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null)

  const carregarLista = useCallback(() => api.listarLiturgias().then(setLista), [])
  useEffect(() => {
    void carregarLista()
    return api.aoMudarLiturgias(() => void carregarLista())
  }, [carregarLista])

  const noArId = estado.liturgia?.liturgiaId ?? null
  useEffect(() => {
    if (lista && (selId === null || !lista.some((l) => l.id === selId))) setSelId(escolherInicial(lista, noArId))
  }, [lista, selId, noArId])

  // --- gravação (meio segundo depois da última mudança; na hora antes de pôr algo no ar)
  const salvarAgora = useCallback(async () => {
    if (relogio.current) clearTimeout(relogio.current)
    relogio.current = null
    const p = pendente.current
    pendente.current = null
    if (!p) return
    try {
      await api.salvarLiturgia(p.id, p.a)
    } catch (e) {
      setAviso(mensagemDeErro(e))
    }
  }, [])
  useEffect(() => () => void salvarAgora(), [salvarAgora])

  const alterar = useCallback(
    (f: (d: Liturgia) => Liturgia) => {
      const atual = docRef.current
      if (!atual) return
      const novo = f(atual)
      docRef.current = novo
      setDoc(novo)
      pendente.current = { id: novo.id, a: { nome: novo.nome, data: novo.data, inicio: novo.inicio, secoes: novo.secoes } }
      if (relogio.current) clearTimeout(relogio.current)
      relogio.current = setTimeout(() => void salvarAgora(), 500)
    },
    [salvarAgora],
  )

  useEffect(() => {
    let vivo = true
    void (async () => {
      await salvarAgora()
      const l = selId === null ? null : await api.obterLiturgia(selId)
      if (!vivo) return
      docRef.current = l
      setDoc(l)
      setPainel(null)
    })()
    return () => {
      vivo = false
    }
  }, [selId, salvarAgora])

  const tentar = (f: () => Promise<unknown>) => f().catch((e) => setAviso(mensagemDeErro(e)))

  // --- edição
  const mudarSecoes = (f: (s: SecaoLiturgia[]) => SecaoLiturgia[]) => alterar((d) => ({ ...d, secoes: f(d.secoes) }))
  const mudarSecao = (id: string, p: Partial<SecaoLiturgia>) => mudarSecoes((ss) => ss.map((s) => (s.id === id ? { ...s, ...p } : s)))
  const mudarItem = (item: ItemLiturgia) => mudarSecoes((ss) => ss.map((s) => ({ ...s, itens: s.itens.map((i) => (i.id === item.id ? item : i)) })))
  const adicionarItem = (secaoId: string, item: ItemLiturgia) => mudarSecoes((ss) => ss.map((s) => (s.id === secaoId ? { ...s, itens: [...s.itens, item] } : s)))
  const removerItem = (itemId: string) => {
    mudarSecoes((ss) => ss.map((s) => ({ ...s, itens: s.itens.filter((i) => i.id !== itemId) })))
    setPainel(null)
  }
  const duplicarItem = (itemId: string) =>
    mudarSecoes((ss) =>
      ss.map((s) => {
        const k = s.itens.findIndex((i) => i.id === itemId)
        if (k < 0) return s
        const copia = { ...structuredClone(s.itens[k]!), id: novoId() }
        return { ...s, itens: [...s.itens.slice(0, k + 1), copia, ...s.itens.slice(k + 1)] }
      }),
    )
  const moverSecao = (id: string, passo: 1 | -1) =>
    mudarSecoes((ss) => {
      const i = ss.findIndex((s) => s.id === id)
      const j = i + passo
      if (i < 0 || j < 0 || j >= ss.length) return ss
      const n = [...ss]
      ;[n[i], n[j]] = [n[j]!, n[i]!]
      return n
    })
  const removerSecao = (s: SecaoLiturgia) => {
    if (s.itens.length && !confirm(`Remover a seção "${s.nome}" e os ${s.itens.length} itens dela?`)) return
    mudarSecoes((ss) => ss.filter((x) => x.id !== s.id))
    setPainel(null)
  }

  // --- pôr no ar
  const executar = (itemId: string) =>
    tentar(async () => {
      await salvarAgora()
      if (doc) await api.executarItemLiturgia(doc.id, itemId, alvo)
    })
  const abertura = (secaoId: string) =>
    tentar(async () => {
      await salvarAgora()
      if (doc) await api.aberturaSecao(doc.id, secaoId, alvo)
    })
  const vizinho = useCallback(
    (passo: 1 | -1) =>
      tentar(async () => {
        await salvarAgora()
        const d = docRef.current
        if (!d) return
        const id = await api.vizinhoLiturgia(d.id, passo, alvo)
        if (id === null) setAviso(passo === 1 ? 'Era o último item da liturgia.' : 'Este já é o primeiro item.')
        else document.querySelector(`[data-item-liturgia="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [alvo, salvarAgora],
  )

  const noAr = doc && estado.liturgia?.liturgiaId === doc.id ? estado.liturgia : null
  const posNoAr = noAr?.itemId && doc ? acharItem(doc.secoes, noAr.itemId) : null

  // teclas: passador dentro do item; N/P = próximo/anterior item
  const atual = useRef({ posNoAr, estado, vizinho })
  atual.current = { posNoAr, estado, vizinho }
  useEffect(() => {
    registrarTeclas((e) => {
      if (digitando(e)) return false
      const { posNoAr: p, estado: est, vizinho: viz } = atual.current
      const k = e.key
      if (k === 'n' || k === 'N') {
        void viz(1)
        return true
      }
      if (k === 'p' || k === 'P') {
        void viz(-1)
        return true
      }
      const prox = k === 'PageDown' || k === 'ArrowRight' || k === 'ArrowDown'
      const ant = k === 'PageUp' || k === 'ArrowLeft' || k === 'ArrowUp'
      if (!prox && !ant) return false
      const t = p?.item.tipo
      // no sorteio, o "próximo" sorteia
      const temDentro = t === 'biblia' || t === 'sorteio' || (t === 'apresentacao' && !!est.apresentacao) || (t === 'musica' && !!est.musica)
      // sem "dentro" (vídeo, texto…): a tecla segue para a apresentação no ar, se houver
      if (!temDentro) return false
      void api.passoLiturgia(prox ? 1 : -1)
      return true
    })
    return () => registrarTeclas(null)
  }, [registrarTeclas])

  // --- arquivos soltos numa seção: viram itens (ou o fundo, se for na imagem da seção)
  const soltarArquivos = async (secaoId: string, caminhos: string[]) => {
    const apres = caminhos.filter(ehApresentacao)
    const outros = caminhos.filter((c) => !ehApresentacao(c))
    const ignorados: string[] = []
    if (apres.length) {
      const r = await api.importarApresentacoes(apres)
      ignorados.push(...r.ignoradas)
      const todas = await api.listarApresentacoes('')
      for (const id of [...r.importadas, ...r.repetidas]) {
        const a = todas.find((x) => x.id === id)
        if (a) adicionarItem(secaoId, completarItem({ tipo: 'apresentacao', apresentacaoId: a.id, titulo: a.nome }))
      }
    }
    if (outros.length) {
      const r = await api.importarMidias(outros)
      ignorados.push(...r.ignoradas)
      const todas = await api.listarMidias({})
      for (const id of [...r.importadas, ...r.repetidas]) {
        const m = todas.find((x) => x.id === id)
        if (m) adicionarItem(secaoId, completarItem({ tipo: 'midia', midiaId: m.id, midiaTipo: m.tipo, titulo: m.nome }))
      }
    }
    setAviso(ignorados.length ? `Não importado: ${ignorados.join('; ')}` : null)
  }

  if (!lista) return null
  const horarios = doc ? horariosPrevistos(doc.secoes, doc.inicio) : null
  const itemEditado = painel?.tipo === 'editar' && doc ? acharItem(doc.secoes, painel.itemId) : null
  const secaoAdicionar = painel?.tipo === 'adicionar' && doc ? doc.secoes.find((s) => s.id === painel.secaoId) : null
  const modelos = lista.filter((l) => l.modelo)
  const cultos = lista.filter((l) => !l.modelo)

  const novo = (origemId: number | null, nome?: string) =>
    tentar(async () => {
      setNovoAberto(false)
      await salvarAgora()
      const id = await api.copiarLiturgia(origemId, { modelo: false, data: proximoSabado(), nome })
      await carregarLista()
      setSelId(id)
    })

  return (
    <div className="flex h-full flex-col">
      {/* barra de cima: qual culto, nome, data e horário */}
      <div className="flex flex-wrap items-center gap-2 border-b border-borda px-4 py-2.5">
        <select
          className={`${classeEntrada} w-52 font-semibold`}
          value={selId ?? ''}
          onChange={(e) => {
            e.currentTarget.blur()
            setSelId(Number(e.target.value))
          }}
          title="Escolher o culto ou o modelo"
        >
          {cultos.length > 0 && (
            <optgroup label="Cultos">
              {cultos.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.data ? `${formatarData(l.data)} · ` : ''}
                  {l.nome}
                </option>
              ))}
            </optgroup>
          )}
          {modelos.length > 0 && (
            <optgroup label="Modelos">
              {modelos.map((l) => (
                <option key={l.id} value={l.id}>
                  Modelo: {l.nome}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <div className="relative">
          <Botao variante="primario" icone={CalendarPlus} onClick={() => setNovoAberto(!novoAberto)} title="Novo culto (a partir de um modelo)">
            Novo
          </Botao>
          {novoAberto && (
            <div className="absolute left-0 top-10 z-20 w-72 rounded-lg border border-borda bg-painel p-1.5 shadow-lg">
              <p className="px-2 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-suave">Para {formatarData(proximoSabado())}, a partir de</p>
              {modelos.map((m) => (
                <button key={m.id} type="button" className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-hover" onClick={() => void novo(m.id, m.nome)}>
                  <LayoutTemplate className="size-4 text-suave" /> {m.nome}
                  <span className="ml-auto text-[11px] text-apagado">{m.itens} itens</span>
                </button>
              ))}
              <button type="button" className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-hover" onClick={() => void novo(null, 'Culto')}>
                <ListOrdered className="size-4 text-suave" /> Só as seções padrão (vazio)
              </button>
            </div>
          )}
        </div>
        {doc && (
          <>
            {doc.modelo && <Selo tom="destaque">Modelo</Selo>}
            <input className={`${classeEntrada} min-w-24 flex-1`} value={doc.nome} onChange={(e) => alterar((d) => ({ ...d, nome: e.target.value }))} title="Nome" />
            {!doc.modelo && (
              <input type="date" className={`${classeEntrada} w-36`} value={doc.data ?? ''} onChange={(e) => alterar((d) => ({ ...d, data: e.target.value || null }))} title="Data" />
            )}
            <label className="flex items-center gap-1 text-xs text-suave" title="Horário de início (para calcular o horário de cada parte)">
              <Clock className="size-3.5" />
              <input type="time" className={`${classeEntrada} w-24`} value={doc.inicio ?? ''} onChange={(e) => alterar((d) => ({ ...d, inicio: e.target.value || null }))} />
            </label>
            <div className="ml-auto flex items-center">
              <Botao variante="fantasma" icone={HelpCircle} ativo={painel?.tipo === 'dicas'} onClick={() => setPainel(painel?.tipo === 'dicas' ? null : { tipo: 'dicas' })} title="Como usar" />
              {!doc.modelo && (
                <Botao
                  variante="fantasma"
                  icone={LayoutTemplate}
                  onClick={() =>
                    tentar(async () => {
                      await salvarAgora()
                      await api.copiarLiturgia(doc.id, { modelo: true, nome: doc.nome })
                      setAviso(`"${doc.nome}" foi salvo também como modelo.`)
                    })
                  }
                  title="Salvar também como modelo (para os próximos cultos)"
                />
              )}
              <Botao
                variante="fantasma"
                icone={Copy}
                onClick={() =>
                  tentar(async () => {
                    await salvarAgora()
                    const id = await api.copiarLiturgia(doc.id, { modelo: doc.modelo, data: doc.data, nome: `${doc.nome} (cópia)` })
                    await carregarLista()
                    setSelId(id)
                  })
                }
                title="Duplicar"
              />
              <Botao
                variante="fantasma"
                icone={Trash2}
                onClick={() =>
                  tentar(async () => {
                    await salvarAgora()
                    if (await api.excluirLiturgia(doc.id)) setSelId(null)
                  })
                }
                title="Excluir"
              />
            </div>
          </>
        )}
      </div>
      {aviso && (
        <div className="flex items-center justify-between gap-3 border-b border-borda bg-painel-2 px-5 py-2 text-sm">
          <span>{aviso}</span>
          <button type="button" className="cursor-pointer text-xs text-apagado hover:text-texto" onClick={() => setAviso(null)}>
            fechar
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {!doc ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-suave">
              <ListOrdered className="size-10 text-apagado" />
              <p className="text-sm">Crie um culto com “Novo culto”.</p>
            </div>
          ) : (
            <div className="mx-auto flex max-w-4xl flex-col gap-3">
              {doc.secoes.map((s, k) => (
                <CartaoSecao
                  key={s.id}
                  secao={s}
                  primeira={k === 0}
                  ultima={k === doc.secoes.length - 1}
                  config={config}
                  horarios={horarios!}
                  noArSecao={noAr?.secaoId === s.id}
                  itemNoAr={noAr?.itemId ?? null}
                  editado={painel?.tipo === 'editar' ? painel.itemId : null}
                  liturgiaId={doc.id}
                  miniaturas={miniaturas}
                  aoMudar={(p) => mudarSecao(s.id, p)}
                  aoMover={(p) => moverSecao(s.id, p)}
                  aoRemover={() => removerSecao(s)}
                  aoAbertura={() => void abertura(s.id)}
                  aoAdicionar={() => setPainel({ tipo: 'adicionar', secaoId: s.id })}
                  aoEditar={(id) => setPainel({ tipo: 'editar', itemId: id })}
                  aoExecutar={(id) => void executar(id)}
                  aoSoltarItem={(itemId, indice) => mudarSecoes((ss) => moverItem(ss, itemId, s.id, indice))}
                  aoSoltarArquivos={(c) => void tentar(() => soltarArquivos(s.id, c))}
                  aoErro={setAviso}
                />
              ))}
              <Botao
                variante="fantasma"
                icone={Plus}
                className="self-start"
                onClick={() => {
                  const s = secaoNova('Nova seção')
                  mudarSecoes((ss) => [...ss, s])
                  setPainel({ tipo: 'adicionar', secaoId: s.id })
                }}
              >
                Nova seção
              </Botao>
              {horarios?.fim != null && <p className="text-xs text-suave">Término previsto: {formatarHora(horarios.fim)} (soma das durações dos itens ligados).</p>}
            </div>
          )}
        </div>

        {/* o painel só aparece quando está em uso: as seções ficam com a largura toda */}
        {painel && (
        <aside className="flex w-80 shrink-0 flex-col border-l border-borda bg-painel">
          {secaoAdicionar ? (
            <PainelAdicionar secaoNome={secaoAdicionar.nome} config={config} aoAdicionar={(i) => adicionarItem(secaoAdicionar.id, i)} aoFechar={() => setPainel(null)} />
          ) : itemEditado ? (
            <PainelEditar
              key={itemEditado.item.id}
              item={itemEditado.item}
              config={config}
              aoMudar={mudarItem}
              aoExecutar={() => void executar(itemEditado.item.id)}
              aoDuplicar={() => duplicarItem(itemEditado.item.id)}
              aoRemover={() => removerItem(itemEditado.item.id)}
              aoFechar={() => setPainel(null)}
            />
          ) : painel.tipo === 'dicas' ? (
            <Dicas aoFechar={() => setPainel(null)} />
          ) : null}
        </aside>
        )}
      </div>

      <BarraCulto doc={doc} estado={estado} horarios={horarios} aoVizinho={(p) => void vizinho(p)} />
    </div>
  )
}

function Dicas({ aoFechar }: { aoFechar: () => void }) {
  return (
    <div className="flex min-h-0 flex-col gap-3 overflow-y-auto p-4 text-[13px] leading-snug text-suave">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-texto">Como usar</p>
        <Botao tamanho="xs" variante="fantasma" icone={X} onClick={aoFechar} title="Fechar" />
      </div>
      <p>
        <b>Seções</b>: cada uma tem a sua imagem de fundo (clique no quadrado da seção, ou arraste uma imagem até ele). Enquanto um item da seção está no ar,
        versículos, textos e músicas ficam com esse fundo.
      </p>
      <p>
        <b>▶ Abertura</b> mostra a imagem da seção em tela cheia.
      </p>
      <p>
        <b>Itens</b>: “+ Adicionar” na seção, ou arraste arquivos (.mp4, .jpg, .mp3, .pptx, .pdf) para ela. Arraste os itens para mudar a ordem ou de seção.
      </p>
      <p>
        <b>No culto</b>: “Próximo item” (tecla <b>N</b>; <b>P</b> volta). O passador anda dentro do item: versículos, slides, trechos da música.
      </p>
      <p>Arraste um item até a miniatura de uma saída para mostrar só nela.</p>
    </div>
  )
}

interface PropsSecao {
  secao: SecaoLiturgia
  primeira: boolean
  ultima: boolean
  config: Config
  horarios: ReturnType<typeof horariosPrevistos>
  noArSecao: boolean
  itemNoAr: string | null
  editado: string | null
  liturgiaId: number
  /** imagem de cada item (mídia, slide, música), pelo id do item */
  miniaturas: Map<string, string>
  aoMudar: (p: Partial<SecaoLiturgia>) => void
  aoMover: (p: 1 | -1) => void
  aoRemover: () => void
  aoAbertura: () => void
  aoAdicionar: () => void
  aoEditar: (id: string) => void
  aoExecutar: (id: string) => void
  aoSoltarItem: (itemId: string, indice: number) => void
  aoSoltarArquivos: (caminhos: string[]) => void
  aoErro: (m: string) => void
}

function CartaoSecao(p: PropsSecao) {
  const s = p.secao
  const [soltarEm, setSoltarEm] = useState<number | null>(null)
  const [sobreFundo, setSobreFundo] = useState(false)
  const inicio = p.horarios.secoes.get(s.id)
  const minutos = s.itens.filter((i) => i.ativo).reduce((t, i) => t + (i.duracaoMin ?? 0), 0)

  const escolherFundo = async () => {
    try {
      const c = await api.escolherFundoSecao()
      if (c) p.aoMudar({ fundo: c })
    } catch (e) {
      p.aoErro(mensagemDeErro(e))
    }
  }

  return (
    <section
      className={`@container overflow-hidden rounded-xl border bg-painel transition-colors ${p.noArSecao ? 'border-destaque' : 'border-borda'}`}
      onDragOver={(e) => {
        const tipos = [...e.dataTransfer.types]
        if (!tipos.includes(TIPO_REORDENAR) && !tipos.includes('Files')) return
        e.preventDefault()
        e.dataTransfer.dropEffect = tipos.includes('Files') ? 'copy' : 'move'
        // fora das linhas (cabeçalho, rodapé, espaço vazio): vai para o fim da seção
        if (tipos.includes(TIPO_REORDENAR)) setSoltarEm(s.itens.length)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSoltarEm(null)
      }}
      onDrop={(e) => {
        e.preventDefault()
        const id = e.dataTransfer.getData(TIPO_REORDENAR)
        const indice = soltarEm ?? s.itens.length
        setSoltarEm(null)
        if (id) p.aoSoltarItem(id, indice)
        else {
          const arquivos = arquivosDoArraste(e)
          if (arquivos.length) p.aoSoltarArquivos(arquivos)
        }
      }}
    >
      <header className={`flex items-center gap-3 border-b border-borda px-3 py-2 ${p.noArSecao ? 'bg-destaque/8' : ''}`}>
        <button
          type="button"
          onClick={(e) => {
            e.currentTarget.blur()
            void escolherFundo()
          }}
          onDragOver={(e) => {
            if (![...e.dataTransfer.types].includes('Files')) return
            e.preventDefault()
            e.stopPropagation()
            setSobreFundo(true)
          }}
          onDragLeave={() => setSobreFundo(false)}
          onDrop={(e) => {
            const [c] = arquivosDoArraste(e)
            setSobreFundo(false)
            if (!c) return
            e.preventDefault()
            e.stopPropagation()
            api
              .importarFundoSecao(c)
              .then((f) => p.aoMudar({ fundo: f }))
              .catch((err) => p.aoErro(mensagemDeErro(err)))
          }}
          title={s.fundo ? 'Trocar a imagem de fundo da seção (ou arraste uma imagem aqui)' : 'Escolher a imagem de fundo da seção (ou arraste uma imagem aqui)'}
          className={`relative flex aspect-video w-24 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-md bg-tela ring-2 ${sobreFundo ? 'ring-destaque' : 'ring-transparent'}`}
        >
          {s.fundo ? (
            <img src={urlMidia(s.fundo)} alt="" draggable={false} className="h-full w-full object-cover" />
          ) : (
            <span className="flex flex-col items-center gap-0.5 text-[10px] text-white/60">
              <ImagePlus className="size-5" /> fundo
            </span>
          )}
        </button>
        <div className="min-w-0 flex-1">
          {/* 1ª linha: nome e botões; 2ª linha (largura toda ao lado da imagem): horário, itens, fundo */}
          <div className="flex items-center gap-1">
            <input
              className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 text-[15px] font-semibold outline-none hover:border-borda focus:border-destaque focus:bg-entrada"
              value={s.nome}
              onChange={(e) => p.aoMudar({ nome: e.target.value })}
              title="Nome da seção"
            />
            <div className="flex shrink-0 items-center gap-0.5">
              <Botao tamanho="sm" icone={Play} onClick={p.aoAbertura} title={s.fundo ? 'Abertura: mostra a imagem da seção em tela cheia' : 'Abertura: mostra o nome da seção'}>
                {/* seção estreita (painel aberto): só o ícone, para o nome caber */}
                <span className="hidden @xl:inline">Abertura</span>
              </Botao>
              <Botao tamanho="sm" variante="fantasma" icone={ArrowUp} disabled={p.primeira} onClick={() => p.aoMover(-1)} title="Subir a seção" />
              <Botao tamanho="sm" variante="fantasma" icone={ArrowDown} disabled={p.ultima} onClick={() => p.aoMover(1)} title="Descer a seção" />
              <Botao tamanho="sm" variante="fantasma" icone={X} onClick={p.aoRemover} title="Remover a seção" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 whitespace-nowrap px-1 text-xs text-suave">
            {inicio !== undefined && <span className="tabular-nums">{formatarHora(inicio)}</span>}
            <span>
              {s.itens.length} {s.itens.length === 1 ? 'item' : 'itens'}
              {minutos > 0 ? ` · ${minutos} min` : ''}
            </span>
            {s.fundo && (
              <label className="flex shrink-0 items-center gap-1.5" title="Desligado, as músicas usam a imagem delas (ou o fundo padrão)">
                <Interruptor ligado={s.fundoNasMusicas} aoMudar={(v) => p.aoMudar({ fundoNasMusicas: v })} rotulo="Fundo também nas músicas" />
                fundo também nas músicas
              </label>
            )}
            {s.fundo && (
              <button type="button" className="cursor-pointer text-apagado hover:text-texto" onClick={() => p.aoMudar({ fundo: null })} title="Tirar a imagem (volta o fundo padrão)">
                tirar imagem
              </button>
            )}
          </div>
        </div>
      </header>

      <ol className="py-1">
        {s.itens.map((item, i) => (
          <LinhaItem
            key={item.id}
            item={item}
            config={p.config}
            hora={p.horarios.itens.get(item.id)}
            noAr={p.itemNoAr === item.id}
            editado={p.editado === item.id}
            linhaAntes={soltarEm === i}
            liturgiaId={p.liturgiaId}
            miniatura={p.miniaturas.get(item.id) ?? null}
            aoSobre={(antes) => setSoltarEm(antes ? i : i + 1)}
            aoEditar={() => p.aoEditar(item.id)}
            aoExecutar={() => p.aoExecutar(item.id)}
          />
        ))}
        {soltarEm === s.itens.length && <li className="mx-3 h-0.5 rounded bg-destaque" />}
      </ol>
      <div className="border-t border-borda/60 px-2 py-1">
        <Botao tamanho="sm" variante="fantasma" icone={Plus} onClick={p.aoAdicionar}>
          Adicionar
        </Botao>
        {s.itens.length === 0 && <span className="ml-2 text-xs text-apagado">ou arraste arquivos para cá</span>}
      </div>
    </section>
  )
}

function LinhaItem(p: {
  item: ItemLiturgia
  config: Config
  hora: number | undefined
  noAr: boolean
  editado: boolean
  linhaAntes: boolean
  liturgiaId: number
  miniatura: string | null
  aoSobre: (antes: boolean) => void
  aoEditar: () => void
  aoExecutar: () => void
}) {
  const it = p.item
  const Icone = iconeDoItem(it)
  return (
    <>
      {p.linhaAntes && <li className="mx-3 h-0.5 rounded bg-destaque" />}
      <li
        data-item-liturgia={it.id}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(TIPO_REORDENAR, it.id)
          // também serve para soltar na miniatura de uma saída
          e.dataTransfer.setData(TIPO_ARRASTE, JSON.stringify({ tipo: 'liturgia', liturgiaId: p.liturgiaId, itemId: it.id, titulo: tituloDoItem(it) }))
          e.dataTransfer.effectAllowed = 'copyMove'
        }}
        onDragOver={(e) => {
          if (![...e.dataTransfer.types].includes(TIPO_REORDENAR)) return
          e.preventDefault()
          e.stopPropagation()
          const r = e.currentTarget.getBoundingClientRect()
          p.aoSobre(e.clientY < r.top + r.height / 2)
        }}
        onClick={p.aoEditar}
        onDoubleClick={p.aoExecutar}
        className={`group mx-1 flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 transition-colors ${
          p.noAr ? 'bg-destaque text-sobre-destaque' : p.editado ? 'bg-destaque/12' : 'hover:bg-hover'
        } ${it.ativo ? '' : 'opacity-45'}`}
        title="Clique: editar · Duplo clique: pôr no ar · Arraste para mudar a ordem"
      >
        <GripVertical className={`size-4 shrink-0 cursor-grab ${p.noAr ? 'text-sobre-destaque/60' : 'text-apagado'}`} />
        <span className={`w-10 shrink-0 text-right text-[11px] tabular-nums ${p.noAr ? 'text-sobre-destaque/80' : 'text-apagado'}`}>
          {p.hora !== undefined ? formatarHora(p.hora) : ''}
        </span>
        <MiniaturaItem item={it} imagem={p.miniatura} icone={Icone} noAr={p.noAr} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{tituloDoItem(it)}</span>
          <span className={`block truncate text-[11px] ${p.noAr ? 'text-sobre-destaque/80' : 'text-suave'}`}>{detalheDoItem(it, p.config)}</span>
        </span>
        {it.observacao && <StickyNote className="size-3.5 shrink-0 opacity-60" aria-label="Tem observação" />}
        {it.avancar && <FastForward className="size-3.5 shrink-0 opacity-60" aria-label="Passa sozinho no fim" />}
        {it.duracaoMin ? <span className="shrink-0 text-[11px] tabular-nums opacity-70">{it.duracaoMin} min</span> : null}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            e.currentTarget.blur()
            p.aoExecutar()
          }}
          className={`flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors ${
            p.noAr ? 'bg-sobre-destaque/20 hover:bg-sobre-destaque/30' : 'bg-painel-2 text-destaque-texto hover:bg-destaque hover:text-sobre-destaque'
          }`}
          title="Pôr no ar"
        >
          <Play className="size-4" />
        </button>
      </li>
    </>
  )
}

/** 45 → "45 min"; 334 → "5 h 34" */
function duracaoLegivel(min: number): string {
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`
}

/** Barra de baixo (modo culto): o que está no ar, o próximo, o relógio e o atraso. */
function BarraCulto({
  doc,
  estado,
  horarios,
  aoVizinho,
}: {
  doc: Liturgia | null
  estado: EstadoMotor
  horarios: ReturnType<typeof horariosPrevistos> | null
  aoVizinho: (p: 1 | -1) => void
}) {
  const agora = useAgora()
  const l = estado.liturgia
  const desta = !!doc && l?.liturgiaId === doc.id
  const pos = desta && l?.itemId ? acharItem(doc!.secoes, l.itemId) : null
  const proximo = doc ? vizinhoDoNoAr(doc.secoes, desta ? l : null, 1) : null

  // atraso: só no dia do culto, comparando com o horário previsto do item no ar
  let atraso: number | null = null
  if (doc && desta && doc.data === dataDeHoje(agora) && minutosDe(doc.inicio) !== null) {
    const previsto = l?.itemId ? horarios?.itens.get(l.itemId) : horarios?.secoes.get(l!.secaoId)
    if (previsto !== undefined) atraso = Math.round(agora.getHours() * 60 + agora.getMinutes() + agora.getSeconds() / 60 - previsto)
  }

  return (
    <div className="flex h-24 shrink-0 items-center gap-4 border-t border-borda bg-painel px-5">
      <div className="min-w-0 flex-1">
        {l ? (
          <>
            <div className="truncate text-xs text-suave">
              No ar{desta ? '' : ` (${l.nome})`}: <b className="text-texto">{l.secaoNome}</b>
            </div>
            <div className="truncate text-[15px] font-semibold">{pos ? tituloDoItem(pos.item) : 'Abertura da seção'}</div>
            {pos?.item.observacao && <div className="truncate text-xs font-medium text-aviso-texto" title={pos.item.observacao}>{pos.item.observacao}</div>}
          </>
        ) : (
          <div className="text-sm text-suave">Nenhum item da liturgia no ar. Comece pelo ▶ de um item ou por “Próximo item”.</div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Botao icone={ChevronLeft} onClick={() => aoVizinho(-1)} title="Item anterior (P)">
          Anterior
        </Botao>
        <Botao variante="primario" tamanho="lg" icone={ChevronRight} onClick={() => aoVizinho(1)} title="Próximo item (N)" disabled={!doc}>
          Próximo item
        </Botao>
      </div>
      <div className="w-56 min-w-0 shrink-0">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-suave">Depois</div>
        <div className="truncate text-sm font-medium">{proximo ? tituloDoItem(proximo.item) : <span className="text-apagado">Fim da liturgia</span>}</div>
        {proximo && <div className="truncate text-xs text-suave">{proximo.secao.nome}</div>}
      </div>
      <div className="flex w-28 shrink-0 flex-col items-end">
        <span className="text-xl font-semibold tabular-nums">{agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
        {atraso !== null && (
          <span className={`text-xs font-semibold ${atraso > 2 ? 'text-aviso-texto' : atraso < -2 ? 'text-destaque-texto' : 'text-ok-texto'}`}>
            {atraso > 2 ? `${duracaoLegivel(atraso)} atrasado` : atraso < -2 ? `${duracaoLegivel(-atraso)} adiantado` : 'no horário'}
          </span>
        )}
        {l && (
          <button
            type="button"
            className="mt-1 flex cursor-pointer items-center gap-1 text-[11px] text-apagado hover:text-texto"
            onClick={() => void api.fecharLiturgia()}
            title="Encerrar a liturgia: os fundos voltam ao padrão (o que está no ar continua)"
          >
            <Square className="size-3" /> encerrar
          </button>
        )}
      </div>
    </div>
  )
}
