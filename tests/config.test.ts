import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { completarPadroesDoPalco, configPadrao, EsquemaConfig, EsquemaSaida, migrarConfig, VERSAO_CONFIG } from '../src/shared/config'

describe('configurações', () => {
  it('o padrão tem as saídas Público e Palco, sem monitor', () => {
    const c = configPadrao()
    expect(c.saidas.map((s) => [s.id, s.nome, s.monitor, s.ativa])).toEqual([
      ['publico', 'Público', null, true],
      ['palco', 'Palco', null, true],
    ])
    expect(c.geral.confirmarAoFechar).toBe(true)
  })

  it('preenche o que faltar num arquivo antigo', () => {
    const c = EsquemaConfig.parse({ saidas: [{ id: 'publico', nome: 'Público' }] })
    expect(c.geral.transicaoMs).toBe(300)
    expect(c.telaEspera.texto).toBe('IASD Itaqui')
    expect(c.saidas[0]!.ajuste).toBe('ajustar')
  })

  it('recusa valores fora do limite e ids repetidos', () => {
    expect(() => EsquemaConfig.parse({ geral: { transicaoMs: -1 } })).toThrow()
    expect(() => EsquemaConfig.parse({ saidas: [{ id: 'a', nome: 'A' }, { id: 'a', nome: 'B' }] })).toThrow()
  })

  it('aviso de último slide só no Palco (também numa configuração antiga); fundo pouco escurecido', () => {
    const c = configPadrao()
    expect(c.saidas.map((s) => [s.id, s.slideAvisarFim, s.fundoEscurecer])).toEqual([
      ['publico', false, 10],
      ['palco', true, 10],
    ])
    const antiga = { saidas: [{ id: 'publico', nome: 'Público' }, { id: 'palco', nome: 'Palco', slideMostrarProximo: true }] }
    const lida = EsquemaConfig.parse(completarPadroesDoPalco(antiga))
    expect(lida.saidas.map((s) => s.slideAvisarFim)).toEqual([false, true])
    expect(() => EsquemaSaida.parse({ id: 'x', nome: 'X', fundoEscurecer: 90 })).toThrow()
  })

  it('pedidos de 21/11: vídeo também no Palco (com o tempo que falta), referência maior, fim do vídeo e lembrete da mesa', () => {
    const c = configPadrao()
    expect(c.versao).toBe(VERSAO_CONFIG)
    expect(c.saidas.map((s) => [s.id, s.mostrarVideo, s.videoMostrarTempo, s.referenciaTamanho])).toEqual([
      ['publico', true, false, 7],
      ['palco', true, true, 7],
    ])
    expect(c.videos).toEqual({ aoTerminar: 'sair', limparPausa: true, converterPesados: true, lembreteCanal: true, lembreteIntervaloMin: 0 })
  })

  it('migração 1 → 2: o Palco antigo sem vídeo passa a tocar o vídeo, uma vez só', () => {
    const antiga = { versao: 1, saidas: [{ id: 'publico', nome: 'Público', mostrarVideo: true }, { id: 'palco', nome: 'Palco', mostrarVideo: false }] }
    const lida = EsquemaConfig.parse(completarPadroesDoPalco(migrarConfig(antiga)))
    expect(lida.versao).toBe(2)
    expect(lida.saidas.map((s) => [s.mostrarVideo, s.videoMostrarTempo])).toEqual([
      [true, false],
      [true, true],
    ])
    // sem a versão (arquivo bem antigo) conta como 1
    expect(EsquemaConfig.parse(migrarConfig({ saidas: [{ id: 'palco', nome: 'Palco', mostrarVideo: false }] })).saidas[0]!.mostrarVideo).toBe(true)
    // já na versão 2: o que o operador escolheu fica
    const nova = { versao: 2, saidas: [{ id: 'palco', nome: 'Palco', mostrarVideo: false }] }
    expect(EsquemaConfig.parse(migrarConfig(nova)).saidas[0]!.mostrarVideo).toBe(false)
  })

  it('o esquema gera o JSON Schema com os textos da tela de configurações', () => {
    const js = z.toJSONSchema(EsquemaSaida, { unrepresentable: 'any' }) as { properties: Record<string, Record<string, unknown>> }
    expect(js.properties.corFundo).toMatchObject({ title: 'Cor de fundo', 'x-ui': 'cor' })
    expect(js.properties.ajuste!.enum).toEqual(['ajustar', 'preencher', 'esticar'])
  })
})
