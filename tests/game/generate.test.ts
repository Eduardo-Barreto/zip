import { describe, expect, it } from 'vitest'
import { canonicalPuzzle, generatePuzzle } from '../../src/game/generate'
import { validatePath } from '../../src/game/validate'

describe('generatePuzzle solvability by construction (AC2)', () => {
  for (const N of [1, 5, 10, 25, 50, 500, 10000]) {
    it(`N=${N}: the canonical solution validates`, () => {
      const puzzle = generatePuzzle(N)
      const res = validatePath(puzzle, puzzle.solution)
      expect(res.valid).toBe(true)
      expect(res.complete).toBe(true)
    })
  }

  it('numbers start at 1 and run 1..K with no gaps', () => {
    const puzzle = generatePuzzle(17)
    const orders = [...puzzle.numbers.values()].sort((a, b) => a - b)
    expect(orders[0]).toBe(1)
    expect(orders).toEqual(orders.map((_, i) => i + 1))
  })

  it('walls never sit on a solution edge', () => {
    const puzzle = generatePuzzle(40)
    for (let i = 1; i < puzzle.solution.length; i++) {
      const a = puzzle.solution[i - 1] as number
      const b = puzzle.solution[i] as number
      const key = a < b ? `${a}|${b}` : `${b}|${a}`
      expect(puzzle.walls.has(key)).toBe(false)
    }
  })
})

describe('generatePuzzle determinism via canonical serialization (AC3)', () => {
  for (const N of [1, 13, 50, 10000]) {
    it(`N=${N}: two generations are byte-identical after canonicalization`, () => {
      const a = canonicalPuzzle(generatePuzzle(N))
      const b = canonicalPuzzle(generatePuzzle(N))
      expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    })
  }

  it('canonical form sorts numbers by cell and walls by key', () => {
    const c = canonicalPuzzle(generatePuzzle(30))
    const cells = c.numbers.map(([cell]) => cell)
    expect(cells).toEqual([...cells].sort((x, y) => x - y))
    expect(c.walls).toEqual([...c.walls].sort())
  })
})
