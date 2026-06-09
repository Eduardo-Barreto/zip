import { describe, expect, it } from 'vitest'
import {
  DAILY_STORAGE_KEY,
  dailyKey,
  dailySeed,
  freshDaily,
  hasPlayed,
  loadDaily,
  recordDaily,
  saveDaily,
} from '../../src/game/daily'

function fakeStorage(initial?: string) {
  const map = new Map<string, string>()
  if (initial !== undefined) map.set(DAILY_STORAGE_KEY, initial)
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    map,
  }
}

describe('daily seed + key are deterministic from the UTC date', () => {
  it('keys a Date by its UTC calendar day', () => {
    expect(dailyKey(new Date('2026-06-09T00:00:00Z'))).toBe('2026-06-09')
    expect(dailyKey(new Date('2026-06-09T23:59:59Z'))).toBe('2026-06-09')
    // A late-UTC instant that is "tomorrow" locally still keys to its UTC day.
    expect(dailyKey(new Date('2026-12-31T23:30:00Z'))).toBe('2026-12-31')
  })

  it('derives the same seed for the same day, a different one for another', () => {
    expect(dailySeed('2026-06-09')).toBe(20260609)
    expect(dailySeed('2026-06-09')).toBe(dailySeed('2026-06-09'))
    expect(dailySeed('2026-06-10')).not.toBe(dailySeed('2026-06-09'))
  })
})

describe('daily streak', () => {
  it('grows when the previous completion was yesterday', () => {
    let d = freshDaily()
    d = recordDaily(d, '2026-06-08', '2026-06-07', { timeMs: 1000, stars: 3 })
    expect(d.streak).toBe(1)
    d = recordDaily(d, '2026-06-09', '2026-06-08', { timeMs: 1000, stars: 3 })
    expect(d.streak).toBe(2)
  })

  it('resets to 1 when a day was skipped', () => {
    let d = recordDaily(freshDaily(), '2026-06-08', '2026-06-07', { timeMs: 1000, stars: 3 })
    // Jump to the 10th: the 9th was skipped, so the streak breaks.
    d = recordDaily(d, '2026-06-10', '2026-06-09', { timeMs: 1000, stars: 2 })
    expect(d.streak).toBe(1)
  })

  it('is a no-op when the same day is replayed', () => {
    const d1 = recordDaily(freshDaily(), '2026-06-09', '2026-06-08', { timeMs: 1000, stars: 3 })
    const d2 = recordDaily(d1, '2026-06-09', '2026-06-08', { timeMs: 500, stars: 1 })
    expect(d2).toBe(d1)
    expect(d2.results['2026-06-09']).toEqual({ timeMs: 1000, stars: 3 })
    expect(hasPlayed(d2, '2026-06-09')).toBe(true)
  })
})

describe('daily persistence is total (never throws)', () => {
  it('round-trips through save/load', () => {
    const s = fakeStorage()
    const d = recordDaily(freshDaily(), '2026-06-09', '2026-06-08', { timeMs: 4200, stars: 2 })
    saveDaily(d, s)
    expect(loadDaily(s)).toEqual(d)
  })

  it('returns a fresh default for absent / corrupt / future-version blobs', () => {
    expect(loadDaily(fakeStorage())).toEqual(freshDaily())
    expect(loadDaily(fakeStorage('{not json'))).toEqual(freshDaily())
    expect(loadDaily(fakeStorage(JSON.stringify({ version: 99 })))).toEqual(freshDaily())
  })

  it('drops malformed result entries without throwing', () => {
    const blob = JSON.stringify({
      version: 1,
      lastDateKey: '2026-06-09',
      streak: 3,
      results: { '2026-06-09': { timeMs: 'x', stars: 2 }, '2026-06-08': { timeMs: 10, stars: 1 } },
    })
    const loaded = loadDaily(fakeStorage(blob))
    expect(loaded.results['2026-06-09']).toBeUndefined()
    expect(loaded.results['2026-06-08']).toEqual({ timeMs: 10, stars: 1 })
    expect(loaded.streak).toBe(3)
  })
})
