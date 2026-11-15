/**
 * Liga as sugestões de versículos ao resto do programa: a janela oculta que capta o microfone (só
 * existe enquanto "ouvir e sugerir" está ligado), os canais da tela de comando e a Bíblia do banco.
 */
import { app, type BrowserWindow, ipcMain } from 'electron'
import type { Config } from '../../shared/config'
import { CANAIS } from '../../shared/ipc'
import type { AvisoEscuta } from '../../shared/transcricao'
import { respirar } from '../banco'
import type { RepositorioBiblia } from '../biblia/repositorio'
import type { ArmazemConfig } from '../config'
import { log } from '../log'
import { BibliaMemoria } from './busca'
import { TranscritorElevenLabs } from './elevenlabs'
import { ProvedorAnthropic } from './ia'
import { importarDoProjetoTranscricao } from './importar'
import { MotorSugestoes } from './motor'

export interface DepsTranscricao {
  armazem: ArmazemConfig
  biblia: RepositorioBiblia
  /** cria a janela oculta da escuta (escuta.html, com o microfone escolhido) */
  criarJanelaEscuta: (microfone: string) => BrowserWindow
  comando: () => BrowserWindow | null
}

export function ligarTranscricao(d: DepsTranscricao): MotorSugestoes {
  let janela: BrowserWindow | null = null
  let micAberto = ''

  const escuta = {
    abrir(): void {
      if (janela && !janela.isDestroyed()) return
      micAberto = d.armazem.obter().transcricao.microfone
      const w = d.criarJanelaEscuta(micAberto)
      janela = w
      w.webContents.on('render-process-gone', (_e, det) => {
        log.erro(`A janela de escuta caiu (${det.reason}). Recarregando.`)
        if (janela === w && !w.isDestroyed()) w.reload()
      })
      w.on('closed', () => {
        if (janela === w) janela = null
      })
    },
    fechar(): void {
      const w = janela
      janela = null
      if (w && !w.isDestroyed()) w.destroy()
    },
  }

  const motor = new MotorSugestoes({
    config: () => d.armazem.obter().transcricao,
    versaoPadrao: () => d.armazem.obter().biblia.versaoPadrao,
    carregarBiblia: async () => {
      const versoes = d.biblia.versoes()
      if (!versoes.length) throw new Error('Nenhuma Bíblia importada: importe uma versão na página Bíblia.')
      const padrao = d.armazem.obter().biblia.versaoPadrao
      // a versão padrão primeiro (é a das prévias)
      const siglas = versoes.map((v) => v.sigla).sort((a, b) => (a === padrao ? -1 : b === padrao ? 1 : 0))
      return BibliaMemoria.montar(
        siglas.map((sigla) => ({ sigla, linhas: d.biblia.linhas(sigla) })),
        respirar,
      )
    },
    criarProvedor: (c) => new ProvedorAnthropic({ url: c.iaUrl, chave: c.iaChave, modelo: c.iaModelo }),
    criarTranscritor: (c) => new TranscritorElevenLabs({ chave: c.elevenlabsChave.trim() }),
    escuta,
    log: (m) => log.info(m),
  })

  const enviar = (canal: string, dado: unknown) => {
    const w = d.comando()
    if (w && !w.isDestroyed()) w.webContents.send(canal, dado)
  }
  motor.on('estado', (e) => enviar(CANAIS.transcricaoMudou, e))
  motor.on('parcial', (p) => enviar(CANAIS.transcricaoParcial, p))

  ipcMain.handle(CANAIS.estadoTranscricao, () => motor.estado())
  ipcMain.handle(CANAIS.ligarTranscricao, (_e, ligar: boolean) => (ligar ? motor.ligar() : motor.desligar()))
  ipcMain.handle(CANAIS.limparSugestoes, () => motor.limpar())
  ipcMain.handle(CANAIS.testarIaTranscricao, () => motor.testarIa())
  ipcMain.handle(CANAIS.importarConfigTranscricao, () => {
    const c = d.armazem.obter()
    const r = importarDoProjetoTranscricao(c.transcricao)
    d.armazem.salvar({ ...c, transcricao: r.config })
    log.info(`Sugestões: configuração copiada do projeto de transcrição (${r.copiado.join(', ') || 'nada'}).`)
    return { copiado: r.copiado, avisos: r.avisos }
  })
  // só a janela de escuta manda áudio
  ipcMain.on(CANAIS.escutaAudio, (e, pcm: Uint8Array) => {
    if (janela && e.sender === janela.webContents && pcm instanceof Uint8Array) motor.audio(pcm)
  })
  ipcMain.on(CANAIS.escutaAviso, (e, a: AvisoEscuta) => {
    if (janela && e.sender === janela.webContents) motor.avisoEscuta(a)
  })

  let anterior = JSON.stringify(d.armazem.obter().transcricao)
  let versaoAnterior = d.armazem.obter().biblia.versaoPadrao
  d.armazem.on('mudou', (c: Config) => {
    const agora = JSON.stringify(c.transcricao)
    if (agora !== anterior || c.biblia.versaoPadrao !== versaoAnterior) {
      motor.configMudou(agora !== anterior)
      anterior = agora
      versaoAnterior = c.biblia.versaoPadrao
    }
    // microfone trocado com a escuta aberta: abre de novo com o novo
    if (janela && !janela.isDestroyed() && c.transcricao.microfone !== micAberto) {
      escuta.fechar()
      escuta.abrir()
    }
  })
  app.on('before-quit', () => motor.encerrar())
  return motor
}
