import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { comandoRemoto, gerarPin, ServidorRemoto } from '../src/main/remoto/servidor'
import { conteudoDoVersiculo } from '../src/shared/biblia/mostrar'
import { configPadrao, EsquemaConfig } from '../src/shared/config'
import { urlMidia } from '../src/shared/midia'

describe('comandos vindos do celular', () => {
  it('aceita comandos conhecidos com arquivos do programa', () => {
    expect(comandoRemoto({ tipo: 'tela', alvo: 'todas', tela: 'preto' })).toMatchObject({ tipo: 'tela' })
    expect(comandoRemoto({ tipo: 'mostrar', alvo: 'todas', conteudo: { tipo: 'video', url: 'midia://local/x.mp4', nome: 'x', loop: false } })).toBeTruthy()
  })
  it('recusa tipo desconhecido e endereço fora do protocolo midia://', () => {
    expect(() => comandoRemoto({ tipo: 'apagar-tudo' })).toThrow(/não permitido/)
    expect(() => comandoRemoto(null)).toThrow()
    expect(() => comandoRemoto({ tipo: 'mostrar', alvo: 'todas', conteudo: { tipo: 'imagem', url: 'file:///C:/x.png', nome: 'x' } })).toThrow(/não permitido/)
    expect(() => comandoRemoto({ tipo: 'audio', fonte: { tipo: 'audio', url: 'https://x/y.mp3', nome: 'y', midiaId: 1 } })).toThrow()
  })
})

describe('configuração do remoto', () => {
  it('vem ligado, na porta 8090, pedindo PIN', () => {
    expect(configPadrao().remoto).toEqual({ ativo: true, porta: 8090, exigirPin: true, pin: '' })
  })
  it('PIN só com números', () => {
    expect(() => EsquemaConfig.parse({ remoto: { pin: '12a4' } })).toThrow()
    expect(gerarPin()).toMatch(/^\d{4}$/)
  })
})

describe('versículo para as saídas', () => {
  const cfg = configPadrao().biblia
  it('referência com a sigla e divisão dos longos', () => {
    const r = conteudoDoVersiculo({ livro: 43, capitulo: 3, versiculo: 16, texto: 'Porque Deus amou o mundo.', parte: 0, sigla: 'ARA', cfg })
    expect(r.conteudo).toEqual({ tipo: 'versiculo', texto: 'Porque Deus amou o mundo.', referencia: 'João 3:16 (ARA)', segundo: null })
    const longo = conteudoDoVersiculo({ livro: 43, capitulo: 3, versiculo: 16, texto: 'palavra '.repeat(120), parte: 99, sigla: 'ARA', cfg })
    expect(longo.partes).toBeGreaterThan(1)
    expect(longo.parte).toBe(longo.partes - 1)
    expect(longo.conteudo.referencia).toBe(`João 3:16 (${longo.partes}/${longo.partes}) (ARA)`)
  })
})

describe('servidor do controle remoto', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'sonoplastia-remoto-'))
  const paginas = join(pasta, 'renderer')
  const miniaturas = join(pasta, 'miniaturas')
  const chamadas: Array<[string, unknown[]]> = []
  const srv = new ServidorRemoto({
    pastaPaginas: paginas,
    pastasArquivos: () => [miniaturas],
    chamar: (metodo, args) => {
      chamadas.push([metodo, args])
      if (metodo === 'listarMusicas') return [{ id: 1, titulo: 'Fortes' }]
      throw new Error('falhou de propósito')
    },
    inicial: () => [['estado', { versao: 1 }]],
  })
  let base = ''
  let cookie = ''
  const post = (rota: string, corpo: unknown, comCookie = true) =>
    fetch(`${base}${rota}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(comCookie && cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(corpo) })

  beforeAll(async () => {
    mkdirSync(join(paginas, 'assets'), { recursive: true })
    mkdirSync(miniaturas, { recursive: true })
    writeFileSync(join(paginas, 'remoto.html'), '<!doctype html><title>remoto</title>')
    writeFileSync(join(paginas, 'assets', 'app.js'), 'console.log(1)')
    writeFileSync(join(paginas, 'comando.html'), 'não servir')
    writeFileSync(join(miniaturas, 'a.jpg'), 'jpg')
    writeFileSync(join(pasta, 'segredo.txt'), 'segredo')
    srv.aplicar({ ativo: true, porta: 8090, exigirPin: true, pin: '4321' }, 0)
    for (let i = 0; i < 50 && !srv.status().porta; i++) await new Promise((r) => setTimeout(r, 20))
    base = `http://127.0.0.1:${srv.status().porta}`
  })
  afterAll(() => {
    srv.encerrar()
    rmSync(pasta, { recursive: true, force: true })
  })

  it('serve a página e os assets, e nada mais', async () => {
    expect((await fetch(base)).status).toBe(200)
    expect(await (await fetch(`${base}/assets/app.js`)).text()).toBe('console.log(1)')
    expect((await fetch(`${base}/comando.html`)).status).toBe(404)
    expect((await fetch(`${base}/assets/..%2F..%2Fsegredo.txt`)).status).toBe(403)
  })

  it('pede o PIN e recusa o errado', async () => {
    expect(await (await fetch(`${base}/api/sessao`)).json()).toEqual({ precisaPin: true, autorizado: false })
    expect((await post('/api/chamar', { metodo: 'listarMusicas', args: [''] })).status).toBe(401)
    expect((await post('/api/entrar', { pin: '0000' })).status).toBe(401)
    const r = await post('/api/entrar', { pin: '4321' })
    expect(r.status).toBe(200)
    cookie = r.headers.get('set-cookie')!.split(';')[0]!
    expect(r.headers.get('set-cookie')).toMatch(/HttpOnly; SameSite=Strict/)
    expect(await (await fetch(`${base}/api/sessao`, { headers: { Cookie: cookie } })).json()).toEqual({ precisaPin: true, autorizado: true })
  })

  it('só chama métodos da lista e devolve o erro do programa', async () => {
    expect(await (await post('/api/chamar', { metodo: 'listarMusicas', args: ['for'] })).json()).toEqual({ ok: true, valor: [{ id: 1, titulo: 'Fortes' }] })
    expect(chamadas).toContainEqual(['listarMusicas', ['for']])
    const proibido = await post('/api/chamar', { metodo: 'apagarMidia', args: [1] })
    expect(proibido.status).toBe(400)
    expect(await (await post('/api/chamar', { metodo: 'comando', args: [{}] })).json()).toEqual({ ok: false, erro: 'falhou de propósito' })
    // corpo que não é JSON (formulário de outro site) é recusado
    const form = await fetch(`${base}/api/chamar`, { method: 'POST', headers: { 'Content-Type': 'text/plain', Cookie: cookie }, body: '{"metodo":"listarMusicas"}' })
    expect(form.status).toBe(400)
  })

  it('miniaturas só da pasta liberada', async () => {
    const ok = await fetch(`${base}/api/arquivo?u=${encodeURIComponent(urlMidia(join(miniaturas, 'a.jpg')))}`, { headers: { Cookie: cookie } })
    expect(ok.status).toBe(200)
    const fora = await fetch(`${base}/api/arquivo?u=${encodeURIComponent(urlMidia(join(pasta, 'segredo.txt')))}`, { headers: { Cookie: cookie } })
    expect(fora.status).toBe(403)
  })

  it('manda eventos e conta os conectados', async () => {
    const ctrl = new AbortController()
    const r = await fetch(`${base}/api/eventos`, { headers: { Cookie: cookie }, signal: ctrl.signal })
    expect(r.headers.get('content-type')).toMatch(/text\/event-stream/)
    const leitor = r.body!.getReader()
    let texto = ''
    while (!texto.includes('event: estado')) texto += new TextDecoder().decode((await leitor.read()).value)
    expect(srv.status().conectados).toBe(1)
    srv.transmitir('config', { tema: 'claro' })
    while (!texto.includes('event: config')) texto += new TextDecoder().decode((await leitor.read()).value)
    expect(texto).toContain('data: {"tema":"claro"}')
    ctrl.abort()
  })

  it('trocar o PIN derruba quem estava conectado', async () => {
    srv.aplicar({ ativo: true, porta: 8090, exigirPin: true, pin: '9999' }, 0)
    expect((await post('/api/chamar', { metodo: 'listarMusicas', args: [''] })).status).toBe(401)
  })

  it('sem PIN, entra direto', async () => {
    srv.aplicar({ ativo: true, porta: 8090, exigirPin: false, pin: '9999' }, 0)
    expect(srv.status().pin).toBeNull()
    expect((await post('/api/chamar', { metodo: 'listarMusicas', args: [''] }, false)).status).toBe(200)
  })
})
