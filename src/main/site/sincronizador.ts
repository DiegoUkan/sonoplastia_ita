/**
 * Sincronização com o catálogo de mídias do site da igreja (`manifest.json`).
 *
 * A cada `refresh_after_seconds` (5 min) lê o manifesto e baixa para a biblioteca o que é deste
 * sábado (`available` + `valid_for_sabbath` + `download_url`):
 *  - séries semanais (automatico) e fixos: uma mídia só por série; a versão nova TROCA o arquivo dela
 *    (mesmo id), então os itens da liturgia que usam a série passam a usar o vídeo novo sozinhos. O
 *    antigo sai. Se a mídia estiver no ar, a troca espera ela sair;
 *  - envios (enviado): entram como mídias novas; quando o prazo acaba (`expires_at`), vão para a
 *    lixeira (só se o manifesto veio sem avisos de falha do site);
 *  - .pptx/.ppsx/.pdf vão para Apresentações; outros tipos ficam de fora.
 * O que chega fica marcado como "novo" até o operador ver. Se o operador tirar da biblioteca, aquele
 * arquivo não é baixado de novo (a versão da semana seguinte de uma série volta).
 *
 * O endereço tem uma chave de leitura: no log, só com a chave escondida.
 */
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, promises as fsp, readdirSync, rmSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'
import type { ResultadoImportacao } from '../../shared/dados'
import type { EstadoMotor } from '../../shared/estado'
import { proximoSabado } from '../../shared/liturgia'
import { caminhoDaUrlMidia, ESQUEMA_MIDIA } from '../../shared/midia'
import { type CategoriaSite, diaMes, type EstadoSite, type InfoSiteMidia, type ItemSite, type SituacaoSite } from '../../shared/site'
import { type Banco, transacao } from '../banco'
import { log } from '../log'
import { AGENTE, baixarArquivo, type Buscar, descartarParcial } from './baixar'
import { chaveRevisao, destinoDoArquivo, enderecoValido, lerManifesto, type Manifesto, mesmaOrigem, nomeSeguro, ocultarChave } from './manifesto'

export interface MidiasDoSite {
  registrarBaixado(caminho: string, nomeArquivo: string, nome: string): Promise<{ id: number; repetida: boolean }>
  substituirArquivo(id: number, caminho: string, nomeArquivo: string, nome: string): Promise<void>
  excluir(id: number): void
}

export interface ApresentacoesDoSite {
  importar(caminhos: string[]): Promise<ResultadoImportacao>
  apagar(id: number): void
}

/** O que está no ar agora: não é trocado nem vai para a lixeira. */
export interface EmUso {
  /** caminhos já normalizados por `normalizar` */
  arquivos: Set<string>
  apresentacoes: Set<number>
}

export interface DepsSite {
  db: Banco
  buscar: Buscar
  /** pasta dos downloads pela metade */
  pasta: string
  midias: MidiasDoSite
  apresentacoes: ApresentacoesDoSite
  endereco(): string
  ativo(): boolean
  emUso(): EmUso
  agora?(): Date
  /** false só nos testes (servidor local em http) */
  exigirHttps?: boolean
}

interface Linha {
  id: string
  categoria: CategoriaSite
  titulo: string
  arquivo: string | null
  mime: string | null
  bytes: number
  revisao: string
  disponivel: number
  valido: number
  data_midia: string | null
  sabado: string | null
  nota: string | null
  expira_em: string | null
  url: string | null
  no_manifesto: number
  revisao_local: string | null
  data_local: string | null
  midia_id: number | null
  apresentacao_id: number | null
  gerenciada: number
  situacao: 'ok' | 'erro' | 'esperando'
  detalhe: string | null
  novo: number
  baixado_em: string | null
  retirado_em: string | null
}

/** Como está o que veio do site na biblioteca. */
interface Local {
  /** tem mídia ou apresentação ligada */
  ligado: boolean
  /** ligada, mas o operador tirou da biblioteca (lixeira ou apagada de vez) */
  excluida: boolean
  /** a linha da mídia ainda existe no banco (mesmo na lixeira) */
  linhaExiste: boolean
  arquivo: string | null
  arquivoExiste: boolean
}

const ORDEM_CATEGORIA: Record<CategoriaSite, number> = { automatico: 0, fixo: 1, enviado: 2 }

export const normalizar = (caminho: string) => resolve(caminho).toLowerCase()

/** Arquivos e apresentações que estão no ar (saídas, trilha de áudio). */
export function emUsoNoMotor(e: EstadoMotor): EmUso {
  const arquivos = new Set<string>()
  const apresentacoes = new Set<number>()
  const url = (u: string | null | undefined) => {
    if (!u?.startsWith(`${ESQUEMA_MIDIA}:`)) return
    try {
      arquivos.add(normalizar(caminhoDaUrlMidia(u)))
    } catch {
      // endereço estranho: ignora
    }
  }
  for (const s of Object.values(e.saidas)) {
    const c = s.conteudo
    if (c.tipo === 'video' || c.tipo === 'imagem') url(c.url)
    if (c.tipo === 'slide') apresentacoes.add(c.apresentacaoId)
  }
  url(e.audio.fonte?.url)
  if (e.apresentacao) apresentacoes.add(e.apresentacao.apresentacaoId)
  return { arquivos, apresentacoes }
}

const idSeguro = (id: string) => id.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80)
const resumo = (texto: string) => createHash('sha1').update(texto).digest('hex').slice(0, 10)
const mensagem = (e: unknown) => ocultarChave(e instanceof Error ? e.message : String(e))

export class SincronizadorSite extends EventEmitter {
  private ligado = false
  private parado = false
  private relogio: NodeJS.Timeout | null = null
  private rodando: Promise<void> | null = null
  private deNovo = false
  private falhas = 0
  private intervaloS = 300
  private cancelar: AbortController | null = null
  private ultimoEndereco: string | null = null
  private ultimoAtivo: boolean | null = null
  private incompativel = false
  private baixando: { id: string; fracao: number } | null = null
  private avisoProgresso = 0
  private st = {
    verificando: false,
    ultimaVerificacao: null as string | null,
    ultimoSucesso: null as string | null,
    proximaVerificacao: null as string | null,
    erro: null as string | null,
    avisos: [] as string[],
    sabado: null as string | null,
  }

  constructor(private readonly d: DepsSite) {
    super()
  }

  private agora(): Date {
    return this.d.agora?.() ?? new Date()
  }

  // ------------------------------------------------------------------ agenda

  /** Começa a conferir o site sozinho (a 1ª vez daqui a pouco, para não pesar a abertura). */
  iniciar(atrasoMs = 5000): void {
    this.ligado = true
    this.parado = false
    this.ultimoEndereco = this.d.endereco()
    this.ultimoAtivo = this.d.ativo()
    this.agendar(atrasoMs)
  }

  parar(): void {
    this.ligado = false
    this.parado = true
    if (this.relogio) clearTimeout(this.relogio)
    this.relogio = null
    this.cancelar?.abort()
  }

  /** As configurações mudaram: com endereço novo (ou religado), confere logo. */
  configMudou(): void {
    const endereco = this.d.endereco()
    const ativo = this.d.ativo()
    if (endereco === this.ultimoEndereco && ativo === this.ultimoAtivo) return
    this.ultimoEndereco = endereco
    this.ultimoAtivo = ativo
    this.falhas = 0
    this.incompativel = false
    this.st.erro = null
    if (!ativo) this.cancelar?.abort()
    if (this.ligado) this.agendar(1000)
    this.emit('mudou')
  }

  /** "Atualizar agora": confere já (se já está conferindo, confere de novo logo depois). */
  atualizarAgora(): Promise<void> {
    this.incompativel = false
    if (this.rodando) {
      this.deNovo = true
      return this.rodando
    }
    return this.passada()
  }

  private agendar(ms: number): void {
    if (this.relogio) clearTimeout(this.relogio)
    this.relogio = null
    if (!this.ligado || !this.d.ativo() || !enderecoValido(this.d.endereco(), this.d.exigirHttps ?? true)) {
      this.st.proximaVerificacao = null
      return
    }
    this.st.proximaVerificacao = new Date(this.agora().getTime() + ms).toISOString()
    this.relogio = setTimeout(() => {
      this.relogio = null
      void this.passada()
    }, ms)
  }

  /** Uma conferência completa: manifesto, downloads e limpeza. Nunca rejeita. */
  passada(): Promise<void> {
    if (this.rodando) return this.rodando
    this.rodando = (async () => {
      let proxima = this.intervaloS * 1000
      let tentou = true
      try {
        tentou = await this.conferir()
        if (tentou) this.falhas = 0
      } catch (e) {
        this.falhas++
        this.st.erro = mensagem(e)
        log.aviso('Site: não foi possível conferir os arquivos:', this.st.erro)
        // espera crescente: 30 s, 1 min, 2 min… até o intervalo normal
        proxima = Math.min(proxima, 30_000 * 2 ** (this.falhas - 1))
      } finally {
        this.st.verificando = false
        if (tentou) this.st.ultimaVerificacao = this.agora().toISOString()
        this.baixando = null
        this.rodando = null
      }
      if (this.incompativel) proxima = 6 * 3600_000
      if (this.deNovo) {
        this.deNovo = false
        proxima = 0
      }
      this.agendar(proxima)
      this.emit('mudou')
    })()
    return this.rodando
  }

  // ------------------------------------------------------------------ passada

  /** Devolve false quando não há o que conferir (desligado ou sem endereço). */
  private async conferir(): Promise<boolean> {
    const endereco = enderecoValido(this.d.endereco(), this.d.exigirHttps ?? true)
    if (!this.d.ativo() || !endereco) {
      this.st.erro = this.d.endereco().trim() && !endereco ? 'O endereço do manifesto não é válido (precisa começar com https://).' : null
      return false
    }
    this.st.verificando = true
    this.emit('mudou')
    const leitura = lerManifesto(await this.lerDoSite(endereco))
    if (!leitura.ok) {
      if (leitura.incompativel) this.incompativel = true
      throw new Error(leitura.erro)
    }
    const m = leitura.manifesto
    this.intervaloS = m.atualizarS
    this.st.sabado = m.sabado
    this.st.avisos = m.avisos
    this.registrar(m)
    this.st.ultimoSucesso = this.agora().toISOString()
    this.st.erro = null
    this.emit('mudou')
    await this.baixarPendentes(endereco)
    if (m.avisos.length === 0) this.retirarVencidos()
    return true
  }

  private async lerDoSite(endereco: URL): Promise<string> {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 30_000)
    try {
      const r = await this.d.buscar(endereco.toString(), {
        headers: { Accept: 'application/json', 'User-Agent': AGENTE, 'Cache-Control': 'no-cache' },
        signal: ctrl.signal,
      })
      if (r.status === 403 || r.status === 404 || r.status === 401) {
        throw new Error(`O site recusou o endereço do manifesto (${r.status}). Confira o endereço em Configurações → Site da igreja: a chave pode ter sido trocada.`)
      }
      if (r.status !== 200) throw new Error(`O site respondeu ${r.status} ao pedir o manifesto.`)
      const texto = await r.text()
      if (texto.length > 8 * 1024 * 1024) throw new Error('O manifesto do site veio grande demais.')
      return texto
    } catch (e) {
      if (ctrl.signal.aborted) throw new Error('O site não respondeu em 30 segundos.')
      if (e instanceof TypeError) throw new Error(`Sem conexão com o site (a internet está ligada?). ${mensagem(e.cause ?? e)}`.trim())
      throw e
    } finally {
      clearTimeout(t)
    }
  }

  /** Guarda o que o manifesto diz de cada arquivo (sem mexer no que já está na biblioteca). */
  private registrar(m: Manifesto): void {
    const agora = this.agora().toISOString()
    const anterior = new Map(
      (this.d.db.prepare('select id, revisao from site_itens').all() as Array<{ id: string; revisao: string }>).map((l) => [l.id, l.revisao]),
    )
    transacao(this.d.db, () => {
      this.d.db.prepare('update site_itens set no_manifesto = 0').run()
      const gravar = this.d.db.prepare(
        `insert into site_itens (id, categoria, titulo, arquivo, mime, bytes, revisao, disponivel, valido, data_midia, sabado,
           nota, expira_em, url, no_manifesto, criado_em, atualizado_em)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
         on conflict (id) do update set categoria = excluded.categoria, titulo = excluded.titulo, arquivo = excluded.arquivo,
           mime = excluded.mime, bytes = excluded.bytes, revisao = excluded.revisao, disponivel = excluded.disponivel,
           valido = excluded.valido, data_midia = excluded.data_midia, sabado = excluded.sabado, nota = excluded.nota,
           expira_em = excluded.expira_em, url = excluded.url, no_manifesto = 1, atualizado_em = excluded.atualizado_em`,
      )
      const reiniciar = this.d.db.prepare("update site_itens set situacao = 'ok', detalhe = null where id = ?")
      for (const i of m.itens) {
        const rev = chaveRevisao(i)
        gravar.run(
          i.id,
          i.categoria,
          i.titulo,
          i.arquivo,
          i.mime,
          i.bytes,
          rev,
          i.disponivel ? 1 : 0,
          i.valido ? 1 : 0,
          i.dataMidia,
          m.sabado,
          i.nota || null,
          i.expiraEm,
          i.url,
          agora,
          agora,
        )
        // arquivo mudou no site: o erro ou a espera de antes não valem mais
        if (anterior.has(i.id) && anterior.get(i.id) !== rev) reiniciar.run(i.id)
      }
    })
  }

  private linhas(onde = '1 = 1', ...params: Array<string | number>): Linha[] {
    return this.d.db.prepare(`select * from site_itens where ${onde}`).all(...params) as unknown as Linha[]
  }

  private local(l: Linha): Local {
    if (l.midia_id !== null) {
      const m = this.d.db.prepare('select arquivo, excluido_em from midias where id = ?').get(l.midia_id) as
        | { arquivo: string; excluido_em: string | null }
        | undefined
      if (!m) return { ligado: true, excluida: true, linhaExiste: false, arquivo: null, arquivoExiste: false }
      return { ligado: true, excluida: m.excluido_em !== null, linhaExiste: true, arquivo: m.arquivo, arquivoExiste: existsSync(m.arquivo) }
    }
    if (l.apresentacao_id !== null) {
      const a = this.d.db.prepare('select arquivo from apresentacoes where id = ?').get(l.apresentacao_id) as { arquivo: string } | undefined
      return { ligado: true, excluida: !a, linhaExiste: !!a, arquivo: a?.arquivo ?? null, arquivoExiste: !!a }
    }
    return { ligado: false, excluida: false, linhaExiste: false, arquivo: null, arquivoExiste: false }
  }

  private nomeArquivo(l: Linha): string {
    return nomeSeguro(l.arquivo, l.mime, l.id)
  }

  /** O arquivo daqui vale para o sábado de agora. */
  private atual(l: Linha): boolean {
    if (l.revisao_local === null) return false
    if (l.categoria === 'fixo') return true
    return l.data_local === proximoSabado(this.agora())
  }

  private marcar(id: string, situacao: Linha['situacao'], detalhe: string | null): void {
    this.d.db.prepare('update site_itens set situacao = ?, detalhe = ? where id = ?').run(situacao, detalhe, id)
  }

  /** O que precisa ser baixado agora (e marca o que espera ou deu erro). */
  private pendentes(endereco: URL): Linha[] {
    const uso = this.d.emUso()
    const r: Linha[] = []
    for (const l of this.linhas('no_manifesto = 1')) {
      if (!destinoDoArquivo(this.nomeArquivo(l))) continue
      if (!l.disponivel || !l.valido || !l.url) continue
      if (l.retirado_em) continue
      const loc = this.local(l)
      // o operador tirou da biblioteca: aquele arquivo não volta (a versão nova de uma série volta)
      if (loc.excluida && (l.categoria === 'enviado' || l.revisao_local === l.revisao)) continue
      if (loc.ligado && !loc.excluida && l.revisao_local === l.revisao && loc.arquivoExiste) {
        if (l.situacao !== 'ok') this.marcar(l.id, 'ok', null)
        continue
      }
      if (!mesmaOrigem(l.url, endereco)) {
        this.marcar(l.id, 'erro', 'O link deste arquivo aponta para fora do site da igreja: não foi baixado.')
        continue
      }
      // a versão de agora está no ar: a troca espera
      if (l.gerenciada && loc.ligado && !loc.excluida && this.estaNoAr(l, loc, uso)) {
        this.marcar(l.id, 'esperando', 'Versão nova no site, mas a de agora está no ar: troca quando ela sair.')
        continue
      }
      r.push(l)
    }
    // os pequenos primeiro (avisos e imagens chegam logo, mesmo com um vídeo grande na fila)
    return r.sort((a, b) => ORDEM_CATEGORIA[a.categoria] - ORDEM_CATEGORIA[b.categoria] || a.bytes - b.bytes)
  }

  private estaNoAr(l: Linha, loc: Local, uso: EmUso): boolean {
    if (l.apresentacao_id !== null) return uso.apresentacoes.has(l.apresentacao_id)
    return !!loc.arquivo && uso.arquivos.has(normalizar(loc.arquivo))
  }

  private async baixarPendentes(endereco: URL): Promise<void> {
    mkdirSync(this.d.pasta, { recursive: true })
    const fila = this.pendentes(endereco)
    const esperados = new Set(fila.map((l) => this.parcialDe(l)))
    this.limparParciais(esperados)
    for (let n = 0; n < fila.length; n++) {
      if (this.parado || !this.d.ativo()) break
      const l = fila[n]!
      this.emit('progresso', { feito: n, total: fila.length, texto: l.titulo })
      try {
        await this.baixarUm(l)
      } catch (e) {
        const msg = mensagem(e)
        log.aviso(`Site: falha ao baixar "${l.titulo}" (${this.nomeArquivo(l)}):`, msg)
        this.marcar(l.id, 'erro', msg)
      }
      this.baixando = null
      this.emit('mudou')
    }
    if (fila.length) this.emit('progresso', { feito: fila.length, total: fila.length, fim: true })
  }

  private parcialDe(l: Linha): string {
    return join(this.d.pasta, `${idSeguro(l.id)}-${resumo(l.revisao)}.part`)
  }

  /** Apaga os downloads pela metade que não servem mais (arquivo mudou ou saiu do site). */
  private limparParciais(esperados: Set<string>): void {
    try {
      for (const nome of readdirSync(this.d.pasta)) {
        if (!/\.part(\.etag)?$/.test(nome)) continue
        const parcial = join(this.d.pasta, nome.replace(/\.etag$/, ''))
        if (!esperados.has(parcial)) rmSync(join(this.d.pasta, nome), { force: true })
      }
    } catch {
      // pasta ainda não existe
    }
  }

  private async baixarUm(l: Linha): Promise<void> {
    const nomeArquivo = this.nomeArquivo(l)
    const destino = destinoDoArquivo(nomeArquivo)!
    const parcial = this.parcialDe(l)
    this.baixando = { id: l.id, fracao: 0 }
    this.emit('mudou')
    log.info(`Site: baixando "${l.titulo}" (${nomeArquivo}, ${Math.round(l.bytes / 1024 / 1024)} MB)`)
    this.cancelar = new AbortController()
    try {
      await baixarArquivo({
        buscar: this.d.buscar,
        url: l.url!,
        parcial,
        tamanho: l.bytes,
        sinal: this.cancelar.signal,
        aoProgresso: (feito, total) => {
          if (!this.baixando) return
          this.baixando.fracao = total > 0 ? feito / total : 0
          const agora = Date.now()
          if (agora - this.avisoProgresso > 1000) {
            this.avisoProgresso = agora
            this.emit('mudou')
          }
        },
      })
    } finally {
      this.cancelar = null
    }

    // pode ter entrado no ar enquanto baixava: guarda o arquivo pronto e troca na próxima passada
    const loc = this.local(l)
    if (l.gerenciada && loc.ligado && !loc.excluida && this.estaNoAr(l, loc, this.d.emUso())) {
      this.marcar(l.id, 'esperando', 'Versão nova baixada, mas a de agora está no ar: troca quando ela sair.')
      return
    }

    let midiaId: number | null = null
    let apresentacaoId: number | null = null
    let gerenciada = true
    if (destino === 'apresentacao') {
      // a biblioteca de apresentações copia o arquivo e usa o nome dele: põe com o nome certo numa pasta só dele
      const pasta = join(this.d.pasta, idSeguro(l.id))
      mkdirSync(pasta, { recursive: true })
      const arquivo = join(pasta, nomeArquivo)
      await fsp.rename(parcial, arquivo)
      descartarParcial(parcial)
      try {
        const r = await this.d.apresentacoes.importar([arquivo])
        apresentacaoId = r.importadas[0] ?? r.repetidas[0] ?? null
        if (apresentacaoId === null) throw new Error(r.ignoradas.join('; ') || 'A apresentação não foi importada.')
        gerenciada = r.importadas.length > 0
      } finally {
        rmSync(pasta, { recursive: true, force: true })
      }
      // versão nova de uma apresentação que veio do site: a antiga sai (se não está no ar)
      if (l.apresentacao_id !== null && l.gerenciada && l.apresentacao_id !== apresentacaoId && !this.d.emUso().apresentacoes.has(l.apresentacao_id)) {
        this.d.apresentacoes.apagar(l.apresentacao_id)
      }
    } else {
      const nome = l.categoria === 'enviado' ? basename(nomeArquivo, extname(nomeArquivo)) : l.titulo
      // série com uma mídia só: troca o arquivo e mantém o id (a liturgia continua apontando para ela)
      const trocar = l.midia_id !== null && l.gerenciada === 1 && loc.linhaExiste && (l.categoria !== 'enviado' || !loc.excluida)
      if (trocar) {
        await this.d.midias.substituirArquivo(l.midia_id!, parcial, nomeArquivo, nome)
        midiaId = l.midia_id
      } else {
        const r = await this.d.midias.registrarBaixado(parcial, nomeArquivo, nome)
        midiaId = r.id
        gerenciada = !r.repetida
      }
      descartarParcial(parcial)
    }

    this.d.db
      .prepare(
        `update site_itens set revisao_local = revisao, data_local = data_midia, midia_id = ?, apresentacao_id = ?, gerenciada = ?,
         situacao = 'ok', detalhe = null, novo = 1, baixado_em = ?, retirado_em = null where id = ?`,
      )
      .run(midiaId, apresentacaoId, gerenciada ? 1 : 0, this.agora().toISOString(), l.id)
    log.info(`Site: "${l.titulo}" na biblioteca (${destino === 'apresentacao' ? `apresentação ${apresentacaoId}` : `mídia ${midiaId}`}).`)
  }

  /**
   * Envios vencidos (prazo acabou ou saíram do site) vão para a lixeira de Mídias. Só com um manifesto
   * sem avisos (uma fonte que falhou não é ordem de apagar) e só o que o programa baixou.
   */
  private retirarVencidos(): void {
    const agora = this.agora().getTime()
    const uso = this.d.emUso()
    for (const l of this.linhas("categoria = 'enviado' and midia_id is not null and gerenciada = 1 and retirado_em is null")) {
      const prazo = l.expira_em ? Date.parse(l.expira_em) : NaN
      const vencido = l.no_manifesto === 0 || (!Number.isNaN(prazo) && prazo <= agora)
      if (!vencido) continue
      const loc = this.local(l)
      if (loc.excluida || !loc.linhaExiste) continue
      if (this.estaNoAr(l, loc, uso)) continue
      this.d.midias.excluir(l.midia_id!)
      this.d.db.prepare('update site_itens set retirado_em = ?, novo = 0 where id = ?').run(this.agora().toISOString(), l.id)
      log.info(`Site: "${l.titulo}" saiu do prazo e foi para a lixeira de Mídias.`)
    }
  }

  // ------------------------------------------------------------------ o que a tela mostra

  estado(): EstadoSite {
    const itens = this.linhas('no_manifesto = 1')
      .map((l) => this.itemSite(l))
      .sort((a, b) => ORDEM_CATEGORIA[a.categoria] - ORDEM_CATEGORIA[b.categoria] || a.titulo.localeCompare(b.titulo, 'pt-BR'))
    return {
      configurado: !!this.d.endereco().trim(),
      ativo: this.d.ativo(),
      ...this.st,
      itens,
      novos: this.contarNovos(),
    }
  }

  private contarNovos(): number {
    return this.linhas('novo = 1').filter((l) => {
      const loc = this.local(l)
      return loc.ligado && !loc.excluida
    }).length
  }

  private itemSite(l: Linha): ItemSite {
    const nomeArquivo = this.nomeArquivo(l)
    const destino = destinoDoArquivo(nomeArquivo)
    const loc = this.local(l)
    const [situacao, detalhe] = this.situacao(l, loc, destino !== null, nomeArquivo)
    return {
      id: l.id,
      categoria: l.categoria,
      titulo: l.titulo,
      arquivo: l.arquivo,
      destino,
      bytes: l.bytes,
      dataMidia: l.data_midia,
      dataLocal: l.data_local,
      situacao,
      detalhe,
      progresso: situacao === 'baixando' ? (this.baixando?.fracao ?? 0) : null,
      novo: l.novo === 1 && loc.ligado && !loc.excluida,
      midiaId: loc.ligado && !loc.excluida ? l.midia_id : null,
      apresentacaoId: loc.ligado && !loc.excluida ? l.apresentacao_id : null,
    }
  }

  private situacao(l: Linha, loc: Local, aceito: boolean, nomeArquivo: string): [SituacaoSite, string | null] {
    if (this.baixando?.id === l.id) return ['baixando', null]
    if (!aceito) return ['ignorado', `O programa não usa arquivos ${extname(nomeArquivo).toLowerCase() || 'deste tipo'}.`]
    if (l.retirado_em) return ['expirado', 'O prazo do envio acabou: foi para a lixeira de Mídias.']
    if (loc.ligado) {
      if (loc.excluida) {
        return [
          'deletado',
          l.categoria === 'enviado' || l.revisao_local === l.revisao
            ? 'Você tirou da biblioteca: não é baixado de novo.'
            : 'Você tirou da biblioteca. A versão nova volta sozinha.',
        ]
      }
      if (l.situacao === 'erro') return ['erro', l.detalhe]
      if (l.situacao === 'esperando') return ['esperando', l.detalhe]
      if (l.revisao_local !== l.revisao && l.disponivel && l.valido && l.url) return ['na-fila', 'Versão nova no site: vai ser baixada.']
      if (this.atual(l)) return ['pronto', l.gerenciada ? null : 'Já estava na biblioteca (importado à mão).']
      const daqui = l.data_local ? `O arquivo daqui é de ${diaMes(l.data_local)}.` : ''
      return ['desatualizado', `${daqui} ${l.valido ? '' : l.nota || 'O site ainda não tem o deste sábado.'}`.trim()]
    }
    if (!l.disponivel || !l.url) return ['indisponivel', l.nota || 'O site ainda não tem este arquivo.']
    if (!l.valido) return ['fora-do-sabado', l.nota || 'Não é para este sábado.']
    if (l.situacao === 'erro' || l.situacao === 'esperando') return [l.situacao, l.detalhe]
    return ['na-fila', null]
  }

  /** Para os cartões da biblioteca de Mídias: o que veio do site, por id da mídia. */
  infosDasMidias(): Map<number, InfoSiteMidia> {
    const r = new Map<number, InfoSiteMidia>()
    for (const l of this.linhas('midia_id is not null and retirado_em is null')) {
      if (r.has(l.midia_id!)) continue
      const atual = this.atual(l)
      r.set(l.midia_id!, {
        siteId: l.id,
        categoria: l.categoria,
        titulo: l.titulo,
        dataLocal: l.data_local,
        novo: l.novo === 1,
        atual,
        aviso: atual || l.categoria === 'fixo' ? null : this.textoAviso(l),
      })
    }
    return r
  }

  private textoAviso(l: Linha): string {
    if (l.categoria === 'enviado') return `Enviado para o sábado ${diaMes(l.data_local)}, não para este.`
    return `O ${l.titulo} deste sábado ainda não chegou do site${l.data_local ? ` (o arquivo daqui é de ${diaMes(l.data_local)})` : ''}.`
  }

  /**
   * Para a liturgia: a série semanal desta mídia não é deste sábado (null = pode pôr no ar). Envios e
   * fixos nunca bloqueiam.
   */
  avisoDaMidia(midiaId: number): string | null {
    const l = this.linhas("midia_id = ? and categoria = 'automatico' and retirado_em is null", midiaId)[0]
    if (!l || this.atual(l)) return null
    return `${this.textoAviso(l)} Para mostrar mesmo assim, use a página Mídias.`
  }

  /** O operador viu o que chegou ("marcar como visto"; sem ids, tudo). */
  marcarVistos(ids?: string[]): void {
    if (ids?.length) {
      const p = this.d.db.prepare('update site_itens set novo = 0 where id = ?')
      for (const id of ids) p.run(id)
    } else {
      this.d.db.prepare('update site_itens set novo = 0 where novo = 1').run()
    }
    this.emit('mudou')
  }

  /** A mídia deste arquivo foi posta no ar: deixa de ser "nova". */
  vistoPorArquivo(caminho: string): void {
    const r = this.d.db
      .prepare('update site_itens set novo = 0 where novo = 1 and midia_id in (select id from midias where lower(arquivo) = lower(?))')
      .run(caminho)
    if (Number(r.changes) > 0) this.emit('mudou')
  }
}
