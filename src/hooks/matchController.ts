import type {
  GuestToHost,
  HostToGuest,
  LobbyPlayer,
  ResultReason,
  SeriesFormat,
  Standing,
} from '../transport/messages'
import { generateGuestLocalId, guestPeerId, hostPeerId } from '../transport/peer-ids'
import type { PeerClient, PeerHost, TransportFactory } from '../transport/transport'
import { validateGuestToHost } from '../transport/validate'
import { makeProgressThrottle, type ProgressThrottle } from './throttle'

// Transport-driven, React-free controllers for the N-player race. The host is
// authoritative: it owns the lobby (who is connected / ready), starts the race,
// aggregates live standings, decides the result on the FIRST solve, and only
// triggers a rematch once EVERY connected player has opted in. Keeping this
// logic here (not in a hook) makes the lobby, ranking, race-end and all-vote
// rematch directly testable with memoryTransport — no React, no real timers.
// useMatch is a thin React wrapper over these.

/** The host's own seat id. Guests use their transport client id. */
export const HOST_ID = 'host'

export type MatchSetup = { seed: number; difficulty: number; bestOf: SeriesFormat }

export type MatchResultData = {
  standings: Standing[]
  winnerId: string | null
  reason: ResultReason
  /** Set once a player clinches a best-of-N series; null mid-series and in ∞. */
  championId: string | null
}

/** Round wins needed to clinch a series, or null for the endless (∞) format. */
export function seriesTarget(bestOf: SeriesFormat): number | null {
  return bestOf === null ? null : Math.floor(bestOf / 2) + 1
}

/** Generate a non-deterministic match seed (lives in hooks/, outside src/game). */
export function randomMatchSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff)
}

// ---------------------------------------------------------------------------
// Shared ranking
// ---------------------------------------------------------------------------

type Seat = {
  id: string
  seat: number
  ready: boolean
  filled: number
  total: number
  timeMs: number | null
  finished: boolean
  rematchReady: boolean
  /** Cumulative rounds won across the room's rematches. */
  wins: number
}

/**
 * Deterministic standings order: finishers first by ascending timeMs (exact
 * ties broken by the lower seat — the host-wins rule generalized), then
 * non-finishers by descending filled count (ties by lower seat). Pure so the
 * host and every client agree on the order.
 */
export function rankStandings(seats: Seat[]): Standing[] {
  const sorted = [...seats].sort((a, b) => {
    if (a.finished && b.finished) {
      const at = a.timeMs ?? Number.POSITIVE_INFINITY
      const bt = b.timeMs ?? Number.POSITIVE_INFINITY
      return at !== bt ? at - bt : a.seat - b.seat
    }
    if (a.finished !== b.finished) return a.finished ? -1 : 1
    return b.filled !== a.filled ? b.filled - a.filled : a.seat - b.seat
  })
  return sorted.map((s) => ({
    id: s.id,
    seat: s.seat,
    filled: s.filled,
    total: s.total,
    timeMs: s.timeMs,
    finished: s.finished,
    wins: s.wins,
  }))
}

// ---------------------------------------------------------------------------
// Host
// ---------------------------------------------------------------------------

export type HostEvents = {
  onLobby: (players: LobbyPlayer[]) => void
  onSetup: (setup: MatchSetup) => void
  onStandings: (players: Standing[]) => void
  onResult: (result: MatchResultData) => void
  onRematchWaiting: (readyCount: number, total: number) => void
  onError: (message: string) => void
}

export type HostMatch = {
  /** Host begins the first race (only valid in lobby with all guests ready). */
  start: () => void
  reportProgress: (filled: number, total: number) => void
  reportSolved: (timeMs: number) => void
  /** Host opts into a rematch; the race restarts once everyone has opted in. */
  voteRematch: () => void
  close: () => void
}

/** Open a room and run the host side of an N-player race. */
export function createHostMatch(
  transport: TransportFactory,
  roomCode: string,
  initialSetup: MatchSetup,
  events: HostEvents,
  now: () => number = () => performance.now(),
  genSeed: () => number = randomMatchSeed,
): Promise<HostMatch> {
  let host: PeerHost | null = null
  const difficulty = initialSetup.difficulty
  const bestOf = initialSetup.bestOf
  const target = seriesTarget(bestOf)
  // Set when a player clinches the series; cleared when the next series begins.
  let seriesChampion: string | null = null
  let phase: 'lobby' | 'racing' | 'results' = 'lobby'
  let nextSeat = 2
  // The puzzle seed of the race in progress and the last finished result, kept
  // so a player who joins mid-race or mid-results is dropped into the correct
  // phase instead of being stranded on a lobby screen (see onClientConnect).
  let currentSeed = initialSetup.seed
  let lastResult: MatchResultData | null = null
  const throttle: ProgressThrottle = makeProgressThrottle(now)

  // The host is seat 1 and is always considered ready (it is the one starting).
  const players = new Map<string, Seat>()
  players.set(HOST_ID, {
    id: HOST_ID,
    seat: 1,
    ready: true,
    filled: 0,
    total: 0,
    timeMs: null,
    finished: false,
    rematchReady: false,
    wins: 0,
  })

  function lobbyList(): LobbyPlayer[] {
    return [...players.values()]
      .sort((a, b) => a.seat - b.seat)
      .map((s) => ({ id: s.id, seat: s.seat, ready: s.ready }))
  }

  function broadcastLobby() {
    const list = lobbyList()
    host?.broadcast({ t: 'lobby', players: list })
    events.onLobby(list)
  }

  function canStart(): boolean {
    return players.size >= 2 && [...players.values()].every((s) => s.ready)
  }

  function beginRace(seed: number) {
    // A rematch AFTER a series concluded opens a NEW series: clear the tally.
    if (seriesChampion !== null) {
      for (const s of players.values()) s.wins = 0
      seriesChampion = null
    }
    for (const s of players.values()) {
      s.filled = 0
      s.total = 0
      s.timeMs = null
      s.finished = false
      s.rematchReady = false
    }
    phase = 'racing'
    currentSeed = seed
    lastResult = null
    throttle.reset()
    host?.broadcast({ t: 'match_setup', seed, difficulty, bestOf })
    events.onSetup({ seed, difficulty, bestOf })
  }

  function broadcastStandings(force: boolean) {
    if (phase !== 'racing') return
    if (!force && !throttle.shouldSend()) return
    const list = rankStandings([...players.values()])
    host?.broadcast({ t: 'standings', players: list })
    events.onStandings(list)
  }

  // First solve ends the race. Defer one microtask so any near-simultaneous
  // solve (same task batch) is also registered before we rank, keeping the
  // tiebreak observable instead of going to whoever's message landed first.
  let endScheduled = false
  function scheduleEnd() {
    if (phase !== 'racing' || endScheduled) return
    endScheduled = true
    queueMicrotask(() => {
      endScheduled = false
      if (phase !== 'racing') return
      if (![...players.values()].some((s) => s.finished)) return
      endRace('solved')
    })
  }

  function endRace(reason: ResultReason) {
    phase = 'results'
    // Winner = first finisher in rank order; bump its cumulative tally BEFORE
    // building the broadcast standings so the round-end scoreboard is current.
    const ranked = rankStandings([...players.values()])
    const winner = ranked.find((s) => s.finished) ?? null
    const winnerId = winner ? winner.id : null
    if (winnerId !== null) {
      const seat = players.get(winnerId)
      if (seat) seat.wins += 1
    }
    // The round winner clinches the series once it reaches the win target.
    const winnerWins = winnerId !== null ? (players.get(winnerId)?.wins ?? 0) : 0
    const championId =
      target !== null && winnerId !== null && winnerWins >= target ? winnerId : null
    seriesChampion = championId
    const standings = rankStandings([...players.values()])
    for (const s of players.values()) s.rematchReady = false
    lastResult = { standings, winnerId, reason, championId }
    host?.broadcast({ t: 'result', standings, winnerId, reason, championId })
    events.onResult({ standings, winnerId, reason, championId })
  }

  function broadcastRematchWaiting() {
    const ready = [...players.values()].filter((s) => s.rematchReady).length
    host?.broadcast({ t: 'rematch_waiting', readyCount: ready, total: players.size })
    events.onRematchWaiting(ready, players.size)
  }

  function castRematch(id: string) {
    if (phase !== 'results') return
    const seat = players.get(id)
    if (!seat) return
    seat.rematchReady = true
    if ([...players.values()].every((s) => s.rematchReady)) {
      beginRace(genSeed())
    } else {
      broadcastRematchWaiting()
    }
  }

  function applyGuest(clientId: string, msg: GuestToHost) {
    const seat = players.get(clientId)
    if (!seat) return
    if (msg.t === 'ready') {
      if (phase !== 'lobby') return
      seat.ready = msg.ready
      broadcastLobby()
    } else if (msg.t === 'progress') {
      if (phase !== 'racing' || seat.finished) return
      // Clamp a (possibly hostile) filled count to its own total so a bogus
      // value can't jump a non-finisher to the top of the live leaderboard.
      seat.total = msg.total
      seat.filled = Math.min(msg.filled, msg.total)
      broadcastStandings(false)
    } else if (msg.t === 'solved') {
      if (phase !== 'racing' || seat.finished) return
      seat.timeMs = msg.timeMs
      seat.finished = true
      scheduleEnd()
    } else if (msg.t === 'rematch') {
      castRematch(clientId)
    }
  }

  return transport
    .createHost(hostPeerId(roomCode), {
      onClientConnect: (clientId) => {
        if (players.has(clientId)) return
        players.set(clientId, {
          id: clientId,
          seat: nextSeat++,
          ready: false,
          filled: 0,
          total: 0,
          timeMs: null,
          finished: false,
          rematchReady: false,
          wins: 0,
        })
        host?.send(clientId, { t: 'welcome', you: clientId })
        broadcastLobby()
        // Drop a late joiner into the phase that is actually happening, so they
        // never sit on a dead lobby screen. Mid-race: hand them the live puzzle
        // + current standings. Mid-results: hand them the result so they can
        // cast a rematch vote (otherwise they'd silently block the all-vote
        // gate, since they already count toward players.size).
        if (phase === 'racing') {
          host?.send(clientId, { t: 'match_setup', seed: currentSeed, difficulty, bestOf })
          host?.send(clientId, { t: 'standings', players: rankStandings([...players.values()]) })
        } else if (phase === 'results' && lastResult !== null) {
          host?.send(clientId, {
            t: 'result',
            standings: lastResult.standings,
            winnerId: lastResult.winnerId,
            reason: lastResult.reason,
            championId: lastResult.championId,
          })
          broadcastRematchWaiting()
        }
      },
      onClientMessage: (clientId, raw) => {
        const msg = validateGuestToHost(raw as unknown)
        if (!msg) return
        applyGuest(clientId, msg)
      },
      onClientDisconnect: (clientId) => {
        if (!players.delete(clientId)) return
        if (phase === 'lobby') {
          broadcastLobby()
        } else if (phase === 'racing') {
          broadcastStandings(true)
        } else {
          // results: a leaver may complete the rematch vote among those who remain.
          if (players.size >= 2 && [...players.values()].every((s) => s.rematchReady)) {
            beginRace(genSeed())
          } else {
            broadcastRematchWaiting()
          }
        }
      },
      onError: (err) => events.onError(err.message),
    })
    .then((h) => {
      host = h
      // Emit the initial lobby so the host UI shows its own seat immediately.
      events.onLobby(lobbyList())
      return {
        start: () => {
          if (phase === 'lobby' && canStart()) beginRace(initialSetup.seed)
        },
        reportProgress: (filled: number, total: number) => {
          const seat = players.get(HOST_ID)
          if (!seat || phase !== 'racing' || seat.finished) return
          seat.filled = filled
          seat.total = total
          broadcastStandings(false)
        },
        reportSolved: (timeMs: number) => {
          const seat = players.get(HOST_ID)
          if (!seat || phase !== 'racing' || seat.finished) return
          seat.timeMs = timeMs
          seat.finished = true
          scheduleEnd()
        },
        voteRematch: () => castRematch(HOST_ID),
        close: () => h.close(),
      }
    })
}

// ---------------------------------------------------------------------------
// Guest
// ---------------------------------------------------------------------------

export type GuestEvents = {
  onConnected: () => void
  onWelcome: (you: string) => void
  onLobby: (players: LobbyPlayer[]) => void
  onSetup: (setup: MatchSetup) => void
  onStandings: (players: Standing[]) => void
  onResult: (result: MatchResultData) => void
  onRematchWaiting: (readyCount: number, total: number) => void
  onError: (message: string) => void
}

export type GuestMatch = {
  setReady: (ready: boolean) => void
  reportProgress: (filled: number, total: number) => void
  reportSolved: (timeMs: number) => void
  voteRematch: () => void
  close: () => void
}

/** Join a room and run the guest side of the race. */
export function createGuestMatch(
  transport: TransportFactory,
  roomCode: string,
  events: GuestEvents,
  guestLocalId: string = generateGuestLocalId(),
  now: () => number = () => performance.now(),
): Promise<GuestMatch> {
  let client: PeerClient | null = null
  let finished = false
  const throttle: ProgressThrottle = makeProgressThrottle(now)

  let connected = false
  let greeted = false

  function send(msg: GuestToHost) {
    client?.send(msg)
  }

  // hello must go out exactly once, AND only after both the connection is open
  // and the client handle exists. Depending on the transport these two facts
  // arrive in either order, so we gate on both and fire from whichever happens
  // last. Unlike v1 we do NOT auto-`ready` — readiness is an explicit lobby
  // action now.
  function greetIfReady() {
    if (greeted || !connected || client === null) return
    greeted = true
    send({ t: 'hello' })
  }

  return transport
    .createClient(guestPeerId(guestLocalId), hostPeerId(roomCode), {
      onConnected: () => {
        connected = true
        greetIfReady()
        events.onConnected()
      },
      onMessage: (msg: HostToGuest) => {
        switch (msg.t) {
          case 'welcome':
            events.onWelcome(msg.you)
            break
          case 'lobby':
            events.onLobby(msg.players)
            break
          case 'match_setup':
            finished = false
            throttle.reset()
            events.onSetup({ seed: msg.seed, difficulty: msg.difficulty, bestOf: msg.bestOf })
            break
          case 'standings':
            events.onStandings(msg.players)
            break
          case 'result':
            finished = true
            events.onResult({
              standings: msg.standings,
              winnerId: msg.winnerId,
              reason: msg.reason,
              championId: msg.championId,
            })
            break
          case 'rematch_waiting':
            events.onRematchWaiting(msg.readyCount, msg.total)
            break
        }
      },
      // Host left: the guest has no authority to judge, so it reaches a local
      // terminal 'host_left' result and never hangs waiting for a verdict.
      onDisconnected: () => {
        if (finished) return
        finished = true
        events.onResult({ standings: [], winnerId: null, reason: 'host_left', championId: null })
      },
      onReconnecting: () => {},
      onError: (err) => events.onError(err.message),
    })
    .then((c) => {
      client = c
      greetIfReady()
      return {
        setReady: (ready: boolean) => send({ t: 'ready', ready }),
        reportProgress: (filled: number, total: number) => {
          if (finished) return
          if (!throttle.shouldSend()) return
          send({ t: 'progress', filled, total })
        },
        reportSolved: (timeMs: number) => {
          send({ t: 'solved', timeMs })
        },
        voteRematch: () => send({ t: 'rematch' }),
        close: () => c.close(),
      }
    })
}
