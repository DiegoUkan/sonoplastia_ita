import { contextBridge, ipcRenderer, type IpcRendererEvent, webUtils } from 'electron'
import { type ApiSonoplastia, CANAIS } from '../shared/ipc'

function ouvir<T>(canal: string, cb: (v: T) => void): () => void {
  const f = (_e: IpcRendererEvent, v: T) => cb(v)
  ipcRenderer.on(canal, f)
  return () => {
    ipcRenderer.removeListener(canal, f)
  }
}

const chamar =
  (canal: string) =>
  (...args: unknown[]) =>
    ipcRenderer.invoke(canal, ...args)

const api: ApiSonoplastia = {
  comando: chamar(CANAIS.comando),
  obterEstado: chamar(CANAIS.obterEstado),
  aoMudarEstado: (cb) => ouvir(CANAIS.estado, cb),

  obterConfig: chamar(CANAIS.obterConfig),
  salvarConfig: chamar(CANAIS.salvarConfig),
  aoMudarConfig: (cb) => ouvir(CANAIS.config, cb),

  obterTelas: chamar(CANAIS.obterTelas),
  aoMudarTelas: (cb) => ouvir(CANAIS.telas, cb),
  identificarTelas: chamar(CANAIS.identificar),
  reabrirSaidas: chamar(CANAIS.reabrirSaidas),
  idCapturaSaida: chamar(CANAIS.idCaptura),

  escolherArquivo: chamar(CANAIS.escolherArquivo),
  escolherPasta: chamar(CANAIS.escolherPasta),
  videoDeTeste: chamar(CANAIS.videoDeTeste),
  caminhoDoArquivo: (arquivo) => webUtils.getPathForFile(arquivo),

  enviarTelemetria: (t) => ipcRenderer.send(CANAIS.telemetria, t),
  aoTelemetria: (cb) => ouvir(CANAIS.telemetria, cb),
  aoProgresso: (cb) => ouvir(CANAIS.progresso, cb),

  listarMidias: chamar(CANAIS.listarMidias),
  importarMidias: chamar(CANAIS.importarMidias),
  escolherEImportarMidias: chamar(CANAIS.escolherEImportar),
  renomearMidia: chamar(CANAIS.renomearMidia),
  excluirMidia: chamar(CANAIS.excluirMidia),
  restaurarMidia: chamar(CANAIS.restaurarMidia),
  apagarMidia: chamar(CANAIS.apagarMidia),
  aoMudarMidias: (cb) => ouvir(CANAIS.midiasMudaram, cb),

  estadoSite: chamar(CANAIS.estadoSite),
  aoMudarSite: (cb) => ouvir(CANAIS.siteMudou, cb),
  atualizarSite: chamar(CANAIS.atualizarSite),
  marcarVistosSite: chamar(CANAIS.marcarVistosSite),

  listarMusicas: chamar(CANAIS.listarMusicas),
  obterMusica: chamar(CANAIS.obterMusica),
  salvarMusica: chamar(CANAIS.salvarMusica),
  abrirMusica: chamar(CANAIS.abrirMusica),
  importarLouvorJa: chamar(CANAIS.importarLouvorJa),

  versoesBiblia: chamar(CANAIS.versoesBiblia),
  aoMudarBiblia: (cb) => ouvir(CANAIS.biblia, cb),
  arquivosBiblia: chamar(CANAIS.arquivosBiblia),
  importarBiblia: chamar(CANAIS.importarBiblia),
  importarBibliaUrl: chamar(CANAIS.importarBibliaUrl),
  escolherArquivoBiblia: chamar(CANAIS.escolherArquivoBiblia),
  capitulo: chamar(CANAIS.capitulo),
  totalCapitulos: chamar(CANAIS.totalCapitulos),
  buscarBiblia: chamar(CANAIS.buscarBiblia),

  listarApresentacoes: chamar(CANAIS.listarApresentacoes),
  obterApresentacao: chamar(CANAIS.obterApresentacao),
  importarApresentacoes: chamar(CANAIS.importarApresentacoes),
  escolherEImportarApresentacoes: chamar(CANAIS.escolherEImportarApresentacoes),
  renomearApresentacao: chamar(CANAIS.renomearApresentacao),
  excluirApresentacao: chamar(CANAIS.excluirApresentacao),
  reconverterApresentacao: chamar(CANAIS.reconverterApresentacao),
  abrirApresentacao: chamar(CANAIS.abrirApresentacao),
  aoMudarApresentacoes: (cb) => ouvir(CANAIS.apresentacoesMudaram, cb),

  listarLiturgias: chamar(CANAIS.listarLiturgias),
  obterLiturgia: chamar(CANAIS.obterLiturgia),
  copiarLiturgia: chamar(CANAIS.copiarLiturgia),
  salvarLiturgia: chamar(CANAIS.salvarLiturgia),
  excluirLiturgia: chamar(CANAIS.excluirLiturgia),
  executarItemLiturgia: chamar(CANAIS.executarItemLiturgia),
  aberturaSecao: chamar(CANAIS.aberturaSecao),
  vizinhoLiturgia: chamar(CANAIS.vizinhoLiturgia),
  passoLiturgia: chamar(CANAIS.passoLiturgia),
  fecharLiturgia: chamar(CANAIS.fecharLiturgia),
  escolherFundoSecao: chamar(CANAIS.escolherFundoSecao),
  importarFundoSecao: chamar(CANAIS.importarFundoSecao),
  aoMudarLiturgias: (cb) => ouvir(CANAIS.liturgiasMudaram, cb),

  estadoLuz: chamar(CANAIS.estadoLuz),
  alternarLuz: chamar(CANAIS.alternarLuz),
  cenarioLuz: chamar(CANAIS.cenarioLuz),
  abrirPaginaLuz: chamar(CANAIS.abrirPaginaLuz),

  statusRemoto: chamar(CANAIS.statusRemoto),
  aoMudarRemoto: (cb) => ouvir(CANAIS.remotoMudou, cb),
  aoPassador: (cb) => ouvir(CANAIS.passador, cb),

  ligarTranscricao: chamar(CANAIS.transcricaoLigar),
  obterTranscricao: chamar(CANAIS.obterTranscricao),
  aoMudarTranscricao: (cb) => ouvir(CANAIS.transcricao, cb),
  aoNivelTranscricao: (cb) => ouvir(CANAIS.nivelTranscricao, cb),
  contextoTranscricao: chamar(CANAIS.contextoTranscricao),
  limparSugestoes: chamar(CANAIS.limparSugestoes),
  testarIA: chamar(CANAIS.testarIA),
  listarModelosIA: chamar(CANAIS.listarModelosIA),
  testarElevenLabs: chamar(CANAIS.testarElevenLabs),
  copiarDoProjetoTranscricao: chamar(CANAIS.copiarDoProjetoTranscricao),

  aoPedidoSonda: (cb) => ouvir(CANAIS.sondaPedido, cb),
  responderSonda: (r) => ipcRenderer.send(CANAIS.sondaResultado, r),

  aoPedidoEscuta: (cb) => ouvir(CANAIS.escutaConfig, cb),
  enviarAudioEscuta: (pcm) => ipcRenderer.send(CANAIS.escutaAudio, pcm),
  statusEscuta: (s) => ipcRenderer.send(CANAIS.escutaStatus, s),
} as ApiSonoplastia

contextBridge.exposeInMainWorld('api', api)
