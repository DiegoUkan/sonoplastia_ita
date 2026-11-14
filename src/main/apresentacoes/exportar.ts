/**
 * Roda os scripts do PowerShell que transformam slides em imagens (`scripts/powershell`):
 * pptx-exportar.ps1 (PowerPoint pelo COM) e pdf-exportar.ps1 (leitor de PDF do Windows).
 *
 * Se o script ficar muito tempo sem avançar (PowerPoint travado num aviso, arquivo com senha), ele é
 * encerrado, e o PowerPoint também, MAS só se foi aberto por nós (nunca o de quem estava usando).
 */
import { execFile, spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { constants, setPriority } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { TipoApresentacao } from '../../shared/apresentacao'
import { log } from '../log'

const exec = promisify(execFile)

export interface SlideExportado {
  arquivo: string
  id: number
  oculto: boolean
  notas: string
}

export interface ResultadoExportacao {
  largura: number
  altura: number
  slides: SlideExportado[]
}

export interface OpcoesExportacao {
  pastaScripts: string
  tipo: TipoApresentacao
  arquivo: string
  pasta: string
  largura: number
  aoProgresso: (feito: number, total: number) => void
  /** encerra se ficar tanto tempo sem exportar um slide (padrão 2 min: abrir um .pptx grande demora) */
  inatividadeMs?: number
}

const MENSAGENS: Record<string, string> = {
  POWERPOINT_AUSENTE: 'O PowerPoint não está instalado neste computador. Ele é necessário para importar arquivos .pptx (o PDF não precisa).',
  PDF_ILEGIVEL: 'O Windows não conseguiu abrir este PDF. Ele pode estar protegido por senha ou danificado.',
}

function powershell(): string {
  const raiz = process.env.SystemRoot || 'C:\\Windows'
  const c = join(raiz, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  return existsSync(c) ? c : 'powershell.exe'
}

/** PIDs do PowerPoint aberto agora. */
async function pidsPowerPoint(): Promise<number[]> {
  try {
    const { stdout } = await exec('tasklist', ['/FI', 'IMAGENAME eq POWERPNT.EXE', '/FO', 'CSV', '/NH'], { windowsHide: true })
    return [...stdout.matchAll(/^"POWERPNT\.EXE","(\d+)"/gim)].map((m) => Number(m[1]))
  } catch {
    return []
  }
}

/** Tira o texto das anotações do jeito do PowerPoint (\r entre parágrafos, \v nas quebras de linha). */
export function limparNotas(t: string): string {
  return t
    .replace(/\r\n?|\v/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function exportarSlides(o: OpcoesExportacao): Promise<ResultadoExportacao> {
  const script = join(o.pastaScripts, o.tipo === 'pptx' ? 'pptx-exportar.ps1' : 'pdf-exportar.ps1')
  if (!existsSync(script)) return Promise.reject(new Error(`Script não encontrado: ${script}`))
  const inatividade = o.inatividadeMs ?? 120000

  return (async () => {
    const antes = o.tipo === 'pptx' ? await pidsPowerPoint() : []
    return new Promise<ResultadoExportacao>((resolve, reject) => {
      const p = spawn(
        powershell(),
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Arquivo', o.arquivo, '-Pasta', o.pasta, '-Largura', String(o.largura)],
        { windowsHide: true },
      )
      try {
        if (p.pid) setPriority(p.pid, constants.priority.PRIORITY_BELOW_NORMAL)
      } catch {
        // sem prioridade baixa, exporta do mesmo jeito
      }
      let travou = false
      let erros = ''
      let resto = ''
      let relogio: NodeJS.Timeout
      const vigiar = () => {
        clearTimeout(relogio)
        relogio = setTimeout(() => {
          travou = true
          log.aviso(`Exportação de ${o.arquivo} parada há ${inatividade / 1000} s: encerrando.`)
          p.kill()
          // o PowerPoint roda fora do PowerShell (servidor COM): encerra só o que abrimos
          if (o.tipo === 'pptx' && antes.length === 0) {
            void pidsPowerPoint().then((pids) => {
              for (const pid of pids) {
                try {
                  process.kill(pid)
                } catch {
                  // já fechou
                }
              }
            })
          }
        }, inatividade)
      }
      vigiar()
      p.stdout.on('data', (b: Buffer) => {
        resto += b.toString('latin1')
        const linhas = resto.split(/\r?\n/)
        resto = linhas.pop() ?? ''
        for (const l of linhas) {
          const m = /^PROGRESSO (\d+)\/(\d+)/.exec(l.trim())
          if (m) {
            vigiar()
            o.aoProgresso(Number(m[1]), Number(m[2]))
          }
        }
      })
      p.stderr.on('data', (b: Buffer) => {
        erros = (erros + b.toString('latin1')).slice(-2000)
      })
      p.on('error', (e) => {
        clearTimeout(relogio)
        reject(e)
      })
      p.on('close', (codigo) => {
        clearTimeout(relogio)
        if (travou) {
          reject(
            new Error(
              o.tipo === 'pptx'
                ? 'O PowerPoint parou de responder ao abrir este arquivo (aviso aberto, senha ou arquivo danificado). Abra o arquivo no PowerPoint para conferir.'
                : 'A leitura do PDF parou de responder.',
            ),
          )
          return
        }
        let r: { ok: boolean; erro?: string } & Partial<ResultadoExportacao>
        try {
          r = JSON.parse(readFileSync(join(o.pasta, 'resultado.json'), 'utf8').replace(/^\uFEFF/, ''))
        } catch {
          reject(new Error(`A exportação falhou (código ${codigo}). ${erros.trim()}`.trim()))
          return
        }
        if (!r.ok) {
          const e = r.erro ?? ''
          reject(new Error(MENSAGENS[e] ?? (o.tipo === 'pptx' ? `O PowerPoint não conseguiu abrir o arquivo: ${e}` : `O PDF não pôde ser lido: ${e}`)))
          return
        }
        const slides = Array.isArray(r.slides) ? r.slides : r.slides ? [r.slides as unknown as SlideExportado] : []
        resolve({
          largura: r.largura ?? o.largura,
          altura: r.altura ?? 0,
          slides: slides.map((s) => ({ ...s, notas: limparNotas(s.notas ?? '') })),
        })
      })
    })
  })()
}
