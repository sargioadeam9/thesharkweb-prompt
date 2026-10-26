import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Library, Plus, SearchX } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Toaster, toast } from 'sonner'
import AboutPanel from './components/AboutPanel'
import BackupPanel from './components/BackupPanel'
import BackupReminder from './components/BackupReminder'
import CategoryBar from './components/CategoryBar'
import CategoryManager from './components/CategoryManager'
import Header from './components/Header'
import PromptCard from './components/PromptCard'
import PromptModal from './components/PromptModal'
import Sidebar, { type View } from './components/Sidebar'
import { APP_VERSION } from './lib/app-info'
import { ensureSeeded } from './lib/db'
import * as repo from './lib/repo'
import type { Prompt, PromptInput, SortDirection, SortField } from './lib/types'
import { sortPrompts } from './lib/utils'

type ModalState = { mode: 'create' } | { mode: 'edit'; prompt: Prompt }

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => unknown
}

function focusSearch() {
  const inputs = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[aria-label="Search prompts"]'),
  )
  inputs.find((input) => input.offsetParent !== null)?.focus()
}

function localDayKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-[400px] text-center">
        <span
          aria-hidden="true"
          className="mx-auto mb-6 grid size-11 place-items-center rounded-2xl border border-line bg-surface shadow-sm"
        >
          <Icon className="size-5 text-ink-muted" strokeWidth={1.75} />
        </span>
        <h2 className="text-[20px] font-semibold tracking-[-0.025em] text-balance">{title}</h2>
        <p className="mx-auto mt-2.5 max-w-[340px] text-[14px] leading-relaxed text-pretty text-ink-muted">
          {description}
        </p>
        {action ? <div className="mt-5">{action}</div> : null}
      </div>
    </div>
  )
}

function App() {
  const [view, setView] = useState<View>(null)
  const [query, setQuery] = useState('')
  const [modal, setModal] = useState<ModalState | null>(null)
  const [showCategories, setShowCategories] = useState(false)
  const [showBackup, setShowBackup] = useState(false)
  const [reminderHidden, setReminderHidden] = useState(false)

  useEffect(() => {
    ensureSeeded().catch((error: unknown) => {
      console.error('Failed to open the prompt database', error)
      toast.error('Could not open the local database')
    })
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return

      const target = event.target as HTMLElement | null
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) {
        return
      }
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return

      if (event.key === 'n' || event.key === 'N') {
        event.preventDefault()
        setModal({ mode: 'create' })
      } else if (event.key === '/') {
        event.preventDefault()
        focusSearch()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const data = useLiveQuery(async () => {
    const [prompts, categories, settings] = await Promise.all([
      repo.listPrompts(),
      repo.listCategories(),
      repo.getSettings(),
    ])
    const lastBackupDay = settings.lastBackupAt
      ? localDayKey(new Date(settings.lastBackupAt))
      : null

    return { prompts, categories, settings, lastBackupDay }
  }, [])

  const prompts = useMemo(() => data?.prompts ?? [], [data])
  const categories = useMemo(() => data?.categories ?? [], [data])
  const settings = data?.settings

  // A category can disappear while it is the active view, so derive instead of storing.
  const activeView: View =
    view &&
    view !== 'favorites' &&
    view !== 'about' &&
    !categories.some((category) => category.id === view)
      ? null
      : view

  const counts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const prompt of prompts) {
      map[prompt.categoryId] = (map[prompt.categoryId] ?? 0) + 1
    }
    return map
  }, [prompts])

  const favorites = useMemo(
    () => prompts.filter((prompt) => prompt.isFavorite).length,
    [prompts],
  )

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    let list = prompts

    if (activeView === 'favorites') list = list.filter((prompt) => prompt.isFavorite)
    else if (activeView) list = list.filter((prompt) => prompt.categoryId === activeView)

    if (needle) {
      // Every word must appear somewhere, in any order.
      const terms = needle.split(/\s+/)
      list = list.filter((prompt) => {
        const haystack = [
          prompt.title,
          prompt.content,
          prompt.notes ?? '',
          (prompt.tags ?? []).join(' '),
        ]
          .join(' ')
          .toLowerCase()

        return terms.every((term) => haystack.includes(term))
      })
    }

    return sortPrompts(list, settings?.sortBy ?? 'updatedAt', settings?.sortDirection ?? 'desc')
  }, [prompts, activeView, query, settings])

  const title =
    activeView === null
      ? 'All Prompts'
      : activeView === 'favorites'
        ? 'Favorites'
        : activeView === 'about'
          ? 'About'
          : (categories.find((category) => category.id === activeView)?.name ?? 'All Prompts')

  const sortValue = `${settings?.sortBy ?? 'updatedAt'}-${settings?.sortDirection ?? 'desc'}`

  const defaultCategoryId =
    activeView && activeView !== 'favorites' ? activeView : (categories[0]?.id ?? '')

  // Daily nudge: once a day, only when there is something to lose and the
  // library has not already been exported today. The day key is captured once
  // per mount, which is exactly "the day this session started".
  const [today] = useState(() => localDayKey(new Date()))
  const lastBackupDay = data?.lastBackupDay ?? null
  const showBackupReminder =
    !reminderHidden &&
    prompts.length > 0 &&
    settings !== undefined &&
    settings.backupPromptDate !== today &&
    lastBackupDay !== today

  function dismissBackupReminder() {
    setReminderHidden(true)
    repo.updateSettings({ backupPromptDate: today }).catch((error: unknown) => {
      console.error('Could not remember the reminder dismissal', error)
    })
  }

  function handleSortChange(value: string) {
    const [sortBy, sortDirection] = value.split('-') as [SortField, SortDirection]
    repo.updateSettings({ sortBy, sortDirection }).catch((error: unknown) => {
      console.error('Failed to save the sort order', error)
      toast.error('Could not save the sort order')
    })
  }

  async function handleSubmit(input: PromptInput) {
    if (modal?.mode === 'edit') {
      await repo.updatePrompt(modal.prompt.id, input)
      toast.success('Prompt updated')
      return
    }

    await repo.createPrompt(input)
    toast.success('Prompt created')
  }

  async function handleDuplicate(prompt: Prompt) {
    try {
      await repo.duplicatePrompt(prompt.id)
      toast.success('Prompt duplicated')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not duplicate this prompt')
    }
  }

  async function handleToggleFavorite(prompt: Prompt) {
    try {
      await repo.toggleFavorite(prompt.id)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update favorites')
    }
  }

  async function handleDelete(prompt: Prompt) {
    try {
      await repo.deletePrompt(prompt.id)
      toast.success('Prompt deleted', {
        duration: 6000,
        action: {
          label: 'Undo',
          onClick: () => {
            void repo
              .restorePrompt(prompt)
              .then(() => toast.success('Prompt restored'))
              .catch(() => toast.error('Could not restore this prompt'))
          },
        },
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete this prompt')
    }
  }

  function changeView(next: View) {
    const doc = document as ViewTransitionDocument
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (!doc.startViewTransition || reduceMotion) {
      setView(next)
      return
    }

    doc.startViewTransition(() => {
      flushSync(() => setView(next))
    })
  }

  const newButton = (
    <button
      type="button"
      onClick={() => setModal({ mode: 'create' })}
      className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <Plus className="size-4" strokeWidth={2.25} aria-hidden="true" />
      Add Your First Prompt
    </button>
  )

  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-ink">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:rounded-lg focus:border focus:border-line focus:bg-surface focus:px-3 focus:py-2 focus:text-[13px] focus:font-medium focus:text-ink focus:shadow-lg"
      >
        Skip to prompts
      </a>
      <div className="flex flex-1">
        <Sidebar
          categories={categories}
          total={prompts.length}
          favorites={favorites}
          counts={counts}
          view={activeView}
          onSelect={changeView}
          onManageCategories={() => setShowCategories(true)}
          onOpenBackup={() => setShowBackup(true)}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <Header
            title={title}
            query={query}
            onQueryChange={setQuery}
            sortValue={sortValue}
            onSortChange={handleSortChange}
            onNew={() => setModal({ mode: 'create' })}
            showControls={activeView !== 'about'}
          />
          <CategoryBar
            categories={categories}
            total={prompts.length}
            favorites={favorites}
            counts={counts}
            view={activeView}
            onSelect={changeView}
            onManageCategories={() => setShowCategories(true)}
            onOpenBackup={() => setShowBackup(true)}
          />

          <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col focus:outline-none">
            {activeView === 'about' ? (
              <AboutPanel />
            ) : (
              <>
                <p aria-live="polite" className="sr-only">
                  {filtered.length} prompt{filtered.length === 1 ? '' : 's'} shown
                </p>
                {data === undefined ? (
              <div className="mx-auto grid w-full max-w-[1180px] grid-cols-1 gap-4 px-5 py-8 sm:grid-cols-2 lg:px-8 lg:py-10 xl:grid-cols-3">
                {Array.from({ length: 6 }, (_, index) => (
                  <div
                    key={index}
                    className="h-[168px] animate-pulse rounded-2xl border border-line bg-surface/60"
                  />
                ))}
              </div>
            ) : prompts.length === 0 && !query.trim() ? (
              <EmptyState
                icon={Library}
                title="Your prompt library starts here."
                description="Your prompts, all in one place. Save your favorite AI prompts and find them whenever you need them."
                action={newButton}
              />
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={SearchX}
                title={query.trim() ? 'No prompts match that search' : 'Nothing in here yet'}
                description={
                  query.trim()
                    ? 'Try a shorter phrase, or search the prompt text instead of the title.'
                    : 'This category is empty. Prompts you move here will show up in this space.'
                }
                action={
                  query.trim() ? (
                    <button
                      type="button"
                      onClick={() => setQuery('')}
                      className="inline-flex h-9 items-center rounded-lg border border-line bg-surface px-3.5 text-[13px] font-medium text-ink transition-colors hover:border-ink-faint/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                    >
                      Clear search
                    </button>
                  ) : null
                }
              />
            ) : (
              <div className="mx-auto w-full max-w-[1180px] px-5 py-8 lg:px-8 lg:py-10">
                <div className="prompt-grid grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {filtered.map((prompt) => (
                    <PromptCard
                      key={prompt.id}
                      prompt={prompt}
                      onOpen={(target) => setModal({ mode: 'edit', prompt: target })}
                      onDuplicate={handleDuplicate}
                      onDelete={handleDelete}
                      onToggleFavorite={handleToggleFavorite}
                    />
                  ))}
                </div>
              </div>
            )}
              </>
            )}
          </main>
        </div>
      </div>

      <footer className="border-t border-line px-6 py-5">
        <p className="text-center text-[11px] text-ink-muted">
          TheSharkWebPrompt v{APP_VERSION}
        </p>
      </footer>

      {modal ? (
        <PromptModal
          key={modal.mode === 'edit' ? modal.prompt.id : 'new'}
          mode={modal.mode}
          prompt={modal.mode === 'edit' ? modal.prompt : undefined}
          categories={categories}
          defaultCategoryId={defaultCategoryId}
          onClose={() => setModal(null)}
          onSubmit={handleSubmit}
        />
      ) : null}

      {showCategories ? (
        <CategoryManager
          categories={categories}
          counts={counts}
          onClose={() => setShowCategories(false)}
        />
      ) : null}

      {showBackup ? (
        <BackupPanel
          promptCount={prompts.length}
          categoryCount={categories.length}
          lastBackupAt={settings?.lastBackupAt}
          onClose={() => setShowBackup(false)}
        />
      ) : null}

      {showBackupReminder ? (
        <BackupReminder
          lastBackupAt={settings?.lastBackupAt}
          onBackup={() => {
            setReminderHidden(true)
            setShowBackup(true)
            repo.updateSettings({ backupPromptDate: today }).catch((error: unknown) => {
              console.error('Could not remember the reminder dismissal', error)
            })
          }}
          onDismiss={dismissBackupReminder}
        />
      ) : null}

      <Toaster
        position="bottom-center"
        toastOptions={{
          style: {
            background: 'var(--color-surface)',
            color: 'var(--color-ink)',
            border: '1px solid var(--color-line)',
            borderRadius: '12px',
            fontSize: '13px',
            fontFamily: 'var(--font-sans)',
          },
          actionButtonStyle: {
            background: 'var(--color-ink)',
            color: 'var(--color-surface)',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: '600',
          },
        }}
      />
    </div>
  )
}

export default App
