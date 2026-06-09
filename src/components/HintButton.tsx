import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { hint } from '../game/solver'
import type { Cell, Puzzle } from '../game/types'

// Module-top-level, memoized (rerender-no-inline-components, rerender-memo).
// Asks the bounded solver for the next move from the player's REAL prefix and
// reflects the result. The heavy solver import is eager — it is small and the
// hint must feel instant. The suggested cell is flagged imperatively on its DOM
// node (data-hint + a teal ring) rather than threaded through the Board, which
// owns its own state. The flag clears on the next path edit or after a beat.

type HintButtonProps = {
  puzzle: Puzzle
  boardRef: React.RefObject<HTMLElement | null>
  /** Reconstruct the player's ordered path prefix from the board DOM. */
  getPrefix: () => Cell[]
  /** Fires once per granted extend hint, so the play screen can dock a star. */
  onHintUsed: () => void
}

type HintMessage = '' | 'backtrack' | 'unknown'

const HINT_TEXT: Record<Exclude<HintMessage, ''>, string> = {
  backtrack: 'volte uma casa',
  unknown: 'não consegui calcular uma dica agora',
}

function clearHighlight(board: HTMLElement | null): void {
  if (board === null) return
  const prev = board.querySelector<HTMLElement>('[data-hint="true"]')
  if (prev !== null) {
    delete prev.dataset.hint
    prev.style.removeProperty('box-shadow')
  }
}

function highlight(board: HTMLElement | null, cell: Cell): void {
  if (board === null) return
  clearHighlight(board)
  const node = board.querySelector<HTMLElement>(`[data-cell="${cell}"]`)
  if (node === null) return
  node.dataset.hint = 'true'
  node.style.boxShadow = 'inset 0 0 0 3px var(--color-accent)'
}

function HintButtonImpl({ puzzle, boardRef, getPrefix, onHintUsed }: HintButtonProps) {
  const [message, setMessage] = useState<HintMessage>('')
  const boardElRef = useRef(boardRef)
  boardElRef.current = boardRef

  // Tidy up any lingering highlight when this screen unmounts.
  useEffect(() => () => clearHighlight(boardElRef.current.current), [])

  const handleHint = useCallback(() => {
    const board = boardRef.current
    const result = hint(puzzle, getPrefix())
    if (result.kind === 'extend') {
      setMessage('')
      highlight(board, result.cell)
      onHintUsed()
    } else if (result.kind === 'backtrack') {
      clearHighlight(board)
      setMessage('backtrack')
    } else {
      clearHighlight(board)
      setMessage('unknown')
    }
  }, [puzzle, boardRef, getPrefix, onHintUsed])

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={handleHint}
        data-testid="hint"
        className="card-lift rounded-lg px-5 py-2 font-[var(--font-mono)] text-[15px] font-bold tracking-tight text-[var(--color-accent)] active:scale-95"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--color-accent) 10%, var(--color-bg-card))',
          border: '1px solid color-mix(in srgb, var(--color-accent) 40%, transparent)',
        }}
      >
        Dica
      </button>
      {message !== '' ? (
        <output className="text-[14px] text-[var(--color-text-muted)]">{HINT_TEXT[message]}</output>
      ) : null}
    </div>
  )
}

export const HintButton = memo(HintButtonImpl)
