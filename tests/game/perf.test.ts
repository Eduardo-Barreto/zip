import { describe, expect, it } from 'vitest'
import { generatePuzzle } from '../../src/game/generate'

// AC10: generation is dominated by area, which is clamped at MAX_GRID_AREA, so
// N=50 and N=10000 do roughly the same work. Average over reps to cut CI noise.
function avgMs(fn: () => void, reps: number): number {
  // warm up
  fn()
  const t0 = performance.now()
  for (let i = 0; i < reps; i++) fn()
  return (performance.now() - t0) / reps
}

describe('generation performance budget (AC10)', () => {
  it('generatePuzzle(50) averages < 50ms', () => {
    expect(avgMs(() => generatePuzzle(50), 20)).toBeLessThan(50)
  })

  it('generatePuzzle(10000) averages < 50ms', () => {
    expect(avgMs(() => generatePuzzle(10000), 20)).toBeLessThan(50)
  })
})
