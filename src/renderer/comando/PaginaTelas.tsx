/** Página "Telas": monitores ligados, qual saída vai em qual monitor e as opções de cada saída. */
import { RefreshCw, ScanEye } from 'lucide-react'
import { ATALHO_EMERGENCIA } from '../../shared/atalhos'
import { type Config, type ConfigSaida, EsquemaSaida, type MonitorRef } from '../../shared/config'
import type { EstadoTelas, InfoSaida, MonitorAtual } from '../../shared/estado'
import { api } from '../compartilhado/ganchos'
import { FormularioEsquema } from './FormularioEsquema'
import { SeloSituacao } from './PainelSaidas'
import { Botao, Secao } from './ui'

const referenciaDe = (m: MonitorAtual): MonitorRef => ({ id: m.id, rotulo: m.rotulo, largura: m.largura, altura: m.altura, x: m.x, y: m.y })

export function PaginaTelas({ config, salvar, telas }: { config: Config; salvar: (c: Config) => void; telas: EstadoTelas }) {
  const semMonitor = config.saidas.some((s) => s.ativa && !s.monitor)

  const mudarSaida = (id: string, nova: ConfigSaida) =>
    salvar({ ...config, saidas: config.saidas.map((s) => (s.id === id ? nova : s)) })

  const escolherMonitor = (id: string, m: MonitorAtual | null) => {
    if (m?.principal) return // o monitor de comando nunca recebe saída
    const saidas = config.saidas.map((s) => {
      if (s.id === id) return { ...s, monitor: m ? referenciaDe(m) : null, modoJanela: m ? false : s.modoJanela }
      // o monitor escolhido sai de qualquer outra saída que estivesse nele
      const usaEste = m && (s.monitor?.id === m.id || telas.saidas.find((i) => i.saidaId === s.id)?.monitorId === m.id)
      return usaEste ? { ...s, monitor: null } : s
    })
    salvar({ ...config, saidas })
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      {semMonitor && (
        <div className="rounded-lg border border-destaque/40 bg-destaque/10 px-4 py-3 text-sm text-[#cfe0ff]">
          Escolha o monitor de cada saída. Depois disso, elas abrem sozinhas nos projetores sempre que o programa iniciar, e voltam
          sozinhas se o projetor for desligado e religado. Use <b>Identificar telas</b> para ver qual número é cada projetor.
        </div>
      )}

      <Secao
        titulo="Monitores ligados"
        descricao={
          <>
            Numerados da esquerda para a direita. O monitor de comando (o principal do Windows) nunca recebe saída. Se alguma saída
            atrapalhar a tela, <b>{ATALHO_EMERGENCIA.texto}</b> fecha todas.
          </>
        }
        acoes={
          <>
            <Botao icone={ScanEye} onClick={() => api.identificarTelas()}>
              Identificar telas
            </Botao>
            <Botao icone={RefreshCw} onClick={() => api.reabrirSaidas()} title="Reabre as saídas fechadas">
              Reabrir saídas
            </Botao>
          </>
        }
      >
        <DiagramaMonitores telas={telas} config={config} />
      </Secao>

      {config.saidas.map((s) => {
        const info = telas.saidas.find((i) => i.saidaId === s.id)
        return (
          <Secao
            key={s.id}
            titulo={`Saída ${s.nome}`}
            descricao={info?.aviso ?? undefined}
            acoes={<SeloSituacao info={info} telas={telas} />}
          >
            <div className="flex items-center justify-between gap-6 border-b border-borda pb-3">
              <div>
                <div className="text-sm">Monitor</div>
                <div className="mt-0.5 text-xs text-suave">Onde esta saída abre em tela cheia.</div>
              </div>
              <SeletorMonitor saida={s} info={info} monitores={telas.monitores} aoEscolher={(m) => escolherMonitor(s.id, m)} />
            </div>
            <div className="pt-3">
              <FormularioEsquema esquema={EsquemaSaida} valor={s} aoMudar={(v) => mudarSaida(s.id, v)} omitir={['id', 'monitor']} />
            </div>
          </Secao>
        )
      })}
    </div>
  )
}

function SeletorMonitor({
  saida,
  info,
  monitores,
  aoEscolher,
}: {
  saida: ConfigSaida
  info?: InfoSaida
  monitores: MonitorAtual[]
  aoEscolher: (m: MonitorAtual | null) => void
}) {
  // configuração antiga apontando para o monitor de comando (o motor recusa e abre como janela)
  const noComando = saida.monitor != null && monitores.some((m) => m.principal && m.id === saida.monitor!.id)
  const valor = info?.monitorId != null ? String(info.monitorId) : noComando ? 'comando' : saida.monitor ? 'ausente' : ''
  return (
    <select
      className="h-9 w-80 rounded-md border border-borda bg-[#0f1217] px-2.5 text-sm text-texto outline-none focus:border-destaque"
      value={valor}
      onChange={(e) => {
        // tira o foco: senão as setas do teclado (ou o passador de slides) continuam trocando o monitor
        e.currentTarget.blur()
        const v = e.target.value
        if (v === '') aoEscolher(null)
        else if (v !== 'ausente' && v !== 'comando') aoEscolher(monitores.find((m) => String(m.id) === v) ?? null)
      }}
    >
      <option value="">Nenhum (abre como janela de teste)</option>
      {monitores.map((m) => (
        <option key={m.id} value={m.id} disabled={m.principal}>
          Monitor {m.numero} — {m.larguraPx}×{m.alturaPx}
          {m.rotulo ? ` · ${m.rotulo}` : ''}
          {m.principal ? ' · tela de comando (não pode)' : ''}
        </option>
      ))}
      {noComando && (
        <option value="comando" disabled>
          Tela de comando (não permitido)
        </option>
      )}
      {saida.monitor && !noComando && info?.monitorId == null && (
        <option value="ausente">
          {saida.monitor.rotulo || 'Monitor salvo'} ({saida.monitor.largura}×{saida.monitor.altura}) — desconectado
        </option>
      )}
    </select>
  )
}

function DiagramaMonitores({ telas, config }: { telas: EstadoTelas; config: Config }) {
  const ms = telas.monitores
  if (ms.length === 0) return <p className="text-sm text-suave">Nenhum monitor encontrado.</p>
  const minX = Math.min(...ms.map((m) => m.x))
  const minY = Math.min(...ms.map((m) => m.y))
  const largura = Math.max(...ms.map((m) => m.x + m.largura)) - minX
  const altura = Math.max(...ms.map((m) => m.y + m.altura)) - minY
  const ALTURA_MAX = 160

  return (
    <div className="flex justify-center">
      <div
        className="relative"
        style={{ aspectRatio: `${largura} / ${altura}`, width: `min(100%, ${(ALTURA_MAX * largura) / altura}px)` }}
      >
        {ms.map((m) => {
          const saidas = telas.saidas
            .filter((i) => i.monitorId === m.id)
            .map((i) => config.saidas.find((s) => s.id === i.saidaId)?.nome)
            .filter(Boolean)
          const cor = m.principal ? 'border-suave/60 bg-white/5' : saidas.length ? 'border-destaque bg-destaque/15' : 'border-borda bg-painel-2'
          return (
            <div
              key={m.id}
              className="absolute p-1"
              style={{
                left: `${((m.x - minX) / largura) * 100}%`,
                top: `${((m.y - minY) / altura) * 100}%`,
                width: `${(m.largura / largura) * 100}%`,
                height: `${(m.altura / altura) * 100}%`,
              }}
            >
              <div className={`flex h-full w-full flex-col items-center justify-center rounded-md border-2 text-center ${cor}`}>
                <div className="text-2xl font-bold leading-none">{m.numero}</div>
                <div className="mt-1 text-[11px] text-suave">
                  {m.larguraPx}×{m.alturaPx}
                </div>
                <div className="mt-0.5 text-xs font-semibold">
                  {m.principal ? 'Comando' : saidas.length ? saidas.join(', ') : <span className="text-apagado">sem saída</span>}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
