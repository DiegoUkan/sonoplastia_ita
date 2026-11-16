/**
 * Bíblia automática na tela de comando: o painel de sugestões da página Bíblia, o indicador na barra
 * de baixo e os testes das Configurações. O trabalho (microfone, transcrição, IA) é do processo principal.
 */
import { AudioLines, CheckCircle2, Eraser, Mic, MicOff, Pause, Sparkles, XCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { EstadoTranscricao, LigacaoSugestao, NivelEscuta, ResultadoTeste, SituacaoEscuta, SugestaoBiblia } from '../../shared/transcricao/tipos'
import { api } from '../compartilhado/ganchos'
import { mensagemDeErro } from './acoes'
import { Botao, Secao, Selo } from './ui'

export function useTranscricao(): EstadoTranscricao | null {
  const [e, setE] = useState<EstadoTranscricao | null>(null)
  useEffect(() => {
    api.obterTranscricao().then(setE)
    return api.aoMudarTranscricao(setE)
  }, [])
  return e
}

function useNivel(ligado: boolean): NivelEscuta | null {
  const [n, setN] = useState<NivelEscuta | null>(null)
  useEffect(() => {
    if (!ligado) {
      setN(null)
      return
    }
    return api.aoNivelTranscricao(setN)
  }, [ligado])
  return n
}

const COR_SITUACAO: Record<SituacaoEscuta, string> = {
  desligado: 'bg-apagado',
  iniciando: 'bg-destaque',
  espera: 'bg-apagado',
  ouvindo: 'bg-ok',
  pausado: 'bg-aviso',
  erro: 'bg-perigo',
}

const ROTULO_SITUACAO: Record<SituacaoEscuta, string> = {
  desligado: 'Manual',
  iniciando: 'Abrindo o microfone',
  espera: 'Em espera',
  ouvindo: 'Ouvindo',
  pausado: 'Pausado',
  erro: 'Com erro',
}

const LIGACAO: Record<LigacaoSugestao, { rotulo: string; tom: 'destaque' | 'ok' | 'aviso' | 'apagado'; dica: string }> = {
  citada: { rotulo: 'Citado', tom: 'destaque', dica: 'O pregador disse a referência' },
  leitura: { rotulo: 'Lido', tom: 'destaque', dica: 'As palavras da fala são as do versículo' },
  citacao: { rotulo: 'Citação', tom: 'destaque', dica: 'A IA reconheceu o texto lido ou citado' },
  parafrase: { rotulo: 'Paráfrase', tom: 'ok', dica: 'O mesmo conteúdo, com outras palavras' },
  alusao: { rotulo: 'Alusão', tom: 'ok', dica: 'Menciona a história, o personagem ou uma frase famosa' },
  tema_central: { rotulo: 'Tema central', tom: 'aviso', dica: 'É o ponto principal pregado' },
  tema_relacionado: { rotulo: 'Tema', tom: 'apagado', dica: 'Tem a ver, mas o pregador não se refere a ela' },
  distante: { rotulo: 'Distante', tom: 'apagado', dica: 'Ligação fraca' },
  '': { rotulo: 'Sugestão', tom: 'apagado', dica: '' },
}

function haQuanto(hora: number, agora: number): string {
  const s = Math.max(0, Math.round((agora - hora) / 1000))
  if (s < 60) return 'agora'
  const m = Math.round(s / 60)
  return m < 60 ? `há ${m} min` : `há ${Math.floor(m / 60)} h`
}

const milhar = (n: number) => (n >= 1000 ? `${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : String(n))

/** Medidor do microfone: a barra é o nível; o traço, a partir de onde conta como voz. */
function Medidor({ nivel }: { nivel: NivelEscuta | null }) {
  const pct = (db: number) => `${Math.round(Math.min(1, Math.max(0, (db + 70) / 70)) * 100)}%`
  return (
    <span className="relative inline-block h-2 w-28 overflow-hidden rounded-full bg-borda" title="Nível do microfone (o traço marca a partir de onde conta como voz)">
      {nivel && <span className={`absolute inset-y-0 left-0 transition-[width] duration-150 ${nivel.voz ? 'bg-ok' : 'bg-apagado'}`} style={{ width: pct(nivel.db) }} />}
      {nivel && <span className="absolute inset-y-0 w-0.5 bg-texto/60" style={{ left: pct(nivel.limiar) }} />}
    </span>
  )
}

export function PainelSugestoes({
  estado,
  noAr,
  aoMostrar,
}: {
  estado: EstadoTranscricao
  noAr: { livro: number; capitulo: number; versiculo: number } | null
  aoMostrar: (s: SugestaoBiblia) => void
}) {
  const nivel = useNivel(estado.ligado)
  const [agora, setAgora] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 15_000)
    return () => clearInterval(t)
  }, [])
  const fala = useRef<HTMLDivElement>(null)
  useEffect(() => {
    fala.current?.scrollTo({ top: fala.current.scrollHeight })
  }, [estado.falas.length, estado.parcial])

  const c = estado.consumo
  const audio = c.segundosAudio < 60 ? `${Math.round(c.segundosAudio)} s` : `${Math.round(c.segundosAudio / 60)} min`
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 px-5 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
        <span className="flex items-center gap-2 font-medium">
          <span className={`size-2.5 rounded-full ${COR_SITUACAO[estado.situacao]} ${estado.situacao === 'ouvindo' ? 'animate-pulse' : ''}`} />
          {ROTULO_SITUACAO[estado.situacao]}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-suave" title={estado.mensagem}>
          {estado.mensagem}
        </span>
        {estado.ligado && <Medidor nivel={nivel} />}
        <span className="text-xs tabular-nums text-suave" title="Gasto desde que o programa abriu">
          IA: {c.chamadas} chamada{c.chamadas === 1 ? '' : 's'} · {milhar(c.entrada + c.saida)} tokens · transcrição: {audio}
        </span>
        <Botao tamanho="sm" variante="fantasma" icone={Eraser} disabled={!estado.sugestoes.length} onClick={() => void api.limparSugestoes()} title="Tirar todas as sugestões da lista">
          Limpar
        </Botao>
      </div>
      {estado.faltando.length > 0 && (
        <div className="rounded-md bg-aviso/15 px-3 py-2 text-sm text-aviso-texto">
          Falta {estado.faltando.join(', ')} (Configurações → Bíblia automática).
          {estado.faltando.some((f) => f.includes('IA')) && ' Sem a IA, só aparecem as referências ditas e os textos lidos.'}
        </div>
      )}
      {estado.aviso && <div className="rounded-md bg-aviso/10 px-3 py-1.5 text-xs text-aviso-texto">{estado.aviso}</div>}

      <div ref={fala} className="h-[76px] shrink-0 overflow-y-auto rounded-lg border border-borda bg-painel px-3 py-2 text-[13px] leading-snug">
        {estado.falas.length === 0 && !estado.parcial ? (
          <span className="text-apagado">{estado.ligado ? 'A fala transcrita aparece aqui.' : 'Ligue o Automático para ouvir o pregador.'}</span>
        ) : (
          <>
            {estado.falas.slice(-6).map((f, i) => (
              <span key={`${f.hora}-${i}`} className="text-texto">
                {f.texto}{' '}
              </span>
            ))}
            {estado.parcial && <span className="italic text-apagado">{estado.parcial}</span>}
          </>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {estado.sugestoes.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-suave">
            <Sparkles className="size-9 text-apagado" />
            <p className="max-w-md text-sm">
              As sugestões aparecem aqui enquanto o pregador fala: as referências ditas na hora, e as da IA a cada poucos segundos. Clique numa para mostrar.
            </p>
          </div>
        ) : (
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
            {estado.sugestoes.map((s) => {
              const l = LIGACAO[s.ligacao] ?? LIGACAO['']
              const naTela =
                !!noAr && noAr.livro === s.livro && noAr.capitulo === s.capitulo && (s.inicio === null || (noAr.versiculo >= s.inicio && noAr.versiculo <= (s.fim ?? s.inicio)))
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={(e) => {
                    e.currentTarget.blur()
                    aoMostrar(s)
                  }}
                  title={`${s.motivo}\n\n“${s.trecho}”`}
                  className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-3 text-left transition-colors ${
                    naTela ? 'border-destaque bg-destaque/10' : 'border-borda bg-painel hover:border-destaque/60 hover:bg-hover'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <b className="text-[15px] text-texto">{s.referencia}</b>
                    <Selo tom={l.tom} title={l.dica}>
                      {l.rotulo}
                      {s.origem === 'ia' && s.ligacao !== 'citada' ? ` ${s.forca}` : ''}
                    </Selo>
                    {s.mostrada && (
                      <Selo tom="ok" title="Foi para a tela sozinho (citação direta)">
                        na tela sozinho
                      </Selo>
                    )}
                    <span className="ml-auto shrink-0 text-[11px] text-apagado">{haQuanto(s.hora, agora)}</span>
                  </span>
                  {s.motivo && <span className="text-xs text-suave">{s.motivo}</span>}
                  <span className="line-clamp-3 text-[13px] leading-snug text-texto/90">{s.texto || '(sem texto nesta versão)'}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

/** Na barra de baixo, enquanto o automático está ligado (em qualquer página). */
export function IndicadorTranscricao() {
  const e = useTranscricao()
  if (!e?.ligado) return null
  const Icone = e.situacao === 'erro' ? MicOff : e.situacao === 'pausado' ? Pause : e.situacao === 'ouvindo' ? AudioLines : Mic
  const cor = e.situacao === 'erro' ? 'text-perigo-texto' : e.situacao === 'ouvindo' ? 'text-ok-texto' : e.situacao === 'pausado' ? 'text-aviso-texto' : ''
  return (
    <span className={`flex items-center gap-1.5 ${cor}`} title={e.mensagem}>
      <Icone className="size-3.5" />
      Bíblia automática: {ROTULO_SITUACAO[e.situacao].toLowerCase()}
    </span>
  )
}

function BotaoTeste({ rotulo, testar }: { rotulo: string; testar: () => Promise<ResultadoTeste> }) {
  const [r, setR] = useState<ResultadoTeste | null>(null)
  const [testando, setTestando] = useState(false)
  return (
    <div className="flex items-start gap-3">
      <Botao
        disabled={testando}
        onClick={async () => {
          setTestando(true)
          setR(null)
          try {
            setR(await testar())
          } catch (e) {
            setR({ ok: false, mensagem: mensagemDeErro(e) })
          } finally {
            setTestando(false)
          }
        }}
      >
        {testando ? 'Testando…' : rotulo}
      </Botao>
      {r && (
        <span className={`flex min-w-0 items-start gap-1.5 pt-2 text-sm ${r.ok ? 'text-ok-texto' : 'text-perigo-texto'}`}>
          {r.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <XCircle className="mt-0.5 size-4 shrink-0" />}
          {r.mensagem}
        </span>
      )}
    </div>
  )
}

/** Testes rápidos nas Configurações (as opções são gravadas antes de testar). */
export function TestesTranscricao() {
  return (
    <Secao
      titulo="Chaves e testes"
      descricao="“Copiar do projeto de transcrição” traz as chaves e os ajustes do programa em Python que já estava configurado neste computador. O teste da IA faz uma chamada pequena (fração de centavo); o do ElevenLabs só abre a conexão."
    >
      <div className="flex flex-col gap-3">
        <BotaoTeste rotulo="Copiar do projeto de transcrição" testar={() => api.copiarDoProjetoTranscricao()} />
        <BotaoTeste rotulo="Testar a IA" testar={() => api.testarIA()} />
        <BotaoTeste rotulo="Testar o ElevenLabs" testar={() => api.testarElevenLabs()} />
      </div>
    </Secao>
  )
}
