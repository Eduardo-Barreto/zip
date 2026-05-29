import { useCallback, useEffect, useRef, useState } from 'react'
import { areAdjacent, hasWall } from '../game/grid'
import type { Cell, Puzzle } from '../game/types'

// Adapter: the Board owns its drawing state internally and exposes the drawn
// path to the DOM only (cells carry data-on-path). This hook bridges that DOM
// signal back to sibling chrome (ProgressBar, HintButton) WITHOUT touching the
// Board, by reading the on-path cell set and reconstructing the ordered prefix.
//
// The prefix order is recoverable because a legal drawn path is a simple chain:
// start from the order-1 checkpoint and walk to the unique unvisited on-path
// orthogonal neighbour each step. `filled` (cells drawn) is tracked reactively
// via a MutationObserver scoped to the board subtree.

export type UseBoardPath = {
  /** Number of cells currently on the drawn path. */
  filled: number
  /** Reconstruct the player's ordered path prefix from the DOM, on demand. */
  getPrefix: () => Cell[]
}

function onPathCells(board: HTMLElement): Set<Cell> {
  const set = new Set<Cell>()
  const nodes = board.querySelectorAll<HTMLElement>('[data-cell][data-on-path]')
  for (const node of nodes) {
    const raw = node.dataset.cell
    if (raw === undefined) continue
    const idx = Number(raw)
    if (Number.isInteger(idx)) set.add(idx)
  }
  return set
}

function startCell(puzzle: Puzzle): Cell | undefined {
  for (const [cell, order] of puzzle.numbers) {
    if (order === 1) return cell
  }
  return undefined
}

/** Walk the on-path set as a chain from the order-1 cell into an ordered prefix. */
function reconstructPrefix(puzzle: Puzzle, members: Set<Cell>): Cell[] {
  const start = startCell(puzzle)
  if (start === undefined || !members.has(start)) return []

  const ordered: Cell[] = [start]
  const visited = new Set<Cell>([start])
  let head = start

  while (ordered.length < members.size) {
    let next: Cell | undefined
    for (const cand of members) {
      if (visited.has(cand)) continue
      if (!areAdjacent(head, cand, puzzle.cols)) continue
      if (hasWall(puzzle.walls, head, cand)) continue
      next = cand
      break
    }
    if (next === undefined) break
    ordered.push(next)
    visited.add(next)
    head = next
  }
  return ordered
}

export function useBoardPath(
  boardRef: React.RefObject<HTMLElement | null>,
  puzzle: Puzzle,
): UseBoardPath {
  const [filled, setFilled] = useState(0)
  const puzzleRef = useRef(puzzle)
  puzzleRef.current = puzzle

  useEffect(() => {
    const board = boardRef.current
    if (board === null) return
    const update = () => setFilled(onPathCells(board).size)
    update()
    const observer = new MutationObserver(update)
    observer.observe(board, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-on-path'],
    })
    return () => observer.disconnect()
  }, [boardRef])

  const getPrefix = useCallback((): Cell[] => {
    const board = boardRef.current
    if (board === null) return []
    return reconstructPrefix(puzzleRef.current, onPathCells(board))
  }, [boardRef])

  return { filled, getPrefix }
}
