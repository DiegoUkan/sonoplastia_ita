/**
 * O pedido à IA: a fala recente e os candidatos da busca; a resposta são referências, nunca texto.
 * O texto que vai para a tela sempre vem da Bíblia do programa. Porta de `ia/escolha.py`.
 * O pedido é enxuto de propósito (cada chamada custa): sem tabela de livros, candidatos curtos.
 */
import { type Passagem, resolverLivro, type TamanhosBiblia, validarPassagem } from '../../shared/biblia/falada'
import type { LigacaoSugestao } from '../../shared/transcricao/tipos'

export const MAX_VERSICULOS = 8
/** o começo do versículo basta para a IA reconhecer */
export const MAX_CARACTERES_CANDIDATO = 160
export const MAX_ESCOLHAS = 3

export const LIGACOES = ['citacao', 'parafrase', 'alusao', 'tema_central', 'tema_relacionado', 'distante'] as const

export function sistemaDaIA(janelaS: number): string {
  return `Você ajuda o operador de projeção de um culto adventista no Brasil. Recebe a transcrição
automática (pode ter erros) dos últimos ~${janelaS} s da fala do pregador e versículos candidatos de uma busca.
Sugira as passagens que o operador vai querer mostrar no telão agora.

Regras:
- 0 a ${MAX_ESCOLHAS} passagens, da mais para a menos relevante. Lista vazia para aviso, oração, saudação,
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
}

export const ESQUEMA: Record<string, unknown> = {
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
}

/** Para APIs sem saída estruturada: um exemplo curto custa bem menos tokens que o esquema inteiro. */
export const FORMATO_TEXTO =
  'Responda só com JSON: {"passagens":[{"livro":"Fp","capitulo":4,"inicio":6,"fim":7,"ligacao":"citacao","forca":100,"motivo":"..."}]}'

export function cortarCandidato(texto: string): string {
  if (texto.length <= MAX_CARACTERES_CANDIDATO) return texto
  const corte = texto.slice(0, MAX_CARACTERES_CANDIDATO)
  const espaco = corte.lastIndexOf(' ')
  return `${espaco > 40 ? corte.slice(0, espaco) : corte}…`
}

/** Mensagem do usuário: rigor, já sugeridas, a fala e os candidatos ("Jo 3:16 Porque Deus amou…"). */
export function montarPedido(fala: string, candidatos: Array<{ referencia: string; texto: string }>, jaSugeridas: string[], rigor: number): string {
  const linhas = candidatos.map((c) => `${c.referencia} ${cortarCandidato(c.texto)}`)
  return [
    `Rigor mínimo: ${rigor}`,
    `Já sugeridas: ${jaSugeridas.slice(-10).join('; ') || 'nenhuma'}`,
    `<transcricao>\n${fala}\n</transcricao>`,
    `Candidatos:\n${linhas.join('\n')}`,
  ].join('\n')
}

export interface Escolha {
  passagem: Passagem
  motivo: string
  ligacao: LigacaoSugestao
  forca: number
}

/** Confere a resposta: livro conhecido, capítulo e versículos que existem, força >= rigor (o filtro final é nosso). */
export function lerEscolhas(dados: unknown, rigor: number, biblia: TamanhosBiblia): Escolha[] {
  const lista = (dados as { passagens?: unknown } | null)?.passagens
  if (!Array.isArray(lista)) return []
  const r: Escolha[] = []
  for (const item of lista) {
    if (r.length >= MAX_ESCOLHAS) break
    if (!item || typeof item !== 'object') continue
    const x = item as Record<string, unknown>
    const livro = resolverLivro(String(x.livro ?? ''))
    const capitulo = Math.trunc(Number(x.capitulo))
    const inicio = Math.trunc(Number(x.inicio))
    const forca = Math.trunc(Number(x.forca ?? 0))
    if (!livro || !Number.isFinite(capitulo) || !Number.isFinite(inicio) || !Number.isFinite(forca) || forca < rigor) continue
    let fim = Math.trunc(Number(x.fim ?? inicio))
    if (!Number.isFinite(fim)) fim = inicio
    fim = Math.min(Math.max(fim, inicio), inicio + MAX_VERSICULOS - 1)
    const passagem = validarPassagem(biblia, { livro, capitulo, inicio, fim })
    if (!passagem) continue
    const ligacao = String(x.ligacao ?? '')
    r.push({
      passagem,
      motivo: String(x.motivo ?? '')
        .trim()
        .slice(0, 120),
      ligacao: (LIGACOES as readonly string[]).includes(ligacao) ? (ligacao as LigacaoSugestao) : '',
      forca,
    })
  }
  return r
}
