/**
 * Servidor do controle remoto: um celular ou tablet na mesma rede abre `http://<IP>:<porta>` e
 * recebe a página `remoto.html` (compilada junto com as outras, em out/renderer).
 *
 *   GET  /                 a página
 *   GET  /assets/...       JS e CSS da página
 *   GET  /api/sessao       { precisaPin, autorizado }
 *   POST /api/entrar       { pin } → grava o cookie de acesso
 *   GET  /api/eventos      Server-Sent Events: estado do motor, configuração, telemetria…
 *   POST /api/chamar       { metodo, args } (só os métodos de METODOS_REMOTO)
 *   GET  /api/arquivo?u=   miniaturas das mídias (só dentro das pastas liberadas)
 *
 * Segurança (rede da igreja): PIN opcional, cookie `SameSite=Strict` (outro site aberto no celular
 * não consegue mandar comandos), corpo só em JSON (pedido de outra origem cai no preflight do CORS,
 * que este servidor não libera) e espera crescente depois de PIN errado.
 */
import { createHash, randomInt } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { createReadStream, promises as fsp } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { networkInterfaces } from 'node:os'
import { extname, join, resolve, sep } from 'node:path'
import type { ConfigRemoto } from '../../shared/config'
import type { Comando } from '../../shared/estado'
import { caminhoDaUrlMidia } from '../../shared/midia'
import { type EventoRemoto, METODOS_REMOTO, type MetodoRemoto, type StatusRemoto } from '../../shared/remoto'
import { log } from '../log'

const COOKIE = 'sonoplastia_remoto'
const LIMITE_CORPO = 512 * 1024

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
}

export interface OpcoesServidorRemoto {
  /** pasta com remoto.html e assets/ (out/renderer) */
  pastaPaginas: string
  /** pastas de onde /api/arquivo pode servir (miniaturas) */
  pastasArquivos: () => string[]
  chamar: (metodo: MetodoRemoto, args: unknown[]) => unknown
  /** eventos mandados a cada celular assim que ele conecta */
  inicial: () => Array<[EventoRemoto, unknown]>
}

export function gerarPin(): string {
  return String(randomInt(0, 10000)).padStart(4, '0')
}

const tokenDoPin = (pin: string) => createHash('sha256').update(`sonoplastia-remoto:${pin}`).digest('hex').slice(0, 40)

/** Endereços IPv4 desta máquina na rede, os de rede doméstica/igreja primeiro. */
export function enderecosLocais(): string[] {
  const ips: string[] = []
  for (const lista of Object.values(networkInterfaces())) {
    for (const i of lista ?? []) {
      if (i.family !== 'IPv4' || i.internal || i.address.startsWith('169.254.')) continue
      if (!ips.includes(i.address)) ips.push(i.address)
    }
  }
  const nota = (ip: string) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : 3)
  return ips.sort((a, b) => nota(a) - nota(b))
}

const TIPOS_DE_COMANDO = new Set([
  'mostrar',
  'fundo',
  'tela',
  'midia',
  'buscar',
  'repetir',
  'volume',
  'audio',
  'musica:slide',
  'musica:seguir',
  'musica:fechar',
  'apresentacao:slide',
  'apresentacao:passo',
  'apresentacao:fechar',
])

/** Confere o formato básico de um comando vindo do celular (o motor ignora o que não conhece). */
export function comandoRemoto(x: unknown): Comando {
  if (!x || typeof x !== 'object') throw new Error('Comando inválido.')
  const c = x as { tipo?: unknown; conteudo?: { tipo?: unknown; url?: unknown }; fonte?: { url?: unknown } | null; fundo?: { url?: unknown } }
  if (typeof c.tipo !== 'string' || !TIPOS_DE_COMANDO.has(c.tipo)) throw new Error(`Comando não permitido: ${String(c.tipo)}`)
  // arquivos só pelo protocolo do programa (que já confere se o arquivo foi liberado)
  for (const url of [c.conteudo?.url, c.fonte?.url, c.fundo?.url]) {
    if (url !== undefined && (typeof url !== 'string' || !url.startsWith('midia://'))) throw new Error('Endereço de arquivo não permitido.')
  }
  return x as Comando
}

function dentroDe(pasta: string, caminho: string): boolean {
  const p = resolve(pasta).toLowerCase()
  const c = resolve(caminho).toLowerCase()
  return c.startsWith(p + sep)
}

function lerCookie(req: IncomingMessage, nome: string): string | null {
  for (const parte of (req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = parte.trim().split('=')
    if (k === nome) return decodeURIComponent(v.join('='))
  }
  return null
}

function json(res: ServerResponse, status: number, dado: unknown, extras: Record<string, string> = {}): void {
  const corpo = JSON.stringify(dado ?? null)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Length': Buffer.byteLength(corpo),
    ...extras,
  })
  res.end(corpo)
}

function lerCorpo(req: IncomingMessage): Promise<unknown> {
  return new Promise((ok, falha) => {
    if (!(req.headers['content-type'] ?? '').startsWith('application/json')) {
      falha(new Error('Envie JSON.'))
      return
    }
    const partes: Buffer[] = []
    let tamanho = 0
    req.on('data', (b: Buffer) => {
      tamanho += b.length
      if (tamanho > LIMITE_CORPO) {
        falha(new Error('Pedido grande demais.'))
        req.destroy()
      } else partes.push(b)
    })
    req.on('end', () => {
      try {
        ok(JSON.parse(Buffer.concat(partes).toString('utf8') || 'null'))
      } catch {
        falha(new Error('JSON inválido.'))
      }
    })
    req.on('error', falha)
  })
}

export class ServidorRemoto extends EventEmitter {
  private servidor: Server | null = null
  private cfg: ConfigRemoto | null = null
  private portaPedida: number | null = null
  private portaAtual: number | null = null
  private erro: string | null = null
  private readonly clientes = new Set<ServerResponse>()
  private batida: NodeJS.Timeout | null = null
  private readonly erros = new Map<string, { n: number; ate: number }>()

  constructor(private readonly op: OpcoesServidorRemoto) {
    super()
  }

  /**
   * Aplica a configuração: liga, desliga ou troca de porta. `portaForcada` (autoteste) troca a
   * porta da configuração; 0 = qualquer porta livre.
   */
  aplicar(cfg: ConfigRemoto, portaForcada?: number): void {
    const pinAntes = this.pinExigido()
    this.cfg = cfg
    const porta = portaForcada ?? cfg.porta
    if (!cfg.ativo) {
      this.parar()
      this.erro = null
    } else if (!this.servidor || this.portaPedida !== porta) {
      this.parar()
      this.iniciar(porta)
    }
    // PIN mudou: os celulares conectados precisam digitar o novo
    if (pinAntes !== this.pinExigido()) this.desconectarTodos()
    this.emit('mudou', this.status())
  }

  status(): StatusRemoto {
    const porta = this.portaAtual
    return {
      ativo: !!this.cfg?.ativo,
      porta,
      enderecos: porta ? enderecosLocais().map((ip) => `http://${ip}:${porta}`) : [],
      pin: this.pinExigido(),
      erro: this.erro,
      conectados: this.clientes.size,
    }
  }

  /** Manda um evento a todos os celulares conectados. */
  transmitir(evento: EventoRemoto, dado: unknown): void {
    if (!this.clientes.size) return
    const msg = `event: ${evento}\ndata: ${JSON.stringify(dado ?? null)}\n\n`
    for (const res of this.clientes) res.write(msg)
  }

  encerrar(): void {
    this.parar()
  }

  private pinExigido(): string | null {
    return this.cfg?.exigirPin && this.cfg.pin ? this.cfg.pin : null
  }

  private iniciar(porta: number): void {
    this.portaPedida = porta
    this.erro = null
    const srv = createServer((req, res) => {
      this.tratar(req, res).catch((e) => {
        log.erro('Controle remoto: erro no pedido', req.method, req.url, e)
        if (!res.headersSent) json(res, 500, { ok: false, erro: e instanceof Error ? e.message : String(e) })
        else res.end()
      })
    })
    srv.on('error', (e: NodeJS.ErrnoException) => {
      this.erro =
        e.code === 'EADDRINUSE'
          ? `A porta ${porta} já está em uso por outro programa. Escolha outra porta.`
          : e.code === 'EACCES'
            ? `O Windows não deixou usar a porta ${porta}. Escolha outra (acima de 1024).`
            : `O controle remoto não ligou: ${e.message}`
      log.erro('Controle remoto:', this.erro)
      if (this.servidor === srv) {
        this.servidor = null
        this.portaAtual = null
      }
      this.emit('mudou', this.status())
    })
    srv.listen(porta, '0.0.0.0', () => {
      if (this.servidor !== srv) return
      this.portaAtual = (srv.address() as AddressInfo).port
      log.info(`Controle remoto ouvindo na porta ${this.portaAtual}: ${this.status().enderecos.join(', ') || '(sem rede)'}`)
      this.emit('mudou', this.status())
    })
    this.servidor = srv
    this.batida = setInterval(() => {
      for (const res of this.clientes) res.write(': batida\n\n')
    }, 15000)
  }

  private parar(): void {
    if (this.batida) clearInterval(this.batida)
    this.batida = null
    this.desconectarTodos()
    if (this.servidor) {
      this.servidor.close()
      this.servidor.closeAllConnections?.()
    }
    this.servidor = null
    this.portaAtual = null
    this.portaPedida = null
  }

  private desconectarTodos(): void {
    for (const res of this.clientes) res.end()
    this.clientes.clear()
  }

  private autorizado(req: IncomingMessage): boolean {
    const pin = this.pinExigido()
    return !pin || lerCookie(req, COOKIE) === tokenDoPin(pin)
  }

  private async tratar(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://remoto')
    const rota = url.pathname
    const metodo = req.method ?? 'GET'

    if (rota.startsWith('/api/')) {
      if (rota === '/api/sessao' && metodo === 'GET') {
        json(res, 200, { precisaPin: !!this.pinExigido(), autorizado: this.autorizado(req) })
        return
      }
      if (rota === '/api/entrar' && metodo === 'POST') return this.entrar(req, res)
      if (!this.autorizado(req)) {
        json(res, 401, { ok: false, erro: 'Digite o PIN.' })
        return
      }
      if (rota === '/api/eventos' && metodo === 'GET') return this.eventos(req, res)
      if (rota === '/api/chamar' && metodo === 'POST') return this.chamar(req, res)
      if (rota === '/api/arquivo' && metodo === 'GET') return this.arquivo(url, res)
      json(res, 404, { ok: false, erro: 'Não existe.' })
      return
    }

    if (metodo !== 'GET' && metodo !== 'HEAD') {
      res.writeHead(405).end()
      return
    }
    // a página e os arquivos dela (nada fora de out/renderer)
    const relativo = rota === '/' || rota === '/remoto.html' ? 'remoto.html' : decodeURIComponent(rota.slice(1))
    if (relativo !== 'remoto.html' && !relativo.startsWith('assets/')) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Não existe.')
      return
    }
    const caminho = join(this.op.pastaPaginas, relativo)
    if (!dentroDe(this.op.pastaPaginas, caminho)) {
      res.writeHead(403).end()
      return
    }
    await this.enviarArquivo(res, caminho, relativo === 'remoto.html' ? 'no-store' : 'public, max-age=86400', () =>
      relativo === 'remoto.html'
        ? 'A página do controle remoto não foi compilada. Feche o programa e abra pelo abrir.cmd (ou rode npm run build).'
        : 'Não existe.',
    )
  }

  private async entrar(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const ip = req.socket.remoteAddress ?? '?'
    const bloqueio = this.erros.get(ip)
    if (bloqueio && bloqueio.ate > Date.now()) {
      json(res, 429, { ok: false, erro: `Muitas tentativas. Espere ${Math.ceil((bloqueio.ate - Date.now()) / 1000)} s.` })
      return
    }
    const corpo = (await lerCorpo(req).catch(() => null)) as { pin?: unknown } | null
    const pin = this.pinExigido()
    if (!pin) {
      json(res, 200, { ok: true })
      return
    }
    if (typeof corpo?.pin === 'string' && corpo.pin.trim() === pin) {
      this.erros.delete(ip)
      json(res, 200, { ok: true }, { 'Set-Cookie': `${COOKIE}=${tokenDoPin(pin)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${60 * 60 * 24 * 365}` })
      log.info(`Controle remoto: ${ip} entrou com o PIN.`)
      return
    }
    const n = (bloqueio?.n ?? 0) + 1
    // depois de 5 erros, espera crescente (5 s, 10 s, 20 s… até 5 min)
    const ate = n >= 5 ? Date.now() + Math.min(300_000, 5000 * 2 ** (n - 5)) : 0
    this.erros.set(ip, { n, ate })
    log.aviso(`Controle remoto: PIN errado vindo de ${ip} (${n}ª vez).`)
    json(res, 401, { ok: false, erro: 'PIN errado.' })
  }

  private eventos(req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    res.write('retry: 2000\n\n')
    for (const [evento, dado] of this.op.inicial()) res.write(`event: ${evento}\ndata: ${JSON.stringify(dado ?? null)}\n\n`)
    this.clientes.add(res)
    log.info(`Controle remoto: ${req.socket.remoteAddress} conectou (${this.clientes.size} agora).`)
    this.emit('mudou', this.status())
    req.on('close', () => {
      if (this.clientes.delete(res)) this.emit('mudou', this.status())
    })
  }

  private async chamar(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let pedido: { metodo?: unknown; args?: unknown }
    try {
      pedido = ((await lerCorpo(req)) ?? {}) as typeof pedido
    } catch (e) {
      json(res, 400, { ok: false, erro: e instanceof Error ? e.message : String(e) })
      return
    }
    const metodo = pedido.metodo as MetodoRemoto
    if (!METODOS_REMOTO.includes(metodo)) {
      json(res, 400, { ok: false, erro: `Método não permitido: ${String(pedido.metodo)}` })
      return
    }
    const args = Array.isArray(pedido.args) ? pedido.args : []
    try {
      const valor = await this.op.chamar(metodo, args)
      json(res, 200, { ok: true, valor: valor ?? null })
    } catch (e) {
      json(res, 400, { ok: false, erro: e instanceof Error ? e.message : String(e) })
    }
  }

  private async arquivo(url: URL, res: ServerResponse): Promise<void> {
    let caminho: string
    try {
      caminho = caminhoDaUrlMidia(url.searchParams.get('u') ?? '')
    } catch {
      res.writeHead(400).end()
      return
    }
    if (!this.op.pastasArquivos().some((p) => dentroDe(p, caminho))) {
      res.writeHead(403).end()
      return
    }
    await this.enviarArquivo(res, caminho, 'public, max-age=3600', () => 'Não existe.')
  }

  private async enviarArquivo(res: ServerResponse, caminho: string, cache: string, faltando: () => string): Promise<void> {
    let tamanho: number
    try {
      const st = await fsp.stat(caminho)
      if (!st.isFile()) throw new Error('não é arquivo')
      tamanho = st.size
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end(faltando())
      return
    }
    res.writeHead(200, {
      'Content-Type': MIME[extname(caminho).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': tamanho,
      'Cache-Control': cache,
      'X-Content-Type-Options': 'nosniff',
    })
    createReadStream(caminho).pipe(res)
  }
}
