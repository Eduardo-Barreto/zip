import { describe, expect, it } from 'vitest'
import { paramsFor } from '../../src/game/difficulty'
import { areAdjacent } from '../../src/game/grid'
import { BACKBITE_FACTOR, backbiteSteps, hamiltonianPath } from '../../src/game/hamiltonian'
import { mulberry32 } from '../../src/game/prng'

function assertHamiltonian(path: number[], rows: number, cols: number) {
  const area = rows * cols
  // visits every cell exactly once
  expect(path.length).toBe(area)
  expect(new Set(path).size).toBe(area)
  for (const cell of path) {
    expect(cell).toBeGreaterThanOrEqual(0)
    expect(cell).toBeLessThan(area)
  }
  // every consecutive pair orthogonally adjacent
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1] as number
    const b = path[i] as number
    expect(areAdjacent(a, b, cols)).toBe(true)
  }
}

describe('hamiltonianPath invariant (AC2b)', () => {
  for (const N of [1, 5, 50, 10000]) {
    it(`is a true Hamiltonian path for N=${N} (independent of checkpoints/walls)`, () => {
      const p = paramsFor(N)
      const path = hamiltonianPath(p.rows, p.cols, mulberry32(N))
      assertHamiltonian(path, p.rows, p.cols)
    })
  }

  it('is deterministic for the same seed', () => {
    const a = hamiltonianPath(6, 6, mulberry32(123))
    const b = hamiltonianPath(6, 6, mulberry32(123))
    expect(a).toEqual(b)
  })
})

describe('backbite termination (AC2c)', () => {
  it('runs a fixed number of steps S = BACKBITE_FACTOR * area', () => {
    expect(backbiteSteps(7, 7)).toBe(BACKBITE_FACTOR * 49)
  })

  it('always terminates and yields a full path (no infinite loop)', () => {
    // if the loop did not terminate this test would hang; reaching the
    // assertion proves the fixed-S loop returns.
    const path = hamiltonianPath(7, 7, mulberry32(2024))
    expect(path.length).toBe(49)
  })
})
