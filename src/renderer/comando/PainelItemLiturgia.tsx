/**
 * Painel ao lado da liturgia: "Adicionar" (música, mídia, apresentação, versículo, texto, tela) numa
 * seção, e "Editar" o item escolhido (saída, duração, avançar sozinho, observação…).
 */
import {
  AudioLines,
  BookOpen,
  Copy,
  FastForward,
  Film,
  ImageIcon,
  MonitorOff,
  MonitorPause,
  Music,
  Play,
  Plus,
  Presentation,
  Search,
  Trash2,
  Type,
  X,
} from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import type { ResumoApresentacao } from '../../shared/apresentacao'
import { formatarReferencia, interpretarReferencia } from '../../shared/biblia/referencia'
import type { Config } from '../../shared/config'
import type { Midia, ResumoMusica, VersaoBiblia } from '../../shared/dados'
import { type ItemLiturgia, novoId, podeAvancarSozinho, tituloDoItem } from '../../shared/liturgia'
import { api } from '../compartilhado/ganchos'
import { Botao, classeEntrada, Interruptor, Segmentado } from './ui'

/** Item novo, ainda sem os campos comuns (o painel completa). */
type NovoItem = Omit<ItemLiturgia, 'id' | 'alvo' | 'ativo' | 'duracaoMin' | 'observacao' | 'avancar'> & Partial<ItemLiturgia>

export function completarItem(n: NovoItem): ItemLiturgia {
  return { id: novoId(), alvo: '', ativo: true, duracaoMin: null, observacao: '', avancar: false, ...n } as ItemLiturgia
}

export function iconeDoItem(i: ItemLiturgia) {
  switch (i.tipo) {
    case 'musica':
      return Music
    case 'midia':
      return i.midiaTipo === 'video' ? Film : i.midiaTipo === 'imagem' ? ImageIcon : AudioLines
    case 'apresentacao':
      return Presentation
    case 'biblia':
      return BookOpen
    case 'texto':
      return Type
    case 'tela':
      return i.tela === 'preto' ? MonitorOff : MonitorPause
  }
}

const VERSOES_MUSICA = { cantado: 'Cantado', playback: 'Playback', manual: 'Só a letra' } as const

/** Linha de baixo do item na lista ("Cantado · Palco · avança sozinho"). */
export function detalheDoItem(i: ItemLiturgia, config: Config): string {
  const partes: string[] = []
  if (i.tipo === 'musica') partes.push(VERSOES_MUSICA[i.versao])
  else if (i.tipo === 'midia') partes.push(i.midiaTipo === 'video' ? 'Vídeo' : i.midiaTipo === 'imagem' ? 'Imagem' : 'Áudio')
  else if (i.tipo === 'apresentacao') partes.push('Apresentação')
  else if (i.tipo === 'biblia') partes.push(i.sigla || 'Bíblia')
  else if (i.tipo === 'texto') partes.push('Texto')
  if (i.alvo) partes.push(i.alvo === 'todas' ? 'Todas as saídas' : (config.saidas.find((s) => s.id === i.alvo)?.nome ?? i.alvo))
  if (i.avancar && podeAvancarSozinho(i)) partes.push('passa sozinho no fim')
  if (!i.ativo) partes.push('desligado')
  return partes.join(' · ')
}

type Aba = 'musica' | 'midia' | 'apresentacao' | 'biblia' | 'texto' | 'tela'

const ABAS: Array<{ valor: Aba; rotulo: string }> = [
  { valor: 'musica', rotulo: 'Música' },
  { valor: 'midia', rotulo: 'Mídia' },
  { valor: 'apresentacao', rotulo: 'Slides' },
  { valor: 'biblia', rotulo: 'Bíblia' },
  { valor: 'texto', rotulo: 'Texto' },
  { valor: 'tela', rotulo: 'Tela' },
]

function Cabecalho({ titulo, aoFechar, children }: { titulo: ReactNode; aoFechar: () => void; children?: ReactNode }) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-borda px-3 py-2">
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{titulo}</span>
      {children}
      <Botao tamanho="xs" variante="fantasma" icone={X} onClick={aoFechar} title="Fechar" />
    </div>
  )
}

function Linha({ icone: Icone, titulo, detalhe, imagem, aoClicar, children }: { icone: typeof Film; titulo: string; detalhe?: string; imagem?: string | null; aoClicar?: () => void; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-hover">
      <button type="button" disabled={!aoClicar} onClick={aoClicar} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left disabled:cursor-default" title={aoClicar ? 'Adicionar à seção' : undefined}>
        {imagem ? (
          <img src={imagem} alt="" draggable={false} className="h-8 w-14 shrink-0 rounded bg-tela object-cover" />
        ) : (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-painel-2 text-suave">
            <Icone className="size-4" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">{titulo}</span>
          {detalhe && <span className="block truncate text-[11px] text-suave">{detalhe}</span>}
        </span>
      </button>
      {children}
    </div>
  )
}

/** Painel "Adicionar à seção X". */
export function PainelAdicionar({ secaoNome, aoAdicionar, aoFechar }: { secaoNome: string; aoAdicionar: (i: ItemLiturgia) => void; aoFechar: () => void }) {
  const [aba, setAba] = useState<Aba>('musica')
  const [ultimo, setUltimo] = useState<string | null>(null)
  const adicionar = (n: NovoItem) => {
    const item = completarItem(n)
    aoAdicionar(item)
    setUltimo(tituloDoItem(item))
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Cabecalho titulo={<>Adicionar em <span className="text-destaque-texto">{secaoNome}</span></>} aoFechar={aoFechar} />
      <div className="shrink-0 border-b border-borda p-2">
        <div className="flex flex-wrap gap-1">
          {ABAS.map((a) => (
            <button
              key={a.valor}
              type="button"
              onClick={(e) => {
                e.currentTarget.blur()
                setAba(a.valor)
              }}
              className={`h-7 cursor-pointer rounded-md px-2.5 text-xs font-medium ${aba === a.valor ? 'bg-destaque text-sobre-destaque' : 'bg-painel-2 text-suave hover:text-texto'}`}
            >
              {a.rotulo}
            </button>
          ))}
        </div>
      </div>
      {ultimo && <div className="shrink-0 truncate bg-ok/12 px-3 py-1.5 text-xs text-ok-texto">Adicionado: {ultimo}</div>}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {aba === 'musica' && <AbaMusicas aoAdicionar={adicionar} />}
        {aba === 'midia' && <AbaMidias aoAdicionar={adicionar} />}
        {aba === 'apresentacao' && <AbaApresentacoes aoAdicionar={adicionar} />}
        {aba === 'biblia' && <AbaBiblia aoAdicionar={adicionar} />}
        {aba === 'texto' && <AbaTexto aoAdicionar={adicionar} />}
        {aba === 'tela' && (
          <div className="flex flex-col gap-1">
            <Linha icone={MonitorOff} titulo="Tela preta" detalhe="Apaga as saídas (só sai com outro comando)" aoClicar={() => adicionar({ tipo: 'tela', tela: 'preto', titulo: '' })} />
            <Linha icone={MonitorPause} titulo="Logo (tela de espera)" detalhe="A tela de espera das Configurações" aoClicar={() => adicionar({ tipo: 'tela', tela: 'logo', titulo: '' })} />
          </div>
        )}
      </div>
    </div>
  )
}

function Busca({ valor, aoMudar, dica }: { valor: string; aoMudar: (v: string) => void; dica: string }) {
  return (
    <div className="relative mb-2">
      <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-apagado" />
      <input autoFocus className={`${classeEntrada} w-full pl-8`} placeholder={dica} value={valor} onChange={(e) => aoMudar(e.target.value)} />
    </div>
  )
}

function AbaMusicas({ aoAdicionar }: { aoAdicionar: (n: NovoItem) => void }) {
  const [busca, setBusca] = useState('')
  const [lista, setLista] = useState<ResumoMusica[]>([])
  useEffect(() => {
    const t = setTimeout(() => void api.listarMusicas(busca).then(setLista), 180)
    return () => clearTimeout(t)
  }, [busca])
  const add = (m: ResumoMusica, versao: 'cantado' | 'playback' | 'manual') => aoAdicionar({ tipo: 'musica', musicaId: m.id, versao, titulo: m.titulo })
  return (
    <>
      <Busca valor={busca} aoMudar={setBusca} dica="Título, nº do hino ou trecho" />
      {lista.length === 0 && <p className="px-2 text-xs text-suave">Nenhuma música encontrada.</p>}
      {lista.slice(0, 80).map((m) => (
        <Linha key={m.id} icone={Music} titulo={m.titulo} detalhe={[m.album, m.faixa ? `nº ${m.faixa}` : ''].filter(Boolean).join(' · ')}>
          <div className="flex shrink-0 gap-0.5">
            <Botao tamanho="xs" disabled={!m.temCantado} onClick={() => add(m, 'cantado')} title="Adicionar cantado">
              Cant.
            </Botao>
            <Botao tamanho="xs" disabled={!m.temPlayback} onClick={() => add(m, 'playback')} title="Adicionar playback">
              PB
            </Botao>
            <Botao tamanho="xs" onClick={() => add(m, 'manual')} title="Só a letra (sem áudio, troca manual)">
              Letra
            </Botao>
          </div>
        </Linha>
      ))}
    </>
  )
}

function AbaMidias({ aoAdicionar }: { aoAdicionar: (n: NovoItem) => void }) {
  const [busca, setBusca] = useState('')
  const [tipo, setTipo] = useState<'todos' | 'video' | 'imagem' | 'audio'>('todos')
  const [lista, setLista] = useState<Midia[]>([])
  useEffect(() => {
    const t = setTimeout(() => void api.listarMidias({ tipo, busca }).then(setLista), 180)
    return () => clearTimeout(t)
  }, [busca, tipo])
  return (
    <>
      <Busca valor={busca} aoMudar={setBusca} dica="Nome da mídia" />
      <div className="mb-2">
        <Segmentado
          tamanho="sm"
          valor={tipo}
          aoMudar={setTipo}
          opcoes={[
            { valor: 'todos', rotulo: 'Todas' },
            { valor: 'video', rotulo: 'Vídeos' },
            { valor: 'imagem', rotulo: 'Imagens' },
            { valor: 'audio', rotulo: 'Áudios' },
          ]}
        />
      </div>
      {lista.length === 0 && <p className="px-2 text-xs text-suave">Nada encontrado. Importe na página Mídias.</p>}
      {lista.slice(0, 120).map((m) => (
        <Linha
          key={m.id}
          icone={m.tipo === 'video' ? Film : m.tipo === 'imagem' ? ImageIcon : AudioLines}
          imagem={m.miniaturaUrl}
          titulo={m.nome}
          detalhe={m.situacao === 'pronto' ? undefined : m.situacao === 'erro' ? 'Com erro' : 'Analisando…'}
          aoClicar={() => aoAdicionar({ tipo: 'midia', midiaId: m.id, midiaTipo: m.tipo, titulo: m.nome })}
        />
      ))}
    </>
  )
}

function AbaApresentacoes({ aoAdicionar }: { aoAdicionar: (n: NovoItem) => void }) {
  const [busca, setBusca] = useState('')
  const [lista, setLista] = useState<ResumoApresentacao[]>([])
  useEffect(() => {
    const t = setTimeout(() => void api.listarApresentacoes(busca).then(setLista), 180)
    return () => clearTimeout(t)
  }, [busca])
  return (
    <>
      <Busca valor={busca} aoMudar={setBusca} dica="Nome da apresentação" />
      {lista.length === 0 && <p className="px-2 text-xs text-suave">Nenhuma apresentação. Importe na página Apresentações.</p>}
      {lista.map((a) => (
        <Linha
          key={a.id}
          icone={Presentation}
          imagem={a.miniaturaUrl}
          titulo={a.nome}
          detalhe={a.situacao === 'pronto' ? `${a.total} slides · ${a.tipo.toUpperCase()}` : a.situacao === 'erro' ? 'Com erro' : 'Convertendo…'}
          aoClicar={() => aoAdicionar({ tipo: 'apresentacao', apresentacaoId: a.id, titulo: a.nome })}
        />
      ))}
    </>
  )
}

/** Escolha da versão: '' = a versão padrão das configurações. */
function SeletorVersao({ valor, aoMudar }: { valor: string; aoMudar: (v: string) => void }) {
  const [versoes, setVersoes] = useState<VersaoBiblia[]>([])
  useEffect(() => {
    void api.versoesBiblia().then(setVersoes)
  }, [])
  return (
    <select
      className={`${classeEntrada} w-full`}
      value={valor}
      onChange={(e) => {
        e.currentTarget.blur()
        aoMudar(e.target.value)
      }}
    >
      <option value="">Versão padrão</option>
      {versoes.map((v) => (
        <option key={v.sigla} value={v.sigla}>
          {v.sigla} — {v.nome}
        </option>
      ))}
    </select>
  )
}

/** "jo 3 16-18" → "João 3:16-18", ou o motivo de não servir. */
export function leituraDaReferencia(texto: string): { ok: boolean; texto: string } {
  const r = interpretarReferencia(texto)
  if (r.tipo === 'vazio') return { ok: false, texto: 'Digite uma referência, ex.: jo 3 16-18' }
  if (r.tipo === 'ambiguo') return { ok: false, texto: `Qual livro? ${r.livros.map((l) => l.nome).join(', ')}` }
  if (r.tipo === 'texto') return { ok: false, texto: 'Não é uma referência (o livro não foi reconhecido).' }
  if (r.ref.capitulo === null) return { ok: false, texto: 'Falta o capítulo.' }
  return { ok: true, texto: formatarReferencia(r.ref.livro, r.ref.capitulo, r.ref.inicio, r.ref.fim) }
}

function AbaBiblia({ aoAdicionar }: { aoAdicionar: (n: NovoItem) => void }) {
  const [ref, setRef] = useState('')
  const [sigla, setSigla] = useState('')
  const leitura = leituraDaReferencia(ref)
  const add = () => {
    if (!leitura.ok) return
    aoAdicionar({ tipo: 'biblia', referencia: ref.trim(), sigla, titulo: leitura.texto })
    setRef('')
  }
  return (
    <div className="flex flex-col gap-2 p-1">
      <input
        autoFocus
        className={`${classeEntrada} w-full`}
        placeholder="jo 3 16-18 · sl 23 · 1 co 13 4-7"
        value={ref}
        onChange={(e) => setRef(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && add()}
      />
      <p className={`text-xs ${leitura.ok ? 'font-semibold text-destaque-texto' : 'text-suave'}`}>{leitura.texto}</p>
      <SeletorVersao valor={sigla} aoMudar={setSigla} />
      <Botao variante="primario" icone={Plus} disabled={!leitura.ok} onClick={add}>
        Adicionar
      </Botao>
      <p className="text-xs text-suave">No ar, o passador anda versículo a versículo dentro do capítulo.</p>
    </div>
  )
}

function AbaTexto({ aoAdicionar }: { aoAdicionar: (n: NovoItem) => void }) {
  const [texto, setTexto] = useState('')
  return (
    <div className="flex flex-col gap-2 p-1">
      <textarea
        autoFocus
        rows={6}
        className={`${classeEntrada} h-auto w-full py-2`}
        placeholder="Aviso, título, nome do pregador…"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
      />
      <Botao
        variante="primario"
        icone={Plus}
        disabled={!texto.trim()}
        onClick={() => {
          aoAdicionar({ tipo: 'texto', texto: texto.trim(), titulo: '' })
          setTexto('')
        }}
      >
        Adicionar
      </Botao>
    </div>
  )
}

function Campo({ rotulo, dica, children }: { rotulo: string; dica?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-suave">{rotulo}</span>
      {children}
      {dica && <span className="text-[11px] text-apagado">{dica}</span>}
    </label>
  )
}

/** Painel "Editar item". */
export function PainelEditar({
  item,
  config,
  aoMudar,
  aoExecutar,
  aoDuplicar,
  aoRemover,
  aoFechar,
}: {
  item: ItemLiturgia
  config: Config
  aoMudar: (i: ItemLiturgia) => void
  aoExecutar: () => void
  aoDuplicar: () => void
  aoRemover: () => void
  aoFechar: () => void
}) {
  const Icone = iconeDoItem(item)
  const m = (p: Partial<ItemLiturgia>) => aoMudar({ ...item, ...p } as ItemLiturgia)
  const saidas = [{ valor: '', rotulo: 'Padrão' }, ...config.saidas.filter((s) => s.ativa).map((s) => ({ valor: s.id, rotulo: s.nome })), { valor: 'todas', rotulo: 'Todas' }]
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Cabecalho
        titulo={
          <span className="flex items-center gap-1.5">
            <Icone className="size-4 text-suave" /> Editar item
          </span>
        }
        aoFechar={aoFechar}
      />
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        <Campo rotulo="Título na liturgia">
          <input className={`${classeEntrada} w-full`} value={item.titulo} placeholder={tituloDoItem({ ...item, titulo: '' })} onChange={(e) => m({ titulo: e.target.value })} />
        </Campo>

        {item.tipo === 'musica' && (
          <Campo rotulo="Versão">
            <Segmentado tamanho="sm" valor={item.versao} aoMudar={(versao) => m({ versao } as Partial<ItemLiturgia>)} opcoes={Object.entries(VERSOES_MUSICA).map(([valor, rotulo]) => ({ valor: valor as 'cantado', rotulo }))} />
          </Campo>
        )}
        {item.tipo === 'biblia' && (
          <>
            <Campo rotulo="Referência" dica={leituraDaReferencia(item.referencia).texto}>
              <input className={`${classeEntrada} w-full`} value={item.referencia} onChange={(e) => m({ referencia: e.target.value } as Partial<ItemLiturgia>)} />
            </Campo>
            <Campo rotulo="Versão">
              <SeletorVersao valor={item.sigla} aoMudar={(sigla) => m({ sigla } as Partial<ItemLiturgia>)} />
            </Campo>
          </>
        )}
        {item.tipo === 'texto' && (
          <Campo rotulo="Texto">
            <textarea rows={5} className={`${classeEntrada} h-auto w-full py-2`} value={item.texto} onChange={(e) => m({ texto: e.target.value } as Partial<ItemLiturgia>)} />
          </Campo>
        )}
        {item.tipo === 'tela' && (
          <Campo rotulo="Tela">
            <Segmentado tamanho="sm" valor={item.tela} aoMudar={(tela) => m({ tela } as Partial<ItemLiturgia>)} opcoes={[{ valor: 'preto', rotulo: 'Preta' }, { valor: 'logo', rotulo: 'Logo' }]} />
          </Campo>
        )}

        <Campo rotulo="Saída" dica="Padrão = a do “Enviar para”, no topo da tela.">
          <Segmentado tamanho="sm" valor={item.alvo} aoMudar={(alvo) => m({ alvo })} opcoes={saidas} />
        </Campo>
        <Campo rotulo="Duração prevista (min)" dica="Para calcular o horário de cada parte do culto.">
          <input
            type="number"
            min={0}
            max={600}
            className={`${classeEntrada} w-24`}
            value={item.duracaoMin ?? ''}
            onChange={(e) => m({ duracaoMin: e.target.value === '' ? null : Math.max(0, Math.min(600, Number(e.target.value))) })}
          />
        </Campo>
        {podeAvancarSozinho(item) && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm">
              <FastForward className="mr-1 inline size-3.5 text-suave" />
              Ao terminar, passar para o próximo item
            </span>
            <Interruptor ligado={item.avancar} aoMudar={(avancar) => m({ avancar })} rotulo="Passar sozinho" />
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm">Item ligado</span>
          <Interruptor ligado={item.ativo} aoMudar={(ativo) => m({ ativo })} rotulo="Item ligado" />
        </div>
        <p className="-mt-2 text-[11px] text-apagado">Desligado, o “Próximo item” pula ele (fica na lista para outra vez).</p>
        <Campo rotulo="Observação para o operador" dica="Aparece embaixo quando o item está no ar.">
          <textarea rows={3} className={`${classeEntrada} h-auto w-full py-2`} value={item.observacao} onChange={(e) => m({ observacao: e.target.value })} />
        </Campo>
      </div>
      <div className="flex shrink-0 gap-2 border-t border-borda p-3">
        <Botao variante="primario" icone={Play} onClick={aoExecutar}>
          Pôr no ar
        </Botao>
        <Botao icone={Copy} onClick={aoDuplicar} title="Duplicar" />
        <Botao variante="perigo" icone={Trash2} onClick={aoRemover} title="Remover da liturgia" className="ml-auto" />
      </div>
    </div>
  )
}
