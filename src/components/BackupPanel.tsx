import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { AlertTriangle, Check, Download, ShieldCheck, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import * as repo from '../lib/repo'
import type { BackupFile } from '../lib/types'

type Props = {
  promptCount: number
  categoryCount: number
  lastBackupAt?: string
  onClose: () => void
}

const resetFieldClass =
  'h-9 w-full rounded-lg border border-line bg-surface px-3 text-[13px] text-ink transition-colors placeholder:text-ink-faint focus:border-brand focus:ring-2 focus:ring-brand/15 focus:outline-none'

function formatDate(value?: string): string {
  if (!value) return 'never'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'never'
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function BackupPanel({ promptCount, categoryCount, lastBackupAt, onClose }: Props) {
  const [preview, setPreview] = useState<BackupFile | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [mode, setMode] = useState<'merge' | 'replace'>('merge')
  const [busy, setBusy] = useState<'export' | 'import' | 'reset' | 'hard' | null>(null)
  const [challenge] = useState(() => ({
    a: 2 + Math.floor(Math.random() * 8),
    b: 1 + Math.floor(Math.random() * 8),
  }))
  const [answer, setAnswer] = useState('')
  const [word, setWord] = useState('')
  const dialogRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const mathOk = answer.trim() !== '' && Number(answer.trim()) === challenge.a + challenge.b
  const wordOk = word.trim().toLowerCase() === 'reset'
  const resetReady = mathOk && wordOk

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    dialogRef.current?.querySelector<HTMLElement>('button')?.focus()

    return () => {
      document.body.style.overflow = overflow
      previous?.focus?.()
    }
  }, [])

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
    }
  }

  async function handleExport() {
    setBusy('export')
    try {
      const backup = await repo.exportBackup()
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `promptnook-backup-${backup.exportedAt.slice(0, 10)}.json`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      toast.success('Backup downloaded')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not export this library')
    } finally {
      setBusy(null)
    }
  }

  async function handleFile(file: File | undefined) {
    if (!file) return

    setParseError(null)
    setPreview(null)

    try {
      const text = await file.text()
      if (!text.trim()) {
        setParseError('That file is empty.')
        return
      }
      const parsed: unknown = JSON.parse(text)
      setPreview(repo.parseBackup(parsed))
    } catch (error) {
      setParseError(
        error instanceof SyntaxError
          ? 'That file is not valid JSON.'
          : error instanceof Error
            ? error.message
            : 'Could not read that file.',
      )
    }
  }

  async function handleImport() {
    if (!preview) return

    setBusy('import')
    try {
      const result = await repo.importBackup(preview, mode)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(
        mode === 'replace'
          ? `Library replaced with ${result.prompts} prompt${result.prompts === 1 ? '' : 's'}`
          : `Merged ${result.prompts} prompt${result.prompts === 1 ? '' : 's'}`,
      )
      setPreview(null)
      if (fileRef.current) fileRef.current.value = ''
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Import failed')
    } finally {
      setBusy(null)
    }
  }

  async function handleReset() {
    setBusy('reset')
    try {
      await repo.resetAll()
      toast.success('Library reset to defaults')
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not reset the library')
    } finally {
      setBusy(null)
    }
  }

  async function handleHardReset() {
    setBusy('hard')
    try {
      await repo.hardReset()
      window.location.reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not wipe the local database')
      setBusy(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-ink/25 p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="backup-title"
        onKeyDown={handleKeyDown}
        className="mx-auto my-6 flex max-h-[calc(100dvh-5rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_28px_64px_-28px_rgba(11,12,17,0.4)]"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-line px-6 py-4">
          <h2 id="backup-title" className="text-[15px] font-semibold tracking-[-0.01em]">
            Backup &amp; data
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="grid size-8 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <X className="size-4" strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <section>
            <h3 className="text-[13px] font-semibold text-ink">Export</h3>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
              {promptCount} prompt{promptCount === 1 ? '' : 's'} in {categoryCount} categories.
              Last backup: {formatDate(lastBackupAt)}. Everything lives in this browser, so a JSON
              file is your only safety net.
            </p>
            <button
              type="button"
              onClick={handleExport}
              disabled={busy !== null || promptCount === 0}
              className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 text-[13px] font-medium text-ink transition-colors hover:border-ink-faint/50 hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
            >
              <Download className="size-4" strokeWidth={1.75} aria-hidden="true" />
              {busy === 'export' ? 'Preparing…' : 'Download JSON backup'}
            </button>
          </section>

          <section className="border-t border-line pt-5">
            <h3 className="text-[13px] font-semibold text-ink">Import</h3>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
              Restore from a backup file. The file is checked before anything is written.
            </p>

            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="sr-only"
              onChange={(event) => void handleFile(event.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 text-[13px] font-medium text-ink transition-colors hover:border-ink-faint/50 hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <Upload className="size-4" strokeWidth={1.75} aria-hidden="true" />
              Choose backup file
            </button>

            {parseError ? (
              <p role="alert" className="mt-3 flex items-start gap-1.5 text-[12px] text-danger">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
                {parseError}
              </p>
            ) : null}

            {preview ? (
              <div className="mt-3 rounded-xl border border-brand/20 bg-brand-tint/25 p-3.5">
                <p className="flex items-center gap-1.5 text-[12px] font-semibold text-brand-deep">
                  <ShieldCheck className="size-4" strokeWidth={2} aria-hidden="true" />
                  Backup verified
                </p>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                  <div>
                    <dt className="text-ink-muted">Prompts</dt>
                    <dd className="text-[13px] font-semibold tabular-nums text-ink">
                      {preview.prompts.length}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-muted">Categories</dt>
                    <dd className="text-[13px] font-semibold tabular-nums text-ink">
                      {preview.categories.length}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-muted">Exported</dt>
                    <dd className="text-[13px] font-semibold text-ink">
                      {formatDate(preview.exportedAt)}
                    </dd>
                  </div>
                </dl>

                <div className="mt-3 space-y-1.5">
                  <label className="flex cursor-pointer items-start gap-2 text-[12px] text-ink">
                    <input
                      type="radio"
                      name="import-mode"
                      checked={mode === 'merge'}
                      onChange={() => setMode('merge')}
                      className="mt-0.5 accent-[var(--color-brand)]"
                    />
                    <span>
                      <span className="font-medium">Merge</span>
                      <span className="block text-ink-muted">
                        Keep what is here, add the file. Duplicate ids get a new id.
                      </span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2 text-[12px] text-ink">
                    <input
                      type="radio"
                      name="import-mode"
                      checked={mode === 'replace'}
                      onChange={() => setMode('replace')}
                      className="mt-0.5 accent-[var(--color-brand)]"
                    />
                    <span>
                      <span className="font-medium">Replace</span>
                      <span className="block text-ink-muted">
                        Wipe this browser and use the file as-is.
                      </span>
                    </span>
                  </label>
                </div>

                <button
                  type="button"
                  onClick={handleImport}
                  disabled={busy !== null}
                  className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
                >
                  <Check className="size-4" strokeWidth={2.25} aria-hidden="true" />
                  {busy === 'import'
                    ? 'Importing…'
                    : mode === 'replace'
                      ? 'Replace library'
                      : 'Merge into library'}
                </button>
              </div>
            ) : null}
          </section>

          <section className="border-t border-line pt-5">
            <h3 className="text-[13px] font-semibold text-danger">Reset</h3>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
              Deletes every prompt and custom category in this browser, then restores the four
              default categories. Export first if you might want any of it back.
            </p>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-ink">
                  What is {challenge.a} + {challenge.b}?
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                  placeholder="Your answer"
                  autoComplete="off"
                  aria-invalid={answer !== '' && !mathOk}
                  className={`${resetFieldClass} ${answer !== '' && !mathOk ? 'border-danger' : ''}`}
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-ink">
                  Type <span className="font-semibold">reset</span> to confirm
                </span>
                <input
                  type="text"
                  value={word}
                  onChange={(event) => setWord(event.target.value)}
                  placeholder="reset"
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={word !== '' && !wordOk}
                  className={`${resetFieldClass} ${word !== '' && !wordOk ? 'border-danger' : ''}`}
                />
              </label>
            </div>

            <p className="mt-2 text-[11px] text-ink-muted">
              {resetReady
                ? 'Both checks passed. The buttons are unlocked.'
                : 'Both checks must be correct before the buttons unlock.'}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleReset}
                disabled={!resetReady || busy !== null}
                className="inline-flex h-9 items-center rounded-lg bg-danger px-3.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-40"
              >
                {busy === 'reset' ? 'Resetting…' : 'Reset library'}
              </button>
              <button
                type="button"
                onClick={handleHardReset}
                disabled={!resetReady || busy !== null}
                className="inline-flex h-9 items-center rounded-lg border border-danger/40 px-3.5 text-[13px] font-semibold text-danger transition-colors hover:bg-danger/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-40"
              >
                {busy === 'hard' ? 'Wiping…' : 'Hard reset'}
              </button>
            </div>

            <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
              Reset clears every prompt and keeps the app ready to use. Hard reset also deletes the
              database itself and reloads, so the browser forgets this app completely.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
