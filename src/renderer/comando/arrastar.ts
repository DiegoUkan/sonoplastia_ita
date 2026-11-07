/** Arrastar e soltar dentro da tela de comando (biblioteca → miniatura das saídas). */
import type { Midia } from '../../shared/dados'
import type { VersaoMusica } from '../../shared/estado'

export const TIPO_ARRASTE = 'application/x-sonoplastia'

export type ItemArrastado =
  | { tipo: 'midia'; midia: Pick<Midia, 'id' | 'tipo' | 'nome' | 'url'> }
  | { tipo: 'musica'; id: number; titulo: string; versao: VersaoMusica }

export function iniciarArraste(e: React.DragEvent, item: ItemArrastado): void {
  e.dataTransfer.setData(TIPO_ARRASTE, JSON.stringify(item))
  e.dataTransfer.effectAllowed = 'copy'
}

export function lerArraste(e: React.DragEvent): ItemArrastado | null {
  const dado = e.dataTransfer.getData(TIPO_ARRASTE)
  if (!dado) return null
  try {
    return JSON.parse(dado) as ItemArrastado
  } catch {
    return null
  }
}

/** Arquivos vindos do Explorer (caminhos no disco). */
export function arquivosDoArraste(e: React.DragEvent): string[] {
  return [...e.dataTransfer.files].map((f) => window.api.caminhoDoArquivo(f)).filter(Boolean)
}

export function aceitaArraste(e: React.DragEvent): boolean {
  const tipos = [...e.dataTransfer.types]
  return tipos.includes(TIPO_ARRASTE) || tipos.includes('Files')
}
