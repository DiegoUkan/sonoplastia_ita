import { describe, expect, it } from 'vitest'
import { EsquemaSaida, type MonitorRef } from '../src/shared/config'
import { acharMonitor, type MonitorBruto, numerarMonitores, planejarSaidas, referenciaDe } from '../src/main/telas/combinar'

// layout real do PC da igreja (2026-11-07)
const BRUTOS: MonitorBruto[] = [
  { id: 30, label: 'Projetor B', bounds: { x: 1366, y: 0, width: 1024, height: 606 }, scaleFactor: 1 },
  { id: 10, label: 'Projetor A', bounds: { x: -1024, y: 0, width: 1024, height: 768 }, scaleFactor: 1 },
  { id: 40, label: 'Monitor', bounds: { x: 0, y: 0, width: 1366, height: 768 }, scaleFactor: 1 },
]
const monitores = numerarMonitores(BRUTOS, 40)
const saida = (id: string, extra: Record<string, unknown> = {}) => EsquemaSaida.parse({ id, nome: id, ...extra })

describe('numerarMonitores', () => {
  it('numera da esquerda para a direita e marca o principal', () => {
    expect(monitores.map((m) => [m.numero, m.id, m.principal])).toEqual([
      [1, 10, false],
      [2, 40, true],
      [3, 30, false],
    ])
  })

  it('calcula a resolução real com a escala', () => {
    const [m] = numerarMonitores([{ id: 1, label: '', bounds: { x: 0, y: 0, width: 1280, height: 720 }, scaleFactor: 1.5 }], 1)
    expect([m!.larguraPx, m!.alturaPx]).toEqual([1920, 1080])
  })
})

describe('acharMonitor', () => {
  const ref: MonitorRef = referenciaDe(monitores[0]!)

  it('acha pelo id', () => {
    expect(acharMonitor(ref, monitores, new Set())?.id).toBe(10)
  })

  it('acha pelo tamanho e posição quando o id mudou', () => {
    expect(acharMonitor({ ...ref, id: 999 }, monitores, new Set())?.id).toBe(10)
  })

  it('acha pelo nome e tamanho quando mudou de posição', () => {
    expect(acharMonitor({ ...ref, id: 999, x: 5000 }, monitores, new Set())?.id).toBe(10)
  })

  it('nunca cai no monitor principal por semelhança', () => {
    const principal = referenciaDe(monitores[1]!)
    expect(acharMonitor({ ...principal, id: 999 }, monitores, new Set())).toBeNull()
  })

  it('devolve null quando o monitor não está ligado', () => {
    expect(acharMonitor({ id: 7, rotulo: 'Outro', largura: 800, altura: 600, x: 9999, y: 0 }, monitores, new Set())).toBeNull()
  })

  it('não usa monitor já ocupado', () => {
    expect(acharMonitor(ref, monitores, new Set([10]))).toBeNull()
  })
})

describe('planejarSaidas', () => {
  it('saída desligada não abre', () => {
    const [p] = planejarSaidas([saida('publico', { ativa: false })], monitores)
    expect(p!.situacao).toBe('desligada')
    expect(p!.destino.tipo).toBe('nenhum')
  })

  it('sem monitor escolhido vira janela de teste', () => {
    const [p] = planejarSaidas([saida('publico')], monitores)
    expect(p!.destino.tipo).toBe('janela')
    expect(p!.aviso).toMatch(/janela de teste/)
  })

  it('modo janela ganha do monitor escolhido', () => {
    const [p] = planejarSaidas([saida('publico', { monitor: referenciaDe(monitores[0]!), modoJanela: true })], monitores)
    expect(p!.destino.tipo).toBe('janela')
  })

  it('cada saída no seu monitor', () => {
    const planos = planejarSaidas(
      [saida('publico', { monitor: referenciaDe(monitores[0]!) }), saida('palco', { monitor: referenciaDe(monitores[2]!) })],
      monitores,
    )
    expect(planos.map((p) => (p.destino.tipo === 'monitor' ? p.destino.monitor.id : null))).toEqual([10, 30])
    expect(planos.every((p) => p.aviso === null)).toBe(true)
  })

  it('monitor desligado: a saída fica fechada esperando ele voltar', () => {
    const [p] = planejarSaidas([saida('publico', { monitor: referenciaDe(monitores[0]!) })], monitores.slice(1))
    expect(p!.situacao).toBe('desconectada')
    expect(p!.destino.tipo).toBe('nenhum')
  })

  it('duas saídas no mesmo monitor: a segunda avisa', () => {
    const ref = referenciaDe(monitores[0]!)
    const planos = planejarSaidas([saida('publico', { monitor: ref }), saida('palco', { monitor: ref })], monitores)
    expect(planos[0]!.situacao).toBe('monitor')
    expect(planos[1]!.situacao).toBe('desconectada')
    expect(planos[1]!.aviso).toMatch(/Outra saída/)
  })

  it('nunca abre uma saída por cima do monitor de comando (vira janela de teste)', () => {
    // caso real de 2026-11-07: Público salvo no monitor 2 cobriu a tela do operador
    const planos = planejarSaidas(
      [saida('publico', { monitor: referenciaDe(monitores[1]!) }), saida('palco', { monitor: referenciaDe(monitores[0]!) })],
      monitores,
    )
    expect(planos[0]!.destino.tipo).toBe('janela')
    expect(planos[0]!.aviso).toMatch(/monitor de comando/)
    expect(planos[1]!.destino.tipo).toBe('monitor')
  })
})
