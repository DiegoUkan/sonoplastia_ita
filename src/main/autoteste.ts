/**
 * Autoteste (`electron . --autoteste`): roda uma sequência de comandos com as janelas OCULTAS e sem
 * som, captura cada janela em PNG e grava um relatório. Não mexe nos projetores: use junto com
 * SONOPLASTIA_DADOS apontando para uma pasta vazia (sem monitor escolhido, as saídas viram janelas
 * de teste, que aqui nem aparecem).
 * Saída em SONOPLASTIA_AUTOTESTE (padrão: <pasta de dados>\autoteste).
 */
import type { BrowserWindow } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Comando, Telemetria } from '../shared/estado'
import { log } from './log'
import type { Motor } from './motor'
import type { GerenciadorTelas } from './telas/gerenciador'

interface Contexto {
  motor: Motor
  telas: GerenciadorTelas
  comando: () => BrowserWindow | null
  telemetrias: Map<string, Telemetria>
  videoDeTeste: () => Promise<string>
  liberar: (caminho: string) => string
  /** o mesmo que o atalho de emergência faz */
  recolher: () => void
  pasta: string
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function rodarAutoteste(ctx: Contexto): Promise<void> {
  mkdirSync(ctx.pasta, { recursive: true })
  const relatorio: Record<string, unknown> = { inicio: new Date().toISOString(), capturas: [] as unknown[] }
  const capturas = relatorio.capturas as unknown[]

  const capturar = async (nome: string) => {
    const alvos: Array<{ id: string; win: BrowserWindow }> = ctx.telas.janelasAbertas().map((j) => ({ id: j.saidaId, win: j.win }))
    const c = ctx.comando()
    if (c) alvos.push({ id: 'comando', win: c })
    for (const { id, win } of alvos) {
      // janela oculta só pinta quando alguém pede: a 1ª captura dispara a pintura e volta o quadro anterior
      await win.webContents.capturePage()
      await esperar(400)
      const img = await win.webContents.capturePage()
      const arquivo = join(ctx.pasta, `${nome}-${id}.png`)
      writeFileSync(arquivo, img.toPNG())
      capturas.push({ nome, id, vazia: img.isEmpty(), tamanho: img.getSize() })
    }
  }
  const fazer = (c: Comando) => ctx.motor.executar(c)

  try {
    await esperar(3000)
    relatorio.telas = ctx.telas.estado()

    fazer({ tipo: 'mostrar', alvo: 'todas', conteudo: { tipo: 'teste' } })
    await esperar(1500)
    await capturar('1-padrao-de-teste')

    fazer({
      tipo: 'mostrar',
      alvo: 'publico',
      conteudo: {
        tipo: 'texto',
        texto: 'Porque Deus amou o mundo de tal maneira\nque deu o seu Filho unigênito',
        referencia: 'João 3:16 (ARA)',
      },
    })
    fazer({ tipo: 'tela', alvo: 'palco', tela: 'logo' })
    await esperar(1500)
    await capturar('2-texto-e-logo')

    fazer({ tipo: 'tela', alvo: 'todas', tela: 'preto' })
    await esperar(1000)
    await capturar('3-preto')
    fazer({ tipo: 'tela', alvo: 'todas', tela: 'normal' })

    try {
      const video = await ctx.videoDeTeste()
      fazer({ tipo: 'mostrar', alvo: 'publico', conteudo: { tipo: 'video', url: ctx.liberar(video), nome: 'Vídeo de teste', loop: false } })
      await esperar(6000)
      relatorio.telemetria = Object.fromEntries(ctx.telemetrias)
      await capturar('4-video')
      fazer({ tipo: 'video', alvo: 'publico', acao: 'pausar' })
      await esperar(800)
      relatorio.telemetriaPausado = Object.fromEntries(ctx.telemetrias)
    } catch (e) {
      relatorio.erroVideo = String(e)
    }

    ctx.recolher()
    await esperar(500)
    relatorio.telasAposEmergencia = ctx.telas.estado()
    relatorio.janelasAposEmergencia = ctx.telas.janelasAbertas().length
    ctx.telas.reabrir()
    await esperar(2000)
    relatorio.telasAposReabrir = ctx.telas.estado()
    relatorio.janelasAposReabrir = ctx.telas.janelasAbertas().length

    relatorio.estadoFinal = ctx.motor.estado
  } catch (e) {
    relatorio.erro = e instanceof Error ? (e.stack ?? e.message) : String(e)
  }
  relatorio.fim = new Date().toISOString()
  writeFileSync(join(ctx.pasta, 'relatorio.json'), JSON.stringify(relatorio, null, 2), 'utf8')
  log.info('Autoteste concluído em', ctx.pasta)
}
