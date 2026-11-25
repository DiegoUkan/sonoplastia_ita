/**
 * Aviso grande "Abra o canal do PC na mesa de som" quando uma mídia com som começa (tela de comando e celular).
 * Some sozinho em 20 s, quando a mídia sai do ar ou com "Já abri" (que, se a configuração pedir, deixa de lembrar
 * por alguns minutos). Não pega o foco do teclado: o passador continua na tela de comando.
 */
import { SlidersVertical, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { EstadoMotor } from '../../shared/estado'
import { proximoLembrete, ROTULO_SOM, type SomNoAr, sonsNoAr } from '../../shared/lembrete'

const SOME_EM_MS = 20_000

export function useLembreteCanal(estado: EstadoMotor | null, ligado: boolean, intervaloMin: number) {
  const lembrados = useRef<Set<string>>(new Set())
  const silencioAte = useRef(0)
  const [aviso, setAviso] = useState<SomNoAr | null>(null)
  const sons = estado ? sonsNoAr(estado) : []
  const assinatura = sons.map((s) => `${s.chave}${s.comSom ? '+' : '-'}`).join('|')

  useEffect(() => {
    const atuais = estado ? sonsNoAr(estado) : []
    const r = proximoLembrete(atuais, lembrados.current)
    lembrados.current = r.lembrados
    // a mídia do aviso saiu do ar: o aviso sai junto
    setAviso((a) => (a && !atuais.some((s) => s.chave === a.chave) ? null : a))
    if (ligado && r.novo && Date.now() >= silencioAte.current) setAviso(r.novo)
    // só a assinatura importa (o estado muda a cada trecho de música, a cada slide…)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assinatura, ligado])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), SOME_EM_MS)
    return () => clearTimeout(t)
  }, [aviso])

  const fechar = (jaAbri: boolean) => {
    if (jaAbri && intervaloMin > 0) silencioAte.current = Date.now() + intervaloMin * 60_000
    setAviso(null)
  }
  return { aviso, fechar }
}

export function AvisoCanal({ aviso, aoFechar }: { aviso: SomNoAr; aoFechar: (jaAbri: boolean) => void }) {
  return (
    <div
      role="alert"
      className="fixed left-1/2 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-xl border-2 border-aviso bg-aviso px-4 py-3 text-sobre-aviso shadow-2xl"
      style={{ top: 'max(12px, env(safe-area-inset-top))', width: 'min(560px, calc(100vw - 24px))', animation: 'lembrete-canal 0.9s ease-in-out infinite alternate' }}
    >
      <SlidersVertical className="size-8 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-[17px] font-bold leading-tight">Abra o canal do PC na mesa de som</div>
        <div className="truncate text-[13px] opacity-85">
          {ROTULO_SOM[aviso.tipo]} começou: {aviso.nome}
        </div>
      </div>
      <button
        type="button"
        className="shrink-0 cursor-pointer rounded-lg bg-sobre-aviso px-3 py-1.5 text-sm font-bold text-aviso"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => aoFechar(true)}
      >
        Já abri
      </button>
      <button type="button" aria-label="Fechar o aviso" title="Fechar" className="shrink-0 cursor-pointer rounded p-1 hover:bg-black/10" onMouseDown={(e) => e.preventDefault()} onClick={() => aoFechar(false)}>
        <X className="size-5" />
      </button>
    </div>
  )
}
