import { useEffect, useReducer, useRef } from 'react'

import type { TransportFactory } from '../transport/transport'
import {
  createGuestMatch,
  createHostMatch,
  type GuestMatch,
  type HostMatch,
  type MatchResult,
  type MatchSetup,
} from './matchController'

// Thin React wrapper over the transport-free match controllers. The
// host-authoritative logic (tiebreak AC22b, disconnect policy AC22c) and the
// progress throttle (AC21) all live in matchController.ts / throttle.ts and are
// unit-tested there directly with memoryTransport and injected clocks. This
// hook only owns the React lifecycle: it spins up the right controller for the
// role, mirrors its events into render state, and tears it down on unmount.

export type { MatchResult, MatchSetup } from './matchController'
export { PROGRESS_THROTTLE_MS } from './throttle'

export type MatchPhase = 'connecting' | 'waiting' | 'racing' | 'done'

export type MatchState = {
  phase: MatchPhase
  role: 'host' | 'guest'
  setup: MatchSetup | null
  oppFilled: number
  oppTotal: number
  result: MatchResult | null
  error: string | null
}

type MatchAction =
  | { kind: 'connected' }
  | { kind: 'setup'; setup: MatchSetup }
  | { kind: 'rematch_setup'; setup: MatchSetup }
  | { kind: 'opp_progress'; filled: number; total: number }
  | { kind: 'result'; result: MatchResult }
  | { kind: 'error'; message: string }

function reducer(state: MatchState, action: MatchAction): MatchState {
  switch (action.kind) {
    case 'connected':
      return state.phase === 'connecting' ? { ...state, phase: 'waiting' } : state
    case 'setup':
      return { ...state, phase: 'racing', setup: action.setup }
    case 'rematch_setup':
      // Reset race state but stay in racing phase with the new setup.
      return {
        ...state,
        phase: 'racing',
        setup: action.setup,
        oppFilled: 0,
        oppTotal: 0,
        result: null,
      }
    case 'opp_progress':
      if (state.phase === 'done') return state
      return { ...state, oppFilled: action.filled, oppTotal: action.total }
    case 'result':
      if (state.phase === 'done') return state
      return { ...state, phase: 'done', result: action.result }
    case 'error':
      return { ...state, error: action.message }
  }
}

type HostOptions = {
  role: 'host'
  roomCode: string
  transport: TransportFactory
  seed: number
  difficulty: number
  now?: () => number
}

type GuestOptions = {
  role: 'guest'
  roomCode: string
  transport: TransportFactory
  guestLocalId?: string
  now?: () => number
}

export type UseMatchOptions = HostOptions | GuestOptions

export type UseMatch = {
  state: MatchState
  reportProgress: (filled: number, total: number) => void
  reportSolved: (timeMs: number) => void
  /** Host: broadcast a new rematch_setup with the given seed (same difficulty).
   *  Guest: send a `rematch` request to the host. */
  triggerRematch: (newSeed?: number) => void
}

function initialState(role: 'host' | 'guest', setup: MatchSetup | null): MatchState {
  return {
    phase: 'connecting',
    role,
    setup,
    oppFilled: 0,
    oppTotal: 0,
    result: null,
    error: null,
  }
}

export function useMatch(options: UseMatchOptions): UseMatch {
  const initialSetup: MatchSetup | null =
    options.role === 'host' ? { seed: options.seed, difficulty: options.difficulty } : null
  const [state, dispatch] = useReducer(reducer, undefined, () =>
    initialState(options.role, initialSetup),
  )

  const controllerRef = useRef<HostMatch | GuestMatch | null>(null)
  const pendingRef = useRef<Promise<HostMatch | GuestMatch> | null>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Alive across the whole mounted life of THIS hook instance (survives a
  // StrictMode remount), gating late dispatches. Only the deferred teardown
  // flips it false.
  const aliveRef = useRef(true)

  // Keep the latest options reachable without re-running the connect effect.
  // The connection identity (role/roomCode/transport) IS in the dep list so a
  // change reconnects; per-role payload (seed/difficulty/guestLocalId/now) is
  // read off this ref at connect time so it doesn't thrash the socket.
  const optionsRef = useRef(options)
  optionsRef.current = options

  const { role, roomCode, transport } = options

  useEffect(() => {
    // React StrictMode (dev) mounts effects mount → cleanup → mount synchronously.
    // A real-time connection must NOT actually drop on that throwaway cleanup, or
    // the host would read the guest's transient close as an "opponent left" and
    // end the match before it begins. So the cleanup DEFERS the close by a
    // macrotask; if the effect re-runs immediately (the StrictMode remount) we
    // cancel the pending close and keep the live controller. Genuine unmounts
    // have no immediate remount, so the deferred close still fires.
    aliveRef.current = true
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
      if (pendingRef.current !== null) return
    }

    const opts = optionsRef.current
    const alive = () => aliveRef.current
    const events = {
      onConnected: () => alive() && dispatch({ kind: 'connected' }),
      onGuestConnect: () => alive() && dispatch({ kind: 'connected' }),
      onSetup: (setup: MatchSetup) => alive() && dispatch({ kind: 'setup', setup }),
      onRematchSetup: (setup: MatchSetup) => alive() && dispatch({ kind: 'rematch_setup', setup }),
      onOppProgress: (filled: number, total: number) =>
        alive() && dispatch({ kind: 'opp_progress', filled, total }),
      onResult: (result: MatchResult) => alive() && dispatch({ kind: 'result', result }),
      onError: (message: string) => alive() && dispatch({ kind: 'error', message }),
    }

    const pending =
      role === 'host' && opts.role === 'host'
        ? createHostMatch(
            transport,
            roomCode,
            { seed: opts.seed, difficulty: opts.difficulty },
            events,
            opts.now ?? (() => performance.now()),
          )
        : createGuestMatch(
            transport,
            roomCode,
            events,
            opts.role === 'guest' ? opts.guestLocalId : undefined,
            opts.now ?? (() => performance.now()),
          )

    pendingRef.current = pending
    pending
      .then((controller) => {
        controllerRef.current = controller
      })
      .catch((err: Error) => {
        dispatch({ kind: 'error', message: err.message })
      })

    return () => {
      // Defer the teardown so a StrictMode remount can reclaim the connection.
      closeTimerRef.current = setTimeout(() => {
        closeTimerRef.current = null
        aliveRef.current = false
        const live = pendingRef.current
        pendingRef.current = null
        controllerRef.current = null
        live?.then((c) => c.close()).catch(() => {})
      }, 0)
    }
  }, [role, roomCode, transport])

  return {
    state,
    reportProgress: (filled, total) => controllerRef.current?.reportProgress(filled, total),
    reportSolved: (timeMs) => controllerRef.current?.reportSolved(timeMs),
    triggerRematch: (newSeed) => {
      const ctrl = controllerRef.current
      if (!ctrl) return
      if ('startRematch' in ctrl) {
        // host controller
        const seed = newSeed ?? Math.floor(Math.random() * 0x7fffffff)
        ctrl.startRematch(seed)
      } else {
        // guest controller
        ctrl.requestRematch()
      }
    },
  }
}
