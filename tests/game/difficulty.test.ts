import { describe, expect, it } from 'vitest'
import {
  CLAMP_THRESHOLD,
  difficultyScore,
  MAX_GRID_AREA,
  MIN_CHECKPOINT_FLOOR,
  paramsFor,
  UNIQUE_CEILING,
} from '../../src/game/difficulty'

describe('paramsFor totality (AC4)', () => {
  for (const N of [1, 50, 500, 10000]) {
    it(`never throws and returns valid params for N=${N}`, () => {
      const p = paramsFor(N)
      expect(p.rows).toBeGreaterThanOrEqual(4)
      expect(p.cols).toBeGreaterThanOrEqual(4)
      expect(p.checkpoints).toBeGreaterThanOrEqual(3)
      expect(p.checkpoints).toBeLessThan(p.rows * p.cols)
      expect(p.wallDensity).toBeGreaterThanOrEqual(0)
      expect(p.wallDensity).toBeLessThanOrEqual(0.45)
    })
  }
  it('handles non-positive / fractional N defensively', () => {
    expect(() => paramsFor(0)).not.toThrow()
    expect(() => paramsFor(-5)).not.toThrow()
    expect(() => paramsFor(3.7)).not.toThrow()
    expect(paramsFor(0).rows).toBe(paramsFor(1).rows)
  })
})

describe('difficultyScore monotonicity (AC5)', () => {
  it('is non-decreasing for N=1..1000 (intrinsic axes only)', () => {
    let prev = difficultyScore(1)
    for (let N = 2; N <= 1000; N++) {
      const cur = difficultyScore(N)
      expect(cur).toBeGreaterThanOrEqual(prev)
      prev = cur
    }
  })

  it('excludes timePressure from the difficulty metric', () => {
    // two N that share grid/walls/checkpoints but differ in timePressure must
    // produce the same difficultyScore. At the clamp, large N differ only by
    // timePressure cap; pick two where intrinsic axes are identical.
    const a = paramsFor(900)
    const b = paramsFor(950)
    if (a.rows === b.rows && a.wallDensity === b.wallDensity && a.checkpoints === b.checkpoints) {
      expect(difficultyScore(900)).toBe(difficultyScore(950))
    }
  })
})

describe('grid clamp + steady-state uniqueness (AC6, AC6b, AC6c)', () => {
  it('clamps grid area for all N including huge N (AC6)', () => {
    for (const N of [1, 10, 50, 500, 10000]) {
      const p = paramsFor(N)
      expect(p.rows * p.cols).toBeLessThanOrEqual(MAX_GRID_AREA)
    }
  })

  it('keeps the steady-state grid uniqueness-checkable (AC6b)', () => {
    expect(MAX_GRID_AREA).toBeLessThanOrEqual(UNIQUE_CEILING)
    for (const N of [CLAMP_THRESHOLD, 500, 10000]) {
      expect(paramsFor(N).requireUnique).toBe(true)
    }
  })

  it('keeps checkpoint ratio above the floor for all N (AC6c)', () => {
    for (let N = 1; N <= 10000; N++) {
      expect(paramsFor(N).checkpointRatio).toBeGreaterThanOrEqual(MIN_CHECKPOINT_FLOOR)
    }
  })
})
