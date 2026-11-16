/**
 * Bíblia no celular: digite "jo 3 16", "sl 23" ou palavras; toque num versículo para mostrar. Em cima,
 * as sugestões ao vivo (o programa ouve o pregador e sugere; tocar numa sugestão mostra).
 */
import { Search, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { LIVROS, type Livro } from '../../shared/biblia/livros'
import { conteudoDoVersiculo } from '../../shared/biblia/mostrar'
import { formatarReferencia, interpretarReferencia } from '../../shared/biblia/referencia'
import type { ResultadoBuscaBiblia, VersaoBiblia, VersiculoTexto } from '../../shared/dados'
import type { ConfigPublica } from '../../shared/remoto'
import type { EstadoTranscricao, LigacaoSugestao, SugestaoBiblia } from '../../shared/transcricao/tipos'
import { Botao, Interruptor } from '../comando/ui'
import { api } from './cliente'

export interface PassadorBiblia {
  rotulo: string
  andar: (passo: 1 | -1) => Promise<void>
}

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

export function AbaBiblia({
  config,
  alvo,
  tentar,
  aoMudarPassador,
  transcricao,
  parcial,
}: {
  config: ConfigPublica
  alvo: string
  tentar: (p: Promise<unknown>) => void
  aoMudarPassador: (p: PassadorBiblia | null) => void
  transcricao: EstadoTranscricao | null
  parcial: string
}) {
  const [versoes, setVersoes] = useState<VersaoBiblia[] | null>(null)
  const [sigla, setSigla] = useState('')
  const [texto, setTexto] = useState('')
  const [cap, setCap] = useState<Capitulo | null>(null)
  const [noAr, setNoAr] = useState<NoAr | null>(null)
  const [livros, setLivros] = useState<Livro[] | null>(null)
  const [capitulos, setCapitulos] = useState<{ livro: number; total: number } | null>(null)
  const [resultados, setResultados] = useState<ResultadoBuscaBiblia[] | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const segundas = useRef(new Map<string, VersiculoTexto[]>())
  const lista = useRef<HTMLDivElement>(null)
  const cfg = config.biblia

  useEffect(() => {
    api
      .versoesBiblia()
      .then(setVersoes)
      .catch(() => setVersoes([]))
  }, [])
  useEffect(() => {
    if (!versoes?.length) return
    if (!sigla || !versoes.some((v) => v.sigla === sigla)) setSigla((versoes.find((v) => v.sigla === cfg.versaoPadrao) ?? versoes[0]!).sigla)
  }, [versoes, sigla, cfg.versaoPadrao])

  const limpar = () => {
    setLivros(null)
    setCapitulos(null)
    setResultados(null)
    setAviso(null)
  }

  const abrirCapitulo = useCallback(
    async (livro: number, capitulo: number): Promise<Capitulo | null> => {
      if (!sigla) return null
      const [versiculos, total] = await Promise.all([api.capitulo(sigla, livro, capitulo), api.totalCapitulos(sigla, livro)])
      limpar()
      if (!versiculos.length) {
        setAviso(`${formatarReferencia(livro, capitulo)} não existe nesta versão.`)
        return null
      }
      const c = { livro, capitulo, versiculos, total }
      setCap(c)
      return c
    },
    [sigla],
  )

  const mostrar = useCallback(
    async (c: Capitulo, versiculo: number, parte = 0) => {
      const v = c.versiculos.find((x) => x.versiculo === versiculo)
      if (!v) return
      let segundo: { sigla: string; texto: string } | null = null
      const s2 = cfg.segundaVersao
      if (s2 && s2 !== sigla && versoes?.some((x) => x.sigla === s2)) {
        const chave = `${s2}:${c.livro}:${c.capitulo}`
        let vs = segundas.current.get(chave)
        if (!vs) {
          vs = await api.capitulo(s2, c.livro, c.capitulo)
          segundas.current.set(chave, vs)
        }
        const v2 = vs.find((x) => x.versiculo === versiculo)
        if (v2) segundo = { sigla: s2, texto: v2.texto }
      }
      const r = conteudoDoVersiculo({ livro: c.livro, capitulo: c.capitulo, versiculo, texto: v.texto, parte, sigla, cfg, segundo })
      await api.comando({ tipo: 'mostrar', alvo, conteudo: r.conteudo })
      setNoAr({ livro: c.livro, capitulo: c.capitulo, versiculo, parte: r.parte, partes: r.partes })
    },
    [alvo, cfg, sigla, versoes],
  )

  const andar = useCallback(
    async (passo: 1 | -1) => {
      if (!cap) return
      if (!noAr || cap.livro !== noAr.livro || cap.capitulo !== noAr.capitulo) return mostrar(cap, cap.versiculos[0]!.versiculo)
      const parte = noAr.parte + passo
      if (parte >= 0 && parte < noAr.partes) return mostrar(cap, noAr.versiculo, parte)
      const v = noAr.versiculo + passo
      if (cap.versiculos.some((x) => x.versiculo === v)) return mostrar(cap, v, passo === 1 ? 0 : 99)
      const outro = cap.capitulo + passo
      if (outro < 1 || outro > cap.total) return
      const c = await abrirCapitulo(cap.livro, outro)
      if (c) await mostrar(c, passo === 1 ? c.versiculos[0]!.versiculo : c.versiculos[c.versiculos.length - 1]!.versiculo, passo === 1 ? 0 : 99)
    },
    [cap, noAr, mostrar, abrirCapitulo],
  )

  // a barra do passador anda os versículos enquanto esta aba estiver aberta com um versículo no ar
  const andarRef = useRef(andar)
  andarRef.current = andar
  const rotulo = noAr ? `Versículo · ${formatarReferencia(noAr.livro, noAr.capitulo, noAr.versiculo)}${noAr.partes > 1 ? ` (${noAr.parte + 1}/${noAr.partes})` : ''}` : null
  useEffect(() => {
    aoMudarPassador(rotulo ? { rotulo, andar: (p) => andarRef.current(p) } : null)
  }, [rotulo, aoMudarPassador])

  useEffect(() => {
    if (noAr) lista.current?.querySelector(`[data-versiculo="${noAr.versiculo}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [noAr])

  const ir = async () => {
    const r = interpretarReferencia(texto)
    if (r.tipo === 'vazio') return limpar()
    if (r.tipo === 'ambiguo') {
      limpar()
      setLivros(r.livros)
      return
    }
    if (r.tipo === 'texto') {
      if (texto.trim().length < 3 || !sigla) return
      limpar()
      setResultados(await api.buscarBiblia(sigla, texto))
      return
    }
    const { livro, capitulo, inicio } = r.ref
    if (capitulo === null) {
      limpar()
      setCapitulos({ livro, total: await api.totalCapitulos(sigla, livro) })
      return
    }
    const c = await abrirCapitulo(livro, capitulo)
    if (c) await mostrar(c, inicio ?? c.versiculos[0]!.versiculo)
  }

  /** Sugestão tocada: abre o capítulo e mostra o primeiro versículo (o passador segue pelos outros). */
  const usarSugestao = async (s: SugestaoBiblia) => {
    setTexto('')
    const c = await abrirCapitulo(s.livro, s.capitulo)
    if (c && s.inicio) await mostrar(c, s.inicio)
  }

  if (versoes === null) return <p className="py-3 text-center text-sm text-suave">Carregando…</p>
  if (!versoes.length) return <p className="rounded-xl border border-borda bg-painel p-4 text-sm text-suave">Nenhuma Bíblia importada (importe no computador, em Bíblia).</p>

  return (
    <>
    <SugestoesRemoto estado={transcricao} parcial={parcial} noAr={noAr} tentar={tentar} aoUsar={(s) => tentar(usarSugestao(s))} />
    <section className="flex flex-col gap-2 rounded-xl border border-borda bg-painel p-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          ;(document.activeElement as HTMLElement | null)?.blur()
          tentar(ir())
        }}
      >
        <select
          className="h-10 w-20 rounded-lg border border-borda bg-entrada px-1 text-sm font-semibold text-texto"
          value={sigla}
          onChange={(e) => {
            setSigla(e.target.value)
            setCap(null)
            setNoAr(null)
          }}
          aria-label="Versão"
        >
          {versoes.map((v) => (
            <option key={v.sigla} value={v.sigla}>
              {v.sigla}
            </option>
          ))}
        </select>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-3 size-4 text-apagado" />
          <input
            type="search"
            enterKeyHint="go"
            className="h-10 w-full rounded-lg border border-borda bg-entrada pl-9 pr-2 text-[15px] text-texto outline-none placeholder:text-apagado focus:border-destaque"
            placeholder="jo 3 16 · sl 23 · palavras"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
        </div>
        <Botao type="submit" variante="primario" tamanho="md" className="h-10">
          Mostrar
        </Botao>
      </form>
      {aviso && <p className="text-sm text-perigo-texto">{aviso}</p>}

      {livros && (
        <div>
          <p className="mb-2 text-sm text-suave">Qual livro?</p>
          <div className="flex flex-wrap gap-2">
            {livros.map((l) => (
              <Botao key={l.n} tamanho="lg" onClick={() => setTexto(`${l.nome} `)}>
                {l.nome}
              </Botao>
            ))}
          </div>
        </div>
      )}
      {capitulos && (
        <div>
          <p className="mb-2 text-sm text-suave">{LIVROS[capitulos.livro - 1]?.nome}: escolha o capítulo</p>
          <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(48px, 1fr))' }}>
            {Array.from({ length: capitulos.total }, (_, i) => (
              <Botao key={i} tamanho="lg" onClick={() => tentar(abrirCapitulo(capitulos.livro, i + 1))}>
                {i + 1}
              </Botao>
            ))}
          </div>
        </div>
      )}
      {resultados && (
        <div className="flex flex-col gap-1">
          <p className="text-sm text-suave">{resultados.length ? `${resultados.length} versículo(s):` : 'Nenhum versículo com essas palavras.'}</p>
          {resultados.map((r) => (
            <button
              key={`${r.livro}-${r.capitulo}-${r.versiculo}`}
              type="button"
              className="rounded-lg px-2 py-2 text-left text-sm active:bg-hover"
              onClick={() =>
                tentar(
                  abrirCapitulo(r.livro, r.capitulo).then((c) => {
                    if (c) return mostrar(c, r.versiculo)
                  }),
                )
              }
            >
              <b>{formatarReferencia(r.livro, r.capitulo, r.versiculo)}</b> <span className="text-suave">{r.trecho.replace(/[[\]]/g, '')}</span>
            </button>
          ))}
        </div>
      )}

      {cap && !livros && !capitulos && !resultados && (
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="text-sm font-semibold">
              {formatarReferencia(cap.livro, cap.capitulo)} ({sigla})
            </span>
            <span className="ml-auto flex gap-1">
              <Botao tamanho="sm" disabled={cap.capitulo <= 1} onClick={() => tentar(abrirCapitulo(cap.livro, cap.capitulo - 1))}>
                Cap. anterior
              </Botao>
              <Botao tamanho="sm" disabled={cap.capitulo >= cap.total} onClick={() => tentar(abrirCapitulo(cap.livro, cap.capitulo + 1))}>
                Próximo cap.
              </Botao>
            </span>
          </div>
          <div ref={lista} className="flex max-h-[50dvh] flex-col gap-1 overflow-y-auto overscroll-contain">
            {cap.versiculos.map((v) => {
              const ativo = noAr?.livro === cap.livro && noAr.capitulo === cap.capitulo && noAr.versiculo === v.versiculo
              return (
                <button
                  key={v.versiculo}
                  type="button"
                  data-versiculo={v.versiculo}
                  onClick={() => tentar(mostrar(cap, v.versiculo))}
                  className={`flex gap-2 rounded-lg border px-2.5 py-2 text-left text-sm leading-snug ${
                    ativo ? 'border-destaque bg-destaque/12' : 'border-transparent active:bg-hover'
                  }`}
                >
                  <span className="w-6 shrink-0 text-right text-xs font-semibold tabular-nums text-apagado">{v.versiculo}</span>
                  <span>{v.texto}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </section>
    </>
  )
}

const ROTULO_LIGACAO: Record<LigacaoSugestao, string> = {
  citada: 'Dita',
  leitura: 'Lido',
  citacao: 'Citação',
  parafrase: 'Paráfrase',
  alusao: 'Alusão',
  tema_central: 'Tema central',
  tema_relacionado: 'Tema',
  distante: 'Distante',
  '': 'IA',
}

/** Sugestões ao vivo no celular: Automático (ouvir) ou Manual e tocar numa sugestão para mostrar. */
function SugestoesRemoto({
  estado,
  parcial,
  noAr,
  tentar,
  aoUsar,
}: {
  estado: EstadoTranscricao | null
  parcial: string
  noAr: NoAr | null
  tentar: (p: Promise<unknown>) => void
  aoUsar: (s: SugestaoBiblia) => void
}) {
  const [todas, setTodas] = useState(false)
  if (!estado) return null
  const ligado = estado.ligado
  const lista = todas ? estado.sugestoes : estado.sugestoes.slice(0, 4)
  const textoFase = estado.situacao === 'desligado' ? 'Manual (desligado)' : estado.mensagem
  const cor =
    estado.situacao === 'ouvindo'
      ? 'bg-ok'
      : estado.situacao === 'erro'
        ? 'bg-perigo'
        : estado.situacao === 'desligado' || estado.situacao === 'espera'
          ? 'bg-apagado'
          : 'animate-pulse bg-aviso'

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-borda bg-painel p-3">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-destaque-texto" />
        <span className="text-sm font-semibold">Sugestões ao vivo</span>
        <span className="ml-auto flex items-center gap-2 text-xs text-suave">
          Automático
          <Interruptor ligado={ligado} aoMudar={(v) => tentar(api.ligarTranscricao(v))} rotulo="Ouvir o pregador e sugerir versículos" />
        </span>
      </div>
      <div className="flex items-start gap-2 text-xs">
        <span className={`mt-1 size-2 shrink-0 rounded-full ${cor}`} />
        <span className={estado.situacao === 'erro' ? 'text-perigo-texto' : 'text-suave'}>{textoFase}</span>
      </div>
      {estado.aviso && <p className="rounded bg-aviso/15 px-2 py-1 text-xs text-aviso-texto">{estado.aviso}</p>}
      {ligado && (parcial || estado.falas.length > 0) && (
        <p className="line-clamp-2 rounded-lg bg-painel-2 px-2 py-1.5 text-xs text-suave">
          {parcial ? <i className="text-texto">{parcial}</i> : estado.falas[estado.falas.length - 1]?.texto}
        </p>
      )}
      {lista.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {lista.map((s) => {
            const ativo = !!noAr && noAr.livro === s.livro && noAr.capitulo === s.capitulo && s.inicio !== null && noAr.versiculo >= s.inicio && noAr.versiculo <= (s.fim ?? s.inicio)
            const rotulo = ROTULO_LIGACAO[s.ligacao] ?? 'IA'
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => aoUsar(s)}
                className={`rounded-lg border px-2.5 py-2 text-left active:bg-hover ${ativo ? 'border-destaque bg-destaque/12' : 'border-borda bg-painel-2'}`}
              >
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${s.origem === 'citada' ? 'bg-ok/12 text-ok-texto' : 'bg-destaque/12 text-destaque-texto'}`}>{rotulo}</span>
                  <b className="min-w-0 truncate text-sm">{s.referencia}</b>
                  <span className="ml-auto shrink-0 text-[10px] tabular-nums text-apagado">
                    {new Date(s.hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                {s.texto && <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-suave">{s.texto}</p>}
              </button>
            )
          })}
          {estado.sugestoes.length > 4 && (
            <Botao tamanho="sm" variante="fantasma" onClick={() => setTodas(!todas)}>
              {todas ? 'Mostrar menos' : `Ver todas (${estado.sugestoes.length})`}
            </Botao>
          )}
        </div>
      )}
      {ligado && !lista.length && <p className="text-xs text-apagado">Quando o pregador citar ou ler um texto, as sugestões aparecem aqui.</p>}
    </section>
  )
}
