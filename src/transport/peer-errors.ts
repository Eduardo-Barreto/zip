export type PeerErrorKind =
  | 'browser-incompatible'
  | 'disconnected'
  | 'invalid-id'
  | 'invalid-key'
  | 'network'
  | 'peer-unavailable'
  | 'ssl-unavailable'
  | 'server-error'
  | 'socket-error'
  | 'socket-closed'
  | 'unavailable-id'
  | 'webrtc'
  | 'negotiation-failed'
  | 'connection-closed'
  | 'unknown'

export type ClassifiedPeerError = {
  kind: PeerErrorKind
  message: string
  /** True when retrying the same action might succeed (e.g. unavailable-id, network). */
  retryable: boolean
  /** Original error, for logging. */
  cause: unknown
}

const MESSAGES: Record<PeerErrorKind, string> = {
  'browser-incompatible': 'Navegador sem suporte a WebRTC. Tente Chrome ou Safari atualizado.',
  disconnected: 'Reconectando ao servidor de salas…',
  'invalid-id': 'Código de sala inválido.',
  'invalid-key': 'Configuração do servidor de salas inválida.',
  network: 'Sem internet ou servidor de salas fora do ar.',
  'peer-unavailable': 'Sala não encontrada — confira o código.',
  'ssl-unavailable': 'Servidor de salas sem HTTPS.',
  'server-error': 'Servidor de salas com erro. Tente novamente.',
  'socket-error': 'Falha de rede com o servidor de salas.',
  'socket-closed': 'Servidor de salas encerrou a conexão.',
  'unavailable-id':
    'Esta sala ainda está ativa no servidor. Aguarde alguns segundos e tente de novo.',
  webrtc: 'Falha na conexão direta entre dispositivos (provavelmente NAT/firewall).',
  'negotiation-failed':
    'Falha ao negociar a conexão. Verifique se ambos têm internet e tente novamente.',
  'connection-closed': 'A outra ponta encerrou a conexão.',
  unknown: 'Erro desconhecido na conexão.',
}

const RETRYABLE: Set<PeerErrorKind> = new Set([
  'network',
  'server-error',
  'socket-error',
  'socket-closed',
  'unavailable-id',
  'disconnected',
  'negotiation-failed',
])

export function classifyPeerError(err: unknown): ClassifiedPeerError {
  const kind = peerErrorKind(err)
  return {
    kind,
    message: MESSAGES[kind],
    retryable: RETRYABLE.has(kind),
    cause: err,
  }
}

function peerErrorKind(err: unknown): PeerErrorKind {
  if (!err) return 'unknown'
  // PeerError carries .type. Plain Errors don't.
  const raw = (err as { type?: unknown }).type
  if (typeof raw !== 'string') return 'unknown'
  if (isKnownKind(raw)) return raw
  return 'unknown'
}

function isKnownKind(s: string): s is PeerErrorKind {
  return s in MESSAGES
}
