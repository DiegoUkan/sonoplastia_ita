/**
 * Regras puras (sem Electron) para numerar os monitores e decidir onde cada saída abre.
 * Testadas em tests/combinar.test.ts.
 */
import type { ConfigSaida, MonitorRef } from '../../shared/config'
import type { MonitorAtual, SituacaoSaida } from '../../shared/estado'

/** O que interessa de `Electron.Display`. */
export interface MonitorBruto {
  id: number
  label: string
  bounds: { x: number; y: number; width: number; height: number }
  scaleFactor: number
}

/** Numera da esquerda para a direita (e de cima para baixo no empate), a partir de 1. */
export function numerarMonitores(brutos: MonitorBruto[], idPrincipal: number): MonitorAtual[] {
  return [...brutos]
    .sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y)
    .map((d, i) => ({
      id: d.id,
      numero: i + 1,
      rotulo: d.label || '',
      x: d.bounds.x,
      y: d.bounds.y,
      largura: d.bounds.width,
      altura: d.bounds.height,
      larguraPx: Math.round(d.bounds.width * d.scaleFactor),
      alturaPx: Math.round(d.bounds.height * d.scaleFactor),
      escala: d.scaleFactor,
      principal: d.id === idPrincipal,
    }))
}

export function referenciaDe(m: MonitorAtual): MonitorRef {
  return { id: m.id, rotulo: m.rotulo, largura: m.largura, altura: m.altura, x: m.x, y: m.y }
}

/**
 * Acha o monitor salvo entre os ligados agora. O id do Windows pode mudar (outra porta, driver novo),
 * então há alternativas. O monitor principal (o de comando) só é aceito pelo id exato, para uma
 * saída nunca cobrir a tela do operador por engano.
 */
export function acharMonitor(ref: MonitorRef, monitores: MonitorAtual[], ocupados: Set<number>): MonitorAtual | null {
  const livres = monitores.filter((m) => !ocupados.has(m.id))
  const porId = livres.find((m) => m.id === ref.id)
  if (porId) return porId
  const candidatos = livres.filter((m) => !m.principal)
  const mesmoTamanho = (m: MonitorAtual) => m.largura === ref.largura && m.altura === ref.altura
  const mesmaPosicao = (m: MonitorAtual) => m.x === ref.x && m.y === ref.y
  const mesmoRotulo = (m: MonitorAtual) => ref.rotulo !== '' && m.rotulo === ref.rotulo
  return (
    candidatos.find((m) => mesmoTamanho(m) && mesmaPosicao(m)) ??
    candidatos.find((m) => mesmoRotulo(m) && mesmoTamanho(m)) ??
    null
  )
}

export type Destino = { tipo: 'monitor'; monitor: MonitorAtual } | { tipo: 'janela' } | { tipo: 'nenhum' }

export interface PlanoSaida {
  saidaId: string
  destino: Destino
  situacao: SituacaoSaida
  aviso: string | null
}

const descricao = (r: MonitorRef) => `${r.rotulo ? `"${r.rotulo}" ` : ''}(${r.largura}×${r.altura})`

export function planejarSaidas(saidas: ConfigSaida[], monitores: MonitorAtual[]): PlanoSaida[] {
  const ocupados = new Set<number>()
  return saidas.map((s): PlanoSaida => {
    if (!s.ativa) return { saidaId: s.id, destino: { tipo: 'nenhum' }, situacao: 'desligada', aviso: null }
    if (s.modoJanela) return { saidaId: s.id, destino: { tipo: 'janela' }, situacao: 'janela', aviso: null }
    if (!s.monitor) {
      return {
        saidaId: s.id,
        destino: { tipo: 'janela' },
        situacao: 'janela',
        aviso: 'Nenhum monitor escolhido: abrindo como janela de teste.',
      }
    }
    const m = acharMonitor(s.monitor, monitores, ocupados)
    if (!m) {
      const emUso = ocupados.has(s.monitor.id)
      return {
        saidaId: s.id,
        destino: { tipo: 'nenhum' },
        situacao: 'desconectada',
        aviso: emUso
          ? 'Outra saída já está neste monitor. Escolha outro.'
          : `Monitor ${descricao(s.monitor)} não encontrado. A saída volta sozinha quando ele for religado.`,
      }
    }
    // o monitor de comando é do operador: uma saída por cima dele tranca o programa
    if (m.principal) {
      return {
        saidaId: s.id,
        destino: { tipo: 'janela' },
        situacao: 'janela',
        aviso: 'O monitor de comando não pode receber uma saída. Abrindo como janela de teste: escolha um projetor.',
      }
    }
    ocupados.add(m.id)
    return { saidaId: s.id, destino: { tipo: 'monitor', monitor: m }, situacao: 'monitor', aviso: null }
  })
}
