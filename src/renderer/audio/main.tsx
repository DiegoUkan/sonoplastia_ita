/**
 * Janela oculta da trilha de áudio: toca as músicas e os áudios avulsos e é o "relógio" da letra.
 * A cada 50 ms calcula o trecho da música pelo tempo do áudio e avisa o motor quando ele muda.
 */
import '../estilos.css'
import { StrictMode, useCallback, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { AUDIO, type TelemetriaVideo } from '../../shared/estado'
import { indiceNoTempo } from '../../shared/musica'
import { useControleMidia, useTelemetriaMidia } from '../compartilhado/Camadas'
import { api, useConfig, useEstado } from '../compartilhado/ganchos'

function Audio() {
  const estado = useEstado()
  const [config] = useConfig()
  const ref = useRef<HTMLAudioElement>(null)
  const fonte = estado?.audio.fonte ?? null
  const url = fonte?.url ?? null

  const enviar = useCallback((video: TelemetriaVideo | null) => api.enviarTelemetria({ saidaId: AUDIO, largura: 0, altura: 0, video }), [])

  // troca de arquivo
  useEffect(() => {
    const a = ref.current
    if (!a) return
    if (!url) {
      a.pause()
      a.removeAttribute('src')
      a.load()
      enviar(null)
      return
    }
    a.src = url
    a.load()
    a.play().catch(() => {})
  }, [url, enviar])

  const controle = estado?.audio.controle ?? { tocando: false, volume: 1, mudo: false, repetir: false, ordem: 0, busca: { seq: 0, segundos: 0, relativo: false } }
  useControleMidia(ref, controle, !!url, config?.geral.saidaAudio ?? '')
  useTelemetriaMidia(ref, !!url, enviar)

  // relógio da letra
  const atual = useRef({ estado, config })
  atual.current = { estado, config }
  const ultimoIndice = useRef<number | null>(null)
  useEffect(() => {
    const id = setInterval(() => {
      const { estado: e, config: c } = atual.current
      const a = ref.current
      const m = e?.musica
      if (!a || !m || !c || m.versao === 'manual' || !m.seguirAudio || e?.audio.fonte?.tipo !== 'musica' || !a.src) {
        ultimoIndice.current = null
        return
      }
      if (a.readyState < 1) return
      const indice = indiceNoTempo(m.slides, a.currentTime * 1000, c.musicas.antecipacaoMs)
      if (ultimoIndice.current === null) ultimoIndice.current = m.indice
      if (indice !== ultimoIndice.current) {
        ultimoIndice.current = indice
        if (indice !== m.indice) api.comando({ tipo: 'musica:slide', indice, origem: 'audio' })
      }
    }, 50)
    return () => clearInterval(id)
  }, [])

  return <audio ref={ref} preload="auto" />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Audio />
  </StrictMode>,
)
