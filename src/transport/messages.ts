/**
 * ZIP wire protocol. The host is authoritative for an N-player race: it owns the
 * lobby (who is connected / ready), picks the seed at start (every client
 * regenerates the same puzzle from it), aggregates live standings, and decides
 * the result. A rematch only starts once EVERY connected player has opted in.
 * There is no kick concept in ZIP.
 *
 * Direction naming: GuestToHost is the client→host channel, HostToGuest is the
 * host→client channel. The host counts itself as seat 1; guests get seats 2..N
 * by join order.
 */

/** A lobby seat as seen by every client (ready-up phase). */
export type LobbyPlayer = { id: string; seat: number; ready: boolean }

/** A player's race standing (live during the race and final at the result).
 *  `wins` is the cumulative round-win tally across the room's rematches. */
export type Standing = {
  id: string
  seat: number
  filled: number
  total: number
  timeMs: number | null
  finished: boolean
  wins: number
}

export type ResultReason = 'solved' | 'host_left'

/** Series format: best-of-N rounds, or null for an endless rematch loop. */
export type SeriesFormat = 3 | 5 | 7 | null

export type GuestToHost =
  | { t: 'hello' }
  | { t: 'ready'; ready: boolean }
  | { t: 'progress'; filled: number; total: number }
  | { t: 'solved'; timeMs: number }
  | { t: 'rematch' }

export type HostToGuest =
  | { t: 'welcome'; you: string }
  | { t: 'lobby'; players: LobbyPlayer[] }
  | { t: 'match_setup'; seed: number; difficulty: number; bestOf: SeriesFormat }
  | { t: 'standings'; players: Standing[] }
  | {
      t: 'result'
      standings: Standing[]
      winnerId: string | null
      reason: ResultReason
      championId: string | null
    }
  | { t: 'rematch_waiting'; readyCount: number; total: number }
