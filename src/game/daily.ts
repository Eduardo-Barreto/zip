// Daily challenge: one procedurally-generated puzzle per UTC day, identical for
// everyone, playable once. Mirrors progress.ts: a versioned, minimal blob whose
// load() is TOTAL (never throws on absent/corrupt/legacy/future bytes). This
// module is deterministic — callers pass the date keys in, so nothing here
// reads the clock (keeps src/game reproducible; the page owns "today").

import { DEFAULT_TIER } from './difficulty'

/** The daily puzzle's fixed difficulty: the Médio tier. */
export const DAILY_DIFFICULTY = DEFAULT_TIER.value

/** UTC calendar day as YYYY-MM-DD. The page derives this from the clock. */
export function dailyKey(date: Date): string {
  const y = date.getUTCFullYear()
  const m = `${date.getUTCMonth() + 1}`.padStart(2, '0')
  const d = `${date.getUTCDate()}`.padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Same day → same seed for every device. Derived from the YYYYMMDD digits. */
export function dailySeed(dateKey: string): number {
  return Number(dateKey.replace(/-/g, ''))
}

export type DailyResult = { timeMs: number; stars: number }

export type DailyProgress = {
  version: 1
  lastDateKey: string | null
  streak: number
  results: Record<string, DailyResult>
}

export const DAILY_VERSION = 1
export const DAILY_STORAGE_KEY = 'zip:daily'

export function freshDaily(): DailyProgress {
  return { version: DAILY_VERSION, lastDateKey: null, streak: 0, results: {} }
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

function defaultStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/** Total: returns a usable DailyProgress for any input, never throws. */
export function loadDaily(storage: StorageLike | null = defaultStorage()): DailyProgress {
  if (!storage) return freshDaily()
  let raw: string | null
  try {
    raw = storage.getItem(DAILY_STORAGE_KEY)
  } catch {
    return freshDaily()
  }
  if (raw === null) return freshDaily()
  try {
    return normalize(JSON.parse(raw))
  } catch {
    console.warn('zip: corrupt daily blob, resetting')
    return freshDaily()
  }
}

export function saveDaily(
  progress: DailyProgress,
  storage: StorageLike | null = defaultStorage(),
): void {
  if (!storage) return
  try {
    storage.setItem(DAILY_STORAGE_KEY, JSON.stringify(progress))
  } catch {
    // quota / private-mode: best-effort, never throw from a save.
  }
}

export function hasPlayed(progress: DailyProgress, dateKey: string): boolean {
  return Object.hasOwn(progress.results, dateKey)
}

/**
 * Record today's daily result. The streak grows when the previous completion
 * was yesterday and resets to 1 otherwise (a skipped day breaks it). Replaying
 * an already-recorded day is a no-op.
 */
export function recordDaily(
  progress: DailyProgress,
  dateKey: string,
  yesterdayKey: string,
  result: DailyResult,
): DailyProgress {
  if (hasPlayed(progress, dateKey)) return progress
  const streak = progress.lastDateKey === yesterdayKey ? progress.streak + 1 : 1
  return {
    ...progress,
    lastDateKey: dateKey,
    streak,
    results: { ...progress.results, [dateKey]: result },
  }
}

function normalize(data: unknown): DailyProgress {
  if (!isObject(data)) return freshDaily()
  if (data.version !== undefined && data.version !== DAILY_VERSION) {
    console.warn(`zip: unknown daily version ${String(data.version)}, resetting`)
    return freshDaily()
  }
  return {
    version: DAILY_VERSION,
    lastDateKey: typeof data.lastDateKey === 'string' ? data.lastDateKey : null,
    streak: asNonNegInt(data.streak),
    results: asResults(data.results),
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
function asNonNegInt(v: unknown): number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : 0
}
function asResults(v: unknown): Record<string, DailyResult> {
  const out: Record<string, DailyResult> = {}
  if (!isObject(v)) return out
  for (const [key, entry] of Object.entries(v)) {
    if (!isObject(entry)) continue
    if (typeof entry.timeMs !== 'number' || typeof entry.stars !== 'number') continue
    out[key] = { timeMs: entry.timeMs, stars: entry.stars }
  }
  return out
}
