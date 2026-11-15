import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { abrirBanco } from '../src/main/banco'
import { type DepsExecutor, ExecutorLiturgia } from '../src/main/liturgia/executor'
import { RepositorioLiturgias } from '../src/main/liturgia/repositorio'
import { Motor } from '../src/main/motor'
import { configPadrao } from '../src/shared/config'
import type { Midia } from '../src/shared/dados'
import { TODAS } from '../src/shared/estado'
import {
  copiarSecoes,
  EsquemaDocumentoLiturgia,
  horariosPrevistos,
  type ItemLiturgia,
  type Liturgia,
  moverItem,
  proximoSabado,
  type SecaoLiturgia,
  vizinhoDoNoAr,
} from '../src/shared/liturgia'

const item = (id: string, extra: Partial<ItemLiturgia> = {}): ItemLiturgia =>
  ({ id, tipo: 'texto', texto: `Texto ${id}`, titulo: '', alvo: '', ativo: true, duracaoMin: null, observacao: '', avancar: false, ...extra }) as ItemLiturgia

const secao = (id: string, itens: ItemLiturgia[], extra: Partial<SecaoLiturgia> = {}): SecaoLiturgia => ({ id, nome: id, fundo: null, fundoNasMusicas: true, itens, ...extra })

describe('Liturgia: ordem, horários e modelos', () => {
  const secoes = [secao('es', [item('a'), item('b', { ativo: false })]), secao('louvor', []), secao('msg', [item('c'), item('d')])]

  it('próximo item pula os desligados e as seções vazias', () => {
    expect(vizinhoDoNoAr(secoes, null, 1)?.item.id).toBe('a')
    expect(vizinhoDoNoAr(secoes, { itemId: 'a', secaoId: 'es' }, 1)?.item.id).toBe('c')
    expect(vizinhoDoNoAr(secoes, { itemId: 'c', secaoId: 'msg' }, -1)?.item.id).toBe('a')
    expect(vizinhoDoNoAr(secoes, { itemId: 'd', secaoId: 'msg' }, 1)).toBeNull()
    expect(vizinhoDoNoAr(secoes, null, -1)).toBeNull()
  })

  it('depois da abertura de uma seção, o próximo é o 1º item dela e o anterior o último antes dela', () => {
    expect(vizinhoDoNoAr(secoes, { itemId: null, secaoId: 'msg' }, 1)?.item.id).toBe('c')
    expect(vizinhoDoNoAr(secoes, { itemId: null, secaoId: 'msg' }, -1)?.item.id).toBe('a')
    expect(vizinhoDoNoAr(secoes, { itemId: null, secaoId: 'louvor' }, 1)?.item.id).toBe('c')
    expect(vizinhoDoNoAr(secoes, { itemId: null, secaoId: 'es' }, -1)).toBeNull()
  })

  it('move item dentro da seção e entre seções (índice contado antes de tirar do lugar)', () => {
    const ids = (ss: SecaoLiturgia[]) => ss.map((s) => s.itens.map((i) => i.id).join(','))
    expect(ids(moverItem(secoes, 'a', 'es', 2))).toEqual(['b,a', '', 'c,d'])
    expect(ids(moverItem(secoes, 'd', 'msg', 0))).toEqual(['a,b', '', 'd,c'])
    expect(ids(moverItem(secoes, 'a', 'louvor', 0))).toEqual(['b', 'a', 'c,d'])
    expect(ids(moverItem(secoes, 'c', 'es', 99))).toEqual(['a,b,c', '', 'd'])
    // as seções que não mudaram continuam as mesmas (a tela não redesenha à toa)
    expect(moverItem(secoes, 'a', 'louvor', 0)[2]).toBe(secoes[2])
  })

  it('horário previsto soma as durações dos itens ligados', () => {
    const ss = [secao('es', [item('a', { duracaoMin: 15 }), item('b', { duracaoMin: 30, ativo: false })]), secao('msg', [item('c', { duracaoMin: 40 })])]
    const h = horariosPrevistos(ss, '9:00')
    expect(h.secoes.get('msg')).toBe(9 * 60 + 15)
    expect(h.itens.get('c')).toBe(9 * 60 + 15)
    expect(h.fim).toBe(9 * 60 + 55)
    expect(horariosPrevistos(ss, null).itens.size).toBe(0)
  })

  it('próximo sábado (ou hoje, se for sábado) e cópia com ids novos', () => {
    expect(proximoSabado(new Date(2026, 10, 12))).toBe('2026-11-14')
    expect(proximoSabado(new Date(2026, 10, 14))).toBe('2026-11-14')
    const c = copiarSecoes(secoes)
    expect(c[0]!.id).not.toBe('es')
    expect(c[0]!.itens[0]!.id).not.toBe('a')
    expect(c[0]!.itens[0]).toMatchObject({ tipo: 'texto', texto: 'Texto a' })
  })

  it('o esquema recusa item malformado e completa os padrões', () => {
    expect(() => EsquemaDocumentoLiturgia.parse({ secoes: [{ id: 's', itens: [{ id: 'x', tipo: 'musica' }] }] })).toThrow()
    const d = EsquemaDocumentoLiturgia.parse({ secoes: [{ id: 's', itens: [{ id: 'x', tipo: 'tela', tela: 'preto' }] }] })
    expect(d.secoes[0]).toMatchObject({ nome: 'Seção', fundo: null, fundoNasMusicas: true })
    expect(d.secoes[0]!.itens[0]).toMatchObject({ ativo: true, alvo: '', avancar: false })
  })
})

const pasta = mkdtempSync(join(tmpdir(), 'sonoplastia-liturgia-'))
const db = abrirBanco(join(pasta, 'teste.db'))
afterAll(() => {
  db.close()
  rmSync(pasta, { recursive: true, force: true })
})

describe('Liturgia: banco', () => {
  const repo = new RepositorioLiturgias(db)

  it('no primeiro uso cria o modelo "Culto de sábado" com as seções padrão', () => {
    repo.garantirModeloPadrao()
    repo.garantirModeloPadrao()
    const l = repo.listar()
    expect(l).toHaveLength(1)
    expect(l[0]).toMatchObject({ nome: 'Culto de sábado', modelo: true, secoes: 4, itens: 0 })
    expect(repo.obter(l[0]!.id)!.secoes.map((s) => s.nome)).toEqual(['Escola Sabatina', 'Louvor', 'Momento Infantil', 'Mensagem'])
  })

  it('novo culto a partir do modelo: cópia com data, ids novos, e grava edições validadas', () => {
    const modelo = repo.listar()[0]!
    const m = repo.obter(modelo.id)!
    repo.salvar(m.id, { ...m, secoes: [{ ...m.secoes[0]!, fundo: 'C:\\fundos\\es.jpg', itens: [item('x', { duracaoMin: 10 })] }, ...m.secoes.slice(1)] })
    const id = repo.copiar(modelo.id, { modelo: false, data: '2026-11-21' })
    const c = repo.obter(id)!
    expect(c).toMatchObject({ nome: 'Culto de sábado', data: '2026-11-21', inicio: '09:00', modelo: false })
    expect(c.secoes[0]).toMatchObject({ nome: 'Escola Sabatina', fundo: 'C:\\fundos\\es.jpg' })
    expect(c.secoes[0]!.id).not.toBe(m.secoes[0]!.id)
    expect(c.secoes[0]!.itens[0]).toMatchObject({ tipo: 'texto', duracaoMin: 10 })
    expect(() => repo.salvar(id, { ...c, secoes: [{ id: 's', itens: [{ id: 'y', tipo: 'nada' }] }] as never })).toThrow()
    expect(repo.obter(id)!.secoes).toHaveLength(4)
    // modelos ficam primeiro na lista
    expect(repo.listar().map((l) => l.modelo)).toEqual([true, false])
    repo.excluir(id)
    expect(repo.obter(id)).toBeNull()
  })
})

describe('Liturgia: fundo da seção no motor', () => {
  const fundoSecao = { tipo: 'imagem' as const, url: 'midia://local/es.jpg', nome: 'ES' }
  const lit = (fundoNasMusicas: boolean) => ({ liturgiaId: 1, nome: 'Culto', secaoId: 's', secaoNome: 'ES', itemId: 'a', fundo: fundoSecao, fundoNasMusicas })

  it('versículo e texto usam o fundo da seção no lugar do padrão; encerrar volta o padrão', () => {
    const m = new Motor(['publico'])
    m.definirFundoPadrao({ tipo: 'imagem', url: 'midia://local/padrao.jpg', nome: 'p' })
    m.executar({ tipo: 'mostrar', alvo: TODAS, conteudo: { tipo: 'texto', texto: 'Aviso' } })
    m.definirLiturgia(lit(true))
    expect(m.estado.saidas.publico!.fundo).toEqual(fundoSecao)
    m.executar({ tipo: 'liturgia:fechar' })
    expect(m.estado.liturgia).toBeNull()
    expect(m.estado.saidas.publico!.fundo).toMatchObject({ url: 'midia://local/padrao.jpg' })
  })

  it('música: fundo da seção só se a seção pedir; senão a imagem da música', () => {
    const musica = {
      musicaId: 1,
      titulo: 'Hino',
      album: '',
      versao: 'manual' as const,
      slides: [{ texto: 'a', ms: 0 }],
      alvo: TODAS,
      fundoUrl: 'midia://local/hino.jpg',
      audioUrl: null,
      tituloNaIntroducao: true,
    }
    const m = new Motor(['publico'])
    m.definirLiturgia(lit(true))
    m.abrirMusica(musica)
    expect(m.estado.saidas.publico!.fundo).toEqual(fundoSecao)
    m.definirLiturgia(lit(false))
    expect(m.estado.saidas.publico!.fundo).toMatchObject({ url: 'midia://local/hino.jpg' })
  })
})

/** Executor com dependências de mentira (sem Electron). */
function montarExecutor(l: Liturgia) {
  const motor = new Motor(['publico', 'palco'])
  const abertas: string[] = []
  const midias: Record<number, Midia> = {
    7: { id: 7, tipo: 'video', nome: 'Provai e Vede', arquivo: 'v.mp4', url: 'midia://local/v.mp4', miniaturaUrl: null, duracao: 60, largura: 1920, altura: 1080, bytes: 1, situacao: 'pronto', detalhe: null, progresso: null, criadoEm: '', excluida: false, site: null },
  }
  const versiculos = [
    { versiculo: 16, texto: 'Porque Deus amou o mundo de tal maneira…' },
    { versiculo: 17, texto: 'x '.repeat(400).trim() },
    { versiculo: 18, texto: 'Quem nele crê não é condenado.' },
  ]
  const deps: DepsExecutor = {
    motor,
    obterLiturgia: (id) => (id === l.id ? l : null),
    config: () => configPadrao(),
    abrirMusica: (id, versao, alvo) => {
      abertas.push(`musica ${id} ${versao} ${alvo}`)
      motor.abrirMusica({ musicaId: id, titulo: 'Hino', album: '', versao, slides: [{ texto: 'a', ms: 0 }], alvo, fundoUrl: null, audioUrl: 'midia://local/hino.mp3', tituloNaIntroducao: true })
    },
    abrirApresentacao: (id) => abertas.push(`apresentacao ${id}`),
    obterMidia: (id) => midias[id] ?? null,
    capitulo: () => versiculos,
    versoes: () => [{ sigla: 'ARA', nome: 'Almeida', versiculos: 3 }],
    urlFundo: (c) => `midia://local/${c}`,
  }
  return { motor, abertas, ex: new ExecutorLiturgia(deps) }
}

describe('Liturgia: executar', () => {
  const l: Liturgia = {
    id: 1,
    nome: 'Culto de sábado',
    data: '2026-11-14',
    inicio: '09:00',
    modelo: false,
    atualizadoEm: '',
    secoes: [
      secao('es', [item('aviso'), { ...item('hino'), tipo: 'musica', musicaId: 5, versao: 'cantado', avancar: true } as ItemLiturgia], { fundo: 'es.jpg' }),
      secao('msg', [
        { ...item('video'), tipo: 'midia', midiaId: 7, midiaTipo: 'video', avancar: true } as ItemLiturgia,
        { ...item('verso'), tipo: 'biblia', referencia: 'jo 3 16', sigla: '' } as ItemLiturgia,
        { ...item('sumiu'), tipo: 'midia', midiaId: 99, midiaTipo: 'video' } as ItemLiturgia,
      ]),
    ],
  }

  it('põe o texto no ar com o fundo da seção, e a abertura mostra a imagem da seção', () => {
    const { motor, ex } = montarExecutor(l)
    ex.executar(1, 'aviso', 'publico')
    expect(motor.estado.liturgia).toMatchObject({ liturgiaId: 1, secaoId: 'es', itemId: 'aviso', fundo: { url: 'midia://local/es.jpg' } })
    expect(motor.estado.saidas.publico!.conteudo).toMatchObject({ tipo: 'texto', texto: 'Texto aviso' })
    expect(motor.estado.saidas.publico!.fundo).toMatchObject({ url: 'midia://local/es.jpg' })
    expect(motor.estado.saidas.palco!.conteudo.tipo).toBe('vazio')
    ex.abertura(1, 'es')
    expect(motor.estado.liturgia?.itemId).toBeNull()
    expect(motor.estado.saidas.publico!.conteudo).toMatchObject({ tipo: 'imagem', url: 'midia://local/es.jpg' })
    // depois da abertura, o próximo é o 1º item da seção
    expect(ex.vizinho(1, 1)).toBe('aviso')
  })

  it('música com "passar sozinho": no fim do áudio vai para o próximo item (o vídeo da outra seção)', () => {
    const { motor, ex, abertas } = montarExecutor(l)
    ex.executar(1, 'hino', TODAS)
    expect(abertas).toEqual(['musica 5 cantado todas'])
    motor.executar({ tipo: 'audio:terminou', url: 'midia://local/hino.mp3' })
    ex.aoTerminarAudio('midia://local/hino.mp3')
    expect(motor.estado.liturgia).toMatchObject({ itemId: 'video', secaoId: 'msg', fundo: { tipo: 'nenhum' } })
    expect(motor.estado.saidas.publico!.conteudo).toMatchObject({ tipo: 'video', url: 'midia://local/v.mp4' })
  })

  it('vídeo com "passar sozinho": a telemetria do fim faz avançar uma vez só', () => {
    const { motor, ex } = montarExecutor(l)
    ex.executar(1, 'video', 'publico')
    const fim = { saidaId: 'publico', largura: 1024, altura: 768, video: { posicao: 59.9, duracao: 60, tocando: false, quadros: 1, perdidos: 0 } }
    ex.aoTelemetria({ ...fim, video: { ...fim.video, posicao: 30, tocando: true } })
    expect(motor.estado.liturgia?.itemId).toBe('video')
    ex.aoTelemetria(fim)
    expect(motor.estado.liturgia?.itemId).toBe('verso')
    ex.aoTelemetria(fim)
    expect(motor.estado.liturgia?.itemId).toBe('verso')
  })

  it('versículo: o passador anda pelas partes do longo e pelos versículos do capítulo', () => {
    const { motor, ex } = montarExecutor(l)
    ex.executar(1, 'verso', 'publico')
    const ref = () => (motor.estado.saidas.publico!.conteudo as { referencia: string }).referencia
    expect(ref()).toBe('João 3:16 (ARA)')
    expect(ex.passo(1)).toBe(true)
    expect(ref()).toMatch(/^João 3:17 \(1\/\d\) \(ARA\)$/)
    ex.passo(-1)
    expect(ref()).toBe('João 3:16 (ARA)')
  })

  it('item com problema não muda o que está no ar e explica o motivo', () => {
    const { motor, ex } = montarExecutor(l)
    ex.executar(1, 'aviso', 'publico')
    expect(() => ex.executar(1, 'sumiu')).toThrow(/não está mais na biblioteca/)
    expect(motor.estado.liturgia?.itemId).toBe('aviso')
    expect(ex.passo(1)).toBe(false)
  })

  it('"próximo" num item com problema avisa, mas não prende: o clique seguinte passa dele', () => {
    const { motor, ex } = montarExecutor(l)
    ex.executar(1, 'verso')
    expect(() => ex.vizinho(1, 1)).toThrow(/não está mais na biblioteca/)
    expect(motor.estado.liturgia?.itemId).toBe('sumiu')
    // o versículo continua no ar
    expect(motor.estado.saidas.publico!.conteudo.tipo).toBe('versiculo')
    expect(ex.vizinho(1, 1)).toBeNull()
    expect(ex.vizinho(1, -1)).toBe('verso')
    ex.fechar()
    expect(motor.estado.liturgia).toBeNull()
  })
})
