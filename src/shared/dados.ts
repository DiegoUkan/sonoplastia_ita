/** Dados da biblioteca (mídias, músicas, Bíblia) que passam entre o motor e a tela de comando. */

export type TipoMidia = 'video' | 'imagem' | 'audio'
export type SituacaoMidia = 'analisando' | 'convertendo' | 'pronto' | 'erro'

export interface Midia {
  id: number
  tipo: TipoMidia
  nome: string
  arquivo: string
  url: string
  miniaturaUrl: string | null
  duracao: number | null
  largura: number | null
  altura: number | null
  bytes: number
  situacao: SituacaoMidia
  detalhe: string | null
  /** 0 a 1 durante a conversão */
  progresso: number | null
  criadoEm: string
  excluida: boolean
}

export interface FiltroMidias {
  tipo?: TipoMidia | 'todos'
  busca?: string
  lixeira?: boolean
}

export interface ResultadoImportacao {
  importadas: number[]
  repetidas: number[]
  ignoradas: string[]
}

export interface ResumoMusica {
  id: number
  titulo: string
  album: string | null
  faixa: number | null
  temCantado: boolean
  temPlayback: boolean
  origem: string | null
  editada: boolean
}

export interface SlideMusicaDados {
  texto: string
  msCantado: number
  msPlayback: number
}

export interface Musica extends ResumoMusica {
  urlCantado: string | null
  urlPlayback: string | null
  urlImagem: string | null
  slides: SlideMusicaDados[]
}

export interface ResultadoLouvorJa {
  novas: number
  atualizadas: number
  mantidasEditadas: number
  semAudio: number
  erros: string[]
}

export interface VersaoBiblia {
  sigla: string
  nome: string
  versiculos: number
}

export interface VersiculoTexto {
  versiculo: number
  texto: string
}

export interface ResultadoBuscaBiblia {
  livro: number
  capitulo: number
  versiculo: number
  trecho: string
}

export interface ArquivoBibliaEncontrado {
  caminho: string
  sigla: string
  nome: string
  jaImportada: boolean
}

/** Andamento de uma tarefa longa (importação, conversão). */
export interface Progresso {
  tarefa: 'louvorja' | 'biblia' | 'midias'
  feito: number
  total: number
  texto?: string
  fim?: boolean
}
