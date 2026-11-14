/** Implementação do `Conversor` da biblioteca de apresentações com o Electron e o Windows. */
import { nativeImage } from 'electron'
import { promises as fsp, rmSync } from 'node:fs'
import type { TipoApresentacao } from '../../shared/apresentacao'
import { urlMidia } from '../../shared/midia'
import type { Sonda } from '../biblioteca/sonda'
import { converter } from '../ffmpeg'
import { log } from '../log'
import type { Conversor } from './biblioteca'
import { exportarSlides } from './exportar'

const LARGURA_MINIATURA = 320

export function criarConversor(o: { pastaScripts: string; sonda: Sonda; ffmpeg: string | null; largura: () => number }): Conversor {
  return {
    largura: o.largura,

    exportar: (tipo: TipoApresentacao, arquivo, pasta, largura, aoProgresso) =>
      exportarSlides({ pastaScripts: o.pastaScripts, tipo, arquivo, pasta, largura, aoProgresso }),

    async miniatura(png, destino) {
      const img = nativeImage.createFromPath(png)
      if (img.isEmpty()) throw new Error(`Imagem do slide ilegível: ${png}`)
      const { width, height } = img.getSize()
      await fsp.writeFile(destino, img.resize({ width: Math.min(LARGURA_MINIATURA, width), quality: 'good' }).toJPEG(82))
      return { largura: width, altura: height }
    },

    async prepararMidia(caminho, tipo) {
      const r = await o.sonda.analisar(urlMidia(caminho), tipo)
      if (r.ok) return caminho
      if (!o.ffmpeg) {
        log.aviso(`Mídia de slide que não toca e sem ffmpeg para converter: ${caminho} (${r.erro})`)
        return null
      }
      const destino = caminho.replace(/\.[^.\\/]+$/, '') + (tipo === 'video' ? '-convertido.mp4' : '-convertido.mp3')
      await converter(o.ffmpeg, caminho, destino, tipo, r.duracao ?? null, () => {})
      rmSync(caminho, { force: true })
      const r2 = await o.sonda.analisar(urlMidia(destino), tipo)
      return r2.ok ? destino : null
    },
  }
}
