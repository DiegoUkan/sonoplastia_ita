import { type Config, EsquemaBiblia, EsquemaGeral, EsquemaMusicas, EsquemaTelaEspera } from '../../shared/config'
import { TelaEspera } from '../compartilhado/Camadas'
import { FormularioEsquema } from './FormularioEsquema'
import { Secao } from './ui'

export function PaginaConfiguracoes({ config, salvar }: { config: Config; salvar: (c: Config) => void }) {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <Secao titulo="Geral" descricao="As opções de cada saída (texto, vídeo no Palco, fundo das músicas) ficam em Telas.">
        <FormularioEsquema esquema={EsquemaGeral} valor={config.geral} aoMudar={(geral) => salvar({ ...config, geral })} />
      </Secao>
      <Secao titulo="Músicas">
        <FormularioEsquema esquema={EsquemaMusicas} valor={config.musicas} aoMudar={(musicas) => salvar({ ...config, musicas })} />
      </Secao>
      <Secao titulo="Bíblia">
        <FormularioEsquema esquema={EsquemaBiblia} valor={config.biblia} aoMudar={(biblia) => salvar({ ...config, biblia })} />
      </Secao>
      <Secao titulo="Tela de espera (Logo)" descricao="Aparece quando o operador aperta Logo.">
        <div className="mb-4 overflow-hidden rounded-md ring-1 ring-borda" style={{ aspectRatio: '16 / 9', maxWidth: 360, containerType: 'size' }}>
          <TelaEspera espera={config.telaEspera} />
        </div>
        <FormularioEsquema esquema={EsquemaTelaEspera} valor={config.telaEspera} aoMudar={(telaEspera) => salvar({ ...config, telaEspera })} />
      </Secao>
    </div>
  )
}
