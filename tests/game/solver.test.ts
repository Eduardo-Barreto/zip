import { describe, expect, it } from 'vitest'
import { generatePuzzle } from '../../src/game/generate'
import { countSolutions, hint } from '../../src/game/solver'
import type { Cell, Puzzle } from '../../src/game/types'

function startCellOf(p: Puzzle): Cell {
  for (const [cell, order] of p.numbers) if (order === 1) return cell
  throw new Error('no start')
}

// 3x3 board, cols=3:  0 1 2 / 3 4 5 / 6 7 8.  Numbers: 1@0, max 2@8 (a corner
// the path can END on). Two Hamiltonian paths from 0 to 8 cover the board, so
// it has multiple solutions under the "end on the max number" rule.
function twoSolutionPuzzle(): Puzzle {
  return {
    rows: 3,
    cols: 3,
    numbers: new Map<Cell, number>([
      [0, 1],
      [8, 2],
    ]),
    walls: new Set<string>(),
    solution: [0, 1, 2, 5, 4, 3, 6, 7, 8],
    meta: { gameNumber: 0, unique: false, difficultyScore: 0 },
  }
}

describe('countSolutions (AC9)', () => {
  it('completes within budget on a tiny board (not budget_exceeded)', () => {
    const r = countSolutions(generatePuzzle(1))
    expect(['unique', 'multiple']).toContain(r)
  })

  it('returns budget_exceeded on a large board with a tiny budget, fast', () => {
    const t0 = performance.now()
    const r = countSolutions(generatePuzzle(10), 2, 10)
    const dt = performance.now() - t0
    expect(r).toBe('budget_exceeded')
    expect(dt).toBeLessThan(1000)
  })

  it('detects the two-solution board as multiple', () => {
    expect(countSolutions(twoSolutionPuzzle())).toBe('multiple')
  })
})

describe('hint (AC8 / AC8b / AC8c)', () => {
  it('AC8: extends a valid canonical prefix', () => {
    const puzzle = generatePuzzle(1)
    const prefix = puzzle.solution.slice(0, 3)
    const h = hint(puzzle, prefix)
    expect(h.kind).toBe('extend')
    if (h.kind === 'extend') {
      expect(prefix).not.toContain(h.cell)
    }
  })

  it('AC8: backtracks a proven dead-end prefix', () => {
    // Reaching the max number 8 early (before covering 3,4,6,7) is a dead end:
    // a win must FINISH on 8, which is now used up — no completion exists.
    const puzzle = twoSolutionPuzzle()
    expect(hint(puzzle, [0, 1, 2, 5, 8]).kind).toBe('backtrack')
  })

  it('AC8b: respects a legal but divergent prefix that still completes', () => {
    // Player diverged to [0,3]; it still completes via 0-3-6-7-4-1-2-5-8.
    const puzzle = twoSolutionPuzzle()
    const h = hint(puzzle, [0, 3])
    expect(h).toEqual({ kind: 'extend', cell: 6 })
  })

  it('AC8c: returns unknown when the hint search exceeds the budget, under 1s', () => {
    const puzzle = generatePuzzle(10)
    const t0 = performance.now()
    const h = hint(puzzle, [startCellOf(puzzle)], 1)
    const dt = performance.now() - t0
    expect(h.kind).toBe('unknown')
    expect(dt).toBeLessThan(1000)
  })
})
