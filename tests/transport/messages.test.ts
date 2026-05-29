import { describe, expect, it } from 'vitest'
import type { GuestToHost, HostToGuest } from '../../src/transport/messages'
import { parseGuestToHost, parseHostToGuest } from '../../src/transport/parse-messages'
import { validateGuestToHost, validateHostToGuest } from '../../src/transport/validate'

// Every valid wire variant. Round-tripped through both validation layers.
const VALID_GUEST_TO_HOST: GuestToHost[] = [
  { t: 'hello' },
  { t: 'hello', name: 'Ana' },
  { t: 'ready' },
  { t: 'progress', filled: 0, total: 16 },
  { t: 'progress', filled: 16, total: 16 },
  { t: 'solved', timeMs: 0 },
  { t: 'solved', timeMs: 12345 },
  { t: 'rematch' },
]

const VALID_HOST_TO_GUEST: HostToGuest[] = [
  { t: 'welcome' },
  { t: 'match_setup', gameNumber: 1 },
  { t: 'match_setup', gameNumber: 10000 },
  { t: 'opp_progress', filled: 3, total: 25 },
  { t: 'result', outcome: 'host', reason: 'solved', times: { host: 100, guest: 200 } },
  { t: 'result', outcome: 'guest', reason: 'solved', times: { host: 300, guest: 200 } },
  { t: 'result', outcome: 'draw', reason: 'solved', times: { host: 200, guest: 200 } },
  {
    t: 'result',
    outcome: 'abandoned',
    reason: 'opponent_left',
    times: { host: null, guest: null },
  },
  { t: 'rematch_setup', gameNumber: 42 },
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
    ['hello: name wrong type', { t: 'hello', name: 123 }],
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
    ['missing t', { gameNumber: 1 }],
    ['wrong/unknown t', { t: 'nope' }],
    ['array where object expected', ['welcome']],
    ['match_setup: gameNumber string', { t: 'match_setup', gameNumber: '1' }],
    ['match_setup: gameNumber NaN', { t: 'match_setup', gameNumber: Number.NaN }],
    ['rematch_setup: missing gameNumber', { t: 'rematch_setup' }],
    ['opp_progress: filled string', { t: 'opp_progress', filled: 'x', total: 1 }],
    ['opp_progress: total negative', { t: 'opp_progress', filled: 1, total: -3 }],
    ['result: nested times missing', { t: 'result', outcome: 'host', reason: 'solved' }],
    [
      'result: times is array not object',
      { t: 'result', outcome: 'host', reason: 'solved', times: [1, 2] },
    ],
    [
      'result: bad outcome',
      { t: 'result', outcome: 'tie', reason: 'solved', times: { host: 1, guest: 2 } },
    ],
    [
      'result: bad reason',
      { t: 'result', outcome: 'host', reason: 'kicked', times: { host: 1, guest: 2 } },
    ],
    [
      'result: host time NaN',
      { t: 'result', outcome: 'host', reason: 'solved', times: { host: Number.NaN, guest: 2 } },
    ],
    [
      'result: guest time string',
      { t: 'result', outcome: 'host', reason: 'solved', times: { host: 1, guest: '2' } },
    ],
    ['__proto__ polluted', JSON.parse('{"t":"match_setup","gameNumber":1,"__proto__":{"x":1}}')],
  ]

  for (const [label, payload] of hostileHost) {
    it(`HostToGuest rejects: ${label}`, () => {
      expect(parseHostToGuest(payload)).toBeNull()
      expect(validateHostToGuest(payload)).toBeNull()
    })
  }
})
