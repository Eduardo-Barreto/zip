// Tiny, pure progress throttle (AC21). The match loop sends `progress` at most
// once per windowMs; the clock is injected (no real timers) so the gate is fully
// deterministic in tests. `lastSent` lives in the caller's transient useRef
// (rerender-use-ref-transient-values); this helper is the pure decision.

export type ProgressThrottle = {
  /** True iff at least windowMs have elapsed since the last emitted send. */
  shouldSend: () => boolean
}

export const PROGRESS_THROTTLE_MS = 250

/**
 * Build a throttle gate. `now` returns the current time in ms (default
 * performance.now). The first call always passes; subsequent calls pass only
 * once `windowMs` has elapsed since the previous passing call.
 */
export function makeProgressThrottle(
  now: () => number = () => performance.now(),
  windowMs: number = PROGRESS_THROTTLE_MS,
): ProgressThrottle {
  let lastSent = Number.NEGATIVE_INFINITY
  return {
    shouldSend: () => {
      const t = now()
      if (t - lastSent >= windowMs) {
        lastSent = t
        return true
      }
      return false
    },
  }
}
