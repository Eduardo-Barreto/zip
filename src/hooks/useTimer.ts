import { useCallback, useEffect, useRef, useState } from 'react'

// A wall-clock stopwatch for the play screen. This lives in src/hooks (NOT
// src/game), so the determinism guard — which only scans src/game/** — does not
// apply and we may read performance.now() directly. While running it ticks the
// displayed elapsedMs a few times a second (so the user sees it count); the
// precise final time is sampled exactly at stop() for scoring.

export type UseTimer = {
  /** Milliseconds elapsed across all running spans since the last reset. */
  elapsedMs: number
  running: boolean
  start: () => void
  /** Freeze the clock and commit the final elapsed time to state. */
  stop: () => number
  reset: () => void
}

function now(): number {
  return performance.now()
}

export function useTimer(): UseTimer {
  const [elapsedMs, setElapsedMs] = useState(0)
  const [running, setRunning] = useState(false)
  // Transient timing lives in refs so the tick never forces a render.
  const startedAtRef = useRef<number | null>(null)
  const accumulatedRef = useRef(0)

  const start = useCallback(() => {
    if (startedAtRef.current !== null) return
    startedAtRef.current = now()
    setRunning(true)
  }, [])

  const sample = useCallback((): number => {
    const startedAt = startedAtRef.current
    if (startedAt === null) return accumulatedRef.current
    return accumulatedRef.current + (now() - startedAt)
  }, [])

  const stop = useCallback((): number => {
    const total = sample()
    accumulatedRef.current = total
    startedAtRef.current = null
    setRunning(false)
    setElapsedMs(total)
    return total
  }, [sample])

  const reset = useCallback(() => {
    startedAtRef.current = null
    accumulatedRef.current = 0
    setRunning(false)
    setElapsedMs(0)
  }, [])

  // While running, tick the displayed value ~4x/sec. The interval drives a
  // cheap setState; the authoritative time is still sampled at stop().
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setElapsedMs(sample()), 250)
    return () => clearInterval(id)
  }, [running, sample])

  return { elapsedMs, running, start, stop, reset }
}
