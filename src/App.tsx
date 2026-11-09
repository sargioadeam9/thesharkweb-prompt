import { useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Library, Plus, SearchX } from 'lucide-react'
import { Toaster, toast } from 'sonner'
import AboutPanel from './components/AboutPanel'
import ArchivedPanel from './components/ArchivedPanel'
import BackupPanel from './components/BackupPanel'
import BackupReminder from './components/BackupReminder'
import CategoryBar from './components/CategoryBar'
import CategoryManager from './components/CategoryManager'
import FaqPanel from './components/FaqPanel'
import EmptyState from './components/Panels/EmptyState'
import PlaceholderPanel from './components/Panels/PlaceholderPanel'
import ProGate from './components/Panels/ProGate'
import RecentPanel from './components/RecentPanel'
import TagsPanel from './components/TagsPanel'
import Header from './components/Header'
import PromptCard from './components/PromptCard'
import PromptModal from './components/PromptModal'
import Sidebar, { type View } from './components/Sidebar'
import StoragePanel from './components/StoragePanel'
import SyncPanel from './components/SyncPanel'
import TodoPanel from './components/TodoPanel'
import { APP_VERSION } from './lib/app-info'
import { db, ensureSeeded } from './lib/db'
import { PRIMARY_VIEWS, flagsForView, titleForView } from './lib/nav'
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

function App() {
  const [view, setView] = useState<View>(null)
  const [query, setQuery] = useState('')
  const [modal, setModal] = useState<ModalState | null>(null)
  const [showCategories, setShowCategories] = useState(false)
  const [showBackup, setShowBackup] = useState(false)
  const [reminderHidden, setReminderHidden] = useState(false)

  // The keydown listener below has empty deps so it always reads the current view through this ref.
  const activeViewRef = useRef<View>(null)

  useEffect(() => {
    ensureSeeded().catch((error: unknown) => {
      console.error('Failed to open the prompt database', error)
      toast.error('Could not open the local database')
    })
  }, [])

  // A newer schema cannot upgrade while an older tab still holds the database.
  // Without this the library looks empty until the other tab is closed.
  useEffect(() => {
    function onBlocked() {
      toast.error('নতুন ভার্সন এসেছে', {
        duration: 12000,
        description:
          'ট্যাব বন্ধ করে আবার ঢুকুন, পেজটা নিজেই আপডেট হয়ে যাবে। আপনার প্রম্পট আর টাস্ক কিছুই মুছবে না।',
      })
    }

    db.on('blocked', onBlocked)
    return () => {
      db.on('blocked').unsubscribe(onBlocked)
    }
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return

      const target = event.target as HTMLElement | null
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) {
        return
      }
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return

      if ((event.key === 'n' || event.key === 'N') && activeViewRef.current !== 'storage') {
        event.preventDefault()
        setModal({ mode: 'create' })
      } else if (event.key === 't' || event.key === 'T') {
        event.preventDefault()
        changeView('todos')
      } else if (event.key === '/') {
        event.preventDefault()
        focusSearch()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const data = useLiveQuery(async () => {
    const [prompts, categories, todos, storageFolders, settings] = await Promise.all([
      repo.listPrompts(),
      repo.listCategories(),
      repo.listTodos(),
      repo.listStorageFolders(),
      repo.getSettings(),
    ])
    const lastBackupDay = settings.lastBackupAt
      ? localDayKey(new Date(settings.lastBackupAt))
      : null

    return { prompts, categories, todos, storageFolders, settings, lastBackupDay }
  }, [])

  const prompts = useMemo(() => data?.prompts ?? [], [data])
  const categories = useMemo(() => data?.categories ?? [], [data])
  const todos = useMemo(() => data?.todos ?? [], [data])
  const settings = data?.settings

  // A category can disappear while it is the active view, so derive instead of storing.
  const activeView: View =
    view && !PRIMARY_VIEWS.includes(view) && !categories.some((category) => category.id === view)
      ? null
      : view

  useEffect(() => {
    activeViewRef.current = activeView
  }, [activeView])

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

  const todoCount = useMemo(() => todos.filter((todo) => !todo.done).length, [todos])

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

  const title = titleForView(activeView, categories)
  const viewFlags = flagsForView(activeView)

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
    (prompts.length > 0 || todos.length > 0) &&
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
    <div className="flex h-dvh flex-col overflow-hidden bg-canvas text-ink">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:rounded-lg focus:border focus:border-line focus:bg-surface focus:px-3 focus:py-2 focus:text-[13px] focus:font-medium focus:text-ink focus:shadow-lg"
      >
        Skip to prompts
      </a>
      <div className="flex min-h-0 flex-1">
        <Sidebar
          categories={categories}
          total={prompts.length}
          favorites={favorites}
          todoCount={todoCount}
          counts={counts}
          view={activeView}
          onSelect={changeView}
          onManageCategories={() => setShowCategories(true)}
          onOpenBackup={() => setShowBackup(true)}
        />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Header
            title={title}
            query={query}
            onQueryChange={setQuery}
            sortValue={sortValue}
            onSortChange={handleSortChange}
            onNew={() => setModal({ mode: 'create' })}
            showControls={!viewFlags.hideHeaderControls}
            showNew={!viewFlags.hideNewPrompt}
          />
          <CategoryBar
            categories={categories}
            total={prompts.length}
            favorites={favorites}
            todoCount={todoCount}
            counts={counts}
            view={activeView}
            onSelect={changeView}
            onManageCategories={() => setShowCategories(true)}
            onOpenBackup={() => setShowBackup(true)}
          />

          <main
            id="main-content"
            tabIndex={-1}
            className="flex min-h-0 flex-1 flex-col overflow-y-auto focus:outline-none"
          >
            {activeView === 'about' ? (
              <AboutPanel onOpenSync={() => changeView('sync')} />
            ) : activeView === 'faq' ? (
              <FaqPanel />
            ) : activeView === 'todos' ? (
              <TodoPanel todos={todos} />
            ) : activeView === 'storage' ? (
              <StoragePanel />
            ) : activeView === 'sync' ? (
              <SyncPanel />
            ) : activeView === 'dashboard' ? (
              <PlaceholderPanel
                icon={Library}
                title="Dashboard is on the way."
                description="এই অংশটা এখনো বানানো হচ্ছে। আপনার সব প্রম্পট এখন All Prompts-এ পাবেন।"
                action={
                  <button
                    type="button"
                    onClick={() => changeView(null)}
                    className="inline-flex h-9 items-center rounded-lg border border-line bg-surface px-3.5 text-[13px] font-medium text-ink transition-colors hover:border-ink-faint/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    All Prompts-এ যান
                  </button>
                }
              />
            ) : activeView === 'recent' ? (
              <RecentPanel
                prompts={prompts}
                categories={categories}
                onNavigate={(target) => changeView(target)}
                onOpen={(target) => setModal({ mode: 'edit', prompt: target })}
                onDuplicate={handleDuplicate}
                onDelete={handleDelete}
                onToggleFavorite={handleToggleFavorite}
              />
            ) : activeView === 'collections' ? (
              <PlaceholderPanel
                icon={Library}
                title="Collections is on the way."
                description="এই অংশটা এখনো বানানো হচ্ছে। আপনার সব প্রম্পট এখন All Prompts-এ পাবেন।"
                action={
                  <button
                    type="button"
                    onClick={() => changeView(null)}
                    className="inline-flex h-9 items-center rounded-lg border border-line bg-surface px-3.5 text-[13px] font-medium text-ink transition-colors hover:border-ink-faint/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    All Prompts-এ যান
                  </button>
                }
              />
            ) : activeView === 'tags' ? (
              <TagsPanel
                prompts={prompts}
                onNavigate={(target) => changeView(target)}
                onOpen={(target) => setModal({ mode: 'edit', prompt: target })}
                onDuplicate={handleDuplicate}
                onDelete={handleDelete}
                onToggleFavorite={handleToggleFavorite}
              />
            ) : activeView === 'templates' ? (
              <PlaceholderPanel
                icon={Library}
                title="Templates is on the way."
                description="এই অংশটা এখনো বানানো হচ্ছে। আপনার সব প্রম্পট এখন All Prompts-এ পাবেন।"
                action={
                  <button
                    type="button"
                    onClick={() => changeView(null)}
                    className="inline-flex h-9 items-center rounded-lg border border-line bg-surface px-3.5 text-[13px] font-medium text-ink transition-colors hover:border-ink-faint/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    All Prompts-এ যান
                  </button>
                }
              />
            ) : activeView === 'archived' ? (
              <ArchivedPanel onNavigate={(target) => changeView(target)} />
            ) : activeView === 'settings' ? (
              <PlaceholderPanel
                icon={Library}
                title="Settings is on the way."
                description="এই অংশটা এখনো বানানো হচ্ছে। আপনার সব প্রম্পট এখন All Prompts-এ পাবেন।"
                action={
                  <button
                    type="button"
                    onClick={() => changeView(null)}
                    className="inline-flex h-9 items-center rounded-lg border border-line bg-surface px-3.5 text-[13px] font-medium text-ink transition-colors hover:border-ink-faint/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    All Prompts-এ যান
                  </button>
                }
              />
            ) : activeView === 'analytics' ? (
              <ProGate
               gate="hard"
               title="Analytics"
                description="এই ফিচারটা Pro প্ল্যানের সাথে খোলে।"
                onUpgrade={() => changeView('sync')}
              >
                <PlaceholderPanel
                  icon={Library}
                  title="Analytics is on the way."
                  description="এই অংশটা এখনো বানানো হচ্ছে। আপনার সব প্রম্পট এখন All Prompts-এ পাবেন।"
                  badge="pro"
                />
              </ProGate>
            ) : activeView === 'enhancer' ? (
              <ProGate
                gate="soft"
                title="Prompt Enhancer"
                description="AI দিয়ে প্রম্পট লেখা ও উন্নত করার টুল শীঘ্রই আসছে।"
                onUpgrade={() => changeView('sync')}
              >
                <PlaceholderPanel
                  icon={Library}
                  title="Prompt Enhancer is on the way."
                  description="AI দিয়ে প্রম্পট লেখা ও উন্নত করার টুল শীঘ্রই আসছে।"
                  badge="pro"
                />
              </ProGate>
            ) : activeView === 'generator' ? (
              <ProGate
                gate="soft"
                title="Prompt Generator"
                description="AI দিয়ে প্রম্পট লেখা ও উন্নত করার টুল শীঘ্রই আসছে।"
                onUpgrade={() => changeView('sync')}
              >
                <PlaceholderPanel
                  icon={Library}
                  title="Prompt Generator is on the way."
                  description="AI দিয়ে প্রম্পট লেখা ও উন্নত করার টুল শীঘ্রই আসছে।"
                  badge="pro"
                />
              </ProGate>
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

      <footer className="shrink-0 border-t border-line bg-canvas px-6 py-4">
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
          todoCount={todos.length}
          folderCount={data?.storageFolders.length ?? 0}
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
