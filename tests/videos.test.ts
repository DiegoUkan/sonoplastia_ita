/** Pedidos de 21/11: vídeo também no Palco, fim do vídeo, Esc, vídeos pesados, registro no log e lembrete da mesa. */
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { formatoDoMoov, lerFormatoVideo } from '../src/main/biblioteca/formato'
import { argumentosConversao, ehFfmpegAntigo } from '../src/main/ffmpeg'
import { Motor } from '../src/main/motor'
import { RegistroVideo } from '../src/main/registroVideo'
import { comandoRemoto } from '../src/main/remoto/servidor'
import { type Conteudo, type EstadoMotor, TODAS } from '../src/shared/estado'
import { proximoLembrete, sonsNoAr } from '../src/shared/lembrete'
import { descreverFormato, motivoPesado, passoDeSincronia } from '../src/shared/video'

const video = (url = 'midia://local/v.mp4'): Conteudo => ({ tipo: 'video', url, nome: 'Provai e Vede', loop: false })

describe('Fim do vídeo', () => {
  it('sai do ar em todas as saídas que mostram aquele vídeo (padrão)', () => {
    const m = new Motor(['publico', 'palco'])
    m.executar({ tipo: 'mostrar', alvo: TODAS, conteudo: video() })
    m.executar({ tipo: 'video:terminou', url: 'midia://local/v.mp4' })
    expect(m.estado.saidas.publico!.conteudo.tipo).toBe('vazio')
    expect(m.estado.saidas.palco!.conteudo.tipo).toBe('vazio')
    expect(m.estado.saidas.publico!.video.tocando).toBe(false)
  })

  it('aviso de outro vídeo, de vídeo com "repetir" ou de vídeo de slide não muda nada', () => {
    const m = new Motor(['publico', 'palco'])
    m.executar({ tipo: 'mostrar', alvo: 'publico', conteudo: video() })
    m.executar({ tipo: 'video:terminou', url: 'midia://local/outro.mp4' })
    expect(m.estado.saidas.publico!.conteudo.tipo).toBe('video')
    m.executar({ tipo: 'repetir', alvo: 'publico', valor: true })
    m.executar({ tipo: 'video:terminou', url: 'midia://local/v.mp4' })
    expect(m.estado.saidas.publico!.conteudo.tipo).toBe('video')
    const slide = { url: 'midia://local/s.png', proporcao: 16 / 9, oculto: false, notas: '', midias: [{ tipo: 'video' as const, url: 'midia://local/v.mp4', nome: 'v', x: 0, y: 0, l: 1, a: 1, inicio: 'sozinho' as const, repetir: false, continua: false }] }
    m.abrirApresentacao({ apresentacaoId: 1, nome: 'Sermão', slides: [slide], alvo: 'palco' })
    m.executar({ tipo: 'video:terminou', url: 'midia://local/v.mp4' })
    expect(m.estado.saidas.palco!.conteudo.tipo).toBe('slide')
  })

  it('opções: mostrar o Logo (o Preto continua) ou ficar no último quadro', () => {
    const m = new Motor(['publico', 'palco'])
    m.aoTerminarVideo = 'logo'
    m.executar({ tipo: 'mostrar', alvo: TODAS, conteudo: video() })
    m.executar({ tipo: 'tela', alvo: 'palco', tela: 'preto' })
    m.executar({ tipo: 'video:terminou', url: 'midia://local/v.mp4' })
    expect(m.estado.saidas.publico).toMatchObject({ conteudo: { tipo: 'vazio' }, tela: 'logo' })
    expect(m.estado.saidas.palco!.tela).toBe('preto')

    const c = new Motor(['publico'])
    c.aoTerminarVideo = 'congelar'
    c.executar({ tipo: 'mostrar', alvo: TODAS, conteudo: video() })
    c.executar({ tipo: 'video:terminou', url: 'midia://local/v.mp4' })
    expect(c.estado.saidas.publico!.conteudo.tipo).toBe('video')
  })

  it('o celular não pode mandar o aviso de fim', () => {
    expect(() => comandoRemoto({ tipo: 'video:terminou', url: 'midia://local/v.mp4' })).toThrow(/não permitido/)
  })
})

describe('Esc (Limpar) e Logo pausam o vídeo', () => {
  it('Limpar pausa; a volta para a tela normal continua de onde parou', () => {
    const m = new Motor(['publico', 'palco'])
    m.executar({ tipo: 'mostrar', alvo: TODAS, conteudo: video() })
    const ordem = m.estado.saidas.publico!.video.ordem
    m.executar({ tipo: 'tela', alvo: TODAS, tela: 'limpar' })
    expect(m.estado.saidas.publico!.video).toMatchObject({ tocando: false, pausadoPelaTela: true })
    expect(m.estado.saidas.publico!.video.ordem).toBe(ordem + 1)
    m.executar({ tipo: 'tela', alvo: TODAS, tela: 'normal' })
    expect(m.estado.saidas.publico!.video).toMatchObject({ tocando: true, pausadoPelaTela: false })
    expect(m.estado.saidas.palco!.video.tocando).toBe(true)
  })

  it('o Logo também pausa; o Preto não (o som continua); Limpar → Preto → normal continua', () => {
    const m = new Motor(['publico'])
    m.executar({ tipo: 'mostrar', alvo: TODAS, conteudo: video() })
    m.executar({ tipo: 'tela', alvo: TODAS, tela: 'preto' })
    expect(m.estado.saidas.publico!.video.tocando).toBe(true)
    m.executar({ tipo: 'tela', alvo: TODAS, tela: 'normal' })
    m.executar({ tipo: 'tela', alvo: TODAS, tela: 'logo' })
    expect(m.estado.saidas.publico!.video.tocando).toBe(false)
    m.executar({ tipo: 'tela', alvo: TODAS, tela: 'normal' })
    expect(m.estado.saidas.publico!.video.tocando).toBe(true)
    m.executar({ tipo: 'tela', alvo: TODAS, tela: 'limpar' })
    m.executar({ tipo: 'tela', alvo: TODAS, tela: 'preto' })
    expect(m.estado.saidas.publico!.video.tocando).toBe(false)
    m.executar({ tipo: 'tela', alvo: TODAS, tela: 'normal' })
    expect(m.estado.saidas.publico!.video.tocando).toBe(true)
  })

  it('vídeo já pausado pelo operador não volta a tocar; mexer no player esquece a pausa do Limpar', () => {
    const m = new Motor(['publico'])
    m.executar({ tipo: 'mostrar', alvo: TODAS, conteudo: video() })
    m.executar({ tipo: 'midia', alvo: 'publico', acao: 'pausar' })
    m.executar({ tipo: 'tela', alvo: TODAS, tela: 'limpar' })
    m.executar({ tipo: 'tela', alvo: TODAS, tela: 'normal' })
    expect(m.estado.saidas.publico!.video.tocando).toBe(false)
    m.executar({ tipo: 'midia', alvo: 'publico', acao: 'tocar' })
    m.executar({ tipo: 'tela', alvo: TODAS, tela: 'limpar' })
    m.executar({ tipo: 'midia', alvo: 'publico', acao: 'pausar' })
    m.executar({ tipo: 'tela', alvo: TODAS, tela: 'normal' })
    expect(m.estado.saidas.publico!.video.tocando).toBe(false)
  })

  it('desligado nas configurações, o vídeo continua tocando escondido (como antes)', () => {
    const m = new Motor(['publico'])
    m.limparPausaVideo = false
    m.executar({ tipo: 'mostrar', alvo: TODAS, conteudo: video() })
    m.executar({ tipo: 'tela', alvo: TODAS, tela: 'limpar' })
    expect(m.estado.saidas.publico!.video.tocando).toBe(true)
  })
})

describe('Sincronia do vídeo entre Público e Palco', () => {
  it('diferença pequena: acelera ou freia até 10%; nenhuma: velocidade normal', () => {
    expect(passoDeSincronia(10, 10.02, true, 99_999)).toEqual({ velocidade: 1, pular: null })
    expect(passoDeSincronia(10.3, 10, true, 99_999)).toEqual({ velocidade: 1.09, pular: null })
    expect(passoDeSincronia(10, 10.2, true, 99_999)).toEqual({ velocidade: 0.94, pular: null })
    expect(passoDeSincronia(10.9, 10, true, 99_999)!.velocidade).toBe(1.1)
  })

  it('diferença grande: pula (com folga), mas não duas vezes seguidas; pausado não mexe', () => {
    expect(passoDeSincronia(30, 10, true, 99_999)).toEqual({ velocidade: 1, pular: 30.15 })
    expect(passoDeSincronia(30, 10, true, 1000)).toEqual({ velocidade: 1.1, pular: null })
    expect(passoDeSincronia(30, 10, false, 99_999)).toBeNull()
  })
})

describe('Vídeo pesado para o PC da igreja', () => {
  it('pesa: outro formato que não H.264, mais que 1080p, ou acima de 30 qps com mais que 720p', () => {
    expect(motivoPesado({ codec: 'av1', largura: 2560, altura: 1440, qps: 30 })).toBe('AV1, 2560×1440')
    expect(motivoPesado({ codec: 'h264', largura: 1920, altura: 1080, qps: 29.97 })).toBeNull()
    expect(motivoPesado({ codec: 'h264', largura: 1920, altura: 1088, qps: 30 })).toBeNull()
    expect(motivoPesado({ codec: 'h264', largura: 1080, altura: 1920, qps: 30 })).toBeNull()
    expect(motivoPesado({ codec: 'h264', largura: 1920, altura: 1080, qps: 60 })).toBe('60 quadros/s')
    expect(motivoPesado({ codec: 'h264', largura: 1280, altura: 720, qps: 60 })).toBeNull()
    expect(motivoPesado({ codec: 'hevc', largura: 3840, altura: 2160, qps: 60 })).toBe('HEVC (H.265), 3840×2160, 60 quadros/s')
    // sem saber o formato, não acusa
    expect(motivoPesado({ codec: null, largura: null, altura: null, qps: null })).toBeNull()
    expect(descreverFormato({ codec: 'av1', largura: 2560, altura: 1440, qps: 30 })).toBe('AV1 2560×1440 30 qps')
  })

  it('a conversão cabe em 1920×1080 sem deformar e limita a 30 qps só quando passa disso', () => {
    const a = argumentosConversao('in.mp4', 'out.mp4', 'video', { qps: 59.94 })
    expect(a).toContain('libx264')
    expect(a[a.indexOf('-vf') + 1]).toBe("scale='if(gt(iw*1080,ih*1920),min(1920,iw),-2)':'if(gt(iw*1080,ih*1920),-2,min(1080,ih))'")
    expect(a.slice(a.indexOf('-r'), a.indexOf('-r') + 2)).toEqual(['-r', '30'])
    expect(argumentosConversao('in.mp4', 'out.mp4', 'video', { qps: 30 })).not.toContain('-r')
    expect(argumentosConversao('in.wav', 'out.mp3', 'audio')).toContain('libmp3lame')
    expect(ehFfmpegAntigo('C:\\Holyrics\\Holyrics\\files\\ffmpeg.exe')).toBe(true)
    expect(ehFfmpegAntigo('C:\\Sonoplastia\\ffmpeg\\ffmpeg.exe')).toBe(false)
  })
})

// ------------------------------------------------------------------ leitor de MP4 (arquivo de mentira)

function caixa(tipo: string, ...partes: Buffer[]): Buffer {
  const corpo = Buffer.concat(partes)
  const cab = Buffer.alloc(8)
  cab.writeUInt32BE(8 + corpo.length, 0)
  cab.write(tipo, 4, 'latin1')
  return Buffer.concat([cab, corpo])
}
const u32 = (...n: number[]) => {
  const b = Buffer.alloc(4 * n.length)
  n.forEach((v, i) => b.writeUInt32BE(v, i * 4))
  return b
}

/** MP4 mínimo: faixa de vídeo `codigo`, `largura`×`altura`, `amostras` quadros de `delta` numa escala `escala`. */
function mp4(codigo: string, largura: number, altura: number, escala: number, amostras: number, delta: number, moovNoFim = false): Buffer {
  const entrada = Buffer.alloc(78)
  entrada.writeUInt16BE(largura, 24)
  entrada.writeUInt16BE(altura, 26)
  const stsd = caixa('stsd', u32(0, 1), caixa(codigo, entrada))
  const stts = caixa('stts', u32(0, 1, amostras, delta))
  const mdhd = caixa('mdhd', u32(0, 0, 0, escala, amostras * delta), Buffer.alloc(4))
  const hdlr = caixa('hdlr', u32(0, 0), Buffer.from('vide', 'latin1'), Buffer.alloc(13))
  const tkhd = caixa('tkhd', Buffer.alloc(76), u32(largura * 65536, altura * 65536))
  const audio = caixa('trak', caixa('mdia', caixa('hdlr', u32(0, 0), Buffer.from('soun', 'latin1'), Buffer.alloc(13))))
  const moov = caixa('moov', audio, caixa('trak', tkhd, caixa('mdia', mdhd, hdlr, caixa('minf', caixa('stbl', stsd, stts)))))
  const ftyp = caixa('ftyp', Buffer.from('isom', 'latin1'), u32(512))
  const mdat = caixa('mdat', Buffer.alloc(1000))
  return moovNoFim ? Buffer.concat([ftyp, mdat, moov]) : Buffer.concat([ftyp, moov, mdat])
}

describe('Formato do vídeo lido do arquivo (sem ffmpeg)', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'sonoplastia-formato-'))
  afterAll(() => rmSync(pasta, { recursive: true, force: true }))

  it('MP4: codec, tamanho e quadros por segundo (o moov no começo ou no fim)', async () => {
    const a = join(pasta, 'av1.mp4')
    writeFileSync(a, mp4('av01', 2560, 1440, 15360, 300, 512))
    expect(await lerFormatoVideo(a)).toEqual({ codec: 'av1', largura: 2560, altura: 1440, qps: 30 })
    const b = join(pasta, 'h264.mp4')
    writeFileSync(b, mp4('avc1', 1920, 1080, 30000, 100, 1001, true))
    expect(await lerFormatoVideo(b)).toEqual({ codec: 'h264', largura: 1920, altura: 1080, qps: 29.97 })
    expect(formatoDoMoov(Buffer.alloc(0))).toBeNull()
  })

  it('WebM/MKV pelo CodecID; arquivo que não é vídeo dá null', async () => {
    const w = join(pasta, 'v.webm')
    writeFileSync(w, Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(40), Buffer.from('\x86\x85V_VP9', 'latin1'), Buffer.alloc(100)]))
    expect(await lerFormatoVideo(w)).toMatchObject({ codec: 'vp9' })
    const t = join(pasta, 'x.txt')
    writeFileSync(t, 'não é vídeo nenhum, só texto')
    expect(await lerFormatoVideo(t)).toBeNull()
  })

  const real = 'C:\\Sonoplastia\\midias\\video\\21⧸11. O paralítico no tanque de Betesda. (Cura, Batismo).mp4'
  it.skipIf(!existsSync(real))('o vídeo do site que travou em 21/11 (AV1 2560×1440) é pesado', async () => {
    const f = await lerFormatoVideo(real)
    expect(f).toEqual({ codec: 'av1', largura: 2560, altura: 1440, qps: 30 })
    expect(motivoPesado(f!)).toBe('AV1, 2560×1440')
  })
})

describe('Registro de como o vídeo tocou (log)', () => {
  const montar = () => {
    const linhas: string[] = []
    let agora = 1_000_000
    const log = { info: (t: unknown) => linhas.push(`I ${t}`), aviso: (t: unknown) => linhas.push(`A ${t}`), erro: (t: unknown) => linhas.push(`E ${t}`) }
    const r = new RegistroVideo({ log, formatoDe: () => 'AV1 2560×1440 30 qps', agora: () => agora })
    const m = new Motor(['publico'])
    m.executar({ tipo: 'mostrar', alvo: TODAS, conteudo: video() })
    const tel = (posicao: number, tocando = true, extra: Record<string, unknown> = {}) =>
      r.receber({ saidaId: 'publico', largura: 1024, altura: 606, video: { posicao, duracao: 10, tocando, quadros: posicao * 30, perdidos: 0, ...extra } }, m.estado as EstadoMotor)
    return { linhas, tel, passar: (ms: number) => (agora += ms), m, r }
  }

  it('começo com o formato, a parada (onde e quanto) e o resumo no fim', () => {
    const { linhas, tel, passar } = montar()
    tel(0, false)
    expect(linhas).toEqual([])
    tel(0.25)
    expect(linhas[0]).toBe('I Vídeo "Provai e Vede" no publico: AV1 2560×1440 30 qps.')
    for (let p = 0.5; p <= 3; p += 0.25) {
      passar(250)
      tel(p)
    }
    // travou em 3 s por 4 s
    for (let i = 0; i < 16; i++) {
      passar(250)
      tel(3)
    }
    passar(250)
    tel(3.25)
    expect(linhas.at(-1)).toBe('A Vídeo "Provai e Vede" no publico: parou em 0:03 por 4.3 s.')
    passar(250)
    tel(10, false, { perdidos: 12 })
    expect(linhas.at(-1)).toMatch(/^A Vídeo "Provai e Vede" no publico: tocou até 0:10 de 0:10, 300 quadros, 12 perdidos \(4,0%\), 1 parada \(a maior: 4\.3 s em 0:03\)\.$/)
  })

  it('o erro do vídeo vai uma vez; sair do ar fecha o resumo', () => {
    const { linhas, tel, passar, m, r } = montar()
    tel(0.5, true, { erro: 'erro 3: PIPELINE_ERROR_DECODE' })
    passar(250)
    tel(0.5, true, { erro: 'erro 3: PIPELINE_ERROR_DECODE' })
    expect(linhas.filter((l) => l.startsWith('E '))).toEqual(['E Vídeo "Provai e Vede" no publico: erro 3: PIPELINE_ERROR_DECODE (em 0:00).'])
    m.executar({ tipo: 'mostrar', alvo: TODAS, conteudo: { tipo: 'vazio' } })
    r.receber({ saidaId: 'publico', largura: 1024, altura: 606, video: null }, m.estado)
    expect(linhas.at(-1)).toMatch(/^A Vídeo "Provai e Vede" no publico: tocou até 0:00 de 0:10/)
  })
})

describe('Lembrete do canal do PC na mesa de som', () => {
  it('lembra uma vez por mídia nova com som; pausar e tocar de novo não lembra; o Palco no mudo não conta', () => {
    const m = new Motor(['publico', 'palco'])
    let lembrados = new Set<string>()
    const passo = () => {
      const r = proximoLembrete(sonsNoAr(m.estado), lembrados)
      lembrados = r.lembrados
      return r.novo
    }
    expect(passo()).toBeNull()
    m.executar({ tipo: 'mostrar', alvo: TODAS, conteudo: video() })
    expect(passo()).toMatchObject({ tipo: 'video', nome: 'Provai e Vede', chave: expect.stringMatching(/^video:publico:/) })
    expect(passo()).toBeNull()
    m.executar({ tipo: 'midia', alvo: TODAS, acao: 'pausar' })
    expect(passo()).toBeNull()
    m.executar({ tipo: 'midia', alvo: TODAS, acao: 'tocar' })
    expect(passo()).toBeNull()
    // outra mídia: lembra de novo
    m.executar({ tipo: 'audio', fonte: { tipo: 'audio', url: 'midia://local/a.mp3', nome: 'Fundo musical', midiaId: 3 } })
    expect(passo()).toMatchObject({ tipo: 'audio', nome: 'Fundo musical' })
    // no mudo não lembra
    m.executar({ tipo: 'mostrar', alvo: TODAS, conteudo: video('midia://local/w.mp4') })
    m.executar({ tipo: 'volume', alvo: TODAS, mudo: true })
    m.executar({ tipo: 'audio', fonte: null })
    lembrados = new Set()
    expect(passo()).toBeNull()
  })
})
