import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { generatePuzzle } from '../../src/game/generate'

// Single-player acceptance criteria (AC11–AC15). The puzzle core is fully
// deterministic from seed = gameNumber, so the test computes generatePuzzle(1)
// here and drives pointer events along the known solution. Cell centres are
// read from the live DOM via the [data-cell] rects the Board exposes.

const LEVEL = 1
const puzzle = generatePuzzle(LEVEL)

type Pt = { x: number; y: number }

async function cellCenter(page: Page, index: number): Promise<Pt> {
  const box = await page.locator(`[data-cell="${index}"]`).boundingBox()
  if (box === null) throw new Error(`no bounding box for cell ${index}`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function drawPath(page: Page, cells: readonly number[]): Promise<void> {
  const first = cells[0]
  if (first === undefined) return
  const head = await cellCenter(page, first)
  await page.mouse.move(head.x, head.y)
  await page.mouse.down()
  for (let i = 1; i < cells.length; i++) {
    const cell = cells[i]
    if (cell === undefined) continue
    const p = await cellCenter(page, cell)
    // Move in a couple of steps so pointermove fires reliably mid-cell.
    await page.mouse.move(p.x, p.y, { steps: 3 })
  }
  await page.mouse.up()
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      window.localStorage.clear()
    } catch {
      // ignore
    }
  })
})

test('AC12: solve level 1, see win overlay, currentGame advances to 2', async ({ page }) => {
  await page.goto(`/#/play/${LEVEL}`)
  await expect(page.getByTestId('board')).toBeVisible()

  await drawPath(page, puzzle.solution)

  await expect(page.getByTestId('board')).toHaveAttribute('data-solved', 'true')
  await expect(page.getByTestId('win-overlay')).toBeVisible()

  const currentGame = await page.evaluate(() => {
    const raw = window.localStorage.getItem('zip:progress')
    if (raw === null) return null
    return (JSON.parse(raw) as { currentGame: number }).currentGame
  })
  expect(currentGame).toBe(2)
})

test('AC13: backtracking onto the previous cell shortens the path', async ({ page }) => {
  await page.goto(`/#/play/${LEVEL}`)
  await expect(page.getByTestId('board')).toBeVisible()

  const head = await cellCenter(page, puzzle.solution[0] as number)
  await page.mouse.move(head.x, head.y)
  await page.mouse.down()
  // Draw the first four cells of the solution.
  for (let i = 1; i < 4; i++) {
    const p = await cellCenter(page, puzzle.solution[i] as number)
    await page.mouse.move(p.x, p.y, { steps: 3 })
  }
  const drawn = await page.locator('[data-cell][data-on-path]').count()

  // Move back onto the second-to-last drawn cell — this pops the head.
  const back = await cellCenter(page, puzzle.solution[2] as number)
  await page.mouse.move(back.x, back.y, { steps: 3 })
  await page.mouse.up()

  const after = await page.locator('[data-cell][data-on-path]').count()
  expect(after).toBe(drawn - 1)
})

test('AC14: tapping Hint highlights the next correct cell', async ({ page }) => {
  await page.goto(`/#/play/${LEVEL}`)
  await expect(page.getByTestId('board')).toBeVisible()

  await page.getByTestId('hint').click()

  const hinted = page.locator('[data-cell][data-hint="true"]')
  await expect(hinted).toHaveCount(1)
  // The hint from an empty prefix is the order-1 start cell.
  const start = [...puzzle.numbers.entries()].find(([, order]) => order === 1)?.[0]
  await expect(hinted).toHaveAttribute('data-cell', String(start))
})

test('AC15: dragging the board does not scroll the page', async ({ page }) => {
  await page.goto(`/#/play/${LEVEL}`)
  await expect(page.getByTestId('board')).toBeVisible()

  // Make the page taller than the viewport so scrolling is possible.
  await page.evaluate(() => {
    const spacer = document.createElement('div')
    spacer.style.height = '2000px'
    document.body.appendChild(spacer)
  })

  const a = await cellCenter(page, puzzle.solution[0] as number)
  const b = await cellCenter(page, puzzle.solution[1] as number)
  const c = await cellCenter(page, puzzle.solution[2] as number)

  await page.touchscreen.tap(a.x, a.y)
  // Touch drag across the board surface.
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(b.x, b.y, { steps: 4 })
  await page.mouse.move(c.x, c.y, { steps: 4 })
  await page.mouse.up()

  const scrollY = await page.evaluate(() => window.scrollY)
  expect(scrollY).toBe(0)
})

test('AC11: continuous drag stays within frame budget (<=32ms gate, 16ms target)', async ({
  page,
}) => {
  await page.goto(`/#/play/${LEVEL}`)
  await expect(page.getByTestId('board')).toBeVisible()

  // Install a requestAnimationFrame sampler that records the max delta.
  await page.evaluate(() => {
    const w = window as unknown as { __frame: { last: number; max: number } }
    w.__frame = { last: 0, max: 0 }
    const tick = (t: number) => {
      const s = w.__frame
      if (s.last !== 0) {
        const delta = t - s.last
        if (delta > s.max) s.max = delta
      }
      s.last = t
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })

  // Continuous drag along the full solution to exercise the hot path.
  const first = await cellCenter(page, puzzle.solution[0] as number)
  await page.mouse.move(first.x, first.y)
  await page.mouse.down()
  for (let i = 1; i < puzzle.solution.length; i++) {
    const p = await cellCenter(page, puzzle.solution[i] as number)
    await page.mouse.move(p.x, p.y, { steps: 6 })
  }
  await page.mouse.up()

  const maxDelta = await page.evaluate(() => {
    const w = window as unknown as { __frame: { max: number } }
    return w.__frame.max
  })

  // Hard gate at 32ms (one frame of CI jitter tolerance); target is 16ms.
  console.log(`AC11 max frame delta: ${maxDelta.toFixed(2)}ms (gate <=32, target <=16)`)
  expect(maxDelta).toBeLessThanOrEqual(32)
})
