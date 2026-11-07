/** Componentes básicos da tela de comando. As cores vêm do tema (estilos.css). */
import type { LucideIcon } from 'lucide-react'
import { type ButtonHTMLAttributes, type ReactNode, useEffect, useRef, useState } from 'react'

type Variante = 'padrao' | 'primario' | 'perigo' | 'fantasma'

const VARIANTES: Record<Variante, string> = {
  padrao: 'bg-painel-2 border border-borda text-texto hover:bg-hover',
  primario: 'bg-destaque border border-destaque text-sobre-destaque hover:brightness-110',
  perigo: 'bg-perigo/10 border border-perigo/40 text-perigo-texto hover:bg-perigo/20',
  fantasma: 'border border-transparent text-suave hover:bg-hover hover:text-texto',
}

export function Botao({
  variante = 'padrao',
  ativo = false,
  corAtivo = 'destaque',
  icone: Icone,
  tamanho = 'md',
  className = '',
  children,
  ...resto
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: Variante
  ativo?: boolean
  corAtivo?: 'destaque' | 'perigo' | 'aviso'
  icone?: LucideIcon
  tamanho?: 'xs' | 'sm' | 'md' | 'lg'
}) {
  const tam = { xs: 'h-6 px-1.5 text-[11px] gap-1', sm: 'h-7 px-2.5 text-xs gap-1.5', md: 'h-9 px-3 text-sm gap-2', lg: 'h-11 px-4 text-[15px] gap-2.5' }[tamanho]
  const corAtiva = {
    destaque: 'bg-destaque border-destaque text-sobre-destaque',
    perigo: 'bg-perigo border-perigo text-white',
    aviso: 'bg-aviso border-aviso text-sobre-aviso',
  }[corAtivo]
  return (
    <button
      type="button"
      className={`inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${tam} ${
        ativo ? `border ${corAtiva}` : VARIANTES[variante]
      } ${className}`}
      aria-pressed={ativo || undefined}
      {...resto}
    >
      {Icone && <Icone className={tamanho === 'xs' || tamanho === 'sm' ? 'size-3.5' : 'size-4'} strokeWidth={2} />}
      {children}
    </button>
  )
}

export function Interruptor({ ligado, aoMudar, rotulo }: { ligado: boolean; aoMudar: (v: boolean) => void; rotulo?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      onClick={(e) => {
        e.currentTarget.blur()
        aoMudar(!ligado)
      }}
      className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors ${ligado ? 'bg-destaque' : 'bg-interruptor'}`}
    >
      <span
        className={`absolute left-0 top-0.5 size-5 rounded-full bg-white shadow transition-transform ${ligado ? 'translate-x-5.5' : 'translate-x-0.5'}`}
      />
    </button>
  )
}

export function Secao({ titulo, descricao, acoes, children }: { titulo: string; descricao?: ReactNode; acoes?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-borda bg-painel">
      <header className="flex items-start justify-between gap-4 border-b border-borda px-5 py-3.5">
        <div>
          <h2 className="text-[15px] font-semibold text-texto">{titulo}</h2>
          {descricao && <p className="mt-0.5 text-[13px] text-suave">{descricao}</p>}
        </div>
        {acoes && <div className="flex shrink-0 gap-2">{acoes}</div>}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  )
}

type Tom = 'ok' | 'destaque' | 'aviso' | 'perigo' | 'apagado'
const TONS: Record<Tom, string> = {
  ok: 'bg-ok/12 text-ok-texto',
  destaque: 'bg-destaque/12 text-destaque-texto',
  aviso: 'bg-aviso/15 text-aviso-texto',
  perigo: 'bg-perigo/12 text-perigo-texto',
  apagado: 'bg-texto/5 text-apagado',
}

export function Selo({ tom, children, title }: { tom: Tom; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONS[tom]}`}>
      {children}
    </span>
  )
}

export const classeEntrada =
  'h-9 rounded-md border border-borda bg-entrada px-2.5 text-sm text-texto outline-none placeholder:text-apagado focus:border-destaque'

/**
 * Valor local que só é enviado depois de uma pausa (texto, cor, controle deslizante), para não gravar
 * a cada tecla. Usa sempre a versão mais nova de `aoMudar`, e envia o que faltar ao desmontar.
 */
export function useRascunho<T>(valor: T, aoMudar: (v: T) => void, atrasoMs = 350): [T, (v: T) => void] {
  const [rascunho, setRascunho] = useState(valor)
  const pendente = useRef<{ v: T } | null>(null)
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)
  const aoMudarRef = useRef(aoMudar)
  aoMudarRef.current = aoMudar

  useEffect(() => {
    if (!pendente.current) setRascunho(valor)
  }, [valor])

  useEffect(
    () => () => {
      if (temporizador.current) clearTimeout(temporizador.current)
      if (pendente.current) aoMudarRef.current(pendente.current.v)
    },
    [],
  )

  const mudar = (v: T) => {
    setRascunho(v)
    pendente.current = { v }
    if (temporizador.current) clearTimeout(temporizador.current)
    temporizador.current = setTimeout(() => {
      const p = pendente.current
      pendente.current = null
      if (p) aoMudarRef.current(p.v)
    }, atrasoMs)
  }
  return [rascunho, mudar]
}

/**
 * Controle deslizante que (1) manda o valor no máximo a cada `intervaloMs` enquanto arrasta, (2)
 * manda o valor final ao soltar e (3) larga o foco ao soltar, para as setas e o passador de slides
 * não continuarem mexendo nele.
 */
export function Deslizante({
  valor,
  min,
  max,
  passo,
  aoMudar,
  aoSoltar,
  vertical = false,
  intervaloMs = 80,
  desativado,
  className = '',
  rotulo,
}: {
  valor: number
  min: number
  max: number
  passo: number
  /** chamado durante o arraste (limitado) */
  aoMudar?: (v: number) => void
  /** chamado ao soltar (ou a cada tecla) */
  aoSoltar?: (v: number) => void
  vertical?: boolean
  intervaloMs?: number
  desativado?: boolean
  className?: string
  rotulo?: string
}) {
  const [local, setLocal] = useState<number | null>(null)
  const ultimoEnvio = useRef(0)
  const arrastando = useRef(false)
  return (
    <input
      type="range"
      aria-label={rotulo}
      title={rotulo}
      min={min}
      max={max}
      step={passo}
      disabled={desativado}
      value={local ?? valor}
      className={`cursor-pointer accent-destaque disabled:cursor-not-allowed disabled:opacity-40 ${vertical ? 'vertical' : ''} ${className}`}
      onPointerDown={() => {
        arrastando.current = true
      }}
      onChange={(e) => {
        const v = Number(e.target.value)
        setLocal(v)
        if (!arrastando.current) {
          aoSoltar?.(v)
          aoMudar?.(v)
          setLocal(null)
          return
        }
        if (aoMudar && Date.now() - ultimoEnvio.current > intervaloMs) {
          ultimoEnvio.current = Date.now()
          aoMudar(v)
        }
      }}
      onPointerUp={(e) => {
        arrastando.current = false
        const v = Number(e.currentTarget.value)
        aoMudar?.(v)
        aoSoltar?.(v)
        setLocal(null)
        e.currentTarget.blur()
      }}
    />
  )
}

/** Faixa de botões para escolher uma opção (ex.: Público / Palco / Todas). */
export function Segmentado<T extends string>({
  opcoes,
  valor,
  aoMudar,
  tamanho = 'md',
}: {
  opcoes: Array<{ valor: T; rotulo: ReactNode; titulo?: string }>
  valor: T
  aoMudar: (v: T) => void
  tamanho?: 'sm' | 'md'
}) {
  return (
    <div className="inline-flex rounded-lg border border-borda bg-entrada p-0.5">
      {opcoes.map((o) => (
        <button
          key={o.valor}
          type="button"
          title={o.titulo}
          onClick={(e) => {
            e.currentTarget.blur()
            aoMudar(o.valor)
          }}
          className={`cursor-pointer rounded-md font-medium transition-colors ${tamanho === 'sm' ? 'h-6 px-2.5 text-xs' : 'h-8 px-3.5 text-sm'} ${
            valor === o.valor ? 'bg-destaque text-sobre-destaque' : 'text-suave hover:text-texto'
          }`}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  )
}

/** Barra de andamento de uma tarefa longa. */
export function BarraProgresso({ fracao, texto }: { fracao: number; texto?: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-borda">
        <div className="h-full rounded-full bg-destaque transition-[width]" style={{ width: `${Math.round(fracao * 100)}%` }} />
      </div>
      {texto && <span className="shrink-0 text-xs tabular-nums text-suave">{texto}</span>}
    </div>
  )
}
