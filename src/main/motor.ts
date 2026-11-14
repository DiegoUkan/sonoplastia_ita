import { EventEmitter } from 'node:events'
import { comecaSozinha, type MidiaSlide, type ModoMidiasSlides, primeiroSlide, slideVizinho } from '../shared/apresentacao'
import {
  type Alvo,
  AUDIO,
  type Comando,
  type Conteudo,
  type ControleMidia,
  type EstadoApresentacao,
  type EstadoMotor,
  type EstadoLiturgia,
  type EstadoMusica,
  type EstadoSaida,
  type FonteAudio,
  type Fundo,
  type SlideMusica,
  type SlideNoMotor,
  TODAS,
  type VersaoMusica,
  videoDoConteudo,
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

export interface DadosAbrirApresentacao {
  apresentacaoId: number
  nome: string
  slides: SlideNoMotor[]
  alvo: Alvo
  /** slide inicial (padrão: o primeiro que não está oculto) */
  indice?: number
}

/** O que fazer quando o áudio de uma música chega ao fim (configuração). */
export type AoTerminarMusica = 'fechar' | 'logo' | 'manter'

const SEM_FUNDO: Fundo = { tipo: 'nenhum' }
const mesmoFundo = (a: Fundo, b: Fundo) => a.tipo === b.tipo && (a.tipo === 'nenhum' || a.url === (b as { url: string }).url)

/** A saída está mostrando um slide desta apresentação? */
function mostraApresentacao(s: EstadoSaida, apresentacaoId: number): boolean {
  return s.conteudo.tipo === 'slide' && s.conteudo.apresentacaoId === apresentacaoId
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
  private _estado: EstadoMotor = { versao: 0, saidas: {}, audio: { fonte: null, controle: controleNovo() }, musica: null, apresentacao: null, liturgia: null }
  private proximaChave = 1
  /** antecipação usada quando o operador escolhe um trecho e o áudio pula para ele */
  clicarPulaAudio = true
  /** o passador pula os slides ocultos (configuração) */
  pularOcultos = true
  /** como os vídeos e áudios dos slides começam (configuração) */
  midiasDosSlides: ModoMidiasSlides = 'como-no-arquivo'
  /** o que acontece quando o áudio da música termina (configuração) */
  aoTerminarMusica: AoTerminarMusica = 'fechar'
  private _fundoPadrao: Fundo = SEM_FUNDO

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

  get fundoPadrao(): Fundo {
    return this._fundoPadrao
  }

  /**
   * Fundo dos versículos, dos textos e das músicas sem imagem própria (configuração). Troca na hora o
   * fundo das saídas que já mostram esse tipo de conteúdo.
   */
  definirFundoPadrao(f: Fundo): void {
    if (mesmoFundo(f, this._fundoPadrao)) return
    this._fundoPadrao = f
    this.alterar((e) => {
      for (const s of Object.values(e.saidas)) s.fundo = this.fundoDe(s.conteudo, e)
    })
  }

  /**
   * Liturgia em andamento (item no ar e o fundo da seção dele), ou null para encerrar. Troca na hora
   * o fundo das saídas que mostram versículo, texto ou letra.
   */
  definirLiturgia(l: EstadoLiturgia | null): void {
    this.alterar((e) => {
      e.liturgia = l
      for (const s of Object.values(e.saidas)) s.fundo = this.fundoDe(s.conteudo, e)
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
      for (const id of this.ids(e, d.alvo)) this.mostrarEm(e, e.saidas[id]!, conteudoDaLetra(m))
    })
  }

  abrirApresentacao(d: DadosAbrirApresentacao): void {
    if (!d.slides.length) return
    this.alterar((e) => {
      this.fecharApresentacao(e)
      const a: EstadoApresentacao = {
        apresentacaoId: d.apresentacaoId,
        nome: d.nome,
        slides: d.slides,
        indice: -1,
        alvo: d.alvo,
        midiasIniciadas: false,
      }
      e.apresentacao = a
      this.mostrarSlide(e, a, d.indice ?? primeiroSlide(d.slides.map((s) => s.oculto), this.pularOcultos), true)
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

  /**
   * Fundo de cada tipo de conteúdo: a letra usa a imagem da música (ou o fundo padrão, se ela não tem);
   * versículo e texto usam o fundo padrão; o resto (imagem, vídeo, slide, vazio) fica sem fundo.
   * Com uma liturgia em andamento, o fundo da seção atual entra no lugar do padrão (e no lugar da
   * imagem da música, se a seção pede "fundo também nas músicas").
   */
  private fundoDe(c: Conteudo, e: EstadoMotor): Fundo {
    const secao = e.liturgia?.fundo.tipo === 'imagem' ? e.liturgia.fundo : null
    const padrao = secao ?? this._fundoPadrao
    if (c.tipo === 'letra') {
      if (secao && e.liturgia!.fundoNasMusicas) return secao
      const m = e.musica
      return m?.fundoUrl ? { tipo: 'imagem', url: m.fundoUrl, nome: m.titulo } : padrao
    }
    if (c.tipo === 'versiculo' || c.tipo === 'texto') return padrao
    return SEM_FUNDO
  }

  private mostrarEm(e: EstadoMotor, s: EstadoSaida, conteudo: Conteudo): void {
    s.conteudo = conteudo
    s.fundo = this.fundoDe(conteudo, e)
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
          this.mostrarEm(e, s, c.conteudo)
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
          if (!videoDoConteudo(s.conteudo)) continue
          if (c.acao === 'parar' && s.conteudo.tipo === 'slide') {
            // o slide fica no ar; o vídeo dele volta para o começo, parado
            s.video.tocando = false
            s.video.ordem += 1
            s.video.busca = proximaBusca(s.video, 0)
          } else if (c.acao === 'parar') {
            this.mostrarEm(e, s, { tipo: 'vazio' })
            s.video.tocando = false
          } else {
            acaoNoControle(s.video, c.acao)
            // o operador já começou o vídeo do slide pelo player: o próximo clique troca de slide
            const a = e.apresentacao
            if (c.acao !== 'pausar' && a && mostraApresentacao(s, a.apresentacaoId)) a.midiasIniciadas = true
          }
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
          if (s.conteudo.tipo === 'letra') this.mostrarEm(e, s, conteudoDaLetra(m))
        }
        return
      }
      case 'musica:seguir':
        if (e.musica) e.musica.seguirAudio = c.valor && e.musica.versao !== 'manual'
        return
      case 'musica:fechar':
        this.fecharMusica(e)
        return
      case 'audio:terminou': {
        // o aviso tem que ser do áudio que está tocando agora (não de um que já foi trocado)
        const f = e.audio.fonte
        if (f?.tipo !== 'musica' || f.url !== c.url || e.audio.controle.repetir || this.aoTerminarMusica === 'manter') return
        const m = e.musica
        const comLetra = m ? this.ids(e, m.alvo).filter((id) => e.saidas[id]!.conteudo.tipo === 'letra') : []
        this.fecharMusica(e)
        if (this.aoTerminarMusica !== 'logo') return
        // o preto continua: só sai com um comando explícito
        for (const id of comLetra) if (e.saidas[id]!.tela !== 'preto') e.saidas[id]!.tela = 'logo'
        return
      }
      case 'apresentacao:slide': {
        const a = e.apresentacao
        if (!a) return
        if (c.alvo !== undefined) a.alvo = c.alvo
        this.mostrarSlide(e, a, c.indice, true)
        return
      }
      case 'apresentacao:passo':
        this.passo(e, c.passo)
        return
      case 'apresentacao:fechar':
        this.fecharApresentacao(e)
        return
      case 'liturgia:fechar':
        e.liturgia = null
        for (const s of Object.values(e.saidas)) s.fundo = this.fundoDe(s.conteudo, e)
        return
    }
  }

  private conteudoDoSlide(a: EstadoApresentacao): Conteudo {
    const s = a.slides[a.indice]!
    const proximo = slideVizinho(
      a.slides.map((x) => x.oculto),
      a.indice,
      1,
      this.pularOcultos,
    )
    return {
      tipo: 'slide',
      apresentacaoId: a.apresentacaoId,
      nome: a.nome,
      url: s.url,
      proporcao: s.proporcao,
      indice: a.indice,
      total: a.slides.length,
      proximoUrl: proximo === null ? null : a.slides[proximo]!.url,
      notas: s.notas,
      video: s.midias.find((m) => m.tipo === 'video') ?? null,
    }
  }

  /**
   * Põe o slide `indice` no ar. `todasDoAlvo`: em todas as saídas do alvo; senão só nas que ainda
   * mostram esta apresentação (se o operador pôs outra coisa numa saída, o passador respeita).
   */
  private mostrarSlide(e: EstadoMotor, a: EstadoApresentacao, indice: number, todasDoAlvo: boolean): void {
    const i = Math.min(Math.max(indice, 0), a.slides.length - 1)
    if (i !== a.indice) this.pararAudioDoSlide(e, a.apresentacaoId, false)
    a.indice = i
    const slide = a.slides[i]!
    const conteudo = this.conteudoDoSlide(a)
    const video = conteudo.tipo === 'slide' ? conteudo.video : null
    let comSom = true
    for (const id of this.ids(e, a.alvo)) {
      const s = e.saidas[id]!
      if (!todasDoAlvo && !mostraApresentacao(s, a.apresentacaoId)) continue
      this.mostrarEm(e, s, conteudo)
      if (video) {
        s.video.tocando = comecaSozinha(video, this.midiasDosSlides)
        s.video.ordem += 1
        s.video.repetir = video.repetir
        // o mesmo vídeo em várias saídas: só a primeira solta o som
        s.video.mudo = !comSom
        comSom = false
      } else {
        s.video.tocando = false
      }
    }
    // áudio que começa sozinho; se já está tocando (vem de um slide anterior), não recomeça
    for (const m of slide.midias) {
      if (m.tipo === 'audio' && comecaSozinha(m, this.midiasDosSlides) && e.audio.fonte?.url !== m.url) this.tocarAudioDoSlide(e, a, m)
    }
    a.midiasIniciadas = slide.midias.every((m) => comecaSozinha(m, this.midiasDosSlides))
  }

  /** Passador: o "próximo" começa as mídias "no clique" do slide; depois anda de slide. */
  private passo(e: EstadoMotor, passo: 1 | -1): void {
    const a = e.apresentacao
    if (!a) return
    // nenhuma saída mostra mais a apresentação (o operador pôs outra coisa): volta com o mesmo slide
    if (!this.ids(e, a.alvo).some((id) => mostraApresentacao(e.saidas[id]!, a.apresentacaoId))) {
      this.mostrarSlide(e, a, a.indice, true)
      return
    }
    const slide = a.slides[a.indice]!
    if (passo === 1 && !a.midiasIniciadas) {
      this.iniciarMidias(
        e,
        a,
        slide.midias.filter((m) => !comecaSozinha(m, this.midiasDosSlides)),
      )
      a.midiasIniciadas = true
      return
    }
    const j = slideVizinho(
      a.slides.map((s) => s.oculto),
      a.indice,
      passo,
      this.pularOcultos,
    )
    if (j !== null) this.mostrarSlide(e, a, j, false)
  }

  private iniciarMidias(e: EstadoMotor, a: EstadoApresentacao, midias: MidiaSlide[]): void {
    for (const m of midias) {
      if (m.tipo === 'audio') {
        this.tocarAudioDoSlide(e, a, m)
        continue
      }
      for (const id of this.ids(e, a.alvo)) {
        const s = e.saidas[id]!
        if (s.conteudo.tipo === 'slide' && s.conteudo.apresentacaoId === a.apresentacaoId && s.conteudo.video?.url === m.url) {
          s.video.tocando = true
          s.video.ordem += 1
        }
      }
    }
  }

  private tocarAudioDoSlide(e: EstadoMotor, a: EstadoApresentacao, m: MidiaSlide): void {
    if (e.audio.fonte?.tipo === 'musica') this.fecharMusica(e)
    e.audio.fonte = { tipo: 'slide', url: m.url, nome: m.nome, apresentacaoId: a.apresentacaoId, continua: m.continua }
    e.audio.controle.repetir = m.repetir
    e.audio.controle.busca = proximaBusca(e.audio.controle, 0)
    tocarDoInicio(e.audio.controle)
  }

  /** Para o áudio que veio desta apresentação (o que "continua" entre slides só com `tudo`). */
  private pararAudioDoSlide(e: EstadoMotor, apresentacaoId: number, tudo: boolean): void {
    const f = e.audio.fonte
    if (f?.tipo === 'slide' && f.apresentacaoId === apresentacaoId && (tudo || !f.continua)) pararAudio(e)
  }

  private fecharApresentacao(e: EstadoMotor): void {
    const a = e.apresentacao
    if (!a) return
    for (const s of Object.values(e.saidas)) {
      if (!mostraApresentacao(s, a.apresentacaoId)) continue
      this.mostrarEm(e, s, { tipo: 'vazio' })
      s.video.tocando = false
    }
    this.pararAudioDoSlide(e, a.apresentacaoId, true)
    e.apresentacao = null
  }

  /** Controles de mídia do alvo: a trilha de áudio ou o vídeo das saídas. */
  private controles(e: EstadoMotor, alvo: Alvo, soComVideo: boolean): ControleMidia[] {
    if (alvo === AUDIO) return e.audio.fonte || !soComVideo ? [e.audio.controle] : []
    return this.ids(e, alvo)
      .map((id) => e.saidas[id]!)
      .filter((s) => !soComVideo || !!videoDoConteudo(s.conteudo))
      .map((s) => s.video)
  }

  private fecharMusica(e: EstadoMotor): void {
    const m = e.musica
    if (!m) return
    for (const id of this.ids(e, m.alvo)) {
      const s = e.saidas[id]!
      if (s.conteudo.tipo === 'letra') this.mostrarEm(e, s, { tipo: 'vazio' })
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
