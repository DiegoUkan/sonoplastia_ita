/**
 * Ferramentas desenhadas nas saídas (e nas miniaturas de reserva): relógio, temporizador, QR code,
 * mensagem e sorteio. Duas camadas: as de tela cheia ficam por cima do conteúdo e embaixo do Logo;
 * as do canto ficam por cima do Logo (o relógio e a contagem continuam na tela de espera). O Preto
 * cobre tudo.
 *
 * Nenhuma ferramenta em tela cheia segura a saída: quando o operador abre outra coisa nela, o motor a põe
 * em espera (`liberarSaida`; o sorteio sai de vez). Enquanto houver conteúdo no ar, o temporizador e o
 * relógio de tela cheia aparecem no canto e o QR e a mensagem somem; sem conteúdo, voltam em tela cheia.
 *
 * Tamanhos em unidades do contêiner (cqh/cqw), como o resto da saída.
 */
import { type CSSProperties, type ReactNode, useEffect, useMemo, useState } from 'react'
import type { ConfigFerramentas, ConfigSaida } from '../../shared/config'
import type { EstadoFerramentas } from '../../shared/estado'
import {
  ALTURA_FAIXA_PCT,
  type EstadoSorteio,
  type EstadoTemporizador,
  type FaixaVertical,
  faixaDoRelogio,
  type FaseTemporizador,
  lerTemporizador,
  MARGEM_CANTO_PCT,
  modosNaSaida,
  type Posicao,
  type RegrasTemporizador,
  sobrepoe,
} from '../../shared/ferramentas'
import { desenharQr } from '../../shared/qr'
import { TextoAjustado } from './TextoAjustado'

/** Atualiza a cada `intervaloMs` (o relógio e o temporizador). */
function useAgoraMs(intervaloMs: number, ligado = true): number {
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    if (!ligado) return
    setAgora(Date.now())
    const id = setInterval(() => setAgora(Date.now()), intervaloMs)
    return () => clearInterval(id)
  }, [intervaloMs, ligado])
  return agora
}

export const COR_FASE: Record<FaseTemporizador, string> = {
  normal: '#ffffff',
  amarelo: '#facc15',
  vermelho: '#f87171',
  esgotado: '#ef4444',
}

export function regrasDe(cfg: ConfigFerramentas): RegrasTemporizador {
  return { amareloMin: cfg.temporizadorAmareloMin, vermelhoMin: cfg.temporizadorVermelhoMin, aoTerminar: cfg.temporizadorAoTerminar }
}

export function textoDaHora(agora: number, segundos: boolean): string {
  const d = new Date(agora)
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return segundos ? `${hm}:${String(d.getSeconds()).padStart(2, '0')}` : hm
}

function textoDaData(agora: number): string {
  return new Date(agora).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
}

// a regra de onde cada ferramenta aparece é pura (testada): fica em shared/ferramentas
export { modosNaSaida }

interface PropsCamada {
  saidaId: string
  config: ConfigSaida
  cfg: ConfigFerramentas
  ferramentas: EstadoFerramentas | undefined
  ms: number
  /** há conteúdo visível na saída (não vazio e sem "Limpar") */
  comConteudo: boolean
}

/** A ferramenta em tela cheia desta saída (a de cima, se houver mais de uma). */
export function CamadaFerramentasTela(p: PropsCamada) {
  const m = modosNaSaida(p.saidaId, p.config, p.ferramentas, p.comConteudo)
  const f = p.ferramentas
  // ordem de prioridade: o sorteio e a mensagem passam na frente do resto
  const qual = m.sorteio ? 'sorteio' : m.mensagem === 'tela' ? 'mensagem' : m.qr === 'tela' ? 'qr' : m.temporizador === 'tela' ? 'temporizador' : m.relogio === 'tela' ? 'relogio' : null
  if (!qual || !f) return null
  const fundo = f.fundo.tipo === 'imagem' && p.config.textoComFundo ? f.fundo.url : null
  return (
    <div
      key={qual}
      className="absolute inset-0 overflow-hidden"
      style={{ background: p.config.corFundo, animation: p.ms > 0 ? `entrar ${p.ms}ms ease both` : undefined }}
    >
      {fundo && (
        <>
          <img src={fundo} alt="" draggable={false} className="absolute inset-0 h-full w-full" style={{ objectFit: 'cover' }} />
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,.45)' }} />
        </>
      )}
      <div className="absolute" style={{ inset: `${p.config.margemPct}%` }}>
        {qual === 'sorteio' && <TelaSorteio s={f.sorteio} />}
        {qual === 'mensagem' && <TelaMensagem texto={f.mensagem} />}
        {qual === 'qr' && <TelaQr link={f.qr.link} texto={f.qr.texto} mostrarLink={p.cfg.qrMostrarLink} />}
        {qual === 'temporizador' && <TelaTemporizador t={f.temporizador} cfg={p.cfg} />}
        {qual === 'relogio' && <TelaRelogio cfg={p.cfg} />}
      </div>
    </div>
  )
}

/**
 * Ferramentas no canto desta saída, cada uma na posição escolhida (empilham se for a mesma).
 * `texto`: onde a letra, o versículo ou o texto no ar está na altura da tela; se chega no relógio, ele
 * diminui (Configurações → Ferramentas).
 */
export function CamadaFerramentasCanto(p: PropsCamada & { texto: FaixaVertical | null }) {
  const m = modosNaSaida(p.saidaId, p.config, p.ferramentas, p.comConteudo)
  const f = p.ferramentas
  const c = p.config
  const faixa = f && m.mensagem === 'canto' ? f.mensagem : null
  const itens: Array<{ chave: string; posicao: Posicao; no: ReactNode }> = []
  if (m.relogio === 'canto') {
    // a conta usa o tamanho normal (com o menor, o texto deixaria de "chegar" e o relógio cresceria de novo)
    const cobre = !!p.texto && sobrepoe(p.texto, faixaDoRelogio(c.relogioPosicao, c.margemPct, c.relogioTamanho, p.cfg.relogioData, !!faixa))
    const tamanho = cobre ? Math.max(3, (c.relogioTamanho * p.cfg.relogioTextoGrandePct) / 100) : c.relogioTamanho
    itens.push({ chave: 'relogio', posicao: c.relogioPosicao, no: <RelogioCanto tamanho={tamanho} cfg={p.cfg} /> })
  }
  if (f && m.temporizador === 'canto')
    itens.push({ chave: 'temporizador', posicao: c.temporizadorPosicao, no: <TemporizadorCanto t={f.temporizador} tamanho={c.temporizadorTamanho} cfg={p.cfg} /> })
  if (f && m.qr === 'canto') itens.push({ chave: 'qr', posicao: c.qrPosicao, no: <QrCanto link={f.qr.link} texto={f.qr.texto} tamanho={c.qrTamanho} /> })
  if (!itens.length && !faixa) return null

  const grupos = new Map<Posicao, ReactNode[]>()
  for (const i of itens) grupos.set(i.posicao, [...(grupos.get(i.posicao) ?? []), <div key={i.chave}>{i.no}</div>])
  return (
    <div className="pointer-events-none absolute" style={{ inset: `${c.margemPct}%` }}>
      {[...grupos].map(([pos, nos]) => (
        <div key={pos} className="absolute flex flex-col" style={{ ...ancora(pos, !!faixa), gap: '1.5cqh' }}>
          {nos}
        </div>
      ))}
      {faixa && <FaixaMensagem texto={faixa} />}
    </div>
  )
}

const MARGEM_CANTO = `${MARGEM_CANTO_PCT}cqh`
/** altura reservada para a faixa da mensagem embaixo */
const ALTURA_FAIXA = `${ALTURA_FAIXA_PCT}cqh`

function ancora(p: Posicao, comFaixa: boolean): CSSProperties {
  const [v, h] = p === 'centro' ? ['meio', 'centro'] : (p.split('-') as [string, string])
  const s: CSSProperties = {}
  const transformacoes: string[] = []
  if (v === 'sup') s.top = MARGEM_CANTO
  else if (v === 'inf') s.bottom = comFaixa ? `calc(${MARGEM_CANTO} + ${ALTURA_FAIXA})` : MARGEM_CANTO
  else {
    s.top = '50%'
    transformacoes.push('translateY(-50%)')
  }
  if (h === 'esq') {
    s.left = MARGEM_CANTO
    s.alignItems = 'flex-start'
  } else if (h === 'dir') {
    s.right = MARGEM_CANTO
    s.alignItems = 'flex-end'
  } else {
    s.left = '50%'
    s.alignItems = 'center'
    transformacoes.push('translateX(-50%)')
  }
  if (transformacoes.length) s.transform = transformacoes.join(' ')
  return s
}

function estiloPilula(tamanho: number, comFundo: boolean): CSSProperties {
  return {
    fontSize: `${tamanho}cqh`,
    lineHeight: 1,
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    color: '#fff',
    padding: '0.2em 0.42em',
    borderRadius: '0.22em',
    background: comFundo ? 'rgba(0,0,0,.62)' : 'transparent',
    textShadow: comFundo ? 'none' : '0 0.04em 0.15em rgba(0,0,0,.9)',
    whiteSpace: 'nowrap',
  }
}

// --- relógio

function RelogioCanto({ tamanho, cfg }: { tamanho: number; cfg: ConfigFerramentas }) {
  const agora = useAgoraMs(cfg.relogioSegundos ? 250 : 1000)
  // diminui e volta devagar quando o texto chega até ele
  return (
    <div style={{ ...estiloPilula(tamanho, cfg.fundoNoCanto), textAlign: 'center', transition: 'font-size .3s ease' }}>
      {textoDaHora(agora, cfg.relogioSegundos)}
      {cfg.relogioData && <div style={{ fontSize: '0.34em', fontWeight: 600, marginTop: '0.25em', opacity: 0.85 }}>{textoDaData(agora)}</div>}
    </div>
  )
}

function TelaRelogio({ cfg }: { cfg: ConfigFerramentas }) {
  const agora = useAgoraMs(cfg.relogioSegundos ? 250 : 1000)
  return (
    <div className="flex h-full w-full flex-col items-center justify-center text-white" style={{ gap: '2cqh' }}>
      <div style={{ fontSize: cfg.relogioSegundos ? '24cqh' : '32cqh', fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
        {textoDaHora(agora, cfg.relogioSegundos)}
      </div>
      {cfg.relogioData && <div style={{ fontSize: '7cqh', fontWeight: 600, opacity: 0.85 }}>{textoDaData(agora)}</div>}
    </div>
  )
}

// --- temporizador

function useLeitura(t: EstadoTemporizador, cfg: ConfigFerramentas) {
  const conta = t.rodando || t.modo === 'horario'
  const agora = useAgoraMs(200, conta)
  return lerTemporizador(t, conta ? agora : Date.now(), regrasDe(cfg))
}

function TemporizadorCanto({ t, tamanho, cfg }: { t: EstadoTemporizador; tamanho: number; cfg: ConfigFerramentas }) {
  const l = useLeitura(t, cfg)
  const piscar = l.fase === 'esgotado' && cfg.temporizadorPiscar
  return (
    <div style={{ ...estiloPilula(tamanho, cfg.fundoNoCanto), textAlign: 'center' }}>
      {t.titulo && <div style={{ fontSize: '0.3em', fontWeight: 600, marginBottom: '0.2em', opacity: 0.85, letterSpacing: '.04em' }}>{t.titulo}</div>}
      <div style={{ color: COR_FASE[l.fase], animation: piscar ? 'piscar 1s steps(1) infinite' : undefined }}>{l.texto}</div>
    </div>
  )
}

function TelaTemporizador({ t, cfg }: { t: EstadoTemporizador; cfg: ConfigFerramentas }) {
  const l = useLeitura(t, cfg)
  const piscar = l.fase === 'esgotado' && cfg.temporizadorPiscar
  const comHoras = l.texto.replace('−', '').length > 5
  return (
    <div className="flex h-full w-full flex-col items-center justify-center text-white" style={{ gap: '2.5cqh' }}>
      {t.titulo && <div style={{ fontSize: '7cqh', fontWeight: 600, opacity: 0.88 }}>{t.titulo}</div>}
      <div
        style={{
          fontSize: comHoras ? '24cqh' : '34cqh',
          fontWeight: 700,
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
          color: COR_FASE[l.fase],
          animation: piscar ? 'piscar 1s steps(1) infinite' : undefined,
        }}
      >
        {l.texto}
      </div>
      {l.fracao !== null && (
        <div style={{ width: '64cqw', height: '1.6cqh', borderRadius: '1cqh', background: 'rgba(255,255,255,.18)', overflow: 'hidden' }}>
          <div style={{ width: `${l.fracao * 100}%`, height: '100%', background: COR_FASE[l.fase], transition: 'width .2s linear' }} />
        </div>
      )}
      {l.fase === 'esgotado' && cfg.temporizadorMensagem.trim() && (
        <div style={{ fontSize: '8cqh', fontWeight: 700, color: COR_FASE.esgotado }}>{cfg.temporizadorMensagem}</div>
      )}
    </div>
  )
}

// --- QR code

export function DesenhoQrSvg({ link, tamanho }: { link: string; tamanho: string }) {
  const q = useMemo(() => desenharQr(link), [link])
  if (!q) return null
  // margem de 4 módulos em volta (a "zona de silêncio" que os leitores precisam)
  const total = q.modulos + 8
  return (
    <svg viewBox={`-4 -4 ${total} ${total}`} width={tamanho} height={tamanho} shapeRendering="crispEdges" style={{ display: 'block' }}>
      <rect x={-4} y={-4} width={total} height={total} fill="#fff" />
      <path d={q.d} fill="#000" />
    </svg>
  )
}

function QrCanto({ link, texto, tamanho }: { link: string; texto: string; tamanho: number }) {
  return (
    <div style={{ background: '#fff', borderRadius: '1.2cqh', padding: '0.6cqh', maxWidth: `${tamanho * 1.6}cqh` }}>
      <DesenhoQrSvg link={link} tamanho={`${tamanho}cqh`} />
      {texto.trim() && (
        <div style={{ color: '#111', fontSize: `${Math.max(2.2, tamanho * 0.11)}cqh`, fontWeight: 700, textAlign: 'center', lineHeight: 1.15, padding: '0 0.8cqh 0.6cqh', maxWidth: `${tamanho}cqh` }}>
          {texto}
        </div>
      )}
    </div>
  )
}

function TelaQr({ link, texto, mostrarLink }: { link: string; texto: string; mostrarLink: boolean }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center text-center text-white" style={{ gap: '3cqh', padding: '3cqh' }}>
      <div style={{ borderRadius: '2cqh', overflow: 'hidden', flexShrink: 0 }}>
        <DesenhoQrSvg link={link} tamanho={texto.trim() ? '58cqh' : '68cqh'} />
      </div>
      {texto.trim() && <div style={{ fontSize: '7cqh', fontWeight: 700, lineHeight: 1.15, maxWidth: '90cqw' }}>{texto}</div>}
      {mostrarLink && <div style={{ fontSize: '3.6cqh', opacity: 0.78, maxWidth: '90cqw', wordBreak: 'break-all' }}>{link}</div>}
    </div>
  )
}

// --- mensagem

function FaixaMensagem({ texto }: { texto: string }) {
  return (
    <div
      className="absolute flex items-center justify-center text-center"
      style={{ left: 0, right: 0, bottom: 0, minHeight: ALTURA_FAIXA, padding: '1.5cqh 4cqw', background: '#facc15', color: '#111', fontSize: '6.5cqh', fontWeight: 800, lineHeight: 1.1 }}
    >
      {texto}
    </div>
  )
}

function TelaMensagem({ texto }: { texto: string }) {
  return (
    <div className="h-full w-full" style={{ padding: '6cqh 7cqw' }}>
      <TextoAjustado chave={texto} maxPct={18} estilo={{ textAlign: 'center', fontWeight: 800, lineHeight: 1.15, color: '#facc15', whiteSpace: 'pre-line' }}>
        {texto}
      </TextoAjustado>
    </div>
  )
}

// --- sorteio

/** Quantas trocas de nome já aconteceram (rápido no começo, devagar no fim). */
function trocasAte(fracao: number, duracaoS: number): number {
  // frequência cai de 16 para 3 trocas por segundo
  return Math.floor(duracaoS * (16 * fracao - 6.5 * fracao * fracao))
}

function TelaSorteio({ s }: { s: EstadoSorteio }) {
  const fim = s.inicioEm + s.duracaoMs
  const [agora, setAgora] = useState(() => Date.now())
  const animando = s.resultado.length > 0 && s.duracaoMs > 0 && agora < fim && s.amostra.length > 0
  useEffect(() => {
    setAgora(Date.now())
    if (!s.resultado.length || Date.now() >= fim) return
    const id = setInterval(() => {
      const t = Date.now()
      setAgora(t)
      if (t >= fim) clearInterval(id)
    }, 40)
    return () => clearInterval(id)
  }, [s.seq, fim, s.resultado.length])

  let corpo: ReactNode
  if (!s.resultado.length) {
    corpo = <div style={{ fontSize: '6cqh', opacity: 0.7 }}>Aguarde o sorteio…</div>
  } else if (animando) {
    const fracao = (agora - s.inicioEm) / s.duracaoMs
    const k = trocasAte(fracao, s.duracaoMs / 1000)
    const nome = s.amostra[(k * 7919 + s.seq * 31) % s.amostra.length]!
    corpo = (
      <div className="w-full truncate" style={{ fontSize: '14cqh', fontWeight: 800, opacity: 0.9 }}>
        {nome}
      </div>
    )
  } else if (s.resultado.length === 1) {
    const nome = s.resultado[0]!
    corpo = (
      <div key={s.seq} className="h-[46cqh] w-full" style={{ animation: 'surgir .7s ease both' }}>
        <TextoAjustado chave={nome} maxPct={22} estilo={{ textAlign: 'center', fontWeight: 800, lineHeight: 1.1, color: '#facc15' }}>
          {nome}
        </TextoAjustado>
      </div>
    )
  } else {
    const colunas = s.resultado.length <= 5 ? 1 : s.resultado.length <= 12 ? 2 : 3
    const fonte = colunas === 1 ? 8 : colunas === 2 ? 6 : 4.4
    corpo = (
      <div
        key={s.seq}
        className="grid w-full"
        style={{ gridTemplateColumns: `repeat(${colunas}, minmax(0, 1fr))`, gap: '1.5cqh 4cqw', fontSize: `${fonte}cqh`, fontWeight: 800, color: '#facc15', animation: 'surgir .7s ease both' }}
      >
        {s.resultado.map((n, i) => (
          <div key={n} className="truncate" style={{ textAlign: colunas === 1 ? 'center' : 'left' }}>
            <span style={{ color: 'rgba(255,255,255,.55)', marginRight: '0.4em' }}>{i + 1}.</span>
            {n}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center text-center text-white" style={{ gap: '5cqh', padding: '5cqh 6cqw' }}>
      <div style={{ fontSize: s.resultado.length ? '6.5cqh' : '13cqh', fontWeight: 700, opacity: s.resultado.length ? 0.85 : 1 }}>{s.titulo || 'Sorteio'}</div>
      {corpo}
    </div>
  )
}
