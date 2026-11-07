/**
 * Biblioteca de mídias: copia os arquivos para `C:\Sonoplastia\midias\<tipo>\`, evita repetidos
 * (sha256), analisa cada um na janela-sonda (duração, tamanho, miniatura, se toca) e converte com o
 * ffmpeg o que o programa não consegue tocar. Emite 'mudou' quando algo muda.
 */
import { EventEmitter } from 'node:events'
import { createReadStream, existsSync, promises as fsp, rmSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { basename, extname, join } from 'node:path'
import type { FiltroMidias, Midia, ResultadoImportacao, SituacaoMidia, TipoMidia } from '../../shared/dados'
import { urlMidia } from '../../shared/midia'
import type { Banco } from '../banco'
import { converter } from '../ffmpeg'
import { log } from '../log'
import type { Sonda } from './sonda'

const EXTENSOES: Record<TipoMidia, string[]> = {
  video: ['.mp4', '.m4v', '.mov', '.mkv', '.webm', '.avi', '.wmv', '.mpg', '.mpeg', '.flv', '.3gp'],
  imagem: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'],
  audio: ['.mp3', '.m4a', '.aac', '.wav', '.ogg', '.oga', '.flac', '.wma', '.opus'],
}

export function tipoDoArquivo(caminho: string): TipoMidia | null {
  const ext = extname(caminho).toLowerCase()
  for (const [tipo, exts] of Object.entries(EXTENSOES)) if (exts.includes(ext)) return tipo as TipoMidia
  return null
}

interface Linha {
  id: number
  tipo: TipoMidia
  nome: string
  arquivo: string
  sha256: string | null
  bytes: number
  duracao: number | null
  largura: number | null
  altura: number | null
  miniatura: string | null
  situacao: SituacaoMidia
  detalhe: string | null
  criado_em: string
  excluido_em: string | null
}

async function sha256(caminho: string): Promise<string> {
  const h = createHash('sha256')
  for await (const pedaco of createReadStream(caminho)) h.update(pedaco as Buffer)
  return h.digest('hex')
}

function nomeLivre(pasta: string, nome: string): string {
  const ext = extname(nome)
  const base = basename(nome, ext).replace(/[<>:"/\\|?*]/g, '_').trim() || 'arquivo'
  let candidato = join(pasta, base + ext)
  for (let n = 2; existsSync(candidato); n++) candidato = join(pasta, `${base} (${n})${ext}`)
  return candidato
}

export class BibliotecaMidias extends EventEmitter {
  private fila: number[] = []
  private trabalhando = false
  private progresso = new Map<number, number>()

  constructor(
    private readonly db: Banco,
    private readonly pastas: { base: string; miniaturas: string },
    private readonly sonda: Sonda,
    private readonly ffmpeg: string | null,
  ) {
    super()
  }

  /** Retoma o que ficou pela metade (programa fechado durante a análise ou conversão). */
  retomar(): void {
    const ids = this.db
      .prepare("select id from midias where situacao in ('analisando', 'convertendo') and excluido_em is null")
      .all() as Array<{ id: number }>
    for (const { id } of ids) this.enfileirar(id)
  }

  listar(f: FiltroMidias): Midia[] {
    const cond = [f.lixeira ? 'excluido_em is not null' : 'excluido_em is null']
    const params: Array<string | number> = []
    if (f.tipo && f.tipo !== 'todos') {
      cond.push('tipo = ?')
      params.push(f.tipo)
    }
    const busca = f.busca?.trim()
    if (busca) {
      cond.push("nome like ? escape '\\'")
      params.push(`%${busca.replace(/[\\%_]/g, (c) => '\\' + c)}%`)
    }
    const linhas = this.db
      .prepare(`select * from midias where ${cond.join(' and ')} order by criado_em desc, id desc limit 1000`)
      .all(...params) as unknown as Linha[]
    return linhas.map((l) => this.paraMidia(l))
  }

  obter(id: number): Midia | null {
    const l = this.db.prepare('select * from midias where id = ?').get(id) as unknown as Linha | undefined
    return l ? this.paraMidia(l) : null
  }

  private paraMidia(l: Linha): Midia {
    return {
      id: l.id,
      tipo: l.tipo,
      nome: l.nome,
      arquivo: l.arquivo,
      url: urlMidia(l.arquivo),
      miniaturaUrl: l.miniatura ? urlMidia(l.miniatura) : null,
      duracao: l.duracao,
      largura: l.largura,
      altura: l.altura,
      bytes: l.bytes,
      situacao: l.situacao,
      detalhe: l.detalhe,
      progresso: this.progresso.get(l.id) ?? null,
      criadoEm: l.criado_em,
      excluida: l.excluido_em !== null,
    }
  }

  async importar(caminhos: string[]): Promise<ResultadoImportacao> {
    const r: ResultadoImportacao = { importadas: [], repetidas: [], ignoradas: [] }
    for (const caminho of caminhos) {
      const tipo = tipoDoArquivo(caminho)
      if (!tipo) {
        r.ignoradas.push(`${basename(caminho)} (tipo de arquivo não aceito)`)
        continue
      }
      try {
        const st = statSync(caminho)
        if (!st.isFile()) {
          r.ignoradas.push(`${basename(caminho)} (não é arquivo)`)
          continue
        }
        const hash = await sha256(caminho)
        const existente = this.db.prepare('select id from midias where sha256 = ? and excluido_em is null').get(hash) as
          | { id: number }
          | undefined
        if (existente) {
          r.repetidas.push(existente.id)
          continue
        }
        const pasta = join(this.pastas.base, tipo)
        await fsp.mkdir(pasta, { recursive: true })
        const destino = nomeLivre(pasta, basename(caminho))
        await fsp.copyFile(caminho, destino)
        const nome = basename(caminho, extname(caminho))
        const res = this.db
          .prepare(
            `insert into midias (tipo, nome, arquivo, original, sha256, bytes, situacao, criado_em)
             values (?, ?, ?, ?, ?, ?, 'analisando', ?)`,
          )
          .run(tipo, nome, destino, caminho, hash, st.size, new Date().toISOString())
        const id = Number(res.lastInsertRowid)
        r.importadas.push(id)
        this.enfileirar(id)
      } catch (e) {
        log.erro('Falha ao importar', caminho, e)
        r.ignoradas.push(`${basename(caminho)} (${e instanceof Error ? e.message : e})`)
      }
    }
    this.emit('mudou')
    return r
  }

  renomear(id: number, nome: string): void {
    const n = nome.trim()
    if (!n) return
    this.db.prepare('update midias set nome = ? where id = ?').run(n, id)
    this.emit('mudou')
  }

  excluir(id: number): void {
    this.db.prepare('update midias set excluido_em = ? where id = ?').run(new Date().toISOString(), id)
    this.emit('mudou')
  }

  restaurar(id: number): void {
    const l = this.db.prepare('select sha256 from midias where id = ?').get(id) as { sha256: string | null } | undefined
    const outra = l?.sha256
      ? this.db.prepare('select id from midias where sha256 = ? and excluido_em is null').get(l.sha256)
      : undefined
    if (outra) throw new Error('Já existe uma cópia deste arquivo na biblioteca.')
    this.db.prepare('update midias set excluido_em = null where id = ?').run(id)
    this.emit('mudou')
  }

  /** Apaga de vez (só da lixeira): tira do banco e apaga o arquivo e a miniatura. */
  apagar(id: number): void {
    const l = this.db.prepare('select * from midias where id = ? and excluido_em is not null').get(id) as unknown as Linha | undefined
    if (!l) return
    this.db.prepare('delete from midias where id = ?').run(id)
    for (const c of [l.arquivo, l.miniatura]) if (c) rmSync(c, { force: true })
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
          await this.analisar(id)
        } catch (e) {
          log.erro('Falha ao analisar a mídia', id, e)
          this.marcar(id, 'erro', e instanceof Error ? e.message : String(e))
        }
        this.emit('mudou')
      }
    } finally {
      this.trabalhando = false
    }
  }

  private marcar(id: number, situacao: SituacaoMidia, detalhe: string | null): void {
    this.db.prepare('update midias set situacao = ?, detalhe = ? where id = ?').run(situacao, detalhe, id)
  }

  private async analisar(id: number, jaConvertida = false): Promise<void> {
    const l = this.db.prepare('select * from midias where id = ?').get(id) as unknown as Linha | undefined
    if (!l || l.excluido_em) return
    this.marcar(id, 'analisando', null)
    const r = await this.sonda.analisar(urlMidia(l.arquivo), l.tipo)
    if (r.ok) {
      let miniatura: string | null = null
      if (r.miniatura?.startsWith('data:image/jpeg;base64,')) {
        await fsp.mkdir(this.pastas.miniaturas, { recursive: true })
        miniatura = join(this.pastas.miniaturas, `${id}.jpg`)
        await fsp.writeFile(miniatura, Buffer.from(r.miniatura.slice('data:image/jpeg;base64,'.length), 'base64'))
      }
      this.db
        .prepare(
          `update midias set situacao = 'pronto', detalhe = null, duracao = ?, largura = ?, altura = ?,
           miniatura = coalesce(?, miniatura) where id = ?`,
        )
        .run(r.duracao ?? null, r.largura ?? null, r.altura ?? null, miniatura, id)
      return
    }
    if (l.tipo === 'imagem' || jaConvertida) {
      this.marcar(id, 'erro', r.erro ?? 'Não foi possível abrir este arquivo.')
      return
    }
    if (!this.ffmpeg) {
      this.marcar(id, 'erro', 'Formato que o programa não toca, e não há ffmpeg para converter.')
      return
    }
    // converte para um formato que o Chromium toca e analisa de novo
    this.marcar(id, 'convertendo', null)
    this.emit('mudou')
    const ext = l.tipo === 'video' ? '.mp4' : '.mp3'
    const destino = nomeLivre(join(this.pastas.base, l.tipo), `${basename(l.arquivo, extname(l.arquivo))} (convertido)${ext}`)
    let ultimoAviso = 0
    await converter(this.ffmpeg, l.arquivo, destino, l.tipo === 'video' ? 'video' : 'audio', l.duracao, (p) => {
      this.progresso.set(id, p)
      if (Date.now() - ultimoAviso > 1000) {
        ultimoAviso = Date.now()
        this.emit('mudou')
      }
    })
    this.progresso.delete(id)
    const bytes = statSync(destino).size
    this.db.prepare('update midias set arquivo = ?, bytes = ? where id = ?').run(destino, bytes, id)
    rmSync(l.arquivo, { force: true })
    log.info(`Mídia ${id} convertida: ${destino}`)
    await this.analisar(id, true)
  }
}
