import { areAdjacent, hasWall } from './grid'
import type { Cell, Puzzle } from './types'

export type ValidateReason =
  | 'incomplete' // a cell is missing (board not fully covered)
  | 'repeat' // a cell is visited twice
  | 'not-adjacent' // a jump between non-orthogonal cells
  | 'crosses-wall' // a step crosses a wall
  | 'number-order' // numbered cells not visited 1,2,3,…,K in order
  | 'end-not-on-max' // all cells filled & numbers in order, but the path does
// not END on the highest number (the win must finish on the last checkpoint)

export type ValidateResult = {
  complete: boolean
  valid: boolean
  reason?: ValidateReason
}

/**
 * A path is valid iff it is a complete, single, legal solution: covers every
 * cell exactly once, every step orthogonally adjacent and wall-free, and the
 * numbered cells appear in ascending order 1..K. Early-exits on the first
 * violation (js-early-exit) returning the specific reason (AC7).
 */
export function validatePath(puzzle: Puzzle, path: readonly Cell[]): ValidateResult {
  const area = puzzle.rows * puzzle.cols
  const seen = new Set<Cell>()
  let expected = 1

  for (let i = 0; i < path.length; i++) {
    const cell = path[i]
    if (cell === undefined) return fail('incomplete')
    if (seen.has(cell)) return fail('repeat')
    seen.add(cell)

    if (i > 0) {
      const prev = path[i - 1]
      if (prev === undefined || !areAdjacent(prev, cell, puzzle.cols)) return fail('not-adjacent')
      if (hasWall(puzzle.walls, prev, cell)) return fail('crosses-wall')
    }

    const ord = puzzle.numbers.get(cell)
    if (ord !== undefined) {
      if (ord !== expected) return fail('number-order')
      expected++
    }
  }

  if (seen.size !== area) return fail('incomplete')
  if (expected !== puzzle.numbers.size + 1) {
    return { complete: true, valid: false, reason: 'number-order' }
  }
  // The path must FINISH on the highest checkpoint: filling every cell in order
  // is not a win unless the last cell drawn is the max number (the generator
  // places it at the path end, so a real solution always can).
  const maxCell = maxOrderCell(puzzle)
  if (maxCell !== undefined && path[path.length - 1] !== maxCell) {
    return { complete: true, valid: false, reason: 'end-not-on-max' }
  }
  return { complete: true, valid: true }
}

/** The cell carrying the highest checkpoint order (order === numbers.size). */
function maxOrderCell(puzzle: Puzzle): Cell | undefined {
  const max = puzzle.numbers.size
  if (max === 0) return undefined
  for (const [cell, order] of puzzle.numbers) {
    if (order === max) return cell
  }
  return undefined
}

function fail(reason: ValidateReason): ValidateResult {
  return { complete: false, valid: false, reason }
}
