import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatShare, load } from '../game/progress'
import { useProgress } from '../hooks/useProgress'

// Entry screen. Mobile-first, board-is-hero spirit even on the menu: one accent
// primary action (Continue), quiet secondary links, and a Share action that
// copies a plain-text summary of cleared levels + best times to the clipboard.

export default function Home() {
  const { currentGame } = useProgress()
  const [shared, setShared] = useState(false)

  const handleShare = useCallback(async () => {
    const text = formatShare(load())
    try {
      await navigator.clipboard.writeText(text)
      setShared(true)
      setTimeout(() => setShared(false), 2000)
    } catch {
      // clipboard blocked (insecure context / permissions): surface the text so
      // the player can copy it manually.
      window.prompt('Copie seu progresso:', text)
    }
  }, [])

  return (
    <main className="fade-in mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center gap-8 px-6 py-10">
      <div className="decorative-grid decorative-grid--masked" aria-hidden="true" />
      <div className="glow" aria-hidden="true" />

      <div className="text-center">
        <h1 className="section-heading text-5xl text-[var(--color-accent)]">Zip</h1>
        <p className="mt-3 text-[15px] text-[var(--color-text-muted)]">
          Conecte 1→N preenchendo todo o tabuleiro. Progressão infinita.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <Link
          to={`/play/${currentGame}`}
          className="card-lift rounded-xl px-6 py-4 text-center font-[var(--font-mono)] text-[16px] font-bold tracking-tight text-[#0a0a0a] active:scale-95"
          style={{
            backgroundColor: 'var(--color-accent)',
            boxShadow: '0 12px 36px -12px color-mix(in srgb, var(--color-accent) 70%, transparent)',
          }}
        >
          Continuar — nível {currentGame}
        </Link>
        <Link
          to="/levels"
          className="spotlight-card card-lift rounded-xl px-6 py-3 text-center text-[15px] text-[var(--color-text)]"
        >
          Níveis
        </Link>
        <Link
          to="/mp/host"
          className="spotlight-card card-lift rounded-xl px-6 py-3 text-center text-[15px] text-[var(--color-text)]"
        >
          Multiplayer 1v1
        </Link>
      </div>

      <div
        className="flex flex-col items-center gap-2 border-t pt-6"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <button
          type="button"
          onClick={handleShare}
          className="card-lift w-full rounded-lg px-4 py-2 text-[14px] text-[var(--color-text-muted)] active:scale-95"
          style={{
            backgroundColor: 'var(--color-bg-card)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          Compartilhar score
        </button>
        {shared ? (
          <span className="text-[13px] text-[var(--color-accent)]" role="status">
            Copiado para a área de transferência.
          </span>
        ) : null}
      </div>
    </main>
  )
}
