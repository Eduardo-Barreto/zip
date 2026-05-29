import type { Cell, Coord, WallKey } from './types'

export function toIndex(r: number, c: number, cols: number): Cell {
  return r * cols + c
}

export function toCoord(cell: Cell, cols: number): Coord {
  return { r: Math.floor(cell / cols), c: cell % cols }
}

/** Orthogonal (up/down/left/right) in-bounds neighbours of a cell. */
export function orthoNeighbors(cell: Cell, rows: number, cols: number): Cell[] {
  const r = Math.floor(cell / cols)
  const c = cell % cols
  const out: Cell[] = []
  if (r > 0) out.push(cell - cols)
  if (r < rows - 1) out.push(cell + cols)
  if (c > 0) out.push(cell - 1)
  if (c < cols - 1) out.push(cell + 1)
  return out
}

/** Canonical, order-independent key for the edge between cells a and b. */
export function wallKey(a: Cell, b: Cell): WallKey {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

export function hasWall(walls: Set<WallKey>, a: Cell, b: Cell): boolean {
  return walls.has(wallKey(a, b))
}

export function areAdjacent(a: Cell, b: Cell, cols: number): boolean {
  const ar = Math.floor(a / cols)
  const ac = a % cols
  const br = Math.floor(b / cols)
  const bc = b % cols
  return Math.abs(ar - br) + Math.abs(ac - bc) === 1
}
