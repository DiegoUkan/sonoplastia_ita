import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Pasta de dados do programa. Fica fora do AppData (no PC da igreja o Claude roda num contêiner MSIX
 * que redireciona o AppData) e num caminho sem espaços. `SONOPLASTIA_DADOS` troca a pasta (testes).
 */
const base = process.env.SONOPLASTIA_DADOS || 'C:\\Sonoplastia'

export const caminhos = {
  base,
  dados: join(base, 'dados'),
  config: join(base, 'dados', 'config.json'),
  banco: join(base, 'dados', 'sonoplastia.db'),
  midias: join(base, 'midias'),
  videos: join(base, 'midias', 'video'),
  apresentacoes: join(base, 'midias', 'apresentacao'),
  /** imagens de fundo das seções da liturgia */
  fundos: join(base, 'midias', 'fundos'),
  slides: join(base, 'cache', 'slides'),
  biblias: join(base, 'biblias'),
  cache: join(base, 'cache'),
  miniaturas: join(base, 'cache', 'miniaturas'),
  logs: join(base, 'logs'),
}

export function garantirPastas(): void {
  for (const p of [caminhos.dados, caminhos.videos, caminhos.biblias, caminhos.miniaturas, caminhos.logs]) {
    mkdirSync(p, { recursive: true })
  }
}
