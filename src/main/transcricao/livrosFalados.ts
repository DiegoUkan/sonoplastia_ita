/**
 * Os 66 livros com os jeitos de falar cada um (porta de `biblia/livros.py` do projeto de transcrição).
 * `nomes` são formas faladas, em minúsculas e sem acento. Livros numerados (1 Samuel, 2 Coríntios…)
 * guardam só o nome-base; o parser cuida de "primeira aos", "segundo", "1", "I".
 */
import { LIVROS } from '../../shared/biblia/livros'

export interface LivroFalado {
  /** 1–66, na ordem dos arquivos de Bíblia */
  n: number
  /** sigla em minúsculas e sem acento, como no projeto de transcrição: "gn", "1co", "job" */
  id: string
  /** 1, 2 ou 3 nos livros numerados */
  numero: number | null
  nomes: string[]
}

const DADOS: Array<[string, string[], number?]> = [
  ['gn', ['genesis']],
  ['ex', ['exodo']],
  ['lv', ['levitico']],
  ['nm', ['numeros']],
  ['dt', ['deuteronomio']],
  ['js', ['josue']],
  ['jz', ['juizes']],
  ['rt', ['rute']],
  ['1sm', ['samuel'], 1],
  ['2sm', ['samuel'], 2],
  ['1rs', ['reis'], 1],
  ['2rs', ['reis'], 2],
  ['1cr', ['cronicas'], 1],
  ['2cr', ['cronicas'], 2],
  ['ed', ['esdras']],
  ['ne', ['neemias']],
  ['et', ['ester']],
  // "jó" vira "job" antes de tirar os acentos, para não confundir com "jo" (João)
  ['job', ['job']],
  ['sl', ['salmos', 'salmo', 'sl']],
  ['pv', ['proverbios', 'pv']],
  ['ec', ['eclesiastes']],
  ['ct', ['cantares de salomao', 'cantico dos canticos', 'canticos', 'cantares']],
  ['is', ['isaias']],
  ['jr', ['jeremias']],
  ['lm', ['lamentacoes de jeremias', 'lamentacoes']],
  ['ez', ['ezequiel']],
  ['dn', ['daniel']],
  ['os', ['oseias', 'oseas']],
  ['jl', ['joel']],
  ['am', ['amos']],
  ['ob', ['obadias']],
  ['jn', ['jonas']],
  ['mq', ['miqueias']],
  ['na', ['naum']],
  ['hc', ['habacuque', 'abacuque']],
  ['sf', ['sofonias']],
  ['ag', ['ageu']],
  ['zc', ['zacarias']],
  ['ml', ['malaquias']],
  ['mt', ['mateus']],
  ['mc', ['marcos']],
  ['lc', ['lucas']],
  ['jo', ['evangelho de joao', 'joao', 'jo']],
  ['at', ['atos dos apostolos', 'atos']],
  ['rm', ['romanos']],
  ['1co', ['corintios'], 1],
  ['2co', ['corintios'], 2],
  ['gl', ['galatas']],
  ['ef', ['efesios']],
  ['fp', ['filipenses']],
  ['cl', ['colossenses']],
  ['1ts', ['tessalonicenses'], 1],
  ['2ts', ['tessalonicenses'], 2],
  ['1tm', ['timoteo'], 1],
  ['2tm', ['timoteo'], 2],
  ['tt', ['tito']],
  ['fm', ['filemom', 'filemon']],
  ['hb', ['hebreus']],
  ['tg', ['tiago']],
  ['1pe', ['pedro'], 1],
  ['2pe', ['pedro'], 2],
  ['1jo', ['joao'], 1],
  ['2jo', ['joao'], 2],
  ['3jo', ['joao'], 3],
  ['jd', ['judas']],
  ['ap', ['apocalipse']],
]

export const LIVROS_FALADOS: LivroFalado[] = DADOS.map(([id, nomes, numero], i) => ({ n: i + 1, id, numero: numero ?? null, nomes }))

/** Minúsculas, "jó" → "job", sem acento e só letras e números: "1 Coríntios" → "1corintios". */
function chave(texto: string): string {
  return texto
    .toLowerCase()
    .replace(/jó/g, 'job')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

const RESOLVEDOR = (() => {
  const mapa = new Map<string, number>()
  const guardar = (k: string, n: number) => {
    if (k && !mapa.has(k)) mapa.set(k, n)
  }
  for (const l of LIVROS_FALADOS) {
    const exibir = LIVROS[l.n - 1]!
    // já trazem o número: "1co", "1Co", "1 Coríntios"
    for (const forma of [l.id, exibir.abrev, exibir.nome]) guardar(chave(forma), l.n)
    // nomes falados dos numerados são só o nome-base ("corintios"): ganham "1"/"i" na frente
    const prefixos = l.numero ? [String(l.numero), 'i'.repeat(l.numero)] : ['']
    for (const forma of l.nomes) for (const p of prefixos) guardar(chave(p + forma), l.n)
  }
  return mapa
})()

/** "Fp", "Filipenses", "1 Coríntios", "1Co", "Salmo", "jo", "Jó" → número do livro (null se não reconhecer). */
export function resolverLivro(texto: string): number | null {
  return RESOLVEDOR.get(chave(texto)) ?? null
}
