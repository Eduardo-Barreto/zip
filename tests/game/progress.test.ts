import { describe, expect, it } from 'vitest'
import {
  CURRENT_VERSION,
  formatDailyShare,
  formatLevelShare,
  freshProgress,
  load,
  recordCompletion,
  STORAGE_KEY,
  save,
} from '../../src/game/progress'

describe('progress persistence (AC16)', () => {
  it('save then load round-trips, surviving a reload', () => {
    let p = freshProgress()
    p = recordCompletion(p, 1, { stars: 3, timeMs: 4200, hintsUsed: 0 })
    save(p)
    const loaded = load()
    expect(loaded.completed[1]).toEqual({ bestTimeMs: 4200, stars: 3, hintsUsed: 0 })
    expect(loaded.currentGame).toBe(2)
    expect(loaded.streak).toBe(1)
  })

  it('keeps the best time and stars across replays', () => {
    let p = freshProgress()
    p = recordCompletion(p, 1, { stars: 2, timeMs: 9000, hintsUsed: 1 })
    p = recordCompletion(p, 1, { stars: 3, timeMs: 5000, hintsUsed: 0 })
    expect(p.completed[1]).toEqual({ bestTimeMs: 5000, stars: 3, hintsUsed: 0 })
    expect(p.streak).toBe(1) // replay of an already-completed level doesn't double-count
  })
})

describe('migration with a real legacy fixture (AC17)', () => {
  it('promotes an unversioned legacy blob to v1', () => {
    const legacy = JSON.stringify({
      currentGame: 7,
      completed: { 3: { bestTimeMs: 1234, stars: 2, hintsUsed: 1 } },
      streak: 4,
    })
    localStorage.setItem(STORAGE_KEY, legacy)
    const migrated = load()
    expect(migrated.version).toBe(CURRENT_VERSION)
    expect(migrated.currentGame).toBe(7)
    expect(migrated.completed[3]).toEqual({ bestTimeMs: 1234, stars: 2, hintsUsed: 1 })
    expect(migrated.streak).toBe(4)
  })

  it('formats a per-level share (Wordle-style): level, time, stars, streak', () => {
    const text = formatLevelShare(14, { timeMs: 62_000, stars: 3, streak: 7 })
    expect(text).toContain('Zip 🟦 #014')
    expect(text).toContain('1:02') // 62000ms
    expect(text).toContain('★★★')
    expect(text).toContain('sequência 7🔥')
  })

  it('appends the game URL only when one is given', () => {
    const withUrl = formatLevelShare(
      3,
      { timeMs: 4200, stars: 2, streak: 1 },
      'https://zip.example',
    )
    expect(withUrl.endsWith('https://zip.example')).toBe(true)
    expect(withUrl.split('\n')).toHaveLength(3)

    const withoutUrl = formatLevelShare(3, { timeMs: 4200, stars: 2, streak: 1 })
    expect(withoutUrl.split('\n')).toHaveLength(2)
    expect(withoutUrl).not.toContain('http')
  })

  it('clamps the star glyphs to the 0..3 range without leaking the solution', () => {
    // Defensive: an out-of-range star count must not throw or render a grid.
    expect(formatLevelShare(1, { timeMs: 1000, stars: 5, streak: 1 })).toContain('★★★')
    expect(formatLevelShare(1, { timeMs: 1000, stars: 0, streak: 1 })).toContain('#001')
  })

  it('formats a daily share with the date, time, stars, and daily streak', () => {
    const text = formatDailyShare(
      '2026-06-09',
      { timeMs: 62_000, stars: 3 },
      7,
      'https://zip.example',
    )
    expect(text).toContain('Zip Diário 🟦 2026-06-09')
    expect(text).toContain('1:02')
    expect(text).toContain('★★★')
    expect(text).toContain('7 dias🔥')
    expect(text.endsWith('https://zip.example')).toBe(true)
  })

  it('uses the singular "dia" for a 1-day daily streak', () => {
    expect(formatDailyShare('2026-06-09', { timeMs: 1000, stars: 1 }, 1)).toContain('1 dia🔥')
  })
})

describe('load is total / never throws (AC17b)', () => {
  it('returns fresh default when the blob is absent', () => {
    expect(load()).toEqual(freshProgress())
  })

  it('returns fresh default for a corrupt/unparseable blob', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json…')
    expect(() => load()).not.toThrow()
    expect(load()).toEqual(freshProgress())
  })

  it('returns fresh default for an unknown future version', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 99, currentGame: 500 }))
    expect(load()).toEqual(freshProgress())
  })

  it('ignores malformed completed entries instead of throwing', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, currentGame: 3, completed: { 2: 'nope', 3: null }, streak: 1 }),
    )
    const p = load()
    expect(p.currentGame).toBe(3)
    expect(p.completed).toEqual({})
  })
})
