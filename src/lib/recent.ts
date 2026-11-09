import { useSyncExternalStore } from 'react'

/******************************************************************************\
  recent.ts — copy tracking for the "Recently Used" page.

  Deliberately does NOT touch IndexedDB. The Dexie schema is frozen, so
  per-copy recency and copy counts live in localStorage keyed by prompt id.
  Everything here degrades gracefully: if localStorage is unavailable or the
  stored payload is corrupt, we fall back to an empty map and the page simply
  orders by updatedAt instead.

  The map is cached in module scope so useSyncExternalStore gets a stable
  snapshot reference between writes.
\* **************************************************************************/

const STORAGE_KEY = 'thesharkwebprompt:recent:v1'

/** Cap so a long-lived library cannot grow the payload without bound. */
const MAX_ENTRIES = 500

export type RecentEntry = {
  count: number
  lastUsedAt: string
}

export type RecentMap = Record<string, RecentEntry>

const EMPTY: RecentMap = {}

let cache: RecentMap = EMPTY
let loaded = false
const listeners = new Set<() => void>()

function isEntry(value: unknown): value is RecentEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.count === 'number' &&
    Number.isFinite(entry.count) &&
    entry.count >= 0 &&
    typeof entry.lastUsedAt === 'string'
  )
}

function parse(raw: string | null): RecentMap {
  if (!raw) return EMPTY

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return EMPTY

    const next: RecentMap = {}
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!id || !isEntry(value)) continue
      next[id] = { count: Math.floor(value.count), lastUsedAt: value.lastUsedAt }
    }

    return Object.keys(next).length ? next : EMPTY
  } catch {
    return EMPTY
  }
}

function load(): RecentMap {
  if (loaded) return cache
  loaded = true

  try {
    cache = parse(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    cache = EMPTY
  }

  return cache
}

function emit(): void {
  for (const listener of listeners) listener()
}

function persist(next: RecentMap): void {
  cache = next

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Private mode or a full quota: keep the in-memory copy so this session works.
  }

  emit()
}

export function getRecentSnapshot(): RecentMap {
  return load()
}

export function subscribeRecent(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Keeps two open tabs consistent without polling. */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return
    cache = parse(event.newValue)
    loaded = true
    emit()
  })
}

/** Called after a successful copy. Safe to call from anywhere. */
export function recordCopy(promptId: string, at: string = new Date().toISOString()): void {
  if (!promptId) return

  const current = load()
  const previous = current[promptId]
  const next: RecentMap = {
    ...current,
    [promptId]: { count: (previous?.count ?? 0) + 1, lastUsedAt: at },
  }

  const ids = Object.keys(next)
  if (ids.length > MAX_ENTRIES) {
    ids.sort((a, b) => Date.parse(next[a].lastUsedAt) - Date.parse(next[b].lastUsedAt))
    for (const id of ids.slice(0, ids.length - MAX_ENTRIES)) delete next[id]
  }

  persist(next)
}

export function copyCountFor(promptId: string): number {
  return load()[promptId]?.count ?? 0
}

export function lastUsedAtFor(promptId: string): string | undefined {
  return load()[promptId]?.lastUsedAt
}

/**
 * Recency = the later of "last copied" and "last edited". A copy bumps a
 * prompt to the top, and so does an edit, which is what the page promises.
 */
export function recencyOf(prompt: { id: string; updatedAt: string }): number {
  const used = load()[prompt.id]?.lastUsedAt
  const usedMs = used ? Date.parse(used) : Number.NaN
  const updatedMs = Date.parse(prompt.updatedAt)

  const best = Number.isFinite(usedMs)
    ? Math.max(usedMs, Number.isFinite(updatedMs) ? updatedMs : 0)
    : updatedMs

  return Number.isFinite(best) ? best : 0
}

export function sortByRecency<T extends { id: string; updatedAt: string }>(prompts: T[]): T[] {
  return [...prompts].sort((a, b) => recencyOf(b) - recencyOf(a))
}

export function useRecentMap(): RecentMap {
  return useSyncExternalStore(subscribeRecent, getRecentSnapshot, getRecentSnapshot)
}
