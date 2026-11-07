import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { configPadrao, EsquemaConfig, EsquemaSaida } from '../src/shared/config'

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

  it('o esquema gera o JSON Schema com os textos da tela de configurações', () => {
    const js = z.toJSONSchema(EsquemaSaida, { unrepresentable: 'any' }) as { properties: Record<string, Record<string, unknown>> }
    expect(js.properties.corFundo).toMatchObject({ title: 'Cor de fundo', 'x-ui': 'cor' })
    expect(js.properties.ajuste!.enum).toEqual(['ajustar', 'preencher', 'esticar'])
  })
})
