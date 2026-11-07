/**
 * Página "Músicas": busca (título, número do hino, trecho da letra), importação do Louvor JA,
 * tocar cantado / playback / manual com a letra trocando no tempo, editor e "marcar tempos".
 * Passador de slides: PageDown/PageUp (e setas fora dos campos) andam pelos trechos.
 */
import { ArrowDown, ArrowUp, Download, Hand, Mic, Music, Pencil, Play, Plus, Save, Search, Square, Timer, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Musica, Progresso, ResultadoLouvorJa, ResumoMusica, SlideMusicaDados } from '../../shared/dados'
import type { EstadoMotor, VersaoMusica } from '../../shared/estado'
import { formatarMs, lerMs, temposDaVersao } from '../../shared/musica'
import { api } from '../compartilhado/ganchos'
import type { TeclaPagina } from './App'
import { mensagemDeErro } from './acoes'
import { iniciarArraste } from './arrastar'
import { BarraProgresso, Botao, classeEntrada, Interruptor, Selo } from './ui'

const digitando = (e: KeyboardEvent) => !!(e.target as HTMLElement | null)?.closest?.('input, textarea, select')

const melhorVersao = (m: ResumoMusica): VersaoMusica => (m.temCantado ? 'cantado' : m.temPlayback ? 'playback' : 'manual')

const NOMES_VERSAO: Record<VersaoMusica, string> = { cantado: 'Cantado', playback: 'Playback', manual: 'Manual' }

export function PaginaMusicas({ alvo, estado, registrarTeclas }: { alvo: string; estado: EstadoMotor; registrarTeclas: (f: TeclaPagina | null) => void }) {
  const [busca, setBusca] = useState('')
  const [lista, setLista] = useState<ResumoMusica[]>([])
  const [selId, setSelId] = useState<number | null>(null)
  const [musica, setMusica] = useState<Musica | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [editando, setEditando] = useState(false)
  const [importacao, setImportacao] = useState<{ progresso: Progresso | null; resultado: ResultadoLouvorJa | null } | null>(null)
  const [recarregar, setRecarregar] = useState(0)

  useEffect(() => {
    const t = setTimeout(() => api.listarMusicas(busca).then(setLista), 120)
    return () => clearTimeout(t)
  }, [busca, recarregar])

  useEffect(() => {
    if (selId === null) setMusica(null)
    else api.obterMusica(selId).then(setMusica)
  }, [selId, recarregar])

  useEffect(
    () =>
      api.aoProgresso((p) => {
        if (p.tarefa === 'louvorja' && !p.fim) setImportacao((i) => ({ progresso: p, resultado: i?.resultado ?? null }))
      }),
    [],
  )

  // passador de slides / teclado
  const estadoRef = useRef(estado)
  estadoRef.current = estado
  const editandoRef = useRef(editando)
  editandoRef.current = editando
  useEffect(() => {
    registrarTeclas((e) => {
      const m = estadoRef.current.musica
      if (!m || editandoRef.current) return false
      const proximo = e.key === 'PageDown' || e.key === 'ArrowRight' || e.key === 'ArrowDown'
      const anterior = e.key === 'PageUp' || e.key === 'ArrowLeft' || e.key === 'ArrowUp'
      if (!proximo && !anterior) return false
      if (e.key.startsWith('Arrow') && digitando(e)) return false
      api.comando({ tipo: 'musica:slide', indice: m.indice + (proximo ? 1 : -1), origem: 'operador' })
      return true
    })
    return () => registrarTeclas(null)
  }, [registrarTeclas])

  const tentar = useCallback((p: Promise<unknown>) => {
    setErro(null)
    p.catch((e) => setErro(mensagemDeErro(e)))
  }, [])

  const importar = async (modo: 'todas' | 'liturgia') => {
    setImportacao({ progresso: null, resultado: null })
    try {
      const r = await api.importarLouvorJa(modo)
      setImportacao({ progresso: null, resultado: r })
      setRecarregar((n) => n + 1)
    } catch (e) {
      setImportacao(null)
      setErro(mensagemDeErro(e))
    }
  }

  const noAr = estado.musica
  const estaNoAr = !!(noAr && musica && noAr.musicaId === musica.id)
  const abrir = (versao: VersaoMusica, indice?: number) => musica && tentar(api.abrirMusica(musica.id, versao, alvo, indice))
  const irPara = (i: number) => {
    if (estaNoAr) tentar(api.comando({ tipo: 'musica:slide', indice: i, origem: 'operador' }))
    else abrir('manual', i)
  }
  const tempos = musica ? temposDaVersao(musica.slides, estaNoAr ? noAr!.versao : 'cantado') : []

  return (
    <div className="grid h-full grid-cols-[320px_minmax(0,1fr)]">
      {/* lista */}
      <div className="flex min-h-0 flex-col border-r border-borda bg-painel">
        <div className="flex flex-col gap-2 border-b border-borda p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-apagado" />
            <input
              className={`${classeEntrada} w-full pl-8`}
              placeholder="Título, nº do hino ou trecho da letra"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && lista[0]) setSelId(lista[0].id)
              }}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-suave">Louvor JA:</span>
            <Botao tamanho="sm" icone={Download} disabled={!!importacao && !importacao.resultado} onClick={() => void importar('todas')} title="Importa (ou atualiza) todas as músicas em português">
              Importar todas
            </Botao>
            <Botao tamanho="sm" variante="fantasma" disabled={!!importacao && !importacao.resultado} onClick={() => void importar('liturgia')} title="Só as músicas da liturgia do Louvor JA">
              Só a liturgia
            </Botao>
          </div>
          {importacao && !importacao.resultado && (
            <BarraProgresso
              fracao={importacao.progresso ? importacao.progresso.feito / Math.max(1, importacao.progresso.total) : 0}
              texto={importacao.progresso ? `${importacao.progresso.feito}/${importacao.progresso.total}` : 'abrindo…'}
            />
          )}
          {importacao?.resultado && (
            <div className="flex items-start justify-between gap-2 rounded-md bg-painel-2 px-2.5 py-1.5 text-xs text-suave">
              <span>
                {importacao.resultado.novas} novas, {importacao.resultado.atualizadas} atualizadas
                {importacao.resultado.mantidasEditadas ? `, ${importacao.resultado.mantidasEditadas} editadas aqui (mantidas)` : ''}
                {importacao.resultado.erros.length ? `, ${importacao.resultado.erros.length} com erro` : ''}.
              </span>
              <button type="button" className="cursor-pointer text-apagado hover:text-texto" onClick={() => setImportacao(null)}>
                <X className="size-3.5" />
              </button>
            </div>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {lista.length === 0 ? (
            <p className="p-4 text-sm text-suave">{busca ? 'Nada encontrado.' : 'Nenhuma música ainda. Importe do Louvor JA.'}</p>
          ) : (
            lista.map((m) => (
              <button
                key={m.id}
                type="button"
                draggable
                onDragStart={(e) => iniciarArraste(e, { tipo: 'musica', id: m.id, titulo: m.titulo, versao: melhorVersao(m) })}
                onClick={() => {
                  setSelId(m.id)
                  setEditando(false)
                }}
                onDoubleClick={() => tentar(api.abrirMusica(m.id, melhorVersao(m), alvo))}
                className={`flex w-full cursor-pointer items-center gap-2 border-b border-borda/60 px-3 py-2 text-left transition-colors ${
                  m.id === selId ? 'bg-destaque/10' : 'hover:bg-hover'
                }`}
                title="Clique: abrir · Duplo clique: tocar · Arraste até uma miniatura"
              >
                {noAr?.musicaId === m.id ? <Play className="size-3.5 shrink-0 text-ok-texto" /> : <Music className="size-3.5 shrink-0 text-apagado" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{m.titulo}</span>
                  <span className="block truncate text-[11px] text-suave">{m.album || 'Sem álbum'}</span>
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* música escolhida */}
      <div className="flex min-h-0 flex-col">
        {!musica ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-suave">
            <Music className="size-10 text-apagado" />
            <p className="text-sm">Escolha uma música na lista.</p>
            {noAr && <p className="text-xs">No ar agora: {noAr.titulo}</p>}
          </div>
        ) : editando ? (
          <EditorMusica
            musica={musica}
            aoFechar={(salvou) => {
              setEditando(false)
              if (salvou) setRecarregar((n) => n + 1)
            }}
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-borda px-5 py-3">
              <div className="mr-auto min-w-0">
                <div className="truncate text-base font-semibold">{musica.titulo}</div>
                <div className="flex items-center gap-2 text-xs text-suave">
                  {musica.album || 'Sem álbum'}
                  {musica.editada && <Selo tom="aviso">editada aqui</Selo>}
                </div>
              </div>
              <Botao variante={estaNoAr && noAr!.versao === 'cantado' ? 'primario' : 'padrao'} icone={Mic} disabled={!musica.temCantado} onClick={() => abrir('cantado')} title="Toca o áudio com voz e troca a letra no tempo">
                Cantado
              </Botao>
              <Botao variante={estaNoAr && noAr!.versao === 'playback' ? 'primario' : 'padrao'} icone={Play} disabled={!musica.temPlayback} onClick={() => abrir('playback')} title="Toca só o instrumental e troca a letra no tempo">
                Playback
              </Botao>
              <Botao variante={estaNoAr && noAr!.versao === 'manual' ? 'primario' : 'padrao'} icone={Hand} onClick={() => abrir('manual')} title="Sem áudio: o operador passa os trechos">
                Manual
              </Botao>
              {estaNoAr && (
                <Botao variante="perigo" icone={Square} onClick={() => tentar(api.comando({ tipo: 'musica:fechar' }))}>
                  Fechar
                </Botao>
              )}
              <Botao variante="fantasma" icone={Pencil} onClick={() => setEditando(true)} title="Editar letra e tempos" />
            </div>
            {estaNoAr && noAr!.versao !== 'manual' && (
              <div className="flex items-center gap-3 border-b border-borda bg-painel-2 px-5 py-2 text-sm">
                <span className="size-2 rounded-full bg-ok" />
                <span className="text-suave">No ar ({NOMES_VERSAO[noAr!.versao]}).</span>
                <span className="ml-auto flex items-center gap-2 text-suave">
                  Seguir o áudio
                  <Interruptor ligado={noAr!.seguirAudio} aoMudar={(v) => tentar(api.comando({ tipo: 'musica:seguir', valor: v }))} rotulo="Seguir o áudio" />
                </span>
              </div>
            )}
            {erro && <div className="border-b border-borda bg-perigo/10 px-5 py-2 text-sm text-perigo-texto">{erro}</div>}
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
                <CartaoTrecho numero="Intro" tempo={null} texto={musica.titulo} intro ativo={estaNoAr && noAr!.indice === -1} aoClicar={() => irPara(-1)} />
                {musica.slides.map((s, i) => (
                  <CartaoTrecho
                    key={i}
                    numero={String(i + 1)}
                    tempo={tempos[i] ? formatarMs(tempos[i]!) : null}
                    texto={s.texto}
                    ativo={estaNoAr && noAr!.indice === i}
                    aoClicar={() => irPara(i)}
                  />
                ))}
              </div>
              <p className="mt-4 text-xs text-suave">Clique num trecho para ir até ele. Passador ou PageDown/PageUp: próximo / anterior.</p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function CartaoTrecho({ numero, tempo, texto, ativo, intro, aoClicar }: { numero: string; tempo: string | null; texto: string; ativo: boolean; intro?: boolean; aoClicar: () => void }) {
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (ativo) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [ativo])
  return (
    <button
      ref={ref}
      type="button"
      onClick={(e) => {
        e.currentTarget.blur()
        aoClicar()
      }}
      className={`cursor-pointer rounded-lg border p-2.5 text-left transition-colors ${
        ativo ? 'border-destaque bg-destaque text-sobre-destaque' : 'border-borda bg-painel hover:border-destaque/50'
      }`}
    >
      <div className={`mb-1 flex justify-between text-[11px] font-semibold ${ativo ? 'text-sobre-destaque/80' : 'text-apagado'}`}>
        <span>{numero}</span>
        {tempo && <span className="tabular-nums">{tempo}</span>}
      </div>
      <div className={`line-clamp-4 whitespace-pre-line text-[13px] leading-snug ${intro && !ativo ? 'italic text-suave' : ''}`}>{texto || '(instrumental)'}</div>
    </button>
  )
}

/** Editor de letra e tempos, com "marcar tempos" tocando o áudio aqui mesmo (não vai para as saídas). */
function EditorMusica({ musica, aoFechar }: { musica: Musica; aoFechar: (salvou: boolean) => void }) {
  const [titulo, setTitulo] = useState(musica.titulo)
  const [slides, setSlides] = useState<SlideMusicaDados[]>(musica.slides)
  const [erro, setErro] = useState<string | null>(null)
  const [marcando, setMarcando] = useState<{ versao: 'cantado' | 'playback'; proximo: number } | null>(null)
  const audio = useRef<HTMLAudioElement>(null)

  const mudar = (i: number, s: Partial<SlideMusicaDados>) => setSlides((atual) => atual.map((x, j) => (j === i ? { ...x, ...s } : x)))
  const mover = (i: number, d: number) =>
    setSlides((atual) => {
      const j = i + d
      if (j < 0 || j >= atual.length) return atual
      const n = [...atual]
      ;[n[i], n[j]] = [n[j]!, n[i]!]
      return n
    })

  const marcar = useCallback(() => {
    const a = audio.current
    if (!a || !marcando) return
    const ms = Math.round(a.currentTime * 1000)
    setSlides((atual) => atual.map((x, j) => (j === marcando.proximo ? (marcando.versao === 'cantado' ? { ...x, msCantado: ms } : { ...x, msPlayback: ms }) : x)))
    const proximo = marcando.proximo + 1
    if (proximo >= slides.length) {
      a.pause()
      setMarcando(null)
    } else setMarcando({ ...marcando, proximo })
  }, [marcando, slides.length])

  // espaço marca o próximo trecho (pega a tecla antes de qualquer outro atalho)
  useEffect(() => {
    if (!marcando) return
    const h = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      e.preventDefault()
      e.stopPropagation()
      marcar()
    }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [marcando, marcar])

  const comecar = (versao: 'cantado' | 'playback') => {
    const url = versao === 'cantado' ? musica.urlCantado : musica.urlPlayback
    const a = audio.current
    if (!a || !url) return
    a.src = url
    a.currentTime = 0
    a.play().catch((e) => setErro(String(e)))
    setMarcando({ versao, proximo: 0 })
  }

  const salvar = async () => {
    try {
      await api.salvarMusica(musica.id, titulo, slides.filter((s, i) => s.texto.trim() || i === 0))
      aoFechar(true)
    } catch (e) {
      setErro(mensagemDeErro(e))
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-borda px-5 py-3">
        <input className={`${classeEntrada} mr-auto w-96 font-semibold`} value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        {marcando ? (
          <>
            <span className="text-sm text-suave">
              Marcando ({marcando.versao}): aperte <b className="text-texto">Espaço</b> quando começar o trecho {marcando.proximo + 1}
            </span>
            <Botao variante="primario" icone={Timer} onClick={marcar}>
              Marcar
            </Botao>
            <Botao
              icone={Square}
              onClick={() => {
                audio.current?.pause()
                setMarcando(null)
              }}
            >
              Parar
            </Botao>
          </>
        ) : (
          <>
            <Botao icone={Timer} disabled={!musica.urlCantado} onClick={() => comecar('cantado')} title="Toca o áudio cantado aqui e marca o início de cada trecho com Espaço">
              Marcar tempos (cantado)
            </Botao>
            <Botao icone={Timer} disabled={!musica.urlPlayback} onClick={() => comecar('playback')}>
              Marcar tempos (playback)
            </Botao>
          </>
        )}
        <Botao variante="primario" icone={Save} onClick={() => void salvar()}>
          Salvar
        </Botao>
        <Botao variante="fantasma" icone={X} onClick={() => aoFechar(false)}>
          Cancelar
        </Botao>
      </div>
      {erro && <div className="border-b border-borda bg-perigo/10 px-5 py-2 text-sm text-perigo-texto">{erro}</div>}
      <audio ref={audio} controls className="mx-5 mt-3 h-8" />
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
        <div className="mb-2 grid grid-cols-[32px_minmax(0,1fr)_92px_92px_84px] gap-2 text-[11px] font-semibold uppercase tracking-wide text-suave">
          <span>#</span>
          <span>Letra do trecho</span>
          <span>Cantado</span>
          <span>Playback</span>
          <span />
        </div>
        {slides.map((s, i) => (
          <div
            key={i}
            className={`mb-2 grid grid-cols-[32px_minmax(0,1fr)_92px_92px_84px] items-start gap-2 rounded-md p-1 ${marcando?.proximo === i ? 'bg-destaque/10 ring-1 ring-destaque' : ''}`}
          >
            <span className="pt-2 text-sm tabular-nums text-suave">{i + 1}</span>
            <textarea className={`${classeEntrada} h-auto min-h-16 resize-y py-1.5 leading-snug`} rows={3} value={s.texto} onChange={(e) => mudar(i, { texto: e.target.value })} />
            <CampoTempo ms={s.msCantado} aoMudar={(ms) => mudar(i, { msCantado: ms })} />
            <CampoTempo ms={s.msPlayback} aoMudar={(ms) => mudar(i, { msPlayback: ms })} />
            <div className="flex gap-0.5 pt-1">
              <Botao tamanho="xs" variante="fantasma" icone={ArrowUp} onClick={() => mover(i, -1)} title="Subir" />
              <Botao tamanho="xs" variante="fantasma" icone={ArrowDown} onClick={() => mover(i, 1)} title="Descer" />
              <Botao tamanho="xs" variante="fantasma" icone={X} onClick={() => setSlides((a) => a.filter((_, j) => j !== i))} title="Tirar trecho" />
            </div>
          </div>
        ))}
        <Botao icone={Plus} onClick={() => setSlides((a) => [...a, { texto: '', msCantado: 0, msPlayback: 0 }])}>
          Trecho
        </Botao>
        <p className="mt-3 text-xs text-suave">
          Tempo em minutos:segundos (ex.: 1:23.5). Trecho com tempo 0 só aparece no modo manual. Música editada aqui não é sobrescrita ao
          reimportar do Louvor JA.
        </p>
      </div>
    </div>
  )
}

function CampoTempo({ ms, aoMudar }: { ms: number; aoMudar: (ms: number) => void }) {
  const [texto, setTexto] = useState(formatarMs(ms))
  const [invalido, setInvalido] = useState(false)
  useEffect(() => {
    setTexto(formatarMs(ms))
    setInvalido(false)
  }, [ms])
  return (
    <input
      className={`${classeEntrada} h-8 tabular-nums ${invalido ? 'border-perigo' : ''}`}
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => {
        const v = lerMs(texto)
        if (v === null) setInvalido(true)
        else aoMudar(v)
      }}
    />
  )
}
