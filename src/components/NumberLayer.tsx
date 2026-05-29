import { memo } from 'react'
import { toCoord } from '../game/grid'
import type { Cell } from '../game/types'

// Checkpoint numbers, drawn in the SVG overlay ABOVE the path line so a path
// that crosses a numbered cell never hides its number (z-order fix). Coords are
// integers (rendering-svg-precision); the board viewBox is square so the
// circles stay circular under preserveAspectRatio="none".

type NumberLayerProps = {
  numbers: Map<Cell, number>
  /** how many checkpoints the path has reached in order (drives the filled look). */
  reachedThrough: number
  cols: number
  pitch: number
  half: number
}

function NumberLayerImpl({ numbers, reachedThrough, cols, pitch, half }: NumberLayerProps) {
  const radius = Math.round(pitch * 0.3)
  const fontSize = Math.round(pitch * 0.4)
  const items: React.ReactElement[] = []

  for (const [cell, order] of numbers) {
    const { r, c } = toCoord(cell, cols)
    const cx = Math.round(c * pitch + half)
    const cy = Math.round(r * pitch + half)
    const reached = order <= reachedThrough
    items.push(
      <g key={cell} data-number={order}>
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill={reached ? 'var(--color-accent)' : 'var(--color-bg-card-hover)'}
          stroke={reached ? 'var(--color-accent)' : 'rgba(255, 255, 255, 0.16)'}
          strokeWidth={2}
        />
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="var(--font-mono)"
          fontWeight={700}
          fontSize={fontSize}
          fill={reached ? '#0a0a0a' : 'var(--color-text)'}
        >
          {order}
        </text>
      </g>,
    )
  }

  return <g>{items}</g>
}

export const NumberLayer = memo(NumberLayerImpl)
