import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowRight,
  Copy,
  FolderOpen,
  Library,
  ListTodo,
  Plus,
  Sparkles,
  Star,
  Tag,
} from 'lucide-react'
import type { Category, Prompt, Settings, Todo } from '../lib/types'
import type { View } from '../lib/nav'
import { recencyOf, useRecentMap } from '../lib/recent'
import { listStorageFolders } from '../lib/repo'

type DashboardPanelProps = {
  prompts: Prompt[]
  categories: Category[]
  todos: Todo[]
  settings?: Settings
  onNavigate: (view: View) => void
  onNewPrompt: () => void
  onOpen: (prompt: Prompt) => void
}

const RECENT_LIMIT = 5
const TAG_LIMIT = 5

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function formatBackup(iso?: string): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** Tag identity is case-insensitive here so counts do not split on spelling. */
function tagKey(tag: string): string {
  return tag.trim().toLowerCase()
}

export default function DashboardPanel({
  prompts,
  categories,
  todos,
  settings,
  onNavigate,
  onNewPrompt,
  onOpen,
}: DashboardPanelProps) {
  // Copy counts come from the localStorage tracker, so this page subscribes to it.
  const recent = useRecentMap()
  const folders = useLiveQuery(() => listStorageFolders(), [], [])

  const favoriteCount = useMemo(
    () => prompts.filter((prompt) => prompt.isFavorite).length,
    [prompts],
  )

  const openTasks = useMemo(() => todos.filter((todo) => !todo.done).length, [todos])

  const totalCopies = useMemo(
    () => Object.values(recent).reduce((sum, entry) => sum + entry.count, 0),
    [recent],
  )

  const recentPrompts = useMemo(
    () =>
      [...prompts]
        .sort((a, b) => recencyOf(b) - recencyOf(a))
        .slice(0, RECENT_LIMIT),
    [prompts],
  )

  const topTags = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>()

    for (const prompt of prompts) {
      const seen = new Set<string>()
      for (const raw of prompt.tags ?? []) {
        const tag = raw.trim()
        if (!tag) continue
        const key = tagKey(tag)
        if (seen.has(key)) continue
        seen.add(key)

        const existing = map.get(key)
        if (existing) existing.count += 1
        else map.set(key, { label: tag, count: 1 })
      }
    }

    return [...map.values()]
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      .slice(0, TAG_LIMIT)
  }, [prompts])

  const backupLabel = formatBackup(settings?.lastBackupAt)
  const isEmpty = prompts.length === 0 && todos.length === 0 && folders.length === 0

  const stats = [
    { label: 'Prompts', value: prompts.length, icon: Library, view: null as View },
    { label: 'Favorites', value: favoriteCount, icon: Star, view: 'favorites' as View },
    { label: 'Open tasks', value: openTasks, icon: ListTodo, view: 'todos' as View },
    { label: 'Copies tracked', value: totalCopies, icon: Copy, view: 'recent' as View },
  ]

  const quickActions: { label: string; view: View; icon: typeof Library }[] = [
    { label: 'All Prompts', view: null, icon: Library },
    { label: 'Favorites', view: 'favorites', icon: Star },
    { label: 'My Tasks', view: 'todos', icon: ListTodo },
    { label: 'Storage', view: 'storage', icon: FolderOpen },
  ]

  return (
    <div className="mx-auto w-full max-w-[1180px] px-5 py-8 lg:px-8 lg:py-10">
      <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          {categories.length ? null : (
            <p className="mb-1.5 inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-faint">
              <Sparkles className="size-3.241" strokeWidth={1.75} aria-hidden="true" />
              Local-first
            </p>
          )}
          <h2 className="text-[24px] font-semibold tracking-[-0.03em]">{greeting()}</h2>
          <p className="mt-1 text-[13px] text-ink-muted">
            Here&apos;s your prompt library at a glance.
          </p>
        </div>

        <button
          type="button"
          onClick={onNewPrompt}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-4 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <Plus className="size-4" strokeWidth={2} aria-hidden="true" />
          New Prompt
        </button>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, view }) => (
          <button
            key={label}
            type="button"
            onClick={() => onNavigate(view)}
            className="group rounded-2xl border border-line bg-surface p-4 text-left shadow-xs transition-colors hover:border-ink-faint/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <span className="flex items-center gap-1.5 text-[12px] font-medium text-ink-muted">
              <Icon className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
              {label}
            </span>
            <span className="mt-2 block text-[26px] leading-none font-semibold tracking-[-0.03em] tabular-nums">
              {value}
            </span>
          </button>
        ))}
      </div>

      <div
        role="group"
        aria-label="Quick actions"
        className="mb-8 flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {quickActions.map(({ label, view, icon: Icon }) => (
          <button
            key={label}
            type="button"
            onClick={() => onNavigate(view)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-muted transition-colors hover:border-ink-faint/50 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <Icon className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {isEmpty ? (
        <div className="rounded-2xl border border-dashed border-line bg-surface/60 px-6 py-14 text-center">
          <span
            aria-hidden="true"
            className="mx-auto mb-5 grid size-11 place-items-center rounded-2xl border border-line bg-surface shadow-sm"
          >
            <Library className="size-5 text-ink-muted" strokeWidth={1.75} />
          </span>
          <h3 className="text-[17px] font-semibold tracking-[-0.02em]">Create your first prompt</h3>
          <p className="mx-auto mt-2 max-w-[340px] text-[13px] leading-relaxed text-ink-muted">
            Everything you save stays in this browser. Nothing leaves your machine.
          </p>
          <button
            type="button"
            onClick={onNewPrompt}
            className="mt-5 inline-flex h-9 items-center rounded-lg bg-brand px-4 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            New Prompt
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-line bg-surface p-5 shadow-xs">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-[13px] font-semibold tracking-[-0.01em]">Recently used</h3>
              <button
                type="button"
                onClick={() => onNavigate('recent')}
                className="inline-flex items-center gap-1 rounded-md text-[12px] font-medium text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                View all
                <ArrowRight className="size-3.5" strokeWidth={2} aria-hidden="true" />
              </button>
            </div>

            {recentPrompts.length ? (
              <ul className="-mx-2 flex flex-col">
                {recentPrompts.map((prompt) => {
                  const count = recent[prompt.id]?.count ?? 0

                  return (
                    <li key={prompt.id}>
                      <button
                        type="button"
                        onClick={() => onOpen(prompt)}
                        className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-ink">
                            {prompt.title}
                          </span>
                          <span className="mt-0.5 block truncate text-[12px] text-ink-faint">
                            {prompt.content.replace(/\s+/g, ' ').trim().slice(0, 60) || 'Empty prompt'}
                          </span>
                        </span>
                        {count ? (
                          <span className="shrink-0 rounded-full border border-line bg-canvas px-2 py-0.5 text-[11px] font-medium tabular-nums text-ink-muted">
                            Copied ×{count}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="py-6 text-center text-[12px] text-ink-faint">
                Copy or edit a prompt and it will show up here.
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-line bg-surface p-5 shadow-xs">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-[13px] font-semibold tracking-[-0.01em]">Active tags</h3>
              <button
                type="button"
                onClick={() => onNavigate('tags')}
                className="inline-flex items-center gap-1 rounded-md text-[12px] font-medium text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                View all
                <ArrowRight className="size-3.5" strokeWidth={2} aria-hidden="true" />
              </button>
            </div>

            {topTags.length ? (
              <div className="flex flex-wrap gap-2">
                {topTags.map((tag) => (
                  <button
                    key={tagKey(tag.label)}
                    type="button"
                    onClick={() => onNavigate('tags')}
                    className="inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas px-3 py-1.5 text-[12px] font-medium text-ink-muted transition-colors hover:border-ink-faint/50 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    <Tag className="size-3" strokeWidth={1.75} aria-hidden="true" />
                    {tag.label}
                    <span className="tabular-nums opacity-60">{tag.count}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="py-6 text-center text-[12px] text-ink-faint">
                No tags yet. Add tags when you save a prompt.
              </p>
            )}
          </section>
        </div>
      )}

      <p className="mt-8 border-t border-line pt-4 text-[12px] tabular-nums text-ink-faint">
        {prompts.length} {prompts.length === 1 ? 'prompt' : 'prompts'} · {folders.length}{' '}
        {folders.length === 1 ? 'folder' : 'folders'} ·{' '}
        {backupLabel ? `last backup ${backupLabel}` : 'no backup yet'}
      </p>
    </div>
  )
}
