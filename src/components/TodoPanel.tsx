import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { CalendarDays, Check, ListTodo, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import * as repo from '../lib/repo'
import type { Todo, TodoFilter } from '../lib/types'
import DatePicker from './DatePicker'

const FILTERS: { value: TodoFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'done', label: 'Done' },
]

const MAX_BOX_HEIGHT = 200

function localDayKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dayKeyToTime(key: string): number {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day).getTime()
}

function formatDueDate(dueDate: string): string {
  return new Date(dayKeyToTime(dueDate)).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function dueLabel(
  dueDate: string,
  today: string,
): { text: string; tone: 'overdue' | 'soon' | 'normal' } {
  const diff = Math.round((dayKeyToTime(dueDate) - dayKeyToTime(today)) / 86_400_000)

  if (diff < 0) {
    return {
      text: diff === -1 ? 'Yesterday' : `${Math.abs(diff)} days overdue`,
      tone: 'overdue',
    }
  }
  if (diff === 0) return { text: 'Today', tone: 'soon' }
  if (diff === 1) return { text: 'Tomorrow', tone: 'soon' }

  return { text: formatDueDate(dueDate), tone: 'normal' }
}

const DUE_CHIPS = {
  overdue: 'border-danger/30 bg-danger/5 text-danger',
  soon: 'border-brand/25 bg-brand-tint/30 text-brand-deep',
  normal: 'border-line bg-canvas text-ink-muted',
} as const

/** Counts up on mount and on change, unless the user asked for less motion. */
function useCountUp(target: number): number {
  const [display, setDisplay] = useState(0)
  const current = useRef(0)

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    const from = current.current

    if (reduce || from === target) {
      current.current = target
      setDisplay(target)
      return
    }

    const start = performance.now()
    const duration = 520
    let frame = 0

    function tick(now: number) {
      const progress = Math.min(1, (now - start) / duration)
      const eased = 1 - (1 - progress) ** 3
      const value = Math.round(from + (target - from) * eased)

      current.current = value
      setDisplay(value)

      if (progress < 1) frame = requestAnimationFrame(tick)
      else current.current = target
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target])

  return display
}

function Stat({
  label,
  value,
  tone = 'text-ink',
}: {
  label: string
  value: number
  tone?: string
}) {
  const shown = useCountUp(value)

  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2">
      <p className="text-[10px] font-medium tracking-[0.06em] text-ink-faint uppercase">{label}</p>
      <p className={`mt-1 text-[17px] leading-none font-semibold tabular-nums ${tone}`}>{shown}</p>
    </div>
  )
}

export default function TodoPanel({ todos }: { todos: Todo[] }) {
  const [today] = useState(() => localDayKey(new Date()))
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState(today)
  const [filter, setFilter] = useState<TodoFilter>('all')
  const boxRef = useRef<HTMLTextAreaElement>(null)

  const sorted = useMemo(
    () =>
      [...todos].sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1
        if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1
        if (a.dueDate) return -1
        if (b.dueDate) return 1
        return Date.parse(a.createdAt) - Date.parse(b.createdAt)
      }),
    [todos],
  )

  const visible = useMemo(() => {
    if (filter === 'open') return sorted.filter((todo) => !todo.done)
    if (filter === 'done') return sorted.filter((todo) => todo.done)
    return sorted
  }, [sorted, filter])

  const openCount = todos.filter((todo) => !todo.done).length
  const doneCount = todos.length - openCount
  const dueCount = todos.filter(
    (todo) => !todo.done && todo.dueDate !== undefined && todo.dueDate <= today,
  ).length

  useEffect(() => {
    const box = boxRef.current
    if (!box) return

    box.style.height = 'auto'
    box.style.height = `${Math.min(box.scrollHeight, MAX_BOX_HEIGHT)}px`
  }, [title])

  async function handleAdd(event: FormEvent) {
    event.preventDefault()
    if (!title.trim()) return

    try {
      await repo.createTodo({ title, dueDate: dueDate || undefined })
      setTitle('')
      setDueDate(today)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add this task')
    }
  }

  function handleBoxKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return

    event.preventDefault()
    event.currentTarget.form?.requestSubmit()
  }

  async function handleToggle(todo: Todo) {
    try {
      await repo.toggleTodo(todo.id)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update this task')
    }
  }

  async function handleDelete(todo: Todo) {
    try {
      await repo.deleteTodo(todo.id)
      toast.success('Task deleted', {
        duration: 6000,
        action: {
          label: 'Undo',
          onClick: () => {
            void repo
              .restoreTodo(todo)
              .then(() => toast.success('Task restored'))
              .catch(() => toast.error('Could not restore this task'))
          },
        },
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete this task')
    }
  }

  async function handleClearCompleted() {
    try {
      const removed = await repo.clearCompletedTodos()
      if (removed) toast.success(`${removed} completed task${removed === 1 ? '' : 's'} cleared`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not clear completed tasks')
    }
  }

  return (
    <div className="mx-auto w-full max-w-[760px] px-5 py-7 lg:px-8 lg:py-9">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[20px] font-semibold tracking-[-0.025em]">To Do</h2>
          <p className="mt-1 text-[13px] text-ink-muted">
            {todos.length === 0
              ? 'A quick list for the prompts you mean to write.'
              : 'Saved in this browser only.'}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat label="Total" value={todos.length} />
        <Stat
          label="Due"
          value={dueCount}
          tone={dueCount > 0 ? 'text-danger' : 'text-ink'}
        />
        <Stat label="Completed" value={doneCount} />
      </div>

      <form onSubmit={handleAdd} className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-start">
        <textarea
          ref={boxRef}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={handleBoxKeyDown}
          placeholder="What needs doing?"
          aria-label="New task"
          maxLength={200}
          rows={1}
          autoComplete="off"
          className="block min-h-10 w-full flex-1 resize-none overflow-y-auto rounded-lg border border-line bg-surface px-3 py-2.5 text-[13px] leading-relaxed text-ink transition-colors placeholder:text-ink-faint focus:border-brand focus:ring-2 focus:ring-brand/15 focus:outline-none"
        />

        <div className="flex items-stretch gap-2">
          <DatePicker
            value={dueDate || undefined}
            onChange={(next) => setDueDate(next ?? '')}
          />

          <button
            type="submit"
            disabled={!title.trim()}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-40"
          >
            <Plus className="size-4" strokeWidth={2.25} aria-hidden="true" />
            Add
          </button>
        </div>
      </form>

      <p className="mt-1.5 text-[11px] text-ink-faint">
        Enter to add, Shift+Enter for a new line.
      </p>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          {FILTERS.map((item) => {
            const count =
              item.value === 'all' ? todos.length : item.value === 'open' ? openCount : doneCount
            const active = filter === item.value

            return (
              <button
                key={item.value}
                type="button"
                onClick={() => setFilter(item.value)}
                aria-pressed={active}
                className={[
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
                  active
                    ? 'border-ink bg-ink text-surface'
                    : 'border-line bg-surface text-ink-muted hover:border-ink-faint/50 hover:text-ink',
                ].join(' ')}
              >
                {item.label}
                <span className="tabular-nums opacity-60">{count}</span>
              </button>
            )
          })}
        </div>

        {doneCount > 0 ? (
          <button
            type="button"
            onClick={handleClearCompleted}
            className="text-[12px] font-medium text-ink-muted transition-colors hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Clear completed
          </button>
        ) : null}
      </div>

      <p aria-live="polite" className="sr-only">
        {visible.length} task{visible.length === 1 ? '' : 's'} shown
      </p>

      {visible.length === 0 ? (
        <div className="mt-8 flex justify-center px-6 py-10 text-center">
          <div className="max-w-[320px]">
            <span
              aria-hidden="true"
              className="mx-auto mb-5 grid size-11 place-items-center rounded-2xl border border-line bg-surface shadow-sm"
            >
              <ListTodo className="size-5 text-ink-muted" strokeWidth={1.75} />
            </span>
            <p className="text-[15px] font-semibold tracking-[-0.02em]">
              {todos.length === 0
                ? 'Nothing on the list yet'
                : filter === 'open'
                  ? 'All caught up'
                  : 'No completed tasks'}
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
              {todos.length === 0
                ? 'Add a task above. It stays in this browser, so export a backup now and then.'
                : 'Switch the filter to see the rest of your list.'}
            </p>
          </div>
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {visible.map((todo) => {
            const due = todo.dueDate ? dueLabel(todo.dueDate, today) : null

            return (
              <li
                key={todo.id}
                className="group flex items-start gap-3 rounded-xl border border-line bg-surface px-3 py-2.5"
              >
                <input
                  type="checkbox"
                  checked={todo.done}
                  onChange={() => void handleToggle(todo)}
                  aria-label={todo.done ? `Mark "${todo.title}" as open` : `Mark "${todo.title}" as done`}
                  className="mt-0.5 size-4 shrink-0 accent-[var(--color-brand)]"
                />
                <span
                  className={[
                    'min-w-0 flex-1 text-[13px] leading-relaxed break-words whitespace-pre-wrap',
                    todo.done ? 'text-ink-faint line-through' : 'text-ink',
                  ].join(' ')}
                >
                  {todo.title}
                </span>
                {due ? (
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${DUE_CHIPS[due.tone]}`}
                  >
                    <CalendarDays className="size-3" strokeWidth={2} aria-hidden="true" />
                    {due.text}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => void handleDelete(todo)}
                  aria-label={`Delete "${todo.title}"`}
                  className="grid size-7 shrink-0 place-items-center rounded-md text-ink-faint transition-colors hover:bg-danger/10 hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  <Trash2 className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {doneCount > 0 ? (
        <p className="mt-5 flex items-center gap-1.5 px-1 text-[11px] text-ink-faint">
          <Check className="size-3.5" strokeWidth={2} aria-hidden="true" />
          Completed tasks stay here until you clear them.
        </p>
      ) : null}
    </div>
  )
}
