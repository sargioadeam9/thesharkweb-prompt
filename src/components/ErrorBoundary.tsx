import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas px-6 py-16">
        <div className="w-full max-w-[420px] rounded-2xl border border-line bg-surface p-6 text-center shadow-sm">
          <h1 className="text-[18px] font-semibold tracking-[-0.02em] text-ink">
            Something broke in the interface
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
            Your prompts are still in this browser. Reloading usually clears it, and nothing is lost
            because every change is written to local storage.
          </p>
          <p className="mt-3 rounded-lg bg-canvas px-3 py-2 text-left text-[11px] break-words text-ink-faint">
            {error.message}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 inline-flex h-9 items-center rounded-lg bg-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Reload the app
          </button>
        </div>
      </div>
    )
  }
}
