import { memo, useCallback, useEffect, useState } from 'react'
import { formatLevelShare } from '../game/progress'

// Module-top-level, memoized (rerender-no-inline-components, rerender-memo).
// The reward moment: thundle's staggered win reveal ported onto barreto.sh
// chrome. A blurred backdrop fades in (win-backdrop), an inner card scales +
// un-blurs (win-card), and its children stagger in (win-element). Primary
// action carries the electric-blue accent; sharing the run lives HERE (the win
// modal), not on the home screen. Motion is honoured-reduced via globals.

type WinOverlayProps = {
  gameNumber: number
  timeMs: number
  stars: 1 | 2 | 3
  score: number
  streak: number
  onNext: () => void
}

const STAR_SLOTS = [1, 2, 3] as const

function Stars({ stars }: { stars: 1 | 2 | 3 }) {
  return (
    <div className="flex gap-2 text-[28px]">
      <span className="sr-only">{`${stars} de 3 estrelas`}</span>
      {STAR_SLOTS.map((i) => (
        <span
          key={i}
          aria-hidden="true"
          style={{ color: i <= stars ? 'var(--color-accent)' : 'var(--color-text-dim)' }}
        >
          {i <= stars ? '★' : '☆'}
        </span>
      ))}
    </div>
  )
}

function el(delay: number): React.CSSProperties {
  return { animation: `win-element 420ms cubic-bezier(0.23, 1, 0.32, 1) ${delay}ms both` }
}

function WinOverlayImpl({ gameNumber, timeMs, stars, score, streak, onNext }: WinOverlayProps) {
  const [shared, setShared] = useState(false)
  // The effect owns the 2s "Copiado ✓" reset, so it is cleared on unmount too.
  useEffect(() => {
    if (!shared) return
    const id = setTimeout(() => setShared(false), 2000)
    return () => clearTimeout(id)
  }, [shared])
  const handleShare = useCallback(async () => {
    // Falls back to a prompt when the clipboard is unavailable (insecure
    // context / denied permission).
    const url = typeof window !== 'undefined' ? window.location.origin : undefined
    const text = formatLevelShare(gameNumber, { timeMs, stars, streak }, url)
    try {
      await navigator.clipboard.writeText(text)
      setShared(true)
    } catch {
      window.prompt('Copie seu resultado:', text)
    }
  }, [gameNumber, timeMs, stars, streak])

  return (
    <div
      data-testid="win-overlay"
      className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl p-4 text-center"
      style={{
        backgroundColor: 'color-mix(in srgb, #0a0a0a 70%, transparent)',
        backdropFilter: 'blur(6px)',
        animation: 'win-backdrop 220ms cubic-bezier(0.23, 1, 0.32, 1) both',
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Nível concluído"
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
          <Stars stars={stars} />
        </div>
        <dl className="flex gap-8 text-[15px]" style={el(380)}>
          <div>
            <dt className="font-[var(--font-mono)] text-[var(--color-text-muted)]">Pontos</dt>
            <dd className="font-[var(--font-mono)] text-xl tabular-nums text-[var(--color-text)]">
              {score}
            </dd>
          </div>
          <div>
            <dt className="font-[var(--font-mono)] text-[var(--color-text-muted)]">Sequência</dt>
            <dd className="font-[var(--font-mono)] text-xl tabular-nums text-[var(--color-accent)]">
              {streak}
            </dd>
          </div>
        </dl>
        <button
          type="button"
          onClick={onNext}
          data-testid="next-level"
          className="card-lift w-full rounded-xl px-6 py-3 font-[var(--font-mono)] text-[16px] font-bold tracking-tight text-[#0a0a0a] active:scale-95"
          style={{
            backgroundColor: 'var(--color-accent)',
            boxShadow: '0 10px 30px -10px color-mix(in srgb, var(--color-accent) 70%, transparent)',
            ...el(460),
          }}
        >
          Próximo
        </button>
        <button
          type="button"
          onClick={handleShare}
          data-testid="share-score"
          className="text-[14px] text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
          style={el(540)}
        >
          {shared ? 'Copiado ✓' : 'Compartilhar score'}
        </button>
      </div>
    </div>
  )
}

export const WinOverlay = memo(WinOverlayImpl)
