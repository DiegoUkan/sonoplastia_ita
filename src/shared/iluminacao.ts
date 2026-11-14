/**
 * Iluminação da igreja: o sistema "luz.local" (placa com relés na rede, com página própria). O
 * programa só usa o que a página dele usa: ler o estado, os nomes e os cenários, ligar/desligar um
 * relé (o sistema só sabe "alternar") e aplicar um cenário.
 */

export interface ReleLuz {
  id: number
  nome: string
  ligado: boolean
}

export interface EstadoLuz {
  conectado: boolean
  reles: ReleLuz[]
  cenarios: string[]
  /** motivo, quando não conectou */
  erro: string | null
}

/**
 * Relés que aparecem no painel: os 5 da planta da página do sistema (Esquerda, Frente, Meio, Trás,
 * Direita) e qualquer outro que tenha ganhado nome (os sem nome se chamam "Relé N").
 */
export function relesVisiveis(nomes: string[], estados: number[]): ReleLuz[] {
  const total = Math.max(nomes.length, estados.length)
  const r: ReleLuz[] = []
  for (let id = 0; id < total; id++) {
    const nome = (nomes[id] ?? '').trim() || `Relé ${id}`
    if (id >= 5 && /^Rel[eé] \d+$/i.test(nome)) continue
    r.push({ id, nome, ligado: Number(estados[id]) === 1 })
  }
  return r
}

/** 'luz.local' → 'http://luz.local'; tira a barra do fim. */
export function enderecoDaLuz(texto: string): string {
  const t = texto.trim().replace(/\/+$/, '')
  if (!t) return ''
  return /^https?:\/\//i.test(t) ? t : `http://${t}`
}
