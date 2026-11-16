/**
 * O que a Bíblia automática faz com a fala transcrita (porta de `web/motor.py`):
 *  - cada frase final: as referências ditas ("João 3:16", "versículo 17") viram sugestão na hora;
 *  - a cada `intervaloS`, com os últimos `janelaS` segundos: busca por palavras → candidatos → a IA
 *    escolhe de 0 a 3 passagens (sem IA, só a leitura literal que a busca reconhece);
 *  - citação direta pode ir sozinha para a tela (Configurações → Bíblia automática).
 * Não sabe nada de áudio nem de janelas: quem chama passa a fala e as dependências.
 */
import { type Passagem, Rastreador, mesmaPassagem, referenciaCurta, sobrepoe, type TamanhosBiblia } from '../../shared/biblia/falada'
import { formatarReferencia } from '../../shared/biblia/referencia'
import type { ConfigTranscricao } from '../../shared/config'
import { cobertura, palavrasDe, paresDe, pareceLeitura } from '../../shared/transcricao/texto'
import type { ConsumoTranscricao, LigacaoSugestao, SugestaoBiblia } from '../../shared/transcricao/tipos'
import { ESQUEMA, type Escolha, FORMATO_TEXTO, lerEscolhas, montarPedido, sistemaDaIA } from './escolha'
import type { ProvedorIA } from './ia'
import { agruparVizinhos, type IndiceBiblia } from './indice'

export const MAX_SUGESTOES = 40
/** a IA e a busca não sugerem de novo o que já apareceu nos últimos 10 min */
export const NAO_REPETIR_MS = 600_000
/** a parte final da fala, que pesa mais */
export const RECENTE_MS = 15_000
const CANDIDATOS_IA = 12
/** a partir daqui só interessa citação, que a busca por palavras reconhece… */
const RIGOR_SO_CITACAO = 90
/** força mínima para uma citação lida ir sozinha para a tela */
const FORCA_LEITURA = 95
const MAX_FALAS = 500

export interface BibliaDoAnalisador extends TamanhosBiblia {
  textosDoVersiculo(livro: number, capitulo: number, versiculo: number): Array<{ sigla: string; texto: string }>
}

export interface DependenciasAnalisador {
  biblia: BibliaDoAnalisador
  /** null enquanto o índice monta (ou sem Bíblia importada) */
  indice: () => IndiceBiblia | null
  /** null = IA desligada (sem chave ou modelo): fica só com as referências ditas e a leitura literal */
  provedor: () => ProvedorIA | null
  config: () => ConfigTranscricao
  /** versão da página Bíblia (texto dos cartões e do que vai para a tela) */
  sigla: () => string
  /** tenta pôr o versículo na tela sozinho; true se pôs */
  mostrarSozinho: (livro: number, capitulo: number, versiculo: number) => boolean
  aoMudar: () => void
  aviso: (mensagem: string) => void
  agora?: () => number
}

export class AnalisadorFala {
  falas: Array<{ hora: number; texto: string }> = []
  sugestoes: SugestaoBiblia[] = []
  consumo: ConsumoTranscricao = { chamadas: 0, entrada: 0, saida: 0, segundosAudio: 0 }
  private readonly rastreador: Rastreador
  private palavrasDesdeIA = 0
  private novidade = false
  private emAndamento = false
  private ultimoCiclo = 0
  private proximoId = 1

  constructor(private readonly d: DependenciasAnalisador) {
    this.rastreador = new Rastreador(d.biblia)
  }

  private agora(): number {
    return this.d.agora?.() ?? Date.now()
  }

  /** Uma frase final da transcrição. */
  novaFala(textoBruto: string): void {
    const texto = textoBruto.trim()
    if (!texto) return
    const agora = this.agora()
    this.falas.push({ hora: agora, texto })
    if (this.falas.length > MAX_FALAS) this.falas.splice(0, this.falas.length - MAX_FALAS)
    this.novidade = true
    this.palavrasDesdeIA += palavrasDe(texto).length
    let mostrou = false
    for (const a of this.rastreador.processar(texto, agora)) {
      const s = this.adicionar(a.passagem, 'citada', a.explicita ? 'Citado na fala' : 'Citado (capítulo dito antes)', texto, 'citada', 100)
      // só a primeira referência com versículo vai para a tela; as outras ficam como sugestão
      if (s && !mostrou && a.passagem.inicio !== null && this.d.config().auto.mostrarSozinho !== 'nao') {
        mostrou = this.d.mostrarSozinho(a.passagem.livro, a.passagem.capitulo, a.passagem.inicio)
        if (mostrou) this.marcarMostrada(s)
      }
    }
    this.d.aoMudar()
  }

  /** Roda um ciclo se é hora (chamado a cada meio segundo). */
  async talvezCiclo(): Promise<void> {
    if (!this.novidade || this.emAndamento) return
    if (this.agora() - this.ultimoCiclo < this.d.config().ia.intervaloS * 1000) return
    this.novidade = false
    this.ultimoCiclo = this.agora()
    this.emAndamento = true
    try {
      await this.ciclo()
    } finally {
      this.emAndamento = false
    }
  }

  private janela(): { janela: string; recente: string; ultima: string } {
    const agora = this.agora()
    const limite = agora - this.d.config().ia.janelaS * 1000
    const falas = this.falas.filter((f) => f.hora >= limite)
    const janela = falas.map((f) => f.texto).join(' ')
    const ultima = falas.at(-1)?.texto ?? ''
    const recente =
      falas
        .filter((f) => f.hora >= agora - RECENTE_MS)
        .map((f) => f.texto)
        .join(' ') || ultima
    return { janela, recente, ultima }
  }

  async ciclo(): Promise<void> {
    const cfg = this.d.config()
    const { janela, recente, ultima } = this.janela()
    if (palavrasDe(janela).length < 6) return
    const textos = [...new Set([janela, recente, ultima].filter(Boolean))]
    const indice = this.d.indice()
    const candidatos = indice ? indice.buscar(textos, CANDIDATOS_IA, (l, c, v) => this.d.biblia.textosDoVersiculo(l, c, v).map((x) => x.texto)) : []
    const rigor = cfg.ia.rigor
    const recentes = this.passagensRecentes()
    const provedor = this.d.provedor()
    let escolhas: Escolha[] | null = null
    let origem: 'ia' | 'busca' = 'busca'
    if (provedor) {
      if (this.palavrasDesdeIA < cfg.ia.minPalavras) return // quase nada de fala nova: não gasta outra chamada
      if (rigor >= RIGOR_SO_CITACAO && !candidatos.some((c) => c.cobertura.pares >= 3)) {
        this.palavrasDesdeIA = 0 // nada parecido com citação nesta fala
        return
      }
      const palavrasFala = new Set(palavrasDe(janela))
      const pedido = montarPedido(
        janela,
        candidatos.map((c) => ({
          referencia: referenciaCurta({ livro: c.livro, capitulo: c.capitulo, inicio: c.versiculo, fim: c.versiculo }),
          texto: this.textoMaisParecido(c.livro, c.capitulo, c.versiculo, palavrasFala),
        })),
        recentes.map(referenciaCurta),
        rigor,
      )
      this.palavrasDesdeIA = 0
      try {
        const r = await provedor.completarJson(sistemaDaIA(cfg.ia.janelaS), pedido, ESQUEMA, FORMATO_TEXTO)
        this.consumo.chamadas++
        this.consumo.entrada += r.uso.entrada
        this.consumo.saida += r.uso.saida
        escolhas = lerEscolhas(r.dados, rigor, this.d.biblia)
        origem = 'ia'
      } catch (e) {
        this.d.aviso(`IA: ${e instanceof Error ? e.message : String(e)} Usando só a busca.`)
      }
    }
    if (!escolhas) {
      // sem IA: só o que parece leitura em voz alta (pares de palavras iguais aos do versículo)
      const novos = candidatos.filter((c) => pareceLeitura(c.cobertura) && !recentes.some((r) => sobrepoe(r, passagemDe(c))))
      escolhas = agruparVizinhos(novos, 2).map((c) => ({
        passagem: { livro: c.livro, capitulo: c.capitulo, inicio: c.versiculo, fim: c.fim },
        motivo: 'Parece leitura deste texto',
        ligacao: 'leitura' as LigacaoSugestao,
        forca: 100,
      }))
    }
    let mostrou = false
    const adicionadas: Array<{ s: SugestaoBiblia; e: Escolha }> = []
    // a mais relevante fica por último = no topo
    for (const e of [...escolhas].reverse()) {
      const s = this.adicionar(e.passagem, origem, e.motivo, recente || janela, e.ligacao, e.forca)
      if (s) adicionadas.unshift({ s, e })
    }
    for (const { s, e } of adicionadas) {
      if (mostrou) break
      const v = this.versiculoLido(e, janela)
      if (v !== null) {
        mostrou = this.d.mostrarSozinho(e.passagem.livro, e.passagem.capitulo, v)
        if (mostrou) this.marcarMostrada(s)
      }
    }
    this.d.aoMudar()
  }

  /**
   * Citação lida, para ir sozinha para a tela: a IA (ou a busca) diz "citação" e as palavras confirmam
   * (o versículo foi dito quase igual). Devolve o versículo da passagem lido por último na fala.
   */
  private versiculoLido(e: Escolha, janela: string): number | null {
    if (this.d.config().auto.mostrarSozinho !== 'leitura') return null
    if ((e.ligacao !== 'citacao' && e.ligacao !== 'leitura') || e.forca < FORCA_LEITURA || e.passagem.inicio === null) return null
    const paresFala = paresDe(palavrasDe(janela))
    const conjunto = new Set(paresFala)
    let melhor: { v: number; ultimo: number } | null = null
    for (let v = e.passagem.inicio; v <= (e.passagem.fim ?? e.passagem.inicio); v++) {
      const textos = this.d.biblia.textosDoVersiculo(e.passagem.livro, e.passagem.capitulo, v).map((x) => x.texto)
      const lidos = textos.filter((t) => pareceLeitura(cobertura(t, conjunto)))
      if (!lidos.length) continue
      // onde, na fala, aparece o último par de palavras deste versículo
      const doVersiculo = new Set(lidos.flatMap((t) => paresDe(palavrasDe(t))))
      let ultimo = -1
      paresFala.forEach((p, i) => {
        if (doVersiculo.has(p)) ultimo = i
      })
      if (!melhor || ultimo >= melhor.ultimo) melhor = { v, ultimo }
    }
    return melhor?.v ?? null
  }

  private textoMaisParecido(livro: number, capitulo: number, versiculo: number, palavrasFala: Set<string>): string {
    // a versão que o pregador está lendo: mostrar outra faz a IA confundir citação com paráfrase
    const textos = this.d.biblia.textosDoVersiculo(livro, capitulo, versiculo).map((x) => x.texto)
    let melhor = textos[0] ?? ''
    let pontos = -1
    for (const t of textos) {
      let p = 0
      for (const w of new Set(palavrasDe(t))) if (palavrasFala.has(w)) p++
      if (p > pontos) {
        pontos = p
        melhor = t
      }
    }
    return melhor
  }

  private passagensRecentes(): Passagem[] {
    const limite = this.agora() - NAO_REPETIR_MS
    return this.sugestoes
      .filter((s) => s.hora >= limite)
      .reverse()
      .map((s) => ({ livro: s.livro, capitulo: s.capitulo, inicio: s.inicio, fim: s.fim }))
  }

  private adicionar(p: Passagem, origem: SugestaoBiblia['origem'], motivo: string, trecho: string, ligacao: LigacaoSugestao, forca: number): SugestaoBiblia | null {
    const agora = this.agora()
    let substitui: number | null = null
    for (const s of this.sugestoes) {
      if (agora - s.hora > NAO_REPETIR_MS || !sobrepoe(s, p)) continue
      if (origem !== 'citada') return null // palpite repetido: não mexe na lista
      if (mesmaPassagem(s, p) || (s.inicio === null && s.origem === 'citada' && agora - s.hora < 120_000)) {
        // a mesma passagem (ou o capítulo que agora ganhou versículo) sobe para o topo
        substitui = s.id
        break
      }
    }
    if (substitui !== null) this.sugestoes = this.sugestoes.filter((s) => s.id !== substitui)
    const s: SugestaoBiblia = {
      id: this.proximoId++,
      livro: p.livro,
      capitulo: p.capitulo,
      inicio: p.inicio,
      fim: p.inicio === null ? null : (p.fim ?? p.inicio),
      referencia: formatarReferencia(p.livro, p.capitulo, p.inicio, p.fim),
      origem,
      ligacao: origem === 'citada' ? 'citada' : ligacao,
      forca,
      motivo,
      trecho: trecho.slice(-220),
      hora: agora,
      texto: this.previa(p),
      mostrada: false,
    }
    this.sugestoes.unshift(s)
    if (this.sugestoes.length > MAX_SUGESTOES) this.sugestoes.length = MAX_SUGESTOES
    return s
  }

  private marcarMostrada(s: SugestaoBiblia): void {
    s.mostrada = true
  }

  /** começo do texto na versão da página (capítulo inteiro: os 3 primeiros versículos) */
  private previa(p: Passagem): string {
    const sigla = this.d.sigla()
    const inicio = p.inicio ?? 1
    const fim = p.inicio === null ? 3 : (p.fim ?? p.inicio)
    const partes: string[] = []
    for (let v = inicio; v <= fim && partes.join(' ').length < 400; v++) {
      const textos = this.d.biblia.textosDoVersiculo(p.livro, p.capitulo, v)
      const t = (textos.find((x) => x.sigla === sigla) ?? textos[0])?.texto
      if (t) partes.push(fim > inicio ? `${v} ${t}` : t)
    }
    const r = partes.join(' ')
    return r.length > 400 ? `${r.slice(0, 399)}…` : r
  }

  /** os textos dos cartões na versão nova (a página trocou de versão) */
  refazerPrevias(): void {
    for (const s of this.sugestoes) s.texto = this.previa(s)
  }

  limparSugestoes(): void {
    this.sugestoes = []
  }
}

const passagemDe = (c: { livro: number; capitulo: number; versiculo: number }): Passagem => ({ livro: c.livro, capitulo: c.capitulo, inicio: c.versiculo, fim: c.versiculo })
