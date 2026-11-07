/**
 * Testes com os dados reais deste PC (Louvor JA instalado e as Bíblias do projeto de transcrição).
 * Pulam sozinhos onde esses arquivos não existem.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { abrirBanco } from '../src/main/banco'
import { RepositorioBiblia } from '../src/main/biblia/repositorio'
import { importarLouvorJa } from '../src/main/musicas/louvorJa'
import { RepositorioMusicas } from '../src/main/musicas/repositorio'

const PASTA_LJA = 'C:\\Program Files (x86)\\Louvor JA\\config'
const ARA = join(homedir(), 'Documents', 'Projetos', 'Transcrição_tempo_real', 'data', 'biblia', 'ARA.json')

const pasta = mkdtempSync(join(tmpdir(), 'sonoplastia-teste-'))
const db = abrirBanco(join(pasta, 'teste.db'))
afterAll(() => {
  db.close()
  rmSync(pasta, { recursive: true, force: true })
})

describe.skipIf(!existsSync(join(PASTA_LJA, 'database.db')))('Louvor JA', () => {
  const repo = new RepositorioMusicas(db)

  it('importa músicas com trechos, tempos e áudio', async () => {
    const r = await importarLouvorJa(db, repo, PASTA_LJA, [1, 999999], () => {})
    expect(r.novas).toBe(1)
    expect(r.erros).toEqual(['Música 999999 não existe no Louvor JA.'])
    const [m] = repo.listar('Nosso Sol')
    const musica = repo.obter(m!.id)!
    expect(musica.titulo).toBe('Nosso Sol é Jesus')
    expect(musica.slides[0]).toMatchObject({ texto: 'O nosso sol\nVeio iluminar', msCantado: 8000 })
    expect(musica.urlCantado).toMatch(/^midia:\/\/local\//)
  })

  it('busca pelo trecho da letra, sem acento', () => {
    expect(repo.listar('ILUMINAR')[0]?.titulo).toBe('Nosso Sol é Jesus')
    expect(repo.listar('nosso sol e jesus').length).toBe(1)
  })

  it('reimportar atualiza, mas não sobrescreve música editada', async () => {
    const [m] = repo.listar('Nosso Sol')
    repo.salvarEdicao(m!.id, 'Meu título', [{ texto: 'editado', msCantado: 1000, msPlayback: 0 }])
    const r = await importarLouvorJa(db, repo, PASTA_LJA, [1], () => {})
    expect(r).toMatchObject({ novas: 0, atualizadas: 0, mantidasEditadas: 1 })
    expect(repo.obter(m!.id)!.titulo).toBe('Meu título')
  })
})

describe.skipIf(!existsSync(ARA))('Bíblia ARA', () => {
  const biblia = new RepositorioBiblia(db)

  it('importa e acha João 3:16 e a busca por palavras', async () => {
    const n = await biblia.importar(readFileSync(ARA, 'utf8'), 'ara', '', () => {})
    expect(n).toBeGreaterThan(30000)
    expect(biblia.versoes()).toEqual([{ sigla: 'ARA', nome: 'Almeida Revista e Atualizada', versiculos: n }])
    expect(biblia.capitulo('ARA', 43, 3)[15]!.texto).toMatch(/^Porque Deus amou ao mundo/)
    expect(biblia.totalCapitulos('ARA', 19)).toBe(150)
    const r = biblia.buscar('ARA', 'amou ao mundo')
    expect(r.some((x) => x.livro === 43 && x.capitulo === 3 && x.versiculo === 16)).toBe(true)
  }, 60000)
})
