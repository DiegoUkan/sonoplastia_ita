/** Bíblia automática: o que a tela de comando recebe do processo principal. */

/**
 * desligado  modo manual (nada é ouvido nem gasto)
 * iniciando  abrindo o microfone
 * espera     ouvindo o microfone, mas ninguém fala: a transcrição e a IA estão paradas (não gastam)
 * ouvindo    alguém fala: a transcrição está aberta
 * pausado    toca música, áudio ou vídeo pelo programa (opção nas Configurações)
 * erro       algo impede de continuar (ver `mensagem`)
 */
export type SituacaoEscuta = 'desligado' | 'iniciando' | 'espera' | 'ouvindo' | 'pausado' | 'erro'

/**
 * citacao, parafrase, alusao, tema_central, tema_relacionado, distante: categorias da IA.
 * 'citada' = o pregador disse a referência; 'leitura' = a busca reconheceu o texto lido (sem IA).
 */
export type LigacaoSugestao = 'citada' | 'leitura' | 'citacao' | 'parafrase' | 'alusao' | 'tema_central' | 'tema_relacionado' | 'distante' | ''

export interface SugestaoBiblia {
  id: number
  livro: number
  capitulo: number
  /** null = capítulo inteiro ("Romanos 8") */
  inicio: number | null
  fim: number | null
  referencia: string
  origem: 'citada' | 'ia' | 'busca'
  ligacao: LigacaoSugestao
  /** 0–100: quão diretamente a fala se refere à passagem */
  forca: number
  motivo: string
  /** a fala que gerou a sugestão (fim) */
  trecho: string
  hora: number
  /** começo do texto, na versão da página */
  texto: string
  /** foi para a tela sozinha (citação direta) */
  mostrada: boolean
}

export interface ConsumoTranscricao {
  chamadas: number
  /** tokens de entrada e de saída da IA */
  entrada: number
  saida: number
  /** segundos de áudio mandados para a transcrição */
  segundosAudio: number
}

export interface EstadoTranscricao {
  ligado: boolean
  situacao: SituacaoEscuta
  mensagem: string
  /** o que falta configurar (chave do ElevenLabs, chave ou modelo da IA); vazio = tudo certo */
  faltando: string[]
  /** nome do microfone em uso */
  microfone: string
  /** trecho ainda sendo falado (muda até virar final) */
  parcial: string
  /** últimas falas finais, a mais nova por último */
  falas: Array<{ hora: number; texto: string }>
  /** mais nova primeiro */
  sugestoes: SugestaoBiblia[]
  consumo: ConsumoTranscricao
  /** último aviso (ex.: a IA não respondeu) */
  aviso: string | null
  /** versículo que o programa pôs no ar sozinho; `seq` muda a cada vez */
  mostrado: { seq: number; livro: number; capitulo: number; versiculo: number; sigla: string } | null
}

export interface NivelEscuta {
  db: number
  limiar: number
  voz: boolean
}

/** O que está instalado da transcrição local (Whisper). */
export interface InstalacaoWhisper {
  pasta: string
  versao: string
  exe: boolean
  /** detector de voz do Whisper (sem ele, o silêncio vira "O que é isso?") */
  vad: boolean
  modelos: Record<'base' | 'small' | 'turbo', boolean>
}

export interface ResultadoTeste {
  ok: boolean
  mensagem: string
}

export const estadoTranscricaoInicial = (): EstadoTranscricao => ({
  ligado: false,
  situacao: 'desligado',
  mensagem: '',
  faltando: [],
  microfone: '',
  parcial: '',
  falas: [],
  sugestoes: [],
  consumo: { chamadas: 0, entrada: 0, saida: 0, segundosAudio: 0 },
  aviso: null,
  mostrado: null,
})
