/**
 * O motor das sugestões ao vivo (porta de `web/motor.py`): transcrição → referências ditas (na hora)
 * → a cada ciclo, busca por palavras + IA com a fala recente → sugestões para o operador.
 *
 * Só sugere: quem põe no ar é o operador (na página Bíblia ou no celular), pela Bíblia deste programa.
 * Emite 'estado' (EstadoTranscricao, agrupado) e 'parcial' (texto sendo dito e nível do microfone).
 */
import { EventEmitter } from 'node:events'
import type { ConfigTranscricao } from '../../shared/config'
import type { EstadoTranscricao, FaseTranscricao, Ligacao, OrigemSugestao, ParcialTranscricao, SugestaoVersiculo } from '../../shared/transcricao'
import { agruparVizinhos, type BibliaMemoria, type Candidato } from './busca'
import { type Escolha, EscolhedorIA, type ProvedorIA } from './ia'
import { iguais, type Passagem, referencia, sobrepoe } from './passagem'
import { Rastreador } from './parser'

export const MAX_SUGESTOES = 60
/** a IA/busca não sugere de novo o que já apareceu nos últimos 10 min */
export const NAO_REPETIR_MS = 600_000
/** a parte final da janela, que pesa mais */
const RECENTE_MS = 15_000
/** nota BM25 a partir da qual a fala provavelmente cita o versículo */
const LIMIAR_LEXICA_CITACAO = 45
const PREVIA_CAPITULO = 3
const MAX_PREVIA = 280
// economia de chamadas à IA (cada uma custa ~2 mil tokens)
const CANDIDATOS_IA = 12
/** pausa ou frase curta não gera chamada nova */
const MIN_PALAVRAS_NOVAS_IA = 12
/** a partir daqui só interessa citação, que a busca por palavras detecta… */
const RIGOR_SO_CITACAO = 90
/** …então, sem nenhum candidato com essa nota, nem pergunta à IA */
const LEXICA_MIN_RIGOR_ALTO = 35
const FALAS_NO_ESTADO = 8

/**
 * (nota mínima, BM25 mínimo) quando a IA está desligada, conforme o rigor 0–100. Citação literal tira
 * BM25 ~75–115; avisos e conversa ficam bem abaixo.
 */
export function limiaresSemIa(rigor: number): [number, number] {
  const f = rigor / 100
  return [4 + 5 * f, 25 + 50 * f]
}

/** O que o motor precisa de quem transcreve (a ElevenLabs, ou um falso nos testes). */
export interface Transcritor extends EventEmitter {
  iniciar(): void
  enviar(pcm: Uint8Array): void
  parar(): void
}

export interface DepsMotorSugestoes {
  config: () => ConfigTranscricao
  /** sigla da versão das prévias (a versão padrão da Bíblia) */
  versaoPadrao: () => string
  /** Bíblia em memória (demora uns segundos na primeira vez); erro se não há versão importada */
  carregarBiblia: () => Promise<BibliaMemoria>
  criarProvedor: (cfg: ConfigTranscricao) => ProvedorIA
  criarTranscritor: (cfg: ConfigTranscricao) => Transcritor
  /** abre/fecha a janela oculta que capta o microfone */
  escuta: { abrir(): void; fechar(): void }
  agora?: () => number
  log?: (msg: string) => void
}

interface Sugestao {
  id: number
  passagem: Passagem
  origem: OrigemSugestao
  ligacao: Ligacao
  motivo: string
  trecho: string
  hora: number
}

export class MotorSugestoes extends EventEmitter {
  private ligado = false
  private fase: FaseTranscricao = 'parado'
  private mensagem = ''
  private aviso: string | null = null
  private biblia: BibliaMemoria | null = null
  private carregando: Promise<BibliaMemoria> | null = null
  private rastreador: Rastreador | null = null
  private transcritor: Transcritor | null = null
  private escolhedor: EscolhedorIA | null = null
  private readonly falas: Array<{ hora: number; texto: string }> = []
  private sugestoes: Sugestao[] = []
  private proximoId = 1
  private novidade = false
  private ultimoCiclo = 0
  private ocupado = false
  private palavrasDesdeIa = 0
  private consumo = { chamadas: 0, entrada: 0, saida: 0 }
  private ciclos: NodeJS.Timeout | null = null
  private parcial = ''
  private nivel = 0
  private avisoEstado: NodeJS.Timeout | null = null
  private avisoParcial: NodeJS.Timeout | null = null
  private ultimoParcial = 0
  private chaveEmUso = ''
  /** muda a cada ligar: respostas atrasadas de uma escuta anterior são ignoradas */
  private sessao = 0
  private readonly agora: () => number

  constructor(private readonly d: DepsMotorSugestoes) {
    super()
    this.agora = d.agora ?? Date.now
  }

  // ---------- estado ----------

  estado(): EstadoTranscricao {
    const sigla = this.d.versaoPadrao()
    const versao = this.biblia ? Math.max(0, this.biblia.siglas.indexOf(sigla)) : 0
    return {
      ligado: this.ligado,
      fase: this.fase,
      mensagem: this.mensagem,
      ia: this.iaLigada(),
      falas: this.falas.slice(-FALAS_NO_ESTADO).map((f) => f.texto),
      sugestoes: this.sugestoes.map((s) => this.paraTela(s, versao)),
      consumo: { ...this.consumo },
      aviso: this.aviso,
    }
  }

  private paraTela(s: Sugestao, versao: number): SugestaoVersiculo {
    const p = s.passagem
    let previa = ''
    let sigla = ''
    if (this.biblia) {
      sigla = this.biblia.siglas[versao] ?? ''
      const versos = this.biblia.texto(p, versao)
      const usados = p.inicio === null ? versos.slice(0, PREVIA_CAPITULO) : versos
      previa = usados.length === 1 && p.inicio !== null ? usados[0]![1] : usados.map(([n, t]) => `${n} ${t}`).join(' ')
      if (previa.length > MAX_PREVIA) previa = `${previa.slice(0, MAX_PREVIA).replace(/\s+\S*$/, '')}…`
    }
    return {
      id: s.id,
      livro: p.livro,
      capitulo: p.capitulo,
      inicio: p.inicio,
      fim: p.fim,
      referencia: referencia(p),
      origem: s.origem,
      ligacao: s.ligacao,
      motivo: s.motivo,
      trecho: s.trecho,
      hora: s.hora,
      previa,
      sigla,
    }
  }

  /** Avisa as telas (agrupa mudanças seguidas). */
  private mudou(): void {
    if (this.avisoEstado) return
    this.avisoEstado = setTimeout(() => {
      this.avisoEstado = null
      this.emit('estado', this.estado())
    }, 80)
  }

  private mudarParcial(texto: string | null, nivel: number | null): void {
    if (texto !== null) this.parcial = texto
    if (nivel !== null) this.nivel = nivel
    if (this.avisoParcial) return
    const espera = Math.max(0, 200 - (this.agora() - this.ultimoParcial))
    this.avisoParcial = setTimeout(() => {
      this.avisoParcial = null
      this.ultimoParcial = this.agora()
      this.emit('parcial', { texto: this.parcial, nivel: this.nivel } satisfies ParcialTranscricao)
    }, espera)
  }

  private status(fase: FaseTranscricao, mensagem: string): void {
    this.fase = fase
    this.mensagem = mensagem
    this.mudou()
  }

  private iaLigada(): boolean {
    const c = this.d.config()
    return c.iaAtiva && !!c.iaChave.trim() && !!c.iaModelo.trim()
  }

  // ---------- ligar e desligar ----------

  /** O que falta configurar para ouvir (null = nada). */
  falta(): string | null {
    if (!this.d.config().elevenlabsChave.trim()) return 'Falta a chave da ElevenLabs (Configurações → Sugestões de versículos).'
    return null
  }

  async ligar(): Promise<void> {
    if (this.ligado) return
    const falta = this.falta()
    if (falta) {
      this.status('erro', falta)
      return
    }
    this.ligado = true
    const sessao = ++this.sessao
    this.aviso = null
    this.status('preparando', 'Preparando a Bíblia para as sugestões…')
    try {
      await this.garantirBiblia()
    } catch (e) {
      if (sessao !== this.sessao) return
      this.ligado = false
      this.status('erro', e instanceof Error ? e.message : String(e))
      return
    }
    if (sessao !== this.sessao || !this.ligado) return
    this.status('preparando', 'Conectando à ElevenLabs…')
    this.iniciarTranscritor()
    this.d.escuta.abrir()
    this.ciclos = setInterval(() => void this.talvezCiclo(), 500)
  }

  desligar(): void {
    if (!this.ligado && this.fase !== 'erro') return
    this.ligado = false
    this.sessao++
    if (this.ciclos) clearInterval(this.ciclos)
    this.ciclos = null
    this.d.escuta.fechar()
    this.pararTranscritor()
    this.mudarParcial('', 0)
    this.status('parado', '')
  }

  encerrar(): void {
    this.desligar()
  }

  private iniciarTranscritor(): void {
    const cfg = this.d.config()
    this.chaveEmUso = cfg.elevenlabsChave.trim()
    const t = this.d.criarTranscritor(cfg)
    this.transcritor = t
    t.on('conectado', () => this.transcritor === t && this.status('ouvindo', 'Ouvindo'))
    t.on('reconectando', (motivo: string) => this.transcritor === t && this.status('reconectando', `Sem conexão com a ElevenLabs (${motivo}); tentando de novo…`))
    t.on('parcial', (texto: string) => this.transcritor === t && this.mudarParcial(texto, null))
    t.on('final', (texto: string) => {
      if (this.transcritor !== t) return
      this.mudarParcial('', null)
      this.novaFala(texto)
    })
    t.on('erro', (mensagem: string) => {
      if (this.transcritor !== t) return
      this.desligar()
      this.status('erro', mensagem)
    })
    t.iniciar()
  }

  private pararTranscritor(): void {
    const t = this.transcritor
    this.transcritor = null
    t?.parar()
  }

  /**
   * Configurações mudaram (a versão padrão muda as prévias). Se foram as das sugestões, a IA é
   * recriada e uma chave nova da ElevenLabs reconecta.
   */
  configMudou(dasSugestoes = true): void {
    if (dasSugestoes) this.escolhedor = null
    if (dasSugestoes && this.ligado && this.transcritor && this.d.config().elevenlabsChave.trim() !== this.chaveEmUso) {
      this.pararTranscritor()
      this.iniciarTranscritor()
    }
    this.mudou()
  }

  /** As versões da Bíblia mudaram: a Bíblia em memória é montada de novo na próxima vez. */
  bibliaMudou(): void {
    if (this.carregando) return
    this.biblia = null
    this.rastreador = null
    this.escolhedor = null
    if (this.ligado) void this.garantirBiblia().catch(() => {})
  }

  private garantirBiblia(): Promise<BibliaMemoria> {
    if (this.biblia) return Promise.resolve(this.biblia)
    if (!this.carregando) {
      const inicio = this.agora()
      this.carregando = this.d
        .carregarBiblia()
        .then((b) => {
          this.biblia = b
          this.rastreador = new Rastreador(b)
          this.d.log?.(`Sugestões: Bíblia em memória (${b.siglas.join(', ')}, ${b.versiculos} versículos) em ${this.agora() - inicio} ms.`)
          return b
        })
        .finally(() => {
          this.carregando = null
        })
    }
    return this.carregando
  }

  // ---------- áudio e fala ----------

  /** Um bloco de áudio da janela de escuta (PCM 16 bits, 16 kHz). */
  audio(pcm: Uint8Array): void {
    if (!this.ligado) return
    this.transcritor?.enviar(pcm)
    // nível do microfone (para o operador ver que está chegando som)
    const amostras = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2))
    let soma = 0
    for (const a of amostras) soma += a * a
    const rms = Math.sqrt(soma / Math.max(1, amostras.length)) / 32768
    const db = 20 * Math.log10(rms || 1e-9)
    this.mudarParcial(null, Math.min(1, Math.max(0, (db + 60) / 60)))
  }

  /** A janela de escuta conseguiu (ou não) abrir o microfone. */
  avisoEscuta(a: { ok: boolean; erro?: string; dispositivo?: string }): void {
    if (!this.ligado) return
    if (a.ok) {
      if (a.dispositivo) this.d.log?.(`Sugestões: ouvindo "${a.dispositivo}".`)
      return
    }
    this.desligar()
    this.status('erro', a.erro || 'Não consegui abrir o microfone.')
  }

  /** Um trecho final da transcrição (também usado pelos testes). */
  novaFala(texto: string): void {
    const t = texto.trim()
    if (!t) return
    this.falas.push({ hora: this.agora(), texto: t })
    if (this.falas.length > 500) this.falas.splice(0, this.falas.length - 500)
    this.novidade = true
    this.palavrasDesdeIa += t.split(/\s+/).length
    for (const a of this.rastreador?.processar(t, this.agora() / 1000) ?? []) {
      this.adicionar(a.passagem, 'citada', a.explicita ? 'Citado na fala' : 'Citado (capítulo dito antes)', t)
    }
    this.mudou()
  }

  /** Entra como se fosse fala transcrita, sem ouvir nada (autoteste): monta a Bíblia se precisar. */
  async simular(texto: string): Promise<void> {
    await this.garantirBiblia()
    this.novaFala(texto)
  }

  limpar(): void {
    this.sugestoes = []
    this.falas.length = 0
    this.aviso = null
    this.mudou()
  }

  // ---------- ciclos de busca + IA ----------

  private async talvezCiclo(): Promise<void> {
    if (!this.ligado || this.ocupado || !this.novidade || !this.biblia) return
    if (this.agora() - this.ultimoCiclo < this.d.config().intervaloS * 1000) return
    this.novidade = false
    this.ultimoCiclo = this.agora()
    this.ocupado = true
    try {
      await this.ciclo()
    } catch (e) {
      this.d.log?.(`Sugestões: erro no ciclo: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      this.ocupado = false
    }
  }

  private janela(): { janela: string; recente: string; ultima: string } {
    const agora = this.agora()
    const falas = this.falas.filter((f) => f.hora >= agora - this.d.config().janelaS * 1000)
    const janela = falas.map((f) => f.texto).join(' ')
    const recente = falas.filter((f) => f.hora >= agora - RECENTE_MS).map((f) => f.texto).join(' ') || (falas[falas.length - 1]?.texto ?? '')
    return { janela, recente, ultima: this.falas[this.falas.length - 1]?.texto ?? '' }
  }

  /** Um ciclo: busca + IA (ou só busca) com a fala recente. Público para os testes. */
  async ciclo(): Promise<void> {
    const biblia = this.biblia
    if (!biblia) return
    const { janela, recente, ultima } = this.janela()
    if (janela.split(/\s+/).filter(Boolean).length < 6) return
    // janela inteira + parte recente + último trecho: cada um pode destacar coisas diferentes
    const textos = [...new Set([janela, recente, ultima].filter(Boolean))]
    const candidatos = biblia.buscar(textos, CANDIDATOS_IA)
    const recentes = this.passagensRecentes()
    const rigor = this.d.config().rigor
    if (this.iaLigada()) {
      if (this.palavrasDesdeIa < MIN_PALAVRAS_NOVAS_IA) return
      if (rigor >= RIGOR_SO_CITACAO && Math.max(0, ...candidatos.map((c) => c.lexica)) < LEXICA_MIN_RIGOR_ALTO) {
        this.palavrasDesdeIa = 0 // nada parecido com citação nesta fala
        return
      }
    }
    let origem: OrigemSugestao = 'ia'
    let escolhas = await this.escolherIa(janela, candidatos, recentes, rigor)
    if (escolhas === null) {
      origem = 'busca'
      const [notaMin, lexicaMin] = limiaresSemIa(rigor)
      const novos = candidatos.filter((c) => !recentes.some((r) => sobrepoe(c.passagem, r)))
      escolhas = agruparVizinhos(novos, 3)
        .filter((c) => c.nota >= notaMin || c.lexica >= lexicaMin)
        .slice(0, 2)
        .map(escolhaDaBusca)
    }
    // a mais relevante fica por último = no topo
    for (const e of [...escolhas].reverse()) this.adicionar(e.passagem, origem, e.motivo, recente || janela, e.ligacao)
  }

  private async escolherIa(fala: string, candidatos: Candidato[], recentes: Passagem[], rigor: number): Promise<Escolha[] | null> {
    if (!this.iaLigada() || !this.biblia) return null
    const sessao = this.sessao
    try {
      if (!this.escolhedor) this.escolhedor = new EscolhedorIA(this.d.criarProvedor(this.d.config()), this.biblia)
      const escolhedor = this.escolhedor
      const escolhas = await escolhedor.escolher(fala, candidatos, recentes, rigor)
      this.palavrasDesdeIa = 0
      this.consumo.chamadas++
      this.consumo.entrada += escolhedor.ultimoUso.entrada
      this.consumo.saida += escolhedor.ultimoUso.saida
      this.aviso = null
      this.mudou()
      return sessao === this.sessao ? escolhas : []
    } catch (e) {
      this.aviso = `IA: ${e instanceof Error ? e.message : String(e)} Usando só a busca por palavras.`
      this.mudou()
      return null
    }
  }

  private passagensRecentes(): Passagem[] {
    const limite = this.agora() - NAO_REPETIR_MS
    return this.sugestoes
      .filter((s) => s.hora >= limite)
      .reverse()
      .map((s) => s.passagem)
  }

  private adicionar(p: Passagem, origem: OrigemSugestao, motivo: string, trecho: string, ligacao: Ligacao = ''): void {
    const agora = this.agora()
    let substitui: number | null = null
    for (const s of this.sugestoes) {
      if (agora - s.hora > NAO_REPETIR_MS || !sobrepoe(s.passagem, p)) continue
      if (origem === 'ia' || origem === 'busca') return // palpite repetido: não mexe na tela
      // mesma passagem (ou capítulo que agora ganhou versículo): sobe para o topo
      if (iguais(s.passagem, p) || (s.passagem.inicio === null && s.origem === 'citada' && agora - s.hora < 120_000)) {
        substitui = s.id
        break
      }
    }
    if (substitui !== null) this.sugestoes = this.sugestoes.filter((s) => s.id !== substitui)
    this.sugestoes.unshift({
      id: this.proximoId++,
      passagem: p,
      origem,
      // o pregador disse a referência
      ligacao: origem === 'citada' ? 'citacao' : ligacao,
      motivo,
      trecho: trecho.slice(-220),
      hora: agora,
    })
    this.sugestoes.length = Math.min(this.sugestoes.length, MAX_SUGESTOES)
    this.mudou()
  }

  // ---------- teste da IA (Configurações) ----------

  async testarIa(): Promise<{ segundos: number; escolhas: Array<{ referencia: string; motivo: string; forca: number }> }> {
    const biblia = await this.garantirBiblia()
    const cfg = this.d.config()
    const escolhedor = new EscolhedorIA(this.d.criarProvedor(cfg), biblia)
    const inicio = this.agora()
    const escolhas = await escolhedor.escolher(FALA_DE_TESTE, biblia.buscar([FALA_DE_TESTE], CANDIDATOS_IA), [], 0)
    return {
      segundos: Math.round((this.agora() - inicio) / 100) / 10,
      escolhas: escolhas.map((e) => ({ referencia: referencia(e.passagem), motivo: e.motivo, forca: e.forca })),
    }
  }
}

export const FALA_DE_TESTE =
  'Tem muita gente aqui ansiosa, preocupada com tudo, sem conseguir dormir. Mas a Palavra diz: não fiquem ansiosos por nada, levem tudo a Deus em oração, e a paz de Deus vai guardar o coração de vocês.'

function escolhaDaBusca(c: Candidato): Escolha {
  if (c.lexica >= LIMIAR_LEXICA_CITACAO) return { passagem: c.passagem, motivo: 'Parece citação deste texto', ligacao: 'citacao', forca: 100 }
  return { passagem: c.passagem, motivo: 'Tema parecido', ligacao: 'tema', forca: 50 }
}
