import { Link } from 'react-router-dom'
import { useProgress } from '../hooks/useProgress'

// Level grid up to currentGame + a small lookahead. The scroll list uses
// content-visibility:auto (rendering-content-visibility) so off-screen rows
// skip layout/paint — cheap even when the list is long. Completed levels show
// their best star count; locked-ahead levels are tappable too (infinite game).

const LOOKAHEAD = 6

function LevelTile({ n, stars }: { n: number; stars: number | undefined }) {
  return (
    <Link
      to={`/play/${n}`}
      data-testid={`level-${n}`}
      className="spotlight-card card-lift flex aspect-square flex-col items-center justify-center gap-1 font-[var(--font-mono)] text-[15px] font-bold tabular-nums tracking-tight text-[var(--color-text)] active:scale-95"
      style={{
        contentVisibility: 'auto',
        containIntrinsicSize: '72px',
      }}
    >
      <span>#{String(n).padStart(3, '0')}</span>
      {stars !== undefined ? (
        <span className="text-[12px] text-[var(--color-accent)]">{'★'.repeat(stars)}</span>
      ) : null}
    </Link>
  )
}

export default function LevelSelect() {
  const { currentGame, completed } = useProgress()
  const max = currentGame + LOOKAHEAD

  const tiles: React.ReactElement[] = []
  for (let n = 1; n <= max; n++) {
    tiles.push(<LevelTile key={n} n={n} stars={completed[n]?.stars} />)
  }

  return (
    <main className="fade-in mx-auto flex min-h-[100dvh] max-w-md flex-col gap-5 px-5 py-6">
      <div className="decorative-grid decorative-grid--masked" aria-hidden="true" />
      <div className="glow" aria-hidden="true" />
      <header className="flex items-center justify-between">
        <Link
          to="/"
          className="text-[15px] text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
        >
          ← Início
        </Link>
        <h1 className="section-heading text-xl">Níveis</h1>
        <span className="w-12" />
      </header>
      <div className="grid grid-cols-4 gap-3">{tiles}</div>
    </main>
  )
}
