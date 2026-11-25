/**
 * Configurações em "pastas": a página abre com um cartão por tema; clicar entra nas opções dele.
 * A pasta aberta fica lembrada enquanto o programa está aberto (sair para testar e voltar cai no mesmo lugar).
 */
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  CloudDownload,
  Film,
  Lightbulb,
  Download,
  type LucideIcon,
  MonitorPause,
  Music,
  Presentation,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Wallpaper,
  Wrench,
} from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  type Config,
  EsquemaApresentacoes,
  EsquemaBiblia,
  EsquemaFerramentas,
  EsquemaFundos,
  EsquemaGeral,
  EsquemaIluminacao,
  EsquemaMusicas,
  EsquemaSite,
  EsquemaTelaEspera,
  EsquemaTranscricaoAuto,
  EsquemaTranscricaoEscuta,
  EsquemaTranscricaoIA,
  EsquemaVideos,
} from '../../shared/config'
import type { Progresso, ResultadoLouvorJa } from '../../shared/dados'
import type { EstadoConversor } from '../../shared/ipc'
import { urlMidia } from '../../shared/midia'
import { TelaEspera } from '../compartilhado/Camadas'
import { api } from '../compartilhado/ganchos'
import { mensagemDeErro } from './acoes'
import { TestesTranscricao, WhisperLocal } from './BibliaAutomatica'
import { FormularioEsquema } from './FormularioEsquema'
import { SecaoRemoto } from './Remoto'
import { BarraProgresso, Botao, Secao } from './ui'

type IdPasta = 'geral' | 'musicas' | 'videos' | 'biblia' | 'transcricao' | 'apresentacoes' | 'fundos' | 'espera' | 'ferramentas' | 'site' | 'iluminacao' | 'remoto'

const nomeArquivo = (caminho: string) => caminho.split(/[\\/]/).pop() ?? caminho

const PASTAS: Array<{ id: IdPasta; titulo: string; descricao: string; icone: LucideIcon; resumo: (c: Config) => string }> = [
  {
    id: 'geral',
    titulo: 'Geral',
    descricao: 'Tema, transição, miniaturas e saída de som.',
    icone: SlidersHorizontal,
    resumo: (c) => `Tema ${c.geral.tema} · transição ${c.geral.transicaoMs} ms`,
  },
  {
    id: 'musicas',
    titulo: 'Músicas',
    descricao: 'Troca da letra, fim da música e atualizar do Louvor JA.',
    icone: Music,
    resumo: (c) =>
      `Antecipação ${c.musicas.antecipacaoMs} ms · no fim: ${{ fechar: 'fecha', logo: 'mostra o Logo', manter: 'continua' }[c.musicas.aoTerminar]}`,
  },
  {
    id: 'videos',
    titulo: 'Vídeos e som',
    descricao: 'Fim do vídeo, Esc, vídeos pesados (conversor) e o lembrete do canal do PC na mesa.',
    icone: Film,
    resumo: (c) =>
      `No fim: ${{ sair: 'sai do ar', logo: 'mostra o Logo', congelar: 'último quadro' }[c.videos.aoTerminar]} · ${c.videos.lembreteCanal ? 'com lembrete da mesa' : 'sem lembrete da mesa'}`,
  },
  {
    id: 'biblia',
    titulo: 'Bíblia',
    descricao: 'Versão, segunda versão, tamanho de cada tela e referência.',
    icone: BookOpen,
    resumo: (c) => (c.biblia.versaoPadrao ? `Versão ${c.biblia.versaoPadrao}${c.biblia.segundaVersao ? ` + ${c.biblia.segundaVersao}` : ''}` : 'Nenhuma versão escolhida'),
  },
  {
    id: 'transcricao',
    titulo: 'Bíblia automática (IA)',
    descricao: 'Ouve o pregador e sugere os versículos: transcrição, IA, citação direta e economia.',
    icone: Sparkles,
    resumo: (c) => {
      const t = c.transcricao
      if (t.escuta.motor === 'elevenlabs' && !t.escuta.chaveElevenLabs.trim()) return 'Sem a chave do ElevenLabs'
      if (!t.ia.modelo.trim() || (t.ia.tipo === 'anthropic' && !t.ia.chave.trim())) return 'Sem a IA (só referências ditas)'
      return `${t.ia.modelo} · a cada ${t.ia.intervaloS} s · ${t.ia.janelaS} s de fala`
    },
  },
  {
    id: 'apresentacoes',
    titulo: 'Apresentações',
    descricao: 'Slides ocultos, vídeos dos slides e resolução das imagens.',
    icone: Presentation,
    resumo: (c) => `Imagens de ${c.apresentacoes.largura} px · ${c.apresentacoes.pularOcultos ? 'pula' : 'mostra'} os ocultos`,
  },
  {
    id: 'fundos',
    titulo: 'Fundos',
    descricao: 'Imagem atrás dos versículos, dos textos e das músicas.',
    icone: Wallpaper,
    resumo: (c) => (c.fundos.padrao ? `Fundo padrão: ${nomeArquivo(c.fundos.padrao)}` : 'Sem imagem padrão'),
  },
  {
    id: 'espera',
    titulo: 'Tela de espera (Logo)',
    descricao: 'O que aparece nos projetores ao apertar Logo.',
    icone: MonitorPause,
    resumo: (c) => (c.telaEspera.imagem ? `Imagem: ${nomeArquivo(c.telaEspera.imagem)}` : `“${c.telaEspera.texto}”`),
  },
  {
    id: 'ferramentas',
    titulo: 'Ferramentas',
    descricao: 'Relógio, cores e fim do temporizador, QR code e sorteio.',
    icone: Wrench,
    resumo: (c) =>
      `Amarelo aos ${c.ferramentas.temporizadorAmareloMin} min · no fim: ${c.ferramentas.temporizadorAoTerminar === 'negativo' ? 'conta o tempo passado' : 'para no 0:00'}`,
  },
  {
    id: 'site',
    titulo: 'Site da igreja',
    descricao: 'Vídeos da semana e arquivos enviados, que chegam sozinhos em Mídias.',
    icone: CloudDownload,
    resumo: (c) => (!c.site.endereco.trim() ? 'Sem endereço do manifesto' : c.site.ativo ? 'Ligado · confere a cada 5 min' : 'Desligado'),
  },
  {
    id: 'iluminacao',
    titulo: 'Iluminação',
    descricao: 'Botão das luzes e cenários nos itens da liturgia.',
    icone: Lightbulb,
    resumo: (c) => (c.iluminacao.ativo ? `Ligado · ${c.iluminacao.endereco}` : 'Desligado'),
  },
  {
    id: 'remoto',
    titulo: 'Controle remoto',
    descricao: 'Celular ou tablet: endereço, porta e PIN.',
    icone: Smartphone,
    resumo: (c) => (c.remoto.ativo ? `Ligado · porta ${c.remoto.porta} · ${c.remoto.exigirPin ? 'com PIN' : 'sem PIN'}` : 'Desligado'),
  },
]

// lembrada entre uma visita e outra à página (zera ao fechar o programa)
let pastaLembrada: IdPasta | null = null

export function PaginaConfiguracoes({ config, salvar }: { config: Config; salvar: (c: Config) => void }) {
  const [pasta, setPastaLocal] = useState<IdPasta | null>(pastaLembrada)
  const raiz = useRef<HTMLDivElement>(null)
  const setPasta = (p: IdPasta | null) => {
    pastaLembrada = p
    setPastaLocal(p)
  }
  // entrar ou sair de uma pasta começa do topo
  useLayoutEffect(() => {
    raiz.current?.scrollIntoView({ block: 'start' })
  }, [pasta])

  const atual = PASTAS.find((p) => p.id === pasta)
  if (!atual) {
    return (
      <div ref={raiz} className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {PASTAS.map((p) => (
            <CartaoPasta key={p.id} icone={p.icone} titulo={p.titulo} descricao={p.descricao} resumo={p.resumo(config)} aoAbrir={() => setPasta(p.id)} />
          ))}
        </div>
        <p className="text-xs text-suave">As opções de cada projetor (tamanho do texto, vídeo no Palco, fundo em cada saída, próximo slide) ficam na página Telas.</p>
      </div>
    )
  }

  const Icone = atual.icone
  return (
    <div ref={raiz} className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <div className="flex items-center gap-1.5">
        <Botao variante="fantasma" icone={ArrowLeft} onClick={() => setPasta(null)} title="Voltar para todas as configurações">
          Configurações
        </Botao>
        <ChevronRight className="size-4 text-apagado" />
        <span className="flex items-center gap-2 text-[15px] font-semibold">
          <Icone className="size-4 text-destaque-texto" />
          {atual.titulo}
        </span>
      </div>
      <ConteudoPasta pasta={atual.id} config={config} salvar={salvar} />
    </div>
  )
}

function CartaoPasta({ icone: Icone, titulo, descricao, resumo, aoAbrir }: { icone: LucideIcon; titulo: string; descricao: string; resumo: string; aoAbrir: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.currentTarget.blur()
        aoAbrir()
      }}
      className="group flex cursor-pointer items-start gap-3 rounded-xl border border-borda bg-painel p-4 text-left transition-colors hover:border-destaque/60 hover:bg-hover"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-destaque/12 text-destaque-texto">
        <Icone className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-texto">{titulo}</span>
        <span className="mt-0.5 block text-[13px] leading-snug text-suave">{descricao}</span>
        <span className="mt-2 block truncate text-xs text-apagado">{resumo}</span>
      </span>
      <ChevronRight className="mt-2.5 size-4 shrink-0 text-apagado transition-transform group-hover:translate-x-0.5 group-hover:text-texto" />
    </button>
  )
}

function ConteudoPasta({ pasta, config, salvar }: { pasta: IdPasta; config: Config; salvar: (c: Config) => void }) {
  switch (pasta) {
    case 'geral':
      return (
        <Secao titulo="Geral">
          <FormularioEsquema esquema={EsquemaGeral} valor={config.geral} aoMudar={(geral) => salvar({ ...config, geral })} />
        </Secao>
      )
    case 'musicas':
      return (
        <>
          <Secao titulo="Músicas">
            <FormularioEsquema esquema={EsquemaMusicas} valor={config.musicas} aoMudar={(musicas) => salvar({ ...config, musicas })} />
          </Secao>
          <AtualizarLouvorJa pasta={config.musicas.pastaLouvorJa} />
        </>
      )
    case 'videos':
      return (
        <>
          <Secao titulo="Vídeos e som" descricao="Se o vídeo toca também no Palco (e o tempo que falta por cima) fica em Telas, em cada saída.">
            <FormularioEsquema esquema={EsquemaVideos} valor={config.videos} aoMudar={(videos) => salvar({ ...config, videos })} />
          </Secao>
          <ConversorVideo />
        </>
      )
    case 'biblia':
      return (
        <Secao titulo="Bíblia">
          <FormularioEsquema esquema={EsquemaBiblia} valor={config.biblia} aoMudar={(biblia) => salvar({ ...config, biblia })} />
        </Secao>
      )
    case 'transcricao': {
      const t = config.transcricao
      return (
        <>
          <Secao
            titulo="Como funciona"
            descricao="Na página Bíblia, troque de Manual para Automático. O programa começa sempre no Manual."
          >
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-texto">
              <li>
                A fala do microfone vira texto neste computador (Whisper, sem internet e sem custo) ou na nuvem (ElevenLabs). As referências ditas (“João 3:16”, “versículo 17”) aparecem na hora; a IA lê os últimos segundos de fala e
                sugere os versículos ligados ao que foi dito.
              </li>
              <li>O texto que vai para a tela sempre vem da Bíblia do programa: a IA só aponta a referência.</li>
              <li>
                Sem ninguém falando, a transcrição fecha e a IA não é chamada: <b>não gasta</b>. Volta sozinha na próxima fala.
              </li>
            </ul>
          </Secao>
          <Secao titulo="Transcrição (fala → texto)">
            <FormularioEsquema
              esquema={EsquemaTranscricaoEscuta}
              valor={t.escuta}
              omitir={t.escuta.motor === 'local' ? ['chaveElevenLabs'] : ['modeloLocal', 'threadsLocal']}
              aoMudar={(escuta) => salvar({ ...config, transcricao: { ...t, escuta } })}
            />
            {t.escuta.motor === 'local' && <WhisperLocal modelo={t.escuta.modeloLocal} />}
          </Secao>
          <Secao titulo="IA (escolha dos versículos)" descricao="Qualquer API no formato da Anthropic ou compatível com OpenAI. A chave fica só neste computador.">
            <FormularioEsquema esquema={EsquemaTranscricaoIA} valor={t.ia} aoMudar={(ia) => salvar({ ...config, transcricao: { ...t, ia } })} />
          </Secao>
          <Secao titulo="Citação direta e economia">
            <FormularioEsquema esquema={EsquemaTranscricaoAuto} valor={t.auto} aoMudar={(auto) => salvar({ ...config, transcricao: { ...t, auto } })} />
          </Secao>
          <TestesTranscricao motor={t.escuta.motor} />
        </>
      )
    }
    case 'apresentacoes':
      return (
        <Secao titulo="Apresentações" descricao="O próximo slide e as anotações em cada saída ficam em Telas.">
          <FormularioEsquema esquema={EsquemaApresentacoes} valor={config.apresentacoes} aoMudar={(apresentacoes) => salvar({ ...config, apresentacoes })} />
        </Secao>
      )
    case 'fundos':
      return (
        <Secao titulo="Fundos" descricao="Cada saída pode ligar ou desligar o fundo em Telas (o Palco vem sem fundo, para ficar mais fácil de ler).">
          <PreviaFundo caminho={config.fundos.padrao} />
          <FormularioEsquema esquema={EsquemaFundos} valor={config.fundos} aoMudar={(fundos) => salvar({ ...config, fundos })} />
          <p className="mt-3 text-xs text-suave">Imagens, vídeos e slides ficam sem fundo: aparecem sobre a cor de fundo da saída.</p>
          <p className="mt-1 text-xs text-suave">
            Na Liturgia, cada seção pode ter a própria imagem: enquanto um item da seção está no ar, ela fica no lugar do fundo padrão (e da imagem das músicas, se a
            seção pedir).
          </p>
        </Secao>
      )
    case 'espera':
      return (
        <Secao titulo="Tela de espera (Logo)" descricao="Aparece quando o operador aperta Logo.">
          <div className="mb-4 overflow-hidden rounded-md ring-1 ring-borda" style={{ aspectRatio: '16 / 9', maxWidth: 360, containerType: 'size' }}>
            <TelaEspera espera={config.telaEspera} />
          </div>
          <FormularioEsquema esquema={EsquemaTelaEspera} valor={config.telaEspera} aoMudar={(telaEspera) => salvar({ ...config, telaEspera })} />
        </Secao>
      )
    case 'ferramentas':
      return (
        <Secao titulo="Ferramentas" descricao="Onde cada ferramenta aparece (e a posição e o tamanho no canto) fica na própria página Ferramentas.">
          <FormularioEsquema esquema={EsquemaFerramentas} valor={config.ferramentas} aoMudar={(ferramentas) => salvar({ ...config, ferramentas })} />
        </Secao>
      )
    case 'site':
      return (
        <Secao
          titulo="Site da igreja"
          descricao="O programa lê o catálogo de mídias do site (manifest.json) e baixa para a biblioteca de Mídias o que é deste sábado. O andamento fica em Mídias → Do site."
        >
          <FormularioEsquema esquema={EsquemaSite} valor={config.site} aoMudar={(site) => salvar({ ...config, site })} />
          <p className="mt-3 text-xs text-suave">
            Não precisa de senha: o próprio endereço tem a chave de leitura. Se o link vazar, peça um novo à equipe do site e cole aqui.
          </p>
        </Secao>
      )
    case 'iluminacao':
      return (
        <Secao titulo="Iluminação" descricao="O sistema das luzes da igreja (luz.local). Os cenários são criados na página dele.">
          <FormularioEsquema esquema={EsquemaIluminacao} valor={config.iluminacao} aoMudar={(iluminacao) => salvar({ ...config, iluminacao })} />
        </Secao>
      )
    case 'remoto':
      return <SecaoRemoto config={config} salvar={salvar} />
  }
}

/** Como fica um versículo sobre o fundo padrão (com o mesmo escurecimento das saídas). */
function PreviaFundo({ caminho }: { caminho: string | null }) {
  return (
    <div className="relative mb-4 overflow-hidden rounded-md bg-black ring-1 ring-borda" style={{ aspectRatio: '16 / 9', maxWidth: 360 }}>
      {caminho && (
        <>
          <img src={urlMidia(caminho)} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,.35)' }} />
        </>
      )}
      <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center text-white" style={{ textShadow: '0 1px 4px rgba(0,0,0,.85)' }}>
        <span className="text-[15px] font-semibold leading-snug">Porque Deus amou o mundo de tal maneira…</span>
        <span className="mt-2 text-[11px] opacity-85">João 3:16</span>
      </div>
      {!caminho && <span className="absolute bottom-2 left-0 right-0 text-center text-[11px] text-white/50">sem imagem: fica a cor de fundo da saída</span>}
    </div>
  )
}

/** Importa de novo todas as músicas do Louvor JA (antes ficava na página Músicas). */
function AtualizarLouvorJa({ pasta }: { pasta: string }) {
  const [fase, setFase] = useState<'parado' | 'confirmar' | 'importando'>('parado')
  const [progresso, setProgresso] = useState<Progresso | null>(null)
  const [resultado, setResultado] = useState<ResultadoLouvorJa | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(
    () =>
      api.aoProgresso((p) => {
        if (p.tarefa === 'louvorja' && !p.fim) setProgresso(p)
      }),
    [],
  )

  const importar = async () => {
    setFase('importando')
    setProgresso(null)
    setResultado(null)
    setErro(null)
    try {
      setResultado(await api.importarLouvorJa('todas'))
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setFase('parado')
    }
  }

  return (
    <Secao titulo="Atualizar as músicas do Louvor JA" descricao="Para trazer as músicas novas depois de atualizar o Louvor JA neste computador.">
      <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-texto">
        <li>
          Importa de novo <b>todas</b> as músicas em português do Louvor JA (são quase 1.900). Pode levar alguns minutos e deixa o computador mais lento:{' '}
          <b>não faça durante o culto</b>.
        </li>
        <li>As que ainda não estão aqui entram. As que já estão recebem de novo a letra, os tempos, os áudios e a imagem do Louvor JA.</li>
        <li>
          Músicas que você editou aqui (letra ou tempos, pelo lápis na página Músicas) <b>não são mexidas</b>: ficam como você deixou.
        </li>
        <li className="text-suave">
          Lê da pasta <span className="font-mono text-xs">{pasta}</span> (campo “Pasta do Louvor JA”, acima).
        </li>
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {fase === 'confirmar' ? (
          <>
            <span className="text-sm font-medium">Importar todas as músicas agora?</span>
            <Botao variante="primario" icone={Download} onClick={() => void importar()}>
              Sim, importar
            </Botao>
            <Botao variante="fantasma" onClick={() => setFase('parado')}>
              Cancelar
            </Botao>
          </>
        ) : (
          <Botao icone={Download} disabled={fase === 'importando'} onClick={() => setFase('confirmar')}>
            Importar todas de novo…
          </Botao>
        )}
      </div>

      {fase === 'importando' && (
        <div className="mt-3 max-w-md">
          <BarraProgresso
            fracao={progresso ? progresso.feito / Math.max(1, progresso.total) : 0}
            texto={progresso ? `${progresso.feito} de ${progresso.total} músicas` : 'abrindo o Louvor JA…'}
          />
        </div>
      )}
      {resultado && (
        <p className="mt-3 rounded-md bg-painel-2 px-3 py-2 text-sm text-suave">
          Pronto: {resultado.novas} novas, {resultado.atualizadas} atualizadas
          {resultado.mantidasEditadas ? `, ${resultado.mantidasEditadas} editadas aqui (mantidas como estavam)` : ''}
          {resultado.erros.length ? `, ${resultado.erros.length} com erro` : ''}.
        </p>
      )}
      {erro && <p className="mt-3 text-sm text-perigo-texto">{erro}</p>}
    </Secao>
  )
}

/**
 * O conversor de vídeo que o programa usa. O do Holyrics é de 2014 e não lê AV1 (o vídeo do site que travou em
 * 21/11 era AV1 2560×1440): o botão baixa um ffmpeg novo, com versão e SHA-256 fixos.
 */
function ConversorVideo() {
  const [estado, setEstado] = useState<EstadoConversor | null>(null)
  const [baixando, setBaixando] = useState(false)
  const [progresso, setProgresso] = useState<Progresso | null>(null)
  const [mensagem, setMensagem] = useState<{ texto: string; erro: boolean } | null>(null)

  useEffect(() => {
    void api.estadoConversor().then(setEstado)
    return api.aoProgresso((p) => {
      if (p.tarefa === 'ffmpeg') setProgresso(p.fim ? null : p)
    })
  }, [])

  const baixar = async () => {
    setBaixando(true)
    setMensagem(null)
    try {
      const e = await api.instalarConversor()
      setEstado(e)
      setMensagem({ texto: e.pesados ? `Instalado. Convertendo ${e.pesados} vídeo${e.pesados > 1 ? 's' : ''} pesado${e.pesados > 1 ? 's' : ''} (veja em Mídias).` : 'Instalado.', erro: false })
    } catch (e) {
      setMensagem({ texto: mensagemDeErro(e), erro: true })
    } finally {
      setBaixando(false)
    }
  }

  const origem = !estado?.caminho ? 'nenhum' : estado.novoInstalado && !estado.antigo ? 'o novo' : estado.antigo ? 'o do Holyrics (2014, não lê AV1)' : nomeArquivo(estado.caminho)
  return (
    <Secao
      titulo="Conversor de vídeo (ffmpeg)"
      descricao="Converte os vídeos que este computador não toca bem. O do Holyrics é antigo e não lê AV1, o formato que o YouTube costuma entregar."
    >
      <p className="text-sm text-texto">
        Em uso: <b>{origem}</b>
        {estado?.pesados ? (
          <span className="text-aviso-texto">
            {' '}
            · {estado.pesados} vídeo{estado.pesados > 1 ? 's' : ''} pesado{estado.pesados > 1 ? 's' : ''} na biblioteca
          </span>
        ) : null}
      </p>
      {estado && !estado.novoInstalado && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Botao icone={Download} disabled={baixando} onClick={() => void baixar()}>
            Baixar o conversor novo ({estado.megasNova} MB)
          </Botao>
          <span className="text-xs text-suave">{estado.versaoNova}, uma vez só. Não baixe durante o culto (usa a internet da igreja).</span>
        </div>
      )}
      {baixando && (
        <div className="mt-3 max-w-md">
          <BarraProgresso fracao={progresso ? progresso.feito / Math.max(1, progresso.total) : 0} texto={progresso ? `${progresso.feito} de ${progresso.total} MB` : 'começando…'} />
        </div>
      )}
      {mensagem && <p className={`mt-3 text-sm ${mensagem.erro ? 'text-perigo-texto' : 'text-suave'}`}>{mensagem.texto}</p>}
      <p className="mt-3 text-xs text-suave">
        A conversão roda com prioridade baixa e o vídeo original continua tocando enquanto isso; o arquivo só é trocado quando o vídeo não está no ar. Um vídeo de
        7 minutos em 1440p leva uns 10 minutos neste computador: o ideal é que os vídeos já cheguem em H.264 até 1080p.
      </p>
    </Secao>
  )
}
