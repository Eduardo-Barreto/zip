import type { DifficultyParams } from './types'

// --- Difficulty model (INFINITE progression) ----------------------------------
// paramsFor(N) is total (defined for every N >= 1), pure, and never throws.
// The grid grows to a performance clamp; past the clamp, difficulty keeps
// rising via wall density and checkpoint count. difficultyScore(N) is monotonic
// non-decreasing and built ONLY from intrinsic axes (timePressure excluded).

export const MIN_SIDE = 4
export const MAX_SIDE = 7
export const MAX_GRID_AREA = MAX_SIDE * MAX_SIDE // 49
/** grids up to this area fit the bounded solver's budget. */
export const UNIQUE_CEILING = 64
/**
 * Invariant (AC6b): the clamped steady-state grid is always small enough for
 * the bounded solver, so uniqueness is requestable forever. Enforced at module
 * load (fail-fast) and asserted in the AC6b test.
 */
export const STEADY_STATE_UNIQUE: boolean = MAX_GRID_AREA <= UNIQUE_CEILING
if (!STEADY_STATE_UNIQUE) {
  throw new Error(`invariant violated: MAX_GRID_AREA (${MAX_GRID_AREA}) must be <= UNIQUE_CEILING`)
}
/** N at/above which the grid is fully clamped (steady state). */
export const CLAMP_THRESHOLD = (MAX_SIDE - MIN_SIDE) * 3 + 1 // 10

export const MIN_CHECKPOINT_FLOOR = 0.1
export const WALL_DENSITY_CAP = 0.45
const CHECKPOINT_RATIO_CAP = 0.45

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x))
}
function clampInt(x: number, lo: number, hi: number): number {
  return Math.round(clamp(x, lo, hi))
}

export function paramsFor(N: number): DifficultyParams {
  const n = Math.max(1, Math.floor(N))

  const side = clampInt(MIN_SIDE + Math.floor((n - 1) / 3), MIN_SIDE, MAX_SIDE)
  const rows = side
  const cols = side
  const area = rows * cols

  // checkpoint count grows with N; round of a non-decreasing product stays
  // non-decreasing, so `checkpoints` never dips as N increases.
  const ratioTarget = Math.min(0.12 + 0.01 * (n - 1), CHECKPOINT_RATIO_CAP)
  const checkpoints = clampInt(area * ratioTarget, 3, area - 1)
  const checkpointRatio = checkpoints / area

  const wallDensity = clamp(0.01 * (n - 1), 0, WALL_DENSITY_CAP)
  const requireUnique = area <= UNIQUE_CEILING
  const timePressure = 1 + Math.min((n - 1) * 0.02, 2)

  return { rows, cols, checkpoints, checkpointRatio, wallDensity, requireUnique, timePressure }
}

/**
 * Monotonic non-decreasing difficulty metric over INTRINSIC axes only
 * (grid area, wall density, checkpoint count, uniqueness) — timePressure is a
 * score multiplier and is deliberately excluded (P2.7), so the AC5 monotonicity
 * test measures real puzzle hardness, not a trivially rising proxy.
 */
export function difficultyScore(N: number): number {
  const p = paramsFor(N)
  const area = p.rows * p.cols
  return (
    0.4 * (area / MAX_GRID_AREA) +
    0.3 * (p.wallDensity / WALL_DENSITY_CAP) +
    0.3 * (p.checkpoints / MAX_GRID_AREA)
  )
}
