import { useCallback, useEffect, useReducer, useRef } from 'react'

import type { GuestToHost, HostToGuest } from '../transport/messages'
import { hostPeerId } from '../transport/peer-ids'
import type { PeerHost, TransportFactory } from '../transport/transport'
import { validateGuestToHost } from '../transport/validate'

// Host-side peer hook, the mirror of usePeerClient. The host opens a room at
// hostPeerId(roomCode) and is authoritative for the 1v1 race. Its inbound
// channel is GuestToHost; every message is revalidated with validateGuestToHost
// at the app edge before delivery. Same shape as the client hook: callback refs
// keep the effect stable, a `mounted` guard blocks stray dispatches, and the
// host is closed on unmount so no room leaks.

export type PeerHostStatus = 'connecting' | 'connected' | 'error'

export type PeerHostState = {
  status: PeerHostStatus
  error: string | null
}

type PeerHostAction =
  | { kind: 'open' }
  | { kind: 'guest_joined' }
  | { kind: 'error'; message: string }

function peerHostReducer(state: PeerHostState, action: PeerHostAction): PeerHostState {
  switch (action.kind) {
    case 'open':
      return { status: 'connecting', error: state.error }
    case 'guest_joined':
      return { status: 'connected', error: null }
    case 'error':
      return { status: 'error', error: action.message }
  }
}

type Options = {
  roomCode: string
  transport: TransportFactory
  onGuestConnect: (clientId: string, send: (msg: HostToGuest) => void) => void
  onMessage: (clientId: string, msg: GuestToHost) => void
  onGuestDisconnect: (clientId: string) => void
}

export function usePeerHost({
  roomCode,
  transport,
  onGuestConnect,
  onMessage,
  onGuestDisconnect,
}: Options) {
  const [state, dispatch] = useReducer(peerHostReducer, { status: 'connecting', error: null })

  const hostRef = useRef<PeerHost | null>(null)
  const onGuestConnectRef = useRef(onGuestConnect)
  const onMessageRef = useRef(onMessage)
  const onGuestDisconnectRef = useRef(onGuestDisconnect)
  onGuestConnectRef.current = onGuestConnect
  onMessageRef.current = onMessage
  onGuestDisconnectRef.current = onGuestDisconnect

  useEffect(() => {
    let mounted = true
    let activeHost: PeerHost | null = null
    const myId = hostPeerId(roomCode)

    transport
      .createHost(myId, {
        onClientConnect: (clientId) => {
          if (!mounted) return
          dispatch({ kind: 'guest_joined' })
          if (activeHost)
            onGuestConnectRef.current(clientId, (msg) => activeHost?.send(clientId, msg))
        },
        onClientMessage: (clientId, msg) => {
          if (!mounted) return
          const valid = validateGuestToHost(msg)
          if (!valid) return
          onMessageRef.current(clientId, valid)
        },
        onClientDisconnect: (clientId) => {
          if (!mounted) return
          onGuestDisconnectRef.current(clientId)
        },
        onError: (err) => {
          if (!mounted) return
          dispatch({ kind: 'error', message: err.message })
        },
      })
      .then((host) => {
        if (!mounted) {
          host.close()
          return
        }
        activeHost = host
        hostRef.current = host
        dispatch({ kind: 'open' })
      })
      .catch((err: Error) => {
        if (!mounted) return
        dispatch({ kind: 'error', message: err.message })
      })

    return () => {
      mounted = false
      activeHost?.close()
      activeHost = null
    }
  }, [roomCode, transport])

  const send = useCallback((clientId: string, msg: HostToGuest): boolean => {
    const host = hostRef.current
    if (!host) return false
    host.send(clientId, msg)
    return true
  }, [])

  return { state, send }
}
