/**
 * Conexão com a IA da Bíblia automática: Anthropic (Claude, pelo SDK oficial) ou qualquer API compatível
 * com OpenAI (OpenRouter, New API, Ollama, LM Studio…). Tipo, URL, chave e modelo vêm das Configurações.
 * Porta de `ia/provedores.py` do projeto de transcrição.
 *
 * Cada chamada custa: o pedido vai sem raciocínio (`thinking` desligado) e com esforço baixo, e a
 * resposta em JSON com esquema. Se o modelo não aceitar algum desses ajustes, o ajuste sai e o
 * programa lembra (até a configuração mudar).
 */
import Anthropic from '@anthropic-ai/sdk'
import type { TipoApiIA } from '../../shared/config'

export type Buscar = (url: string, init?: RequestInit) => Promise<Response>

export class ErroIA extends Error {
  constructor(
    mensagem: string,
    readonly status?: number,
  ) {
    super(mensagem)
  }
}

export interface ConexaoIA {
  tipo: TipoApiIA
  url: string
  chave: string
  modelo: string
}

/** A resposta é um JSON pequeno; o teto evita surpresa na conta. */
const MAX_TOKENS = 1500
/** com raciocínio (modelos que não aceitam desligar), sobra espaço para ele */
const MAX_TOKENS_PENSANDO = 4000
const TEMPO_MS = 30_000
const AGENTE = 'Sonoplastia/0.2'

/** URL que o programa usa de fato. */
export function urlEfetiva(c: Pick<ConexaoIA, 'tipo' | 'url'>): string {
  const padrao = c.tipo === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.openai.com/v1'
  let url = (c.url.trim() || padrao).replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`
  let caminho = '/'
  try {
    caminho = new URL(url).pathname
  } catch {
    throw new ErroIA(`URL da API inválida: ${c.url}`)
  }
  if (c.tipo === 'openai') {
    // servidores compatíveis (New API, One API, LiteLLM…) respondem em /v1; sem caminho, /models cai na
    // página web. URLs com caminho (OpenRouter /api/v1) ficam como estão.
    if (caminho === '' || caminho === '/') url += '/v1'
  } else {
    // o SDK da Anthropic já acrescenta /v1/messages
    url = url.replace(/\/v1$/i, '')
  }
  return url
}

export interface RespostaIA {
  dados: unknown
  uso: { entrada: number; saida: number }
}

export interface ProvedorIA {
  completarJson(sistema: string, usuario: string, esquema: Record<string, unknown>, formato: string): Promise<RespostaIA>
  listarModelos(): Promise<Array<{ id: string; nome: string }>>
}

export function criarProvedor(c: ConexaoIA, buscar?: Buscar): ProvedorIA {
  return c.tipo === 'anthropic' ? new ProvedorAnthropic(c, buscar) : new ProvedorOpenAI(c, buscar ?? fetch)
}

/** Pega o primeiro objeto JSON do texto (alguns modelos cercam com ```json … ```). */
export function extrairJson(texto: string): unknown {
  const t = texto.trim()
  try {
    return JSON.parse(t)
  } catch {
    // segue
  }
  const m = /\{[\s\S]*\}/.exec(t)
  if (!m) throw new ErroIA('A IA não devolveu JSON.')
  try {
    return JSON.parse(m[0])
  } catch {
    throw new ErroIA('A IA devolveu um JSON inválido.')
  }
}

class ProvedorAnthropic implements ProvedorIA {
  private readonly cliente: Anthropic
  private semPensar = true
  private comEsforco = true
  private comFormato = true

  constructor(
    private readonly c: ConexaoIA,
    buscar?: Buscar,
  ) {
    if (!c.chave) throw new ErroIA('Falta a chave da API da IA.')
    this.cliente = new Anthropic({
      apiKey: c.chave,
      baseURL: urlEfetiva(c),
      timeout: TEMPO_MS,
      maxRetries: 1,
      // o SDK 1.x manda a chave como "Authorization: Bearer"; servidores intermediários (New API, LiteLLM…)
      // podem ler só "X-Api-Key", então com endereço próprio a mesma chave vai nos dois
      ...(c.url.trim() ? { defaultHeaders: { 'X-Api-Key': c.chave } } : {}),
      ...(buscar ? { fetch: buscar as unknown as typeof fetch } : {}),
    })
  }

  async completarJson(sistema: string, usuario: string, esquema: Record<string, unknown>, formato: string): Promise<RespostaIA> {
    if (!this.c.modelo) throw new ErroIA('Escolha o modelo da IA nas Configurações.')
    for (let tentativa = 0; tentativa < 4; tentativa++) {
      const outputConfig: Anthropic.OutputConfig = {}
      if (this.comEsforco) outputConfig.effort = 'low'
      if (this.comFormato) outputConfig.format = { type: 'json_schema', schema: esquema }
      try {
        const r = await this.cliente.messages.create({
          model: this.c.modelo,
          max_tokens: this.semPensar ? MAX_TOKENS : MAX_TOKENS_PENSANDO,
          system: this.comFormato ? sistema : `${sistema}\n${formato}`,
          messages: [{ role: 'user', content: usuario }],
          ...(Object.keys(outputConfig).length ? { output_config: outputConfig } : {}),
          ...(this.semPensar ? { thinking: { type: 'disabled' as const } } : {}),
        })
        const u = r.usage
        const uso = { entrada: u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0), saida: u.output_tokens }
        if (r.stop_reason === 'refusal') return { dados: {}, uso }
        let texto = ''
        for (const b of r.content) if (b.type === 'text') texto += b.text
        return { dados: extrairJson(texto), uso }
      } catch (e) {
        if (e instanceof Anthropic.BadRequestError && this.tirarAjuste(e.message)) continue
        throw traduzirErroAnthropic(e, urlEfetiva(this.c))
      }
    }
    throw new ErroIA('O modelo recusou o formato do pedido.')
  }

  /** O modelo não aceitou um dos ajustes de economia: tira o que a mensagem cita (ou o próximo da lista). */
  private tirarAjuste(mensagem: string): boolean {
    const m = mensagem.toLowerCase()
    if (this.semPensar && (m.includes('thinking') || m.includes('disabled'))) this.semPensar = false
    else if (this.comEsforco && m.includes('effort')) this.comEsforco = false
    else if (this.comFormato && (m.includes('format') || m.includes('schema') || m.includes('output_config'))) this.comFormato = false
    else if (this.semPensar) this.semPensar = false
    else if (this.comEsforco) this.comEsforco = false
    else if (this.comFormato) this.comFormato = false
    else return false
    return true
  }

  async listarModelos(): Promise<Array<{ id: string; nome: string }>> {
    const r: Array<{ id: string; nome: string }> = []
    try {
      for await (const m of this.cliente.models.list({ limit: 100 })) {
        r.push({ id: m.id, nome: m.display_name || m.id })
        if (r.length >= 200) break
      }
    } catch (e) {
      throw traduzirErroAnthropic(e, urlEfetiva(this.c))
    }
    return r
  }
}

function traduzirErroAnthropic(e: unknown, url: string): ErroIA {
  if (e instanceof ErroIA) return e
  if (e instanceof Anthropic.AuthenticationError) return new ErroIA('Chave recusada pela API (401).', 401)
  if (e instanceof Anthropic.PermissionDeniedError) {
    if (String(e.message).includes('1010')) return new ErroIA('O Cloudflare do servidor bloqueou o acesso (erro 1010).', 403)
    return new ErroIA(`Acesso negado pela API (403). ${e.message}`, 403)
  }
  if (e instanceof Anthropic.NotFoundError) return new ErroIA('Modelo ou endereço não encontrado (404). Confira a URL e o nome do modelo.', 404)
  if (e instanceof Anthropic.RateLimitError) return new ErroIA('Limite de uso da API atingido; tente de novo em instantes.', 429)
  if (e instanceof Anthropic.BadRequestError) return new ErroIA(`Pedido recusado: ${e.message}`, 400)
  if (e instanceof Anthropic.APIConnectionTimeoutError) return new ErroIA('A IA demorou demais para responder.')
  if (e instanceof Anthropic.APIConnectionError) return new ErroIA(`Não consegui conectar em ${url}.`)
  if (e instanceof Anthropic.APIError) return new ErroIA(`Erro ${e.status ?? ''} da API: ${e.message}`, e.status)
  return new ErroIA(e instanceof Error ? e.message : String(e))
}

class ProvedorOpenAI implements ProvedorIA {
  private comFormato = true

  constructor(
    private readonly c: ConexaoIA,
    private readonly buscar: Buscar,
  ) {}

  private async pedir(metodo: 'GET' | 'POST', caminho: string, corpo?: unknown): Promise<Record<string, unknown>> {
    const url = `${urlEfetiva(this.c)}${caminho}`
    const cabecalhos: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': AGENTE }
    if (this.c.chave) cabecalhos.Authorization = `Bearer ${this.c.chave}`
    let r: Response
    try {
      r = await this.buscar(url, {
        method: metodo,
        headers: cabecalhos,
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: AbortSignal.timeout(TEMPO_MS),
      })
    } catch (e) {
      if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')) throw new ErroIA('A IA demorou demais para responder.')
      throw new ErroIA(`Não consegui conectar em ${urlEfetiva(this.c)}.`)
    }
    const texto = await r.text()
    if (!r.ok) {
      const detalhe = texto.slice(0, 300).trim()
      if (r.status === 403 && detalhe.includes('1010')) throw new ErroIA('O Cloudflare do servidor bloqueou o acesso (erro 1010).', 403)
      if (r.status === 401) throw new ErroIA(`Chave recusada pela API (401). ${detalhe}`, 401)
      if (r.status === 403) throw new ErroIA(`Acesso negado pela API (403). ${detalhe}`, 403)
      throw new ErroIA(`Erro ${r.status} da API: ${detalhe}`, r.status)
    }
    try {
      return JSON.parse(texto) as Record<string, unknown>
    } catch {
      throw new ErroIA(`${url} respondeu uma página, não a API. Confira a URL (muitas terminam em /v1).`)
    }
  }

  async completarJson(sistema: string, usuario: string, _esquema: Record<string, unknown>, formato: string): Promise<RespostaIA> {
    if (!this.c.modelo) throw new ErroIA('Escolha o modelo da IA nas Configurações.')
    const corpo: Record<string, unknown> = {
      model: this.c.modelo,
      max_tokens: MAX_TOKENS,
      messages: [
        { role: 'system', content: `${sistema}\n${formato}` },
        { role: 'user', content: usuario },
      ],
    }
    let dados: Record<string, unknown>
    try {
      dados = await this.pedir('POST', '/chat/completions', this.comFormato ? { ...corpo, response_format: { type: 'json_object' } } : corpo)
    } catch (e) {
      if (!(e instanceof ErroIA) || e.status !== 400 || !this.comFormato) throw e
      this.comFormato = false // o servidor não aceita response_format
      dados = await this.pedir('POST', '/chat/completions', corpo)
    }
    const uso = (dados.usage ?? {}) as { prompt_tokens?: number; completion_tokens?: number }
    const escolhas = dados.choices as Array<{ message?: { content?: string | null } }> | undefined
    const texto = escolhas?.[0]?.message?.content ?? ''
    return { dados: extrairJson(texto), uso: { entrada: Number(uso.prompt_tokens ?? 0), saida: Number(uso.completion_tokens ?? 0) } }
  }

  async listarModelos(): Promise<Array<{ id: string; nome: string }>> {
    const dados = await this.pedir('GET', '/models')
    const lista = (dados.data ?? dados.models ?? []) as Array<{ id: string; name?: string }>
    return lista.map((m) => ({ id: String(m.id), nome: m.name || String(m.id) })).sort((a, b) => a.id.localeCompare(b.id))
  }
}
