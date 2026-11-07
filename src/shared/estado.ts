/** Tipos do estado das saídas, dos comandos e das telas. Usados pelo motor e pelas janelas. */

export type Conteudo =
  | { tipo: 'vazio' }
  | { tipo: 'teste' }
  | { tipo: 'texto'; texto: string; referencia?: string }
  | { tipo: 'imagem'; url: string; nome: string }
  | { tipo: 'video'; url: string; nome: string; loop: boolean }
  /** trecho de música; indice -1 = introdução (antes do primeiro trecho) */
  | { tipo: 'letra'; titulo: string; texto: string; proximo: string | null; indice: number; total: number }
  | { tipo: 'versiculo'; texto: string; referencia: string; segundo: { texto: string; referencia: string } | null }

export type Fundo = { tipo: 'nenhum' } | { tipo: 'imagem'; url: string; nome: string }

/**
 * normal  conteúdo visível
 * limpar  esconde o conteúdo e mantém o fundo
 * logo    tela de espera por cima de tudo
 * preto   preto por cima de tudo (só sai com um comando explícito)
 */
export type ModoTela = 'normal' | 'limpar' | 'logo' | 'preto'

/** Controle de uma mídia que toca (vídeo numa saída ou a trilha de áudio). */
export interface ControleMidia {
  tocando: boolean
  volume: number
  mudo: boolean
  repetir: boolean
  /** muda a cada tocar/pausar: quem toca reaplica mesmo sem mudança (ex.: tocar um vídeo que terminou) */
  ordem: number
  /** pedido de posição, aplicado quando `seq` muda */
  busca: { seq: number; segundos: number; relativo: boolean }
}

export interface EstadoSaida {
  id: string
  conteudo: Conteudo
  /** muda a cada conteúdo novo (dispara a transição) */
  chave: number
  fundo: Fundo
  tela: ModoTela
  video: ControleMidia
}

export type VersaoMusica = 'cantado' | 'playback' | 'manual'

export type FonteAudio =
  | { tipo: 'audio'; url: string; nome: string; midiaId: number }
  | { tipo: 'musica'; url: string; nome: string; musicaId: number; versao: 'cantado' | 'playback' }

export interface EstadoAudio {
  fonte: FonteAudio | null
  controle: ControleMidia
}

export interface SlideMusica {
  texto: string
  /** início do trecho na versão escolhida (0 = sem tempo, só manual) */
  ms: number
}

export interface EstadoMusica {
  musicaId: number
  titulo: string
  album: string
  versao: VersaoMusica
  slides: SlideMusica[]
  /** trecho no ar; -1 = introdução */
  indice: number
  seguirAudio: boolean
  tituloNaIntroducao: boolean
  alvo: Alvo
  fundoUrl: string | null
}

export interface EstadoMotor {
  /** aumenta a cada mudança; as janelas descartam estados mais velhos que o que já têm */
  versao: number
  saidas: Record<string, EstadoSaida>
  audio: EstadoAudio
  musica: EstadoMusica | null
}

export const TODAS = 'todas'
/** alvo das ações de mídia que vão para a trilha de áudio (músicas e áudios avulsos) */
export const AUDIO = 'audio'
/** id de uma saída, TODAS ou (nas ações de mídia) AUDIO */
export type Alvo = string

export type AcaoMidia = 'tocar' | 'pausar' | 'reiniciar' | 'parar'

export type Comando =
  | { tipo: 'mostrar'; alvo: Alvo; conteudo: Conteudo }
  | { tipo: 'fundo'; alvo: Alvo; fundo: Fundo }
  | { tipo: 'tela'; alvo: Alvo; tela: ModoTela }
  | { tipo: 'midia'; alvo: Alvo; acao: AcaoMidia }
  | { tipo: 'buscar'; alvo: Alvo; segundos: number; relativo?: boolean }
  | { tipo: 'repetir'; alvo: Alvo; valor: boolean }
  | { tipo: 'volume'; alvo: Alvo; volume?: number; mudo?: boolean }
  /** toca um áudio avulso na trilha de áudio (null para) */
  | { tipo: 'audio'; fonte: FonteAudio | null }
  | { tipo: 'musica:slide'; indice: number; origem: 'operador' | 'audio' }
  | { tipo: 'musica:seguir'; valor: boolean }
  | { tipo: 'musica:fechar' }

export interface TelemetriaVideo {
  posicao: number
  duracao: number
  tocando: boolean
  quadros: number
  perdidos: number
}

/** O que cada janela que toca mídia informa (saídas e a janela de áudio, com saidaId = AUDIO). */
export interface Telemetria {
  saidaId: string
  /** pixels reais da saída (0 na janela de áudio) */
  largura: number
  altura: number
  video: TelemetriaVideo | null
}

export interface MonitorAtual {
  id: number
  /** ordem da esquerda para a direita, a partir de 1 */
  numero: number
  rotulo: string
  /** limites em pixels lógicos (DIP) */
  x: number
  y: number
  largura: number
  altura: number
  /** resolução real em pixels */
  larguraPx: number
  alturaPx: number
  escala: number
  principal: boolean
}

/**
 * monitor       aberta em tela cheia no monitor escolhido
 * janela        aberta como janela de teste
 * desligada     saída desligada nas configurações
 * desconectada  monitor escolhido não encontrado (volta sozinha quando ele for religado)
 * fechada       fechada pelo operador ou não aberta ao iniciar
 */
export type SituacaoSaida = 'monitor' | 'janela' | 'desligada' | 'desconectada' | 'fechada'

export interface InfoSaida {
  saidaId: string
  situacao: SituacaoSaida
  monitorId: number | null
  aviso: string | null
  /** id da janela aberta (muda quando a janela é recriada); null sem janela */
  janelaId: number | null
}

export interface EstadoTelas {
  monitores: MonitorAtual[]
  saidas: InfoSaida[]
}

export interface ArquivoEscolhido {
  url: string
  nome: string
  caminho: string
}
