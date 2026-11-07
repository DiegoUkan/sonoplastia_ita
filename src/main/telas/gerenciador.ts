import { BrowserWindow, type BrowserWindowConstructorOptions, screen } from 'electron'
import { EventEmitter } from 'node:events'
import type { Config, ConfigSaida } from '../../shared/config'
import type { EstadoTelas, InfoSaida, MonitorAtual } from '../../shared/estado'
import { log } from '../log'
import { type Destino, numerarMonitores, planejarSaidas } from './combinar'

type TipoJanela = 'monitor' | 'janela'

interface JanelaSaida {
  win: BrowserWindow
  tipo: TipoJanela
  /** monitor atual (muda se o monitor mudar de posição ou resolução) */
  monitor: MonitorAtual | null
}

export interface OpcoesGerenciador {
  obterConfig: () => Config
  /** cria a BrowserWindow da saída já carregando a página (o gerenciador cuida de posição e exibição) */
  criarJanela: (saidaId: string, opcoes: BrowserWindowConstructorOptions) => BrowserWindow
  /** nunca mostra as janelas (autoteste) */
  oculto: boolean
}

/**
 * Abre, posiciona e fecha as janelas de saída conforme a configuração e os monitores ligados.
 * Reage sozinho a monitor ligado/desligado. Emite 'mudou' com o EstadoTelas.
 */
export class GerenciadorTelas extends EventEmitter {
  private janelas = new Map<string, JanelaSaida>()
  private fechadasPeloOperador = new Set<string>()
  private fechandoPorDentro = new WeakSet<BrowserWindow>()
  private info: InfoSaida[] = []
  private agendado: NodeJS.Timeout | null = null
  private encerrando = false

  constructor(private readonly opcoes: OpcoesGerenciador) {
    super()
  }

  iniciar(abrirSaidas: boolean): void {
    const agendar = () => {
      if (this.agendado) clearTimeout(this.agendado)
      this.agendado = setTimeout(() => {
        this.agendado = null
        log.info('Monitores mudaram:', JSON.stringify(this.monitores().map((m) => [m.numero, m.larguraPx, m.alturaPx, m.x])))
        this.reconciliar()
      }, 500)
    }
    screen.on('display-added', agendar)
    screen.on('display-removed', agendar)
    screen.on('display-metrics-changed', agendar)
    if (!abrirSaidas) for (const s of this.opcoes.obterConfig().saidas) this.fechadasPeloOperador.add(s.id)
    this.reconciliar()
  }

  monitores(): MonitorAtual[] {
    return numerarMonitores(screen.getAllDisplays(), screen.getPrimaryDisplay().id)
  }

  estado(): EstadoTelas {
    return { monitores: this.monitores(), saidas: this.info }
  }

  /** Janelas de saída abertas agora (para o autoteste capturar). */
  janelasAbertas(): Array<{ saidaId: string; win: BrowserWindow }> {
    return [...this.janelas].filter(([, j]) => !j.win.isDestroyed()).map(([saidaId, j]) => ({ saidaId, win: j.win }))
  }

  reabrir(): void {
    this.fechadasPeloOperador.clear()
    this.reconciliar()
  }

  /** Emergência: fecha todas as saídas (voltam com `reabrir`). */
  recolher(): void {
    for (const s of this.opcoes.obterConfig().saidas) this.fechadasPeloOperador.add(s.id)
    this.reconciliar()
  }

  /** Deixa as janelas como a configuração e os monitores pedem. Pode ser chamado à vontade. */
  reconciliar(): void {
    if (this.encerrando) return
    const cfg = this.opcoes.obterConfig()
    const planos = planejarSaidas(cfg.saidas, this.monitores())
    const ids = new Set(cfg.saidas.map((s) => s.id))
    for (const id of [...this.janelas.keys()]) if (!ids.has(id)) this.fechar(id)

    this.info = planos.map((p): InfoSaida => {
      const s = cfg.saidas.find((x) => x.id === p.saidaId)!
      const monitorId = p.destino.tipo === 'monitor' ? p.destino.monitor.id : null
      if (p.destino.tipo === 'nenhum') {
        this.fechar(s.id)
        return { saidaId: s.id, situacao: p.situacao, monitorId: null, aviso: p.aviso }
      }
      if (this.fechadasPeloOperador.has(s.id)) {
        this.fechar(s.id)
        return { saidaId: s.id, situacao: 'fechada', monitorId: null, aviso: 'Saída fechada. Use "Reabrir saídas".' }
      }
      try {
        this.garantirJanela(s, p.destino)
      } catch (e) {
        log.erro(`Falha ao abrir a saída ${s.id}:`, e)
        return { saidaId: s.id, situacao: 'fechada', monitorId: null, aviso: 'Erro ao abrir a saída (veja o log).' }
      }
      return { saidaId: s.id, situacao: p.situacao, monitorId, aviso: p.aviso }
    })
    this.registrarMudancas()
    this.emit('mudou', this.estado())
  }

  private ultimaSituacao = new Map<string, string>()

  /** Registra no log para onde cada saída foi (ajuda a entender um problema depois). */
  private registrarMudancas(): void {
    const monitores = this.monitores()
    for (const i of this.info) {
      const m = monitores.find((x) => x.id === i.monitorId)
      const texto = m ? `monitor ${m.numero} (${m.larguraPx}×${m.alturaPx})` : i.situacao
      if (this.ultimaSituacao.get(i.saidaId) === texto) continue
      this.ultimaSituacao.set(i.saidaId, texto)
      log.info(`Saída ${i.saidaId}: ${texto}${i.aviso ? ` — ${i.aviso}` : ''}`)
    }
  }

  private garantirJanela(s: ConfigSaida, destino: Exclude<Destino, { tipo: 'nenhum' }>): void {
    const tipo: TipoJanela = destino.tipo
    const atual = this.janelas.get(s.id)
    // moldura não muda depois de criada: trocar de monitor para janela recria a janela
    if (atual && (atual.tipo !== tipo || atual.win.isDestroyed())) this.fechar(s.id)

    let j = this.janelas.get(s.id)
    if (!j) {
      const win = this.opcoes.criarJanela(s.id, destino.tipo === 'monitor' ? opcoesMonitor(s, destino) : opcoesJanela(s))
      const nova: JanelaSaida = { win, tipo, monitor: null }
      j = nova
      this.janelas.set(s.id, nova)
      win.on('closed', () => {
        if (this.janelas.get(s.id)?.win === win) this.janelas.delete(s.id)
        if (this.encerrando || this.fechandoPorDentro.has(win)) return
        this.fechadasPeloOperador.add(s.id)
        this.reconciliar()
      })
      win.once('ready-to-show', () => {
        if (win.isDestroyed()) return
        if (nova.monitor) aplicarLimites(win, retanguloDe(nova.monitor))
        if (!this.opcoes.oculto) win.showInactive()
      })
    }

    const { win } = j
    j.monitor = destino.tipo === 'monitor' ? destino.monitor : null
    win.setBackgroundColor(s.corFundo)
    if (destino.tipo === 'monitor') {
      aplicarLimites(win, retanguloDe(destino.monitor))
      win.setAlwaysOnTop(s.sempreNoTopo, 'screen-saver')
      win.setTitle(`Saída ${s.nome}`)
    } else {
      win.setTitle(`Saída ${s.nome} — janela de teste`)
    }
  }

  private fechar(saidaId: string): void {
    const j = this.janelas.get(saidaId)
    if (!j) return
    this.janelas.delete(saidaId)
    if (!j.win.isDestroyed()) {
      this.fechandoPorDentro.add(j.win)
      j.win.destroy()
    }
  }

  /**
   * Mostra um número grande em cada monitor por alguns segundos. No monitor de comando é só um
   * cartão no meio, para nunca cobrir a tela do operador inteira.
   */
  identificar(): void {
    const cfg = this.opcoes.obterConfig()
    for (const m of this.monitores()) {
      const saidas = this.info
        .filter((i) => i.monitorId === m.id)
        .map((i) => cfg.saidas.find((s) => s.id === i.saidaId)?.nome)
        .filter(Boolean) as string[]
      const r = m.principal
        ? {
            x: Math.round(m.x + m.largura * 0.3),
            y: Math.round(m.y + m.altura * 0.25),
            width: Math.round(m.largura * 0.4),
            height: Math.round(m.altura * 0.5),
          }
        : retanguloDe(m)
      const win = new BrowserWindow({
        ...r,
        frame: false,
        show: false,
        resizable: false,
        movable: false,
        focusable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        backgroundColor: '#05070a',
        webPreferences: { sandbox: true, javascript: false },
      })
      win.setAlwaysOnTop(true, 'screen-saver', 2)
      win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(paginaIdentificar(m, saidas)))
      win.once('ready-to-show', () => {
        if (win.isDestroyed()) return
        aplicarLimites(win, r)
        if (!this.opcoes.oculto) win.showInactive()
      })
      setTimeout(() => {
        if (!win.isDestroyed()) win.destroy()
      }, 4000)
    }
  }

  encerrar(): void {
    this.encerrando = true
    for (const id of [...this.janelas.keys()]) this.fechar(id)
  }
}

interface Retangulo {
  x: number
  y: number
  width: number
  height: number
}

function retanguloDe(m: MonitorAtual): Retangulo {
  return { x: m.x, y: m.y, width: m.largura, height: m.altura }
}

function aplicarLimites(win: BrowserWindow, limites: Retangulo): void {
  win.setBounds(limites)
  // no Windows, com escalas diferentes entre monitores, a primeira chamada pode errar o tamanho
  const b = win.getBounds()
  if (b.width !== limites.width || b.height !== limites.height || b.x !== limites.x) win.setBounds(limites)
}

function opcoesMonitor(s: ConfigSaida, destino: { monitor: MonitorAtual }): BrowserWindowConstructorOptions {
  const m = destino.monitor
  return {
    x: m.x,
    y: m.y,
    width: m.largura,
    height: m.altura,
    frame: false,
    show: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    enableLargerThanScreen: true,
    alwaysOnTop: s.sempreNoTopo,
    backgroundColor: s.corFundo,
    title: `Saída ${s.nome}`,
  }
}

function opcoesJanela(s: ConfigSaida): BrowserWindowConstructorOptions {
  const area = screen.getPrimaryDisplay().workArea
  const largura = Math.min(800, Math.round(area.width * 0.55))
  const altura = Math.round((largura * 9) / 16)
  const deslocamento = s.id === 'palco' ? 40 : 0
  return {
    x: area.x + area.width - largura - 24 - deslocamento,
    y: area.y + 24 + deslocamento,
    width: largura,
    height: altura,
    useContentSize: true,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: s.corFundo,
    title: `Saída ${s.nome} — janela de teste`,
  }
}

function escaparHtml(t: string): string {
  return t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

function paginaIdentificar(m: MonitorAtual, saidas: string[]): string {
  const papel = m.principal ? 'Monitor de comando' : saidas.length ? `Saída: ${saidas.join(', ')}` : 'Sem saída'
  const cor = m.principal ? '#9ba3b1' : saidas.length ? '#4f8cff' : '#f5a524'
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;height:100%;background:#05070a;color:#fff;font-family:"Segoe UI",system-ui,sans-serif;cursor:none}
    body{display:flex;flex-direction:column;align-items:center;justify-content:center;border:1.2vmin solid ${cor};box-sizing:border-box}
    .n{font-size:52vmin;font-weight:700;line-height:1}
    .p{font-size:7vmin;font-weight:600;color:${cor};margin-top:2vmin}
    .d{font-size:3.6vmin;color:#9ba3b1;margin-top:1.5vmin}
  </style></head><body>
    <div class="n">${m.numero}</div>
    <div class="p">${escaparHtml(papel)}</div>
    <div class="d">${m.larguraPx}×${m.alturaPx}${m.rotulo ? ' · ' + escaparHtml(m.rotulo) : ''}</div>
  </body></html>`
}
