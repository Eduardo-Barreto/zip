import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Vitest aliases `window` to `globalThis`, so `window.localStorage` returns
// Node's stub (undefined). The real jsdom instance lives at
// `globalThis.jsdom`; pull Storage from there.
type WithJsdom = typeof globalThis & {
  jsdom?: { window: Window & typeof globalThis }
}

const dom = (globalThis as WithJsdom).jsdom
if (dom?.window) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: dom.window.localStorage,
    configurable: true,
    writable: true,
  })
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: dom.window.sessionStorage,
    configurable: true,
    writable: true,
  })
}

afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
})
