import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { usePeerClient } from '../../src/hooks/usePeerClient'
import { memoryTransport, resetMemoryTransport } from '../../src/transport/memory-transport'
import type { GuestToHost, HostToGuest } from '../../src/transport/messages'
import { hostPeerId } from '../../src/transport/peer-ids'
import type { HostHandlers, PeerHost } from '../../src/transport/transport'

// usePeerClient is the guest-side hook adapted from paje-scorer with the kick
// branch removed. These cover: it connects + delivers validated HostToGuest
// messages, drops malformed ones, and cleans up the connection on unmount
// (mounted guard => no leaked client, host sees the disconnect).

const ROOM = 'WXYZ'

function noopHost(overrides: Partial<HostHandlers> = {}): HostHandlers {
  return {
    onClientConnect: () => {},
    onClientMessage: () => {},
    onClientDisconnect: () => {},
    onError: () => {},
    ...overrides,
  }
}

afterEach(() => {
  resetMemoryTransport()
})

describe('usePeerClient (guest hook, no kick)', () => {
  it('connects and delivers only valid HostToGuest messages', async () => {
    let host: PeerHost | null = null
    host = await memoryTransport.createHost(hostPeerId(ROOM), noopHost())

    const received: HostToGuest[] = []
    let connectedSend: ((msg: GuestToHost) => void) | null = null

    const { result } = renderHook(() =>
      usePeerClient({
        roomCode: ROOM,
        transport: memoryTransport,
        guestLocalId: 'g1',
        onConnected: (send) => {
          connectedSend = send
        },
        onMessage: (msg) => received.push(msg),
      }),
    )

    await waitFor(() => expect(result.current.state.status).toBe('connected'))
    expect(connectedSend).not.toBeNull()

    const clientId = host.clientIds()[0]
    expect(clientId).toBeDefined()
    if (clientId === undefined) throw new Error('no client connected')

    // Valid message is delivered; a malformed one is dropped at the app edge.
    act(() => {
      host?.send(clientId, { t: 'match_setup', seed: 5, difficulty: 3 })
      host?.send(clientId, { t: 'bogus' } as unknown as HostToGuest)
    })
    await waitFor(() => expect(received.length).toBe(1))
    expect(received[0]).toEqual({ t: 'match_setup', seed: 5, difficulty: 3 })

    host.close()
  })

  it('cleans up on unmount: the host observes the disconnect, no leak', async () => {
    let disconnected = false
    const host = await memoryTransport.createHost(
      hostPeerId(ROOM),
      noopHost({ onClientDisconnect: () => (disconnected = true) }),
    )

    const { result, unmount } = renderHook(() =>
      usePeerClient({
        roomCode: ROOM,
        transport: memoryTransport,
        guestLocalId: 'g1',
        onConnected: () => {},
        onMessage: () => {},
      }),
    )

    await waitFor(() => expect(result.current.state.status).toBe('connected'))
    expect(host.clientIds().length).toBe(1)

    unmount()
    await waitFor(() => expect(disconnected).toBe(true))
    expect(host.clientIds().length).toBe(0)

    host.close()
  })

  it('surfaces a connect error when the room has no host', async () => {
    const { result } = renderHook(() =>
      usePeerClient({
        roomCode: 'ZZZZ',
        transport: memoryTransport,
        guestLocalId: 'g1',
        onConnected: () => {},
        onMessage: () => {},
      }),
    )
    await waitFor(() => expect(result.current.state.status).toBe('error'))
    expect(result.current.state.error).not.toBeNull()
  })
})
