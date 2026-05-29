import { memo } from 'react'
import { seatLabel } from '../pages/mp/labels'
import type { LobbyPlayer } from '../transport/messages'

// Module-top-level, memoized (rerender-no-inline-components, rerender-memo).
// The lobby roster: every connected seat with its ready state. The local player
// is tagged "você". Quiet chrome — a card per seat, accent dot when ready.

type PlayerListProps = {
  players: LobbyPlayer[]
  myId: string | null
}

function PlayerListImpl({ players, myId }: PlayerListProps) {
  return (
    <ul className="flex flex-col gap-2" data-testid="player-list">
      {players.map((p) => {
        const isMe = p.id === myId
        return (
          <li
            key={p.id}
            data-testid={`player-${p.seat}`}
            data-ready={p.ready}
            className="spotlight-card flex items-center justify-between rounded-xl px-4 py-3"
          >
            <span className="flex items-center gap-2 font-[var(--font-mono)] text-[14px] text-[var(--color-text)]">
              {seatLabel(p.seat)}
              {isMe ? (
                <span className="text-[11px] uppercase tracking-widest text-[var(--color-text-dim)]">
                  você
                </span>
              ) : null}
            </span>
            <span
              className="flex items-center gap-2 font-[var(--font-mono)] text-[12px] uppercase tracking-widest"
              style={{ color: p.ready ? 'var(--color-accent)' : 'var(--color-text-dim)' }}
            >
              <span
                className="inline-block size-2 rounded-full"
                style={{
                  backgroundColor: p.ready ? 'var(--color-accent)' : 'var(--color-border)',
                  boxShadow: p.ready
                    ? '0 0 8px color-mix(in srgb, var(--color-accent) 70%, transparent)'
                    : 'none',
                }}
              />
              {p.ready ? 'pronto' : 'aguardando'}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

export const PlayerList = memo(PlayerListImpl)
