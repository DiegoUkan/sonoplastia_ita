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
import { useCallback, useEffect, useRef, useState } from 'react'
import { ATALHO_EMERGENCIA } from '../../shared/atalhos'
import type { Config } from '../../shared/config'
import type { Progresso } from '../../shared/dados'
import { type EstadoMotor, type EstadoTelas, type ModoTela, TODAS } from '../../shared/estado'
import { api, useAgora, useConfig, useEstado, useTelas, useTelemetrias } from '../compartilhado/ganchos'
import { PainelSaidas } from './PainelSaidas'
import { PaginaBiblia } from './PaginaBiblia'
import { PaginaConfiguracoes } from './PaginaConfiguracoes'
import { PaginaMidias } from './PaginaMidias'
import { PaginaMusicas } from './PaginaMusicas'
import { PaginaTelas } from './PaginaTelas'
import { PaginaTeste } from './PaginaTeste'
import { fontesDoPlayer } from './Player'
import { Segmentado } from './ui'

type Pagina = 'midias' | 'musicas' | 'biblia' | 'teste' | 'telas' | 'configuracoes'

const CONTEUDO: Array<{ id: Pagina; rotulo: string; icone: LucideIcon }> = [
  { id: 'musicas', rotulo: 'Músicas', icone: Music },
  { id: 'biblia', rotulo: 'Bíblia', icone: BookOpen },
  { id: 'midias', rotulo: 'Mídias', icone: FolderOpen },
]
const SISTEMA: Array<{ id: Pagina; rotulo: string; icone: LucideIcon }> = [
  { id: 'teste', rotulo: 'Teste', icone: FlaskConical },
  { id: 'telas', rotulo: 'Telas', icone: Monitor },
  { id: 'configuracoes', rotulo: 'Configurações', icone: Settings },
]
const FUTURAS: Array<{ rotulo: string; icone: LucideIcon; fase: number }> = [
  { rotulo: 'Liturgia', icone: ListOrdered, fase: 5 },
  { rotulo: 'Apresentações', icone: Presentation, fase: 4 },
  { rotulo: 'Ferramentas', icone: Wrench, fase: 6 },
]
const TITULOS: Record<Pagina, string> = {
  midias: 'Mídias',
  musicas: 'Músicas',
  biblia: 'Bíblia',
  teste: 'Teste dos projetores',
  telas: 'Telas',
  configuracoes: 'Configurações',
}

/** Tecla tratada pela página aberta; devolve true se usou a tecla. */
export type TeclaPagina = (e: KeyboardEvent) => boolean

const digitando = (e: KeyboardEvent) => !!(e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]')

/** Atalhos: a página aberta primeiro; depois B = preto, Esc = limpar, L = logo (em todas). */
function useAtalhos(estado: EstadoMotor | null, config: Config | null, teclasPagina: React.RefObject<TeclaPagina | null>) {
  useEffect(() => {
    if (!estado || !config) return
    const ids = config.saidas.map((s) => s.id)
    const alternar = (m: ModoTela) => {
      const todas = ids.every((id) => estado.saidas[id]?.tela === m)
      api.comando({ tipo: 'tela', alvo: TODAS, tela: todas ? 'normal' : m })
    }
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return
      if (teclasPagina.current?.(e)) {
        e.preventDefault()
        return
      }
      if (digitando(e)) return
      const k = e.key.toLowerCase()
      if (k === 'b') alternar('preto')
      else if (k === 'escape') alternar('limpar')
      else if (k === 'l') alternar('logo')
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [estado, config, teclasPagina])
}

export function App() {
  const estado = useEstado()
  const [config, salvar] = useConfig()
  const telas = useTelas()
  const telemetrias = useTelemetrias()
  const [pagina, setPagina] = useState<Pagina | null>(null)
  const [alvo, setAlvo] = useState<string>(TODAS)
  const [fonteId, setFonteId] = useState<string | null>(null)
  const [progresso, setProgresso] = useState<Progresso | null>(null)
  const teclasPagina = useRef<TeclaPagina | null>(null)
  const registrarTeclas = useCallback((f: TeclaPagina | null) => {
    teclasPagina.current = f
  }, [])
  useAtalhos(estado, config, teclasPagina)

  const tema = config?.geral.tema ?? 'claro'
  useEffect(() => {
    document.documentElement.dataset.tema = tema
  }, [tema])

  useEffect(() => {
    if (config && pagina === null) setPagina(config.saidas.some((s) => s.ativa && !s.monitor) ? 'telas' : 'musicas')
  }, [config, pagina])

  useEffect(
    () =>
      api.aoProgresso((p) => {
        setProgresso(p.fim ? null : p)
      }),
    [],
  )

  // o player pula sozinho para a mídia que acabou de começar
  const fontes = estado && config ? fontesDoPlayer(estado, config, telemetrias) : []
  const idsFontes = fontes.map((f) => f.id).join('|')
  const idsAnteriores = useRef<string[]>([])
  useEffect(() => {
    const ids = idsFontes ? idsFontes.split('|') : []
    const nova = ids.find((id) => !idsAnteriores.current.includes(id))
    idsAnteriores.current = ids
    if (nova) setFonteId(nova)
  }, [idsFontes])

  if (!estado || !config || !telas || !pagina) {
    return <div className="flex h-full items-center justify-center text-suave">Carregando…</div>
  }

  const fonte = fontes.find((f) => f.id === fonteId) ?? fontes[0] ?? null
  const recolhido = config.interface.painelRecolhido
  const comAlvo = pagina === 'midias' || pagina === 'musicas' || pagina === 'biblia' || pagina === 'teste'

  return (
    <div
      className="grid h-full grid-rows-[minmax(0,1fr)_28px]"
      style={{ gridTemplateColumns: `200px minmax(0,1fr) ${recolhido ? '80px' : '344px'}` }}
    >
      <nav className="flex flex-col gap-0.5 border-r border-borda bg-painel p-3">
        <div className="mb-4 px-2 pt-1">
          <div className="text-[15px] font-bold tracking-tight">Sonoplastia</div>
          <div className="text-xs text-suave">IASD Itaqui</div>
        </div>
        {CONTEUDO.map((p) => (
          <ItemNavegacao key={p.id} id={p.id} icone={p.icone} rotulo={p.rotulo} ativo={pagina === p.id} aoClicar={() => setPagina(p.id)} />
        ))}
        <div className="mb-1 mt-4 px-2 text-[11px] font-semibold uppercase tracking-wide text-apagado">Em breve</div>
        {FUTURAS.map((f) => (
          <ItemNavegacao key={f.rotulo} icone={f.icone} rotulo={f.rotulo} dica={`Fase ${f.fase}`} desativado />
        ))}
        <div className="mt-auto flex flex-col gap-0.5 border-t border-borda pt-2">
          {SISTEMA.map((p) => (
            <ItemNavegacao key={p.id} id={p.id} icone={p.icone} rotulo={p.rotulo} ativo={pagina === p.id} aoClicar={() => setPagina(p.id)} />
          ))}
        </div>
      </nav>

      <main className="flex min-h-0 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-4 border-b border-borda bg-painel px-5">
          <h1 className="text-[15px] font-semibold">{TITULOS[pagina]}</h1>
          {comAlvo && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-suave">Enviar para</span>
              <Segmentado
                valor={alvo}
                aoMudar={setAlvo}
                opcoes={[...config.saidas.filter((s) => s.ativa).map((s) => ({ valor: s.id, rotulo: s.nome })), { valor: TODAS, rotulo: 'Todas' }]}
              />
            </div>
          )}
        </header>
        <div className="min-h-0 flex-1">
          {pagina === 'midias' && <PaginaMidias alvo={alvo} />}
          {pagina === 'musicas' && <PaginaMusicas alvo={alvo} estado={estado} registrarTeclas={registrarTeclas} />}
          {pagina === 'biblia' && <PaginaBiblia alvo={alvo} config={config} registrarTeclas={registrarTeclas} />}
          {pagina === 'teste' && (
            <div className="h-full overflow-y-auto">
              <PaginaTeste config={config} alvo={alvo} telemetrias={telemetrias} />
            </div>
          )}
          {pagina === 'telas' && (
            <div className="h-full overflow-y-auto">
              <PaginaTelas config={config} salvar={salvar} telas={telas} />
            </div>
          )}
          {pagina === 'configuracoes' && (
            <div className="h-full overflow-y-auto">
              <PaginaConfiguracoes config={config} salvar={salvar} />
            </div>
          )}
        </div>
      </main>

      <PainelSaidas
        estado={estado}
        config={config}
        telas={telas}
        telemetrias={telemetrias}
        fontes={fontes}
        fonte={fonte}
        aoSelecionarFonte={setFonteId}
        recolhido={recolhido}
        aoRecolher={(v) => salvar({ ...config, interface: { ...config.interface, painelRecolhido: v } })}
      />

      <BarraStatus config={config} telas={telas} progresso={progresso} />
    </div>
  )
}

function ItemNavegacao({
  id,
  icone: Icone,
  rotulo,
  ativo,
  desativado,
  dica,
  aoClicar,
}: {
  id?: string
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
      data-pagina={id}
      disabled={desativado}
      onClick={(e) => {
        e.currentTarget.blur()
        aoClicar?.()
      }}
      className={`flex h-9 items-center gap-2.5 rounded-md px-2.5 text-left text-sm transition-colors ${
        ativo
          ? 'bg-destaque/12 font-semibold text-destaque-texto'
          : desativado
            ? 'cursor-default text-apagado'
            : 'cursor-pointer text-suave hover:bg-hover hover:text-texto'
      }`}
    >
      <Icone className="size-4" />
      <span className="flex-1">{rotulo}</span>
      {dica && <span className="text-[10px] text-apagado">{dica}</span>}
    </button>
  )
}

const NOMES_TAREFA: Record<Progresso['tarefa'], string> = { louvorja: 'Importando músicas', biblia: 'Importando Bíblia', midias: 'Importando mídias' }

function BarraStatus({ config, telas, progresso }: { config: Config; telas: EstadoTelas; progresso: Progresso | null }) {
  const agora = useAgora()
  return (
    <footer className="col-span-3 flex items-center gap-5 border-t border-borda bg-painel px-4 text-xs text-suave">
      <span>Sonoplastia 0.2</span>
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
      {progresso && (
        <span className="flex items-center gap-2 text-texto">
          {NOMES_TAREFA[progresso.tarefa]} {progresso.texto ?? ''}
          <span className="inline-block h-1.5 w-24 overflow-hidden rounded-full bg-borda">
            <span className="block h-full bg-destaque" style={{ width: `${Math.round((progresso.feito / Math.max(1, progresso.total)) * 100)}%` }} />
          </span>
          {progresso.feito}/{progresso.total}
        </span>
      )}
      <span className="ml-auto">
        Emergência: <b className="text-texto">{ATALHO_EMERGENCIA.texto}</b> fecha as saídas
      </span>
      <span className="tabular-nums text-texto">{agora.toLocaleTimeString('pt-BR')}</span>
    </footer>
  )
}
