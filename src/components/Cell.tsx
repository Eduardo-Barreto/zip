import { memo } from 'react'
import type { Cell as CellIndex } from '../game/types'
import { NumberBadge } from './NumberBadge'

// Module-top-level, memoized per cell (rerender-no-inline-components,
// rerender-memo). Cells are thundle-style elevated tiles: a rounded raised
// surface with a hairline white edge, animated in with a staggered `tile-in`
// flip keyed off the cell index. The path line and walls are drawn in the SVG
// overlay above them. data-cell keeps the DOM e2e-friendly.

type CellProps = {
  index: CellIndex
  order: number | undefined
  /** true if this cell is currently on the drawn path. */
  onPath: boolean
  /** true once the path has reached this checkpoint in order. */
  reached: boolean
}

// Cap the cascade so large boards still finish their entrance quickly.
const STAGGER_MS = 12
const MAX_DELAY_MS = 360

function CellImpl({ index, order, onPath, reached }: CellProps) {
  const delay = Math.min(index * STAGGER_MS, MAX_DELAY_MS)
  return (
    <div
      data-cell={index}
      data-on-path={onPath ? 'true' : undefined}
      className="relative flex items-center justify-center rounded-[10px]"
      style={{
        backgroundColor: onPath
          ? 'color-mix(in srgb, var(--color-accent) 22%, var(--color-bg-card))'
          : 'var(--color-bg-card)',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        boxShadow: onPath
          ? 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 0 0 1px color-mix(in srgb, var(--color-accent) 40%, transparent)'
          : 'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
        transition:
          'background-color 150ms cubic-bezier(0.23, 1, 0.32, 1), box-shadow 150ms cubic-bezier(0.23, 1, 0.32, 1)',
        animation: `tile-in 250ms cubic-bezier(0.23, 1, 0.32, 1) ${delay}ms both`,
      }}
    >
      {order !== undefined ? <NumberBadge order={order} reached={reached} /> : null}
    </div>
  )
}

export const Cell = memo(CellImpl)
