import { memo, startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Board } from '../components/Board'
import { HintButton } from '../components/HintButton'
import { ProgressBar } from '../components/ProgressBar'
import { Timer } from '../components/Timer'
import { Stars } from '../components/WinOverlay'
import { el } from '../components/win-anim'
import { DIFFICULTY_TIERS, type DifficultyTier, tierByValue } from '../game/difficulty'
import { generatePuzzleWith } from '../game/generate'
import { type LevelResult, scoreLevel } from '../game/score'
import { useBoardPath } from '../hooks/useBoardPath'
import { useTimer } from '../hooks/useTimer'
import { formatTime } from './mp/labels'

// Endless mode, routes /endless (ask the difficulty) and /endless/:tier (play).
// Random puzzles at a FIXED tier difficulty — distinct from the level
// progression (/play/:n), which climbs the 1→∞ curve and persists. Seeds are
// page-level randomness (the deterministic core only ever sees the seed);
// nothing is saved, the solved count is the session's run.

const randomSeed = () => Math.floor(Math.random() * 0x7fffffff)

type WinState = { timeMs: number; stars: LevelResult['stars'] }

export default function Endless() {
  const params = useParams()
  const tier = tierByValue(Number(params.tier))
  return tier === undefined ? <EndlessSetup /> : <EndlessGame tier={tier} />
}

function EndlessSetup() {
  const navigate = useNavigate()
  return (
    <main className="fade-in mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center gap-8 px-6 py-10">
      <div className="decorative-grid decorative-grid--masked" aria-hidden="true" />
      <div className="glow" aria-hidden="true" />

      <div className="text-center">
        <h1 className="section-heading text-4xl text-[var(--color-accent)]">Modo infinito</h1>
        <p className="mt-3 text-[15px] text-[var(--color-text-muted)]">
          Escolha a dificuldade e jogue puzzles sem fim.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {DIFFICULTY_TIERS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => navigate(`/endless/${t.value}`)}
            data-testid={`endless-${t.label.toLowerCase()}`}
            className="spotlight-card card-lift rounded-xl px-6 py-4 text-center font-[var(--font-mono)] text-[16px] font-bold tracking-tight text-[var(--color-text)] active:scale-95"
          >
            {t.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => navigate('/')}
          className="px-6 py-2 text-[15px] text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
        >
          ← Início
        </button>
      </div>
    </main>
  )
}

function EndlessGame({ tier }: { tier: DifficultyTier }) {
  const navigate = useNavigate()
  const [seed, setSeed] = useState(randomSeed)
  const puzzle = useMemo(() => generatePuzzleWith(seed, tier.value), [seed, tier.value])

  const timer = useTimer()
  const boardRef = useRef<HTMLDivElement>(null)
  const { filled, getPrefix } = useBoardPath(boardRef, puzzle)
  const hintsRef = useRef(0)
  const [solvedCount, setSolvedCount] = useState(0)
  const [win, setWin] = useState<WinState | null>(null)

  // First puzzle only — handleNext restarts the clock for the following ones.
  useEffect(() => {
    timer.reset()
    timer.start()
  }, [timer.reset, timer.start])

  const handleHintUsed = useCallback(() => {
    hintsRef.current += 1
  }, [])

  const handleSolved = useCallback(() => {
    const timeMs = timer.stop()
    const { stars } = scoreLevel(tier.value, timeMs, hintsRef.current)
    startTransition(() => {
      setSolvedCount((c) => c + 1)
      setWin({ timeMs, stars })
    })
  }, [timer, tier.value])

  const handleNext = useCallback(() => {
    timer.reset()
    timer.start()
    startTransition(() => {
      setWin(null)
      hintsRef.current = 0
      setSeed(randomSeed())
    })
  }, [timer])

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
          ∞ {tier.label}
        </span>
        <Timer elapsedMs={timer.elapsedMs} />
      </header>

      <ProgressBar filled={filled} total={total} />

      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        <div ref={boardRef} className="contents">
          <Board key={seed} puzzle={puzzle} onSolved={handleSolved} />
        </div>
        {win !== null ? (
          <EndlessWin win={win} solvedCount={solvedCount} onNext={handleNext} />
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

const EndlessWin = memo(function EndlessWin({
  win,
  solvedCount,
  onNext,
}: {
  win: WinState
  solvedCount: number
  onNext: () => void
}) {
  return (
    <div
      data-testid="endless-win"
      className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl p-4 text-center"
      style={{
        backgroundColor: 'color-mix(in srgb, #0a0a0a 70%, transparent)',
        backdropFilter: 'blur(6px)',
        animation: 'win-backdrop 220ms cubic-bezier(0.23, 1, 0.32, 1) both',
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Puzzle resolvido"
    >
      <div
        className="flex w-full max-w-xs flex-col items-center gap-5 rounded-2xl px-6 py-8"
        style={{
          backgroundColor: 'color-mix(in srgb, #0a0a0a 95%, transparent)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          boxShadow:
            '0 0 0 1px color-mix(in srgb, var(--color-accent) 14%, transparent), 0 24px 70px -24px color-mix(in srgb, var(--color-accent) 45%, transparent)',
          animation: 'win-card 500ms cubic-bezier(0.23, 1, 0.32, 1) 100ms both',
        }}
      >
        <h2
          className="font-[var(--font-mono)] text-2xl font-bold tracking-tight text-[var(--color-text)]"
          style={el(220)}
        >
          Resolvido!
        </h2>
        <div style={el(300)}>
          <Stars stars={win.stars} />
        </div>
        <dl className="flex gap-8 text-[15px]" style={el(380)}>
          <div>
            <dt className="font-[var(--font-mono)] text-[var(--color-text-muted)]">Tempo</dt>
            <dd className="font-[var(--font-mono)] text-xl tabular-nums text-[var(--color-text)]">
              {formatTime(win.timeMs)}
            </dd>
          </div>
          <div>
            <dt className="font-[var(--font-mono)] text-[var(--color-text-muted)]">Nesta sessão</dt>
            <dd className="font-[var(--font-mono)] text-xl tabular-nums text-[var(--color-accent)]">
              {solvedCount}
            </dd>
          </div>
        </dl>
        <button
          type="button"
          onClick={onNext}
          data-testid="endless-next"
          className="card-lift w-full rounded-xl px-6 py-3 font-[var(--font-mono)] text-[16px] font-bold tracking-tight text-[#0a0a0a] active:scale-95"
          style={{
            backgroundColor: 'var(--color-accent)',
            boxShadow: '0 10px 30px -10px color-mix(in srgb, var(--color-accent) 70%, transparent)',
            ...el(460),
          }}
        >
          Próximo puzzle
        </button>
      </div>
    </div>
  )
})
