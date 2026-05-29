import type { GuestToHost, HostToGuest } from './messages'
import type {
  ClientHandlers,
  HostHandlers,
  PeerClient,
  PeerHost,
  TransportFactory,
} from './transport'

type ControlFrame =
  | { kind: 'hello'; from: string; to: string }
  | { kind: 'hello_ack'; from: string; to: string }
  | { kind: 'bye'; from: string; to: string }
  | { kind: 'msg_to_host'; from: string; to: string; payload: GuestToHost }
  | { kind: 'msg_to_client'; from: string; to: string; payload: HostToGuest }
  | { kind: 'who_is_host'; hostId: string; from: string }
  | { kind: 'host_alive'; hostId: string }

const CHANNEL_PREFIX = 'zip-room-'

function channelFor(hostId: string) {
  return new BroadcastChannel(CHANNEL_PREFIX + hostId)
}

async function createHost(desiredId: string, handlers: HostHandlers): Promise<PeerHost> {
  const channel = channelFor(desiredId)
  const clients = new Set<string>()
  let alive = true

  channel.addEventListener('message', (ev) => {
    const frame = ev.data as ControlFrame
    if (!alive) return
    if ('hostId' in frame) {
      if (frame.kind === 'who_is_host' && frame.hostId === desiredId) {
        const reply: ControlFrame = { kind: 'host_alive', hostId: desiredId }
        channel.postMessage(reply)
      }
      return
    }
    if (frame.to !== desiredId) return
    switch (frame.kind) {
      case 'hello': {
        clients.add(frame.from)
        const ack: ControlFrame = {
          kind: 'hello_ack',
          from: desiredId,
          to: frame.from,
        }
        channel.postMessage(ack)
        handlers.onClientConnect(frame.from)
        break
      }
      case 'bye': {
        if (clients.delete(frame.from)) handlers.onClientDisconnect(frame.from)
        break
      }
      case 'msg_to_host': {
        handlers.onClientMessage(frame.from, frame.payload)
        break
      }
    }
  })

  const announce: ControlFrame = { kind: 'host_alive', hostId: desiredId }
  channel.postMessage(announce)

  return {
    peerId: desiredId,
    send: (clientId, payload) => {
      if (!alive || !clients.has(clientId)) return
      channel.postMessage({
        kind: 'msg_to_client',
        from: desiredId,
        to: clientId,
        payload,
      } satisfies ControlFrame)
    },
    broadcast: (msgOrFn) => {
      if (!alive) return
      for (const clientId of clients) {
        const payload = typeof msgOrFn === 'function' ? msgOrFn(clientId) : msgOrFn
        if (!payload) continue
        channel.postMessage({
          kind: 'msg_to_client',
          from: desiredId,
          to: clientId,
          payload,
        } satisfies ControlFrame)
      }
    },
    // No kick in ZIP. host.close() does NOT emit 'bye', so guests do not get
    // onDisconnected automatically (see §3.5 disconnect policy).
    close: () => {
      alive = false
      clients.clear()
      channel.close()
    },
    clientIds: () => [...clients],
  }
}

async function createClient(
  desiredId: string,
  adminId: string,
  handlers: ClientHandlers,
): Promise<PeerClient> {
  const channel = channelFor(adminId)
  let connected = false

  const message = (frame: ControlFrame) => channel.postMessage(frame)

  return new Promise((resolve, reject) => {
    const ackTimeout = setTimeout(() => {
      if (!connected) {
        channel.close()
        reject(new Error(`admin "${adminId}" not responding`))
      }
    }, 2000)

    channel.addEventListener('message', (ev) => {
      const frame = ev.data as ControlFrame
      if ('hostId' in frame) {
        if (frame.kind === 'host_alive' && !connected) {
          message({ kind: 'hello', from: desiredId, to: adminId })
        }
        return
      }
      if (frame.to !== desiredId) return
      switch (frame.kind) {
        case 'hello_ack': {
          if (connected) return
          connected = true
          clearTimeout(ackTimeout)
          resolve({
            peerId: desiredId,
            send: (payload) => {
              if (!connected) return
              message({
                kind: 'msg_to_host',
                from: desiredId,
                to: adminId,
                payload,
              })
            },
            close: () => {
              if (!connected) return
              connected = false
              message({ kind: 'bye', from: desiredId, to: adminId })
              channel.close()
              handlers.onDisconnected()
            },
            isOpen: () => connected,
          })
          setTimeout(() => handlers.onConnected(), 0)
          break
        }
        case 'msg_to_client': {
          handlers.onMessage(frame.payload)
          break
        }
      }
    })

    message({ kind: 'who_is_host', hostId: adminId, from: desiredId })
  })
}

export const broadcastTransport: TransportFactory = {
  createHost,
  createClient,
}
