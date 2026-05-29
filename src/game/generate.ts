import { paramsFor } from './difficulty'
import { toCoord, wallKey } from './grid'
import { hamiltonianPath } from './hamiltonian'
import { mulberry32 } from './prng'
import type { Cell, Puzzle, WallKey } from './types'

/**
 * Generate puzzle N. Solvability is guaranteed BY CONSTRUCTION: we build a real
 * Hamiltonian path, lay the numbered checkpoints in order along it (so the path
 * itself is a valid solution), and only ever add walls on edges the solution
 * does NOT use. Deterministic from `seed = gameNumber`. Fast and pure — the
 * (optional, bounded) uniqueness check runs later off the main thread, never
 * here, so generation stays within the perf budget (AC10).
 */
export function generatePuzzle(gameNumber: number): Puzzle {
  const prng = mulberry32(gameNumber >>> 0)
  const p = paramsFor(gameNumber)

  const solution = hamiltonianPath(p.rows, p.cols, prng)
  const numbers = placeCheckpoints(solution, p.checkpoints)
  const walls = placeWalls(solution, p.rows, p.cols, p.wallDensity, prng)

  return {
    rows: p.rows,
    cols: p.cols,
    numbers,
    walls,
    solution,
    meta: {
      gameNumber,
      unique: false, // set true only after a bounded solver confirms it
      difficultyScore: scoreOf(p.rows * p.cols, p.wallDensity, p.checkpoints),
    },
  }
}

function scoreOf(area: number, wallDensity: number, checkpoints: number): number {
  return 0.4 * (area / 49) + 0.3 * (wallDensity / 0.45) + 0.3 * (checkpoints / 49)
}

/** Evenly-spaced checkpoints along the solution path; order 1..K ascending. */
function placeCheckpoints(path: readonly Cell[], k: number): Map<Cell, number> {
  const n = path.length
  const count = Math.min(k, n)
  const numbers = new Map<Cell, number>()
  for (let i = 0; i < count; i++) {
    const idx = count === 1 ? 0 : Math.round((i * (n - 1)) / (count - 1))
    const cell = path[idx]
    if (cell !== undefined) numbers.set(cell, i + 1)
  }
  return numbers
}

/** Walls only on edges NOT used by the solution — never breaks solvability. */
function placeWalls(
  path: readonly Cell[],
  rows: number,
  cols: number,
  density: number,
  prng: ReturnType<typeof mulberry32>,
): Set<WallKey> {
  const pathEdges = new Set<WallKey>()
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i]
    const b = path[i + 1]
    if (a !== undefined && b !== undefined) pathEdges.add(wallKey(a, b))
  }

  const candidates: WallKey[] = []
  const area = rows * cols
  for (let cell = 0; cell < area; cell++) {
    const { r, c } = toCoord(cell, cols)
    if (c < cols - 1) {
      const key = wallKey(cell, cell + 1)
      if (!pathEdges.has(key)) candidates.push(key)
    }
    if (r < rows - 1) {
      const key = wallKey(cell, cell + cols)
      if (!pathEdges.has(key)) candidates.push(key)
    }
  }

  prng.shuffle(candidates)
  const take = Math.floor(density * candidates.length)
  return new Set(candidates.slice(0, take))
}

/**
 * Canonical, deterministic serialization (AC3). `JSON.stringify(Map)` yields
 * `{}` and Set iteration order is insertion-dependent, so any snapshot,
 * equality check, or transmission MUST go through this key-sorted form.
 */
export type CanonicalPuzzle = {
  rows: number
  cols: number
  numbers: Array<[Cell, number]>
  walls: WallKey[]
  solution: Cell[]
  meta: Puzzle['meta']
}

export function canonicalPuzzle(p: Puzzle): CanonicalPuzzle {
  const numbers = [...p.numbers.entries()].sort((a, b) => a[0] - b[0])
  const walls = [...p.walls].sort()
  return {
    rows: p.rows,
    cols: p.cols,
    numbers,
    walls,
    solution: [...p.solution],
    meta: p.meta,
  }
}
