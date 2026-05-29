import { afterEach, describe, expect, it } from 'vitest'
import { canonicalPuzzle, generatePuzzle } from '../../src/game/generate'
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
 * AC20: only `gameNumber` crosses the wire. Both sides call
 * generatePuzzle(gameNumber) and must produce the identical canonical puzzle —
 * proving same-seed → same puzzle across the transport.
 */
function sameWirePuzzleTest(factory: TransportFactory, label: string) {
  it(`${label}: host announces gameNumber, both regenerate the identical puzzle`, async () => {
    let guestReceivedGameNumber: number | null = null

    const guestHandlers: ClientHandlers = {
      ...noopClient(),
      onMessage: (msg: HostToGuest) => {
        if (msg.t === 'match_setup') guestReceivedGameNumber = msg.gameNumber
      },
    }

    const host = await factory.createHost(HOST_ID, noopHost())
    const guest = await factory.createClient(GUEST_ID, HOST_ID, guestHandlers)

    // Let the connection handshake settle (queueMicrotask / setTimeout(0)).
    await new Promise((r) => setTimeout(r, 20))

    const hostChosenGameNumber = 137
    host.broadcast({ t: 'match_setup', gameNumber: hostChosenGameNumber })

    await new Promise((r) => setTimeout(r, 20))

    expect(guestReceivedGameNumber).toBe(hostChosenGameNumber)
    if (guestReceivedGameNumber === null) throw new Error('guest never got match_setup')

    const hostPuzzle = generatePuzzle(hostChosenGameNumber)
    const guestPuzzle = generatePuzzle(guestReceivedGameNumber)

    expect(canonicalPuzzle(guestPuzzle)).toEqual(canonicalPuzzle(hostPuzzle))

    guest.close()
    host.close()
  })
}

describe('AC20: same gameNumber across the wire -> identical canonical puzzle', () => {
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
    const reply: HostToGuest = { t: 'opp_progress', filled: 4, total: 16 }
    host.broadcast(reply)
    await new Promise((r) => setTimeout(r, 0))
    expect(guestInbox).toEqual([reply])

    guest.close()
    host.close()
  })
})
