/** QR code como desenho SVG (um único caminho), com a biblioteca `qrcode-generator`. */
import qrcode from 'qrcode-generator'

// acentos e outros caracteres fora do ASCII vão em UTF-8 (o padrão da biblioteca corta em 8 bits)
const utf8 = qrcode.stringToBytesFuncs['UTF-8']
if (utf8) qrcode.stringToBytes = utf8

export interface DesenhoQr {
  /** módulos por lado (sem a margem) */
  modulos: number
  /** caminho SVG dos módulos escuros, em unidades de módulo (viewBox 0 0 modulos modulos) */
  d: string
}

/** Desenho do QR code de `texto` (correção de erro média), ou null se vazio ou longo demais. */
export function desenharQr(texto: string): DesenhoQr | null {
  const t = texto.trim()
  if (!t) return null
  try {
    const q = qrcode(0, 'M')
    q.addData(t)
    q.make()
    const n = q.getModuleCount()
    let d = ''
    for (let y = 0; y < n; y++) {
      // junta os módulos escuros vizinhos da mesma linha num retângulo só
      let x = 0
      while (x < n) {
        if (!q.isDark(y, x)) {
          x++
          continue
        }
        let fim = x
        while (fim < n && q.isDark(y, fim)) fim++
        d += `M${x} ${y}h${fim - x}v1h${x - fim}z`
        x = fim
      }
    }
    return { modulos: n, d }
  } catch {
    return null
  }
}
