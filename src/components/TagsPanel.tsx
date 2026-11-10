import { useMemo, useState } from 'react'
import { Check, Pencil, Tags as TagsIcon, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import * as repo from '../lib/repo'
import type { Prompt } from '../lib/types'
import type { View } from '../lib/nav'
import EmptyState from './Panels/EmptyState'
import PromptCard from './PromptCard'

type TagsPanelProps = {
  prompts: Prompt[]
  onNavigate: (view: View) => void
  onOpen: (prompt: Prompt) => void
  onDuplicate: (prompt: Prompt) => void
  onDelete: (prompt: Prompt) => void
  onToggleFavorite: (prompt: Prompt) => void
}

type TagSummary = { name: string; count: number }

const chipClass = (active: boolean) =>
  [
    'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
    active
      ? 'border-ink bg-ink text-surface'
      : 'border-line bg-surface text-ink-muted hover:border-ink-faint/50 hover:text-ink',
  ].join(' ')

const buttonClass =
  'inline-flex h-9 items-center gap-1.5 rounded-lg border px-3.5 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'

/** Case-insensitive identity so "SaaS" and "saas" are one tag on this page. */
function tagKey(tag: string): string {
  return tag.trim().toLowerCase()
}

export default function TagsPanel({
  prompts,
  onNavigate,
  onOpen,
  onDuplicate,
  onDelete,
  onToggleFavorite,
}: TagsPanelProps) {
  const [selected, setSelected] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  const tags = useMemo<TagSummary[]>(() => {
    const counts = new Map<string, TagSummary>()

    for (const prompt of prompts) {
      // A prompt counts once per tag even if it repeats the tag.
      const seen = new Set<string>()
      for (const raw of prompt.tags ?? []) {
        const name = raw.trim()
        if (!name) continue

        const key = tagKey(name)
        if (seen.has(key)) continue
        seen.add(key)

        const existing = counts.get(key)
        if (existing) existing.count += 1
        else counts.set(key, { name, count: 1 })
      }
    }

    return [...counts.values()].sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name),
    )
  }, [prompts])

  const activeTag = useMemo(() => {
    if (!selected) return null
    return tags.find((tag) => tagKey(tag.name) === tagKey(selected)) ?? null
  }, [tags, selected])

  const matching = useMemo(() => {
    if (!activeTag) return []
    const key = tagKey(activeTag.name)
    return prompts.filter((prompt) =>
      (prompt.tags ?? []).some((tag) => tagKey(tag) === key),
    )
  }, [prompts, activeTag])

  function selectTag(name: string) {
    setSelected(name)
    setDraft(name)
  }

  function clearSelection() {
    setSelected(null)
    setDraft('')
  }

  /** Every prompt that carries `key`, with its current tags. */
  function promptsWith(key: string): Prompt[] {
    return prompts.filter((prompt) =>
      (prompt.tags ?? []).some((tag) => tagKey(tag) === key),
    )
  }

  async function handleRename() {
    if (!activeTag || busy) return

    const next = draft.trim()
    if (!next) {
      toast.error('A tag name cannot be empty')
      return
    }

    const key = tagKey(activeTag.name)
    if (tagKey(next) === key && next === activeTag.name) {
      toast.info('That is already the name')
      return
    }

    const affected = promptsWith(key)
    setBusy(true)

    try {
      for (const prompt of affected) {
        const seen = new Set<string>()
        const updated: string[] = []

        for (const tag of prompt.tags ?? []) {
          const replacement = tagKey(tag) === key ? next : tag.trim()
          if (!replacement) continue

          const dedupeKey = tagKey(replacement)
          if (seen.has(dedupeKey)) continue
          seen.add(dedupeKey)
          updated.push(replacement)
        }

        await repo.updatePrompt(prompt.id, { tags: updated })
      }

      setSelected(next)
      setDraft(next)
      toast.success(
        `Renamed the tag to "${next}" on ${affected.length} prompt${affected.length === 1 ? '' : 's'}`,
      )
    } catch {
      toast.error('Could not rename the tag')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!activeTag || busy) return

    const key = tagKey(activeTag.name)
    const affected = promptsWith(key)
    if (!affected.length) return

    // Snapshot for undo before anything is written.
    const snapshot = affected.map((prompt) => ({
      id: prompt.id,
      tags: [...(prompt.tags ?? [])],
    }))

    setBusy(true)

    try {
      for (const prompt of affected) {
        const updated = (prompt.tags ?? []).filter((tag) => tagKey(tag) !== key)
        await repo.updatePrompt(prompt.id, { tags: updated })
      }

      clearSelection()
      toast.success(`Removed the tag from ${affected.length} prompt${affected.length === 1 ? '' : 's'}`, {
        action: {
          label: 'Undo',
          onClick: () => {
            void (async () => {
              try {
                for (const entry of snapshot) {
                  await repo.updatePrompt(entry.id, { tags: entry.tags })
                }
                toast.success('Tag restored')
              } catch {
                toast.error('Could not restore the tag')
              }
            })()
          },
        },
      })
    } catch {
      toast.error('Could not delete the tag')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1180px] px-5 py-8 lg:px-8 lg:py-10">
      <div className="mb-5">
        <h2 className="text-[20px] font-semibold tracking-[-0.025em]">Tags &amp; Labels</h2>
        <p className="mt-1 text-[13px] text-ink-muted">
          Tags you&apos;ve used across your prompts.
        </p>
      </div>

      {tags.length === 0 ? (
        <EmptyState
          icon={TagsIcon}
          title="No tags yet."
          description="Add tags to a prompt and they will show up here."
          action={
            <button
              type="button"
              onClick={() => onNavigate(null)}
              className={`${buttonClass} border-line bg-surface text-ink hover:border-ink-faint/50`}
            >
              Create your first prompt
            </button>
          }
        />
      ) : (
        <>
          <div role="group" aria-label="All tags" className="mb-5 flex flex-wrap items-center gap-2">
            {tags.map((tag) => {
              const active = activeTag ? tagKey(activeTag.name) === tagKey(tag.name) : false

              return (
                <button
                  key={tagKey(tag.name)}
                  type="button"
                  onClick={() => (active ? clearSelection() : selectTag(tag.name))}
                  aria-pressed={active}
                  className={chipClass(active)}
                >
                  {tag.name}
                  <span className="tabular-nums opacity-60">{tag.count}</span>
                </button>
              )
            })}
          </div>

          {activeTag ? (
            <section
              aria-label={`Edit tag ${activeTag.name}`}
              className="mb-6 rounded-2xl border border-line bg-surface p-5 shadow-xs"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold">Edit tag</p>
                  <p className="mt-0.5 text-[12px] text-ink-muted">
                    Used by {activeTag.count} {activeTag.count === 1 ? 'prompt' : 'prompts'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={clearSelection}
                  aria-label="Close tag editor"
                  className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  <X className="size-4" strokeWidth={2} aria-hidden="true" />
                </button>
              </div>

              <div className="mt-4 flex flex-wrap items-end gap-2">
                <div className="min-w-0 flex-1">
                  <label
                    htmlFor="tag-name"
                    className="mb-1.5 block text-[12px] font-medium text-ink-muted"
                  >
                    Tag name
                  </label>
                  <input
                    id="tag-name"
                    type="text"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void handleRename()
                    }}
                    autoComplete="off"
                    className="h-9 w-full rounded-lg border border-line bg-surface px-3 text-[13px] text-ink transition-colors focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => void handleRename()}
                  disabled={busy}
                  className={`${buttonClass} border-line bg-surface text-ink hover:border-ink-faint/50 disabled:opacity-60`}
                >
                  <Check className="size-3.5" strokeWidth={2} aria-hidden="true" />
                  Rename
                </button>

                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={busy}
                  className={`${buttonClass} border-danger/30 bg-surface text-danger hover:bg-danger/8 disabled:opacity-60`}
                >
                  <Trash2 className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
                  Delete tag
                </button>
              </div>

              <p className="mt-3 flex items-center gap-1.5 text-[11px] text-ink-faint">
                <Pencil className="size-3" strokeWidth={1.75} aria-hidden="true" />
                Renaming or deleting updates every prompt that uses this tag.
              </p>
            </section>
          ) : null}

          {activeTag ? (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13px] text-ink-muted">
                  {matching.length} {matching.length === 1 ? 'prompt' : 'prompts'} tagged{' '}
                  <span className="font-medium text-ink">{activeTag.name}</span>
                </p>
                <button
                  type="button"
                  onClick={clearSelection}
                  className={`${buttonClass} border-line bg-surface text-ink hover:border-ink-faint/50`}
                >
                  Clear filter
                </button>
              </div>

              {matching.length ? (
                <div className="prompt-grid grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {matching.map((prompt) => (
                    <PromptCard
                      key={prompt.id}
                      prompt={prompt}
                      onOpen={onOpen}
                      onDuplicate={onDuplicate}
                      onDelete={onDelete}
                      onToggleFavorite={onToggleFavorite}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={TagsIcon}
                  title="Nothing tagged here anymore."
                  description="That tag is no longer on any prompt."
                  action={
                    <button
                      type="button"
                      onClick={clearSelection}
                      className={`${buttonClass} border-line bg-surface text-ink hover:border-ink-faint/50`}
                    >
                      Show all tags
                    </button>
                  }
                />
              )}
            </>
          ) : (
            <p className="text-[12px] text-ink-faint">
              Pick a tag to see its prompts, rename it, or delete it.
            </p>
          )}
        </>
      )}
    </div>
  )
}
