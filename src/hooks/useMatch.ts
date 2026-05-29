import { useEffect, useReducer, useRef } from 'react'

import type { LobbyPlayer, Standing } from '../transport/messages'
import type { TransportFactory } from '../transport/transport'
import {
  createGuestMatch,
  createHostMatch,
  type GuestMatch,
  HOST_ID,
  type HostMatch,
  type MatchResultData,
  type MatchSetup,
} from './matchController'

// Thin React wrapper over the transport-free match controllers. The
// host-authoritative logic (lobby, ranking, race-end, all-vote rematch) and the
// progress throttle all live in matchController.ts / throttle.ts and are
// unit-tested there directly with memoryTransport and injected clocks. This hook
// only owns the React lifecycle: it spins up the right controller for the role,
// mirrors its events into render state, and tears it down on unmount.

export type { MatchResultData, MatchSetup } from './matchController'
export { HOST_ID } from './matchController'
export { PROGRESS_THROTTLE_MS } from './throttle'

export type MatchPhase = 'connecting' | 'lobby' | 'racing' | 'results'

export type MatchState = {
  phase: MatchPhase
  role: 'host' | 'guest'
  myId: string | null
  players: LobbyPlayer[]
  setup: MatchSetup | null
  standings: Standing[]
  result: MatchResultData | null
  rematchReadyCount: number
  rematchTotal: number
  localRematchVoted: boolean
  error: string | null
}

type MatchAction =
  | { kind: 'connected' }
  | { kind: 'welcome'; you: string }
  | { kind: 'lobby'; players: LobbyPlayer[] }
  | { kind: 'setup'; setup: MatchSetup }
  | { kind: 'standings'; players: Standing[] }
  | { kind: 'result'; result: MatchResultData }
  | { kind: 'rematch_waiting'; readyCount: number; total: number }
  | { kind: 'local_rematch_vote' }
  | { kind: 'error'; message: string }

function reducer(state: MatchState, action: MatchAction): MatchState {
  switch (action.kind) {
    case 'connected':
      return state.phase === 'connecting' ? { ...state, phase: 'lobby' } : state
    case 'welcome':
      return { ...state, myId: action.you }
    case 'lobby':
      // A lobby update only moves us into the lobby from the connecting screen;
      // it never pulls us back out of racing/results.
      return {
        ...state,
        players: action.players,
        phase: state.phase === 'connecting' ? 'lobby' : state.phase,
      }
    case 'setup':
      return {
        ...state,
        phase: 'racing',
        setup: action.setup,
        standings: [],
        result: null,
        rematchReadyCount: 0,
        rematchTotal: 0,
        localRematchVoted: false,
      }
    case 'standings':
      if (state.phase !== 'racing') return state
      return { ...state, standings: action.players }
    case 'result':
      if (state.phase === 'results') return state
      return {
        ...state,
        phase: 'results',
        result: action.result,
        standings: action.result.standings,
        localRematchVoted: false,
      }
    case 'rematch_waiting':
      return { ...state, rematchReadyCount: action.readyCount, rematchTotal: action.total }
    case 'local_rematch_vote':
      // Only meaningful on the results screen. If the host casts the LAST vote,
      // beginRace dispatches `setup` (phase → racing) before this action lands;
      // guarding on phase keeps a stale vote flag from bleeding into next round.
      return state.phase === 'results' ? { ...state, localRematchVoted: true } : state
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
  /** Host only: begin the first race (no-op for guests / when not startable). */
  start: () => void
  /** Guest only: toggle lobby readiness (no-op for the host). */
  setReady: (ready: boolean) => void
  reportProgress: (filled: number, total: number) => void
  reportSolved: (timeMs: number) => void
  /** Opt into a rematch; the race restarts once everyone has opted in. */
  voteRematch: () => void
}

function initialState(role: 'host' | 'guest'): MatchState {
  return {
    phase: 'connecting',
    role,
    myId: role === 'host' ? HOST_ID : null,
    players: [],
    setup: null,
    standings: [],
    result: null,
    rematchReadyCount: 0,
    rematchTotal: 0,
    localRematchVoted: false,
    error: null,
  }
}

export function useMatch(options: UseMatchOptions): UseMatch {
  const [state, dispatch] = useReducer(reducer, options.role, initialState)

  const controllerRef = useRef<HostMatch | GuestMatch | null>(null)
  const pendingRef = useRef<Promise<HostMatch | GuestMatch> | null>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Alive across the whole mounted life of THIS hook instance (survives a
  // StrictMode remount), gating late dispatches. Only the deferred teardown
  // flips it false.
  const aliveRef = useRef(true)

  // Keep the latest options reachable without re-running the connect effect.
  const optionsRef = useRef(options)
  optionsRef.current = options

  const { role, roomCode, transport } = options

  useEffect(() => {
    // React StrictMode (dev) mounts effects mount → cleanup → mount synchronously.
    // A real-time connection must NOT actually drop on that throwaway cleanup, or
    // the host would read a guest's transient close as a disconnect before the
    // match begins. So the cleanup DEFERS the close by a macrotask; if the effect
    // re-runs immediately (the StrictMode remount) we cancel the pending close
    // and keep the live controller. Genuine unmounts still tear down.
    aliveRef.current = true
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
      if (pendingRef.current !== null) return
    }

    const opts = optionsRef.current
    const alive = () => aliveRef.current
    const hostEvents = {
      onLobby: (players: LobbyPlayer[]) => alive() && dispatch({ kind: 'lobby', players }),
      onSetup: (setup: MatchSetup) => alive() && dispatch({ kind: 'setup', setup }),
      onStandings: (players: Standing[]) => alive() && dispatch({ kind: 'standings', players }),
      onResult: (result: MatchResultData) => alive() && dispatch({ kind: 'result', result }),
      onRematchWaiting: (readyCount: number, total: number) =>
        alive() && dispatch({ kind: 'rematch_waiting', readyCount, total }),
      onError: (message: string) => alive() && dispatch({ kind: 'error', message }),
    }
    const guestEvents = {
      onConnected: () => alive() && dispatch({ kind: 'connected' }),
      onWelcome: (you: string) => alive() && dispatch({ kind: 'welcome', you }),
      onLobby: (players: LobbyPlayer[]) => alive() && dispatch({ kind: 'lobby', players }),
      onSetup: (setup: MatchSetup) => alive() && dispatch({ kind: 'setup', setup }),
      onStandings: (players: Standing[]) => alive() && dispatch({ kind: 'standings', players }),
      onResult: (result: MatchResultData) => alive() && dispatch({ kind: 'result', result }),
      onRematchWaiting: (readyCount: number, total: number) =>
        alive() && dispatch({ kind: 'rematch_waiting', readyCount, total }),
      onError: (message: string) => alive() && dispatch({ kind: 'error', message }),
    }

    const pending =
      role === 'host' && opts.role === 'host'
        ? createHostMatch(
            transport,
            roomCode,
            { seed: opts.seed, difficulty: opts.difficulty },
            hostEvents,
            opts.now ?? (() => performance.now()),
          )
        : createGuestMatch(
            transport,
            roomCode,
            guestEvents,
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
    start: () => {
      const ctrl = controllerRef.current
      if (ctrl && 'start' in ctrl) ctrl.start()
    },
    setReady: (ready) => {
      const ctrl = controllerRef.current
      if (ctrl && 'setReady' in ctrl) ctrl.setReady(ready)
    },
    reportProgress: (filled, total) => controllerRef.current?.reportProgress(filled, total),
    reportSolved: (timeMs) => controllerRef.current?.reportSolved(timeMs),
    voteRematch: () => {
      const ctrl = controllerRef.current
      if (!ctrl) return
      ctrl.voteRematch()
      dispatch({ kind: 'local_rematch_vote' })
    },
  }
}
