import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { type ApiSonoplastia, CANAIS } from '../shared/ipc'

function ouvir<T>(canal: string, cb: (v: T) => void): () => void {
  const f = (_e: IpcRendererEvent, v: T) => cb(v)
  ipcRenderer.on(canal, f)
  return () => {
    ipcRenderer.removeListener(canal, f)
  }
}

const api: ApiSonoplastia = {
  comando: (c) => ipcRenderer.invoke(CANAIS.comando, c),
  obterEstado: () => ipcRenderer.invoke(CANAIS.obterEstado),
  aoMudarEstado: (cb) => ouvir(CANAIS.estado, cb),

  obterConfig: () => ipcRenderer.invoke(CANAIS.obterConfig),
  salvarConfig: (c) => ipcRenderer.invoke(CANAIS.salvarConfig, c),
  aoMudarConfig: (cb) => ouvir(CANAIS.config, cb),

  obterTelas: () => ipcRenderer.invoke(CANAIS.obterTelas),
  aoMudarTelas: (cb) => ouvir(CANAIS.telas, cb),
  identificarTelas: () => ipcRenderer.invoke(CANAIS.identificar),
  reabrirSaidas: () => ipcRenderer.invoke(CANAIS.reabrirSaidas),

  escolherArquivo: (tipo) => ipcRenderer.invoke(CANAIS.escolherArquivo, tipo),
  videoDeTeste: () => ipcRenderer.invoke(CANAIS.videoDeTeste),

  enviarTelemetria: (t) => ipcRenderer.send(CANAIS.telemetria, t),
  aoTelemetria: (cb) => ouvir(CANAIS.telemetria, cb),
}

contextBridge.exposeInMainWorld('api', api)
