/** Componentes básicos da tela de comando. */
import type { LucideIcon } from 'lucide-react'
import { type ButtonHTMLAttributes, type ReactNode, useEffect, useRef, useState } from 'react'

type Variante = 'padrao' | 'primario' | 'perigo' | 'fantasma'

const VARIANTES: Record<Variante, string> = {
  padrao: 'bg-painel-2 border border-borda text-texto hover:bg-[#252a35]',
  primario: 'bg-destaque border border-destaque text-white hover:brightness-110',
  perigo: 'bg-perigo/10 border border-perigo/40 text-[#ff8a8a] hover:bg-perigo/20',
  fantasma: 'border border-transparent text-suave hover:bg-painel-2 hover:text-texto',
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
  tamanho?: 'sm' | 'md' | 'lg'
}) {
  const tam = { sm: 'h-7 px-2.5 text-xs gap-1.5', md: 'h-9 px-3 text-sm gap-2', lg: 'h-12 px-4 text-base gap-2.5' }[tamanho]
  const corAtiva = {
    destaque: 'bg-destaque/25 border-destaque text-white',
    perigo: 'bg-perigo border-perigo text-white',
    aviso: 'bg-aviso/90 border-aviso text-black',
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
      {Icone && <Icone className={tamanho === 'sm' ? 'size-3.5' : 'size-4'} strokeWidth={2} />}
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
      onClick={() => aoMudar(!ligado)}
      className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors ${ligado ? 'bg-destaque' : 'bg-[#343a46]'}`}
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
  ok: 'bg-ok/15 text-ok',
  destaque: 'bg-destaque/15 text-[#8db4ff]',
  aviso: 'bg-aviso/15 text-aviso',
  perigo: 'bg-perigo/15 text-[#ff8a8a]',
  apagado: 'bg-white/5 text-apagado',
}

export function Selo({ tom, children }: { tom: Tom; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONS[tom]}`}>{children}</span>
}

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
