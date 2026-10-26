import { DatabaseBackup, X } from 'lucide-react'

type Props = {
  lastBackupAt?: string
  onBackup: () => void
  onDismiss: () => void
}

function lastBackupLabel(value?: string): string {
  if (!value) return 'You have never exported a backup.'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'You have never exported a backup.'

  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000)
  if (days <= 0) return 'You backed up today.'
  if (days === 1) return 'Last backup was yesterday.'
  return `Last backup was ${days} days ago.`
}

export default function BackupReminder({ lastBackupAt, onBackup, onDismiss }: Props) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-4 bottom-4 z-40 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[356px]"
    >
      <div className="backup-reminder rounded-2xl border border-line bg-surface p-4 shadow-[0_20px_48px_-24px_rgba(11,12,17,0.35)]">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-tint text-brand-deep"
          >
            <DatabaseBackup className="size-4" strokeWidth={1.75} />
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-ink">Back up your prompts</p>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
              {lastBackupLabel(lastBackupAt)} Everything lives in this browser, so a JSON file is
              your only copy if this device is cleared.
            </p>

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={onBackup}
                className="inline-flex h-8 items-center rounded-lg bg-brand px-3 text-[12px] font-semibold text-white transition-colors hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                Back up now
              </button>
              <button
                type="button"
                onClick={onDismiss}
                className="inline-flex h-8 items-center rounded-lg border border-line px-3 text-[12px] font-medium text-ink-muted transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                Not today
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss backup reminder"
            className="grid size-6 shrink-0 place-items-center rounded-md text-ink-faint transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <X className="size-3.5" strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  )
}
