import type { GuestToHost, HostToGuest, ResultOutcome, ResultReason } from './messages'

function isPlainObject(v: unknown): v is Record<string, unknown> {
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

/** Parser at the transport edge for client→host messages. Returns null on malformed. */
export function parseGuestToHost(v: unknown): GuestToHost | null {
  if (!isPlainObject(v) || typeof v.t !== 'string') return null
  switch (v.t) {
    case 'hello':
      if (v.name !== undefined && typeof v.name !== 'string') return null
      return v as unknown as GuestToHost
    case 'ready':
      return { t: 'ready' }
    case 'progress':
      if (!isFiniteNumber(v.filled) || !isFiniteNumber(v.total)) return null
      if (v.filled < 0 || v.total < 0) return null
      return v as unknown as GuestToHost
    case 'solved':
      if (!isFiniteNumber(v.timeMs) || v.timeMs < 0) return null
      return v as unknown as GuestToHost
    case 'rematch':
      return { t: 'rematch' }
    default:
      return null
  }
}

/** Parser at the transport edge for host→client messages. Returns null on malformed. */
export function parseHostToGuest(v: unknown): HostToGuest | null {
  if (!isPlainObject(v) || typeof v.t !== 'string') return null
  switch (v.t) {
    case 'welcome':
      return { t: 'welcome' }
    case 'match_setup':
    case 'rematch_setup':
      if (!isFiniteNumber(v.gameNumber)) return null
      return v as unknown as HostToGuest
    case 'opp_progress':
      if (!isFiniteNumber(v.filled) || !isFiniteNumber(v.total)) return null
      if (v.filled < 0 || v.total < 0) return null
      return v as unknown as HostToGuest
    case 'result': {
      if (!isOutcome(v.outcome) || !isReason(v.reason)) return null
      if (!isPlainObject(v.times)) return null
      const host = v.times.host
      const guest = v.times.guest
      if (host !== null && !isFiniteNumber(host)) return null
      if (guest !== null && !isFiniteNumber(guest)) return null
      return v as unknown as HostToGuest
    }
    default:
      return null
  }
}
