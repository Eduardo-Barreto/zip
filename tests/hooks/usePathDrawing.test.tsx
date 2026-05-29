import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { wallKey } from '../../src/game/grid'
import type { Cell, Puzzle } from '../../src/game/types'
import { pathReducer, usePathDrawing } from '../../src/hooks/usePathDrawing'

// Tiny hand-built 2x2 board (same shape as validate.test): cells
// 0=(0,0) 1=(0,1) 2=(1,0) 3=(1,1). Numbers: 1@0, 2@3. Solution 0->1->3->2.
function makePuzzle(walls: string[] = []): Puzzle {
  return {
    rows: 2,
    cols: 2,
    numbers: new Map<Cell, number>([
      [0, 1],
      [3, 2],
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
    // 0=(0,0) to 3=(1,1) is diagonal.
    expect(pathReducer(p, { path: [0] }, { type: 'extendTo', cell: 3 })).toEqual({ path: [0] })
  })

  it('rejects an extend across a wall', () => {
    const p = makePuzzle([wallKey(0, 1)])
    expect(pathReducer(p, { path: [0] }, { type: 'extendTo', cell: 1 })).toEqual({ path: [0] })
  })

  it('rejects an extend onto an already-visited cell', () => {
    const p = makePuzzle()
    // head=3, prev=1; revisiting 0 (not the second-to-last) is rejected.
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
