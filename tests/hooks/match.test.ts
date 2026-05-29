import { afterEach, describe, expect, it } from 'vitest'
import {
  createGuestMatch,
  createHostMatch,
  type GuestEvents,
  type HostEvents,
  type MatchResult,
  type MatchSetup,
  resolveOutcome,
} from '../../src/hooks/matchController'
import { memoryTransport, resetMemoryTransport } from '../../src/transport/memory-transport'
import type { GuestToHost, HostToGuest } from '../../src/transport/messages'
import type {
  ClientHandlers,
  HostHandlers,
  PeerClient,
  PeerHost,
  TransportFactory,
} from '../../src/transport/transport'

// AC22b (tiebreak) and AC22c (disconnect terminal state) for the 1v1 race.
// These run against memoryTransport — whose close() fires onClientDisconnect on
// the host AND onDisconnected on the client, bidirectionally — so the disconnect
// policy is fully observable without real timers or broadcast quirks.

const ROOM = 'WXYZ'
const SETUP: MatchSetup = { seed: 42, difficulty: 12 }

// A minimal in-test transport that mirrors the REAL peerjs/broadcast tab-close
// semantics for the host-leaving direction: host.close() notifies every
// connected client's onDisconnected. memoryTransport intentionally does NOT do
// this (its host.close() is silent to clients — see §3.5), and it is shipped
// code we must not edit, so this stub models the surviving-guest path the e2e
// covers with a real tab close.
function notifyingTransport(): TransportFactory {
  type Conn = { client: ClientHandlers; host: HostHandlers; id: string; closed: boolean }
  const rooms = new Map<string, { host: HostHandlers; conns: Map<string, Conn> }>()
  return {
    createHost: async (id: string, host: HostHandlers): Promise<PeerHost> => {
      const room = { host, conns: new Map<string, Conn>() }
      rooms.set(id, room)
      return {
        peerId: id,
        send: (clientId: string, msg: HostToGuest) =>
          room.conns.get(clientId)?.client.onMessage(msg),
        broadcast: (m) => {
          for (const [cid, c] of room.conns) {
            const msg = typeof m === 'function' ? m(cid) : m
            if (msg) c.client.onMessage(msg)
          }
        },
        close: () => {
          for (const c of room.conns.values()) {
            if (!c.closed) {
              c.closed = true
              c.client.onDisconnected()
            }
          }
          room.conns.clear()
          rooms.delete(id)
        },
        clientIds: () => [...room.conns.keys()],
      }
    },
    createClient: async (
      id: string,
      adminId: string,
      client: ClientHandlers,
    ): Promise<PeerClient> => {
      const room = rooms.get(adminId)
      if (!room) throw new Error(`no host ${adminId}`)
      const conn: Conn = { client, host: room.host, id, closed: false }
      room.conns.set(id, conn)
      queueMicrotask(() => {
        room.host.onClientConnect(id)
        client.onConnected()
      })
      return {
        peerId: id,
        send: (msg: GuestToHost) => {
          if (!conn.closed) room.host.onClientMessage(id, msg)
        },
        close: () => {
          if (conn.closed) return
          conn.closed = true
          room.conns.delete(id)
          room.host.onClientDisconnect(id)
          client.onDisconnected()
        },
        isOpen: () => !conn.closed,
      }
    },
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0))
const settle = () => new Promise((r) => setTimeout(r, 20))

function hostEvents(into: {
  results: MatchResult[]
  setups: MatchSetup[]
  rematches: MatchSetup[]
  opp: number[]
}): HostEvents {
  return {
    onGuestConnect: () => {},
    onSetup: (s) => into.setups.push(s),
    onOppProgress: (filled) => into.opp.push(filled),
    onResult: (r) => into.results.push(r),
    onRematchSetup: (s) => into.rematches.push(s),
    onError: () => {},
  }
}

function guestEvents(into: {
  results: MatchResult[]
  setups: MatchSetup[]
  rematches: MatchSetup[]
  opp: number[]
}): GuestEvents {
  return {
    onConnected: () => {},
    onSetup: (s) => into.setups.push(s),
    onOppProgress: (filled) => into.opp.push(filled),
    onResult: (r) => into.results.push(r),
    onRematchSetup: (s) => into.rematches.push(s),
    onError: () => {},
  }
}

afterEach(() => {
  resetMemoryTransport()
})

describe('resolveOutcome (pure tiebreak rule)', () => {
  it('lower timeMs wins', () => {
    expect(resolveOutcome(1000, 2000).outcome).toBe('host')
    expect(resolveOutcome(2000, 1000).outcome).toBe('guest')
  })

  it('AC22b: exact tie resolves host-wins (deterministic), never draw', () => {
    const r = resolveOutcome(1500, 1500)
    expect(r.outcome).toBe('host')
    expect(r.reason).toBe('solved')
    expect(r.times).toEqual({ host: 1500, guest: 1500 })
  })
})

describe('AC22b: identical solved times across the wire -> host wins', () => {
  it('host and guest both solve at the same timeMs => result.outcome === host on both sides', async () => {
    const hostInto = {
      results: [] as MatchResult[],
      setups: [] as MatchSetup[],
      rematches: [] as MatchSetup[],
      opp: [] as number[],
    }
    const guestInto = {
      results: [] as MatchResult[],
      setups: [] as MatchSetup[],
      rematches: [] as MatchSetup[],
      opp: [] as number[],
    }

    const host = await createHostMatch(memoryTransport, ROOM, SETUP, hostEvents(hostInto))
    const guest = await createGuestMatch(memoryTransport, ROOM, guestEvents(guestInto), 'g1')

    await settle()

    // Guest received match_setup with the correct seed+difficulty.
    expect(guestInto.setups).toHaveLength(1)
    expect(guestInto.setups[0]).toEqual(SETUP)

    // Both finish in the same task batch with identical times. The host's
    // one-microtask resolution defer lets both `solved` register before the
    // decision, so the host-wins tiebreak applies (rather than whoever's
    // message happened to land first).
    const SAME = 1234
    guest.reportSolved(SAME)
    host.reportSolved(SAME)
    await tick()

    // Host authority resolved the tie; both sides see host as the winner.
    expect(hostInto.results.at(-1)?.outcome).toBe('host')
    expect(guestInto.results.at(-1)?.outcome).toBe('host')
    expect(hostInto.results.at(-1)?.times).toEqual({ host: SAME, guest: SAME })

    guest.close()
    host.close()
  })
})

describe('AC22: a normal race -> first solver wins, loser receives result', () => {
  it('guest solves faster than host => guest wins, both notified', async () => {
    const hostInto = {
      results: [] as MatchResult[],
      setups: [] as MatchSetup[],
      rematches: [] as MatchSetup[],
      opp: [] as number[],
    }
    const guestInto = {
      results: [] as MatchResult[],
      setups: [] as MatchSetup[],
      rematches: [] as MatchSetup[],
      opp: [] as number[],
    }

    const host = await createHostMatch(
      memoryTransport,
      ROOM,
      { seed: 7, difficulty: 7 },
      hostEvents(hostInto),
    )
    const guest = await createGuestMatch(memoryTransport, ROOM, guestEvents(guestInto), 'g1')
    await settle()

    // Both report in the same batch; the lower timeMs (guest) wins.
    guest.reportSolved(900)
    host.reportSolved(1500)
    await tick()

    expect(hostInto.results.at(-1)?.outcome).toBe('guest')
    expect(guestInto.results.at(-1)?.outcome).toBe('guest')
    expect(hostInto.results.at(-1)?.times).toEqual({ host: 1500, guest: 900 })

    guest.close()
    host.close()
  })

  it('only the host solves => host wins outright, guest time null (lone-solver race end)', async () => {
    const hostInto = {
      results: [] as MatchResult[],
      setups: [] as MatchSetup[],
      rematches: [] as MatchSetup[],
      opp: [] as number[],
    }
    const guestInto = {
      results: [] as MatchResult[],
      setups: [] as MatchSetup[],
      rematches: [] as MatchSetup[],
      opp: [] as number[],
    }

    const host = await createHostMatch(
      memoryTransport,
      ROOM,
      { seed: 1, difficulty: 1 },
      hostEvents(hostInto),
    )
    const guest = await createGuestMatch(memoryTransport, ROOM, guestEvents(guestInto), 'g1')
    await settle()

    host.reportSolved(1200)
    await tick()

    expect(hostInto.results.at(-1)?.outcome).toBe('host')
    expect(guestInto.results.at(-1)?.outcome).toBe('host')
    expect(hostInto.results.at(-1)?.times).toEqual({ host: 1200, guest: null })

    guest.close()
    host.close()
  })
})

describe('AC22c: disconnect -> defined terminal state (memoryTransport)', () => {
  it('guest leaves mid-race => host reaches result{outcome:host, reason:opponent_left}', async () => {
    const hostInto = {
      results: [] as MatchResult[],
      setups: [] as MatchSetup[],
      rematches: [] as MatchSetup[],
      opp: [] as number[],
    }
    const guestInto = {
      results: [] as MatchResult[],
      setups: [] as MatchSetup[],
      rematches: [] as MatchSetup[],
      opp: [] as number[],
    }

    const host = await createHostMatch(
      memoryTransport,
      ROOM,
      { seed: 3, difficulty: 3 },
      hostEvents(hostInto),
    )
    const guest = await createGuestMatch(memoryTransport, ROOM, guestEvents(guestInto), 'g1')
    await settle()

    // Guest bails mid-race; memoryTransport.close() fires onClientDisconnect on
    // the host side.
    guest.close()
    await tick()

    const terminal = hostInto.results.at(-1)
    expect(terminal?.outcome).toBe('host')
    expect(terminal?.reason).toBe('opponent_left')
    expect(terminal?.times).toEqual({ host: null, guest: null })

    host.close()
  })

  it('host leaves mid-race => guest reaches result{outcome:abandoned, reason:opponent_left}', async () => {
    const hostInto = {
      results: [] as MatchResult[],
      setups: [] as MatchSetup[],
      rematches: [] as MatchSetup[],
      opp: [] as number[],
    }
    const guestInto = {
      results: [] as MatchResult[],
      setups: [] as MatchSetup[],
      rematches: [] as MatchSetup[],
      opp: [] as number[],
    }

    const transport = notifyingTransport()
    const host = await createHostMatch(
      transport,
      ROOM,
      { seed: 3, difficulty: 3 },
      hostEvents(hostInto),
    )
    const guest = await createGuestMatch(transport, ROOM, guestEvents(guestInto), 'g1')
    await settle()

    // Host bails; the surviving guest gets onDisconnected. The guest has no
    // authority to declare a winner, so it reaches a local 'abandoned' result.
    host.close()
    await tick()

    const terminal = guestInto.results.at(-1)
    expect(terminal?.outcome).toBe('abandoned')
    expect(terminal?.reason).toBe('opponent_left')

    guest.close()
  })

  it('neither side hangs: a guest disconnect yields a result, not silence', async () => {
    const hostInto = {
      results: [] as MatchResult[],
      setups: [] as MatchSetup[],
      rematches: [] as MatchSetup[],
      opp: [] as number[],
    }
    const guestInto = {
      results: [] as MatchResult[],
      setups: [] as MatchSetup[],
      rematches: [] as MatchSetup[],
      opp: [] as number[],
    }

    const host = await createHostMatch(
      memoryTransport,
      ROOM,
      { seed: 9, difficulty: 9 },
      hostEvents(hostInto),
    )
    const guest = await createGuestMatch(memoryTransport, ROOM, guestEvents(guestInto), 'g1')
    await settle()

    guest.close()
    await tick()

    expect(hostInto.results.length).toBeGreaterThan(0)
    host.close()
  })
})

describe('AC21 (through the controller): progress is throttled with an injected clock', () => {
  it('many reportProgress calls under one window send at most one opp_progress', async () => {
    const hostInto = {
      results: [] as MatchResult[],
      setups: [] as MatchSetup[],
      rematches: [] as MatchSetup[],
      opp: [] as number[],
    }
    const guestInto = {
      results: [] as MatchResult[],
      setups: [] as MatchSetup[],
      rematches: [] as MatchSetup[],
      opp: [] as number[],
    }

    let clock = 1000
    const host = await createHostMatch(
      memoryTransport,
      ROOM,
      { seed: 1, difficulty: 1 },
      hostEvents(hostInto),
    )
    const guest = await createGuestMatch(
      memoryTransport,
      ROOM,
      guestEvents(guestInto),
      'g1',
      () => clock,
    )
    await settle()

    // Burst of guest progress within a single 250ms window.
    for (let i = 1; i <= 16; i++) {
      clock += 5 // 16 * 5 = 80ms, all under one window
      guest.reportProgress(i, 16)
    }
    await tick()
    // Host saw exactly one opp_progress.
    expect(hostInto.opp.length).toBe(1)

    // Cross a window boundary -> one more passes.
    clock += 250
    guest.reportProgress(16, 16)
    await tick()
    expect(hostInto.opp.length).toBe(2)

    guest.close()
    host.close()
  })
})

describe('rematch: same room, fresh seed, same difficulty', () => {
  it('host startRematch: guest receives rematch_setup with new seed, same difficulty', async () => {
    const hostInto = {
      results: [] as MatchResult[],
      setups: [] as MatchSetup[],
      rematches: [] as MatchSetup[],
      opp: [] as number[],
    }
    const guestInto = {
      results: [] as MatchResult[],
      setups: [] as MatchSetup[],
      rematches: [] as MatchSetup[],
      opp: [] as number[],
    }

    const initialSetup: MatchSetup = { seed: 100, difficulty: 30 }
    const host = await createHostMatch(memoryTransport, ROOM, initialSetup, hostEvents(hostInto))
    const guest = await createGuestMatch(memoryTransport, ROOM, guestEvents(guestInto), 'g1')
    await settle()

    // Finish the first round.
    host.reportSolved(1000)
    await tick()
    expect(hostInto.results.length).toBeGreaterThan(0)

    // Host triggers rematch with a new seed.
    const newSeed = 9999
    host.startRematch(newSeed)
    await tick()

    // Host side: onRematchSetup fired with new seed, same difficulty.
    expect(hostInto.rematches).toHaveLength(1)
    expect(hostInto.rematches[0]).toEqual({ seed: newSeed, difficulty: 30 })

    // Guest side: onRematchSetup fired too.
    expect(guestInto.rematches).toHaveLength(1)
    expect(guestInto.rematches[0]).toEqual({ seed: newSeed, difficulty: 30 })

    guest.close()
    host.close()
  })

  it('guest requestRematch: host responds with rematch_setup (new seed, same difficulty)', async () => {
    const hostInto = {
      results: [] as MatchResult[],
      setups: [] as MatchSetup[],
      rematches: [] as MatchSetup[],
      opp: [] as number[],
    }
    const guestInto = {
      results: [] as MatchResult[],
      setups: [] as MatchSetup[],
      rematches: [] as MatchSetup[],
      opp: [] as number[],
    }

    const initialSetup: MatchSetup = { seed: 200, difficulty: 12 }
    const host = await createHostMatch(memoryTransport, ROOM, initialSetup, hostEvents(hostInto))
    const guest = await createGuestMatch(memoryTransport, ROOM, guestEvents(guestInto), 'g1')
    await settle()

    // Finish the first round.
    guest.reportSolved(800)
    host.reportSolved(1200)
    await tick()

    // Guest requests a rematch; host generates a new seed autonomously.
    guest.requestRematch()
    await tick()

    // Both sides receive onRematchSetup with the same difficulty and a new seed.
    expect(hostInto.rematches).toHaveLength(1)
    expect(guestInto.rematches).toHaveLength(1)
    const hostRematch = hostInto.rematches[0]
    const guestRematch = guestInto.rematches[0]
    expect(hostRematch).toBeDefined()
    expect(guestRematch).toBeDefined()
    if (hostRematch !== undefined && guestRematch !== undefined) {
      expect(hostRematch.difficulty).toBe(12)
      expect(guestRematch.difficulty).toBe(12)
      expect(hostRematch.seed).toBe(guestRematch.seed)
      // New seed must differ from the initial seed (extremely unlikely to collide).
      expect(hostRematch.seed).not.toBe(200)
    }

    guest.close()
    host.close()
  })
})
