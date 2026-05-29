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
      className="pointer-events-none flex h-[62%] w-[62%] select-none items-center justify-center rounded-full text-[clamp(14px,3.4vmin,22px)] font-semibold tabular-nums"
      style={{
        backgroundColor: reached ? 'var(--color-accent)' : 'var(--color-surface-2)',
        color: reached ? 'var(--color-bg)' : 'var(--color-ink)',
        border: reached ? '1px solid var(--color-accent)' : '1px solid var(--color-line)',
        transition: 'background-color 160ms ease-out, color 160ms ease-out',
      }}
    >
      {order}
    </span>
  )
}

export const NumberBadge = memo(NumberBadgeImpl)
