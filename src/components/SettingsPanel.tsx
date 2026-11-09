import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowDownAZ, ArrowUpAZ, HardDrive, SlidersHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import * as repo from '../lib/repo'
import type { Settings, SortDirection, SortField } from '../lib/types'

type SettingsPanelProps = {
  settings?: Settings
  onUpdate: (patch: Partial<Settings>) => Promise<Settings>
}

const SORT_FIELDS: { value: SortField; label: string; hint: string }[] = [
  { value: 'updatedAt', label: 'Recently updated', hint: 'Newest edit first' },
  { value: 'createdAt', label: 'Date created', hint: 'Newest prompt first' },
  { value: 'title', label: 'Title', hint: 'Alphabetical' },
]

const DIRECTIONS: { value: SortDirection; label: string; icon: typeof ArrowUpAZ }[] = [
  { value: 'desc', label: 'Descending', icon: ArrowDownAZ },
  { value: 'asc', label: 'Ascending', icon: ArrowUpAZ },
]

const optionClass = (active: boolean) =>
  [
    'inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-medium transition-colors',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
    active ? 'bg-ink text-surface' : 'text-ink-muted hover:text-ink',
  ].join(' ')

export default function SettingsPanel({ settings: passedSettings, onUpdate }: SettingsPanelProps) {
  // Live so the page reflects a sort change made from the header dropdown.
  const live = useLiveQuery(() => repo.getSettings(), [])
  const settings = live ?? passedSettings

  const sortBy: SortField = settings?.sortBy ?? 'updatedAt'
  const sortDirection: SortDirection = settings?.sortDirection ?? 'desc'

  async function apply(patch: Partial<Settings>, message: string) {
    try {
      await onUpdate(patch)
      toast.success(message)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save this preference')
    }
  }

  return (
    <div className="mx-auto w-full max-w-[820px] px-5 py-8 lg:px-8 lg:py-10">
      <div className="mb-5">
        <h2 className="text-[20px] font-semibold tracking-[-0.025em]">Settings</h2>
        <p className="mt-1 text-[13px] text-ink-muted">
          Preferences for this browser and this library.
        </p>
      </div>

      <section className="mb-4 rounded-2xl border border-line bg-surface p-5 shadow-xs">
        <div className="mb-4 flex items-center gap-2">
          <SlidersHorizontal className="size-4 text-ink-muted" strokeWidth={1.75} aria-hidden="true" />
          <h3 className="text-[13px] font-semibold tracking-[-0.01em]">Sort &amp; organization</h3>
        </div>

        <div className="mb-5">
          <p className="mb-1.5 text-[12px] font-medium text-ink">Default sort field</p>
          <p className="mb-2.5 text-[12px] text-ink-faint">
            Applies to All Prompts and every category view.
          </p>

          <div
            role="radiogroup"
            aria-label="Default sort field"
            className="flex flex-col gap-2 sm:flex-row"
          >
            {SORT_FIELDS.map((field) => {
              const active = sortBy === field.value

              return (
                <button
                  key={field.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    if (active) return
                    void apply({ sortBy: field.value }, `Sorting by ${field.label.toLowerCase()}`)
                  }}
                  className={[
                    'flex-1 rounded-xl border px-3.5 py-2.5 text-left transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
                    active
                      ? 'border-brand bg-brand/5'
                      : 'border-line bg-surface hover:border-ink-faint/50',
                  ].join(' ')}
                >
                  <span className="block text-[13px] font-medium text-ink">{field.label}</span>
                  <span className="mt-0.5 block text-[11px] text-ink-faint">{field.hint}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <p className="mb-2.5 text-[12px] font-medium text-ink">Sort direction</p>

          <div
            role="radiogroup"
            aria-label="Sort direction"
            className="inline-flex w-full rounded-xl border border-line bg-canvas p-1 sm:w-auto"
          >
            {DIRECTIONS.map(({ value, label, icon: Icon }) => {
              const active = sortDirection === value

              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    if (active) return
                    void apply({ sortDirection: value }, `Sorting ${label.toLowerCase()}`)
                  }}
                  className={optionClass(active)}
                >
                  <Icon className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5 shadow-xs">
        <div className="mb-2 flex items-center gap-2">
          <HardDrive className="size-4 text-ink-muted" strokeWidth={1.75} aria-hidden="true" />
          <h3 className="text-[13px] font-semibold tracking-[-0.01em]">
            This library is stored in this browser
          </h3>
        </div>

        <p className="text-[13px] leading-relaxed text-ink-muted">
          Prompts live in this browser&apos;s IndexedDB on this device. Nothing leaves the machine
          unless you export a backup or turn on cloud sync. Export a backup to keep a copy outside
          the device, because clearing site data will remove the library.
        </p>

        <p className="mt-3 text-[12px] text-ink-faint">
          Backup &amp; data and Cloud Sync live in the sidebar under System.
        </p>
      </section>
    </div>
  )
}
