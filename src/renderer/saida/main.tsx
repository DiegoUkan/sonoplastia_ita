import '../estilos.css'
import { StrictMode, useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { type TelemetriaVideo, videoDoConteudo } from '../../shared/estado'
import { Camadas } from '../compartilhado/Camadas'
import { api, useConfig, useEstado, useTelemetrias } from '../compartilhado/ganchos'

const saidaId = new URLSearchParams(location.search).get('saida') ?? 'publico'

/** O vídeo avulso desta saída chegou ao fim: o motor decide o que fica na tela (Configurações → Vídeos e som). */
const aoTerminarVideo = (url: string) => void api.comando({ tipo: 'video:terminou', url })

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
  const videoAqui = s ? videoDoConteudo(s.conteudo) : null
  const tocaVideoAqui = !!videoAqui && !!c?.mostrarVideo
  const chave = s?.chave
  useEffect(() => {
    if (s && !tocaVideoAqui) enviar(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tocaVideoAqui, chave, enviar])

  if (!estado || !config || !s || !c) return null

  // a referência do vídeo é a primeira saída (na ordem das Telas) que toca o mesmo vídeo. Esta saída sem
  // vídeo mostra o tempo dela; esta saída tocando junto acompanha a posição dela (Público e Palco juntos).
  let telemetriaOutra = null
  let sincronizarCom = null
  if (videoAqui) {
    const url = videoAqui.url
    const referencia = config.saidas.find((x) => {
      const e = estado.saidas[x.id]
      return x.mostrarVideo && !!e && videoDoConteudo(e.conteudo)?.url === url
    })
    if (referencia && referencia.id !== saidaId) {
      const t = telemetrias[referencia.id]?.video ?? null
      if (c.mostrarVideo) sincronizarCom = t
      else telemetriaOutra = t
    }
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
        sincronizarCom={sincronizarCom}
        aoTerminarVideo={aoTerminarVideo}
        saidaAudio={config.geral.saidaAudio}
        ferramentas={estado.ferramentas}
        cfgFerramentas={config.ferramentas}
      />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Saida />
  </StrictMode>,
)
