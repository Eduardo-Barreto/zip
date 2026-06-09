import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { JoinLinkBox } from '../../components/JoinLinkBox'
import { PlayerList } from '../../components/PlayerList'
import { generatePuzzleWith } from '../../game/generate'
import { randomMatchSeed } from '../../hooks/matchController'
import { useMatch } from '../../hooks/useMatch'
import { getTransport } from '../../transport'
import type { SeriesFormat } from '../../transport/messages'
import { generateRoomCode } from '../../transport/peer-ids'
import { seriesLabel } from './labels'
import { RaceView } from './Race'
import { ResultView } from './Result'

// Host page: pick a difficulty and a series format, then open a room and share
// it. Guests join into a lobby and mark themselves Pronto; the host starts
// everyone at once. The peer room stays open across rematches. The host is seat
// 1 and counts as a player.

// ---------------------------------------------------------------------------
// Difficulty tiers + series format
// ---------------------------------------------------------------------------

type DifficultyTier = { label: string; value: number }

const DIFFICULTY_TIERS: DifficultyTier[] = [
  { label: 'Fácil', value: 3 },
  { label: 'Médio', value: 12 },
  { label: 'Difícil', value: 30 },
  { label: 'Extremo', value: 60 },
]

const DEFAULT_DIFFICULTY: DifficultyTier = { label: 'Médio', value: 12 }

const SERIES_OPTIONS: SeriesFormat[] = [3, 5, 7, null]
const DEFAULT_SERIES: SeriesFormat = 3

type RoomConfig = { difficulty: DifficultyTier; bestOf: SeriesFormat }

// ---------------------------------------------------------------------------
// Root component — shows the setup picker, then mounts the room
// ---------------------------------------------------------------------------

export default function Host() {
  const [confirmed, setConfirmed] = useState<RoomConfig | null>(null)

  if (confirmed === null) {
    return <SetupPicker onConfirm={setConfirmed} />
  }
  return <HostRoom config={confirmed} />
}

// ---------------------------------------------------------------------------
// SetupPicker — choose difficulty + series format before the room opens
// ---------------------------------------------------------------------------

type SetupPickerProps = { onConfirm: (config: RoomConfig) => void }

function SetupPicker({ onConfirm }: SetupPickerProps) {
  const navigate = useNavigate()
  const [difficulty, setDifficulty] = useState<DifficultyTier>(DEFAULT_DIFFICULTY)
  const [bestOf, setBestOf] = useState<SeriesFormat>(DEFAULT_SERIES)

  return (
    <main className="fade-in mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center gap-8 px-6 py-10">
      <div className="decorative-grid decorative-grid--masked" aria-hidden="true" />
      <div className="glow" aria-hidden="true" />

      <div className="text-center">
        <h1 className="section-heading text-4xl text-[var(--color-accent)]">Criar sala</h1>
        <p className="mt-3 text-[15px] text-[var(--color-text-muted)]">
          Escolha a dificuldade e o formato da série, e compartilhe o link.
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
              selected={tier.value === difficulty.value}
              onSelect={setDifficulty}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="font-[var(--font-mono)] text-[12px] uppercase tracking-widest text-[var(--color-text-dim)]">
          Série
        </p>
        <div className="grid grid-cols-4 gap-2">
          {SERIES_OPTIONS.map((format) => (
            <SeriesButton
              key={String(format)}
              format={format}
              selected={format === bestOf}
              onSelect={setBestOf}
            />
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onConfirm({ difficulty, bestOf })}
        data-testid="create-room"
        className="btn-accent card-lift rounded-xl px-6 py-4 text-center font-[var(--font-mono)] text-[16px] font-bold tracking-tight active:scale-95"
      >
        Criar sala — {difficulty.label} · {seriesLabel(bestOf)}
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
// HostRoom — peer connection lives here; the config is locked at mount
// ---------------------------------------------------------------------------

type HostRoomProps = { config: RoomConfig }

function HostRoom({ config }: HostRoomProps) {
  const roomCode = useMemo(() => generateRoomCode(), [])
  const transport = useMemo(() => getTransport(), [])
  const [seed] = useState(() => randomMatchSeed())

  return <HostSession roomCode={roomCode} transport={transport} config={config} seed={seed} />
}

// ---------------------------------------------------------------------------
// HostSession — drives useMatch for the lifetime of the room
// ---------------------------------------------------------------------------

type HostSessionProps = {
  roomCode: string
  transport: ReturnType<typeof getTransport>
  config: RoomConfig
  seed: number
}

function HostSession({ roomCode, transport, config, seed }: HostSessionProps) {
  const navigate = useNavigate()
  const { difficulty, bestOf } = config
  const { state, start, reportProgress, reportSolved, voteRematch } = useMatch({
    role: 'host',
    roomCode,
    transport,
    seed,
    difficulty: difficulty.value,
    bestOf,
  })

  const setup = state.setup
  const puzzle = useMemo(
    () => (setup !== null ? generatePuzzleWith(setup.seed, setup.difficulty) : null),
    [setup],
  )

  const handleLeave = useCallback(() => navigate('/'), [navigate])

  // --- result screen ---
  if (state.phase === 'results' && state.result !== null) {
    return (
      <ResultView
        standings={state.standings}
        myId={state.myId}
        winnerId={state.result.winnerId}
        championId={state.result.championId}
        bestOf={bestOf}
        reason={state.result.reason}
        localRematchVoted={state.localRematchVoted}
        rematchReadyCount={state.rematchReadyCount}
        rematchTotal={state.rematchTotal}
        onVoteRematch={voteRematch}
        onLeave={handleLeave}
      />
    )
  }

  // --- racing screen ---
  if (state.phase === 'racing' && puzzle !== null) {
    return (
      <RaceView
        puzzle={puzzle}
        standings={state.standings}
        myId={state.myId}
        reportProgress={reportProgress}
        reportSolved={reportSolved}
      />
    )
  }

  // --- lobby / waiting screen ---
  const guestCount = state.players.length - 1
  const canStart = state.players.length >= 2 && state.players.every((p) => p.ready)

  return (
    <main className="fade-in mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center gap-6 px-6 py-10">
      <div className="decorative-grid decorative-grid--masked" aria-hidden="true" />
      <div className="glow" aria-hidden="true" />

      <div className="text-center">
        <h1 className="section-heading text-4xl text-[var(--color-accent)]">Sala criada</h1>
        <p className="mt-3 text-[15px] text-[var(--color-text-muted)]">
          {guestCount === 0
            ? 'Aguardando jogadores entrarem…'
            : 'Quando todos estiverem prontos, inicie a partida.'}
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
          {difficulty.label} · {seriesLabel(bestOf)}
        </span>
      </div>

      <PlayerList players={state.players} myId={state.myId} />

      <JoinLinkBox roomCode={roomCode} />

      {state.error !== null ? (
        <p className="text-center text-[14px] text-[#f59e0b]" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={start}
          disabled={!canStart}
          data-testid="start-match"
          className="btn-accent card-lift rounded-xl px-6 py-4 text-center font-[var(--font-mono)] text-[16px] font-bold tracking-tight active:scale-95 disabled:opacity-40"
        >
          {canStart ? 'Iniciar partida' : 'Aguardando jogadores…'}
        </button>
        <button
          type="button"
          onClick={handleLeave}
          className="spotlight-card card-lift rounded-xl px-6 py-3 text-center text-[15px] text-[var(--color-text)]"
        >
          Cancelar
        </button>
      </div>
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

// ---------------------------------------------------------------------------
// SeriesButton — module-top-level (rerender-no-inline-components)
// ---------------------------------------------------------------------------

type SeriesButtonProps = {
  format: SeriesFormat
  selected: boolean
  onSelect: (format: SeriesFormat) => void
}

function SeriesButton({ format, selected, onSelect }: SeriesButtonProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(format)}
      data-testid={`series-${format ?? 'inf'}`}
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
      {format === null ? '∞' : `BO${format}`}
    </button>
  )
}
