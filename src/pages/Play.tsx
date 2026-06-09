import { startTransition, useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Board } from '../components/Board'
import { HintButton } from '../components/HintButton'
import { ProgressBar } from '../components/ProgressBar'
import { Timer } from '../components/Timer'
import { WinOverlay } from '../components/WinOverlay'
import { generatePuzzle } from '../game/generate'
import type { LevelResult } from '../game/score'
import { scoreLevel } from '../game/score'
import { useBoardPath } from '../hooks/useBoardPath'
import { useProgress } from '../hooks/useProgress'
import { useTimer } from '../hooks/useTimer'

// Single-player level screen, route /play/:n. The puzzle is built once via a
// lazy state initializer (rerender-lazy-state-init) keyed by the level so
// navigating to the next level rebuilds cleanly. On solve we stop the clock,
// score it, persist progress, and reveal the win panel + advance under a
// transition (rerender-transitions). Hints used dock a star via scoreLevel.

function parseLevel(raw: string | undefined): number {
  const n = Number(raw)
  return Number.isInteger(n) && n >= 1 ? n : 1
}

type WinState = { result: LevelResult; streak: number }

export default function Play() {
  const params = useParams()
  const level = parseLevel(params.n)
  const navigate = useNavigate()
  const { completeLevel } = useProgress()

  // Rebuild the puzzle when the level changes; `key` on the inner content would
  // also work, but tracking the live level against a ref keeps it in one place.
  const [puzzle, setPuzzle] = useState(() => generatePuzzle(level))
  const puzzleLevelRef = useRef(level)
  if (puzzleLevelRef.current !== level) {
    puzzleLevelRef.current = level
    setPuzzle(generatePuzzle(level))
  }

  const timer = useTimer()
  const boardRef = useRef<HTMLDivElement>(null)
  const { filled, getPrefix } = useBoardPath(boardRef, puzzle)
  const hintsRef = useRef(0)
  const [win, setWin] = useState<WinState | null>(null)

  // Start the clock as soon as the puzzle loads (thinking time counts too), and
  // restart it whenever the level changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on puzzle, not timer identity
  useEffect(() => {
    timer.reset()
    timer.start()
  }, [puzzle])

  const handleHintUsed = useCallback(() => {
    hintsRef.current += 1
  }, [])

  const handleSolved = useCallback(() => {
    const timeMs = timer.stop()
    const result = scoreLevel(level, timeMs, hintsRef.current)
    const next = completeLevel(level, {
      stars: result.stars,
      timeMs,
      hintsUsed: hintsRef.current,
    })
    startTransition(() => {
      setWin({ result, streak: next.streak })
    })
  }, [timer, level, completeLevel])

  const handleNext = useCallback(() => {
    const target = level + 1
    startTransition(() => {
      setWin(null)
      hintsRef.current = 0
      timer.reset()
      navigate(`/play/${target}`)
    })
  }, [level, navigate, timer])

  const total = puzzle.rows * puzzle.cols

  return (
    <main className="fade-in mx-auto flex h-[100dvh] max-w-md flex-col gap-3 overflow-hidden px-4 py-3">
      <div className="decorative-grid decorative-grid--masked" aria-hidden="true" />
      <div className="glow" aria-hidden="true" />
      <header className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="text-[15px] text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
        >
          ← Início
        </button>
        <span className="font-[var(--font-mono)] text-[15px] font-bold tracking-tight text-[var(--color-text-muted)]">
          #{String(level).padStart(3, '0')}
        </span>
        <Timer elapsedMs={timer.elapsedMs} />
      </header>

      <ProgressBar filled={filled} total={total} />

      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        <div ref={boardRef} className="contents">
          <Board key={puzzle.meta.gameNumber} puzzle={puzzle} onSolved={handleSolved} />
        </div>
        {win !== null ? (
          <WinOverlay
            stars={win.result.stars}
            score={win.result.score}
            streak={win.streak}
            onNext={handleNext}
          />
        ) : null}
      </div>

      <footer className="flex items-center justify-center pt-2">
        <HintButton
          puzzle={puzzle}
          boardRef={boardRef}
          getPrefix={getPrefix}
          onHintUsed={handleHintUsed}
        />
      </footer>
    </main>
  )
}
