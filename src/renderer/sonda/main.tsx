/**
 * Janela oculta que analisa mídias com o mesmo motor de vídeo das saídas: duração, tamanho, se
 * toca e uma miniatura em JPEG. Responde cada pedido do motor.
 */
import type { PedidoSonda, ResultadoSonda } from '../../shared/ipc'

const api = window.api
const LARGURA_MINIATURA = 360

function desenhar(fonte: CanvasImageSource, largura: number, altura: number): string {
  const escala = Math.min(1, LARGURA_MINIATURA / Math.max(1, largura))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(largura * escala))
  c.height = Math.max(1, Math.round(altura * escala))
  c.getContext('2d')!.drawImage(fonte, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.82)
}

function esperarEvento(el: EventTarget, ok: string, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => fim(new Error('demorou demais')), ms)
    const aoOk = () => fim()
    const aoErro = () => fim(new Error('o arquivo não abre neste formato'))
    function fim(e?: Error) {
      clearTimeout(t)
      el.removeEventListener(ok, aoOk)
      el.removeEventListener('error', aoErro)
      if (e) reject(e)
      else resolve()
    }
    el.addEventListener(ok, aoOk)
    el.addEventListener('error', aoErro)
  })
}

async function analisar(p: PedidoSonda): Promise<ResultadoSonda> {
  if (p.tipo === 'imagem') {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    const carregou = esperarEvento(img, 'load', 15000)
    img.src = p.url
    await carregou
    return { id: p.id, ok: true, largura: img.naturalWidth, altura: img.naturalHeight, miniatura: desenhar(img, img.naturalWidth, img.naturalHeight) }
  }
  const m = document.createElement(p.tipo === 'video' ? 'video' : 'audio')
  m.crossOrigin = 'anonymous'
  m.muted = true
  m.preload = 'auto'
  try {
    const meta = esperarEvento(m, 'loadedmetadata', 20000)
    m.src = p.url
    await meta
    const duracao = Number.isFinite(m.duration) ? m.duration : undefined
    if (!(m instanceof HTMLVideoElement)) {
      // confirma que o áudio decodifica de fato
      await esperarEvento(m, 'canplay', 15000)
      return { id: p.id, ok: true, duracao }
    }
    if (!m.videoWidth || !m.videoHeight) return { id: p.id, ok: false, erro: 'O vídeo não tem imagem que o programa consiga mostrar.' }
    const busca = esperarEvento(m, 'seeked', 15000)
    m.currentTime = Math.min(Math.max(0, (duracao ?? 0) * 0.1), 5)
    await busca
    return { id: p.id, ok: true, duracao, largura: m.videoWidth, altura: m.videoHeight, miniatura: desenhar(m, m.videoWidth, m.videoHeight) }
  } finally {
    m.removeAttribute('src')
    m.load()
  }
}

api.aoPedidoSonda((p) => {
  analisar(p)
    .then((r) => api.responderSonda(r))
    .catch((e) => api.responderSonda({ id: p.id, ok: false, erro: e instanceof Error ? e.message : String(e) }))
})
