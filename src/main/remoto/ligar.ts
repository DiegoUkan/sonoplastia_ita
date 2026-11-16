/** Liga o servidor do controle remoto ao resto do programa (motor, configuração, bibliotecas). */
import { app, type BrowserWindow, ipcMain } from 'electron'
import type { Config } from '../../shared/config'
import type { FiltroMidias, TipoMidia } from '../../shared/dados'
import type { Alvo, Telemetria, VersaoMusica } from '../../shared/estado'
import { CANAIS } from '../../shared/ipc'
import type { ConfigPublica, EventoRemoto, MetodoRemoto } from '../../shared/remoto'
import type { EstadoTranscricao } from '../../shared/transcricao/tipos'
import type { RepositorioBiblia } from '../biblia/repositorio'
import type { BibliotecaMidias } from '../biblioteca/midias'
import type { ArmazemConfig } from '../config'
import { log } from '../log'
import type { Motor } from '../motor'
import type { RepositorioMusicas } from '../musicas/repositorio'
import { type ServicoTranscricao, paraCelular } from '../transcricao/servico'
import { comandoRemoto, gerarPin, ServidorRemoto } from './servidor'

export interface DepsRemoto {
  armazem: ArmazemConfig
  motor: Motor
  musicas: RepositorioMusicas
  midias: BibliotecaMidias
  biblia: RepositorioBiblia
  /** sugestões de versículos ao vivo (o celular liga, desliga e vê as sugestões) */
  transcricao?: ServicoTranscricao
  abrirMusica: (id: number, versao: VersaoMusica, alvo: Alvo, indice?: number) => void
  comando: () => BrowserWindow | null
  pastaPaginas: string
  pastasArquivos: () => string[]
  /** troca a porta da configuração (autoteste; 0 = qualquer porta livre) */
  portaForcada?: number
}

export function configPublica(c: Config): ConfigPublica {
  return {
    tema: c.geral.tema,
    saidas: c.saidas.map((s) => ({ id: s.id, nome: s.nome, ativa: s.ativa })),
    biblia: c.biblia,
    telaEspera: { texto: c.telaEspera.texto },
  }
}

const VERSOES: VersaoMusica[] = ['cantado', 'playback', 'manual']
const TIPOS_MIDIA: Array<TipoMidia | 'todos'> = ['video', 'imagem', 'audio', 'todos']
const texto = (v: unknown) => (typeof v === 'string' ? v : '')
const numero = (v: unknown) => {
  const n = Number(v)
  if (!Number.isFinite(n)) throw new Error('Número inválido.')
  return n
}

export function ligarControleRemoto(d: DepsRemoto): ServidorRemoto {
  const chamar = (metodo: MetodoRemoto, a: unknown[]): unknown => {
    switch (metodo) {
      case 'comando':
        return d.motor.executar(comandoRemoto(a[0]))
      case 'passador': {
        const w = d.comando()
        if (!w || w.isDestroyed()) throw new Error('A tela de comando não está aberta.')
        w.webContents.send(CANAIS.passador, a[0] === 'anterior' ? 'anterior' : 'proximo')
        return
      }
      case 'listarMusicas':
        return d.musicas.listar(texto(a[0]), 150)
      case 'obterMusica':
        return d.musicas.obter(numero(a[0]))
      case 'abrirMusica': {
        const versao = VERSOES.includes(a[1] as VersaoMusica) ? (a[1] as VersaoMusica) : 'manual'
        return d.abrirMusica(numero(a[0]), versao, texto(a[2]) || 'todas', a[3] == null ? undefined : numero(a[3]))
      }
      case 'listarMidias': {
        const f = (a[0] ?? {}) as { tipo?: unknown; busca?: unknown }
        const filtro: FiltroMidias = {
          tipo: TIPOS_MIDIA.includes(f.tipo as TipoMidia) ? (f.tipo as TipoMidia | 'todos') : 'todos',
          busca: texto(f.busca),
          lixeira: false,
        }
        return d.midias.listar(filtro).filter((m) => m.situacao === 'pronto')
      }
      case 'versoesBiblia':
        return d.biblia.versoes()
      case 'capitulo':
        return d.biblia.capitulo(texto(a[0]), numero(a[1]), numero(a[2]))
      case 'totalCapitulos':
        return d.biblia.totalCapitulos(texto(a[0]), numero(a[1]))
      case 'buscarBiblia':
        return d.biblia.buscar(texto(a[0]), texto(a[1]))
      case 'ligarTranscricao':
        if (!d.transcricao) throw new Error('As sugestões de versículos não estão disponíveis.')
        d.transcricao.ligar(a[0] === true)
        return
    }
  }

  const servidor = new ServidorRemoto({
    pastaPaginas: d.pastaPaginas,
    pastasArquivos: d.pastasArquivos,
    chamar,
    inicial: () => [
      ['config', configPublica(d.armazem.obter())],
      ['estado', d.motor.estado],
      ...(d.transcricao ? ([['transcricao', paraCelular(d.transcricao.obter())]] as Array<[EventoRemoto, unknown]>) : []),
    ],
  })
  // sugestões: o estado inteiro quando muda; o que está sendo dito no máximo duas vezes por segundo
  // (o nível do microfone fica só na tela de comando)
  if (d.transcricao) {
    // sem o que está sendo dito (vai à parte) e só quando mudou: menos tráfego no Wi-Fi
    let ultimoEstado = ''
    d.transcricao.on('estado', (e: EstadoTranscricao) => {
      const p = paraCelular(e)
      const j = JSON.stringify(p)
      if (j === ultimoEstado) return
      ultimoEstado = j
      servidor.transmitir('transcricao', p)
    })
    let ultimoParcial = 0
    let parcialPendente: NodeJS.Timeout | null = null
    let textoParcial = ''
    let enviado = ''
    d.transcricao.on('parcial', (texto: string) => {
      textoParcial = texto
      if (parcialPendente || textoParcial === enviado) return
      parcialPendente = setTimeout(
        () => {
          parcialPendente = null
          ultimoParcial = Date.now()
          enviado = textoParcial
          servidor.transmitir('transcricao-parcial', { texto: textoParcial })
        },
        Math.max(0, 500 - (Date.now() - ultimoParcial)),
      )
    })
  }

  // PIN ligado e em branco: o programa cria um (e mostra nas Configurações)
  const garantirPin = (c: Config): boolean => {
    if (!c.remoto.exigirPin || c.remoto.pin) return false
    d.armazem.salvar({ ...c, remoto: { ...c.remoto, pin: gerarPin() } })
    return true
  }

  d.motor.on('estado', (e) => servidor.transmitir('estado', e))
  d.armazem.on('mudou', (c: Config) => {
    if (garantirPin(c)) return // a gravação do PIN novo chama este aviso de novo
    servidor.aplicar(c.remoto, d.portaForcada)
    servidor.transmitir('config', configPublica(c))
  })
  let avisoMidias: NodeJS.Timeout | null = null
  d.midias.on('mudou', () => {
    if (avisoMidias) return
    avisoMidias = setTimeout(() => {
      avisoMidias = null
      servidor.transmitir('midias', null)
    }, 1000)
  })
  servidor.on('mudou', (s) => {
    const w = d.comando()
    if (w && !w.isDestroyed()) w.webContents.send(CANAIS.remotoMudou, s)
  })
  ipcMain.handle(CANAIS.statusRemoto, () => servidor.status())
  // tempo do vídeo/áudio para o player do celular (o index também ouve este canal)
  const telemetria = filtroTelemetria((t) => servidor.transmitir('telemetria', t))
  ipcMain.on(CANAIS.telemetria, (_e, t: Telemetria) => telemetria(t))
  app.on('before-quit', () => servidor.encerrar())

  const cfg = d.armazem.obter()
  if (!garantirPin(cfg)) servidor.aplicar(cfg.remoto, d.portaForcada)
  log.info(`Controle remoto ${cfg.remoto.ativo ? 'ligado' : 'desligado'} (porta ${d.portaForcada ?? cfg.remoto.porta}).`)
  return servidor
}

/** Telemetria para o celular: no máximo duas por segundo por saída (o player só mostra o tempo). */
export function filtroTelemetria(enviar: (t: Telemetria) => void): (t: Telemetria) => void {
  const ultimo = new Map<string, number>()
  const pendente = new Map<string, NodeJS.Timeout>()
  return (t) => {
    const agora = Date.now()
    const antes = ultimo.get(t.saidaId) ?? 0
    const p = pendente.get(t.saidaId)
    if (p) clearTimeout(p)
    if (agora - antes >= 500) {
      ultimo.set(t.saidaId, agora)
      pendente.delete(t.saidaId)
      enviar(t)
    } else {
      pendente.set(
        t.saidaId,
        setTimeout(() => {
          ultimo.set(t.saidaId, Date.now())
          pendente.delete(t.saidaId)
          enviar(t)
        }, 500 - (agora - antes)),
      )
    }
  }
}
