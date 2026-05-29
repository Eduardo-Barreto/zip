import Peer, { type DataConnection } from 'peerjs'
import { parseGuestToHost, parseHostToGuest } from './parse-messages'
import { classifyPeerError } from './peer-errors'
import type {
  ClientHandlers,
  HostHandlers,
  PeerClient,
  PeerHost,
  TransportFactory,
} from './transport'

const MAX_BACKOFF_MS = 30_000
const JOIN_TIMEOUT_MS = 30_000
const HOST_ID_RETRY_DELAY_MS = 2_000
const HOST_ID_RETRY_MAX = 3
const BROKER_RECONNECT_MAX = 3
const LAN_IP_REGEX = /^(?:\d+\.){3}\d+$/

const peerOptions = () => {
  const envHost = import.meta.env?.VITE_PEER_HOST as string | undefined
  const envPort = import.meta.env?.VITE_PEER_PORT as string | undefined
  const envPath = import.meta.env?.VITE_PEER_PATH as string | undefined

  if (!envHost && typeof window !== 'undefined') {
    const hostname = window.location.hostname
    const isLan = LAN_IP_REGEX.test(hostname) || hostname.endsWith('.local')
    if (isLan) {
      return {
        host: hostname,
        port: 9000,
        path: '/pj',
        secure: false,
        debug: 1,
      }
    }
  }
  if (!envHost) return { debug: 1 }
  return {
    host: envHost,
    port: envPort ? Number.parseInt(envPort, 10) : 443,
    path: envPath ?? '/',
    secure: envHost !== 'localhost' && envHost !== '127.0.0.1',
    debug: 1,
  }
}

function makeBrokerReconnector(peer: Peer, isClosed: () => boolean, onError: (err: Error) => void) {
  let attempt = 0
  let timer: ReturnType<typeof setTimeout> | null = null

  const cancel = () => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  const reset = () => {
    attempt = 0
    cancel()
  }

  const tryNow = () => {
    if (isClosed()) return
    try {
      peer.reconnect()
    } catch (err) {
      attempt += 1
      if (attempt > BROKER_RECONNECT_MAX) {
        onError(err as Error)
        return
      }
      const delay = Math.min(1000 * 2 ** (attempt - 1), MAX_BACKOFF_MS)
      timer = setTimeout(tryNow, delay)
    }
  }

  return { tryNow, reset, cancel }
}

async function createHost(desiredId: string, handlers: HostHandlers): Promise<PeerHost> {
  return createHostWithRetry(desiredId, handlers, 0)
}

function createHostWithRetry(
  desiredId: string,
  handlers: HostHandlers,
  attempt: number,
): Promise<PeerHost> {
  return new Promise((resolve, reject) => {
    const peer = new Peer(desiredId, peerOptions())
    const connections = new Map<string, DataConnection>()
    let opened = false
    let closed = false
    const reconnector = makeBrokerReconnector(peer, () => closed, handlers.onError)

    peer.on('open', (id) => {
      if (opened) {
        reconnector.reset()
        return
      }
      opened = true
      resolve({
        peerId: id,
        send: (clientId, msg) => {
          const conn = connections.get(clientId)
          if (conn?.open) conn.send(msg)
        },
        broadcast: (msgOrFn) => {
          for (const [clientId, conn] of connections) {
            if (!conn.open) continue
            const msg = typeof msgOrFn === 'function' ? msgOrFn(clientId) : msgOrFn
            if (msg) conn.send(msg)
          }
        },
        close: () => {
          closed = true
          reconnector.cancel()
          for (const conn of connections.values()) conn.close()
          connections.clear()
          peer.destroy()
        },
        clientIds: () => Array.from(connections.keys()),
      })
    })

    peer.on('connection', (conn) => {
      conn.on('open', () => {
        connections.set(conn.peer, conn)
        handlers.onClientConnect(conn.peer)
      })
      conn.on('data', (data) => {
        const parsed = parseGuestToHost(data)
        if (parsed === null) return // discard malformed/unknown wire messages
        handlers.onClientMessage(conn.peer, parsed)
      })
      conn.on('close', () => {
        connections.delete(conn.peer)
        handlers.onClientDisconnect(conn.peer)
      })
      conn.on('error', (err) => handlers.onError(err as Error))
    })

    peer.on('disconnected', () => {
      if (closed) return
      reconnector.tryNow()
    })

    peer.on('error', (err) => {
      if (opened) {
        handlers.onError(err)
        return
      }
      const classified = classifyPeerError(err)
      if (classified.kind === 'unavailable-id' && attempt < HOST_ID_RETRY_MAX) {
        try {
          peer.removeAllListeners()
          peer.destroy()
        } catch {
          // best-effort cleanup
        }
        setTimeout(() => {
          createHostWithRetry(desiredId, handlers, attempt + 1).then(resolve, reject)
        }, HOST_ID_RETRY_DELAY_MS)
        return
      }
      reject(asUserFacingError(err))
    })
  })
}

async function createClient(
  desiredId: string,
  adminId: string,
  handlers: ClientHandlers,
): Promise<PeerClient> {
  return new Promise((resolve, reject) => {
    const peer = new Peer(desiredId, peerOptions())
    let conn: DataConnection | null = null
    let attempt = 0
    let closed = false
    let backoffTimer: ReturnType<typeof setTimeout> | null = null
    let joinTimer: ReturnType<typeof setTimeout> | null = null
    let opened = false
    let everConnected = false
    const reconnector = makeBrokerReconnector(peer, () => closed, handlers.onError)

    const clearJoinTimer = () => {
      if (joinTimer !== null) {
        clearTimeout(joinTimer)
        joinTimer = null
      }
    }

    const connect = () => {
      if (closed) return
      attempt += 1
      if (attempt > 1) handlers.onReconnecting(attempt - 1)
      if (attempt === 1) {
        joinTimer = setTimeout(() => {
          if (everConnected || closed) return
          const err = new Error(
            'Tempo esgotado tentando entrar na sala. Verifique o código e tente de novo.',
          )
          ;(err as Error & { type?: string }).type = 'negotiation-failed'
          handlers.onError(err)
          closed = true
          try {
            conn?.close()
            peer.destroy()
          } catch {
            // best-effort
          }
        }, JOIN_TIMEOUT_MS)
      }
      conn = peer.connect(adminId, { reliable: true })
      conn.on('open', () => {
        attempt = 0
        everConnected = true
        clearJoinTimer()
        setTimeout(() => handlers.onConnected(), 0)
      })
      conn.on('data', (data) => {
        const parsed = parseHostToGuest(data)
        if (parsed === null) return // discard malformed/unknown wire messages
        handlers.onMessage(parsed)
      })
      conn.on('close', () => {
        handlers.onDisconnected()
        scheduleReconnect()
      })
      conn.on('error', (err) => handlers.onError(asUserFacingError(err)))
    }

    const scheduleReconnect = () => {
      if (closed) return
      const delay = Math.min(1000 * 2 ** Math.max(0, attempt - 1), MAX_BACKOFF_MS)
      backoffTimer = setTimeout(connect, delay)
    }

    peer.on('open', (id) => {
      if (opened) {
        reconnector.reset()
        return
      }
      opened = true
      connect()
      resolve({
        peerId: id,
        send: (msg) => {
          if (conn?.open) conn.send(msg)
        },
        close: () => {
          closed = true
          clearJoinTimer()
          reconnector.cancel()
          if (backoffTimer !== null) clearTimeout(backoffTimer)
          conn?.close()
          peer.destroy()
        },
        isOpen: () => !!conn?.open,
      })
    })

    peer.on('disconnected', () => {
      if (closed) return
      reconnector.tryNow()
    })

    peer.on('error', (err) => {
      if (!opened) {
        closed = true
        clearJoinTimer()
        reject(asUserFacingError(err))
      } else {
        handlers.onError(asUserFacingError(err))
      }
    })
  })
}

function asUserFacingError(err: unknown): Error {
  const classified = classifyPeerError(err)
  if (classified.kind === 'unknown') {
    return err instanceof Error ? err : new Error(String(err))
  }
  const e = new Error(classified.message)
  ;(e as Error & { type?: string }).type = classified.kind
  return e
}

export const peerjsTransport: TransportFactory = {
  createHost,
  createClient,
}
