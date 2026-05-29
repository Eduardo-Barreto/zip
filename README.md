# Zip

An infinite, procedurally-generated path puzzle (LinkedIn-Zip style): draw one
continuous line that visits every cell and passes the numbered checkpoints in
order. Levels are generated deterministically from a seed and ramp up forever —
bigger grids, more checkpoints, more walls.

- **Single-player** — infinite levels, hints, timer, stars/streak, progress saved locally.
- **1v1 multiplayer** over WebRTC (PeerJS) — host picks the difficulty, both race the same puzzle, rematch in the same room.
- **Mobile-first**, responsive, dark UI.

## Stack

React 19 · Vite · Tailwind v4 · react-router · PeerJS · TypeScript · Bun.

## Develop

```bash
bun install
bun run dev          # local dev (portless)
bun run verify       # typecheck + biome + determinism guard + unit tests
bun run test:e2e     # Playwright end-to-end
```

The puzzle core (`src/game/**`) is pure and fully deterministic — a lint guard
forbids `Math.random`/`Date` there so `generatePuzzle(n)` is identical on every
device.

## Deploy

Pushing to `main` builds and publishes to GitHub Pages via
`.github/workflows/deploy.yml`.
