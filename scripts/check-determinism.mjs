#!/usr/bin/env node
// Determinism guard (AC26): the puzzle core in src/game/** must be fully
// reproducible from `seed = gameNumber`. Any non-deterministic source there
// (Math.random, Date.now, new Date) would make generatePuzzle(N) differ
// across devices and break multiplayer fairness + snapshot tests.
// The ONLY sanctioned non-determinism lives in src/transport/peer-ids.ts
// (room codes), which is outside src/game and intentionally random.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const GAME_DIR = join(ROOT, 'src', 'game')

// Forbidden patterns. \b on identifiers; `new Date` allows whitespace variants.
const FORBIDDEN = [
  { re: /\bMath\.random\b/, name: 'Math.random' },
  { re: /\bDate\.now\b/, name: 'Date.now' },
  { re: /\bnew\s+Date\b/, name: 'new Date' },
  { re: /\bperformance\.now\b/, name: 'performance.now' },
]

function walk(dir) {
  let files = []
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return files // src/game may not exist yet during scaffold
  }
  for (const entry of entries) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      files = files.concat(walk(full))
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
      files.push(full)
    }
  }
  return files
}

const violations = []
for (const file of walk(GAME_DIR)) {
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    // skip comments cheaply
    const code = line.replace(/\/\/.*$/, '')
    for (const { re, name } of FORBIDDEN) {
      if (re.test(code)) {
        violations.push(`${file}:${i + 1}  forbidden: ${name}`)
      }
    }
  })
}

if (violations.length > 0) {
  console.error('Determinism guard FAILED — non-deterministic source in src/game/**:')
  for (const v of violations) console.error(`  ${v}`)
  console.error('\nThe puzzle core must be reproducible from seed=gameNumber.')
  console.error('Use the injected mulberry32 prng instead. (AC26)')
  process.exit(1)
}

console.log('Determinism guard OK — src/game/** is reproducible (AC26).')
