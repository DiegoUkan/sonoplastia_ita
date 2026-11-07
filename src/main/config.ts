import { EventEmitter } from 'node:events'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { type Config, configPadrao, EsquemaConfig } from '../shared/config'
import { log } from './log'

/** Lê e grava `config.json`. Emite 'mudou' com a configuração nova. */
export class ArmazemConfig extends EventEmitter {
  private atual: Config = configPadrao()
  private gravacao: NodeJS.Timeout | null = null

  constructor(private readonly arquivo: string) {
    super()
  }

  carregar(): Config {
    if (!existsSync(this.arquivo)) {
      this.atual = configPadrao()
      this.gravarAgora()
      return this.atual
    }
    try {
      const bruto = JSON.parse(readFileSync(this.arquivo, 'utf8'))
      this.atual = EsquemaConfig.parse(bruto)
    } catch (e) {
      const copia = this.arquivo.replace(/\.json$/, `.invalido-${Date.now()}.json`)
      log.erro(`config.json inválido; guardado em ${copia} e usando o padrão.`, e)
      try {
        renameSync(this.arquivo, copia)
      } catch {
        // segue com o padrão mesmo assim
      }
      this.atual = configPadrao()
      this.gravarAgora()
    }
    return this.atual
  }

  obter(): Config {
    return this.atual
  }

  /** Valida, aplica na hora e grava no disco logo depois (agrupa mudanças seguidas). */
  salvar(nova: unknown): Config {
    this.atual = EsquemaConfig.parse(nova)
    this.emit('mudou', this.atual)
    if (this.gravacao) clearTimeout(this.gravacao)
    this.gravacao = setTimeout(() => this.gravarAgora(), 400)
    return this.atual
  }

  gravarAgora(): void {
    if (this.gravacao) {
      clearTimeout(this.gravacao)
      this.gravacao = null
    }
    const temp = this.arquivo + '.tmp'
    writeFileSync(temp, JSON.stringify(this.atual, null, 2), 'utf8')
    renameSync(temp, this.arquivo)
  }
}
