import { Lock, Settings2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Category } from '../lib/types'
import type { NavEntry, View } from '../lib/nav'
import { NAV_GROUPS } from '../lib/nav'
import { useProAccess, gateState } from '../lib/entitlement'
import BrandMark from './BrandMark'

export type { View } from '../lib/nav'

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

function NavBadge({
  entry,
  active,
  loading,
  license,
}: {
  entry: NavEntry
  active: boolean
  loading: boolean
  license: import('../lib/sync-types').LicenseView | null
}) {
  const locked =
    entry.gate === 'hard' && !loading && gateState(entry.gate, license, loading) === 'upsell'

  if (entry.gate) {
    return (
      <span className="flex shrink-0 items-center gap-1">
        {locked ? (
          <Lock
            className={active ? 'size-3 text-brand-tint' : 'size-3 text-ink-faint'}
            strokeWidth={2}
            aria-hidden="true"
          />
        ) : null}
        <span
          className={[
            'rounded-full px-1.5 py-0.5 text-[9px] font-bold tracking-wide uppercase',
            active ? 'bg-surface/15 text-surface' : 'bg-brand-tint text-brand-deep',
          ].join(' ')}
        >
          Pro
        </span>
      </span>
    )
  }

  if (entry.status === 'soon') {
    return (
      <span
        className={[
          'shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold tracking-wide uppercase',
          active ? 'bg-surface/15 text-surface' : 'bg-canvas text-ink-faint',
        ].join(' ')}
      >
        Soon
      </span>
    )
  }

  return null
}

function NavButton({
  active,
  icon: Icon,
  label,
  count,
  entry,
  onClick,
}: {
  active: boolean
  icon: LucideIcon
  label: string
  count?: number
  entry?: NavEntry
  onClick: () => void
}) {
  const { loading, license } = useProAccess()

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
      <span className="flex shrink-0 items-center gap-1.5">
        {count === undefined ? null : <span className={pillClass(active)}>{count}</span>}
        {entry ? (
          <NavBadge entry={entry} active={active} loading={loading} license={license} />
        ) : null}
      </span>
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
    <aside className="hidden h-full min-h-0 w-[232px] shrink-0 flex-col border-r border-line bg-surface lg:flex">
      <div className="flex h-[72px] shrink-0 items-center gap-2.5 border-b border-line px-5">
        <BrandMark />
        <span className="truncate text-[14px] font-semibold tracking-[-0.02em]">
          TheSharkWebPrompt
        </span>
      </div>

      <nav aria-label="Library" className="min-h-0 flex-1 overflow-y-auto px-3 py-4 [scrollbar-width:thin]">
        {NAV_GROUPS.map((group) => (
          <section key={group.label} aria-label={group.label} className="mb-5">
            {group.label ? (
              <p className="mb-2 px-3 text-[11px] font-medium tracking-[0.06em] text-ink-faint">
                {group.label}
              </p>
            ) : null}
            <ul className="space-y-1">
              {group.entries.map((entry) => {
                const count =
                  entry.count === 'total'
                    ? total
                    : entry.count === 'favorites'
                      ? favorites
                      : entry.count === 'todos'
                        ? todoCount
                        : undefined

                if (entry.action === 'backup') {
                  return (
                    <li key={entry.label}>
                      <NavButton
                        active={false}
                        icon={entry.icon}
                        label={entry.label}
                        entry={entry}
                        onClick={onOpenBackup}
                      />
                    </li>
                  )
                }

                if (entry.action === 'manageCategories') {
                  return (
                    <li key={entry.label}>
                      <NavButton
                        active={false}
                        icon={entry.icon}
                        label={entry.label}
                        entry={entry}
                        onClick={onManageCategories}
                      />
                    </li>
                  )
                }

                return (
                  <li key={entry.label}>
                    <NavButton
                      active={view === entry.key}
                      icon={entry.icon}
                      label={entry.label}
                      count={count}
                      entry={entry}
                      onClick={() => onSelect(entry.key)}
                    />
                  </li>
                )
              })}
            </ul>

            {group.label === 'Organize' ? (
              <>
                <div className="mt-5 mb-2 flex items-center justify-between px-3">
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
                <ul className="max-h-[45vh] space-y-0.5 overflow-y-auto scroll-smooth pr-0.5 [scrollbar-width:thin]">
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
              </>
            ) : null}
          </section>
        ))}
      </nav>

      <div className="shrink-0 border-t border-line p-3 text-center">
        <button
          type="button"
          onClick={() => onSelect('about')}
          aria-current={view === 'about' ? 'page' : undefined}
          className="text-[11px] text-ink-faint transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand rounded"
        >
          About
        </button>
      </div>
    </aside>
  )
}
