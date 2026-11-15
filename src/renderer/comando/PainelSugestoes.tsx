/**
 * Painel "Sugestões ao vivo" da página Bíblia: liga e desliga a escuta, mostra o que está sendo dito
 * e as sugestões (mais nova em cima). Clicar numa sugestão põe o versículo no ar pela Bíblia deste
 * programa; nada vai sozinho para os projetores.
 */
import { BookOpen, Eraser, Sparkles, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { type EstadoTranscricao, type ParcialTranscricao, ROTULO_LIGACAO, type SugestaoVersiculo } from '../../shared/transcricao'
import { api, useAgora } from '../compartilhado/ganchos'
import { mensagemDeErro } from './acoes'
import { Botao, Interruptor, Selo } from './ui'

/** Estado das sugestões e o que está sendo dito agora. */
export function useTranscricao(): { estado: EstadoTranscricao | null; parcial: ParcialTranscricao } {
  const [estado, setEstado] = useState<EstadoTranscricao | null>(null)
  const [parcial, setParcial] = useState<ParcialTranscricao>({ texto: '', nivel: 0 })
  useEffect(() => {
    void api.estadoTranscricao().then(setEstado)
    const a = api.aoMudarTranscricao(setEstado)
    const b = api.aoParcialTranscricao(setParcial)
    return () => {
      a()
      b()
    }
  }, [])
  return { estado, parcial }
}

export interface VersiculoNoAr {
  livro: number
  capitulo: number
  versiculo: number
}

const noArNaSugestao = (s: SugestaoVersiculo, n: VersiculoNoAr | null) =>
  !!n && n.livro === s.livro && n.capitulo === s.capitulo && s.inicio !== null && n.versiculo >= s.inicio && n.versiculo <= (s.fim ?? s.inicio)

function seloDa(s: SugestaoVersiculo): { tom: 'ok' | 'destaque' | 'apagado'; texto: string; titulo: string } {
  if (s.origem === 'citada') return { tom: 'ok', texto: 'Dita', titulo: 'O pregador disse a referência' }
  const texto = ROTULO_LIGACAO[s.ligacao] ?? (s.origem === 'busca' ? 'Busca' : 'IA')
  const forte = s.ligacao === 'citacao' || s.ligacao === 'parafrase' || s.ligacao === 'alusao'
  return { tom: forte ? 'destaque' : 'apagado', texto, titulo: s.origem === 'busca' ? 'Achada pela busca por palavras (sem IA)' : 'Escolhida pela IA' }
}

const hora = (ms: number) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
const milTokens = (n: number) => (n >= 1000 ? `${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : String(n))

export function PainelSugestoes({
  estado,
  parcial,
  noAr,
  rigor,
  aoMostrar,
  aoAbrir,
  aoFechar,
}: {
  estado: EstadoTranscricao | null
  parcial: ParcialTranscricao
  noAr: VersiculoNoAr | null
  rigor: number
  aoMostrar: (s: SugestaoVersiculo) => void
  aoAbrir: (s: SugestaoVersiculo) => void
  aoFechar: () => void
}) {
  const [erro, setErro] = useState<string | null>(null)
  const agora = useAgora(5000).getTime()
  const e = estado
  const ligado = !!e?.ligado
  const ouvindo = e?.fase === 'ouvindo'

  const alternar = (v: boolean) => {
    setErro(null)
    api.ligarTranscricao(v).catch((x) => setErro(mensagemDeErro(x)))
  }

  const corFase =
    e?.fase === 'ouvindo' ? 'bg-ok' : e?.fase === 'erro' ? 'bg-perigo' : e?.fase === 'preparando' || e?.fase === 'reconectando' ? 'animate-pulse bg-aviso' : 'bg-apagado'
  const textoFase = !e
    ? 'Carregando…'
    : e.fase === 'parado'
      ? 'Desligado'
      : e.fase === 'ouvindo'
        ? 'Ouvindo o pregador'
        : e.mensagem || (e.fase === 'erro' ? 'Erro' : 'Preparando…')
  const falas = e?.falas.slice(-2) ?? []

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-l border-borda bg-painel">
      <div className="flex items-center gap-2 border-b border-borda px-3 py-2.5">
        <Sparkles className="size-4 text-destaque-texto" />
        <span className="text-sm font-semibold">Sugestões ao vivo</span>
        <span className="ml-auto flex items-center gap-2">
          <span className="text-xs text-suave">Ouvir</span>
          <Interruptor ligado={ligado} aoMudar={alternar} rotulo="Ouvir o pregador e sugerir versículos" />
          <Botao tamanho="sm" variante="fantasma" icone={X} onClick={aoFechar} title="Esconder o painel (a escuta continua)" />
        </span>
      </div>

      <div className="flex flex-col gap-1.5 border-b border-borda px-3 py-2">
        <div className="flex items-start gap-2 text-xs">
          <span className={`mt-1 size-2 shrink-0 rounded-full ${corFase}`} />
          <span className={e?.fase === 'erro' ? 'text-perigo-texto' : 'text-suave'}>{textoFase}</span>
        </div>
        {ouvindo && (
          <div className="h-1 overflow-hidden rounded-full bg-borda" title="Nível do microfone">
            <div className="h-full bg-ok transition-[width] duration-150" style={{ width: `${Math.round(parcial.nivel * 100)}%` }} />
          </div>
        )}
        {e && (ligado || e.consumo.chamadas > 0) && (
          <div className="text-[11px] text-apagado">
            {e.ia ? `IA ligada · rigor ${rigor}%` : 'Sem IA: só referências ditas e citações quase literais'}
            {e.consumo.chamadas > 0 && ` · ${e.consumo.chamadas} chamada${e.consumo.chamadas > 1 ? 's' : ''} · ${milTokens(e.consumo.entrada + e.consumo.saida)} tokens`}
          </div>
        )}
        {e?.aviso && <div className="rounded bg-aviso/15 px-2 py-1 text-[11px] text-aviso-texto">{e.aviso}</div>}
        {erro && <div className="rounded bg-perigo/10 px-2 py-1 text-[11px] text-perigo-texto">{erro}</div>}
        {(falas.length > 0 || parcial.texto) && ligado && (
          <div className="max-h-20 overflow-hidden rounded-md bg-painel-2 px-2 py-1.5 text-xs leading-snug text-suave">
            {falas.map((f, i) => (
              <span key={i}>{f} </span>
            ))}
            {parcial.texto && <i className="text-texto">{parcial.texto}</i>}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {!e?.sugestoes.length ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-[13px] text-suave">
            <Sparkles className="size-8 text-apagado" />
            {ligado ? (
              <p>Quando o pregador citar, ler ou falar de um texto, as sugestões aparecem aqui. Clique numa para mostrar.</p>
            ) : (
              <>
                <p>Ligue “Ouvir” para o programa escutar o pregador e sugerir versículos.</p>
                <p className="text-xs text-apagado">Chaves, microfone e rigor em Configurações → Sugestões de versículos. Nada vai para os projetores sem você clicar.</p>
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {e.sugestoes.map((s) => {
              const selo = seloDa(s)
              const ativo = noArNaSugestao(s, noAr)
              const nova = agora - s.hora < 20_000
              return (
                <div
                  key={s.id}
                  className={`group rounded-lg border transition-colors ${
                    ativo ? 'border-destaque bg-destaque/12' : nova ? 'border-destaque/40 bg-destaque/5' : 'border-borda bg-painel-2 hover:bg-hover'
                  }`}
                >
                  <button
                    type="button"
                    className="block w-full cursor-pointer px-2.5 pt-2 text-left"
                    onClick={(ev) => {
                      ev.currentTarget.blur()
                      aoMostrar(s)
                    }}
                    title={s.inicio === null ? 'Abrir o capítulo' : 'Mostrar nos projetores (pelo "Enviar para")'}
                  >
                    <div className="flex items-center gap-1.5">
                      <Selo tom={selo.tom} title={selo.titulo}>
                        {selo.texto}
                      </Selo>
                      <span className="min-w-0 truncate text-sm font-semibold text-texto">{s.referencia}</span>
                      <span className="ml-auto shrink-0 text-[10px] tabular-nums text-apagado">{hora(s.hora)}</span>
                    </div>
                    {s.previa && <p className="mt-1 line-clamp-3 text-[13px] leading-snug text-texto/90">{s.previa}</p>}
                  </button>
                  <div className="flex items-center gap-1 px-2.5 pb-1.5 pt-0.5">
                    <span className="min-w-0 flex-1 truncate text-[11px] text-suave" title={s.trecho}>
                      {s.motivo || (s.inicio === null ? 'Capítulo citado' : '')}
                      {s.sigla && s.previa ? ` · ${s.sigla}` : ''}
                    </span>
                    {s.inicio !== null && (
                      <Botao tamanho="xs" variante="fantasma" icone={BookOpen} onClick={() => aoAbrir(s)} title="Só abrir o capítulo (sem mostrar)" />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {!!e?.sugestoes.length && (
        <div className="flex items-center justify-between border-t border-borda px-3 py-1.5">
          <span className="text-[11px] text-apagado">{e.sugestoes.length} sugestões</span>
          <Botao tamanho="xs" variante="fantasma" icone={Eraser} onClick={() => void api.limparSugestoes()} title="Apagar a lista de sugestões e as falas">
            Limpar
          </Botao>
        </div>
      )}
    </aside>
  )
}
