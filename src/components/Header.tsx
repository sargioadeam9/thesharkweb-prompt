import { ChevronDown, Plus, Search, X } from 'lucide-react'
import BrandMark from './BrandMark'

const SORT_OPTIONS = [
  { value: 'updatedAt-desc', label: 'Recently updated' },
  { value: 'updatedAt-asc', label: 'Least recently updated' },
  { value: 'createdAt-desc', label: 'Newest first' },
  { value: 'createdAt-asc', label: 'Oldest first' },
  { value: 'title-asc', label: 'Title A-Z' },
  { value: 'title-desc', label: 'Title Z-A' },
] as const

type HeaderProps = {
  title: string
  query: string
  onQueryChange: (value: string) => void
  sortValue: string
  onSortChange: (value: string) => void
  onNew: () => void
  showControls: boolean
}

function SearchField({
  query,
  onQueryChange,
  className = '',
}: {
  query: string
  onQueryChange: (value: string) => void
  className?: string
}) {
  return (
    <div className={`relative ${className}`}>
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint"
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <input
        type="text"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="Search prompts"
        aria-label="Search prompts"
        autoComplete="off"
        spellCheck={false}
        className="h-9 w-full rounded-lg border border-line bg-surface pr-9 pl-9 text-[13px] text-ink transition-colors placeholder:text-ink-faint focus:border-brand focus:ring-2 focus:ring-brand/15 focus:outline-none"
      />
      {query ? (
        <button
          type="button"
          onClick={() => onQueryChange('')}
          aria-label="Clear search"
          className="absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded-md text-ink-faint transition-colors hover:bg-canvas hover:text-ink"
        >
          <X className="size-3.5" strokeWidth={2} aria-hidden="true" />
        </button>
      ) : (
        <kbd
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 rounded border border-line px-1.5 py-0.5 font-sans text-[10px] leading-none text-ink-faint"
        >
          /
        </kbd>
      )}
    </div>
  )
}

function SortSelect({
  value,
  onChange,
  className = '',
}: {
  value: string
  onChange: (value: string) => void
  className?: string
}) {
  return (
    <div className={`relative ${className}`}>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label="Sort prompts"
        className="h-9 w-full appearance-none rounded-lg border border-line bg-surface pr-8 pl-3 text-[13px] text-ink transition-colors hover:border-ink-faint/50 focus:border-brand focus:ring-2 focus:ring-brand/15 focus:outline-none"
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-ink-faint"
        strokeWidth={1.75}
        aria-hidden="true"
      />
    </div>
  )
}

export default function Header({
  title,
  query,
  onQueryChange,
  sortValue,
  onSortChange,
  onNew,
  showControls,
}: HeaderProps) {
  return (
    <header className="shrink-0 border-b border-line">
      <div className="hidden h-[72px] items-center gap-4 px-8 lg:flex">
        <h1 className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-[-0.01em]">
          {title}
        </h1>
        {showControls ? (
          <>
            <SearchField query={query} onQueryChange={onQueryChange} className="w-[280px]" />
            <SortSelect value={sortValue} onChange={onSortChange} className="w-[176px]" />
          </>
        ) : null}
        <button
          type="button"
          onClick={onNew}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <Plus className="size-4" strokeWidth={2.25} aria-hidden="true" />
          New Prompt
        </button>
      </div>

      <div className="px-5 pt-3 pb-3 lg:hidden">
        <div className="flex items-center gap-2.5">
          <BrandMark size={20} />
          <span className="min-w-0 truncate text-[14px] font-semibold tracking-[-0.02em]">
            PromptNook
          </span>
          <button
            type="button"
            onClick={onNew}
            aria-label="New prompt"
            className="ml-auto grid size-10 shrink-0 place-items-center rounded-lg bg-brand text-white transition-colors hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <Plus className="size-4" strokeWidth={2.25} aria-hidden="true" />
          </button>
          {showControls ? (
            <SortSelect value={sortValue} onChange={onSortChange} className="w-[142px] shrink-0" />
          ) : null}
        </div>
        {showControls ? (
          <div className="mt-3">
            <SearchField query={query} onQueryChange={onQueryChange} />
          </div>
        ) : null}
      </div>
    </header>
  )
}
