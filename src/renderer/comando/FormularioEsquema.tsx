/**
 * Formulário gerado a partir de um esquema zod (via JSON Schema). Cada opção nova acrescentada em
 * src/shared/config.ts aparece aqui sem código extra.
 */
import { ImageIcon, X } from 'lucide-react'
import { z } from 'zod'
import { api } from '../compartilhado/ganchos'
import { Botao, Interruptor, useRascunho } from './ui'

interface PropJson {
  type?: string | string[]
  enum?: string[]
  title?: string
  description?: string
  minimum?: number
  maximum?: number
  'x-ui'?: 'cor' | 'deslizante' | 'arquivo-imagem'
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

const classeEntrada =
  'h-9 rounded-md border border-borda bg-[#0f1217] px-2.5 text-sm text-texto outline-none focus:border-destaque'

function Controle({ prop, valor, aoMudar }: { prop: PropJson; valor: unknown; aoMudar: (v: unknown) => void }) {
  const tipo = tipoBase(prop)
  if (tipo === 'boolean') return <Interruptor ligado={Boolean(valor)} aoMudar={aoMudar} rotulo={prop.title} />
  if (prop.enum) {
    return (
      <select
        className={`${classeEntrada} w-72`}
        value={String(valor)}
        onChange={(e) => {
          // sem foco, as setas do teclado e o passador de slides não mexem mais na opção
          e.currentTarget.blur()
          aoMudar(e.target.value)
        }}
      >
        {prop.enum.map((o) => (
          <option key={o} value={o}>
            {prop['x-opcoes']?.[o] ?? o}
          </option>
        ))}
      </select>
    )
  }
  if (tipo === 'number' || tipo === 'integer') return <ControleNumero prop={prop} valor={Number(valor)} aoMudar={aoMudar} />
  if (prop['x-ui'] === 'cor') return <ControleCor valor={String(valor)} aoMudar={aoMudar} />
  if (prop['x-ui'] === 'arquivo-imagem') return <ControleArquivoImagem valor={valor as string | null} aoMudar={aoMudar} />
  return <ControleTexto valor={String(valor ?? '')} aoMudar={aoMudar} />
}

function ControleTexto({ valor, aoMudar }: { valor: string; aoMudar: (v: string) => void }) {
  const [v, setV] = useRascunho(valor, aoMudar)
  return <input className={`${classeEntrada} w-72`} value={v} onChange={(e) => setV(e.target.value)} />
}

function ControleNumero({ prop, valor, aoMudar }: { prop: PropJson; valor: number; aoMudar: (v: number) => void }) {
  const [v, setV] = useRascunho(valor, aoMudar, 200)
  const passo = prop['x-passo'] ?? (tipoBase(prop) === 'integer' ? 1 : 0.1)
  if (prop['x-ui'] === 'deslizante' && prop.minimum !== undefined && prop.maximum !== undefined) {
    return (
      <>
        <input
          type="range"
          className="w-48 accent-destaque"
          min={prop.minimum}
          max={prop.maximum}
          step={passo}
          value={v}
          onChange={(e) => setV(Number(e.target.value))}
        />
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
      {nome && <span className="max-w-48 truncate text-sm text-suave" title={valor ?? ''}>{nome}</span>}
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
