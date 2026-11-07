import { describe, expect, it } from 'vitest'
import { Motor } from '../src/main/motor'
import { TODAS } from '../src/shared/estado'

const video = { tipo: 'video' as const, url: 'midia://local/x.mp4', nome: 'x', loop: false }

describe('Motor', () => {
  it('começa com as saídas vazias', () => {
    const m = new Motor(['publico', 'palco'])
    expect(Object.keys(m.estado.saidas)).toEqual(['publico', 'palco'])
    expect(m.estado.saidas.publico!.conteudo.tipo).toBe('vazio')
  })

  it('mostrar em todas troca o conteúdo e a chave de cada saída', () => {
    const m = new Motor(['publico', 'palco'])
    m.executar({ tipo: 'mostrar', alvo: TODAS, conteudo: { tipo: 'teste' } })
    const { publico, palco } = m.estado.saidas
    expect(publico!.conteudo.tipo).toBe('teste')
    expect(palco!.conteudo.tipo).toBe('teste')
    expect(publico!.chave).not.toBe(palco!.chave)
  })

  it('vídeo em várias saídas: só a primeira tem som', () => {
    const m = new Motor(['publico', 'palco'])
    m.executar({ tipo: 'mostrar', alvo: TODAS, conteudo: video })
    expect(m.estado.saidas.publico!.video).toMatchObject({ tocando: true, mudo: false })
    expect(m.estado.saidas.palco!.video).toMatchObject({ tocando: true, mudo: true })
  })

  it('conteúdo novo tira "limpar" e "logo", mas não o preto', () => {
    const m = new Motor(['publico', 'palco'])
    m.executar({ tipo: 'tela', alvo: 'publico', tela: 'limpar' })
    m.executar({ tipo: 'tela', alvo: 'palco', tela: 'preto' })
    m.executar({ tipo: 'mostrar', alvo: TODAS, conteudo: { tipo: 'teste' } })
    expect(m.estado.saidas.publico!.tela).toBe('normal')
    expect(m.estado.saidas.palco!.tela).toBe('preto')
  })

  it('controla o vídeo e "parar" esvazia a saída', () => {
    const m = new Motor(['publico'])
    m.executar({ tipo: 'mostrar', alvo: 'publico', conteudo: video })
    m.executar({ tipo: 'video', alvo: 'publico', acao: 'pausar' })
    expect(m.estado.saidas.publico!.video.tocando).toBe(false)
    m.executar({ tipo: 'video', alvo: 'publico', acao: 'reiniciar' })
    expect(m.estado.saidas.publico!.video).toMatchObject({ tocando: true, reinicio: 1 })
    m.executar({ tipo: 'video', alvo: 'publico', acao: 'parar' })
    expect(m.estado.saidas.publico!.conteudo.tipo).toBe('vazio')
  })

  it('volume fica entre 0 e 1', () => {
    const m = new Motor(['publico'])
    m.executar({ tipo: 'volume', alvo: 'publico', volume: 3 })
    expect(m.estado.saidas.publico!.video.volume).toBe(1)
  })

  it('ignora saída que não existe', () => {
    const m = new Motor(['publico'])
    const versao = m.estado.versao
    m.executar({ tipo: 'mostrar', alvo: 'nao-existe', conteudo: { tipo: 'teste' } })
    expect(m.estado.versao).toBe(versao)
  })

  it('acompanha as saídas da configuração sem perder o estado das que ficam', () => {
    const m = new Motor(['publico', 'palco'])
    m.executar({ tipo: 'mostrar', alvo: 'publico', conteudo: { tipo: 'teste' } })
    m.sincronizarSaidas(['publico', 'extra'])
    expect(Object.keys(m.estado.saidas)).toEqual(['publico', 'extra'])
    expect(m.estado.saidas.publico!.conteudo.tipo).toBe('teste')
  })

  it('a versão sobe a cada mudança', () => {
    const m = new Motor(['publico'])
    const v = m.estado.versao
    m.executar({ tipo: 'tela', alvo: 'publico', tela: 'logo' })
    expect(m.estado.versao).toBe(v + 1)
  })
})
