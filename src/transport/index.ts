import { broadcastTransport } from './broadcast-transport'
import { memoryTransport } from './memory-transport'
import { peerjsTransport } from './peerjs-transport'
import type { TransportFactory } from './transport'

export function getTransport(): TransportFactory {
  if (import.meta.env?.PROD) return peerjsTransport
  const mode = import.meta.env?.VITE_TRANSPORT as string | undefined
  if (mode === 'memory') return memoryTransport
  if (mode === 'broadcast') return broadcastTransport
  return peerjsTransport
}

export { peerjsTransport } from './peerjs-transport'
export type {
  ClientHandlers,
  HostHandlers,
  PeerClient,
  PeerHost,
  TransportFactory,
} from './transport'
