import { describe, expect, it } from 'vitest'
import { wallKey } from '../../src/game/grid'
import type { Cell, Puzzle } from '../../src/game/types'
import { validatePath } from '../../src/game/validate'

// 2x2 board: cells 0=(0,0) 1=(0,1) 2=(1,0) 3=(1,1). Numbers: 1@0, 2@2 — the
// max number sits on the cell where the solution path ENDS (0->1->3->2), so a
// win must finish there.
function makePuzzle(walls: string[] = []): Puzzle {
  return {
    rows: 2,
    cols: 2,
    numbers: new Map<Cell, number>([
      [0, 1],
      [2, 2],
    ]),
    walls: new Set(walls),
    solution: [0, 1, 3, 2],
    meta: { gameNumber: 0, seed: 0, unique: false, difficultyScore: 0 },
  }
}

describe('validatePath (AC7) — one case per rejection reason', () => {
  it('accepts a correct complete solution ending on the max number', () => {
    expect(validatePath(makePuzzle(), [0, 1, 3, 2])).toEqual({ complete: true, valid: true })
  })

  it('rejects a missing cell (incomplete)', () => {
    expect(validatePath(makePuzzle(), [0, 1, 3]).reason).toBe('incomplete')
  })

  it('rejects a repeated cell', () => {
    expect(validatePath(makePuzzle(), [0, 1, 1, 3]).reason).toBe('repeat')
  })

  it('rejects a non-adjacent jump', () => {
    // 0=(0,0) to 3=(1,1) is diagonal — not orthogonally adjacent.
    expect(validatePath(makePuzzle(), [0, 3, 1, 2]).reason).toBe('not-adjacent')
  })

  it('rejects crossing a wall', () => {
    const p = makePuzzle([wallKey(0, 1)])
    expect(validatePath(p, [0, 1, 3, 2]).reason).toBe('crosses-wall')
  })

  it('rejects wrong number order', () => {
    // visiting 2 (order 2) before 0 (order 1)
    expect(validatePath(makePuzzle(), [2, 3, 1, 0]).reason).toBe('number-order')
  })

  it('rejects a full, in-order path that does NOT end on the max number', () => {
    // 0->2->3->1 covers all and hits 1 then 2 in order, but ends on cell 1,
    // not the max-number cell 2 — not a win.
    expect(validatePath(makePuzzle(), [0, 2, 3, 1]).reason).toBe('end-not-on-max')
  })
})
