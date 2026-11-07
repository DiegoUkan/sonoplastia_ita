import {
  BookOpen,
  FlaskConical,
  FolderOpen,
  ListOrdered,
  type LucideIcon,
  Monitor,
  Music,
  Presentation,
  Settings,
  Wrench,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { ATALHO_EMERGENCIA } from '../../shared/atalhos'
import type { Config } from '../../shared/config'
import { type EstadoMotor, type EstadoTelas, type ModoTela, TODAS } from '../../shared/estado'
import { api, useAgora, useConfig, useEstado, useTelas, useTelemetrias } from '../compartilhado/ganchos'
import { PainelSaidas } from './PainelSaidas'
import { PaginaConfiguracoes } from './PaginaConfiguracoes'
import { PaginaTelas } from './PaginaTelas'
import { PaginaTeste } from './PaginaTeste'

type Pagina = 'teste' | 'telas' | 'configuracoes'

const PAGINAS: Array<{ id: Pagina; rotulo: string; icone: LucideIcon }> = [
  { id: 'teste', rotulo: 'Teste', icone: FlaskConical },
  { id: 'telas', rotulo: 'Telas', icone: Monitor },
  { id: 'configuracoes', rotulo: 'Configurações', icone: Settings },
]

const FUTURAS: Array<{ rotulo: string; icone: LucideIcon; fase: number }> = [
  { rotulo: 'Liturgia', icone: ListOrdered, fase: 5 },
  { rotulo: 'Músicas', icone: Music, fase: 2 },
  { rotulo: 'Bíblia', icone: BookOpen, fase: 3 },
  { rotulo: 'Mídias', icone: FolderOpen, fase: 1 },
  { rotulo: 'Apresentações', icone: Presentation, fase: 4 },
  { rotulo: 'Ferramentas', icone: Wrench, fase: 6 },
]

/** Atalhos: B = preto, Esc = limpar, L = logo (em todas as saídas). Ignorados enquanto se digita. */
function useAtalhos(estado: EstadoMotor | null, config: Config | null) {
  useEffect(() => {
    if (!estado || !config) return
    const ids = config.saidas.map((s) => s.id)
    const alternar = (m: ModoTela) => {
      const todas = ids.every((id) => estado.saidas[id]?.tela === m)
      api.comando({ tipo: 'tela', alvo: TODAS, tela: todas ? 'normal' : m })
    }
    const aoTeclar = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement
      if (alvo.closest('input, textarea, select, [contenteditable="true"]') || e.ctrlKey || e.altKey || e.metaKey) return
      const k = e.key.toLowerCase()
      if (k === 'b') alternar('preto')
      else if (k === 'escape') alternar('limpar')
      else if (k === 'l') alternar('logo')
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [estado, config])
}

export function App() {
  const estado = useEstado()
  const [config, salvar] = useConfig()
  const telas = useTelas()
  const telemetrias = useTelemetrias()
  const [pagina, setPagina] = useState<Pagina | null>(null)
  useAtalhos(estado, config)

  useEffect(() => {
    if (config && pagina === null) setPagina(config.saidas.some((s) => s.ativa && !s.monitor) ? 'telas' : 'teste')
  }, [config, pagina])

  if (!estado || !config || !telas || !pagina) {
    return <div className="flex h-full items-center justify-center text-suave">Carregando…</div>
  }

  return (
    <div className="grid h-full grid-cols-[208px_minmax(0,1fr)_360px] grid-rows-[minmax(0,1fr)_30px]">
      <nav className="flex flex-col gap-1 border-r border-borda bg-painel p-3">
        <div className="mb-4 px-2 pt-1">
          <div className="text-[15px] font-bold tracking-tight">Sonoplastia</div>
          <div className="text-xs text-suave">IASD Itaqui</div>
        </div>
        {PAGINAS.map((p) => (
          <ItemNavegacao key={p.id} icone={p.icone} rotulo={p.rotulo} ativo={pagina === p.id} aoClicar={() => setPagina(p.id)} />
        ))}
        <div className="mb-1 mt-5 px-2 text-[11px] font-semibold uppercase tracking-wide text-apagado">Em breve</div>
        {FUTURAS.map((f) => (
          <ItemNavegacao key={f.rotulo} icone={f.icone} rotulo={f.rotulo} dica={`Fase ${f.fase}`} desativado />
        ))}
      </nav>

      <main className="min-h-0 overflow-y-auto">
        {pagina === 'teste' && <PaginaTeste config={config} estado={estado} telemetrias={telemetrias} />}
        {pagina === 'telas' && <PaginaTelas config={config} salvar={salvar} telas={telas} />}
        {pagina === 'configuracoes' && <PaginaConfiguracoes config={config} salvar={salvar} />}
      </main>

      <PainelSaidas estado={estado} config={config} telas={telas} telemetrias={telemetrias} />

      <BarraStatus config={config} telas={telas} />
    </div>
  )
}

function ItemNavegacao({
  icone: Icone,
  rotulo,
  ativo,
  desativado,
  dica,
  aoClicar,
}: {
  icone: LucideIcon
  rotulo: string
  ativo?: boolean
  desativado?: boolean
  dica?: string
  aoClicar?: () => void
}) {
  return (
    <button
      type="button"
      disabled={desativado}
      onClick={aoClicar}
      className={`flex h-9 items-center gap-2.5 rounded-md px-2.5 text-left text-sm transition-colors ${
        ativo
          ? 'bg-destaque/15 font-semibold text-white'
          : desativado
            ? 'cursor-default text-apagado'
            : 'cursor-pointer text-suave hover:bg-painel-2 hover:text-texto'
      }`}
    >
      <Icone className="size-4" />
      <span className="flex-1">{rotulo}</span>
      {dica && <span className="text-[10px] text-apagado">{dica}</span>}
    </button>
  )
}

function BarraStatus({ config, telas }: { config: Config; telas: EstadoTelas }) {
  const agora = useAgora()
  return (
    <footer className="col-span-3 flex items-center gap-5 border-t border-borda bg-painel px-4 text-xs text-suave">
      <span>Sonoplastia 0.1 · Fase 0</span>
      {config.saidas.map((s) => {
        const i = telas.saidas.find((x) => x.saidaId === s.id)
        const cor = i?.situacao === 'monitor' ? 'bg-ok' : i?.situacao === 'janela' ? 'bg-destaque' : i?.situacao === 'desconectada' ? 'bg-aviso' : 'bg-apagado'
        return (
          <span key={s.id} className="flex items-center gap-1.5">
            <span className={`size-2 rounded-full ${cor}`} />
            {s.nome}
          </span>
        )
      })}
      <span className="ml-auto">
        Emergência: <b className="text-texto">{ATALHO_EMERGENCIA.texto}</b> fecha as saídas
      </span>
      <span className="tabular-nums text-texto">{agora.toLocaleTimeString('pt-BR')}</span>
    </footer>
  )
}
