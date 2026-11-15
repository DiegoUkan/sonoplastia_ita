/**
 * Arquivos do site da igreja (manifest.json): leitura do manifesto, download com retomada e a
 * sincronização com a biblioteca, contra um site de mentira (servidor local, chave falsa).
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { urlMidia } from '../src/shared/midia'
import { abrirBanco, type Banco } from '../src/main/banco'
import { BibliotecaMidias } from '../src/main/biblioteca/midias'
import type { Sonda } from '../src/main/biblioteca/sonda'
import { Motor } from '../src/main/motor'
import { baixarArquivo } from '../src/main/site/baixar'
import { chaveRevisao, destinoDoArquivo, enderecoValido, lerManifesto, mesmaOrigem, nomeSeguro, ocultarChave } from '../src/main/site/manifesto'
import { type EmUso, emUsoNoMotor, normalizar, SincronizadorSite } from '../src/main/site/sincronizador'

const CHAVE = 'ab12'.repeat(16) // 64 caracteres, como a chave de verdade (esta é falsa)
const SABADO = '2026-11-14'
const SEXTA = new Date(2026, 10, 13, 12, 0, 0)

// ----------------------------------------------------------------- manifesto

function manifestoBase(itens: unknown[], extra: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    generated_at: '2026-11-13T12:00:00-03:00',
    timezone: 'America/Sao_Paulo',
    sabbath_date: SABADO,
    refresh_after_seconds: 300,
    items: itens,
    warnings: [],
    ...extra,
  }
}

const itemBruto = (x: Record<string, unknown>) => ({
  id: 'automatico-provai',
  category: 'automatico',
  title: 'Provai e Vede',
  filename: 'provai-e-vede-2026-11-14.mp4',
  mime_type: 'video/mp4',
  size_bytes: 10,
  updated_at: '2026-11-13T08:00:00-03:00',
  revision: 'r1',
  available: true,
  valid_for_sabbath: true,
  media_date: SABADO,
  note: 'Confirmado para este sábado.',
  expires_at: null,
  download_url: `https://site.exemplo/midias/${CHAVE}/arquivo/automatico-provai`,
  ...x,
})

describe('manifesto', () => {
  it('lê os itens e o sábado de referência', () => {
    const r = lerManifesto(JSON.stringify(manifestoBase([itemBruto({}), itemBruto({ id: 'automatico-saude', valid_for_sabbath: false, media_date: '2026-08-29' })])))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.manifesto.sabado).toBe(SABADO)
    expect(r.manifesto.atualizarS).toBe(300)
    expect(r.manifesto.itens.map((i) => [i.id, i.valido])).toEqual([
      ['automatico-provai', true],
      ['automatico-saude', false],
    ])
    expect(r.manifesto.avisos).toEqual([])
  })

  it('para com outra versão do manifesto e não aceita página de erro', () => {
    const v2 = lerManifesto(JSON.stringify({ ...manifestoBase([]), schema_version: 2 }))
    expect(v2).toMatchObject({ ok: false, incompativel: true })
    expect(lerManifesto('<html>Erro 502</html>')).toMatchObject({ ok: false })
    expect(lerManifesto(JSON.stringify({ schema_version: 1, items: [] }))).toMatchObject({ ok: false })
  })

  it('item estranho fica de fora e vira aviso (que impede limpezas)', () => {
    const r = lerManifesto(JSON.stringify(manifestoBase([itemBruto({}), { id: 'quebrado', category: 'outra' }, itemBruto({})])))
    if (!r.ok) throw new Error('devia ler')
    expect(r.manifesto.itens).toHaveLength(1)
    expect(r.manifesto.avisos).toHaveLength(2)
  })

  it('revisão: compara por igualdade; sem revisão, usa data e tamanho', () => {
    expect(chaveRevisao({ revisao: 'abc', atualizadoEm: null, bytes: 1 })).toBe('r:abc')
    expect(chaveRevisao({ revisao: null, atualizadoEm: '2026-11-13', bytes: 5 })).toBe('d:2026-11-13|5')
  })

  it('nome do arquivo: só o nome, sem caracteres proibidos', () => {
    expect(nomeSeguro('..\\..\\Windows\\video.mp4', null, 'x')).toBe('video.mp4')
    expect(nomeSeguro('../../etc/passwd.mp4', null, 'x')).toBe('passwd.mp4')
    expect(nomeSeguro('con.mp4', null, 'x')).toBe('_con.mp4')
    expect(nomeSeguro('a:b?.png', null, 'x')).toBe('a_b_.png')
    expect(nomeSeguro(null, 'video/mp4', 'automatico-avisos')).toBe('automatico-avisos.mp4')
    expect(nomeSeguro('   ', 'image/png; q=1', 'fixo')).toBe('fixo.png')
    expect(nomeSeguro(`${'a'.repeat(300)}.mp4`, null, 'x')).toHaveLength(120)
  })

  it('destino de cada tipo de arquivo', () => {
    expect(destinoDoArquivo('x.MP4')).toBe('video')
    expect(destinoDoArquivo('x.gif')).toBe('imagem')
    expect(destinoDoArquivo('x.mp3')).toBe('audio')
    expect(destinoDoArquivo('sermao.docx.pdf')).toBe('apresentacao')
    expect(destinoDoArquivo('x.pptx')).toBe('apresentacao')
    expect(destinoDoArquivo('x.docx')).toBeNull()
  })

  it('chave escondida no log; só https; downloads só do mesmo site', () => {
    const url = `https://site.exemplo/midias/${CHAVE}/manifest.json`
    expect(ocultarChave(`falhou ${url}`)).toBe('falhou https://site.exemplo/midias/…/manifest.json')
    expect(ocultarChave('/arquivo/enviado-20261114-f22d1f8d7bd1a556e1bf')).toBe('/arquivo/enviado-20261114-f22d1f8d7bd1a556e1bf')
    expect(enderecoValido(url)).not.toBeNull()
    expect(enderecoValido('http://site.exemplo/m.json')).toBeNull()
    expect(enderecoValido('isto não é endereço')).toBeNull()
    const base = new URL(url)
    expect(mesmaOrigem(`https://site.exemplo/midias/${CHAVE}/arquivo/x`, base)).toBe(true)
    expect(mesmaOrigem('https://outro.exemplo/x', base)).toBe(false)
    expect(mesmaOrigem('http://site.exemplo/x', base)).toBe(false)
  })
})

// ----------------------------------------------------------------- site de mentira

interface ArquivoFalso {
  conteudo: Buffer
  mime: string
  etag: string
}

class SiteFalso {
  arquivos = new Map<string, ArquivoFalso>()
  manifesto: Record<string, unknown> = manifestoBase([])
  /** o que foi pedido: "id" ou "id bytes=N-" */
  pedidos: string[] = []
  manifestos = 0
  /** manda só estes bytes e derruba a conexão (uma vez) */
  cortarEm: number | null = null
  private servidor: Server | null = null
  porta = 0

  async ligar(): Promise<void> {
    this.servidor = createServer((req, res) => this.atender(req, res))
    await new Promise<void>((r) => this.servidor!.listen(0, '127.0.0.1', r))
    this.porta = (this.servidor.address() as AddressInfo).port
  }

  desligar(): Promise<void> {
    return new Promise((r) => this.servidor?.close(() => r()))
  }

  get base(): string {
    return `http://127.0.0.1:${this.porta}/midias/${CHAVE}`
  }

  publicar(id: string, conteudo: string | Buffer, revisao: string, mime = 'video/mp4'): void {
    this.arquivos.set(id, { conteudo: Buffer.isBuffer(conteudo) ? conteudo : Buffer.from(conteudo), mime, etag: `"${revisao}"` })
  }

  /** item do manifesto para um arquivo publicado */
  item(id: string, categoria: string, x: Record<string, unknown> = {}): Record<string, unknown> {
    const a = this.arquivos.get(id)
    return {
      id,
      category: categoria,
      title: id,
      filename: `${id}.mp4`,
      mime_type: a?.mime ?? 'video/mp4',
      size_bytes: a?.conteudo.length ?? 0,
      updated_at: '2026-11-13T08:00:00-03:00',
      revision: a?.etag.replace(/"/g, '') ?? null,
      available: !!a,
      valid_for_sabbath: true,
      media_date: categoria === 'fixo' ? null : SABADO,
      note: '',
      expires_at: null,
      download_url: a ? `${this.base}/arquivo/${id}` : null,
      ...x,
    }
  }

  private atender(req: IncomingMessage, res: ServerResponse): void {
    const caminho = new URL(req.url ?? '/', 'http://x').pathname
    if (caminho === `/midias/${CHAVE}/manifest.json`) {
      this.manifestos++
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(this.manifesto))
      return
    }
    const m = /^\/midias\/([^/]+)\/arquivo\/(.+)$/.exec(caminho)
    const a = m && m[1] === CHAVE ? this.arquivos.get(decodeURIComponent(m[2]!)) : undefined
    if (!m || !a) {
      res.writeHead(404, { 'content-type': 'text/html' })
      res.end('<h1>404</h1>')
      return
    }
    this.pedidos.push(`${m[2]}${req.headers.range ? ` ${req.headers.range}` : ''}`)
    const pedido = /^bytes=(\d+)-$/.exec(req.headers.range ?? '')
    const inicio = pedido && req.headers['if-range'] === a.etag ? Number(pedido[1]) : 0
    const corpo = a.conteudo.subarray(inicio)
    const cab = { 'content-type': a.mime, etag: a.etag, 'content-length': String(corpo.length), 'accept-ranges': 'bytes' }
    res.writeHead(inicio > 0 ? 206 : 200, inicio > 0 ? { ...cab, 'content-range': `bytes ${inicio}-${a.conteudo.length - 1}/${a.conteudo.length}` } : cab)
    if (this.cortarEm !== null) {
      res.write(corpo.subarray(0, this.cortarEm))
      this.cortarEm = null
      setTimeout(() => res.destroy(), 30)
      return
    }
    res.end(corpo)
  }
}

const site = new SiteFalso()
beforeAll(() => site.ligar())
afterAll(() => site.desligar())

const espera = (ms = 30) => new Promise((r) => setTimeout(r, ms))

describe('download', () => {
  let pasta: string
  beforeEach(() => {
    pasta = mkdtempSync(join(tmpdir(), 'sonoplastia-site-'))
    site.pedidos = []
  })
  afterEach(() => rmSync(pasta, { recursive: true, force: true }))

  it('continua de onde parou quando a conexão cai', async () => {
    const conteudo = Buffer.alloc(200_000, 7)
    conteudo.write('fim do arquivo', 199_000)
    site.publicar('grande', conteudo, 'v1')
    const parcial = join(pasta, 'grande.part')
    site.cortarEm = 50_000
    await expect(baixarArquivo({ buscar: fetch, url: `${site.base}/arquivo/grande`, parcial, tamanho: conteudo.length })).rejects.toThrow(/parou no meio/)
    const metade = statSync(parcial).size
    expect(metade).toBeGreaterThan(0)
    expect(metade).toBeLessThan(conteudo.length)
    await baixarArquivo({ buscar: fetch, url: `${site.base}/arquivo/grande`, parcial, tamanho: conteudo.length })
    expect(readFileSync(parcial).equals(conteudo)).toBe(true)
    expect(site.pedidos).toEqual(['grande', `grande bytes=${metade}-`])
  })

  it('tamanho diferente do anunciado: descarta', async () => {
    site.publicar('curto', 'abc', 'v1')
    const parcial = join(pasta, 'curto.part')
    await expect(baixarArquivo({ buscar: fetch, url: `${site.base}/arquivo/curto`, parcial, tamanho: 99 })).rejects.toThrow(/99/)
    expect(existsSync(parcial)).toBe(false)
  })

  it('404 não vira arquivo', async () => {
    await expect(baixarArquivo({ buscar: fetch, url: `${site.base}/arquivo/nao-existe`, parcial: join(pasta, 'x.part'), tamanho: 0 })).rejects.toThrow(/não está mais no site/)
  })
})

// ----------------------------------------------------------------- sincronização

interface Montagem {
  db: Banco
  pasta: string
  midias: BibliotecaMidias
  sinc: SincronizadorSite
  uso: EmUso
  agora: { valor: Date }
  apresentacoesApagadas: number[]
  endereco: { valor: string }
}

function montar(): Montagem {
  const pasta = mkdtempSync(join(tmpdir(), 'sonoplastia-sinc-'))
  const db = abrirBanco(join(pasta, 'teste.db'))
  const sonda = { analisar: async () => ({ id: 0, ok: true, duracao: 5, largura: 640, altura: 360 }) } as unknown as Sonda
  const midias = new BibliotecaMidias(db, { base: join(pasta, 'midias'), miniaturas: join(pasta, 'miniaturas') }, sonda, null)
  const uso: EmUso = { arquivos: new Set(), apresentacoes: new Set() }
  const agora = { valor: SEXTA }
  const endereco = { valor: `${site.base}/manifest.json` }
  const apresentacoesApagadas: number[] = []
  const sinc = new SincronizadorSite({
    db,
    buscar: fetch,
    pasta: join(pasta, 'baixando'),
    midias,
    // apresentações de mentira: só registra no banco (sem PowerPoint)
    apresentacoes: {
      importar: async (caminhos) => {
        const c = caminhos[0]!
        const r = db
          .prepare("insert into apresentacoes (tipo, nome, arquivo, bytes, situacao, criado_em) values ('pdf', ?, ?, ?, 'pronto', '')")
          .run(c.split(/[\\/]/).pop()!, c, statSync(c).size)
        return { importadas: [Number(r.lastInsertRowid)], repetidas: [], ignoradas: [] }
      },
      apagar: (id) => apresentacoesApagadas.push(id),
    },
    endereco: () => endereco.valor,
    ativo: () => true,
    emUso: () => uso,
    agora: () => agora.valor,
    exigirHttps: false,
  })
  midias.fonteSite = () => sinc.infosDasMidias()
  return { db, pasta, midias, sinc, uso, agora, apresentacoesApagadas, endereco }
}

async function desmontar(m: Montagem): Promise<void> {
  m.sinc.parar()
  await espera()
  m.db.close()
  rmSync(m.pasta, { recursive: true, force: true })
}

const item = (m: Montagem, id: string) => m.sinc.estado().itens.find((i) => i.id === id)!
const conteudoDe = (m: Montagem, midiaId: number) => readFileSync(m.midias.obter(midiaId)!.arquivo, 'utf8')

describe('sincronização com o site', () => {
  let m: Montagem
  beforeEach(() => {
    site.arquivos.clear()
    site.pedidos = []
    site.manifestos = 0
    site.publicar('automatico-provai', 'provai semana 1', 'p1')
    site.publicar('automatico-saude', 'saude de agosto', 's1')
    site.publicar('fixo-site-igreja', 'arte do site', 'f1', 'image/png')
    site.publicar('enviado-foto', 'foto do sabado', 'e1', 'image/jpeg')
    site.publicar('enviado-doc', 'documento word', 'd1', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    site.publicar('enviado-pdf', '%PDF-1.4 sermao', 'x1', 'application/pdf')
    site.manifesto = manifestoBase([
      site.item('automatico-provai', 'automatico', { title: 'Provai e Vede', filename: 'provai-e-vede-2026-11-14.mp4' }),
      site.item('automatico-saude', 'automatico', { title: 'Momento Vida e Saúde', valid_for_sabbath: false, media_date: '2026-08-29', note: 'Arquivo anterior.' }),
      site.item('fixo-site-igreja', 'fixo', { title: 'Site da igreja', filename: 'arte-site.png' }),
      site.item('enviado-foto', 'enviado', { title: 'foto.jpg', filename: 'foto.jpg', expires_at: '2026-11-22T00:00:00-03:00' }),
      site.item('enviado-doc', 'enviado', { title: 'ata.docx', filename: 'ata.docx' }),
      site.item('enviado-pdf', 'enviado', { title: 'sermao.pdf', filename: 'sermao.pdf' }),
    ])
    m = montar()
  })
  afterEach(() => desmontar(m))

  const midiaDo = (id: string) => item(m, id).midiaId!

  it('baixa o que é deste sábado e deixa o resto de fora', async () => {
    await m.sinc.atualizarAgora()
    const e = m.sinc.estado()
    expect(e.erro).toBeNull()
    expect(e.sabado).toBe(SABADO)
    expect(Object.fromEntries(e.itens.map((i) => [i.id, i.situacao]))).toEqual({
      'automatico-provai': 'pronto',
      'automatico-saude': 'fora-do-sabado',
      'fixo-site-igreja': 'pronto',
      'enviado-foto': 'pronto',
      'enviado-doc': 'ignorado',
      'enviado-pdf': 'pronto',
    })
    expect(site.pedidos.sort()).toEqual(['automatico-provai', 'enviado-foto', 'enviado-pdf', 'fixo-site-igreja'])
    expect(e.novos).toBe(4)
    expect(item(m, 'enviado-pdf').apresentacaoId).not.toBeNull()

    const lista = m.midias.listar({})
    expect(lista.map((x) => x.nome).sort()).toEqual(['Provai e Vede', 'Site da igreja', 'foto'])
    const provai = lista.find((x) => x.nome === 'Provai e Vede')!
    expect(provai.site).toMatchObject({ categoria: 'automatico', novo: true, atual: true, aviso: null, dataLocal: SABADO })
    expect(conteudoDe(m, provai.id)).toBe('provai semana 1')
    // nada fica pela metade na pasta de downloads
    expect(readdirSync(join(m.pasta, 'baixando'))).toEqual([])
  })

  it('sem mudança no site, não baixa de novo', async () => {
    await m.sinc.atualizarAgora()
    const antes = site.pedidos.length
    await m.sinc.atualizarAgora()
    expect(site.manifestos).toBe(2)
    expect(site.pedidos.length).toBe(antes)
  })

  it('versão nova da série troca o arquivo e mantém a mesma mídia (a liturgia usa a nova)', async () => {
    await m.sinc.atualizarAgora()
    const id = midiaDo('automatico-provai')
    const antigo = m.midias.obter(id)!.arquivo
    m.sinc.marcarVistos()
    site.publicar('automatico-provai', 'provai versão corrigida', 'p2')
    site.manifesto = { ...site.manifesto, items: (site.manifesto.items as Array<Record<string, unknown>>).map((i) => (i.id === 'automatico-provai' ? site.item('automatico-provai', 'automatico', { title: 'Provai e Vede', filename: 'provai-e-vede-2026-11-14-v2.mp4' }) : i)) }
    await m.sinc.atualizarAgora()
    expect(midiaDo('automatico-provai')).toBe(id)
    expect(conteudoDe(m, id)).toBe('provai versão corrigida')
    expect(existsSync(antigo)).toBe(false)
    expect(item(m, 'automatico-provai')).toMatchObject({ situacao: 'pronto', novo: true })
    expect(m.midias.listar({}).filter((x) => x.nome === 'Provai e Vede')).toHaveLength(1)
  })

  it('com a série no ar, a troca espera ela sair', async () => {
    await m.sinc.atualizarAgora()
    const id = midiaDo('automatico-provai')
    m.uso.arquivos.add(normalizar(m.midias.obter(id)!.arquivo))
    site.publicar('automatico-provai', 'provai nova', 'p3')
    site.manifesto = { ...site.manifesto, items: (site.manifesto.items as Array<Record<string, unknown>>).map((i) => (i.id === 'automatico-provai' ? site.item('automatico-provai', 'automatico', { title: 'Provai e Vede' }) : i)) }
    await m.sinc.atualizarAgora()
    expect(item(m, 'automatico-provai').situacao).toBe('esperando')
    expect(conteudoDe(m, id)).toBe('provai semana 1')
    m.uso.arquivos.clear()
    await m.sinc.atualizarAgora()
    expect(item(m, 'automatico-provai').situacao).toBe('pronto')
    expect(conteudoDe(m, id)).toBe('provai nova')
  })

  it('o que o operador tirou da biblioteca não volta (a versão nova da série volta)', async () => {
    await m.sinc.atualizarAgora()
    const foto = midiaDo('enviado-foto')
    const provai = midiaDo('automatico-provai')
    m.midias.excluir(foto)
    m.midias.excluir(provai)
    site.pedidos = []
    await m.sinc.atualizarAgora()
    expect(site.pedidos).toEqual([])
    expect(item(m, 'enviado-foto').situacao).toBe('deletado')
    expect(item(m, 'automatico-provai').situacao).toBe('deletado')
    expect(m.sinc.estado().novos).toBe(2) // o fixo e o PDF

    site.publicar('automatico-provai', 'provai da semana seguinte', 'p4')
    site.manifesto = { ...site.manifesto, items: (site.manifesto.items as Array<Record<string, unknown>>).map((i) => (i.id === 'automatico-provai' ? site.item('automatico-provai', 'automatico', { title: 'Provai e Vede' }) : i)) }
    await m.sinc.atualizarAgora()
    const volta = m.midias.obter(provai)!
    expect(volta.excluida).toBe(false)
    expect(conteudoDe(m, provai)).toBe('provai da semana seguinte')
    expect(m.midias.obter(foto)!.excluida).toBe(true)
  })

  it('envio vencido vai para a lixeira, mas não quando o site avisa de falha', async () => {
    await m.sinc.atualizarAgora()
    const foto = midiaDo('enviado-foto')
    m.agora.valor = new Date(2026, 10, 23, 10, 0, 0)
    site.manifesto = { ...site.manifesto, warnings: ['Não foi possível ler a pasta de envios.'] }
    await m.sinc.atualizarAgora()
    expect(m.midias.obter(foto)!.excluida).toBe(false)
    expect(m.sinc.estado().avisos).toEqual(['Não foi possível ler a pasta de envios.'])

    site.manifesto = { ...site.manifesto, warnings: [] }
    await m.sinc.atualizarAgora()
    expect(m.midias.obter(foto)!.excluida).toBe(true)
    expect(item(m, 'enviado-foto').situacao).toBe('expirado')
    // o que o programa mandou para a lixeira também não volta
    await m.sinc.atualizarAgora()
    expect(m.midias.obter(foto)!.excluida).toBe(true)
  })

  it('envio que sumiu do site também sai (a mídia no ar fica)', async () => {
    await m.sinc.atualizarAgora()
    const foto = midiaDo('enviado-foto')
    m.uso.arquivos.add(normalizar(m.midias.obter(foto)!.arquivo))
    site.manifesto = { ...site.manifesto, items: (site.manifesto.items as Array<Record<string, unknown>>).filter((i) => i.id !== 'enviado-foto') }
    await m.sinc.atualizarAgora()
    expect(m.midias.obter(foto)!.excluida).toBe(false)
    m.uso.arquivos.clear()
    await m.sinc.atualizarAgora()
    expect(m.midias.obter(foto)!.excluida).toBe(true)
  })

  it('série de outra semana: aviso para a liturgia e para o cartão', async () => {
    await m.sinc.atualizarAgora()
    const provai = midiaDo('automatico-provai')
    expect(m.sinc.avisoDaMidia(provai)).toBeNull()
    // semana seguinte, e o site ainda não tem o novo
    m.agora.valor = new Date(2026, 10, 20, 9, 0, 0)
    site.manifesto = {
      ...site.manifesto,
      sabbath_date: '2026-11-21',
      items: (site.manifesto.items as Array<Record<string, unknown>>).map((i) =>
        i.id === 'automatico-provai' ? { ...i, valid_for_sabbath: false, note: 'Arquivo anterior de 2026-11-14.' } : i,
      ),
    }
    await m.sinc.atualizarAgora()
    expect(m.sinc.avisoDaMidia(provai)).toMatch(/Provai e Vede deste sábado ainda não chegou do site \(o arquivo daqui é de 14\/11\)/)
    expect(m.midias.obter(provai)!.site).toMatchObject({ atual: false })
    expect(item(m, 'automatico-provai').situacao).toBe('desatualizado')
    // fixos e envios não bloqueiam a liturgia
    expect(m.sinc.avisoDaMidia(midiaDo('fixo-site-igreja'))).toBeNull()
    expect(m.sinc.avisoDaMidia(midiaDo('enviado-foto'))).toBeNull()
  })

  it('o arquivo chega diferente do anunciado: erro, e nada entra na biblioteca', async () => {
    site.manifesto = manifestoBase([site.item('automatico-provai', 'automatico', { size_bytes: 9999 })])
    await m.sinc.atualizarAgora()
    expect(item(m, 'automatico-provai')).toMatchObject({ situacao: 'erro', midiaId: null })
    expect(m.midias.listar({})).toHaveLength(0)
  })

  it('link de download para outro site é recusado', async () => {
    site.manifesto = manifestoBase([site.item('automatico-provai', 'automatico', { download_url: `http://localhost:${site.porta}/midias/${CHAVE}/arquivo/automatico-provai` })])
    await m.sinc.atualizarAgora()
    expect(item(m, 'automatico-provai').situacao).toBe('erro')
    expect(item(m, 'automatico-provai').detalhe).toMatch(/fora do site/)
    expect(site.pedidos).toEqual([])
  })

  it('manifesto de outra versão: avisa e não mexe em nada', async () => {
    site.manifesto = { ...manifestoBase([]), schema_version: 2 }
    await m.sinc.atualizarAgora()
    expect(m.sinc.estado().erro).toMatch(/versão/)
    expect(m.midias.listar({})).toHaveLength(0)
  })

  it('chave trocada (404 no manifesto): explica o que fazer, sem mostrar a chave', async () => {
    m.endereco.valor = `${site.base.replace(CHAVE, 'cd34'.repeat(16))}/manifest.json`
    await m.sinc.atualizarAgora()
    expect(m.sinc.estado().erro).toMatch(/recusou o endereço/)
    expect(m.sinc.estado().erro).not.toContain('cd34cd34')
  })

  it('sem endereço não faz nada', async () => {
    m.endereco.valor = ''
    await m.sinc.atualizarAgora()
    expect(site.manifestos).toBe(0)
    expect(m.sinc.estado()).toMatchObject({ configurado: false, erro: null, ultimaVerificacao: null })
  })

  it('ir ao ar tira o "novo"', async () => {
    await m.sinc.atualizarAgora()
    const foto = m.midias.obter(midiaDo('enviado-foto'))!
    m.sinc.vistoPorArquivo(foto.arquivo)
    expect(item(m, 'enviado-foto').novo).toBe(false)
    expect(m.sinc.estado().novos).toBe(3)
  })
})

describe('o que está no ar', () => {
  it('vídeos e imagens nas saídas, a trilha de áudio e a apresentação', () => {
    const motor = new Motor(['publico'])
    const video = join(tmpdir(), 'Provai.mp4')
    motor.executar({ tipo: 'mostrar', alvo: 'publico', conteudo: { tipo: 'video', url: urlMidia(video), nome: 'Provai', loop: false } })
    motor.executar({ tipo: 'audio', fonte: { tipo: 'audio', url: urlMidia(join(tmpdir(), 'fundo.mp3')), nome: 'fundo', midiaId: 3 } })
    const uso = emUsoNoMotor(motor.estado)
    expect(uso.arquivos.has(normalizar(video))).toBe(true)
    expect(uso.arquivos.has(normalizar(join(tmpdir(), 'FUNDO.mp3')))).toBe(true)
    expect(uso.apresentacoes.size).toBe(0)
  })
})
