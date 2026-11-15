/** Conversa com o servidor do programa (mesmo endereço que abriu a página). */
import { useEffect, useRef, useState } from 'react'
import type { Midia, Musica, ResultadoBuscaBiblia, ResumoMusica, TipoMidia, VersaoBiblia, VersiculoTexto } from '../../shared/dados'
import type { Alvo, Comando, EstadoMotor, Telemetria, VersaoMusica } from '../../shared/estado'
import type { ConfigPublica, DirecaoPassador, MetodoRemoto } from '../../shared/remoto'
import type { EstadoTranscricao } from '../../shared/transcricao'

/** Avisado quando o servidor pede o PIN (o PIN mudou ou o cookie sumiu). */
let aoPedirPin: () => void = () => {}
export function quandoPedirPin(f: () => void): void {
  aoPedirPin = f
}

async function chamar<T>(metodo: MetodoRemoto, ...args: unknown[]): Promise<T> {
  let r: Response
  try {
    r = await fetch('/api/chamar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ metodo, args }),
    })
  } catch {
    throw new Error('Sem conexão com o computador.')
  }
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; valor?: T; erro?: string }
  if (r.status === 401) {
    aoPedirPin()
    throw new Error('Digite o PIN.')
  }
  if (!r.ok || !j.ok) throw new Error(j.erro ?? `O computador respondeu ${r.status}.`)
  return j.valor as T
}

export const api = {
  comando: (c: Comando) => chamar<void>('comando', c),
  passador: (d: DirecaoPassador) => chamar<void>('passador', d),
  listarMusicas: (busca: string) => chamar<ResumoMusica[]>('listarMusicas', busca),
  obterMusica: (id: number) => chamar<Musica | null>('obterMusica', id),
  abrirMusica: (id: number, versao: VersaoMusica, alvo: Alvo, indice?: number) => chamar<void>('abrirMusica', id, versao, alvo, indice),
  listarMidias: (tipo: TipoMidia | 'todos', busca: string) => chamar<Midia[]>('listarMidias', { tipo, busca }),
  versoesBiblia: () => chamar<VersaoBiblia[]>('versoesBiblia'),
  capitulo: (sigla: string, livro: number, capitulo: number) => chamar<VersiculoTexto[]>('capitulo', sigla, livro, capitulo),
  totalCapitulos: (sigla: string, livro: number) => chamar<number>('totalCapitulos', sigla, livro),
  buscarBiblia: (sigla: string, termo: string) => chamar<ResultadoBuscaBiblia[]>('buscarBiblia', sigla, termo),
  ligarTranscricao: (ligar: boolean) => chamar<void>('ligarTranscricao', ligar),
}

/** Miniatura de uma mídia (o servidor só entrega as da pasta de miniaturas). */
export const urlMiniatura = (url: string) => `/api/arquivo?u=${encodeURIComponent(url)}`

export async function sessao(): Promise<{ precisaPin: boolean; autorizado: boolean } | null> {
  try {
    const r = await fetch('/api/sessao', { credentials: 'same-origin', cache: 'no-store' })
    return r.ok ? await r.json() : null
  } catch {
    return null
  }
}

export async function entrar(pin: string): Promise<string | null> {
  try {
    const r = await fetch('/api/entrar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ pin }),
    })
    if (r.ok) return null
    const j = (await r.json().catch(() => ({}))) as { erro?: string }
    return j.erro ?? 'Não deu certo.'
  } catch {
    return 'Sem conexão com o computador.'
  }
}

export interface Conexao {
  conectado: boolean
  estado: EstadoMotor | null
  config: ConfigPublica | null
  telemetrias: Record<string, Telemetria>
  /** muda quando a biblioteca de mídias muda (para recarregar a lista) */
  versaoMidias: number
  /** sugestões de versículos ao vivo */
  transcricao: EstadoTranscricao | null
  /** o que está sendo dito agora */
  parcial: string
}

/** Eventos do servidor (estado do motor, configuração, telemetria). Reconecta sozinho. */
export function useConexao(ativo: boolean, aoNaoAutorizado: () => void): Conexao {
  const [c, setC] = useState<Conexao>({ conectado: false, estado: null, config: null, telemetrias: {}, versaoMidias: 0, transcricao: null, parcial: '' })
  const avisar = useRef(aoNaoAutorizado)
  avisar.current = aoNaoAutorizado

  useEffect(() => {
    if (!ativo) return
    let es: EventSource | null = null
    let espera: ReturnType<typeof setTimeout> | null = null
    let fim = false

    const abrir = () => {
      if (fim) return
      es = new EventSource('/api/eventos')
      // o primeiro estado de cada conexão vale sempre (o programa pode ter sido reaberto e a versão recomeçado)
      let ultimaVersao = -1
      es.onopen = () => setC((x) => ({ ...x, conectado: true }))
      es.addEventListener('estado', (ev) => {
        const e = JSON.parse((ev as MessageEvent).data) as EstadoMotor
        if (e.versao < ultimaVersao) return
        ultimaVersao = e.versao
        setC((x) => ({ ...x, estado: e }))
      })
      es.addEventListener('config', (ev) => setC((x) => ({ ...x, config: JSON.parse((ev as MessageEvent).data) })))
      es.addEventListener('telemetria', (ev) => {
        const t = JSON.parse((ev as MessageEvent).data) as Telemetria
        setC((x) => ({ ...x, telemetrias: { ...x.telemetrias, [t.saidaId]: t } }))
      })
      es.addEventListener('midias', () => setC((x) => ({ ...x, versaoMidias: x.versaoMidias + 1 })))
      es.addEventListener('transcricao', (ev) => {
        const t = JSON.parse((ev as MessageEvent).data) as EstadoTranscricao
        setC((x) => ({ ...x, transcricao: t, parcial: t.ligado ? x.parcial : '' }))
      })
      es.addEventListener('transcricao-parcial', (ev) => {
        const p = JSON.parse((ev as MessageEvent).data) as { texto: string }
        setC((x) => ({ ...x, parcial: p.texto }))
      })
      es.onerror = () => {
        setC((x) => ({ ...x, conectado: false }))
        // fechado de vez (ex.: 401): confere o PIN e tenta de novo; senão o navegador reconecta sozinho
        if (es && es.readyState === EventSource.CLOSED) {
          es = null
          void sessao().then((s) => {
            if (fim) return
            if (s && !s.autorizado) avisar.current()
            else espera = setTimeout(abrir, 2000)
          })
        }
      }
    }
    abrir()

    // celular volta do bloqueio: reconecta na hora
    const aoVoltar = () => {
      if (document.visibilityState === 'visible' && (!es || es.readyState === EventSource.CLOSED)) {
        if (espera) clearTimeout(espera)
        es?.close()
        abrir()
      }
    }
    document.addEventListener('visibilitychange', aoVoltar)
    return () => {
      fim = true
      if (espera) clearTimeout(espera)
      es?.close()
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [ativo])

  return c
}
