import { memo } from 'react'
import { toCoord } from '../game/grid'
import type { WallKey } from '../game/types'

// Module-top-level, memoized (rerender-no-inline-components, rerender-memo).
// Draws each wall as a thick segment on the shared edge between two adjacent
// cells. Coordinates rounded to INTEGERS (rendering-svg-precision).

type WallEdgesProps = {
  walls: Set<WallKey>
  cols: number
  pitch: number
  half: number
}

function parseWall(key: WallKey): [number, number] | undefined {
  const sep = key.indexOf('|')
  if (sep < 0) return undefined
  const a = Number(key.slice(0, sep))
  const b = Number(key.slice(sep + 1))
  if (!Number.isInteger(a) || !Number.isInteger(b)) return undefined
  return [a, b]
}

function WallEdgesImpl({ walls, cols, pitch, half }: WallEdgesProps) {
  const segments: Array<{ x1: number; y1: number; x2: number; y2: number; key: string }> = []

  for (const key of walls) {
    const pair = parseWall(key)
    if (pair === undefined) continue
    const [a, b] = pair
    const ca = toCoord(a, cols)
    const cb = toCoord(b, cols)

    if (ca.r === cb.r) {
      // horizontal neighbours -> vertical wall on the boundary between them.
      const col = Math.max(ca.c, cb.c)
      const x = Math.round(col * pitch - (pitch - 2 * half) / 2)
      const yTop = Math.round(ca.r * pitch)
      const yBot = Math.round(ca.r * pitch + 2 * half)
      segments.push({ x1: x, y1: yTop, x2: x, y2: yBot, key })
    } else {
      // vertical neighbours -> horizontal wall on the boundary between them.
      const row = Math.max(ca.r, cb.r)
      const y = Math.round(row * pitch - (pitch - 2 * half) / 2)
      const xLeft = Math.round(ca.c * pitch)
      const xRight = Math.round(ca.c * pitch + 2 * half)
      segments.push({ x1: xLeft, y1: y, x2: xRight, y2: y, key })
    }
  }

  if (segments.length === 0) return null

  return (
    <g stroke="var(--color-danger)" strokeWidth={3} strokeLinecap="round">
      {segments.map((s) => (
        <line key={s.key} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} />
      ))}
    </g>
  )
}

export const WallEdges = memo(WallEdgesImpl)
