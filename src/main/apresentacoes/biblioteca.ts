/**
 * Biblioteca de apresentações. Importar copia o arquivo para `C:\Sonoplastia\midias\apresentacao\`
 * (o original não é mexido) e põe na fila de conversão: cada slide vira PNG + miniatura em
 * `C:\Sonoplastia\cache\slides\<id>\<versão>\`, e os vídeos/áudios do .pptx são extraídos ao lado.
 * Converte uma de cada vez, em segundo plano. Emite 'mudou' quando algo muda e 'progresso'.
 *
 * As partes que dependem do Electron e do Windows (exportar, miniatura, conferir mídia) vêm de fora,
 * para dar para testar a biblioteca sem elas.
 */
import { EventEmitter } from 'node:events'
import { existsSync, promises as fsp, readdirSync, rmSync, statSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import {
  type Apresentacao,
  EXTENSOES_APRESENTACAO,
  EXTENSOES_RECUSADAS,
  type MidiaSlide,
  type ResumoApresentacao,
  type SituacaoApresentacao,
  type SlideDados,
  type TipoApresentacao,
} from '../../shared/apresentacao'
import type { ResultadoImportacao } from '../../shared/dados'
import { urlMidia } from '../../shared/midia'
import { type Banco, respirar, transacao } from '../banco'
import { nomeLivre, sha256 } from '../biblioteca/midias'
import { log } from '../log'
import type { ResultadoExportacao } from './exportar'
import { midiasDoPptx, pastaDe } from './pptx'
import { ArquivoZip } from './zip'

export interface Conversor {
  /** largura das imagens (configuração) */
  largura(): number
  exportar(tipo: TipoApresentacao, arquivo: string, pasta: string, largura: number, aoProgresso: (feito: number, total: number) => void): Promise<ResultadoExportacao>
  /** grava a miniatura JPEG e devolve o tamanho real da imagem */
  miniatura(png: string, destino: string): Promise<{ largura: number; altura: number }>
  /** confere se a mídia toca (convertendo se precisar); devolve o caminho final ou null */
  prepararMidia(caminho: string, tipo: 'video' | 'audio'): Promise<string | null>
}

/** Mídia do slide como fica no banco: com o caminho do arquivo no lugar da URL. */
type MidiaGuardada = Omit<MidiaSlide, 'url'> & { arquivo: string }

interface Linha {
  id: number
  tipo: TipoApresentacao
  nome: string
  arquivo: string
  original: string | null
  bytes: number
  situacao: SituacaoApresentacao
  detalhe: string | null
  pasta_slides: string | null
  criado_em: string
  total: number
  miniatura: string | null
}

interface LinhaSlide {
  ordem: number
  imagem: string
  miniatura: string | null
  largura: number
  altura: number
  oculto: number
  notas: string
  midias: string
}

const CONSULTA = `select a.*,
  (select count(*) from apresentacao_slides s where s.apresentacao_id = a.id) as total,
  (select miniatura from apresentacao_slides s where s.apresentacao_id = a.id order by ordem limit 1) as miniatura
  from apresentacoes a`

export class BibliotecaApresentacoes extends EventEmitter {
  private fila: number[] = []
  private trabalhando = false
  private progresso = new Map<number, number>()

  constructor(
    private readonly db: Banco,
    private readonly pastas: { arquivos: string; slides: string },
    private readonly conversor: Conversor,
  ) {
    super()
  }

  /** Retoma o que ficou na fila ou pela metade (programa fechado durante a conversão). */
  retomar(): void {
    const ids = this.db.prepare("select id from apresentacoes where situacao in ('na-fila', 'convertendo') order by id").all() as Array<{ id: number }>
    for (const { id } of ids) this.enfileirar(id)
  }

  listar(busca = ''): ResumoApresentacao[] {
    const b = busca.trim()
    const linhas = (
      b
        ? this.db.prepare(`${CONSULTA} where a.nome like ? escape '\\' order by a.criado_em desc, a.id desc`).all(`%${b.replace(/[\\%_]/g, (c) => '\\' + c)}%`)
        : this.db.prepare(`${CONSULTA} order by a.criado_em desc, a.id desc`).all()
    ) as unknown as Linha[]
    return linhas.map((l) => this.resumo(l))
  }

  obter(id: number): Apresentacao | null {
    const l = this.db.prepare(`${CONSULTA} where a.id = ?`).get(id) as unknown as Linha | undefined
    if (!l) return null
    const slides = this.db
      .prepare('select * from apresentacao_slides where apresentacao_id = ? order by ordem')
      .all(id) as unknown as LinhaSlide[]
    return { ...this.resumo(l), slides: slides.map(paraSlide) }
  }

  private resumo(l: Linha): ResumoApresentacao {
    return {
      id: l.id,
      nome: l.nome,
      tipo: l.tipo,
      total: l.total,
      situacao: l.situacao,
      detalhe: l.detalhe,
      progresso: this.progresso.get(l.id) ?? null,
      miniaturaUrl: l.miniatura ? urlMidia(l.miniatura) : null,
      bytes: l.bytes,
      criadoEm: l.criado_em,
    }
  }

  async importar(caminhos: string[]): Promise<ResultadoImportacao> {
    const r: ResultadoImportacao = { importadas: [], repetidas: [], ignoradas: [] }
    for (const caminho of caminhos) {
      const ext = extname(caminho).toLowerCase()
      const tipo = EXTENSOES_APRESENTACAO[ext]
      if (!tipo) {
        r.ignoradas.push(`${basename(caminho)} (${EXTENSOES_RECUSADAS[ext] ?? 'não é .pptx nem .pdf'})`)
        continue
      }
      try {
        const st = statSync(caminho)
        if (!st.isFile()) {
          r.ignoradas.push(`${basename(caminho)} (não é arquivo)`)
          continue
        }
        const hash = await sha256(caminho)
        const existente = this.db.prepare('select id from apresentacoes where sha256 = ?').get(hash) as { id: number } | undefined
        if (existente) {
          r.repetidas.push(existente.id)
          continue
        }
        await fsp.mkdir(this.pastas.arquivos, { recursive: true })
        const destino = nomeLivre(this.pastas.arquivos, basename(caminho))
        await fsp.copyFile(caminho, destino)
        const res = this.db
          .prepare(
            `insert into apresentacoes (tipo, nome, arquivo, original, sha256, bytes, situacao, criado_em)
             values (?, ?, ?, ?, ?, ?, 'na-fila', ?)`,
          )
          .run(tipo, basename(caminho, extname(caminho)), destino, caminho, hash, st.size, new Date().toISOString())
        const id = Number(res.lastInsertRowid)
        r.importadas.push(id)
        this.enfileirar(id)
      } catch (e) {
        log.erro('Falha ao importar a apresentação', caminho, e)
        r.ignoradas.push(`${basename(caminho)} (${e instanceof Error ? e.message : e})`)
      }
    }
    this.emit('mudou')
    return r
  }

  renomear(id: number, nome: string): void {
    const n = nome.trim()
    if (!n) return
    this.db.prepare('update apresentacoes set nome = ? where id = ?').run(n, id)
    this.emit('mudou')
  }

  /** Apaga de vez: o banco, a cópia do arquivo e as imagens dos slides. */
  apagar(id: number): void {
    const l = this.db.prepare('select arquivo from apresentacoes where id = ?').get(id) as { arquivo: string } | undefined
    if (!l) return
    this.fila = this.fila.filter((x) => x !== id)
    this.db.prepare('delete from apresentacoes where id = ?').run(id)
    rmSync(l.arquivo, { force: true })
    rmSync(join(this.pastas.slides, String(id)), { recursive: true, force: true })
    this.emit('mudou')
  }

  /** Converte de novo (depois de um erro ou de mudar a resolução). */
  reconverter(id: number): void {
    if (!this.db.prepare('select 1 from apresentacoes where id = ?').get(id)) return
    this.marcar(id, 'na-fila', null)
    this.enfileirar(id)
    this.emit('mudou')
  }

  private enfileirar(id: number): void {
    if (!this.fila.includes(id)) this.fila.push(id)
    void this.trabalhar()
  }

  private async trabalhar(): Promise<void> {
    if (this.trabalhando) return
    this.trabalhando = true
    try {
      for (let id = this.fila.shift(); id !== undefined; id = this.fila.shift()) {
        try {
          await this.converter(id)
        } catch (e) {
          log.erro('Falha ao converter a apresentação', id, e)
          this.marcar(id, 'erro', e instanceof Error ? e.message : String(e))
        } finally {
          this.progresso.delete(id)
          this.emit('progresso', { id, feito: 1, total: 1, fim: true })
        }
        this.emit('mudou')
      }
    } finally {
      this.trabalhando = false
    }
  }

  private marcar(id: number, situacao: SituacaoApresentacao, detalhe: string | null): void {
    this.db.prepare('update apresentacoes set situacao = ?, detalhe = ? where id = ?').run(situacao, detalhe, id)
  }

  private async converter(id: number): Promise<void> {
    const l = this.db.prepare('select * from apresentacoes where id = ?').get(id) as unknown as Linha | undefined
    if (!l) return
    if (!existsSync(l.arquivo)) throw new Error('O arquivo da apresentação sumiu da pasta do programa. Importe de novo.')
    this.marcar(id, 'convertendo', null)
    this.progresso.set(id, 0)
    this.emit('mudou')
    const t0 = Date.now()

    // cada conversão numa pasta nova: a anterior pode estar no ar enquanto esta converte
    const raiz = join(this.pastas.slides, String(id))
    const pasta = join(raiz, String(Date.now()))
    await fsp.mkdir(pasta, { recursive: true })

    let ultimoAviso = 0
    const r = await this.conversor.exportar(l.tipo, l.arquivo, pasta, this.conversor.largura(), (feito, total) => {
      // a exportação é ~85% do trabalho; o resto é miniaturas e mídias
      this.progresso.set(id, (feito / Math.max(1, total)) * 0.85)
      this.emit('progresso', { id, feito, total, nome: l.nome })
      if (Date.now() - ultimoAviso > 700) {
        ultimoAviso = Date.now()
        this.emit('mudou')
      }
    })
    if (!r.slides.length) throw new Error('A apresentação não tem nenhum slide.')

    const slides: Array<Omit<LinhaSlide, 'ordem'>> = []
    for (const [i, s] of r.slides.entries()) {
      const png = join(pasta, s.arquivo)
      if (!existsSync(png)) throw new Error(`O slide ${i + 1} não foi exportado.`)
      const mini = join(pasta, s.arquivo.replace(/\.png$/i, '-mini.jpg'))
      const tam = await this.conversor.miniatura(png, mini)
      slides.push({
        imagem: png,
        miniatura: mini,
        largura: tam.largura || r.largura,
        altura: tam.altura || r.altura,
        oculto: s.oculto ? 1 : 0,
        notas: s.notas,
        midias: '[]',
      })
      this.progresso.set(id, 0.85 + (0.1 * (i + 1)) / r.slides.length)
      await respirar()
    }

    if (l.tipo === 'pptx') {
      const midias = await this.extrairMidias(l, pasta)
      for (const [i, lista] of midias) if (slides[i]) slides[i]!.midias = JSON.stringify(lista)
    }

    transacao(this.db, () => {
      this.db.prepare('delete from apresentacao_slides where apresentacao_id = ?').run(id)
      const ins = this.db.prepare(
        `insert into apresentacao_slides (apresentacao_id, ordem, imagem, miniatura, largura, altura, oculto, notas, midias)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      slides.forEach((s, ordem) => ins.run(id, ordem, s.imagem, s.miniatura, s.largura, s.altura, s.oculto, s.notas, s.midias))
      this.db
        .prepare("update apresentacoes set situacao = 'pronto', detalhe = null, pasta_slides = ?, convertido_em = ? where id = ?")
        .run(pasta, new Date().toISOString(), id)
    })
    // apaga as conversões antigas (se uma estiver aberta agora, fica para a próxima vez)
    for (const nome of readdirSync(raiz)) {
      if (join(raiz, nome) !== pasta) rmSync(join(raiz, nome), { recursive: true, force: true, maxRetries: 2 })
    }
    log.info(`Apresentação ${id} (${l.nome}) convertida: ${slides.length} slides em ${((Date.now() - t0) / 1000).toFixed(1)} s`)
  }

  /** Extrai os vídeos e áudios do .pptx para a pasta dos slides; devolve as mídias de cada slide. */
  private async extrairMidias(l: Linha, pasta: string): Promise<Map<number, MidiaGuardada[]>> {
    const porSlide = new Map<number, MidiaGuardada[]>()
    let zip: ArquivoZip
    try {
      zip = new ArquivoZip(l.arquivo)
    } catch (e) {
      log.aviso('Não foi possível ler as mídias de', l.arquivo, e)
      return porSlide
    }
    try {
      const achadas = midiasDoPptx(zip, pastaDe(l.original))
      // a mesma mídia pode aparecer em vários slides: extrai uma vez
      const prontas = new Map<string, string | null>()
      for (const m of achadas) {
        const chave = m.entrada ?? m.externo!
        if (!prontas.has(chave)) {
          let destino: string | null = null
          try {
            const ext = extname(chave).toLowerCase() || (m.tipo === 'video' ? '.mp4' : '.mp3')
            const bruto = join(pasta, `midia-${prontas.size + 1}${ext}`)
            if (m.entrada) await fsp.writeFile(bruto, await zip.lerAsync(m.entrada))
            else await fsp.copyFile(m.externo!, bruto)
            destino = await this.conversor.prepararMidia(bruto, m.tipo)
            if (!destino) log.aviso(`Mídia "${m.nome}" do slide ${m.slide + 1} não toca neste computador; ficou de fora.`)
          } catch (e) {
            log.aviso(`Não foi possível extrair "${m.nome}" do slide ${m.slide + 1}:`, e)
          }
          prontas.set(chave, destino)
        }
        const arquivo = prontas.get(chave)
        if (!arquivo) continue
        const { slide, entrada: _e, externo: _x, ...resto } = m
        const lista = porSlide.get(slide) ?? []
        lista.push({ ...resto, arquivo })
        porSlide.set(slide, lista)
      }
    } finally {
      zip.fechar()
    }
    return porSlide
  }
}

function paraSlide(s: LinhaSlide): SlideDados {
  let midias: MidiaGuardada[] = []
  try {
    midias = JSON.parse(s.midias) as MidiaGuardada[]
  } catch {
    // banco com JSON estragado: sem mídias
  }
  return {
    url: urlMidia(s.imagem),
    miniaturaUrl: urlMidia(s.miniatura ?? s.imagem),
    largura: s.largura,
    altura: s.altura,
    oculto: s.oculto === 1,
    notas: s.notas,
    midias: midias.map(({ arquivo, ...m }) => ({ ...m, url: urlMidia(arquivo) })),
  }
}
