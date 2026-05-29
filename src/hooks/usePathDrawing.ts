import { useCallback, useReducer, useRef } from 'react'
import { areAdjacent, hasWall } from '../game/grid'
import type { Cell, Puzzle } from '../game/types'
import type { ValidateResult } from '../game/validate'
import { validatePath } from '../game/validate'

// DOM-free drawing reducer so it stays unit-testable. State is minimal —
// `{ path }` — and every transition uses functional dispatch
// (rerender-functional-setstate). The transient pointer cell during a drag
// lives in a useRef in the hook, NOT in state, so only a committed path change
// triggers a render (rerender-use-ref-transient-values).

export type PathState = { path: Cell[] }

export type PathAction =
  | { type: 'start'; cell: Cell }
  | { type: 'extendTo'; cell: Cell }
  | { type: 'reset' }

/** The cell that carries checkpoint order 1 — the only legal place to begin. */
function startCell(puzzle: Puzzle): Cell | undefined {
  for (const [cell, order] of puzzle.numbers) {
    if (order === 1) return cell
  }
  return undefined
}

export function pathReducer(puzzle: Puzzle, state: PathState, action: PathAction): PathState {
  switch (action.type) {
    case 'start': {
      // Legal only on the order-1 cell, or as a no-op resume when the path
      // already contains the tapped cell as its head (re-grab to continue).
      const head = state.path.at(-1)
      if (head === action.cell) return state
      if (action.cell === startCell(puzzle)) return { path: [action.cell] }
      return state
    }
    case 'extendTo': {
      const { path } = state
      const head = path.at(-1)
      if (head === undefined) return state
      if (action.cell === head) return state

      // Moving onto the second-to-last cell BACKTRACKS: pop the head.
      const prev = path.at(-2)
      if (prev !== undefined && action.cell === prev) {
        return { path: path.slice(0, -1) }
      }

      // Otherwise append iff orthogonally adjacent, wall-free, and unvisited.
      if (!areAdjacent(head, action.cell, puzzle.cols)) return state
      if (hasWall(puzzle.walls, head, action.cell)) return state
      if (path.includes(action.cell)) return state
      return { path: [...path, action.cell] }
    }
    case 'reset':
      return { path: [] }
    default:
      return state
  }
}

export type UsePathDrawing = {
  path: readonly Cell[]
  /** Derived DURING RENDER, never via useEffect (rerender-derived-state-no-effect). */
  isComplete: boolean
  validation: ValidateResult
  start: (cell: Cell) => void
  extendTo: (cell: Cell) => void
  reset: () => void
  /** Transient pointer cell under the finger; read imperatively, never rendered. */
  pointerRef: React.RefObject<Cell | null>
}

export function usePathDrawing(puzzle: Puzzle): UsePathDrawing {
  const reducer = useCallback(
    (state: PathState, action: PathAction) => pathReducer(puzzle, state, action),
    [puzzle],
  )
  const [state, dispatch] = useReducer(reducer, { path: [] })

  // Transient drag position — committed path drives rendering, this does not.
  const pointerRef = useRef<Cell | null>(null)

  const start = useCallback((cell: Cell) => dispatch({ type: 'start', cell }), [])
  const extendTo = useCallback((cell: Cell) => dispatch({ type: 'extendTo', cell }), [])
  const reset = useCallback(() => dispatch({ type: 'reset' }), [])

  // Derived state computed in render — no effect, no extra setState.
  const validation = validatePath(puzzle, state.path)
  const isComplete = validation.complete

  return {
    path: state.path,
    isComplete,
    validation,
    start,
    extendTo,
    reset,
    pointerRef,
  }
}
