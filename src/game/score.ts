import { paramsFor } from './difficulty'

// Rewarding, fast-progressing scoring. Stars reward speed and no-hint solves;
// the per-level base score scales with intrinsic difficulty and the
// time-pressure multiplier (which lives here, NOT in difficultyScore — P2.7).

export type LevelResult = {
  stars: 1 | 2 | 3
  score: number
}

/** Seconds under which a solve still earns 3 / 2 stars, scaled by board size. */
function starThresholds(gameNumber: number): { three: number; two: number } {
  const p = paramsFor(gameNumber)
  const area = p.rows * p.cols
  // bigger boards get more time; hints knock a star off regardless.
  const three = area * 0.6
  const two = area * 1.4
  return { three, two }
}

export function scoreLevel(gameNumber: number, timeMs: number, hintsUsed: number): LevelResult {
  const p = paramsFor(gameNumber)
  const seconds = timeMs / 1000
  const { three, two } = starThresholds(gameNumber)

  let stars: 1 | 2 | 3 = 1
  if (hintsUsed === 0 && seconds <= three) stars = 3
  else if (seconds <= two) stars = 2

  const area = p.rows * p.cols
  const base = 100 + area * 5
  const speedBonus = Math.max(0, Math.round((two - seconds) * 4))
  const hintPenalty = hintsUsed * 25
  const score = Math.max(0, Math.round((base + speedBonus - hintPenalty) * p.timePressure))

  return { stars, score }
}
