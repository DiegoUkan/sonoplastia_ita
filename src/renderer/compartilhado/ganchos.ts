import { useCallback, useEffect, useRef, useState } from 'react'
import type { Config } from '../../shared/config'
import type { EstadoMotor, EstadoTelas, Telemetria } from '../../shared/estado'

export const api = window.api

/** Estado do motor, sempre o mais novo (descarta respostas atrasadas). */
export function useEstado(): EstadoMotor | null {
  const [estado, setEstado] = useState<EstadoMotor | null>(null)
  useEffect(() => {
    const aplicar = (e: EstadoMotor) => setEstado((atual) => (atual && atual.versao >= e.versao ? atual : e))
    api.obterEstado().then(aplicar)
    return api.aoMudarEstado(aplicar)
  }, [])
  return estado
}

/**
 * Configuração com atualização otimista: a tela muda na hora e ignora os avisos do motor enquanto
 * houver gravação pendente (senão um aviso velho desfaria o que o operador acabou de digitar).
 */
export function useConfig(): [Config | null, (c: Config) => void] {
  const [config, setConfig] = useState<Config | null>(null)
  const pendentes = useRef(0)
  useEffect(() => {
    api.obterConfig().then((c) => {
      if (pendentes.current === 0) setConfig(c)
    })
    return api.aoMudarConfig((c) => {
      if (pendentes.current === 0) setConfig(c)
    })
  }, [])
  const salvar = useCallback((c: Config) => {
    setConfig(c)
    pendentes.current += 1
    api
      .salvarConfig(c)
      .then((r) => {
        pendentes.current -= 1
        if (pendentes.current === 0) setConfig(r)
      })
      .catch((e) => {
        pendentes.current -= 1
        console.error('Configuração recusada', e)
        api.obterConfig().then(setConfig)
      })
  }, [])
  return [config, salvar]
}

export function useTelas(): EstadoTelas | null {
  const [telas, setTelas] = useState<EstadoTelas | null>(null)
  useEffect(() => {
    api.obterTelas().then(setTelas)
    return api.aoMudarTelas(setTelas)
  }, [])
  return telas
}

export function useTelemetrias(): Record<string, Telemetria> {
  const [t, setT] = useState<Record<string, Telemetria>>({})
  useEffect(() => api.aoTelemetria((x) => setT((atual) => ({ ...atual, [x.saidaId]: x }))), [])
  return t
}

/** Relógio que atualiza a cada segundo. */
export function useAgora(intervaloMs = 1000): Date {
  const [agora, setAgora] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), intervaloMs)
    return () => clearInterval(id)
  }, [intervaloMs])
  return agora
}
