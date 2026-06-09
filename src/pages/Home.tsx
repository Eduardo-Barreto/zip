import { useState } from 'react'
import { Link } from 'react-router-dom'
import { DEFAULT_TIER, DIFFICULTY_TIERS, type DifficultyTier } from '../game/difficulty'
import { useProgress } from '../hooks/useProgress'

// Entry screen. Mobile-first, board-is-hero spirit even on the menu: one accent
// primary action and quiet secondary links. The difficulty tier picks the
// starting level (see game/difficulty.ts); "Continuar" resumes saved progress.

function TierButton({
  tier,
  selected,
  onSelect,
}: {
  tier: DifficultyTier
  selected: boolean
  onSelect: (tier: DifficultyTier) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(tier)}
      data-testid={`tier-${tier.label.toLowerCase()}`}
      className="card-lift rounded-lg py-3 text-center font-[var(--font-mono)] text-[13px] font-bold tracking-tight active:scale-95"
      style={{
        backgroundColor: selected
          ? 'color-mix(in srgb, var(--color-accent) 18%, var(--color-bg-card))'
          : 'var(--color-bg-card)',
        border: selected
          ? '1px solid color-mix(in srgb, var(--color-accent) 55%, transparent)'
          : '1px solid var(--color-border)',
        color: selected ? 'var(--color-accent)' : 'var(--color-text-muted)',
      }}
    >
      {tier.label}
    </button>
  )
}

export default function Home() {
  const { currentGame } = useProgress()
  const [tier, setTier] = useState<DifficultyTier>(DEFAULT_TIER)

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

      <div className="flex flex-col gap-2">
        <p className="font-[var(--font-mono)] text-[12px] uppercase tracking-widest text-[var(--color-text-dim)]">
          Dificuldade
        </p>
        <div className="grid grid-cols-3 gap-2">
          {DIFFICULTY_TIERS.map((t) => (
            <TierButton
              key={t.value}
              tier={t}
              selected={t.value === tier.value}
              onSelect={setTier}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <Link
          to={`/play/${tier.value}`}
          data-testid="play-tier"
          className="btn-accent card-lift rounded-xl px-6 py-4 text-center font-[var(--font-mono)] text-[16px] font-bold tracking-tight active:scale-95"
        >
          Jogar — {tier.label}
        </Link>
        {currentGame > 1 ? (
          <Link
            to={`/play/${currentGame}`}
            data-testid="continue"
            className="spotlight-card card-lift rounded-xl px-6 py-3 text-center text-[15px] text-[var(--color-text)]"
          >
            Continuar — nível {currentGame}
          </Link>
        ) : null}
        <Link
          to="/daily"
          data-testid="daily"
          className="spotlight-card card-lift rounded-xl px-6 py-3 text-center text-[15px] text-[var(--color-text)]"
        >
          Desafio diário
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
