// Core puzzle types. This module is pure data — no React, no Math.random/Date
// (see AC26 determinism guard). A cell is an integer index `r * cols + c`.

export type Cell = number

export type Coord = { r: number; c: number }

/** Canonical key for the wall between two orthogonally-adjacent cells. */
export type WallKey = string

export type Puzzle = {
  rows: number
  cols: number
  /** cell index -> 1-based checkpoint order. */
  numbers: Map<Cell, number>
  /** walls block movement across the edge between two adjacent cells. */
  walls: Set<WallKey>
  /** a canonical Hamiltonian path that is *a* valid solution (by construction). */
  solution: Cell[]
  meta: PuzzleMeta
}

export type PuzzleMeta = {
  gameNumber: number
  /** true only once a bounded solver has confirmed a single solution. */
  unique: boolean
  difficultyScore: number
}

export type DifficultyParams = {
  rows: number
  cols: number
  checkpoints: number
  /** checkpoints / area — kept above MIN_CHECKPOINT_FLOOR for all N. */
  checkpointRatio: number
  /** fraction of free (non-solution) edges turned into walls. */
  wallDensity: number
  requireUnique: boolean
  /** score-only multiplier (NOT part of difficultyScore). */
  timePressure: number
}
