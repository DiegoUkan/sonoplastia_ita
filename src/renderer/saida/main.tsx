import '../estilos.css'
import { StrictMode, useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { TelemetriaVideo } from '../../shared/estado'
import { Camadas } from '../compartilhado/Camadas'
import { api, useConfig, useEstado } from '../compartilhado/ganchos'

const saidaId = new URLSearchParams(location.search).get('saida') ?? 'publico'

function tamanhoReal() {
  return { largura: Math.round(innerWidth * devicePixelRatio), altura: Math.round(innerHeight * devicePixelRatio) }
}

function Saida() {
  const estado = useEstado()
  const [config] = useConfig()
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
  const tipo = s?.conteudo.tipo
  const chave = s?.chave
  useEffect(() => {
    if (tipo && tipo !== 'video') enviar(null)
  }, [tipo, chave, enviar])

  const c = config?.saidas.find((x) => x.id === saidaId)
  if (!estado || !config || !s || !c) return null
  return (
    <div style={{ width: '100vw', height: '100vh', cursor: c.esconderCursor ? 'none' : 'default' }}>
      <Camadas
        saida={s}
        config={c}
        espera={config.telaEspera}
        transicaoMs={config.geral.transicaoMs}
        resolucao={`${tamanho.largura} × ${tamanho.altura}`}
        aoTelemetriaVideo={enviar}
      />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Saida />
  </StrictMode>,
)
