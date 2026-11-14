/**
 * Liturgia: o roteiro de um culto, dividido em SEÇÕES (Escola Sabatina, Louvor, Momento Infantil,
 * Mensagem…). Cada seção pode ter uma imagem de fundo: enquanto um item dela está no ar, versículos,
 * textos (e, se pedir, as músicas) ficam com esse fundo. Os itens apontam para o que já está na
 * biblioteca (música, mídia, apresentação) ou trazem o próprio conteúdo (referência bíblica, texto).
 *
 * O documento inteiro (seções + itens) é guardado como JSON, validado por `EsquemaDocumentoLiturgia`.
 */
import { z } from 'zod'
import { formatarReferencia, interpretarReferencia } from './biblia/referencia'

export const TIPOS_ITEM = ['musica', 'midia', 'apresentacao', 'biblia', 'texto', 'tela', 'temporizador', 'qr', 'sorteio'] as const
export type TipoItemLiturgia = (typeof TIPOS_ITEM)[number]

const base = {
  id: z.string().min(1).max(40),
  titulo: z.string().max(300).default(''),
  /** saída: '' = a do "Enviar para" da tela de comando; senão o id da saída ou 'todas' */
  alvo: z.string().max(40).default(''),
  ativo: z.boolean().default(true),
  /** duração prevista, para calcular o horário de cada item */
  duracaoMin: z.number().min(0).max(600).nullable().default(null),
  observacao: z.string().max(2000).default(''),
  /** quando o vídeo, o áudio ou a música termina, passa sozinho para o próximo item */
  avancar: z.boolean().default(false),
  /** cenário das luzes (luz.local) quando o item entra no ar; '' = não mexe */
  luzInicio: z.string().max(100).default(''),
  /** cenário das luzes quando a liturgia sai deste item; '' = não mexe */
  luzFim: z.string().max(100).default(''),
}

/** Itens de ferramenta (temporizador, QR, sorteio): no canto ou em tela cheia; saem no próximo item, se não pedir para manter. */
const baseFerramenta = {
  modo: z.enum(['canto', 'tela']).default('tela'),
  /** continua na tela depois deste item (até desligar na página Ferramentas) */
  manter: z.boolean().default(false),
}

export const EsquemaItemLiturgia = z.discriminatedUnion('tipo', [
  /** versao 'perguntar' = o operador escolhe (cantado, playback ou só a letra) na hora de pôr no ar */
  z.object({ ...base, tipo: z.literal('musica'), musicaId: z.number().int(), versao: z.enum(['cantado', 'playback', 'manual', 'perguntar']).default('cantado') }),
  z.object({ ...base, tipo: z.literal('midia'), midiaId: z.number().int(), midiaTipo: z.enum(['video', 'imagem', 'audio']) }),
  z.object({ ...base, tipo: z.literal('apresentacao'), apresentacaoId: z.number().int() }),
  /** referência como o operador digitou ("jo 3 16-18"); `sigla` vazia = versão padrão */
  z.object({ ...base, tipo: z.literal('biblia'), referencia: z.string().min(1).max(100), sigla: z.string().max(12).default('') }),
  z.object({ ...base, tipo: z.literal('texto'), texto: z.string().max(4000) }),
  z.object({ ...base, tipo: z.literal('tela'), tela: z.enum(['preto', 'logo']) }),
  z.object({
    ...base,
    ...baseFerramenta,
    tipo: z.literal('temporizador'),
    temporizadorModo: z.enum(['regressivo', 'horario', 'progressivo']).default('regressivo'),
    minutos: z.number().min(0).max(1440).default(5),
    /** 'HH:MM', no modo 'horario' */
    ate: z.string().max(5).default(''),
    /** começa a contar quando o item entra no ar (regressivo e cronômetro) */
    iniciar: z.boolean().default(true),
  }),
  z.object({ ...base, ...baseFerramenta, tipo: z.literal('qr'), link: z.string().max(2000), legenda: z.string().max(300).default('') }),
  /** sorteio: o passador (próximo) sorteia; uma pessoa por linha */
  z.object({
    ...base,
    ...baseFerramenta,
    tipo: z.literal('sorteio'),
    lista: z.string().max(200_000).default(''),
    quantidade: z.number().int().min(1).max(100).default(1),
    semRepetir: z.boolean().default(true),
  }),
])
export type ItemLiturgia = z.infer<typeof EsquemaItemLiturgia>

export const EsquemaSecaoLiturgia = z.object({
  id: z.string().min(1).max(40),
  nome: z.string().max(120).default('Seção'),
  /** caminho da imagem de fundo da seção (null = fundo padrão das configurações) */
  fundo: z.string().max(1000).nullable().default(null),
  /** o fundo da seção também fica atrás das músicas (no lugar da imagem da música) */
  fundoNasMusicas: z.boolean().default(true),
  itens: z.array(EsquemaItemLiturgia).max(300).default([]),
})
export type SecaoLiturgia = z.infer<typeof EsquemaSecaoLiturgia>

export const EsquemaDocumentoLiturgia = z.object({
  secoes: z.array(EsquemaSecaoLiturgia).max(60).default([]),
})
export type DocumentoLiturgia = z.infer<typeof EsquemaDocumentoLiturgia>

export interface Liturgia extends DocumentoLiturgia {
  id: number
  nome: string
  /** 'AAAA-MM-DD' (modelos não têm data) */
  data: string | null
  /** horário de início, 'HH:MM' */
  inicio: string | null
  modelo: boolean
  atualizadoEm: string
}

export interface ResumoLiturgia {
  id: number
  nome: string
  data: string | null
  inicio: string | null
  modelo: boolean
  secoes: number
  itens: number
  atualizadoEm: string
}

/** O que muda numa liturgia ao salvar (o resto vem do banco). */
export type AlteracaoLiturgia = Pick<Liturgia, 'nome' | 'data' | 'inicio' | 'secoes'>

export const SECOES_PADRAO = ['Escola Sabatina', 'Louvor', 'Momento Infantil', 'Mensagem'] as const

let contador = 0
/** Id curto e único o bastante para itens e seções. */
export function novoId(): string {
  contador = (contador + 1) % 1296
  return Date.now().toString(36) + contador.toString(36).padStart(2, '0') + Math.random().toString(36).slice(2, 6)
}

export function secaoNova(nome: string): SecaoLiturgia {
  return { id: novoId(), nome, fundo: null, fundoNasMusicas: true, itens: [] }
}

/** Cópia com ids novos (para "novo culto a partir do modelo" e "duplicar"). */
export function copiarSecoes(secoes: SecaoLiturgia[]): SecaoLiturgia[] {
  return secoes.map((s) => ({ ...structuredClone(s), id: novoId(), itens: s.itens.map((i) => ({ ...structuredClone(i), id: novoId() })) }))
}

export interface PosicaoItem {
  secao: SecaoLiturgia
  item: ItemLiturgia
  /** posição na lista inteira (todas as seções, em ordem) */
  ordem: number
}

export function itensEmOrdem(secoes: SecaoLiturgia[]): PosicaoItem[] {
  const r: PosicaoItem[] = []
  for (const secao of secoes) for (const item of secao.itens) r.push({ secao, item, ordem: r.length })
  return r
}

export function acharItem(secoes: SecaoLiturgia[], itemId: string): PosicaoItem | null {
  return itensEmOrdem(secoes).find((p) => p.item.id === itemId) ?? null
}

/** O que está no ar: um item, ou só a abertura de uma seção (itemId null). */
export interface NoArLiturgia {
  itemId: string | null
  secaoId: string
}

/**
 * Item ativo vizinho do que está no ar, na direção `passo` (pula os desligados). Sem nada no ar, o
 * "próximo" é o primeiro. Depois da abertura de uma seção, o "próximo" é o 1º item dela e o
 * "anterior", o último antes dela. Null quando não há mais.
 */
export function vizinhoDoNoAr(secoes: SecaoLiturgia[], noAr: NoArLiturgia | null, passo: 1 | -1): PosicaoItem | null {
  const lista = itensEmOrdem(secoes)
  let i = -1
  const abertura = !!noAr && !noAr.itemId
  if (noAr?.itemId) i = lista.findIndex((p) => p.item.id === noAr.itemId)
  else if (noAr) {
    const s = secoes.findIndex((x) => x.id === noAr.secaoId)
    const antes = s < 0 ? 0 : secoes.slice(0, s).reduce((t, x) => t + x.itens.length, 0)
    i = passo === 1 ? antes - 1 : antes
  }
  if (i < 0 && passo === -1 && !abertura) return null
  for (let k = i + passo; k >= 0 && k < lista.length; k += passo) if (lista[k]!.item.ativo) return lista[k]!
  return null
}

/**
 * Move o item para a seção `secaoId`, na posição `indice` da lista dela (contada ANTES de tirar o
 * item do lugar, como a linha de "soltar aqui" mostra). Devolve as seções novas (não mexe nas antigas).
 */
export function moverItem(secoes: SecaoLiturgia[], itemId: string, secaoId: string, indice: number): SecaoLiturgia[] {
  const origem = secoes.find((s) => s.itens.some((i) => i.id === itemId))
  const destino = secoes.find((s) => s.id === secaoId)
  if (!origem || !destino) return secoes
  const de = origem.itens.findIndex((i) => i.id === itemId)
  const item = origem.itens[de]!
  let para = Math.max(0, Math.min(indice, destino.itens.length))
  if (origem === destino && de < para) para -= 1
  return secoes.map((s) => {
    let itens = s.itens
    if (s === origem) itens = itens.filter((i) => i.id !== itemId)
    if (s === destino) itens = [...itens.slice(0, para), item, ...itens.slice(para)]
    return itens === s.itens ? s : { ...s, itens }
  })
}

/** 'HH:MM' → minutos desde a meia-noite (null se inválido). */
export function minutosDe(hhmm: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? '')
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  return h < 24 && min < 60 ? h * 60 + min : null
}

export function formatarHora(minutos: number): string {
  const t = ((Math.round(minutos) % 1440) + 1440) % 1440
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

/**
 * Horário previsto de cada item e de cada seção (minutos desde a meia-noite), somando as durações
 * dos itens ativos a partir do início do culto. Vazio se o culto não tem horário de início.
 */
export function horariosPrevistos(secoes: SecaoLiturgia[], inicio: string | null): { itens: Map<string, number>; secoes: Map<string, number>; fim: number | null } {
  const itens = new Map<string, number>()
  const porSecao = new Map<string, number>()
  let t = minutosDe(inicio)
  if (t === null) return { itens, secoes: porSecao, fim: null }
  for (const s of secoes) {
    porSecao.set(s.id, t)
    for (const i of s.itens) {
      itens.set(i.id, t)
      if (i.ativo) t += i.duracaoMin ?? 0
    }
  }
  return { itens, secoes: porSecao, fim: t }
}

/** Título que aparece na lista quando o item não tem um próprio. */
export function tituloDoItem(i: ItemLiturgia): string {
  if (i.titulo.trim()) return i.titulo.trim()
  switch (i.tipo) {
    case 'biblia': {
      const r = interpretarReferencia(i.referencia)
      return r.tipo === 'referencia' && r.ref.capitulo !== null ? formatarReferencia(r.ref.livro, r.ref.capitulo, r.ref.inicio, r.ref.fim) : i.referencia
    }
    case 'texto':
      return i.texto.split('\n')[0]?.slice(0, 80) || 'Texto'
    case 'tela':
      return i.tela === 'preto' ? 'Tela preta' : 'Logo (tela de espera)'
    case 'musica':
      return 'Música'
    case 'midia':
      return i.midiaTipo === 'video' ? 'Vídeo' : i.midiaTipo === 'imagem' ? 'Imagem' : 'Áudio'
    case 'apresentacao':
      return 'Apresentação'
    case 'temporizador':
      if (i.temporizadorModo === 'horario') return i.ate ? `Contagem até as ${i.ate}` : 'Contagem até um horário'
      if (i.temporizadorModo === 'progressivo') return 'Cronômetro'
      return `Temporizador de ${String(i.minutos).replace('.', ',')} min`
    case 'qr':
      return i.legenda.trim() || i.link.replace(/^https?:\/\//, '') || 'QR code'
    case 'sorteio':
      return 'Sorteio'
  }
}

/** Itens que são ferramentas (aparecem por cima do conteúdo, no canto ou em tela cheia). */
export function ehFerramenta(i: ItemLiturgia): i is Extract<ItemLiturgia, { tipo: 'temporizador' | 'qr' | 'sorteio' }> {
  return i.tipo === 'temporizador' || i.tipo === 'qr' || i.tipo === 'sorteio'
}

/** Só estes tipos terminam sozinhos (e podem passar para o próximo item no fim). */
export function podeAvancarSozinho(i: ItemLiturgia): boolean {
  if (i.tipo === 'musica') return i.versao !== 'manual'
  if (i.tipo === 'temporizador') return i.temporizadorModo !== 'progressivo'
  return i.tipo === 'midia' && i.midiaTipo !== 'imagem'
}

/** Próximo sábado (ou hoje, se for sábado), 'AAAA-MM-DD' no horário local. */
export function proximoSabado(hoje = new Date()): string {
  const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function dataDeHoje(hoje = new Date()): string {
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`
}

/** '2026-11-14' → '14/11' (com o ano se for outro). */
export function formatarData(data: string | null, hoje = new Date()): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data ?? '')
  if (!m) return ''
  return Number(m[1]) === hoje.getFullYear() ? `${m[3]}/${m[2]}` : `${m[3]}/${m[2]}/${m[1]}`
}
