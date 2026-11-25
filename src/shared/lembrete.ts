/**
 * Lembrete do canal do PC na mesa de som (pedido de 21/11): o canal do computador fica fechado na mesa quando
 * não está em uso, e o sonoplasta esquece de abrir quando um vídeo ou uma música começa. Regras puras: o que está
 * tocando com som agora e quando lembrar (cada mídia nova com som, uma vez; pausar e tocar de novo não lembra).
 */
import { type EstadoMotor, videoDoConteudo } from './estado'

export interface SomNoAr {
  /** muda a cada mídia nova (vídeo: saída + chave do conteúdo; áudio: o arquivo) */
  chave: string
  nome: string
  tipo: 'video' | 'musica' | 'audio'
  /** tocando com som agora (sem mudo e com volume) */
  comSom: boolean
}

/** As mídias no ar que podem soltar som: a trilha de áudio e o vídeo de cada saída. */
export function sonsNoAr(e: EstadoMotor): SomNoAr[] {
  const r: SomNoAr[] = []
  const a = e.audio
  if (a.fonte) {
    r.push({
      chave: `audio:${a.fonte.url}`,
      nome: a.fonte.nome,
      tipo: a.fonte.tipo === 'musica' ? 'musica' : 'audio',
      comSom: a.controle.tocando && !a.controle.mudo && a.controle.volume > 0,
    })
  }
  for (const s of Object.values(e.saidas)) {
    const v = videoDoConteudo(s.conteudo)
    if (!v) continue
    // o mesmo vídeo em várias saídas: só a primeira solta o som (as outras estão no mudo e não contam)
    r.push({ chave: `video:${s.id}:${s.chave}`, nome: v.nome, tipo: 'video', comSom: s.video.tocando && !s.video.mudo && s.video.volume > 0 })
  }
  return r
}

/**
 * O som que acabou de começar e ainda não foi lembrado (null = nenhum). `lembrados` são as chaves já lembradas
 * enquanto continuam no ar; quem saiu do ar é esquecido (se voltar, lembra de novo).
 */
export function proximoLembrete(sons: SomNoAr[], lembrados: ReadonlySet<string>): { novo: SomNoAr | null; lembrados: Set<string> } {
  const noAr = new Set(sons.map((s) => s.chave))
  const seguem = new Set([...lembrados].filter((c) => noAr.has(c)))
  let novo: SomNoAr | null = null
  for (const s of sons) {
    if (!s.comSom || seguem.has(s.chave)) continue
    seguem.add(s.chave)
    novo ??= s
  }
  return { novo, lembrados: seguem }
}

export const ROTULO_SOM: Record<SomNoAr['tipo'], string> = { video: 'Vídeo', musica: 'Música', audio: 'Áudio' }
