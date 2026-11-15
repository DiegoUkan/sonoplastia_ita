import type { Apresentacao, ResumoApresentacao } from './apresentacao'
import type { Config } from './config'
import type { AlteracaoLiturgia, Liturgia, ResumoLiturgia } from './liturgia'
import type { DirecaoPassador, StatusRemoto } from './remoto'
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
import type { EstadoLuz } from './iluminacao'
import type { EstadoSite } from './site'
import type { AvisoEscuta, EstadoTranscricao, ParcialTranscricao, ResultadoTesteIa } from './transcricao'

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
  // arquivos do site da igreja
  estadoSite: 'site:estado',
  siteMudou: 'site:mudou',
  atualizarSite: 'site:atualizar',
  marcarVistosSite: 'site:marcar-vistos',
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
  // apresentações
  listarApresentacoes: 'apresentacoes:listar',
  obterApresentacao: 'apresentacoes:obter',
  importarApresentacoes: 'apresentacoes:importar',
  escolherEImportarApresentacoes: 'apresentacoes:escolher-e-importar',
  renomearApresentacao: 'apresentacoes:renomear',
  excluirApresentacao: 'apresentacoes:excluir',
  reconverterApresentacao: 'apresentacoes:reconverter',
  abrirApresentacao: 'apresentacoes:abrir',
  apresentacoesMudaram: 'apresentacoes:mudaram',
  // liturgia
  listarLiturgias: 'liturgia:listar',
  obterLiturgia: 'liturgia:obter',
  copiarLiturgia: 'liturgia:copiar',
  salvarLiturgia: 'liturgia:salvar',
  excluirLiturgia: 'liturgia:excluir',
  executarItemLiturgia: 'liturgia:executar',
  aberturaSecao: 'liturgia:abertura',
  vizinhoLiturgia: 'liturgia:vizinho',
  passoLiturgia: 'liturgia:passo',
  fecharLiturgia: 'liturgia:fechar',
  escolherFundoSecao: 'liturgia:escolher-fundo',
  importarFundoSecao: 'liturgia:importar-fundo',
  liturgiasMudaram: 'liturgia:mudaram',
  // iluminação (luz.local)
  estadoLuz: 'luz:estado',
  alternarLuz: 'luz:alternar',
  cenarioLuz: 'luz:cenario',
  abrirPaginaLuz: 'luz:abrir-pagina',
  // sugestões de versículos ao vivo (transcrição da fala)
  estadoTranscricao: 'transcricao:estado',
  transcricaoMudou: 'transcricao:mudou',
  transcricaoParcial: 'transcricao:parcial',
  ligarTranscricao: 'transcricao:ligar',
  limparSugestoes: 'transcricao:limpar',
  testarIaTranscricao: 'transcricao:testar-ia',
  importarConfigTranscricao: 'transcricao:importar-config',
  escutaAudio: 'escuta:audio',
  escutaAviso: 'escuta:aviso',
  // controle remoto (celular)
  statusRemoto: 'remoto:status',
  remotoMudou: 'remoto:mudou',
  passador: 'remoto:passador',
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

  /** arquivos do site da igreja: o que o site tem, o que já chegou e como foi a última conferida */
  estadoSite(): Promise<EstadoSite>
  aoMudarSite(cb: (e: EstadoSite) => void): () => void
  /** confere o site agora (volta quando terminar, inclusive os downloads) */
  atualizarSite(): Promise<void>
  /** tira o "novo" (sem ids: de todos) */
  marcarVistosSite(ids?: string[]): Promise<void>

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

  listarApresentacoes(busca: string): Promise<ResumoApresentacao[]>
  obterApresentacao(id: number): Promise<Apresentacao | null>
  importarApresentacoes(caminhos: string[]): Promise<ResultadoImportacao>
  escolherEImportarApresentacoes(): Promise<ResultadoImportacao>
  renomearApresentacao(id: number, nome: string): Promise<void>
  /** pergunta antes; devolve true se apagou */
  excluirApresentacao(id: number): Promise<boolean>
  reconverterApresentacao(id: number): Promise<void>
  abrirApresentacao(id: number, alvo: Alvo, indice?: number): Promise<void>
  aoMudarApresentacoes(cb: () => void): () => void

  listarLiturgias(): Promise<ResumoLiturgia[]>
  obterLiturgia(id: number): Promise<Liturgia | null>
  /** novo culto ou modelo copiando as seções de `origemId` (null = seções padrão vazias); devolve o id */
  copiarLiturgia(origemId: number | null, dados: { nome?: string; data?: string | null; inicio?: string | null; modelo: boolean }): Promise<number>
  salvarLiturgia(id: number, a: AlteracaoLiturgia): Promise<Liturgia>
  /** pergunta antes; devolve true se excluiu */
  excluirLiturgia(id: number): Promise<boolean>
  /** `versao`: a escolhida para uma música "escolher na hora" */
  executarItemLiturgia(liturgiaId: number, itemId: string, alvo: Alvo, versao?: VersaoMusica): Promise<void>
  /** iluminação: estado, nomes e cenários (nunca rejeita: sem conexão, `conectado` = false) */
  estadoLuz(): Promise<EstadoLuz>
  /** liga/desliga um relé; devolve o estado novo */
  alternarLuz(id: number): Promise<boolean>
  cenarioLuz(nome: string): Promise<void>
  /** abre a página do sistema de iluminação no navegador */
  abrirPaginaLuz(): Promise<void>
  aberturaSecao(liturgiaId: number, secaoId: string, alvo: Alvo): Promise<void>
  /** põe no ar o próximo (1) ou o anterior (-1) item ativo; devolve o id dele ou null */
  vizinhoLiturgia(liturgiaId: number, passo: 1 | -1, alvo: Alvo): Promise<string | null>
  /** passador dentro do item no ar; false se o item não tem "dentro" */
  passoLiturgia(passo: 1 | -1): Promise<boolean>
  fecharLiturgia(): Promise<void>
  /** escolhe uma imagem e copia para a pasta de fundos; devolve o caminho */
  escolherFundoSecao(): Promise<string | null>
  /** copia uma imagem (arrastada do Explorer) para a pasta de fundos; devolve o caminho */
  importarFundoSecao(caminho: string): Promise<string>
  aoMudarLiturgias(cb: () => void): () => void

  /** sugestões de versículos ao vivo: estado, sugestões e o que está sendo dito */
  estadoTranscricao(): Promise<EstadoTranscricao>
  aoMudarTranscricao(cb: (e: EstadoTranscricao) => void): () => void
  aoParcialTranscricao(cb: (p: ParcialTranscricao) => void): () => void
  /** liga ou desliga "ouvir e sugerir" */
  ligarTranscricao(ligar: boolean): Promise<void>
  limparSugestoes(): Promise<void>
  testarIaTranscricao(): Promise<ResultadoTesteIa>
  /** copia as chaves do projeto de transcrição para as configurações; devolve o que foi copiado */
  importarConfigTranscricao(): Promise<{ copiado: string[]; avisos: string[] }>
  /** só a janela de escuta usa: áudio PCM 16 bits, 16 kHz */
  enviarAudioEscuta(pcm: Uint8Array): void
  avisarEscuta(a: AvisoEscuta): void

  /** controle remoto: endereço, PIN e quantos celulares estão conectados */
  statusRemoto(): Promise<StatusRemoto>
  aoMudarRemoto(cb: (s: StatusRemoto) => void): () => void
  /** o passador do celular: a tela de comando trata como PageDown/PageUp na página aberta */
  aoPassador(cb: (d: DirecaoPassador) => void): () => void

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
