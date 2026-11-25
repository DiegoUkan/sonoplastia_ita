/**
 * Registro no log de como cada vídeo tocou em cada saída (pedido de 21/11: "um vídeo travou no meio; foi o
 * download ou o sistema?"). Usa só a telemetria que as saídas já mandam a cada 250 ms:
 *  - quando o vídeo começa: nome e formato ("AV1 2560×1440 30 qps");
 *  - quando a posição não anda por mais de 1,5 s com o vídeo tocando: onde parou e por quanto tempo;
 *  - o primeiro erro do elemento de vídeo;
 *  - no fim (ou quando sai do ar): quanto tocou, quadros, perdidos e paradas.
 */
import { type EstadoMotor, type Telemetria, videoDoConteudo } from '../shared/estado'

const PARADA_MINIMA_MS = 1500

interface Acompanhamento {
  url: string
  nome: string
  inicio: number
  ultimaPosicao: number
  ultimoAvanco: number
  maiorPosicao: number
  duracao: number
  quadros: number
  perdidos: number
  paradas: number
  maiorParadaMs: number
  maiorParadaEm: number
  /** a parada em andamento: desde quando e em que posição */
  parada: { desde: number; em: number } | null
  erro: boolean
  terminou: boolean
  /** a linha de começo só vai para o log quando o vídeo começa a tocar (o do slide espera o clique) */
  anunciado: boolean
}

interface Log {
  info: (...a: unknown[]) => void
  aviso: (...a: unknown[]) => void
  erro: (...a: unknown[]) => void
}

const tempo = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`

export class RegistroVideo {
  private porSaida = new Map<string, Acompanhamento>()

  constructor(
    private readonly o: {
      log: Log
      /** "AV1 2560×1440 30 qps" do vídeo (da biblioteca), se souber */
      formatoDe: (url: string) => string | null
      agora?: () => number
    },
  ) {}

  private agora(): number {
    return this.o.agora?.() ?? Date.now()
  }

  receber(t: Telemetria, estado: EstadoMotor): void {
    const s = estado.saidas[t.saidaId]
    if (!s) return
    const video = videoDoConteudo(s.conteudo)
    const atual = this.porSaida.get(t.saidaId)
    if (!t.video || !video) {
      if (atual) this.fechar(t.saidaId, atual)
      return
    }
    let a = atual
    if (!a || a.url !== video.url) {
      if (a) this.fechar(t.saidaId, a)
      const agora = this.agora()
      a = {
        url: video.url,
        nome: video.nome,
        inicio: agora,
        ultimaPosicao: t.video.posicao,
        ultimoAvanco: agora,
        maiorPosicao: t.video.posicao,
        duracao: t.video.duracao,
        quadros: 0,
        perdidos: 0,
        paradas: 0,
        maiorParadaMs: 0,
        maiorParadaEm: 0,
        parada: null,
        erro: false,
        terminou: false,
        anunciado: false,
      }
      this.porSaida.set(t.saidaId, a)
    }
    this.acompanhar(t.saidaId, a, t.video)
  }

  private acompanhar(saidaId: string, a: Acompanhamento, v: NonNullable<Telemetria['video']>): void {
    const agora = this.agora()
    if (!a.anunciado && v.tocando) {
      a.anunciado = true
      const formato = this.o.formatoDe(a.url)
      this.o.log.info(`Vídeo "${a.nome}" no ${saidaId}${formato ? `: ${formato}` : ''}.`)
    }
    if (v.duracao > 0) a.duracao = v.duracao
    a.quadros = Math.max(a.quadros, v.quadros)
    a.perdidos = Math.max(a.perdidos, v.perdidos)
    if (v.erro && !a.erro) {
      a.erro = true
      this.o.log.erro(`Vídeo "${a.nome}" no ${saidaId}: ${v.erro} (em ${tempo(v.posicao)}).`)
    }
    const andou = Math.abs(v.posicao - a.ultimaPosicao) > 0.05
    if (andou) {
      if (a.parada) this.fimDaParada(saidaId, a, agora)
      a.ultimaPosicao = v.posicao
      a.ultimoAvanco = agora
      a.maiorPosicao = Math.max(a.maiorPosicao, v.posicao)
    } else if (v.tocando && !a.parada && agora - a.ultimoAvanco > PARADA_MINIMA_MS) {
      a.parada = { desde: a.ultimoAvanco, em: v.posicao }
    }
    if (!v.tocando && a.parada) this.fimDaParada(saidaId, a, agora)
    const fim = !v.tocando && a.duracao > 0 && v.posicao >= a.duracao - 0.3
    if (fim && !a.terminou) {
      a.terminou = true
      this.resumo(saidaId, a)
    }
  }

  private fimDaParada(saidaId: string, a: Acompanhamento, agora: number): void {
    const p = a.parada!
    a.parada = null
    const ms = agora - p.desde
    if (ms < PARADA_MINIMA_MS) return
    a.paradas += 1
    if (ms > a.maiorParadaMs) {
      a.maiorParadaMs = ms
      a.maiorParadaEm = p.em
    }
    this.o.log.aviso(`Vídeo "${a.nome}" no ${saidaId}: parou em ${tempo(p.em)} por ${(ms / 1000).toFixed(1)} s.`)
  }

  private fechar(saidaId: string, a: Acompanhamento): void {
    this.porSaida.delete(saidaId)
    if (a.parada) this.fimDaParada(saidaId, a, this.agora())
    if (!a.terminou) this.resumo(saidaId, a)
  }

  private resumo(saidaId: string, a: Acompanhamento): void {
    if (a.quadros <= 0 && a.maiorPosicao <= 0) return
    const pct = a.quadros > 0 ? (a.perdidos / a.quadros) * 100 : 0
    const texto =
      `Vídeo "${a.nome}" no ${saidaId}: tocou até ${tempo(a.maiorPosicao)} de ${tempo(a.duracao)}, ` +
      `${a.quadros.toLocaleString('pt-BR')} quadros, ${a.perdidos.toLocaleString('pt-BR')} perdidos (${pct.toFixed(1).replace('.', ',')}%)` +
      (a.paradas ? `, ${a.paradas} parada${a.paradas > 1 ? 's' : ''} (a maior: ${(a.maiorParadaMs / 1000).toFixed(1)} s em ${tempo(a.maiorParadaEm)})` : '') +
      '.'
    if (a.paradas || pct > 5 || a.erro) this.o.log.aviso(texto)
    else this.o.log.info(texto)
  }
}
