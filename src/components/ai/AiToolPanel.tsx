import { useEffect, useState } from 'react'
import { Check, Copy, Download, Sparkles, WandSparkles } from 'lucide-react'
import { toast } from 'sonner'
import { fetchAiStatus, runAi } from '../../lib/ai-client'
import type { AiMode, AiStatus } from '../../lib/ai-types'
import { copyText } from '../../lib/clipboard'
import { downloadMarkdown, markdownFilename } from '../../lib/markdown-export'

const CONSENT_KEY = 'sharkweb-ai-consent'

const COPY = {
  enhance: {
    icon: WandSparkles,
    title: 'Prompt Enhancer',
    hint: 'Write your prompt below. AI will make it clearer and stronger.',
    placeholder: 'Type your prompt here...',
  },
  generate: {
    icon: Sparkles,
    title: 'Prompt Generator',
    hint: 'Describe what you want in a few words. AI will write the full prompt.',
    placeholder: 'What do you want to do?',
  },
} as const

function hasConsent(): boolean {
  try {
    return window.localStorage.getItem(CONSENT_KEY) === '1'
  } catch {
    return false
  }
}

function grantConsent(): void {
  try {
    window.localStorage.setItem(CONSENT_KEY, '1')
  } catch {
    // Storage can be blocked; the run still proceeds for this session.
  }
}

export default function AiToolPanel({
  mode,
  onNavigate,
}: {
  mode: AiMode
  onNavigate?: (view: string) => void
}) {
  const copy = COPY[mode]
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [askConsent, setAskConsent] = useState(false)

  useEffect(() => {
    let alive = true
    fetchAiStatus().then((result) => {
      if (!alive) return
      if (result.ok) setStatus(result.data)
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(timer)
  }, [copied])

  async function execute() {
    const trimmed = input.trim()
    if (!trimmed || busy) return

    setBusy(true)
    const result = await runAi(mode, trimmed)
    setBusy(false)

    if (!result.ok) {
      const code = result.code

      if (code === 'pro_required') {
        toast.error('This tool unlocks when you buy any package.', {
          action: {
            label: 'See packages',
            onClick: () => onNavigate?.('sync'),
          },
        })
        setStatus((prev) =>
          prev ? { ...prev, available: false, reason: 'pro_required' } : prev,
        )
        return
      }

      if (code === 'quota_exhausted') {
        const free = (status?.plan ?? 'free') === 'free'
        toast.error('You have used up this month\u2019s AI allowance.', {
          action: free
            ? {
                label: 'Get Pro',
                onClick: () => onNavigate?.('sync'),
              }
            : undefined,
        })
        setStatus((prev) => (prev ? { ...prev, available: false, reason: 'quota_exhausted' } : prev))
        return
      }

      if (code === 'ai_unavailable' || code === 'ai_misconfigured') {
        toast.error('AI tools are not set up yet. The owner needs to finish the AI settings.')
        return
      }

      toast.error('That did not work. Please try again.')
      return
    }

    setOutput(result.data.text)
    fetchAiStatus().then((next) => {
      if (next.ok) setStatus(next.data)
    })
  }

  function handleRun() {
    if (!input.trim() || busy) return

    if (!hasConsent()) {
      setAskConsent(true)
      return
    }

    void execute()
  }

  function acceptConsent() {
    grantConsent()
    setAskConsent(false)
    void execute()
  }

  async function handleCopy() {
    const ok = await copyText(output)
    if (!ok) {
      toast.error('Could not copy. Please try again.')
      return
    }
    setCopied(true)
  }

  function handleExport() {
    downloadMarkdown(markdownFilename(), output)
  }

  const Icon = copy.icon
  const exhausted = status !== null && status.reason === 'quota_exhausted'

  return (
    <div className="mx-auto w-full max-w-[820px] px-5 py-8 lg:px-8 lg:py-10">
      <div className="mb-5 flex items-center gap-2">
        <Icon className="size-4 text-ink-muted" strokeWidth={1.75} aria-hidden="true" />
        <h2 className="text-[20px] font-semibold tracking-[-0.025em]">{copy.title}</h2>
      </div>

      <div className="rounded-2xl border border-line bg-surface p-4 shadow-xs sm:p-5">
        <label htmlFor={`ai-input-${mode}`} className="sr-only">
          {copy.placeholder}
        </label>
        <textarea
          id={`ai-input-${mode}`}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={copy.placeholder}
          rows={7}
          maxLength={4000}
          className="w-full resize-y rounded-xl border border-line bg-canvas px-3.5 py-3 text-[13px] leading-relaxed text-ink placeholder:text-ink-faint focus:border-brand focus:ring-2 focus:ring-brand/15 focus:outline-none"
        />

        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-[11px] text-ink-faint">{copy.hint}</p>
          <button
            type="button"
            onClick={handleRun}
            disabled={busy || !input.trim() || exhausted}
            className="inline-flex h-9 shrink-0 items-center rounded-lg bg-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
          >
            {busy ? 'Working...' : 'Run'}
          </button>
        </div>
      </div>

      {output ? (
        <div className="mt-4 rounded-2xl border border-line bg-surface p-4 shadow-xs sm:p-5">
          <label htmlFor={`ai-output-${mode}`} className="sr-only">
            Output
          </label>
          <textarea
            id={`ai-output-${mode}`}
            value={output}
            readOnly
            rows={10}
            className="w-full resize-y rounded-xl border border-line bg-canvas px-3.5 py-3 text-[13px] leading-relaxed text-ink focus:outline-none"
          />

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 text-[13px] font-medium text-ink transition-colors hover:border-ink-faint/50 hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {copied ? (
                <Check className="size-4" strokeWidth={2} aria-hidden="true" />
              ) : (
                <Copy className="size-4" strokeWidth={1.75} aria-hidden="true" />
              )}
              {copied ? 'Copied' : 'Copy'}
            </button>

            <button
              type="button"
              onClick={handleExport}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 text-[13px] font-medium text-ink transition-colors hover:border-ink-faint/50 hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <Download className="size-4" strokeWidth={1.75} aria-hidden="true" />
              Export .md
            </button>
          </div>
        </div>
      ) : null}

      {askConsent ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ai-consent-title"
          className="fixed inset-0 z-50 grid place-items-center bg-ink/40 px-5"
        >
          <div className="w-full max-w-[380px] rounded-2xl border border-line bg-surface p-5 shadow-lg">
            <h3 id="ai-consent-title" className="text-[15px] font-semibold tracking-[-0.02em]">
              Confirm
            </h3>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
              This prompt will be sent to the AI service.
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setAskConsent(false)}
                className="h-9 rounded-lg border border-line px-3.5 text-[13px] font-medium text-ink-muted transition-colors hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={acceptConsent}
                className="h-9 rounded-lg bg-brand px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-brand-deep"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
