/** Os 66 livros, na ordem dos arquivos de Bíblia (Gênesis = 1 … Apocalipse = 66). */
import { semAcento } from '../texto'

export interface Livro {
  n: number
  nome: string
  abrev: string
  /** formas aceitas na busca: sem acento, sem espaço, minúsculas */
  chaves: string[]
}

const chave = (t: string) => semAcento(t).toLowerCase().replace(/[^a-z0-9]/g, '')

const DADOS: Array<[string, string, string[]]> = [
  ['Gênesis', 'Gn', ['gen']],
  ['Êxodo', 'Êx', ['exo']],
  ['Levítico', 'Lv', ['lev']],
  ['Números', 'Nm', ['num']],
  ['Deuteronômio', 'Dt', ['deut']],
  ['Josué', 'Js', ['jos']],
  ['Juízes', 'Jz', ['jui']],
  ['Rute', 'Rt', []],
  ['1 Samuel', '1Sm', ['1sam']],
  ['2 Samuel', '2Sm', ['2sam']],
  ['1 Reis', '1Rs', ['1re']],
  ['2 Reis', '2Rs', ['2re']],
  ['1 Crônicas', '1Cr', ['1cro']],
  ['2 Crônicas', '2Cr', ['2cro']],
  ['Esdras', 'Ed', ['esd']],
  ['Neemias', 'Ne', ['nee']],
  ['Ester', 'Et', ['est']],
  ['Jó', 'Jó', ['job']],
  ['Salmos', 'Sl', ['sal', 'salmo']],
  ['Provérbios', 'Pv', ['prov']],
  ['Eclesiastes', 'Ec', ['ecl']],
  ['Cânticos', 'Ct', ['cant', 'cantico', 'cantares', 'canticodoscanticos', 'cantaresdesalomao']],
  ['Isaías', 'Is', ['isa']],
  ['Jeremias', 'Jr', ['jer']],
  ['Lamentações', 'Lm', ['lam']],
  ['Ezequiel', 'Ez', ['eze']],
  ['Daniel', 'Dn', ['dan']],
  ['Oseias', 'Os', ['ose', 'oseias']],
  ['Joel', 'Jl', []],
  ['Amós', 'Am', []],
  ['Obadias', 'Ob', ['oba']],
  ['Jonas', 'Jn', ['jon']],
  ['Miqueias', 'Mq', ['miq']],
  ['Naum', 'Na', []],
  ['Habacuque', 'Hc', ['hab']],
  ['Sofonias', 'Sf', ['sof']],
  ['Ageu', 'Ag', ['age']],
  ['Zacarias', 'Zc', ['zac']],
  ['Malaquias', 'Ml', ['mal']],
  ['Mateus', 'Mt', ['mat']],
  ['Marcos', 'Mc', ['mar']],
  ['Lucas', 'Lc', ['luc']],
  ['João', 'Jo', ['joa']],
  ['Atos', 'At', ['ato']],
  ['Romanos', 'Rm', ['rom']],
  ['1 Coríntios', '1Co', ['1cor']],
  ['2 Coríntios', '2Co', ['2cor']],
  ['Gálatas', 'Gl', ['gal']],
  ['Efésios', 'Ef', ['efe']],
  ['Filipenses', 'Fp', ['fil']],
  ['Colossenses', 'Cl', ['col']],
  ['1 Tessalonicenses', '1Ts', ['1tes']],
  ['2 Tessalonicenses', '2Ts', ['2tes']],
  ['1 Timóteo', '1Tm', ['1tim']],
  ['2 Timóteo', '2Tm', ['2tim']],
  ['Tito', 'Tt', ['tit']],
  ['Filemom', 'Fm', ['flm', 'filemon']],
  ['Hebreus', 'Hb', ['heb']],
  ['Tiago', 'Tg', ['tia']],
  ['1 Pedro', '1Pe', ['1ped']],
  ['2 Pedro', '2Pe', ['2ped']],
  ['1 João', '1Jo', ['1joa']],
  ['2 João', '2Jo', ['2joa']],
  ['3 João', '3Jo', ['3joa']],
  ['Judas', 'Jd', ['jud']],
  ['Apocalipse', 'Ap', ['apo', 'apoc']],
]

export const LIVROS: Livro[] = DADOS.map(([nome, abrev, extras], i) => ({
  n: i + 1,
  nome,
  abrev,
  // sem acento, "Jó" vira "jo", que é a abreviação de João: Jó só pelo acento ("jó") ou por "job"
  chaves: [...new Set([chave(nome), chave(abrev), ...extras.map(chave)])].filter((k) => !(i === 17 && k === 'jo')),
}))

export function livro(n: number): Livro | undefined {
  return LIVROS[n - 1]
}

/** Livros que combinam com a chave: primeiro igualdade exata, depois começo de palavra. */
export function acharLivros(chaveDigitada: string): Livro[] {
  const c = chave(chaveDigitada)
  if (!c) return []
  const exatos = LIVROS.filter((l) => l.chaves.includes(c))
  if (exatos.length) return exatos
  if (c.replace(/^\d/, '').length < 2) return []
  return LIVROS.filter((l) => l.chaves.some((k) => k.startsWith(c)))
}
