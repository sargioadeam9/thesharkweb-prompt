import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import * as repo from '../lib/repo'
import type { Category } from '../lib/types'

type Props = {
  categories: Category[]
  counts: Record<string, number>
  onClose: () => void
}

type PendingDelete = { category: Category; count: number }

const rowButtonClass =
  'grid size-8 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'

function DeleteCategoryDialog({
  pending,
  categories,
  onCancel,
  onConfirm,
}: {
  pending: PendingDelete
  categories: Category[]
  onCancel: () => void
  onConfirm: (options: { mode: 'delete' } | { mode: 'move'; targetId: string }) => Promise<void>
}) {
  const others = categories.filter((category) => category.id !== pending.category.id)
  const canMove = pending.count > 0 && others.length > 0
  const [mode, setMode] = useState<'move' | 'delete'>(canMove ? 'move' : 'delete')
  const [targetId, setTargetId] = useState(others[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const first = dialogRef.current?.querySelector<HTMLElement>('input, button')
    first?.focus()
    return () => previous?.focus?.()
  }, [])

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onCancel()
    }
  }

  async function handleConfirm() {
    setBusy(true)
    try {
      await onConfirm(mode === 'move' ? { mode: 'move', targetId } : { mode: 'delete' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] overflow-y-auto bg-ink/30 p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-category-title"
        onKeyDown={handleKeyDown}
        className="mx-auto mt-[10vh] w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-[0_28px_64px_-28px_rgba(11,12,17,0.4)]"
      >
        <h3 id="delete-category-title" className="text-[15px] font-semibold tracking-[-0.01em]">
          Delete “{pending.category.name}”?
        </h3>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
          {pending.count === 0
            ? 'This category is empty.'
            : `${pending.count} prompt${pending.count === 1 ? '' : 's'} live in this category. Choose what happens to them.`}
        </p>

        {canMove ? (
          <div className="mt-4 space-y-2">
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line p-3 transition-colors hover:bg-canvas has-[:checked]:border-brand/40 has-[:checked]:bg-brand-tint/30">
              <input
                type="radio"
                name="delete-mode"
                checked={mode === 'move'}
                onChange={() => setMode('move')}
                className="mt-0.5 accent-[var(--color-brand)]"
              />
              <span className="flex-1">
                <span className="block text-[13px] font-medium text-ink">Move prompts to</span>
                <select
                  value={targetId}
                  onChange={(event) => {
                    setTargetId(event.target.value)
                    setMode('move')
                  }}
                  aria-label="Target category"
                  className="mt-2 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink focus:border-brand focus:ring-2 focus:ring-brand/15 focus:outline-none"
                >
                  {others.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line p-3 transition-colors hover:bg-canvas has-[:checked]:border-danger/40 has-[:checked]:bg-danger/5">
              <input
                type="radio"
                name="delete-mode"
                checked={mode === 'delete'}
                onChange={() => setMode('delete')}
                className="mt-0.5 accent-[var(--color-danger)]"
              />
              <span className="text-[13px] font-medium text-ink">
                Delete the prompts too
                <span className="mt-0.5 block text-[12px] font-normal text-ink-muted">
                  They cannot be recovered.
                </span>
              </span>
            </label>
          </div>
        ) : null}

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-9 items-center rounded-lg border border-line px-3.5 text-[13px] font-medium text-ink transition-colors hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy || (mode === 'move' && !targetId)}
            className="inline-flex h-9 items-center rounded-lg bg-danger px-4 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
          >
            {busy ? 'Working…' : mode === 'move' ? 'Move and delete' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CategoryManager({ categories, counts, onClose }: Props) {
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const [busy, setBusy] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const editRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    dialogRef.current?.querySelector<HTMLInputElement>('#new-category')?.focus()

    return () => {
      document.body.style.overflow = overflow
      previous?.focus?.()
    }
  }, [])

  useEffect(() => {
    if (editingId) editRef.current?.select()
  }, [editingId])

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      if (editingId) {
        setEditingId(null)
        return
      }
      onClose()
    }
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    if (busy) return

    setBusy(true)
    setError(null)
    try {
      await repo.createCategory(newName)
      setNewName('')
      toast.success('Category created')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create this category')
    } finally {
      setBusy(false)
    }
  }

  async function commitRename() {
    if (!editingId) return

    setBusy(true)
    setError(null)
    try {
      await repo.renameCategory(editingId, editingName)
      setEditingId(null)
      toast.success('Category renamed')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename this category')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(options: { mode: 'delete' } | { mode: 'move'; targetId: string }) {
    if (!pendingDelete) return

    try {
      const result = await repo.deleteCategory(pendingDelete.category.id, options)
      setPendingDelete(null)
      toast.success(
        result.moved > 0
          ? `Category deleted, ${result.moved} prompt${result.moved === 1 ? '' : 's'} moved`
          : result.deleted > 0
            ? `Category deleted with ${result.deleted} prompt${result.deleted === 1 ? '' : 's'}`
            : 'Category deleted',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete this category')
      setPendingDelete(null)
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 overflow-y-auto bg-ink/25 p-4 backdrop-blur-[2px]"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose()
        }}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="categories-title"
          onKeyDown={handleKeyDown}
          className="mx-auto my-6 flex max-h-[calc(100dvh-5rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_28px_64px_-28px_rgba(11,12,17,0.4)]"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-line px-6 py-4">
            <h2 id="categories-title" className="text-[15px] font-semibold tracking-[-0.01em]">
              Manage categories
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="grid size-8 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <X className="size-4" strokeWidth={2} aria-hidden="true" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <form onSubmit={handleCreate} className="flex gap-2">
              <input
                id="new-category"
                type="text"
                value={newName}
                onChange={(event) => {
                  setNewName(event.target.value)
                  setError(null)
                }}
                placeholder="New category name"
                maxLength={40}
                autoComplete="off"
                className="h-10 w-full rounded-xl border border-line bg-surface px-3.5 text-[14px] text-ink transition-colors placeholder:text-ink-faint focus:border-brand focus:ring-2 focus:ring-brand/15 focus:outline-none"
              />
              <button
                type="submit"
                disabled={busy || !newName.trim()}
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-brand px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
              >
                <Plus className="size-4" strokeWidth={2.25} aria-hidden="true" />
                Add
              </button>
            </form>

            {error ? (
              <p role="alert" className="mt-2.5 text-[12px] text-danger">
                {error}
              </p>
            ) : null}

            <ul className="mt-4 divide-y divide-line">
              {categories.map((category) => {
                const count = counts[category.id] ?? 0
                const editing = editingId === category.id

                return (
                  <li key={category.id} className="flex items-center gap-2 py-2">
                    {editing ? (
                      <input
                        ref={editRef}
                        value={editingName}
                        onChange={(event) => setEditingName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            void commitRename()
                          }
                          if (event.key === 'Escape') {
                            event.stopPropagation()
                            setEditingId(null)
                          }
                        }}
                        aria-label={`Rename ${category.name}`}
                        maxLength={40}
                        className="h-9 min-w-0 flex-1 rounded-lg border border-brand bg-surface px-2.5 text-[13px] text-ink focus:ring-2 focus:ring-brand/15 focus:outline-none"
                      />
                    ) : (
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
                        {category.name}
                      </span>
                    )}

                    <span className="shrink-0 text-[11px] tabular-nums text-ink-faint">
                      {count} {count === 1 ? 'prompt' : 'prompts'}
                    </span>

                    {editing ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void commitRename()}
                          disabled={busy}
                          className="inline-flex h-8 items-center rounded-lg bg-brand px-2.5 text-[12px] font-semibold text-white transition-colors hover:bg-brand-deep disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="inline-flex h-8 items-center rounded-lg border border-line px-2.5 text-[12px] font-medium text-ink transition-colors hover:bg-canvas"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(category.id)
                            setEditingName(category.name)
                            setError(null)
                          }}
                          aria-label={`Rename ${category.name}`}
                          className={rowButtonClass}
                        >
                          <Pencil className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDelete({ category, count })}
                          aria-label={`Delete ${category.name}`}
                          className={`${rowButtonClass} hover:bg-danger/8 hover:text-danger`}
                        >
                          <Trash2 className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
                        </button>
                      </>
                    )}
                  </li>
                )
              })}
            </ul>

            <p className="mt-4 text-[11px] leading-relaxed text-ink-faint">
              At least one category must stay, otherwise new prompts have nowhere to go.
            </p>
          </div>
        </div>
      </div>

      {pendingDelete ? (
        <DeleteCategoryDialog
          pending={pendingDelete}
          categories={categories}
          onCancel={() => setPendingDelete(null)}
          onConfirm={handleDelete}
        />
      ) : null}
    </>
  )
}
