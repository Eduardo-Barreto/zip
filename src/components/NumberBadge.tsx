import { memo } from 'react'

// Module-top-level component (rerender-no-inline-components). High-contrast,
// legible checkpoint badge. Sits inside a grid cell, centred.

type NumberBadgeProps = {
  order: number
  /** true once the path has reached this checkpoint in order. */
  reached: boolean
}

function NumberBadgeImpl({ order, reached }: NumberBadgeProps) {
  return (
    <span
      className="pointer-events-none flex h-[62%] w-[62%] select-none items-center justify-center rounded-full font-[var(--font-mono)] text-[clamp(14px,3.4vmin,22px)] font-bold tabular-nums"
      style={{
        backgroundColor: reached ? 'var(--color-accent)' : 'var(--color-bg-card-hover)',
        color: reached ? '#0a0a0a' : 'var(--color-text)',
        border: reached ? '1px solid var(--color-accent)' : '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: reached
          ? '0 0 0 1px color-mix(in srgb, var(--color-accent) 60%, transparent), 0 4px 14px -4px color-mix(in srgb, var(--color-accent) 70%, transparent)'
          : 'inset 0 1px 0 rgba(255, 255, 255, 0.06)',
        transition:
          'background-color 160ms cubic-bezier(0.23, 1, 0.32, 1), color 160ms cubic-bezier(0.23, 1, 0.32, 1), box-shadow 160ms cubic-bezier(0.23, 1, 0.32, 1)',
      }}
    >
      {order}
    </span>
  )
}

export const NumberBadge = memo(NumberBadgeImpl)
