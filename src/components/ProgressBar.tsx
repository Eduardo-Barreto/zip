import { memo } from 'react'

// Module-top-level, memoized (rerender-no-inline-components, rerender-memo).
// Slim fill bar showing how much of the board the player has covered. A single
// teal accent, no shadow — chrome stays quiet so the board is the hero.

type ProgressBarProps = {
  filled: number
  total: number
}

function ProgressBarImpl({ filled, total }: ProgressBarProps) {
  const pct = total > 0 ? Math.min(100, Math.round((filled / total) * 100)) : 0
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full"
      style={{ backgroundColor: 'var(--color-bg-card)' }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={filled}
      aria-label="Progresso do tabuleiro"
    >
      <div
        className="h-full rounded-full"
        style={{
          width: `${pct}%`,
          backgroundColor: 'var(--color-accent)',
          boxShadow: '0 0 8px color-mix(in srgb, var(--color-accent) 60%, transparent)',
          transition: 'width 160ms cubic-bezier(0.23, 1, 0.32, 1)',
        }}
      />
    </div>
  )
}

export const ProgressBar = memo(ProgressBarImpl)
