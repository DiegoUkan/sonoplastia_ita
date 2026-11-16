/**
 * Bíblia automática no processo principal.
 *
 *   microfone (janela oculta "escuta", 100 ms por quadro, 16 kHz)
 *     → porta de voz: só abre a transcrição quando alguém fala; fecha depois do silêncio
 *     → ElevenLabs (frases finais) → analisador (referências ditas, busca + IA a cada intervalo)
 *     → sugestões na página Bíblia; citação direta pode ir sozinha para a tela
 *
 * Economia: sem voz (ou com música/vídeo tocando pelo programa) a conexão com o ElevenLabs fica fechada
 * e a IA não é chamada (o analisador só chama com fala nova). Não usa nada do Electron: as janelas
 * entram pelas dependências.
 */
import { EventEmitter } from 'node:events'
import { conteudoDoVersiculo } from '../../shared/biblia/mostrar'
import { formatarReferencia } from '../../shared/biblia/referencia'
import type { Config } from '../../shared/config'
import type { VersaoBiblia } from '../../shared/dados'
import { type Alvo, type Comando, type EstadoMotor, TODAS } from '../../shared/estado'
import type { EstadoTranscricao, NivelEscuta, ResultadoTeste, SituacaoEscuta } from '../../shared/transcricao/tipos'
import { type OpcoesPorta, PortaVoz, TAXA_AMOSTRAS } from '../../shared/transcricao/voz'
import { AnalisadorFala, type BibliaDoAnalisador } from './analisador'
import { ConexaoElevenLabs, type OpcoesElevenLabs } from './elevenlabs'
import { ESQUEMA, FORMATO_TEXTO, lerEscolhas, montarPedido, sistemaDaIA } from './escolha'
import { type Buscar, type ConexaoIA, criarProvedor, type ProvedorIA } from './ia'
import { type FonteIndice, IndiceBiblia } from './indice'

/** O que o serviço precisa de uma conexão de transcrição (a do ElevenLabs ou uma de mentira nos testes). */
export interface ConexaoTranscricao extends EventEmitter {
  readonly abriu: boolean
  enviar(pcm: Int16Array): void
  encerrar(): Promise<void>
  fecharJa(): void
}

export interface BibliaDoServico extends BibliaDoAnalisador, FonteIndice {
  versoes(): VersaoBiblia[]
}

export interface MotorDoServico {
  readonly estado: EstadoMotor
  executar(c: Comando): void
}

export interface DependenciasServico {
  config: () => Config
  motor: MotorDoServico
  biblia: BibliaDoServico
  /** abre (ou reabre, com outro microfone) a janela que captura o áudio */
  abrirEscuta: (microfone: string) => void
  fecharEscuta: () => void
  /** alguma mídia tocando de verdade agora (pela telemetria das janelas) */
  midiaTocando: () => boolean
  buscar?: Buscar
  criarConexao?: (o: OpcoesElevenLabs) => ConexaoTranscricao
  criarProvedor?: (c: ConexaoIA) => ProvedorIA
  log?: { info: (...p: unknown[]) => void; aviso: (...p: unknown[]) => void }
}

/** conteúdo que a citação direta pode trocar sozinha (nunca vídeo, música, slide ou teste) */
const TROCAVEIS = new Set(['vazio', 'versiculo', 'texto', 'imagem'])
/** quadros guardados para a reconexão não perder o começo da frase */
const QUADROS_GUARDADOS = 15

const opcoesPorta = (c: Config): OpcoesPorta => ({ sensibilidade: c.transcricao.auto.sensibilidade, silencioS: c.transcricao.auto.silencioS })

/** "João 3:16 (ARA)" mostra João 3:16 (mas "João 3:1" não é "João 3:16") */
export function mesmaReferencia(noAr: string, ref: string): boolean {
  return noAr.startsWith(ref) && !/\d/.test(noAr.charAt(ref.length))
}

export class ServicoTranscricao extends EventEmitter {
  private ligado = false
  private escutaPronta = false
  private erroEscuta: string | null = null
  private microfoneNome = ''
  private erroFatal: string | null = null
  private pausado = false
  private porta: PortaVoz
  private conexao: ConexaoTranscricao | null = null
  private falhas = 0
  private reabrirEm = 0
  private ultimos: Int16Array[] = []
  private parcial = ''
  private aviso: string | null = null
  private mostrado: EstadoTranscricao['mostrado'] = null
  private readonly analisador: AnalisadorFala
  private indice: IndiceBiblia | null = null
  private montando: Promise<void> | null = null
  private provedorAtual: ProvedorIA | null = null
  private chaveProvedor = ''
  private alvo: Alvo = TODAS
  private sigla = ''
  private microfoneAberto = ''
  private chaveElevenLabs = ''
  private timer: NodeJS.Timeout | null = null
  private agendado: NodeJS.Timeout | null = null
  private quadros = 0

  constructor(private readonly d: DependenciasServico) {
    super()
    this.porta = new PortaVoz(opcoesPorta(d.config()))
    this.chaveElevenLabs = d.config().transcricao.escuta.chaveElevenLabs
    this.analisador = new AnalisadorFala({
      biblia: d.biblia,
      indice: () => this.indice,
      provedor: () => this.provedor(),
      config: () => this.d.config().transcricao,
      sigla: () => this.siglaAtual(),
      mostrarSozinho: (l, c, v) => this.mostrarSozinho(l, c, v),
      aoMudar: () => this.emitir(),
      aviso: (m) => {
        this.aviso = m
        this.d.log?.aviso(`Bíblia automática: ${m}`)
        this.emitir()
      },
    })
  }

  // ------------------------------------------------------------------ liga e desliga

  ligar(sim: boolean): EstadoTranscricao {
    if (sim === this.ligado) return this.obter()
    this.ligado = sim
    if (sim) {
      const c = this.d.config()
      this.erroFatal = null
      this.erroEscuta = null
      this.escutaPronta = false
      this.falhas = 0
      this.reabrirEm = 0
      this.aviso = null
      this.porta = new PortaVoz(opcoesPorta(c))
      this.microfoneAberto = c.transcricao.escuta.microfone
      this.d.abrirEscuta(this.microfoneAberto)
      void this.garantirIndice()
      this.timer = setInterval(() => {
        this.analisador.talvezCiclo().catch((e) => this.d.log?.aviso('Bíblia automática: ciclo falhou', e))
      }, 500)
      this.d.log?.info('Bíblia automática ligada.')
    } else {
      if (this.timer) clearInterval(this.timer)
      this.timer = null
      this.porta.fechar()
      this.fecharConexao()
      this.d.fecharEscuta()
      this.parcial = ''
      this.pausado = false
      this.d.log?.info('Bíblia automática desligada.')
    }
    this.emitir()
    return this.obter()
  }

  encerrar(): void {
    this.ligar(false)
  }

  /** "Enviar para" e a versão da página Bíblia (a citação direta vai para lá, nessa versão). */
  contexto(c: { alvo?: string; sigla?: string }): void {
    if (typeof c.alvo === 'string' && c.alvo) this.alvo = c.alvo
    if (typeof c.sigla === 'string' && c.sigla !== this.sigla) {
      this.sigla = c.sigla
      this.analisador.refazerPrevias()
      this.emitir()
    }
  }

  configMudou(): void {
    const c = this.d.config()
    this.porta.configurar(opcoesPorta(c))
    if (c.transcricao.escuta.chaveElevenLabs !== this.chaveElevenLabs) {
      this.chaveElevenLabs = c.transcricao.escuta.chaveElevenLabs
      this.erroFatal = null
      this.falhas = 0
      this.reabrirEm = 0
    }
    if (this.ligado && c.transcricao.escuta.microfone !== this.microfoneAberto) {
      this.microfoneAberto = c.transcricao.escuta.microfone
      this.escutaPronta = false
      this.erroEscuta = null
      this.d.abrirEscuta(this.microfoneAberto)
    }
    this.emitir()
  }

  /** uma versão foi importada: o índice é refeito */
  bibliaMudou(): void {
    this.indice = null
    if (this.ligado) void this.garantirIndice()
  }

  limparSugestoes(): void {
    this.analisador.limparSugestoes()
    this.emitir()
  }

  // ------------------------------------------------------------------ áudio

  /** A janela de escuta abriu o microfone (ou não conseguiu). */
  statusEscuta(s: { ok: boolean; erro?: string; microfone?: string }): void {
    if (!this.ligado) return
    this.erroEscuta = s.ok ? null : (s.erro ?? 'Não consegui abrir o microfone.')
    this.escutaPronta = s.ok
    if (s.microfone) this.microfoneNome = s.microfone
    if (!s.ok) this.d.log?.aviso(`Bíblia automática: ${this.erroEscuta}`)
    this.emitir()
  }

  /** Um quadro de 100 ms do microfone (PCM 16 bits, 16 kHz). */
  receberAudio(pcm: Int16Array): void {
    if (!this.ligado) return
    const antes = this.situacao()
    this.escutaPronta = true
    const cfg = this.d.config().transcricao
    if (cfg.auto.pausarComMidia && this.d.midiaTocando()) {
      if (!this.pausado) {
        this.pausado = true
        this.parcial = ''
        this.porta.fechar()
        this.fecharConexao()
      }
      if (antes !== this.situacao()) this.emitir()
      return
    }
    this.pausado = false
    const dec = this.porta.quadro(pcm)
    if (++this.quadros % 2 === 0) this.emit('nivel', { db: dec.db, limiar: this.porta.limiar, voz: dec.voz } satisfies NivelEscuta)
    this.ultimos.push(pcm)
    if (this.ultimos.length > QUADROS_GUARDADOS) this.ultimos.shift()

    if (dec.abrir) {
      this.abrirConexao(dec.enviar)
    } else if (dec.enviar.length) {
      // a conexão caiu no meio da fala: abre outra (com o áudio guardado), depois da espera
      if (!this.conexao && !dec.fechar && !this.erroFatal && Date.now() >= this.reabrirEm) this.abrirConexao([...this.ultimos])
      else for (const q of dec.enviar) this.enviarQuadro(q)
    }
    if (dec.fechar) {
      this.fecharConexao()
      this.parcial = ''
    }
    if (antes !== this.situacao()) this.emitir()
  }

  private enviarQuadro(q: Int16Array): void {
    if (!this.conexao) return
    this.conexao.enviar(q)
    this.analisador.consumo.segundosAudio += q.length / TAXA_AMOSTRAS
  }

  private abrirConexao(iniciais: Int16Array[]): void {
    const chave = this.d.config().transcricao.escuta.chaveElevenLabs.trim()
    if (!chave || this.erroFatal) return
    if (this.conexao) {
      for (const q of iniciais) this.enviarQuadro(q)
      return
    }
    const criar = this.d.criarConexao ?? ((o: OpcoesElevenLabs) => new ConexaoElevenLabs(o))
    const c = criar({ chave, idioma: 'pt' })
    this.conexao = c
    c.on('aberta', () => {
      this.falhas = 0
      if (this.aviso?.startsWith('Transcrição:')) this.aviso = null
      this.emitir()
    })
    c.on('parcial', (t: string) => {
      this.parcial = t
      this.emit('parcial', t)
      this.emitir()
    })
    c.on('final', (t: string) => {
      this.parcial = ''
      this.emit('parcial', '')
      if (t) this.analisador.novaFala(t)
      else this.emitir()
    })
    c.on('erro', (m: string, fatal: boolean) => {
      this.d.log?.aviso(`Bíblia automática: ${m}`)
      if (fatal) this.erroFatal = m
      else this.aviso = `Transcrição: ${m}`
      this.emitir()
    })
    c.on('fechada', (inesperado: boolean) => {
      if (this.conexao === c) this.conexao = null
      if (!inesperado || !this.ligado || this.erroFatal) return
      this.falhas++
      this.reabrirEm = Date.now() + Math.min(30_000, 1000 * 2 ** Math.min(this.falhas - 1, 5))
      if (!c.abriu && this.falhas >= 3) {
        this.aviso = 'Transcrição: o ElevenLabs não abriu a conexão (confira a chave e a internet). Tentando de novo…'
        this.d.log?.aviso(`Bíblia automática: ${this.aviso}`)
      }
      this.emitir()
    })
    for (const q of iniciais) this.enviarQuadro(q)
  }

  private fecharConexao(): void {
    const c = this.conexao
    this.conexao = null
    if (c) void c.encerrar()
  }

  // ------------------------------------------------------------------ IA e índice

  private provedor(): ProvedorIA | null {
    const c = this.d.config().transcricao.ia
    if (!c.modelo.trim() || (c.tipo === 'anthropic' && !c.chave.trim())) return null
    const chave = JSON.stringify([c.tipo, c.url, c.chave, c.modelo])
    if (chave !== this.chaveProvedor) {
      this.chaveProvedor = chave
      try {
        this.provedorAtual = this.criarProvedor({ tipo: c.tipo, url: c.url, chave: c.chave.trim(), modelo: c.modelo.trim() })
      } catch (e) {
        this.provedorAtual = null
        this.aviso = `IA: ${e instanceof Error ? e.message : String(e)}`
      }
    }
    return this.provedorAtual
  }

  private criarProvedor(c: ConexaoIA): ProvedorIA {
    return this.d.criarProvedor ? this.d.criarProvedor(c) : criarProvedor(c, this.d.buscar)
  }

  private garantirIndice(): Promise<void> {
    if (this.indice) return Promise.resolve()
    if (this.montando) return this.montando
    if (!this.d.biblia.versoes().length) return Promise.resolve()
    const t0 = Date.now()
    this.montando = IndiceBiblia.montar(this.d.biblia)
      .then((i) => {
        this.indice = i
        this.d.log?.info(`Bíblia automática: índice de ${i.versiculos} versículos em ${Date.now() - t0} ms.`)
      })
      .catch((e) => this.d.log?.aviso('Bíblia automática: o índice não montou', e))
      .finally(() => {
        this.montando = null
      })
    return this.montando
  }

  /** Autoteste: troca a conexão do ElevenLabs e a IA por outras de mentira (nada sai do computador). */
  paraTeste(t: Pick<DependenciasServico, 'criarConexao' | 'criarProvedor'>): void {
    this.d.criarConexao = t.criarConexao
    this.d.criarProvedor = t.criarProvedor
    this.chaveProvedor = ''
  }

  /** espera o índice ficar pronto (testes e autoteste) */
  async prontoParaBuscar(): Promise<void> {
    await this.garantirIndice()
  }

  private siglaAtual(): string {
    const versoes = this.d.biblia.versoes()
    if (this.sigla && versoes.some((v) => v.sigla === this.sigla)) return this.sigla
    const padrao = this.d.config().biblia.versaoPadrao
    if (padrao && versoes.some((v) => v.sigla === padrao)) return padrao
    return versoes[0]?.sigla ?? ''
  }

  // ------------------------------------------------------------------ citação direta na tela

  /**
   * Põe o versículo no "Enviar para" da página, se ali só há versículo, texto, imagem ou nada (nunca
   * troca vídeo, música ou slide) e a tela está normal (sem Logo, Preto ou Limpar).
   */
  private mostrarSozinho(livro: number, capitulo: number, versiculo: number): boolean {
    const cfg = this.d.config()
    const e = this.d.motor.estado
    const ids = this.alvo === TODAS ? cfg.saidas.filter((s) => s.ativa).map((s) => s.id) : [this.alvo]
    const saidas = ids.map((id) => e.saidas[id]).filter((s) => !!s)
    if (!saidas.length) return false
    if (!saidas.every((s) => s.tela === 'normal' && TROCAVEIS.has(s.conteudo.tipo))) return false
    const ref = formatarReferencia(livro, capitulo, versiculo)
    if (saidas.every((s) => s.conteudo.tipo === 'versiculo' && mesmaReferencia(s.conteudo.referencia, ref))) return false
    const sigla = this.siglaAtual()
    const textos = this.d.biblia.textosDoVersiculo(livro, capitulo, versiculo)
    const texto = textos.find((x) => x.sigla === sigla)?.texto
    if (!sigla || !texto) return false
    const s2 = cfg.biblia.segundaVersao
    const t2 = s2 && s2 !== sigla ? textos.find((x) => x.sigla === s2)?.texto : undefined
    const { conteudo } = conteudoDoVersiculo({
      livro,
      capitulo,
      versiculo,
      texto,
      parte: 0,
      sigla,
      cfg: cfg.biblia,
      segundo: t2 ? { sigla: s2, texto: t2 } : null,
    })
    this.d.motor.executar({ tipo: 'mostrar', alvo: this.alvo, conteudo })
    this.mostrado = { seq: (this.mostrado?.seq ?? 0) + 1, livro, capitulo, versiculo, sigla }
    this.d.log?.info(`Bíblia automática: ${ref} (${sigla}) foi para a tela sozinho.`)
    return true
  }

  // ------------------------------------------------------------------ estado

  private faltando(): string[] {
    const c = this.d.config().transcricao
    const f: string[] = []
    if (!c.escuta.chaveElevenLabs.trim()) f.push('a chave do ElevenLabs')
    if (c.ia.tipo === 'anthropic' && !c.ia.chave.trim()) f.push('a chave da IA')
    if (!c.ia.modelo.trim()) f.push('o modelo da IA')
    if (!this.d.biblia.versoes().length) f.push('uma versão da Bíblia importada')
    return f
  }

  private situacao(): SituacaoEscuta {
    if (!this.ligado) return 'desligado'
    if (this.erroFatal || this.erroEscuta || !this.d.config().transcricao.escuta.chaveElevenLabs.trim()) return 'erro'
    if (!this.escutaPronta) return 'iniciando'
    if (this.pausado) return 'pausado'
    return this.porta.estaAberta ? 'ouvindo' : 'espera'
  }

  private mensagem(s: SituacaoEscuta): string {
    switch (s) {
      case 'desligado':
        return 'Modo manual: nada é ouvido nem gasto.'
      case 'erro':
        if (this.erroEscuta) return this.erroEscuta
        if (this.erroFatal) return `${this.erroFatal} Confira a chave em Configurações → Bíblia automática e ligue de novo.`
        return 'Falta a chave do ElevenLabs (Configurações → Bíblia automática).'
      case 'iniciando':
        return 'Abrindo o microfone…'
      case 'pausado':
        return 'Pausado: música, áudio ou vídeo tocando pelo programa.'
      case 'ouvindo':
        return 'Ouvindo e transcrevendo.'
      case 'espera':
        return 'Em espera: ninguém falando (a transcrição e a IA não gastam). Volta sozinho na próxima fala.'
    }
  }

  obter(): EstadoTranscricao {
    const s = this.situacao()
    return {
      ligado: this.ligado,
      situacao: s,
      mensagem: this.mensagem(s),
      faltando: this.faltando(),
      microfone: this.microfoneNome,
      parcial: this.parcial,
      falas: this.analisador.falas.slice(-12),
      sugestoes: this.analisador.sugestoes.map((x) => ({ ...x })),
      consumo: { ...this.analisador.consumo },
      aviso: this.aviso,
      mostrado: this.mostrado,
    }
  }

  private emitir(): void {
    if (this.agendado) return
    this.agendado = setTimeout(() => {
      this.agendado = null
      this.emit('estado', this.obter())
    }, 120)
  }

  // ------------------------------------------------------------------ testes das Configurações

  async testarIA(): Promise<ResultadoTeste> {
    const c = this.d.config().transcricao.ia
    if (!c.modelo.trim()) return { ok: false, mensagem: 'Escolha o modelo.' }
    if (c.tipo === 'anthropic' && !c.chave.trim()) return { ok: false, mensagem: 'Falta a chave da API.' }
    const fala = 'Porque Deus amou o mundo de tal maneira que deu o seu Filho unigênito, para que todo aquele que nele crê não pereça, mas tenha a vida eterna.'
    const jo316 = this.d.biblia.textosDoVersiculo(43, 3, 16)[0]?.texto
    // sem Bíblia importada, confere só o formato da referência
    const tamanhos = { versiculosNoCapitulo: (l: number, cap: number) => this.d.biblia.versiculosNoCapitulo(l, cap) || 176 }
    const t0 = Date.now()
    try {
      this.chaveProvedor = '' // a próxima chamada de verdade recomeça com os ajustes de economia
      const p = this.criarProvedor({ tipo: c.tipo, url: c.url, chave: c.chave.trim(), modelo: c.modelo.trim() })
      const r = await p.completarJson(sistemaDaIA(c.janelaS), montarPedido(fala, jo316 ? [{ referencia: 'Jo 3:16', texto: jo316 }] : [], [], 0), ESQUEMA, FORMATO_TEXTO)
      const escolhas = lerEscolhas(r.dados, 0, tamanhos)
      const s = ((Date.now() - t0) / 1000).toFixed(1).replace('.', ',')
      const lista = escolhas.map((e) => `${formatarReferencia(e.passagem.livro, e.passagem.capitulo, e.passagem.inicio, e.passagem.fim)} (${e.ligacao || '?'}, ${e.forca})`)
      return {
        ok: escolhas.length > 0,
        mensagem: `Respondeu em ${s} s, ${r.uso.entrada.toLocaleString('pt-BR')} + ${r.uso.saida.toLocaleString('pt-BR')} tokens: ${lista.join('; ') || 'nenhuma passagem (esperado: João 3:16)'}.`,
      }
    } catch (e) {
      return { ok: false, mensagem: e instanceof Error ? e.message : String(e) }
    }
  }

  async listarModelos(): Promise<Array<{ id: string; nome: string }>> {
    const c = this.d.config().transcricao.ia
    return this.criarProvedor({ tipo: c.tipo, url: c.url, chave: c.chave.trim(), modelo: c.modelo.trim() }).listarModelos()
  }

  /** Abre uma sessão no ElevenLabs sem mandar áudio (não custa) e fecha. */
  testarElevenLabs(): Promise<ResultadoTeste> {
    const chave = this.d.config().transcricao.escuta.chaveElevenLabs.trim()
    if (!chave) return Promise.resolve({ ok: false, mensagem: 'Falta a chave do ElevenLabs.' })
    const criar = this.d.criarConexao ?? ((o: OpcoesElevenLabs) => new ConexaoElevenLabs(o))
    return new Promise((resolver) => {
      const c = criar({ chave, idioma: 'pt' })
      let fim = false
      const terminar = (r: ResultadoTeste) => {
        if (fim) return
        fim = true
        clearTimeout(t)
        c.fecharJa()
        resolver(r)
      }
      const aceita = { ok: true, mensagem: 'Chave aceita: a transcrição abriu (nada foi cobrado).' }
      const t = setTimeout(() => terminar(c.abriu ? aceita : { ok: false, mensagem: 'O ElevenLabs não respondeu em 10 s.' }), 10_000)
      c.on('aberta', () => setTimeout(() => terminar(aceita), 1500))
      c.on('erro', (m: string) => terminar({ ok: false, mensagem: m }))
      c.on('fechada', () => terminar(c.abriu ? aceita : { ok: false, mensagem: 'O ElevenLabs recusou a conexão (chave errada ou sem internet).' }))
    })
  }
}

/** O que o celular recebe: sem a fala em andamento (vai à parte) e só a última fala. */
export function paraCelular(e: EstadoTranscricao): EstadoTranscricao {
  return { ...e, parcial: '', falas: e.falas.slice(-1) }
}

export function tocandoNoMotor(e: EstadoMotor): { audio: boolean; saidas: string[] } {
  return {
    audio: !!e.audio.fonte,
    saidas: Object.values(e.saidas)
      .filter((s) => s.conteudo.tipo === 'video' || (s.conteudo.tipo === 'slide' && !!s.conteudo.video))
      .map((s) => s.id),
  }
}
