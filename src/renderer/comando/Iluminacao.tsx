/**
 * Iluminação da igreja (luz.local) na tela de comando: um botão discreto na barra de baixo abre o
 * painel com as luzes (liga/desliga) e os cenários. Só fala com as luzes quando o operador clica.
 */
import { ExternalLink, Lightbulb, LightbulbOff, RefreshCw, Sparkles, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Config } from '../../shared/config'
import type { EstadoLuz } from '../../shared/iluminacao'
import { api } from '../compartilhado/ganchos'
import { mensagemDeErro } from './acoes'
import { Botao } from './ui'

export function BotaoLuzes({ config }: { config: Config }) {
  const [aberto, setAberto] = useState(false)
  if (!config.iluminacao.ativo) return null
  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.currentTarget.blur()
          setAberto((v) => !v)
        }}
        className={`flex h-6 cursor-pointer items-center gap-1.5 rounded px-1.5 hover:bg-hover hover:text-texto ${aberto ? 'bg-hover text-texto' : ''}`}
        title="Luzes da igreja"
      >
        <Lightbulb className="size-3.5" />
        Luzes
      </button>
      {aberto && <PainelLuzes aoFechar={() => setAberto(false)} />}
    </div>
  )
}

function PainelLuzes({ aoFechar }: { aoFechar: () => void }) {
  const [estado, setEstado] = useState<EstadoLuz | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aplicado, setAplicado] = useState<string | null>(null)
  const raiz = useRef<HTMLDivElement>(null)

  const ler = useCallback(() => api.estadoLuz().then(setEstado), [])
  useEffect(() => {
    void ler()
    // enquanto o painel está aberto, acompanha quem mexer pela página das luzes ou pelo interruptor
    const id = setInterval(() => void ler(), 3000)
    return () => clearInterval(id)
  }, [ler])

  // fecha ao clicar fora ou com Esc
  useEffect(() => {
    const fora = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.parentElement?.contains(e.target as Node)) aoFechar()
    }
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      aoFechar()
    }
    document.addEventListener('mousedown', fora)
    window.addEventListener('keydown', tecla, true)
    return () => {
      document.removeEventListener('mousedown', fora)
      window.removeEventListener('keydown', tecla, true)
    }
  }, [aoFechar])

  const fazer = async (chave: string, f: () => Promise<unknown>) => {
    setOcupado(chave)
    setErro(null)
    try {
      await f()
      await ler()
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setOcupado(null)
    }
  }

  return (
    <div ref={raiz} role="dialog" aria-label="Luzes da igreja" className="absolute bottom-8 left-0 z-50 w-[340px] rounded-xl border border-borda bg-painel text-texto shadow-2xl">
      <header className="flex items-center gap-2 border-b border-borda px-3 py-2">
        <Lightbulb className="size-4 text-aviso" />
        <span className="text-sm font-semibold">Luzes da igreja</span>
        <span className={`ml-1 size-2 rounded-full ${estado?.conectado ? 'bg-ok' : estado ? 'bg-perigo' : 'bg-apagado'}`} title={estado?.conectado ? 'Conectado' : 'Sem conexão'} />
        <Botao tamanho="xs" variante="fantasma" icone={RefreshCw} onClick={() => void ler()} title="Ler de novo" className="ml-auto" />
        <Botao tamanho="xs" variante="fantasma" icone={X} onClick={aoFechar} title="Fechar (Esc)" />
      </header>

      <div className="flex flex-col gap-3 p-3">
        {!estado && <p className="text-xs text-suave">Procurando o sistema de iluminação…</p>}
        {estado && !estado.conectado && (
          <div className="rounded-md bg-perigo/10 px-3 py-2 text-xs text-perigo-texto">
            {estado.erro ?? 'Sem conexão.'} Confira se o computador está na mesma rede das luzes (endereço em Configurações → Iluminação).
          </div>
        )}
        {estado?.conectado && (
          <>
            <div className="grid grid-cols-2 gap-1.5">
              {estado.reles.map((r) => {
                const Icone = r.ligado ? Lightbulb : LightbulbOff
                return (
                  <button
                    key={r.id}
                    type="button"
                    disabled={ocupado !== null}
                    onClick={(e) => {
                      e.currentTarget.blur()
                      void fazer(`rele-${r.id}`, () => api.alternarLuz(r.id))
                    }}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors disabled:cursor-wait ${
                      r.ligado ? 'border-aviso/50 bg-aviso/15' : 'border-borda bg-painel-2 hover:bg-hover'
                    }`}
                    title={r.ligado ? 'Clique para apagar' : 'Clique para acender'}
                  >
                    <Icone className={`size-4 shrink-0 ${r.ligado ? 'text-aviso' : 'text-apagado'}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold">{r.nome}</span>
                      <span className="block text-[11px] text-suave">{ocupado === `rele-${r.id}` ? '…' : r.ligado ? 'Acesa' : 'Apagada'}</span>
                    </span>
                  </button>
                )
              })}
            </div>
            {estado.cenarios.length > 0 && (
              <div className="flex flex-col gap-1">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-apagado">Cenários</div>
                <div className="flex flex-wrap gap-1.5">
                  {estado.cenarios.map((c) => (
                    <Botao
                      key={c}
                      tamanho="sm"
                      icone={Sparkles}
                      disabled={ocupado !== null}
                      ativo={aplicado === c}
                      onClick={() =>
                        void fazer(`cenario-${c}`, async () => {
                          await api.cenarioLuz(c)
                          setAplicado(c)
                        })
                      }
                    >
                      {c}
                    </Botao>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
        {erro && <p className="text-xs text-perigo-texto">{erro}</p>}
      </div>

      <footer className="border-t border-borda px-3 py-2">
        <Botao tamanho="xs" variante="fantasma" icone={ExternalLink} onClick={() => void api.abrirPaginaLuz()} title="Abre a página das luzes no navegador (criar e editar cenários)">
          Abrir a página das luzes
        </Botao>
      </footer>
    </div>
  )
}

/** Campos do item da liturgia: cenário das luzes quando o item começa e quando a liturgia sai dele. */
export function CamposLuzDoItem({ inicio, fim, aoMudar }: { inicio: string; fim: string; aoMudar: (v: { luzInicio?: string; luzFim?: string }) => void }) {
  const [cenarios, setCenarios] = useState<string[] | null>(null)
  useEffect(() => {
    void api.estadoLuz().then((e) => setCenarios(e.conectado ? e.cenarios : []))
  }, [])
  const opcoes = [...new Set([...(cenarios ?? []), ...[inicio, fim].filter(Boolean)])]
  const lista = (valor: string, campo: 'luzInicio' | 'luzFim', rotulo: string) => (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-suave">{rotulo}</span>
      <select
        className="h-9 w-full rounded-md border border-borda bg-entrada px-2 text-sm text-texto outline-none focus:border-destaque"
        value={valor}
        onChange={(e) => {
          e.currentTarget.blur()
          aoMudar({ [campo]: e.target.value })
        }}
      >
        <option value="">Não mexer nas luzes</option>
        {opcoes.map((c) => (
          <option key={c} value={c}>
            {c}
            {cenarios && !cenarios.includes(c) ? ' (não encontrado agora)' : ''}
          </option>
        ))}
      </select>
    </label>
  )
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-borda p-2.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-suave">
        <Lightbulb className="size-3.5" /> Luzes da igreja
      </div>
      {lista(inicio, 'luzInicio', 'Quando o item começa')}
      {lista(fim, 'luzFim', 'Quando a liturgia sai do item')}
      <p className="text-[11px] text-apagado">
        Ex.: “4. Projetor” no começo de um vídeo e “1. Ligar tudo” no fim.
        {cenarios && cenarios.length === 0 ? ' Sem conexão com a iluminação agora.' : ''}
      </p>
    </div>
  )
}
