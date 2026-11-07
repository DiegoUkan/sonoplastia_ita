/**
 * Formulário gerado a partir de um esquema zod (via JSON Schema). Cada opção nova acrescentada em
 * src/shared/config.ts aparece aqui sem código extra.
 */
import { FolderOpen, ImageIcon, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import type { VersaoBiblia } from '../../shared/dados'
import { api } from '../compartilhado/ganchos'
import { Botao, classeEntrada, Deslizante, Interruptor, useRascunho } from './ui'

interface PropJson {
  type?: string | string[]
  enum?: string[]
  title?: string
  description?: string
  minimum?: number
  maximum?: number
  'x-ui'?: 'cor' | 'deslizante' | 'arquivo-imagem' | 'dispositivo-audio' | 'versao-biblia' | 'pasta'
  'x-passo'?: number
  'x-opcoes'?: Record<string, string>
}

/** um `z.object(...)` qualquer */
type EsquemaObjeto = z.ZodType

const cache = new WeakMap<EsquemaObjeto, Record<string, PropJson>>()

function propriedades(esquema: EsquemaObjeto): Record<string, PropJson> {
  let p = cache.get(esquema)
  if (!p) {
    const js = z.toJSONSchema(esquema, { unrepresentable: 'any' }) as { properties?: Record<string, PropJson> }
    p = js.properties ?? {}
    cache.set(esquema, p)
  }
  return p
}

function tipoBase(p: PropJson): string | undefined {
  if (Array.isArray(p.type)) return p.type.find((t) => t !== 'null')
  return p.type
}

export function FormularioEsquema<T extends Record<string, unknown>>({
  esquema,
  valor,
  aoMudar,
  omitir = [],
}: {
  esquema: EsquemaObjeto
  valor: T
  aoMudar: (v: T) => void
  omitir?: string[]
}) {
  const props = propriedades(esquema)
  return (
    <div className="divide-y divide-borda">
      {Object.entries(props)
        .filter(([k, p]) => !omitir.includes(k) && p.title)
        .map(([k, p]) => (
          <Campo key={k} prop={p} valor={valor[k]} aoMudar={(v) => aoMudar({ ...valor, [k]: v })} />
        ))}
    </div>
  )
}

function Campo({ prop, valor, aoMudar }: { prop: PropJson; valor: unknown; aoMudar: (v: unknown) => void }) {
  return (
    <div className="flex items-center justify-between gap-6 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <div className="text-sm text-texto">{prop.title}</div>
        {prop.description && <div className="mt-0.5 text-xs text-suave">{prop.description}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Controle prop={prop} valor={valor} aoMudar={aoMudar} />
      </div>
    </div>
  )
}

function Controle({ prop, valor, aoMudar }: { prop: PropJson; valor: unknown; aoMudar: (v: unknown) => void }) {
  const tipo = tipoBase(prop)
  if (tipo === 'boolean') return <Interruptor ligado={Boolean(valor)} aoMudar={aoMudar} rotulo={prop.title} />
  if (prop.enum) {
    return (
      <Lista valor={String(valor)} aoMudar={aoMudar} opcoes={prop.enum.map((o) => ({ valor: o, rotulo: prop['x-opcoes']?.[o] ?? o }))} />
    )
  }
  if (tipo === 'number' || tipo === 'integer') return <ControleNumero prop={prop} valor={Number(valor)} aoMudar={aoMudar} />
  switch (prop['x-ui']) {
    case 'cor':
      return <ControleCor valor={String(valor)} aoMudar={aoMudar} />
    case 'arquivo-imagem':
      return <ControleArquivoImagem valor={valor as string | null} aoMudar={aoMudar} />
    case 'dispositivo-audio':
      return <ControleDispositivoAudio valor={String(valor ?? '')} aoMudar={aoMudar} />
    case 'versao-biblia':
      return <ControleVersaoBiblia valor={String(valor ?? '')} aoMudar={aoMudar} />
    case 'pasta':
      return <ControlePasta valor={String(valor ?? '')} aoMudar={aoMudar} titulo={prop.title ?? 'Escolher pasta'} />
    default:
      return <ControleTexto valor={String(valor ?? '')} aoMudar={aoMudar} />
  }
}

/** Lista de opções que perde o foco depois da escolha (as setas e o passador não mexem mais nela). */
function Lista({ valor, aoMudar, opcoes }: { valor: string; aoMudar: (v: string) => void; opcoes: Array<{ valor: string; rotulo: string }> }) {
  return (
    <select
      className={`${classeEntrada} w-72`}
      value={valor}
      onChange={(e) => {
        e.currentTarget.blur()
        aoMudar(e.target.value)
      }}
    >
      {opcoes.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.rotulo}
        </option>
      ))}
    </select>
  )
}

function ControleTexto({ valor, aoMudar, largura = 'w-72' }: { valor: string; aoMudar: (v: string) => void; largura?: string }) {
  const [v, setV] = useRascunho(valor, aoMudar)
  return <input className={`${classeEntrada} ${largura}`} value={v} onChange={(e) => setV(e.target.value)} />
}

function ControleNumero({ prop, valor, aoMudar }: { prop: PropJson; valor: number; aoMudar: (v: number) => void }) {
  const [v, setV] = useRascunho(valor, aoMudar, 200)
  const passo = prop['x-passo'] ?? (tipoBase(prop) === 'integer' ? 1 : 0.1)
  if (prop['x-ui'] === 'deslizante' && prop.minimum !== undefined && prop.maximum !== undefined) {
    return (
      <>
        <Deslizante className="w-48" min={prop.minimum} max={prop.maximum} passo={passo} valor={v} aoMudar={setV} rotulo={prop.title} />
        <span className="w-12 text-right text-sm tabular-nums text-suave">{v}</span>
      </>
    )
  }
  return (
    <input
      type="number"
      className={`${classeEntrada} w-28`}
      min={prop.minimum}
      max={prop.maximum}
      step={passo}
      value={v}
      onChange={(e) => {
        const n = Number(e.target.value)
        if (Number.isFinite(n)) setV(n)
      }}
    />
  )
}

function ControleCor({ valor, aoMudar }: { valor: string; aoMudar: (v: string) => void }) {
  const [v, setV] = useRascunho(valor, aoMudar, 250)
  return (
    <>
      <input
        type="color"
        className="h-9 w-12 cursor-pointer rounded-md border border-borda bg-transparent p-1"
        value={/^#[0-9a-f]{6}$/i.test(v) ? v : '#000000'}
        onChange={(e) => setV(e.target.value)}
      />
      <input
        className={`${classeEntrada} w-24 font-mono`}
        value={v}
        onChange={(e) => {
          if (/^#[0-9a-f]{0,6}$/i.test(e.target.value)) setV(e.target.value)
        }}
      />
    </>
  )
}

function ControleArquivoImagem({ valor, aoMudar }: { valor: string | null; aoMudar: (v: string | null) => void }) {
  const nome = valor ? valor.split(/[\\/]/).pop() : null
  return (
    <>
      {nome && (
        <span className="max-w-48 truncate text-sm text-suave" title={valor ?? ''}>
          {nome}
        </span>
      )}
      <Botao
        icone={ImageIcon}
        onClick={async () => {
          const a = await api.escolherArquivo('imagem')
          if (a) aoMudar(a.caminho)
        }}
      >
        {valor ? 'Trocar' : 'Escolher…'}
      </Botao>
      {valor && <Botao variante="fantasma" icone={X} onClick={() => aoMudar(null)} aria-label="Remover imagem" />}
    </>
  )
}

function ControlePasta({ valor, aoMudar, titulo }: { valor: string; aoMudar: (v: string) => void; titulo: string }) {
  return (
    <>
      <ControleTexto valor={valor} aoMudar={aoMudar} largura="w-80" />
      <Botao
        icone={FolderOpen}
        onClick={async () => {
          const p = await api.escolherPasta(titulo)
          if (p) aoMudar(p)
        }}
        title="Escolher pasta"
      />
    </>
  )
}

function ControleDispositivoAudio({ valor, aoMudar }: { valor: string; aoMudar: (v: string) => void }) {
  const [dispositivos, setDispositivos] = useState<MediaDeviceInfo[]>([])
  useEffect(() => {
    const ler = () =>
      navigator.mediaDevices
        .enumerateDevices()
        .then((d) => setDispositivos(d.filter((x) => x.kind === 'audiooutput' && x.deviceId !== 'default' && x.deviceId !== 'communications')))
        .catch(() => setDispositivos([]))
    ler()
    navigator.mediaDevices.addEventListener('devicechange', ler)
    return () => navigator.mediaDevices.removeEventListener('devicechange', ler)
  }, [])
  const opcoes = [{ valor: '', rotulo: 'Padrão do Windows' }, ...dispositivos.map((d, i) => ({ valor: d.deviceId, rotulo: d.label || `Saída de som ${i + 1}` }))]
  if (valor && !dispositivos.some((d) => d.deviceId === valor)) opcoes.push({ valor, rotulo: 'Dispositivo desconectado' })
  return <Lista valor={valor} aoMudar={aoMudar} opcoes={opcoes} />
}

function ControleVersaoBiblia({ valor, aoMudar }: { valor: string; aoMudar: (v: string) => void }) {
  const [versoes, setVersoes] = useState<VersaoBiblia[]>([])
  useEffect(() => {
    const ler = () => api.versoesBiblia().then(setVersoes)
    ler()
    return api.aoMudarBiblia(ler)
  }, [])
  const opcoes = [{ valor: '', rotulo: 'Nenhuma' }, ...versoes.map((v) => ({ valor: v.sigla, rotulo: `${v.sigla} — ${v.nome}` }))]
  if (valor && !versoes.some((v) => v.sigla === valor)) opcoes.push({ valor, rotulo: `${valor} (não importada)` })
  return <Lista valor={valor} aoMudar={aoMudar} opcoes={opcoes} />
}
