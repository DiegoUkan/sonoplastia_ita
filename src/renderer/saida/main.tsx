import '../estilos.css'
import { StrictMode, useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { TelemetriaVideo } from '../../shared/estado'
import { Camadas } from '../compartilhado/Camadas'
import { api, useConfig, useEstado, useTelemetrias } from '../compartilhado/ganchos'

const saidaId = new URLSearchParams(location.search).get('saida') ?? 'publico'

function tamanhoReal() {
  return { largura: Math.round(innerWidth * devicePixelRatio), altura: Math.round(innerHeight * devicePixelRatio) }
}

function Saida() {
  const estado = useEstado()
  const [config] = useConfig()
  const telemetrias = useTelemetrias()
  const [tamanho, setTamanho] = useState(tamanhoReal)
  const ultimoVideo = useRef<TelemetriaVideo | null>(null)

  const enviar = useCallback((video: TelemetriaVideo | null) => {
    ultimoVideo.current = video
    api.enviarTelemetria({ saidaId, ...tamanhoReal(), video })
  }, [])

  useEffect(() => {
    const aoRedimensionar = () => {
      setTamanho(tamanhoReal())
      enviar(ultimoVideo.current)
    }
    aoRedimensionar()
    addEventListener('resize', aoRedimensionar)
    return () => removeEventListener('resize', aoRedimensionar)
  }, [enviar])

  const s = estado?.saidas[saidaId]
  const c = config?.saidas.find((x) => x.id === saidaId)
  const tocaVideoAqui = s?.conteudo.tipo === 'video' && !!c?.mostrarVideo
  const chave = s?.chave
  useEffect(() => {
    if (s && !tocaVideoAqui) enviar(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tocaVideoAqui, chave, enviar])

  if (!estado || !config || !s || !c) return null

  // esta saída não mostra vídeo: usa o tempo da saída que está tocando o mesmo vídeo
  let telemetriaOutra = null
  if (s.conteudo.tipo === 'video' && !c.mostrarVideo) {
    const url = s.conteudo.url
    const outra = config.saidas.find((x) => x.id !== saidaId && x.mostrarVideo && estado.saidas[x.id]?.conteudo.tipo === 'video' && (estado.saidas[x.id]!.conteudo as { url: string }).url === url)
    telemetriaOutra = outra ? (telemetrias[outra.id]?.video ?? null) : null
  }

  return (
    <div style={{ width: '100vw', height: '100vh', cursor: c.esconderCursor ? 'none' : 'default' }}>
      <Camadas
        saida={s}
        config={c}
        espera={config.telaEspera}
        transicaoMs={config.geral.transicaoMs}
        resolucao={`${tamanho.largura} × ${tamanho.altura}`}
        aoTelemetriaVideo={enviar}
        telemetriaVideo={telemetriaOutra}
        saidaAudio={config.geral.saidaAudio}
      />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Saida />
  </StrictMode>,
)
