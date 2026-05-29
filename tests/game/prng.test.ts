import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../src/game/prng'

describe('mulberry32 (AC1)', () => {
  it('is deterministic: same seed -> same sequence', () => {
    const a = mulberry32(12345)
    const b = mulberry32(12345)
    const seqA = Array.from({ length: 8 }, () => a.next())
    const seqB = Array.from({ length: 8 }, () => b.next())
    expect(seqA).toEqual(seqB)
  })

  it('emits floats in [0, 1)', () => {
    const p = mulberry32(7)
    for (let i = 0; i < 200; i++) {
      const v = p.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('different seeds diverge', () => {
    const a = mulberry32(1)
    const b = mulberry32(2)
    expect(a.next()).not.toBe(b.next())
  })

  it('int(n) stays in range and shuffle is a permutation', () => {
    const p = mulberry32(42)
    for (let i = 0; i < 100; i++) {
      const v = p.int(7)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(7)
      expect(Number.isInteger(v)).toBe(true)
    }
    const arr = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    const shuffled = mulberry32(99).shuffle([...arr])
    expect([...shuffled].sort((x, y) => x - y)).toEqual(arr)
  })

  it('shuffle is itself deterministic per seed', () => {
    const s1 = mulberry32(5).shuffle([1, 2, 3, 4, 5, 6, 7, 8])
    const s2 = mulberry32(5).shuffle([1, 2, 3, 4, 5, 6, 7, 8])
    expect(s1).toEqual(s2)
  })
})
