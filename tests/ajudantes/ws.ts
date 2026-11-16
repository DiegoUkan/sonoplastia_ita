/**
 * Servidor WebSocket mínimo para os testes (o Node não tem servidor WebSocket embutido): aperto de mão,
 * quadros de texto do cliente (mascarados, até 64 KB) e envio de texto. Só o que o ElevenLabs de
 * mentira precisa.
 */
import { createHash } from 'node:crypto'
import { createServer, type IncomingMessage } from 'node:http'
import type { AddressInfo, Socket } from 'node:net'

export class ClienteWs {
  mensagens: string[] = []
  fechado = false
  private resto = Buffer.alloc(0)
  private ouvintes: Array<(m: string) => void> = []

  constructor(
    private readonly sock: Socket,
    readonly pedido: IncomingMessage,
  ) {
    sock.on('data', (d: Buffer) => this.ler(d))
    sock.on('close', () => {
      this.fechado = true
    })
    sock.on('error', () => {})
  }

  aoMensagem(f: (m: string) => void): void {
    this.ouvintes.push(f)
  }

  enviar(texto: string): void {
    const dados = Buffer.from(texto, 'utf8')
    const cab = dados.length < 126 ? Buffer.from([0x81, dados.length]) : Buffer.from([0x81, 126, dados.length >> 8, dados.length & 0xff])
    this.sock.write(Buffer.concat([cab, dados]))
  }

  fechar(): void {
    if (this.fechado) return
    this.sock.write(Buffer.from([0x88, 0x00]))
    this.sock.end()
  }

  private ler(d: Buffer): void {
    this.resto = Buffer.concat([this.resto, d])
    for (;;) {
      if (this.resto.length < 2) return
      const op = this.resto[0]! & 0x0f
      let tam = this.resto[1]! & 0x7f
      let pos = 2
      if (tam === 126) {
        if (this.resto.length < 4) return
        tam = this.resto.readUInt16BE(2)
        pos = 4
      } else if (tam === 127) {
        if (this.resto.length < 10) return
        tam = Number(this.resto.readBigUInt64BE(2))
        pos = 10
      }
      if (this.resto.length < pos + 4 + tam) return
      const mascara = this.resto.subarray(pos, pos + 4)
      const dados = Buffer.from(this.resto.subarray(pos + 4, pos + 4 + tam))
      for (let i = 0; i < dados.length; i++) dados[i]! ^= mascara[i % 4]!
      this.resto = this.resto.subarray(pos + 4 + tam)
      if (op === 1) {
        const m = dados.toString('utf8')
        this.mensagens.push(m)
        for (const f of this.ouvintes) f(m)
      } else if (op === 8) {
        this.fechar()
      }
    }
  }
}

export async function servidorWs(opcoes: { recusar?: number; aoConectar?: (c: ClienteWs) => void } = {}) {
  const clientes: ClienteWs[] = []
  const srv = createServer()
  srv.on('upgrade', (req, sock: Socket) => {
    if (opcoes.recusar) {
      sock.end(`HTTP/1.1 ${opcoes.recusar} Recusado\r\nContent-Length: 0\r\n\r\n`)
      return
    }
    const chave = String(req.headers['sec-websocket-key'] ?? '')
    const aceite = createHash('sha1').update(`${chave}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64')
    sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${aceite}\r\n\r\n`)
    const c = new ClienteWs(sock, req)
    clientes.push(c)
    opcoes.aoConectar?.(c)
  })
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r))
  const porta = (srv.address() as AddressInfo).port
  return {
    url: `ws://127.0.0.1:${porta}/v1/speech-to-text/realtime`,
    clientes,
    fechar: () =>
      new Promise<void>((r) => {
        for (const c of clientes) c.fechar()
        srv.close(() => r())
      }),
  }
}
