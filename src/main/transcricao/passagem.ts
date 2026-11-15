/** Uma passagem: um versículo, vários seguidos do mesmo capítulo ou o capítulo inteiro (inicio = null). */
import { LIVROS } from '../../shared/biblia/livros'

export interface Passagem {
  livro: number
  capitulo: number
  inicio: number | null
  /** igual a `inicio` quando é um versículo só; null no capítulo inteiro */
  fim: number | null
}

export function passagem(livro: number, capitulo: number, inicio: number | null = null, fim: number | null = null): Passagem {
  return { livro, capitulo, inicio, fim: inicio === null ? null : (fim ?? inicio) }
}

/** "Filipenses 4:6-7" (ou "Fp 4:6-7" curta), "Salmos 23". */
export function referencia(p: Passagem, curta = false): string {
  const l = LIVROS[p.livro - 1]
  const nome = (curta ? l?.abrev : l?.nome) ?? '?'
  if (p.inicio === null) return `${nome} ${p.capitulo}`
  if (p.fim === p.inicio || p.fim === null) return `${nome} ${p.capitulo}:${p.inicio}`
  return `${nome} ${p.capitulo}:${p.inicio}-${p.fim}`
}

export function iguais(a: Passagem, b: Passagem): boolean {
  return a.livro === b.livro && a.capitulo === b.capitulo && a.inicio === b.inicio && a.fim === b.fim
}

export function sobrepoe(a: Passagem, b: Passagem): boolean {
  if (a.livro !== b.livro || a.capitulo !== b.capitulo) return false
  if (a.inicio === null || b.inicio === null) return true
  return a.inicio <= b.fim! && b.inicio <= a.fim!
}

/** Quantos versículos tem cada capítulo (0 = não existe). */
export interface ContagemBiblia {
  versiculosNoCapitulo(livro: number, capitulo: number): number
}

/** Ajusta o fim ao tamanho do capítulo; null se a referência não existe. */
export function validar(c: ContagemBiblia, p: Passagem): Passagem | null {
  const total = c.versiculosNoCapitulo(p.livro, p.capitulo)
  if (total === 0) return null
  if (p.inicio === null) return passagem(p.livro, p.capitulo)
  if (p.inicio < 1 || p.inicio > total) return null
  return passagem(p.livro, p.capitulo, p.inicio, Math.min(Math.max(p.fim ?? p.inicio, p.inicio), total))
}
