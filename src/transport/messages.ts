/**
 * ZIP wire protocol. The host is authoritative for a 1v1 race: it picks the
 * gameNumber (both sides regenerate the same puzzle from that seed) and decides
 * the result. There is no kick concept in ZIP.
 *
 * Direction naming: GuestToHost is the client→host channel, HostToGuest is the
 * host→client channel.
 */

export type GuestToHost =
  | { t: 'hello'; name?: string }
  | { t: 'ready' }
  | { t: 'progress'; filled: number; total: number }
  | { t: 'solved'; timeMs: number }
  | { t: 'rematch' }

export type ResultOutcome = 'host' | 'guest' | 'draw' | 'abandoned'
export type ResultReason = 'solved' | 'opponent_left'

export type HostToGuest =
  | { t: 'welcome' }
  | { t: 'match_setup'; gameNumber: number }
  | { t: 'opp_progress'; filled: number; total: number }
  | {
      t: 'result'
      outcome: ResultOutcome
      reason: ResultReason
      times: { host: number | null; guest: number | null }
    }
  | { t: 'rematch_setup'; gameNumber: number }
