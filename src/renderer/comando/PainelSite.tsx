/**
 * Aba "Do site" da página Mídias: o que o site da igreja tem para este sábado, o que já chegou na
 * biblioteca e como foi a última conferida. Os arquivos chegam sozinhos (a cada 5 minutos); o botão
 * "Atualizar do site" fica na barra da página, ao lado do "Importar…".
 */
import {
  AudioLines,
  CircleCheck,
  CloudAlert,
  CloudDownload,
  Eye,
  FileQuestion,
  Film,
  ImageIcon,
  LoaderCircle,
  Presentation,
  TriangleAlert,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { type CategoriaSite, diaMes, type EstadoSite, type ItemSite, ROTULOS_CATEGORIA, type SituacaoSite } from '../../shared/site'
import { api } from '../compartilhado/ganchos'
import { mensagemDeErro } from './acoes'
import { Botao, Selo } from './ui'

/** Estado da sincronização com o site (atualiza sozinho). */
export function useEstadoSite(): EstadoSite | null {
  const [e, setE] = useState<EstadoSite | null>(null)
  useEffect(() => {
    let vivo = true
    void api.estadoSite().then((x) => vivo && setE(x))
    const parar = api.aoMudarSite(setE)
    // a lixeira e a restauração mudam o "deletado": relê quando a biblioteca muda
    const pararMidias = api.aoMudarMidias(() => void api.estadoSite().then((x) => vivo && setE(x)))
    return () => {
      vivo = false
      parar()
      pararMidias()
    }
  }, [])
  return e
}

const ICONES = { video: Film, imagem: ImageIcon, audio: AudioLines, apresentacao: Presentation }

const SITUACOES: Record<SituacaoSite, { rotulo: string; tom: 'ok' | 'destaque' | 'aviso' | 'perigo' | 'apagado' }> = {
  pronto: { rotulo: 'Na biblioteca', tom: 'ok' },
  desatualizado: { rotulo: 'Não é deste sábado', tom: 'aviso' },
  'na-fila': { rotulo: 'Na fila', tom: 'destaque' },
  baixando: { rotulo: 'Baixando', tom: 'destaque' },
  esperando: { rotulo: 'Esperando sair do ar', tom: 'aviso' },
  'fora-do-sabado': { rotulo: 'Não é deste sábado', tom: 'apagado' },
  indisponivel: { rotulo: 'Ainda não tem', tom: 'apagado' },
  ignorado: { rotulo: 'Tipo não usado', tom: 'apagado' },
  deletado: { rotulo: 'Tirado da biblioteca', tom: 'apagado' },
  expirado: { rotulo: 'Prazo acabou', tom: 'apagado' },
  erro: { rotulo: 'Erro', tom: 'perigo' },
}

function tamanho(bytes: number): string {
  if (!bytes) return ''
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} kB`
}

function hora(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const hoje = new Date()
  const h = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return d.toDateString() === hoje.toDateString() ? h : `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${h}`
}

export function PainelSite({ estado }: { estado: EstadoSite | null }) {
  const [aviso, setAviso] = useState<string | null>(null)

  if (!estado) return <div className="p-5 text-sm text-suave">Carregando…</div>

  if (!estado.configurado) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-suave">
        <CloudDownload className="size-10 text-apagado" />
        <p className="text-sm">Os vídeos da semana e os arquivos enviados ao site da igreja podem chegar sozinhos aqui.</p>
        <p className="max-w-md text-xs">
          Cole o endereço do manifesto (o link de leitura que a equipe do site passou) em <b>Configurações → Site da igreja</b>.
        </p>
      </div>
    )
  }

  const grupos = (['automatico', 'fixo', 'enviado'] as CategoriaSite[])
    .map((c) => ({ categoria: c, itens: estado.itens.filter((i) => i.categoria === c) }))
    .filter((g) => g.itens.length)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-borda bg-painel px-4 py-3">
        {estado.erro ? <CloudAlert className="size-5 text-perigo-texto" /> : <CloudDownload className="size-5 text-destaque-texto" />}
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-medium">
            {!estado.ativo
              ? 'Busca automática desligada'
              : estado.verificando
                ? 'Conferindo o site…'
                : estado.sabado
                  ? `Arquivos para o sábado ${diaMes(estado.sabado)}`
                  : 'Site da igreja'}
          </div>
          <div className="text-xs text-suave">
            {estado.ultimoSucesso ? `Última conferida ${hora(estado.ultimoSucesso)}` : 'Ainda não conferiu'}
            {estado.ativo && estado.proximaVerificacao && !estado.verificando ? ` · próxima ${hora(estado.proximaVerificacao)}` : ''}
            {estado.ativo ? ' · confere sozinho a cada 5 minutos' : ' · ligue em Configurações → Site da igreja'}
          </div>
        </div>
        {estado.novos > 0 && (
          <Botao tamanho="sm" variante="fantasma" icone={Eye} onClick={() => void api.marcarVistosSite().catch((e) => setAviso(mensagemDeErro(e)))}>
            Marcar {estado.novos} como vistos
          </Botao>
        )}
      </div>

      {estado.erro && <Faixa tom="perigo" texto={estado.erro} />}
      {aviso && <Faixa tom="perigo" texto={aviso} />}
      {estado.avisos.map((a) => (
        <Faixa key={a} tom="aviso" texto={`O site avisou: ${a}`} />
      ))}

      {grupos.length === 0 && estado.ultimoSucesso && <p className="text-sm text-suave">O site não tem arquivos agora.</p>}
      {grupos.map((g) => (
        <section key={g.categoria}>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-apagado">{ROTULOS_CATEGORIA[g.categoria]}</h3>
          <div className="divide-y divide-borda overflow-hidden rounded-lg border border-borda bg-painel">
            {g.itens.map((i) => (
              <LinhaSite key={i.id} item={i} />
            ))}
          </div>
        </section>
      ))}
      <p className="text-xs text-suave">
        Semanais e fixos ficam como uma mídia só: quando chega a versão nova, ela toma o lugar da antiga, e a liturgia já usa a nova. Os enviados vão para a lixeira
        quando o prazo acaba. O que você tirar da biblioteca não é baixado de novo.
      </p>
    </div>
  )
}

function LinhaSite({ item: i }: { item: ItemSite }) {
  const Icone = i.destino ? ICONES[i.destino] : FileQuestion
  const s = SITUACOES[i.situacao]
  const datas = i.dataMidia ? diaMes(i.dataMidia) : ''
  return (
    <div className={`flex items-center gap-3 px-3 py-2 ${['ignorado', 'deletado', 'expirado', 'indisponivel', 'fora-do-sabado'].includes(i.situacao) ? 'opacity-60' : ''}`}>
      <Icone className="size-4 shrink-0 text-suave" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{i.titulo}</span>
          {i.novo && <Selo tom="destaque">Novo</Selo>}
        </div>
        <div className="truncate text-[11px] text-suave" title={i.arquivo ?? undefined}>
          {[i.arquivo, tamanho(i.bytes), datas].filter(Boolean).join(' · ')}
        </div>
        {i.situacao === 'baixando' && (
          <div className="mt-1 h-1 w-full max-w-64 overflow-hidden rounded-full bg-borda">
            <div className="h-full rounded-full bg-destaque transition-[width]" style={{ width: `${Math.round((i.progresso ?? 0) * 100)}%` }} />
          </div>
        )}
        {i.detalhe && <div className={`mt-0.5 text-[11px] ${s.tom === 'perigo' ? 'text-perigo-texto' : s.tom === 'aviso' ? 'text-aviso-texto' : 'text-suave'}`}>{i.detalhe}</div>}
      </div>
      <Selo tom={s.tom}>
        {i.situacao === 'baixando' ? (
          <>
            <LoaderCircle className="size-3 animate-spin" /> {Math.round((i.progresso ?? 0) * 100)}%
          </>
        ) : (
          <>
            {i.situacao === 'pronto' && <CircleCheck className="size-3" />}
            {(i.situacao === 'erro' || i.situacao === 'desatualizado') && <TriangleAlert className="size-3" />}
            {s.rotulo}
          </>
        )}
      </Selo>
    </div>
  )
}

function Faixa({ tom, texto }: { tom: 'aviso' | 'perigo'; texto: string }) {
  return (
    <div className={`flex items-start gap-2 rounded-md px-3 py-2 text-sm ${tom === 'perigo' ? 'bg-perigo/10 text-perigo-texto' : 'bg-aviso/12 text-aviso-texto'}`}>
      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      <span>{texto}</span>
    </div>
  )
}
