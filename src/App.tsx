import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import Home from './pages/Home'
import LevelSelect from './pages/LevelSelect'
import Play from './pages/Play'

// Routing lives here. Single-player pages load eagerly (they are the hot path);
// multiplayer pages are code-split with React.lazy so only players who open a
// 1v1 link pay for that bundle (bundle-dynamic-imports). The mp/* modules are
// placeholders today and get filled by the multiplayer step.
const Host = lazy(() => import('./pages/mp/Host'))
const Join = lazy(() => import('./pages/mp/Join'))
const Race = lazy(() => import('./pages/mp/Race'))
const Result = lazy(() => import('./pages/mp/Result'))

function Loading() {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center font-[var(--font-mono)] text-[var(--color-text-muted)]">
      Carregando…
    </main>
  )
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/play/:n" element={<Play />} />
      <Route path="/levels" element={<LevelSelect />} />
      <Route
        path="/mp/host"
        element={
          <Suspense fallback={<Loading />}>
            <Host />
          </Suspense>
        }
      />
      <Route
        path="/mp/join"
        element={
          <Suspense fallback={<Loading />}>
            <Join />
          </Suspense>
        }
      />
      <Route
        path="/mp/join/:roomCode"
        element={
          <Suspense fallback={<Loading />}>
            <Join />
          </Suspense>
        }
      />
      <Route
        path="/mp/race"
        element={
          <Suspense fallback={<Loading />}>
            <Race />
          </Suspense>
        }
      />
      <Route
        path="/mp/result"
        element={
          <Suspense fallback={<Loading />}>
            <Result />
          </Suspense>
        }
      />
    </Routes>
  )
}
