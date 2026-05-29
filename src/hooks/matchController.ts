import type { GuestToHost, HostToGuest, ResultOutcome } from '../transport/messages'
import { generateGuestLocalId, guestPeerId, hostPeerId } from '../transport/peer-ids'
import type { PeerClient, PeerHost, TransportFactory } from '../transport/transport'
import { validateGuestToHost } from '../transport/validate'
import { makeProgressThrottle, type ProgressThrottle } from './throttle'

// Transport-driven, React-free controllers for the 1v1 race. Keeping the
// host-authoritative logic here (not in a hook) makes the tiebreak (AC22b) and
// disconnect policy (AC22c) directly testable with memoryTransport and no React
// or real timers. useMatch is a thin React wrapper over these.

export type MatchResult = {
  outcome: ResultOutcome
  reason: 'solved' | 'opponent_left'
  times: { host: number | null; guest: number | null }
}

/**
 * Pure host-authoritative outcome (AC22b). Lower timeMs wins; an exact tie
 * (host === guest) resolves to the host by the fixed host-wins tiebreak rule.
 * 'draw' stays reserved in the type and is never produced in v1.
 */
export function resolveOutcome(hostMs: number, guestMs: number): MatchResult {
  const outcome: ResultOutcome = hostMs <= guestMs ? 'host' : 'guest'
  return { outcome, reason: 'solved', times: { host: hostMs, guest: guestMs } }
}

export type HostEvents = {
  onGuestConnect: () => void
  onSetup: (gameNumber: number) => void
  onOppProgress: (filled: number, total: number) => void
  onResult: (result: MatchResult) => void
  onError: (message: string) => void
}

export type HostMatch = {
  reportProgress: (filled: number, total: number) => void
  reportSolved: (timeMs: number) => void
  close: () => void
}

/** Open a room and run the host side of the race against the first guest. */
export function createHostMatch(
  transport: TransportFactory,
  roomCode: string,
  gameNumber: number,
  events: HostEvents,
  now: () => number = () => performance.now(),
): Promise<HostMatch> {
  let host: PeerHost | null = null
  let guestId: string | null = null
  let hostTime: number | null = null
  let guestTime: number | null = null
  let finished = false
  const throttle: ProgressThrottle = makeProgressThrottle(now)

  function broadcast(result: MatchResult) {
    if (finished) return
    finished = true
    if (guestId !== null) {
      host?.send(guestId, {
        t: 'result',
        outcome: result.outcome,
        reason: result.reason,
        times: result.times,
      })
    }
    events.onResult(result)
  }

  // Resolve after a `solved` arrives, but DEFER the decision by one microtask so
  // that any near-simultaneous solve (the opponent finishing in the same task
  // batch) is also registered before we decide. With both times known we
  // compare by timeMs with the deterministic host-wins tiebreak (AC22b); a lone
  // solver wins outright with the opponent's time left null. The defer keeps the
  // tiebreak observable instead of always going to whoever's message landed a
  // microtask earlier, while still ending the race on the first finish.
  let resolveScheduled = false
  function tryResolve() {
    if (finished || resolveScheduled) return
    resolveScheduled = true
    queueMicrotask(() => {
      resolveScheduled = false
      if (finished) return
      if (hostTime !== null && guestTime !== null) {
        broadcast(resolveOutcome(hostTime, guestTime))
      } else if (hostTime !== null) {
        broadcast({ outcome: 'host', reason: 'solved', times: { host: hostTime, guest: null } })
      } else if (guestTime !== null) {
        broadcast({ outcome: 'guest', reason: 'solved', times: { host: null, guest: guestTime } })
      }
    })
  }

  return transport
    .createHost(hostPeerId(roomCode), {
      onClientConnect: (clientId) => {
        // Single 1v1 slot: only bind to the first guest.
        if (guestId !== null) return
        guestId = clientId
        host?.send(clientId, { t: 'welcome' })
        host?.send(clientId, { t: 'match_setup', gameNumber })
        events.onGuestConnect()
        events.onSetup(gameNumber)
      },
      onClientMessage: (clientId, raw) => {
        if (clientId !== guestId) return
        const msg = validateGuestToHost(raw as unknown)
        if (!msg) return
        applyGuest(msg)
      },
      onClientDisconnect: (clientId) => {
        if (clientId !== guestId || finished) return
        broadcast({
          outcome: 'host',
          reason: 'opponent_left',
          times: { host: hostTime, guest: null },
        })
      },
      onError: (err) => events.onError(err.message),
    })
    .then((h) => {
      host = h
      return {
        reportProgress: (filled: number, total: number) => {
          if (guestId === null || finished) return
          if (!throttle.shouldSend()) return
          host?.send(guestId, { t: 'opp_progress', filled, total })
        },
        reportSolved: (timeMs: number) => {
          hostTime = timeMs
          tryResolve()
        },
        close: () => h.close(),
      }
    })

  function applyGuest(msg: GuestToHost) {
    if (msg.t === 'progress') {
      events.onOppProgress(msg.filled, msg.total)
    } else if (msg.t === 'solved') {
      guestTime = msg.timeMs
      tryResolve()
    }
  }
}

export type GuestEvents = {
  onConnected: () => void
  onSetup: (gameNumber: number) => void
  onOppProgress: (filled: number, total: number) => void
  onResult: (result: MatchResult) => void
  onError: (message: string) => void
}

export type GuestMatch = {
  reportProgress: (filled: number, total: number) => void
  reportSolved: (timeMs: number) => void
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

  // hello/ready must go out exactly once, AND only after both the connection is
  // open and the client handle exists. Depending on the transport these two
  // facts arrive in either order (memory fires onConnected before the
  // createClient promise resolves; peerjs may do the reverse), so we gate the
  // greeting on both and fire from whichever happens last.
  function greetIfReady() {
    if (greeted || !connected || client === null) return
    greeted = true
    send({ t: 'hello' })
    send({ t: 'ready' })
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
            break
          case 'match_setup':
          case 'rematch_setup':
            events.onSetup(msg.gameNumber)
            break
          case 'opp_progress':
            events.onOppProgress(msg.filled, msg.total)
            break
          case 'result':
            finished = true
            events.onResult({ outcome: msg.outcome, reason: msg.reason, times: msg.times })
            break
        }
      },
      // Host left: the guest has no authority to judge, so it reaches a local
      // terminal 'abandoned' result and never hangs waiting for a verdict.
      onDisconnected: () => {
        if (finished) return
        finished = true
        events.onResult({
          outcome: 'abandoned',
          reason: 'opponent_left',
          times: { host: null, guest: null },
        })
      },
      onReconnecting: () => {},
      onError: (err) => events.onError(err.message),
    })
    .then((c) => {
      client = c
      greetIfReady()
      return {
        reportProgress: (filled: number, total: number) => {
          if (finished) return
          if (!throttle.shouldSend()) return
          send({ t: 'progress', filled, total })
        },
        reportSolved: (timeMs: number) => {
          send({ t: 'solved', timeMs })
        },
        close: () => c.close(),
      }
    })
}
