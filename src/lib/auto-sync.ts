import { db } from './db'
import { getSnapshot } from './license-store'
import { getSyncStatus, syncNow } from './sync'
import { isMergeSuppressed } from './sync-guard'

/**
 * Auto-sync: keeps the cloud copy current without the user pressing Sync.
 *
 * It fires in two directions:
 *  - PUSH: a local write (save, edit, delete) schedules a sync.
 *  - PULL: the tab regaining focus schedules a sync, so changes made on another
 *    device actually arrive here. Without this, a second device only ever saw
 *    the cloud copy when the user clicked Sync by hand.
 *
 * Guards:
 *  - Debounce, so a burst of edits collapses into one run.
 *  - Single-flight, because syncNow() is a full pull-merge-push and overlapping
 *    runs would fight over the version and hit the 409 path.
 *  - A status gate, so signed-out, unlicensed and expired users never make a
 *    request. Crucially the gate RETRIES while the license is still loading
 *    instead of dropping the change: on a fresh page load the license arrives
 *    after the first save, and silently discarding that save is why auto-sync
 *    looked broken while the manual button worked.
 */

const DEBOUNCE_MS = 1500
const RETRY_MS = 4000
const MAX_RETRIES = 8
/** Don't re-pull on every focus event; a tab switch is not a reason to refetch. */
const FOCUS_MIN_INTERVAL_MS = 30_000

let installed = false
let timer: ReturnType<typeof setTimeout> | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let retryCount = 0
let running = false
let queued = false
let failureLogged = false
let lastRunAt = 0

function clearRetry(): void {
  retryCount = 0
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
}

/** The license is still in flight, so try again shortly rather than losing the change. */
function scheduleRetry(): void {
  if (retryTimer) return
  if (retryCount >= MAX_RETRIES) return

  retryCount += 1
  retryTimer = setTimeout(() => {
    retryTimer = null
    void run()
  }, RETRY_MS * retryCount)
}

async function run(): Promise<void> {
  if (running) {
    queued = true
    return
  }

  const { user, license, loading } = getSnapshot()

  // The auth/license bootstrap has not finished. This covers a fresh page load
  // where both `user` and `license` are still null: retry rather than drop.
  if (loading) {
    scheduleRetry()
    return
  }

  // Settled, and nobody is signed in. Nothing to sync and no point retrying.
  if (!user) {
    clearRetry()
    return
  }

  // Signed in but the license object never arrived (a failed /api/license).
  if (!license) {
    scheduleRetry()
    return
  }

  const status = getSyncStatus()
  if (status !== 'active') {
    // A real, settled answer: pending, expired, no_license, offline.
    clearRetry()
    return
  }

  running = true
  try {
    const result = await syncNow()
    if (result.ok) {
      clearRetry()
      failureLogged = false
      lastRunAt = Date.now()
    } else if (result.reason === 'offline') {
      // The online listener will pick this back up.
      clearRetry()
    } else {
      clearRetry()
      if (!failureLogged) {
        failureLogged = true
        console.warn('Auto-sync did not finish:', result.reason, result.message ?? '')
      }
    }
  } catch (error) {
    clearRetry()
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

/** Pull path: used when the tab becomes visible again. */
function requestPull(): void {
  if (Date.now() - lastRunAt < FOCUS_MIN_INTERVAL_MS) return
  requestAutoSync()
}

/**
 * Installs the table hooks and the pull triggers. Idempotent, so React
 * StrictMode double-mounting and a re-render both leave one set in place.
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

  if (typeof window !== 'undefined') {
    // Back online after being offline.
    window.addEventListener('online', () => {
      clearRetry()
      requestAutoSync()
    })

    // Another device may have changed the library while this tab was hidden.
    window.addEventListener('focus', requestPull)

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') requestPull()
      })
    }
  }

  // Catch up on anything left unsynced, and pull anything new.
  requestAutoSync()
}
