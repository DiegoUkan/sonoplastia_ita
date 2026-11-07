import type { Config } from './config'
import type { ArquivoEscolhido, Comando, EstadoMotor, EstadoTelas, Telemetria } from './estado'

export const CANAIS = {
  comando: 'motor:comando',
  obterEstado: 'motor:obter-estado',
  estado: 'motor:estado',
  obterConfig: 'config:obter',
  salvarConfig: 'config:salvar',
  config: 'config:mudou',
  obterTelas: 'telas:obter',
  telas: 'telas:mudou',
  identificar: 'telas:identificar',
  reabrirSaidas: 'telas:reabrir',
  escolherArquivo: 'arquivo:escolher',
  videoDeTeste: 'arquivo:video-de-teste',
  telemetria: 'saida:telemetria',
} as const

export type TipoArquivo = 'imagem' | 'video'

/** API que o preload expõe em `window.api` para as janelas. */
export interface ApiSonoplastia {
  comando(c: Comando): Promise<void>
  obterEstado(): Promise<EstadoMotor>
  aoMudarEstado(cb: (e: EstadoMotor) => void): () => void

  obterConfig(): Promise<Config>
  salvarConfig(c: Config): Promise<Config>
  aoMudarConfig(cb: (c: Config) => void): () => void

  obterTelas(): Promise<EstadoTelas>
  aoMudarTelas(cb: (t: EstadoTelas) => void): () => void
  identificarTelas(): Promise<void>
  reabrirSaidas(): Promise<void>

  escolherArquivo(tipo: TipoArquivo): Promise<ArquivoEscolhido | null>
  videoDeTeste(): Promise<ArquivoEscolhido>

  enviarTelemetria(t: Telemetria): void
  aoTelemetria(cb: (t: Telemetria) => void): () => void
}
