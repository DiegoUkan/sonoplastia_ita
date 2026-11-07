import type { Musica, ResumoMusica, SlideMusicaDados } from '../../shared/dados'
import { urlMidia } from '../../shared/midia'
import { type Banco, consultaFts, transacao } from '../banco'

interface LinhaMusica {
  id: number
  titulo: string
  album: string | null
  faixa: number | null
  origem: string | null
  audio_cantado: string | null
  audio_playback: string | null
  imagem: string | null
  editada: number
}

function resumo(l: LinhaMusica): ResumoMusica {
  return {
    id: l.id,
    titulo: l.titulo,
    album: l.album,
    faixa: l.faixa,
    temCantado: !!l.audio_cantado,
    temPlayback: !!l.audio_playback,
    origem: l.origem,
    editada: l.editada === 1,
  }
}

export class RepositorioMusicas {
  constructor(private readonly db: Banco) {}

  /** Busca por título, álbum, trecho da letra ou número do hino. */
  listar(busca: string, limite = 300): ResumoMusica[] {
    const b = busca.trim()
    const campos = 'm.id, m.titulo, m.album, m.faixa, m.origem, m.audio_cantado, m.audio_playback, m.imagem, m.editada'
    if (!b) {
      return (this.db.prepare(`select ${campos} from musicas m order by m.titulo limit ?`).all(limite) as unknown as LinhaMusica[]).map(resumo)
    }
    const resultado: LinhaMusica[] = []
    if (/^\d{1,3}$/.test(b)) {
      resultado.push(
        ...(this.db
          .prepare(`select ${campos} from musicas m where m.faixa = ? and m.album like 'Hinário%' order by m.album`)
          .all(Number(b)) as unknown as LinhaMusica[]),
      )
    }
    const q = consultaFts(b)
    if (q) {
      const vistos = new Set(resultado.map((r) => r.id))
      const fts = this.db
        .prepare(
          `select ${campos} from musicas_busca b join musicas m on m.id = b.rowid
           where musicas_busca match ? order by bm25(musicas_busca, 10.0, 2.0, 1.0) limit ?`,
        )
        .all(q, limite) as unknown as LinhaMusica[]
      for (const l of fts) if (!vistos.has(l.id)) resultado.push(l)
    }
    return resultado.slice(0, limite).map(resumo)
  }

  obter(id: number): Musica | null {
    const l = this.db.prepare('select * from musicas where id = ?').get(id) as unknown as LinhaMusica | undefined
    if (!l) return null
    const slides = this.db
      .prepare('select texto, ms_cantado, ms_playback from musica_slides where musica_id = ? order by ordem')
      .all(id) as Array<{ texto: string; ms_cantado: number; ms_playback: number }>
    return {
      ...resumo(l),
      urlCantado: l.audio_cantado ? urlMidia(l.audio_cantado) : null,
      urlPlayback: l.audio_playback ? urlMidia(l.audio_playback) : null,
      urlImagem: l.imagem ? urlMidia(l.imagem) : null,
      slides: slides.map((s) => ({ texto: s.texto, msCantado: s.ms_cantado, msPlayback: s.ms_playback })),
    }
  }

  /** Grava a edição feita no programa (a música passa a não ser sobrescrita pelo importador). */
  salvarEdicao(id: number, titulo: string, slides: SlideMusicaDados[]): void {
    transacao(this.db, () => {
      this.db.prepare('update musicas set titulo = ?, editada = 1, atualizado_em = ? where id = ?').run(titulo.trim(), new Date().toISOString(), id)
      this.gravarSlides(id, slides)
      this.indexar(id)
    })
  }

  gravarSlides(id: number, slides: SlideMusicaDados[]): void {
    this.db.prepare('delete from musica_slides where musica_id = ?').run(id)
    const ins = this.db.prepare('insert into musica_slides (musica_id, ordem, texto, ms_cantado, ms_playback) values (?, ?, ?, ?, ?)')
    slides.forEach((s, i) => ins.run(id, i, s.texto, Math.max(0, Math.round(s.msCantado)), Math.max(0, Math.round(s.msPlayback))))
  }

  /** Atualiza o índice de busca da música. */
  indexar(id: number): void {
    const m = this.db.prepare('select titulo, album from musicas where id = ?').get(id) as { titulo: string; album: string | null } | undefined
    this.db.prepare('delete from musicas_busca where rowid = ?').run(id)
    if (!m) return
    const letra = (this.db.prepare('select texto from musica_slides where musica_id = ? order by ordem').all(id) as Array<{ texto: string }>)
      .map((s) => s.texto)
      .join('\n')
    this.db.prepare('insert into musicas_busca (rowid, titulo, album, letra) values (?, ?, ?, ?)').run(id, m.titulo, m.album ?? '', letra)
  }

  /** Caminho do áudio de uma versão (para liberar no protocolo de mídia). */
  arquivos(id: number): { cantado: string | null; playback: string | null; imagem: string | null } | null {
    const l = this.db.prepare('select audio_cantado, audio_playback, imagem from musicas where id = ?').get(id) as
      | { audio_cantado: string | null; audio_playback: string | null; imagem: string | null }
      | undefined
    return l ? { cantado: l.audio_cantado, playback: l.audio_playback, imagem: l.imagem } : null
  }
}
