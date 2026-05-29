import { memo } from 'react'
import type { Cell as CellIndex } from '../game/types'
import { NumberBadge } from './NumberBadge'

// Module-top-level, memoized per cell (rerender-no-inline-components,
// rerender-memo). Cells are plain backdrop tiles; the path line and walls are
// drawn in the SVG overlay above them. data-cell makes the DOM e2e-friendly.

type CellProps = {
  index: CellIndex
  order: number | undefined
  /** true if this cell is currently on the drawn path. */
  onPath: boolean
  /** true once the path has reached this checkpoint in order. */
  reached: boolean
}

function CellImpl({ index, order, onPath, reached }: CellProps) {
  return (
    <div
      data-cell={index}
      className="relative flex items-center justify-center rounded-[10px]"
      style={{
        backgroundColor: onPath ? 'var(--color-accent-dim)' : 'var(--color-surface)',
        border: '1px solid var(--color-line)',
        transition: 'background-color 150ms ease-out',
      }}
    >
      {order !== undefined ? <NumberBadge order={order} reached={reached} /> : null}
    </div>
  )
}

export const Cell = memo(CellImpl)
