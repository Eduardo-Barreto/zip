import { Navigate, useNavigate } from 'react-router-dom'
import type { MatchResult } from '../../hooks/matchController'

// 1v1 result screen. Shown inline by Host/Join when the match reaches a
// terminal state, and also reachable as the lazy /mp/result route (which has no
// live match, so it just bounces home). Outcome wording is from the LOCAL
// player's perspective: the host sees 'host' as a win, the guest sees 'host' as
// a loss; 'abandoned' means the opponent left and there is no verdict.

type Verdict = 'won' | 'lost' | 'abandoned'

function verdictFor(result: MatchResult, side: 'host' | 'guest'): Verdict {
  if (result.outcome === 'abandoned') return 'abandoned'
  if (result.outcome === 'draw') return 'won'
  return result.outcome === side ? 'won' : 'lost'
}

const COPY: Record<Verdict, { title: string; sub: string; color: string }> = {
  won: { title: 'Você venceu', sub: 'Resolveu primeiro. Boa!', color: 'var(--color-accent)' },
  lost: { title: 'Você perdeu', sub: 'O oponente foi mais rápido.', color: 'var(--color-text)' },
  abandoned: { title: 'Oponente saiu', sub: 'A partida foi abandonada.', color: '#f59e0b' },
}

function fmt(ms: number | null): string {
  if (ms === null) return '—'
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export type ResultViewProps = {
  result: MatchResult
  side: 'host' | 'guest'
  canRematch: boolean
  onRematch: () => void
}

export function ResultView({ result, side, canRematch, onRematch }: ResultViewProps) {
  const navigate = useNavigate()
  const verdict = verdictFor(result, side)
  const copy = COPY[verdict]

  return (
    <main className="fade-in mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center gap-8 px-6 py-10">
      <div className="decorative-grid decorative-grid--masked" aria-hidden="true" />
      <div className="glow" aria-hidden="true" />

      <div className="text-center" data-testid="result" data-outcome={verdict}>
        <h1 className="section-heading text-4xl" style={{ color: copy.color }}>
          {copy.title}
        </h1>
        <p className="mt-3 text-[15px] text-[var(--color-text-muted)]">{copy.sub}</p>
      </div>

      {result.reason === 'solved' ? (
        <div className="spotlight-card flex items-center justify-around rounded-xl px-6 py-4">
          <div className="text-center">
            <p className="font-[var(--font-mono)] text-[12px] uppercase tracking-widest text-[var(--color-text-dim)]">
              Você
            </p>
            <p className="mt-1 font-[var(--font-mono)] text-[20px] tabular-nums text-[var(--color-text)]">
              {fmt(side === 'host' ? result.times.host : result.times.guest)}
            </p>
          </div>
          <div className="text-center">
            <p className="font-[var(--font-mono)] text-[12px] uppercase tracking-widest text-[var(--color-text-dim)]">
              Oponente
            </p>
            <p className="mt-1 font-[var(--font-mono)] text-[20px] tabular-nums text-[#f59e0b]">
              {fmt(side === 'host' ? result.times.guest : result.times.host)}
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        {canRematch ? (
          <button
            type="button"
            onClick={onRematch}
            data-testid="rematch"
            className="card-lift rounded-xl px-6 py-4 text-center font-[var(--font-mono)] text-[16px] font-bold tracking-tight text-[#0a0a0a] active:scale-95"
            style={{
              backgroundColor: 'var(--color-accent)',
              boxShadow:
                '0 12px 36px -12px color-mix(in srgb, var(--color-accent) 70%, transparent)',
            }}
          >
            Revanche
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => navigate('/')}
          className="spotlight-card card-lift rounded-xl px-6 py-3 text-center text-[15px] text-[var(--color-text)]"
        >
          Início
        </button>
      </div>
    </main>
  )
}

// Standalone lazy route fallback: no live match here, so go home.
export default function Result() {
  return <Navigate to="/" replace />
}
