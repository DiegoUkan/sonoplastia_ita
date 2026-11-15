/**
 * Copia as chaves e o jeito de usar do projeto de transcrição (`..\Transcrição_tempo_real`), que já
 * estava configurado neste computador: `data/config.json` (painel) e `.env`. Os valores nunca vão
 * para o log nem para a tela; só o nome do que foi copiado.
 */
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ConfigTranscricao } from '../../shared/config'

export const PASTA_TRANSCRICAO = join(homedir(), 'Documents', 'Projetos', 'Transcrição_tempo_real')

/** KEY=valor por linha (aspas opcionais; # comenta). */
export function lerEnv(texto: string): Record<string, string> {
  const r: Record<string, string> = {}
  for (const linha of texto.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(linha)
    if (!m || linha.trim().startsWith('#')) continue
    r[m[1]!] = m[2]!.replace(/^(['"])(.*)\1$/, '$2')
  }
  return r
}

export interface ResultadoImportacaoTranscricao {
  /** a configuração com o que veio de lá */
  config: ConfigTranscricao
  /** nomes do que foi copiado ("chave da ElevenLabs", "rigor 50%"…) */
  copiado: string[]
  avisos: string[]
}

export function importarDoProjetoTranscricao(atual: ConfigTranscricao, pasta = PASTA_TRANSCRICAO): ResultadoImportacaoTranscricao {
  const arqConfig = join(pasta, 'data', 'config.json')
  const arqEnv = join(pasta, '.env')
  if (!existsSync(arqConfig) && !existsSync(arqEnv)) throw new Error(`Não achei o projeto de transcrição em ${pasta}.`)
  const env = existsSync(arqEnv) ? lerEnv(readFileSync(arqEnv, 'utf8')) : {}
  let painel: {
    elevenlabs_chave?: unknown
    rigor?: unknown
    intervalo_s?: unknown
    janela_s?: unknown
    ia_ativa?: unknown
    ia?: { tipo?: unknown; url?: unknown; chave?: unknown; modelo?: unknown }
  } = {}
  if (existsSync(arqConfig)) {
    try {
      painel = JSON.parse(readFileSync(arqConfig, 'utf8').replace(/^﻿/, ''))
    } catch {
      throw new Error('O data/config.json do projeto de transcrição está ilegível.')
    }
  }
  const c: ConfigTranscricao = { ...atual }
  const copiado: string[] = []
  const avisos: string[] = []
  const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const inteiro = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : null)

  const chave11 = texto(painel.elevenlabs_chave) || texto(env.ELEVENLABS_API_KEY)
  if (chave11) {
    c.elevenlabsChave = chave11
    copiado.push('chave da ElevenLabs')
  }
  const ia = painel.ia ?? {}
  const tipo = texto(ia.tipo) || 'anthropic'
  if (tipo === 'anthropic') {
    const chaveIa = texto(ia.chave) || texto(env.ANTHROPIC_API_KEY)
    if (chaveIa) {
      c.iaChave = chaveIa
      copiado.push('chave da IA')
    }
    if (typeof ia.url === 'string') {
      c.iaUrl = texto(ia.url)
      if (c.iaUrl) copiado.push('endereço da IA')
    }
    if (texto(ia.modelo)) {
      c.iaModelo = texto(ia.modelo)
      copiado.push(`modelo ${c.iaModelo}`)
    }
  } else {
    avisos.push('A IA de lá é do tipo "compatível com OpenAI", que este programa não usa: a chave da IA não foi copiada.')
  }
  if (typeof painel.ia_ativa === 'boolean') c.iaAtiva = painel.ia_ativa
  const rigor = inteiro(painel.rigor, 0, 100)
  if (rigor !== null) {
    c.rigor = rigor
    copiado.push(`rigor ${rigor}%`)
  }
  const intervalo = inteiro(painel.intervalo_s, 3, 60)
  if (intervalo !== null) c.intervaloS = intervalo
  const janela = inteiro(painel.janela_s, 10, 120)
  if (janela !== null) c.janelaS = janela
  if (!copiado.length) avisos.push('Não achei nenhuma chave lá.')
  return { config: c, copiado, avisos }
}
