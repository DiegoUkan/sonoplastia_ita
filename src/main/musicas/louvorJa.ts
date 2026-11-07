/**
 * Importa as músicas do Louvor JA (porta do `..\Integração holyrics\louvorja\lja.py`).
 *
 * O Louvor JA guarda tudo em `config\database.db` (SQLite), aberto aqui em SOMENTE LEITURA:
 *   musics        nome, MP3 cantado, MP3 playback, imagem
 *   lyrics        trechos (show_slide = 1), com o tempo na versão cantada (time) e no playback (instrumental_time)
 *   albums(_musics) álbum e faixa (nos hinários, a faixa é o número do hino)
 *   files         caminho de cada arquivo, relativo a `config\`
 * Cada música vira `LJA-<id_music>` aqui. Reimportar atualiza, mas não sobrescreve música editada.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { ResultadoLouvorJa, SlideMusicaDados } from '../../shared/dados'
import { msDeTempo } from '../../shared/musica'
import { type Banco, respirar, transacao } from '../banco'
import type { RepositorioMusicas } from './repositorio'

const ALBUNS_NUMERADOS = ['Hinário Adventista', 'Hinário Adventista 1996']

interface MusicaLja {
  id_music: number
  name: string | null
  id_file_music: number | null
  id_file_instrumental_music: number | null
  id_file_image: number | null
}

/** IDs das músicas usadas na liturgia do Louvor JA (arquivo INI `liturgia.ja`). */
export function idsDaLiturgia(arquivo: string): number[] {
  if (!existsSync(arquivo)) return []
  const bruto = readFileSync(arquivo)
  let texto: string
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(bruto)
  } catch {
    texto = new TextDecoder('windows-1252').decode(bruto)
  }
  const ids: number[] = []
  for (const secao of texto.split(/^\s*\[/m)) {
    const tipo = /^\s*tipo\s*=\s*(.+?)\s*$/m.exec(secao)?.[1]
    const musica = /^\s*musica\s*=\s*(\d+)\s*$/m.exec(secao)?.[1]
    if (tipo === 'musica' && musica && !ids.includes(Number(musica))) ids.push(Number(musica))
  }
  return ids
}

export async function importarLouvorJa(
  db: Banco,
  repo: RepositorioMusicas,
  pastaConfig: string,
  modo: 'todas' | 'liturgia' | number[],
  aoProgresso: (feito: number, total: number) => void,
): Promise<ResultadoLouvorJa> {
  const arquivoBanco = join(pastaConfig, 'database.db')
  if (!existsSync(arquivoBanco)) throw new Error(`Não achei o banco do Louvor JA em ${arquivoBanco}. Confira a pasta nas Configurações.`)
  const lja = new DatabaseSync(arquivoBanco, { readOnly: true })
  const r: ResultadoLouvorJa = { novas: 0, atualizadas: 0, mantidasEditadas: 0, semAudio: 0, erros: [] }
  try {
    let ids: number[]
    if (Array.isArray(modo)) ids = modo
    else if (modo === 'liturgia') ids = idsDaLiturgia(join(process.env.APPDATA ?? '', 'LouvorJA', 'liturgia.ja'))
    else ids = (lja.prepare("select id_music from musics where id_language = 'pt' order by id_music").all() as Array<{ id_music: number }>).map((x) => x.id_music)

    const arquivo = lja.prepare('select subdirectory, file_name from files where id_file = ?')
    const caminho = (idFile: number | null): string | null => {
      if (!idFile) return null
      const f = arquivo.get(idFile) as { subdirectory: string | null; file_name: string } | undefined
      if (!f) return null
      return join(pastaConfig, ...`${f.subdirectory ?? ''}${f.file_name}`.split(/[\\/]+/).filter(Boolean))
    }
    const musica = lja.prepare('select id_music, name, id_file_music, id_file_instrumental_music, id_file_image from musics where id_music = ?')
    const album = lja.prepare(
      'select a.name, am.track from albums_musics am join albums a on a.id_album = am.id_album where am.id_music = ? order by am.id_album limit 1',
    )
    const trechos = lja.prepare(
      'select lyric, aux_lyric, time, instrumental_time from lyrics where id_music = ? and show_slide = 1 order by "order"',
    )
    const existente = db.prepare('select id, editada from musicas where origem = ?')
    const inserir = db.prepare(
      `insert into musicas (titulo, album, faixa, origem, audio_cantado, audio_playback, imagem, editada, criado_em, atualizado_em)
       values (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    )
    const atualizar = db.prepare(
      'update musicas set titulo = ?, album = ?, faixa = ?, audio_cantado = ?, audio_playback = ?, imagem = ?, atualizado_em = ? where id = ?',
    )

    const LOTE = 40
    for (let i = 0; i < ids.length; i += LOTE) {
      transacao(db, () => {
        for (const idLja of ids.slice(i, i + LOTE)) {
          try {
            const m = musica.get(idLja) as unknown as MusicaLja | undefined
            if (!m) {
              r.erros.push(`Música ${idLja} não existe no Louvor JA.`)
              continue
            }
            const a = album.get(idLja) as { name: string | null; track: number | null } | undefined
            const nomeAlbum = a?.name ?? ''
            const faixa = a?.track ?? null
            const nome = (m.name ?? '').trim()
            const numerada = ALBUNS_NUMERADOS.includes(nomeAlbum) && !!faixa
            const titulo = numerada ? `${String(faixa).padStart(3, '0')} - ${nome}${nomeAlbum.endsWith('1996') ? ' (1996)' : ''}` : nome
            const cantado = caminho(m.id_file_music)
            const playback = caminho(m.id_file_instrumental_music)
            const imagem = caminho(m.id_file_image)
            if (!cantado && !playback) r.semAudio++
            const slides: SlideMusicaDados[] = (trechos.all(idLja) as Array<{ lyric: string | null; aux_lyric: string | null; time: string; instrumental_time: string }>).map(
              (t) => {
                const texto = (t.lyric ?? '').replace(/\r\n?/g, '\n').trim()
                const aux = (t.aux_lyric ?? '').trim()
                return {
                  texto: aux ? (texto ? `${aux}\n${texto}` : aux) : texto,
                  msCantado: msDeTempo(t.time),
                  msPlayback: msDeTempo(t.instrumental_time),
                }
              },
            )
            const agora = new Date().toISOString()
            const origem = `LJA-${idLja}`
            const ja = existente.get(origem) as { id: number; editada: number } | undefined
            let id: number
            if (ja) {
              if (ja.editada) {
                r.mantidasEditadas++
                continue
              }
              atualizar.run(titulo, nomeAlbum, faixa, cantado, playback, imagem, agora, ja.id)
              id = ja.id
              r.atualizadas++
            } else {
              id = Number(inserir.run(titulo, nomeAlbum, faixa, origem, cantado, playback, imagem, agora, agora).lastInsertRowid)
              r.novas++
            }
            repo.gravarSlides(id, slides)
            repo.indexar(id)
          } catch (e) {
            r.erros.push(`Música ${idLja}: ${e instanceof Error ? e.message : e}`)
          }
        }
      })
      aoProgresso(Math.min(i + LOTE, ids.length), ids.length)
      await respirar()
    }
  } finally {
    lja.close()
  }
  return r
}
