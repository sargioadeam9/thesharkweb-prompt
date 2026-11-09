import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Check, Copy, EllipsisVertical, Pencil, Star, StickyNote, Trash2 } from 'lucide-react'
import { copyText } from '../lib/clipboard'
import { recordCopy } from '../lib/recent'
import type { Prompt } from '../lib/types'
import { wordCount } from '../lib/utils'

type Props = {
  prompt: Prompt
  onOpen: (prompt: Prompt) => void
  onDuplicate: (prompt: Prompt) => void
  onDelete: (prompt: Prompt) => void
  onToggleFavorite: (prompt: Prompt) => void
  /** Copies tracked on this device. Only the Recently Used page passes it. */
  copyCount?: number
}

type CopyStatus = 'idle' | 'copied' | 'failed'

const menuItemClass =
  'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink transition-colors hover:bg-canvas focus-visible:bg-canvas focus-visible:outline-none'

export default function PromptCard({ prompt, onOpen, onDuplicate, onDelete, onToggleFavorite, copyCount = 0 }: Props) {
  const [status, setStatus] = useState<CopyStatus>('idle')
  const [menuOpen, setMenuOpen] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  useEffect(() => {
    if (!menuOpen) return

    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()

    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [menuOpen])

  async function handleCopy() {
    const ok = await copyText(prompt.content)

    if (ok) recordCopy(prompt.id)

    setStatus(ok ? 'copied' : 'failed')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setStatus('idle'), 2000)
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      setMenuOpen(false)
      triggerRef.current?.focus()
      return
    }

    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return

    event.preventDefault()
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    )
    if (!items.length) return

    const index = items.indexOf(document.activeElement as HTMLElement)
    const next =
      event.key === 'ArrowDown'
        ? (index + 1) % items.length
        : (index - 1 + items.length) % items.length
    items[next].focus()
  }

  function run(action: (prompt: Prompt) => void) {
    setMenuOpen(false)
    action(prompt)
  }

  const tags = prompt.tags?.slice(0, 3) ?? []
  const extraTags = (prompt.tags?.length ?? 0) - tags.length

  const copyLabel = status === 'copied' ? 'Copied' : status === 'failed' ? 'Try again' : 'Copy'
  const copyAria =
    status === 'copied'
      ? 'Prompt copied'
      : status === 'failed'
        ? 'Copy failed, try again'
        : `Copy "${prompt.title}"`

  return (
    <article className="group relative flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-xs transition-all duration-200 hover:border-ink-faint/40 hover:shadow-[0_8px_24px_-16px_rgba(11,12,17,0.25)]">
      <button
        type="button"
        onClick={() => onOpen(prompt)}
        aria-label={`Open "${prompt.title}"`}
        className="absolute inset-0 z-0 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      />

      <div className="pointer-events-none relative z-10 flex flex-1 flex-col">
        <div className="flex items-start gap-1">
          <h3 className="line-clamp-2 min-w-0 flex-1 text-[14px] leading-snug font-semibold tracking-[-0.01em]">
            {prompt.title}
          </h3>

          <div className="pointer-events-auto -mt-1.5 -mr-1.5 flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => onToggleFavorite(prompt)}
              aria-pressed={Boolean(prompt.isFavorite)}
              aria-label={
                prompt.isFavorite
                  ? `Remove "${prompt.title}" from favorites`
                  : `Add "${prompt.title}" to favorites`
              }
              className="grid size-8 place-items-center rounded-lg transition-colors hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <Star
                className={
                  prompt.isFavorite ? 'size-4 fill-star text-star' : 'size-4 text-ink-faint'
                }
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </button>

            <div className="relative">
              <button
                ref={triggerRef}
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label={`Actions for "${prompt.title}"`}
                className="grid size-8 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                <EllipsisVertical className="size-4" strokeWidth={1.75} aria-hidden="true" />
              </button>

              {menuOpen ? (
                <div
                  ref={menuRef}
                  role="menu"
                  aria-label={`Actions for "${prompt.title}"`}
                  onKeyDown={handleMenuKeyDown}
                  className="absolute top-full right-0 z-20 mt-1 w-40 rounded-xl border border-line bg-surface p-1 shadow-[0_16px_40px_-20px_rgba(11,12,17,0.4)]"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => run(onOpen)}
                    className={menuItemClass}
                  >
                    <Pencil className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
                    Edit
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => run(onDuplicate)}
                    className={menuItemClass}
                  >
                    <Copy className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
                    Duplicate
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => run(onDelete)}
                    className={`${menuItemClass} text-danger hover:bg-danger/8`}
                  >
                    <Trash2 className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
                    Delete
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-ink-muted">
          {prompt.content}
        </p>

        {tags.length || prompt.notes ? (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-md bg-canvas px-1.5 py-0.5 text-[11px] font-medium text-ink-muted"
              >
                {tag}
              </span>
            ))}
            {extraTags > 0 ? (
              <span className="text-[11px] font-medium text-ink-faint">+{extraTags}</span>
            ) : null}
            {prompt.notes ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-ink-faint">
                <StickyNote className="size-3" strokeWidth={1.75} aria-hidden="true" />
                Note
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="mt-auto flex items-center justify-between gap-3 pt-4">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="text-[11px] tabular-nums text-ink-faint">
              {wordCount(prompt.content)} words
            </span>
            {copyCount > 0 ? (
              <span className="shrink-0 rounded-md bg-brand-tint px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-brand-deep">
                Copied ×{copyCount}
              </span>
            ) : null}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            aria-label={copyAria}
            className={[
              'pointer-events-auto inline-flex h-10 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-medium transition-colors sm:h-8',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
              status === 'copied'
                ? 'border-brand/30 bg-brand-tint/70 text-brand-deep'
                : 'border-line text-ink-muted hover:border-brand/30 hover:bg-brand-tint/50 hover:text-brand-deep',
            ].join(' ')}
          >
            {status === 'copied' ? (
              <Check className="size-3.5" strokeWidth={2} aria-hidden="true" />
            ) : (
              <Copy className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
            )}
            {copyLabel}
          </button>
        </div>
      </div>
    </article>
  )
}
