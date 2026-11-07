import { type CSSProperties, type ReactNode, useLayoutEffect, useRef } from 'react'

/**
 * Texto que escolhe sozinho o maior tamanho de letra que cabe na caixa, entre `minPct` e `maxPct`
 * da altura da TELA (o elemento `[data-tela]` em volta; sem ele, a própria caixa). Funciona igual na
 * saída e na miniatura, porque mede o que está em volta.
 */
export function TextoAjustado({
  chave,
  maxPct,
  minPct = 2.5,
  estilo,
  children,
}: {
  /** muda quando o texto muda (para medir de novo) */
  chave: string
  maxPct: number
  minPct?: number
  estilo?: CSSProperties
  children: ReactNode
}) {
  const caixa = useRef<HTMLDivElement>(null)
  const texto = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const c = caixa.current
    const t = texto.current
    if (!c || !t) return
    const ajustar = () => {
      const h = c.clientHeight
      const w = c.clientWidth
      if (!h || !w) return
      const base = (c.closest('[data-tela]') as HTMLElement | null)?.clientHeight || h
      let menor = Math.min((base * minPct) / 100, h)
      let maior = Math.min((base * maxPct) / 100, h)
      let melhor = menor
      for (let i = 0; i < 14; i++) {
        const meio = (menor + maior) / 2
        t.style.fontSize = `${meio}px`
        if (t.scrollHeight <= h && t.scrollWidth <= w) {
          melhor = meio
          menor = meio
        } else {
          maior = meio
        }
      }
      t.style.fontSize = `${melhor}px`
    }
    ajustar()
    const ro = new ResizeObserver(ajustar)
    ro.observe(c)
    return () => ro.disconnect()
  }, [chave, maxPct, minPct])

  return (
    <div ref={caixa} className="flex h-full w-full items-center justify-center overflow-hidden">
      <div ref={texto} style={{ width: '100%', ...estilo }}>
        {children}
      </div>
    </div>
  )
}
