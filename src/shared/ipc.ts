import type { Config } from './config'
import type {
  ArquivoBibliaEncontrado,
  FiltroMidias,
  Midia,
  Musica,
  Progresso,
  ResultadoBuscaBiblia,
  ResultadoImportacao,
  ResultadoLouvorJa,
  ResumoMusica,
  SlideMusicaDados,
  VersaoBiblia,
  VersiculoTexto,
} from './dados'
import type { Alvo, ArquivoEscolhido, Comando, EstadoMotor, EstadoTelas, Telemetria, VersaoMusica } from './estado'

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
  idCaptura: 'telas:id-captura',
  escolherArquivo: 'arquivo:escolher',
  escolherPasta: 'arquivo:escolher-pasta',
  videoDeTeste: 'arquivo:video-de-teste',
  telemetria: 'saida:telemetria',
  progresso: 'tarefa:progresso',
  // mídias
  listarMidias: 'midias:listar',
  importarMidias: 'midias:importar',
  escolherEImportar: 'midias:escolher-e-importar',
  renomearMidia: 'midias:renomear',
  excluirMidia: 'midias:excluir',
  restaurarMidia: 'midias:restaurar',
  apagarMidia: 'midias:apagar',
  midiasMudaram: 'midias:mudaram',
  // músicas
  listarMusicas: 'musicas:listar',
  obterMusica: 'musicas:obter',
  salvarMusica: 'musicas:salvar',
  abrirMusica: 'musicas:abrir',
  importarLouvorJa: 'musicas:importar-louvorja',
  // bíblia
  versoesBiblia: 'biblia:versoes',
  biblia: 'biblia:mudou',
  arquivosBiblia: 'biblia:arquivos-encontrados',
  importarBiblia: 'biblia:importar',
  importarBibliaUrl: 'biblia:importar-url',
  escolherArquivoBiblia: 'biblia:escolher-arquivo',
  capitulo: 'biblia:capitulo',
  totalCapitulos: 'biblia:total-capitulos',
  buscarBiblia: 'biblia:buscar',
  // janelas internas
  sondaPedido: 'sonda:pedido',
  sondaResultado: 'sonda:resultado',
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
  /** id para capturar a janela da saída (miniatura ao vivo); vale por 10 s */
  idCapturaSaida(saidaId: string): Promise<string | null>

  escolherArquivo(tipo: TipoArquivo): Promise<ArquivoEscolhido | null>
  escolherPasta(titulo: string): Promise<string | null>
  videoDeTeste(): Promise<ArquivoEscolhido>
  /** caminho no disco de um arquivo solto na janela (arrastado do Explorer) */
  caminhoDoArquivo(arquivo: File): string

  enviarTelemetria(t: Telemetria): void
  aoTelemetria(cb: (t: Telemetria) => void): () => void
  aoProgresso(cb: (p: Progresso) => void): () => void

  listarMidias(f: FiltroMidias): Promise<Midia[]>
  importarMidias(caminhos: string[]): Promise<ResultadoImportacao>
  escolherEImportarMidias(): Promise<ResultadoImportacao>
  renomearMidia(id: number, nome: string): Promise<void>
  excluirMidia(id: number): Promise<void>
  restaurarMidia(id: number): Promise<void>
  apagarMidia(id: number): Promise<void>
  aoMudarMidias(cb: () => void): () => void

  listarMusicas(busca: string): Promise<ResumoMusica[]>
  obterMusica(id: number): Promise<Musica | null>
  salvarMusica(id: number, titulo: string, slides: SlideMusicaDados[]): Promise<void>
  abrirMusica(id: number, versao: VersaoMusica, alvo: Alvo, indice?: number): Promise<void>
  importarLouvorJa(modo: 'todas' | 'liturgia'): Promise<ResultadoLouvorJa>

  versoesBiblia(): Promise<VersaoBiblia[]>
  aoMudarBiblia(cb: () => void): () => void
  arquivosBiblia(): Promise<ArquivoBibliaEncontrado[]>
  importarBiblia(caminho: string, sigla: string, nome: string): Promise<number>
  importarBibliaUrl(url: string, sigla: string, nome: string): Promise<number>
  escolherArquivoBiblia(): Promise<string | null>
  capitulo(sigla: string, livro: number, capitulo: number): Promise<VersiculoTexto[]>
  totalCapitulos(sigla: string, livro: number): Promise<number>
  buscarBiblia(sigla: string, termo: string): Promise<ResultadoBuscaBiblia[]>

  /** só a janela-sonda usa */
  aoPedidoSonda(cb: (p: PedidoSonda) => void): () => void
  responderSonda(r: ResultadoSonda): void
}

export interface PedidoSonda {
  id: number
  url: string
  tipo: 'video' | 'imagem' | 'audio'
}

export interface ResultadoSonda {
  id: number
  ok: boolean
  duracao?: number
  largura?: number
  altura?: number
  /** JPEG em data URL */
  miniatura?: string
  erro?: string
}
