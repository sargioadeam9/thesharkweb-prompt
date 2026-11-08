import { useEffect, useRef, useState } from 'react'
import { Database, FolderOpen, HelpCircle, Info, RefreshCw, Settings2 } from 'lucide-react'
import type { Category } from '../lib/types'
import type { View } from './Sidebar'

type CategoryBarProps = {
  categories: Category[]
  total: number
  favorites: number
  todoCount: number
  counts: Record<string, number>
  view: View
  onSelect: (view: View) => void
  onManageCategories: () => void
  onOpenBackup: () => void
}

function chipClass(active: boolean): string {
  return [
    'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
    active
      ? 'border-ink bg-ink text-surface'
      : 'border-line bg-surface text-ink-muted hover:border-ink-faint/50 hover:text-ink',
  ].join(' ')
}

const actionClass =
  'grid size-8 shrink-0 place-items-center rounded-full border border-line bg-surface text-ink-muted transition-colors hover:border-ink-faint/50 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'

export default function CategoryBar({
  categories,
  total,
  favorites,
  todoCount,
  counts,
  view,
  onSelect,
  onManageCategories,
  onOpenBackup,
}: CategoryBarProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ start: true, end: true })

  function updateEdges() {
    const node = scrollerRef.current
    if (!node) return

    const max = node.scrollWidth - node.clientWidth
    const start = node.scrollLeft <= 1
    const end = node.scrollLeft >= max - 1
    setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }))
  }

  useEffect(() => {
    updateEdges()
    const node = scrollerRef.current
    if (!node) return undefined

    const observer = new ResizeObserver(updateEdges)
    observer.observe(node)
    window.addEventListener('resize', updateEdges)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateEdges)
    }
  }, [categories.length])

  useEffect(() => {
    const node = scrollerRef.current
    if (!node) return
    node
      .querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [view])

  const showStartFade = !edges.start
  const showEndFade = !edges.end

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-line px-5 py-2.5 lg:hidden">
      <div className="relative min-w-0 flex-1">
        <div
          ref={scrollerRef}
          onScroll={updateEdges}
          className="flex items-center gap-1.5 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
        <button
          type="button"
          onClick={() => onSelect(null)}
          aria-current={view === null ? 'page' : undefined}
          className={chipClass(view === null)}
        >
          All
          <span className="tabular-nums opacity-60">{total}</span>
        </button>
        <button
          type="button"
          onClick={() => onSelect('favorites')}
          aria-current={view === 'favorites' ? 'page' : undefined}
          className={chipClass(view === 'favorites')}
        >
          Favorites
          <span className="tabular-nums opacity-60">{favorites}</span>
        </button>
        <button
          type="button"
          onClick={() => onSelect('todos')}
          aria-current={view === 'todos' ? 'page' : undefined}
          className={chipClass(view === 'todos')}
        >
          To Do
          <span className="tabular-nums opacity-60">{todoCount}</span>
        </button>
        {categories.map((category) => {
          const active = view === category.id
          return (
            <button
              key={category.id}
              type="button"
              onClick={() => onSelect(category.id)}
              aria-current={active ? 'page' : undefined}
              className={chipClass(active)}
            >
              {category.name}
              <span className="tabular-nums opacity-60">{counts[category.id] ?? 0}</span>
            </button>
          )
        })}
        </div>

        {showStartFade ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 w-8"
            style={{ background: 'linear-gradient(to right, var(--color-canvas), transparent)' }}
          />
        ) : null}
        {showEndFade ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-8"
            style={{ background: 'linear-gradient(to left, var(--color-canvas), transparent)' }}
          />
        ) : null}
      </div>

      <span aria-hidden="true" className="h-6 w-px shrink-0 bg-line" />

      <button
        type="button"
        onClick={() => onSelect('storage')}
        aria-label="Storage"
        aria-current={view === 'storage' ? 'page' : undefined}
        className={
          view === 'storage'
            ? 'grid size-8 shrink-0 place-items-center rounded-full border border-ink bg-ink text-surface transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'
            : actionClass
        }
      >
        <FolderOpen className="size-4" strokeWidth={1.75} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => onSelect('sync')}
        aria-label="Live cloud sync"
        aria-current={view === 'sync' ? 'page' : undefined}
        className={
          view === 'sync'
            ? 'grid size-8 shrink-0 place-items-center rounded-full border border-ink bg-ink text-surface transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'
            : actionClass
        }
      >
        <RefreshCw className="size-4" strokeWidth={1.75} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => onSelect('faq')}
        aria-label="FAQ"
        aria-current={view === 'faq' ? 'page' : undefined}
        className={
          view === 'faq'
            ? 'grid size-8 shrink-0 place-items-center rounded-full border border-ink bg-ink text-surface transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'
            : actionClass
        }
      >
        <HelpCircle className="size-4" strokeWidth={1.75} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => onSelect('about')}
        aria-label="About"
        aria-current={view === 'about' ? 'page' : undefined}
        className={
          view === 'about'
            ? 'grid size-8 shrink-0 place-items-center rounded-full border border-ink bg-ink text-surface transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'
            : actionClass
        }
      >
        <Info className="size-4" strokeWidth={1.75} aria-hidden="true" />
      </button>

      <span aria-hidden="true" className="h-6 w-px shrink-0 bg-line" />

      <button
        type="button"
        onClick={onManageCategories}
        aria-label="Manage categories"
        className={actionClass}
      >
        <Settings2 className="size-4" strokeWidth={1.75} aria-hidden="true" />
      </button>
      <button type="button" onClick={onOpenBackup} aria-label="Backup and data" className={actionClass}>
        <Database className="size-4" strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  )
}
