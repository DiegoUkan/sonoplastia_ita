import { type CSSProperties, type ReactNode, useLayoutEffect, useRef } from 'react'
import type { FaixaVertical } from '../../shared/ferramentas'

/**
 * Texto que escolhe sozinho o maior tamanho de letra que cabe na caixa, entre `minPct` e `maxPct`
 * da altura da TELA (o elemento `[data-tela]` em volta; sem ele, a própria caixa). Funciona igual na
 * saída e na miniatura, porque mede o que está em volta.
 *
 * `aoMedir`: depois de ajustar, diz em que altura da tela o texto ficou (de 0, em cima, a 1, embaixo),
 * para o relógio do canto saber se o texto chega até ele.
 */
export function TextoAjustado({
  chave,
  maxPct,
  minPct = 2.5,
  estilo,
  aoMedir,
  children,
}: {
  /** muda quando o texto muda (para medir de novo) */
  chave: string
  maxPct: number
  minPct?: number
  estilo?: CSSProperties
  aoMedir?: (f: FaixaVertical) => void
  children: ReactNode
}) {
  const caixa = useRef<HTMLDivElement>(null)
  const texto = useRef<HTMLDivElement>(null)
  // o aviso mais recente (o texto que está saindo na transição deixa de avisar)
  const medir = useRef(aoMedir)
  medir.current = aoMedir

  useLayoutEffect(() => {
    const c = caixa.current
    const t = texto.current
    if (!c || !t) return
    const ajustar = () => {
      const h = c.clientHeight
      const w = c.clientWidth
      if (!h || !w) return
      const tela = c.closest('[data-tela]') as HTMLElement | null
      const base = tela?.clientHeight || h
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
      const aviso = medir.current
      if (!aviso) return
      // posições na tela (as duas na mesma escala, então vale também na miniatura reduzida)
      const rt = (tela ?? c).getBoundingClientRect()
      if (rt.height <= 0) return
      const rc = c.getBoundingClientRect()
      const rx = t.getBoundingClientRect()
      aviso({ topo: (Math.max(rx.top, rc.top) - rt.top) / rt.height, base: (Math.min(rx.bottom, rc.bottom) - rt.top) / rt.height })
    }
    ajustar()
    const ro = new ResizeObserver(ajustar)
    ro.observe(c)
    return () => ro.disconnect()
  }, [chave, maxPct, minPct])

  // corta o que passar da caixa, mas deixa uma folga: a sombra do texto não fica com a borda reta
  return (
    <div ref={caixa} className="flex h-full w-full items-center justify-center" style={{ overflow: 'clip', overflowClipMargin: '4cqh' }}>
      <div ref={texto} style={{ width: '100%', ...estilo }}>
        {children}
      </div>
    </div>
  )
}
