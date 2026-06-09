import { afterEach, describe, expect, it } from 'vitest'
import { canonicalPuzzle, generatePuzzleWith } from '../../src/game/generate'
import { broadcastTransport } from '../../src/transport/broadcast-transport'
import { memoryTransport, resetMemoryTransport } from '../../src/transport/memory-transport'
import type { GuestToHost, HostToGuest } from '../../src/transport/messages'
import { parseGuestToHost } from '../../src/transport/parse-messages'
import type { ClientHandlers, HostHandlers, TransportFactory } from '../../src/transport/transport'

const HOST_ID = 'zip-host-WXYZ'
const GUEST_ID = 'zip-guest-abc123'

function noopHost(): HostHandlers {
  return {
    onClientConnect: () => {},
    onClientMessage: () => {},
    onClientDisconnect: () => {},
    onError: () => {},
  }
}

function noopClient(): ClientHandlers {
  return {
    onConnected: () => {},
    onMessage: () => {},
    onDisconnected: () => {},
    onReconnecting: () => {},
    onError: () => {},
  }
}

afterEach(() => {
  resetMemoryTransport()
})

/**
 * AC20: only `{seed, difficulty}` cross the wire. Both sides call
 * generatePuzzleWith(seed, difficulty) and must produce the identical canonical
 * puzzle — proving same-seed → same puzzle across the transport.
 */
function sameWirePuzzleTest(factory: TransportFactory, label: string) {
  it(`${label}: host announces seed+difficulty, both regenerate the identical puzzle`, async () => {
    // Use an object with a mutable field so TypeScript can narrow through
    // the closure assignment without losing type information.
    const state: { received: { seed: number; difficulty: number } | null } = { received: null }

    const guestHandlers: ClientHandlers = {
      ...noopClient(),
      onMessage: (msg: HostToGuest) => {
        if (msg.t === 'match_setup') state.received = { seed: msg.seed, difficulty: msg.difficulty }
      },
    }

    const host = await factory.createHost(HOST_ID, noopHost())
    const guest = await factory.createClient(GUEST_ID, HOST_ID, guestHandlers)

    // Let the connection handshake settle (queueMicrotask / setTimeout(0)).
    await new Promise((r) => setTimeout(r, 20))

    const hostSeed = 137
    const hostDifficulty = 12
    host.broadcast({ t: 'match_setup', seed: hostSeed, difficulty: hostDifficulty, bestOf: 3 })

    await new Promise((r) => setTimeout(r, 20))

    expect(state.received).toEqual({ seed: hostSeed, difficulty: hostDifficulty })
    // state.received is an object property — TS can narrow it after a null check.
    const r = state.received
    if (r === null) throw new Error('guest never got match_setup')
    const receivedSeed = r.seed
    const receivedDifficulty = r.difficulty

    const hostPuzzle = generatePuzzleWith(hostSeed, hostDifficulty)
    const guestPuzzle = generatePuzzleWith(receivedSeed, receivedDifficulty)

    expect(canonicalPuzzle(guestPuzzle)).toEqual(canonicalPuzzle(hostPuzzle))

    guest.close()
    host.close()
  })
}

describe('AC20: same seed+difficulty across the wire -> identical canonical puzzle', () => {
  sameWirePuzzleTest(memoryTransport, 'memoryTransport')
  sameWirePuzzleTest(broadcastTransport, 'broadcastTransport')
})

describe('memory-transport round-trip', () => {
  it('guest sends GuestToHost, host receives parsed; host broadcasts HostToGuest, guest receives', async () => {
    const hostInbox: GuestToHost[] = []
    const guestInbox: HostToGuest[] = []

    const hostHandlers: HostHandlers = {
      ...noopHost(),
      onClientMessage: (_clientId, msg) => {
        hostInbox.push(msg)
      },
    }
    const guestHandlers: ClientHandlers = {
      ...noopClient(),
      onMessage: (msg) => {
        guestInbox.push(msg)
      },
    }

    const host = await memoryTransport.createHost(HOST_ID, hostHandlers)
    const guest = await memoryTransport.createClient(GUEST_ID, HOST_ID, guestHandlers)

    await new Promise((r) => setTimeout(r, 20))

    // client -> host
    const sent: GuestToHost = { t: 'progress', filled: 4, total: 16 }
    guest.send(sent)
    await new Promise((r) => setTimeout(r, 0))
    expect(hostInbox).toEqual([sent])
    // re-validate at the transport edge as the app would
    expect(parseGuestToHost(hostInbox[0])).toEqual(sent)

    // host -> client
    const reply: HostToGuest = {
      t: 'standings',
      players: [
        { id: 'host', seat: 1, filled: 4, total: 16, timeMs: null, finished: false, wins: 0 },
      ],
    }
    host.broadcast(reply)
    await new Promise((r) => setTimeout(r, 0))
    expect(guestInbox).toEqual([reply])

    guest.close()
    host.close()
  })
})
