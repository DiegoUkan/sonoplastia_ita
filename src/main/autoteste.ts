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
import type { Banco } from './banco'
import type { RepositorioBiblia } from './biblia/repositorio'
import type { BibliotecaMidias } from './biblioteca/midias'
import type { ArmazemConfig } from './config'
import { log } from './log'
import type { Motor } from './motor'
import { importarLouvorJa } from './musicas/louvorJa'
import type { RepositorioMusicas } from './musicas/repositorio'
import type { GerenciadorTelas } from './telas/gerenciador'

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
  pasta: string
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function rodarAutoteste(ctx: Contexto): Promise<void> {
  mkdirSync(ctx.pasta, { recursive: true })
  const relatorio: Record<string, unknown> = { inicio: new Date().toISOString(), capturas: [] as unknown[] }
  const capturas = relatorio.capturas as unknown[]
  const passo = async <T>(nome: string, f: () => Promise<T> | T): Promise<T | undefined> => {
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
