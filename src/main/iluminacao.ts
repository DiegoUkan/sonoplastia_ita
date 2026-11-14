/**
 * Conversa com o sistema de iluminação (luz.local) pela rede, do processo principal (a página dele não
 * libera acesso direto das janelas). Tudo com tempo limite curto: a luz nunca pode travar o programa.
 */
import { lookup } from 'node:dns/promises'
import { type EstadoLuz, enderecoDaLuz, relesVisiveis } from '../shared/iluminacao'
import { log } from './log'

export interface ConfigLuz {
  endereco: string
  usuario: string
}

type Buscar = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>
/** nome → IP (no Windows, achar um nome ".local" leva uns 3 segundos) */
type Resolver = (nome: string) => Promise<string>

const TEMPO_LIMITE_MS = 4000
/** o IP achado vale por 10 minutos (ou até um pedido falhar) */
const VALIDADE_IP_MS = 10 * 60_000

export class ClienteIluminacao {
  private ip: { nome: string; ip: Promise<string>; em: number } | null = null

  constructor(
    private readonly cfg: () => ConfigLuz,
    private readonly buscar: Buscar = (url, init) => fetch(url, init),
    private readonly resolver: Resolver = async (nome) => (await lookup(nome, { family: 4 })).address,
  ) {}

  /** Endereço com o IP no lugar do nome (guardado), para não esperar a busca do nome a cada pedido. */
  private async base(): Promise<string> {
    const base = enderecoDaLuz(this.cfg().endereco)
    if (!base) throw new Error('Endereço da iluminação não configurado.')
    const u = new URL(base)
    if (/^[\d.]+$/.test(u.hostname) || u.hostname === 'localhost') return base
    if (!this.ip || this.ip.nome !== u.hostname || Date.now() - this.ip.em > VALIDADE_IP_MS) {
      const p = this.resolver(u.hostname)
      this.ip = { nome: u.hostname, ip: p, em: Date.now() }
      p.catch(() => {
        if (this.ip?.ip === p) this.ip = null
      })
    }
    try {
      u.hostname = await this.ip.ip
    } catch {
      throw new Error(`O sistema de iluminação (${base}) não foi encontrado na rede.`)
    }
    return u.toString().replace(/\/+$/, '')
  }

  /** Procura o endereço já ao abrir o programa (o primeiro clique em "Luzes" fica rápido). */
  preparar(): void {
    this.base().catch(() => {})
  }

  private async pedir(caminho: string, params: Record<string, string> = {}): Promise<string> {
    const nome = enderecoDaLuz(this.cfg().endereco)
    const base = await this.base()
    const q = new URLSearchParams(params).toString()
    const url = `${base}${caminho}${q ? `?${q}` : ''}`
    let r
    try {
      r = await this.buscar(url, { signal: AbortSignal.timeout(TEMPO_LIMITE_MS) })
    } catch (e) {
      // o IP pode ter mudado: procura o nome de novo no próximo pedido
      this.ip = null
      const motivo = e instanceof Error && e.name === 'TimeoutError' ? 'não respondeu a tempo' : 'não foi encontrado na rede'
      throw new Error(`O sistema de iluminação (${nome}) ${motivo}.`)
    }
    if (!r.ok) throw new Error(`O sistema de iluminação respondeu com erro ${r.status}.`)
    return r.text()
  }

  private usuario(): string {
    return this.cfg().usuario.trim() || 'Sonoplastia'
  }

  async estado(): Promise<EstadoLuz> {
    try {
      const [status, nomes, cenarios] = await Promise.all([this.pedir('/status'), this.pedir('/get-names'), this.pedir('/list-scenarios')])
      const estados = JSON.parse(status) as number[]
      const listaNomes = JSON.parse(nomes) as string[]
      const listaCenarios = JSON.parse(cenarios) as string[]
      return {
        conectado: true,
        reles: relesVisiveis(Array.isArray(listaNomes) ? listaNomes.map(String) : [], Array.isArray(estados) ? estados : []),
        cenarios: Array.isArray(listaCenarios) ? listaCenarios.map(String) : [],
        erro: null,
      }
    } catch (e) {
      return { conectado: false, reles: [], cenarios: [], erro: e instanceof Error ? e.message : String(e) }
    }
  }

  /** Liga ou desliga um relé (o sistema só alterna). Devolve o estado novo. */
  async alternar(id: number): Promise<boolean> {
    if (!Number.isInteger(id) || id < 0 || id > 31) throw new Error('Relé inválido.')
    const r = await this.pedir('/toggle', { id: String(id), user: this.usuario() })
    log.info(`Iluminação: relé ${id} → ${r.trim() === '1' ? 'ligado' : 'desligado'}`)
    return r.trim() === '1'
  }

  async cenario(nome: string): Promise<void> {
    const n = String(nome ?? '').trim()
    if (!n || n.length > 100) throw new Error('Cenário inválido.')
    await this.pedir('/load-scenario', { name: n, user: this.usuario() })
    log.info(`Iluminação: cenário "${n}"`)
  }

  /** Para a liturgia: aplica o cenário sem esperar (um erro só vai para o registro). */
  cenarioSemEsperar(nome: string): void {
    this.cenario(nome).catch((e) => log.erro(`Iluminação: não aplicou o cenário "${nome}"`, e))
  }
}
