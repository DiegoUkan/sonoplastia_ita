import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { completarPadroesDoPalco, configPadrao, EsquemaConfig, EsquemaSaida } from '../src/shared/config'

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

  it('o esquema gera o JSON Schema com os textos da tela de configurações', () => {
    const js = z.toJSONSchema(EsquemaSaida, { unrepresentable: 'any' }) as { properties: Record<string, Record<string, unknown>> }
    expect(js.properties.corFundo).toMatchObject({ title: 'Cor de fundo', 'x-ui': 'cor' })
    expect(js.properties.ajuste!.enum).toEqual(['ajustar', 'preencher', 'esticar'])
  })
})
