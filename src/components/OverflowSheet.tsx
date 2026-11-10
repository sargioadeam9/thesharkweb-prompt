import { useEffect, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { Ellipsis, Lock, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { View } from './Sidebar'
import type { Gate, NavStatus } from '../lib/nav'
import { useProAccess, gateState } from '../lib/entitlement'

export type OverflowItem = {
  key: string
  label: string
  icon: LucideIcon
  view?: View
  action?: 'manage' | 'backup'
  hint?: string
  status?: NavStatus
  gate?: Gate
}

type Props = {
  open: boolean
  onClose: () => void
  items: OverflowItem[]
  activeView: View
  onSelect: (view: View) => void
  onManageCategories: () => void
  onOpenBackup: () => void
  triggerEl: HTMLElement | null
}

const rowClass = (active: boolean) =>
  [
    'flex w-full items-center gap-3 rounded-xl px-3 pt-3 pb-3 text-left text-[13px] font-medium transition-colors',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
    active ? 'bg-ink text-surface' : 'text-ink hover:bg-canvas',
  ].join(' ')

export default function OverflowSheet({
  open,
  onClose,
  items,
  activeView,
  onSelect,
  onManageCategories,
  onOpenBackup,
  triggerEl,
}: Props) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const { loading, license } = useProAccess()

  useEffect(() => {
    if (!open) return
    const first = sheetRef.current?.querySelector<HTMLElement>(
      '[role="menuitemradio"], [role="menuitem"]',
    )
    first?.focus()
  }, [open ])

  useEffect(() => {
    if (!open && triggerEl) triggerEl.focus()
  }, [open, triggerEl])

  useEffect(() => {
    if (!open) return
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflow
    }
  }, [open ])

  function run(item: OverflowItem) {
    onClose()
    if (item.action === 'manage') onManageCategories()
    else if (item.action === 'backup') onOpenBackup()
    else if (item.view !== undefined) onSelect(item.view)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
      return
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const rows = sheetRef.current?.querySelectorAll<HTMLElement>(
        '[role="menuitemradio"], [role="menuitem"]',
      )
      if (!rows?.length) return
      const index = Array.from(rows).indexOf(document.activeElement as HTMLElement)
      const next =
        event.key === 'ArrowDown'
          ? (index + 1) % rows.length
          : (index - 1 + rows.length) % rows.length
      rows[next].focus()
      return
    }

    if (event.key === 'Tab') {
      const focusable = sheetRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/25 backdrop-blur-[2px] lg:hidden"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={sheetRef}
        role="menu"
        aria-modal="true"
        aria-label="More options"
        onKeyDown={handleKeyDown}
        className="absolute inset-x-0 bottom-0 max-h-[80dvh] overflow-y-auto rounded-t-2xl border-t border-line bg-surface px-3 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-16px_40px_-16px_rgba(11,12,17,0.25)]"
      >
        <div className="mx-auto mb-1 h-1 w-9 rounded-full bg-line" aria-hidden="true" />
        <div className="flex items-center justify-between px-2 py-2">
          <p className="text-[12px] font-semibold tracking-[0.04em] text-ink-faint uppercase">
            More
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="grid size-8 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <X className="size-4" strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        <ul className="space-y-0.5">
          {items.map((item) => {
            const Icon = item.icon
            const active = item.view !== undefined && activeView === item.view
            const isRadio = item.view !== undefined && item.action === undefined
            const locked =
              item.gate === 'hard' && !loading && gateState(item.gate, license, loading) === 'upsell'

            return (
              <li key={item.key}>
                <button
                  type="button"
                  role={isRadio ? 'menuitemradio' : 'menuitem'}
                  aria-checked={isRadio ? active : undefined}
                  onClick={() => run(item)}
                  className={rowClass(active)}
                >
                  <Icon
                    className={active ? 'size-4 shrink-0 text-brand-tint' : 'size-4 shrink-0 text-ink-faint'}
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  <span className="truncate">{item.label}</span>
                  {active ? (
                    <span className="ml-auto flex items-center gap-1.5 text-[11px] font-medium text-brand-tint">
                      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
                      Current
                    </span>
                  ) : item.gate === 'hard' ? (
                    <span className="ml-auto flex items-center gap-1">
                      {locked ? (
                        <Lock className="size-3 text-ink-faint" strokeWidth={2} aria-hidden="true" />
                      ) : null}
                      <span className="rounded-full bg-brand-tint px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-brand-deep uppercase">
                        Pro
                      </span>
                    </span>
                  ) : item.status === 'soon' ? (
                    <span className="ml-auto rounded-full bg-canvas px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-ink-faint uppercase">
                      Soon
                    </span>
                  ) : item.hint ? (
                    <span className="ml-auto text-[11px] font-medium text-ink-faint">{item.hint}</span>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

export function OverflowTrigger({
  expanded,
  onOpen,
  currentTarget,
}: {
  expanded: boolean
  onOpen: (target: HTMLButtonElement) => void
  currentTarget: (target: HTMLButtonElement | null) => void
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        currentTarget(event.currentTarget)
        onOpen(event.currentTarget)
      }}
      aria-haspopup="menu"
      aria-expanded={expanded}
      aria-label="More options"
      className="grid size-11 shrink-0 place-items-center rounded-full border border-line bg-surface text-ink-muted transition-colors hover:border-ink-faint/50 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <Ellipsis className="size-5" strokeWidth={1.75} aria-hidden="true" />
    </button>
  )
}
