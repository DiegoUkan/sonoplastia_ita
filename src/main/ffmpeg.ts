import { execFile, spawn } from 'node:child_process'
import { existsSync, renameSync, rmSync } from 'node:fs'
import { constants, setPriority } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { log } from './log'

const exec = promisify(execFile)

/**
 * ffmpeg: o que vier com o programa (`resources\ffmpeg.exe`), o do Holyrics ou o do PATH.
 * O do Holyrics é de 2014: só usar filtros e opções que já existiam (ex.: `aac` com `-strict -2`).
 */
export function acharFfmpeg(pastaRecursos: string): string | null {
  const candidatos = [join(pastaRecursos, 'ffmpeg.exe'), 'C:\\Holyrics\\Holyrics\\files\\ffmpeg.exe']
  return candidatos.find((c) => existsSync(c)) ?? null
}

let videoTesteEmAndamento: Promise<string> | null = null

/**
 * Gera (uma vez) um vídeo de teste 1080p30 de 60 s com elementos em movimento e bipe a cada segundo,
 * para conferir se o vídeo roda liso em cada projetor.
 */
export function garantirVideoDeTeste(destino: string, ffmpeg: string | null): Promise<string> {
  if (existsSync(destino)) return Promise.resolve(destino)
  if (!ffmpeg) return Promise.reject(new Error('ffmpeg não encontrado (nem em resources, nem no Holyrics).'))
  if (videoTesteEmAndamento) return videoTesteEmAndamento
  const temp = destino.replace(/\.mp4$/, '.gerando.mp4')
  videoTesteEmAndamento = (async () => {
    log.info('Gerando vídeo de teste com', ffmpeg)
    try {
      await exec(
        ffmpeg,
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
      videoTesteEmAndamento = null
    }
  })()
  return videoTesteEmAndamento
}

/**
 * Converte para um formato que o programa toca: vídeo H.264/AAC em MP4 (até 1080p) ou áudio MP3.
 * Roda com prioridade baixa para não atrapalhar o resto. `aoProgresso` recebe 0 a 1.
 */
export function converter(
  ffmpeg: string,
  entrada: string,
  saida: string,
  tipo: 'video' | 'audio',
  duracao: number | null,
  aoProgresso: (p: number) => void,
): Promise<void> {
  const args =
    tipo === 'video'
      ? [
          '-y', '-hide_banner', '-i', entrada,
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p',
          '-vf', "scale='min(1920,iw)':-2",
          '-c:a', 'aac', '-strict', '-2', '-b:a', '160k', '-ac', '2',
          '-movflags', '+faststart',
          saida,
        ]
      : ['-y', '-hide_banner', '-i', entrada, '-vn', '-c:a', 'libmp3lame', '-q:a', '2', saida]
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpeg, args, { windowsHide: true })
    try {
      if (p.pid) setPriority(p.pid, constants.priority.PRIORITY_BELOW_NORMAL)
    } catch {
      // sem prioridade baixa, converte do mesmo jeito
    }
    let ultimas = ''
    let duracaoLida = duracao ?? 0
    p.stderr.on('data', (b: Buffer) => {
      const t = b.toString()
      ultimas = (ultimas + t).slice(-2000)
      if (!duracaoLida) {
        const d = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(t)
        if (d) duracaoLida = Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3])
      }
      const m = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(t)
      if (m && duracaoLida > 0) {
        const s = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
        aoProgresso(Math.min(0.99, s / duracaoLida))
      }
    })
    p.on('error', reject)
    p.on('close', (codigo) => {
      if (codigo === 0) resolve()
      else {
        rmSync(saida, { force: true })
        reject(new Error(`ffmpeg terminou com código ${codigo}: ${ultimas.split('\n').slice(-3).join(' ').trim()}`))
      }
    })
  })
}
