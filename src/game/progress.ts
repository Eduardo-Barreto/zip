// Progress persistence (client-localstorage-schema): a versioned, minimal blob
// read once at boot. `load()` is TOTAL — it never throws, whatever the stored
// bytes look like (absent / corrupt / legacy / future version). Versioning here
// is net-new (paje-scorer's storage was an unversioned KV wrapper).

export type CompletedEntry = { bestTimeMs: number; stars: number; hintsUsed: number }

export type Progress = {
  version: 1
  currentGame: number
  completed: Record<number, CompletedEntry>
  streak: number
}

export const CURRENT_VERSION = 1
export const STORAGE_KEY = 'zip:progress'

export function freshProgress(): Progress {
  return { version: CURRENT_VERSION, currentGame: 1, completed: {}, streak: 0 }
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

function defaultStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/** Total: returns a usable Progress for any input, never throws (AC17/AC17b). */
export function load(storage: StorageLike | null = defaultStorage()): Progress {
  if (!storage) return freshProgress()
  let raw: string | null
  try {
    raw = storage.getItem(STORAGE_KEY)
  } catch {
    return freshProgress()
  }
  if (raw === null) return freshProgress()

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    console.warn('zip: corrupt progress blob, resetting')
    return freshProgress()
  }
  return normalize(parsed)
}

export function save(progress: Progress, storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(progress))
  } catch {
    // quota / private-mode: best-effort, never throw from a save.
  }
}

function normalize(data: unknown): Progress {
  if (!isObject(data)) return freshProgress()
  const v = data.version
  if (v === CURRENT_VERSION || v === undefined || v === 0) return coerce(data)
  // version > 1: a future, forward-incompatible save — distrust it.
  console.warn(`zip: unknown progress version ${String(v)}, resetting`)
  return freshProgress()
}

/** Map a current or legacy blob field-for-field onto the current shape. */
function coerce(data: Record<string, unknown>): Progress {
  const base = freshProgress()
  return {
    version: CURRENT_VERSION,
    currentGame: asPositiveInt(data.currentGame, base.currentGame),
    completed: asCompleted(data.completed),
    streak: asNonNegInt(data.streak, base.streak),
  }
}

/** Record a completed level: best-time, stars, streak, and advance the pointer. */
export function recordCompletion(
  progress: Progress,
  gameNumber: number,
  result: { stars: number; timeMs: number; hintsUsed: number },
): Progress {
  const prev = progress.completed[gameNumber]
  const bestTimeMs = prev ? Math.min(prev.bestTimeMs, result.timeMs) : result.timeMs
  const stars = prev ? Math.max(prev.stars, result.stars) : result.stars
  const hintsUsed = prev ? Math.min(prev.hintsUsed, result.hintsUsed) : result.hintsUsed
  return {
    ...progress,
    completed: { ...progress.completed, [gameNumber]: { bestTimeMs, stars, hintsUsed } },
    currentGame: Math.max(progress.currentGame, gameNumber + 1),
    streak: prev ? progress.streak : progress.streak + 1,
  }
}

// --- share (score + per-level best times) -------------------------------------

function fmtTime(ms: number): string {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

const STARS = ['', '★', '★★', '★★★'] as const

/**
 * A shareable summary of progress — what actually makes sense to share: the
 * levels cleared and the best time (+ stars) for each. Plain text, clipboard-
 * and chat-friendly.
 */
export function formatShare(progress: Progress): string {
  const entries = Object.entries(progress.completed)
    .map(([n, e]) => ({ n: Number(n), ...e }))
    .filter((e) => Number.isInteger(e.n))
    .sort((a, b) => a.n - b.n)

  const totalStars = entries.reduce((sum, e) => sum + e.stars, 0)
  const lines = [
    'Zip 🟦',
    `Nível ${progress.currentGame} · sequência ${progress.streak}🔥 · ${totalStars}★`,
  ]
  if (entries.length > 0) {
    lines.push('')
    for (const e of entries) {
      const code = `#${String(e.n).padStart(3, '0')}`
      const stars = STARS[Math.max(0, Math.min(3, e.stars))]
      lines.push(`${code}  ${fmtTime(e.bestTimeMs)}  ${stars}`)
    }
  }
  return lines.join('\n')
}

// --- guards -------------------------------------------------------------------

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
function asPositiveInt(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 ? v : fallback
}
function asNonNegInt(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : fallback
}
function asCompleted(v: unknown): Record<number, CompletedEntry> {
  const out: Record<number, CompletedEntry> = {}
  if (!isObject(v)) return out
  for (const [key, entry] of Object.entries(v)) {
    const n = Number(key)
    if (!Number.isInteger(n) || n < 1) continue
    if (!isObject(entry)) continue
    const bestTimeMs = entry.bestTimeMs
    const stars = entry.stars
    const hintsUsed = entry.hintsUsed
    if (typeof bestTimeMs !== 'number' || typeof stars !== 'number') continue
    out[n] = {
      bestTimeMs,
      stars,
      hintsUsed: typeof hintsUsed === 'number' ? hintsUsed : 0,
    }
  }
  return out
}
