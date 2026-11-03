import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { CalendarDays, Check, ListTodo, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import * as repo from '../lib/repo'
import type { Todo, TodoFilter } from '../lib/types'

const FILTERS: { value: TodoFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'done', label: 'Done' },
]

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

  return {
    text: new Date(dayKeyToTime(dueDate)).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    }),
    tone: 'normal',
  }
}

const DUE_TONES = {
  overdue: 'text-danger',
  soon: 'text-brand-deep',
  normal: 'text-ink-faint',
} as const

export default function TodoPanel({ todos }: { todos: Todo[] }) {
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [filter, setFilter] = useState<TodoFilter>('all')
  const [today] = useState(() => localDayKey(new Date()))

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

  async function handleAdd(event: FormEvent) {
    event.preventDefault()
    if (!title.trim()) return

    try {
      await repo.createTodo({ title, dueDate: dueDate || undefined })
      setTitle('')
      setDueDate('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add this task')
    }
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
    <div className="mx-auto w-full max-w-[760px] px-5 py-8 lg:px-8 lg:py-10">
      <div className="mb-5">
        <h2 className="text-[20px] font-semibold tracking-[-0.025em]">To Do</h2>
        <p className="mt-1.5 text-[13px] text-ink-muted">
          {todos.length === 0
            ? 'A quick list for the prompts you mean to write.'
            : `${openCount} open, ${doneCount} done. Saved in this browser only.`}
        </p>
      </div>

      <form onSubmit={handleAdd} className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="What needs doing?"
          aria-label="New task"
          maxLength={200}
          autoComplete="off"
          className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-[13px] text-ink transition-colors placeholder:text-ink-faint focus:border-brand focus:ring-2 focus:ring-brand/15 focus:outline-none"
        />
        <div className="flex gap-2">
          <label className="relative shrink-0">
            <span className="sr-only">Due date</span>
            <CalendarDays
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <input
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              className="h-10 w-[160px] rounded-lg border border-line bg-surface pr-2.5 pl-9 text-[13px] text-ink transition-colors focus:border-brand focus:ring-2 focus:ring-brand/15 focus:outline-none"
            />
          </label>
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

      <div className="mt-5 flex items-center justify-between gap-3">
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
        <div className="mt-10 flex justify-center px-6 py-10 text-center">
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
        <ul className="mt-4 space-y-2">
          {visible.map((todo) => {
            const due = todo.dueDate ? dueLabel(todo.dueDate, today) : null

            return (
              <li
                key={todo.id}
                className="group flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5"
              >
                <input
                  type="checkbox"
                  checked={todo.done}
                  onChange={() => void handleToggle(todo)}
                  aria-label={todo.done ? `Mark "${todo.title}" as open` : `Mark "${todo.title}" as done`}
                  className="size-4 shrink-0 accent-[var(--color-brand)]"
                />
                <span
                  className={[
                    'min-w-0 flex-1 truncate text-[13px]',
                    todo.done ? 'text-ink-faint line-through' : 'text-ink',
                  ].join(' ')}
                >
                  {todo.title}
                </span>
                {due ? (
                  <span className={`shrink-0 text-[11px] font-medium ${DUE_TONES[due.tone]}`}>
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
