import type { GuestToHost, HostToGuest, ResultOutcome, ResultReason } from './messages'

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

function isOutcome(v: unknown): v is ResultOutcome {
  return v === 'host' || v === 'guest' || v === 'draw' || v === 'abandoned'
}

function isReason(v: unknown): v is ResultReason {
  return v === 'solved' || v === 'opponent_left'
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
    case 'hello': {
      if (raw.name !== undefined && typeof raw.name !== 'string') return null
      return typeof raw.name === 'string' ? { t: 'hello', name: raw.name } : { t: 'hello' }
    }
    case 'ready':
      return { t: 'ready' }
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
    case 'welcome':
      return { t: 'welcome' }
    case 'match_setup': {
      if (!isFiniteNumber(raw.seed) || !isFiniteNumber(raw.difficulty)) return null
      if (raw.difficulty < 1) return null
      return { t: 'match_setup', seed: raw.seed, difficulty: raw.difficulty }
    }
    case 'rematch_setup': {
      if (!isFiniteNumber(raw.seed) || !isFiniteNumber(raw.difficulty)) return null
      if (raw.difficulty < 1) return null
      return { t: 'rematch_setup', seed: raw.seed, difficulty: raw.difficulty }
    }
    case 'opp_progress': {
      if (!isFiniteNumber(raw.filled) || !isFiniteNumber(raw.total)) return null
      if (raw.filled < 0 || raw.total < 0) return null
      return { t: 'opp_progress', filled: raw.filled, total: raw.total }
    }
    case 'result': {
      if (!isOutcome(raw.outcome) || !isReason(raw.reason)) return null
      if (!isObject(raw.times)) return null
      const host = raw.times.host
      const guest = raw.times.guest
      if (host !== null && !isFiniteNumber(host)) return null
      if (guest !== null && !isFiniteNumber(guest)) return null
      return {
        t: 'result',
        outcome: raw.outcome,
        reason: raw.reason,
        times: { host, guest },
      }
    }
    default:
      return null
  }
}
