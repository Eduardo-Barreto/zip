import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { JoinLinkBox } from '../../components/JoinLinkBox'
import { generatePuzzleWith } from '../../game/generate'
import { type MatchSetup, randomMatchSeed } from '../../hooks/matchController'
import { useMatch } from '../../hooks/useMatch'
import { getTransport } from '../../transport'
import { generateRoomCode } from '../../transport/peer-ids'
import { RaceView } from './Race'
import { ResultView } from './Result'

// Host page: pick a difficulty, then create a room and share it. The peer
// connection is established only after difficulty is confirmed, so the
// match_setup message always carries the chosen difficulty. Rematch keeps the
// same peer room and generates a new random seed without closing the connection.

// ---------------------------------------------------------------------------
// Difficulty tiers
// ---------------------------------------------------------------------------

type DifficultyTier = { label: string; value: number }

const DIFFICULTY_TIERS: DifficultyTier[] = [
  { label: 'Fácil', value: 3 },
  { label: 'Médio', value: 12 },
  { label: 'Difícil', value: 30 },
  { label: 'Extremo', value: 60 },
]

const DEFAULT_DIFFICULTY: DifficultyTier = { label: 'Médio', value: 12 }

// ---------------------------------------------------------------------------
// Root component — shows the difficulty picker, then mounts the room
// ---------------------------------------------------------------------------

export default function Host() {
  const [confirmed, setConfirmed] = useState<DifficultyTier | null>(null)

  if (confirmed === null) {
    return <DifficultyPicker onConfirm={setConfirmed} />
  }
  return <HostRoom difficulty={confirmed} />
}

// ---------------------------------------------------------------------------
// DifficultyPicker — shown before the peer connection opens
// ---------------------------------------------------------------------------

type DifficultyPickerProps = { onConfirm: (tier: DifficultyTier) => void }

function DifficultyPicker({ onConfirm }: DifficultyPickerProps) {
  const navigate = useNavigate()
  const [selected, setSelected] = useState<DifficultyTier>(DEFAULT_DIFFICULTY)

  return (
    <main className="fade-in mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center gap-8 px-6 py-10">
      <div className="decorative-grid decorative-grid--masked" aria-hidden="true" />
      <div className="glow" aria-hidden="true" />

      <div className="text-center">
        <h1 className="section-heading text-4xl text-[var(--color-accent)]">Criar sala</h1>
        <p className="mt-3 text-[15px] text-[var(--color-text-muted)]">
          Escolha a dificuldade e compartilhe o link com seu oponente.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <p className="font-[var(--font-mono)] text-[12px] uppercase tracking-widest text-[var(--color-text-dim)]">
          Dificuldade
        </p>
        <div className="grid grid-cols-4 gap-2">
          {DIFFICULTY_TIERS.map((tier) => (
            <DifficultyButton
              key={tier.value}
              tier={tier}
              selected={tier.value === selected.value}
              onSelect={setSelected}
            />
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onConfirm(selected)}
        data-testid="create-room"
        className="card-lift rounded-xl px-6 py-4 text-center font-[var(--font-mono)] text-[16px] font-bold tracking-tight text-[#0a0a0a] active:scale-95"
        style={{
          backgroundColor: 'var(--color-accent)',
          boxShadow: '0 12px 36px -12px color-mix(in srgb, var(--color-accent) 70%, transparent)',
        }}
      >
        Criar sala — {selected.label}
      </button>

      <button
        type="button"
        onClick={() => navigate('/')}
        className="spotlight-card card-lift rounded-xl px-6 py-3 text-center text-[15px] text-[var(--color-text)]"
      >
        Voltar
      </button>
    </main>
  )
}

// ---------------------------------------------------------------------------
// HostRoom — peer connection lives here; difficulty is locked at mount
// ---------------------------------------------------------------------------

type HostRoomProps = { difficulty: DifficultyTier }

function HostRoom({ difficulty }: HostRoomProps) {
  const roomCode = useMemo(() => generateRoomCode(), [])
  const transport = useMemo(() => getTransport(), [])
  const [seed] = useState(() => randomMatchSeed())

  return (
    <HostSession roomCode={roomCode} transport={transport} difficulty={difficulty} seed={seed} />
  )
}

// ---------------------------------------------------------------------------
// HostSession — drives useMatch for the lifetime of the room
// ---------------------------------------------------------------------------

type HostSessionProps = {
  roomCode: string
  transport: ReturnType<typeof getTransport>
  difficulty: DifficultyTier
  seed: number
}

function HostSession({ roomCode, transport, difficulty, seed }: HostSessionProps) {
  const navigate = useNavigate()
  const { state, reportProgress, reportSolved, triggerRematch } = useMatch({
    role: 'host',
    roomCode,
    transport,
    seed,
    difficulty: difficulty.value,
  })

  const setup: MatchSetup | null = state.setup
  const puzzle = useMemo(
    () => (setup !== null ? generatePuzzleWith(setup.seed, setup.difficulty) : null),
    [setup],
  )

  const handleRematch = useCallback(() => {
    triggerRematch()
  }, [triggerRematch])

  // --- result screen ---
  if (state.result !== null) {
    return (
      <ResultView
        result={state.result}
        side="host"
        onRematch={handleRematch}
        onLeave={() => navigate('/')}
      />
    )
  }

  // --- racing screen ---
  if (state.phase === 'racing' && puzzle !== null) {
    return (
      <RaceView
        puzzle={puzzle}
        side="host"
        oppFilled={state.oppFilled}
        oppTotal={state.oppTotal}
        reportProgress={reportProgress}
        reportSolved={reportSolved}
      />
    )
  }

  // --- lobby / waiting screen ---
  return (
    <main className="fade-in mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center gap-8 px-6 py-10">
      <div className="decorative-grid decorative-grid--masked" aria-hidden="true" />
      <div className="glow" aria-hidden="true" />

      <div className="text-center">
        <h1 className="section-heading text-4xl text-[var(--color-accent)]">Sala criada</h1>
        <p className="mt-3 text-[15px] text-[var(--color-text-muted)]">
          Aguardando o oponente entrar…
        </p>
      </div>

      <div className="spotlight-card flex items-center justify-between rounded-xl px-4 py-3">
        <span className="font-[var(--font-mono)] text-[13px] uppercase tracking-widest text-[var(--color-text-dim)]">
          Dificuldade
        </span>
        <span
          className="font-[var(--font-mono)] text-[14px] font-bold"
          style={{ color: 'var(--color-accent)' }}
        >
          {difficulty.label}
        </span>
      </div>

      <JoinLinkBox roomCode={roomCode} />

      {state.error !== null ? (
        <p className="text-center text-[14px] text-[#f59e0b]" role="alert">
          {state.error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => navigate('/')}
        className="spotlight-card card-lift rounded-xl px-6 py-3 text-center text-[15px] text-[var(--color-text)]"
      >
        Cancelar
      </button>
    </main>
  )
}

// ---------------------------------------------------------------------------
// DifficultyButton — module-top-level (rerender-no-inline-components)
// ---------------------------------------------------------------------------

type DifficultyButtonProps = {
  tier: DifficultyTier
  selected: boolean
  onSelect: (tier: DifficultyTier) => void
}

function DifficultyButton({ tier, selected, onSelect }: DifficultyButtonProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(tier)}
      data-testid={`difficulty-${tier.label.toLowerCase()}`}
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
