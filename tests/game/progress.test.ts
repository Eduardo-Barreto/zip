import { describe, expect, it } from 'vitest'
import {
  CURRENT_VERSION,
  exportSave,
  freshProgress,
  importSave,
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

  it('round-trips export/import identically', () => {
    let p = freshProgress()
    p = recordCompletion(p, 1, { stars: 3, timeMs: 4200, hintsUsed: 0 })
    p = recordCompletion(p, 2, { stars: 2, timeMs: 8000, hintsUsed: 1 })
    const restored = importSave(exportSave(p))
    expect(restored.currentGame).toBe(p.currentGame)
    expect(restored.completed).toEqual(p.completed)
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
