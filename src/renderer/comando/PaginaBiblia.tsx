/**
 * Página "Bíblia": digite "jo 3 16", "sl 23", "1 co 13 4-7" ou palavras. Enter mostra; o passador
 * (PageDown/PageUp) anda versículo a versículo, dividindo os longos em mais de uma tela.
 */
import { BookOpen, ChevronLeft, ChevronRight, Download, FileJson, Link, Search, Settings2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { LIVROS, type Livro } from '../../shared/biblia/livros'
import { formatarReferencia, interpretarReferencia } from '../../shared/biblia/referencia'
import type { Config } from '../../shared/config'
import type { ArquivoBibliaEncontrado, Progresso, ResultadoBuscaBiblia, VersaoBiblia, VersiculoTexto } from '../../shared/dados'
import { dividirTexto } from '../../shared/texto'
import { api } from '../compartilhado/ganchos'
import type { TeclaPagina } from './App'
import { mensagemDeErro } from './acoes'
import { BarraProgresso, Botao, classeEntrada } from './ui'

const digitando = (e: KeyboardEvent) => !!(e.target as HTMLElement | null)?.closest?.('input, textarea, select')

interface Capitulo {
  livro: number
  capitulo: number
  versiculos: VersiculoTexto[]
  total: number
}

interface NoAr {
  livro: number
  capitulo: number
  versiculo: number
  parte: number
  partes: number
}

export function PaginaBiblia({ alvo, config, registrarTeclas }: { alvo: string; config: Config; registrarTeclas: (f: TeclaPagina | null) => void }) {
  const [versoes, setVersoes] = useState<VersaoBiblia[] | null>(null)
  const [sigla, setSigla] = useState('')
  const [texto, setTexto] = useState('')
  const [cap, setCap] = useState<Capitulo | null>(null)
  const [faixa, setFaixa] = useState<{ inicio: number; fim: number } | null>(null)
  const [noAr, setNoAr] = useState<NoAr | null>(null)
  const [livros, setLivros] = useState<Livro[] | null>(null)
  const [capitulos, setCapitulos] = useState<{ livro: number; total: number } | null>(null)
  const [resultados, setResultados] = useState<ResultadoBuscaBiblia[] | null>(null)
  const [historico, setHistorico] = useState<NoAr[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [painelVersoes, setPainelVersoes] = useState(false)
  const segundas = useRef(new Map<string, VersiculoTexto[]>())
  const lista = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const ler = () => api.versoesBiblia().then(setVersoes)
    void ler()
    return api.aoMudarBiblia(() => {
      segundas.current.clear()
      void ler()
    })
  }, [])
  useEffect(() => {
    if (!versoes?.length) return
    if (!sigla || !versoes.some((v) => v.sigla === sigla)) {
      const padrao = versoes.find((v) => v.sigla === config.biblia.versaoPadrao)
      setSigla((padrao ?? versoes[0]!).sigla)
    }
  }, [versoes, sigla, config.biblia.versaoPadrao])

  const limpar = () => {
    setLivros(null)
    setCapitulos(null)
    setResultados(null)
  }

  const abrirCapitulo = useCallback(
    async (livro: number, capitulo: number, inicio?: number | null, fim?: number | null): Promise<Capitulo | null> => {
      if (!sigla) return null
      const [versiculos, total] = await Promise.all([api.capitulo(sigla, livro, capitulo), api.totalCapitulos(sigla, livro)])
      if (!versiculos.length) {
        setErro(`${formatarReferencia(livro, capitulo)} não existe nesta versão.`)
        return null
      }
      const c = { livro, capitulo, versiculos, total }
      limpar()
      setErro(null)
      setCap(c)
      setFaixa(inicio ? { inicio, fim: fim ?? inicio } : null)
      return c
    },
    [sigla],
  )

  const mostrar = useCallback(
    async (c: Capitulo, versiculo: number, parte = 0) => {
      const v = c.versiculos.find((x) => x.versiculo === versiculo)
      if (!v) return
      const partes = dividirTexto(v.texto, config.biblia.maxCaracteres)
      const p = Math.min(Math.max(parte, 0), partes.length - 1)
      let t = partes[p] ?? ''
      if (config.biblia.mostrarNumero && p === 0) t = `${versiculo} ${t}`
      const sufixoParte = partes.length > 1 ? ` (${p + 1}/${partes.length})` : ''
      const sufixoSigla = config.biblia.siglaNaReferencia ? ` (${sigla})` : ''
      const referencia = `${formatarReferencia(c.livro, c.capitulo, versiculo)}${sufixoParte}${sufixoSigla}`

      let segundo: { texto: string; referencia: string } | null = null
      const s2 = config.biblia.segundaVersao
      if (s2 && s2 !== sigla && versoes?.some((x) => x.sigla === s2)) {
        const chave = `${s2}:${c.livro}:${c.capitulo}`
        let vs = segundas.current.get(chave)
        if (!vs) {
          vs = await api.capitulo(s2, c.livro, c.capitulo)
          segundas.current.set(chave, vs)
        }
        const v2 = vs.find((x) => x.versiculo === versiculo)
        if (v2) segundo = { texto: v2.texto, referencia: `(${s2})` }
      }
      await api.comando({ tipo: 'mostrar', alvo, conteudo: { tipo: 'versiculo', texto: t, referencia, segundo } })
      const n: NoAr = { livro: c.livro, capitulo: c.capitulo, versiculo, parte: p, partes: partes.length }
      setNoAr(n)
      setHistorico((h) => [n, ...h.filter((x) => !(x.livro === n.livro && x.capitulo === n.capitulo && x.versiculo === n.versiculo))].slice(0, 12))
      lista.current?.querySelector(`[data-versiculo="${versiculo}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    },
    [alvo, config.biblia, sigla, versoes],
  )

  const interpretar = useCallback(
    async (entrada: string, mostrarAgora: boolean) => {
      const r = interpretarReferencia(entrada)
      if (r.tipo === 'vazio') {
        limpar()
        return
      }
      if (r.tipo === 'ambiguo') {
        limpar()
        setLivros(r.livros)
        return
      }
      if (r.tipo === 'texto') {
        if (entrada.trim().length < 3 || !sigla) return
        limpar()
        setResultados(await api.buscarBiblia(sigla, entrada))
        return
      }
      const { livro, capitulo, inicio, fim } = r.ref
      if (capitulo === null) {
        limpar()
        setCapitulos({ livro, total: await api.totalCapitulos(sigla, livro) })
        return
      }
      const c = await abrirCapitulo(livro, capitulo, inicio, fim)
      if (c && mostrarAgora) await mostrar(c, inicio ?? 1)
    },
    [abrirCapitulo, mostrar, sigla],
  )

  // enquanto digita, só prepara (não mostra); Enter mostra
  useEffect(() => {
    const t = setTimeout(() => void interpretar(texto, false).catch((e) => setErro(mensagemDeErro(e))), 220)
    return () => clearTimeout(t)
  }, [texto, interpretar])

  const andar = useCallback(
    async (passo: 1 | -1) => {
      if (!noAr || !cap || cap.livro !== noAr.livro || cap.capitulo !== noAr.capitulo) {
        if (cap && faixa) await mostrar(cap, faixa.inicio)
        return
      }
      const parte = noAr.parte + passo
      if (parte >= 0 && parte < noAr.partes) return mostrar(cap, noAr.versiculo, parte)
      const v = noAr.versiculo + passo
      if (cap.versiculos.some((x) => x.versiculo === v)) return mostrar(cap, v, passo === 1 ? 0 : 99)
      const outro = cap.capitulo + passo
      if (outro < 1 || outro > cap.total) return
      const c = await abrirCapitulo(cap.livro, outro)
      if (c) await mostrar(c, passo === 1 ? 1 : c.versiculos[c.versiculos.length - 1]!.versiculo, passo === 1 ? 0 : 99)
    },
    [noAr, cap, faixa, mostrar, abrirCapitulo],
  )

  const andarRef = useRef(andar)
  andarRef.current = andar
  useEffect(() => {
    registrarTeclas((e) => {
      const proximo = e.key === 'PageDown' || e.key === 'ArrowRight' || e.key === 'ArrowDown'
      const anterior = e.key === 'PageUp' || e.key === 'ArrowLeft' || e.key === 'ArrowUp'
      if (!proximo && !anterior) return false
      if (e.key.startsWith('Arrow') && digitando(e)) return false
      void andarRef.current(proximo ? 1 : -1)
      return true
    })
    return () => registrarTeclas(null)
  }, [registrarTeclas])

  if (versoes === null) return null
  if (versoes.length === 0 || painelVersoes) {
    return <ImportarBiblias temVersoes={versoes.length > 0} aoFechar={() => setPainelVersoes(false)} />
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-borda px-5 py-3">
        <select
          className={`${classeEntrada} w-28 font-semibold`}
          value={sigla}
          onChange={(e) => {
            e.currentTarget.blur()
            setSigla(e.target.value)
            setCap(null)
            setNoAr(null)
          }}
          title="Versão"
        >
          {versoes.map((v) => (
            <option key={v.sigla} value={v.sigla}>
              {v.sigla}
            </option>
          ))}
        </select>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-apagado" />
          <input
            autoFocus
            className={`${classeEntrada} w-full pl-8 text-[15px]`}
            placeholder="jo 3 16 · sl 23 · 1 co 13 4-7 · ou palavras (Enter mostra)"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void interpretar(texto, true).catch((err) => setErro(mensagemDeErro(err)))
            }}
          />
        </div>
        <Botao variante="fantasma" icone={Settings2} onClick={() => setPainelVersoes(true)} title="Importar versões" />
      </div>
      {erro && <div className="border-b border-borda bg-perigo/10 px-5 py-2 text-sm text-perigo-texto">{erro}</div>}

      <div ref={lista} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {livros && (
          <div>
            <p className="mb-2 text-sm text-suave">Qual livro?</p>
            <div className="flex flex-wrap gap-2">
              {livros.map((l) => (
                <Botao key={l.n} onClick={() => setTexto(`${l.nome} `)}>
                  {l.nome}
                </Botao>
              ))}
            </div>
          </div>
        )}
        {capitulos && (
          <div>
            <p className="mb-2 text-sm text-suave">{LIVROS[capitulos.livro - 1]?.nome}: escolha o capítulo</p>
            <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))' }}>
              {Array.from({ length: capitulos.total }, (_, i) => (
                <Botao key={i} tamanho="sm" onClick={() => void abrirCapitulo(capitulos.livro, i + 1)}>
                  {i + 1}
                </Botao>
              ))}
            </div>
          </div>
        )}
        {resultados && (
          <div className="flex flex-col gap-1">
            <p className="mb-1 text-sm text-suave">{resultados.length ? `${resultados.length} versículo(s) com essas palavras:` : 'Nenhum versículo com essas palavras.'}</p>
            {resultados.map((r) => (
              <button
                key={`${r.livro}-${r.capitulo}-${r.versiculo}`}
                type="button"
                className="cursor-pointer rounded-md px-3 py-2 text-left hover:bg-hover"
                onClick={async () => {
                  const c = await abrirCapitulo(r.livro, r.capitulo, r.versiculo)
                  if (c) await mostrar(c, r.versiculo)
                }}
              >
                <span className="mr-2 text-sm font-semibold text-destaque-texto">{formatarReferencia(r.livro, r.capitulo, r.versiculo)}</span>
                <span className="text-sm">{realce(r.trecho)}</span>
              </button>
            ))}
          </div>
        )}
        {cap && !livros && !capitulos && !resultados && (
          <div>
            <div className="mb-3 flex items-center gap-2">
              <Botao tamanho="sm" variante="fantasma" icone={ChevronLeft} disabled={cap.capitulo <= 1} onClick={() => void abrirCapitulo(cap.livro, cap.capitulo - 1)} title="Capítulo anterior" />
              <h2 className="text-lg font-semibold">{formatarReferencia(cap.livro, cap.capitulo)}</h2>
              <Botao tamanho="sm" variante="fantasma" icone={ChevronRight} disabled={cap.capitulo >= cap.total} onClick={() => void abrirCapitulo(cap.livro, cap.capitulo + 1)} title="Próximo capítulo" />
              <span className="text-xs text-suave">{sigla} · clique num versículo para mostrar</span>
            </div>
            <div className="flex flex-col">
              {cap.versiculos.map((v) => {
                const ehNoAr = noAr?.livro === cap.livro && noAr.capitulo === cap.capitulo && noAr.versiculo === v.versiculo
                const naFaixa = faixa && v.versiculo >= faixa.inicio && v.versiculo <= faixa.fim
                return (
                  <button
                    key={v.versiculo}
                    type="button"
                    data-versiculo={v.versiculo}
                    onClick={(e) => {
                      e.currentTarget.blur()
                      void mostrar(cap, v.versiculo)
                    }}
                    className={`flex cursor-pointer gap-3 rounded-md px-3 py-1.5 text-left text-[15px] leading-relaxed transition-colors ${
                      ehNoAr ? 'bg-destaque text-sobre-destaque' : naFaixa ? 'bg-destaque/10' : 'hover:bg-hover'
                    }`}
                  >
                    <span className={`w-6 shrink-0 text-right text-xs font-semibold leading-7 ${ehNoAr ? 'text-sobre-destaque/80' : 'text-apagado'}`}>{v.versiculo}</span>
                    <span>{v.texto}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
        {!cap && !livros && !capitulos && !resultados && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-suave">
            <BookOpen className="size-10 text-apagado" />
            <p className="text-sm">Digite uma referência ou palavras.</p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-borda bg-painel px-5 py-2.5">
        <Botao icone={ChevronLeft} onClick={() => void andar(-1)} title="Anterior (PageUp)">
          Anterior
        </Botao>
        <Botao variante="primario" icone={ChevronRight} onClick={() => void andar(1)} title="Próximo (PageDown)">
          Próximo
        </Botao>
        <span className="ml-2 truncate text-sm text-suave">
          {noAr ? (
            <>
              No ar: <b className="text-texto">{formatarReferencia(noAr.livro, noAr.capitulo, noAr.versiculo)}</b>
              {noAr.partes > 1 ? ` (${noAr.parte + 1}/${noAr.partes})` : ''}
            </>
          ) : (
            'Nada desta página no ar.'
          )}
        </span>
        <div className="ml-auto flex max-w-[50%] gap-1 overflow-hidden">
          {historico.slice(1, 7).map((h) => (
            <button
              key={`${h.livro}-${h.capitulo}-${h.versiculo}`}
              type="button"
              className="shrink-0 cursor-pointer rounded-full bg-painel-2 px-2 py-0.5 text-[11px] text-suave hover:text-texto"
              onClick={async () => {
                const c = await abrirCapitulo(h.livro, h.capitulo, h.versiculo)
                if (c) await mostrar(c, h.versiculo)
              }}
            >
              {LIVROS[h.livro - 1]?.abrev} {h.capitulo}:{h.versiculo}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/** "…tal [maneira] que…" → destaca o que está entre colchetes. */
function realce(trecho: string) {
  return trecho.split(/(\[[^\]]*\])/).map((p, i) =>
    p.startsWith('[') ? (
      <mark key={i} className="rounded bg-aviso/25 px-0.5 text-texto">
        {p.slice(1, -1)}
      </mark>
    ) : (
      p
    ),
  )
}

/** Importar versões: as encontradas no computador, de um arquivo .json ou de um endereço. */
function ImportarBiblias({ temVersoes, aoFechar }: { temVersoes: boolean; aoFechar: () => void }) {
  const [encontrados, setEncontrados] = useState<ArquivoBibliaEncontrado[]>([])
  const [progresso, setProgresso] = useState<Progresso | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [arquivo, setArquivo] = useState<{ caminho: string; sigla: string } | null>(null)
  const [url, setUrl] = useState('')
  const [siglaUrl, setSiglaUrl] = useState('')
  const ocupado = !!progresso

  const ler = () => api.arquivosBiblia().then(setEncontrados)
  useEffect(() => {
    void ler()
  }, [])
  useEffect(() => api.aoProgresso((p) => p.tarefa === 'biblia' && setProgresso(p.fim ? null : p)), [])

  const rodar = async (f: () => Promise<number>, sigla: string) => {
    setMsg(null)
    try {
      const n = await f()
      setMsg(`${sigla}: ${n.toLocaleString('pt-BR')} versículos importados.`)
      void ler()
    } catch (e) {
      setMsg(mensagemDeErro(e))
    } finally {
      setProgresso(null)
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-4 overflow-y-auto p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Versões da Bíblia</h2>
          <p className="text-sm text-suave">Arquivos .json no formato do repositório damarals/biblias (o mesmo do projeto de transcrição).</p>
        </div>
        {temVersoes && (
          <Botao variante="fantasma" onClick={aoFechar}>
            Voltar
          </Botao>
        )}
      </div>
      {progresso && <BarraProgresso fracao={progresso.feito / Math.max(1, progresso.total)} texto={`${progresso.texto ?? ''} ${progresso.feito}/${progresso.total} livros`} />}
      {msg && <div className="rounded-md bg-painel-2 px-3 py-2 text-sm">{msg}</div>}

      <section className="rounded-xl border border-borda bg-painel p-4">
        <h3 className="mb-2 text-sm font-semibold">Encontradas neste computador</h3>
        {encontrados.length === 0 ? (
          <p className="text-sm text-suave">Nenhum arquivo encontrado em C:\Sonoplastia\biblias nem no projeto de transcrição.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {encontrados.map((a) => (
              <div key={a.caminho} className="flex items-center gap-3">
                <span className="w-14 font-semibold">{a.sigla}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-suave" title={a.caminho}>
                  {a.nome}
                </span>
                <Botao tamanho="sm" icone={Download} disabled={ocupado} onClick={() => void rodar(() => api.importarBiblia(a.caminho, a.sigla, a.nome), a.sigla)}>
                  {a.jaImportada ? 'Importar de novo' : 'Importar'}
                </Botao>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-borda bg-painel p-4">
        <h3 className="mb-2 text-sm font-semibold">De um arquivo</h3>
        <div className="flex items-center gap-2">
          <Botao
            icone={FileJson}
            disabled={ocupado}
            onClick={async () => {
              const c = await api.escolherArquivoBiblia()
              if (c) setArquivo({ caminho: c, sigla: (c.split(/[\\/]/).pop() ?? '').replace(/\.json$/i, '').toUpperCase().slice(0, 8) })
            }}
          >
            Escolher .json…
          </Botao>
          {arquivo && (
            <>
              <span className="min-w-0 flex-1 truncate text-sm text-suave" title={arquivo.caminho}>
                {arquivo.caminho}
              </span>
              <input className={`${classeEntrada} w-24`} value={arquivo.sigla} onChange={(e) => setArquivo({ ...arquivo, sigla: e.target.value.toUpperCase() })} placeholder="Sigla" />
              <Botao variante="primario" disabled={ocupado || !arquivo.sigla} onClick={() => void rodar(() => api.importarBiblia(arquivo.caminho, arquivo.sigla, ''), arquivo.sigla)}>
                Importar
              </Botao>
            </>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-borda bg-painel p-4">
        <h3 className="mb-2 text-sm font-semibold">Baixar de um endereço</h3>
        <div className="flex items-center gap-2">
          <Link className="size-4 shrink-0 text-apagado" />
          <input className={`${classeEntrada} flex-1`} placeholder="https://…/NVI.json" value={url} onChange={(e) => setUrl(e.target.value)} />
          <input className={`${classeEntrada} w-24`} placeholder="Sigla" value={siglaUrl} onChange={(e) => setSiglaUrl(e.target.value.toUpperCase())} />
          <Botao variante="primario" icone={Download} disabled={ocupado || !url || !siglaUrl} onClick={() => void rodar(() => api.importarBibliaUrl(url, siglaUrl, ''), siglaUrl)}>
            Baixar
          </Botao>
        </div>
        <p className="mt-2 text-xs text-suave">
          Versões como NVI e ARA têm direitos autorais (Biblica, SBB). A projeção no culto costuma ser permitida com a sigla visível.
        </p>
      </section>
    </div>
  )
}
