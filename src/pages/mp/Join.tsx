import { useCallback, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PlayerList } from '../../components/PlayerList'
import { generatePuzzleWith } from '../../game/generate'
import { useMatch } from '../../hooks/useMatch'
import { getTransport } from '../../transport'
import { isValidRoomCode } from '../../transport/peer-ids'
import { RaceView } from './Race'
import { ResultView } from './Result'

// Join page: arrive with a room code in the URL (#/mp/join/:roomCode from the
// host's link/QR) or type one in. Once a valid code is confirmed we connect as a
// guest and land in the lobby, where the player marks themselves Pronto. The
// host starts everyone at once; rematches need all players to opt in.

export default function Join() {
  const params = useParams()
  const urlCode = (params.roomCode ?? '').toUpperCase()
  const [confirmed, setConfirmed] = useState<string | null>(
    isValidRoomCode(urlCode) ? urlCode : null,
  )

  if (confirmed !== null) return <JoinSession roomCode={confirmed} />
  return <JoinForm initial={urlCode} onConfirm={setConfirmed} />
}

type JoinFormProps = {
  initial: string
  onConfirm: (roomCode: string) => void
}

function JoinForm({ initial, onConfirm }: JoinFormProps) {
  const navigate = useNavigate()
  const [code, setCode] = useState(initial)
  const valid = isValidRoomCode(code.toUpperCase())

  const submit = useCallback(() => {
    const upper = code.toUpperCase()
    if (isValidRoomCode(upper)) onConfirm(upper)
  }, [code, onConfirm])

  return (
    <main className="fade-in mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center gap-8 px-6 py-10">
      <div className="decorative-grid decorative-grid--masked" aria-hidden="true" />
      <div className="glow" aria-hidden="true" />

      <div className="text-center">
        <h1 className="section-heading text-4xl text-[var(--color-accent)]">Entrar na sala</h1>
        <p className="mt-3 text-[15px] text-[var(--color-text-muted)]">
          Digite o código de 4 letras do anfitrião.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 4))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
          inputMode="text"
          autoCapitalize="characters"
          maxLength={4}
          placeholder="ABCD"
          aria-label="Código da sala"
          data-testid="room-code-input"
          className="w-full rounded-xl bg-[var(--color-bg-card)] px-6 py-4 text-center font-[var(--font-mono)] text-[28px] font-bold tracking-[0.3em] text-[var(--color-text)] uppercase outline-none"
          style={{ border: '1px solid var(--color-border)' }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={!valid}
          data-testid="join-confirm"
          className="btn-accent card-lift rounded-xl px-6 py-4 text-center font-[var(--font-mono)] text-[16px] font-bold tracking-tight active:scale-95 disabled:opacity-40"
        >
          Entrar
        </button>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="spotlight-card card-lift rounded-xl px-6 py-3 text-center text-[15px] text-[var(--color-text)]"
        >
          Início
        </button>
      </div>
    </main>
  )
}

type JoinSessionProps = {
  roomCode: string
}

function JoinSession({ roomCode }: JoinSessionProps) {
  const navigate = useNavigate()
  const transport = useMemo(() => getTransport(), [])
  const { state, setReady, reportProgress, reportSolved, voteRematch } = useMatch({
    role: 'guest',
    roomCode,
    transport,
  })

  const setup = state.setup
  const puzzle = useMemo(
    () => (setup !== null ? generatePuzzleWith(setup.seed, setup.difficulty) : null),
    [setup],
  )

  const handleLeave = useCallback(() => navigate('/'), [navigate])

  const isReady = state.players.find((p) => p.id === state.myId)?.ready ?? false
  const toggleReady = useCallback(() => setReady(!isReady), [setReady, isReady])

  // --- result screen ---
  if (state.phase === 'results' && state.result !== null) {
    return (
      <ResultView
        standings={state.standings}
        myId={state.myId}
        winnerId={state.result.winnerId}
        championId={state.result.championId}
        bestOf={setup?.bestOf ?? null}
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

  // --- lobby screen ---
  if (state.phase === 'lobby') {
    return (
      <main className="fade-in mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center gap-6 px-6 py-10">
        <div className="decorative-grid decorative-grid--masked" aria-hidden="true" />
        <div className="glow" aria-hidden="true" />

        <div className="text-center">
          <h1 className="section-heading text-4xl text-[var(--color-accent)]">Sala {roomCode}</h1>
          <p className="mt-3 text-[15px] text-[var(--color-text-muted)]">
            Marque que está pronto. O anfitrião inicia quando todos estiverem.
          </p>
        </div>

        <PlayerList players={state.players} myId={state.myId} />

        <button
          type="button"
          onClick={toggleReady}
          data-testid="ready-toggle"
          data-ready={isReady}
          className="card-lift rounded-xl px-6 py-4 text-center font-[var(--font-mono)] text-[16px] font-bold tracking-tight active:scale-95"
          style={
            isReady
              ? {
                  backgroundColor: 'var(--color-bg-card)',
                  border: '1px solid color-mix(in srgb, var(--color-accent) 55%, transparent)',
                  color: 'var(--color-accent)',
                }
              : {
                  backgroundColor: 'var(--color-accent)',
                  color: '#0a0a0a',
                  boxShadow:
                    '0 12px 36px -12px color-mix(in srgb, var(--color-accent) 70%, transparent)',
                }
          }
        >
          {isReady ? '✓ Pronto — toque para cancelar' : 'Estou pronto'}
        </button>
        <button
          type="button"
          onClick={handleLeave}
          className="spotlight-card card-lift rounded-xl px-6 py-3 text-center text-[15px] text-[var(--color-text)]"
        >
          Sair
        </button>
      </main>
    )
  }

  // --- connecting screen ---
  return (
    <main className="fade-in mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center gap-8 px-6 py-10">
      <div className="decorative-grid decorative-grid--masked" aria-hidden="true" />
      <div className="glow" aria-hidden="true" />

      <div className="text-center">
        <h1 className="section-heading text-4xl text-[var(--color-accent)]">
          Conectando à sala {roomCode}
        </h1>
        <p className="mt-3 text-[15px] text-[var(--color-text-muted)]">
          {state.error !== null ? state.error : 'Estabelecendo conexão…'}
        </p>
      </div>

      <button
        type="button"
        onClick={handleLeave}
        className="spotlight-card card-lift rounded-xl px-6 py-3 text-center text-[15px] text-[var(--color-text)]"
      >
        Cancelar
      </button>
    </main>
  )
}
