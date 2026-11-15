/**
 * Executa a liturgia: põe cada item no ar (música, mídia, apresentação, versículo, texto, tela),
 * marca a seção dele no motor (o fundo da seção vale enquanto ela está no ar), anda dentro do item com
 * o passador e passa sozinho para o próximo item quando o vídeo, o áudio ou a música termina (se o
 * item pedir).
 *
 * As dependências vêm de fora (repositórios, abrir música/apresentação), para dar para testar sem o
 * Electron.
 */
import { conteudoDoVersiculo } from '../../shared/biblia/mostrar'
import { formatarReferencia, interpretarReferencia } from '../../shared/biblia/referencia'
import type { Config } from '../../shared/config'
import type { Midia, VersaoBiblia, VersiculoTexto } from '../../shared/dados'
import { type Alvo, type EstadoLiturgia, type Fundo, type Telemetria, TODAS, type VersaoMusica, videoDoConteudo } from '../../shared/estado'
import { alvoDoHorario, type Ferramenta, lerTemporizador, nomesDoSorteio } from '../../shared/ferramentas'
import { acharItem, ehFerramenta, type ItemLiturgia, type Liturgia, podeAvancarSozinho, type SecaoLiturgia, tituloDoItem, vizinhoDoNoAr } from '../../shared/liturgia'
import { log } from '../log'
import type { Motor } from '../motor'

export interface DepsExecutor {
  motor: Motor
  obterLiturgia(id: number): Liturgia | null
  config(): Config
  abrirMusica(id: number, versao: VersaoMusica, alvo: Alvo): void
  abrirApresentacao(id: number, alvo: Alvo, indice?: number): void
  obterMidia(id: number): Midia | null
  capitulo(sigla: string, livro: number, capitulo: number): VersiculoTexto[]
  versoes(): VersaoBiblia[]
  /** URL da imagem de fundo (liberada para as saídas), ou null se o arquivo sumiu */
  urlFundo(caminho: string): string | null
  /** aplica um cenário das luzes (sem esperar); sem isso, a liturgia não mexe nas luzes */
  luz?: (cenario: string) => void
  /** série semanal do site que não é deste sábado: o motivo (null = pode pôr no ar) */
  avisoDaMidia?: (midiaId: number) => string | null
}

interface ItemNoAr {
  liturgiaId: number
  itemId: string
  tipo: ItemLiturgia['tipo']
  /** passa para o próximo item quando terminar */
  avancar: boolean
  /** arquivo que, ao terminar, faz avançar (vídeo, áudio ou música) */
  url: string | null
  avancou: boolean
  alvo: Alvo
  /** ferramenta que o item pôs na tela (sai no próximo item, se não pediu para manter) */
  ferramenta: { ferramenta: Ferramenta; alvo: Alvo; manter: boolean } | null
  /** lista do item de sorteio (o passador sorteia) */
  sorteio: { lista: string[]; quantidade: number; semRepetir: boolean } | null
  /** cenário das luzes para o fim do item (fim da mídia ou saída manual, o que vier primeiro) */
  luzFim: string | null
  /** o cenário de fim já foi aplicado (ou o item já foi deixado) */
  luzFeita: boolean
  /** o que mostra que a mídia do item ainda está no ar (para perceber quando ela sai) */
  presenca: Presenca | null
  /** a mídia já foi vista no ar (só depois disso o "sumiu" vale como fim) */
  viuMidia: boolean
}

type Presenca =
  /** vídeo ou imagem numa saída */
  | { tipo: 'tela'; url: string }
  /** áudio avulso na trilha de áudio */
  | { tipo: 'audio'; url: string }
  | { tipo: 'musica'; musicaId: number }
  | { tipo: 'apresentacao'; apresentacaoId: number }

interface BibliaNoAr {
  sigla: string
  segunda: string | null
  livro: number
  capitulo: number
  versiculos: VersiculoTexto[]
  segundos: VersiculoTexto[] | null
  versiculo: number
  parte: number
  partes: number
  alvo: Alvo
}

export class ExecutorLiturgia {
  private atual: ItemNoAr | null = null
  private biblia: BibliaNoAr | null = null
  private ultimoAlvo: Alvo = TODAS

  constructor(private readonly d: DepsExecutor) {
    // percebe quando a mídia do item sai do ar (Parar, outra coisa no lugar, música fechada)
    d.motor.on('estado', () => this.conferirMidia())
  }

  /** conta os pedidos de "escolher na hora" (a tela de comando abre a pergunta a cada um) */
  private pedidos = 0

  /**
   * Põe o item no ar. `alvoPadrao` = o "Enviar para" da tela de comando (o item pode ter o próprio).
   * `versao`: a versão escolhida para uma música "escolher na hora"; sem ela, o item fica no ar
   * esperando a escolha (nada muda nas saídas).
   */
  executar(liturgiaId: number, itemId: string, alvoPadrao?: Alvo, versao?: VersaoMusica): void {
    const l = this.liturgia(liturgiaId)
    const pos = acharItem(l.secoes, itemId)
    if (!pos) throw new Error('Este item não existe mais na liturgia.')
    if (alvoPadrao) this.ultimoAlvo = alvoPadrao
    const item = pos.item
    const alvo = item.alvo || this.ultimoAlvo
    const escolher = item.tipo === 'musica' && item.versao === 'perguntar' && !versao
    // prepara antes (pode falhar: arquivo sumiu, Bíblia não importada…) e só então marca a seção
    const mostrar = escolher ? () => {} : this.preparar(item, alvo, versao)
    const anterior = this.atual
    // luzes: só quando o item entra no ar de fato (na música "escolher na hora", depois da escolha)
    if (!escolher) this.luzAoEntrar(anterior, item.luzInicio)
    this.tirarFerramenta()
    this.marcarSecao(l, pos.secao, item.id, escolher && item.tipo === 'musica' ? { musicaId: item.musicaId, titulo: tituloDoItem(item), pedido: ++this.pedidos } : null)
    this.biblia = null
    this.atual = {
      liturgiaId,
      itemId: item.id,
      tipo: item.tipo,
      avancar: !escolher && item.avancar && podeAvancarSozinho(item),
      url: null,
      avancou: false,
      alvo,
      ferramenta: ehFerramenta(item) ? { ferramenta: item.tipo, alvo, manter: item.manter } : null,
      sorteio: item.tipo === 'sorteio' ? { lista: nomesDoSorteio(item.lista), quantidade: item.quantidade, semRepetir: item.semRepetir } : null,
      // esperando a escolha da versão, o "fim" que faltava do item anterior fica guardado até ela
      luzFim: escolher ? (anterior && !anterior.luzFeita ? anterior.luzFim : null) : (item.luzFim ?? '').trim() || null,
      luzFeita: false,
      presenca: null,
      viuMidia: false,
    }
    mostrar()
    if (item.tipo === 'musica' && !escolher) {
      this.atual.url = this.d.motor.estado.audio.fonte?.url ?? null
      this.atual.presenca = { tipo: 'musica', musicaId: item.musicaId }
    }
    if (item.tipo === 'apresentacao') this.atual.presenca = { tipo: 'apresentacao', apresentacaoId: item.apresentacaoId }
    this.conferirMidia()
    if (item.tipo === 'temporizador' && this.atual.avancar) this.vigiar()
  }

  /** "Abertura" da seção: a imagem de fundo dela em tela cheia (ou o nome, sem imagem). */
  abertura(liturgiaId: number, secaoId: string, alvoPadrao?: Alvo): void {
    const l = this.liturgia(liturgiaId)
    const secao = l.secoes.find((s) => s.id === secaoId)
    if (!secao) throw new Error('Esta seção não existe mais na liturgia.')
    if (alvoPadrao) this.ultimoAlvo = alvoPadrao
    this.luzAoEntrar(this.atual, '')
    this.tirarFerramenta()
    const fundo = this.marcarSecao(l, secao, null)
    this.atual = null
    this.biblia = null
    const conteudo = fundo.tipo === 'imagem' ? { tipo: 'imagem' as const, url: fundo.url, nome: secao.nome } : { tipo: 'texto' as const, texto: secao.nome }
    this.d.motor.executar({ tipo: 'mostrar', alvo: this.ultimoAlvo, conteudo })
  }

  /**
   * Próximo (ou anterior) item ativo, a partir do que está no ar. Depois da abertura de uma seção, o
   * próximo é o primeiro item dela. Devolve o id do item posto no ar, ou null se acabou.
   */
  vizinho(liturgiaId: number, passo: 1 | -1, alvoPadrao?: Alvo): string | null {
    const l = this.liturgia(liturgiaId)
    const e = this.d.motor.estado.liturgia
    const p = vizinhoDoNoAr(l.secoes, e?.liturgiaId === liturgiaId ? e : null, passo)
    if (!p) return null
    try {
      this.executar(liturgiaId, p.item.id, alvoPadrao)
    } catch (err) {
      // item com problema (mídia apagada…): fica marcado como "no ar", para o próximo clique passar
      // dele em vez de cair nele de novo; o erro aparece para o operador
      this.luzAoEntrar(this.atual, '')
      this.tirarFerramenta()
      this.marcarSecao(l, p.secao, p.item.id)
      this.atual = null
      this.biblia = null
      throw err
    }
    return p.item.id
  }

  /**
   * Passador dentro do item no ar: versículos (e partes dos longos), slides da apresentação, trechos
   * da música. Devolve false quando o item não tem "dentro" (vídeo, imagem, texto…).
   */
  passo(passo: 1 | -1): boolean {
    const e = this.d.motor.estado
    const a = this.atual
    if (!a || e.liturgia?.itemId !== a.itemId) return false
    if (a.tipo === 'biblia' && this.biblia) {
      this.andarBiblia(passo)
      return true
    }
    if (a.tipo === 'apresentacao' && e.apresentacao) {
      this.d.motor.executar({ tipo: 'apresentacao:passo', passo })
      return true
    }
    if (a.tipo === 'musica' && e.musica) {
      this.d.motor.executar({ tipo: 'musica:slide', indice: e.musica.indice + passo, origem: 'operador' })
      return true
    }
    if (a.tipo === 'sorteio' && a.sorteio) {
      // o "próximo" sorteia (de novo, se já sorteou); o "anterior" não faz nada
      if (passo === 1) this.sortear()
      return true
    }
    return false
  }

  /** Sorteia com a lista do item de sorteio no ar. Devolve false se não há item de sorteio no ar. */
  sortear(): boolean {
    const a = this.atual
    if (!a?.sorteio || this.d.motor.estado.liturgia?.itemId !== a.itemId) return false
    const m = this.d.motor
    if (a.ferramenta && !Object.keys(m.estado.ferramentas.exibicao.sorteio).length) {
      m.executar({ tipo: 'ferramenta:mostrar', ferramenta: 'sorteio', alvo: a.ferramenta.alvo, modo: 'tela' })
    }
    m.executar({
      tipo: 'sorteio:sortear',
      lista: a.sorteio.lista,
      quantidade: a.sorteio.quantidade,
      semRepetir: a.sorteio.semRepetir,
      duracaoMs: this.d.config().ferramentas.sorteioDuracaoS * 1000,
    })
    return true
  }

  /**
   * Temporizador do item no ar chegou a zero → passa para o próximo item (se o item pedir). Chamado a
   * cada meio segundo enquanto um temporizador com "passar sozinho" está no ar.
   */
  conferirTemporizador(): void {
    const a = this.atual
    const e = this.d.motor.estado
    if (!a || a.avancou || !a.avancar || a.tipo !== 'temporizador' || e.liturgia?.itemId !== a.itemId) {
      this.pararVigia()
      return
    }
    const t = e.ferramentas.temporizador
    if (t.modo === 'progressivo' || (t.modo === 'regressivo' && !t.rodando)) return
    if (lerTemporizador(t, this.d.motor.agora(), { amareloMin: 0, vermelhoMin: 0, aoTerminar: 'parar' }).ms > 0) return
    this.pararVigia()
    this.avancarSozinho()
  }

  private vigia: ReturnType<typeof setInterval> | null = null

  private vigiar(): void {
    this.pararVigia()
    this.vigia = setInterval(() => this.conferirTemporizador(), 500)
  }

  private pararVigia(): void {
    if (this.vigia) clearInterval(this.vigia)
    this.vigia = null
  }

  /**
   * Luzes ao trocar de item (saída manual do anterior): o cenário de começo do item novo; se ele não
   * tem, o de fim do anterior, se ainda não foi aplicado (os dois seguidos fariam a luz piscar).
   */
  private luzAoEntrar(anterior: ItemNoAr | null, inicio: string | undefined): void {
    const pendente = anterior && !anterior.luzFeita ? anterior.luzFim : null
    if (anterior) anterior.luzFeita = true
    // item gravado antes dos campos de luz existirem vem sem eles
    const cenario = (inicio ?? '').trim() || pendente
    if (cenario) this.aplicarLuz(cenario)
  }

  /** Fim da mídia do item (terminou sozinha, ou saiu do ar): aplica o cenário de fim, uma vez só. */
  private fimDaMidia(): void {
    const a = this.atual
    if (!a || a.luzFeita) return
    a.luzFeita = true
    if (a.luzFim) this.aplicarLuz(a.luzFim)
  }

  private aplicarLuz(cenario: string): void {
    if (this.d.luz && this.d.config().iluminacao.automacao) this.d.luz(cenario)
  }

  /** A mídia do item no ar ainda está no ar? Se já esteve e saiu (Parar, outra coisa no lugar), é o fim dela. */
  private conferirMidia(): void {
    const a = this.atual
    const p = a?.presenca
    if (!a || !p || a.luzFeita) return
    const e = this.d.motor.estado
    const noAr =
      p.tipo === 'musica'
        ? e.musica?.musicaId === p.musicaId
        : p.tipo === 'apresentacao'
          ? e.apresentacao?.apresentacaoId === p.apresentacaoId
          : p.tipo === 'audio'
            ? e.audio.fonte?.url === p.url
            : Object.values(e.saidas).some((s) => videoDoConteudo(s.conteudo)?.url === p.url || (s.conteudo.tipo === 'imagem' && s.conteudo.url === p.url))
    if (noAr) a.viuMidia = true
    else if (a.viuMidia) this.fimDaMidia()
  }

  /** Tira a ferramenta que o item anterior pôs na tela (se ele não pediu para manter). */
  private tirarFerramenta(): void {
    const f = this.atual?.ferramenta
    this.pararVigia()
    if (!f || f.manter) return
    this.d.motor.executar({ tipo: 'ferramenta:mostrar', ferramenta: f.ferramenta, alvo: f.alvo, modo: null })
  }

  /** O áudio `url` terminou (música ou áudio avulso): luz de fim e, se o item pedir, o próximo item. */
  aoTerminarAudio(url: string): void {
    const a = this.atual
    if (!a || a.url !== url) return
    if (a.tipo !== 'musica' && a.tipo !== 'midia') return
    this.fimDaMidia()
    if (a.avancar && !a.avancou) this.avancarSozinho()
  }

  /** Telemetria das saídas: o vídeo do item chegou ao fim → luz de fim e, se o item pedir, o próximo item. */
  aoTelemetria(t: Telemetria): void {
    const a = this.atual
    const v = t.video
    if (!a || a.tipo !== 'midia' || !a.url || !v) return
    const c = this.d.motor.estado.saidas[t.saidaId]?.conteudo
    if (c?.tipo !== 'video' || c.url !== a.url) return
    if (v.tocando || v.duracao <= 0 || v.posicao < v.duracao - 0.3) return
    this.fimDaMidia()
    if (a.avancar && !a.avancou) this.avancarSozinho()
  }

  /** Encerra a liturgia: os fundos voltam ao padrão; o que está no ar continua. */
  fechar(): void {
    // o que está no ar continua (inclusive a ferramenta do item); só para de vigiar o temporizador.
    // As luzes vão para o cenário de "fim" do item, se ele tiver (e ainda não foi aplicado).
    this.luzAoEntrar(this.atual, '')
    this.pararVigia()
    this.atual = null
    this.biblia = null
    this.d.motor.executar({ tipo: 'liturgia:fechar' })
  }

  private avancarSozinho(): void {
    const a = this.atual!
    a.avancou = true
    // só se a liturgia continua no mesmo item (o operador pode ter mudado de item ou encerrado)
    if (this.d.motor.estado.liturgia?.itemId !== a.itemId) return
    try {
      const id = this.vizinho(a.liturgiaId, 1)
      log.info(`Liturgia ${a.liturgiaId}: item terminou, ${id ? `próximo no ar (${id})` : 'era o último'}.`)
    } catch (e) {
      log.erro('Liturgia: não foi possível passar para o próximo item', e)
    }
  }

  private liturgia(id: number): Liturgia {
    const l = this.d.obterLiturgia(id)
    if (!l) throw new Error('Liturgia não encontrada (foi excluída?).')
    return l
  }

  private marcarSecao(l: Liturgia, secao: SecaoLiturgia, itemId: string | null, escolherVersao: EstadoLiturgia['escolherVersao'] = null): Fundo {
    const url = secao.fundo ? this.d.urlFundo(secao.fundo) : null
    const fundo: Fundo = url ? { tipo: 'imagem', url, nome: secao.nome } : { tipo: 'nenhum' }
    this.d.motor.definirLiturgia({ liturgiaId: l.id, nome: l.nome, secaoId: secao.id, secaoNome: secao.nome, itemId, fundo, fundoNasMusicas: secao.fundoNasMusicas, escolherVersao })
    return fundo
  }

  /** Confere o que o item precisa e devolve a função que põe no ar (lança erro com a explicação). */
  private preparar(item: ItemLiturgia, alvo: Alvo, versao?: VersaoMusica): () => void {
    const m = this.d.motor
    switch (item.tipo) {
      case 'musica': {
        const v = versao ?? (item.versao === 'perguntar' ? 'cantado' : item.versao)
        return () => this.d.abrirMusica(item.musicaId, v, alvo)
      }
      case 'apresentacao':
        return () => this.d.abrirApresentacao(item.apresentacaoId, alvo)
      case 'texto':
        return () => m.executar({ tipo: 'mostrar', alvo, conteudo: { tipo: 'texto', texto: item.texto } })
      case 'tela':
        return () => m.executar({ tipo: 'tela', alvo, tela: item.tela })
      case 'midia': {
        const md = this.d.obterMidia(item.midiaId)
        if (!md || md.excluida) throw new Error('A mídia deste item não está mais na biblioteca.')
        if (md.situacao === 'erro') throw new Error(`A mídia "${md.nome}" está com erro: ${md.detalhe ?? 'não abre'}.`)
        if (md.situacao === 'convertendo') throw new Error(`A mídia "${md.nome}" ainda está sendo convertida.`)
        // série do site (Provai e Vede, Avisos…): o vídeo de outra semana não entra no ar pela liturgia
        const aviso = this.d.avisoDaMidia?.(md.id)
        if (aviso) throw new Error(aviso)
        return () => {
          if (md.tipo === 'audio') m.executar({ tipo: 'audio', fonte: { tipo: 'audio', url: md.url, nome: md.nome, midiaId: md.id } })
          else if (md.tipo === 'imagem') m.executar({ tipo: 'mostrar', alvo, conteudo: { tipo: 'imagem', url: md.url, nome: md.nome } })
          else m.executar({ tipo: 'mostrar', alvo, conteudo: { tipo: 'video', url: md.url, nome: md.nome, loop: false } })
          if (this.atual) {
            this.atual.url = md.tipo === 'imagem' ? null : md.url
            this.atual.presenca = md.tipo === 'audio' ? { tipo: 'audio', url: md.url } : { tipo: 'tela', url: md.url }
          }
        }
      }
      case 'biblia':
        return this.prepararBiblia(item, alvo)
      case 'temporizador': {
        if (item.temporizadorModo === 'horario' && alvoDoHorario(item.ate, m.agora()) === null) {
          throw new Error('Escolha o horário da contagem deste item (ex.: 9:00).')
        }
        return () => {
          m.executar({ tipo: 'temporizador:definir', modo: item.temporizadorModo, minutos: item.minutos, ate: item.ate, titulo: item.titulo.trim() })
          if (item.iniciar && item.temporizadorModo !== 'horario') m.executar({ tipo: 'temporizador:acao', acao: 'iniciar' })
          m.executar({ tipo: 'ferramenta:mostrar', ferramenta: 'temporizador', alvo, modo: item.modo })
        }
      }
      case 'qr':
        if (!item.link.trim()) throw new Error('Este QR code está sem link (Editar item).')
        return () => {
          m.executar({ tipo: 'qr:definir', link: item.link, texto: item.legenda })
          m.executar({ tipo: 'ferramenta:mostrar', ferramenta: 'qr', alvo, modo: item.modo })
        }
      case 'sorteio':
        if (!nomesDoSorteio(item.lista).length) throw new Error('A lista deste sorteio está vazia (Editar item).')
        return () => {
          m.executar({ tipo: 'sorteio:preparar', titulo: item.titulo.trim() || 'Sorteio' })
          m.executar({ tipo: 'ferramenta:mostrar', ferramenta: 'sorteio', alvo, modo: 'tela' })
        }
    }
  }

  private prepararBiblia(item: Extract<ItemLiturgia, { tipo: 'biblia' }>, alvo: Alvo): () => void {
    const r = interpretarReferencia(item.referencia)
    if (r.tipo !== 'referencia') throw new Error(`"${item.referencia}" não é uma referência bíblica que o programa entenda.`)
    if (r.ref.capitulo === null) throw new Error(`"${item.referencia}": falta o capítulo.`)
    const cfg = this.d.config().biblia
    const versoes = this.d.versoes()
    if (!versoes.length) throw new Error('Nenhuma versão da Bíblia importada (página Bíblia).')
    const sigla = [item.sigla, cfg.versaoPadrao].find((s) => s && versoes.some((v) => v.sigla === s)) ?? versoes[0]!.sigla
    const { livro, capitulo } = r.ref
    const versiculos = this.d.capitulo(sigla, livro, capitulo)
    if (!versiculos.length) throw new Error(`${formatarReferencia(livro, capitulo)} não existe na ${sigla}.`)
    const inicio = r.ref.inicio ?? versiculos[0]!.versiculo
    if (!versiculos.some((v) => v.versiculo === inicio)) throw new Error(`${formatarReferencia(livro, capitulo, inicio)} não existe na ${sigla}.`)
    const segunda = cfg.segundaVersao && cfg.segundaVersao !== sigla && versoes.some((v) => v.sigla === cfg.segundaVersao) ? cfg.segundaVersao : null
    return () => {
      this.biblia = {
        sigla,
        segunda,
        livro,
        capitulo,
        versiculos,
        segundos: segunda ? this.d.capitulo(segunda, livro, capitulo) : null,
        versiculo: inicio,
        parte: 0,
        partes: 1,
        alvo,
      }
      this.mostrarVersiculo(inicio, 0)
    }
  }

  private mostrarVersiculo(versiculo: number, parte: number): void {
    const b = this.biblia!
    const v = b.versiculos.find((x) => x.versiculo === versiculo)
    if (!v) return
    const v2 = b.segundos?.find((x) => x.versiculo === versiculo)
    const r = conteudoDoVersiculo({
      livro: b.livro,
      capitulo: b.capitulo,
      versiculo,
      texto: v.texto,
      parte,
      sigla: b.sigla,
      cfg: this.d.config().biblia,
      segundo: v2 && b.segunda ? { sigla: b.segunda, texto: v2.texto } : null,
    })
    b.versiculo = versiculo
    b.parte = r.parte
    b.partes = r.partes
    this.d.motor.executar({ tipo: 'mostrar', alvo: b.alvo, conteudo: r.conteudo })
  }

  /** Versículo a versículo dentro do capítulo; os longos, parte por parte. */
  private andarBiblia(passo: 1 | -1): void {
    const b = this.biblia!
    const parte = b.parte + passo
    if (parte >= 0 && parte < b.partes) {
      this.mostrarVersiculo(b.versiculo, parte)
      return
    }
    const i = b.versiculos.findIndex((x) => x.versiculo === b.versiculo) + passo
    const v = b.versiculos[i]
    if (v) this.mostrarVersiculo(v.versiculo, passo === 1 ? 0 : 999)
  }
}
