import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { generatePuzzleWith } from '../../src/game/generate'

// A real multiplayer match over the broadcast transport (the dev server runs
// VITE_TRANSPORT=broadcast). Two browser PAGES share one BroadcastChannel-backed
// room and exercise the full N-player flow at N=2:
//   1. Page A opens #/mp/host, selects Fácil difficulty, opens the room.
//   2. Page B opens #/mp/join/<code> and lands in the lobby.
//   3. Guest marks Pronto; host's "Iniciar partida" enables; host starts.
//   4. BOTH reach the race on the SAME puzzle — board visible on both, same
//      level badge (#003 for difficulty=3).
//   5. The host solves by drawing the exact solution (recomputed in the test
//      process from data-seed / data-difficulty the race header exposes).
//   6. Host is declared winner; guest gets 'lost'; the scoreboard shows the win.
//   7. Rematch needs BOTH: the host votes and sees "aguardando"; only after the
//      guest also votes does the SAME room start a fresh puzzle (new seed).
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

test('multiplayer: lobby ready-up, host starts, first solver wins, all-vote rematch', async ({
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

  // 3. Guest joins via the deep link and lands in the lobby.
  await guest.goto(`/#/mp/join/${roomCode}`)
  await expect(guest.getByTestId('ready-toggle')).toBeVisible({ timeout: 15_000 })

  // The host cannot start until the guest is ready.
  await expect(host.getByTestId('start-match')).toBeDisabled()

  // 4. Guest marks Pronto -> host's start button enables -> host starts.
  await guest.getByTestId('ready-toggle').click()
  await expect(host.getByTestId('start-match')).toBeEnabled({ timeout: 15_000 })
  await host.getByTestId('start-match').click()

  // 5. Both reach the race — board visible on both, same difficulty badge.
  await expect(host.getByTestId('board')).toBeVisible({ timeout: 15_000 })
  await expect(guest.getByTestId('board')).toBeVisible({ timeout: 15_000 })
  await expect(host.getByText('#003')).toBeVisible()
  await expect(guest.getByText('#003')).toBeVisible()

  // Record seed for first round (to verify rematch changes it).
  const firstSeed = await host.locator('[data-testid="race-header"]').getAttribute('data-seed')

  // 6. Host draws the exact solution (computed from data-seed + data-difficulty).
  await drawSolution(host)

  // 7. Host wins; guest gets lost; the scoreboard records the host's win.
  await expect(host.getByTestId('result')).toHaveAttribute('data-outcome', 'won', {
    timeout: 15_000,
  })
  await expect(guest.getByTestId('result')).toHaveAttribute('data-outcome', 'lost', {
    timeout: 15_000,
  })
  await expect(host.getByTestId('standings')).toBeVisible()
  await expect(host.getByTestId('wins-1')).toContainText('1')

  // 8. Rematch needs BOTH. Host votes first and waits; nobody restarts yet.
  await host.getByTestId('rematch').click()
  await expect(host.getByTestId('rematch-waiting')).toBeVisible()
  await expect(host.getByTestId('board')).toBeHidden()

  // Guest votes too -> SAME room starts a fresh puzzle on both pages.
  await guest.getByTestId('rematch').click()
  await expect(host.getByTestId('board')).toBeVisible({ timeout: 15_000 })
  await expect(guest.getByTestId('board')).toBeVisible({ timeout: 15_000 })

  // The seed must differ from round 1 — proves seeds are random per match.
  const secondSeed = await host.locator('[data-testid="race-header"]').getAttribute('data-seed')
  expect(secondSeed).not.toBeNull()
  expect(secondSeed).not.toBe(firstSeed)

  await context.close()
})
