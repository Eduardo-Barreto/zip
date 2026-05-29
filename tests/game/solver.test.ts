import { describe, expect, it } from 'vitest'
import { generatePuzzle } from '../../src/game/generate'
import { wallKey } from '../../src/game/grid'
import { countSolutions, hint } from '../../src/game/solver'
import type { Cell, Puzzle } from '../../src/game/types'

function startCellOf(p: Puzzle): Cell {
  for (const [cell, order] of p.numbers) if (order === 1) return cell
  throw new Error('no start')
}

// 2x2, numbers 1@0 2@3 — has two solutions (0-1-3-2 and 0-2-3-1).
function twoSolutionPuzzle(walls: string[] = []): Puzzle {
  return {
    rows: 2,
    cols: 2,
    numbers: new Map<Cell, number>([
      [0, 1],
      [3, 2],
    ]),
    walls: new Set(walls),
    solution: [0, 1, 3, 2],
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
    // wall between 2 and 3 makes the board unsolvable; from [0] there is no
    // completion, so hint must say backtrack (search exhausted, not exceeded).
    const puzzle = twoSolutionPuzzle([wallKey(2, 3)])
    expect(hint(puzzle, [0]).kind).toBe('backtrack')
  })

  it('AC8b: respects a legal but divergent prefix that still completes', () => {
    // canonical solution is 0-1-3-2; player diverged to [0,2] which still
    // completes via 0-2-3-1. hint must extend the REAL prefix, not force back.
    const puzzle = twoSolutionPuzzle()
    const h = hint(puzzle, [0, 2])
    expect(h).toEqual({ kind: 'extend', cell: 3 })
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
