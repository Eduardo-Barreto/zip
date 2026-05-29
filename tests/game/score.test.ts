import { describe, expect, it } from 'vitest'
import { scoreLevel } from '../../src/game/score'

describe('scoreLevel', () => {
  it('awards 3 stars for a fast, hint-free solve', () => {
    const { stars } = scoreLevel(1, 2_000, 0)
    expect(stars).toBe(3)
  })

  it('never awards 3 stars when a hint was used', () => {
    const { stars } = scoreLevel(1, 2_000, 1)
    expect(stars).toBeLessThan(3)
  })

  it('drops to 1 star for a slow solve', () => {
    const { stars } = scoreLevel(1, 10 * 60_000, 0)
    expect(stars).toBe(1)
  })

  it('produces a non-negative integer score', () => {
    const { score } = scoreLevel(25, 30_000, 1)
    expect(Number.isInteger(score)).toBe(true)
    expect(score).toBeGreaterThanOrEqual(0)
  })
})
