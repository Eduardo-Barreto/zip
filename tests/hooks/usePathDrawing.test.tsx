import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { wallKey } from '../../src/game/grid'
import type { Cell, Puzzle } from '../../src/game/types'
import { pathReducer, usePathDrawing } from '../../src/hooks/usePathDrawing'

// 2x2 board: cells 0=(0,0) 1=(0,1) 2=(1,0) 3=(1,1). Numbers 1@0, max 2@2 — the
// solution 0->1->3->2 ends on the max number.
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
    meta: { gameNumber: 0, unique: false, difficultyScore: 0 },
  }
}

describe('pathReducer (DOM-free)', () => {
  it('starts only on the order-1 cell', () => {
    const p = makePuzzle()
    expect(pathReducer(p, { path: [] }, { type: 'start', cell: 1 })).toEqual({ path: [] })
    expect(pathReducer(p, { path: [] }, { type: 'start', cell: 0 })).toEqual({ path: [0] })
  })

  it('extends to a legal adjacent, wall-free, unvisited cell', () => {
    const p = makePuzzle()
    expect(pathReducer(p, { path: [0] }, { type: 'extendTo', cell: 1 })).toEqual({ path: [0, 1] })
  })

  it('rejects a non-adjacent (diagonal) extend', () => {
    const p = makePuzzle()
    expect(pathReducer(p, { path: [0] }, { type: 'extendTo', cell: 3 })).toEqual({ path: [0] })
  })

  it('rejects an extend across a wall', () => {
    const p = makePuzzle([wallKey(0, 1)])
    expect(pathReducer(p, { path: [0] }, { type: 'extendTo', cell: 1 })).toEqual({ path: [0] })
  })

  it('rejects an extend onto an already-visited cell', () => {
    const p = makePuzzle()
    expect(pathReducer(p, { path: [0, 1, 3] }, { type: 'extendTo', cell: 0 })).toEqual({
      path: [0, 1, 3],
    })
  })

  it('BACKTRACKS when moving onto the second-to-last cell (pops the head)', () => {
    const p = makePuzzle()
    expect(pathReducer(p, { path: [0, 1, 3] }, { type: 'extendTo', cell: 1 })).toEqual({
      path: [0, 1],
    })
  })

  it('reset clears the path', () => {
    const p = makePuzzle()
    expect(pathReducer(p, { path: [0, 1] }, { type: 'reset' })).toEqual({ path: [] })
  })
})

describe('checkpoint order enforcement (blocks 1 -> 9 skips)', () => {
  // 2x2, numbers 1@0, 2@2, max 3@1. From the start you may step onto 2 (next in
  // order) but NOT onto 3 (out of order).
  function orderPuzzle(): Puzzle {
    return {
      rows: 2,
      cols: 2,
      numbers: new Map<Cell, number>([
        [0, 1],
        [2, 2],
        [1, 3],
      ]),
      walls: new Set<string>(),
      solution: [0, 2, 3, 1],
      meta: { gameNumber: 0, unique: false, difficultyScore: 0 },
    }
  }

  it('rejects stepping onto a numbered cell out of order', () => {
    const p = orderPuzzle()
    // cell 1 carries order 3; from [0] the next expected is 2, so it is blocked.
    expect(pathReducer(p, { path: [0] }, { type: 'extendTo', cell: 1 })).toEqual({ path: [0] })
  })

  it('allows stepping onto the next number in order', () => {
    const p = orderPuzzle()
    expect(pathReducer(p, { path: [0] }, { type: 'extendTo', cell: 2 })).toEqual({ path: [0, 2] })
  })
})

describe('usePathDrawing (hook)', () => {
  it('derives isComplete/validation during render', () => {
    const p = makePuzzle()
    const { result } = renderHook(() => usePathDrawing(p))

    expect(result.current.path).toEqual([])
    expect(result.current.isComplete).toBe(false)
    expect(result.current.validation.valid).toBe(false)

    act(() => result.current.start(0))
    act(() => result.current.extendTo(1))
    act(() => result.current.extendTo(3))
    act(() => result.current.extendTo(2))

    expect(result.current.path).toEqual([0, 1, 3, 2])
    expect(result.current.isComplete).toBe(true)
    expect(result.current.validation).toEqual({ complete: true, valid: true })
  })

  it('backtracks through the hook when re-touching the second-to-last cell', () => {
    const p = makePuzzle()
    const { result } = renderHook(() => usePathDrawing(p))

    act(() => result.current.start(0))
    act(() => result.current.extendTo(1))
    act(() => result.current.extendTo(3))
    expect(result.current.path).toEqual([0, 1, 3])

    act(() => result.current.extendTo(1))
    expect(result.current.path).toEqual([0, 1])
  })

  it('rejects an illegal extend through the hook', () => {
    const p = makePuzzle()
    const { result } = renderHook(() => usePathDrawing(p))

    act(() => result.current.start(0))
    act(() => result.current.extendTo(3)) // diagonal — rejected
    expect(result.current.path).toEqual([0])
  })
})
