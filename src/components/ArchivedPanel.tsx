import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArchiveRestore, RotateCcw, StickyNote } from 'lucide-react'
import { toast } from 'sonner'
import { db } from '../lib/db'
import * as repo from '../lib/repo'
import type { Prompt } from '../lib/types'
import type { View } from '../lib/nav'
import EmptyState from './Panels/EmptyState'

type ArchivedPanelProps = {
  onNavigate: (view: View) => void
}

const buttonClass =
  'inline-flex h-9 items-center gap-1.5 rounded-lg border px-3.5 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'

function formatDeletedAt(iso: string): string {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return 'Unknown date'

  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default function ArchivedPanel({ onNavigate }: ArchivedPanelProps) {
  const [busyId, setBusyId] = useState<string | null>(null)

  // Read the raw table: repo.listPrompts() deliberately hides tombstones.
  // `deletedAt` is not an index in the frozen schema, so sort in JS.
  const rows = useLiveQuery(() => db.prompts.toArray(), [])

  const archived = useMemo(() => {
    const list = (rows ?? []).filter((prompt) => Boolean(prompt.deletedAt))
    return list.sort((a, b) => {
      const ams = Date.parse(a.deletedAt ?? '')
      const bms = Date.parse(b.deletedAt ?? '')
      return (Number.isFinite(bms) ? bms : 0) - (Number.isFinite(ams) ? ams : 0)
    })
  }, [rows])

  async function handleRestore(prompt: Prompt) {
    if (busyId) return
    setBusyId(prompt.id)

    try {
      await repo.restorePrompt(prompt)
      toast.success('Prompt restored')
    } catch {
      toast.error('Could not restore that prompt')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1180px] px-5 py-8 lg:px-8 lg:py-10">
      <div className="mb-5">
        <h2 className="text-[20px] font-semibold tracking-[-0.025em]">Archived</h2>
        <p className="mt-1 text-[13px] text-ink-muted">
          Prompts you deleted. Restore them or remove them for good.
        </p>
      </div>

      {rows === undefined ? (
        <div className="space-y-3">
          <div className="h-24 animate-pulse rounded-2xl border border-line bg-surface/60" />
          <div className="h-24 animate-pulse rounded-2xl border border-line bg-surface/60" />
        </div>
      ) : archived.length === 0 ? (
        <EmptyState
          icon={ArchiveRestore}
          title="No archived prompts."
          description="Deleted prompts land here so you can bring them back."
          action={
            <button
              type="button"
              onClick={() => onNavigate(null)}
              className={`${buttonClass} border-line bg-surface text-ink hover:border-ink-faint/50`}
            >
              Back to prompts
            </button>
          }
        />
      ) : (
        <>
          <p aria-live="polite" className="sr-only">
            {archived.length} archived {archived.length === 1 ? 'prompt' : 'prompts'}
          </p>

          <ul className="space-y-3">
            {archived.map((prompt) => (
              <li
                key={prompt.id}
                className="rounded-2xl border border-line bg-surface p-5 shadow-xs"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[14px] leading-snug font-semibold tracking-[-0.01em]">
                      {prompt.title}
                    </h3>
                    <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-ink-muted">
                      {prompt.content}
                    </p>

                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-canvas px-1.5 py-0.5 text-[11px] font-medium text-ink-faint">
                        Deleted {formatDeletedAt(prompt.deletedAt ?? '')}
                      </span>
                      {prompt.tags?.length ? (
                        <span className="text-[11px] text-ink-faint">
                          {prompt.tags.slice(0, 3).join(', ')}
                        </span>
                      ) : null}
                      {prompt.notes ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-ink-faint">
                          <StickyNote className="size-3" strokeWidth={1.75} aria-hidden="true" />
                          Note
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleRestore(prompt)}
                    disabled={busyId === prompt.id}
                    aria-label={`Restore "${prompt.title}"`}
                    className={`${buttonClass} shrink-0 border-line bg-surface text-ink hover:border-brand/30 hover:bg-brand-tint/50 hover:text-brand-deep disabled:opacity-60`}
                  >
                    <RotateCcw className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
                    Restore
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <p className="mt-6 text-center text-[12px] text-ink-faint">
            Deleted prompts are purged automatically after 90 days.
          </p>
        </>
      )}
    </div>
  )
}
