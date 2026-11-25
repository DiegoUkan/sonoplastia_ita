import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { constants, setPriority } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { ArquivoZip } from './apresentacoes/zip'
import { log } from './log'
import { baixarArquivo, type Buscar, descartarParcial } from './site/baixar'

const exec = promisify(execFile)

const FFMPEG_HOLYRICS = 'C:\\Holyrics\\Holyrics\\files\\ffmpeg.exe'

/**
 * O conversor novo que o programa baixa (Configurações → Vídeos e som), com versão fixa: o do Holyrics é de
 * 2014 e não lê AV1 (o vídeo do site que travou em 21/11 era AV1 2560×1440). Build "essentials" do gyan.dev
 * (publicado no GitHub; tem libdav1d para ler AV1 e libx264 para gravar H.264). Trocar a versão = conferir de
 * novo o tamanho e o SHA-256 (a página de releases do GitHub mostra o "digest" de cada arquivo).
 */
export const FFMPEG_NOVO = {
  versao: 'ffmpeg 9.0.2 (gyan.dev essentials)',
  url: 'https://github.com/GyanD/codexffmpeg/releases/download/9.0.2/ffmpeg-9.0.2-essentials_build.zip',
  bytes: 114_768_076,
  sha256: '60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba',
} as const

export const caminhoFfmpegBaixado = (pasta: string) => join(pasta, 'ffmpeg.exe')

/**
 * ffmpeg: o que vier com o programa (`resources\ffmpeg.exe`), o baixado pelo programa
 * (`C:\Sonoplastia\ffmpeg`) ou o do Holyrics. O do Holyrics é de 2014: os argumentos de conversão só usam
 * filtros e opções que já existiam (ex.: `aac` com `-strict -2`).
 */
export function acharFfmpeg(pastaRecursos: string, pastaBaixado?: string): string | null {
  const candidatos = [join(pastaRecursos, 'ffmpeg.exe'), ...(pastaBaixado ? [caminhoFfmpegBaixado(pastaBaixado)] : []), FFMPEG_HOLYRICS]
  return candidatos.find((c) => existsSync(c)) ?? null
}

/** O ffmpeg de 2014 do Holyrics (não lê AV1). */
export function ehFfmpegAntigo(caminho: string): boolean {
  return caminho.toLowerCase() === FFMPEG_HOLYRICS.toLowerCase()
}

async function sha256DoArquivo(caminho: string): Promise<string> {
  const h = createHash('sha256')
  for await (const pedaco of createReadStream(caminho)) h.update(pedaco as Buffer)
  return h.digest('hex')
}

/**
 * Baixa o conversor novo (~115 MB, com retomada), confere o SHA-256 e extrai só o `ffmpeg.exe` para `pasta`.
 * Arquivo diferente do esperado é apagado.
 */
export async function instalarFfmpeg(o: { pasta: string; buscar: Buscar; aoProgresso: (feito: number, total: number) => void }): Promise<string> {
  const exe = caminhoFfmpegBaixado(o.pasta)
  if (existsSync(exe)) return exe
  mkdirSync(o.pasta, { recursive: true })
  const zip = join(o.pasta, 'ffmpeg.zip')
  const parcial = `${zip}.part`
  await baixarArquivo({ buscar: o.buscar, url: FFMPEG_NOVO.url, parcial, tamanho: FFMPEG_NOVO.bytes, aoProgresso: o.aoProgresso })
  if ((await sha256DoArquivo(parcial)) !== FFMPEG_NOVO.sha256) {
    descartarParcial(parcial)
    throw new Error('O conversor chegou diferente do esperado (SHA-256 não confere). Foi apagado; tente de novo.')
  }
  renameSync(parcial, zip)
  rmSync(`${parcial}.etag`, { force: true })
  const z = new ArquivoZip(zip)
  try {
    const nome = z.nomes.find((n) => /(^|\/)bin\/ffmpeg\.exe$/i.test(n))
    if (!nome) throw new Error('O pacote do conversor não tinha o ffmpeg.exe.')
    const temp = `${exe}.extraindo`
    writeFileSync(temp, await z.lerAsync(nome))
    renameSync(temp, exe)
  } finally {
    z.fechar()
  }
  rmSync(zip, { force: true })
  return exe
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
 * Argumentos do ffmpeg para converter. Vídeo: H.264/AAC em MP4, cabendo em 1920×1080 sem deformar (vídeo em pé
 * fica com 1080 de altura) e no máximo 30 quadros por segundo; o que a placa GT 730 da igreja decodifica sozinha.
 * Áudio: MP3. Só opções que o ffmpeg de 2014 do Holyrics também entende.
 */
export function argumentosConversao(entrada: string, saida: string, tipo: 'video' | 'audio', opcoes: { qps?: number | null } = {}): string[] {
  if (tipo === 'audio') return ['-y', '-hide_banner', '-i', entrada, '-vn', '-c:a', 'libmp3lame', '-q:a', '2', saida]
  // mais largo que 16:9: limita a largura; senão, a altura (o outro lado acompanha, par)
  const caber = "scale='if(gt(iw*1080,ih*1920),min(1920,iw),-2)':'if(gt(iw*1080,ih*1920),-2,min(1080,ih))'"
  return [
    '-y', '-hide_banner', '-i', entrada,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p',
    '-vf', caber,
    ...(opcoes.qps && opcoes.qps > 31 ? ['-r', '30'] : []),
    '-c:a', 'aac', '-strict', '-2', '-b:a', '160k', '-ac', '2',
    '-movflags', '+faststart',
    saida,
  ]
}

/**
 * Converte para um formato que o programa toca (ver `argumentosConversao`). Roda com prioridade baixa para não
 * atrapalhar o resto. `aoProgresso` recebe 0 a 1.
 */
export function converter(
  ffmpeg: string,
  entrada: string,
  saida: string,
  tipo: 'video' | 'audio',
  duracao: number | null,
  aoProgresso: (p: number) => void,
  opcoes: { qps?: number | null } = {},
): Promise<void> {
  const args = argumentosConversao(entrada, saida, tipo, opcoes)
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
