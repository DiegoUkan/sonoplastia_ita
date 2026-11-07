import { EventEmitter } from 'node:events'
import { type Comando, type EstadoMotor, type EstadoSaida, TODAS } from '../shared/estado'

function saidaNova(id: string): EstadoSaida {
  return {
    id,
    conteudo: { tipo: 'vazio' },
    chave: 0,
    fundo: { tipo: 'nenhum' },
    tela: 'normal',
    video: { tocando: false, volume: 1, mudo: false, reinicio: 0 },
  }
}

/**
 * Fonte da verdade do que está no ar em cada saída. Recebe comandos e emite 'estado' com o estado
 * completo; as janelas só desenham o que recebem.
 */
export class Motor extends EventEmitter {
  private _estado: EstadoMotor = { versao: 0, saidas: {} }
  private proximaChave = 1

  constructor(ids: string[]) {
    super()
    this.sincronizarSaidas(ids)
  }

  get estado(): EstadoMotor {
    return this._estado
  }

  /** Acompanha as saídas da configuração: cria as novas e tira as removidas. */
  sincronizarSaidas(ids: string[]): void {
    const atuais = this._estado.saidas
    const saidas: Record<string, EstadoSaida> = {}
    for (const id of ids) saidas[id] = atuais[id] ?? saidaNova(id)
    const mudou = ids.length !== Object.keys(atuais).length || ids.some((id) => !atuais[id])
    if (mudou) this.publicar(saidas)
  }

  private alvos(alvo: string): string[] {
    const ids = Object.keys(this._estado.saidas)
    if (alvo === TODAS) return ids
    return ids.includes(alvo) ? [alvo] : []
  }

  executar(c: Comando): void {
    const alvos = this.alvos(c.alvo)
    if (alvos.length === 0) return
    const saidas = { ...this._estado.saidas }

    alvos.forEach((id, i) => {
      const s = { ...saidas[id]!, video: { ...saidas[id]!.video } }
      switch (c.tipo) {
        case 'mostrar':
          s.conteudo = c.conteudo
          s.chave = this.proximaChave++
          // conteúdo novo sai de "limpar" e "logo"; o preto só sai com comando explícito
          if (s.tela === 'limpar' || s.tela === 'logo') s.tela = 'normal'
          if (c.conteudo.tipo === 'video') {
            s.video.tocando = true
            // o mesmo vídeo em várias saídas: só a primeira solta o som
            s.video.mudo = i > 0
          } else {
            s.video.tocando = false
          }
          break
        case 'fundo':
          s.fundo = c.fundo
          break
        case 'tela':
          s.tela = c.tela
          break
        case 'video':
          if (s.conteudo.tipo !== 'video') break
          if (c.acao === 'tocar') s.video.tocando = true
          else if (c.acao === 'pausar') s.video.tocando = false
          else if (c.acao === 'reiniciar') {
            s.video.reinicio += 1
            s.video.tocando = true
          } else if (c.acao === 'parar') {
            s.conteudo = { tipo: 'vazio' }
            s.chave = this.proximaChave++
            s.video.tocando = false
          }
          break
        case 'volume':
          if (typeof c.volume === 'number') s.video.volume = Math.min(1, Math.max(0, c.volume))
          if (typeof c.mudo === 'boolean') s.video.mudo = c.mudo
          break
      }
      saidas[id] = s
    })
    this.publicar(saidas)
  }

  private publicar(saidas: Record<string, EstadoSaida>): void {
    this._estado = { versao: this._estado.versao + 1, saidas }
    this.emit('estado', this._estado)
  }
}
