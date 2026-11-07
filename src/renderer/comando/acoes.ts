/** Ações usadas em vários lugares da tela de comando. */
import type { Midia } from '../../shared/dados'
import type { Alvo } from '../../shared/estado'
import { api } from '../compartilhado/ganchos'
import { arquivosDoArraste, lerArraste } from './arrastar'

/** Vídeo e imagem vão para a(s) saída(s); áudio vai para a trilha de áudio. */
export function mostrarMidia(m: Pick<Midia, 'id' | 'tipo' | 'nome' | 'url'>, alvo: Alvo): Promise<void> {
  if (m.tipo === 'audio') return api.comando({ tipo: 'audio', fonte: { tipo: 'audio', url: m.url, nome: m.nome, midiaId: m.id } })
  if (m.tipo === 'imagem') return api.comando({ tipo: 'mostrar', alvo, conteudo: { tipo: 'imagem', url: m.url, nome: m.nome } })
  return api.comando({ tipo: 'mostrar', alvo, conteudo: { tipo: 'video', url: m.url, nome: m.nome, loop: false } })
}

/** Algo solto numa miniatura: item da biblioteca, música ou arquivo do Explorer. */
export async function soltarEm(e: React.DragEvent, alvo: Alvo): Promise<string | null> {
  const item = lerArraste(e)
  if (item?.tipo === 'midia') {
    await mostrarMidia(item.midia, alvo)
    return null
  }
  if (item?.tipo === 'musica') {
    await api.abrirMusica(item.id, item.versao, alvo)
    return null
  }
  const arquivos = arquivosDoArraste(e)
  if (!arquivos.length) return null
  const r = await api.importarMidias(arquivos)
  const id = r.importadas[0] ?? r.repetidas[0]
  if (id === undefined) return r.ignoradas[0] ? `Não importado: ${r.ignoradas[0]}` : null
  const m = (await api.listarMidias({})).find((x) => x.id === id)
  if (m) await mostrarMidia(m, alvo)
  return null
}

export function mensagemDeErro(e: unknown): string {
  const t = e instanceof Error ? e.message : String(e)
  // tira o prefixo que o Electron põe nos erros vindos do processo principal
  return t.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}
