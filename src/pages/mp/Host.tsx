import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { JoinLinkBox } from '../../components/JoinLinkBox'
import { generatePuzzle } from '../../game/generate'
import { useMatch } from '../../hooks/useMatch'
import { useProgress } from '../../hooks/useProgress'
import { getTransport } from '../../transport'
import { generateRoomCode } from '../../transport/peer-ids'
import { RaceView } from './Race'
import { ResultView } from './Result'

// Host page: create a room, show the join link + QR while waiting for a guest,
// then run the live race. The host is authoritative — it picks the gameNumber
// (the player's current level), and useMatch resolves the verdict. Rematch
// bumps the gameNumber and remounts the live session via a key so connection
// state starts clean.

export default function Host() {
  const roomCode = useMemo(() => generateRoomCode(), [])
  const transport = useMemo(() => getTransport(), [])
  const { currentGame } = useProgress()
  const [gameNumber, setGameNumber] = useState(currentGame)
  const [matchKey, setMatchKey] = useState(0)

  const handleRematch = useCallback(() => {
    setGameNumber((n) => n + 1)
    setMatchKey((k) => k + 1)
  }, [])

  return (
    <HostSession
      key={matchKey}
      roomCode={roomCode}
      transport={transport}
      gameNumber={gameNumber}
      onRematch={handleRematch}
    />
  )
}

type HostSessionProps = {
  roomCode: string
  transport: ReturnType<typeof getTransport>
  gameNumber: number
  onRematch: () => void
}

function HostSession({ roomCode, transport, gameNumber, onRematch }: HostSessionProps) {
  const navigate = useNavigate()
  const { state, reportProgress, reportSolved } = useMatch({
    role: 'host',
    roomCode,
    transport,
    gameNumber,
  })

  const puzzle = useMemo(() => generatePuzzle(gameNumber), [gameNumber])

  if (state.result !== null) {
    return <ResultView result={state.result} side="host" canRematch={true} onRematch={onRematch} />
  }

  if (state.phase === 'racing') {
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
