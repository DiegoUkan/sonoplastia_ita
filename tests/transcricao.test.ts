/**
 * Bíblia automática: referências faladas, porta de voz, busca, IA (servidor de mentira), ElevenLabs
 * (WebSocket de mentira), analisador e o serviço com o motor de verdade. Nenhuma chamada real.
 */
import { EventEmitter } from 'node:events'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { converterNumeros, encontrarReferencias, Rastreador, resolverLivro, type TamanhosBiblia } from '../src/shared/biblia/falada'
import { formatarReferencia } from '../src/shared/biblia/referencia'
import { type Config, configPadrao } from '../src/shared/config'
import { cobertura, conjuntoDePares, pareceLeitura } from '../src/shared/transcricao/texto'
import { nivelDb, PortaVoz } from '../src/shared/transcricao/voz'
import { Motor } from '../src/main/motor'
import { AnalisadorFala, type BibliaDoAnalisador } from '../src/main/transcricao/analisador'
import { ConexaoElevenLabs } from '../src/main/transcricao/elevenlabs'
import { lerEscolhas, montarPedido } from '../src/main/transcricao/escolha'
import { criarProvedor, ErroIA, extrairJson, type ProvedorIA, urlEfetiva } from '../src/main/transcricao/ia'
import { IndiceBiblia } from '../src/main/transcricao/indice'
import { mesmaReferencia, ServicoTranscricao } from '../src/main/transcricao/servico'
import { servidorWs } from './ajudantes/ws'

// ----------------------------------------------------------------- uma Bíblia pequena de mentira

/** versículos por capítulo ("livro.capítulo") dos capítulos usados nos testes */
const CONTAGENS: Record<string, number> = {
  '45.8': 39,
  '45.12': 21,
  '43.3': 36,
  '43.1': 51,
  '46.13': 13,
  '19.23': 6,
  '19.119': 176,
  '19.91': 16,
  '1.1': 31,
  '50.4': 23,
  '35.3': 19,
  '52.5': 28,
  '55.3': 17,
  '58.11': 40,
  '23.53': 12,
  '44.2': 47,
  '18.19': 29,
  '62.1': 10,
  '41.16': 20,
  '40.6': 34,
  '60.5': 14,
}
const tamanhos: TamanhosBiblia = { versiculosNoCapitulo: (l, c) => CONTAGENS[`${l}.${c}`] ?? 0 }

const TEXTOS: Record<string, string> = {
  '43.3.16': 'Porque Deus amou ao mundo de tal maneira que deu o seu Filho unigênito, para que todo o que nele crê não pereça, mas tenha a vida eterna.',
  '43.3.17': 'Porquanto Deus enviou o seu Filho ao mundo, não para que julgasse o mundo, mas para que o mundo fosse salvo por ele.',
  '50.4.6': 'Não andeis ansiosos de coisa alguma; em tudo, porém, sejam conhecidas, diante de Deus, as vossas petições, pela oração e pela súplica, com ações de graças.',
  '50.4.7': 'E a paz de Deus, que excede todo o entendimento, guardará o vosso coração e a vossa mente em Cristo Jesus.',
  '19.23.1': 'O Senhor é o meu pastor; nada me faltará.',
  '40.6.34': 'Portanto, não vos inquieteis com o dia de amanhã, pois o amanhã trará os seus cuidados; basta ao dia o seu próprio mal.',
  '60.5.7': 'lançando sobre ele toda a vossa ansiedade, porque ele tem cuidado de vós.',
}

const bibliaFalsa: BibliaDoAnalisador & { versiculosDoLivro: (l: number) => Array<{ capitulo: number; versiculo: number; texto: string }>; versoes: () => Array<{ sigla: string; nome: string; versiculos: number }> } = {
  versiculosNoCapitulo: tamanhos.versiculosNoCapitulo,
  textosDoVersiculo: (l, c, v) => (TEXTOS[`${l}.${c}.${v}`] ? [{ sigla: 'ARA', texto: TEXTOS[`${l}.${c}.${v}`]! }] : []),
  versiculosDoLivro: (l) =>
    Object.entries(TEXTOS)
      .filter(([k]) => Number(k.split('.')[0]) === l)
      .map(([k, texto]) => ({ capitulo: Number(k.split('.')[1]), versiculo: Number(k.split('.')[2]), texto }))
      .sort((a, b) => a.capitulo - b.capitulo || a.versiculo - b.versiculo),
  versoes: () => [{ sigla: 'ARA', nome: 'Almeida Revista e Atualizada', versiculos: Object.keys(TEXTOS).length }],
}

const nomesDe = (texto: string) =>
  encontrarReferencias(texto, tamanhos).map((p) => formatarReferencia(p.livro, p.capitulo, p.inicio, p.fim))

// ----------------------------------------------------------------- referências faladas

describe('referências faladas (mesmos casos do projeto de transcrição)', () => {
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
    expect(nomesDe(texto)).toEqual(esperado)
  })

  it.each(['o João um dia disse para mim', 'os números da igreja cresceram', 'Pedro 2 vezes negou', 'Romanos 99', 'João 3:99'])('não inventa: %s', (texto) => {
    expect(nomesDe(texto)).toEqual([])
  })

  it('corta o fim maior que o capítulo', () => {
    expect(nomesDe('Salmo 23:1 ao 10')).toEqual(['Salmos 23:1-6'])
  })

  it('"versículo 17" usa o capítulo citado antes', () => {
    const r = new Rastreador(tamanhos)
    expect(r.processar('Vamos abrir a Bíblia em Habacuque 3.', 0).map((a) => formatarReferencia(a.passagem.livro, a.passagem.capitulo, a.passagem.inicio, a.passagem.fim))).toEqual(['Habacuque 3'])
    const achados = r.processar('Olha o que diz o versículo 17 e 18.', 1000)
    expect(achados.map((a) => formatarReferencia(a.passagem.livro, a.passagem.capitulo, a.passagem.inicio, a.passagem.fim))).toEqual(['Habacuque 3:17-18'])
    expect(achados[0]!.explicita).toBe(false)
  })

  it('o contexto vale 5 minutos', () => {
    const r = new Rastreador(tamanhos)
    r.processar('Romanos 8', 0)
    expect(r.processar('versículo 28', 1_000_000)).toEqual([])
  })

  it('livro no fim de um trecho e o número no próximo', () => {
    const r = new Rastreador(tamanhos)
    expect(r.processar('então vamos abrir em Romanos')).toEqual([])
    const a = r.processar('capítulo 8, versículo 28')
    expect(a.map((x) => formatarReferencia(x.passagem.livro, x.passagem.capitulo, x.passagem.inicio))).toEqual(['Romanos 8:28'])
  })

  it('livro no fim de um trecho com ponto (o Whisper corta na pausa) e o número no próximo', () => {
    const r = new Rastreador(tamanhos)
    expect(r.processar('Irmãos, abra a Bíblia comigo em Filipenses.')).toEqual([])
    const a = r.processar('Capítulo 4, versículo 6.')
    expect(a.map((x) => formatarReferencia(x.passagem.livro, x.passagem.capitulo, x.passagem.inicio))).toEqual(['Filipenses 4:6'])
  })

  it('números por extenso', () => {
    expect(converterNumeros('vinte e tres'.split(' ')).map((t) => t[0])).toEqual(['23'])
    expect(converterNumeros('tres e quatro'.split(' ')).map((t) => t[0])).toEqual(['3', 'e', '4'])
    expect(converterNumeros('cento e vinte e um'.split(' ')).map((t) => t[0])).toEqual(['121'])
    expect(converterNumeros(['um'])).toEqual([['1', true]])
  })

  it('o livro que a IA responde (nome ou sigla)', () => {
    expect(resolverLivro('Fp')).toBe(50)
    expect(resolverLivro('Filipenses')).toBe(50)
    expect(resolverLivro('1Co')).toBe(46)
    expect(resolverLivro('1 Coríntios')).toBe(46)
    expect(resolverLivro('Salmo')).toBe(19)
    expect(resolverLivro('Jó')).toBe(18)
    expect(resolverLivro('jo')).toBe(43)
    expect(resolverLivro('João')).toBe(43)
    expect(resolverLivro('3Jo')).toBe(64)
    expect(resolverLivro('Atos dos Apóstolos')).toBe(44)
    expect(resolverLivro('Cantares')).toBe(22)
    expect(resolverLivro('Xyz')).toBeNull()
  })
})

// ----------------------------------------------------------------- texto e voz

describe('leitura literal (pares de palavras)', () => {
  it('reconhece o versículo lido, mesmo com erros da transcrição, e não um tema parecido', () => {
    const lido = conjuntoDePares('porque deus amou o mundo de tal maneira que deu seu filho unigenito para que todo aquele que nele cre nao pereca')
    const c = cobertura(TEXTOS['43.3.16']!, lido)
    expect(pareceLeitura(c)).toBe(true)
    const tema = conjuntoDePares('Deus ama você. O amor de Deus é tão grande que ele mandou Jesus para nos salvar.')
    expect(pareceLeitura(cobertura(TEXTOS['43.3.16']!, tema))).toBe(false)
  })
})

const silencio = () => new Int16Array(1600)
const voz = (amplitude = 8000) => Int16Array.from({ length: 1600 }, (_, i) => Math.round(amplitude * Math.sin((2 * Math.PI * 220 * i) / 16000)))
const ruido = (amplitude: number) => Int16Array.from({ length: 1600 }, () => Math.round((Math.random() * 2 - 1) * amplitude))

describe('porta de voz', () => {
  it('nível em dBFS', () => {
    expect(nivelDb(silencio())).toBe(-100)
    expect(nivelDb(voz(32767))).toBeGreaterThan(-4)
    expect(nivelDb(voz(8000))).toBeLessThan(-10)
  })

  it('abre na voz com o áudio de antes e fecha depois do silêncio', () => {
    const p = new PortaVoz({ sensibilidade: 'media', silencioS: 2, antesS: 1 })
    for (let i = 0; i < 30; i++) expect(p.quadro(silencio()).abrir).toBe(false)
    const d1 = p.quadro(voz())
    const d2 = p.quadro(voz())
    const d3 = p.quadro(voz())
    expect([d1.abrir, d2.abrir, d3.abrir]).toEqual([false, false, true])
    // 1 s de áudio de antes (10 quadros), incluindo os 3 de voz
    expect(d3.enviar.length).toBe(10)
    expect(p.estaAberta).toBe(true)
    let fechou = -1
    for (let i = 0; i < 40; i++) {
      const d = p.quadro(silencio())
      expect(d.enviar.length).toBe(1)
      if (d.fechar) {
        fechou = i
        break
      }
    }
    // 2 s = 20 quadros sem voz (os 2 primeiros ainda contam como voz pela janela de 5)
    expect(fechou).toBeGreaterThanOrEqual(19)
    expect(fechou).toBeLessThanOrEqual(23)
    expect(p.estaAberta).toBe(false)
  })

  it('ruído constante da sala deixa de contar como voz', () => {
    const p = new PortaVoz({ sensibilidade: 'media', silencioS: 1 })
    let abriu = 0
    for (let i = 0; i < 300; i++) if (p.quadro(ruido(3000)).abrir) abriu++
    // pode abrir no começo (antes de aprender o piso), mas não fica abrindo
    expect(abriu).toBeLessThanOrEqual(1)
    expect(p.estaAberta).toBe(false)
    // fala bem acima do ruído abre
    p.quadro(voz(20000))
    p.quadro(voz(20000))
    expect(p.quadro(voz(20000)).abrir).toBe(true)
  })
})

// ----------------------------------------------------------------- busca

describe('índice da Bíblia (BM25 + pares)', () => {
  it('a leitura literal fica no topo', async () => {
    const i = await IndiceBiblia.montar(bibliaFalsa)
    expect(i.versiculos).toBe(Object.keys(TEXTOS).length)
    const fala = 'irmãos, olha o que diz: e a paz de Deus que excede todo entendimento guardará o vosso coração'
    const r = i.buscar([fala], 3, (l, c, v) => bibliaFalsa.textosDoVersiculo(l, c, v).map((x) => x.texto))
    expect([r[0]!.livro, r[0]!.capitulo, r[0]!.versiculo]).toEqual([50, 4, 7])
    expect(pareceLeitura(r[0]!.cobertura)).toBe(true)
  })
})

// ----------------------------------------------------------------- IA

describe('IA: pedido e resposta', () => {
  it('URL efetiva', () => {
    expect(urlEfetiva({ tipo: 'openai', url: 'http://newapi.exemplo.com' })).toBe('http://newapi.exemplo.com/v1')
    expect(urlEfetiva({ tipo: 'openai', url: 'http://newapi.exemplo.com/' })).toBe('http://newapi.exemplo.com/v1')
    expect(urlEfetiva({ tipo: 'openai', url: 'https://openrouter.ai/api/v1' })).toBe('https://openrouter.ai/api/v1')
    expect(urlEfetiva({ tipo: 'openai', url: '' })).toBe('https://api.openai.com/v1')
    expect(urlEfetiva({ tipo: 'anthropic', url: '' })).toBe('https://api.anthropic.com')
    expect(urlEfetiva({ tipo: 'anthropic', url: 'http://newapi.exemplo.com/v1/' })).toBe('http://newapi.exemplo.com')
    expect(urlEfetiva({ tipo: 'anthropic', url: 'newapi.exemplo.com' })).toBe('https://newapi.exemplo.com')
  })

  it('JSON cercado de markdown', () => {
    expect(extrairJson('```json\n{"passagens": []}\n```')).toEqual({ passagens: [] })
    expect(() => extrairJson('<html>não é a API</html>')).toThrow(ErroIA)
  })

  const resposta = {
    passagens: [
      { livro: 'fp', capitulo: 4, inicio: 6, fim: 7, ligacao: 'citacao', forca: 100, motivo: 'lida' },
      { livro: 'Mt', capitulo: 6, inicio: 34, fim: 34, ligacao: 'alusao', forca: 70, motivo: 'alusão' },
      { livro: '1Pe', capitulo: 5, inicio: 7, fim: 7, ligacao: 'tema_relacionado', forca: 30, motivo: 'tema' },
      { livro: 'Livro inventado', capitulo: 1, inicio: 1, fim: 1, ligacao: 'citacao', forca: 100, motivo: '?' },
    ],
  }
  it.each([
    [100, ['Filipenses 4:6-7']],
    [75, ['Filipenses 4:6-7']],
    [70, ['Filipenses 4:6-7', 'Mateus 6:34']],
    [0, ['Filipenses 4:6-7', 'Mateus 6:34', '1 Pedro 5:7']],
  ])('rigor %i filtra pela força', (rigor, esperado) => {
    expect(lerEscolhas(resposta, rigor, tamanhos).map((e) => formatarReferencia(e.passagem.livro, e.passagem.capitulo, e.passagem.inicio, e.passagem.fim))).toEqual(esperado)
  })

  it('corta a passagem longa e o capítulo que não existe', () => {
    const r = lerEscolhas({ passagens: [{ livro: 'Sl', capitulo: 119, inicio: 1, fim: 50, ligacao: 'tema_central', forca: 50, motivo: '' }, { livro: 'Rm', capitulo: 99, inicio: 1, fim: 1, ligacao: 'citacao', forca: 100, motivo: '' }] }, 0, tamanhos)
    expect(r.map((e) => [e.passagem.inicio, e.passagem.fim])).toEqual([[1, 8]])
  })

  it('o pedido leva o rigor, as já sugeridas e os candidatos', () => {
    const p = montarPedido('fala', [{ referencia: 'Jo 3:16', texto: TEXTOS['43.3.16']! }], ['Sl 23'], 55)
    expect(p).toContain('Rigor mínimo: 55')
    expect(p).toContain('Já sugeridas: Sl 23')
    expect(p).toContain('<transcricao>\nfala\n</transcricao>')
    expect(p).toMatch(/Jo 3:16 Porque Deus amou/)
  })
})

/** servidor HTTP de mentira: grava os pedidos e responde o que o teste mandar */
async function servidorHttp(responder: (req: IncomingMessage, corpo: string, n: number) => { status: number; corpo: unknown }) {
  const pedidos: Array<{ url: string; cabecalhos: IncomingMessage['headers']; corpo: unknown }> = []
  const srv: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let corpo = ''
    req.on('data', (d) => (corpo += d))
    req.on('end', () => {
      pedidos.push({ url: req.url ?? '', cabecalhos: req.headers, corpo: corpo ? JSON.parse(corpo) : null })
      const r = responder(req, corpo, pedidos.length)
      res.writeHead(r.status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(r.corpo))
    })
  })
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r))
  return { url: `http://127.0.0.1:${(srv.address() as AddressInfo).port}`, pedidos, fechar: () => new Promise<void>((r) => srv.close(() => r())) }
}

const RESPOSTA_IA = '{"passagens":[{"livro":"Jo","capitulo":3,"inicio":16,"fim":16,"ligacao":"citacao","forca":100,"motivo":"lida"}]}'

describe('IA: provedores contra um servidor de mentira', () => {
  it('Anthropic: chave no cabeçalho, sem raciocínio, esforço baixo e esquema; tira o ajuste que o modelo recusa', async () => {
    const s = await servidorHttp((_req, _c, n) =>
      n === 1
        ? { status: 400, corpo: { type: 'error', error: { type: 'invalid_request_error', message: 'thinking: disabled is not supported for this model' } } }
        : {
            status: 200,
            corpo: {
              id: 'msg_1',
              type: 'message',
              role: 'assistant',
              model: 'claude-haiku-5-5',
              content: [{ type: 'text', text: RESPOSTA_IA }],
              stop_reason: 'end_turn',
              stop_sequence: null,
              usage: { input_tokens: 2100, output_tokens: 120 },
            },
          },
    )
    try {
      const p = criarProvedor({ tipo: 'anthropic', url: s.url, chave: 'chave-de-teste', modelo: 'claude-haiku-5-5' })
      const r = await p.completarJson('sistema', 'usuario', { type: 'object' }, 'formato')
      expect(r.dados).toEqual(JSON.parse(RESPOSTA_IA))
      expect(r.uso).toEqual({ entrada: 2100, saida: 120 })
      expect(s.pedidos).toHaveLength(2)
      expect(s.pedidos[0]!.url).toBe('/v1/messages')
      // o SDK 1.x (API 2026-10-21) manda a chave como Bearer; com endereço próprio, também em X-Api-Key
      expect(s.pedidos[0]!.cabecalhos.authorization).toBe('Bearer chave-de-teste')
      expect(s.pedidos[0]!.cabecalhos['x-api-key']).toBe('chave-de-teste')
      expect(s.pedidos[0]!.cabecalhos['anthropic-version']).toBeTruthy()
      const primeiro = s.pedidos[0]!.corpo as Record<string, unknown>
      expect(primeiro.thinking).toEqual({ type: 'disabled' })
      expect(primeiro.output_config).toEqual({ effort: 'low', format: { type: 'json_schema', schema: { type: 'object' } } })
      expect(primeiro).not.toHaveProperty('temperature')
      // a segunda vai sem o "thinking" e o programa lembra
      const segundo = s.pedidos[1]!.corpo as Record<string, unknown>
      expect(segundo).not.toHaveProperty('thinking')
      expect(segundo.output_config).toEqual({ effort: 'low', format: { type: 'json_schema', schema: { type: 'object' } } })
      await p.completarJson('sistema', 'usuario', { type: 'object' }, 'formato')
      expect(s.pedidos[2]!.corpo).not.toHaveProperty('thinking')
    } finally {
      await s.fechar()
    }
  })

  it('Anthropic: chave recusada vira mensagem clara', async () => {
    const s = await servidorHttp(() => ({ status: 401, corpo: { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } } }))
    try {
      const p = criarProvedor({ tipo: 'anthropic', url: s.url, chave: 'errada', modelo: 'x' })
      await expect(p.completarJson('s', 'u', {}, 'f')).rejects.toThrow('Chave recusada')
    } finally {
      await s.fechar()
    }
  })

  it('compatível com OpenAI: Bearer, /v1/chat/completions e tira o response_format se o servidor recusar', async () => {
    const s = await servidorHttp((_req, corpo, n) =>
      n === 1 && JSON.parse(corpo).response_format
        ? { status: 400, corpo: { error: { message: 'response_format not supported' } } }
        : { status: 200, corpo: { choices: [{ message: { content: `\`\`\`json\n${RESPOSTA_IA}\n\`\`\`` } }], usage: { prompt_tokens: 900, completion_tokens: 60 } } },
    )
    try {
      const p = criarProvedor({ tipo: 'openai', url: s.url, chave: 'k', modelo: 'm' })
      const r = await p.completarJson('sistema', 'usuario', {}, 'FORMATO')
      expect(r.uso).toEqual({ entrada: 900, saida: 60 })
      expect((r.dados as { passagens: unknown[] }).passagens).toHaveLength(1)
      expect(s.pedidos[0]!.url).toBe('/v1/chat/completions')
      expect(s.pedidos[0]!.cabecalhos.authorization).toBe('Bearer k')
      expect(s.pedidos[1]!.corpo).not.toHaveProperty('response_format')
      const msgs = (s.pedidos[1]!.corpo as { messages: Array<{ role: string; content: string }> }).messages
      expect(msgs[0]).toEqual({ role: 'system', content: 'sistema\nFORMATO' })
    } finally {
      await s.fechar()
    }
  })
})

// ----------------------------------------------------------------- ElevenLabs

describe('ElevenLabs (WebSocket de mentira)', () => {
  it('chave no cabeçalho, áudio em base64, parcial e final, e o "commit" ao encerrar', async () => {
    const ws = await servidorWs({
      aoConectar: (c) =>
        c.aoMensagem((m) => {
          const msg = JSON.parse(m) as { commit: boolean; audio_base_64: string }
          if (!msg.commit && c.mensagens.length === 2) {
            c.enviar(JSON.stringify({ message_type: 'partial_transcript', text: 'Vamos ler' }))
            c.enviar(JSON.stringify({ message_type: 'committed_transcript', text: 'Vamos ler João 3:16' }))
          }
          if (msg.commit) c.enviar(JSON.stringify({ message_type: 'committed_transcript', text: '' }))
        }),
    })
    try {
      const c = new ConexaoElevenLabs({ chave: 'chave-el', url: ws.url })
      const eventos: string[] = []
      c.on('parcial', (t: string) => eventos.push(`parcial:${t}`))
      c.on('final', (t: string) => eventos.push(`final:${t}`))
      // antes de abrir: fica na fila
      c.enviar(voz())
      c.enviar(voz())
      await new Promise<void>((r) => c.once('aberta', () => r()))
      await new Promise((r) => setTimeout(r, 200))
      expect(eventos).toEqual(['parcial:Vamos ler', 'final:Vamos ler João 3:16'])
      const cliente = ws.clientes[0]!
      expect(cliente.pedido.headers['xi-api-key']).toBe('chave-el')
      const q = new URL(cliente.pedido.url!, 'http://x').searchParams
      expect(q.get('model_id')).toBe('scribe_v2_realtime')
      expect(q.get('audio_format')).toBe('pcm_16000')
      expect(q.get('language_code')).toBe('pt')
      expect(q.get('commit_strategy')).toBe('vad')
      const primeira = JSON.parse(cliente.mensagens[0]!) as { message_type: string; audio_base_64: string; sample_rate: number }
      expect(primeira.message_type).toBe('input_audio_chunk')
      expect(primeira.sample_rate).toBe(16000)
      expect(Buffer.from(primeira.audio_base_64, 'base64').length).toBe(3200)
      await c.encerrar()
      expect(JSON.parse(cliente.mensagens.at(-1)!).commit).toBe(true)
    } finally {
      await ws.fechar()
    }
  })

  it('erro de chave é fatal; recusa na abertura fecha sem abrir', async () => {
    const ws = await servidorWs({ aoConectar: (c) => c.enviar(JSON.stringify({ message_type: 'auth_error', error: 'Invalid API key' })) })
    try {
      const c = new ConexaoElevenLabs({ chave: 'x', url: ws.url })
      const erro = await new Promise<[string, boolean]>((r) => c.on('erro', (m: string, f: boolean) => r([m, f])))
      expect(erro[1]).toBe(true)
      expect(erro[0]).toContain('auth_error')
    } finally {
      await ws.fechar()
    }
    const recusa = await servidorWs({ recusar: 401 })
    try {
      const c = new ConexaoElevenLabs({ chave: 'x', url: recusa.url })
      const inesperado = await new Promise<boolean>((r) => c.on('fechada', (i: boolean) => r(i)))
      expect(inesperado).toBe(true)
      expect(c.abriu).toBe(false)
    } finally {
      await recusa.fechar()
    }
  })
})

// ----------------------------------------------------------------- analisador

function configCom(mudar: (c: Config) => void = () => {}): Config {
  const c = configPadrao()
  // estes testes do serviço são do caminho do ElevenLabs; o local (Whisper) fica em whisper.test.ts
  c.transcricao.escuta.motor = 'elevenlabs'
  c.transcricao.escuta.chaveElevenLabs = 'el'
  c.transcricao.ia.chave = 'ia'
  mudar(c)
  return c
}

class IAFalsa implements ProvedorIA {
  pedidos: string[] = []
  constructor(public resposta: unknown) {}
  async completarJson(_s: string, usuario: string) {
    this.pedidos.push(usuario)
    return { dados: this.resposta, uso: { entrada: 2000, saida: 100 } }
  }
  async listarModelos() {
    return [{ id: 'm', nome: 'm' }]
  }
}

function analisador(opcoes: { cfg?: Config; ia?: ProvedorIA | null; indice?: IndiceBiblia | null; agora?: () => number } = {}) {
  const cfg = opcoes.cfg ?? configCom()
  const mostrados: Array<[number, number, number]> = []
  const a = new AnalisadorFala({
    biblia: bibliaFalsa,
    indice: () => opcoes.indice ?? null,
    provedor: () => (opcoes.ia === undefined ? null : opcoes.ia),
    config: () => cfg.transcricao,
    sigla: () => 'ARA',
    mostrarSozinho: (l, c, v) => {
      mostrados.push([l, c, v])
      return true
    },
    aoMudar: () => {},
    aviso: () => {},
    agora: opcoes.agora,
  })
  return { a, mostrados, cfg }
}

describe('analisador da fala', () => {
  it('referência dita vira sugestão na hora e vai para a tela (citação direta)', () => {
    const { a, mostrados } = analisador()
    a.novaFala('Vamos abrir a Bíblia em João 3:16.')
    expect(a.sugestoes[0]).toMatchObject({ referencia: 'João 3:16', origem: 'citada', ligacao: 'citada', mostrada: true })
    expect(a.sugestoes[0]!.texto).toMatch(/^Porque Deus amou/)
    expect(mostrados).toEqual([[43, 3, 16]])
  })

  it('"Não" nas configurações: só sugere', () => {
    const { a, mostrados } = analisador({ cfg: configCom((c) => (c.transcricao.auto.mostrarSozinho = 'nao')) })
    a.novaFala('João 3:16')
    expect(a.sugestoes).toHaveLength(1)
    expect(mostrados).toEqual([])
  })

  it('capítulo sem versículo é sugestão, não vai para a tela; o versículo dito depois vai', () => {
    const { a, mostrados } = analisador()
    a.novaFala('Hoje vamos estudar Filipenses 4.')
    expect(mostrados).toEqual([])
    a.novaFala('Leia comigo o versículo 6.')
    expect(mostrados).toEqual([[50, 4, 6]])
    // o capítulo citado foi trocado pelo versículo (sobe para o topo)
    expect(a.sugestoes.map((s) => s.referencia)).toEqual(['Filipenses 4:6'])
  })

  it('IA: filtra pelo rigor, conta o gasto e não chama de novo sem fala nova', async () => {
    let agora = 1_000_000
    const ia = new IAFalsa({
      passagens: [
        { livro: 'Mt', capitulo: 6, inicio: 34, fim: 34, ligacao: 'alusao', forca: 70, motivo: 'não se preocupe com o amanhã' },
        { livro: '1Pe', capitulo: 5, inicio: 7, fim: 7, ligacao: 'tema_relacionado', forca: 30, motivo: 'tema' },
      ],
    })
    const { a, mostrados } = analisador({ ia, agora: () => agora })
    a.novaFala('Quantas vezes a gente fica preocupado com o que vai acontecer amanhã, com as contas, com o trabalho, com a família inteira')
    await a.ciclo()
    expect(ia.pedidos).toHaveLength(1)
    expect(ia.pedidos[0]).toContain('Rigor mínimo: 55')
    expect(a.sugestoes.map((s) => [s.referencia, s.ligacao, s.forca])).toEqual([['Mateus 6:34', 'alusao', 70]])
    expect(a.consumo).toMatchObject({ chamadas: 1, entrada: 2000, saida: 100 })
    expect(mostrados).toEqual([]) // alusão nunca vai sozinha
    agora += 10_000
    await a.ciclo()
    expect(ia.pedidos).toHaveLength(1)
    // a mesma passagem de novo não repete o cartão
    a.novaFala('e Jesus disse para não andar ansioso com o dia de amanhã porque cada dia tem o seu próprio mal, é o que ele ensina')
    await a.ciclo()
    expect(ia.pedidos).toHaveLength(2)
    expect(a.sugestoes).toHaveLength(1)
  })

  it('citação lida vai para a tela só se as palavras confirmam (e no versículo que está sendo lido)', async () => {
    const ia = new IAFalsa({ passagens: [{ livro: 'Fp', capitulo: 4, inicio: 6, fim: 7, ligacao: 'citacao', forca: 100, motivo: 'lida' }] })
    const { a, mostrados } = analisador({ ia })
    a.novaFala('Não andeis ansiosos de coisa alguma; em tudo, porém, sejam conhecidas diante de Deus as vossas petições pela oração e pela súplica com ações de graças.')
    a.novaFala('E a paz de Deus, que excede todo o entendimento, guardará o vosso coração e a vossa mente em Cristo Jesus.')
    await a.ciclo()
    expect(a.sugestoes[0]).toMatchObject({ referencia: 'Filipenses 4:6-7', mostrada: true })
    expect(mostrados).toEqual([[50, 4, 7]])

    // a IA diz "citação", mas a fala não tem o texto: não vai sozinha
    const ia2 = new IAFalsa({ passagens: [{ livro: 'Jo', capitulo: 3, inicio: 16, fim: 16, ligacao: 'citacao', forca: 100, motivo: '?' }] })
    const b = analisador({ ia: ia2 })
    b.a.novaFala('Deus ama tanto a gente que mandou o próprio Filho para morrer por nós, para quem crer ter a vida para sempre.')
    await b.a.ciclo()
    expect(b.a.sugestoes[0]?.referencia).toBe('João 3:16')
    expect(b.mostrados).toEqual([])

    // "só a referência dita" nas configurações: a leitura não vai sozinha
    const c = analisador({ ia: new IAFalsa(ia.resposta), cfg: configCom((x) => (x.transcricao.auto.mostrarSozinho = 'referencia')) })
    c.a.novaFala('E a paz de Deus, que excede todo o entendimento, guardará o vosso coração e a vossa mente em Cristo Jesus, amém, irmãos.')
    await c.a.ciclo()
    expect(c.mostrados).toEqual([])
  })

  it('sem IA: a busca reconhece a leitura literal', async () => {
    const indice = await IndiceBiblia.montar(bibliaFalsa)
    const { a, mostrados } = analisador({ ia: null, indice })
    a.novaFala('O Senhor é o meu pastor e nada me faltará, irmãos, nada mesmo, nada mesmo, ele cuida de cada detalhe')
    await a.ciclo()
    expect(a.sugestoes[0]).toMatchObject({ referencia: 'Salmos 23:1', origem: 'busca', ligacao: 'leitura' })
    expect(mostrados).toEqual([[19, 23, 1]])
  })
})

// ----------------------------------------------------------------- serviço (com o motor de verdade)

class ConexaoFalsa extends EventEmitter {
  abriu = true
  enviados: Int16Array[] = []
  encerrada = false
  enviar(q: Int16Array) {
    this.enviados.push(q)
  }
  async encerrar() {
    this.encerrada = true
  }
  fecharJa() {
    this.encerrada = true
  }
}

describe('serviço da Bíblia automática', () => {
  let servico: ServicoTranscricao | null = null
  afterEach(() => {
    servico?.ligar(false)
    servico = null
  })

  function montar(mudar: (c: Config) => void = () => {}) {
    const cfg = configCom(mudar)
    const motor = new Motor(cfg.saidas.map((s) => s.id))
    const conexoes: ConexaoFalsa[] = []
    const escuta: string[] = []
    let tocando = false
    servico = new ServicoTranscricao({
      config: () => cfg,
      motor,
      biblia: bibliaFalsa,
      pastaWhisper: 'nao-existe',
      abrirEscuta: (m) => escuta.push(`abrir:${m}`),
      fecharEscuta: () => escuta.push('fechar'),
      midiaTocando: () => tocando,
      criarConexao: () => {
        const c = new ConexaoFalsa()
        conexoes.push(c)
        return c
      },
      criarProvedor: () => new IAFalsa({ passagens: [] }),
    })
    return { s: servico, motor, conexoes, escuta, cfg, tocar: (v: boolean) => (tocando = v) }
  }

  it('manual não ouve; automático abre o microfone e espera a voz', () => {
    const { s, escuta, conexoes } = montar()
    expect(s.obter().situacao).toBe('desligado')
    s.receberAudio(voz())
    expect(conexoes).toHaveLength(0)
    s.ligar(true)
    expect(escuta).toEqual(['abrir:'])
    expect(s.obter().situacao).toBe('iniciando')
    for (let i = 0; i < 20; i++) s.receberAudio(silencio())
    expect(s.obter().situacao).toBe('espera')
    expect(conexoes).toHaveLength(0)
    s.ligar(false)
    expect(escuta).toEqual(['abrir:', 'fechar'])
  })

  it('na voz, abre a transcrição; a referência dita vai para o "Enviar para"', () => {
    const { s, motor, conexoes } = montar()
    s.ligar(true)
    s.contexto({ alvo: 'publico' })
    for (let i = 0; i < 20; i++) s.receberAudio(silencio())
    for (let i = 0; i < 5; i++) s.receberAudio(voz())
    expect(conexoes).toHaveLength(1)
    expect(s.obter().situacao).toBe('ouvindo')
    // o áudio de antes da voz foi junto
    expect(conexoes[0]!.enviados.length).toBeGreaterThan(5)
    conexoes[0]!.emit('final', 'Vamos ler juntos João 3:16')
    const publico = motor.estado.saidas.publico!.conteudo
    expect(publico).toMatchObject({ tipo: 'versiculo', referencia: 'João 3:16 (ARA)' })
    expect(motor.estado.saidas.palco!.conteudo.tipo).toBe('vazio')
    expect(s.obter().mostrado).toMatchObject({ seq: 1, livro: 43, capitulo: 3, versiculo: 16, sigla: 'ARA' })
    expect(s.obter().sugestoes[0]).toMatchObject({ referencia: 'João 3:16', mostrada: true })
  })

  it('nunca troca vídeo, música ou slide, nem passa por cima do Logo', () => {
    const { s, motor, conexoes } = montar()
    s.ligar(true)
    for (let i = 0; i < 5; i++) s.receberAudio(voz())
    motor.executar({ tipo: 'mostrar', alvo: 'todas', conteudo: { tipo: 'video', url: 'midia://local/x.mp4', nome: 'x', loop: false } })
    conexoes[0]!.emit('final', 'Isso está em Filipenses 4:6')
    expect(motor.estado.saidas.publico!.conteudo.tipo).toBe('video')
    expect(s.obter().sugestoes[0]).toMatchObject({ referencia: 'Filipenses 4:6', mostrada: false })
    motor.executar({ tipo: 'mostrar', alvo: 'todas', conteudo: { tipo: 'vazio' } })
    motor.executar({ tipo: 'tela', alvo: 'todas', tela: 'logo' })
    conexoes[0]!.emit('final', 'e Filipenses 4:7')
    expect(motor.estado.saidas.publico!.conteudo.tipo).toBe('vazio')
  })

  it('pausa com mídia tocando e fecha depois do silêncio (não gasta)', () => {
    const { s, conexoes, cfg, tocar } = montar()
    cfg.transcricao.auto.silencioS = 5
    s.configMudou()
    s.ligar(true)
    for (let i = 0; i < 5; i++) s.receberAudio(voz())
    expect(conexoes).toHaveLength(1)
    tocar(true)
    s.receberAudio(voz())
    expect(conexoes[0]!.encerrada).toBe(true)
    expect(s.obter().situacao).toBe('pausado')
    for (let i = 0; i < 10; i++) s.receberAudio(voz())
    expect(conexoes).toHaveLength(1)
    tocar(false)
    for (let i = 0; i < 5; i++) s.receberAudio(voz())
    expect(conexoes).toHaveLength(2)
    for (let i = 0; i < 60; i++) s.receberAudio(silencio())
    expect(conexoes[1]!.encerrada).toBe(true)
    expect(s.obter().situacao).toBe('espera')
    expect(s.obter().consumo.segundosAudio).toBeGreaterThan(0)
  })

  it('sem a chave do ElevenLabs: erro claro, nada é aberto', () => {
    const { s, conexoes } = montar((c) => (c.transcricao.escuta.chaveElevenLabs = ''))
    s.ligar(true)
    for (let i = 0; i < 5; i++) s.receberAudio(voz())
    expect(conexoes).toHaveLength(0)
    const e = s.obter()
    expect(e.situacao).toBe('erro')
    expect(e.faltando).toContain('a chave do ElevenLabs')
  })

  it('reconecta quando a conexão cai no meio da fala', async () => {
    const { s, conexoes } = montar()
    s.ligar(true)
    for (let i = 0; i < 5; i++) s.receberAudio(voz())
    conexoes[0]!.emit('fechada', true)
    // espera de 1 s antes de tentar de novo
    s.receberAudio(voz())
    expect(conexoes).toHaveLength(1)
    await new Promise((r) => setTimeout(r, 1050))
    s.receberAudio(voz())
    expect(conexoes).toHaveLength(2)
    // o áudio guardado vai junto, para não perder o começo da frase
    expect(conexoes[1]!.enviados.length).toBeGreaterThan(5)
  })
})

describe('referência no ar', () => {
  it('"João 3:1" não é "João 3:16"', () => {
    expect(mesmaReferencia('João 3:16 (ARA)', 'João 3:16')).toBe(true)
    expect(mesmaReferencia('João 3:16 (1/2) (ARA)', 'João 3:16')).toBe(true)
    expect(mesmaReferencia('João 3:16 (ARA)', 'João 3:1')).toBe(false)
  })
})

// ----------------------------------------------------------------- copiar do projeto de transcrição

describe('copiar do projeto de transcrição (Python)', () => {
  it('traz as chaves e os ajustes de data/config.json e do .env, sem mostrar os valores', async () => {
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { copiarDoProjeto } = await import('../src/main/transcricao/importar')
    const pasta = mkdtempSync(join(tmpdir(), 'transcricao-'))
    try {
      mkdirSync(join(pasta, 'data'))
      writeFileSync(join(pasta, '.env'), '# comentário\nELEVENLABS_API_KEY="chave-el-falsa"\n')
      writeFileSync(join(pasta, 'data', 'config.json'), JSON.stringify({ rigor: 55, intervalo_s: 3, janela_s: 35, ia: { tipo: 'anthropic', url: 'http://servidor.exemplo', chave: 'chave-ia-falsa', modelo: 'claude-haiku-5-5' } }))
      const r = copiarDoProjeto(configCom().transcricao, pasta)
      expect(r.config.escuta.chaveElevenLabs).toBe('chave-el-falsa')
      expect(r.config.ia).toMatchObject({ tipo: 'anthropic', url: 'http://servidor.exemplo', chave: 'chave-ia-falsa', modelo: 'claude-haiku-5-5', rigor: 55, intervaloS: 3, janelaS: 35 })
      expect(r.copiado.join(' ')).not.toContain('falsa')
      expect(() => copiarDoProjeto(configCom().transcricao, join(pasta, 'nao-existe'))).toThrow('Não achei')
    } finally {
      rmSync(pasta, { recursive: true, force: true })
    }
  })
})
