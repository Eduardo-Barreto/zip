import { hasWall, orthoNeighbors } from './grid'
import type { Cell, Puzzle } from './types'

/** Node budget bounds the NP-hard search so it never hangs the UI or vitest. */
const SOLVER_NODE_BUDGET = 200_000

export type CountResult = 'none' | 'unique' | 'multiple' | 'budget_exceeded'

export type Hint =
  | { kind: 'extend'; cell: Cell } // prefix is solvable; play this next cell
  | { kind: 'backtrack' } // proven dead-end within budget; undo
  | { kind: 'unknown' } // budget exceeded; cannot prove either way

type SolverCtx = {
  rows: number
  cols: number
  area: number
  neighbors: Cell[][]
  numbers: Map<Cell, number>
  totalNumbers: number
  /** the cell carrying the max order; a solution MUST end here. */
  maxCell: Cell | undefined
  walls: Puzzle['walls']
  budget: number
}

function makeCtx(puzzle: Puzzle, budget: number): SolverCtx {
  const { rows, cols } = puzzle
  const area = rows * cols
  const neighbors: Cell[][] = new Array(area)
  for (let cell = 0; cell < area; cell++) neighbors[cell] = orthoNeighbors(cell, rows, cols)
  const total = puzzle.numbers.size
  let maxCell: Cell | undefined
  for (const [cell, order] of puzzle.numbers) {
    if (order === total) maxCell = cell
  }
  return {
    rows,
    cols,
    area,
    neighbors,
    numbers: puzzle.numbers,
    totalNumbers: total,
    maxCell,
    walls: puzzle.walls,
    budget,
  }
}

/** A completed path counts as a solution only if it ends on the max number. */
function isWin(ctx: SolverCtx, cell: Cell, nextExpected: number): boolean {
  if (nextExpected !== ctx.totalNumbers + 1) return false
  return ctx.maxCell === undefined || cell === ctx.maxCell
}

function startCell(puzzle: Puzzle): Cell | null {
  for (const [cell, order] of puzzle.numbers) if (order === 1) return cell
  return null
}

/**
 * Count distinct solutions up to `cap`, bounded by the node budget (AC9).
 * Returns 'budget_exceeded' rather than hanging when the search is too large.
 */
export function countSolutions(puzzle: Puzzle, cap = 2, budget = SOLVER_NODE_BUDGET): CountResult {
  const ctx = makeCtx(puzzle, budget)
  const start = startCell(puzzle)
  if (start === null) return 'none'

  const visited = new Uint8Array(ctx.area)
  let count = 0
  let nodes = 0
  let exceeded = false

  function dfs(cell: Cell, depth: number, nextExpected: number): void {
    if (exceeded || count >= cap) return
    nodes++
    if (nodes > ctx.budget) {
      exceeded = true
      return
    }
    if (depth === ctx.area) {
      if (isWin(ctx, cell, nextExpected)) count++
      return
    }
    const nbrs = ctx.neighbors[cell] ?? []
    for (const nb of nbrs) {
      if (visited[nb]) continue
      if (hasWall(ctx.walls, cell, nb)) continue
      const ord = ctx.numbers.get(nb)
      let ne = nextExpected
      if (ord !== undefined) {
        if (ord !== nextExpected) continue
        ne = nextExpected + 1
      }
      visited[nb] = 1
      dfs(nb, depth + 1, ne)
      visited[nb] = 0
      if (exceeded || count >= cap) return
    }
  }

  visited[start] = 1
  dfs(start, 1, 2) // start carries order 1; next expected is 2

  if (exceeded) return 'budget_exceeded'
  if (count === 0) return 'none'
  if (count === 1) return 'unique'
  return 'multiple'
}

/**
 * Suggest the next move from the player's REAL prefix (P1.4), not the canonical
 * solution: a legal route that diverges from `solution` but still completes
 * must be respected. Returns:
 *  - extend: the prefix is solvable; here is the next cell of a completion;
 *  - backtrack: the prefix is a proven dead-end (search exhausted in budget);
 *  - unknown: the search exceeded the node budget (cannot prove either way).
 */
export function hint(puzzle: Puzzle, prefix: readonly Cell[], budget = SOLVER_NODE_BUDGET): Hint {
  const ctx = makeCtx(puzzle, budget)
  const start = startCell(puzzle)
  if (start === null) return { kind: 'backtrack' }

  if (prefix.length === 0) return { kind: 'extend', cell: start }

  // Replay the prefix to build `visited` and `nextExpected`, checking legality.
  const visited = new Uint8Array(ctx.area)
  let nextExpected = 1
  for (let i = 0; i < prefix.length; i++) {
    const cell = prefix[i]
    if (cell === undefined || cell < 0 || cell >= ctx.area) return { kind: 'backtrack' }
    if (visited[cell]) return { kind: 'backtrack' }
    if (i > 0) {
      const prev = prefix[i - 1] as Cell
      if (!areOrthoConnected(ctx, prev, cell)) return { kind: 'backtrack' }
    }
    const ord = ctx.numbers.get(cell)
    if (ord !== undefined) {
      if (ord !== nextExpected) return { kind: 'backtrack' }
      nextExpected++
    }
    visited[cell] = 1
  }

  const last = prefix[prefix.length - 1] as Cell
  let nodes = 0
  let exceeded = false

  function dfs(cell: Cell, depth: number, expected: number): boolean {
    if (exceeded) return false
    nodes++
    if (nodes > ctx.budget) {
      exceeded = true
      return false
    }
    if (depth === ctx.area) return isWin(ctx, cell, expected)
    const nbrs = ctx.neighbors[cell] ?? []
    for (const nb of nbrs) {
      if (visited[nb]) continue
      if (hasWall(ctx.walls, cell, nb)) continue
      const ord = ctx.numbers.get(nb)
      let ne = expected
      if (ord !== undefined) {
        if (ord !== expected) continue
        ne = expected + 1
      }
      visited[nb] = 1
      const ok = dfs(nb, depth + 1, ne)
      visited[nb] = 0
      if (ok) return true
      if (exceeded) return false
    }
    return false
  }

  // Try each legal next move from the player's last cell; the first that leads
  // to a completion is the suggested extension (keeps the player's own route).
  const nbrs = ctx.neighbors[last] ?? []
  for (const nb of nbrs) {
    if (visited[nb]) continue
    if (hasWall(ctx.walls, last, nb)) continue
    const ord = ctx.numbers.get(nb)
    let ne = nextExpected
    if (ord !== undefined) {
      if (ord !== nextExpected) continue
      ne = nextExpected + 1
    }
    visited[nb] = 1
    const ok = dfs(nb, prefix.length + 1, ne)
    visited[nb] = 0
    if (ok) return { kind: 'extend', cell: nb }
    if (exceeded) return { kind: 'unknown' }
  }

  return exceeded ? { kind: 'unknown' } : { kind: 'backtrack' }
}

function areOrthoConnected(ctx: SolverCtx, a: Cell, b: Cell): boolean {
  const nbrs = ctx.neighbors[a] ?? []
  if (!nbrs.includes(b)) return false
  return !hasWall(ctx.walls, a, b)
}
