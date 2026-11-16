/**
 * Transcrição local (Whisper): corte das frases, limpeza do texto, instalação conferida e o serviço com um
 * servidor de mentira. O executável de verdade é testado no autoteste (passo `transcricao-local`).
 */
import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { configPadrao } from '../src/shared/config'
import { Motor } from '../src/main/motor'
import type { ProvedorIA } from '../src/main/transcricao/ia'
import { ServicoTranscricao, type ServidorLocal } from '../src/main/transcricao/servico'
import { ConexaoWhisper, instalarWhisper, limparTextoWhisper, type Transcritor, wavDe, WHISPER } from '../src/main/transcricao/whisper'

const silencio = () => new Int16Array(1600)
const voz = (amplitude = 8000) => Int16Array.from({ length: 1600 }, (_, i) => Math.round(amplitude * Math.sin((2 * Math.PI * 220 * i) / 16000)))
const esperarTarefas = () => new Promise((r) => setTimeout(r, 20))

class WhisperFalso extends EventEmitter implements ServidorLocal {
  frases: Int16Array[] = []
  iniciado = 0
  parado = 0
  constructor(public respostas: string[] = []) {
    super()
  }
  async iniciar() {
    this.iniciado++
  }
  parar() {
    this.parado++
  }
  async transcrever(pcm: Int16Array) {
    this.frases.push(pcm)
    return this.respostas.shift() ?? ''
  }
}

describe('Whisper local: frases e texto', () => {
  it('corta a frase na pausa, tira o silêncio do fim e devolve o texto', async () => {
    const w = new WhisperFalso(['Vamos ler João 3:16.'])
    const c = new ConexaoWhisper(async () => w as Transcritor)
    const finais: string[] = []
    c.on('final', (t: string) => finais.push(t))
    await esperarTarefas()
    expect(c.abriu).toBe(true)
    for (let i = 0; i < 3; i++) c.enviar(silencio(), false)
    for (let i = 0; i < 20; i++) c.enviar(voz(), true)
    for (let i = 0; i < 5; i++) c.enviar(silencio(), false)
    await esperarTarefas()
    expect(w.frases).toHaveLength(1)
    // 3 quadros de antes + 20 de voz + 2 de silêncio que ficam no fim
    expect(w.frases[0]!.length).toBe(25 * 1600)
    expect(finais).toEqual(['Vamos ler João 3:16.'])
  })

  it('tosse ou clique (pouca voz) não vira frase; fala sem pausa é cortada em 17 s', async () => {
    const w = new WhisperFalso()
    const c = new ConexaoWhisper(async () => w as Transcritor)
    await esperarTarefas()
    for (let i = 0; i < 3; i++) c.enviar(voz(), true)
    for (let i = 0; i < 30; i++) c.enviar(silencio(), false)
    await esperarTarefas()
    expect(w.frases).toHaveLength(0)
    for (let i = 0; i < 200; i++) c.enviar(voz(), true)
    await esperarTarefas()
    expect(w.frases[0]!.length).toBe(170 * 1600)
  })

  it('encerrar transcreve a frase em andamento e fecha', async () => {
    const w = new WhisperFalso(['e a paz de Deus'])
    const c = new ConexaoWhisper(async () => w as Transcritor)
    const finais: string[] = []
    c.on('final', (t: string) => finais.push(t))
    await esperarTarefas()
    for (let i = 0; i < 12; i++) c.enviar(voz(), true)
    await c.encerrar()
    expect(finais).toEqual(['e a paz de Deus'])
  })

  it('Whisper que não abre é erro grave (não fica tentando)', async () => {
    const c = new ConexaoWhisper(async () => {
      throw new Error('O Whisper não está instalado.')
    })
    const r = await new Promise<[string, boolean]>((ok) => c.on('erro', (m: string, f: boolean) => ok([m, f])))
    expect(r).toEqual(['O Whisper não está instalado.', true])
  })

  it('as frases que o Whisper inventa no silêncio somem; a fala de verdade fica', () => {
    expect(limparTextoWhisper(' Legendas pela comunidade Amara.org ')).toBe('')
    expect(limparTextoWhisper('Obrigado.')).toBe('')
    expect(limparTextoWhisper('[Música]')).toBe('')
    expect(limparTextoWhisper('Obrigado, Senhor, por mais um dia.')).toBe('Obrigado, Senhor, por mais um dia.')
    expect(limparTextoWhisper('Deus Deus Deus Deus Deus é bom')).toBe('Deus é bom')
  })

  it('WAV de 16 kHz mono', () => {
    const w = wavDe(new Int16Array(1600))
    expect(w.length).toBe(44 + 3200)
    expect(w.toString('ascii', 0, 4)).toBe('RIFF')
    expect(w.readUInt32LE(24)).toBe(16000)
  })

  it('download com SHA-256 errado é apagado e não instala', async () => {
    const pasta = mkdtempSync(join(tmpdir(), 'whisper-'))
    try {
      const falso = async () => new Response(new Uint8Array(WHISPER.zip.bytes), { status: 200, headers: { 'content-type': 'application/zip' } })
      await expect(instalarWhisper({ pasta, modelo: 'base', buscar: falso, aoProgresso: () => {} })).rejects.toThrow('SHA-256')
      expect(existsSync(join(pasta, 'whisper-bin-x64.zip'))).toBe(false)
      expect(existsSync(join(pasta, 'whisper-bin-x64.zip.part'))).toBe(false)
      expect(existsSync(join(pasta, 'bin', 'whisper-server.exe'))).toBe(false)
    } finally {
      rmSync(pasta, { recursive: true, force: true })
    }
  })
})

const bibliaFalsa = {
  versiculosNoCapitulo: (l: number, c: number) => (l === 43 && c === 3 ? 36 : 0),
  textosDoVersiculo: (l: number, c: number, v: number) =>
    l === 43 && c === 3 && v === 16 ? [{ sigla: 'ARA', texto: 'Porque Deus amou ao mundo de tal maneira que deu o seu Filho unigênito.' }] : [],
  versiculosDoLivro: () => [],
  versoes: () => [{ sigla: 'ARA', nome: 'Almeida Revista e Atualizada', versiculos: 1 }],
}

const iaVazia: ProvedorIA = {
  completarJson: async () => ({ dados: { passagens: [] }, uso: { entrada: 0, saida: 0 } }),
  listarModelos: async () => [],
}

describe('serviço com a transcrição local', () => {
  let s: ServicoTranscricao | null = null
  let pasta = ''
  afterEach(() => {
    s?.ligar(false)
    s = null
    if (pasta) rmSync(pasta, { recursive: true, force: true })
  })

  function montarLocal(instalado: boolean, respostas: string[] = []) {
    pasta = mkdtempSync(join(tmpdir(), 'whisper-'))
    if (instalado) {
      mkdirSync(join(pasta, 'bin'))
      mkdirSync(join(pasta, 'modelos'))
      writeFileSync(join(pasta, 'bin', 'whisper-server.exe'), '')
      writeFileSync(join(pasta, 'modelos', 'ggml-base-q5_1.bin'), '')
    }
    const cfg = configPadrao()
    cfg.transcricao.ia.chave = 'ia'
    const motor = new Motor(cfg.saidas.map((x) => x.id))
    const w = new WhisperFalso(respostas)
    s = new ServicoTranscricao({
      config: () => cfg,
      motor,
      biblia: bibliaFalsa,
      pastaWhisper: pasta,
      abrirEscuta: () => {},
      fecharEscuta: () => {},
      midiaTocando: () => false,
      criarServidorWhisper: () => w,
      criarProvedor: () => iaVazia,
    })
    return { s, w, motor, cfg }
  }

  it('o padrão é local; sem o Whisper baixado: erro claro, sem pedir chave do ElevenLabs', () => {
    const { s, cfg } = montarLocal(false)
    expect(cfg.transcricao.escuta.motor).toBe('local')
    s.ligar(true)
    const e = s.obter()
    expect(e.situacao).toBe('erro')
    expect(e.faltando).toContain('baixar o Whisper (modelo base)')
    expect(e.faltando).not.toContain('a chave do ElevenLabs')
  })

  it('abre o Whisper ao ligar, transcreve na pausa e a referência vai para a tela; desligar fecha o Whisper', async () => {
    const { s, w, motor } = montarLocal(true, ['Vamos abrir a Bíblia em João capítulo três, versículo dezesseis.'])
    s.ligar(true)
    expect(w.iniciado).toBe(1)
    for (let i = 0; i < 20; i++) s.receberAudio(silencio())
    for (let i = 0; i < 20; i++) s.receberAudio(voz())
    for (let i = 0; i < 6; i++) s.receberAudio(silencio())
    await esperarTarefas()
    expect(w.frases).toHaveLength(1)
    expect(motor.estado.saidas.publico!.conteudo).toMatchObject({ tipo: 'versiculo', referencia: 'João 3:16 (ARA)' })
    expect(s.obter().falas.at(-1)?.texto).toMatch(/João capítulo três/)
    s.ligar(false)
    expect(w.parado).toBe(1)
  })

  it('trocar os núcleos (ou o modelo) reabre o Whisper', async () => {
    const { s, w, cfg } = montarLocal(true)
    s.ligar(true)
    await esperarTarefas()
    cfg.transcricao.escuta.threadsLocal = 3
    s.configMudou()
    expect(w.parado).toBe(1)
    expect(w.iniciado).toBe(2)
  })
})
