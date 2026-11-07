import { describe, expect, it } from 'vitest'
import { LIVROS } from '../src/shared/biblia/livros'
import { formatarReferencia, interpretarReferencia } from '../src/shared/biblia/referencia'
import { formatarMs, indiceNoTempo, lerMs, msDeTempo, temposDaVersao } from '../src/shared/musica'
import { dividirTexto } from '../src/shared/texto'

const ref = (t: string) => {
  const r = interpretarReferencia(t)
  return r.tipo === 'referencia' ? r.ref : r.tipo
}

describe('livros', () => {
  it('são 66, com siglas únicas', () => {
    expect(LIVROS).toHaveLength(66)
    expect(new Set(LIVROS.map((l) => l.abrev)).size).toBe(66)
    expect(LIVROS[42]!.nome).toBe('João')
  })
})

describe('referências digitadas', () => {
  it.each([
    ['jo 3 16', { livro: 43, capitulo: 3, inicio: 16, fim: null }],
    ['João 3:16-18', { livro: 43, capitulo: 3, inicio: 16, fim: 18 }],
    ['joao 3.16 a 18', { livro: 43, capitulo: 3, inicio: 16, fim: 18 }],
    ['jó 1', { livro: 18, capitulo: 1, inicio: null, fim: null }],
    ['sl 23', { livro: 19, capitulo: 23, inicio: null, fim: null }],
    ['salmo 91 1', { livro: 19, capitulo: 91, inicio: 1, fim: null }],
    ['1 co 13 4-7', { livro: 46, capitulo: 13, inicio: 4, fim: 7 }],
    ['1co13:4', { livro: 46, capitulo: 13, inicio: 4, fim: null }],
    ['primeira aos coríntios 13', { livro: 46, capitulo: 13, inicio: null, fim: null }],
    ['ii reis 2', { livro: 12, capitulo: 2, inicio: null, fim: null }],
    ['3 jo 1 2', { livro: 64, capitulo: 1, inicio: 2, fim: null }],
    ['isaias 53', { livro: 23, capitulo: 53, inicio: null, fim: null }],
    ['cantares de salomão 2 4', { livro: 22, capitulo: 2, inicio: 4, fim: null }],
    ['ap 21 1', { livro: 66, capitulo: 21, inicio: 1, fim: null }],
    ['gen 1 1', { livro: 1, capitulo: 1, inicio: 1, fim: null }],
    ['apocal', { livro: 66, capitulo: null, inicio: null, fim: null }],
  ])('%s', (texto, esperado) => {
    expect(ref(texto)).toEqual(esperado)
  })

  it('palavras viram busca por texto', () => {
    expect(ref('amor de deus')).toBe('texto')
    expect(ref('graça')).toBe('texto')
    expect(ref('')).toBe('vazio')
  })

  it('prefixo ambíguo pede para escolher o livro', () => {
    const r = interpretarReferencia('ju 3')
    expect(r.tipo).toBe('ambiguo')
    if (r.tipo === 'ambiguo') expect(r.livros.map((l) => l.nome)).toEqual(['Juízes', 'Judas'])
  })

  it('formata a referência', () => {
    expect(formatarReferencia(43, 3, 16)).toBe('João 3:16')
    expect(formatarReferencia(43, 3, 16, 18)).toBe('João 3:16-18')
    expect(formatarReferencia(19, 23)).toBe('Salmos 23')
  })
})

describe('tempos das músicas', () => {
  it('lê os tempos do Louvor JA', () => {
    expect(msDeTempo('00:00:08')).toBe(8000)
    expect(msDeTempo('00:01:23.5')).toBe(83500)
    expect(msDeTempo('')).toBe(0)
    expect(msDeTempo('lixo')).toBe(0)
  })

  it('formata e lê de volta no editor', () => {
    expect(formatarMs(83500)).toBe('1:23.5')
    expect(lerMs('1:23.5')).toBe(83500)
    expect(lerMs('8')).toBe(8000)
    expect(lerMs('1:2:3')).toBeNull()
  })

  const slides = [{ ms: 8000 }, { ms: 17000 }, { ms: 0 }, { ms: 25000 }]

  it('acha o trecho pelo tempo do áudio, com antecipação', () => {
    expect(indiceNoTempo(slides, 0, 250)).toBe(-1)
    expect(indiceNoTempo(slides, 7700, 250)).toBe(-1)
    expect(indiceNoTempo(slides, 7800, 250)).toBe(0)
    expect(indiceNoTempo(slides, 20000, 250)).toBe(1)
    // trecho sem tempo (0) no meio não entra na troca automática
    expect(indiceNoTempo(slides, 26000, 250)).toBe(3)
  })

  it('o primeiro trecho com tempo 0 entra assim que o áudio começa', () => {
    expect(indiceNoTempo([{ ms: 0 }, { ms: 5000 }], 0, 250)).toBe(-1)
    expect(indiceNoTempo([{ ms: 0 }, { ms: 5000 }], 100, 250)).toBe(0)
  })

  it('playback usa os próprios tempos só se existirem', () => {
    const s = [
      { msCantado: 8000, msPlayback: 0 },
      { msCantado: 17000, msPlayback: 0 },
    ]
    expect(temposDaVersao(s, 'playback')).toEqual([8000, 17000])
    expect(temposDaVersao([{ msCantado: 8000, msPlayback: 9000 }], 'playback')).toEqual([9000])
    expect(temposDaVersao(s, 'manual')).toEqual([0, 0])
  })
})

describe('divisão de versículos longos', () => {
  const longo =
    'E vi um novo céu e uma nova terra. Porque já o primeiro céu e a primeira terra passaram, e o mar já não existe. ' +
    'E eu, João, vi a santa cidade, a nova Jerusalém, que de Deus descia do céu, adereçada como uma esposa ataviada para o seu marido.'

  it('texto curto fica inteiro', () => {
    expect(dividirTexto('Jesus chorou.', 300)).toEqual(['Jesus chorou.'])
  })

  it('divide em partes parecidas, de preferência no fim da frase', () => {
    const partes = dividirTexto(longo, 140)
    expect(partes.length).toBe(2)
    expect(partes.every((p) => p.length <= 140)).toBe(true)
    expect(partes[0]!.endsWith('.')).toBe(true)
    expect(partes.join(' ')).toBe(longo)
  })

  it('nunca perde texto, mesmo sem pontuação', () => {
    const t = 'palavra '.repeat(100).trim()
    const partes = dividirTexto(t, 120)
    expect(partes.join(' ')).toBe(t)
    expect(partes.every((p) => p.length <= 120)).toBe(true)
  })
})
