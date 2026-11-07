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

  aoPedidoSonda: (cb) => ouvir(CANAIS.sondaPedido, cb),
  responderSonda: (r) => ipcRenderer.send(CANAIS.sondaResultado, r),
} as ApiSonoplastia

contextBridge.exposeInMainWorld('api', api)
