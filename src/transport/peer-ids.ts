const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const ROOM_CODE_LEN = 4

const ROOM_CODE_REGEX = /^[ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/

export function isValidRoomCode(s: string): boolean {
  return ROOM_CODE_REGEX.test(s)
}

// Math.random is the intentional, non-deterministic source here: this module
// lives outside src/game, so the determinism guard (which only covers the game
// core) does not apply.
export function generateRoomCode(): string {
  let out = ''
  for (let i = 0; i < ROOM_CODE_LEN; i++) {
    const r = Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)
    out += ROOM_CODE_ALPHABET[r]
  }
  return out
}

export function hostPeerId(roomCode: string): string {
  return `zip-host-${roomCode}`
}

export function guestPeerId(guestLocalId: string): string {
  return `zip-guest-${guestLocalId}`
}

export function generateGuestLocalId(): string {
  return Math.random().toString(36).slice(2, 10)
}
