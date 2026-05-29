import { useCallback, useEffect, useReducer, useRef } from 'react'

import type { GuestToHost, HostToGuest } from '../transport/messages'
import { generateGuestLocalId, guestPeerId, hostPeerId } from '../transport/peer-ids'
import type { PeerClient, TransportFactory } from '../transport/transport'
import { validateHostToGuest } from '../transport/validate'

// Guest-side peer hook, adapted from paje-scorer. ZIP has no kick concept, so
// the 'kicked' status and its reducer branch are removed entirely. The inbound
// channel for a guest is HostToGuest; every message is revalidated with
// validateHostToGuest at the app edge (second of the two validation layers)
// before being delivered. Callback refs keep the effect stable; a `mounted`
// guard plus cleanup-on-unmount prevents stray dispatches and connection leaks.

export type PeerClientStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

export type PeerClientState = {
  status: PeerClientStatus
  error: string | null
}

type PeerClientAction =
  | { kind: 'connecting' }
  | { kind: 'connected' }
  | { kind: 'disconnected' }
  | { kind: 'error'; message: string }

function peerClientReducer(state: PeerClientState, action: PeerClientAction): PeerClientState {
  switch (action.kind) {
    case 'connecting':
      return { status: 'connecting', error: state.error }
    case 'connected':
      return { status: 'connected', error: null }
    case 'disconnected':
      if (state.status === 'error') return state
      return { status: 'disconnected', error: state.error }
    case 'error':
      return { status: 'error', error: action.message }
  }
}

type Options = {
  roomCode: string
  transport: TransportFactory
  guestLocalId?: string
  onConnected: (send: (msg: GuestToHost) => void) => void
  onMessage: (msg: HostToGuest) => void
}

export function usePeerClient({
  roomCode,
  transport,
  guestLocalId,
  onConnected,
  onMessage,
}: Options) {
  const [state, dispatch] = useReducer(peerClientReducer, { status: 'connecting', error: null })

  const clientRef = useRef<PeerClient | null>(null)
  const onConnectedRef = useRef(onConnected)
  const onMessageRef = useRef(onMessage)
  onConnectedRef.current = onConnected
  onMessageRef.current = onMessage

  useEffect(() => {
    let mounted = true
    let activeClient: PeerClient | null = null
    const myId = guestPeerId(guestLocalId ?? generateGuestLocalId())
    const adminId = hostPeerId(roomCode)

    transport
      .createClient(myId, adminId, {
        onConnected: () => {
          if (!mounted) return
          dispatch({ kind: 'connected' })
          // The send closure reads activeClient lazily, so it works even if
          // onConnected fires before the createClient promise resolves.
          onConnectedRef.current((msg) => activeClient?.send(msg))
        },
        onMessage: (msg) => {
          if (!mounted) return
          const valid = validateHostToGuest(msg)
          if (!valid) return
          onMessageRef.current(valid)
        },
        onDisconnected: () => {
          if (!mounted) return
          dispatch({ kind: 'disconnected' })
        },
        onReconnecting: () => {
          if (!mounted) return
          dispatch({ kind: 'connecting' })
        },
        onError: (err) => {
          if (!mounted) return
          dispatch({ kind: 'error', message: err.message })
        },
      })
      .then((client) => {
        if (!mounted) {
          client.close()
          return
        }
        activeClient = client
        clientRef.current = client
      })
      .catch((err: Error) => {
        if (!mounted) return
        dispatch({ kind: 'error', message: err.message })
      })

    return () => {
      mounted = false
      activeClient?.close()
      activeClient = null
    }
  }, [roomCode, transport, guestLocalId])

  const send = useCallback((msg: GuestToHost): boolean => {
    const client = clientRef.current
    if (!client) return false
    client.send(msg)
    return true
  }, [])

  return { state, send }
}
