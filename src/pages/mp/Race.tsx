import { useCallback, useEffect, useRef } from 'react'
import { Navigate } from 'react-router-dom'
import { Board } from '../../components/Board'
import { OpponentProgress } from '../../components/OpponentProgress'
import { ProgressBar } from '../../components/ProgressBar'
import { Timer } from '../../components/Timer'
import type { Puzzle } from '../../game/types'
import { useBoardPath } from '../../hooks/useBoardPath'
import { useTimer } from '../../hooks/useTimer'

// The live 1v1 race. Both players draw the SAME puzzle (same seed). The local
// fill drives the player's own ProgressBar and, throttled, the opponent's view
// via match.reportProgress. On solve we stop the clock and report the elapsed
// time; the host is authoritative for the verdict. Reporting progress/solve to
// the wire is a genuine side effect, so it lives in effects — not derived state.

export type RaceViewProps = {
  puzzle: Puzzle
  side: 'host' | 'guest'
  oppFilled: number
  oppTotal: number
  reportProgress: (filled: number, total: number) => void
  reportSolved: (timeMs: number) => void
}

export function RaceView({
  puzzle,
  side,
  oppFilled,
  oppTotal,
  reportProgress,
  reportSolved,
}: RaceViewProps) {
  const timer = useTimer()
  const boardRef = useRef<HTMLDivElement>(null)
  const { filled } = useBoardPath(boardRef, puzzle)
  const total = puzzle.rows * puzzle.cols

  // Keep the latest reporter reachable from effects without re-subscribing.
  const reportProgressRef = useRef(reportProgress)
  reportProgressRef.current = reportProgress

  // Push local fill to the opponent. The throttle inside the match controller
  // caps the actual wire rate; this just feeds it every committed change.
  useEffect(() => {
    reportProgressRef.current(filled, total)
  }, [filled, total])

  const handlePointerDownCapture = useCallback(() => {
    timer.start()
  }, [timer])

  const handleSolved = useCallback(() => {
    const timeMs = timer.stop()
    reportSolved(timeMs)
  }, [timer, reportSolved])

  return (
    <main className="fade-in mx-auto flex min-h-[100dvh] max-w-md flex-col gap-4 px-5 py-6">
      <div className="decorative-grid decorative-grid--masked" aria-hidden="true" />
      <div className="glow" aria-hidden="true" />

      <header
        className="flex items-center justify-between"
        data-testid="race-header"
        data-seed={puzzle.meta.seed}
        data-difficulty={puzzle.meta.gameNumber}
      >
        <span className="font-[var(--font-mono)] text-[13px] uppercase tracking-widest text-[var(--color-accent)]">
          1v1 · {side === 'host' ? 'anfitrião' : 'convidado'}
        </span>
        <span className="font-[var(--font-mono)] text-[15px] font-bold tracking-tight text-[var(--color-text-muted)]">
          #{String(puzzle.meta.gameNumber).padStart(3, '0')}
        </span>
        <Timer elapsedMs={timer.elapsedMs} />
      </header>

      <div className="flex flex-col gap-2">
        <ProgressBar filled={filled} total={total} />
        <OpponentProgress filled={oppFilled} total={oppTotal > 0 ? oppTotal : total} />
      </div>

      <div className="relative flex flex-1 items-center justify-center py-4">
        {/* key by seed: a rematch delivers a new seed so the Board remounts
            cleanly with a fresh draw state (rerender-lazy-state-init). */}
        <div
          key={puzzle.meta.seed}
          ref={boardRef}
          onPointerDownCapture={handlePointerDownCapture}
          className="contents"
        >
          <Board puzzle={puzzle} onSolved={handleSolved} />
        </div>
      </div>
    </main>
  )
}

// Standalone lazy route fallback: no live match here, so go home.
export default function Race() {
  return <Navigate to="/" replace />
}
