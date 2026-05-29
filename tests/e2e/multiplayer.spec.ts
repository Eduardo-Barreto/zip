import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { generatePuzzleWith } from '../../src/game/generate'

// AC22: a real 1v1 over the broadcast transport (the dev server runs
// VITE_TRANSPORT=broadcast). Two browser PAGES share one BroadcastChannel-backed
// room:
//   1. Page A opens #/mp/host, selects Fácil difficulty, and waits for a code.
//   2. Page B opens #/mp/join/<code> and connects.
//   3. BOTH reach the race on the SAME puzzle — board visible on both, same
//      level badge (#003 for difficulty=3).
//   4. The host solves by drawing the exact solution (recomputed in the test
//      process from data-seed / data-difficulty the race header exposes).
//   5. Host is declared winner; guest gets 'lost'.
//   6. Host clicks "Jogar novamente" — SAME room, new puzzle. Both pages return
//      to the race board, confirming in-place rematch works; the new seed
//      differs from the first (random per match).
//
// DEVIATION (justified): the brief says "two browser contexts". BroadcastChannel
// is partitioned per origin AND per browsing-context group, so messages do NOT
// cross separate `browser.newContext()` instances (the host sits forever on
// "Sala criada"). We use two PAGES of one context — the only configuration where
// the broadcast transport bridges the parties. Production uses peerjs.

type Pt = { x: number; y: number }

async function cellCenter(page: Page, index: number): Promise<Pt> {
  const box = await page.locator(`[data-cell="${index}"]`).boundingBox()
  if (box === null) throw new Error(`no bounding box for cell ${index}`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/** Read seed+difficulty from the race header, recompute solution in test process. */
async function drawSolution(page: Page): Promise<void> {
  const header = page.locator('[data-testid="race-header"]')
  const seedAttr = await header.getAttribute('data-seed')
  const diffAttr = await header.getAttribute('data-difficulty')
  if (seedAttr === null || diffAttr === null) throw new Error('race-header attrs missing')
  const seed = Number(seedAttr)
  const difficulty = Number(diffAttr)
  const puzzle = generatePuzzleWith(seed, difficulty)

  const first = puzzle.solution[0]
  if (first === undefined) throw new Error('empty solution')
  const head = await cellCenter(page, first)
  await page.mouse.move(head.x, head.y)
  await page.mouse.down()
  for (let i = 1; i < puzzle.solution.length; i++) {
    const cell = puzzle.solution[i]
    if (cell === undefined) continue
    const pt = await cellCenter(page, cell)
    await page.mouse.move(pt.x, pt.y, { steps: 4 })
  }
  await page.mouse.up()
}

test('AC22: two pages race over broadcast; first solver wins, loser gets result', async ({
  browser,
}) => {
  const context = await browser.newContext()
  await context.addInitScript(() => {
    try {
      window.localStorage.clear()
    } catch {
      // ignore
    }
  })

  const host = await context.newPage()
  const guest = await context.newPage()

  // 1. Host opens the picker, selects Fácil (difficulty=3, 4×4 board), confirms.
  await host.goto('/#/mp/host')
  await host.getByTestId('difficulty-fácil').click()
  await host.getByTestId('create-room').click()

  // 2. Read the room code (now shown in the lobby after confirming difficulty).
  const codeEl = host.getByTestId('room-code')
  await expect(codeEl).toBeVisible()
  const roomCode = (await codeEl.textContent())?.trim() ?? ''
  expect(roomCode).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/)

  // 3. Guest joins via the deep link.
  await guest.goto(`/#/mp/join/${roomCode}`)

  // 4. Both reach the race — board visible on both, same difficulty badge.
  await expect(host.getByTestId('board')).toBeVisible({ timeout: 15_000 })
  await expect(guest.getByTestId('board')).toBeVisible({ timeout: 15_000 })
  await expect(host.getByText('#003')).toBeVisible()
  await expect(guest.getByText('#003')).toBeVisible()

  // Record seed for first round (to verify rematch changes it).
  const firstSeed = await host.locator('[data-testid="race-header"]').getAttribute('data-seed')

  // 5. Host draws the exact solution (computed from data-seed + data-difficulty).
  await drawSolution(host)

  // 6. Host wins; guest gets lost.
  await expect(host.getByTestId('result')).toHaveAttribute('data-outcome', 'won', {
    timeout: 15_000,
  })
  await expect(guest.getByTestId('result')).toHaveAttribute('data-outcome', 'lost', {
    timeout: 15_000,
  })

  // 7. Same-room rematch: host clicks "Jogar novamente". The peer connection
  //    stays open; both pages transition back to the race with a fresh board.
  await host.getByTestId('rematch').click()

  await expect(host.getByTestId('board')).toBeVisible({ timeout: 15_000 })
  await expect(guest.getByTestId('board')).toBeVisible({ timeout: 15_000 })

  // The seed must differ from round 1 — proves seeds are random per match.
  const secondSeed = await host.locator('[data-testid="race-header"]').getAttribute('data-seed')
  expect(secondSeed).not.toBeNull()
  expect(secondSeed).not.toBe(firstSeed)

  await context.close()
})
