import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function fromKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function toKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function prettyDate(key: string): string {
  return fromKey(key).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

type Props = {
  value?: string
  onChange: (value: string | undefined) => void
}

export default function DatePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [today] = useState(() => new Date())
  const [month, setMonth] = useState(() => {
    const base = value ? fromKey(value) : new Date()
    return new Date(base.getFullYear(), base.getMonth(), 1)
  })
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    function onPointerDown(event: PointerEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }

    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const days = useMemo(() => {
    const year = month.getFullYear()
    const monthIndex = month.getMonth()
    const offset = new Date(year, monthIndex, 1).getDay()
    const total = new Date(year, monthIndex + 1, 0).getDate()

    const cells: (Date | null)[] = Array.from({ length: offset }, () => null)
    for (let day = 1; day <= total; day += 1) cells.push(new Date(year, monthIndex, day))
    while (cells.length % 7 !== 0) cells.push(null)

    return cells
  }, [month])

  const todayKey = toKey(today)

  function toggle() {
    setOpen((current) => {
      if (!current) {
        const base = value ? fromKey(value) : new Date()
        setMonth(new Date(base.getFullYear(), base.getMonth(), 1))
      }
      return !current
    })
  }

  function pick(date: Date) {
    onChange(toKey(date))
    setOpen(false)
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex h-10 items-stretch overflow-hidden rounded-lg border border-line bg-surface transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15">
        <button
          type="button"
          onClick={toggle}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 px-2.5 text-[12px] font-medium text-ink-muted transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
        >
          <CalendarDays
            className="size-4 shrink-0 text-ink-faint"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <span className="whitespace-nowrap tabular-nums">
            {value ? prettyDate(value) : 'Due date'}
          </span>
        </button>

        {value ? (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            aria-label="Clear due date"
            className="grid w-7 place-items-center border-l border-line text-ink-faint transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
          >
            <X className="size-3.5" strokeWidth={2} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {open ? (
        <div
          role="dialog"
          aria-label="Choose a due date"
          className="absolute top-full left-0 z-40 mt-1.5 w-[268px] rounded-2xl border border-line bg-surface p-3 shadow-[0_20px_48px_-20px_rgba(11,12,17,0.38)] sm:right-0 sm:left-auto"
        >
          <div className="flex items-center justify-between px-0.5">
            <button
              type="button"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
              aria-label="Previous month"
              className="grid size-7 place-items-center rounded-full text-ink-muted transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <ChevronLeft className="size-4" strokeWidth={2} aria-hidden="true" />
            </button>
            <p className="text-[12px] font-semibold tracking-[-0.01em] text-ink">
              {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            </p>
            <button
              type="button"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
              aria-label="Next month"
              className="grid size-7 place-items-center rounded-full text-ink-muted transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <ChevronRight className="size-4" strokeWidth={2} aria-hidden="true" />
            </button>
          </div>

          <div className="mt-2.5 grid grid-cols-7 gap-y-1">
            {WEEKDAYS.map((weekday) => (
              <span
                key={weekday}
                aria-hidden="true"
                className="grid h-6 place-items-center text-[10px] font-medium text-ink-faint"
              >
                {weekday}
              </span>
            ))}

            {days.map((date, index) => {
              if (!date) return <span key={`blank-${index}`} aria-hidden="true" />

              const key = toKey(date)
              const selected = key === value
              const isToday = key === todayKey

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => pick(date)}
                  aria-pressed={selected}
                  aria-label={date.toLocaleDateString(undefined, {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                  className={[
                    'mx-auto grid size-8 place-items-center rounded-full text-[12px] tabular-nums transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
                    selected
                      ? 'bg-ink font-semibold text-surface'
                      : isToday
                        ? 'font-semibold text-brand-deep ring-1 ring-brand/30 hover:bg-canvas'
                        : 'text-ink hover:bg-canvas',
                  ].join(' ')}
                >
                  {date.getDate()}
                </button>
              )
            })}
          </div>

          <div className="mt-2.5 flex items-center justify-between border-t border-line pt-2">
            <button
              type="button"
              onClick={() => {
                onChange(undefined)
                setOpen(false)
              }}
              className="rounded-md px-2 py-1 text-[11px] font-medium text-ink-muted transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => pick(today)}
              className="rounded-md px-2 py-1 text-[11px] font-semibold text-brand-deep transition-colors hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Today
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
