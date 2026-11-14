/**
 * Vídeos e áudios de um .pptx, lidos direto do XML (o PowerPoint, pelo COM, não exporta mídia
 * embutida). Para cada slide, na ordem da apresentação: o arquivo (dentro do .pptx ou vinculado), a
 * posição no slide e como começa ("no clique" ou sozinho), conforme a linha do tempo de animação.
 *
 * O XML do Office é gerado por programa e bem comportado; aqui basta procurar as marcas certas.
 */
import { existsSync } from 'node:fs'
import { dirname, isAbsolute, join, posix } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface LeitorZip {
  tem(nome: string): boolean
  texto(nome: string): string
}

export interface MidiaEncontrada {
  /** índice do slide (0 = primeiro), na ordem da apresentação */
  slide: number
  tipo: 'video' | 'audio'
  /** nome que o PowerPoint guardou (em geral, o nome do arquivo original) */
  nome: string
  /** caminho dentro do .pptx (mídia embutida) */
  entrada: string | null
  /** arquivo fora do .pptx (mídia vinculada); null se não existir mais */
  externo: string | null
  inicio: 'sozinho' | 'clique'
  repetir: boolean
  continua: boolean
  x: number
  y: number
  l: number
  a: number
}

interface Relacao {
  tipo: string
  alvo: string
  externo: boolean
}

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

export function desfazerEntidades(t: string): string {
  return t.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_m, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
    return ENTIDADES[e.toLowerCase()] ?? _m
  })
}

/** Valor de um atributo dentro de uma marca (`<p:cNvPr id="4" name="Vídeo 3">`). */
export function atributo(marca: string, nome: string): string | null {
  const m = new RegExp(`\\s${nome.replace(':', '\\:')}="([^"]*)"`).exec(marca)
  return m ? desfazerEntidades(m[1]!) : null
}

/** Relações de uma parte do pacote (`ppt/slides/slide3.xml` → `ppt/slides/_rels/slide3.xml.rels`). */
function relacoes(zip: LeitorZip, parte: string): Map<string, Relacao> {
  const pasta = posix.dirname(parte)
  const arquivo = `${pasta}/_rels/${posix.basename(parte)}.rels`
  const r = new Map<string, Relacao>()
  if (!zip.tem(arquivo)) return r
  for (const m of zip.texto(arquivo).matchAll(/<Relationship\b[^>]*>/g)) {
    const marca = m[0]
    const id = atributo(marca, 'Id')
    const alvo = atributo(marca, 'Target')
    if (!id || alvo === null) continue
    const externo = atributo(marca, 'TargetMode') === 'External'
    r.set(id, {
      tipo: atributo(marca, 'Type') ?? '',
      externo,
      alvo: externo ? alvo : alvo.startsWith('/') ? alvo.slice(1) : posix.normalize(posix.join(pasta, alvo)),
    })
  }
  return r
}

/** Caminho no disco de uma mídia vinculada (o PowerPoint grava file:///…, caminho absoluto ou relativo ao .pptx). */
function caminhoExterno(alvo: string, pastaDoPptx: string | null): string | null {
  let c: string
  try {
    if (/^file:/i.test(alvo)) c = fileURLToPath(alvo.replace(/\\/g, '/'))
    else if (/^[a-z]+:\/\//i.test(alvo)) return null // endereço da internet: não toca no culto
    else if (isAbsolute(alvo)) c = alvo
    else if (pastaDoPptx) c = join(pastaDoPptx, alvo)
    else return null
  } catch {
    return null
  }
  return existsSync(c) ? c : null
}

/** Começo de uma mídia pela linha do tempo do slide: efeito "mediacall" que dá playFrom nela. */
function inicioDaMidia(xml: string, spid: string): 'sozinho' | 'clique' {
  const i = xml.indexOf('<p:timing')
  if (i < 0) return 'clique'
  const tempo = xml.slice(i)
  const efeitos = [...tempo.matchAll(/<p:cTn\b[^>]*presetClass="mediacall"[^>]*>/g)]
  const alvo = new RegExp(`<p:spTgt spid="${spid}"`)
  for (let k = 0; k < efeitos.length; k++) {
    const m = efeitos[k]!
    const fim = efeitos[k + 1]?.index ?? tempo.length
    const trecho = tempo.slice(m.index! + m[0].length, fim)
    if (!/cmd="playFrom/.test(trecho) || !alvo.test(trecho)) continue
    return atributo(m[0], 'nodeType') === 'clickEffect' ? 'clique' : 'sozinho'
  }
  // sem efeito na linha do tempo: no PowerPoint, só toca clicando no botão do vídeo
  return 'clique'
}

/** "Repetir até parar" e "tocar entre slides" ficam no nó de mídia da linha do tempo. */
function opcoesDaMidia(xml: string, spid: string): { repetir: boolean; continua: boolean } {
  const alvo = `<p:spTgt spid="${spid}"`
  for (const m of xml.matchAll(/<p:(video|audio)\b[^>]*>([\s\S]*?)<\/p:\1>/g)) {
    const corpo = m[2]!
    if (!corpo.includes(alvo)) continue
    const no = /<p:cMediaNode\b[^>]*>/.exec(corpo)?.[0] ?? ''
    const cTn = /<p:cTn\b[^>]*>/.exec(corpo)?.[0] ?? ''
    return { repetir: atributo(cTn, 'repeatCount') === 'indefinite', continua: atributo(no, 'numSld') !== null }
  }
  return { repetir: false, continua: false }
}

function numero(v: string | null): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Mídias de todos os slides. `pastaDoPptx` resolve mídias vinculadas por caminho relativo (a pasta
 * onde o arquivo original estava).
 */
export function midiasDoPptx(zip: LeitorZip, pastaDoPptx: string | null = null): MidiaEncontrada[] {
  const PRES = 'ppt/presentation.xml'
  if (!zip.tem(PRES)) throw new Error('O arquivo não é uma apresentação do PowerPoint.')
  const pres = zip.texto(PRES)
  const tam = /<p:sldSz\b[^>]*>/.exec(pres)?.[0] ?? ''
  const cx = numero(atributo(tam, 'cx')) || 12192000
  const cy = numero(atributo(tam, 'cy')) || 6858000
  const relPres = relacoes(zip, PRES)
  const lista = /<p:sldIdLst>([\s\S]*?)<\/p:sldIdLst>/.exec(pres)?.[1] ?? ''
  const rids = [...lista.matchAll(/<p:sldId\b[^>]*>/g)].map((m) => atributo(m[0], 'r:id'))

  const achadas: MidiaEncontrada[] = []
  rids.forEach((rid, slide) => {
    const parte = rid ? relPres.get(rid)?.alvo : undefined
    if (!parte || !zip.tem(parte)) return
    const xml = zip.texto(parte)
    if (!/<a:(videoFile|audioFile)\b/.test(xml)) return
    const rels = relacoes(zip, parte)
    for (const m of xml.matchAll(/<p:pic>([\s\S]*?)<\/p:pic>/g)) {
      const pic = m[1]!
      const arq = /<a:(videoFile|audioFile)\b[^>]*>/.exec(pic)
      if (!arq) continue
      const tipo = arq[1] === 'videoFile' ? 'video' : 'audio'
      const embutida = /<p14:media\b[^>]*>/.exec(pic)?.[0]
      const rid = (embutida && atributo(embutida, 'r:embed')) || atributo(arq[0], 'r:link') || atributo(arq[0], 'r:embed')
      const rel = rid ? rels.get(rid) : undefined
      if (!rel) continue
      const entrada = rel.externo ? null : zip.tem(rel.alvo) ? rel.alvo : null
      const externo = rel.externo ? caminhoExterno(rel.alvo, pastaDoPptx) : null
      if (!entrada && !externo) continue

      const cNvPr = /<p:cNvPr\b[^>]*>/.exec(pic)?.[0] ?? ''
      const spid = atributo(cNvPr, 'id') ?? ''
      const xfrm = /<a:xfrm\b[^>]*>([\s\S]*?)<\/a:xfrm>/.exec(pic)?.[1]
      let pos = { x: 0, y: 0, l: 1, a: 1 }
      if (xfrm) {
        const off = /<a:off\b[^>]*>/.exec(xfrm)?.[0] ?? ''
        const ext = /<a:ext\b[^>]*>/.exec(xfrm)?.[0] ?? ''
        const l = numero(atributo(ext, 'cx')) / cx
        const a = numero(atributo(ext, 'cy')) / cy
        if (l > 0 && a > 0) pos = { x: numero(atributo(off, 'x')) / cx, y: numero(atributo(off, 'y')) / cy, l, a }
      }
      const nomeOriginal = atributo(cNvPr, 'name') || posix.basename(rel.alvo)
      achadas.push({
        slide,
        tipo,
        nome: nomeOriginal,
        entrada,
        externo,
        inicio: inicioDaMidia(xml, spid),
        ...opcoesDaMidia(xml, spid),
        ...pos,
      })
    }
  })
  return achadas
}

/** Pasta do arquivo original (para mídias vinculadas por caminho relativo). */
export function pastaDe(caminho: string | null): string | null {
  return caminho ? dirname(caminho) : null
}
