import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { generatePuzzle } from '../../src/game/generate'

// AC22: a real 1v1 over the broadcast transport (the dev server runs
// VITE_TRANSPORT=broadcast). Two browser PAGES share one BroadcastChannel-backed
// room:
//   1. Page A opens #/mp/host and gets a 4-letter room code.
//   2. Page B opens #/mp/join/<code> and connects.
//   3. BOTH reach the race on the SAME puzzle (gameNumber 1, deterministic from
//      seed — asserted by the board appearing for both and carrying the same
//      level number in the header).
//   4. The host solves first by drawing the known solution of puzzle 1.
//   5. The host is declared the winner; the guest receives a result and shows
//      'lost'. The two-page drag is deterministic because both sides regenerate
//      the identical puzzle from the single gameNumber on the wire.
//
// DEVIATION (justified): the brief says "two browser contexts". BroadcastChannel
// is partitioned per origin AND per browsing-context group, so messages do NOT
// cross separate `browser.newContext()` instances — a two-context test can never
// complete the handshake (the host sits forever on "Sala criada"). The two
// parties must live in the SAME context. We therefore use two PAGES of one
// context, which is the only configuration where the broadcast transport can
// actually bridge them. (Real cross-device play uses the peerjs transport in
// production; broadcast is the dev/e2e stand-in for two same-origin tabs.)

const GAME = 1
const puzzle = generatePuzzle(GAME)

type Pt = { x: number; y: number }

async function cellCenter(page: Page, index: number): Promise<Pt> {
  const box = await page.locator(`[data-cell="${index}"]`).boundingBox()
  if (box === null) throw new Error(`no bounding box for cell ${index}`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function drawSolution(page: Page): Promise<void> {
  const first = puzzle.solution[0]
  if (first === undefined) throw new Error('empty solution')
  const head = await cellCenter(page, first)
  await page.mouse.move(head.x, head.y)
  await page.mouse.down()
  for (let i = 1; i < puzzle.solution.length; i++) {
    const cell = puzzle.solution[i]
    if (cell === undefined) continue
    const p = await cellCenter(page, cell)
    await page.mouse.move(p.x, p.y, { steps: 4 })
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

  // 1. Host creates a room and surfaces the code.
  await host.goto('/#/mp/host')
  const codeEl = host.getByTestId('room-code')
  await expect(codeEl).toBeVisible()
  const roomCode = (await codeEl.textContent())?.trim() ?? ''
  expect(roomCode).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/)

  // 2. Guest joins via the deep link.
  await guest.goto(`/#/mp/join/${roomCode}`)

  // 3. Both reach the race on the same puzzle (board visible on both, same
  //    level number in each header).
  await expect(host.getByTestId('board')).toBeVisible({ timeout: 15_000 })
  await expect(guest.getByTestId('board')).toBeVisible({ timeout: 15_000 })

  const level = `#${String(GAME).padStart(3, '0')}`
  await expect(host.getByText(level)).toBeVisible()
  await expect(guest.getByText(level)).toBeVisible()

  // 4. Host solves first by drawing the known solution. Solving immediately
  //    transitions the host off the board into the result view, so we assert the
  //    outcome directly rather than the transient data-solved board attribute.
  await drawSolution(host)

  // 5. Host is declared the winner; guest receives a result (lost).
  await expect(host.getByTestId('result')).toHaveAttribute('data-outcome', 'won', {
    timeout: 15_000,
  })
  await expect(guest.getByTestId('result')).toHaveAttribute('data-outcome', 'lost', {
    timeout: 15_000,
  })

  await context.close()
})
