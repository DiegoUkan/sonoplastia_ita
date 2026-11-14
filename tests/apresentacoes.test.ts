import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { crc32, deflateRawSync } from 'node:zlib'
import { afterAll, describe, expect, it } from 'vitest'
import { BibliotecaApresentacoes, type Conversor } from '../src/main/apresentacoes/biblioteca'
import { exportarSlides, limparNotas } from '../src/main/apresentacoes/exportar'
import { midiasDoPptx } from '../src/main/apresentacoes/pptx'
import { ArquivoZip } from '../src/main/apresentacoes/zip'
import { abrirBanco } from '../src/main/banco'
import { type DadosAbrirApresentacao, Motor } from '../src/main/motor'
import { comecaSozinha, type MidiaSlide, slideVizinho } from '../src/shared/apresentacao'
import { AUDIO, TODAS } from '../src/shared/estado'

const pasta = mkdtempSync(join(tmpdir(), 'sonoplastia-apres-'))
afterAll(() => rmSync(pasta, { recursive: true, force: true }))

/** ZIP mínimo (o suficiente para o leitor): entradas comprimidas com deflate ou guardadas. */
function criarZip(caminho: string, arquivos: Record<string, string | Buffer>, guardar: string[] = []): void {
  const locais: Buffer[] = []
  const centrais: Buffer[] = []
  let pos = 0
  for (const [nome, conteudo] of Object.entries(arquivos)) {
    const dados = Buffer.isBuffer(conteudo) ? conteudo : Buffer.from(conteudo, 'utf8')
    const metodo = guardar.includes(nome) ? 0 : 8
    const comprimido = metodo === 8 ? deflateRawSync(dados) : dados
    const n = Buffer.from(nome, 'utf8')
    const crc = crc32(dados)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x800, 6)
    local.writeUInt16LE(metodo, 8)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(comprimido.length, 18)
    local.writeUInt32LE(dados.length, 22)
    local.writeUInt16LE(n.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x800, 8)
    central.writeUInt16LE(metodo, 10)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(comprimido.length, 20)
    central.writeUInt32LE(dados.length, 24)
    central.writeUInt16LE(n.length, 28)
    central.writeUInt32LE(pos, 42)
    locais.push(local, n, comprimido)
    centrais.push(central, n)
    pos += 30 + n.length + comprimido.length
  }
  const dir = Buffer.concat(centrais)
  const fim = Buffer.alloc(22)
  fim.writeUInt32LE(0x06054b50, 0)
  fim.writeUInt16LE(Object.keys(arquivos).length, 8)
  fim.writeUInt16LE(Object.keys(arquivos).length, 10)
  fim.writeUInt32LE(dir.length, 12)
  fim.writeUInt32LE(pos, 16)
  writeFileSync(caminho, Buffer.concat([...locais, dir, fim]))
}

const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

/** .pptx de mentira com 3 slides; a ordem da apresentação NÃO é a ordem dos arquivos. */
function pptxDeTeste(caminho: string): void {
  const slideVideo = `<p:sld><p:cSld><p:spTree>
    <p:pic><p:nvPicPr><p:cNvPr id="233" name="Hino &amp; vídeo.mp4"/><p:nvPr><a:videoFile r:link="rId2"/><p:extLst><p:ext uri="{X}"><p14:media r:embed="rId1"/></p:ext></p:extLst></p:nvPr></p:nvPicPr>
    <p:spPr><a:xfrm><a:off x="1219200" y="685800"/><a:ext cx="6096000" cy="3429000"/></a:xfrm></p:spPr></p:pic>
  </p:spTree></p:cSld>
  <p:timing><p:tnLst><p:par><p:cTn id="1" nodeType="tmRoot"><p:childTnLst>
    <p:par><p:cTn id="5" presetID="1" presetClass="mediacall" presetSubtype="0" fill="hold" nodeType="clickEffect"><p:childTnLst><p:cmd type="call" cmd="playFrom(0.0)"><p:cBhvr><p:cTn id="6"/><p:tgtEl><p:spTgt spid="233"/></p:tgtEl></p:cBhvr></p:cmd></p:childTnLst></p:cTn></p:par>
    <p:video><p:cMediaNode vol="100000"><p:cTn id="7" repeatCount="indefinite" fill="hold"/><p:tgtEl><p:spTgt spid="233"/></p:tgtEl></p:cMediaNode></p:video>
  </p:childTnLst></p:cTn></p:par></p:tnLst></p:timing></p:sld>`
  const slideAudio = `<p:sld><p:cSld><p:spTree>
    <p:pic><p:nvPicPr><p:cNvPr id="157" name="Entrada.mp3"/><p:nvPr><a:audioFile r:link="rId2"/><p:extLst><p:ext uri="{X}"><p14:media r:embed="rId1"/></p:ext></p:extLst></p:nvPr></p:nvPicPr>
    <p:spPr><a:xfrm><a:off x="10" y="10"/><a:ext cx="1" cy="1"/></a:xfrm></p:spPr></p:pic>
  </p:spTree></p:cSld>
  <p:timing><p:tnLst><p:par><p:cTn id="1" nodeType="tmRoot"><p:childTnLst>
    <p:par><p:cTn id="5" presetID="1" presetClass="mediacall" nodeType="afterEffect"><p:childTnLst><p:cmd type="call" cmd="playFrom(0.0)"><p:cBhvr><p:tgtEl><p:spTgt spid="157"/></p:tgtEl></p:cBhvr></p:cmd></p:childTnLst></p:cTn></p:par>
    <p:audio><p:cMediaNode vol="80000" numSld="999"><p:cTn id="7" fill="hold"/><p:tgtEl><p:spTgt spid="157"/></p:tgtEl></p:cMediaNode></p:audio>
  </p:childTnLst></p:cTn></p:par></p:tnLst></p:timing></p:sld>`
  const relsMidia = (alvo: string, tipo: string) =>
    `<Relationships><Relationship Id="rId2" Type="${REL}/${tipo}" Target="../media/${alvo}"/><Relationship Id="rId1" Type="http://schemas.microsoft.com/office/2007/relationships/media" Target="../media/${alvo}"/></Relationships>`
  criarZip(
    caminho,
    {
      'ppt/presentation.xml': `<p:presentation><p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId3"/><p:sldId id="258" r:id="rId4"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>`,
      'ppt/_rels/presentation.xml.rels': `<Relationships><Relationship Id="rId2" Type="${REL}/slide" Target="slides/slide3.xml"/><Relationship Id="rId3" Type="${REL}/slide" Target="slides/slide1.xml"/><Relationship Id="rId4" Type="${REL}/slide" Target="slides/slide2.xml"/></Relationships>`,
      'ppt/slides/slide3.xml': '<p:sld><p:cSld><p:spTree/></p:cSld></p:sld>',
      'ppt/slides/slide1.xml': slideAudio,
      'ppt/slides/_rels/slide1.xml.rels': relsMidia('media1.mp3', 'audio'),
      'ppt/slides/slide2.xml': slideVideo,
      'ppt/slides/_rels/slide2.xml.rels': relsMidia('media2.mp4', 'video'),
      'ppt/media/media1.mp3': Buffer.from('ID3 áudio de mentira'),
      'ppt/media/media2.mp4': Buffer.alloc(5000, 7),
    },
    ['ppt/media/media2.mp4'],
  )
}

describe('ZIP e XML do .pptx', () => {
  const arq = join(pasta, 'teste.pptx')
  pptxDeTeste(arq)

  it('lê entradas comprimidas e guardadas', async () => {
    const z = new ArquivoZip(arq)
    try {
      expect(z.tem('ppt/presentation.xml')).toBe(true)
      expect(z.texto('ppt/media/media1.mp3')).toBe('ID3 áudio de mentira')
      expect((await z.lerAsync('ppt/media/media2.mp4')).length).toBe(5000)
      expect(() => z.ler('nao/existe')).toThrow(/não existe/)
    } finally {
      z.fechar()
    }
  })

  it('recusa arquivo que não é ZIP', () => {
    const falso = join(pasta, 'falso.pptx')
    writeFileSync(falso, 'isto não é um zip')
    expect(() => new ArquivoZip(falso)).toThrow(/não é um .pptx válido/)
  })

  it('acha vídeo e áudio na ordem da apresentação, com posição e início', () => {
    const z = new ArquivoZip(arq)
    try {
      const m = midiasDoPptx(z)
      expect(m).toHaveLength(2)
      expect(m[0]).toMatchObject({ slide: 1, tipo: 'audio', nome: 'Entrada.mp3', entrada: 'ppt/media/media1.mp3', inicio: 'sozinho', continua: true, repetir: false })
      expect(m[1]).toMatchObject({ slide: 2, tipo: 'video', nome: 'Hino & vídeo.mp4', entrada: 'ppt/media/media2.mp4', inicio: 'clique', repetir: true, continua: false })
      expect(m[1]!.x).toBeCloseTo(0.1)
      expect(m[1]!.y).toBeCloseTo(0.1)
      expect(m[1]!.l).toBeCloseTo(0.5)
      expect(m[1]!.a).toBeCloseTo(0.5)
    } finally {
      z.fechar()
    }
  })
})

const IDEAIS = join(homedir(), 'Desktop', 'materiais sonoplastia', 'Aventureiros', 'IDEAIS EQUIPE aventureiros - PP (1).pptx')

describe.skipIf(!existsSync(IDEAIS))('PPTX real deste PC', () => {
  it('acha o hino (vídeo) e a entrada das bandeiras (áudio)', () => {
    const z = new ArquivoZip(IDEAIS)
    try {
      const m = midiasDoPptx(z)
      expect(m.map((x) => x.tipo).sort()).toEqual(['audio', 'video'])
      const v = m.find((x) => x.tipo === 'video')!
      expect(v).toMatchObject({ entrada: 'ppt/media/media2.mp4', inicio: 'clique' })
      expect(v.l).toBeGreaterThan(0.9)
    } finally {
      z.fechar()
    }
  })
})

describe('anotações e slides vizinhos', () => {
  it('limpa as quebras de linha do PowerPoint', () => {
    expect(limparNotas('Primeiro\rSegundo\vlinha  \r\r\r\rFim ')).toBe('Primeiro\nSegundo\nlinha\n\nFim')
  })

  it('pula os ocultos só quando pede', () => {
    const ocultos = [false, true, true, false]
    expect(slideVizinho(ocultos, 0, 1, true)).toBe(3)
    expect(slideVizinho(ocultos, 0, 1, false)).toBe(1)
    expect(slideVizinho(ocultos, 3, -1, true)).toBe(0)
    expect(slideVizinho(ocultos, 3, 1, true)).toBeNull()
  })

  it('a configuração manda no início das mídias', () => {
    expect(comecaSozinha({ inicio: 'clique' }, 'como-no-arquivo')).toBe(false)
    expect(comecaSozinha({ inicio: 'clique' }, 'sozinho')).toBe(true)
    expect(comecaSozinha({ inicio: 'sozinho' }, 'no-clique')).toBe(false)
  })
})

const midia = (extra: Partial<MidiaSlide>): MidiaSlide => ({
  tipo: 'video',
  url: 'midia://local/v.mp4',
  nome: 'v',
  inicio: 'clique',
  repetir: false,
  continua: false,
  x: 0,
  y: 0,
  l: 1,
  a: 1,
  ...extra,
})

const apresentacao = (extra: Partial<DadosAbrirApresentacao> = {}): DadosAbrirApresentacao => ({
  apresentacaoId: 9,
  nome: 'Sermão',
  alvo: TODAS,
  slides: [
    { url: 'midia://local/1.png', proporcao: 16 / 9, oculto: false, notas: 'Boa noite', midias: [] },
    { url: 'midia://local/2.png', proporcao: 16 / 9, oculto: true, notas: '', midias: [] },
    { url: 'midia://local/3.png', proporcao: 16 / 9, oculto: false, notas: '', midias: [midia({})] },
    { url: 'midia://local/4.png', proporcao: 16 / 9, oculto: false, notas: '', midias: [midia({ tipo: 'audio', url: 'midia://local/a.mp3', inicio: 'sozinho', continua: true })] },
    { url: 'midia://local/5.png', proporcao: 16 / 9, oculto: false, notas: '', midias: [] },
  ],
  ...extra,
})

describe('Motor: apresentações', () => {
  it('abre no primeiro slide em todas as saídas, com o próximo (pulando o oculto) e as anotações', () => {
    const m = new Motor(['publico', 'palco'])
    m.abrirApresentacao(apresentacao())
    expect(m.estado.apresentacao).toMatchObject({ indice: 0, midiasIniciadas: true })
    expect(m.estado.saidas.palco!.conteudo).toMatchObject({ tipo: 'slide', indice: 0, total: 5, proximoUrl: 'midia://local/3.png', notas: 'Boa noite', video: null })
  })

  it('o passador pula o slide oculto; clicar nele mostra', () => {
    const m = new Motor(['publico'])
    m.abrirApresentacao(apresentacao())
    m.executar({ tipo: 'apresentacao:passo', passo: 1 })
    expect(m.estado.apresentacao!.indice).toBe(2)
    m.executar({ tipo: 'apresentacao:slide', indice: 1 })
    expect(m.estado.saidas.publico!.conteudo).toMatchObject({ indice: 1 })
    m.pularOcultos = false
    m.executar({ tipo: 'apresentacao:passo', passo: -1 })
    expect(m.estado.apresentacao!.indice).toBe(0)
  })

  it('vídeo "no clique": o 1º próximo começa o vídeo, o 2º troca de slide; só a primeira saída tem som', () => {
    const m = new Motor(['publico', 'palco'])
    m.abrirApresentacao(apresentacao({ indice: 2 }))
    expect(m.estado.saidas.publico!.video).toMatchObject({ tocando: false, mudo: false })
    expect(m.estado.saidas.palco!.video).toMatchObject({ tocando: false, mudo: true })
    m.executar({ tipo: 'apresentacao:passo', passo: 1 })
    expect(m.estado.apresentacao!.indice).toBe(2)
    expect(m.estado.saidas.publico!.video.tocando).toBe(true)
    m.executar({ tipo: 'apresentacao:passo', passo: 1 })
    expect(m.estado.apresentacao!.indice).toBe(3)
    expect(m.estado.saidas.publico!.video.tocando).toBe(false)
  })

  it('começar o vídeo pelo player conta como o clique', () => {
    const m = new Motor(['publico'])
    m.abrirApresentacao(apresentacao({ indice: 2 }))
    m.executar({ tipo: 'midia', alvo: 'publico', acao: 'tocar' })
    m.executar({ tipo: 'apresentacao:passo', passo: 1 })
    expect(m.estado.apresentacao!.indice).toBe(3)
  })

  it('"parar" no vídeo do slide volta o vídeo para o começo e mantém o slide', () => {
    const m = new Motor(['publico'])
    m.abrirApresentacao(apresentacao({ indice: 2 }))
    m.executar({ tipo: 'midia', alvo: 'publico', acao: 'tocar' })
    m.executar({ tipo: 'midia', alvo: 'publico', acao: 'parar' })
    expect(m.estado.saidas.publico!.conteudo.tipo).toBe('slide')
    expect(m.estado.saidas.publico!.video).toMatchObject({ tocando: false, busca: { segundos: 0 } })
  })

  it('no modo "sozinho", o vídeo já começa quando o slide aparece', () => {
    const m = new Motor(['publico'])
    m.midiasDosSlides = 'sozinho'
    m.abrirApresentacao(apresentacao({ indice: 2 }))
    expect(m.estado.saidas.publico!.video.tocando).toBe(true)
    m.executar({ tipo: 'apresentacao:passo', passo: 1 })
    expect(m.estado.apresentacao!.indice).toBe(3)
  })

  it('áudio automático toca na trilha e continua no slide seguinte; fechar para tudo', () => {
    const m = new Motor(['publico'])
    m.abrirApresentacao(apresentacao({ indice: 3 }))
    expect(m.estado.audio.fonte).toMatchObject({ tipo: 'slide', url: 'midia://local/a.mp3', continua: true })
    m.executar({ tipo: 'apresentacao:passo', passo: 1 })
    expect(m.estado.audio.fonte?.url).toBe('midia://local/a.mp3')
    m.executar({ tipo: 'apresentacao:fechar' })
    expect(m.estado.audio.fonte).toBeNull()
    expect(m.estado.apresentacao).toBeNull()
    expect(m.estado.saidas.publico!.conteudo.tipo).toBe('vazio')
  })

  it('áudio que não continua para quando o slide muda', () => {
    const m = new Motor(['publico'])
    const d = apresentacao({ indice: 3 })
    d.slides[3]!.midias[0]!.continua = false
    m.abrirApresentacao(d)
    m.executar({ tipo: 'apresentacao:passo', passo: 1 })
    expect(m.estado.audio.fonte).toBeNull()
    // o player também controla o áudio do slide
    expect(m.estado.audio.controle.tocando).toBe(false)
    expect(AUDIO).toBe('audio')
  })

  it('o passador respeita a saída onde o operador pôs outra coisa', () => {
    const m = new Motor(['publico', 'palco'])
    m.abrirApresentacao(apresentacao())
    m.executar({ tipo: 'mostrar', alvo: 'palco', conteudo: { tipo: 'teste' } })
    m.executar({ tipo: 'apresentacao:passo', passo: 1 })
    expect(m.estado.saidas.publico!.conteudo).toMatchObject({ tipo: 'slide', indice: 2 })
    expect(m.estado.saidas.palco!.conteudo.tipo).toBe('teste')
  })

  it('sem nenhuma saída mostrando a apresentação, o próximo traz de volta o mesmo slide', () => {
    const m = new Motor(['publico'])
    m.abrirApresentacao(apresentacao())
    m.executar({ tipo: 'mostrar', alvo: 'publico', conteudo: { tipo: 'texto', texto: 'Aviso' } })
    m.executar({ tipo: 'apresentacao:passo', passo: 1 })
    expect(m.estado.saidas.publico!.conteudo).toMatchObject({ tipo: 'slide', indice: 0 })
  })

  it('clicar num slide com outro alvo passa a mostrar nessa saída', () => {
    const m = new Motor(['publico', 'palco'])
    m.abrirApresentacao(apresentacao({ alvo: 'publico' }))
    expect(m.estado.saidas.palco!.conteudo.tipo).toBe('vazio')
    m.executar({ tipo: 'apresentacao:slide', indice: 4, alvo: TODAS })
    expect(m.estado.saidas.palco!.conteudo).toMatchObject({ tipo: 'slide', indice: 4, proximoUrl: null })
  })

  it('abrir uma música fecha o áudio do slide', () => {
    const m = new Motor(['publico'])
    m.abrirApresentacao(apresentacao({ indice: 3 }))
    m.abrirMusica({
      musicaId: 1,
      titulo: 'Hino',
      album: '',
      versao: 'cantado',
      slides: [{ texto: 'a', ms: 1000 }],
      alvo: 'publico',
      fundoUrl: null,
      audioUrl: 'midia://local/m.mp3',
      tituloNaIntroducao: true,
    })
    expect(m.estado.audio.fonte?.tipo).toBe('musica')
  })
})

describe('Biblioteca de apresentações (com conversor de mentira)', () => {
  const db = abrirBanco(join(pasta, 'teste.db'))
  afterAll(() => db.close())
  const exportados: string[] = []
  const conversor: Conversor = {
    largura: () => 1280,
    async exportar(_tipo, arquivo, destino, largura, aoProgresso) {
      exportados.push(arquivo)
      for (let i = 1; i <= 3; i++) {
        writeFileSync(join(destino, `00${i}.png`), 'png')
        aoProgresso(i, 3)
      }
      return {
        largura,
        altura: 720,
        slides: [1, 2, 3].map((i) => ({ arquivo: `00${i}.png`, id: 255 + i, oculto: i === 2, notas: i === 1 ? 'Falar devagar' : '' })),
      }
    },
    async miniatura(_png, destino) {
      writeFileSync(destino, 'jpg')
      return { largura: 1280, altura: 720 }
    },
    async prepararMidia(caminho) {
      return caminho
    },
  }
  const bib = new BibliotecaApresentacoes(db, { arquivos: join(pasta, 'arquivos'), slides: join(pasta, 'slides') }, conversor)

  it('recusa formatos com macro e antigos, e converte um PDF', async () => {
    const pdf = join(pasta, 'Culto jovem.pdf')
    writeFileSync(pdf, '%PDF de mentira')
    writeFileSync(join(pasta, 'velho.ppt'), 'x')
    writeFileSync(join(pasta, 'macro.pptm'), 'x')
    const r = await bib.importar([pdf, join(pasta, 'velho.ppt'), join(pasta, 'macro.pptm')])
    expect(r.importadas).toHaveLength(1)
    expect(r.ignoradas.join(' ')).toMatch(/velho\.ppt \(formato antigo/)
    expect(r.ignoradas.join(' ')).toMatch(/macro\.pptm \(pode ter macros/)
    for (let i = 0; i < 20 && bib.obter(r.importadas[0]!)!.situacao !== 'pronto'; i++) await new Promise((x) => setTimeout(x, 25))
    const a = bib.obter(r.importadas[0]!)!
    expect(a).toMatchObject({ nome: 'Culto jovem', tipo: 'pdf', situacao: 'pronto', total: 3 })
    expect(a.slides.map((s) => s.oculto)).toEqual([false, true, false])
    expect(a.slides[0]).toMatchObject({ notas: 'Falar devagar', largura: 1280, altura: 720, midias: [] })
    expect(a.slides[0]!.url).toMatch(/^midia:\/\/local\//)
    expect(bib.listar('culto')[0]?.miniaturaUrl).toMatch(/-mini\.jpg$/)
  })

  it('o mesmo arquivo de novo não duplica; excluir apaga tudo', async () => {
    const pdf = join(pasta, 'Culto jovem.pdf')
    const r = await bib.importar([pdf])
    expect(r.repetidas).toHaveLength(1)
    bib.apagar(r.repetidas[0]!)
    expect(bib.listar()).toEqual([])
  })

  it('erro na conversão fica registrado com o motivo', async () => {
    const falha: Conversor = { ...conversor, exportar: async () => Promise.reject(new Error('O PowerPoint não está instalado')) }
    const b2 = new BibliotecaApresentacoes(db, { arquivos: join(pasta, 'arquivos'), slides: join(pasta, 'slides') }, falha)
    const pptx = join(pasta, 'Sermão.pptx')
    writeFileSync(pptx, 'pptx de mentira')
    const r = await b2.importar([pptx])
    for (let i = 0; i < 20 && b2.obter(r.importadas[0]!)!.situacao !== 'erro'; i++) await new Promise((x) => setTimeout(x, 25))
    expect(b2.obter(r.importadas[0]!)).toMatchObject({ situacao: 'erro', detalhe: 'O PowerPoint não está instalado' })
  })
})

const PASTA_SCRIPTS = join(__dirname, '..', 'scripts', 'powershell')
const PDF_REAL = 'C:\\Holyrics\\Holyrics\\files\\media\\file\\Mordomia.pdf'

describe.skipIf(process.platform !== 'win32' || !existsSync(PDF_REAL))('PDF real pelo leitor do Windows', () => {
  it('exporta cada página como PNG', async () => {
    const destino = mkdtempSync(join(pasta, 'pdf-'))
    let ultimo = 0
    const r = await exportarSlides({ pastaScripts: PASTA_SCRIPTS, tipo: 'pdf', arquivo: PDF_REAL, pasta: destino, largura: 640, aoProgresso: (f) => (ultimo = f) })
    expect(r.slides.length).toBeGreaterThan(1)
    expect(ultimo).toBe(r.slides.length)
    const png = readFileSync(join(destino, r.slides[0]!.arquivo))
    expect(png.subarray(1, 4).toString()).toBe('PNG')
    expect(png.readUInt32BE(16)).toBe(640)
  }, 120000)
})
