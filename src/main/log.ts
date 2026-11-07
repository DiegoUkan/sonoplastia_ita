import { appendFileSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'

const LIMITE_BYTES = 2 * 1024 * 1024
let arquivo: string | null = null

export function iniciarLog(pasta: string): void {
  arquivo = join(pasta, 'sonoplastia.log')
  try {
    if (statSync(arquivo).size > LIMITE_BYTES) renameSync(arquivo, join(pasta, 'sonoplastia.1.log'))
  } catch {
    // ainda não existe
  }
}

function escrever(nivel: string, partes: unknown[]): void {
  const texto = partes.map((p) => (p instanceof Error ? (p.stack ?? p.message) : String(p))).join(' ')
  const linha = `${new Date().toISOString()} [${nivel}] ${texto}`
  if (nivel === 'ERRO') console.error(linha)
  else console.log(linha)
  if (!arquivo) return
  try {
    appendFileSync(arquivo, linha + '\n', 'utf8')
  } catch {
    // sem log em disco não é motivo para parar
  }
}

export const log = {
  info: (...p: unknown[]) => escrever('INFO', p),
  aviso: (...p: unknown[]) => escrever('AVISO', p),
  erro: (...p: unknown[]) => escrever('ERRO', p),
}
