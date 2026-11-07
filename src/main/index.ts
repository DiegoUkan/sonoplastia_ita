import {
  app,
  BrowserWindow,
  type BrowserWindowConstructorOptions,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeTheme,
  type WebPreferences,
} from 'electron'
import { existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import { ATALHO_EMERGENCIA } from '../shared/atalhos'
import type { Config } from '../shared/config'
import type { Comando, Telemetria } from '../shared/estado'
import { CANAIS, type TipoArquivo } from '../shared/ipc'
import { rodarAutoteste } from './autoteste'
import { caminhos, garantirPastas } from './caminhos'
import { ArmazemConfig } from './config'
import { iniciarLog, log } from './log'
import { liberarArquivo, permitirPasta, registrarEsquemaPrivilegiado, tratarProtocoloMidia } from './midia'
import { Motor } from './motor'
import { GerenciadorTelas } from './telas/gerenciador'
import { acharFfmpeg, garantirVideoDeTeste } from './videoTeste'

const AUTOTESTE = process.argv.includes('--autoteste')
const DEV = !app.isPackaged && !!process.env.ELECTRON_RENDERER_URL

if (AUTOTESTE) app.commandLine.appendSwitch('mute-audio')
registrarEsquemaPrivilegiado()

let janelaComando: BrowserWindow | null = null
let encerrando = false

if (!AUTOTESTE && !app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!janelaComando) return
    if (janelaComando.isMinimized()) janelaComando.restore()
    janelaComando.focus()
  })
  app.whenReady().then(iniciar).catch((e) => {
    log.erro('Falha ao iniciar:', e)
    dialog.showErrorBox('Sonoplastia', `O programa não conseguiu iniciar.\n\n${e instanceof Error ? e.message : e}`)
    app.exit(1)
  })
}

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

function carregarPagina(win: BrowserWindow, pagina: 'comando' | 'saida', query: Record<string, string> = {}): void {
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

function transmitir(canal: string, dado: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(canal, dado)
}

function registrarImagemDaTelaEspera(cfg: Config): void {
  if (cfg.telaEspera.imagem) liberarArquivo(cfg.telaEspera.imagem)
}

function trazerComando(): void {
  const w = janelaComando
  if (!w || w.isDestroyed()) return
  if (w.isMinimized()) w.restore()
  w.show()
  w.moveTop()
  w.focus()
}

async function iniciar(): Promise<void> {
  Menu.setApplicationMenu(null)
  nativeTheme.themeSource = 'dark'
  garantirPastas()
  iniciarLog(caminhos.logs)
  log.info(`Iniciando Sonoplastia ${app.getVersion()} (Electron ${process.versions.electron}); dados em ${caminhos.base}${AUTOTESTE ? ' [autoteste]' : ''}`)

  const armazem = new ArmazemConfig(caminhos.config)
  const cfg = armazem.carregar()
  permitirPasta(caminhos.base)
  tratarProtocoloMidia()
  registrarImagemDaTelaEspera(cfg)

  const motor = new Motor(cfg.saidas.map((s) => s.id))
  const telemetrias = new Map<string, Telemetria>()
  const pastaRecursos = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources')
  const ffmpeg = acharFfmpeg(pastaRecursos)
  const videoDeTeste = () => garantirVideoDeTeste(join(caminhos.videos, 'video-de-teste.mp4'), ffmpeg)

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
    registrarImagemDaTelaEspera(c)
    motor.sincronizarSaidas(c.saidas.map((s) => s.id))
    telas.reconciliar()
    transmitir(CANAIS.config, c)
  })
  telas.on('mudou', (t) => janelaComando?.webContents.send(CANAIS.telas, t))

  ipcMain.handle(CANAIS.comando, (_e, c: Comando) => motor.executar(c))
  ipcMain.handle(CANAIS.obterEstado, () => motor.estado)
  ipcMain.handle(CANAIS.obterConfig, () => armazem.obter())
  ipcMain.handle(CANAIS.salvarConfig, (_e, c: unknown) => armazem.salvar(c))
  ipcMain.handle(CANAIS.obterTelas, () => telas.estado())
  ipcMain.handle(CANAIS.identificar, () => telas.identificar())
  ipcMain.handle(CANAIS.reabrirSaidas, () => telas.reabrir())
  ipcMain.handle(CANAIS.escolherArquivo, async (_e, tipo: TipoArquivo) => {
    const filtros =
      tipo === 'imagem'
        ? [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }]
        : [{ name: 'Vídeos', extensions: ['mp4', 'm4v', 'webm', 'mov', 'mkv'] }]
    const pastaHolyrics = `C:\\Holyrics\\Holyrics\\files\\media\\${tipo === 'imagem' ? 'image' : 'video'}`
    const r = await dialog.showOpenDialog(janelaComando!, {
      title: tipo === 'imagem' ? 'Escolher imagem' : 'Escolher vídeo',
      defaultPath: existsSync(pastaHolyrics) ? pastaHolyrics : caminhos.midias,
      filters: filtros,
      properties: ['openFile'],
    })
    const caminho = r.filePaths[0]
    if (r.canceled || !caminho) return null
    return { url: liberarArquivo(caminho), nome: basename(caminho), caminho }
  })
  ipcMain.handle(CANAIS.videoDeTeste, async () => {
    const caminho = await videoDeTeste()
    return { url: liberarArquivo(caminho), nome: 'Vídeo de teste 1080p', caminho }
  })
  ipcMain.on(CANAIS.telemetria, (_e, t: Telemetria) => {
    telemetrias.set(t.saidaId, t)
    janelaComando?.webContents.send(CANAIS.telemetria, t)
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

  if (!AUTOTESTE) {
    // se outro programa já usa a combinação, ainda funciona com a tela de comando em foco
    if (!globalShortcut.register(ATALHO_EMERGENCIA.electron, recolherSaidas)) {
      log.aviso(`Não foi possível registrar ${ATALHO_EMERGENCIA.texto} para todo o Windows (outro programa usa).`)
    }
  }

  app.on('before-quit', () => {
    encerrando = true
    telas.encerrar()
    armazem.gravarAgora()
  })
  app.on('will-quit', () => globalShortcut.unregisterAll())
  app.on('window-all-closed', () => app.quit())

  if (AUTOTESTE) {
    await rodarAutoteste({
      motor,
      telas,
      comando: () => janelaComando,
      telemetrias,
      videoDeTeste,
      liberar: liberarArquivo,
      recolher: recolherSaidas,
      pasta: process.env.SONOPLASTIA_AUTOTESTE || join(caminhos.base, 'autoteste'),
    })
    encerrando = true
    telas.encerrar()
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
    backgroundColor: '#0e1014',
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
        detail: 'As saídas dos projetores vão apagar.',
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
