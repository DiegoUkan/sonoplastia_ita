/**
 * Ferramentas que aparecem por cima do conteúdo das saídas: relógio, temporizador, QR code,
 * mensagem e sorteio. Em cada saída, uma ferramenta aparece "no canto" (pequena, por cima do que está
 * no ar) ou em "tela cheia".
 *
 * O relógio é uma opção fixa de cada saída (configuração; o Palco já vem com ele no canto). As outras
 * ligam e desligam na hora, pelo motor (`EstadoFerramentas.exibicao`).
 *
 * Os tempos são guardados como instantes (ms desde 1970): cada janela calcula o que mostrar com o
 * relógio do próprio computador, sem o motor precisar avisar a cada segundo.
 */
import type { ConfigSaida } from './config'
import type { EstadoFerramentas } from './estado'

/** Ferramentas que ligam e desligam pelo motor (o relógio é da configuração de cada saída). */
export const FERRAMENTAS = ['temporizador', 'qr', 'mensagem', 'sorteio'] as const
export type Ferramenta = (typeof FERRAMENTAS)[number]

export type ModoFerramenta = 'canto' | 'tela'

/**
 * Modo de cada ferramenta nesta saída (null = não aparece). `comConteudo`: há algo visível no ar na saída
 * (não vazio e sem Limpar); o relógio em tela cheia (da configuração) vai para o canto, para não cobrir a mídia.
 * As ferramentas em tela cheia que estão esperando o conteúdo sair (`emEspera`) fazem o mesmo: o temporizador
 * vai para o canto e o QR e a mensagem somem; sem conteúdo (fim do vídeo, Parar, Esc), voltam em tela cheia.
 */
export function modosNaSaida(saidaId: string, config: Pick<ConfigSaida, 'relogio'>, f: EstadoFerramentas | undefined, comConteudo = false) {
  const de = (k: Ferramenta): ModoFerramenta | null => {
    const modo = f?.exibicao[k]?.[saidaId] ?? null
    if (modo !== 'tela' || !comConteudo || !f?.emEspera?.[k]?.[saidaId]) return modo
    return k === 'temporizador' ? 'canto' : null
  }
  return {
    relogio: config.relogio === 'nao' ? null : config.relogio === 'tela' && comConteudo ? ('canto' as const) : config.relogio,
    temporizador: de('temporizador'),
    qr: f?.qr.link ? de('qr') : null,
    mensagem: f?.mensagem.trim() ? de('mensagem') : null,
    // o sorteio é sempre em tela cheia
    sorteio: de('sorteio') ? ('tela' as const) : null,
  }
}

/** Os 9 pontos da tela onde uma ferramenta "no canto" pode ficar. */
export const POSICOES = ['sup-esq', 'sup-centro', 'sup-dir', 'meio-esq', 'centro', 'meio-dir', 'inf-esq', 'inf-centro', 'inf-dir'] as const
export type Posicao = (typeof POSICOES)[number]

export const ROTULOS_POSICAO: Record<Posicao, string> = {
  'sup-esq': 'Em cima, à esquerda',
  'sup-centro': 'Em cima, no meio',
  'sup-dir': 'Em cima, à direita',
  'meio-esq': 'No meio, à esquerda',
  centro: 'No centro',
  'meio-dir': 'No meio, à direita',
  'inf-esq': 'Embaixo, à esquerda',
  'inf-centro': 'Embaixo, no meio',
  'inf-dir': 'Embaixo, à direita',
}

/** distância das ferramentas do canto até a borda (% da altura da tela, além da margem da saída) */
export const MARGEM_CANTO_PCT = 3
/** altura reservada para a faixa da mensagem embaixo (% da altura da tela) */
export const ALTURA_FAIXA_PCT = 13

/** Pedaço da altura da tela, de 0 (em cima) a 1 (embaixo). */
export interface FaixaVertical {
  topo: number
  base: number
}

/**
 * Onde o relógio do canto fica na altura da tela, no tamanho normal (`tamanho` em % da altura; a pílula
 * tem a hora com 0,2 em de folga em cima e embaixo, e a data, se tiver, embaixo). `comFaixa`: a faixa
 * da mensagem está embaixo (os cantos de baixo sobem).
 */
export function faixaDoRelogio(posicao: Posicao, margemPct: number, tamanho: number, comData: boolean, comFaixa: boolean): FaixaVertical {
  const m = (margemPct + MARGEM_CANTO_PCT) / 100
  const altura = (tamanho * (1.4 + (comData ? 0.43 : 0))) / 100
  const v = posicao === 'centro' ? 'meio' : posicao.split('-')[0]
  if (v === 'sup') return { topo: m, base: m + altura }
  if (v === 'inf') {
    const base = 1 - m - (comFaixa ? ALTURA_FAIXA_PCT / 100 : 0)
    return { topo: base - altura, base }
  }
  return { topo: 0.5 - altura / 2, base: 0.5 + altura / 2 }
}

/** As duas faixas se cruzam (com uma folguinha, para não mudar por um pixel)? */
export function sobrepoe(a: FaixaVertical, b: FaixaVertical, folga = 0.005): boolean {
  return a.topo < b.base - folga && a.base > b.topo + folga
}

// --- temporizador

/** regressivo = conta uma duração; horario = conta até um horário; progressivo = cronômetro */
export type ModoTemporizador = 'regressivo' | 'horario' | 'progressivo'

export const ROTULOS_MODO_TEMPORIZADOR: Record<ModoTemporizador, string> = {
  regressivo: 'Regressivo',
  horario: 'Até um horário',
  progressivo: 'Cronômetro',
}

export interface EstadoTemporizador {
  modo: ModoTemporizador
  /** aparece em cima do tempo ("Sermão") */
  titulo: string
  /** duração do regressivo */
  duracaoMs: number
  /** horário como foi digitado ('HH:MM'), no modo 'horario' */
  ate: string
  /** o horário-alvo (ms desde 1970), no modo 'horario' */
  alvoEm: number | null
  rodando: boolean
  /** quando começou a contar desde a última vez que foi iniciado */
  desde: number | null
  /** tempo já contado antes da última pausa */
  acumuladoMs: number
}

export function temporizadorNovo(): EstadoTemporizador {
  return { modo: 'regressivo', titulo: '', duracaoMs: 5 * 60_000, ate: '', alvoEm: null, rodando: false, desde: null, acumuladoMs: 0 }
}

/** Tempo contado até agora (regressivo e cronômetro). */
export function decorridoMs(t: EstadoTemporizador, agora: number): number {
  return t.acumuladoMs + (t.rodando && t.desde !== null ? Math.max(0, agora - t.desde) : 0)
}

/** 'HH:MM' → [hora, minuto], ou null se inválido. */
function horaMinuto(hhmm: string): [number, number] | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  return h < 24 && min < 60 ? [h, min] : null
}

/**
 * Instante do horário 'HH:MM': hoje; se ele já passou há mais de 6 horas, amanhã (às 23h, "até as
 * 0:30" é a meia-noite e meia de amanhã; às 9h05, "até as 9:00" continua sendo hoje: 5 min atrasado).
 */
export function alvoDoHorario(hhmm: string, agora: number): number | null {
  const hm = horaMinuto(hhmm)
  if (!hm) return null
  const d = new Date(agora)
  d.setHours(hm[0], hm[1], 0, 0)
  if (agora - d.getTime() > 6 * 3600_000) d.setDate(d.getDate() + 1)
  return d.getTime()
}

/** Instante → 'H:MM' no horário local. */
export function horaDe(ms: number): string {
  const d = new Date(ms)
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

export interface RegrasTemporizador {
  /** fica amarelo quando faltar isso (min) */
  amareloMin: number
  /** fica vermelho quando faltar isso (min) */
  vermelhoMin: number
  /** no fim: continua contando o tempo passado ou para no 0:00 */
  aoTerminar: 'negativo' | 'parar'
}

export type FaseTemporizador = 'normal' | 'amarelo' | 'vermelho' | 'esgotado'

export interface LeituraTemporizador {
  /** com sinal: no regressivo e no horário, o que falta (negativo = passou do tempo); no cronômetro, o contado */
  ms: number
  fase: FaseTemporizador
  /** '12:34', '1:02:03', '−0:35' */
  texto: string
  /** quanto falta do total (0 a 1), só no regressivo */
  fracao: number | null
}

/** Segundos inteiros → '4:05', '1:02:03' ou '−0:35'. */
export function formatarSegundos(segundos: number): string {
  const neg = segundos < 0
  const s = Math.abs(segundos)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const seg = s % 60
  const corpo = h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(seg).padStart(2, '0')}` : `${m}:${String(seg).padStart(2, '0')}`
  return neg ? `−${corpo}` : corpo
}

/** O que o temporizador mostra agora. */
export function lerTemporizador(t: EstadoTemporizador, agora: number, r: RegrasTemporizador): LeituraTemporizador {
  if (t.modo === 'progressivo') {
    const ms = decorridoMs(t, agora)
    return { ms, fase: 'normal', texto: formatarSegundos(Math.floor(ms / 1000)), fracao: null }
  }
  let ms = t.modo === 'horario' ? (t.alvoEm === null ? 0 : t.alvoEm - agora) : t.duracaoMs - decorridoMs(t, agora)
  if (ms < 0 && r.aoTerminar === 'parar') ms = 0
  // contagem regressiva arredonda para cima: chega ao 0:00 exatamente no fim
  const segundos = Math.ceil(ms / 1000) || 0
  const fase: FaseTemporizador =
    segundos <= 0 ? 'esgotado' : ms <= r.vermelhoMin * 60_000 ? 'vermelho' : ms <= r.amareloMin * 60_000 ? 'amarelo' : 'normal'
  const fracao = t.modo === 'regressivo' && t.duracaoMs > 0 ? Math.min(1, Math.max(0, ms / t.duracaoMs)) : null
  return { ms, fase, texto: formatarSegundos(segundos), fracao }
}

/** Instante em que a contagem chega a zero (null no cronômetro, parado ou sem horário). */
export function fimDoTemporizador(t: EstadoTemporizador, agora: number): number | null {
  if (t.modo === 'horario') return t.alvoEm
  if (t.modo === 'regressivo' && t.rodando) return agora + (t.duracaoMs - decorridoMs(t, agora))
  return null
}

// --- sorteio

export interface EstadoSorteio {
  titulo: string
  /** sorteados da última vez (vazio = tela "Sorteio" esperando) */
  resultado: string[]
  /** nomes que passam na tela durante a animação */
  amostra: string[]
  /** muda a cada sorteio: as saídas recomeçam a animação */
  seq: number
  inicioEm: number
  duracaoMs: number
  /** todos os já sorteados, em ordem (para não repetir) */
  sorteados: string[]
}

export function sorteioNovo(): EstadoSorteio {
  return { titulo: 'Sorteio', resultado: [], amostra: [], seq: 0, inicioEm: 0, duracaoMs: 0, sorteados: [] }
}

export const MAX_NOMES_SORTEIO = 10_000

/** Uma pessoa por linha (ou separadas por ";"): sem linhas vazias e sem repetidos. */
export function nomesDoSorteio(texto: string): string[] {
  const vistos = new Set<string>()
  const r: string[] = []
  for (const bruto of texto.split(/[\r\n;]+/)) {
    const n = bruto.trim().replace(/\s+/g, ' ').slice(0, 120)
    if (!n || vistos.has(n)) continue
    vistos.add(n)
    r.push(n)
    if (r.length >= MAX_NOMES_SORTEIO) break
  }
  return r
}

/** Números de `de` até `ate` (no máximo 10 mil), como texto. */
export function faixaDeNumeros(de: number, ate: number): string[] {
  const a = Math.ceil(Math.min(de, ate))
  const b = Math.floor(Math.max(de, ate))
  if (!Number.isFinite(a) || !Number.isFinite(b)) return []
  const r: string[] = []
  for (let n = a; n <= b && r.length < MAX_NOMES_SORTEIO; n++) r.push(String(n))
  return r
}

/** Quem ainda pode sair (sem os já sorteados, se pedir). */
export function candidatosDoSorteio(lista: string[], sorteados: string[], semRepetir: boolean): string[] {
  if (!semRepetir) return lista
  const ja = new Set(sorteados)
  return lista.filter((n) => !ja.has(n))
}

/** `quantidade` nomes diferentes, ao acaso. `aleatorio(n)` devolve um inteiro de 0 a n-1. */
export function sortearNomes(candidatos: string[], quantidade: number, aleatorio: (n: number) => number): string[] {
  const v = [...candidatos]
  const q = Math.max(0, Math.min(Math.floor(quantidade), v.length))
  // embaralhamento de Fisher-Yates só até onde precisa
  for (let i = 0; i < q; i++) {
    const j = i + aleatorio(v.length - i)
    ;[v[i], v[j]] = [v[j]!, v[i]!]
  }
  return v.slice(0, q)
}
