import { Route, Routes } from 'react-router-dom'

// Pages are added in later implementation steps. This shell keeps the
// scaffold type-checkable and routable from the start.
function Home() {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-3xl text-[var(--color-accent)]">Zip</h1>
      <p className="text-[var(--color-ink-muted)]">
        Quebra-cabeças de caminho com progressão infinita.
      </p>
    </main>
  )
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
    </Routes>
  )
}
