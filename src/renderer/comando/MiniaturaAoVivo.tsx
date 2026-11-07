import { type ReactNode, useEffect, useRef, useState } from 'react'
import { api } from '../compartilhado/ganchos'

/**
 * Miniatura que mostra a janela da saída de verdade, ao vivo (captura da própria página da saída
 * pelo Chromium, reduzida na placa de vídeo). Não decodifica o vídeo outra vez. Enquanto a captura
 * não começa, ou se a saída estiver fechada, mostra a `reserva` (o desenho da saída em escala).
 */
export function MiniaturaAoVivo({
  saidaId,
  janelaId,
  quadros,
  ligada,
  reserva,
}: {
  saidaId: string
  /** muda quando a janela da saída é recriada; null = sem janela */
  janelaId: number | null
  quadros: number
  ligada: boolean
  reserva: ReactNode
}) {
  const ref = useRef<HTMLVideoElement>(null)
  const [aoVivo, setAoVivo] = useState(false)

  useEffect(() => {
    if (!ligada || janelaId === null) {
      setAoVivo(false)
      return
    }
    let cancelado = false
    let fluxo: MediaStream | null = null
    let tentarDeNovo: ReturnType<typeof setTimeout> | null = null
    let tentativas = 0

    const iniciar = async () => {
      try {
        const id = await api.idCapturaSaida(saidaId)
        if (!id || cancelado) return
        const s = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: id, maxWidth: 640, maxHeight: 400, maxFrameRate: quadros } },
        } as unknown as MediaStreamConstraints)
        if (cancelado) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        fluxo = s
        tentativas = 0
        const v = ref.current
        if (v) {
          v.srcObject = s
          v.play().catch(() => {})
        }
        setAoVivo(true)
        s.getVideoTracks()[0]?.addEventListener('ended', () => {
          if (cancelado) return
          setAoVivo(false)
          tentarDeNovo = setTimeout(iniciar, 1500)
        })
      } catch (e) {
        if (cancelado) return
        setAoVivo(false)
        tentativas++
        if (tentativas === 1) console.warn('Miniatura ao vivo indisponível', saidaId, e)
        tentarDeNovo = setTimeout(iniciar, Math.min(30000, 2000 * tentativas))
      }
    }
    void iniciar()
    return () => {
      cancelado = true
      if (tentarDeNovo) clearTimeout(tentarDeNovo)
      fluxo?.getTracks().forEach((t) => t.stop())
      if (ref.current) ref.current.srcObject = null
    }
  }, [saidaId, janelaId, quadros, ligada])

  return (
    <div className="relative h-full w-full bg-tela">
      {!aoVivo && reserva}
      <video
        ref={ref}
        data-miniatura={saidaId}
        muted
        playsInline
        autoPlay
        className={`absolute inset-0 h-full w-full object-contain ${aoVivo ? '' : 'invisible'}`}
      />
    </div>
  )
}
