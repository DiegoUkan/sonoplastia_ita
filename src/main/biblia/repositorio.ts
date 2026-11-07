/**
 * Bíblias no banco. Formato dos arquivos (repositório damarals/biblias, o mesmo do projeto de
 * transcrição): lista de 66 livros em ordem, `[{ "abbrev": "Gn", "chapters": [["v1", "v2"], …] }, …]`.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import type { ArquivoBibliaEncontrado, ResultadoBuscaBiblia, VersaoBiblia, VersiculoTexto } from '../../shared/dados'
import { type Banco, consultaFts, respirar, transacao } from '../banco'

export const NOMES_VERSOES: Record<string, string> = {
  ARA: 'Almeida Revista e Atualizada',
  ARC: 'Almeida Revista e Corrigida',
  ACF: 'Almeida Corrigida Fiel',
  AS21: 'Almeida Século 21',
  NAA: 'Nova Almeida Atualizada',
  NVI: 'Nova Versão Internacional',
  NVT: 'Nova Versão Transformadora',
  NTLH: 'Nova Tradução na Linguagem de Hoje',
  NBV: 'Nova Bíblia Viva',
  KJA: 'King James Atualizada',
  KJF: 'King James Fiel',
  JFAA: 'João Ferreira de Almeida Atualizada',
  TB: 'Tradução Brasileira',
}

type LivroJson = { abbrev?: string; chapters: unknown }

/** Confere o formato e devolve os capítulos de cada livro. */
export function lerBibliaJson(texto: string): string[][][] {
  const dados = JSON.parse(texto.replace(/^﻿/, '')) as unknown
  if (!Array.isArray(dados) || dados.length !== 66) throw new Error('O arquivo precisa ter os 66 livros, em ordem.')
  return dados.map((l: LivroJson, i) => {
    if (!l || !Array.isArray(l.chapters)) throw new Error(`Livro ${i + 1} sem capítulos.`)
    return (l.chapters as unknown[]).map((c) => (Array.isArray(c) ? c.map((v) => String(v ?? '').trim()) : []))
  })
}

export class RepositorioBiblia {
  constructor(private readonly db: Banco) {}

  versoes(): VersaoBiblia[] {
    return this.db
      .prepare(
        `select v.sigla, v.nome, (select count(*) from biblia_versiculos b where b.sigla = v.sigla) as versiculos
         from biblia_versoes v order by v.sigla`,
      )
      .all() as unknown as VersaoBiblia[]
  }

  async importar(texto: string, sigla: string, nome: string, aoProgresso: (feito: number, total: number) => void): Promise<number> {
    const s = sigla.trim().toUpperCase()
    if (!/^[A-Z0-9]{2,8}$/.test(s)) throw new Error('A sigla deve ter de 2 a 8 letras ou números (ex.: ARA).')
    const livros = lerBibliaJson(texto)
    transacao(this.db, () => {
      this.db.prepare('delete from biblia_versiculos where sigla = ?').run(s)
      this.db.prepare('delete from biblia_busca where sigla = ?').run(s)
      this.db
        .prepare('insert or replace into biblia_versoes (sigla, nome, importado_em) values (?, ?, ?)')
        .run(s, nome.trim() || NOMES_VERSOES[s] || s, new Date().toISOString())
    })
    const insVers = this.db.prepare('insert into biblia_versiculos (sigla, livro, capitulo, versiculo, texto) values (?, ?, ?, ?, ?)')
    const insBusca = this.db.prepare('insert into biblia_busca (texto, sigla, livro, capitulo, versiculo) values (?, ?, ?, ?, ?)')
    let total = 0
    for (let l = 0; l < livros.length; l++) {
      transacao(this.db, () => {
        livros[l]!.forEach((versiculos, c) =>
          versiculos.forEach((v, i) => {
            if (!v) return
            insVers.run(s, l + 1, c + 1, i + 1, v)
            insBusca.run(v, s, l + 1, c + 1, i + 1)
            total++
          }),
        )
      })
      aoProgresso(l + 1, 66)
      await respirar()
    }
    return total
  }

  capitulo(sigla: string, livro: number, capitulo: number): VersiculoTexto[] {
    return this.db
      .prepare('select versiculo, texto from biblia_versiculos where sigla = ? and livro = ? and capitulo = ? order by versiculo')
      .all(sigla, livro, capitulo) as unknown as VersiculoTexto[]
  }

  totalCapitulos(sigla: string, livro: number): number {
    const r = this.db.prepare('select max(capitulo) as n from biblia_versiculos where sigla = ? and livro = ?').get(sigla, livro) as { n: number | null }
    return r.n ?? 0
  }

  buscar(sigla: string, termo: string, limite = 60): ResultadoBuscaBiblia[] {
    const q = consultaFts(termo)
    if (!q) return []
    return this.db
      .prepare(
        `select livro, capitulo, versiculo, snippet(biblia_busca, 0, '[', ']', '…', 16) as trecho
         from biblia_busca where biblia_busca match ? and sigla = ? order by rank limit ?`,
      )
      .all(q, sigla, limite) as unknown as ResultadoBuscaBiblia[]
  }

  /** Arquivos .json de Bíblia nas pastas conhecidas (a do programa e a do projeto de transcrição). */
  arquivosEncontrados(pastaBiblias: string): ArquivoBibliaEncontrado[] {
    const pastas = [pastaBiblias, join(homedir(), 'Documents', 'Projetos', 'Transcrição_tempo_real', 'data', 'biblia')]
    const ja = new Set(this.versoes().map((v) => v.sigla))
    const vistos = new Set<string>()
    const r: ArquivoBibliaEncontrado[] = []
    for (const p of pastas) {
      if (!existsSync(p)) continue
      for (const f of readdirSync(p)) {
        if (!/\.json$/i.test(f)) continue
        const sigla = basename(f, '.json').toUpperCase()
        if (vistos.has(sigla) || !/^[A-Z0-9]{2,8}$/.test(sigla)) continue
        vistos.add(sigla)
        r.push({ caminho: join(p, f), sigla, nome: NOMES_VERSOES[sigla] ?? sigla, jaImportada: ja.has(sigla) })
      }
    }
    return r
  }
}

export function lerArquivoBiblia(caminho: string): string {
  return readFileSync(caminho, 'utf8')
}
