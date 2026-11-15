/**
 * Autoteste (`electron . --autoteste`): roda uma sequência de comandos com as janelas OCULTAS e sem
 * som, captura cada janela em PNG e grava um relatório. Não mexe nos projetores: use junto com
 * SONOPLASTIA_DADOS apontando para uma pasta vazia (sem monitor escolhido, as saídas viram janelas
 * de teste, que aqui nem aparecem).
 * Saída em SONOPLASTIA_AUTOTESTE (padrão: <pasta de dados>\autoteste).
 */
import type { BrowserWindow } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Alvo, Comando, Telemetria, VersaoMusica } from '../shared/estado'
import type { BibliotecaApresentacoes } from './apresentacoes/biblioteca'
import { caminhoDaUrlMidia } from '../shared/midia'
import { dataDeHoje, type ItemLiturgia, novoId } from '../shared/liturgia'
import type { Banco } from './banco'
import type { ExecutorLiturgia } from './liturgia/executor'
import type { RepositorioLiturgias } from './liturgia/repositorio'
import type { RepositorioBiblia } from './biblia/repositorio'
import type { BibliotecaMidias } from './biblioteca/midias'
import type { ArmazemConfig } from './config'
import { log } from './log'
import type { Motor } from './motor'
import { importarLouvorJa } from './musicas/louvorJa'
import type { RepositorioMusicas } from './musicas/repositorio'
import type { ServidorRemoto } from './remoto/servidor'
import type { GerenciadorTelas } from './telas/gerenciador'
import type { MotorSugestoes } from './transcricao/motor'

interface Contexto {
  motor: Motor
  telas: GerenciadorTelas
  armazem: ArmazemConfig
  midias: BibliotecaMidias
  musicas: RepositorioMusicas
  biblia: RepositorioBiblia
  db: Banco
  comando: () => BrowserWindow | null
  telemetrias: Map<string, Telemetria>
  videoDeTeste: () => Promise<string>
  liberar: (caminho: string) => string
  /** o mesmo que o atalho de emergência faz */
  recolher: () => void
  abrirMusica: (id: number, versao: VersaoMusica, alvo: Alvo) => void
  apresentacoes: BibliotecaApresentacoes
  abrirApresentacao: (id: number, alvo: Alvo, indice?: number) => void
  remoto: ServidorRemoto
  liturgias: RepositorioLiturgias
  executorLiturgia: ExecutorLiturgia
  /** sugestões de versículos ao vivo (no autoteste, só falas simuladas: nada de microfone nem internet) */
  transcricao: MotorSugestoes
  pasta: string
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function rodarAutoteste(ctx: Contexto): Promise<void> {
  mkdirSync(ctx.pasta, { recursive: true })
  const relatorio: Record<string, unknown> = { inicio: new Date().toISOString(), capturas: [] as unknown[] }
  const capturas = relatorio.capturas as unknown[]
  // SONOPLASTIA_AUTOTESTE_PULAR=apresentacao,video pula esses passos
  const pular = (process.env.SONOPLASTIA_AUTOTESTE_PULAR ?? '').split(',').map((s) => s.trim())
  const passo = async <T>(nome: string, f: () => Promise<T> | T): Promise<T | undefined> => {
    if (pular.includes(nome)) {
      relatorio[`pulado:${nome}`] = true
      return undefined
    }
    try {
      return await f()
    } catch (e) {
      relatorio[`erro:${nome}`] = e instanceof Error ? (e.stack ?? e.message) : String(e)
      return undefined
    }
  }

  const capturar = async (nome: string, so?: 'comando') => {
    const alvos: Array<{ id: string; win: BrowserWindow }> = so ? [] : ctx.telas.janelasAbertas().map((j) => ({ id: j.saidaId, win: j.win }))
    const c = ctx.comando()
    if (c) alvos.push({ id: 'comando', win: c })
    for (const { id, win } of alvos) {
      // janela oculta só pinta quando alguém pede: a 1ª captura dispara a pintura e volta o quadro anterior
      await win.webContents.capturePage()
      await esperar(400)
      const img = await win.webContents.capturePage()
      writeFileSync(join(ctx.pasta, `${nome}-${id}.png`), img.toPNG())
      capturas.push({ nome, id, vazia: img.isEmpty(), tamanho: img.getSize() })
    }
  }
  const fazer = (c: Comando) => ctx.motor.executar(c)
  const noComando = (js: string) => ctx.comando()!.webContents.executeJavaScript(js)
  /** abre uma página da tela de comando e, se pedir, digita num campo e aperta Enter */
  const navegar = async (pagina: string, campo?: { seletor: string; texto: string; enter?: boolean }) => {
    await noComando(`document.querySelector('[data-pagina="${pagina}"]')?.click()`)
    await esperar(800)
    if (!campo) return
    await noComando(`(() => {
      const i = document.querySelector(${JSON.stringify(campo.seletor)})
      if (!i) return
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(campo.texto)})
      i.dispatchEvent(new Event('input', { bubbles: true }))
    })()`)
    await esperar(700)
    if (campo.enter) {
      await noComando(`document.querySelector(${JSON.stringify(campo.seletor)})?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`)
      await esperar(1200)
    }
  }

  await esperar(3000)
  relatorio.telas = ctx.telas.estado()

  await passo('padrao', async () => {
    fazer({ tipo: 'mostrar', alvo: 'todas', conteudo: { tipo: 'teste' } })
    await esperar(1500)
    await capturar('1-padrao-de-teste')
  })

  await passo('video', async () => {
    const video = await ctx.videoDeTeste()
    fazer({ tipo: 'mostrar', alvo: 'todas', conteudo: { tipo: 'video', url: ctx.liberar(video), nome: 'Vídeo de teste', loop: false } })
    await esperar(5000)
    relatorio.telemetriaVideo = Object.fromEntries(ctx.telemetrias)
    fazer({ tipo: 'buscar', alvo: 'publico', segundos: 30 })
    await esperar(1200)
    relatorio.posicaoDepoisDeBuscar30 = ctx.telemetrias.get('publico')?.video?.posicao
    // miniaturas ao vivo: o vídeo da miniatura tem que estar andando
    relatorio.miniaturas = await noComando(`(async () => {
      const vs = [...document.querySelectorAll('video[data-miniatura]')]
      const a = vs.map(v => ({ saida: v.dataset.miniatura, largura: v.videoWidth, altura: v.videoHeight, t: v.currentTime, pronto: v.readyState }))
      await new Promise(r => setTimeout(r, 1500))
      return a.map((x, i) => ({ ...x, andou: vs[i].currentTime > x.t }))
    })()`)
    await capturar('2-video')
    fazer({ tipo: 'midia', alvo: 'todas', acao: 'parar' })
  })

  await passo('biblia', async () => {
    const arq = join(homedir(), 'Documents', 'Projetos', 'Transcrição_tempo_real', 'data', 'biblia', 'ARA.json')
    if (!existsSync(arq)) {
      relatorio.biblia = 'ARA.json não encontrado; pulado'
      return
    }
    const t0 = Date.now()
    const n = await ctx.biblia.importar(readFileSync(arq, 'utf8'), 'ARA', '', () => {})
    const jo3 = ctx.biblia.capitulo('ARA', 43, 3)
    const busca = ctx.biblia.buscar('ARA', 'amou o mundo')
    relatorio.biblia = { versiculos: n, segundos: (Date.now() - t0) / 1000, jo316: jo3[15]?.texto, busca: busca.slice(0, 3) }
    // pela própria página: digita a referência e aperta Enter
    await navegar('biblia', { seletor: 'input[placeholder^="jo 3 16"]', texto: 'jo 3 16', enter: true })
    relatorio.bibliaNoAr = ctx.motor.estado.saidas.publico?.conteudo
    await capturar('3-biblia')
    // a tabela (livros, capítulos, versículos) com João 3 aberto e o 16 no ar
    await noComando(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Tabela')?.click()`)
    await esperar(800)
    await capturar('3b-biblia-tabela', 'comando')
  })

  // sugestões ao vivo com uma fala simulada (sem microfone, sem ElevenLabs e sem IA)
  await passo('sugestoes', async () => {
    if (!ctx.biblia.versoes().length) {
      relatorio.sugestoes = 'sem Bíblia importada; pulado'
      return
    }
    const t0 = Date.now()
    await ctx.transcricao.simular('Abram a Bíblia comigo em Filipenses capítulo 4, versículos 6 e 7. E guardem também o Salmo 23.')
    relatorio.sugestoes = { segundos: (Date.now() - t0) / 1000, sugestoes: ctx.transcricao.estado().sugestoes.map((s) => s.referencia) }
    await navegar('biblia')
    await noComando(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith('Sugestões'))?.click()`)
    await esperar(800)
    await capturar('3c-biblia-sugestoes', 'comando')
    // clicar na sugestão põe o primeiro versículo no ar
    await noComando(`[...document.querySelectorAll('aside button')].find((b) => b.textContent.includes('Filipenses 4:6-7'))?.click()`)
    await esperar(1500)
    relatorio.sugestaoNoAr = ctx.motor.estado.saidas.publico?.conteudo
    await capturar('3d-sugestao-no-ar')
  })

  await passo('musica', async () => {
    const pasta = ctx.armazem.obter().musicas.pastaLouvorJa
    if (!existsSync(join(pasta, 'database.db'))) {
      relatorio.musica = 'Louvor JA não encontrado; pulado'
      return
    }
    const t0 = Date.now()
    const r = await importarLouvorJa(ctx.db, ctx.musicas, pasta, [1, 2, 3], () => {})
    const lista = ctx.musicas.listar('sol jesus')
    const m = ctx.musicas.obter(lista[0]!.id)!
    await navegar('musicas', { seletor: 'input[placeholder^="Título"]', texto: 'sol jesus', enter: true })
    ctx.abrirMusica(m.id, 'cantado', 'todas')
    await esperar(1000)
    const indiceInicio = ctx.motor.estado.musica?.indice
    const primeiro = m.slides[0]?.msCantado ?? 0
    await esperar(Math.max(0, primeiro - 1000 + 2500))
    const e = ctx.motor.estado
    relatorio.musica = {
      importacao: r,
      segundos: (Date.now() - t0) / 1000,
      titulo: m.titulo,
      trechos: m.slides.length,
      primeiroTrechoMs: primeiro,
      indiceNoInicio: indiceInicio,
      indiceDepois: e.musica?.indice,
      conteudoPublico: e.saidas.publico?.conteudo,
      conteudoPalco: e.saidas.palco?.conteudo,
      audio: ctx.telemetrias.get('audio')?.video,
    }
    await capturar('4-musica')
    fazer({ tipo: 'musica:fechar' })
  })

  await passo('midias', async () => {
    const video = await ctx.videoDeTeste()
    const r = await ctx.midias.importar([video])
    const id = r.importadas[0] ?? r.repetidas[0]
    for (let i = 0; i < 40 && ctx.midias.obter(id!)?.situacao === 'analisando'; i++) await esperar(500)
    relatorio.midias = { importacao: r, midia: ctx.midias.obter(id!) }
  })

  await passo('pagina-midias', async () => {
    await noComando(`document.querySelector('[data-pagina="midias"]')?.click()`)
    await esperar(1200)
    await capturar('5-pagina-midias', 'comando')
  })

  await passo('apresentacao', async () => {
    // arquivos reais deste PC: um .pptx com vídeo e áudio embutidos (ou um simples) e um PDF
    // SONOPLASTIA_AUTOTESTE_PULAR=pptx: só o PDF (não abre o PowerPoint)
    const pptx = pular.includes('pptx')
      ? undefined
      : [
          join(homedir(), 'Desktop', 'materiais sonoplastia', 'Aventureiros', 'IDEAIS EQUIPE aventureiros - PP (1).pptx'),
          'C:\\Holyrics\\Holyrics\\files\\media\\file\\Meu_Lugar_No_Mundo.pptx',
        ].find((c) => existsSync(c))
    const pdf = ['C:\\Holyrics\\Holyrics\\files\\media\\file\\Mordomia.pdf'].find((c) => existsSync(c))
    const arquivos = [pptx, pdf].filter((c): c is string => !!c)
    if (!arquivos.length) {
      relatorio.apresentacao = 'nenhum .pptx/.pdf de teste encontrado; pulado'
      return
    }
    const t0 = Date.now()
    const r = await ctx.apresentacoes.importar(arquivos)
    const ids = [...r.importadas, ...r.repetidas]
    const convertendo = () => ids.some((id) => ['na-fila', 'convertendo'].includes(ctx.apresentacoes.obter(id)?.situacao ?? ''))
    for (let i = 0; i < 600 && convertendo(); i++) await esperar(500)
    const lista = ids.map((id) => ctx.apresentacoes.obter(id)!)
    relatorio.apresentacao = {
      segundos: (Date.now() - t0) / 1000,
      importacao: r,
      apresentacoes: lista.map((a) => ({
        id: a.id,
        nome: a.nome,
        tipo: a.tipo,
        situacao: a.situacao,
        detalhe: a.detalhe,
        total: a.total,
        tamanho: a.slides[0] ? `${a.slides[0].largura}x${a.slides[0].altura}` : null,
        ocultos: a.slides.filter((s) => s.oculto).length,
        comNotas: a.slides.filter((s) => s.notas).length,
        midias: a.slides.flatMap((s, i) => s.midias.map((m) => ({ slide: i + 1, tipo: m.tipo, inicio: m.inicio, continua: m.continua, nome: m.nome, x: m.x, y: m.y, l: m.l, a: m.a }))),
      })),
    }
    const p = lista.find((a) => a.tipo === 'pptx' && a.situacao === 'pronto') ?? lista.find((a) => a.situacao === 'pronto')
    if (!p) return
    await navegar('apresentacoes')
    ctx.abrirApresentacao(p.id, 'todas', 0)
    await esperar(1500)
    await capturar('7-apresentacao')
    fazer({ tipo: 'apresentacao:passo', passo: 1 })
    await esperar(800)
    relatorio.apresentacaoDepoisDoPasso = ctx.motor.estado.apresentacao?.indice
    // slide com vídeo: vai até ele e dá o clique que começa o vídeo (se for "no clique")
    const iv = p.slides.findIndex((s) => s.midias.some((m) => m.tipo === 'video'))
    if (iv >= 0) {
      fazer({ tipo: 'apresentacao:slide', indice: iv })
      await esperar(800)
      const antes = ctx.motor.estado.saidas.publico?.video.tocando
      fazer({ tipo: 'apresentacao:passo', passo: 1 })
      await esperar(3500)
      relatorio.apresentacaoVideo = {
        slide: iv + 1,
        tocandoAntesDoClique: antes,
        indiceDepoisDoClique: ctx.motor.estado.apresentacao?.indice,
        telemetria: ctx.telemetrias.get('publico')?.video,
      }
      await capturar('8-apresentacao-video')
    }
    const d = lista.find((a) => a.tipo === 'pdf' && a.situacao === 'pronto')
    if (d) {
      ctx.abrirApresentacao(d.id, 'todas', 1)
      await esperar(1500)
      await capturar('9-pdf')
      // último slide: o Palco avisa ("Último slide"), o Público não muda
      fazer({ tipo: 'apresentacao:slide', indice: d.total - 1 })
      await esperar(1200)
      relatorio.ultimoSlide = { indice: ctx.motor.estado.apresentacao?.indice, total: d.total }
      await capturar('9b-ultimo-slide')
    }
    fazer({ tipo: 'apresentacao:fechar' })
  })

  await passo('remoto', async () => {
    for (let i = 0; i < 40 && !ctx.remoto.status().porta; i++) await esperar(250)
    const status = ctx.remoto.status()
    if (!status.porta) throw new Error(`o servidor do controle remoto não ligou: ${status.erro}`)
    const base = `http://127.0.0.1:${status.porta}`
    const pin = ctx.armazem.obter().remoto.pin
    // pela API: sem PIN é recusado, PIN errado também; com o PIN certo entra
    const post = (rota: string, corpo: unknown, cookie = '') =>
      fetch(`${base}${rota}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(corpo) })
    const semPin = await post('/api/chamar', { metodo: 'listarMusicas', args: [''] })
    const errado = await post('/api/entrar', { pin: 'x' })
    const certo = await post('/api/entrar', { pin })
    const cookie = certo.headers.get('set-cookie')?.split(';')[0] ?? ''
    const chamar = (metodo: string, ...args: unknown[]) => post('/api/chamar', { metodo, args }, cookie).then((r) => r.json())
    relatorio.remoto = {
      status,
      pinGerado: /^\d{4}$/.test(pin),
      semPin: semPin.status,
      pinErrado: errado.status,
      pinCerto: certo.status,
      metodoProibido: await chamar('apagarMidia', 1),
      urlProibida: await chamar('comando', { tipo: 'mostrar', alvo: 'todas', conteudo: { tipo: 'imagem', url: 'file:///C:/Windows/win.ini', nome: 'x' } }),
      musicas: ((await chamar('listarMusicas', '')) as { valor?: unknown[] }).valor?.length,
      pagina: (await fetch(base)).status,
      foraDaPasta: (await fetch(`${base}/assets/..%2F..%2Fmain%2Findex.js`)).status,
    }

    // passador do celular → tela de comando (página Músicas) → próximo trecho
    const lista = ctx.musicas.listar('')
    if (lista[0]) {
      ctx.abrirMusica(lista[0].id, 'manual', 'todas')
      await navegar('musicas')
      const antes = ctx.motor.estado.musica?.indice
      await chamar('passador', 'proximo')
      await esperar(600)
      relatorio.remotoPassadorPc = { antes, depois: ctx.motor.estado.musica?.indice }
      fazer({ tipo: 'musica:fechar' })
    }

    // a página num "celular" (janela oculta de 390×844)
    const { BrowserWindow } = await import('electron')
    const cel = new BrowserWindow({ show: false, width: 390, height: 844, webPreferences: { sandbox: true, contextIsolation: true } })
    const js = (codigo: string) => cel.webContents.executeJavaScript(codigo)
    const clicar = (texto: string, exato = true) =>
      js(`(() => {
        const t = ${JSON.stringify(texto)}
        const b = [...document.querySelectorAll('button')].find((b) => (${exato} ? b.textContent.trim() === t : b.textContent.includes(t)) && b.offsetParent !== null)
        if (!b) return false
        b.click()
        return true
      })()`)
    const digitar = (seletor: string, texto: string) =>
      js(`(() => { const i = document.querySelector(${JSON.stringify(seletor)}); if (!i) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(texto)}); i.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
    const fotografar = async (nome: string) => {
      await cel.webContents.capturePage()
      await esperar(400)
      const img = await cel.webContents.capturePage()
      writeFileSync(join(ctx.pasta, `${nome}-celular.png`), img.toPNG())
      capturas.push({ nome, id: 'celular', vazia: img.isEmpty(), tamanho: img.getSize() })
    }
    try {
      await cel.loadURL(base)
      await esperar(1500)
      const etapas: Record<string, unknown> = {}
      etapas.telaPin = await digitar('input[aria-label="PIN"]', pin)
      await js(`document.querySelector('input[aria-label="PIN"]')?.form?.requestSubmit()`)
      await esperar(2500)
      await fotografar('r1-remoto')
      if (lista[0]) {
        etapas.abriuLista = await clicar(lista[0].titulo, false)
        await esperar(300)
        etapas.manual = await clicar('Só letra')
        await esperar(1500)
        etapas.musica = ctx.motor.estado.musica ? { titulo: ctx.motor.estado.musica.titulo, indice: ctx.motor.estado.musica.indice } : null
        await clicar('Próximo')
        await esperar(600)
        await clicar('Próximo')
        await esperar(600)
        etapas.indiceDepoisDeDoisProximos = ctx.motor.estado.musica?.indice
        await fotografar('r2-remoto-musica')
      }
      await clicar('Preto')
      await esperar(500)
      etapas.telasDepoisDoPreto = Object.values(ctx.motor.estado.saidas).map((s) => s.tela)
      await fotografar('r3-remoto-preto')
      await clicar('Preto')
      await esperar(300)
      fazer({ tipo: 'musica:fechar' })
      if (ctx.biblia.versoes().length) {
        await clicar('Bíblia')
        await esperar(800)
        etapas.digitouBiblia = await digitar('input[placeholder^="jo 3 16"]', 'jo 3 16')
        await clicar('Mostrar')
        await esperar(1500)
        etapas.versiculo = ctx.motor.estado.saidas.publico?.conteudo
        await clicar('Próximo')
        await esperar(1000)
        etapas.versiculoDepoisDoProximo = ctx.motor.estado.saidas.publico?.conteudo
        await fotografar('r4-remoto-biblia')
      }
      await clicar('Mídias')
      await esperar(1500)
      await fotografar('r5-remoto-midias')
      relatorio.remotoPagina = { ...etapas, conectados: ctx.remoto.status().conectados }
    } finally {
      cel.destroy()
    }
  })

  await passo('liturgia', async () => {
    // culto de hoje a partir do modelo; 1ª seção com fundo (a miniatura de um vídeo), um texto,
    // um versículo (se a ARA foi importada) e o vídeo de teste com "passar sozinho"
    const modelo = ctx.liturgias.listar().find((l) => l.modelo)
    if (!modelo) {
      relatorio.liturgia = 'sem modelo; pulado'
      return
    }
    const id = ctx.liturgias.copiar(modelo.id, { modelo: false, data: dataDeHoje() })
    const l = ctx.liturgias.obter(id)!
    const video = ctx.midias.listar({ tipo: 'video' })[0]
    const comum = { titulo: '', alvo: '', ativo: true, duracaoMin: 5, observacao: '', avancar: false, luzInicio: '', luzFim: '' }
    const texto: ItemLiturgia = { ...comum, id: novoId(), tipo: 'texto', texto: 'Bem-vindos ao culto' }
    const verso: ItemLiturgia = { ...comum, id: novoId(), tipo: 'biblia', referencia: 'jo 3 16', sigla: '' }
    const itensVideo: ItemLiturgia[] = video ? [{ ...comum, id: novoId(), tipo: 'midia', midiaId: video.id, midiaTipo: 'video', titulo: video.nome, avancar: true }] : []
    const [s1, s2, ...resto] = l.secoes
    ctx.liturgias.salvar(id, {
      ...l,
      secoes: [
        { ...s1!, fundo: video?.miniaturaUrl ? caminhoDaUrlMidia(video.miniaturaUrl) : null, itens: [texto, verso] },
        { ...s2!, itens: itensVideo },
        ...resto,
      ],
    })
    await navegar('liturgia')
    ctx.executorLiturgia.executar(id, texto.id, 'todas')
    await esperar(1200)
    await capturar('L1-liturgia-texto')
    const r: Record<string, unknown> = { estadoTexto: ctx.motor.estado.liturgia, fundoPublico: ctx.motor.estado.saidas.publico?.fundo }
    try {
      ctx.executorLiturgia.vizinho(id, 1)
      ctx.executorLiturgia.passo(1)
      await esperar(1000)
      r.versiculo = ctx.motor.estado.saidas.publico?.conteudo
      await capturar('L2-liturgia-versiculo')
    } catch (e) {
      r.versiculo = String(e)
    }
    // painel "Adicionar" aberto na 1ª seção
    await noComando(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Adicionar')?.click()`)
    await esperar(900)
    await capturar('L3-liturgia-adicionar', 'comando')
    relatorio.liturgia = r
    ctx.executorLiturgia.fechar()
  })

  await passo('ferramentas', async () => {
    // relógio no Palco (padrão), temporizador no canto do Palco, QR no canto do Público, mensagem no Palco
    const r: Record<string, unknown> = {}
    fazer({ tipo: 'mostrar', alvo: 'todas', conteudo: { tipo: 'texto', texto: 'Porque Deus amou o mundo de tal maneira' } })
    fazer({ tipo: 'temporizador:definir', modo: 'regressivo', minutos: 40, titulo: 'Sermão' })
    fazer({ tipo: 'temporizador:acao', acao: 'iniciar' })
    fazer({ tipo: 'ferramenta:mostrar', ferramenta: 'temporizador', alvo: 'palco', modo: 'canto' })
    fazer({ tipo: 'qr:definir', link: 'https://www.adventistas.org', texto: 'Site da igreja' })
    fazer({ tipo: 'ferramenta:mostrar', ferramenta: 'qr', alvo: 'publico', modo: 'canto' })
    fazer({ tipo: 'mensagem:definir', texto: 'Faltam 5 minutos' })
    fazer({ tipo: 'ferramenta:mostrar', ferramenta: 'mensagem', alvo: 'palco', modo: 'canto' })
    await navegar('ferramentas')
    await esperar(1200)
    await capturar('F1-ferramentas-canto')
    // sorteio em tela cheia no Público (sem animação, para a captura mostrar o resultado)
    fazer({ tipo: 'ferramenta:mostrar', ferramenta: 'sorteio', alvo: 'publico', modo: 'tela' })
    fazer({ tipo: 'sorteio:sortear', lista: ['Ana Paula', 'Bruno', 'Carla', 'Davi'], quantidade: 1, semRepetir: true, duracaoMs: 0, titulo: 'Sorteio do brinde' })
    // temporizador em tela cheia no Palco
    fazer({ tipo: 'ferramenta:mostrar', ferramenta: 'temporizador', alvo: 'palco', modo: 'tela' })
    fazer({ tipo: 'ferramenta:mostrar', ferramenta: 'mensagem', alvo: 'palco', modo: null })
    await esperar(1200)
    await capturar('F2-sorteio-e-temporizador')
    r.sorteio = ctx.motor.estado.ferramentas.sorteio.resultado
    // tamanho do relógio no canto do Palco (a pílula com só a hora)
    const relogioDoPalco = () =>
      ctx.telas
        .janelasAbertas()
        .find((j) => j.saidaId === 'palco')
        ?.win.webContents.executeJavaScript(
          `[...document.querySelectorAll('div')].filter((d) => /^\\d{2}:\\d{2}$/.test(d.textContent.trim()) && d.style.fontSize.endsWith('cqh')).map((d) => d.style.fontSize)`,
        )
    r.relogioTextoCurto = await relogioDoPalco()
    // abrir outra coisa com as ferramentas em tela cheia: o sorteio sai do Público, o temporizador do
    // Palco vai para o canto; o versículo comprido chega no relógio do Palco, que diminui
    fazer({
      tipo: 'mostrar',
      alvo: 'todas',
      conteudo: {
        tipo: 'versiculo',
        texto:
          'Porque Deus amou o mundo de tal maneira que deu o seu Filho unigênito, para que todo aquele que nele crê não pereça, mas tenha a vida eterna. Porquanto Deus enviou o seu Filho ao mundo, não para que julgasse o mundo, mas para que o mundo fosse salvo por ele.',
        referencia: 'João 3:16-17 ARA',
        segundo: null,
      },
    })
    await esperar(1200)
    await capturar('F2b-ferramentas-dao-lugar')
    r.depoisDeAbrir = structuredClone(ctx.motor.estado.ferramentas.exibicao)
    r.relogioTextoGrande = await relogioDoPalco()
    for (const f of ['temporizador', 'qr', 'mensagem', 'sorteio'] as const) fazer({ tipo: 'ferramenta:mostrar', ferramenta: f, alvo: 'todas', modo: null })

    // música só com a letra: o painel grande dos trechos na tela de comando
    ctx.motor.abrirMusica({
      musicaId: 999_999,
      titulo: 'Música de teste (só a letra)',
      album: '',
      versao: 'manual',
      slides: [
        { texto: 'Primeiro trecho da letra\ncom duas linhas', ms: 0 },
        { texto: 'Segundo trecho', ms: 0 },
        { texto: 'Terceiro trecho', ms: 0 },
      ],
      alvo: 'todas',
      fundoUrl: null,
      audioUrl: null,
      tituloNaIntroducao: true,
    })
    fazer({ tipo: 'musica:slide', indice: 0, origem: 'operador' })
    await esperar(900)
    await capturar('F3-letra-manual', 'comando')
    // a seta da tela de comando passa o trecho, em qualquer página
    await noComando(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))`)
    await esperar(500)
    r.trechoDepoisDaSeta = ctx.motor.estado.musica?.indice
    fazer({ tipo: 'musica:fechar' })

    // música "escolher na hora" da liturgia: a pergunta na tela de comando
    const modelo = ctx.liturgias.listar().find((l) => l.modelo)
    if (modelo) {
      const id = ctx.liturgias.copiar(modelo.id, { modelo: false, data: null, nome: 'Teste das ferramentas' })
      const l = ctx.liturgias.obter(id)!
      const musica = ctx.musicas.listar('')[0]
      const comum = { alvo: '', ativo: true, duracaoMin: null, observacao: '', avancar: false, luzInicio: '', luzFim: '' }
      const itens: ItemLiturgia[] = [
        { ...comum, id: novoId(), tipo: 'musica', musicaId: musica?.id ?? 999_999, versao: 'perguntar', titulo: musica?.titulo ?? 'Música' },
        { ...comum, id: novoId(), tipo: 'temporizador', titulo: 'O culto começa em', temporizadorModo: 'regressivo', minutos: 5, ate: '', iniciar: true, modo: 'tela', manter: false },
      ]
      const [s1, ...resto] = l.secoes
      ctx.liturgias.salvar(id, { ...l, secoes: [{ ...s1!, itens }, ...resto] })
      await navegar('liturgia')
      ctx.executorLiturgia.executar(id, itens[0]!.id, 'todas')
      await esperar(1000)
      await capturar('F4-escolher-versao', 'comando')
      r.escolher = ctx.motor.estado.liturgia?.escolherVersao ?? null
      ctx.executorLiturgia.executar(id, itens[1]!.id, 'todas')
      await esperar(1000)
      await capturar('F5-temporizador-da-liturgia')
      ctx.executorLiturgia.fechar()
      fazer({ tipo: 'ferramenta:mostrar', ferramenta: 'temporizador', alvo: 'todas', modo: null })
    }

    // painel das luzes (só lê o estado das luzes; no autoteste nada é mandado para elas)
    await noComando(`[...document.querySelectorAll('footer button')].find((b) => b.textContent.trim() === 'Luzes')?.click()`)
    await esperar(2500)
    await capturar('F6-luzes', 'comando')
    await noComando(`document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`)
    relatorio.ferramentas = r
  })

  await passo('painel-recolhido', async () => {
    const c = ctx.armazem.obter()
    ctx.armazem.salvar({ ...c, interface: { ...c.interface, painelRecolhido: true } })
    await esperar(1200)
    await capturar('6-painel-recolhido', 'comando')
    ctx.armazem.salvar({ ...ctx.armazem.obter(), interface: { painelRecolhido: false } })
  })

  await passo('emergencia', async () => {
    ctx.recolher()
    await esperar(500)
    relatorio.janelasAposEmergencia = ctx.telas.janelasAbertas().length
    ctx.telas.reabrir()
    await esperar(2000)
    relatorio.janelasAposReabrir = ctx.telas.janelasAbertas().length
  })

  relatorio.estadoFinal = ctx.motor.estado
  relatorio.fim = new Date().toISOString()
  writeFileSync(join(ctx.pasta, 'relatorio.json'), JSON.stringify(relatorio, null, 2), 'utf8')
  log.info('Autoteste concluído em', ctx.pasta)
}
