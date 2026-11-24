import { db } from './db'
import { getSyncStatus, syncNow } from './sync'
import { isMergeSuppressed } from './sync-guard'

/**
 * Auto-sync: pushes local library changes to the cloud without the user
 * pressing Sync.
 *
 * Three things keep it safe:
 *  - A debounce, so a burst of edits collapses into one sync.
 *  - A single-flight guard, because syncNow() is a full pull-merge-push and two
 *    overlapping runs would fight over the version and hit the 409 path.
 *  - A status gate, so signed-out, unlicensed, expired and offline users never
 *    trigger a request at all.
 *
 * Failures are deliberately quiet. The manual Sync button in SyncPanel is still
 * the place that reports problems; a background sync that toasts on every save
 * would be worse than no auto-sync.
 */

const DEBOUNCE_MS = 1500

let installed = false
let timer: ReturnType<typeof setTimeout> | null = null
let running = false
let queued = false
let failureLogged = false

async function run(): Promise<void> {
  if (running) {
    queued = true
    return
  }

  if (getSyncStatus() !== 'active') return

  running = true
  try {
    const result = await syncNow()
    if (!result.ok && result.reason !== 'offline' && !failureLogged) {
      failureLogged = true
      console.warn('Auto-sync did not finish:', result.reason, result.message ?? '')
    }
  } catch (error) {
    if (!failureLogged) {
      failureLogged = true
      console.warn('Auto-sync threw:', error)
    }
  } finally {
    running = false
    if (queued) {
      queued = false
      void run()
    }
  }
}

/** Schedules a sync shortly after the last change. Safe to call on every write. */
export function requestAutoSync(): void {
  if (isMergeSuppressed()) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    void run()
  }, DEBOUNCE_MS)
}

/**
 * Installs the table hooks. Idempotent, so React StrictMode double-mounting and
 * a re-render both leave exactly one set of hooks in place.
 */
export function installAutoSync(): void {
  if (installed) return
  installed = true

  const tables = [db.prompts, db.categories, db.todos, db.storageFolders]

  for (const table of tables) {
    table.hook('creating', () => {
      requestAutoSync()
    })
    table.hook('updating', () => {
      requestAutoSync()
    })
    table.hook('deleting', () => {
      requestAutoSync()
    })
  }

  // A sync that failed while offline should catch up when the network returns.
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      requestAutoSync()
    })
  }

  // Catch up on anything left unsynced from a previous session, and pick up
  // changes made on another device.
  requestAutoSync()
}
