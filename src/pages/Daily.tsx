import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Board } from '../components/Board'
import {
  DAILY_DIFFICULTY,
  type DailyProgress,
  dailyKey,
  dailySeed,
  hasPlayed,
  loadDaily,
  recordDaily,
  saveDaily,
} from '../game/daily'
import { generatePuzzleWith } from '../game/generate'
import { formatDailyShare } from '../game/progress'
import { scoreLevel } from '../game/score'
import { useTimer } from '../hooks/useTimer'

// Daily challenge screen, route /daily. The same UTC day yields the same seed
// (and puzzle) for everyone. After solving, the day is locked: the screen shows
// the result, a countdown to the next puzzle, and a Wordle-style share. The
// clock is read HERE (pages may); the deterministic core lives in game/daily.ts.

const DAY_MS = 86_400_000

function fmtCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = `${Math.floor(total / 3600)}`.padStart(2, '0')
  const m = `${Math.floor((total % 3600) / 60)}`.padStart(2, '0')
  const s = `${total % 60}`.padStart(2, '0')
  return `${h}:${m}:${s}`
}

function msUntilNextUtcDay(now: Date): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  return next - now.getTime()
}

const STAR_SLOTS = [1, 2, 3] as const

export default function Daily() {
  const navigate = useNavigate()

  // Resolve today once at mount (a session won't cross UTC midnight in practice).
  const { todayKey, yesterdayKey, puzzle } = useMemo(() => {
    const now = new Date()
    const key = dailyKey(now)
    const yKey = dailyKey(new Date(now.getTime() - DAY_MS))
    return {
      todayKey: key,
      yesterdayKey: yKey,
      puzzle: generatePuzzleWith(dailySeed(key), DAILY_DIFFICULTY),
    }
  }, [])

  const [daily, setDaily] = useState<DailyProgress>(() => loadDaily())
  const done = hasPlayed(daily, todayKey)
  const result = daily.results[todayKey]

  const timer = useTimer()
  // biome-ignore lint/correctness/useExhaustiveDependencies: start once for the day
  useEffect(() => {
    if (done) return
    timer.reset()
    timer.start()
  }, [done])

  const handleSolved = useCallback(() => {
    const timeMs = timer.stop()
    const { stars } = scoreLevel(DAILY_DIFFICULTY, timeMs, 0)
    setDaily((prev) => {
      const next = recordDaily(prev, todayKey, yesterdayKey, { timeMs, stars })
      saveDaily(next)
      return next
    })
  }, [timer, todayKey, yesterdayKey])

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
          Diário · {todayKey}
        </span>
        <span className="w-12" />
      </header>

      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        <Board key={todayKey} puzzle={puzzle} onSolved={handleSolved} />
        {done && result !== undefined ? (
          <DailyDone dateKey={todayKey} result={result} streak={daily.streak} />
        ) : null}
      </div>
    </main>
  )
}

function DailyDone({
  dateKey,
  result,
  streak,
}: {
  dateKey: string
  result: { timeMs: number; stars: number }
  streak: number
}) {
  const [shared, setShared] = useState(false)
  const [remaining, setRemaining] = useState(() => msUntilNextUtcDay(new Date()))
  const sharedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const id = setInterval(() => setRemaining(msUntilNextUtcDay(new Date())), 1000)
    return () => {
      clearInterval(id)
      if (sharedTimer.current !== null) clearTimeout(sharedTimer.current)
    }
  }, [])

  const handleShare = useCallback(async () => {
    const url = typeof window !== 'undefined' ? window.location.origin : undefined
    const text = formatDailyShare(dateKey, result, streak, url)
    try {
      await navigator.clipboard.writeText(text)
      setShared(true)
      if (sharedTimer.current !== null) clearTimeout(sharedTimer.current)
      sharedTimer.current = setTimeout(() => setShared(false), 2000)
    } catch {
      window.prompt('Copie seu resultado:', text)
    }
  }, [dateKey, result, streak])

  return (
    <div
      data-testid="daily-done"
      className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl p-4 text-center"
      style={{
        backgroundColor: 'color-mix(in srgb, #0a0a0a 70%, transparent)',
        backdropFilter: 'blur(6px)',
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Desafio diário concluído"
    >
      <div
        className="flex w-full max-w-xs flex-col items-center gap-5 rounded-2xl px-6 py-8"
        style={{
          backgroundColor: 'color-mix(in srgb, #0a0a0a 95%, transparent)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
        }}
      >
        <h2 className="font-[var(--font-mono)] text-2xl font-bold tracking-tight text-[var(--color-text)]">
          Diário resolvido!
        </h2>
        <div className="flex gap-2 text-[28px]">
          <span className="sr-only">{`${result.stars} de 3 estrelas`}</span>
          {STAR_SLOTS.map((i) => (
            <span
              key={i}
              aria-hidden="true"
              style={{ color: i <= result.stars ? 'var(--color-accent)' : 'var(--color-text-dim)' }}
            >
              {i <= result.stars ? '★' : '☆'}
            </span>
          ))}
        </div>
        <dl className="flex gap-8 text-[15px]">
          <div>
            <dt className="font-[var(--font-mono)] text-[var(--color-text-muted)]">Sequência</dt>
            <dd className="font-[var(--font-mono)] text-xl tabular-nums text-[var(--color-accent)]">
              {streak}🔥
            </dd>
          </div>
          <div>
            <dt className="font-[var(--font-mono)] text-[var(--color-text-muted)]">Próximo em</dt>
            <dd
              className="font-[var(--font-mono)] text-xl tabular-nums text-[var(--color-text)]"
              data-testid="daily-countdown"
            >
              {fmtCountdown(remaining)}
            </dd>
          </div>
        </dl>
        <button
          type="button"
          onClick={handleShare}
          data-testid="daily-share"
          className="btn-accent card-lift w-full rounded-xl px-6 py-3 font-[var(--font-mono)] text-[16px] font-bold tracking-tight active:scale-95"
        >
          {shared ? 'Copiado ✓' : 'Compartilhar'}
        </button>
      </div>
    </div>
  )
}
