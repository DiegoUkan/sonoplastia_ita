/**
 * Liturgias no banco: cada culto (com data) e cada modelo ("Culto de sábado") é uma linha; as seções e
 * os itens ficam num JSON validado pelo esquema (`src/shared/liturgia.ts`), então um documento vindo
 * da tela nunca grava lixo.
 */
import { z } from 'zod'
import {
  type AlteracaoLiturgia,
  copiarSecoes,
  type DocumentoLiturgia,
  EsquemaDocumentoLiturgia,
  EsquemaSecaoLiturgia,
  type Liturgia,
  type ResumoLiturgia,
  SECOES_PADRAO,
  secaoNova,
} from '../../shared/liturgia'
import type { Banco } from '../banco'
import { log } from '../log'

interface Linha {
  id: number
  nome: string
  data: string | null
  inicio: string | null
  modelo: number
  documento: string
  atualizado_em: string
}

const DATA = /^\d{4}-\d{2}-\d{2}$/
const HORA = /^\d{1,2}:\d{2}$/
const limparData = (d: unknown) => (typeof d === 'string' && DATA.test(d) ? d : null)
const limparHora = (h: unknown) => (typeof h === 'string' && HORA.test(h) ? h : null)
const limparNome = (n: unknown, padrao: string) => (typeof n === 'string' && n.trim() ? n.trim().slice(0, 120) : padrao)

function lerDocumento(texto: string, id: number): DocumentoLiturgia {
  try {
    return EsquemaDocumentoLiturgia.parse(JSON.parse(texto))
  } catch (e) {
    log.erro(`Liturgia ${id}: documento inválido no banco; abrindo vazia.`, e)
    return { secoes: [] }
  }
}

export class RepositorioLiturgias {
  constructor(private readonly db: Banco) {}

  /** No primeiro uso cria o modelo "Culto de sábado" com as seções de sempre. */
  garantirModeloPadrao(): void {
    const n = (this.db.prepare('select count(*) as n from liturgias').get() as { n: number }).n
    if (n > 0) return
    this.criar({ nome: 'Culto de sábado', data: null, inicio: '09:00', modelo: true, secoes: SECOES_PADRAO.map((s) => secaoNova(s)) })
  }

  listar(): ResumoLiturgia[] {
    const linhas = this.db
      .prepare('select * from liturgias order by modelo desc, case when modelo = 1 then nome end, data desc, atualizado_em desc')
      .all() as unknown as Linha[]
    return linhas.map((l) => {
      const d = lerDocumento(l.documento, l.id)
      return {
        id: l.id,
        nome: l.nome,
        data: l.data,
        inicio: l.inicio,
        modelo: l.modelo === 1,
        secoes: d.secoes.length,
        itens: d.secoes.reduce((t, s) => t + s.itens.length, 0),
        atualizadoEm: l.atualizado_em,
      }
    })
  }

  obter(id: number): Liturgia | null {
    const l = this.db.prepare('select * from liturgias where id = ?').get(id) as unknown as Linha | undefined
    if (!l) return null
    return { id: l.id, nome: l.nome, data: l.data, inicio: l.inicio, modelo: l.modelo === 1, atualizadoEm: l.atualizado_em, ...lerDocumento(l.documento, l.id) }
  }

  criar(d: { nome: string; data: string | null; inicio: string | null; modelo: boolean; secoes?: unknown }): number {
    const secoes = z.array(EsquemaSecaoLiturgia).parse(d.secoes ?? [])
    const agora = new Date().toISOString()
    const r = this.db
      .prepare('insert into liturgias (nome, data, inicio, modelo, documento, criado_em, atualizado_em) values (?, ?, ?, ?, ?, ?, ?)')
      .run(
        limparNome(d.nome, d.modelo ? 'Modelo' : 'Culto'),
        d.modelo ? null : limparData(d.data),
        limparHora(d.inicio),
        d.modelo ? 1 : 0,
        JSON.stringify({ secoes } satisfies DocumentoLiturgia),
        agora,
        agora,
      )
    return Number(r.lastInsertRowid)
  }

  /**
   * Novo culto (ou modelo) com as seções e itens de outro, com ids novos. Sem `origemId`, começa com
   * as seções padrão vazias.
   */
  copiar(origemId: number | null, d: { nome?: string; data?: string | null; inicio?: string | null; modelo: boolean }): number {
    const o = origemId === null ? null : this.obter(origemId)
    if (origemId !== null && !o) throw new Error('Liturgia de origem não encontrada.')
    return this.criar({
      nome: d.nome ?? o?.nome ?? 'Culto',
      data: d.data ?? null,
      inicio: d.inicio !== undefined ? d.inicio : (o?.inicio ?? null),
      modelo: d.modelo,
      secoes: o ? copiarSecoes(o.secoes) : SECOES_PADRAO.map((s) => secaoNova(s)),
    })
  }

  /** Grava nome, data, horário e o documento inteiro (validado). Devolve a liturgia como ficou. */
  salvar(id: number, a: AlteracaoLiturgia): Liturgia {
    const atual = this.obter(id)
    if (!atual) throw new Error('Liturgia não encontrada (foi excluída?).')
    const doc = EsquemaDocumentoLiturgia.parse({ secoes: a.secoes })
    this.db
      .prepare('update liturgias set nome = ?, data = ?, inicio = ?, documento = ?, atualizado_em = ? where id = ?')
      .run(
        limparNome(a.nome, atual.nome),
        atual.modelo ? null : limparData(a.data),
        limparHora(a.inicio),
        JSON.stringify(doc),
        new Date().toISOString(),
        id,
      )
    return this.obter(id)!
  }

  excluir(id: number): void {
    this.db.prepare('delete from liturgias where id = ?').run(id)
  }
}
