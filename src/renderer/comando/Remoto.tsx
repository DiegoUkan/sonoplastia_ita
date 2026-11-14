/** Controle remoto na tela de comando: endereço na barra de status, seção nas Configurações e o passador. */
import { Smartphone } from 'lucide-react'
import { useEffect, useState } from 'react'
import { type Config, EsquemaRemoto } from '../../shared/config'
import type { StatusRemoto } from '../../shared/remoto'
import { api } from '../compartilhado/ganchos'
import { FormularioEsquema } from './FormularioEsquema'
import { Secao } from './ui'

export function useRemoto(): StatusRemoto | null {
  const [s, setS] = useState<StatusRemoto | null>(null)
  useEffect(() => {
    api.statusRemoto().then(setS)
    return api.aoMudarRemoto(setS)
  }, [])
  return s
}

/**
 * O passador do celular vira PageDown/PageUp na tela de comando, pelo mesmo caminho do teclado:
 * a página aberta (Músicas, Bíblia, Apresentações…) decide o que é "próximo".
 */
export function usePassadorRemoto(): void {
  useEffect(
    () =>
      api.aoPassador((d) => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: d === 'proximo' ? 'PageDown' : 'PageUp', cancelable: true }))
      }),
    [],
  )
}

const semHttp = (u: string) => u.replace(/^http:\/\//, '')

export function IndicadorRemoto() {
  const s = useRemoto()
  if (!s?.ativo) return null
  if (s.erro) {
    return (
      <span className="flex items-center gap-1.5 text-perigo-texto" title={s.erro}>
        <Smartphone className="size-3.5" />
        Remoto com erro
      </span>
    )
  }
  const endereco = s.enderecos[0]
  if (!endereco) return null
  return (
    <span className="flex items-center gap-1.5" title={`Controle remoto: abra no celular (mesmo Wi-Fi).${s.pin ? ` PIN ${s.pin}.` : ''}`}>
      <Smartphone className={`size-3.5 ${s.conectados ? 'text-ok' : ''}`} />
      <b className="font-semibold text-texto">{semHttp(endereco)}</b>
      {s.pin && <span>PIN {s.pin}</span>}
      {s.conectados > 0 && <span className="text-ok-texto">· {s.conectados} conectado{s.conectados > 1 ? 's' : ''}</span>}
    </span>
  )
}

export function SecaoRemoto({ config, salvar }: { config: Config; salvar: (c: Config) => void }) {
  const s = useRemoto()
  return (
    <Secao
      titulo="Controle remoto (celular)"
      descricao="No celular ou tablet, conectado no mesmo Wi-Fi deste computador, abra o navegador e digite o endereço."
    >
      {s?.ativo && (
        <div className="mb-4 rounded-md border border-borda bg-painel-2 p-3 text-sm">
          {s.erro ? (
            <p className="text-perigo-texto">{s.erro}</p>
          ) : s.enderecos.length ? (
            <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
              <div>
                <div className="text-xs text-suave">Endereço</div>
                {s.enderecos.map((e, i) => (
                  <div key={e} className={i === 0 ? 'font-mono text-lg font-semibold' : 'font-mono text-xs text-suave'}>
                    {semHttp(e)}
                  </div>
                ))}
              </div>
              {s.pin && (
                <div>
                  <div className="text-xs text-suave">PIN</div>
                  <div className="font-mono text-lg font-semibold tracking-widest">{s.pin}</div>
                </div>
              )}
              <div className="text-xs text-suave">{s.conectados ? `${s.conectados} aparelho(s) conectado(s) agora` : 'Nenhum aparelho conectado'}</div>
            </div>
          ) : s.porta ? (
            <p className="text-aviso-texto">Ligado na porta {s.porta}, mas este computador não está em nenhuma rede (Wi-Fi ou cabo).</p>
          ) : (
            <p className="text-suave">Ligando…</p>
          )}
          <p className="mt-3 text-xs text-suave">
            Se o celular não abrir a página: confira se ele está no mesmo Wi-Fi e se o Firewall do Windows deixou o programa usar a rede (na primeira vez o
            Windows pergunta; clique em <b>Permitir acesso</b>).
          </p>
        </div>
      )}
      <FormularioEsquema esquema={EsquemaRemoto} valor={config.remoto} aoMudar={(remoto) => salvar({ ...config, remoto })} />
    </Secao>
  )
}
