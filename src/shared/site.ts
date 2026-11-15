/**
 * Arquivos do site da igreja (catálogo de mídias, `manifest.json`): o que a tela de comando recebe
 * sobre cada arquivo do site e sobre a sincronização. A leitura do manifesto e os downloads ficam no
 * processo principal (`src/main/site/`).
 */

/** automatico = séries semanais (Avisos, Provai e Vede, Informativo, Vida e Saúde); fixo = materiais permanentes; enviado = arquivos que as pessoas mandam para o sábado */
export type CategoriaSite = 'automatico' | 'fixo' | 'enviado'

/** Para onde o arquivo vai no programa. */
export type DestinoSite = 'video' | 'imagem' | 'audio' | 'apresentacao'

/**
 * pronto         está na biblioteca e vale para este sábado
 * desatualizado  está na biblioteca, mas não é deste sábado (ou há versão nova chegando)
 * na-fila        vai ser baixado nesta passada
 * baixando       baixando agora (`progresso`)
 * esperando      versão nova baixada ou para baixar, mas a de agora está no ar: troca depois
 * fora-do-sabado o site tem, mas não é para este sábado (não é baixado)
 * indisponivel   o site ainda não tem o arquivo
 * ignorado       tipo de arquivo que o programa não usa
 * deletado       o operador tirou da biblioteca: não é baixado de novo
 * expirado       o prazo do envio acabou: o programa mandou para a lixeira
 * erro           o download falhou (tenta de novo na próxima passada)
 */
export type SituacaoSite =
  | 'pronto'
  | 'desatualizado'
  | 'na-fila'
  | 'baixando'
  | 'esperando'
  | 'fora-do-sabado'
  | 'indisponivel'
  | 'ignorado'
  | 'deletado'
  | 'expirado'
  | 'erro'

export interface ItemSite {
  id: string
  categoria: CategoriaSite
  titulo: string
  arquivo: string | null
  destino: DestinoSite | null
  bytes: number
  /** data do vídeo ou sábado do envio, 'AAAA-MM-DD' */
  dataMidia: string | null
  /** data do arquivo que está na biblioteca (pode ser de outra semana) */
  dataLocal: string | null
  situacao: SituacaoSite
  /** explicação para o operador */
  detalhe: string | null
  /** 0 a 1 durante o download */
  progresso: number | null
  /** chegou e o operador ainda não viu */
  novo: boolean
  midiaId: number | null
  apresentacaoId: number | null
}

export interface EstadoSite {
  /** há um endereço de manifesto nas configurações */
  configurado: boolean
  ativo: boolean
  verificando: boolean
  /** ISO da última tentativa e do último manifesto lido sem erro */
  ultimaVerificacao: string | null
  ultimoSucesso: string | null
  proximaVerificacao: string | null
  erro: string | null
  /** avisos do próprio site (fontes que ele não conseguiu ler) */
  avisos: string[]
  /** sábado de referência do manifesto, 'AAAA-MM-DD' */
  sabado: string | null
  itens: ItemSite[]
  /** quantos chegaram e ainda não foram vistos */
  novos: number
}

/** O que o cartão de uma mídia da biblioteca mostra quando ela veio do site. */
export interface InfoSiteMidia {
  siteId: string
  categoria: CategoriaSite
  titulo: string
  dataLocal: string | null
  novo: boolean
  /** vale para este sábado */
  atual: boolean
  /** por que não vale (só para as séries semanais e os envios) */
  aviso: string | null
}

export const ROTULOS_CATEGORIA: Record<CategoriaSite, string> = {
  automatico: 'Semanais',
  fixo: 'Fixos',
  enviado: 'Enviados para o sábado',
}

/** '2026-11-14' → '14/11' */
export function diaMes(data: string | null | undefined): string {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(data ?? '')
  return m ? `${m[2]}/${m[1]}` : ''
}
