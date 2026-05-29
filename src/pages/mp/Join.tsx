import { useCallback, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { generatePuzzleWith } from '../../game/generate'
import { useMatch } from '../../hooks/useMatch'
import { getTransport } from '../../transport'
import { isValidRoomCode } from '../../transport/peer-ids'
import { RaceView } from './Race'
import { ResultView } from './Result'

// Join page: arrive with a room code in the URL (#/mp/join/:roomCode from the
// host's link/QR) or type one in. Once a valid code is confirmed we connect as
// the guest. Both players can request a rematch in-place; the host is
// authoritative and responds with rematch_setup carrying a fresh seed.

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
          className="card-lift rounded-xl px-6 py-4 text-center font-[var(--font-mono)] text-[16px] font-bold tracking-tight text-[#0a0a0a] active:scale-95 disabled:opacity-40"
          style={{
            backgroundColor: 'var(--color-accent)',
            boxShadow: '0 12px 36px -12px color-mix(in srgb, var(--color-accent) 70%, transparent)',
          }}
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
  const { state, reportProgress, reportSolved, triggerRematch } = useMatch({
    role: 'guest',
    roomCode,
    transport,
  })

  const setup = state.setup
  const puzzle = useMemo(
    () => (setup !== null ? generatePuzzleWith(setup.seed, setup.difficulty) : null),
    [setup],
  )

  const handleRematch = useCallback(() => {
    triggerRematch()
  }, [triggerRematch])

  if (state.result !== null) {
    return (
      <ResultView
        result={state.result}
        side="guest"
        onRematch={handleRematch}
        onLeave={() => navigate('/')}
      />
    )
  }

  if (state.phase === 'racing' && puzzle !== null) {
    return (
      <RaceView
        puzzle={puzzle}
        side="guest"
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
        <h1 className="section-heading text-4xl text-[var(--color-accent)]">
          Conectando à sala {roomCode}
        </h1>
        <p className="mt-3 text-[15px] text-[var(--color-text-muted)]">
          {state.error !== null ? state.error : 'Estabelecendo conexão…'}
        </p>
      </div>

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
