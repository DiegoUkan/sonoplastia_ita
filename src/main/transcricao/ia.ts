/**
 * A IA lê a fala recente e os candidatos da busca e escolhe as passagens para o operador (porta de
 * `ia/escolha.py` e `ia/provedores.py`).
 *
 * O texto bíblico nunca vem da IA: ela só devolve referências, conferidas na Bíblia deste programa.
 * O pedido é enxuto de propósito (cada chamada custa): sem tabela de livros, candidatos curtos,
 * sem raciocínio estendido e com esforço baixo.
 */
import Anthropic from '@anthropic-ai/sdk'
import { LIGACOES, type Ligacao } from '../../shared/transcricao'
import { type BibliaMemoria, type Candidato, palavras } from './busca'
import { resolverLivro } from './livrosFalados'
import { type Passagem, passagem, referencia, validar } from './passagem'

export const MAX_VERSICULOS = 8
/** o começo do versículo basta para a IA reconhecer */
const MAX_CARACTERES_CANDIDATO = 160
/** a resposta é um JSON pequeno (~150 tokens); o teto evita surpresa na conta */
const MAX_TOKENS_RESPOSTA = 1500
/** o Cloudflare de alguns servidores bloqueia clientes sem nome conhecido (erro 1010) */
const USER_AGENT = 'sonoplastia-versiculos/0.1'

export const SISTEMA = `Você ajuda o operador de projeção de um culto evangélico no Brasil. Recebe a transcrição
automática (pode ter erros) dos últimos ~45 s da fala do pregador e versículos candidatos de uma busca
por palavras (podem não ter relação com o tema).
Sugira as passagens que o operador vai querer mostrar no telão agora.

Regras:
- 0 a 3 passagens, da mais para a menos relevante. Lista vazia para aviso, oração, saudação,
  louvor ou fala sem ligação clara com um texto bíblico.
- Passagem = um versículo ou vários seguidos do mesmo capítulo (ex.: Fp 4:6-7), no máximo
  ${MAX_VERSICULOS}. Para um versículo só, "fim" = "inicio".
- Se o pregador lê, cita ou parafraseia um texto, sugira exatamente esse texto.
- Prefira os candidatos; outra passagem só se tiver certeza da referência exata.
- Mais peso ao que foi dito por último. Não repita as "já sugeridas".
- "livro": nome ou sigla do livro (ex.: "Fp", "1Co", "Salmos"). "motivo": até 12 palavras.
- "forca" = quão diretamente a fala se refere à passagem, e "ligacao" a categoria:
  100 citacao (lê/cita quase igual ou diz a referência), 85 parafrase (mesmo conteúdo com outras
  palavras), 70 alusao (menciona a história, o personagem ou frase famosa), 50 tema_central (é o
  ponto principal pregado), 30 tema_relacionado (tem a ver, mas ele não se refere a ela), 10 distante.
  Citação vale em qualquer tradução (ARA, NVI, ACF...): o pregador pode ler outra versão.
- Devolva só passagens com forca >= "rigor mínimo" da mensagem. Não aumente a nota para passar.`

export const ESQUEMA = {
  type: 'object',
  properties: {
    passagens: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          livro: { type: 'string' },
          capitulo: { type: 'integer' },
          inicio: { type: 'integer' },
          fim: { type: 'integer' },
          ligacao: { type: 'string', enum: [...LIGACOES] },
          forca: { type: 'integer' },
          motivo: { type: 'string' },
        },
        required: ['livro', 'capitulo', 'inicio', 'fim', 'ligacao', 'forca', 'motivo'],
        additionalProperties: false,
      },
    },
  },
  required: ['passagens'],
  additionalProperties: false,
} as const

/** Para quando o servidor não aceita saída estruturada: um exemplo curto custa menos que o esquema. */
const FORMATO_TEXTO =
  'Responda só com JSON: {"passagens":[{"livro":"Fp","capitulo":4,"inicio":6,"fim":7,"ligacao":"citacao","forca":100,"motivo":"..."}]}'

export class ErroIA extends Error {}

export interface UsoIA {
  entrada: number
  saida: number
}

/** Quem responde à IA (a Anthropic de verdade, ou uma falsa nos testes). */
export interface ProvedorIA {
  completarJson(sistema: string, usuario: string): Promise<{ dados: unknown; uso: UsoIA }>
}

export interface ConfigProvedor {
  url: string
  chave: string
  modelo: string
}

/**
 * Pela API da Anthropic (ou por um servidor que fale a mesma API, como o New API do usuário).
 * Nem todo modelo/servidor aceita raciocínio desligado, esforço e saída estruturada: no erro 400, tenta
 * de novo sem eles (nessa ordem) e lembra o que funcionou.
 */
export class ProvedorAnthropic implements ProvedorIA {
  private readonly cliente: Anthropic
  /** 0 = tudo; 1 = sem desligar o raciocínio; 2 = também sem esforço; 3 = também sem saída estruturada */
  private nivel = 0

  constructor(private readonly cfg: ConfigProvedor) {
    if (!cfg.chave.trim()) throw new ErroIA('Falta a chave da API da IA.')
    if (!cfg.modelo.trim()) throw new ErroIA('Escolha o modelo da IA nas configurações.')
    const chave = cfg.chave.trim()
    this.cliente = new Anthropic({
      apiKey: chave,
      baseURL: urlDaApi(cfg.url),
      timeout: 30_000,
      maxRetries: 1,
      // o SDK manda a chave em "Authorization: Bearer"; servidores intermediários (New API, LiteLLM…)
      // podem ler só "X-Api-Key", então com endereço próprio a mesma chave vai nos dois
      defaultHeaders: { 'User-Agent': USER_AGENT, ...(cfg.url.trim() ? { 'X-Api-Key': chave } : {}) },
    })
  }

  async completarJson(sistema: string, usuario: string): Promise<{ dados: unknown; uso: UsoIA }> {
    let erro400: unknown = null
    for (let n = this.nivel; n <= 3; n++) {
      try {
        const r = await this.cliente.messages.create({
          model: this.cfg.modelo.trim(),
          max_tokens: MAX_TOKENS_RESPOSTA,
          system: n >= 3 ? `${sistema}\n${FORMATO_TEXTO}` : sistema,
          messages: [{ role: 'user', content: usuario }],
          ...(n < 1 ? { thinking: { type: 'disabled' as const } } : {}),
          ...(n < 3 ? { output_config: { ...(n < 2 ? { effort: 'low' as const } : {}), format: { type: 'json_schema' as const, schema: ESQUEMA } } } : {}),
        })
        this.nivel = n
        const u = r.usage
        const uso = { entrada: u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0), saida: u.output_tokens }
        if (r.stop_reason === 'refusal') return { dados: { passagens: [] }, uso }
        const texto = r.content.find((b) => b.type === 'text')
        return { dados: extrairJson(texto?.type === 'text' ? texto.text : ''), uso }
      } catch (e) {
        if (e instanceof Anthropic.BadRequestError) {
          erro400 = e
          continue
        }
        throw traduzirErro(e)
      }
    }
    throw traduzirErro(erro400)
  }
}

/** Sem endereço, a Anthropic; com endereço, o servidor indicado (sem a barra no fim). */
export function urlDaApi(url: string): string {
  const u = url.trim().replace(/\/+$/, '')
  return u || 'https://api.anthropic.com'
}

function traduzirErro(e: unknown): ErroIA {
  if (e instanceof ErroIA) return e
  if (e instanceof Anthropic.AuthenticationError) return new ErroIA('A chave da IA foi recusada.')
  if (e instanceof Anthropic.PermissionDeniedError) return new ErroIA('A API da IA negou o acesso (403).')
  if (e instanceof Anthropic.RateLimitError) return new ErroIA('Limite de uso da IA atingido; tente de novo em instantes.')
  if (e instanceof Anthropic.NotFoundError) return new ErroIA('A API não encontrou o modelo (confira o nome do modelo e o endereço).')
  if (e instanceof Anthropic.BadRequestError) return new ErroIA(`O pedido foi recusado: ${e.message}`)
  if (e instanceof Anthropic.APIConnectionError) return new ErroIA('Sem conexão com a API da IA.')
  if (e instanceof Anthropic.APIError) return new ErroIA(`Erro ${e.status ?? '?'} da API da IA.`)
  return new ErroIA(e instanceof Error ? e.message : String(e))
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

export interface Escolha {
  passagem: Passagem
  motivo: string
  ligacao: Ligacao
  forca: number
}

export class EscolhedorIA {
  ultimoUso: UsoIA = { entrada: 0, saida: 0 }

  constructor(
    private readonly provedor: ProvedorIA,
    private readonly biblia: BibliaMemoria,
  ) {}

  /** rigor 0–100: só volta passagem com forca >= rigor (o filtro final é nosso, não da IA). */
  async escolher(fala: string, candidatos: Candidato[], jaSugeridas: Passagem[], rigor = 0): Promise<Escolha[]> {
    const palavrasFala = new Set(palavras(fala))
    const linhas = candidatos.map((c) => {
      let texto = this.textoMaisParecido(c.passagem, palavrasFala)
      if (texto.length > MAX_CARACTERES_CANDIDATO) {
        const corte = texto.slice(0, MAX_CARACTERES_CANDIDATO)
        texto = `${corte.includes(' ') ? corte.slice(0, corte.lastIndexOf(' ')) : corte}…`
      }
      return `${referencia(c.passagem, true)} ${texto}`
    })
    const recentes = jaSugeridas.slice(-10).map((p) => referencia(p, true)).join('; ') || 'nenhuma'
    const usuario = `Rigor mínimo: ${rigor}\nJá sugeridas: ${recentes}\n<transcricao>\n${fala}\n</transcricao>\nCandidatos:\n${linhas.join('\n')}`
    const { dados, uso } = await this.provedor.completarJson(SISTEMA, usuario)
    this.ultimoUso = uso
    const itens = (dados as { passagens?: unknown } | null)?.passagens
    const escolhas: Escolha[] = []
    for (const bruto of Array.isArray(itens) ? itens : []) {
      if (escolhas.length === 3) break
      const item = bruto as Record<string, unknown>
      const livro = resolverLivro(String(item.livro ?? ''))
      const capitulo = Number(item.capitulo)
      const inicio = Number(item.inicio)
      const forca = Number(item.forca ?? 0)
      if (livro === null || !Number.isInteger(capitulo) || !Number.isInteger(inicio) || !(forca >= rigor)) continue
      let fim = Number(item.fim ?? inicio)
      if (!Number.isInteger(fim)) fim = inicio
      fim = Math.min(Math.max(fim, inicio), inicio + MAX_VERSICULOS - 1)
      const p = validar(this.biblia, passagem(livro, capitulo, inicio, fim))
      if (!p) continue
      const ligacao = String(item.ligacao ?? '')
      escolhas.push({
        passagem: p,
        motivo: String(item.motivo ?? '')
          .trim()
          .slice(0, 120),
        ligacao: (LIGACOES as readonly string[]).includes(ligacao) ? (ligacao as Ligacao) : '',
        forca,
      })
    }
    return escolhas
  }

  /**
   * O texto na versão com mais palavras em comum com a fala (a que o pregador está lendo). Mostrar
   * outra versão faz a IA confundir citação com paráfrase.
   */
  private textoMaisParecido(p: Passagem, palavrasFala: Set<string>): string {
    let melhor = ''
    let nota = -1
    this.biblia.siglas.forEach((_, v) => {
      const t = this.biblia
        .texto(p, v)
        .map(([, x]) => x)
        .join(' ')
      let n = 0
      for (const x of new Set(palavras(t))) if (palavrasFala.has(x)) n++
      if (t && n > nota) {
        nota = n
        melhor = t
      }
    })
    return melhor
  }
}
