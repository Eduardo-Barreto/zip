import { memo } from 'react'

// Module-top-level, memoized (rerender-no-inline-components, rerender-memo).
// Quiet, monospace, tabular readout. Purely presentational — the running clock
// lives in useTimer; this only formats whatever millisecond value it is given.

type TimerProps = {
  elapsedMs: number
}

function format(ms: number): string {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function TimerImpl({ elapsedMs }: TimerProps) {
  return (
    <span
      className="font-[var(--font-mono)] text-[15px] tabular-nums text-[var(--color-text-muted)]"
      role="timer"
      aria-label="Tempo decorrido"
    >
      {format(elapsedMs)}
    </span>
  )
}

export const Timer = memo(TimerImpl)
