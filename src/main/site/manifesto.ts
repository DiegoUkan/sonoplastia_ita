/**
 * Leitura do catálogo de mídias do site da igreja (`manifest.json`, schema_version 1). Só regras
 * puras, sem rede nem disco, para dar para testar.
 *
 * Contrato (resumo): raiz com `schema_version`, `generated_at`, `sabbath_date`,
 * `refresh_after_seconds`, `items[]` e `warnings[]`. Cada item: `id` estável, `category`
 * (automatico | fixo | enviado), `title`, `filename`, `mime_type`, `size_bytes`, `revision` (opaca,
 * comparar só por igualdade), `available`, `valid_for_sabbath`, `media_date`, `note`, `expires_at` e
 * `download_url`. O endereço tem uma chave de leitura: nunca vai para o log por inteiro.
 */
import { extname } from 'node:path'
import { z } from 'zod'
import type { CategoriaSite, DestinoSite } from '../../shared/site'
import { tipoDoArquivo } from '../biblioteca/midias'

export interface ItemManifesto {
  id: string
  categoria: CategoriaSite
  titulo: string
  arquivo: string | null
  mime: string | null
  bytes: number
  atualizadoEm: string | null
  revisao: string | null
  disponivel: boolean
  valido: boolean
  dataMidia: string | null
  nota: string
  expiraEm: string | null
  url: string | null
}

export interface Manifesto {
  geradoEm: string | null
  /** sábado de referência, 'AAAA-MM-DD' */
  sabado: string
  /** de quanto em quanto tempo ler de novo (segundos) */
  atualizarS: number
  itens: ItemManifesto[]
  /** avisos do site + itens que não deu para ler: com algum, nada é retirado da biblioteca */
  avisos: string[]
}

export type LeituraManifesto = { ok: true; manifesto: Manifesto } | { ok: false; erro: string; incompativel?: boolean }

const texto = (max: number) => z.string().max(max)
const opcional = (max: number) => z.string().max(max).nullable().catch(null)

const EsquemaItem = z.object({
  id: texto(200).min(1),
  category: z.enum(['automatico', 'fixo', 'enviado']),
  title: texto(500).catch(''),
  filename: opcional(500),
  mime_type: opcional(200),
  size_bytes: z.number().int().min(0).catch(0),
  updated_at: opcional(64),
  revision: opcional(200),
  available: z.boolean(),
  valid_for_sabbath: z.boolean(),
  media_date: opcional(32),
  note: opcional(2000),
  expires_at: opcional(64),
  download_url: opcional(4000),
})

const EsquemaRaiz = z.object({
  schema_version: z.number(),
  generated_at: opcional(64),
  sabbath_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  refresh_after_seconds: z.number().catch(300),
  items: z.array(z.unknown()),
  warnings: z.array(z.unknown()).catch([]),
})

export function lerManifesto(bruto: string): LeituraManifesto {
  let json: unknown
  try {
    json = JSON.parse(bruto)
  } catch {
    return { ok: false, erro: 'O site não devolveu o manifesto (veio outra coisa no lugar do JSON, talvez uma página de erro).' }
  }
  const versao = (json as { schema_version?: unknown } | null)?.schema_version
  if (versao !== 1) {
    return {
      ok: false,
      incompativel: true,
      erro: `O manifesto do site mudou de versão (${String(versao)}); este programa só lê a versão 1. A busca automática parou até o programa ser atualizado.`,
    }
  }
  const raiz = EsquemaRaiz.safeParse(json)
  if (!raiz.success) return { ok: false, erro: 'O manifesto do site veio num formato inesperado (falta o sábado de referência ou a lista de arquivos).' }
  const avisos = raiz.data.warnings.map((w) => (typeof w === 'string' ? w : JSON.stringify(w)).slice(0, 300))
  const itens: ItemManifesto[] = []
  const vistos = new Set<string>()
  for (const bruto of raiz.data.items) {
    const r = EsquemaItem.safeParse(bruto)
    if (!r.success) {
      const id = (bruto as { id?: unknown } | null)?.id
      avisos.push(`Um arquivo do site veio num formato inesperado e foi deixado de lado${typeof id === 'string' ? ` (${id.slice(0, 60)})` : ''}.`)
      continue
    }
    const i = r.data
    if (vistos.has(i.id)) {
      avisos.push(`O site listou duas vezes o mesmo arquivo (${i.id.slice(0, 60)}).`)
      continue
    }
    vistos.add(i.id)
    itens.push({
      id: i.id,
      categoria: i.category,
      titulo: i.title.trim() || i.filename || i.id,
      arquivo: i.filename,
      mime: i.mime_type,
      bytes: i.size_bytes,
      atualizadoEm: i.updated_at,
      revisao: i.revision,
      disponivel: i.available,
      valido: i.valid_for_sabbath,
      dataMidia: i.media_date && /^\d{4}-\d{2}-\d{2}$/.test(i.media_date) ? i.media_date : null,
      nota: i.note ?? '',
      expiraEm: i.expires_at,
      url: i.download_url,
    })
  }
  return {
    ok: true,
    manifesto: {
      geradoEm: raiz.data.generated_at,
      sabado: raiz.data.sabbath_date,
      atualizarS: Math.min(3600, Math.max(60, Math.round(raiz.data.refresh_after_seconds) || 300)),
      itens,
      avisos,
    },
  }
}

/**
 * Chave para saber se o arquivo mudou: a `revision` do site; se ela vier vazia, a data e o tamanho.
 * (A revisão é opaca: só se compara por igualdade.)
 */
export function chaveRevisao(i: Pick<ItemManifesto, 'revisao' | 'atualizadoEm' | 'bytes'>): string {
  return i.revisao ? `r:${i.revisao}` : `d:${i.atualizadoEm ?? ''}|${i.bytes}`
}

const EXTENSOES_MIME: Record<string, string> = {
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/wav': '.wav',
  'audio/ogg': '.ogg',
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'application/vnd.openxmlformats-officedocument.presentationml.slideshow': '.ppsx',
}

/**
 * Nome para gravar no disco: só o nome (nunca um caminho), sem caracteres que o Windows recusa, sem
 * nomes reservados, com tamanho limitado e com extensão (pelo tipo MIME, se o nome não tiver).
 */
export function nomeSeguro(nome: string | null, mime: string | null, reserva: string): string {
  let n = (nome ?? '').split(/[\\/]/).pop() ?? ''
  // eslint-disable-next-line no-control-regex
  n = n.replace(/[\u0000-\u001f<>:"|?*]/g, '_').replace(/^[.\s]+|[.\s]+$/g, '')
  if (/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(n)) n = `_${n}`
  if (!n) n = reserva.replace(/[^\w.-]/g, '_').slice(0, 80) || 'arquivo'
  if (!extname(n)) n += EXTENSOES_MIME[(mime ?? '').toLowerCase().split(';')[0]!.trim()] ?? ''
  if (n.length > 120) {
    const ext = extname(n).slice(0, 10)
    n = n.slice(0, 120 - ext.length).trimEnd() + ext
  }
  return n
}

/** Para onde o arquivo vai no programa (pela extensão do nome); null = tipo que o programa não usa. */
export function destinoDoArquivo(nome: string): DestinoSite | null {
  const ext = extname(nome).toLowerCase()
  if (ext === '.pptx' || ext === '.ppsx' || ext === '.pdf') return 'apresentacao'
  return tipoDoArquivo(nome)
}

/** O endereço do manifesto, se for válido (https; http só quando permitido, nos testes). */
export function enderecoValido(endereco: string, exigirHttps = true): URL | null {
  try {
    const u = new URL(endereco.trim())
    if (u.protocol === 'https:' || (!exigirHttps && u.protocol === 'http:')) return u
  } catch {
    // não é endereço
  }
  return null
}

/** O link de download é do mesmo site (mesmo protocolo, servidor e porta) que o manifesto. */
export function mesmaOrigem(url: string, manifesto: URL): boolean {
  try {
    return new URL(url).origin === manifesto.origin
  } catch {
    return false
  }
}

/** Esconde a chave de leitura (o pedaço longo e aleatório do caminho) para escrever no log. */
export function ocultarChave(texto: string): string {
  return texto.replace(/\/(?:[A-Fa-f0-9]{32,}|[A-Za-z0-9_-]{40,})(?=[/?#\s]|$)/g, '/…')
}
