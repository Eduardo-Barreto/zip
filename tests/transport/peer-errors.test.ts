import { describe, expect, it } from 'vitest'
import { classifyPeerError } from '../../src/transport/peer-errors'

describe('classifyPeerError: insecure-context (browser blocks WebRTC on http)', () => {
  it('classifies a SecurityError DOMException by name', () => {
    const err = { name: 'SecurityError', message: 'The operation is insecure.' }
    const classified = classifyPeerError(err)
    expect(classified.kind).toBe('insecure-context')
    expect(classified.retryable).toBe(false)
    expect(classified.message).toContain('https://')
  })

  it('falls back to the message when the name is missing', () => {
    const classified = classifyPeerError(new Error('The operation is insecure.'))
    expect(classified.kind).toBe('insecure-context')
  })

  it('keeps mapping peerjs typed errors', () => {
    const err = Object.assign(new Error('could not connect'), { type: 'peer-unavailable' })
    expect(classifyPeerError(err).kind).toBe('peer-unavailable')
  })

  it('leaves unrelated errors as unknown', () => {
    expect(classifyPeerError(new Error('boom')).kind).toBe('unknown')
  })
})
