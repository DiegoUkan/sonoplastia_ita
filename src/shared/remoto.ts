/**
 * Controle remoto: um celular ou tablet na mesma rede abre `http://<IP do computador>:<porta>` e
 * comanda o programa por uma página própria (`remoto.html`). Tipos usados pelo servidor (processo
 * principal), pela página do celular e pela tela de comando (que mostra o endereço).
 */
import type { ConfigBiblia, ConfigTelaEspera } from './config'

export interface StatusRemoto {
  ativo: boolean
  /** porta em que o servidor está ouvindo (null: parado ou com erro) */
  porta: number | null
  /** endereços para digitar no celular, o mais provável primeiro */
  enderecos: string[]
  /** null quando não pede PIN */
  pin: string | null
  erro: string | null
  /** celulares/tablets conectados agora */
  conectados: number
}

/** O que a página do celular sabe da configuração (sem o PIN). */
export interface ConfigPublica {
  tema: 'claro' | 'escuro'
  saidas: Array<{ id: string; nome: string; ativa: boolean }>
  biblia: ConfigBiblia
  telaEspera: Pick<ConfigTelaEspera, 'texto'>
  /** lembrete de abrir o canal do PC na mesa de som (o celular mostra também) */
  lembreteCanal: { ligado: boolean; intervaloMin: number }
}

export type DirecaoPassador = 'proximo' | 'anterior'

/** Métodos que o celular pode chamar (`POST /api/chamar`). Tudo fora desta lista é recusado. */
export const METODOS_REMOTO = [
  'comando',
  'passador',
  'listarMusicas',
  'obterMusica',
  'abrirMusica',
  'listarMidias',
  'versoesBiblia',
  'capitulo',
  'totalCapitulos',
  'buscarBiblia',
  // sugestões de versículos ao vivo: ligar/desligar "ouvir e sugerir"
  'ligarTranscricao',
] as const
export type MetodoRemoto = (typeof METODOS_REMOTO)[number]

/** Eventos que o servidor manda ao celular (`GET /api/eventos`, Server-Sent Events). */
export type EventoRemoto = 'estado' | 'config' | 'telemetria' | 'biblia' | 'midias' | 'transcricao' | 'transcricao-parcial'
