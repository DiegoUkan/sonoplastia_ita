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
import { type Alvo, type Fundo, type Telemetria, TODAS, type VersaoMusica } from '../../shared/estado'
import { acharItem, type ItemLiturgia, type Liturgia, podeAvancarSozinho, type SecaoLiturgia, vizinhoDoNoAr } from '../../shared/liturgia'
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
}

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

  constructor(private readonly d: DepsExecutor) {}

  /** Põe o item no ar. `alvoPadrao` = o "Enviar para" da tela de comando (o item pode ter o próprio). */
  executar(liturgiaId: number, itemId: string, alvoPadrao?: Alvo): void {
    const l = this.liturgia(liturgiaId)
    const pos = acharItem(l.secoes, itemId)
    if (!pos) throw new Error('Este item não existe mais na liturgia.')
    if (alvoPadrao) this.ultimoAlvo = alvoPadrao
    const item = pos.item
    const alvo = item.alvo || this.ultimoAlvo
    // prepara antes (pode falhar: arquivo sumiu, Bíblia não importada…) e só então marca a seção
    const mostrar = this.preparar(item, alvo)
    this.marcarSecao(l, pos.secao, item.id)
    this.biblia = null
    this.atual = { liturgiaId, itemId: item.id, tipo: item.tipo, avancar: item.avancar && podeAvancarSozinho(item), url: null, avancou: false, alvo }
    mostrar()
    if (item.tipo === 'musica') this.atual.url = this.d.motor.estado.audio.fonte?.url ?? null
  }

  /** "Abertura" da seção: a imagem de fundo dela em tela cheia (ou o nome, sem imagem). */
  abertura(liturgiaId: number, secaoId: string, alvoPadrao?: Alvo): void {
    const l = this.liturgia(liturgiaId)
    const secao = l.secoes.find((s) => s.id === secaoId)
    if (!secao) throw new Error('Esta seção não existe mais na liturgia.')
    if (alvoPadrao) this.ultimoAlvo = alvoPadrao
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
    return false
  }

  /** O áudio `url` terminou (música ou áudio avulso): avança, se o item pedir. */
  aoTerminarAudio(url: string): void {
    const a = this.atual
    if (!a || a.avancou || !a.avancar || a.url !== url) return
    if (a.tipo !== 'musica' && a.tipo !== 'midia') return
    this.avancarSozinho()
  }

  /** Telemetria das saídas: vídeo do item chegou ao fim → avança, se o item pedir. */
  aoTelemetria(t: Telemetria): void {
    const a = this.atual
    const v = t.video
    if (!a || a.avancou || !a.avancar || a.tipo !== 'midia' || !a.url || !v) return
    const c = this.d.motor.estado.saidas[t.saidaId]?.conteudo
    if (c?.tipo !== 'video' || c.url !== a.url) return
    if (!v.tocando && v.duracao > 0 && v.posicao >= v.duracao - 0.3) this.avancarSozinho()
  }

  /** Encerra a liturgia: os fundos voltam ao padrão; o que está no ar continua. */
  fechar(): void {
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

  private marcarSecao(l: Liturgia, secao: SecaoLiturgia, itemId: string | null): Fundo {
    const url = secao.fundo ? this.d.urlFundo(secao.fundo) : null
    const fundo: Fundo = url ? { tipo: 'imagem', url, nome: secao.nome } : { tipo: 'nenhum' }
    this.d.motor.definirLiturgia({ liturgiaId: l.id, nome: l.nome, secaoId: secao.id, secaoNome: secao.nome, itemId, fundo, fundoNasMusicas: secao.fundoNasMusicas })
    return fundo
  }

  /** Confere o que o item precisa e devolve a função que põe no ar (lança erro com a explicação). */
  private preparar(item: ItemLiturgia, alvo: Alvo): () => void {
    const m = this.d.motor
    switch (item.tipo) {
      case 'musica':
        return () => this.d.abrirMusica(item.musicaId, item.versao, alvo)
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
        return () => {
          if (md.tipo === 'audio') m.executar({ tipo: 'audio', fonte: { tipo: 'audio', url: md.url, nome: md.nome, midiaId: md.id } })
          else if (md.tipo === 'imagem') m.executar({ tipo: 'mostrar', alvo, conteudo: { tipo: 'imagem', url: md.url, nome: md.nome } })
          else m.executar({ tipo: 'mostrar', alvo, conteudo: { tipo: 'video', url: md.url, nome: md.nome, loop: false } })
          if (this.atual) this.atual.url = md.tipo === 'imagem' ? null : md.url
        }
      }
      case 'biblia':
        return this.prepararBiblia(item, alvo)
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
