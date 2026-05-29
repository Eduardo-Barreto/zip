import { memo } from 'react'
import { toCoord } from '../game/grid'
import type { Cell } from '../game/types'

// Module-top-level, memoized (rerender-no-inline-components, rerender-memo).
// Renders the drawn path as a single rounded polyline in the SVG overlay.
// All coordinates are rounded to INTEGERS (rendering-svg-precision).

type PathLineProps = {
  path: readonly Cell[]
  cols: number
  /** centre-to-centre pixel pitch of one cell (including any gap). */
  pitch: number
  /** pixel offset of a cell's centre from its top-left corner. */
  half: number
  complete: boolean
}

function centerOf(cell: Cell, cols: number, pitch: number, half: number): [number, number] {
  const { r, c } = toCoord(cell, cols)
  return [Math.round(c * pitch + half), Math.round(r * pitch + half)]
}

function PathLineImpl({ path, cols, pitch, half, complete }: PathLineProps) {
  if (path.length === 0) return null

  const points = path.map((cell) => centerOf(cell, cols, pitch, half))
  const d = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ')

  const head = points.at(-1)

  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth={Math.round(pitch * 0.34)}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          opacity: complete ? 1 : 0.92,
          transition: 'opacity 180ms ease-out',
        }}
      />
      {head !== undefined ? (
        <circle cx={head[0]} cy={head[1]} r={Math.round(pitch * 0.2)} fill="var(--color-accent)" />
      ) : null}
    </g>
  )
}

export const PathLine = memo(PathLineImpl)
