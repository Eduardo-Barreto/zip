import { orthoNeighbors, toIndex } from './grid'
import type { Prng } from './prng'
import type { Cell } from './types'

/** Backbite steps per cell. Higher = more randomised paths, still O(area). */
export const BACKBITE_FACTOR = 4

/**
 * Boustrophedon ("snake") Hamiltonian path — always exists on a rectangle and
 * is our deterministic starting point before randomisation.
 */
export function snakePath(rows: number, cols: number): Cell[] {
  const path: Cell[] = []
  for (let r = 0; r < rows; r++) {
    if (r % 2 === 0) {
      for (let c = 0; c < cols; c++) path.push(toIndex(r, c, cols))
    } else {
      for (let c = cols - 1; c >= 0; c--) path.push(toIndex(r, c, cols))
    }
  }
  return path
}

/**
 * Random Hamiltonian path via the "backbite" Markov move (Mansfield). Starting
 * from a snake, each step picks an endpoint, picks a random grid-neighbour `u`
 * of it, and — if `u` is not already the path-neighbour — reconnects by
 * reversing the segment past `u`. Every move preserves the Hamiltonian property
 * (each cell once, consecutive cells orthogonally adjacent). The loop runs a
 * FIXED number of steps S = BACKBITE_FACTOR * area; a step with no valid move
 * is a no-op (no retry, no inner loop), so it is provably O(S) and always
 * terminates in exactly S iterations (AC2b/AC2c).
 */
export function hamiltonianPath(rows: number, cols: number, prng: Prng): Cell[] {
  const path = snakePath(rows, cols)
  const n = path.length
  if (n <= 2) return path

  // pos[cell] = current index in path, kept in sync on every reversal.
  const pos = new Array<number>(n)
  for (let i = 0; i < n; i++) pos[path[i] as Cell] = i

  const steps = BACKBITE_FACTOR * n
  for (let s = 0; s < steps; s++) {
    backbiteStep(path, pos, rows, cols, prng)
  }
  return path
}

/** Returns the number of steps a backbite run performs for a given area. */
export function backbiteSteps(rows: number, cols: number): number {
  return BACKBITE_FACTOR * rows * cols
}

function backbiteStep(path: Cell[], pos: number[], rows: number, cols: number, prng: Prng): void {
  const n = path.length
  const useTail = prng.int(2) === 0
  const endIdx = useTail ? n - 1 : 0
  const endCell = path[endIdx] as Cell
  const neighbors = orthoNeighbors(endCell, rows, cols)
  const u = prng.pick(neighbors)
  const i = pos[u] as number

  if (useTail) {
    // u is the immediate predecessor (or the endpoint) -> existing edge, no-op.
    if (i >= n - 2) return
    reverseSegment(path, pos, i + 1, n - 1)
  } else {
    // u is the immediate successor (or the endpoint) -> existing edge, no-op.
    if (i <= 1) return
    reverseSegment(path, pos, 0, i - 1)
  }
}

function reverseSegment(path: Cell[], pos: number[], lo: number, hi: number): void {
  let l = lo
  let h = hi
  while (l < h) {
    const a = path[l] as Cell
    const b = path[h] as Cell
    path[l] = b
    path[h] = a
    pos[b] = l
    pos[a] = h
    l++
    h--
  }
}
