import { Link } from 'react-router-dom'
import { useProgress } from '../hooks/useProgress'

// Entry screen. Mobile-first, board-is-hero spirit even on the menu: one accent
// primary action and quiet secondary links. The level progression is the main
// path (Continuar leads); the endless mode asks for its difficulty on its own
// screen, so the menu stays picker-free. Every action carries a one-line
// description so the modes don't blur together.

function SecondaryLink({
  to,
  label,
  description,
  testId,
}: {
  to: string
  label: string
  description: string
  testId?: string
}) {
  return (
    <Link
      to={to}
      data-testid={testId}
      className="spotlight-card card-lift rounded-xl px-6 py-3 text-center"
    >
      <span className="block text-[15px] text-[var(--color-text)]">{label}</span>
      <span className="block text-[12px] text-[var(--color-text-dim)]">{description}</span>
    </Link>
  )
}

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
          data-testid="continue"
          className="btn-accent card-lift rounded-xl px-6 py-4 text-center font-[var(--font-mono)] tracking-tight active:scale-95"
        >
          <span className="block text-[16px] font-bold">
            {currentGame > 1 ? `Continuar — nível ${currentGame}` : 'Jogar — nível 1'}
          </span>
          <span className="block text-[12px] font-normal opacity-80">
            a progressão principal, com estrelas
          </span>
        </Link>
        <SecondaryLink to="/levels" label="Níveis" description="escolher um nível já alcançado" />
        <SecondaryLink
          to="/endless"
          testId="endless"
          label="Modo infinito"
          description="puzzles sem fim na dificuldade que você escolher"
        />
        <SecondaryLink
          to="/mp/host"
          label="Criar sala multiplayer"
          description="corrida 1v1 contra um amigo"
        />
        <SecondaryLink
          to="/mp/join"
          label="Entrar em sala"
          description="com o link ou código do anfitrião"
        />
      </div>
    </main>
  )
}
