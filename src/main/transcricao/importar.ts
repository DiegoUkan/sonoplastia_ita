/**
 * Copia as chaves e os ajustes do projeto de transcrição em Python (`..\Transcrição_tempo_real`), que já
 * estava configurado neste computador: `data/config.json` (painel) e `.env`. Os valores nunca vão para o
 * log nem para a tela; só o nome do que foi copiado. (Ideia da outra sessão de 2026-11-15, adaptada.)
 */
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ConfigTranscricao } from '../../shared/config'

/** onde o projeto fica no PC da igreja */
export const PASTA_TRANSCRICAO = join(homedir(), 'Documents', 'Projetos', 'Transcrição_tempo_real')

export const ehProjetoTranscricao = (pasta: string) => existsSync(join(pasta, 'data', 'config.json')) || existsSync(join(pasta, '.env'))

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

export interface ResultadoCopia {
  config: ConfigTranscricao
  /** nomes do que foi copiado ("chave do ElevenLabs", "rigor 55%"…) */
  copiado: string[]
  avisos: string[]
}

export function copiarDoProjeto(atual: ConfigTranscricao, pasta: string): ResultadoCopia {
  if (!ehProjetoTranscricao(pasta)) throw new Error(`Não achei o projeto de transcrição em ${pasta}.`)
  const arqConfig = join(pasta, 'data', 'config.json')
  const arqEnv = join(pasta, '.env')
  const env = existsSync(arqEnv) ? lerEnv(readFileSync(arqEnv, 'utf8')) : {}
  let painel: Record<string, unknown> & { ia?: Record<string, unknown> } = {}
  if (existsSync(arqConfig)) {
    try {
      painel = JSON.parse(readFileSync(arqConfig, 'utf8').replace(/^﻿/, ''))
    } catch {
      throw new Error('O data/config.json do projeto de transcrição está ilegível.')
    }
  }
  const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const inteiro = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : null)
  const c: ConfigTranscricao = { escuta: { ...atual.escuta }, ia: { ...atual.ia }, auto: { ...atual.auto } }
  const copiado: string[] = []
  const avisos: string[] = []

  const chave11 = texto(painel.elevenlabs_chave) || texto(env.ELEVENLABS_API_KEY)
  if (chave11) {
    c.escuta.chaveElevenLabs = chave11
    copiado.push('chave do ElevenLabs')
  }
  const ia = painel.ia ?? {}
  const tipo = texto(ia.tipo) === 'openai' ? 'openai' : 'anthropic'
  c.ia.tipo = tipo
  const chaveIa = texto(ia.chave) || (tipo === 'anthropic' ? texto(env.ANTHROPIC_API_KEY) : '')
  if (chaveIa) {
    c.ia.chave = chaveIa
    copiado.push('chave da IA')
  }
  if (typeof ia.url === 'string') {
    c.ia.url = texto(ia.url)
    if (c.ia.url) copiado.push('URL da API')
  }
  if (texto(ia.modelo)) {
    c.ia.modelo = texto(ia.modelo)
    copiado.push(`modelo ${c.ia.modelo}`)
  }
  const rigor = inteiro(painel.rigor, 0, 100)
  if (rigor !== null) {
    c.ia.rigor = rigor
    copiado.push(`rigor ${rigor}%`)
  }
  const intervalo = inteiro(painel.intervalo_s, 3, 120)
  if (intervalo !== null) {
    c.ia.intervaloS = intervalo
    copiado.push(`IA a cada ${intervalo} s`)
  }
  const janela = inteiro(painel.janela_s, 10, 180)
  if (janela !== null) {
    c.ia.janelaS = janela
    copiado.push(`${janela} s de fala`)
  }
  if (painel.ia_ativa === false) avisos.push('Lá a IA estava desligada; aqui ela fica ligada quando há chave e modelo.')
  if (!chave11 && !chaveIa) avisos.push('Não achei nenhuma chave lá.')
  return { config: c, copiado, avisos }
}
