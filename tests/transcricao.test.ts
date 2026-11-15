/**
 * Sugestões de versículos ao vivo (porta do projeto Transcrição_tempo_real): referências faladas,
 * busca por palavras, a escolha da IA (com uma IA falsa), o motor e a ElevenLabs (com um WebSocket
 * falso). Nada aqui usa a internet nem as chaves de verdade.
 */
import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingHttpHeaders } from 'node:http'
import type { AddressInfo } from 'node:net'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { lerBibliaJson } from '../src/main/biblia/repositorio'
import { agruparVizinhos, BibliaMemoria, type Candidato, type LinhaVersiculo, termos } from '../src/main/transcricao/busca'
import { lerMensagem, type SoqueteMinimo, TranscritorElevenLabs, urlElevenLabs } from '../src/main/transcricao/elevenlabs'
import { EscolhedorIA, extrairJson, ProvedorAnthropic, type ProvedorIA, urlDaApi } from '../src/main/transcricao/ia'
import { importarDoProjetoTranscricao, lerEnv } from '../src/main/transcricao/importar'
import { resolverLivro } from '../src/main/transcricao/livrosFalados'
import { limiaresSemIa, MotorSugestoes, type Transcritor } from '../src/main/transcricao/motor'
import { converter } from '../src/main/transcricao/numeros'
import { encontrar, Rastreador } from '../src/main/transcricao/parser'
import { type ContagemBiblia, passagem, referencia, sobrepoe } from '../src/main/transcricao/passagem'
import { EsquemaTranscricao } from '../src/shared/config'

/** Tamanho dos capítulos usados nos testes (os outros "não existem"). */
const CAPITULOS: Record<string, number> = {
  '1:1': 31, // Gênesis 1
  '18:19': 29, // Jó 19
  '19:23': 6, // Salmos 23
  '19:91': 16,
  '19:119': 176,
  '23:53': 12, // Isaías 53
  '35:3': 19, // Habacuque 3
  '40:6': 34, // Mateus 6
  '41:16': 20, // Marcos 16
  '43:1': 51, // João 1
  '43:3': 36,
  '44:2': 47, // Atos 2
  '45:8': 39, // Romanos 8
  '45:12': 21,
  '46:13': 13, // 1 Coríntios 13
  '50:4': 23, // Filipenses 4
  '52:5': 28, // 1 Tessalonicenses 5
  '55:3': 17, // 2 Timóteo 3
  '58:11': 40, // Hebreus 11
  '60:5': 14, // 1 Pedro 5
  '62:1': 10, // 1 João 1
}
const contagem: ContagemBiblia = { versiculosNoCapitulo: (l, c) => CAPITULOS[`${l}:${c}`] ?? 0 }
const refs = (texto: string) => encontrar(texto, contagem).map((p) => referencia(p))

describe('referências faladas', () => {
  it.each([
    ['Vamos abrir em Romanos 8', ['Romanos 8']],
    ['João 3:16', ['João 3:16']],
    ['João capítulo três, versículo dezesseis', ['João 3:16']],
    ['leia comigo primeira aos Coríntios 13', ['1 Coríntios 13']],
    ['Salmo 23', ['Salmos 23']],
    ['Gênesis 1 do 1 ao 3', ['Gênesis 1:1-3']],
    ['Filipenses 4, 6 e 7', ['Filipenses 4:6-7']],
    ['Filipenses 4, versículo 6', ['Filipenses 4:6']],
    ['Habacuque, capítulo 3, versículo 17', ['Habacuque 3:17']],
    ['primeiro aos Tessalonicenses 5', ['1 Tessalonicenses 5']],
    ['segunda carta de Paulo a Timóteo', []],
    ['segunda a Timóteo 3:16 e 17', ['2 Timóteo 3:16-17']],
    ['Hebreus 11 versículo 1 ao 6', ['Hebreus 11:1-6']],
    ['Salmo cento e dezenove, versículo cento e cinco', ['Salmos 119:105']],
    ['Salmos 91:1-4', ['Salmos 91:1-4']],
    ['Isaías 53, versículos 4, 5 e 6', ['Isaías 53:4-6']],
    ['Atos dos Apóstolos 2:38', ['Atos 2:38']],
    ['Jó 19:25', ['Jó 19:25']],
    ['primeira de João 1:9', ['1 João 1:9']],
    ['o evangelho segundo João capítulo 1', ['João 1']],
    ['Marcos 16, 15', ['Marcos 16:15']],
    ['1ª Coríntios 13:4', ['1 Coríntios 13:4']],
    ['Mateus 6:33 e Romanos 12:2', ['Mateus 6:33', 'Romanos 12:2']],
  ])('%s', (texto, esperado) => {
    expect(refs(texto)).toEqual(esperado)
  })

  it.each(['o João um dia disse para mim', 'os números da igreja cresceram', 'Pedro 2 vezes negou', 'Romanos 99', 'João 3:99'])('não inventa: %s', (texto) => {
    expect(refs(texto)).toEqual([])
  })

  it('corta o fim maior que o capítulo', () => {
    expect(refs('Salmo 23:1 ao 10')).toEqual(['Salmos 23:1-6'])
  })

  it('"versículo 17" usa o capítulo citado antes, e o contexto expira', () => {
    const r = new Rastreador(contagem)
    expect(r.processar('Vamos abrir a Bíblia em Habacuque 3.').map((a) => referencia(a.passagem))).toEqual(['Habacuque 3'])
    const achados = r.processar('Olha o que diz o versículo 17 e 18.')
    expect(achados.map((a) => referencia(a.passagem))).toEqual(['Habacuque 3:17-18'])
    expect(achados[0]!.explicita).toBe(false)
    const r2 = new Rastreador(contagem)
    r2.processar('Romanos 8', 0)
    expect(r2.processar('versículo 28', 1000)).toEqual([])
  })

  it('livro no fim de um trecho e o número no próximo', () => {
    const r = new Rastreador(contagem)
    expect(r.processar('então vamos abrir em Romanos')).toEqual([])
    expect(r.processar('capítulo 8, versículo 28').map((a) => referencia(a.passagem))).toEqual(['Romanos 8:28'])
  })

  it('números por extenso', () => {
    expect(converter('vinte e tres'.split(' ')).map(([t]) => t)).toEqual(['23'])
    expect(converter('tres e quatro'.split(' ')).map(([t]) => t)).toEqual(['3', 'e', '4'])
    expect(converter('cento e vinte e um'.split(' ')).map(([t]) => t)).toEqual(['121'])
    expect(converter(['um'])).toEqual([['1', true]])
  })

  it.each([
    ['Fp', 50],
    ['Filipenses', 50],
    ['1Co', 46],
    ['1 Coríntios', 46],
    ['I Coríntios', 46],
    ['2 Corintios', 47],
    ['Jo', 43],
    ['João', 43],
    ['Jó', 18],
    ['1 João', 62],
    ['3Jo', 64],
    ['Salmo', 19],
    ['Sl', 19],
    ['Êx', 2],
    ['Cântico dos Cânticos', 22],
    ['Coríntios', null],
    ['Xyz', null],
  ])('livro da IA: %s', (texto, n) => {
    expect(resolverLivro(texto)).toBe(n)
  })

  it('referência e sobreposição', () => {
    const p = passagem(46, 13, 4, 7)
    expect(referencia(p)).toBe('1 Coríntios 13:4-7')
    expect(referencia(p, true)).toBe('1Co 13:4-7')
    expect(referencia(passagem(19, 23))).toBe('Salmos 23')
    expect(sobrepoe(p, passagem(46, 13, 7))).toBe(true)
    expect(sobrepoe(p, passagem(46, 13, 8))).toBe(false)
    expect(sobrepoe(passagem(46, 13), p)).toBe(true)
  })
})

/** Bíblia de mentira: os capítulos de CAPITULOS com um texto qualquer, mais alguns versículos de verdade. */
function linhasFalsas(especiais: Record<string, string> = {}): LinhaVersiculo[] {
  const r: LinhaVersiculo[] = []
  for (const [k, n] of Object.entries(CAPITULOS)) {
    const [livro, capitulo] = k.split(':').map(Number) as [number, number]
    for (let v = 1; v <= n; v++) r.push({ livro, capitulo, versiculo: v, texto: especiais[`${k}:${v}`] ?? `versículo ${v} do capítulo ${capitulo} livro ${livro}` })
  }
  return r.sort((a, b) => a.livro - b.livro || a.capitulo - b.capitulo || a.versiculo - b.versiculo)
}
const FP_4_6 = 'Não andeis ansiosos de coisa alguma; em tudo, porém, sejam conhecidas, diante de Deus, as vossas petições, pela oração e pela súplica, com ações de graças.'
const FP_4_7 = 'E a paz de Deus, que excede todo o entendimento, guardará o vosso coração e a vossa mente em Cristo Jesus.'
const montar = (especiais: Record<string, string> = {}) => BibliaMemoria.montar([{ sigla: 'ARA', linhas: linhasFalsas(especiais) }], async () => {})

describe('busca por palavras', () => {
  it('pares de palavras pegam citações literais', () => {
    expect(termos('a paz de Deus')).toEqual(['paz', 'deus', 'a_paz', 'paz_de', 'de_deus'])
  })

  it('a citação literal fica em primeiro, com nota de citação', async () => {
    const b = await montar({ '50:4:6': FP_4_6, '50:4:7': FP_4_7 })
    const fala = 'irmãos, não andeis ansiosos de coisa alguma, em tudo sejam conhecidas diante de Deus as vossas petições'
    const [primeiro] = b.buscar([fala], 5)
    expect(referencia(primeiro!.passagem)).toBe('Filipenses 4:6')
    // (a nota de citação, >45, é conferida com a Bíblia de verdade: aqui os outros versículos são curtos demais)
    expect(primeiro!.lexica).toBeGreaterThan(20)
    expect(b.versiculosNoCapitulo(50, 4)).toBe(23)
    expect(b.texto(passagem(50, 4, 6, 7), 0).map(([n]) => n)).toEqual([6, 7])
    expect(b.buscar(['   '])).toEqual([])
  })

  it('junta versículos seguidos', () => {
    const c = (l: number, cap: number, v: number, nota = 1): Candidato => ({ passagem: passagem(l, cap, v), nota, lexica: 0 })
    const g = agruparVizinhos([c(50, 4, 6, 3), c(19, 23, 1, 2), c(50, 4, 7), c(50, 4, 5, 0.5)])
    expect(g.map((x) => referencia(x.passagem))).toEqual(['Filipenses 4:5-7', 'Salmos 23:1'])
    expect(agruparVizinhos([c(43, 3, 16), c(43, 4, 17)]).map((x) => referencia(x.passagem))).toEqual(['João 3:16', 'João 4:17'])
  })

  it('limiares sem IA sobem com o rigor', () => {
    expect(limiaresSemIa(0)[1]).toBeLessThan(limiaresSemIa(50)[1])
    expect(limiaresSemIa(100)[1]).toBeLessThanOrEqual(80)
  })
})

const RESPOSTA = {
  passagens: [
    { livro: 'fp', capitulo: 4, inicio: 6, fim: 7, ligacao: 'citacao', forca: 100, motivo: 'lida' },
    { livro: 'mt', capitulo: 6, inicio: 34, fim: 34, ligacao: 'alusao', forca: 70, motivo: 'alusão' },
    { livro: '1pe', capitulo: 5, inicio: 7, fim: 7, ligacao: 'tema_relacionado', forca: 30, motivo: 'tema' },
    { livro: 'Xyz', capitulo: 1, inicio: 1, fim: 1, ligacao: 'citacao', forca: 100, motivo: 'livro que não existe' },
    { livro: 'Rm', capitulo: 99, inicio: 1, fim: 1, ligacao: 'citacao', forca: 100, motivo: 'capítulo que não existe' },
  ],
}

class IAFalsa implements ProvedorIA {
  pedidos: string[] = []
  constructor(private readonly resposta: unknown = RESPOSTA) {}
  async completarJson(_sistema: string, usuario: string) {
    this.pedidos.push(usuario)
    return { dados: this.resposta, uso: { entrada: 2000, saida: 150 } }
  }
}

describe('escolha da IA', () => {
  it.each([
    [100, ['Filipenses 4:6-7']],
    [75, ['Filipenses 4:6-7']],
    [70, ['Filipenses 4:6-7', 'Mateus 6:34']],
    [0, ['Filipenses 4:6-7', 'Mateus 6:34', '1 Pedro 5:7']],
  ])('rigor %i filtra pela força', async (rigor, esperado) => {
    const ia = new IAFalsa()
    const e = new EscolhedorIA(ia, await montar())
    const escolhas = await e.escolher('fala', [], [], rigor)
    expect(escolhas.map((x) => referencia(x.passagem))).toEqual(esperado)
    expect(ia.pedidos[0]).toContain(`Rigor mínimo: ${rigor}`)
    expect(escolhas[0]).toMatchObject({ ligacao: 'citacao', forca: 100 })
  })

  it('manda os candidatos na versão mais parecida com a fala, curtos', async () => {
    const b = await BibliaMemoria.montar(
      [
        { sigla: 'ARA', linhas: linhasFalsas({ '50:4:6': FP_4_6 }) },
        { sigla: 'NVI', linhas: linhasFalsas({ '50:4:6': 'Não andem ansiosos por coisa alguma, mas em tudo, pela oração e súplicas, e com ação de graças, apresentem seus pedidos a Deus.' }) },
      ],
      async () => {},
    )
    const ia = new IAFalsa({ passagens: [] })
    await new EscolhedorIA(ia, b).escolher('não andem ansiosos por coisa alguma apresentem seus pedidos', [{ passagem: passagem(50, 4, 6), nota: 1, lexica: 50 }], [passagem(43, 3, 16)], 50)
    expect(ia.pedidos[0]).toContain('Fp 4:6 Não andem ansiosos')
    expect(ia.pedidos[0]).toContain('Já sugeridas: Jo 3:16')
  })

  it('provedor Anthropic: pedido enxuto, chave no cabeçalho e nova tentativa no erro 400', async () => {
    const pedidos: Array<{ cab: IncomingHttpHeaders; corpo: Record<string, unknown> }> = []
    const srv = createServer((req, res) => {
      let b = ''
      req.on('data', (x) => (b += x))
      req.on('end', () => {
        const corpo = JSON.parse(b) as Record<string, unknown>
        pedidos.push({ cab: req.headers, corpo })
        res.setHeader('Content-Type', 'application/json')
        if ('thinking' in corpo) {
          res.statusCode = 400
          res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'thinking não aceito aqui' } }))
          return
        }
        res.end(
          JSON.stringify({
            id: 'msg_1',
            type: 'message',
            role: 'assistant',
            model: 'claude-haiku-5-5',
            content: [{ type: 'text', text: '{"passagens":[{"livro":"Fp","capitulo":4,"inicio":6,"fim":7,"ligacao":"citacao","forca":100,"motivo":"lida"}]}' }],
            stop_reason: 'end_turn',
            stop_sequence: null,
            usage: { input_tokens: 2000, output_tokens: 120, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
          }),
        )
      })
    })
    await new Promise<void>((ok) => srv.listen(0, '127.0.0.1', ok))
    try {
      const porta = (srv.address() as AddressInfo).port
      const p = new ProvedorAnthropic({ url: `http://127.0.0.1:${porta}/`, chave: 'chave-falsa', modelo: 'claude-haiku-5-5' })
      const r = await p.completarJson('sistema', 'fala')
      expect(r.uso).toEqual({ entrada: 2000, saida: 120 })
      expect((r.dados as { passagens: unknown[] }).passagens).toHaveLength(1)
      expect(pedidos).toHaveLength(2)
      expect(pedidos[0]!.corpo).toMatchObject({ model: 'claude-haiku-5-5', max_tokens: 1500, thinking: { type: 'disabled' }, output_config: { effort: 'low' } })
      expect(pedidos[1]!.corpo.thinking).toBeUndefined()
      expect(pedidos[1]!.corpo.output_config).toMatchObject({ effort: 'low', format: { type: 'json_schema' } })
      // endereço próprio (servidor intermediário): a chave vai nos dois cabeçalhos
      expect(pedidos[1]!.cab.authorization).toBe('Bearer chave-falsa')
      expect(pedidos[1]!.cab['x-api-key']).toBe('chave-falsa')
      expect(pedidos[1]!.cab['user-agent']).toBe('sonoplastia-versiculos/0.1')
      // lembra o que funcionou: o próximo pedido já vai sem desligar o raciocínio
      await p.completarJson('sistema', 'fala')
      expect(pedidos).toHaveLength(3)
    } finally {
      srv.close()
    }
  })

  it('JSON cercado de texto e endereço da API', () => {
    expect(extrairJson('```json\n{"passagens":[]}\n```')).toEqual({ passagens: [] })
    expect(() => extrairJson('sem json')).toThrow()
    expect(urlDaApi('')).toBe('https://api.anthropic.com')
    expect(urlDaApi(' https://meu.servidor.com/ ')).toBe('https://meu.servidor.com')
  })
})

class TranscritorFalso extends EventEmitter implements Transcritor {
  enviados = 0
  iniciado = false
  parado = false
  iniciar() {
    this.iniciado = true
    this.emit('conectado')
  }
  enviar() {
    this.enviados++
  }
  parar() {
    this.parado = true
  }
}

describe('motor das sugestões', () => {
  let motor: MotorSugestoes | null = null
  afterEach(() => {
    motor?.desligar()
    motor = null
  })

  const criar = async (opcoes: { ia?: IAFalsa; chave11?: string; chaveIa?: string; agora?: () => number } = {}) => {
    const cfg = EsquemaTranscricao.parse({ elevenlabsChave: opcoes.chave11 ?? 'chave-falsa', iaChave: opcoes.chaveIa ?? 'chave-ia-falsa', rigor: 0 })
    const biblia = await montar({ '50:4:6': FP_4_6, '50:4:7': FP_4_7 })
    const transcritor = new TranscritorFalso()
    const escuta = { abertas: 0, fechadas: 0, abrir() { this.abertas++ }, fechar() { this.fechadas++ } }
    const ia = opcoes.ia ?? new IAFalsa()
    const m = new MotorSugestoes({
      config: () => cfg,
      versaoPadrao: () => 'ARA',
      carregarBiblia: async () => biblia,
      criarProvedor: () => ia,
      criarTranscritor: () => transcritor,
      escuta,
      agora: opcoes.agora,
    })
    motor = m
    return { m, transcritor, escuta, ia }
  }

  it('sem a chave da ElevenLabs não liga e explica', async () => {
    const { m, escuta } = await criar({ chave11: '' })
    await m.ligar()
    expect(m.estado()).toMatchObject({ ligado: false, fase: 'erro' })
    expect(m.estado().mensagem).toMatch(/ElevenLabs/)
    expect(escuta.abertas).toBe(0)
  })

  it('liga, abre a escuta, passa o áudio e desliga', async () => {
    const { m, transcritor, escuta } = await criar()
    await m.ligar()
    expect(m.estado()).toMatchObject({ ligado: true, fase: 'ouvindo', ia: true })
    expect(escuta.abertas).toBe(1)
    m.audio(new Uint8Array(3200))
    expect(transcritor.enviados).toBe(1)
    m.desligar()
    expect(m.estado()).toMatchObject({ ligado: false, fase: 'parado' })
    expect(escuta.fechadas).toBe(1)
    expect(transcritor.parado).toBe(true)
  })

  it('referência dita vira sugestão na hora, com a prévia do texto', async () => {
    const { m, transcritor } = await criar()
    await m.ligar()
    transcritor.emit('final', 'Abram comigo em Filipenses capítulo 4, versículo 6.')
    const [s] = m.estado().sugestoes
    expect(s).toMatchObject({ referencia: 'Filipenses 4:6', origem: 'citada', ligacao: 'citacao', livro: 50, capitulo: 4, inicio: 6, fim: 6, sigla: 'ARA' })
    expect(s!.previa).toMatch(/^Não andeis ansiosos/)
    // dita de novo: sobe para o topo, sem repetir
    transcritor.emit('final', 'Romanos 8')
    transcritor.emit('final', 'de novo, Filipenses 4:6')
    expect(m.estado().sugestoes.map((x) => x.referencia)).toEqual(['Filipenses 4:6', 'Romanos 8'])
  })

  it('o ciclo pergunta à IA e não repete o palpite', async () => {
    let t = 1_000_000
    const { m, ia } = await criar({ agora: () => t })
    await m.ligar()
    m.novaFala('Tem muita gente aqui ansiosa, preocupada com tudo, sem conseguir dormir de noite, irmãos queridos.')
    await m.ciclo()
    expect(ia.pedidos).toHaveLength(1)
    expect(m.estado().sugestoes.map((s) => s.referencia)).toEqual(['Filipenses 4:6-7', 'Mateus 6:34', '1 Pedro 5:7'])
    expect(m.estado().consumo).toEqual({ chamadas: 1, entrada: 2000, saida: 150 })
    // pouca fala nova: não gasta outra chamada
    t += 11_000
    m.novaFala('amém, glória a Deus')
    await m.ciclo()
    expect(ia.pedidos).toHaveLength(1)
    // fala nova suficiente: pergunta de novo, mas o mesmo palpite não aparece duas vezes
    m.novaFala('e a paz de Deus que excede todo entendimento vai guardar o coração e a mente de vocês em Cristo')
    await m.ciclo()
    expect(ia.pedidos).toHaveLength(2)
    expect(m.estado().sugestoes).toHaveLength(3)
    m.limpar()
    expect(m.estado().sugestoes).toEqual([])
  })

  it('sem IA, só a citação quase literal entra (pela busca)', async () => {
    const { m } = await criar({ chaveIa: '' })
    await m.ligar()
    expect(m.estado().ia).toBe(false)
    m.novaFala('não andeis ansiosos de coisa alguma, em tudo sejam conhecidas diante de Deus as vossas petições pela oração')
    await m.ciclo()
    const [s] = m.estado().sugestoes
    expect(s).toMatchObject({ origem: 'busca', ligacao: 'citacao' })
    expect(s!.referencia).toMatch(/^Filipenses 4:6/)
  })

  it('erro da IA vira aviso e cai na busca', async () => {
    const ia = new IAFalsa()
    ia.completarJson = async () => {
      throw new Error('Sem conexão com a API da IA.')
    }
    const { m } = await criar({ ia })
    await m.ligar()
    m.novaFala('não andeis ansiosos de coisa alguma, em tudo sejam conhecidas diante de Deus as vossas petições pela oração')
    await m.ciclo()
    expect(m.estado().aviso).toMatch(/Sem conexão/)
    expect(m.estado().sugestoes[0]?.origem).toBe('busca')
  })

  it('microfone que não abre desliga com a mensagem', async () => {
    const { m, escuta } = await criar()
    await m.ligar()
    m.avisoEscuta({ ok: false, erro: 'Nenhum microfone ou entrada de áudio conectado a este computador.' })
    expect(m.estado()).toMatchObject({ ligado: false, fase: 'erro', mensagem: 'Nenhum microfone ou entrada de áudio conectado a este computador.' })
    expect(escuta.fechadas).toBe(1)
  })
})

class SoqueteFalso implements SoqueteMinimo {
  readyState = 0
  enviados: string[] = []
  fechado = false
  onopen: ((ev: unknown) => void) | null = null
  onmessage: ((ev: { data: unknown }) => void) | null = null
  onclose: ((ev: unknown) => void) | null = null
  onerror: ((ev: unknown) => void) | null = null
  send(d: string) {
    this.enviados.push(d)
  }
  close() {
    this.fechado = true
  }
  abrir() {
    this.readyState = 1
    this.onopen?.({})
  }
  receber(m: unknown) {
    this.onmessage?.({ data: JSON.stringify(m) })
  }
  cair() {
    this.readyState = 3
    this.onclose?.({})
  }
}

describe('ElevenLabs', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('URL e mensagens do servidor', () => {
    const u = new URL(urlElevenLabs())
    expect(u.searchParams.get('model_id')).toBe('scribe_v2_realtime')
    expect(u.searchParams.get('audio_format')).toBe('pcm_16000')
    expect(u.searchParams.get('language_code')).toBe('pt')
    expect(u.searchParams.get('commit_strategy')).toBe('vad')
    expect(u.search).not.toMatch(/key|token/i)
    expect(lerMensagem('{"message_type":"partial_transcript","text":" olá "}')).toEqual({ tipo: 'parcial', texto: 'olá' })
    expect(lerMensagem('{"message_type":"committed_transcript","text":"João 3:16"}')).toEqual({ tipo: 'final', texto: 'João 3:16' })
    expect(lerMensagem('{"message_type":"committed_transcript","text":""}')).toEqual({ tipo: 'nada' })
    expect(lerMensagem('{"message_type":"auth_error","error":"x"}')).toMatchObject({ tipo: 'erro', fatal: true })
    expect(lerMensagem('{"message_type":"session_time_limit_exceeded","error":"x"}')).toMatchObject({ tipo: 'erro', fatal: false })
    expect(lerMensagem('{"message_type":"session_started"}')).toEqual({ tipo: 'nada' })
    expect(lerMensagem('lixo')).toEqual({ tipo: 'nada' })
  })

  it('manda a chave no cabeçalho, o áudio em base64 e os textos viram eventos', () => {
    const soquetes: Array<{ s: SoqueteFalso; url: string; cab: Record<string, string> }> = []
    const t = new TranscritorElevenLabs({
      chave: 'segredo',
      abrir: (url, cab) => {
        const s = new SoqueteFalso()
        soquetes.push({ s, url, cab })
        return s
      },
    })
    const parciais: string[] = []
    const finais: string[] = []
    t.on('parcial', (x: string) => parciais.push(x))
    t.on('final', (x: string) => finais.push(x))
    t.iniciar()
    expect(soquetes[0]!.cab).toEqual({ 'xi-api-key': 'segredo' })
    expect(soquetes[0]!.url).not.toContain('segredo')
    // áudio antes de abrir fica na fila
    t.enviar(new Uint8Array([1, 0, 2, 0]))
    soquetes[0]!.s.abrir()
    const m = JSON.parse(soquetes[0]!.s.enviados[0]!)
    expect(m).toEqual({ message_type: 'input_audio_chunk', audio_base_64: Buffer.from([1, 0, 2, 0]).toString('base64'), commit: false, sample_rate: 16000 })
    soquetes[0]!.s.receber({ message_type: 'partial_transcript', text: 'Filipe' })
    soquetes[0]!.s.receber({ message_type: 'committed_transcript', text: 'Filipenses 4' })
    expect(parciais).toEqual(['Filipe'])
    expect(finais).toEqual(['Filipenses 4'])
    t.parar()
  })

  it('reconecta quando cai e para de vez com a chave recusada', async () => {
    vi.useFakeTimers()
    const soquetes: SoqueteFalso[] = []
    const t = new TranscritorElevenLabs({
      chave: 'segredo',
      abrir: () => {
        const s = new SoqueteFalso()
        soquetes.push(s)
        return s
      },
    })
    const erros: string[] = []
    t.on('erro', (x: string) => erros.push(x))
    t.iniciar()
    soquetes[0]!.abrir()
    soquetes[0]!.cair()
    await vi.advanceTimersByTimeAsync(1100)
    expect(soquetes).toHaveLength(2)
    soquetes[1]!.abrir()
    soquetes[1]!.receber({ message_type: 'auth_error', error: 'invalid key' })
    expect(erros[0]).toMatch(/recusou a chave/)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(soquetes).toHaveLength(2)
  })

  it('três falhas sem abrir: confere a chave e para se ela foi recusada', async () => {
    vi.useFakeTimers()
    const soquetes: SoqueteFalso[] = []
    const t = new TranscritorElevenLabs({
      chave: 'errada',
      abrir: () => {
        const s = new SoqueteFalso()
        soquetes.push(s)
        return s
      },
      conferirChave: async () => 'recusada',
    })
    const erros: string[] = []
    t.on('erro', (x: string) => erros.push(x))
    t.iniciar()
    soquetes[0]!.cair()
    await vi.advanceTimersByTimeAsync(1100)
    soquetes[1]!.cair()
    await vi.advanceTimersByTimeAsync(2100)
    soquetes[2]!.cair()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(erros).toHaveLength(1)
    expect(soquetes).toHaveLength(3)
  })
})

describe('copiar do projeto de transcrição', () => {
  it('lê o .env e o config.json do painel', () => {
    expect(lerEnv('# comentário\nSTT=elevenlabs\nELEVENLABS_API_KEY="abc"\n export X = 1 ')).toEqual({ STT: 'elevenlabs', ELEVENLABS_API_KEY: 'abc', X: '1' })
    const pasta = mkdtempSync(join(tmpdir(), 'transcricao-'))
    try {
      mkdirSync(join(pasta, 'data'))
      writeFileSync(join(pasta, '.env'), 'ELEVENLABS_API_KEY=chave-do-env\nANTHROPIC_API_KEY=ia-do-env\n')
      writeFileSync(
        join(pasta, 'data', 'config.json'),
        JSON.stringify({ stt: 'elevenlabs', elevenlabs_chave: '', rigor: 70, intervalo_s: 12, janela_s: 40, ia_ativa: true, ia: { tipo: 'anthropic', url: 'https://servidor.exemplo', chave: '', modelo: 'claude-haiku-5-5' } }),
      )
      const r = importarDoProjetoTranscricao(EsquemaTranscricao.parse({}), pasta)
      expect(r.config).toMatchObject({ elevenlabsChave: 'chave-do-env', iaChave: 'ia-do-env', iaUrl: 'https://servidor.exemplo', iaModelo: 'claude-haiku-5-5', rigor: 70, intervaloS: 12, janelaS: 40 })
      expect(r.copiado.join(' ')).not.toMatch(/chave-do-env|ia-do-env/)
      // IA compatível com OpenAI não é usada aqui
      writeFileSync(join(pasta, 'data', 'config.json'), JSON.stringify({ ia: { tipo: 'openai', chave: 'x', modelo: 'y' } }))
      writeFileSync(join(pasta, '.env'), '')
      const r2 = importarDoProjetoTranscricao(EsquemaTranscricao.parse({}), pasta)
      expect(r2.config.iaChave).toBe('')
      expect(r2.avisos.join(' ')).toMatch(/OpenAI/)
    } finally {
      rmSync(pasta, { recursive: true, force: true })
    }
    expect(() => importarDoProjetoTranscricao(EsquemaTranscricao.parse({}), join(tmpdir(), 'nao-existe-transcricao'))).toThrow(/Não achei/)
  })
})

const PASTA_BIBLIAS = join(homedir(), 'Documents', 'Projetos', 'Transcrição_tempo_real', 'data', 'biblia')
const ARA = join(PASTA_BIBLIAS, 'ARA.json')

describe.skipIf(!existsSync(ARA))('com a ARA de verdade', () => {
  it('acha Filipenses 4:6 pela fala e corta o Salmo 23 no tamanho certo', async () => {
    const versoes = ['ARA', 'NVI']
      .filter((s) => existsSync(join(PASTA_BIBLIAS, `${s}.json`)))
      .map((sigla) => {
        const livros = lerBibliaJson(readFileSync(join(PASTA_BIBLIAS, `${sigla}.json`), 'utf8'))
        const linhas: LinhaVersiculo[] = []
        livros.forEach((caps, l) => caps.forEach((vs, c) => vs.forEach((texto, v) => texto && linhas.push({ livro: l + 1, capitulo: c + 1, versiculo: v + 1, texto }))))
        return { sigla, linhas }
      })
    const b = await BibliaMemoria.montar(versoes, async () => {})
    expect(b.versiculos).toBeGreaterThan(31000)
    const [primeiro] = b.buscar(['não andeis ansiosos de coisa alguma; em tudo, porém, sejam conhecidas, diante de Deus, as vossas petições'], 5)
    expect(referencia(primeiro!.passagem)).toBe('Filipenses 4:6')
    // a calibração do projeto Python: citação literal tira BM25 acima de 45 (LIMIAR_LEXICA_CITACAO)
    expect(primeiro!.lexica).toBeGreaterThan(45)
    expect(encontrar('Salmo 23:1 ao 10', b).map((p) => referencia(p))).toEqual(['Salmos 23:1-6'])
    expect(encontrar('João 3:99', b)).toEqual([])
  }, 60_000)
})
