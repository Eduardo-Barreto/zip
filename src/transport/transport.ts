import type { GuestToHost, HostToGuest } from './messages'

export type HostHandlers = {
  onClientConnect: (clientId: string) => void
  onClientMessage: (clientId: string, msg: GuestToHost) => void
  onClientDisconnect: (clientId: string) => void
  onError: (err: Error) => void
}

export type PeerHost = {
  peerId: string
  send: (clientId: string, msg: HostToGuest) => void
  broadcast: (msg: HostToGuest | ((clientId: string) => HostToGuest | null)) => void
  close: () => void
  clientIds: () => string[]
}

export type ClientHandlers = {
  onConnected: () => void
  onMessage: (msg: HostToGuest) => void
  onDisconnected: () => void
  onReconnecting: (attempt: number) => void
  onError: (err: Error) => void
}

export type PeerClient = {
  peerId: string
  send: (msg: GuestToHost) => void
  close: () => void
  isOpen: () => boolean
}

export type CreatePeerHost = (desiredId: string, handlers: HostHandlers) => Promise<PeerHost>

export type CreatePeerClient = (
  desiredId: string,
  adminId: string,
  handlers: ClientHandlers,
) => Promise<PeerClient>

export type TransportFactory = {
  createHost: CreatePeerHost
  createClient: CreatePeerClient
}
