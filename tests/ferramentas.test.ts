import { describe, expect, it } from 'vitest'
import { ClienteIluminacao } from '../src/main/iluminacao'
import { type DepsExecutor, ExecutorLiturgia } from '../src/main/liturgia/executor'
import { Motor } from '../src/main/motor'
import { completarPadroesDoPalco, type Config, configPadrao, EsquemaConfig } from '../src/shared/config'
import type { Midia } from '../src/shared/dados'
import { TODAS } from '../src/shared/estado'
import {
  alvoDoHorario,
  candidatosDoSorteio,
  faixaDeNumeros,
  faixaDoRelogio,
  formatarSegundos,
  lerTemporizador,
  modosNaSaida,
  nomesDoSorteio,
  type RegrasTemporizador,
  sobrepoe,
  sortearNomes,
  temporizadorNovo,
} from '../src/shared/ferramentas'
import { relesVisiveis } from '../src/shared/iluminacao'
import type { ItemLiturgia, Liturgia } from '../src/shared/liturgia'
import { desenharQr } from '../src/shared/qr'

const REGRAS: RegrasTemporizador = { amareloMin: 5, vermelhoMin: 1, aoTerminar: 'negativo' }

describe('Temporizador', () => {
  it('regressivo: arredonda para cima, muda de cor e conta negativo no fim', () => {
    const t = { ...temporizadorNovo(), duracaoMs: 10 * 60_000, rodando: true, desde: 0 }
    expect(lerTemporizador(t, 0, REGRAS)).toMatchObject({ texto: '10:00', fase: 'normal', fracao: 1 })
    expect(lerTemporizador(t, 500, REGRAS).texto).toBe('10:00')
    expect(lerTemporizador(t, 1000, REGRAS).texto).toBe('9:59')
    expect(lerTemporizador(t, 6 * 60_000, REGRAS).fase).toBe('amarelo')
    expect(lerTemporizador(t, 9 * 60_000 + 1, REGRAS).fase).toBe('vermelho')
    expect(lerTemporizador(t, 10 * 60_000, REGRAS)).toMatchObject({ texto: '0:00', fase: 'esgotado' })
    expect(lerTemporizador(t, 10 * 60_000 + 35_000, REGRAS)).toMatchObject({ texto: '−0:35', fase: 'esgotado' })
    // "parar no fim" fica no 0:00
    expect(lerTemporizador(t, 10 * 60_000 + 35_000, { ...REGRAS, aoTerminar: 'parar' }).texto).toBe('0:00')
  })

  it('pausado não anda; cronômetro conta para cima; horas aparecem', () => {
    const pausado = { ...temporizadorNovo(), duracaoMs: 60_000, acumuladoMs: 20_000 }
    expect(lerTemporizador(pausado, 999_999, REGRAS).texto).toBe('0:40')
    const crono = { ...temporizadorNovo(), modo: 'progressivo' as const, rodando: true, desde: 0, acumuladoMs: 0 }
    expect(lerTemporizador(crono, 61_900, REGRAS).texto).toBe('1:01')
    expect(formatarSegundos(3723)).toBe('1:02:03')
  })

  it('até um horário: hoje, ou amanhã se já passou há mais de 6 horas', () => {
    const as = (h: number, m: number) => new Date(2026, 10, 14, h, m).getTime()
    expect(alvoDoHorario('9:00', as(8, 30))).toBe(as(9, 0))
    // 5 minutos atrasado continua sendo hoje (fica negativo)
    expect(alvoDoHorario('9:00', as(9, 5))).toBe(as(9, 0))
    expect(alvoDoHorario('0:30', as(23, 0))).toBe(new Date(2026, 10, 15, 0, 30).getTime())
    expect(alvoDoHorario('25:00', as(9, 0))).toBeNull()
  })
})

describe('Sorteio e QR code', () => {
  it('lista sem vazios nem repetidos; faixa de números; sem repetir os já sorteados', () => {
    expect(nomesDoSorteio('Ana\n\n  Bia  \nAna\r\nCaio; Davi')).toEqual(['Ana', 'Bia', 'Caio', 'Davi'])
    expect(faixaDeNumeros(5, 1)).toEqual(['1', '2', '3', '4', '5'])
    expect(candidatosDoSorteio(['a', 'b', 'c'], ['b'], true)).toEqual(['a', 'c'])
    expect(candidatosDoSorteio(['a', 'b', 'c'], ['b'], false)).toEqual(['a', 'b', 'c'])
    const r = sortearNomes(['a', 'b', 'c', 'd'], 3, (n) => n - 1)
    expect(new Set(r).size).toBe(3)
    expect(sortearNomes(['a'], 5, () => 0)).toEqual(['a'])
  })

  it('QR code: desenho para um link, nada para texto vazio', () => {
    const q = desenharQr('https://itaqui.example/inscrição')
    expect(q?.modulos).toBeGreaterThanOrEqual(21)
    expect(q?.d).toMatch(/^M\d+ \d+h\d+v1h-\d+z/)
    expect(desenharQr('   ')).toBeNull()
  })
})

describe('Ferramentas no motor', () => {
  const novoMotor = () => {
    const m = new Motor(['publico', 'palco'])
    let agora = 1_000_000
    m.agora = () => agora
    return { m, passar: (ms: number) => (agora += ms) }
  }

  it('mostra e tira em cada saída (ou em todas)', () => {
    const { m } = novoMotor()
    m.executar({ tipo: 'ferramenta:mostrar', ferramenta: 'temporizador', alvo: 'palco', modo: 'canto' })
    m.executar({ tipo: 'ferramenta:mostrar', ferramenta: 'qr', alvo: TODAS, modo: 'tela' })
    expect(m.estado.ferramentas.exibicao.temporizador).toEqual({ palco: 'canto' })
    expect(m.estado.ferramentas.exibicao.qr).toEqual({ publico: 'tela', palco: 'tela' })
    m.executar({ tipo: 'ferramenta:mostrar', ferramenta: 'qr', alvo: 'publico', modo: null })
    expect(m.estado.ferramentas.exibicao.qr).toEqual({ palco: 'tela' })
  })

  it('temporizador: iniciar, pausar, ajustar, zerar e até um horário', () => {
    const { m, passar } = novoMotor()
    m.executar({ tipo: 'temporizador:definir', modo: 'regressivo', minutos: 40, titulo: 'Sermão' })
    expect(m.estado.ferramentas.temporizador).toMatchObject({ duracaoMs: 40 * 60_000, rodando: false, titulo: 'Sermão' })
    m.executar({ tipo: 'temporizador:acao', acao: 'iniciar' })
    passar(90_000)
    m.executar({ tipo: 'temporizador:acao', acao: 'pausar' })
    expect(m.estado.ferramentas.temporizador).toMatchObject({ rodando: false, acumuladoMs: 90_000 })
    m.executar({ tipo: 'temporizador:ajustar', minutos: 1 })
    expect(m.estado.ferramentas.temporizador.duracaoMs).toBe(41 * 60_000)
    m.executar({ tipo: 'temporizador:titulo', titulo: 'Mensagem' })
    expect(m.estado.ferramentas.temporizador.titulo).toBe('Mensagem')
    m.executar({ tipo: 'temporizador:acao', acao: 'zerar' })
    expect(m.estado.ferramentas.temporizador.acumuladoMs).toBe(0)

    m.executar({ tipo: 'temporizador:definir', modo: 'horario', ate: '9:00' })
    const t = m.estado.ferramentas.temporizador
    expect(t.rodando).toBe(true)
    expect(t.alvoEm).toBe(alvoDoHorario('9:00', 1_000_000))
    m.executar({ tipo: 'temporizador:ajustar', minutos: 5 })
    expect(m.estado.ferramentas.temporizador.alvoEm).toBe(t.alvoEm! + 5 * 60_000)
  })

  it('sorteio: o motor escolhe, não repete e para quando acaba a lista', () => {
    const { m } = novoMotor()
    m.aleatorio = () => 0
    const sortear = () => m.executar({ tipo: 'sorteio:sortear', lista: ['Ana', 'Bia'], quantidade: 1, semRepetir: true, duracaoMs: 3000, titulo: 'Brinde' })
    sortear()
    expect(m.estado.ferramentas.sorteio).toMatchObject({ resultado: ['Ana'], titulo: 'Brinde', duracaoMs: 3000, sorteados: ['Ana'] })
    sortear()
    expect(m.estado.ferramentas.sorteio.resultado).toEqual(['Bia'])
    const seq = m.estado.ferramentas.sorteio.seq
    sortear()
    // todos já saíram: nada muda
    expect(m.estado.ferramentas.sorteio.seq).toBe(seq)
    m.executar({ tipo: 'sorteio:zerar' })
    expect(m.estado.ferramentas.sorteio.sorteados).toEqual([])
  })

  it('o fundo das ferramentas em tela cheia segue o fundo padrão e o da seção', () => {
    const { m } = novoMotor()
    m.definirFundoPadrao({ tipo: 'imagem', url: 'midia://local/padrao.jpg', nome: 'p' })
    expect(m.estado.ferramentas.fundo).toMatchObject({ url: 'midia://local/padrao.jpg' })
    m.definirLiturgia({ liturgiaId: 1, nome: 'c', secaoId: 's', secaoNome: 'S', itemId: null, fundo: { tipo: 'imagem', url: 'midia://local/secao.jpg', nome: 's' }, fundoNasMusicas: true })
    expect(m.estado.ferramentas.fundo).toMatchObject({ url: 'midia://local/secao.jpg' })
  })
})

describe('Ferramenta em tela cheia não segura a saída', () => {
  const ligar = (m: Motor) => {
    m.executar({ tipo: 'qr:definir', link: 'https://igreja', texto: '' })
    m.executar({ tipo: 'ferramenta:mostrar', ferramenta: 'qr', alvo: TODAS, modo: 'tela' })
    m.executar({ tipo: 'ferramenta:mostrar', ferramenta: 'mensagem', alvo: 'publico', modo: 'tela' })
    m.executar({ tipo: 'ferramenta:mostrar', ferramenta: 'sorteio', alvo: 'palco', modo: 'tela' })
    m.executar({ tipo: 'ferramenta:mostrar', ferramenta: 'temporizador', alvo: TODAS, modo: 'tela' })
  }
  /** o que a saída desenha agora (a regra de `modosNaSaida`, com o conteúdo dela) */
  const desenho = (m: Motor, id: string) => {
    const s = m.estado.saidas[id]!
    return modosNaSaida(id, { relogio: 'nao' }, m.estado.ferramentas, s.conteudo.tipo !== 'vazio' && s.tela !== 'limpar')
  }

  it('abrir um vídeo numa saída põe as ferramentas dela em espera (temporizador no canto; QR e mensagem somem) e tira o sorteio', () => {
    const m = new Motor(['publico', 'palco'])
    ligar(m)
    m.executar({ tipo: 'mostrar', alvo: 'publico', conteudo: { tipo: 'video', url: 'midia://local/v.mp4', nome: 'v', loop: false } })
    const ex = m.estado.ferramentas.exibicao
    // não desliga: continuam em tela cheia, esperando
    expect(ex.qr).toEqual({ publico: 'tela', palco: 'tela' })
    expect(ex.mensagem).toEqual({ publico: 'tela' })
    expect(ex.temporizador).toEqual({ publico: 'tela', palco: 'tela' })
    expect(m.estado.ferramentas.emEspera).toMatchObject({ qr: { publico: true }, mensagem: { publico: true }, temporizador: { publico: true } })
    expect(desenho(m, 'publico')).toMatchObject({ temporizador: 'canto', qr: null, mensagem: null })
    // a outra saída não muda
    expect(ex.sorteio).toEqual({ palco: 'tela' })
    expect(desenho(m, 'palco')).toMatchObject({ temporizador: 'tela', qr: 'tela', sorteio: 'tela' })
    // o sorteio sai de vez (o resultado era daquele momento)
    m.executar({ tipo: 'mostrar', alvo: 'palco', conteudo: { tipo: 'texto', texto: 'Oi' } })
    expect(m.estado.ferramentas.exibicao.sorteio).toEqual({})
    expect(desenho(m, 'palco')).toMatchObject({ temporizador: 'canto', qr: null, sorteio: null })
  })

  it('quando a mídia sai (fim do vídeo, Parar, Esc) a ferramenta volta em tela cheia; "Não" tira de vez', () => {
    const m = new Motor(['publico', 'palco'])
    ligar(m)
    m.executar({ tipo: 'mensagem:definir', texto: 'Faltam 5 minutos' })
    const v = { tipo: 'video' as const, url: 'midia://local/v.mp4', nome: 'v', loop: false }
    m.executar({ tipo: 'mostrar', alvo: 'publico', conteudo: v })
    // fim do vídeo
    m.executar({ tipo: 'video:terminou', url: v.url })
    expect(m.estado.saidas.publico!.conteudo.tipo).toBe('vazio')
    expect(desenho(m, 'publico')).toMatchObject({ temporizador: 'tela', qr: 'tela', mensagem: 'tela' })
    // de novo um vídeo e o Esc (Limpar): volta; tirar o Limpar traz o vídeo e ela espera de novo
    m.executar({ tipo: 'mostrar', alvo: 'publico', conteudo: v })
    expect(desenho(m, 'publico')).toMatchObject({ temporizador: 'canto', qr: null })
    m.executar({ tipo: 'tela', alvo: TODAS, tela: 'limpar' })
    expect(desenho(m, 'publico')).toMatchObject({ temporizador: 'tela', qr: 'tela' })
    m.executar({ tipo: 'tela', alvo: TODAS, tela: 'normal' })
    expect(desenho(m, 'publico')).toMatchObject({ temporizador: 'canto', qr: null })
    // Parar no player
    m.executar({ tipo: 'midia', alvo: 'publico', acao: 'parar' })
    expect(desenho(m, 'publico')).toMatchObject({ temporizador: 'tela', qr: 'tela' })
    // escolher de novo "Tela cheia" põe por cima do que estiver no ar
    m.executar({ tipo: 'mostrar', alvo: 'publico', conteudo: v })
    m.executar({ tipo: 'ferramenta:mostrar', ferramenta: 'qr', alvo: 'publico', modo: 'tela' })
    expect(desenho(m, 'publico')).toMatchObject({ qr: 'tela', temporizador: 'canto' })
    // "Não" tira de vez
    m.executar({ tipo: 'ferramenta:mostrar', ferramenta: 'temporizador', alvo: 'publico', modo: null })
    m.executar({ tipo: 'midia', alvo: 'publico', acao: 'parar' })
    expect(desenho(m, 'publico')).toMatchObject({ temporizador: null, qr: 'tela' })
    expect(m.estado.ferramentas.emEspera?.temporizador).toEqual({})
  })

  it('o que está no canto fica; esvaziar a saída não tira nada', () => {
    const m = new Motor(['publico', 'palco'])
    m.executar({ tipo: 'ferramenta:mostrar', ferramenta: 'qr', alvo: 'publico', modo: 'canto' })
    m.executar({ tipo: 'ferramenta:mostrar', ferramenta: 'temporizador', alvo: 'publico', modo: 'canto' })
    m.executar({ tipo: 'ferramenta:mostrar', ferramenta: 'mensagem', alvo: 'publico', modo: 'canto' })
    m.executar({ tipo: 'mostrar', alvo: 'publico', conteudo: { tipo: 'imagem', url: 'midia://local/i.jpg', nome: 'i' } })
    expect(m.estado.ferramentas.exibicao).toMatchObject({ qr: { publico: 'canto' }, temporizador: { publico: 'canto' }, mensagem: { publico: 'canto' } })
    m.executar({ tipo: 'ferramenta:mostrar', ferramenta: 'qr', alvo: 'publico', modo: 'tela' })
    m.executar({ tipo: 'mostrar', alvo: 'publico', conteudo: { tipo: 'vazio' } })
    expect(m.estado.ferramentas.exibicao.qr).toEqual({ publico: 'tela' })
  })

  it('música e apresentação abertas liberam; o trecho que troca sozinho pelo áudio, não', () => {
    const m = new Motor(['publico', 'palco'])
    const slides = [
      { texto: 'a', ms: 0 },
      { texto: 'b', ms: 5000 },
    ]
    m.abrirMusica({ musicaId: 1, titulo: 'Hino', album: '', versao: 'cantado', slides, alvo: TODAS, fundoUrl: null, audioUrl: 'midia://local/h.mp3', tituloNaIntroducao: true })
    // o operador pôs o QR por cima da letra: o áudio andar o trecho não tira o QR
    m.executar({ tipo: 'qr:definir', link: 'https://igreja', texto: '' })
    m.executar({ tipo: 'ferramenta:mostrar', ferramenta: 'qr', alvo: TODAS, modo: 'tela' })
    m.executar({ tipo: 'musica:slide', indice: 0, origem: 'audio' })
    expect(desenho(m, 'publico').qr).toBe('tela')
    expect(desenho(m, 'palco').qr).toBe('tela')
    // o operador escolher o trecho, sim (o QR espera a música sair)
    m.executar({ tipo: 'musica:slide', indice: 1, origem: 'operador' })
    expect(desenho(m, 'publico').qr).toBeNull()
    expect(desenho(m, 'palco').qr).toBeNull()
    // a música fechou: o QR volta
    m.executar({ tipo: 'musica:fechar' })
    expect(desenho(m, 'publico').qr).toBe('tela')

    m.executar({ tipo: 'ferramenta:mostrar', ferramenta: 'qr', alvo: TODAS, modo: 'tela' })
    m.abrirMusica({ musicaId: 2, titulo: 'Outro', album: '', versao: 'manual', slides, alvo: 'palco', fundoUrl: null, audioUrl: null, tituloNaIntroducao: true })
    expect(desenho(m, 'publico').qr).toBe('tela')
    expect(desenho(m, 'palco').qr).toBeNull()
    const slide = { url: 'midia://local/s1.png', proporcao: 16 / 9, oculto: false, notas: '', midias: [] }
    m.abrirApresentacao({ apresentacaoId: 9, nome: 'Sermão', slides: [slide, { ...slide, url: 'midia://local/s2.png' }], alvo: 'publico' })
    expect(desenho(m, 'publico').qr).toBeNull()
    m.executar({ tipo: 'apresentacao:fechar' })
    expect(desenho(m, 'publico').qr).toBe('tela')
  })
})

describe('Relógio do canto com texto grande', () => {
  it('faixa do relógio em cima, embaixo (acima da faixa da mensagem) e no meio', () => {
    // 7% de altura: hora + folga = 9,8% da tela; margem de 3% da borda
    const sup = faixaDoRelogio('sup-dir', 0, 7, false, false)
    expect(sup.topo).toBeCloseTo(0.03)
    expect(sup.base).toBeCloseTo(0.128)
    const inf = faixaDoRelogio('inf-esq', 0, 7, false, true)
    expect(inf.base).toBeCloseTo(1 - 0.03 - 0.13)
    expect(faixaDoRelogio('centro', 5, 10, false, false)).toMatchObject({ topo: expect.closeTo(0.43), base: expect.closeTo(0.57) })
    // a margem de segurança da saída afasta da borda
    expect(faixaDoRelogio('sup-esq', 5, 7, false, false).topo).toBeCloseTo(0.08)
  })

  it('o texto que chega na altura do relógio cobre; o curto, no meio da tela, não', () => {
    const relogio = faixaDoRelogio('sup-dir', 0, 7, false, false)
    expect(sobrepoe({ topo: 0.06, base: 0.94 }, relogio)).toBe(true)
    expect(sobrepoe({ topo: 0.35, base: 0.65 }, relogio)).toBe(false)
    // encostar não conta (folga)
    expect(sobrepoe({ topo: relogio.base - 0.002, base: 0.9 }, relogio)).toBe(false)
  })

  it('o tamanho com texto grande vem configurado em 55%', () => {
    expect(configPadrao().ferramentas.relogioTextoGrandePct).toBe(55)
  })
})

describe('Volume único', () => {
  it('mudar o volume de um vídeo vale para o áudio e para as saídas novas, e avisa para gravar', () => {
    const m = new Motor(['publico', 'palco'])
    const gravados: number[] = []
    m.on('volume', (v: number) => gravados.push(v))
    m.executar({ tipo: 'volume', alvo: 'publico', volume: 0.4 })
    expect(m.estado.audio.controle.volume).toBe(0.4)
    expect(m.estado.saidas.palco!.video.volume).toBe(0.4)
    m.sincronizarSaidas(['publico', 'palco', 'lateral'])
    expect(m.estado.saidas.lateral!.video.volume).toBe(0.4)
    expect(gravados).toEqual([0.4])
    // o mudo continua de cada um
    m.executar({ tipo: 'volume', alvo: 'publico', mudo: true })
    expect(m.estado.saidas.publico!.video.mudo).toBe(true)
    expect(m.estado.audio.controle.mudo).toBe(false)
  })

  it('o volume gravado entra ao abrir, sem avisar de novo', () => {
    const m = new Motor(['publico'])
    let avisos = 0
    m.on('volume', () => avisos++)
    m.definirVolume(0.25)
    expect(m.estado.audio.controle.volume).toBe(0.25)
    expect(m.estado.saidas.publico!.video.volume).toBe(0.25)
    expect(avisos).toBe(0)
  })
})

describe('Configuração das ferramentas', () => {
  it('o Palco vem com o relógio no canto (também numa configuração antiga); o Público, sem', () => {
    const c = configPadrao()
    expect(c.saidas.find((s) => s.id === 'palco')?.relogio).toBe('canto')
    expect(c.saidas.find((s) => s.id === 'publico')?.relogio).toBe('nao')
    const antiga = { saidas: [{ id: 'publico', nome: 'Público' }, { id: 'palco', nome: 'Palco', mostrarVideo: false }] }
    const lida = EsquemaConfig.parse(completarPadroesDoPalco(antiga))
    expect(lida.saidas[1]!.relogio).toBe('canto')
    expect(lida.ferramentas.predefinicoes[0]).toEqual({ nome: 'Sermão', minutos: 40 })
    expect(lida.iluminacao.endereco).toBe('http://luz.local')
  })
})

// --- liturgia com ferramentas, versão escolhida na hora e luzes

const base = { titulo: '', alvo: '', ativo: true, duracaoMin: null, observacao: '', avancar: false, luzInicio: '', luzFim: '' }
const it_ = (x: Record<string, unknown>) => ({ ...base, ...x }) as ItemLiturgia

const midia = (id: number, tipo: Midia['tipo'], arquivo: string): Midia => ({
  id,
  tipo,
  nome: arquivo,
  arquivo,
  url: `midia://local/${arquivo}`,
  miniaturaUrl: null,
  duracao: 60,
  largura: 1920,
  altura: 1080,
  bytes: 1,
  situacao: 'pronto',
  detalhe: null,
  progresso: null,
  formato: null,
  pesado: null,
  otimizando: null,
  criadoEm: '',
  excluida: false,
  site: null,
})
const MIDIAS: Record<number, Midia> = { 7: midia(7, 'video', 'provai.mp4'), 8: midia(8, 'audio', 'fundo.mp3') }

function montar(itens: ItemLiturgia[], cfg: Partial<Config['iluminacao']> = {}) {
  const motor = new Motor(['publico', 'palco'])
  let agora = 5_000_000
  motor.agora = () => agora
  motor.aleatorio = () => 0
  const l: Liturgia = { id: 1, nome: 'Culto', data: null, inicio: null, modelo: false, atualizadoEm: '', secoes: [{ id: 's', nome: 'Louvor', fundo: null, fundoNasMusicas: true, itens }] }
  const abertas: string[] = []
  const luzes: string[] = []
  const config = configPadrao()
  config.iluminacao = { ...config.iluminacao, ...cfg }
  const deps: DepsExecutor = {
    motor,
    obterLiturgia: () => l,
    config: () => config,
    abrirMusica: (id, versao, alvo) => {
      abertas.push(`musica ${id} ${versao} ${alvo}`)
      // música 50 abre de verdade no motor (para conferir o fim dela); as outras só ficam anotadas
      if (id === 50) {
        motor.abrirMusica({ musicaId: id, titulo: 'Hino', album: '', versao, slides: [{ texto: 'a', ms: 0 }], alvo, fundoUrl: null, audioUrl: versao === 'manual' ? null : 'midia://local/hino.mp3', tituloNaIntroducao: true })
      }
    },
    abrirApresentacao: () => {},
    obterMidia: (id) => MIDIAS[id] ?? null,
    capitulo: () => [],
    versoes: () => [],
    urlFundo: () => null,
    luz: (c) => luzes.push(c),
  }
  return { motor, ex: new ExecutorLiturgia(deps), abertas, luzes, passar: (ms: number) => (agora += ms) }
}

describe('Liturgia: itens de ferramenta', () => {
  it('temporizador entra na saída do item e sai no próximo item (se não pedir para manter)', () => {
    const { motor, ex } = montar([
      it_({ id: 't', tipo: 'temporizador', temporizadorModo: 'regressivo', minutos: 5, ate: '', iniciar: true, modo: 'tela', manter: false, alvo: 'publico', titulo: 'Contagem' }),
      it_({ id: 'q', tipo: 'qr', link: 'https://igreja', legenda: 'Site', modo: 'canto', manter: true }),
      it_({ id: 'x', tipo: 'texto', texto: 'Oi' }),
    ])
    ex.executar(1, 't', 'todas')
    expect(motor.estado.ferramentas.exibicao.temporizador).toEqual({ publico: 'tela' })
    expect(motor.estado.ferramentas.temporizador).toMatchObject({ rodando: true, duracaoMs: 5 * 60_000, titulo: 'Contagem' })
    ex.vizinho(1, 1)
    expect(motor.estado.ferramentas.exibicao.temporizador).toEqual({})
    expect(motor.estado.ferramentas.exibicao.qr).toEqual({ publico: 'canto', palco: 'canto' })
    expect(motor.estado.ferramentas.qr).toEqual({ link: 'https://igreja', texto: 'Site' })
    // o QR pediu para ficar
    ex.vizinho(1, 1)
    expect(motor.estado.ferramentas.exibicao.qr).toEqual({ publico: 'canto', palco: 'canto' })
    ex.fechar()
  })

  it('temporizador em tela cheia que pede para continuar espera o vídeo do próximo item (no canto) e volta quando ele termina', () => {
    const { motor, ex } = montar([
      it_({ id: 't', tipo: 'temporizador', temporizadorModo: 'regressivo', minutos: 5, ate: '', iniciar: true, modo: 'tela', manter: true }),
      it_({ id: 'v', tipo: 'midia', midiaId: 7 }),
    ])
    ex.executar(1, 't', 'publico')
    expect(motor.estado.ferramentas.exibicao.temporizador).toEqual({ publico: 'tela' })
    ex.vizinho(1, 1)
    expect(motor.estado.saidas.publico!.conteudo).toMatchObject({ tipo: 'video', url: 'midia://local/provai.mp4' })
    // continua em tela cheia, esperando o vídeo sair (desenhado no canto enquanto isso)
    expect(motor.estado.ferramentas.exibicao.temporizador).toEqual({ publico: 'tela' })
    expect(motor.estado.ferramentas.emEspera?.temporizador).toEqual({ publico: true })
    const s = () => motor.estado.saidas.publico!
    const desenho = () => modosNaSaida('publico', { relogio: 'nao' }, motor.estado.ferramentas, s().conteudo.tipo !== 'vazio' && s().tela !== 'limpar')
    expect(desenho().temporizador).toBe('canto')
    expect(motor.estado.ferramentas.temporizador.rodando).toBe(true)
    // o vídeo terminou: sai do ar e o temporizador volta em tela cheia
    ex.aoTerminarVideo('midia://local/provai.mp4')
    motor.executar({ tipo: 'video:terminou', url: 'midia://local/provai.mp4' })
    expect(s().conteudo.tipo).toBe('vazio')
    expect(desenho().temporizador).toBe('tela')
    ex.fechar()
  })

  it('vídeo com "passar sozinho": no fim, a liturgia vai para o próximo item antes de o motor tirar o vídeo', () => {
    const { motor, ex } = montar([
      it_({ id: 'v', tipo: 'midia', midiaId: 7, avancar: true }),
      it_({ id: 'x', tipo: 'texto', texto: 'Depois do vídeo' }),
    ])
    ex.executar(1, 'v', 'publico')
    const chaves: string[] = []
    motor.on('estado', (e) => chaves.push(e.saidas.publico!.conteudo.tipo))
    // a ordem do processo principal: primeiro a liturgia, depois o motor
    ex.aoTerminarVideo('midia://local/provai.mp4')
    motor.executar({ tipo: 'video:terminou', url: 'midia://local/provai.mp4' })
    expect(motor.estado.liturgia?.itemId).toBe('x')
    expect(motor.estado.saidas.publico!.conteudo).toMatchObject({ tipo: 'texto', texto: 'Depois do vídeo' })
    // a tela nunca ficou vazia no meio
    expect(chaves).not.toContain('vazio')
    ex.fechar()
  })

  it('temporizador com "passar sozinho" vai para o próximo item no 0:00', () => {
    const { motor, ex, passar } = montar([
      it_({ id: 't', tipo: 'temporizador', temporizadorModo: 'regressivo', minutos: 1, ate: '', iniciar: true, modo: 'tela', manter: false, avancar: true }),
      it_({ id: 'x', tipo: 'texto', texto: 'Começou' }),
    ])
    ex.executar(1, 't', 'publico')
    passar(30_000)
    ex.conferirTemporizador()
    expect(motor.estado.liturgia?.itemId).toBe('t')
    passar(30_000)
    ex.conferirTemporizador()
    expect(motor.estado.liturgia?.itemId).toBe('x')
    expect(motor.estado.saidas.publico!.conteudo).toMatchObject({ tipo: 'texto', texto: 'Começou' })
    ex.fechar()
  })

  it('sorteio: o passador sorteia com a lista do item; QR sem link e sorteio sem nomes avisam', () => {
    const { motor, ex } = montar([
      it_({ id: 's', tipo: 'sorteio', lista: 'Ana\nBia', quantidade: 1, semRepetir: true, modo: 'tela', manter: false }),
      it_({ id: 'q', tipo: 'qr', link: ' ', legenda: '', modo: 'tela', manter: false }),
      it_({ id: 'v', tipo: 'sorteio', lista: '', quantidade: 1, semRepetir: true, modo: 'tela', manter: false }),
    ])
    ex.executar(1, 's', 'publico')
    expect(motor.estado.ferramentas.exibicao.sorteio).toEqual({ publico: 'tela' })
    expect(ex.passo(1)).toBe(true)
    expect(motor.estado.ferramentas.sorteio.resultado).toEqual(['Ana'])
    expect(() => ex.executar(1, 'q')).toThrow(/sem link/)
    expect(() => ex.executar(1, 'v')).toThrow(/vazia/)
  })
})

describe('Liturgia: música "escolher na hora"', () => {
  it('fica esperando a escolha (nada muda nas saídas) e toca a versão escolhida', () => {
    const { motor, ex, abertas } = montar([it_({ id: 'm', tipo: 'musica', musicaId: 9, versao: 'perguntar', titulo: 'Hino 100' })])
    ex.executar(1, 'm', 'todas')
    expect(abertas).toEqual([])
    expect(motor.estado.liturgia).toMatchObject({ itemId: 'm', escolherVersao: { musicaId: 9, titulo: 'Hino 100' } })
    const pedido = motor.estado.liturgia!.escolherVersao!.pedido
    ex.executar(1, 'm', 'todas', 'playback')
    expect(abertas).toEqual(['musica 9 playback todas'])
    expect(motor.estado.liturgia?.escolherVersao).toBeNull()
    // pôr no ar de novo pergunta outra vez (outro pedido)
    ex.executar(1, 'm')
    expect(motor.estado.liturgia!.escolherVersao!.pedido).toBeGreaterThan(pedido)
  })
})

describe('Liturgia: luzes da igreja', () => {
  const itens = () => [
    it_({ id: 'v', tipo: 'texto', texto: 'vídeo', luzInicio: '4. Projetor', luzFim: '1. Ligar tudo' }),
    it_({ id: 'a', tipo: 'texto', texto: 'sem luz' }),
    it_({ id: 'b', tipo: 'texto', texto: 'outro', luzFim: '3. Laterais' }),
    it_({ id: 'c', tipo: 'texto', texto: 'com início', luzInicio: '2. Desligar tudo' }),
  ]

  it('começo do item; fim do anterior quando o novo não tem começo; sem piscar', () => {
    const { ex, luzes } = montar(itens())
    ex.executar(1, 'v')
    ex.executar(1, 'a')
    expect(luzes).toEqual(['4. Projetor', '1. Ligar tudo'])
    ex.executar(1, 'b')
    // o "fim" de b não acende antes do "começo" de c
    ex.executar(1, 'c')
    expect(luzes).toEqual(['4. Projetor', '1. Ligar tudo', '2. Desligar tudo'])
  })

  it('encerrar a liturgia aplica o "fim" do item no ar; desligado nas configurações, não mexe', () => {
    const a = montar(itens())
    a.ex.executar(1, 'v')
    a.ex.fechar()
    expect(a.luzes).toEqual(['4. Projetor', '1. Ligar tudo'])
    const b = montar(itens(), { automacao: false })
    b.ex.executar(1, 'v')
    b.ex.executar(1, 'a')
    expect(b.luzes).toEqual([])
  })

  const LUZ = { luzInicio: '4. Projetor', luzFim: '1. Ligar tudo' }
  const comMidias = () => [
    it_({ id: 'video', tipo: 'midia', midiaId: 7, midiaTipo: 'video', ...LUZ }),
    it_({ id: 'texto', tipo: 'texto', texto: 'depois' }),
    it_({ id: 'audio', tipo: 'midia', midiaId: 8, midiaTipo: 'audio', ...LUZ }),
    it_({ id: 'musica', tipo: 'musica', musicaId: 50, versao: 'manual', ...LUZ }),
  ]
  const fimDoVideo = { posicao: 60, duracao: 60, tocando: false, quadros: 1, perdidos: 0 }

  it('o "fim" roda quando o vídeo termina sozinho, e não de novo ao sair do item', () => {
    const { ex, luzes } = montar(comMidias())
    ex.executar(1, 'video', 'publico')
    // ainda tocando: nada
    ex.aoTelemetria({ saidaId: 'publico', largura: 1, altura: 1, video: { ...fimDoVideo, posicao: 30, tocando: true } })
    expect(luzes).toEqual(['4. Projetor'])
    ex.aoTelemetria({ saidaId: 'publico', largura: 1, altura: 1, video: fimDoVideo })
    expect(luzes).toEqual(['4. Projetor', '1. Ligar tudo'])
    ex.vizinho(1, 1)
    expect(luzes).toEqual(['4. Projetor', '1. Ligar tudo'])
  })

  it('o "fim" roda ao sair manualmente: Parar no player, outra coisa no lugar ou próximo item', () => {
    const parar = montar(comMidias())
    parar.ex.executar(1, 'video', 'publico')
    parar.motor.executar({ tipo: 'midia', alvo: 'publico', acao: 'parar' })
    expect(parar.luzes).toEqual(['4. Projetor', '1. Ligar tudo'])

    const trocar = montar(comMidias())
    trocar.ex.executar(1, 'video', 'publico')
    // outra página põe um versículo no lugar do vídeo
    trocar.motor.executar({ tipo: 'mostrar', alvo: 'publico', conteudo: { tipo: 'texto', texto: 'Jo 3:16' } })
    expect(trocar.luzes).toEqual(['4. Projetor', '1. Ligar tudo'])

    const proximo = montar(comMidias())
    proximo.ex.executar(1, 'video', 'publico')
    proximo.ex.vizinho(1, 1)
    expect(proximo.luzes).toEqual(['4. Projetor', '1. Ligar tudo'])
  })

  it('áudio que termina e música só com a letra fechada pelo operador também aplicam o "fim"', () => {
    const { motor, ex, luzes } = montar(comMidias())
    ex.executar(1, 'audio')
    ex.aoTerminarAudio('midia://local/fundo.mp3')
    expect(luzes).toEqual(['4. Projetor', '1. Ligar tudo'])
    ex.executar(1, 'musica', 'todas')
    expect(luzes).toEqual(['4. Projetor', '1. Ligar tudo', '4. Projetor'])
    motor.executar({ tipo: 'musica:fechar' })
    expect(luzes).toEqual(['4. Projetor', '1. Ligar tudo', '4. Projetor', '1. Ligar tudo'])
  })
})

describe('Iluminação (luz.local)', () => {
  const resposta = (texto: string, ok = true) => Promise.resolve({ ok, status: ok ? 200 : 500, text: () => Promise.resolve(texto) })

  it('lê estado, nomes e cenários; os relés sem nome além dos 5 da planta ficam de fora', async () => {
    const pedidos: string[] = []
    const c = new ClienteIluminacao(
      () => ({ endereco: 'luz.local/', usuario: 'Som' }),
      (url) => {
        pedidos.push(url)
        if (url.endsWith('/status')) return resposta('[1,0,0,1,0,0,0,0]')
        if (url.endsWith('/get-names')) return resposta('["Esquerda","Frente","Relé 2","Trás","Direita","Relé 5","Palco","Relé 7"]')
        if (url.endsWith('/list-scenarios')) return resposta('["1. Ligar tudo","4. Projetor"]')
        return resposta('1')
      },
      async (nome) => (nome === 'luz.local' ? '192.168.3.191' : nome),
    )
    const e = await c.estado()
    expect(e.conectado).toBe(true)
    expect(e.reles.map((r) => `${r.id}:${r.nome}:${r.ligado ? 1 : 0}`)).toEqual(['0:Esquerda:1', '1:Frente:0', '2:Relé 2:0', '3:Trás:1', '4:Direita:0', '6:Palco:0'])
    expect(e.cenarios).toEqual(['1. Ligar tudo', '4. Projetor'])
    await c.cenario('4. Projetor')
    // o nome vira o IP (procurado uma vez só)
    expect(pedidos.at(-1)).toBe('http://192.168.3.191/load-scenario?name=4.+Projetor&user=Som')
    expect(await c.alternar(3)).toBe(true)
    expect(pedidos.at(-1)).toBe('http://192.168.3.191/toggle?id=3&user=Som')
    await expect(c.alternar(-1)).rejects.toThrow(/inválido/)
  })

  it('sem rede: conectado = false com o motivo (não rejeita)', async () => {
    const c = new ClienteIluminacao(
      () => ({ endereco: 'http://luz.local', usuario: '' }),
      () => Promise.reject(new TypeError('fetch failed')),
      async () => '192.168.3.191',
    )
    const e = await c.estado()
    expect(e.conectado).toBe(false)
    expect(e.erro).toMatch(/não foi encontrado na rede/)
    expect(relesVisiveis([], [])).toEqual([])
  })
})
