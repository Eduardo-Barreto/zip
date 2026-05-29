import { memo } from 'react'
import { formatTime, seatLabel } from '../pages/mp/labels'
import type { Standing } from '../transport/messages'

// Module-top-level, memoized (rerender-no-inline-components, rerender-memo).
// Final (or live) ranking of every player. Already ordered by the host's
// deterministic rank rule, so we render in array order: rank = index + 1. The
// winner gets the accent; the local player is tagged "você". Finishers show
// their time, the rest show their board-fill percent.

type StandingsProps = {
  standings: Standing[]
  myId: string | null
  winnerId: string | null
}

function StandingsImpl({ standings, myId, winnerId }: StandingsProps) {
  return (
    <ol className="flex flex-col gap-2" data-testid="standings">
      {standings.map((s, i) => {
        const isMe = s.id === myId
        const isWinner = s.id === winnerId
        const pct = s.total > 0 ? Math.min(100, Math.round((s.filled / s.total) * 100)) : 0
        return (
          <li
            key={s.id}
            data-testid={`standing-${s.seat}`}
            data-rank={i + 1}
            className="spotlight-card flex items-center justify-between rounded-xl px-4 py-3"
            style={
              isWinner
                ? { border: '1px solid color-mix(in srgb, var(--color-accent) 55%, transparent)' }
                : undefined
            }
          >
            <span className="flex items-center gap-3">
              <span
                className="font-[var(--font-mono)] text-[15px] font-bold tabular-nums"
                style={{ color: isWinner ? 'var(--color-accent)' : 'var(--color-text-dim)' }}
              >
                {i + 1}
              </span>
              <span className="flex items-center gap-2 font-[var(--font-mono)] text-[14px] text-[var(--color-text)]">
                {seatLabel(s.seat)}
                {isMe ? (
                  <span className="text-[11px] uppercase tracking-widest text-[var(--color-text-dim)]">
                    você
                  </span>
                ) : null}
              </span>
            </span>
            <span className="flex items-center gap-3">
              {s.wins > 0 ? (
                <span
                  className="font-[var(--font-mono)] text-[12px] tabular-nums text-[var(--color-text-dim)]"
                  data-testid={`wins-${s.seat}`}
                  title="vitórias na sala"
                >
                  🏆 {s.wins}
                </span>
              ) : null}
              <span
                className="font-[var(--font-mono)] text-[15px] tabular-nums"
                style={{ color: s.finished ? 'var(--color-accent)' : '#f59e0b' }}
              >
                {s.finished ? formatTime(s.timeMs) : `${pct}%`}
              </span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

export const Standings = memo(StandingsImpl)
