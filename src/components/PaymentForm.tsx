import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, Copy, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { submitPayment } from '../lib/api-client'
import type { PaymentDestinations, Plan } from '../lib/sync-types'

type Method = 'bkash' | 'nagad'

export default function PaymentForm({
  plan,
  payment,
  email,
  reference,
  onCancel,
  onSubmitted,
}: {
  plan: Plan
  payment: PaymentDestinations
  email: string
  reference: string
  onCancel: () => void
  onSubmitted: () => void
}) {
  const [method, setMethod] = useState<Method>(payment.bkash ? 'bkash' : 'nagad')
  const [txnId, setTxnId] = useState('')
  const [senderNumber, setSenderNumber] = useState('')
  const [token, setToken] = useState('')
  const [honeypot, setHoneypot] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const startedAt = useRef(0)
  const turnstileRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    startedAt.current = Date.now()
  }, [])

  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined
  const number = method === 'bkash' ? payment.bkash : payment.nagad

  useEffect(() => {
    if (!siteKey || !turnstileRef.current) return

    type TurnstileApi = {
      render: (
        element: HTMLElement,
        options: { sitekey: string; theme?: string; callback: (value: string) => void },
      ) => void
    }

    const container = turnstileRef.current
    let cancelled = false

    function render() {
      const api = (window as unknown as { turnstile?: TurnstileApi }).turnstile
      if (!api || cancelled) return
      api.render(container, {
        sitekey: siteKey as string,
        theme: 'light',
        callback: setToken,
      })
    }

    const api = (window as unknown as { turnstile?: TurnstileApi }).turnstile
    if (api) {
      render()
    } else {
      const script = document.createElement('script')
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
      script.async = true
      script.onload = render
      document.head.appendChild(script)
    }

    return () => {
      cancelled = true
    }
  }, [siteKey])

  async function copyNumber() {
    try {
      await navigator.clipboard.writeText(number)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Could not copy the number')
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return

    setError(null)
    setBusy(true)

    const result = await submitPayment({
      plan: plan.id,
      method,
      txnId,
      senderNumber: senderNumber.trim() || undefined,
      turnstileToken: token,
      honeypot,
      elapsedMs: Date.now() - startedAt.current,
    })

    if (!result.ok) {
      setError(result.error)
      setBusy(false)
      return
    }

    toast.success('Thanks — we are checking your payment now.')
    setBusy(false)
    onSubmitted()
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <button
        type="button"
        onClick={onCancel}
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <ArrowLeft className="size-3.5" strokeWidth={2} aria-hidden="true" />
        Choose another plan
      </button>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-xl border border-line bg-canvas/60 p-4">
          <p className="text-[12px] font-semibold text-ink">
            Send ৳{plan.priceBdt} BDT to
          </p>

          <div className="mt-2 flex items-center gap-2">
            <span className="font-mono text-[19px] font-semibold tracking-tight text-ink">{number || '—'}</span>
            <button
              type="button"
              onClick={() => void copyNumber()}
              aria-label="Copy payment number"
              className="grid size-7 place-items-center rounded-md border border-line bg-surface text-ink-faint transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {copied ? (
                <Check className="size-3.5 text-brand-deep" strokeWidth={2.25} aria-hidden="true" />
              ) : (
                <Copy className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
              )}
            </button>
          </div>

          <div className="mt-3 inline-flex rounded-lg border border-line bg-surface p-0.5">
            {(['bkash', 'nagad'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setMethod(option)}
                aria-pressed={method === option}
                className={[
                  'rounded-md px-3 py-1.5 text-[12px] font-medium capitalize transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
                  method === option ? 'bg-ink text-surface' : 'text-ink-muted hover:text-ink',
                ].join(' ')}
              >
                {option}
              </button>
            ))}
          </div>

          <dl className="mt-3 space-y-1 text-[12px]">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-ink-muted">Reference</dt>
              <dd className="font-mono text-ink">{reference}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-ink-muted">Plan</dt>
              <dd className="text-ink">{plan.label}</dd>
            </div>
          </dl>

          <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
            Send the exact amount, then paste the transaction ID below. Payments are checked by hand,
            so activation can take a few minutes.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium text-ink">Transaction ID (TrxID)</span>
            <input
              type="text"
              required
              value={txnId}
              onChange={(event) => {
                setTxnId(event.target.value)
                setError(null)
              }}
              autoComplete="off"
              spellCheck={false}
              className="h-9 w-full rounded-lg border border-line bg-surface px-3 font-mono text-[13px] text-ink transition-colors placeholder:font-sans placeholder:text-ink-faint focus:border-brand focus:ring-2 focus:ring-brand/15 focus:outline-none"
              placeholder="e.g. 9F2K1L7Q"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium text-ink">
              Your {method} number
            </span>
            <input
              type="tel"
              value={senderNumber}
              onChange={(event) => setSenderNumber(event.target.value)}
              autoComplete="tel"
              className="h-9 w-full rounded-lg border border-line bg-surface px-3 text-[13px] text-ink transition-colors placeholder:text-ink-faint focus:border-brand focus:ring-2 focus:ring-brand/15 focus:outline-none"
              placeholder="01XXXXXXXXX"
            />
          </label>

          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            value={honeypot}
            onChange={(event) => setHoneypot(event.target.value)}
            className="pointer-events-none absolute size-0 opacity-0"
          />

          <div ref={turnstileRef} />

          {error ? (
            <p role="alert" className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-[12px] text-danger">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy || !txnId.trim()}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-40"
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            I have sent the money
          </button>

          <p className="text-center text-[11px] text-ink-faint">
            Signed in as {email || 'your Google account'}
          </p>
        </form>
      </div>
    </div>
  )
}
