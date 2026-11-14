/**
 * Controle remoto (celular/tablet): o que está no ar em cada saída, Preto / Limpar / Logo, player,
 * músicas, Bíblia e mídias, e o passador (anterior / próximo) sempre embaixo.
 */
import { BookOpen, ChevronLeft, ChevronRight, FolderOpen, Lock, Music, Pause, Play, RotateCcw, RotateCw, Square, Volume2, VolumeX } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AUDIO, type Conteudo, type ControleMidia, type EstadoMotor, type ModoTela, type Telemetria, TODAS } from '../../shared/estado'
import type { ConfigPublica } from '../../shared/remoto'
import { useAgora } from '../compartilhado/ganchos'
import { Botao, Segmentado } from '../comando/ui'
import { AbaBiblia, type PassadorBiblia } from './AbaBiblia'
import { AbaMidias } from './AbaMidias'
import { AbaMusicas } from './AbaMusicas'
import { api, entrar, quandoPedirPin, sessao, useConexao } from './cliente'

type Fase = 'verificando' | 'sem-conexao' | 'pin' | 'pronto'
type Aba = 'musicas' | 'biblia' | 'midias'

export function App() {
  const [fase, setFase] = useState<Fase>('verificando')

  const verificar = useCallback(async () => {
    setFase('verificando')
    const s = await sessao()
    setFase(!s ? 'sem-conexao' : s.precisaPin && !s.autorizado ? 'pin' : 'pronto')
  }, [])
  useEffect(() => {
    void verificar()
    quandoPedirPin(() => setFase('pin'))
  }, [verificar])

  if (fase === 'verificando') return <Centro>Conectando ao computador…</Centro>
  if (fase === 'sem-conexao') {
    return (
      <Centro>
        <p className="mb-4">Não consegui falar com o computador.</p>
        <p className="mb-6 text-sm text-suave">Confira se o programa está aberto e se o celular está no mesmo Wi-Fi.</p>
        <Botao variante="primario" tamanho="lg" onClick={() => void verificar()}>
          Tentar de novo
        </Botao>
      </Centro>
    )
  }
  if (fase === 'pin') return <TelaPin aoEntrar={() => setFase('pronto')} />
  return <Painel aoPedirPin={() => setFase('pin')} />
}

function Centro({ children }: { children: React.ReactNode }) {
  return <div className="flex h-dvh flex-col items-center justify-center p-6 text-center text-texto">{children}</div>
}

function TelaPin({ aoEntrar }: { aoEntrar: () => void }) {
  const [pin, setPin] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const enviar = async () => {
    if (!pin || enviando) return
    setEnviando(true)
    const e = await entrar(pin)
    setEnviando(false)
    if (e) {
      setErro(e)
      setPin('')
    } else aoEntrar()
  }
  return (
    <Centro>
      <Lock className="mb-3 size-8 text-suave" />
      <h1 className="mb-1 text-lg font-semibold">Sonoplastia · controle remoto</h1>
      <p className="mb-5 text-sm text-suave">Digite o PIN que aparece no computador (Configurações ou barra de baixo).</p>
      <form
        className="flex w-full max-w-xs flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          void enviar()
        }}
      >
        <input
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={8}
          className="h-14 rounded-lg border border-borda bg-entrada text-center font-mono text-2xl tracking-[0.4em] text-texto outline-none focus:border-destaque"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          aria-label="PIN"
        />
        <Botao type="submit" variante="primario" tamanho="lg" disabled={!pin || enviando}>
          Entrar
        </Botao>
        {erro && <p className="text-sm text-perigo-texto">{erro}</p>}
      </form>
    </Centro>
  )
}

function Painel({ aoPedirPin }: { aoPedirPin: () => void }) {
  const { conectado, estado, config, telemetrias, versaoMidias } = useConexao(true, aoPedirPin)
  const [aba, setAba] = useState<Aba>('musicas')
  const [alvo, setAlvo] = useState<string>(TODAS)
  const [erro, setErro] = useState<string | null>(null)
  const [biblia, setBiblia] = useState<PassadorBiblia | null>(null)
  const agora = useAgora()

  useEffect(() => {
    if (config) document.documentElement.dataset.tema = config.tema
  }, [config])
  useEffect(() => {
    if (!erro) return
    const t = setTimeout(() => setErro(null), 5000)
    return () => clearTimeout(t)
  }, [erro])

  const tentar = useCallback((p: Promise<unknown>) => {
    p.catch((e) => setErro(e instanceof Error ? e.message : String(e)))
  }, [])

  // a saída escolhida pode ter sido desligada no computador
  const saidas = config?.saidas.filter((s) => s.ativa) ?? []
  useEffect(() => {
    if (config && alvo !== TODAS && !saidas.some((s) => s.id === alvo)) setAlvo(TODAS)
  }, [config, alvo, saidas])

  if (!estado || !config) return <Centro>{conectado ? 'Carregando…' : 'Conectando ao computador…'}</Centro>

  return (
    <div className="flex h-dvh flex-col">
      <header
        className="flex shrink-0 items-center gap-2 border-b border-borda bg-painel px-4 pb-2.5"
        style={{ paddingTop: 'max(10px, env(safe-area-inset-top))' }}
      >
        <span className="text-[15px] font-bold tracking-tight">Sonoplastia</span>
        <span className={`ml-1 size-2 rounded-full ${conectado ? 'bg-ok' : 'animate-pulse bg-perigo'}`} />
        <span className="text-xs text-suave">{conectado ? 'conectado' : 'reconectando…'}</span>
        <span className="ml-auto text-sm tabular-nums text-suave">{agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
      </header>

      {erro && (
        <button type="button" onClick={() => setErro(null)} className="shrink-0 bg-perigo/12 px-4 py-2 text-left text-sm text-perigo-texto">
          {erro}
        </button>
      )}

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto flex max-w-xl flex-col gap-3 p-3">
          <AoVivo estado={estado} config={config} tentar={tentar} />
          <PlayerRemoto estado={estado} config={config} telemetrias={telemetrias} tentar={tentar} />

          <div className="flex flex-col gap-2 rounded-xl border border-borda bg-painel p-2">
            <div className="grid grid-cols-3 gap-1">
              <BotaoAba ativo={aba === 'musicas'} icone={Music} rotulo="Músicas" aoClicar={() => setAba('musicas')} />
              <BotaoAba ativo={aba === 'biblia'} icone={BookOpen} rotulo="Bíblia" aoClicar={() => setAba('biblia')} />
              <BotaoAba ativo={aba === 'midias'} icone={FolderOpen} rotulo="Mídias" aoClicar={() => setAba('midias')} />
            </div>
            <div className="flex items-center gap-2 px-1">
              <span className="text-xs text-suave">Enviar para</span>
              <Segmentado
                valor={alvo}
                aoMudar={setAlvo}
                opcoes={[...saidas.map((s) => ({ valor: s.id, rotulo: s.nome })), { valor: TODAS, rotulo: 'Todas' }]}
              />
            </div>
          </div>

          {/* as abas ficam montadas (a Bíblia guarda o capítulo aberto ao trocar de aba) */}
          <div className={aba === 'musicas' ? '' : 'hidden'}>
            <AbaMusicas estado={estado} alvo={alvo} tentar={tentar} />
          </div>
          <div className={aba === 'biblia' ? '' : 'hidden'}>
            <AbaBiblia config={config} alvo={alvo} tentar={tentar} aoMudarPassador={setBiblia} />
          </div>
          <div className={aba === 'midias' ? '' : 'hidden'}>
            <AbaMidias alvo={alvo} tentar={tentar} versao={versaoMidias} visivel={aba === 'midias'} />
          </div>
        </div>
      </main>

      <BarraPassador estado={estado} biblia={aba === 'biblia' ? biblia : null} tentar={tentar} />
    </div>
  )
}

function BotaoAba({ ativo, icone: Icone, rotulo, aoClicar }: { ativo: boolean; icone: typeof Music; rotulo: string; aoClicar: () => void }) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      className={`flex h-11 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors ${
        ativo ? 'bg-destaque text-sobre-destaque' : 'text-suave active:bg-hover'
      }`}
    >
      <Icone className="size-4" />
      {rotulo}
    </button>
  )
}

/** O que a saída mostra, em poucas palavras. */
export function descrever(c: Conteudo): string {
  switch (c.tipo) {
    case 'vazio':
      return 'Nada (só o fundo)'
    case 'teste':
      return 'Padrão de teste'
    case 'texto':
      return c.texto
    case 'imagem':
      return `Imagem: ${c.nome}`
    case 'video':
      return `Vídeo: ${c.nome}`
    case 'letra':
      return c.indice < 0 ? `${c.titulo} · introdução` : `${c.titulo} · trecho ${c.indice + 1}/${c.total}`
    case 'versiculo':
      return c.referencia
    default: {
      const x = c as { nome?: string; indice?: number; total?: number }
      return x.nome ? `${x.nome}${typeof x.indice === 'number' && x.total ? ` · ${x.indice + 1}/${x.total}` : ''}` : 'Conteúdo'
    }
  }
}

const MODOS: Array<{ modo: ModoTela; rotulo: string; cor: 'perigo' | 'aviso' | 'destaque' }> = [
  { modo: 'preto', rotulo: 'Preto', cor: 'perigo' },
  { modo: 'limpar', rotulo: 'Limpar', cor: 'aviso' },
  { modo: 'logo', rotulo: 'Logo', cor: 'destaque' },
]
const ROTULO_MODO: Record<ModoTela, string> = { normal: 'no ar', preto: 'PRETO', limpar: 'limpo', logo: 'LOGO' }

function AoVivo({ estado, config, tentar }: { estado: EstadoMotor; config: ConfigPublica; tentar: (p: Promise<unknown>) => void }) {
  const saidas = config.saidas.filter((s) => s.ativa && estado.saidas[s.id])
  const todasEm = (m: ModoTela) => saidas.length > 0 && saidas.every((s) => estado.saidas[s.id]!.tela === m)
  const alternarTodas = (m: ModoTela) => tentar(api.comando({ tipo: 'tela', alvo: TODAS, tela: todasEm(m) ? 'normal' : m }))
  const alternar = (id: string, m: ModoTela) => tentar(api.comando({ tipo: 'tela', alvo: id, tela: estado.saidas[id]!.tela === m ? 'normal' : m }))

  return (
    <section className="rounded-xl border border-borda bg-painel p-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-apagado">Ao vivo · todas as saídas</div>
      <div className="grid grid-cols-3 gap-2">
        {MODOS.map((m) => (
          <Botao key={m.modo} tamanho="lg" ativo={todasEm(m.modo)} corAtivo={m.cor} onClick={() => alternarTodas(m.modo)} className="w-full">
            {m.rotulo}
          </Botao>
        ))}
      </div>
      <div className="mt-3 flex flex-col divide-y divide-borda">
        {saidas.map((s) => {
          const e = estado.saidas[s.id]!
          return (
            <div key={s.id} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  {s.nome}
                  <span className={`text-[11px] font-semibold ${e.tela === 'normal' ? 'text-ok-texto' : e.tela === 'preto' ? 'text-perigo-texto' : 'text-aviso-texto'}`}>
                    {ROTULO_MODO[e.tela]}
                  </span>
                </div>
                <div className="truncate text-xs text-suave">{descrever(e.conteudo)}</div>
              </div>
              {MODOS.map((m) => (
                <Botao key={m.modo} tamanho="sm" ativo={e.tela === m.modo} corAtivo={m.cor} onClick={() => alternar(s.id, m.modo)}>
                  {m.rotulo}
                </Botao>
              ))}
            </div>
          )
        })}
      </div>
    </section>
  )
}

const tempo = (s: number) => {
  if (!Number.isFinite(s) || s < 0) return '0:00'
  const t = Math.floor(s)
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

interface FonteRemota {
  id: string
  rotulo: string
  nome: string
  /** alvo de tocar/pausar/buscar */
  alvo: string
  /** alvo do volume (no vídeo em várias saídas, só a primeira tem som) */
  alvoSom: string
  controle: ControleMidia
  telemetria: Telemetria | undefined
}

function PlayerRemoto({
  estado,
  config,
  telemetrias,
  tentar,
}: {
  estado: EstadoMotor
  config: ConfigPublica
  telemetrias: Record<string, Telemetria>
  tentar: (p: Promise<unknown>) => void
}) {
  const fontes: FonteRemota[] = []
  if (estado.audio.fonte) {
    const f = estado.audio.fonte
    fontes.push({
      id: AUDIO,
      rotulo: f.tipo === 'musica' ? (f.versao === 'playback' ? 'Música (playback)' : 'Música') : 'Áudio',
      nome: f.nome,
      alvo: AUDIO,
      alvoSom: AUDIO,
      controle: estado.audio.controle,
      telemetria: telemetrias[AUDIO],
    })
  }
  const comVideo = config.saidas.filter((s) => estado.saidas[s.id]?.conteudo.tipo === 'video')
  if (comVideo.length) {
    const primeira = comVideo[0]!
    const e = estado.saidas[primeira.id]!
    fontes.push({
      id: 'video',
      rotulo: `Vídeo · ${comVideo.map((s) => s.nome).join(' + ')}`,
      nome: e.conteudo.tipo === 'video' ? e.conteudo.nome : '',
      alvo: comVideo.length > 1 ? TODAS : primeira.id,
      alvoSom: primeira.id,
      controle: e.video,
      telemetria: comVideo.map((s) => telemetrias[s.id]).find((t) => t?.video),
    })
  }
  if (!fontes.length) return null

  return (
    <>
      {fontes.map((f) => {
        const v = f.telemetria?.video
        const pos = v?.posicao ?? 0
        const dur = v?.duracao ?? 0
        const tocando = v ? v.tocando : f.controle.tocando
        return (
          <section key={f.id} className="rounded-xl border border-borda bg-painel p-3">
            <div className="flex items-baseline gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-apagado">{f.rotulo}</span>
              <span className="ml-auto text-xs tabular-nums text-suave">
                {tempo(pos)} / {tempo(dur)} {dur > 0 && <>· falta {tempo(dur - pos)}</>}
              </span>
            </div>
            <div className="truncate text-sm font-semibold">{f.nome}</div>
            <div className="my-2 h-1.5 overflow-hidden rounded-full bg-borda">
              <div className="h-full bg-destaque" style={{ width: `${dur > 0 ? Math.min(100, (pos / dur) * 100) : 0}%` }} />
            </div>
            <div className="flex items-center gap-2">
              <Botao tamanho="lg" icone={RotateCcw} onClick={() => tentar(api.comando({ tipo: 'buscar', alvo: f.alvo, segundos: -10, relativo: true }))} title="Voltar 10 s" />
              <Botao
                tamanho="lg"
                variante="primario"
                icone={tocando ? Pause : Play}
                className="flex-1"
                onClick={() => tentar(api.comando({ tipo: 'midia', alvo: f.alvo, acao: tocando ? 'pausar' : 'tocar' }))}
              >
                {tocando ? 'Pausar' : 'Tocar'}
              </Botao>
              <Botao tamanho="lg" icone={RotateCw} onClick={() => tentar(api.comando({ tipo: 'buscar', alvo: f.alvo, segundos: 10, relativo: true }))} title="Avançar 10 s" />
              <Botao tamanho="lg" variante="perigo" icone={Square} onClick={() => tentar(api.comando({ tipo: 'midia', alvo: f.alvo, acao: 'parar' }))} title="Parar" />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Botao
                tamanho="md"
                variante="fantasma"
                icone={f.controle.mudo ? VolumeX : Volume2}
                onClick={() => tentar(api.comando({ tipo: 'volume', alvo: f.alvoSom, mudo: !f.controle.mudo }))}
                title={f.controle.mudo ? 'Tirar o mudo' : 'Mudo'}
              />
              <Volume valor={f.controle.volume} aoMudar={(volume) => tentar(api.comando({ tipo: 'volume', alvo: f.alvoSom, volume }))} />
              <span className="w-9 text-right text-xs tabular-nums text-suave">{Math.round(f.controle.volume * 100)}%</span>
            </div>
          </section>
        )
      })}
    </>
  )
}

/** Volume: mostra o valor local enquanto arrasta e manda no máximo 5 vezes por segundo. */
function Volume({ valor, aoMudar }: { valor: number; aoMudar: (v: number) => void }) {
  const [local, setLocal] = useState<number | null>(null)
  const ultimo = useRef(0)
  return (
    <input
      type="range"
      min={0}
      max={1}
      step={0.01}
      value={local ?? valor}
      className="h-8 flex-1 accent-[var(--color-destaque)]"
      onChange={(e) => {
        const v = Number(e.target.value)
        setLocal(v)
        if (Date.now() - ultimo.current > 200) {
          ultimo.current = Date.now()
          aoMudar(v)
        }
      }}
      onPointerUp={(e) => {
        aoMudar(Number(e.currentTarget.value))
        setLocal(null)
      }}
      onTouchEnd={(e) => {
        aoMudar(Number(e.currentTarget.value))
        setLocal(null)
      }}
    />
  )
}

/**
 * Passador sempre à mão. Na aba Bíblia com um versículo no ar, anda os versículos; com a letra de uma
 * música no ar, anda os trechos; senão funciona como o passador do computador (a página aberta lá).
 */
function BarraPassador({ estado, biblia, tentar }: { estado: EstadoMotor; biblia: PassadorBiblia | null; tentar: (p: Promise<unknown>) => void }) {
  const m = estado.musica
  const letraNoAr = !!m && Object.values(estado.saidas).some((s) => s.conteudo.tipo === 'letra')
  const modo = biblia ? 'biblia' : letraNoAr ? 'musica' : 'pc'
  const ap = estado.apresentacao
  const rotulo =
    modo === 'biblia'
      ? biblia!.rotulo
      : modo === 'musica'
        ? `${m!.indice < 0 ? 'Introdução' : `Trecho ${m!.indice + 1}/${m!.slides.length}`} · ${m!.titulo}`
        : ap
          ? `Passador do computador · slide ${ap.indice + 1}/${ap.slides.length} · ${ap.nome}`
          : 'Passador do computador'
  const andar = (passo: 1 | -1) => {
    if (modo === 'biblia') tentar(biblia!.andar(passo))
    else if (modo === 'musica') tentar(api.comando({ tipo: 'musica:slide', indice: m!.indice + passo, origem: 'operador' }))
    else tentar(api.passador(passo === 1 ? 'proximo' : 'anterior'))
  }
  return (
    <footer className="shrink-0 border-t border-borda bg-painel px-3 pt-2" style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}>
      <div className="mx-auto max-w-xl">
        <div className="mb-1.5 truncate text-center text-xs text-suave">{rotulo}</div>
        <div className="grid grid-cols-[1fr_1.6fr] gap-2">
          <button
            type="button"
            onClick={() => andar(-1)}
            className="flex h-16 items-center justify-center gap-1 rounded-xl border border-borda bg-painel-2 text-base font-semibold text-texto active:bg-hover"
          >
            <ChevronLeft className="size-6" />
            Anterior
          </button>
          <button
            type="button"
            onClick={() => andar(1)}
            className="flex h-16 items-center justify-center gap-1 rounded-xl bg-destaque text-lg font-semibold text-sobre-destaque active:brightness-110"
          >
            Próximo
            <ChevronRight className="size-6" />
          </button>
        </div>
      </div>
    </footer>
  )
}
