import { describe, expect, it } from 'vitest'
import { makeProgressThrottle, PROGRESS_THROTTLE_MS } from '../../src/hooks/throttle'

// AC21: progress is emitted at most once per PROGRESS_THROTTLE_MS. The clock is
// injected, so this is fully deterministic with NO real timers — advancing the
// fake clock by <250ms must NOT pass a second time; >=250ms passes once more.

describe('AC21: progress throttle (injected clock, no real timers)', () => {
  it('passes immediately, then suppresses sends under the window', () => {
    let t = 1000
    const throttle = makeProgressThrottle(() => t)

    // First call always passes.
    expect(throttle.shouldSend()).toBe(true)

    // Advance < window (cumulative): suppressed.
    t += 100
    expect(throttle.shouldSend()).toBe(false)

    // Still under the window since the last PASS (suppressed calls do not
    // reset the clock): 100 + 100 = 200ms < 250ms.
    t += 100
    expect(throttle.shouldSend()).toBe(false)
  })

  it('passes again once exactly the window has elapsed', () => {
    let t = 0
    const throttle = makeProgressThrottle(() => t)

    expect(throttle.shouldSend()).toBe(true)
    t += PROGRESS_THROTTLE_MS
    expect(throttle.shouldSend()).toBe(true)
  })

  it('emits at most one send across a burst within a single window', () => {
    let t = 5000
    const throttle = makeProgressThrottle(() => t)

    let sent = 0
    // 20 rapid calls spread across < one window: only the first passes.
    for (let i = 0; i < 20; i++) {
      t += 5 // 20 * 5 = 100ms total, under 250ms
      if (throttle.shouldSend()) sent++
    }
    expect(sent).toBe(1)
  })

  it('emits one send per window across a long stream', () => {
    let t = 0
    const throttle = makeProgressThrottle(() => t)

    let sent = 0
    // 1000ms of 10ms ticks. First tick is at t=10 (passes), then every 250ms.
    for (let i = 0; i < 100; i++) {
      t += 10
      if (throttle.shouldSend()) sent++
    }
    // Sends fire at t = 10, 260, 510, 760 (next would be 1010 > 1000).
    expect(sent).toBe(4)
  })

  it('default window is 250ms', () => {
    expect(PROGRESS_THROTTLE_MS).toBe(250)
  })
})
