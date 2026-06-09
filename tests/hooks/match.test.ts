import { afterEach, describe, expect, it } from 'vitest'
import {
  createGuestMatch,
  createHostMatch,
  type GuestEvents,
  HOST_ID,
  type HostEvents,
  type MatchResultData,
  type MatchSetup,
  rankStandings,
  seriesTarget,
} from '../../src/hooks/matchController'
import { memoryTransport, resetMemoryTransport } from '../../src/transport/memory-transport'
import type { GuestToHost, HostToGuest, LobbyPlayer, Standing } from '../../src/transport/messages'
import type {
  ClientHandlers,
  HostHandlers,
  PeerClient,
  PeerHost,
  TransportFactory,
} from '../../src/transport/transport'

// N-player race over memoryTransport: lobby + ready-up, host-authoritative
// start, first-solver-wins, full standings, and the all-must-opt-in rematch
// (the v1 single-click-restart bug is locked out by a regression test). The
// host-leaving path uses a notifying transport that mirrors the real
// peerjs/broadcast tab-close semantics, since memoryTransport's host.close() is
// silent to clients by design.

const ROOM = 'WXYZ'
// Default fixture uses the endless (∞) format so the existing rematch/scoreboard
// tests keep their original semantics; series-specific tests set bestOf locally.
const SETUP: MatchSetup = { seed: 42, difficulty: 12, bestOf: null }

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

type HostInto = {
  lobbies: LobbyPlayer[][]
  setups: MatchSetup[]
  standings: Standing[][]
  results: MatchResultData[]
  waits: Array<{ readyCount: number; total: number }>
}
type GuestInto = HostInto & { welcome: string[] }

function newHostInto(): HostInto {
  return { lobbies: [], setups: [], standings: [], results: [], waits: [] }
}
function newGuestInto(): GuestInto {
  return { lobbies: [], setups: [], standings: [], results: [], waits: [], welcome: [] }
}

function hostEvents(into: HostInto): HostEvents {
  return {
    onLobby: (players) => into.lobbies.push(players),
    onSetup: (s) => into.setups.push(s),
    onStandings: (s) => into.standings.push(s),
    onResult: (r) => into.results.push(r),
    onRematchWaiting: (readyCount, total) => into.waits.push({ readyCount, total }),
    onError: () => {},
  }
}

function guestEvents(into: GuestInto): GuestEvents {
  return {
    onConnected: () => {},
    onWelcome: (you) => into.welcome.push(you),
    onLobby: (players) => into.lobbies.push(players),
    onSetup: (s) => into.setups.push(s),
    onStandings: (s) => into.standings.push(s),
    onResult: (r) => into.results.push(r),
    onRematchWaiting: (readyCount, total) => into.waits.push({ readyCount, total }),
    onError: () => {},
  }
}

afterEach(() => {
  resetMemoryTransport()
})

describe('rankStandings (pure ranking rule)', () => {
  it('finishers first by ascending time (exact tie -> lower seat), then unfinished by filled desc', () => {
    const ranked = rankStandings([
      {
        id: 'c',
        seat: 3,
        ready: true,
        filled: 5,
        total: 16,
        timeMs: null,
        finished: false,
        rematchReady: false,
        wins: 0,
      },
      {
        id: 'a',
        seat: 1,
        ready: true,
        filled: 16,
        total: 16,
        timeMs: 1500,
        finished: true,
        rematchReady: false,
        wins: 0,
      },
      {
        id: 'b',
        seat: 2,
        ready: true,
        filled: 16,
        total: 16,
        timeMs: 1500,
        finished: true,
        rematchReady: false,
        wins: 0,
      },
      {
        id: 'd',
        seat: 4,
        ready: true,
        filled: 9,
        total: 16,
        timeMs: null,
        finished: false,
        rematchReady: false,
        wins: 0,
      },
    ])
    // a and b both finished at 1500 -> a wins by lower seat. Then unfinished by filled: d(9) before c(5).
    expect(ranked.map((s) => s.id)).toEqual(['a', 'b', 'd', 'c'])
  })
})

describe('lobby + ready-up', () => {
  it('a guest connects -> seat assigned, both sides see the roster; ready toggles broadcast', async () => {
    const hostInto = newHostInto()
    const guestInto = newGuestInto()
    const host = await createHostMatch(memoryTransport, ROOM, SETUP, hostEvents(hostInto))
    const guest = await createGuestMatch(memoryTransport, ROOM, guestEvents(guestInto), 'g1')
    await settle()

    // Guest learned its own id and saw the 2-seat roster.
    expect(guestInto.welcome).toEqual(['zip-guest-g1'])
    const hostRoster = hostInto.lobbies.at(-1)
    expect(hostRoster).toBeDefined()
    expect(hostRoster?.map((p) => ({ seat: p.seat, ready: p.ready }))).toEqual([
      { seat: 1, ready: true }, // host always ready
      { seat: 2, ready: false }, // guest not ready yet
    ])

    // Guest marks ready -> host roster reflects it.
    guest.setReady(true)
    await tick()
    expect(hostInto.lobbies.at(-1)?.every((p) => p.ready)).toBe(true)

    guest.close()
    host.close()
  })

  it('AC3: host start is a no-op until a guest is connected AND ready', async () => {
    const hostInto = newHostInto()
    const guestInto = newGuestInto()
    const host = await createHostMatch(memoryTransport, ROOM, SETUP, hostEvents(hostInto))
    const guest = await createGuestMatch(memoryTransport, ROOM, guestEvents(guestInto), 'g1')
    await settle()

    // Guest present but NOT ready -> start does nothing.
    host.start()
    await tick()
    expect(hostInto.setups).toHaveLength(0)

    // Guest ready -> start launches the race for everyone.
    guest.setReady(true)
    await tick()
    host.start()
    await tick()
    expect(hostInto.setups).toEqual([SETUP])
    expect(guestInto.setups).toEqual([SETUP])

    guest.close()
    host.close()
  })
})

describe('N-player race: first solver wins, everyone gets the standings', () => {
  it('two guests + host; the fastest finisher wins and the result reaches all', async () => {
    const hostInto = newHostInto()
    const g1Into = newGuestInto()
    const g2Into = newGuestInto()
    const host = await createHostMatch(memoryTransport, ROOM, SETUP, hostEvents(hostInto))
    const g1 = await createGuestMatch(memoryTransport, ROOM, guestEvents(g1Into), 'g1')
    const g2 = await createGuestMatch(memoryTransport, ROOM, guestEvents(g2Into), 'g2')
    await settle()

    g1.setReady(true)
    g2.setReady(true)
    await tick()
    host.start()
    await tick()

    // g1 finishes first.
    g1.reportSolved(800)
    host.reportSolved(1200)
    await tick()

    const result = hostInto.results.at(-1)
    expect(result).toBeDefined()
    expect(result?.reason).toBe('solved')
    expect(result?.winnerId).toBe('zip-guest-g1')
    // Standings: winner first, then the host (finished later), then g2 (unfinished).
    expect(result?.standings[0]?.id).toBe('zip-guest-g1')
    // Every party received the result.
    expect(g1Into.results.at(-1)?.winnerId).toBe('zip-guest-g1')
    expect(g2Into.results.at(-1)?.winnerId).toBe('zip-guest-g1')

    g1.close()
    g2.close()
    host.close()
  })

  it('lone finisher wins outright (others never solved)', async () => {
    const hostInto = newHostInto()
    const guestInto = newGuestInto()
    const host = await createHostMatch(memoryTransport, ROOM, SETUP, hostEvents(hostInto))
    const guest = await createGuestMatch(memoryTransport, ROOM, guestEvents(guestInto), 'g1')
    await settle()
    guest.setReady(true)
    await tick()
    host.start()
    await tick()

    host.reportSolved(1000)
    await tick()

    expect(hostInto.results.at(-1)?.winnerId).toBe(HOST_ID)
    expect(guestInto.results.at(-1)?.winnerId).toBe(HOST_ID)

    guest.close()
    host.close()
  })
})

describe('AC8-AC10: rematch requires ALL players to opt in', () => {
  it('one vote does NOT restart; the last vote restarts with a fresh seed', async () => {
    const hostInto = newHostInto()
    const guestInto = newGuestInto()
    let nextSeed = 5000
    const host = await createHostMatch(
      memoryTransport,
      ROOM,
      SETUP,
      hostEvents(hostInto),
      () => performance.now(),
      () => ++nextSeed,
    )
    const guest = await createGuestMatch(memoryTransport, ROOM, guestEvents(guestInto), 'g1')
    await settle()
    guest.setReady(true)
    await tick()
    host.start()
    await tick()
    host.reportSolved(1000)
    await tick()
    expect(hostInto.setups).toHaveLength(1) // only the initial race so far

    // Host votes alone -> NO restart (regression for the v1 single-click bug).
    host.voteRematch()
    await tick()
    expect(hostInto.setups).toHaveLength(1)
    expect(hostInto.waits.at(-1)).toEqual({ readyCount: 1, total: 2 })

    // Guest votes -> everyone in -> fresh race with a new seed.
    guest.voteRematch()
    await tick()
    expect(hostInto.setups).toHaveLength(2)
    const second = hostInto.setups.at(-1)
    expect(second?.difficulty).toBe(12)
    expect(second?.seed).toBe(5001)
    expect(second?.seed).not.toBe(SETUP.seed)
    expect(guestInto.setups.at(-1)?.seed).toBe(5001)

    guest.close()
    host.close()
  })

  it('a guest leaving during results can complete the rematch vote for the rest', async () => {
    const hostInto = newHostInto()
    const g1Into = newGuestInto()
    const g2Into = newGuestInto()
    let nextSeed = 7000
    const host = await createHostMatch(
      memoryTransport,
      ROOM,
      SETUP,
      hostEvents(hostInto),
      () => performance.now(),
      () => ++nextSeed,
    )
    const g1 = await createGuestMatch(memoryTransport, ROOM, guestEvents(g1Into), 'g1')
    const g2 = await createGuestMatch(memoryTransport, ROOM, guestEvents(g2Into), 'g2')
    await settle()
    g1.setReady(true)
    g2.setReady(true)
    await tick()
    host.start()
    await tick()
    host.reportSolved(1000)
    await tick()

    // Host + g1 vote; g2 has not. No restart yet (3 players, 2 votes).
    host.voteRematch()
    g1.voteRematch()
    await tick()
    expect(hostInto.setups).toHaveLength(1)

    // g2 leaves -> remaining (host + g1) have both voted -> restart.
    g2.close()
    await tick()
    expect(hostInto.setups).toHaveLength(2)

    g1.close()
    host.close()
  })
})

describe('round-end scoreboard: cumulative wins across rematches', () => {
  it('the winner of each round accrues wins that persist into the next round', async () => {
    const hostInto = newHostInto()
    const guestInto = newGuestInto()
    let nextSeed = 3000
    const host = await createHostMatch(
      memoryTransport,
      ROOM,
      SETUP,
      hostEvents(hostInto),
      () => performance.now(),
      () => ++nextSeed,
    )
    const guest = await createGuestMatch(memoryTransport, ROOM, guestEvents(guestInto), 'g1')
    await settle()
    guest.setReady(true)
    await tick()
    host.start()
    await tick()

    // Round 1: host wins.
    host.reportSolved(900)
    await tick()
    const r1 = hostInto.results.at(-1)
    expect(r1?.winnerId).toBe(HOST_ID)
    expect(r1?.standings.find((s) => s.id === HOST_ID)?.wins).toBe(1)
    expect(r1?.standings.find((s) => s.id === 'zip-guest-g1')?.wins).toBe(0)

    // Rematch (all opt in) then round 2: guest wins.
    host.voteRematch()
    guest.voteRematch()
    await tick()
    expect(hostInto.setups).toHaveLength(2)
    guest.reportSolved(700)
    await tick()
    const r2 = hostInto.results.at(-1)
    expect(r2?.winnerId).toBe('zip-guest-g1')
    // Cumulative tally: host still has its round-1 win, guest now has 1.
    expect(r2?.standings.find((s) => s.id === HOST_ID)?.wins).toBe(1)
    expect(r2?.standings.find((s) => s.id === 'zip-guest-g1')?.wins).toBe(1)

    guest.close()
    host.close()
  })
})

describe('late join is dropped into the live phase (no dead lobby screen)', () => {
  it('joining mid-race delivers the live puzzle + standings', async () => {
    const hostInto = newHostInto()
    const g1Into = newGuestInto()
    const g2Into = newGuestInto()
    const host = await createHostMatch(memoryTransport, ROOM, SETUP, hostEvents(hostInto))
    const g1 = await createGuestMatch(memoryTransport, ROOM, guestEvents(g1Into), 'g1')
    await settle()
    g1.setReady(true)
    await tick()
    host.start()
    await tick()

    // g2 arrives after the race already started.
    const g2 = await createGuestMatch(memoryTransport, ROOM, guestEvents(g2Into), 'g2')
    await settle()

    // The late joiner gets the in-progress puzzle and a standings snapshot.
    expect(g2Into.setups).toHaveLength(1)
    expect(g2Into.setups.at(-1)?.seed).toBe(SETUP.seed)
    expect(g2Into.standings.length).toBeGreaterThanOrEqual(1)

    g1.close()
    g2.close()
    host.close()
  })

  it('joining mid-results delivers the result and lets the newcomer complete the rematch vote', async () => {
    const hostInto = newHostInto()
    const g1Into = newGuestInto()
    const g2Into = newGuestInto()
    const host = await createHostMatch(memoryTransport, ROOM, SETUP, hostEvents(hostInto))
    const g1 = await createGuestMatch(memoryTransport, ROOM, guestEvents(g1Into), 'g1')
    await settle()
    g1.setReady(true)
    await tick()
    host.start()
    await tick()
    host.reportSolved(1000)
    await tick()

    // g2 arrives during the results screen.
    const g2 = await createGuestMatch(memoryTransport, ROOM, guestEvents(g2Into), 'g2')
    await settle()
    expect(g2Into.results).toHaveLength(1) // got the result -> can reach the vote

    // Host + g1 vote but the newcomer (now counted) blocks the restart.
    host.voteRematch()
    g1.voteRematch()
    await tick()
    expect(hostInto.setups).toHaveLength(1)

    // Newcomer votes -> everyone in -> restart.
    g2.voteRematch()
    await tick()
    expect(hostInto.setups).toHaveLength(2)

    g1.close()
    g2.close()
    host.close()
  })
})

describe('disconnect terminal states', () => {
  it('guest leaving the lobby drops its seat from the roster', async () => {
    const hostInto = newHostInto()
    const guestInto = newGuestInto()
    const host = await createHostMatch(memoryTransport, ROOM, SETUP, hostEvents(hostInto))
    const guest = await createGuestMatch(memoryTransport, ROOM, guestEvents(guestInto), 'g1')
    await settle()
    expect(hostInto.lobbies.at(-1)).toHaveLength(2)

    guest.close()
    await tick()
    expect(hostInto.lobbies.at(-1)).toHaveLength(1)
    expect(hostInto.lobbies.at(-1)?.[0]?.seat).toBe(1)

    host.close()
  })

  it('host leaving mid-race => guest reaches a local host_left result', async () => {
    const hostInto = newHostInto()
    const guestInto = newGuestInto()
    const transport = notifyingTransport()
    const host = await createHostMatch(transport, ROOM, SETUP, hostEvents(hostInto))
    const guest = await createGuestMatch(transport, ROOM, guestEvents(guestInto), 'g1')
    await settle()
    guest.setReady(true)
    await tick()
    host.start()
    await tick()

    host.close()
    await tick()

    const terminal = guestInto.results.at(-1)
    expect(terminal?.reason).toBe('host_left')
    expect(terminal?.winnerId).toBeNull()

    guest.close()
  })
})

describe('AC7 (through the controller): standings broadcasts are throttled with an injected clock', () => {
  it('many reportProgress calls under one window emit at most one standings update', async () => {
    const hostInto = newHostInto()
    const guestInto = newGuestInto()
    let clock = 1000
    // Inject the clock into the HOST: its broadcastStandings throttle is the
    // downstream rate limiter under test.
    const host = await createHostMatch(
      memoryTransport,
      ROOM,
      SETUP,
      hostEvents(hostInto),
      () => clock,
    )
    const guest = await createGuestMatch(memoryTransport, ROOM, guestEvents(guestInto), 'g1')
    await settle()
    guest.setReady(true)
    await tick()
    host.start()
    await tick()
    const baseline = hostInto.standings.length

    // Burst of the host's own progress within a single 250ms window.
    for (let i = 1; i <= 16; i++) {
      clock += 5 // 16 * 5 = 80ms, all under one window
      host.reportProgress(i, 16)
    }
    await tick()
    expect(hostInto.standings.length - baseline).toBe(1)

    // Cross a window boundary -> one more passes.
    clock += 250
    host.reportProgress(16, 16)
    await tick()
    expect(hostInto.standings.length - baseline).toBe(2)

    guest.close()
    host.close()
  })
})

describe('series format (best-of-N win condition)', () => {
  it('seriesTarget is the round-win majority, or null for ∞', () => {
    expect(seriesTarget(3)).toBe(2)
    expect(seriesTarget(5)).toBe(3)
    expect(seriesTarget(7)).toBe(4)
    expect(seriesTarget(null)).toBeNull()
  })

  it('best-of-3: a champion is declared only once a player reaches 2 round wins', async () => {
    const hostInto = newHostInto()
    const guestInto = newGuestInto()
    let nextSeed = 8000
    const host = await createHostMatch(
      memoryTransport,
      ROOM,
      { seed: 42, difficulty: 12, bestOf: 3 },
      hostEvents(hostInto),
      () => performance.now(),
      () => ++nextSeed,
    )
    const guest = await createGuestMatch(memoryTransport, ROOM, guestEvents(guestInto), 'g1')
    await settle()
    guest.setReady(true)
    await tick()
    host.start()
    await tick()

    // Round 1: host wins (1-0). Series not decided yet.
    host.reportSolved(900)
    await tick()
    expect(hostInto.results.at(-1)?.championId).toBeNull()
    expect(guestInto.results.at(-1)?.championId).toBeNull()

    // Round 2: host wins again (2-0) -> clinches the best-of-3.
    host.voteRematch()
    guest.voteRematch()
    await tick()
    host.reportSolved(900)
    await tick()
    const final = hostInto.results.at(-1)
    expect(final?.winnerId).toBe(HOST_ID)
    expect(final?.championId).toBe(HOST_ID)
    expect(guestInto.results.at(-1)?.championId).toBe(HOST_ID)

    guest.close()
    host.close()
  })

  it('∞ never declares a champion, even after many wins', async () => {
    const hostInto = newHostInto()
    const guestInto = newGuestInto()
    let nextSeed = 9000
    const host = await createHostMatch(
      memoryTransport,
      ROOM,
      { seed: 42, difficulty: 12, bestOf: null },
      hostEvents(hostInto),
      () => performance.now(),
      () => ++nextSeed,
    )
    const guest = await createGuestMatch(memoryTransport, ROOM, guestEvents(guestInto), 'g1')
    await settle()
    guest.setReady(true)
    await tick()
    host.start()
    await tick()

    for (let round = 0; round < 3; round++) {
      host.reportSolved(900)
      await tick()
      expect(hostInto.results.at(-1)?.championId).toBeNull()
      host.voteRematch()
      guest.voteRematch()
      await tick()
    }

    guest.close()
    host.close()
  })

  it('a rematch after a clinched series opens a fresh series (win tally resets)', async () => {
    const hostInto = newHostInto()
    const guestInto = newGuestInto()
    let nextSeed = 9500
    const host = await createHostMatch(
      memoryTransport,
      ROOM,
      { seed: 42, difficulty: 12, bestOf: 3 },
      hostEvents(hostInto),
      () => performance.now(),
      () => ++nextSeed,
    )
    const guest = await createGuestMatch(memoryTransport, ROOM, guestEvents(guestInto), 'g1')
    await settle()
    guest.setReady(true)
    await tick()
    host.start()
    await tick()

    // Host clinches a best-of-3 in two rounds.
    host.reportSolved(900)
    await tick()
    host.voteRematch()
    guest.voteRematch()
    await tick()
    host.reportSolved(900)
    await tick()
    expect(hostInto.results.at(-1)?.championId).toBe(HOST_ID)

    // New series: round-1 result shows the tally reset to 1-0, not 3-0.
    host.voteRematch()
    guest.voteRematch()
    await tick()
    guest.reportSolved(800)
    await tick()
    const r = hostInto.results.at(-1)
    expect(r?.championId).toBeNull()
    expect(r?.standings.find((s) => s.id === 'zip-guest-g1')?.wins).toBe(1)
    expect(r?.standings.find((s) => s.id === HOST_ID)?.wins).toBe(0)

    guest.close()
    host.close()
  })
})
