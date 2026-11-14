import {
  app,
  BrowserWindow,
  type BrowserWindowConstructorOptions,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeTheme,
  net,
  shell,
  type WebPreferences,
} from 'electron'
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { ATALHO_EMERGENCIA } from '../shared/atalhos'
import type { Config } from '../shared/config'
import type { FiltroMidias, Progresso, SlideMusicaDados } from '../shared/dados'
import type { Alvo, Comando, Fundo, Telemetria, VersaoMusica } from '../shared/estado'
import type { AlteracaoLiturgia } from '../shared/liturgia'
import { CANAIS,type ResultadoSonda, type TipoArquivo } from '../shared/ipc'
import { enderecoDaLuz } from '../shared/iluminacao'
import { temposDaVersao } from '../shared/musica'
import { BibliotecaApresentacoes } from './apresentacoes/biblioteca'
import { criarConversor } from './apresentacoes/conversao'
import { rodarAutoteste } from './autoteste'
import { abrirBanco } from './banco'
import { RepositorioBiblia } from './biblia/repositorio'
import { BibliotecaMidias, nomeLivre } from './biblioteca/midias'
import { Sonda } from './biblioteca/sonda'
import { caminhos, garantirPastas } from './caminhos'
import { ArmazemConfig } from './config'
import { acharFfmpeg, garantirVideoDeTeste } from './ffmpeg'
import { ClienteIluminacao } from './iluminacao'
import { iniciarLog, log } from './log'
import { liberarArquivo, permitirPasta, registrarEsquemaPrivilegiado, tratarProtocoloMidia } from './midia'
import { Motor } from './motor'
import { importarLouvorJa } from './musicas/louvorJa'
import { ExecutorLiturgia } from './liturgia/executor'
import { RepositorioLiturgias } from './liturgia/repositorio'
import { RepositorioMusicas } from './musicas/repositorio'
import { ligarControleRemoto } from './remoto/ligar'
import { GerenciadorTelas } from './telas/gerenciador'

const AUTOTESTE = process.argv.includes('--autoteste')
const DEV = !app.isPackaged && !!process.env.ELECTRON_RENDERER_URL

if (AUTOTESTE) app.commandLine.appendSwitch('mute-audio')
registrarEsquemaPrivilegiado()

let janelaComando: BrowserWindow | null = null
let janelaAudio: BrowserWindow | null = null
let executorLiturgia: ExecutorLiturgia | null = null
let encerrando = false

if (!AUTOTESTE && !app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => trazerComando())
  app.whenReady().then(iniciar).catch((e) => {
    log.erro('Falha ao iniciar:', e)
    dialog.showErrorBox('Sonoplastia', `O programa não conseguiu iniciar.\n\n${e instanceof Error ? e.message : e}`)
    app.exit(1)
  })
}

type Pagina = 'comando' | 'saida' | 'audio' | 'sonda'

function preferenciasWeb(): WebPreferences {
  return {
    preload: join(__dirname, '../preload/index.js'),
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    backgroundThrottling: false,
    autoplayPolicy: 'no-user-gesture-required',
    spellcheck: false,
  }
}

function carregarPagina(win: BrowserWindow, pagina: Pagina, query: Record<string, string> = {}): void {
  if (DEV) {
    const q = new URLSearchParams(query).toString()
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/${pagina}.html${q ? '?' + q : ''}`)
  } else {
    win.loadFile(join(__dirname, `../renderer/${pagina}.html`), { query })
  }
}

/** Nenhuma janela navega para fora nem abre pop-up (inclusive ao soltar um arquivo nela). */
function protegerNavegacao(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) e.preventDefault()
  })
}

function atalhosDeDesenvolvimento(win: BrowserWindow): void {
  if (app.isPackaged) return
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return
    if (input.key === 'F12' && !input.control && !input.shift) {
      win.webContents.toggleDevTools()
      e.preventDefault()
    } else if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) {
      win.webContents.reload()
      e.preventDefault()
    }
  })
}

function transmitir(canal: string, dado?: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(canal, dado)
}

function trazerComando(): void {
  const w = janelaComando
  if (!w || w.isDestroyed()) return
  if (w.isMinimized()) w.restore()
  w.show()
  w.moveTop()
  w.focus()
}

const corDoTema = (cfg: Config) => (cfg.geral.tema === 'escuro' ? '#0e1014' : '#e9ecf0')

function aplicarTema(cfg: Config): void {
  nativeTheme.themeSource = cfg.geral.tema === 'escuro' ? 'dark' : 'light'
  janelaComando?.setBackgroundColor(corDoTema(cfg))
}

/** Janela oculta (trilha de áudio, sonda): nunca aparece. */
function criarJanelaOculta(pagina: Pagina): BrowserWindow {
  const win = new BrowserWindow({ show: false, width: 640, height: 360, skipTaskbar: true, webPreferences: preferenciasWeb() })
  protegerNavegacao(win)
  carregarPagina(win, pagina)
  return win
}

async function iniciar(): Promise<void> {
  Menu.setApplicationMenu(null)
  garantirPastas()
  iniciarLog(caminhos.logs)
  log.info(`Iniciando Sonoplastia ${app.getVersion()} (Electron ${process.versions.electron}); dados em ${caminhos.base}${AUTOTESTE ? ' [autoteste]' : ''}`)

  const armazem = new ArmazemConfig(caminhos.config)
  const cfg = armazem.carregar()
  nativeTheme.themeSource = cfg.geral.tema === 'escuro' ? 'dark' : 'light'
  permitirPasta(caminhos.base)
  permitirPasta(cfg.musicas.pastaLouvorJa)
  tratarProtocoloMidia()
  if (cfg.telaEspera.imagem) liberarArquivo(cfg.telaEspera.imagem)
  /** fundo padrão das configurações (some se o arquivo não existe mais) */
  const fundoPadrao = (c: Config): Fundo => {
    const p = c.fundos.padrao
    return p && existsSync(p) ? { tipo: 'imagem', url: liberarArquivo(p), nome: basename(p) } : { tipo: 'nenhum' }
  }

  const db = abrirBanco(caminhos.banco)
  const motor = new Motor(cfg.saidas.map((s) => s.id))
  motor.clicarPulaAudio = cfg.musicas.clicarPulaAudio
  motor.pularOcultos = cfg.apresentacoes.pularOcultos
  motor.midiasDosSlides = cfg.apresentacoes.midiasDosSlides
  motor.aoTerminarMusica = cfg.musicas.aoTerminar
  motor.definirFundoPadrao(fundoPadrao(cfg))
  motor.definirVolume(cfg.geral.volume)
  // o volume mexido no player fica gravado (um pouco depois de soltar, para não gravar a cada passo)
  let gravarVolume: NodeJS.Timeout | null = null
  motor.on('volume', (v: number) => {
    if (gravarVolume) clearTimeout(gravarVolume)
    gravarVolume = setTimeout(() => {
      gravarVolume = null
      const c = armazem.obter()
      if (c.geral.volume !== v) armazem.salvar({ ...c, geral: { ...c.geral, volume: v } })
    }, 800)
  })
  const telemetrias = new Map<string, Telemetria>()
  const pastaRecursos = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources')
  const ffmpeg = acharFfmpeg(pastaRecursos)
  const videoDeTeste = () => garantirVideoDeTeste(join(caminhos.videos, 'video-de-teste.mp4'), ffmpeg)
  const sonda = new Sonda(() => criarJanelaOculta('sonda'))
  const midias = new BibliotecaMidias(db, { base: caminhos.midias, miniaturas: caminhos.miniaturas }, sonda, ffmpeg)
  const musicas = new RepositorioMusicas(db)
  const biblia = new RepositorioBiblia(db)
  // scripts do PowerShell que transformam slides em imagens (no instalador: resources\scripts)
  const pastaScripts = app.isPackaged ? join(process.resourcesPath, 'scripts') : join(app.getAppPath(), 'scripts', 'powershell')
  const apresentacoes = new BibliotecaApresentacoes(
    db,
    { arquivos: caminhos.apresentacoes, slides: caminhos.slides },
    criarConversor({ pastaScripts, sonda, ffmpeg, largura: () => Number(armazem.obter().apresentacoes.largura) || 1920 }),
  )
  const progresso = (p: Progresso) => janelaComando?.webContents.send(CANAIS.progresso, p)

  const criarJanelaSaida = (saidaId: string, opcoes: BrowserWindowConstructorOptions) => {
    const win = new BrowserWindow({ ...opcoes, webPreferences: preferenciasWeb() })
    protegerNavegacao(win)
    atalhosDeDesenvolvimento(win)
    win.webContents.on('render-process-gone', (_e, d) => {
      log.erro(`Saída ${saidaId}: a página caiu (${d.reason}). Recarregando.`)
      if (!win.isDestroyed()) carregarPagina(win, 'saida', { saida: saidaId })
    })
    carregarPagina(win, 'saida', { saida: saidaId })
    return win
  }
  const telas = new GerenciadorTelas({ obterConfig: () => armazem.obter(), criarJanela: criarJanelaSaida, oculto: AUTOTESTE })

  motor.on('estado', (e) => transmitir(CANAIS.estado, e))
  armazem.on('mudou', (c: Config) => {
    if (c.telaEspera.imagem) liberarArquivo(c.telaEspera.imagem)
    permitirPasta(c.musicas.pastaLouvorJa)
    motor.clicarPulaAudio = c.musicas.clicarPulaAudio
    motor.pularOcultos = c.apresentacoes.pularOcultos
    motor.midiasDosSlides = c.apresentacoes.midiasDosSlides
    motor.aoTerminarMusica = c.musicas.aoTerminar
    motor.definirFundoPadrao(fundoPadrao(c))
    motor.sincronizarSaidas(c.saidas.map((s) => s.id))
    aplicarTema(c)
    telas.reconciliar()
    transmitir(CANAIS.config, c)
  })
  telas.on('mudou', (t) => janelaComando?.webContents.send(CANAIS.telas, t))
  let avisoMidias: NodeJS.Timeout | null = null
  midias.on('mudou', () => {
    if (avisoMidias) return
    avisoMidias = setTimeout(() => {
      avisoMidias = null
      janelaComando?.webContents.send(CANAIS.midiasMudaram)
    }, 250)
  })

  // --- motor, configurações e telas
  ipcMain.handle(CANAIS.comando, (_e, c: Comando) => {
    motor.executar(c)
    // fim do áudio: a liturgia pode passar sozinha para o próximo item
    if (c.tipo === 'audio:terminou') executorLiturgia?.aoTerminarAudio(c.url)
  })
  ipcMain.handle(CANAIS.obterEstado, () => motor.estado)
  ipcMain.handle(CANAIS.obterConfig, () => armazem.obter())
  ipcMain.handle(CANAIS.salvarConfig, (_e, c: unknown) => armazem.salvar(c))
  ipcMain.handle(CANAIS.obterTelas, () => telas.estado())
  ipcMain.handle(CANAIS.identificar, () => telas.identificar())
  ipcMain.handle(CANAIS.reabrirSaidas, () => telas.reabrir())
  ipcMain.handle(CANAIS.idCaptura, (e, saidaId: string) => {
    const w = telas.janelaDe(saidaId)
    if (!w) return null
    try {
      return w.webContents.getMediaSourceId(e.sender)
    } catch (err) {
      log.erro('Não foi possível capturar a saída', saidaId, err)
      return null
    }
  })
  ipcMain.on(CANAIS.telemetria, (_e, t: Telemetria) => {
    telemetrias.set(t.saidaId, t)
    executorLiturgia?.aoTelemetria(t)
    transmitir(CANAIS.telemetria, t)
  })
  ipcMain.on(CANAIS.sondaResultado, (_e, r: ResultadoSonda) => sonda.receber(r))

  // --- arquivos
  ipcMain.handle(CANAIS.escolherArquivo, async (_e, tipo: TipoArquivo) => {
    const filtros =
      tipo === 'imagem'
        ? [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }]
        : [{ name: 'Vídeos', extensions: ['mp4', 'm4v', 'webm', 'mov', 'mkv'] }]
    const r = await dialog.showOpenDialog(janelaComando!, {
      title: tipo === 'imagem' ? 'Escolher imagem' : 'Escolher vídeo',
      defaultPath: caminhos.midias,
      filters: filtros,
      properties: ['openFile'],
    })
    const caminho = r.filePaths[0]
    if (r.canceled || !caminho) return null
    return { url: liberarArquivo(caminho), nome: basename(caminho), caminho }
  })
  ipcMain.handle(CANAIS.escolherPasta, async (_e, titulo: string) => {
    const r = await dialog.showOpenDialog(janelaComando!, { title: titulo, properties: ['openDirectory'] })
    return r.canceled ? null : (r.filePaths[0] ?? null)
  })
  ipcMain.handle(CANAIS.videoDeTeste, async () => {
    const caminho = await videoDeTeste()
    return { url: liberarArquivo(caminho), nome: 'Vídeo de teste 1080p', caminho }
  })

  // --- mídias
  ipcMain.handle(CANAIS.listarMidias, (_e, f: FiltroMidias) => midias.listar(f))
  ipcMain.handle(CANAIS.importarMidias, (_e, lista: string[]) => midias.importar(lista))
  ipcMain.handle(CANAIS.escolherEImportar, async () => {
    const r = await dialog.showOpenDialog(janelaComando!, {
      title: 'Importar mídias',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Vídeos, imagens e áudios', extensions: ['mp4', 'm4v', 'mov', 'mkv', 'webm', 'avi', 'wmv', 'mpg', 'mpeg', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'mp3', 'm4a', 'aac', 'wav', 'ogg', 'flac', 'wma'] },
      ],
    })
    if (r.canceled) return { importadas: [], repetidas: [], ignoradas: [] }
    return midias.importar(r.filePaths)
  })
  ipcMain.handle(CANAIS.renomearMidia, (_e, id: number, nome: string) => midias.renomear(id, nome))
  ipcMain.handle(CANAIS.excluirMidia, (_e, id: number) => midias.excluir(id))
  ipcMain.handle(CANAIS.restaurarMidia, (_e, id: number) => midias.restaurar(id))
  ipcMain.handle(CANAIS.apagarMidia, async (_e, id: number) => {
    const m = midias.obter(id)
    if (!m) return
    const r = await dialog.showMessageBox(janelaComando!, {
      type: 'warning',
      buttons: ['Apagar de vez', 'Cancelar'],
      defaultId: 1,
      cancelId: 1,
      title: 'Apagar mídia',
      message: `Apagar "${m.nome}" de vez?`,
      detail: 'O arquivo sai da pasta do programa e não dá para desfazer. O arquivo original, de onde ele foi importado, não é mexido.',
    })
    if (r.response === 0) midias.apagar(id)
  })

  // --- músicas
  ipcMain.handle(CANAIS.listarMusicas, (_e, busca: string) => musicas.listar(busca))
  ipcMain.handle(CANAIS.obterMusica, (_e, id: number) => musicas.obter(id))
  ipcMain.handle(CANAIS.salvarMusica, (_e, id: number, titulo: string, slides: SlideMusicaDados[]) => musicas.salvarEdicao(id, titulo, slides))
  const abrirMusica = (id: number, versao: VersaoMusica, alvo: Alvo, indice?: number) => {
    const m = musicas.obter(id)
    const arq = musicas.arquivos(id)
    if (!m || !arq) throw new Error('Música não encontrada.')
    const caminhoAudio = versao === 'cantado' ? arq.cantado : versao === 'playback' ? arq.playback : null
    if (versao !== 'manual' && (!caminhoAudio || !existsSync(caminhoAudio))) {
      throw new Error(`Esta música não tem o áudio ${versao === 'cantado' ? 'cantado' : 'de playback'} (ou o arquivo sumiu).`)
    }
    const tempos = temposDaVersao(m.slides, versao)
    const c = armazem.obter()
    motor.abrirMusica({
      musicaId: id,
      titulo: m.titulo,
      album: m.album ?? '',
      versao,
      slides: m.slides.map((s, i) => ({ texto: s.texto, ms: tempos[i] ?? 0 })),
      alvo,
      fundoUrl: c.fundos.musicaImagemPropria && arq.imagem && existsSync(arq.imagem) ? liberarArquivo(arq.imagem) : null,
      audioUrl: caminhoAudio ? liberarArquivo(caminhoAudio) : null,
      tituloNaIntroducao: c.musicas.tituloNaIntroducao,
      indice,
    })
  }
  ipcMain.handle(CANAIS.abrirMusica, (_e, id: number, versao: VersaoMusica, alvo: Alvo, indice?: number) => abrirMusica(id, versao, alvo, indice))
  let importandoLouvorJa = false
  ipcMain.handle(CANAIS.importarLouvorJa, async (_e, modo: 'todas' | 'liturgia') => {
    if (importandoLouvorJa) throw new Error('A importação do Louvor JA já está em andamento (veja a barra de baixo).')
    importandoLouvorJa = true
    try {
      const r = await importarLouvorJa(db, musicas, armazem.obter().musicas.pastaLouvorJa, modo, (feito, total) =>
        progresso({ tarefa: 'louvorja', feito, total }),
      )
      log.info('Louvor JA importado:', JSON.stringify({ ...r, erros: r.erros.length }))
      return r
    } finally {
      importandoLouvorJa = false
      progresso({ tarefa: 'louvorja', feito: 1, total: 1, fim: true })
    }
  })

  // --- bíblia
  const importarTextoBiblia = async (texto: string, sigla: string, nome: string) => {
    const n = await biblia.importar(texto, sigla, nome, (feito, total) => progresso({ tarefa: 'biblia', feito, total, texto: sigla }))
    progresso({ tarefa: 'biblia', feito: 1, total: 1, fim: true })
    const c = armazem.obter()
    if (!c.biblia.versaoPadrao) armazem.salvar({ ...c, biblia: { ...c.biblia, versaoPadrao: sigla.trim().toUpperCase() } })
    transmitir(CANAIS.biblia)
    log.info(`Bíblia ${sigla} importada: ${n} versículos`)
    return n
  }
  ipcMain.handle(CANAIS.versoesBiblia, () => biblia.versoes())
  ipcMain.handle(CANAIS.arquivosBiblia, () => biblia.arquivosEncontrados(caminhos.biblias))
  ipcMain.handle(CANAIS.importarBiblia, (_e, caminho: string, sigla: string, nome: string) =>
    importarTextoBiblia(readFileSync(caminho, 'utf8'), sigla, nome),
  )
  ipcMain.handle(CANAIS.importarBibliaUrl, async (_e, url: string, sigla: string, nome: string) => {
    if (!/^https?:\/\//i.test(url)) throw new Error('O endereço precisa começar com https://')
    const r = await net.fetch(url, { headers: { 'User-Agent': 'Sonoplastia/0.1' } })
    if (!r.ok) throw new Error(`O endereço respondeu ${r.status}.`)
    const texto = await r.text()
    if (texto.length > 40 * 1024 * 1024) throw new Error('Arquivo grande demais para uma Bíblia.')
    const n = await importarTextoBiblia(texto, sigla, nome)
    writeFileSync(join(caminhos.biblias, `${sigla.trim().toUpperCase()}.json`), texto, 'utf8')
    return n
  })
  ipcMain.handle(CANAIS.escolherArquivoBiblia, async () => {
    const r = await dialog.showOpenDialog(janelaComando!, {
      title: 'Escolher arquivo da Bíblia (.json)',
      filters: [{ name: 'Bíblia em JSON', extensions: ['json'] }],
      properties: ['openFile'],
    })
    return r.canceled ? null : (r.filePaths[0] ?? null)
  })
  ipcMain.handle(CANAIS.capitulo, (_e, sigla: string, livro: number, capitulo: number) => biblia.capitulo(sigla, livro, capitulo))
  ipcMain.handle(CANAIS.totalCapitulos, (_e, sigla: string, livro: number) => biblia.totalCapitulos(sigla, livro))
  ipcMain.handle(CANAIS.buscarBiblia, (_e, sigla: string, termo: string) => biblia.buscar(sigla, termo))

  // --- apresentações
  let avisoApresentacoes: NodeJS.Timeout | null = null
  apresentacoes.on('mudou', () => {
    if (avisoApresentacoes) return
    avisoApresentacoes = setTimeout(() => {
      avisoApresentacoes = null
      janelaComando?.webContents.send(CANAIS.apresentacoesMudaram)
    }, 250)
  })
  apresentacoes.on('progresso', (p: { feito: number; total: number; nome?: string; fim?: boolean }) =>
    progresso({ tarefa: 'apresentacoes', feito: p.feito, total: p.total, texto: p.nome, fim: p.fim }),
  )
  const abrirApresentacao = (id: number, alvo: Alvo, indice?: number) => {
    const a = apresentacoes.obter(id)
    if (!a) throw new Error('Apresentação não encontrada.')
    if (a.situacao !== 'pronto' || !a.slides.length) throw new Error('A apresentação ainda não está pronta (convertendo ou com erro).')
    motor.abrirApresentacao({
      apresentacaoId: a.id,
      nome: a.nome,
      alvo,
      indice,
      slides: a.slides.map((s) => ({ url: s.url, proporcao: s.largura / Math.max(1, s.altura), oculto: s.oculto, notas: s.notas, midias: s.midias })),
    })
  }
  ipcMain.handle(CANAIS.listarApresentacoes, (_e, busca: string) => apresentacoes.listar(busca))
  ipcMain.handle(CANAIS.obterApresentacao, (_e, id: number) => apresentacoes.obter(id))
  ipcMain.handle(CANAIS.importarApresentacoes, (_e, lista: string[]) => apresentacoes.importar(lista))
  ipcMain.handle(CANAIS.escolherEImportarApresentacoes, async () => {
    const r = await dialog.showOpenDialog(janelaComando!, {
      title: 'Importar apresentações',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'PowerPoint e PDF', extensions: ['pptx', 'ppsx', 'pdf'] }],
    })
    if (r.canceled) return { importadas: [], repetidas: [], ignoradas: [] }
    return apresentacoes.importar(r.filePaths)
  })
  ipcMain.handle(CANAIS.renomearApresentacao, (_e, id: number, nome: string) => apresentacoes.renomear(id, nome))
  ipcMain.handle(CANAIS.reconverterApresentacao, (_e, id: number) => apresentacoes.reconverter(id))
  ipcMain.handle(CANAIS.abrirApresentacao, (_e, id: number, alvo: Alvo, indice?: number) => abrirApresentacao(id, alvo, indice))
  ipcMain.handle(CANAIS.excluirApresentacao, async (_e, id: number) => {
    const a = apresentacoes.obter(id)
    if (!a) return false
    const r = await dialog.showMessageBox(janelaComando!, {
      type: 'warning',
      buttons: ['Excluir', 'Cancelar'],
      defaultId: 1,
      cancelId: 1,
      title: 'Excluir apresentação',
      message: `Excluir "${a.nome}"?`,
      detail: 'Saem do programa a cópia do arquivo e as imagens dos slides. Não dá para desfazer. O arquivo original, de onde ela foi importada, não é mexido.',
    })
    if (r.response !== 0) return false
    if (motor.estado.apresentacao?.apresentacaoId === id) motor.executar({ tipo: 'apresentacao:fechar' })
    apresentacoes.apagar(id)
    return true
  })

  // --- iluminação (luz.local). No autoteste nada é mandado para as luzes de verdade.
  const luz = new ClienteIluminacao(() => armazem.obter().iluminacao)
  if (cfg.iluminacao.ativo && !AUTOTESTE) luz.preparar()
  const semLuzNoAutoteste = () => {
    if (AUTOTESTE) throw new Error('Autoteste: as luzes de verdade não são usadas.')
  }
  ipcMain.handle(CANAIS.estadoLuz, () => luz.estado())
  ipcMain.handle(CANAIS.alternarLuz, (_e, id: number) => {
    semLuzNoAutoteste()
    return luz.alternar(Number(id))
  })
  ipcMain.handle(CANAIS.cenarioLuz, (_e, nome: string) => {
    semLuzNoAutoteste()
    return luz.cenario(String(nome))
  })
  ipcMain.handle(CANAIS.abrirPaginaLuz, () => {
    const url = enderecoDaLuz(armazem.obter().iluminacao.endereco)
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
  })

  // --- liturgia
  const liturgias = new RepositorioLiturgias(db)
  liturgias.garantirModeloPadrao()
  executorLiturgia = new ExecutorLiturgia({
    // cenário das luzes no começo e no fim dos itens (se ligado nas configurações)
    luz: AUTOTESTE ? undefined : (nome) => luz.cenarioSemEsperar(nome),
    motor,
    obterLiturgia: (id) => liturgias.obter(id),
    config: () => armazem.obter(),
    abrirMusica: (id, versao, alvo) => abrirMusica(id, versao, alvo),
    abrirApresentacao,
    obterMidia: (id) => midias.obter(id),
    capitulo: (sigla, livro, cap) => biblia.capitulo(sigla, livro, cap),
    versoes: () => biblia.versoes(),
    urlFundo: (c) => (existsSync(c) ? liberarArquivo(c) : null),
  })
  const execLit = executorLiturgia
  const avisarLiturgias = () => janelaComando?.webContents.send(CANAIS.liturgiasMudaram)
  /** copia a imagem de fundo para C:\Sonoplastia\midias\fundos (reaproveita se já está lá) */
  const copiarFundo = (origem: string): string => {
    if (!/\.(png|jpe?g|webp|bmp|gif)$/i.test(origem)) throw new Error('Escolha uma imagem (.jpg, .png, .webp…).')
    mkdirSync(caminhos.fundos, { recursive: true })
    const mesmo = join(caminhos.fundos, basename(origem))
    if (existsSync(mesmo) && statSync(mesmo).size === statSync(origem).size) return mesmo
    if (resolve(origem).toLowerCase().startsWith(resolve(caminhos.fundos).toLowerCase())) return origem
    const destino = nomeLivre(caminhos.fundos, basename(origem))
    copyFileSync(origem, destino)
    return destino
  }
  ipcMain.handle(CANAIS.listarLiturgias, () => liturgias.listar())
  ipcMain.handle(CANAIS.obterLiturgia, (_e, id: number) => liturgias.obter(id))
  ipcMain.handle(CANAIS.copiarLiturgia, (_e, origemId: number | null, d: { nome?: string; data?: string | null; inicio?: string | null; modelo: boolean }) => {
    const id = liturgias.copiar(origemId, d)
    avisarLiturgias()
    return id
  })
  ipcMain.handle(CANAIS.salvarLiturgia, (_e, id: number, a: AlteracaoLiturgia) => {
    const l = liturgias.salvar(id, a)
    avisarLiturgias()
    return l
  })
  ipcMain.handle(CANAIS.excluirLiturgia, async (_e, id: number) => {
    const l = liturgias.obter(id)
    if (!l) return false
    const r = await dialog.showMessageBox(janelaComando!, {
      type: 'warning',
      buttons: ['Excluir', 'Cancelar'],
      defaultId: 1,
      cancelId: 1,
      title: l.modelo ? 'Excluir modelo' : 'Excluir liturgia',
      message: `Excluir "${l.nome}"${l.data ? ` (${l.data.split('-').reverse().join('/')})` : ''}?`,
      detail: 'As músicas, mídias e apresentações dela continuam na biblioteca. Não dá para desfazer.',
    })
    if (r.response !== 0) return false
    if (motor.estado.liturgia?.liturgiaId === id) execLit.fechar()
    liturgias.excluir(id)
    avisarLiturgias()
    return true
  })
  ipcMain.handle(CANAIS.executarItemLiturgia, (_e, liturgiaId: number, itemId: string, alvo: Alvo, versao?: VersaoMusica) =>
    execLit.executar(liturgiaId, itemId, alvo, versao === 'cantado' || versao === 'playback' || versao === 'manual' ? versao : undefined),
  )
  ipcMain.handle(CANAIS.aberturaSecao, (_e, liturgiaId: number, secaoId: string, alvo: Alvo) => execLit.abertura(liturgiaId, secaoId, alvo))
  ipcMain.handle(CANAIS.vizinhoLiturgia, (_e, liturgiaId: number, passo: 1 | -1, alvo: Alvo) => execLit.vizinho(liturgiaId, passo, alvo))
  ipcMain.handle(CANAIS.passoLiturgia, (_e, passo: 1 | -1) => execLit.passo(passo))
  ipcMain.handle(CANAIS.fecharLiturgia, () => execLit.fechar())
  ipcMain.handle(CANAIS.escolherFundoSecao, async () => {
    const r = await dialog.showOpenDialog(janelaComando!, {
      title: 'Imagem de fundo da seção',
      defaultPath: existsSync(caminhos.fundos) ? caminhos.fundos : caminhos.midias,
      filters: [{ name: 'Imagens', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'] }],
      properties: ['openFile'],
    })
    const c = r.filePaths[0]
    return r.canceled || !c ? null : copiarFundo(c)
  })
  ipcMain.handle(CANAIS.importarFundoSecao, (_e, caminho: string) => copiarFundo(caminho))

  // --- janelas
  janelaAudio = criarJanelaOculta('audio')
  janelaAudio.webContents.on('render-process-gone', (_e, d) => {
    log.erro(`A janela de áudio caiu (${d.reason}). Recarregando.`)
    if (janelaAudio && !janelaAudio.isDestroyed()) carregarPagina(janelaAudio, 'audio')
  })

  // Emergência: se uma saída cobrir a tela de comando (ou qualquer coisa der errado nas telas),
  // Ctrl+Shift+F12 fecha todas as saídas e traz a tela de comando para a frente.
  const recolherSaidas = () => {
    log.aviso(`Atalho de emergência (${ATALHO_EMERGENCIA.texto}): saídas recolhidas.`)
    telas.recolher()
    trazerComando()
  }

  janelaComando = criarJanelaComando(armazem, telas, recolherSaidas)
  telas.iniciar(cfg.geral.abrirSaidasAoIniciar)
  midias.retomar()
  apresentacoes.retomar()

  // controle remoto pelo celular: http://<IP do computador>:<porta> (página remoto.html)
  const remoto = ligarControleRemoto({
    armazem,
    motor,
    musicas,
    midias,
    biblia,
    abrirMusica,
    comando: () => janelaComando,
    pastaPaginas: join(__dirname, '../renderer'),
    pastasArquivos: () => [caminhos.miniaturas],
    portaForcada: AUTOTESTE ? 0 : undefined,
  })

  if (!AUTOTESTE) {
    // se outro programa já usa a combinação, ainda funciona com a tela de comando em foco
    if (!globalShortcut.register(ATALHO_EMERGENCIA.electron, recolherSaidas)) {
      log.aviso(`Não foi possível registrar ${ATALHO_EMERGENCIA.texto} para todo o Windows (outro programa usa).`)
    }
  }

  app.on('before-quit', () => {
    encerrando = true
    telas.encerrar()
    sonda.fechar()
    armazem.gravarAgora()
  })
  app.on('will-quit', () => globalShortcut.unregisterAll())
  app.on('window-all-closed', () => app.quit())

  if (AUTOTESTE) {
    await rodarAutoteste({
      motor,
      telas,
      armazem,
      midias,
      musicas,
      biblia,
      db,
      comando: () => janelaComando,
      telemetrias,
      videoDeTeste,
      liberar: liberarArquivo,
      recolher: recolherSaidas,
      abrirMusica,
      apresentacoes,
      abrirApresentacao,
      remoto,
      liturgias,
      executorLiturgia: execLit,
      pasta: process.env.SONOPLASTIA_AUTOTESTE || join(caminhos.base, 'autoteste'),
    })
    encerrando = true
    telas.encerrar()
    sonda.fechar()
    app.exit(0)
  }
}

function criarJanelaComando(armazem: ArmazemConfig, telas: GerenciadorTelas, recolherSaidas: () => void): BrowserWindow {
  const win = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1100,
    minHeight: 640,
    show: false,
    backgroundColor: corDoTema(armazem.obter()),
    title: 'Sonoplastia',
    autoHideMenuBar: true,
    webPreferences: preferenciasWeb(),
  })
  protegerNavegacao(win)
  atalhosDeDesenvolvimento(win)
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.control && input.shift && input.key === 'F12') {
      e.preventDefault()
      recolherSaidas()
    }
  })
  win.once('ready-to-show', () => {
    if (AUTOTESTE) return
    win.maximize()
    win.show()
  })
  win.on('close', (e) => {
    if (encerrando) return
    if (armazem.obter().geral.confirmarAoFechar) {
      const r = dialog.showMessageBoxSync(win, {
        type: 'question',
        buttons: ['Fechar', 'Cancelar'],
        defaultId: 1,
        cancelId: 1,
        title: 'Fechar o Sonoplastia',
        message: 'Fechar o programa?',
        detail: 'As saídas dos projetores vão apagar e o som para.',
      })
      if (r !== 0) {
        e.preventDefault()
        return
      }
    }
    encerrando = true
    telas.encerrar()
    app.quit()
  })
  win.on('closed', () => {
    janelaComando = null
  })
  carregarPagina(win, 'comando')
  return win
}
