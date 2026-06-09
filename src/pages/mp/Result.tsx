import { Navigate } from 'react-router-dom'
import { Standings } from '../../components/Standings'
import type { ResultReason, SeriesFormat, Standing } from '../../transport/messages'
import { seriesLabel } from './labels'

// N-player result screen. Shows the final standings (already ranked by the host)
// and a rematch button. A rematch only starts once EVERY remaining player has
// opted in — after you vote, this screen shows an "aguardando" state with the
// live count. When a best-of-N series is clinched (championId set) the screen
// switches to a distinct series-champion state and the rematch starts a fresh
// series. If the host left, the race is abandoned and only "Sair" is offered.

type Outcome = 'won' | 'lost' | 'host_left' | 'series_won' | 'series_lost'

function outcomeFor(
  myId: string | null,
  winnerId: string | null,
  championId: string | null,
  reason: ResultReason,
): Outcome {
  if (reason === 'host_left') return 'host_left'
  if (championId !== null)
    return myId !== null && myId === championId ? 'series_won' : 'series_lost'
  return myId !== null && myId === winnerId ? 'won' : 'lost'
}

const COPY: Record<Outcome, { title: string; sub: string; color: string }> = {
  won: { title: 'Você venceu', sub: 'Resolveu primeiro. Boa!', color: 'var(--color-accent)' },
  lost: { title: 'Você não venceu', sub: 'Alguém foi mais rápido.', color: 'var(--color-text)' },
  host_left: { title: 'Anfitrião saiu', sub: 'A partida foi encerrada.', color: '#f59e0b' },
  series_won: {
    title: 'Campeão da série!',
    sub: 'Você fechou a série.',
    color: 'var(--color-accent)',
  },
  series_lost: {
    title: 'Série encerrada',
    sub: 'O oponente fechou a série.',
    color: 'var(--color-text)',
  },
}

export type ResultViewProps = {
  standings: Standing[]
  myId: string | null
  winnerId: string | null
  championId: string | null
  bestOf: SeriesFormat
  reason: ResultReason
  localRematchVoted: boolean
  rematchReadyCount: number
  rematchTotal: number
  /** Called when the player opts into a rematch. */
  onVoteRematch: () => void
  /** Called when the player clicks "Sair". */
  onLeave: () => void
}

export function ResultView({
  standings,
  myId,
  winnerId,
  championId,
  bestOf,
  reason,
  localRematchVoted,
  rematchReadyCount,
  rematchTotal,
  onVoteRematch,
  onLeave,
}: ResultViewProps) {
  const outcome = outcomeFor(myId, winnerId, championId, reason)
  const copy = COPY[outcome]
  const canRematch = reason !== 'host_left'
  const seriesOver = championId !== null
  const rematchLabel = seriesOver ? 'Nova série' : 'Jogar novamente'

  return (
    <main className="fade-in mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center gap-8 px-6 py-10">
      <div className="decorative-grid decorative-grid--masked" aria-hidden="true" />
      <div className="glow" aria-hidden="true" />

      <div className="text-center" data-testid="result" data-outcome={outcome}>
        <h1 className="section-heading text-4xl" style={{ color: copy.color }}>
          {copy.title}
        </h1>
        <p className="mt-3 text-[15px] text-[var(--color-text-muted)]">{copy.sub}</p>
        {bestOf !== null && reason !== 'host_left' ? (
          <p
            className="mt-2 font-[var(--font-mono)] text-[12px] uppercase tracking-widest text-[var(--color-text-dim)]"
            data-testid="series-status"
          >
            {seriesLabel(bestOf)}
            {seriesOver ? ' · encerrada' : ''}
          </p>
        ) : null}
      </div>

      {standings.length > 0 ? (
        <Standings standings={standings} myId={myId} winnerId={championId ?? winnerId} />
      ) : null}

      <div className="flex flex-col gap-3">
        {canRematch ? (
          localRematchVoted ? (
            <div
              className="spotlight-card rounded-xl px-6 py-4 text-center font-[var(--font-mono)] text-[15px] text-[var(--color-text-muted)]"
              data-testid="rematch-waiting"
            >
              Aguardando os outros…{' '}
              <span className="font-bold text-[var(--color-accent)]">
                {rematchReadyCount}/{rematchTotal}
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={onVoteRematch}
              data-testid="rematch"
              className="btn-accent card-lift rounded-xl px-6 py-4 text-center font-[var(--font-mono)] text-[16px] font-bold tracking-tight active:scale-95"
            >
              {rematchLabel}
            </button>
          )
        ) : null}
        <button
          type="button"
          onClick={onLeave}
          data-testid="leave"
          className="spotlight-card card-lift rounded-xl px-6 py-3 text-center text-[15px] text-[var(--color-text)]"
        >
          Sair
        </button>
      </div>
    </main>
  )
}

// Standalone lazy route fallback: no live match here, so go home.
export default function Result() {
  return <Navigate to="/" replace />
}
