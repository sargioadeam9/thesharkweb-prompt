import { useMemo, useState } from 'react'
import { Check, Copy, LayoutTemplate, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { copyText } from '../lib/clipboard'
import { TEMPLATES, type Template } from '../lib/templates'

type TemplatesPanelProps = {
  onNewFromTemplate: (template: Template) => void
}

const chipClass = (active: boolean) =>
  [
    'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
    active
      ? 'border-ink bg-ink text-surface'
      : 'border-line bg-surface text-ink-muted hover:border-ink-faint/50 hover:text-ink',
  ].join(' ')

export default function TemplatesPanel({ onNewFromTemplate }: TemplatesPanelProps) {
  const [category, setCategory] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const categories = useMemo(() => {
    const seen: string[] = []
    for (const template of TEMPLATES) {
      if (!seen.includes(template.category)) seen.push(template.category)
    }
    return seen.sort((a, b) => a.localeCompare(b))
  }, [])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()

    return TEMPLATES.filter((template) => {
      if (category && template.category !== category) return false
      if (!needle) return true

      const haystack = `${template.title} ${template.category} ${template.content}`.toLowerCase()
      return needle.split(/\s+/).every((term) => haystack.includes(term))
    })
  }, [category, query])

  async function handleCopy(template: Template) {
    const ok = await copyText(template.content)

    if (!ok) {
      toast.error('Could not copy. Select the text and copy it manually.')
      return
    }

    toast.success('Template copied')
    setCopiedId(template.id)
    window.setTimeout(() => {
      setCopiedId((current) => (current === template.id ? null : current))
    }, 1600)
  }

  return (
    <div className="mx-auto w-full max-w-[1180px] px-5 py-8 lg:px-8 lg:py-10">
      <div className="mb-5">
        <h2 className="text-[20px] font-semibold tracking-[-0.025em]">Templates</h2>
        <p className="mt-1 text-[13px] text-ink-muted">
          Start from a proven prompt and make it yours.
        </p>
      </div>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div
          role="group"
          aria-label="Filter templates by category"
          className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <button
            type="button"
            onClick={() => setCategory(null)}
            aria-pressed={category === null}
            className={chipClass(category === null)}
          >
            All
            <span className="tabular-nums opacity-60">{TEMPLATES.length}</span>
          </button>

          {categories.map((name) => {
            const count = TEMPLATES.filter((template) => template.category === name).length

            return (
              <button
                key={name}
                type="button"
                onClick={() => setCategory(name)}
                aria-pressed={category === name}
                className={chipClass(category === name)}
              >
                {name}
                <span className="tabular-nums opacity-60">{count}</span>
              </button>
            )
          })}
        </div>

        <label className="relative flex shrink-0 items-center sm:w-[220px]">
          <Search
            className="pointer-events-none absolute left-3 size-3.5 text-ink-faint"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <span className="sr-only">Search templates</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search templates"
            className="h-9 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-[13px] text-ink transition-colors placeholder:text-ink-faint focus:border-brand focus:ring-2 focus:ring-brand/15 focus:outline-none"
          />
        </label>
      </div>

      {visible.length ? (
        <div className="prompt-grid grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((template) => {
            const justCopied = copiedId === template.id

            return (
              <article
                key={template.id}
                className="flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-xs"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h3 className="text-[14px] leading-snug font-semibold tracking-[-0.01em] text-balance">
                    {template.title}
                  </h3>
                  <span className="shrink-0 rounded-full border border-line bg-canvas px-2 py-0.5 text-[11px] font-medium text-ink-muted">
                    {template.category}
                  </span>
                </div>

                <p className="mb-4 line-clamp-3 flex-1 text-[13px] leading-relaxed text-ink-muted">
                  {template.content}
                </p>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCopy(template)}
                    className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[12px] font-medium text-ink transition-colors hover:border-ink-faint/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    {justCopied ? (
                      <Check className="size-3.5" strokeWidth={2} aria-hidden="true" />
                    ) : (
                      <Copy className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
                    )}
                    {justCopied ? 'Copied' : 'Copy'}
                  </button>

                  <button
                    type="button"
                    onClick={() => onNewFromTemplate(template)}
                    className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    <Plus className="size-3.5" strokeWidth={2} aria-hidden="true" />
                    Use as new prompt
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-line bg-surface/60 px-6 py-14 text-center">
          <span
            aria-hidden="true"
            className="mx-auto mb-5 grid size-11 place-items-center rounded-2xl border border-line bg-surface shadow-sm"
          >
            <LayoutTemplate className="size-5 text-ink-muted" strokeWidth={1.75} />
          </span>
          <h3 className="text-[17px] font-semibold tracking-[-0.02em]">No templates match.</h3>
          <p className="mx-auto mt-2 max-w-[340px] text-[13px] leading-relaxed text-ink-muted">
            Try a different category, or clear the search.
          </p>
          <button
            type="button"
            onClick={() => {
              setCategory(null)
              setQuery('')
            }}
            className="mt-5 inline-flex h-9 items-center rounded-lg border border-line bg-surface px-3.5 text-[13px] font-medium text-ink transition-colors hover:border-ink-faint/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Clear filters
          </button>
        </div>
      )}

      <p className="mt-8 border-t border-line pt-4 text-[12px] text-ink-faint">
        Templates are built in. They are never saved until you save one as a prompt.
      </p>
    </div>
  )
}
