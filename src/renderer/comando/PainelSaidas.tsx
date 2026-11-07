/**
 * Coluna da direita: miniatura ao vivo de cada saída (aceita arrastar mídias, músicas e arquivos),
 * Preto / Limpar / Logo e o player logo abaixo. Recolhida, vira só o player na vertical.
 */
import { Eraser, ImageIcon, PanelRightClose, PanelRightOpen, Square } from 'lucide-react'
import { useState } from 'react'
import type { Config, ConfigSaida } from '../../shared/config'
import { type EstadoMotor, type EstadoTelas, type InfoSaida, type ModoTela, type Telemetria, TODAS } from '../../shared/estado'
import { Camadas } from '../compartilhado/Camadas'
import { api } from '../compartilhado/ganchos'
import { mensagemDeErro, soltarEm } from './acoes'
import { aceitaArraste } from './arrastar'
import { MiniaturaAoVivo } from './MiniaturaAoVivo'
import { type FontePlayer, PlayerHorizontal, PlayerVertical } from './Player'
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
export function proporcao(info: InfoSaida | undefined, telas: EstadoTelas, t?: Telemetria): { l: number; a: number } {
  if (t && t.largura > 0 && t.altura > 0) return { l: t.largura, a: t.altura }
  const m = telas.monitores.find((x) => x.id === info?.monitorId)
  if (m) return { l: m.larguraPx, a: m.alturaPx }
  return { l: 1920, a: 1080 }
}

interface Props {
  estado: EstadoMotor
  config: Config
  telas: EstadoTelas
  telemetrias: Record<string, Telemetria>
  fontes: FontePlayer[]
  fonte: FontePlayer | null
  aoSelecionarFonte: (id: string) => void
  recolhido: boolean
  aoRecolher: (v: boolean) => void
}

export function PainelSaidas(p: Props) {
  if (p.recolhido) {
    return (
      <aside className="flex h-full min-h-0 flex-col items-center gap-2 border-l border-borda bg-painel px-1.5 py-2">
        <Botao tamanho="sm" variante="fantasma" icone={PanelRightOpen} onClick={() => p.aoRecolher(false)} title="Mostrar as miniaturas" className="w-14" />
        <PlayerVertical fontes={p.fontes} selecionada={p.fonte} aoSelecionar={p.aoSelecionarFonte} />
      </aside>
    )
  }

  const ids = p.config.saidas.map((s) => s.id)
  const todasEm = (m: ModoTela) => ids.every((id) => p.estado.saidas[id]?.tela === m)
  const todas = (m: ModoTela) => api.comando({ tipo: 'tela', alvo: TODAS, tela: todasEm(m) ? 'normal' : m })

  return (
    <aside className="flex h-full min-h-0 flex-col gap-2 overflow-hidden border-l border-borda bg-fundo p-2">
      <div className="flex items-center gap-1">
        <span className="mr-auto pl-1 text-xs font-semibold uppercase tracking-wide text-suave">Todas</span>
        <Botao tamanho="xs" icone={Square} ativo={todasEm('preto')} corAtivo="perigo" onClick={() => todas('preto')} title="Preto em todas (B)">
          Preto
        </Botao>
        <Botao tamanho="xs" icone={Eraser} ativo={todasEm('limpar')} corAtivo="aviso" onClick={() => todas('limpar')} title="Limpar todas (Esc)">
          Limpar
        </Botao>
        <Botao tamanho="xs" icone={ImageIcon} ativo={todasEm('logo')} onClick={() => todas('logo')} title="Logo em todas (L)">
          Logo
        </Botao>
        <Botao tamanho="xs" variante="fantasma" icone={PanelRightClose} onClick={() => p.aoRecolher(true)} title="Recolher (fica só o player)" />
      </div>
      {p.config.saidas.map((s) => (
        <CartaoSaida key={s.id} saida={s} {...p} />
      ))}
      {/* o player fica sempre visível: as miniaturas é que encolhem para caber */}
      <div className="shrink-0">
        <PlayerHorizontal fontes={p.fontes} selecionada={p.fonte} aoSelecionar={p.aoSelecionarFonte} />
      </div>
    </aside>
  )
}

function CartaoSaida({ saida: s, estado, config, telas, telemetrias }: Props & { saida: ConfigSaida }) {
  const [sobre, setSobre] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const e = estado.saidas[s.id]
  const info = telas.saidas.find((i) => i.saidaId === s.id)
  const t = telemetrias[s.id]
  if (!e) return null
  const { l, a } = proporcao(info, telas, t)
  const alternar = (m: ModoTela) => api.comando({ tipo: 'tela', alvo: s.id, tela: e.tela === m ? 'normal' : m })

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-borda bg-painel p-2" style={{ maxHeight: 280 }}>
      <div className="mb-1.5 flex shrink-0 items-center gap-1">
        <span className="mr-1 text-sm font-semibold">{s.nome}</span>
        <SeloSituacao info={info} telas={telas} />
        <div className="ml-auto flex gap-1">
          <Botao tamanho="xs" ativo={e.tela === 'preto'} corAtivo="perigo" onClick={() => alternar('preto')} title={`Preto no ${s.nome}`}>
            Preto
          </Botao>
          <Botao tamanho="xs" ativo={e.tela === 'limpar'} corAtivo="aviso" onClick={() => alternar('limpar')} title={`Limpar o ${s.nome}`}>
            Limpar
          </Botao>
          <Botao tamanho="xs" ativo={e.tela === 'logo'} onClick={() => alternar('logo')} title={`Logo no ${s.nome}`}>
            Logo
          </Botao>
        </div>
      </div>
      {/* a miniatura ocupa o espaço que sobrar, sempre na proporção da saída */}
      <div className="min-h-16 flex-1" style={{ containerType: 'size' }}>
      <div
        className={`relative mx-auto overflow-hidden rounded-md ring-2 transition-shadow ${sobre ? 'ring-destaque' : e.tela === 'preto' ? 'ring-perigo' : 'ring-transparent'}`}
        style={{ width: `min(100cqw, calc(100cqh * ${l / a}))`, height: `min(100cqh, calc(100cqw * ${a / l}))` }}
        onDragOver={(ev) => {
          if (!aceitaArraste(ev)) return
          ev.preventDefault()
          ev.dataTransfer.dropEffect = 'copy'
          setSobre(true)
        }}
        onDragLeave={() => setSobre(false)}
        onDrop={(ev) => {
          ev.preventDefault()
          setSobre(false)
          setErro(null)
          soltarEm(ev, s.id)
            .then((msg) => msg && setErro(msg))
            .catch((err) => setErro(mensagemDeErro(err)))
        }}
        title="Arraste um vídeo, imagem ou música até aqui para mostrar nesta saída"
      >
        <MiniaturaAoVivo
          saidaId={s.id}
          janelaId={info?.janelaId ?? null}
          quadros={config.geral.quadrosMiniatura}
          ligada={config.geral.miniaturasAoVivo}
          reserva={
            <Camadas
              saida={e}
              config={s}
              espera={config.telaEspera}
              transicaoMs={config.geral.transicaoMs}
              resolucao={`${l} × ${a}`}
              miniatura
              telemetriaVideo={t?.video}
            />
          }
        />
        {sobre && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-destaque/30 text-sm font-semibold text-white">
            Soltar para mostrar no {s.nome}
          </div>
        )}
      </div>
      </div>
      {(erro || info?.aviso) && (
        <p className="mt-1 shrink-0 truncate text-[11px] text-aviso-texto" title={erro ?? info?.aviso ?? undefined}>
          {erro ?? info?.aviso}
        </p>
      )}
    </div>
  )
}
