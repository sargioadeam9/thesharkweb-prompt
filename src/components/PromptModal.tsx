import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { clearDraft, readDraft, writeDraft } from '../lib/draft'
import type { Category, Prompt, PromptInput } from '../lib/types'

type Props = {
  mode: 'create' | 'edit'
  prompt?: Prompt
  categories: Category[]
  defaultCategoryId: string
  onClose: () => void
  onSubmit: (input: PromptInput) => Promise<void>
}

type FormState = {
  title: string
  content: string
  categoryId: string
  notes: string
  tags: string
}

const fieldClass =
  'w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[14px] text-ink transition-colors placeholder:text-ink-faint focus:border-brand focus:ring-2 focus:ring-brand/15 focus:outline-none'
const labelClass = 'mb-1.5 block text-[12px] font-semibold text-ink'

function buildInitialForm(
  mode: 'create' | 'edit',
  prompt: Prompt | undefined,
  categories: Category[],
  defaultCategoryId: string,
): FormState {
  if (mode === 'edit' && prompt) {
    return {
      title: prompt.title,
      content: prompt.content,
      categoryId: prompt.categoryId,
      notes: prompt.notes ?? '',
      tags: (prompt.tags ?? []).join(', '),
    }
  }

  const draft = readDraft()
  const hasCategory = categories.some((category) => category.id === draft?.categoryId)

  return {
    title: draft?.title ?? '',
    content: draft?.content ?? '',
    notes: draft?.notes ?? '',
    tags: draft?.tags ?? '',
    categoryId: hasCategory ? (draft?.categoryId as string) : defaultCategoryId,
  }
}

export default function PromptModal({
  mode,
  prompt,
  categories,
  defaultCategoryId,
  onClose,
  onSubmit,
}: Props) {
  const [form, setForm] = useState<FormState>(() =>
    buildInitialForm(mode, prompt, categories, defaultCategoryId),
  )
  const [errors, setErrors] = useState<{ title?: string; content?: string }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const formRef = useRef(form)
  const savedRef = useRef(false)

  useEffect(() => {
    formRef.current = form
  }, [form])

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    const input = titleRef.current
    input?.focus()
    input?.setSelectionRange(input.value.length, input.value.length)

    return () => {
      document.body.style.overflow = overflow
      previous?.focus?.()
    }
  }, [])

  useEffect(() => {
    if (mode !== 'create') return
    const timer = window.setTimeout(() => writeDraft(form), 300)
    return () => window.clearTimeout(timer)
  }, [form, mode])

  // Closing within the debounce window must not lose the last keystrokes.
  useEffect(() => {
    if (mode !== 'create') return
    return () => {
      if (!savedRef.current) writeDraft(formRef.current)
    }
  }, [mode])

  function patch(next: Partial<FormState>) {
    setForm((current) => ({ ...current, ...next }))
    setFormError(null)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
      return
    }

    if (event.key !== 'Tab') return

    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
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

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()

    const nextErrors: { title?: string; content?: string } = {}
    if (!form.title.trim()) nextErrors.title = 'Title is required'
    if (!form.content.trim()) nextErrors.content = 'Prompt content is required'

    setErrors(nextErrors)
    if (nextErrors.title || nextErrors.content) return

    setSaving(true)
    setFormError(null)

    try {
      await onSubmit({
        title: form.title,
        content: form.content,
        categoryId: form.categoryId,
        notes: form.notes,
        tags: form.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      })
      if (mode === 'create') {
        savedRef.current = true
        clearDraft()
      }
      onClose()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not save this prompt')
    } finally {
      setSaving(false)
    }
  }

  return (
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
        aria-labelledby="prompt-modal-title"
        onKeyDown={handleKeyDown}
        className="mx-auto my-6 flex max-h-[calc(100dvh-5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_28px_64px_-28px_rgba(11,12,17,0.4)]"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-line px-6 py-4">
          <h2 id="prompt-modal-title" className="text-[15px] font-semibold tracking-[-0.01em]">
            {mode === 'edit' ? 'Edit Prompt' : 'Create New Prompt'}
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

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
            <div>
              <label htmlFor="prompt-title" className={labelClass}>
                Title <span className="text-danger">*</span>
              </label>
              <input
                id="prompt-title"
                ref={titleRef}
                type="text"
                value={form.title}
                onChange={(event) => patch({ title: event.target.value })}
                placeholder="e.g. High-Converting SaaS Landing Page"
                autoComplete="off"
                aria-invalid={Boolean(errors.title)}
                aria-describedby={errors.title ? 'prompt-title-error' : undefined}
                className={`${fieldClass} ${errors.title ? 'border-danger focus:border-danger focus:ring-danger/15' : ''}`}
              />
              {errors.title ? (
                <p id="prompt-title-error" className="mt-1.5 text-[12px] text-danger">
                  {errors.title}
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor="prompt-content" className={labelClass}>
                Prompt <span className="text-danger">*</span>
              </label>
              <textarea
                id="prompt-content"
                value={form.content}
                onChange={(event) => patch({ content: event.target.value })}
                rows={8}
                placeholder="Paste the full prompt here. Use {{placeholders}} for parts you swap each time."
                aria-invalid={Boolean(errors.content)}
                aria-describedby={errors.content ? 'prompt-content-error' : undefined}
                className={`${fieldClass} resize-y leading-relaxed ${errors.content ? 'border-danger focus:border-danger focus:ring-danger/15' : ''}`}
              />
              {errors.content ? (
                <p id="prompt-content-error" className="mt-1.5 text-[12px] text-danger">
                  {errors.content}
                </p>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="prompt-category" className={labelClass}>
                  Category
                </label>
              <div className="relative">
                <select
                  id="prompt-category"
                  value={form.categoryId}
                  onChange={(event) => patch({ categoryId: event.target.value })}
                  className={`${fieldClass} appearance-none pr-9`}
                >
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-faint"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </div>
              </div>
              <div>
                <label htmlFor="prompt-tags" className={labelClass}>
                  Tags
                </label>
                <input
                  id="prompt-tags"
                  type="text"
                  value={form.tags}
                  onChange={(event) => patch({ tags: event.target.value })}
                  placeholder="landing, saas"
                  autoComplete="off"
                  className={fieldClass}
                />
              </div>
            </div>

            <div>
              <label htmlFor="prompt-notes" className={labelClass}>
                Notes
              </label>
              <textarea
                id="prompt-notes"
                value={form.notes}
                onChange={(event) => patch({ notes: event.target.value })}
                rows={2}
                placeholder="Which model works best, what to tweak next time."
                className={`${fieldClass} resize-y`}
              />
            </div>

            {formError ? (
              <p role="alert" className="text-[12px] text-danger">
                {formError}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line px-6 py-4">
            <p className="hidden text-[11px] text-ink-faint sm:block">
              {mode === 'create' ? 'Draft is kept if you close this window.' : 'Changes save to this browser only.'}
            </p>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 items-center rounded-lg border border-line px-3.5 text-[13px] font-medium text-ink transition-colors hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex h-9 items-center rounded-lg bg-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60"
              >
                {saving ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Save prompt'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
