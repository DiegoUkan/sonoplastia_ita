/** Coluna da direita: miniatura de cada saída e os botões Preto / Limpar / Logo. */
import { Eraser, ImageIcon, Square, Undo2 } from 'lucide-react'
import type { Config, ConfigSaida } from '../../shared/config'
import { type EstadoMotor, type EstadoTelas, type InfoSaida, type ModoTela, type Telemetria, TODAS } from '../../shared/estado'
import { Camadas } from '../compartilhado/Camadas'
import { api } from '../compartilhado/ganchos'
import { Botao, Selo } from './ui'

export function SeloSituacao({ info, telas }: { info?: InfoSaida; telas: EstadoTelas }) {
  if (!info) return <Selo tom="apagado">…</Selo>
  switch (info.situacao) {
    case 'monitor': {
      const m = telas.monitores.find((x) => x.id === info.monitorId)
      return <Selo tom="ok">● Monitor {m?.numero ?? '?'}</Selo>
    }
    case 'janela':
      return <Selo tom="destaque">Janela de teste</Selo>
    case 'desconectada':
      return <Selo tom="aviso">Desconectada</Selo>
    case 'desligada':
      return <Selo tom="apagado">Desligada</Selo>
    case 'fechada':
      return <Selo tom="apagado">Fechada</Selo>
  }
}

/** Proporção da saída: a medida real informada por ela, senão a do monitor, senão 16:9. */
export function proporcao(s: ConfigSaida, info: InfoSaida | undefined, telas: EstadoTelas, t?: Telemetria): { l: number; a: number } {
  if (t && t.largura > 0 && t.altura > 0) return { l: t.largura, a: t.altura }
  const m = telas.monitores.find((x) => x.id === info?.monitorId)
  if (m) return { l: m.larguraPx, a: m.alturaPx }
  return { l: 1920, a: 1080 }
}

function alternarTela(alvo: string, atual: ModoTela, modo: ModoTela) {
  api.comando({ tipo: 'tela', alvo, tela: atual === modo ? 'normal' : modo })
}

export function PainelSaidas({
  estado,
  config,
  telas,
  telemetrias,
}: {
  estado: EstadoMotor
  config: Config
  telas: EstadoTelas
  telemetrias: Record<string, Telemetria>
}) {
  const ids = config.saidas.map((s) => s.id)
  const todasEm = (m: ModoTela) => ids.every((id) => estado.saidas[id]?.tela === m)
  const todas = (m: ModoTela) => api.comando({ tipo: 'tela', alvo: TODAS, tela: todasEm(m) ? 'normal' : m })

  return (
    <aside className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto border-l border-borda bg-painel p-3">
      {config.saidas.map((s) => {
        const e = estado.saidas[s.id]
        const info = telas.saidas.find((i) => i.saidaId === s.id)
        const t = telemetrias[s.id]
        if (!e) return null
        const { l, a } = proporcao(s, info, telas, t)
        return (
          <div key={s.id} className="rounded-lg border border-borda bg-painel-2/60 p-2.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">{s.nome}</span>
              <SeloSituacao info={info} telas={telas} />
            </div>
            <div
              className={`mx-auto overflow-hidden rounded-md ring-1 ${e.tela === 'preto' ? 'ring-perigo' : 'ring-borda'}`}
              style={{ aspectRatio: `${l} / ${a}`, maxHeight: 200, maxWidth: '100%' }}
            >
              <Camadas
                saida={e}
                config={s}
                espera={config.telaEspera}
                transicaoMs={config.geral.transicaoMs}
                resolucao={`${l} × ${a}`}
                miniatura
                telemetriaVideo={t?.video}
              />
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              <Botao tamanho="sm" icone={Square} ativo={e.tela === 'preto'} corAtivo="perigo" onClick={() => alternarTela(s.id, e.tela, 'preto')}>
                Preto
              </Botao>
              <Botao tamanho="sm" icone={Eraser} ativo={e.tela === 'limpar'} corAtivo="aviso" onClick={() => alternarTela(s.id, e.tela, 'limpar')}>
                Limpar
              </Botao>
              <Botao tamanho="sm" icone={ImageIcon} ativo={e.tela === 'logo'} onClick={() => alternarTela(s.id, e.tela, 'logo')}>
                Logo
              </Botao>
            </div>
            {info?.aviso && <p className="mt-2 text-xs text-aviso">{info.aviso}</p>}
          </div>
        )
      })}

      <div className="rounded-lg border border-borda p-2.5">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-suave">Todas as saídas</div>
        <div className="grid grid-cols-2 gap-1.5">
          <Botao tamanho="sm" icone={Square} ativo={todasEm('preto')} corAtivo="perigo" onClick={() => todas('preto')} title="Atalho: B">
            Preto (B)
          </Botao>
          <Botao tamanho="sm" icone={Eraser} ativo={todasEm('limpar')} corAtivo="aviso" onClick={() => todas('limpar')} title="Atalho: Esc">
            Limpar (Esc)
          </Botao>
          <Botao tamanho="sm" icone={ImageIcon} ativo={todasEm('logo')} onClick={() => todas('logo')} title="Atalho: L">
            Logo (L)
          </Botao>
          <Botao tamanho="sm" icone={Undo2} onClick={() => api.comando({ tipo: 'tela', alvo: TODAS, tela: 'normal' })}>
            Mostrar tudo
          </Botao>
        </div>
      </div>
    </aside>
  )
}
