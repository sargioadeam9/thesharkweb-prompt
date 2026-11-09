import { useMemo, useState } from 'react'
import { History } from 'lucide-react'
import type { Category, Prompt } from '../lib/types'
import type { View } from '../lib/nav'
import { sortByRecency, useRecentMap } from '../lib/recent'
import EmptyState from './Panels/EmptyState'
import PromptCard from './PromptCard'

type RecentPanelProps = {
  prompts: Prompt[]
  categories: Category[]
  onNavigate: (view: View) => void
  onOpen: (prompt: Prompt) => void
  onDuplicate: (prompt: Prompt) => void
  onDelete: (prompt: Prompt) => void
  onToggleFavorite: (prompt: Prompt) => void
}

const chipClass = (active: boolean) =>
  [
    'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
    active
      ? 'border-ink bg-ink text-surface'
      : 'border-line bg-surface text-ink-muted hover:border-ink-faint/50 hover:text-ink',
  ].join(' ')

export default function RecentPanel({
  prompts,
  categories,
  onNavigate,
  onOpen,
  onDuplicate,
  onDelete,
  onToggleFavorite,
}: RecentPanelProps) {
  const [categoryId, setCategoryId] = useState<string | null>(null)
  // Subscribing here is what makes a copy in another view show up on return.
  const recent = useRecentMap()

  const ordered = useMemo(() => sortByRecency(prompts), [prompts])

  const visible = useMemo(
    () => (categoryId ? ordered.filter((prompt) => prompt.categoryId === categoryId) : ordered),
    [ordered, categoryId],
  )

  const totalCopies = useMemo(
    () => Object.values(recent).reduce((sum, entry) => sum + entry.count, 0),
    [recent],
  )

  return (
    <div className="mx-auto w-full max-w-[1180px] px-5 py-8 lg:px-8 lg:py-10">
      <div className="mb-5">
        <h2 className="text-[20px] font-semibold tracking-[-0.025em]">Recently Used</h2>
        <p className="mt-1 text-[13px] text-ink-muted">
          Prompts you copied or edited most recently.
        </p>
      </div>

      {prompts.length ? (
        <div
          role="group"
          aria-label="Filter by category"
          className="mb-5 flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <button
            type="button"
            onClick={() => setCategoryId(null)}
            aria-pressed={categoryId === null}
            className={chipClass(categoryId === null)}
          >
            All Categories
            <span className="tabular-nums opacity-60">{prompts.length}</span>
          </button>

          {categories.map((category) => {
            const count = ordered.filter((prompt) => prompt.categoryId === category.id).length
            if (!count) return null

            return (
              <button
                key={category.id}
                type="button"
                onClick={() => setCategoryId(category.id)}
                aria-pressed={categoryId === category.id}
                className={chipClass(categoryId === category.id)}
              >
                {category.name}
                <span className="tabular-nums opacity-60">{count}</span>
              </button>
            )
          })}
        </div>
      ) : null}

      {visible.length ? (
        <>
          <p aria-live="polite" className="sr-only">
            {visible.length} recent {visible.length === 1 ? 'prompt' : 'prompts'}
          </p>

          <div className="prompt-grid grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((prompt) => (
              <PromptCard
                key={prompt.id}
                prompt={prompt}
                copyCount={recent[prompt.id]?.count ?? 0}
                onOpen={onOpen}
                onDuplicate={onDuplicate}
                onDelete={onDelete}
                onToggleFavorite={onToggleFavorite}
              />
            ))}
          </div>

          {totalCopies ? (
            <p className="mt-6 text-center text-[12px] tabular-nums text-ink-faint">
              {totalCopies} {totalCopies === 1 ? 'copy' : 'copies'} tracked on this device
            </p>
          ) : null}
        </>
      ) : (
        <EmptyState
          icon={History}
          title={categoryId ? 'Nothing recent in this category.' : 'No recent prompts yet.'}
          description={
            categoryId
              ? 'Try another category, or browse everything in your library.'
              : 'Copy or edit a prompt and it will show up here.'
          }
          action={
            <button
              type="button"
              onClick={() => (categoryId ? setCategoryId(null) : onNavigate(null))}
              className="inline-flex h-9 items-center rounded-lg border border-line bg-surface px-3.5 text-[13px] font-medium text-ink transition-colors hover:border-ink-faint/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {categoryId ? 'Show all categories' : 'Browse all prompts'}
            </button>
          }
        />
      )}
    </div>
  )
}
