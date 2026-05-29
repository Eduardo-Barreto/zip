import { Link } from 'react-router-dom'
import { useProgress } from '../hooks/useProgress'

// Entry screen. Mobile-first, board-is-hero spirit even on the menu: one accent
// primary action (Continue) and quiet secondary links. Sharing the run lives in
// the win modal, not here.

export default function Home() {
  const { currentGame } = useProgress()

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
          Criar sala multiplayer
        </Link>
        <Link
          to="/mp/join"
          className="spotlight-card card-lift rounded-xl px-6 py-3 text-center text-[15px] text-[var(--color-text)]"
        >
          Entrar em sala
        </Link>
      </div>
    </main>
  )
}
