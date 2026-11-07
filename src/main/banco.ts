/**
 * Banco SQLite do programa (`C:\Sonoplastia\dados\sonoplastia.db`), pelo `node:sqlite` que já vem
 * no Electron (sem módulo nativo para compilar). Migrações em ordem; nunca altere uma que já foi
 * aplicada: acrescente outra no fim.
 */
import { DatabaseSync } from 'node:sqlite'

export type Banco = DatabaseSync

const MIGRACOES: string[] = [
  // 1: biblioteca de mídias, músicas e Bíblia
  `
  create table midias (
    id integer primary key,
    tipo text not null check (tipo in ('video', 'imagem', 'audio')),
    nome text not null,
    arquivo text not null,
    original text,
    sha256 text,
    bytes integer not null default 0,
    duracao real,
    largura integer,
    altura integer,
    miniatura text,
    situacao text not null default 'analisando',
    detalhe text,
    criado_em text not null,
    excluido_em text
  );
  create index midias_tipo on midias (tipo, excluido_em);
  create unique index midias_sha on midias (sha256) where excluido_em is null;

  create table musicas (
    id integer primary key,
    titulo text not null,
    album text,
    faixa integer,
    origem text unique,
    audio_cantado text,
    audio_playback text,
    imagem text,
    editada integer not null default 0,
    criado_em text not null,
    atualizado_em text not null
  );
  create table musica_slides (
    musica_id integer not null references musicas (id) on delete cascade,
    ordem integer not null,
    texto text not null,
    ms_cantado integer not null default 0,
    ms_playback integer not null default 0,
    primary key (musica_id, ordem)
  );
  create virtual table musicas_busca using fts5 (titulo, album, letra, tokenize = 'unicode61 remove_diacritics 2');

  create table biblia_versoes (
    sigla text primary key,
    nome text not null,
    importado_em text not null
  );
  create table biblia_versiculos (
    sigla text not null,
    livro integer not null,
    capitulo integer not null,
    versiculo integer not null,
    texto text not null,
    primary key (sigla, livro, capitulo, versiculo)
  ) without rowid;
  create virtual table biblia_busca using fts5 (
    texto, sigla unindexed, livro unindexed, capitulo unindexed, versiculo unindexed,
    tokenize = 'unicode61 remove_diacritics 2'
  );
  `,
]

export function abrirBanco(arquivo: string): Banco {
  const db = new DatabaseSync(arquivo)
  db.exec('pragma journal_mode = wal; pragma foreign_keys = on; pragma synchronous = normal;')
  db.exec('create table if not exists migracoes (versao integer primary key, aplicada_em text not null)')
  const atual = (db.prepare('select coalesce(max(versao), 0) as v from migracoes').get() as { v: number }).v
  for (let i = atual; i < MIGRACOES.length; i++) {
    transacao(db, () => {
      db.exec(MIGRACOES[i]!)
      db.prepare('insert into migracoes (versao, aplicada_em) values (?, ?)').run(i + 1, new Date().toISOString())
    })
  }
  return db
}

export function transacao<T>(db: Banco, f: () => T): T {
  db.exec('begin')
  try {
    const r = f()
    db.exec('commit')
    return r
  } catch (e) {
    db.exec('rollback')
    throw e
  }
}

/** Monta uma consulta FTS5 segura: cada palavra vira prefixo ("amor"*), todas obrigatórias. */
export function consultaFts(busca: string): string | null {
  const palavras = busca
    .normalize('NFC')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, 12)
  if (!palavras.length) return null
  return palavras.map((p) => `"${p.replace(/"/g, '')}"*`).join(' ')
}

/** Cede a vez ao laço de eventos (para importações longas não travarem o programa). */
export const respirar = () => new Promise<void>((r) => setImmediate(r))
