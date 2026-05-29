import type { GuestToHost, HostToGuest, LobbyPlayer, ResultReason, Standing } from './messages'

function isObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false
  // Reject prototype-pollution payloads: an own `__proto__` key only ever
  // arrives from hostile/raw JSON, never from a legitimate wire message.
  if (Object.hasOwn(v, '__proto__')) return false
  return true
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function isReason(v: unknown): v is ResultReason {
  return v === 'solved' || v === 'host_left'
}

function validateLobbyPlayer(v: unknown): LobbyPlayer | null {
  if (!isObject(v)) return null
  if (typeof v.id !== 'string') return null
  if (!isFiniteNumber(v.seat) || v.seat < 1) return null
  if (typeof v.ready !== 'boolean') return null
  return { id: v.id, seat: v.seat, ready: v.ready }
}

function validateStanding(v: unknown): Standing | null {
  if (!isObject(v)) return null
  if (typeof v.id !== 'string') return null
  if (!isFiniteNumber(v.seat) || v.seat < 1) return null
  if (!isFiniteNumber(v.filled) || v.filled < 0) return null
  if (!isFiniteNumber(v.total) || v.total < 0) return null
  if (v.timeMs !== null && (!isFiniteNumber(v.timeMs) || v.timeMs < 0)) return null
  if (typeof v.finished !== 'boolean') return null
  if (!isFiniteNumber(v.wins) || v.wins < 0) return null
  return {
    id: v.id,
    seat: v.seat,
    filled: v.filled,
    total: v.total,
    timeMs: v.timeMs === null ? null : v.timeMs,
    finished: v.finished,
    wins: v.wins,
  }
}

/** Rebuild a fresh array from raw input, dropping the whole message if any element is malformed. */
function validateArray<T>(raw: unknown, each: (v: unknown) => T | null): T[] | null {
  if (!Array.isArray(raw)) return null
  const out: T[] = []
  for (const item of raw) {
    const ok = each(item)
    if (ok === null) return null
    out.push(ok)
  }
  return out
}

/**
 * App-edge validator for client→host messages. This is the second of the two
 * validation layers (the first being parse-messages at the transport edge). It
 * rebuilds a fresh, trusted object so prototype-polluted input never leaks
 * through. Returns null on malformed.
 */
export function validateGuestToHost(raw: unknown): GuestToHost | null {
  if (!isObject(raw) || typeof raw.t !== 'string') return null
  switch (raw.t) {
    case 'hello':
      return { t: 'hello' }
    case 'ready': {
      if (typeof raw.ready !== 'boolean') return null
      return { t: 'ready', ready: raw.ready }
    }
    case 'progress': {
      if (!isFiniteNumber(raw.filled) || !isFiniteNumber(raw.total)) return null
      if (raw.filled < 0 || raw.total < 0) return null
      return { t: 'progress', filled: raw.filled, total: raw.total }
    }
    case 'solved': {
      if (!isFiniteNumber(raw.timeMs) || raw.timeMs < 0) return null
      return { t: 'solved', timeMs: raw.timeMs }
    }
    case 'rematch':
      return { t: 'rematch' }
    default:
      return null
  }
}

/**
 * App-edge validator for host→client messages. Rebuilds a fresh, trusted
 * object. Returns null on malformed.
 */
export function validateHostToGuest(raw: unknown): HostToGuest | null {
  if (!isObject(raw) || typeof raw.t !== 'string') return null
  switch (raw.t) {
    case 'welcome': {
      if (typeof raw.you !== 'string') return null
      return { t: 'welcome', you: raw.you }
    }
    case 'lobby': {
      const players = validateArray(raw.players, validateLobbyPlayer)
      if (players === null) return null
      return { t: 'lobby', players }
    }
    case 'match_setup': {
      if (!isFiniteNumber(raw.seed) || !isFiniteNumber(raw.difficulty)) return null
      if (raw.difficulty < 1) return null
      return { t: 'match_setup', seed: raw.seed, difficulty: raw.difficulty }
    }
    case 'standings': {
      const players = validateArray(raw.players, validateStanding)
      if (players === null) return null
      return { t: 'standings', players }
    }
    case 'result': {
      const standings = validateArray(raw.standings, validateStanding)
      if (standings === null) return null
      if (!isReason(raw.reason)) return null
      if (raw.winnerId !== null && typeof raw.winnerId !== 'string') return null
      return {
        t: 'result',
        standings,
        winnerId: raw.winnerId === null ? null : raw.winnerId,
        reason: raw.reason,
      }
    }
    case 'rematch_waiting': {
      if (!isFiniteNumber(raw.readyCount) || raw.readyCount < 0) return null
      if (!isFiniteNumber(raw.total) || raw.total < 0) return null
      return { t: 'rematch_waiting', readyCount: raw.readyCount, total: raw.total }
    }
    default:
      return null
  }
}
