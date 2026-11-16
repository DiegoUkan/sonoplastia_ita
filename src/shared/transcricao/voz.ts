/**
 * Detector de voz simples (energia), para economizar: a transcrição na nuvem (que cobra por tempo de
 * áudio) só fica aberta enquanto tem gente falando. Recebe quadros de 100 ms em 16 kHz.
 *
 * O "piso" é o ruído da sala: o nível mais baixo (10% mais baixos) dos últimos 10 s. Fala tem pausas
 * entre as sílabas e as frases, então o piso fica no nível das pausas; um ruído constante (ventilador,
 * chiado da mesa) sobe o piso e deixa de contar como voz.
 */

export const TAXA_AMOSTRAS = 16000
export const QUADRO_MS = 100
export const AMOSTRAS_POR_QUADRO = (TAXA_AMOSTRAS * QUADRO_MS) / 1000

/** Nível RMS do quadro em dBFS (0 = máximo; silêncio digital = −100). */
export function nivelDb(pcm: Int16Array): number {
  if (!pcm.length) return -100
  let soma = 0
  for (let i = 0; i < pcm.length; i++) {
    const s = pcm[i]! / 32768
    soma += s * s
  }
  const rms = Math.sqrt(soma / pcm.length)
  return rms > 0 ? Math.max(-100, 20 * Math.log10(rms)) : -100
}

export type Sensibilidade = 'alta' | 'media' | 'baixa'

/** quantos dB acima do ruído da sala conta como voz */
export const MARGEM_DB: Record<Sensibilidade, number> = { alta: 6, media: 10, baixa: 15 }

export interface OpcoesPorta {
  sensibilidade: Sensibilidade
  /** segundos sem voz até fechar a transcrição */
  silencioS: number
  /** áudio guardado antes da voz começar (a primeira palavra não se perde enquanto a conexão abre) */
  antesS?: number
  /** abaixo disso nunca é voz, por mais silenciosa que esteja a sala */
  minimoDb?: number
}

export interface DecisaoQuadro {
  db: number
  /** este quadro tem voz (3 dos últimos 5 acima do limiar) */
  voz: boolean
  /** a transcrição deve abrir agora */
  abrir: boolean
  /** a transcrição deve fechar agora (depois de enviar `enviar`) */
  fechar: boolean
  /** quadros a mandar para a transcrição, em ordem */
  enviar: Int16Array[]
}

/** Decide, quadro a quadro, quando abrir e fechar a transcrição e o que mandar para ela. */
export class PortaVoz {
  private niveis: number[] = []
  private recentes: boolean[] = []
  private antes: Int16Array[] = []
  private aberta = false
  /** quadros desde a última voz (com a porta aberta) */
  private semVoz = 0

  constructor(private opcoes: OpcoesPorta) {}

  configurar(o: OpcoesPorta): void {
    this.opcoes = o
  }

  get estaAberta(): boolean {
    return this.aberta
  }

  /** ruído da sala estimado agora (dBFS) */
  get piso(): number {
    if (this.niveis.length < 5) return -70
    const ordenados = [...this.niveis].sort((a, b) => a - b)
    return ordenados[Math.floor(ordenados.length * 0.1)]!
  }

  get limiar(): number {
    return Math.max(this.piso + MARGEM_DB[this.opcoes.sensibilidade], this.opcoes.minimoDb ?? -55)
  }

  quadro(pcm: Int16Array): DecisaoQuadro {
    const db = nivelDb(pcm)
    const acima = db >= this.limiar
    // o piso é um percentil baixo: a própria fala quase não o puxa para cima
    this.niveis.push(db)
    if (this.niveis.length > 100) this.niveis.shift()
    this.recentes.push(acima)
    if (this.recentes.length > 5) this.recentes.shift()
    const voz = this.recentes.filter(Boolean).length >= 3

    if (!this.aberta) {
      this.antes.push(pcm)
      const max = Math.round(((this.opcoes.antesS ?? 1.5) * 1000) / QUADRO_MS)
      while (this.antes.length > max) this.antes.shift()
      if (!voz) return { db, voz, abrir: false, fechar: false, enviar: [] }
      this.aberta = true
      this.semVoz = 0
      const enviar = this.antes
      this.antes = []
      return { db, voz, abrir: true, fechar: false, enviar }
    }

    this.semVoz = voz ? 0 : this.semVoz + 1
    if ((this.semVoz * QUADRO_MS) / 1000 >= this.opcoes.silencioS) {
      this.aberta = false
      this.semVoz = 0
      return { db, voz, abrir: false, fechar: true, enviar: [pcm] }
    }
    return { db, voz, abrir: false, fechar: false, enviar: [pcm] }
  }

  /** fecha sem esperar o silêncio (pausa por música, modo manual); o próximo quadro com voz abre de novo */
  fechar(): void {
    this.aberta = false
    this.semVoz = 0
    this.antes = []
  }
}
