// Deterministic PRNG (mulberry32). The whole puzzle core is reproducible from
// `seed = gameNumber`, so generatePuzzle(N) is identical on every device — this
// is what makes the 1v1 race fair and the snapshot tests stable. NEVER use
// Math.random/Date here (AC26 guard). Math.imul is pure and allowed.

export type Prng = {
  /** float in [0, 1). */
  next: () => number
  /** integer in [0, n). */
  int: (n: number) => number
  /** uniform pick; throws on empty input. */
  pick: <T>(arr: readonly T[]) => T
  /** in-place Fisher–Yates shuffle; returns the same array. */
  shuffle: <T>(arr: T[]) => T[]
}

export function mulberry32(seed: number): Prng {
  let a = seed >>> 0

  function next(): number {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  function int(n: number): number {
    return Math.floor(next() * n)
  }

  function pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('mulberry32.pick: empty array')
    return arr[int(arr.length)] as T
  }

  function shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = int(i + 1)
      const ai = arr[i] as T
      const aj = arr[j] as T
      arr[i] = aj
      arr[j] = ai
    }
    return arr
  }

  return { next, int, pick, shuffle }
}
