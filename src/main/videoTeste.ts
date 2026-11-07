import { execFile } from 'node:child_process'
import { existsSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { log } from './log'

const exec = promisify(execFile)

/** ffmpeg: o que vier com o programa (fase futura), o do Holyrics ou o do PATH. */
export function acharFfmpeg(pastaRecursos: string): string {
  const candidatos = [join(pastaRecursos, 'ffmpeg.exe'), 'C:\\Holyrics\\Holyrics\\files\\ffmpeg.exe']
  return candidatos.find((c) => existsSync(c)) ?? 'ffmpeg'
}

let emAndamento: Promise<string> | null = null

/**
 * Gera (uma vez) um vídeo de teste 1080p30 de 60 s com elementos em movimento e bipe a cada segundo,
 * para conferir se o vídeo roda liso em cada projetor.
 */
export function garantirVideoDeTeste(destino: string, ffmpeg: string): Promise<string> {
  if (existsSync(destino)) return Promise.resolve(destino)
  if (emAndamento) return emAndamento
  const temp = destino.replace(/\.mp4$/, '.gerando.mp4')
  emAndamento = (async () => {
    log.info('Gerando vídeo de teste com', ffmpeg)
    try {
      await exec(
        ffmpeg,
        // só filtros e opções que existem também no ffmpeg de 2014 que vem com o Holyrics
        [
          '-y', '-hide_banner', '-loglevel', 'error',
          '-f', 'lavfi', '-i', 'testsrc=size=1920x1080:rate=30',
          '-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=48000:beep_factor=4',
          '-t', '60',
          '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
          '-af', 'volume=0.15', '-c:a', 'aac', '-strict', '-2', '-b:a', '128k', '-shortest',
          temp,
        ],
        { windowsHide: true, timeout: 5 * 60 * 1000 },
      )
      renameSync(temp, destino)
      return destino
    } catch (e) {
      rmSync(temp, { force: true })
      throw e
    } finally {
      emAndamento = null
    }
  })()
  return emAndamento
}
