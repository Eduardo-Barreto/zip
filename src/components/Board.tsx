import { useEffect, useMemo, useRef } from 'react'
import type { Cell as CellIndex, Puzzle } from '../game/types'
import { usePathDrawing } from '../hooks/usePathDrawing'
import { Cell } from './Cell'
import { NumberLayer } from './NumberLayer'
import { PathLine } from './PathLine'
import { WallEdges } from './WallEdges'

// The board is the hero. A CSS grid of backdrop tiles with one SVG overlay on
// top for the drawn path + walls. Pointer Events (down/move/up) with
// setPointerCapture and preventDefault keep a drag from scrolling the page
// (AC15); the surface carries `board-surface` (globals.css sets
// touch-action:none there). Cells map from pointer coordinates via
// elementFromPoint reading the data-cell attribute.
//
// e2e note (AC11/AC15, wired in a later Playwright step): the board has
// data-testid='board' and each tile data-cell={index}; a continuous drag over
// the surface must keep frames <=16ms and must not scroll the page.

// Internal SVG coordinate space; integer pitch keeps path/wall coords integral
// (rendering-svg-precision). Actual on-screen size is driven by CSS (vmin).
const SVG_PITCH = 100
const SVG_HALF = 50

type BoardProps = {
  puzzle: Puzzle
  onSolved: () => void
}

function cellFromPoint(boardEl: HTMLElement, x: number, y: number): CellIndex | undefined {
  const target = boardEl.ownerDocument.elementFromPoint(x, y)
  if (!(target instanceof HTMLElement)) return undefined
  const tile = target.closest('[data-cell]')
  if (!(tile instanceof HTMLElement) || !boardEl.contains(tile)) return undefined
  const raw = tile.dataset.cell
  if (raw === undefined) return undefined
  const idx = Number(raw)
  return Number.isInteger(idx) ? idx : undefined
}

export function Board({ puzzle, onSolved }: BoardProps) {
  const { rows, cols } = puzzle
  const { path, isComplete, validation, start, extendTo, reset, pointerRef } =
    usePathDrawing(puzzle)

  const boardRef = useRef<HTMLDivElement>(null)

  // Derived in render (rerender-derived-state-no-effect): which cells lie on
  // the path, and how many checkpoints the path has reached in order.
  const onPath = useMemo(() => new Set<CellIndex>(path), [path])
  const reachedThrough = useMemo(() => {
    let count = 0
    for (const cell of path) {
      const order = puzzle.numbers.get(cell)
      if (order === count + 1) count++
    }
    return count
  }, [path, puzzle.numbers])

  const solved = isComplete && validation.valid

  // Firing the parent callback is a genuine side effect (not derived state), so
  // it belongs in an effect, guarded so it fires once per solve transition.
  const firedRef = useRef(false)
  useEffect(() => {
    if (solved && !firedRef.current) {
      firedRef.current = true
      onSolved()
    } else if (!solved) {
      firedRef.current = false
    }
  }, [solved, onSolved])

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault()
    const board = boardRef.current
    if (board === null) return
    board.setPointerCapture(e.pointerId)
    const cell = cellFromPoint(board, e.clientX, e.clientY)
    if (cell === undefined) return
    pointerRef.current = cell
    // Begin from the order-1 cell, or resume if grabbing the current head.
    if (path.length === 0) {
      start(cell)
    } else if (cell === path.at(-1)) {
      // resume drag from head — no state change
    } else {
      extendTo(cell)
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!e.buttons && e.pointerType === 'mouse') return
    e.preventDefault()
    const board = boardRef.current
    if (board === null) return
    const cell = cellFromPoint(board, e.clientX, e.clientY)
    if (cell === undefined || cell === pointerRef.current) return
    pointerRef.current = cell
    extendTo(cell)
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault()
    const board = boardRef.current
    if (board?.hasPointerCapture(e.pointerId)) {
      board.releasePointerCapture(e.pointerId)
    }
    pointerRef.current = null
  }

  const viewW = cols * SVG_PITCH
  const viewH = rows * SVG_PITCH

  const cells: React.ReactElement[] = []
  for (let i = 0; i < rows * cols; i++) {
    cells.push(<Cell key={i} index={i} onPath={onPath.has(i)} />)
  }

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div
        ref={boardRef}
        data-testid="board"
        data-solved={solved ? 'true' : 'false'}
        className="board-surface relative w-full touch-none"
        // Square board that fits ANY screen: full container width, capped so its
        // (equal) height never exceeds the available viewport height. Works on
        // mobile and desktop without cropping.
        style={{ maxWidth: 'min(54vh, 520px)', aspectRatio: '1' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div
          className="grid h-full w-full gap-[2px]"
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
          }}
        >
          {cells}
        </div>
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox={`0 0 ${viewW} ${viewH}`}
          preserveAspectRatio="none"
          aria-hidden="true"
          role="presentation"
        >
          <WallEdges walls={puzzle.walls} cols={cols} pitch={SVG_PITCH} half={SVG_HALF} />
          <PathLine path={path} cols={cols} pitch={SVG_PITCH} half={SVG_HALF} complete={solved} />
          <NumberLayer
            numbers={puzzle.numbers}
            reachedThrough={reachedThrough}
            cols={cols}
            pitch={SVG_PITCH}
            half={SVG_HALF}
          />
        </svg>
      </div>
      <button
        type="button"
        onClick={reset}
        className="card-lift rounded-lg px-4 py-2 text-[15px] text-[var(--color-text-muted)] active:scale-95"
        style={{
          backgroundColor: 'var(--color-bg-card)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
        }}
      >
        Recomeçar
      </button>
    </div>
  )
}
