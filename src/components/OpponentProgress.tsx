import { memo } from 'react'

// Module-top-level, memoized (rerender-no-inline-components, rerender-memo).
// The opponent's live board fill during a 1v1 race. Amber (#f59e0b) sets it
// apart from the player's own blue progress while staying quiet chrome — the
// board is still the hero.

type OpponentProgressProps = {
  filled: number
  total: number
  label?: string
}

function OpponentProgressImpl({ filled, total, label = 'Oponente' }: OpponentProgressProps) {
  const pct = total > 0 ? Math.min(100, Math.round((filled / total) * 100)) : 0
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="font-[var(--font-mono)] text-[13px] tracking-tight text-[#f59e0b]">
          {label}
        </span>
        <span className="font-[var(--font-mono)] text-[12px] tabular-nums text-[var(--color-text-dim)]">
          {pct}%
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full"
        style={{ backgroundColor: 'var(--color-bg-card)' }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={filled}
        aria-label="Progresso do oponente"
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            backgroundColor: '#f59e0b',
            boxShadow: '0 0 8px color-mix(in srgb, #f59e0b 55%, transparent)',
            transition: 'width 160ms cubic-bezier(0.23, 1, 0.32, 1)',
          }}
        />
      </div>
    </div>
  )
}

export const OpponentProgress = memo(OpponentProgressImpl)
