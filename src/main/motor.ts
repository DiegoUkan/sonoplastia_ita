import { EventEmitter } from 'node:events'
import {
  type Alvo,
  AUDIO,
  type Comando,
  type Conteudo,
  type ControleMidia,
  type EstadoMotor,
  type EstadoMusica,
  type EstadoSaida,
  type FonteAudio,
  type SlideMusica,
  TODAS,
  type VersaoMusica,
} from '../shared/estado'

const controleNovo = (): ControleMidia => ({
  tocando: false,
  volume: 1,
  mudo: false,
  repetir: false,
  ordem: 0,
  busca: { seq: 0, segundos: 0, relativo: false },
})

function saidaNova(id: string): EstadoSaida {
  return { id, conteudo: { tipo: 'vazio' }, chave: 0, fundo: { tipo: 'nenhum' }, tela: 'normal', video: controleNovo() }
}

export interface DadosAbrirMusica {
  musicaId: number
  titulo: string
  album: string
  versao: VersaoMusica
  slides: SlideMusica[]
  alvo: Alvo
  fundoUrl: string | null
  audioUrl: string | null
  tituloNaIntroducao: boolean
  /** trecho inicial (padrão: introdução) */
  indice?: number
}

/** Conteúdo de uma saída para o trecho atual da música. */
export function conteudoDaLetra(m: EstadoMusica): Conteudo {
  const i = m.indice
  const texto = i >= 0 ? (m.slides[i]?.texto ?? '') : m.tituloNaIntroducao ? m.titulo : ''
  return { tipo: 'letra', titulo: m.titulo, texto, proximo: m.slides[i + 1]?.texto ?? null, indice: i, total: m.slides.length }
}

/**
 * Fonte da verdade do que está no ar: o conteúdo de cada saída, a trilha de áudio e a música aberta.
 * Recebe comandos e emite 'estado' com o estado completo; as janelas só desenham o que recebem.
 */
export class Motor extends EventEmitter {
  private _estado: EstadoMotor = { versao: 0, saidas: {}, audio: { fonte: null, controle: controleNovo() }, musica: null }
  private proximaChave = 1
  /** antecipação usada quando o operador escolhe um trecho e o áudio pula para ele */
  clicarPulaAudio = true

  constructor(ids: string[]) {
    super()
    this.sincronizarSaidas(ids)
  }

  get estado(): EstadoMotor {
    return this._estado
  }

  /** Acompanha as saídas da configuração: cria as novas e tira as removidas. */
  sincronizarSaidas(ids: string[]): void {
    const atuais = this._estado.saidas
    const mudou = ids.length !== Object.keys(atuais).length || ids.some((id) => !atuais[id])
    if (!mudou) return
    this.alterar((e) => {
      const saidas: Record<string, EstadoSaida> = {}
      for (const id of ids) saidas[id] = atuais[id] ?? saidaNova(id)
      e.saidas = saidas
    })
  }

  executar(c: Comando): void {
    this.alterar((e) => this.aplicar(e, c))
  }

  abrirMusica(d: DadosAbrirMusica): void {
    this.alterar((e) => {
      this.fecharMusica(e)
      const m: EstadoMusica = {
        musicaId: d.musicaId,
        titulo: d.titulo,
        album: d.album,
        versao: d.versao,
        slides: d.slides,
        indice: Math.min(Math.max(d.indice ?? -1, -1), d.slides.length - 1),
        seguirAudio: d.versao !== 'manual',
        tituloNaIntroducao: d.tituloNaIntroducao,
        alvo: d.alvo,
        fundoUrl: d.fundoUrl,
      }
      e.musica = m
      if (d.versao !== 'manual' && d.audioUrl) {
        e.audio.fonte = { tipo: 'musica', url: d.audioUrl, nome: d.titulo, musicaId: d.musicaId, versao: d.versao }
        tocarDoInicio(e.audio.controle)
        if (m.indice > 0) e.audio.controle.busca = proximaBusca(e.audio.controle, (m.slides[m.indice]?.ms ?? 0) / 1000)
      }
      for (const id of this.ids(e, d.alvo)) {
        const s = e.saidas[id]!
        if (d.fundoUrl) s.fundo = { tipo: 'imagem', url: d.fundoUrl, nome: d.titulo }
        this.mostrarEm(s, conteudoDaLetra(m))
      }
    })
  }

  private alterar(f: (e: EstadoMotor) => void): void {
    const e = structuredClone(this._estado)
    f(e)
    e.versao = this._estado.versao + 1
    this._estado = e
    this.emit('estado', e)
  }

  private ids(e: EstadoMotor, alvo: Alvo): string[] {
    const ids = Object.keys(e.saidas)
    if (alvo === TODAS) return ids
    return ids.includes(alvo) ? [alvo] : []
  }

  private mostrarEm(s: EstadoSaida, conteudo: Conteudo): void {
    s.conteudo = conteudo
    s.chave = this.proximaChave++
    // conteúdo novo sai de "limpar" e "logo"; o preto só sai com comando explícito
    if (s.tela === 'limpar' || s.tela === 'logo') s.tela = 'normal'
  }

  private aplicar(e: EstadoMotor, c: Comando): void {
    switch (c.tipo) {
      case 'mostrar': {
        const alvos = this.ids(e, c.alvo)
        alvos.forEach((id, i) => {
          const s = e.saidas[id]!
          this.mostrarEm(s, c.conteudo)
          if (c.conteudo.tipo === 'video') {
            tocarDoInicio(s.video)
            s.video.repetir = c.conteudo.loop
            // o mesmo vídeo em várias saídas: só a primeira solta o som
            s.video.mudo = i > 0
          } else {
            s.video.tocando = false
          }
        })
        return
      }
      case 'fundo':
        for (const id of this.ids(e, c.alvo)) e.saidas[id]!.fundo = c.fundo
        return
      case 'tela':
        for (const id of this.ids(e, c.alvo)) e.saidas[id]!.tela = c.tela
        return
      case 'midia':
        if (c.alvo === AUDIO) {
          if (!e.audio.fonte) return
          if (c.acao === 'parar') {
            if (e.audio.fonte.tipo === 'musica') this.fecharMusica(e)
            else pararAudio(e)
          } else acaoNoControle(e.audio.controle, c.acao)
          return
        }
        for (const id of this.ids(e, c.alvo)) {
          const s = e.saidas[id]!
          if (s.conteudo.tipo !== 'video') continue
          if (c.acao === 'parar') {
            this.mostrarEm(s, { tipo: 'vazio' })
            s.video.tocando = false
          } else acaoNoControle(s.video, c.acao)
        }
        return
      case 'buscar':
        for (const ctl of this.controles(e, c.alvo, true)) ctl.busca = proximaBusca(ctl, c.segundos, c.relativo)
        return
      case 'repetir':
        for (const ctl of this.controles(e, c.alvo, true)) ctl.repetir = c.valor
        return
      case 'volume':
        for (const ctl of this.controles(e, c.alvo, false)) {
          if (typeof c.volume === 'number') ctl.volume = Math.min(1, Math.max(0, c.volume))
          if (typeof c.mudo === 'boolean') ctl.mudo = c.mudo
        }
        return
      case 'audio':
        if (e.audio.fonte?.tipo === 'musica') this.fecharMusica(e)
        if (!c.fonte) {
          pararAudio(e)
          return
        }
        e.audio.fonte = c.fonte as FonteAudio
        e.audio.controle.repetir = false
        tocarDoInicio(e.audio.controle)
        return
      case 'musica:slide': {
        const m = e.musica
        if (!m) return
        if (c.origem === 'audio' && !m.seguirAudio) return
        const indice = Math.min(Math.max(c.indice, -1), m.slides.length - 1)
        if (c.origem === 'operador' && m.versao !== 'manual' && e.audio.fonte?.tipo === 'musica') {
          if (this.clicarPulaAudio && m.seguirAudio) {
            e.audio.controle.busca = proximaBusca(e.audio.controle, Math.max(0, (m.slides[indice]?.ms ?? 0) / 1000))
          } else {
            m.seguirAudio = false
          }
        }
        if (indice === m.indice) return
        m.indice = indice
        // só atualiza as saídas que ainda mostram a letra (se o operador pôs outra coisa, respeita)
        for (const id of this.ids(e, m.alvo)) {
          const s = e.saidas[id]!
          if (s.conteudo.tipo === 'letra') this.mostrarEm(s, conteudoDaLetra(m))
        }
        return
      }
      case 'musica:seguir':
        if (e.musica) e.musica.seguirAudio = c.valor && e.musica.versao !== 'manual'
        return
      case 'musica:fechar':
        this.fecharMusica(e)
        return
    }
  }

  /** Controles de mídia do alvo: a trilha de áudio ou o vídeo das saídas. */
  private controles(e: EstadoMotor, alvo: Alvo, soComVideo: boolean): ControleMidia[] {
    if (alvo === AUDIO) return e.audio.fonte || !soComVideo ? [e.audio.controle] : []
    return this.ids(e, alvo)
      .map((id) => e.saidas[id]!)
      .filter((s) => !soComVideo || s.conteudo.tipo === 'video')
      .map((s) => s.video)
  }

  private fecharMusica(e: EstadoMotor): void {
    const m = e.musica
    if (!m) return
    for (const id of this.ids(e, m.alvo)) {
      const s = e.saidas[id]!
      if (s.conteudo.tipo === 'letra') this.mostrarEm(s, { tipo: 'vazio' })
      if (m.fundoUrl && s.fundo.tipo === 'imagem' && s.fundo.url === m.fundoUrl) s.fundo = { tipo: 'nenhum' }
    }
    if (e.audio.fonte?.tipo === 'musica') pararAudio(e)
    e.musica = null
  }
}

function tocarDoInicio(ctl: ControleMidia): void {
  ctl.tocando = true
  ctl.ordem += 1
}

function acaoNoControle(ctl: ControleMidia, acao: 'tocar' | 'pausar' | 'reiniciar'): void {
  if (acao === 'tocar') {
    ctl.tocando = true
    ctl.ordem += 1
  } else if (acao === 'pausar') {
    ctl.tocando = false
    ctl.ordem += 1
  } else {
    ctl.busca = proximaBusca(ctl, 0)
    ctl.tocando = true
    ctl.ordem += 1
  }
}

function proximaBusca(ctl: ControleMidia, segundos: number, relativo = false): ControleMidia['busca'] {
  return { seq: ctl.busca.seq + 1, segundos, relativo }
}

function pararAudio(e: EstadoMotor): void {
  e.audio.fonte = null
  e.audio.controle.tocando = false
  e.audio.controle.ordem += 1
}
