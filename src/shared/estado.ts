/** Tipos do estado das saídas, dos comandos e das telas. Usados pelo motor e pelas janelas. */

export type Conteudo =
  | { tipo: 'vazio' }
  | { tipo: 'teste' }
  | { tipo: 'texto'; texto: string; referencia?: string }
  | { tipo: 'imagem'; url: string; nome: string }
  | { tipo: 'video'; url: string; nome: string; loop: boolean }

export type Fundo = { tipo: 'nenhum' } | { tipo: 'imagem'; url: string; nome: string }

/**
 * normal  conteúdo visível
 * limpar  esconde o conteúdo e mantém o fundo
 * logo    tela de espera por cima de tudo
 * preto   preto por cima de tudo (só sai com um comando explícito)
 */
export type ModoTela = 'normal' | 'limpar' | 'logo' | 'preto'

export interface ControleVideo {
  tocando: boolean
  volume: number
  mudo: boolean
  /** muda a cada "reiniciar": a saída volta o vídeo para o início */
  reinicio: number
}

export interface EstadoSaida {
  id: string
  conteudo: Conteudo
  /** muda a cada conteúdo novo (dispara a transição) */
  chave: number
  fundo: Fundo
  tela: ModoTela
  video: ControleVideo
}

export interface EstadoMotor {
  /** aumenta a cada mudança; as janelas descartam estados mais velhos que o que já têm */
  versao: number
  saidas: Record<string, EstadoSaida>
}

export const TODAS = 'todas'
/** id de uma saída ou TODAS */
export type Alvo = string

export type AcaoVideo = 'tocar' | 'pausar' | 'reiniciar' | 'parar'

export type Comando =
  | { tipo: 'mostrar'; alvo: Alvo; conteudo: Conteudo }
  | { tipo: 'fundo'; alvo: Alvo; fundo: Fundo }
  | { tipo: 'tela'; alvo: Alvo; tela: ModoTela }
  | { tipo: 'video'; alvo: Alvo; acao: AcaoVideo }
  | { tipo: 'volume'; alvo: Alvo; volume?: number; mudo?: boolean }

export interface TelemetriaVideo {
  posicao: number
  duracao: number
  tocando: boolean
  quadros: number
  perdidos: number
}

/** O que cada janela de saída informa ao motor (repassado para a tela de comando). */
export interface Telemetria {
  saidaId: string
  /** pixels reais da saída */
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
