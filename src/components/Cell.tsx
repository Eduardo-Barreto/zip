import { memo } from 'react'
import type { Cell as CellIndex } from '../game/types'

// Module-top-level, memoized per cell (rerender-no-inline-components,
// rerender-memo). A thundle-style elevated tile: rounded raised surface with a
// hairline edge, animated in with a staggered `tile-in` flip keyed off the cell
// index. The drawn path is the SVG layer above; the number badges are a SVG
// layer ABOVE the path (NumberLayer) so a crossing path never hides a number.
// data-cell / data-on-path keep the DOM e2e-friendly and let sibling chrome
// read the drawn path.

type CellProps = {
  index: CellIndex
  /** true if this cell is currently on the drawn path. */
  onPath: boolean
}

// Cap the cascade so large boards still finish their entrance quickly.
const STAGGER_MS = 12
const MAX_DELAY_MS = 360

function CellImpl({ index, onPath }: CellProps) {
  const delay = Math.min(index * STAGGER_MS, MAX_DELAY_MS)
  return (
    <div
      data-cell={index}
      data-on-path={onPath ? 'true' : undefined}
      className="rounded-[10px]"
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
    />
  )
}

export const Cell = memo(CellImpl)
