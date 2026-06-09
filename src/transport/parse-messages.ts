import type {
  GuestToHost,
  HostToGuest,
  LobbyPlayer,
  ResultReason,
  SeriesFormat,
  Standing,
} from './messages'

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

function isReason(v: unknown): v is ResultReason {
  return v === 'solved' || v === 'host_left'
}

function isSeriesFormat(v: unknown): v is SeriesFormat {
  return v === null || v === 3 || v === 5 || v === 7
}

function isLobbyPlayer(v: unknown): v is LobbyPlayer {
  if (!isPlainObject(v)) return false
  return (
    typeof v.id === 'string' &&
    isFiniteNumber(v.seat) &&
    v.seat >= 1 &&
    typeof v.ready === 'boolean'
  )
}

function isStanding(v: unknown): v is Standing {
  if (!isPlainObject(v)) return false
  if (typeof v.id !== 'string') return false
  if (!isFiniteNumber(v.seat) || v.seat < 1) return false
  if (!isFiniteNumber(v.filled) || v.filled < 0) return false
  if (!isFiniteNumber(v.total) || v.total < 0) return false
  if (v.timeMs !== null && (!isFiniteNumber(v.timeMs) || v.timeMs < 0)) return false
  if (typeof v.finished !== 'boolean') return false
  return isFiniteNumber(v.wins) && v.wins >= 0
}

/** Parser at the transport edge for client→host messages. Returns null on malformed. */
export function parseGuestToHost(v: unknown): GuestToHost | null {
  if (!isPlainObject(v) || typeof v.t !== 'string') return null
  switch (v.t) {
    case 'hello':
      return { t: 'hello' }
    case 'ready':
      if (typeof v.ready !== 'boolean') return null
      return v as unknown as GuestToHost
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
      if (typeof v.you !== 'string') return null
      return v as unknown as HostToGuest
    case 'lobby':
      if (!Array.isArray(v.players) || !v.players.every(isLobbyPlayer)) return null
      return v as unknown as HostToGuest
    case 'match_setup':
      if (!isFiniteNumber(v.seed) || !isFiniteNumber(v.difficulty)) return null
      if (v.difficulty < 1) return null
      if (!isSeriesFormat(v.bestOf)) return null
      return v as unknown as HostToGuest
    case 'standings':
      if (!Array.isArray(v.players) || !v.players.every(isStanding)) return null
      return v as unknown as HostToGuest
    case 'result': {
      if (!Array.isArray(v.standings) || !v.standings.every(isStanding)) return null
      if (!isReason(v.reason)) return null
      if (v.winnerId !== null && typeof v.winnerId !== 'string') return null
      if (v.championId !== null && typeof v.championId !== 'string') return null
      return v as unknown as HostToGuest
    }
    case 'rematch_waiting':
      if (!isFiniteNumber(v.readyCount) || v.readyCount < 0) return null
      if (!isFiniteNumber(v.total) || v.total < 0) return null
      return v as unknown as HostToGuest
    default:
      return null
  }
}
