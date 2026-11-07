import type { BrowserWindow } from 'electron'
import type { PedidoSonda, ResultadoSonda } from '../../shared/ipc'
import { CANAIS } from '../../shared/ipc'
import { log } from '../log'

/**
 * Janela oculta que abre mídias pelo próprio Chromium para saber duração, tamanho, se toca (o mesmo
 * motor de vídeo das saídas) e para tirar a miniatura. Abre quando precisa e fecha depois de parada.
 */
export class Sonda {
  private win: BrowserWindow | null = null
  private pronta: Promise<void> | null = null
  private pendentes = new Map<number, { resolve: (r: ResultadoSonda) => void; timer: NodeJS.Timeout }>()
  private seq = 0
  private ocioso: NodeJS.Timeout | null = null

  constructor(private readonly criarJanela: () => BrowserWindow) {}

  analisar(url: string, tipo: PedidoSonda['tipo']): Promise<ResultadoSonda> {
    if (this.ocioso) clearTimeout(this.ocioso)
    const id = ++this.seq
    return new Promise<ResultadoSonda>((resolve) => {
      const timer = setTimeout(() => this.receber({ id, ok: false, erro: 'O arquivo demorou demais para abrir.' }), 30000)
      this.pendentes.set(id, { resolve, timer })
      this.garantir()
        .then(() => this.win?.webContents.send(CANAIS.sondaPedido, { id, url, tipo } satisfies PedidoSonda))
        .catch((e) => this.receber({ id, ok: false, erro: String(e) }))
    })
  }

  receber(r: ResultadoSonda): void {
    const p = this.pendentes.get(r.id)
    if (!p) return
    clearTimeout(p.timer)
    this.pendentes.delete(r.id)
    p.resolve(r)
    if (this.pendentes.size === 0) {
      if (this.ocioso) clearTimeout(this.ocioso)
      this.ocioso = setTimeout(() => this.fechar(), 30000)
    }
  }

  private garantir(): Promise<void> {
    if (this.win && !this.win.isDestroyed() && this.pronta) return this.pronta
    const win = this.criarJanela()
    this.win = win
    this.pronta = new Promise<void>((resolve, reject) => {
      win.webContents.once('did-finish-load', () => resolve())
      win.webContents.once('did-fail-load', (_e, _c, desc) => reject(new Error(desc)))
    })
    win.webContents.on('render-process-gone', (_e, d) => {
      log.erro('A janela-sonda caiu:', d.reason)
      for (const id of [...this.pendentes.keys()]) this.receber({ id, ok: false, erro: 'A análise travou neste arquivo.' })
      this.fechar()
    })
    return this.pronta
  }

  fechar(): void {
    if (this.win && !this.win.isDestroyed()) this.win.destroy()
    this.win = null
    this.pronta = null
  }
}
