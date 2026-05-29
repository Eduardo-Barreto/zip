import { useCallback, useState } from 'react'
import type { Progress } from '../game/progress'
import { load, recordCompletion, save } from '../game/progress'

// Progress state for the whole app. localStorage is read exactly ONCE at boot
// via the lazy useState initializer (advanced-init-once / js-cache-storage);
// thereafter the in-memory Progress is the source of truth and each completion
// records + persists + updates state together.

export type CompletionResult = { stars: number; timeMs: number; hintsUsed: number }

export type UseProgress = {
  currentGame: number
  completed: Progress['completed']
  streak: number
  /** Record a finished level, persist it, and advance currentGame. */
  completeLevel: (gameNumber: number, result: CompletionResult) => Progress
}

export function useProgress(): UseProgress {
  const [progress, setProgress] = useState<Progress>(() => load())

  const completeLevel = useCallback((gameNumber: number, result: CompletionResult): Progress => {
    const next = recordCompletion(load(), gameNumber, result)
    save(next)
    setProgress(next)
    return next
  }, [])

  return {
    currentGame: progress.currentGame,
    completed: progress.completed,
    streak: progress.streak,
    completeLevel,
  }
}
