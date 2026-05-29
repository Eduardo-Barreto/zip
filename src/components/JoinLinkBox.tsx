import { useEffect, useState } from 'react'

// The shareable join link + QR for a 1v1 room. `qrcode` is pulled in via a
// DYNAMIC import (bundle-dynamic-imports) so only hosts who actually open a
// room pay for the QR bundle. Theme matches the barreto palette: dark surface,
// mono text, blue accent. The link is a HashRouter route (#/mp/join/:roomCode)
// so it resolves on a static host without server rewrites.

type Props = {
  roomCode: string
}

export function JoinLinkBox({ roomCode }: Props) {
  const [copied, setCopied] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  // Include the deploy base path (import.meta.env.BASE_URL is '/zip/' on the
  // GitHub Pages build, '/' in dev) — otherwise the link drops to the origin
  // root and 404s on a project Pages site. BASE_URL always ends with '/'.
  const url = `${window.location.origin}${import.meta.env.BASE_URL}#/mp/join/${roomCode}`

  useEffect(() => {
    let cancelled = false
    import('qrcode').then(({ default: QRCode }) => {
      if (cancelled) return
      QRCode.toString(url, {
        type: 'svg',
        margin: 1,
        color: { dark: '#e5e5e5', light: '#0a0a0a00' },
        errorCorrectionLevel: 'M',
      }).then((svg) => {
        if (!cancelled) setQrDataUrl(`data:image/svg+xml;base64,${btoa(svg)}`)
      })
    })
    return () => {
      cancelled = true
    }
  }, [url])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = url
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className="spotlight-card rounded-xl p-4 font-[var(--font-mono)] text-[13px]"
      style={{ color: 'var(--color-text-muted)' }}
      data-testid="join-link-box"
    >
      <div className="flex flex-col items-center gap-4">
        {qrDataUrl !== null ? (
          <img
            src={qrDataUrl}
            alt="QR code do convite"
            className="size-40 shrink-0 rounded-lg"
            style={{ backgroundColor: 'var(--color-bg)', padding: '8px' }}
            data-testid="join-qr"
          />
        ) : (
          <div
            className="size-40 shrink-0 animate-pulse rounded-lg"
            style={{ backgroundColor: 'var(--color-bg-card-hover)' }}
            aria-hidden="true"
          />
        )}
        <div className="w-full min-w-0 text-center">
          <p className="text-[var(--color-text-dim)]">peça pro oponente entrar em</p>
          <p
            className="mt-1 break-all text-[14px]"
            style={{ color: 'var(--color-text)' }}
            data-testid="join-url"
          >
            {url}
          </p>
          <p className="mt-3 text-[var(--color-text-dim)]">
            ou só passe o código{' '}
            <span
              className="text-[18px] font-bold tracking-[0.2em]"
              style={{ color: 'var(--color-accent)' }}
              data-testid="room-code"
            >
              {roomCode}
            </span>
          </p>
          <button
            type="button"
            onClick={copy}
            className="card-lift mt-4 rounded-lg px-4 py-2 text-[12px] uppercase tracking-widest active:scale-95"
            style={{
              backgroundColor: 'var(--color-bg-card)',
              border: '1px solid var(--color-border)',
              color: copied ? 'var(--color-accent)' : 'var(--color-text-muted)',
            }}
            data-testid="copy-link"
            aria-label="Copiar link de convite"
          >
            {copied ? '✓ copiado' : '⧉ copiar link'}
          </button>
        </div>
      </div>
    </div>
  )
}
