import { useCallback, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { exportSave, importSave, load, save } from '../game/progress'
import { useProgress } from '../hooks/useProgress'

// Entry screen. Mobile-first, board-is-hero spirit even on the menu: one teal
// primary action (Continue), quiet secondary links, and a tucked-away save
// transfer panel. No shadow-on-everything; body text stays >= 14px.

type Panel = 'none' | 'export' | 'import'

export default function Home() {
  const navigate = useNavigate()
  const { currentGame } = useProgress()
  const [panel, setPanel] = useState<Panel>('none')
  const [code, setCode] = useState('')
  const [importValue, setImportValue] = useState('')
  const [imported, setImported] = useState(false)

  const handleExport = useCallback(() => {
    setCode(exportSave(load()))
    setPanel('export')
  }, [])

  const handleImport = useCallback(() => {
    const restored = importSave(importValue)
    save(restored)
    setImported(true)
    // A reload re-seeds every screen from the freshly imported progress.
    navigate(`/play/${restored.currentGame}`)
  }, [importValue, navigate])

  return (
    <main className="fade-in mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center gap-8 px-6 py-10">
      <div className="decorative-grid decorative-grid--masked" aria-hidden="true" />
      <div className="glow" aria-hidden="true" />

      <div className="text-center">
        <h1 className="section-heading text-5xl text-[var(--color-accent)]">Zip</h1>
        <p className="mt-3 text-[15px] text-[var(--color-text-muted)]">
          Conecte 1→N preenchendo todo o tabuleiro. Progressão infinita.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <Link
          to={`/play/${currentGame}`}
          className="card-lift rounded-xl px-6 py-4 text-center font-[var(--font-mono)] text-[16px] font-bold tracking-tight text-[#0a0a0a] active:scale-95"
          style={{
            backgroundColor: 'var(--color-accent)',
            boxShadow: '0 12px 36px -12px color-mix(in srgb, var(--color-accent) 70%, transparent)',
          }}
        >
          Continuar — nível {currentGame}
        </Link>
        <Link
          to="/levels"
          className="spotlight-card card-lift rounded-xl px-6 py-3 text-center text-[15px] text-[var(--color-text)]"
        >
          Níveis
        </Link>
        <Link
          to="/mp/host"
          className="spotlight-card card-lift rounded-xl px-6 py-3 text-center text-[15px] text-[var(--color-text)]"
        >
          Multiplayer 1v1
        </Link>
      </div>

      <div
        className="flex flex-col gap-3 border-t pt-6"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleExport}
            className="card-lift flex-1 rounded-lg px-4 py-2 text-[14px] text-[var(--color-text-muted)] active:scale-95"
            style={{
              backgroundColor: 'var(--color-bg-card)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            Exportar
          </button>
          <button
            type="button"
            onClick={() => setPanel('import')}
            className="card-lift flex-1 rounded-lg px-4 py-2 text-[14px] text-[var(--color-text-muted)] active:scale-95"
            style={{
              backgroundColor: 'var(--color-bg-card)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            Importar
          </button>
        </div>

        {panel === 'export' ? (
          <textarea
            readOnly
            value={code}
            aria-label="Código de exportação"
            className="w-full rounded-lg bg-[var(--color-bg-card)] p-3 font-[var(--font-mono)] text-[13px] text-[var(--color-text)]"
            style={{ border: '1px solid rgba(255, 255, 255, 0.06)' }}
            rows={3}
            onFocus={(e) => e.currentTarget.select()}
          />
        ) : null}

        {panel === 'import' ? (
          <div className="flex flex-col gap-2">
            <textarea
              value={importValue}
              onChange={(e) => setImportValue(e.target.value)}
              aria-label="Código de importação"
              placeholder="Cole seu código de progresso"
              className="w-full rounded-lg bg-[var(--color-bg-card)] p-3 font-[var(--font-mono)] text-[13px] text-[var(--color-text)]"
              style={{ border: '1px solid rgba(255, 255, 255, 0.06)' }}
              rows={3}
            />
            <button
              type="button"
              onClick={handleImport}
              className="card-lift rounded-lg px-4 py-2 font-[var(--font-mono)] text-[14px] font-bold text-[var(--color-accent)] active:scale-95"
              style={{
                backgroundColor:
                  'color-mix(in srgb, var(--color-accent) 10%, var(--color-bg-card))',
                border: '1px solid color-mix(in srgb, var(--color-accent) 40%, transparent)',
              }}
            >
              Restaurar progresso
            </button>
            {imported ? (
              <span className="text-[13px] text-[var(--color-text-muted)]" role="status">
                Progresso restaurado.
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </main>
  )
}
