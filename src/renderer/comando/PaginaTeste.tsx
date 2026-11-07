/** Página "Teste": confere os projetores (proporção, cortes, vídeo liso) antes de usar no culto. */
import { Film, Grid3x3, ImageIcon, ImagePlus, LoaderCircle, Type, X } from 'lucide-react'
import { useState } from 'react'
import type { Config } from '../../shared/config'
import type { Comando, Conteudo, Telemetria } from '../../shared/estado'
import { formatarTempo } from '../compartilhado/Camadas'
import { api } from '../compartilhado/ganchos'
import { mensagemDeErro } from './acoes'
import { Botao, Secao } from './ui'

const TEXTO_EXEMPLO = {
  texto: 'Porque Deus amou o mundo de tal maneira\nque deu o seu Filho unigênito',
  referencia: 'João 3:16 (ARA)',
}

export function PaginaTeste({ config, alvo, telemetrias }: { config: Config; alvo: string; telemetrias: Record<string, Telemetria> }) {
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const enviar = (c: Comando) => api.comando(c)
  const mostrar = (conteudo: Conteudo) => enviar({ tipo: 'mostrar', alvo, conteudo })

  const escolher = async (tipo: 'imagem' | 'video') => {
    const a = await api.escolherArquivo(tipo)
    if (!a) return
    if (tipo === 'imagem') mostrar({ tipo: 'imagem', url: a.url, nome: a.nome })
    else mostrar({ tipo: 'video', url: a.url, nome: a.nome, loop: false })
  }

  const videoDeTeste = async () => {
    setGerando(true)
    setErro(null)
    try {
      const a = await api.videoDeTeste()
      mostrar({ tipo: 'video', url: a.url, nome: a.nome, loop: true })
    } catch (e) {
      setErro(`Não foi possível gerar o vídeo de teste. ${mensagemDeErro(e)}`)
    } finally {
      setGerando(false)
    }
  }

  const fundo = async () => {
    const a = await api.escolherArquivo('imagem')
    if (a) enviar({ tipo: 'fundo', alvo, fundo: { tipo: 'imagem', url: a.url, nome: a.nome } })
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <Secao
        titulo="Conteúdo de teste"
        descricao="Vai para a saída escolhida em “Enviar para”. No padrão de teste, o círculo tem que ficar redondo, as quatro setas dos cantos visíveis e a barra laranja correndo sem trancos."
      >
        <div className="grid grid-cols-3 gap-2">
          <Botao tamanho="lg" icone={Grid3x3} onClick={() => mostrar({ tipo: 'teste' })}>
            Padrão de teste
          </Botao>
          <Botao tamanho="lg" icone={Type} onClick={() => mostrar({ tipo: 'texto', ...TEXTO_EXEMPLO })}>
            Texto de exemplo
          </Botao>
          <Botao tamanho="lg" icone={X} onClick={() => mostrar({ tipo: 'vazio' })}>
            Tirar conteúdo
          </Botao>
          <Botao tamanho="lg" icone={ImageIcon} onClick={() => escolher('imagem')}>
            Imagem…
          </Botao>
          <Botao tamanho="lg" icone={Film} onClick={() => escolher('video')}>
            Vídeo…
          </Botao>
          <Botao tamanho="lg" icone={gerando ? LoaderCircle : Film} disabled={gerando} onClick={videoDeTeste}>
            {gerando ? 'Gerando vídeo…' : 'Vídeo de teste 1080p'}
          </Botao>
        </div>
        {erro && <p className="mt-3 text-sm text-perigo-texto">{erro}</p>}
        <div className="mt-4 flex items-center gap-2 border-t border-borda pt-4">
          <span className="mr-2 text-sm text-suave">Fundo:</span>
          <Botao icone={ImagePlus} onClick={fundo}>
            Imagem de fundo…
          </Botao>
          <Botao variante="fantasma" icone={X} onClick={() => enviar({ tipo: 'fundo', alvo, fundo: { tipo: 'nenhum' } })}>
            Tirar fundo
          </Botao>
        </div>
      </Secao>

      <Secao titulo="Desempenho do vídeo" descricao="Use o player à direita para tocar, pausar e mudar o volume.">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-suave">
              <th className="pb-2 font-semibold">Saída</th>
              <th className="pb-2 font-semibold">Resolução real</th>
              <th className="pb-2 font-semibold">Vídeo</th>
              <th className="pb-2 font-semibold">Quadros perdidos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {config.saidas.map((s) => {
              const t = telemetrias[s.id]
              const v = t?.video
              const pct = v && v.quadros > 0 ? (v.perdidos / v.quadros) * 100 : 0
              const cor = pct < 1 ? 'text-ok-texto' : pct < 5 ? 'text-aviso-texto' : 'text-perigo-texto'
              return (
                <tr key={s.id}>
                  <td className="py-2 font-medium">{s.nome}</td>
                  <td className="py-2 tabular-nums text-suave">{t ? `${t.largura} × ${t.altura}` : '—'}</td>
                  <td className="py-2 tabular-nums text-suave">
                    {v ? `${v.tocando ? '▶' : '❚❚'} ${formatarTempo(v.posicao)} / ${formatarTempo(v.duracao)}` : s.mostrarVideo ? '—' : 'não mostra vídeo'}
                  </td>
                  <td className={`py-2 tabular-nums ${v ? cor : 'text-suave'}`}>{v ? `${v.perdidos} de ${v.quadros} (${pct.toFixed(1)}%)` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-suave">
          Até 1% de quadros perdidos é normal. Acima de 5%, o vídeo engasga naquele projetor (ver a nota sobre as duas placas de vídeo no PLANO.md).
        </p>
      </Secao>
    </div>
  )
}
