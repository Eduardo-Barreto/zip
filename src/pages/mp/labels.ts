// Player labels are derived from join order (seat). No name-entry UI — seat 1 is
// always the host. The local player is marked "Você" by the caller via myId.

export function seatLabel(seat: number): string {
  return seat === 1 ? 'Anfitrião' : `Jogador ${seat}`
}

export function formatTime(ms: number | null): string {
  if (ms === null) return '—'
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function seriesLabel(bestOf: import('../../transport/messages').SeriesFormat): string {
  return bestOf === null ? 'Infinito' : `Melhor de ${bestOf}`
}
