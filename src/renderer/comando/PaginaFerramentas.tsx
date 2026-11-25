/**
 * Página "Ferramentas": temporizador, mensagem para o Palco, relógio, QR code e sorteio. Cada cartão
 * tem embaixo o "Mostrar em": em cada saída, não mostrar, no canto (com posição e tamanho) ou em tela
 * cheia.
 *
 * O relógio é uma opção fixa de cada saída (gravada nas configurações; o Palco vem com ele). As outras
 * ferramentas ligam e desligam na hora, pelo motor.
 */
import { AlarmClock, Clock, Gift, Megaphone, Minus, Pause, Play, Plus, QrCode, RotateCcw, Send, Shuffle, X } from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import type { Config, ConfigFerramentas, ConfigSaida } from '../../shared/config'
import { type EstadoMotor, TODAS } from '../../shared/estado'
import {
  candidatosDoSorteio,
  faixaDeNumeros,
  type Ferramenta,
  lerTemporizador,
  type ModoFerramenta,
  type ModoTemporizador,
  nomesDoSorteio,
  POSICOES,
  type Posicao,
  ROTULOS_MODO_TEMPORIZADOR,
  ROTULOS_POSICAO,
} from '../../shared/ferramentas'
import { COR_FASE, DesenhoQrSvg, regrasDe, textoDaHora } from '../compartilhado/Ferramentas'
import { api, useAgora } from '../compartilhado/ganchos'
import { Botao, classeEntrada, Deslizante, Interruptor, Segmentado, Selo, useRascunho } from './ui'

type ModoNaSaida = 'nao' | ModoFerramenta

interface Props {
  estado: EstadoMotor
  config: Config
  salvar: (c: Config) => void
}

/**
 * Campos de posição e tamanho de cada ferramenta "no canto", na configuração da saída. `daTela`: em tela
 * cheia, ela vai para o canto quando outra mídia entra (relógio e temporizador), então a posição e o
 * tamanho também aparecem em "Tela cheia".
 */
const CANTO = {
  relogio: { posicao: 'relogioPosicao', tamanho: 'relogioTamanho', min: 3, max: 30, daTela: true },
  temporizador: { posicao: 'temporizadorPosicao', tamanho: 'temporizadorTamanho', min: 3, max: 40, daTela: true },
  qr: { posicao: 'qrPosicao', tamanho: 'qrTamanho', min: 10, max: 60, daTela: false },
} as const

export function PaginaFerramentas(p: Props) {
  return (
    <div className="@container h-full overflow-y-auto">
      <div className="mx-auto grid max-w-5xl items-start gap-4 p-5 @3xl:grid-cols-2">
        <CartaoTemporizador {...p} />
        <CartaoMensagem {...p} />
        <CartaoRelogio {...p} />
        <CartaoQr {...p} />
        <div className="@3xl:col-span-2">
          <CartaoSorteio {...p} />
        </div>
      </div>
    </div>
  )
}

// --- peças comuns

function Cartao({ icone: Icone, titulo, noAr, children, rodape }: { icone: typeof Clock; titulo: string; noAr: boolean; children: ReactNode; rodape: ReactNode }) {
  return (
    <section className="flex flex-col rounded-xl border border-borda bg-painel">
      <header className="flex items-center gap-2 border-b border-borda px-4 py-2.5">
        <Icone className="size-4 text-destaque-texto" />
        <h2 className="text-sm font-semibold">{titulo}</h2>
        {noAr && <Selo tom="ok">● No ar</Selo>}
      </header>
      <div className="flex flex-col gap-3 p-4">{children}</div>
      <footer className="border-t border-borda bg-painel-2/50 px-4 py-3">{rodape}</footer>
    </section>
  )
}

function SeletorPosicao({ valor, aoMudar }: { valor: Posicao; aoMudar: (p: Posicao) => void }) {
  return (
    <div className="grid shrink-0 grid-cols-3 gap-0.5 rounded border border-borda bg-entrada p-0.5" style={{ width: 42, height: 30 }} title={`Posição: ${ROTULOS_POSICAO[valor]}`}>
      {POSICOES.map((p) => (
        <button
          key={p}
          type="button"
          title={ROTULOS_POSICAO[p]}
          aria-label={ROTULOS_POSICAO[p]}
          aria-pressed={valor === p}
          onClick={(e) => {
            e.currentTarget.blur()
            aoMudar(p)
          }}
          className={`cursor-pointer rounded-[2px] ${valor === p ? 'bg-destaque' : 'bg-borda hover:bg-suave/50'}`}
        />
      ))}
    </div>
  )
}

/**
 * "Mostrar em": uma linha por saída ligada. `canto` (posição e tamanho) só nas ferramentas que podem
 * ficar no canto.
 */
function MostrarEm({
  config,
  salvar,
  modo,
  aoMudar,
  canto,
  soTela,
  dica,
  esperando,
  mostrarAgora,
}: {
  config: Config
  salvar: (c: Config) => void
  modo: (s: ConfigSaida) => ModoNaSaida
  aoMudar: (s: ConfigSaida, m: ModoNaSaida) => void
  canto?: (typeof CANTO)[keyof typeof CANTO]
  soTela?: boolean
  dica?: string
  /** a ferramenta em tela cheia está esperando o conteúdo desta saída sair */
  esperando?: (s: ConfigSaida) => boolean
  mostrarAgora?: (s: ConfigSaida) => void
}) {
  const saidas = config.saidas.filter((s) => s.ativa)
  const mudarSaida = (id: string, parcial: Partial<ConfigSaida>) => salvar({ ...config, saidas: config.saidas.map((s) => (s.id === id ? { ...s, ...parcial } : s)) })
  const opcoes: Array<{ valor: ModoNaSaida; rotulo: string }> = [{ valor: 'nao', rotulo: 'Não' }, ...(soTela ? [] : [{ valor: 'canto' as const, rotulo: 'Canto' }]), { valor: 'tela', rotulo: 'Tela cheia' }]
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-apagado">Mostrar em</div>
      {saidas.map((s) => {
        const m = modo(s)
        return (
          <div key={s.id} className="flex min-h-8 flex-wrap items-center gap-2">
            <span className="w-14 truncate text-xs font-semibold" title={s.nome}>
              {s.nome}
            </span>
            <Segmentado tamanho="sm" valor={m} aoMudar={(v) => aoMudar(s, v)} opcoes={opcoes} />
            {m === 'tela' && esperando?.(s) && (
              <button
                type="button"
                className="cursor-pointer rounded border border-aviso/50 bg-aviso/10 px-1.5 py-0.5 text-[11px] font-semibold text-aviso-texto hover:bg-aviso/20"
                title="Há outra coisa no ar nesta saída. A ferramenta volta em tela cheia sozinha quando ela sair (fim do vídeo, Parar, Esc). Clique para pôr por cima agora."
                onClick={(e) => {
                  e.currentTarget.blur()
                  mostrarAgora?.(s)
                }}
              >
                Esperando a mídia sair · pôr agora
              </button>
            )}
            {canto && (m === 'canto' || (m === 'tela' && canto.daTela)) && (
              <>
                <SeletorPosicao valor={s[canto.posicao]} aoMudar={(p) => mudarSaida(s.id, { [canto.posicao]: p })} />
                <Deslizante
                  className="w-20"
                  min={canto.min}
                  max={canto.max}
                  passo={0.5}
                  valor={s[canto.tamanho]}
                  aoSoltar={(v) => mudarSaida(s.id, { [canto.tamanho]: v })}
                  rotulo={`Tamanho no ${s.nome}`}
                />
              </>
            )}
          </div>
        )
      })}
      {dica && <p className="text-[11px] text-apagado">{dica}</p>}
    </div>
  )
}

/** "Mostrar em" das ferramentas que ligam pelo motor. */
function MostrarEmMotor({ ferramenta, ...p }: Props & { ferramenta: Ferramenta; canto?: (typeof CANTO)[keyof typeof CANTO]; soTela?: boolean; dica?: string }) {
  const ex = p.estado.ferramentas.exibicao[ferramenta]
  const espera = p.estado.ferramentas.emEspera?.[ferramenta] ?? {}
  return (
    <MostrarEm
      {...p}
      modo={(s) => ex[s.id] ?? 'nao'}
      aoMudar={(s, m) => void api.comando({ tipo: 'ferramenta:mostrar', ferramenta, alvo: s.id, modo: m === 'nao' ? null : m })}
      esperando={(s) => {
        const e = p.estado.saidas[s.id]
        return !!espera[s.id] && !!e && e.conteudo.tipo !== 'vazio' && e.tela !== 'limpar'
      }}
      mostrarAgora={(s) => void api.comando({ tipo: 'ferramenta:mostrar', ferramenta, alvo: s.id, modo: 'tela' })}
    />
  )
}

function visivel(estado: EstadoMotor, f: Ferramenta): boolean {
  return Object.keys(estado.ferramentas.exibicao[f]).length > 0
}

/** Saída padrão quando a ferramenta ainda não aparece em nenhuma (a mensagem vai para o Palco; o sorteio, para o Público). */
function saidaPadrao(config: Config, preferida: string): string | null {
  const ativas = config.saidas.filter((s) => s.ativa)
  return (ativas.find((s) => s.id === preferida) ?? ativas[0])?.id ?? null
}

function Chip({ children, aoClicar, aoRemover, titulo }: { children: ReactNode; aoClicar: () => void; aoRemover?: () => void; titulo?: string }) {
  return (
    <span className="group inline-flex h-7 items-center overflow-hidden rounded-full border border-borda bg-painel-2 text-xs">
      <button
        type="button"
        title={titulo}
        onClick={(e) => {
          e.currentTarget.blur()
          aoClicar()
        }}
        className="h-full cursor-pointer px-2.5 font-medium hover:bg-hover"
      >
        {children}
      </button>
      {aoRemover && (
        <button
          type="button"
          aria-label="Remover"
          title="Remover da lista"
          onClick={(e) => {
            e.currentTarget.blur()
            aoRemover()
          }}
          className="hidden h-full cursor-pointer pr-1.5 pl-0.5 text-apagado hover:text-perigo-texto group-hover:block"
        >
          <X className="size-3" />
        </button>
      )}
    </span>
  )
}

function mudarFerramentas(p: Props, parcial: Partial<ConfigFerramentas>) {
  p.salvar({ ...p.config, ferramentas: { ...p.config.ferramentas, ...parcial } })
}

// --- temporizador

/** '40' → 40; '2:30' → 2,5; inválido → null */
function lerMinutos(texto: string): number | null {
  const t = texto.trim().replace(',', '.')
  const m = /^(\d{1,4})(?::(\d{1,2}))?$/.exec(t)
  if (m) return Number(m[1]) + (m[2] ? Number(m[2]) / 60 : 0)
  const n = Number(t)
  return t && Number.isFinite(n) && n >= 0 ? n : null
}

function textoMinutos(ms: number): string {
  const s = Math.round(ms / 1000)
  return s % 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : String(s / 60)
}

function CartaoTemporizador(p: Props) {
  const t = p.estado.ferramentas.temporizador
  const cfg = p.config.ferramentas
  const agora = useAgora(200).getTime()
  const l = lerTemporizador(t, agora, regrasDe(cfg))
  const [minutos, setMinutos] = useState(textoMinutos(t.duracaoMs))
  useEffect(() => setMinutos(textoMinutos(t.duracaoMs)), [t.duracaoMs])
  const [ate, setAte] = useState(t.ate)
  useEffect(() => setAte(t.ate), [t.ate])
  const [titulo, setTitulo] = useRascunho(t.titulo, (v) => void api.comando({ tipo: 'temporizador:titulo', titulo: v }))
  const definir = (modo: ModoTemporizador, extra: { minutos?: number; ate?: string; titulo?: string } = {}) => void api.comando({ tipo: 'temporizador:definir', modo, ...extra })
  const aplicarMinutos = () => {
    const n = lerMinutos(minutos)
    if (n === null) setMinutos(textoMinutos(t.duracaoMs))
    else if (Math.round(n * 60_000) !== t.duracaoMs) definir('regressivo', { minutos: n })
  }
  const comecouOuMudou = t.acumuladoMs > 0 || t.rodando

  return (
    <Cartao icone={AlarmClock} titulo="Temporizador" noAr={visivel(p.estado, 'temporizador')} rodape={<MostrarEmMotor {...p} ferramenta="temporizador" canto={CANTO.temporizador} dica="O Palco costuma ficar com ele (o pregador vê o tempo). Em tela cheia, vai para o canto quando outra mídia entra na saída." />}>
      <Segmentado
        tamanho="sm"
        valor={t.modo}
        aoMudar={(m) => definir(m, m === 'regressivo' ? { minutos: lerMinutos(minutos) ?? 5 } : {})}
        opcoes={(Object.keys(ROTULOS_MODO_TEMPORIZADOR) as ModoTemporizador[]).map((m) => ({ valor: m, rotulo: ROTULOS_MODO_TEMPORIZADOR[m] }))}
      />
      <div className="flex flex-col items-center justify-center rounded-lg bg-tela px-3 py-3 text-center">
        {t.titulo && <div className="text-xs font-semibold text-white/80">{t.titulo}</div>}
        <div
          className="text-5xl font-bold tabular-nums leading-tight"
          style={{ color: COR_FASE[l.fase], animation: l.fase === 'esgotado' && cfg.temporizadorPiscar ? 'piscar 1s steps(1) infinite' : undefined }}
        >
          {l.texto}
        </div>
        {l.fracao !== null && (
          <div className="mt-1.5 h-1 w-3/4 overflow-hidden rounded-full bg-white/15">
            <div className="h-full" style={{ width: `${l.fracao * 100}%`, background: COR_FASE[l.fase] }} />
          </div>
        )}
        <div className="mt-1 text-[11px] text-white/55">
          {t.modo === 'horario' ? (t.alvoEm ? `até as ${t.ate}` : 'escolha o horário') : t.rodando ? 'contando' : comecouOuMudou ? 'pausado' : 'parado'}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        {t.modo === 'regressivo' && (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-suave">Minutos</span>
            <input
              className={`${classeEntrada} w-20`}
              value={minutos}
              disabled={t.rodando}
              title={t.rodando ? 'Pause para trocar (ou use −1 / +1)' : 'Ex.: 40 ou 2:30'}
              onChange={(e) => setMinutos(e.target.value)}
              onBlur={aplicarMinutos}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
              }}
            />
          </label>
        )}
        {t.modo === 'horario' && (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-suave">Até as</span>
            <input
              type="time"
              className={`${classeEntrada} w-28`}
              value={ate}
              onChange={(e) => setAte(e.target.value)}
              onBlur={() => ate !== t.ate && definir('horario', { ate })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
              }}
            />
          </label>
        )}
        <label className="flex min-w-32 flex-1 flex-col gap-1">
          <span className="text-xs font-semibold text-suave">Título (opcional)</span>
          <input className={`${classeEntrada} w-full`} placeholder="Sermão" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </label>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {t.modo !== 'horario' && (
          <Botao variante="primario" icone={t.rodando ? Pause : Play} onClick={() => api.comando({ tipo: 'temporizador:acao', acao: t.rodando ? 'pausar' : 'iniciar' })}>
            {t.rodando ? 'Pausar' : comecouOuMudou ? 'Continuar' : 'Iniciar'}
          </Botao>
        )}
        {t.modo !== 'horario' && (
          <Botao icone={RotateCcw} onClick={() => api.comando({ tipo: 'temporizador:acao', acao: 'zerar' })} title="Volta ao começo, parado">
            Zerar
          </Botao>
        )}
        <div className="ml-auto flex gap-1">
          <Botao tamanho="sm" icone={Minus} onClick={() => api.comando({ tipo: 'temporizador:ajustar', minutos: -1 })} title="Tira 1 minuto" className="h-9">
            1 min
          </Botao>
          <Botao tamanho="sm" icone={Plus} onClick={() => api.comando({ tipo: 'temporizador:ajustar', minutos: 1 })} title="Soma 1 minuto" className="h-9">
            1 min
          </Botao>
        </div>
      </div>

      {t.modo === 'regressivo' && (
        <div className="flex flex-wrap items-center gap-1.5">
          {cfg.predefinicoes.map((x, i) => (
            <Chip
              key={`${x.nome}-${i}`}
              titulo={`${x.nome}: ${x.minutos} min (parado, espera o Iniciar)`}
              aoClicar={() => definir('regressivo', { minutos: x.minutos, titulo: x.nome })}
              aoRemover={() => mudarFerramentas(p, { predefinicoes: cfg.predefinicoes.filter((_, j) => j !== i) })}
            >
              {x.nome} · {x.minutos} min
            </Chip>
          ))}
          <Botao
            tamanho="xs"
            variante="fantasma"
            icone={Plus}
            disabled={cfg.predefinicoes.length >= 30}
            title="Guarda o tempo e o título atuais como atalho"
            onClick={() => {
              const min = Math.round((t.duracaoMs / 60_000) * 100) / 100
              const nome = t.titulo.trim() || `${textoMinutos(t.duracaoMs)} min`
              if (cfg.predefinicoes.some((x) => x.nome === nome && x.minutos === min)) return
              mudarFerramentas(p, { predefinicoes: [...cfg.predefinicoes, { nome, minutos: min }] })
            }}
          >
            Guardar
          </Botao>
        </div>
      )}
    </Cartao>
  )
}

// --- mensagem

function CartaoMensagem(p: Props) {
  const f = p.estado.ferramentas
  const cfg = p.config.ferramentas
  const [texto, setTexto] = useState(f.mensagem)
  const noAr = visivel(p.estado, 'mensagem') && !!f.mensagem.trim()
  const enviar = (x: string) => {
    const v = x.trim()
    if (!v) return
    setTexto(v)
    void api.comando({ tipo: 'mensagem:definir', texto: v })
    // ainda não aparece em nenhuma saída: vai para o Palco, no canto
    const alvo = visivel(p.estado, 'mensagem') ? null : saidaPadrao(p.config, 'palco')
    if (alvo) void api.comando({ tipo: 'ferramenta:mostrar', ferramenta: 'mensagem', alvo, modo: 'canto' })
  }
  return (
    <Cartao
      icone={Megaphone}
      titulo="Mensagem"
      noAr={noAr}
      rodape={<MostrarEmMotor {...p} ferramenta="mensagem" dica="No canto = faixa amarela embaixo. Em tela cheia, sai quando outra mídia entra na saída. Sem saída escolhida, “Enviar” manda para o Palco." />}
    >
      <p className="-mt-1 text-xs text-suave">Recado rápido para quem está no palco (ex.: “Faltam 5 minutos”).</p>
      <div className="flex gap-2">
        <input
          className={`${classeEntrada} min-w-0 flex-1`}
          placeholder="Digite o recado e aperte Enter"
          value={texto}
          maxLength={500}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') enviar(texto)
          }}
        />
        <Botao variante="primario" icone={Send} disabled={!texto.trim()} onClick={() => enviar(texto)}>
          Enviar
        </Botao>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {cfg.mensagensRapidas.map((m, i) => (
          <Chip key={`${m}-${i}`} titulo="Enviar este recado" aoClicar={() => enviar(m)} aoRemover={() => mudarFerramentas(p, { mensagensRapidas: cfg.mensagensRapidas.filter((_, j) => j !== i) })}>
            {m}
          </Chip>
        ))}
        <Botao
          tamanho="xs"
          variante="fantasma"
          icone={Plus}
          disabled={!texto.trim() || cfg.mensagensRapidas.includes(texto.trim()) || cfg.mensagensRapidas.length >= 20}
          onClick={() => mudarFerramentas(p, { mensagensRapidas: [...cfg.mensagensRapidas, texto.trim().slice(0, 120)] })}
          title="Guarda o recado digitado como atalho"
        >
          Guardar
        </Botao>
      </div>
      {noAr && (
        <div className="flex items-center gap-2 rounded-md bg-aviso/15 px-3 py-2 text-sm">
          <span className="min-w-0 flex-1 truncate font-semibold text-aviso-texto">{f.mensagem}</span>
          <Botao tamanho="sm" icone={X} onClick={() => api.comando({ tipo: 'ferramenta:mostrar', ferramenta: 'mensagem', alvo: TODAS, modo: null })}>
            Tirar
          </Botao>
        </div>
      )}
    </Cartao>
  )
}

// --- relógio

function CartaoRelogio(p: Props) {
  const cfg = p.config.ferramentas
  const agora = useAgora(cfg.relogioSegundos ? 250 : 1000).getTime()
  const algum = p.config.saidas.some((s) => s.ativa && s.relogio !== 'nao')
  const mudarSaida = (id: string, relogio: ConfigSaida['relogio']) => p.salvar({ ...p.config, saidas: p.config.saidas.map((s) => (s.id === id ? { ...s, relogio } : s)) })
  return (
    <Cartao
      icone={Clock}
      titulo="Relógio"
      noAr={algum}
      rodape={
        <MostrarEm
          config={p.config}
          salvar={p.salvar}
          modo={(s) => s.relogio}
          aoMudar={(s, m) => mudarSaida(s.id, m)}
          canto={CANTO.relogio}
          dica="Fica gravado: o relógio volta sozinho quando o programa abre. O Palco já vem com ele no canto. Em tela cheia, só sem nada no ar: com conteúdo, vai para o canto. Com letra ou versículo chegando nele, fica menor (Configurações → Ferramentas)."
        />
      }
    >
      <div className="flex items-center justify-center rounded-lg bg-tela py-3 text-5xl font-bold tabular-nums text-white">{textoDaHora(agora, cfg.relogioSegundos)}</div>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <label className="flex items-center gap-2 text-sm">
          <Interruptor ligado={cfg.relogioSegundos} aoMudar={(v) => mudarFerramentas(p, { relogioSegundos: v })} rotulo="Mostrar os segundos" />
          Segundos
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Interruptor ligado={cfg.relogioData} aoMudar={(v) => mudarFerramentas(p, { relogioData: v })} rotulo="Mostrar a data" />
          Data
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Interruptor ligado={cfg.fundoNoCanto} aoMudar={(v) => mudarFerramentas(p, { fundoNoCanto: v })} rotulo="Fundo escuro no canto" />
          Fundo escuro
        </label>
      </div>
    </Cartao>
  )
}

// --- QR code

function CartaoQr(p: Props) {
  const q = p.estado.ferramentas.qr
  const cfg = p.config.ferramentas
  const definir = (link: string, texto: string) => void api.comando({ tipo: 'qr:definir', link, texto })
  const [link, setLink] = useRascunho(q.link, (v) => definir(v, q.texto), 400)
  const [texto, setTexto] = useRascunho(q.texto, (v) => definir(q.link, v), 400)
  return (
    <Cartao icone={QrCode} titulo="QR code" noAr={visivel(p.estado, 'qr') && !!q.link} rodape={<MostrarEmMotor {...p} ferramenta="qr" canto={CANTO.qr} dica="Em tela cheia, sai quando outra mídia entra na saída; no canto, fica." />}>
      <div className="flex gap-3">
        <div className="flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-borda bg-white">
          {q.link ? <DesenhoQrSvg link={q.link} tamanho="112px" /> : <QrCode className="size-10 text-apagado" />}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-suave">Link</span>
            <input className={`${classeEntrada} w-full`} placeholder="https://…" value={link} onChange={(e) => setLink(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-suave">Texto (opcional)</span>
            <input className={`${classeEntrada} w-full`} placeholder="Site da igreja" value={texto} onChange={(e) => setTexto(e.target.value)} />
          </label>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {cfg.qrSalvos.map((x, i) => (
          <Chip
            key={`${x.nome}-${i}`}
            titulo={x.link}
            aoClicar={() => {
              setLink(x.link)
              setTexto(x.texto)
              definir(x.link, x.texto)
            }}
            aoRemover={() => mudarFerramentas(p, { qrSalvos: cfg.qrSalvos.filter((_, j) => j !== i) })}
          >
            {x.nome}
          </Chip>
        ))}
        <Botao
          tamanho="xs"
          variante="fantasma"
          icone={Plus}
          disabled={!q.link || cfg.qrSalvos.some((x) => x.link === q.link && x.texto === q.texto) || cfg.qrSalvos.length >= 30}
          title="Guarda este QR code para usar de novo"
          onClick={() => mudarFerramentas(p, { qrSalvos: [...cfg.qrSalvos, { nome: (q.texto.trim() || q.link.replace(/^https?:\/\//, '')).slice(0, 60), link: q.link, texto: q.texto }] })}
        >
          Guardar
        </Botao>
      </div>
    </Cartao>
  )
}

// --- sorteio

const CHAVE_NOMES = 'sonoplastia.sorteio.nomes'

function lerRascunhoNomes(): string {
  try {
    return localStorage.getItem(CHAVE_NOMES) ?? ''
  } catch {
    return ''
  }
}

function CartaoSorteio(p: Props) {
  const s = p.estado.ferramentas.sorteio
  const cfg = p.config.ferramentas
  const [fonte, setFonte] = useState<'nomes' | 'numeros'>('nomes')
  const [nomes, setNomes] = useState(lerRascunhoNomes)
  const [de, setDe] = useState('1')
  const [ate, setAte] = useState('100')
  const [quantidade, setQuantidade] = useState('1')
  const [semRepetir, setSemRepetir] = useState(true)
  const [titulo, setTitulo] = useState(s.titulo || 'Sorteio')
  useEffect(() => {
    try {
      localStorage.setItem(CHAVE_NOMES, nomes)
    } catch {
      // sem armazenamento: só não lembra a lista
    }
  }, [nomes])

  const lista = useMemo(() => (fonte === 'nomes' ? nomesDoSorteio(nomes) : faixaDeNumeros(Number(de), Number(ate))), [fonte, nomes, de, ate])
  const candidatos = candidatosDoSorteio(lista, s.sorteados, semRepetir)
  const q = Math.max(1, Math.min(100, Math.floor(Number(quantidade) || 1)))
  const agora = useAgora(250).getTime()
  const animando = s.resultado.length > 0 && agora < s.inicioEm + s.duracaoMs

  const sortear = () => {
    if (!candidatos.length) return
    if (!visivel(p.estado, 'sorteio')) {
      const alvo = saidaPadrao(p.config, 'publico')
      if (alvo) void api.comando({ tipo: 'ferramenta:mostrar', ferramenta: 'sorteio', alvo, modo: 'tela' })
    }
    void api.comando({ tipo: 'sorteio:sortear', lista, quantidade: q, semRepetir, duracaoMs: cfg.sorteioDuracaoS * 1000, titulo })
  }

  return (
    <Cartao
      icone={Gift}
      titulo="Sorteio"
      noAr={visivel(p.estado, 'sorteio')}
      rodape={<MostrarEmMotor {...p} ferramenta="sorteio" soTela dica="Sem saída escolhida, “Sortear” mostra no Público. Sai quando outra mídia entra na saída. Duração da animação em Configurações → Ferramentas." />}
    >
      <div className="grid gap-4 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Segmentado
              tamanho="sm"
              valor={fonte}
              aoMudar={setFonte}
              opcoes={[
                { valor: 'nomes', rotulo: 'Nomes' },
                { valor: 'numeros', rotulo: 'Números' },
              ]}
            />
            <span className="ml-auto text-xs text-suave">
              {lista.length} {fonte === 'nomes' ? (lista.length === 1 ? 'nome' : 'nomes') : 'números'}
            </span>
          </div>
          {fonte === 'nomes' ? (
            <textarea
              rows={7}
              className={`${classeEntrada} h-auto w-full py-2`}
              placeholder={'Um nome por linha\n(pode colar de uma planilha)'}
              value={nomes}
              onChange={(e) => setNomes(e.target.value)}
            />
          ) : (
            <div className="flex items-center gap-2 text-sm">
              de
              <input type="number" className={`${classeEntrada} w-24`} value={de} onChange={(e) => setDe(e.target.value)} />
              até
              <input type="number" className={`${classeEntrada} w-24`} value={ate} onChange={(e) => setAte(e.target.value)} />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-32 flex-1 flex-col gap-1">
              <span className="text-xs font-semibold text-suave">Título na tela</span>
              <input
                className={`${classeEntrada} w-full`}
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                onBlur={() => titulo.trim() && titulo !== s.titulo && api.comando({ tipo: 'sorteio:preparar', titulo })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-suave">Quantos</span>
              <input type="number" min={1} max={100} className={`${classeEntrada} w-20`} value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Interruptor ligado={semRepetir} aoMudar={setSemRepetir} rotulo="Sem repetir quem já saiu" />
            Sem repetir quem já saiu
          </label>
          <Botao variante="primario" tamanho="lg" icone={Shuffle} disabled={!candidatos.length || animando} onClick={sortear}>
            {animando ? 'Sorteando…' : q > 1 ? `Sortear ${Math.min(q, candidatos.length)}` : 'Sortear'}
          </Botao>
          {!candidatos.length && lista.length > 0 && <p className="text-xs text-aviso-texto">Todos já saíram. Use “Zerar” para começar de novo.</p>}
          {s.resultado.length > 0 && !animando && (
            <div className="rounded-md bg-destaque/10 px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-suave">Sorteado{s.resultado.length > 1 ? 's' : ''}</div>
              <div className="text-[15px] font-semibold text-destaque-texto">{s.resultado.join(' · ')}</div>
            </div>
          )}
          {s.sorteados.length > 0 && (
            <div className="flex items-start gap-2 text-xs text-suave">
              <span className="min-w-0 flex-1">
                Já saíram ({s.sorteados.length}): {s.sorteados.slice(-12).join(', ')}
                {s.sorteados.length > 12 ? '…' : ''}
              </span>
              <Botao tamanho="xs" icone={RotateCcw} onClick={() => api.comando({ tipo: 'sorteio:zerar' })} title="Esquece quem já saiu">
                Zerar
              </Botao>
            </div>
          )}
        </div>
      </div>
    </Cartao>
  )
}
