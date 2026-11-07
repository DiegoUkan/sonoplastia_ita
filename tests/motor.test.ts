import { describe, expect, it } from 'vitest'
import { type DadosAbrirMusica, Motor } from '../src/main/motor'
import { AUDIO, TODAS } from '../src/shared/estado'

const video = { tipo: 'video' as const, url: 'midia://local/x.mp4', nome: 'x', loop: false }

const musica = (extra: Partial<DadosAbrirMusica> = {}): DadosAbrirMusica => ({
  musicaId: 7,
  titulo: 'Nosso Sol é Jesus',
  album: 'JA',
  versao: 'cantado',
  slides: [
    { texto: 'O nosso sol', ms: 8000 },
    { texto: 'O caminho', ms: 17000 },
    { texto: 'Quero sempre', ms: 25000 },
  ],
  alvo: TODAS,
  fundoUrl: 'midia://local/fundo.jpg',
  audioUrl: 'midia://local/musica.mp3',
  tituloNaIntroducao: true,
  ...extra,
})

describe('Motor: saídas', () => {
  it('começa com as saídas vazias e a trilha de áudio parada', () => {
    const m = new Motor(['publico', 'palco'])
    expect(Object.keys(m.estado.saidas)).toEqual(['publico', 'palco'])
    expect(m.estado.saidas.publico!.conteudo.tipo).toBe('vazio')
    expect(m.estado.audio.fonte).toBeNull()
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

  it('controla o vídeo: pausar, buscar, repetir e "parar" esvazia a saída', () => {
    const m = new Motor(['publico'])
    m.executar({ tipo: 'mostrar', alvo: 'publico', conteudo: video })
    const ordem = m.estado.saidas.publico!.video.ordem
    m.executar({ tipo: 'midia', alvo: 'publico', acao: 'pausar' })
    expect(m.estado.saidas.publico!.video).toMatchObject({ tocando: false, ordem: ordem + 1 })
    m.executar({ tipo: 'buscar', alvo: 'publico', segundos: -10, relativo: true })
    expect(m.estado.saidas.publico!.video.busca).toMatchObject({ seq: 1, segundos: -10, relativo: true })
    m.executar({ tipo: 'repetir', alvo: 'publico', valor: true })
    expect(m.estado.saidas.publico!.video.repetir).toBe(true)
    m.executar({ tipo: 'midia', alvo: 'publico', acao: 'parar' })
    expect(m.estado.saidas.publico!.conteudo.tipo).toBe('vazio')
  })

  it('"tocar" num vídeo que já estava tocando muda a ordem (para reaplicar depois que ele terminou)', () => {
    const m = new Motor(['publico'])
    m.executar({ tipo: 'mostrar', alvo: 'publico', conteudo: video })
    const antes = m.estado.saidas.publico!.video.ordem
    m.executar({ tipo: 'midia', alvo: 'publico', acao: 'tocar' })
    expect(m.estado.saidas.publico!.video.ordem).toBe(antes + 1)
  })

  it('volume fica entre 0 e 1', () => {
    const m = new Motor(['publico'])
    m.executar({ tipo: 'volume', alvo: 'publico', volume: 3 })
    expect(m.estado.saidas.publico!.video.volume).toBe(1)
  })

  it('ignora saída que não existe, mas a versão não volta', () => {
    const m = new Motor(['publico'])
    m.executar({ tipo: 'mostrar', alvo: 'nao-existe', conteudo: { tipo: 'teste' } })
    expect(m.estado.saidas.publico!.conteudo.tipo).toBe('vazio')
  })

  it('acompanha as saídas da configuração sem perder o estado das que ficam', () => {
    const m = new Motor(['publico', 'palco'])
    m.executar({ tipo: 'mostrar', alvo: 'publico', conteudo: { tipo: 'teste' } })
    m.sincronizarSaidas(['publico', 'extra'])
    expect(Object.keys(m.estado.saidas)).toEqual(['publico', 'extra'])
    expect(m.estado.saidas.publico!.conteudo.tipo).toBe('teste')
  })
})

describe('Motor: trilha de áudio e músicas', () => {
  it('áudio avulso toca na trilha e para com "parar"', () => {
    const m = new Motor(['publico'])
    m.executar({ tipo: 'audio', fonte: { tipo: 'audio', url: 'midia://local/a.mp3', nome: 'a', midiaId: 1 } })
    expect(m.estado.audio).toMatchObject({ fonte: { nome: 'a' }, controle: { tocando: true } })
    m.executar({ tipo: 'midia', alvo: AUDIO, acao: 'parar' })
    expect(m.estado.audio.fonte).toBeNull()
  })

  it('abrir música: introdução com o título, fundo nas saídas e áudio tocando', () => {
    const m = new Motor(['publico', 'palco'])
    m.abrirMusica(musica())
    const e = m.estado
    expect(e.musica).toMatchObject({ indice: -1, seguirAudio: true })
    expect(e.audio.fonte).toMatchObject({ tipo: 'musica', versao: 'cantado' })
    expect(e.saidas.publico!.conteudo).toMatchObject({ tipo: 'letra', texto: 'Nosso Sol é Jesus', proximo: 'O nosso sol', indice: -1 })
    expect(e.saidas.publico!.fundo).toMatchObject({ tipo: 'imagem' })
  })

  it('a janela de áudio troca o trecho; o operador também, e o áudio pula para ele', () => {
    const m = new Motor(['publico'])
    m.abrirMusica(musica())
    m.executar({ tipo: 'musica:slide', indice: 0, origem: 'audio' })
    expect(m.estado.saidas.publico!.conteudo).toMatchObject({ texto: 'O nosso sol', proximo: 'O caminho' })
    const seq = m.estado.audio.controle.busca.seq
    m.executar({ tipo: 'musica:slide', indice: 2, origem: 'operador' })
    expect(m.estado.musica!.indice).toBe(2)
    expect(m.estado.audio.controle.busca).toMatchObject({ seq: seq + 1, segundos: 25 })
  })

  it('sem "clicar pula o áudio", escolher um trecho para de seguir o áudio', () => {
    const m = new Motor(['publico'])
    m.clicarPulaAudio = false
    m.abrirMusica(musica())
    m.executar({ tipo: 'musica:slide', indice: 1, origem: 'operador' })
    expect(m.estado.musica!.seguirAudio).toBe(false)
    m.executar({ tipo: 'musica:slide', indice: 2, origem: 'audio' })
    expect(m.estado.musica!.indice).toBe(1)
  })

  it('trecho só muda nas saídas que ainda mostram a letra', () => {
    const m = new Motor(['publico', 'palco'])
    m.abrirMusica(musica())
    m.executar({ tipo: 'mostrar', alvo: 'palco', conteudo: { tipo: 'teste' } })
    m.executar({ tipo: 'musica:slide', indice: 0, origem: 'audio' })
    expect(m.estado.saidas.publico!.conteudo.tipo).toBe('letra')
    expect(m.estado.saidas.palco!.conteudo.tipo).toBe('teste')
  })

  it('fechar a música limpa a letra, tira o fundo dela e para o áudio', () => {
    const m = new Motor(['publico'])
    m.abrirMusica(musica())
    m.executar({ tipo: 'musica:fechar' })
    expect(m.estado.musica).toBeNull()
    expect(m.estado.audio.fonte).toBeNull()
    expect(m.estado.saidas.publico!.conteudo.tipo).toBe('vazio')
    expect(m.estado.saidas.publico!.fundo.tipo).toBe('nenhum')
  })

  it('modo manual não toca áudio', () => {
    const m = new Motor(['publico'])
    m.abrirMusica(musica({ versao: 'manual' }))
    expect(m.estado.audio.fonte).toBeNull()
    expect(m.estado.musica!.seguirAudio).toBe(false)
  })
})
