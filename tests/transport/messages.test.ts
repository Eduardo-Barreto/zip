import { describe, expect, it } from 'vitest'
import type { GuestToHost, HostToGuest } from '../../src/transport/messages'
import { parseGuestToHost, parseHostToGuest } from '../../src/transport/parse-messages'
import { validateGuestToHost, validateHostToGuest } from '../../src/transport/validate'

// Every valid wire variant. Round-tripped through both validation layers.
const VALID_GUEST_TO_HOST: GuestToHost[] = [
  { t: 'hello' },
  { t: 'ready', ready: true },
  { t: 'ready', ready: false },
  { t: 'progress', filled: 0, total: 16 },
  { t: 'progress', filled: 16, total: 16 },
  { t: 'solved', timeMs: 0 },
  { t: 'solved', timeMs: 12345 },
  { t: 'rematch' },
]

const VALID_HOST_TO_GUEST: HostToGuest[] = [
  { t: 'welcome', you: 'zip-guest-abc123' },
  { t: 'lobby', players: [] },
  {
    t: 'lobby',
    players: [
      { id: 'host', seat: 1, ready: true },
      { id: 'g1', seat: 2, ready: false },
    ],
  },
  { t: 'match_setup', seed: 123456, difficulty: 1, bestOf: 3 },
  { t: 'match_setup', seed: 0, difficulty: 60, bestOf: null },
  {
    t: 'standings',
    players: [
      { id: 'host', seat: 1, filled: 3, total: 25, timeMs: null, finished: false, wins: 0 },
    ],
  },
  {
    t: 'result',
    standings: [
      { id: 'host', seat: 1, filled: 25, total: 25, timeMs: 100, finished: true, wins: 2 },
      { id: 'g1', seat: 2, filled: 12, total: 25, timeMs: null, finished: false, wins: 1 },
    ],
    winnerId: 'host',
    reason: 'solved',
    championId: 'host',
  },
  { t: 'result', standings: [], winnerId: null, reason: 'host_left', championId: null },
  { t: 'rematch_waiting', readyCount: 1, total: 3 },
]

describe('AC18: round-trip parse + validate for every valid variant', () => {
  for (const msg of VALID_GUEST_TO_HOST) {
    it(`GuestToHost ${msg.t} (${JSON.stringify(msg)}) passes both layers`, () => {
      const wire = JSON.parse(JSON.stringify(msg))
      const parsed = parseGuestToHost(wire)
      expect(parsed).not.toBeNull()
      const validated = validateGuestToHost(parsed)
      expect(validated).toEqual(msg)
    })
  }

  for (const msg of VALID_HOST_TO_GUEST) {
    it(`HostToGuest ${msg.t} (${JSON.stringify(msg)}) passes both layers`, () => {
      const wire = JSON.parse(JSON.stringify(msg))
      const parsed = parseHostToGuest(wire)
      expect(parsed).not.toBeNull()
      const validated = validateHostToGuest(parsed)
      expect(validated).toEqual(msg)
    })
  }
})

describe('AC19: hostile payloads rejected (return null)', () => {
  // GuestToHost hostiles, grouped per type / per rejection reason.
  const hostileGuest: Array<[string, unknown]> = [
    ['missing t', { name: 'x' }],
    ['wrong/unknown t', { t: 'nope' }],
    ['t is not a string', { t: 42 }],
    ['null', null],
    ['array where object expected', ['progress', 1, 2]],
    ['ready: missing flag', { t: 'ready' }],
    ['ready: flag wrong type', { t: 'ready', ready: 'yes' }],
    ['progress: filled string', { t: 'progress', filled: '1', total: 16 }],
    ['progress: total NaN', { t: 'progress', filled: 1, total: Number.NaN }],
    ['progress: filled negative', { t: 'progress', filled: -1, total: 16 }],
    ['progress: total Infinity', { t: 'progress', filled: 1, total: Number.POSITIVE_INFINITY }],
    ['progress: missing field', { t: 'progress', filled: 1 }],
    ['solved: timeMs string', { t: 'solved', timeMs: '5' }],
    ['solved: timeMs NaN', { t: 'solved', timeMs: Number.NaN }],
    ['solved: timeMs negative', { t: 'solved', timeMs: -1 }],
    ['__proto__ polluted', JSON.parse('{"t":"progress","filled":1,"total":2,"__proto__":{"x":1}}')],
  ]

  for (const [label, payload] of hostileGuest) {
    it(`GuestToHost rejects: ${label}`, () => {
      expect(parseGuestToHost(payload)).toBeNull()
      expect(validateGuestToHost(payload)).toBeNull()
    })
  }

  const hostileHost: Array<[string, unknown]> = [
    ['missing t', { seed: 1, difficulty: 1 }],
    ['wrong/unknown t', { t: 'nope' }],
    ['array where object expected', ['welcome']],
    // match_setup hostile payloads
    ['match_setup: missing seed', { t: 'match_setup', difficulty: 1 }],
    ['match_setup: missing difficulty', { t: 'match_setup', seed: 1 }],
    ['match_setup: seed string', { t: 'match_setup', seed: '1', difficulty: 1 }],
    ['match_setup: difficulty string', { t: 'match_setup', seed: 1, difficulty: '1' }],
    ['match_setup: difficulty NaN', { t: 'match_setup', seed: 1, difficulty: Number.NaN }],
    ['match_setup: difficulty zero (< 1)', { t: 'match_setup', seed: 1, difficulty: 0 }],
    ['match_setup: difficulty negative', { t: 'match_setup', seed: 1, difficulty: -5 }],
    ['match_setup: seed NaN', { t: 'match_setup', seed: Number.NaN, difficulty: 1 }],
    ['match_setup: missing bestOf', { t: 'match_setup', seed: 1, difficulty: 1 }],
    ['match_setup: bestOf out of set', { t: 'match_setup', seed: 1, difficulty: 1, bestOf: 4 }],
    // welcome
    ['welcome: missing you', { t: 'welcome' }],
    ['welcome: you wrong type', { t: 'welcome', you: 42 }],
    // lobby
    ['lobby: players not array', { t: 'lobby', players: {} }],
    ['lobby: player missing ready', { t: 'lobby', players: [{ id: 'h', seat: 1 }] }],
    ['lobby: player seat zero', { t: 'lobby', players: [{ id: 'h', seat: 0, ready: true }] }],
    // standings
    [
      'standings: filled string',
      {
        t: 'standings',
        players: [{ id: 'h', seat: 1, filled: 'x', total: 1, timeMs: null, finished: false }],
      },
    ],
    [
      'standings: finished wrong type',
      {
        t: 'standings',
        players: [{ id: 'h', seat: 1, filled: 1, total: 1, timeMs: null, finished: 'no' }],
      },
    ],
    // result
    [
      'result: standings not array',
      { t: 'result', standings: {}, winnerId: null, reason: 'solved' },
    ],
    ['result: bad reason', { t: 'result', standings: [], winnerId: null, reason: 'kicked' }],
    ['result: winnerId wrong type', { t: 'result', standings: [], winnerId: 5, reason: 'solved' }],
    [
      'result: championId wrong type',
      { t: 'result', standings: [], winnerId: null, reason: 'solved', championId: 7 },
    ],
    [
      'result: bad standing timeMs',
      {
        t: 'result',
        standings: [{ id: 'h', seat: 1, filled: 1, total: 1, timeMs: 'x', finished: true }],
        winnerId: 'h',
        reason: 'solved',
      },
    ],
    // rematch_waiting
    ['rematch_waiting: missing total', { t: 'rematch_waiting', readyCount: 1 }],
    ['rematch_waiting: negative count', { t: 'rematch_waiting', readyCount: -1, total: 2 }],
    [
      '__proto__ polluted',
      JSON.parse('{"t":"match_setup","seed":1,"difficulty":1,"__proto__":{"x":1}}'),
    ],
  ]

  for (const [label, payload] of hostileHost) {
    it(`HostToGuest rejects: ${label}`, () => {
      expect(parseHostToGuest(payload)).toBeNull()
      expect(validateHostToGuest(payload)).toBeNull()
    })
  }
})
