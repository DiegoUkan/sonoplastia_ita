/** Protocolo próprio para as janelas lerem arquivos locais (com suporte a Range, para o vídeo pular). */
export const ESQUEMA_MIDIA = 'midia'

export function urlMidia(caminho: string): string {
  return `${ESQUEMA_MIDIA}://local/${encodeURIComponent(caminho)}`
}

export function caminhoDaUrlMidia(url: string): string {
  const u = new URL(url)
  return decodeURIComponent(u.pathname.replace(/^\/+/, ''))
}
