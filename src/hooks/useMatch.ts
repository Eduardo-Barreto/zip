import { useEffect, useReducer, useRef } from 'react'

import type { TransportFactory } from '../transport/transport'
import {
  createGuestMatch,
  createHostMatch,
  type GuestMatch,
  type HostMatch,
  type MatchResult,
} from './matchController'

// Thin React wrapper over the transport-free match controllers. The
// host-authoritative logic (tiebreak AC22b, disconnect policy AC22c) and the
// progress throttle (AC21) all live in matchController.ts / throttle.ts and are
// unit-tested there directly with memoryTransport and injected clocks. This
// hook only owns the React lifecycle: it spins up the right controller for the
// role, mirrors its events into render state, and tears it down on unmount.

export type { MatchResult } from './matchController'
export { PROGRESS_THROTTLE_MS } from './throttle'

export type MatchPhase = 'connecting' | 'waiting' | 'racing' | 'done'

export type MatchState = {
  phase: MatchPhase
  role: 'host' | 'guest'
  gameNumber: number | null
  oppFilled: number
  oppTotal: number
  result: MatchResult | null
  error: string | null
}

type MatchAction =
  | { kind: 'connected' }
  | { kind: 'setup'; gameNumber: number }
  | { kind: 'opp_progress'; filled: number; total: number }
  | { kind: 'result'; result: MatchResult }
  | { kind: 'error'; message: string }

function reducer(state: MatchState, action: MatchAction): MatchState {
  switch (action.kind) {
    case 'connected':
      return state.phase === 'connecting' ? { ...state, phase: 'waiting' } : state
    case 'setup':
      return { ...state, phase: 'racing', gameNumber: action.gameNumber }
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
  gameNumber: number
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
}

function initialState(role: 'host' | 'guest', gameNumber: number | null): MatchState {
  return {
    phase: 'connecting',
    role,
    gameNumber,
    oppFilled: 0,
    oppTotal: 0,
    result: null,
    error: null,
  }
}

export function useMatch(options: UseMatchOptions): UseMatch {
  const initialGame = options.role === 'host' ? options.gameNumber : null
  const [state, dispatch] = useReducer(reducer, undefined, () =>
    initialState(options.role, initialGame),
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
  // change reconnects; the per-role payload (gameNumber/guestLocalId/now) is
  // read off this ref at connect time so changing it does not thrash the socket
  // (Host bumps gameNumber via a key remount, which re-runs this effect anyway).
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
      // The remount adopts the controller (or its still-pending promise) from
      // the first mount instead of opening a second connection.
      if (pendingRef.current !== null) return
    }

    const opts = optionsRef.current
    const alive = () => aliveRef.current
    const events = {
      onConnected: () => alive() && dispatch({ kind: 'connected' }),
      onGuestConnect: () => alive() && dispatch({ kind: 'connected' }),
      onSetup: (gameNumber: number) => alive() && dispatch({ kind: 'setup', gameNumber }),
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
            opts.gameNumber,
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
      // aliveRef stays true here; it only flips false if the close actually runs.
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
  }
}
