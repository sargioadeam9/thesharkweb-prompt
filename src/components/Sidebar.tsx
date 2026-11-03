import {
  Database,
  HelpCircle,
  Info,
  LayoutGrid,
  ListTodo,
  RefreshCw,
  Settings2,
  Star,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Category } from '../lib/types'
import BrandMark from './BrandMark'

export type View = null | 'favorites' | 'todos' | 'sync' | 'about' | 'faq' | string

type SidebarProps = {
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

function navClass(active: boolean): string {
  return [
    'flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-colors',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
    active ? 'bg-ink text-surface' : 'text-ink-muted hover:bg-canvas hover:text-ink',
  ].join(' ')
}

function pillClass(active: boolean): string {
  return [
    'rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums',
    active ? 'bg-surface/15 text-surface' : 'bg-canvas text-ink-faint',
  ].join(' ')
}

function NavButton({
  active,
  icon: Icon,
  label,
  count,
  onClick,
}: {
  active: boolean
  icon: LucideIcon
  label: string
  count?: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={navClass(active)}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <Icon
          className={active ? 'size-4 shrink-0 text-brand-tint' : 'size-4 shrink-0 text-ink-faint'}
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <span className="truncate">{label}</span>
      </span>
      {count === undefined ? null : <span className={pillClass(active)}>{count}</span>}
    </button>
  )
}

export default function Sidebar({
  categories,
  total,
  favorites,
  todoCount,
  counts,
  view,
  onSelect,
  onManageCategories,
  onOpenBackup,
}: SidebarProps) {
  return (
    <aside className="hidden w-[232px] shrink-0 flex-col border-r border-line bg-surface lg:flex">
      <div className="flex h-[72px] shrink-0 items-center gap-2.5 border-b border-line px-5">
        <BrandMark />
        <span className="truncate text-[14px] font-semibold tracking-[-0.02em]">
          TheSharkWebPrompt
        </span>
      </div>

      <nav aria-label="Library" className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          <li>
            <NavButton
              active={view === null}
              icon={LayoutGrid}
              label="All Prompts"
              count={total}
              onClick={() => onSelect(null)}
            />
          </li>
          <li>
            <NavButton
              active={view === 'favorites'}
              icon={Star}
              label="Favorites"
              count={favorites}
              onClick={() => onSelect('favorites')}
            />
          </li>
          <li>
            <NavButton
              active={view === 'todos'}
              icon={ListTodo}
              label="To Do"
              count={todoCount}
              onClick={() => onSelect('todos')}
            />
          </li>
        </ul>

        <div className="mt-6 mb-2 flex items-center justify-between px-3">
          <p className="text-[11px] font-medium tracking-[0.06em] text-ink-faint">Categories</p>
          <button
            type="button"
            onClick={onManageCategories}
            aria-label="Manage categories"
            className="grid size-6 place-items-center rounded-md text-ink-faint transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <Settings2 className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
        <ul className="space-y-0.5">
          {categories.map((category) => {
            const active = view === category.id
            return (
              <li key={category.id}>
                <button
                  type="button"
                  onClick={() => onSelect(category.id)}
                  aria-current={active ? 'page' : undefined}
                  className={navClass(active)}
                >
                  <span className="truncate">{category.name}</span>
                  <span className={pillClass(active)}>{counts[category.id] ?? 0}</span>
                </button>
              </li>
            )
          })}
        </ul>

        <div className="mt-6 space-y-1 border-t border-line pt-3">
          <NavButton
            active={view === 'sync'}
            icon={RefreshCw}
            label="Sync"
            onClick={() => onSelect('sync')}
          />
          <NavButton
            active={view === 'about'}
            icon={Info}
            label="About"
            onClick={() => onSelect('about')}
          />
          <NavButton
            active={view === 'faq'}
            icon={HelpCircle}
            label="FAQ"
            onClick={() => onSelect('faq')}
          />
        </div>
      </nav>

      <div className="shrink-0 border-t border-line p-3">
        <button
          type="button"
          onClick={onOpenBackup}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium text-ink-muted transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <Database className="size-4 shrink-0 text-ink-faint" strokeWidth={1.75} aria-hidden="true" />
          Backup &amp; data
        </button>
      </div>
    </aside>
  )
}
