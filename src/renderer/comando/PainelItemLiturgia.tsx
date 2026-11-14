/**
 * Painel ao lado da liturgia: "Adicionar" (música, mídia, apresentação, versículo, texto, tela) numa
 * seção, e "Editar" o item escolhido (saída, duração, avançar sozinho, observação…).
 */
import {
  AlarmClock,
  AudioLines,
  BookOpen,
  Copy,
  FastForward,
  Film,
  Gift,
  ImageIcon,
  MonitorOff,
  MonitorPause,
  Music,
  Play,
  Plus,
  Presentation,
  QrCode,
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
import { nomesDoSorteio, ROTULOS_MODO_TEMPORIZADOR } from '../../shared/ferramentas'
import { DesenhoQrSvg } from '../compartilhado/Ferramentas'
import { CamposLuzDoItem } from './Iluminacao'
import { ehFerramenta, type ItemLiturgia, novoId, podeAvancarSozinho, type SecaoLiturgia, tituloDoItem } from '../../shared/liturgia'
import { api } from '../compartilhado/ganchos'
import { Botao, classeEntrada, Interruptor, Segmentado } from './ui'

/** Item novo, ainda sem os campos comuns (o painel completa). */
type NovoItem = Omit<ItemLiturgia, 'id' | 'alvo' | 'ativo' | 'duracaoMin' | 'observacao' | 'avancar' | 'luzInicio' | 'luzFim'> & Partial<ItemLiturgia>

export function completarItem(n: NovoItem): ItemLiturgia {
  return { id: novoId(), alvo: '', ativo: true, duracaoMin: null, observacao: '', avancar: false, luzInicio: '', luzFim: '', ...n } as ItemLiturgia
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
    case 'temporizador':
      return AlarmClock
    case 'qr':
      return QrCode
    case 'sorteio':
      return Gift
  }
}

/**
 * Imagem de cada item da liturgia, para a lista ficar fácil de entender: a miniatura do vídeo ou da
 * imagem, o 1º slide da apresentação, a imagem de fundo da música. Atualiza quando a biblioteca muda.
 */
export function useMiniaturasLiturgia(secoes: SecaoLiturgia[] | null): Map<string, string> {
  const [midias, setMidias] = useState<Map<number, string>>(new Map())
  const [apresentacoes, setApresentacoes] = useState<Map<number, string>>(new Map())
  const [musicas, setMusicas] = useState<Map<number, string | null>>(new Map())
  useEffect(() => {
    const lerMidias = () =>
      void api.listarMidias({ tipo: 'todos', busca: '' }).then((l) => setMidias(new Map(l.filter((m) => m.miniaturaUrl).map((m) => [m.id, m.miniaturaUrl!]))))
    const lerApresentacoes = () =>
      void api.listarApresentacoes('').then((l) => setApresentacoes(new Map(l.filter((a) => a.miniaturaUrl).map((a) => [a.id, a.miniaturaUrl!]))))
    lerMidias()
    lerApresentacoes()
    const a = api.aoMudarMidias(lerMidias)
    const b = api.aoMudarApresentacoes(lerApresentacoes)
    return () => {
      a()
      b()
    }
  }, [])
  // músicas: a imagem vem de cada uma (só as que estão na liturgia, uma vez)
  const idsMusicas = (secoes ?? []).flatMap((s) => s.itens).flatMap((i) => (i.tipo === 'musica' ? [i.musicaId] : []))
  const faltam = idsMusicas.filter((id) => !musicas.has(id)).join(',')
  useEffect(() => {
    if (!faltam) return
    let vivo = true
    void Promise.all(faltam.split(',').map((id) => api.obterMusica(Number(id)).then((m) => [Number(id), m?.urlImagem ?? null] as const))).then((r) => {
      if (vivo) setMusicas((atual) => new Map([...atual, ...r]))
    })
    return () => {
      vivo = false
    }
  }, [faltam])

  const r = new Map<string, string>()
  for (const i of (secoes ?? []).flatMap((s) => s.itens)) {
    const url = i.tipo === 'midia' ? midias.get(i.midiaId) : i.tipo === 'apresentacao' ? apresentacoes.get(i.apresentacaoId) : i.tipo === 'musica' ? musicas.get(i.musicaId) : null
    if (url) r.set(i.id, url)
  }
  return r
}

/** A figurinha do item na lista: a imagem dele, o QR code, ou o ícone do tipo. */
export function MiniaturaItem({ item, imagem, icone: Icone, noAr }: { item: ItemLiturgia; imagem: string | null; icone: typeof Film; noAr: boolean }) {
  const moldura = `relative flex h-9 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md ${noAr ? 'ring-2 ring-sobre-destaque/70' : 'ring-1 ring-borda'}`
  if (imagem) {
    return (
      <span className={`${moldura} bg-tela`}>
        <img src={imagem} alt="" draggable={false} className="h-full w-full object-cover" />
        <span className="absolute bottom-0.5 right-0.5 flex size-4 items-center justify-center rounded bg-black/60 text-white">
          <Icone className="size-3" />
        </span>
      </span>
    )
  }
  if (item.tipo === 'qr' && item.link.trim()) {
    return (
      <span className={`${moldura} bg-white`}>
        <DesenhoQrSvg link={item.link} tamanho="34px" />
      </span>
    )
  }
  return (
    <span className={`${moldura} ${noAr ? 'bg-sobre-destaque/15' : 'bg-painel-2 text-suave'}`}>
      <Icone className="size-4" />
    </span>
  )
}

const VERSOES_MUSICA = { cantado: 'Cantado', playback: 'Playback', manual: 'Só a letra', perguntar: 'Escolher na hora' } as const
/** rótulos curtos, para caber na faixa de botões do painel */
const VERSOES_CURTAS = { cantado: 'Cantado', playback: 'Playback', manual: 'Só letra', perguntar: 'Na hora' } as const

/** As quatro maneiras de pôr uma música na liturgia, com a explicação de cada uma. */
const OPCOES_VERSAO: Array<{ versao: keyof typeof VERSOES_MUSICA; rotulo: string; dica: string }> = [
  { versao: 'cantado', rotulo: 'Cantado', dica: 'Áudio com voz; a letra troca sozinha' },
  { versao: 'playback', rotulo: 'Playback', dica: 'Só o instrumental; a letra troca sozinha' },
  { versao: 'manual', rotulo: 'Só a letra', dica: 'Sem áudio; você passa os trechos' },
  { versao: 'perguntar', rotulo: 'Escolher na hora', dica: 'O programa pergunta quando for apresentar' },
]

/** Linha de baixo do item na lista ("Cantado · Palco · avança sozinho"). */
export function detalheDoItem(i: ItemLiturgia, config: Config): string {
  const partes: string[] = []
  if (i.tipo === 'musica') partes.push(VERSOES_MUSICA[i.versao])
  else if (i.tipo === 'midia') partes.push(i.midiaTipo === 'video' ? 'Vídeo' : i.midiaTipo === 'imagem' ? 'Imagem' : 'Áudio')
  else if (i.tipo === 'apresentacao') partes.push('Apresentação')
  else if (i.tipo === 'biblia') partes.push(i.sigla || 'Bíblia')
  else if (i.tipo === 'texto') partes.push('Texto')
  else if (ehFerramenta(i)) {
    if (i.tipo === 'sorteio') {
      const n = nomesDoSorteio(i.lista).length
      partes.push(n ? `Sorteio · ${n} ${n === 1 ? 'nome' : 'nomes'}` : 'Sorteio · lista vazia')
    } else partes.push(i.modo === 'canto' ? 'No canto' : 'Tela cheia')
    if (i.manter) partes.push('fica na tela')
  }
  if (i.alvo) partes.push(i.alvo === 'todas' ? 'Todas as saídas' : (config.saidas.find((s) => s.id === i.alvo)?.nome ?? i.alvo))
  if (i.avancar && podeAvancarSozinho(i)) partes.push('passa sozinho no fim')
  if (i.luzInicio || i.luzFim) partes.push('muda as luzes')
  if (!i.ativo) partes.push('desligado')
  return partes.join(' · ')
}

type Aba = 'musica' | 'midia' | 'apresentacao' | 'biblia' | 'texto' | 'tela' | 'ferramenta'

const ABAS: Array<{ valor: Aba; rotulo: string }> = [
  { valor: 'musica', rotulo: 'Música' },
  { valor: 'midia', rotulo: 'Mídia' },
  { valor: 'apresentacao', rotulo: 'Slides' },
  { valor: 'biblia', rotulo: 'Bíblia' },
  { valor: 'texto', rotulo: 'Texto' },
  { valor: 'tela', rotulo: 'Tela' },
  { valor: 'ferramenta', rotulo: 'Ferramentas' },
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
export function PainelAdicionar({ secaoNome, config, aoAdicionar, aoFechar }: { secaoNome: string; config: Config; aoAdicionar: (i: ItemLiturgia) => void; aoFechar: () => void }) {
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
        {aba === 'ferramenta' && <AbaFerramentas config={config} aoAdicionar={adicionar} />}
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
  const [aberta, setAberta] = useState<number | null>(null)
  const add = (m: ResumoMusica, versao: keyof typeof VERSOES_MUSICA) => {
    aoAdicionar({ tipo: 'musica', musicaId: m.id, versao, titulo: m.titulo })
    setAberta(null)
  }
  return (
    <>
      <Busca valor={busca} aoMudar={setBusca} dica="Título, nº do hino ou trecho" />
      {lista.length === 0 && <p className="px-2 text-xs text-suave">Nenhuma música encontrada.</p>}
      {lista.length > 0 && <p className="mb-1 px-2 text-[11px] text-apagado">Clique na música e escolha como ela vai tocar.</p>}
      {lista.slice(0, 80).map((m) => (
        <div key={m.id} className={aberta === m.id ? 'rounded-md bg-painel-2 pb-2' : undefined}>
          <Linha icone={Music} titulo={m.titulo} detalhe={[m.album, m.faixa ? `nº ${m.faixa}` : ''].filter(Boolean).join(' · ')} aoClicar={() => setAberta(aberta === m.id ? null : m.id)} />
          {aberta === m.id && (
            <div className="grid grid-cols-2 gap-1.5 px-2">
              {OPCOES_VERSAO.map((o) => {
                const falta = (o.versao === 'cantado' && !m.temCantado) || (o.versao === 'playback' && !m.temPlayback)
                return (
                  <button
                    key={o.versao}
                    type="button"
                    disabled={falta}
                    onClick={(e) => {
                      e.currentTarget.blur()
                      add(m, o.versao)
                    }}
                    title={falta ? 'Esta música não tem este áudio' : o.dica}
                    className="flex cursor-pointer flex-col items-start rounded-md border border-borda bg-painel px-2 py-1.5 text-left hover:border-destaque/60 hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="flex items-center gap-1 text-xs font-semibold">
                      <Plus className="size-3" />
                      {o.rotulo}
                    </span>
                    <span className="text-[10px] leading-tight text-suave">{falta ? 'Sem este áudio' : o.dica}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
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

/** input type="time" só aceita 'HH:MM' com dois dígitos na hora */
const horaDoCampo = (hhmm: string) => (/^\d:\d\d$/.test(hhmm) ? `0${hhmm}` : hhmm)

function Grupo({ titulo, icone: Icone, children }: { titulo: string; icone: typeof Film; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-borda p-2.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-suave">
        <Icone className="size-3.5" />
        {titulo}
      </div>
      {children}
    </div>
  )
}

function AbaFerramentas({ config, aoAdicionar }: { config: Config; aoAdicionar: (n: NovoItem) => void }) {
  const [minutos, setMinutos] = useState('5')
  const [ate, setAte] = useState('09:00')
  const [link, setLink] = useState('')
  const [legenda, setLegenda] = useState('')
  const cfg = config.ferramentas
  const temporizador = (modo: 'regressivo' | 'horario' | 'progressivo', extra: { minutos?: number; titulo?: string } = {}) =>
    aoAdicionar({ tipo: 'temporizador', titulo: extra.titulo ?? '', temporizadorModo: modo, minutos: extra.minutos ?? 5, ate: modo === 'horario' ? ate : '', iniciar: true, modo: 'tela', manter: false })
  const qr = (l: string, t: string) => aoAdicionar({ tipo: 'qr', titulo: '', link: l.trim(), legenda: t.trim(), modo: 'tela', manter: false })
  const n = Number(minutos.replace(',', '.'))
  return (
    <div className="flex flex-col gap-2.5 p-1">
      <Grupo titulo="Temporizador" icone={AlarmClock}>
        <div className="flex items-center gap-1.5">
          <input className={`${classeEntrada} w-16`} value={minutos} onChange={(e) => setMinutos(e.target.value)} aria-label="Minutos" />
          <span className="text-xs text-suave">min</span>
          <Botao tamanho="sm" icone={Plus} disabled={!Number.isFinite(n) || n <= 0} onClick={() => temporizador('regressivo', { minutos: n })} className="ml-auto">
            Regressivo
          </Botao>
        </div>
        {cfg.predefinicoes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {cfg.predefinicoes.map((x, i) => (
              <Botao key={`${x.nome}-${i}`} tamanho="xs" onClick={() => temporizador('regressivo', { minutos: x.minutos, titulo: x.nome })} title="Adicionar">
                {x.nome} · {x.minutos} min
              </Botao>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <input type="time" className={`${classeEntrada} w-28`} value={ate} onChange={(e) => setAte(e.target.value)} aria-label="Até as" />
          <Botao tamanho="sm" icone={Plus} disabled={!ate} onClick={() => temporizador('horario')} className="ml-auto" title="Ex.: contagem para o início do culto">
            Contagem até
          </Botao>
        </div>
        <Botao tamanho="sm" icone={Plus} onClick={() => temporizador('progressivo')}>
          Cronômetro
        </Botao>
      </Grupo>
      <Grupo titulo="QR code" icone={QrCode}>
        <input className={`${classeEntrada} w-full`} placeholder="Link (https://…)" value={link} onChange={(e) => setLink(e.target.value)} />
        <input className={`${classeEntrada} w-full`} placeholder="Texto embaixo (opcional)" value={legenda} onChange={(e) => setLegenda(e.target.value)} />
        <Botao tamanho="sm" variante="primario" icone={Plus} disabled={!link.trim()} onClick={() => qr(link, legenda)}>
          Adicionar
        </Botao>
        {cfg.qrSalvos.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {cfg.qrSalvos.map((x, i) => (
              <Botao key={`${x.nome}-${i}`} tamanho="xs" onClick={() => qr(x.link, x.texto)} title={x.link}>
                {x.nome}
              </Botao>
            ))}
          </div>
        )}
      </Grupo>
      <Grupo titulo="Sorteio" icone={Gift}>
        <Botao tamanho="sm" icone={Plus} onClick={() => aoAdicionar({ tipo: 'sorteio', titulo: '', lista: '', quantidade: 1, semRepetir: true, modo: 'tela', manter: false })}>
          Sorteio
        </Botao>
        <p className="text-[11px] text-apagado">Depois, em Editar, cole a lista de nomes. No ar, o passador (próximo) sorteia.</p>
      </Grupo>
      <p className="px-1 text-[11px] text-apagado">O relógio não é item: ele fica ligado em cada saída, na página Ferramentas.</p>
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
        <Campo
          rotulo="Título na liturgia"
          dica={item.tipo === 'temporizador' ? 'Aparece também em cima do tempo, na tela.' : item.tipo === 'sorteio' ? 'Aparece em cima, na tela do sorteio.' : undefined}
        >
          <input className={`${classeEntrada} w-full`} value={item.titulo} placeholder={tituloDoItem({ ...item, titulo: '' })} onChange={(e) => m({ titulo: e.target.value })} />
        </Campo>

        {item.tipo === 'musica' && (
          <Campo rotulo="Versão">
            <Segmentado
              tamanho="sm"
              valor={item.versao}
              aoMudar={(versao) => m({ versao } as Partial<ItemLiturgia>)}
              opcoes={OPCOES_VERSAO.map((o) => ({ valor: o.versao, rotulo: VERSOES_CURTAS[o.versao], titulo: o.dica }))}
            />
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
        {item.tipo === 'temporizador' && (
          <>
            <Campo rotulo="Tipo">
              <Segmentado
                tamanho="sm"
                valor={item.temporizadorModo}
                aoMudar={(temporizadorModo) => m({ temporizadorModo } as Partial<ItemLiturgia>)}
                opcoes={(Object.keys(ROTULOS_MODO_TEMPORIZADOR) as Array<keyof typeof ROTULOS_MODO_TEMPORIZADOR>).map((v) => ({ valor: v, rotulo: ROTULOS_MODO_TEMPORIZADOR[v] }))}
              />
            </Campo>
            {item.temporizadorModo === 'regressivo' && (
              <Campo rotulo="Minutos">
                <input
                  type="number"
                  min={0}
                  max={1440}
                  step={0.5}
                  className={`${classeEntrada} w-24`}
                  value={item.minutos}
                  onChange={(e) => m({ minutos: Math.max(0, Math.min(1440, Number(e.target.value) || 0)) } as Partial<ItemLiturgia>)}
                />
              </Campo>
            )}
            {item.temporizadorModo === 'horario' && (
              <Campo rotulo="Até as" dica="Ex.: o horário de início do culto.">
                <input type="time" className={`${classeEntrada} w-28`} value={horaDoCampo(item.ate)} onChange={(e) => m({ ate: e.target.value } as Partial<ItemLiturgia>)} />
              </Campo>
            )}
            {item.temporizadorModo !== 'horario' && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm">Começar a contar quando entrar no ar</span>
                <Interruptor ligado={item.iniciar} aoMudar={(iniciar) => m({ iniciar } as Partial<ItemLiturgia>)} rotulo="Começar sozinho" />
              </div>
            )}
          </>
        )}
        {item.tipo === 'qr' && (
          <>
            <Campo rotulo="Link">
              <input className={`${classeEntrada} w-full`} value={item.link} placeholder="https://…" onChange={(e) => m({ link: e.target.value } as Partial<ItemLiturgia>)} />
            </Campo>
            <Campo rotulo="Texto embaixo (opcional)">
              <input className={`${classeEntrada} w-full`} value={item.legenda} onChange={(e) => m({ legenda: e.target.value } as Partial<ItemLiturgia>)} />
            </Campo>
            {item.link.trim() && (
              <div className="self-start overflow-hidden rounded-md border border-borda">
                <DesenhoQrSvg link={item.link} tamanho="96px" />
              </div>
            )}
          </>
        )}
        {item.tipo === 'sorteio' && (
          <>
            <Campo rotulo={`Nomes (${nomesDoSorteio(item.lista).length})`} dica="Um por linha. No ar, o passador (próximo) sorteia.">
              <textarea rows={6} className={`${classeEntrada} h-auto w-full py-2`} value={item.lista} onChange={(e) => m({ lista: e.target.value } as Partial<ItemLiturgia>)} />
            </Campo>
            <Campo rotulo="Quantos por vez">
              <input
                type="number"
                min={1}
                max={100}
                className={`${classeEntrada} w-20`}
                value={item.quantidade}
                onChange={(e) => m({ quantidade: Math.max(1, Math.min(100, Math.floor(Number(e.target.value) || 1))) } as Partial<ItemLiturgia>)}
              />
            </Campo>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm">Sem repetir quem já saiu</span>
              <Interruptor ligado={item.semRepetir} aoMudar={(semRepetir) => m({ semRepetir } as Partial<ItemLiturgia>)} rotulo="Sem repetir" />
            </div>
          </>
        )}
        {ehFerramenta(item) && item.tipo !== 'sorteio' && (
          <Campo rotulo="Como aparece">
            <Segmentado
              tamanho="sm"
              valor={item.modo}
              aoMudar={(modo) => m({ modo } as Partial<ItemLiturgia>)}
              opcoes={[
                { valor: 'tela', rotulo: 'Tela cheia' },
                { valor: 'canto', rotulo: 'No canto' },
              ]}
            />
          </Campo>
        )}
        {ehFerramenta(item) && (
          <>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm">Continua na tela nos próximos itens</span>
              <Interruptor ligado={item.manter} aoMudar={(manter) => m({ manter } as Partial<ItemLiturgia>)} rotulo="Continua na tela" />
            </div>
            <p className="-mt-2 text-[11px] text-apagado">Desligado, sai quando a liturgia passa para outro item. Ligado, sai pela página Ferramentas.</p>
          </>
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
              {item.tipo === 'temporizador' ? 'No 0:00, passar para o próximo item' : 'Ao terminar, passar para o próximo item'}
            </span>
            <Interruptor ligado={item.avancar} aoMudar={(avancar) => m({ avancar })} rotulo="Passar sozinho" />
          </div>
        )}
        {config.iluminacao.ativo && config.iluminacao.automacao && <CamposLuzDoItem inicio={item.luzInicio} fim={item.luzFim} aoMudar={(v) => m(v)} />}
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
