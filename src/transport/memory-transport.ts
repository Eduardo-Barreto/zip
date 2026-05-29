import type { GuestToHost, HostToGuest } from './messages'
import type {
  ClientHandlers,
  HostHandlers,
  PeerClient,
  PeerHost,
  TransportFactory,
} from './transport'

type Connection = {
  hostId: string
  clientId: string
  hostInbox: (msg: GuestToHost) => void
  clientInbox: (msg: HostToGuest) => void
  closed: boolean
}

type HostRegistration = {
  handlers: HostHandlers
  connections: Map<string, Connection>
}

const HOSTS = new Map<string, HostRegistration>()

export function resetMemoryTransport() {
  HOSTS.clear()
}

async function createHost(desiredId: string, handlers: HostHandlers): Promise<PeerHost> {
  if (HOSTS.has(desiredId)) {
    throw new Error(`host id "${desiredId}" already taken`)
  }
  const registration: HostRegistration = {
    handlers,
    connections: new Map(),
  }
  HOSTS.set(desiredId, registration)
  return {
    peerId: desiredId,
    send: (clientId, msg) => {
      const conn = registration.connections.get(clientId)
      if (conn && !conn.closed) conn.clientInbox(msg)
    },
    broadcast: (msgOrFn) => {
      for (const [clientId, conn] of registration.connections) {
        if (conn.closed) continue
        const msg = typeof msgOrFn === 'function' ? msgOrFn(clientId) : msgOrFn
        if (msg) conn.clientInbox(msg)
      }
    },
    close: () => {
      for (const conn of registration.connections.values()) {
        conn.closed = true
      }
      registration.connections.clear()
      HOSTS.delete(desiredId)
    },
    clientIds: () => Array.from(registration.connections.keys()),
  }
}

async function createClient(
  desiredId: string,
  adminId: string,
  handlers: ClientHandlers,
): Promise<PeerClient> {
  const host = HOSTS.get(adminId)
  if (!host) {
    throw new Error(`admin "${adminId}" not found`)
  }
  if (host.connections.has(desiredId)) {
    throw new Error(`client "${desiredId}" already connected`)
  }
  const conn: Connection = {
    hostId: adminId,
    clientId: desiredId,
    hostInbox: (msg) => host.handlers.onClientMessage(desiredId, msg),
    clientInbox: (msg) => handlers.onMessage(msg),
    closed: false,
  }
  host.connections.set(desiredId, conn)
  queueMicrotask(() => {
    host.handlers.onClientConnect(desiredId)
    handlers.onConnected()
  })
  return {
    peerId: desiredId,
    send: (msg) => {
      if (conn.closed) return
      conn.hostInbox(msg)
    },
    close: () => {
      if (conn.closed) return
      conn.closed = true
      host.connections.delete(desiredId)
      host.handlers.onClientDisconnect(desiredId)
      handlers.onDisconnected()
    },
    isOpen: () => !conn.closed,
  }
}

export const memoryTransport: TransportFactory = {
  createHost,
  createClient,
}
