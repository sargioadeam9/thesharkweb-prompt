import Dexie, { type Table } from 'dexie'
import type { Category, Prompt, Settings, StorageFolder, Todo } from './types.ts'
import { nowIso } from './utils.ts'

/* Kept as-is on purpose: renaming the database would orphan every prompt that
   already exists in a user's browser. Only the visible branding changed. */
export const DB_NAME = 'PromptNookDB'

/* Additive only. Version 2 introduces the `todos` store; version 3 the
   `storageFolders` store. Dexie upgrades in place, so existing data is untouched. */
export const DB_VERSION = 3

export const DEFAULT_CATEGORY_SEEDS = [
  { id: 'cat-image-gen', name: 'Image Generation' },
  { id: 'cat-video-gen', name: 'Video Generation' },
  { id: 'cat-landing-page', name: 'Landing Page' },
  { id: 'cat-vibe-coding', name: 'Vibe Coding' },
] as const

class PromptNookDB extends Dexie {
  prompts!: Table<Prompt, string>
  categories!: Table<Category, string>
  settings!: Table<Settings, string>
  todos!: Table<Todo, string>
  storageFolders!: Table<StorageFolder, string>

  constructor() {
    super(DB_NAME)

    /* Never edit this block: it is the schema every existing user already has. */
    this.version(1).stores({
      prompts: 'id, categoryId, updatedAt, createdAt, title',
      categories: 'id, &name, updatedAt',
      settings: 'id',
    })

    /* Only the new store is declared here. `done` is deliberately not indexed
       because IndexedDB keys cannot be booleans. */
    this.version(2).stores({
      todos: 'id, dueDate, createdAt, updatedAt',
    })

    /* Version 3: link folders for the Storage tab. */
    this.version(3).stores({
      storageFolders: 'id, createdAt, updatedAt',
    })
  }
}

export const db = new PromptNookDB()

let seeding: Promise<void> | null = null
let afterSeedHook: (() => Promise<void>) | null = null

export function setAfterSeedHook(hook: () => Promise<void>): void {
  afterSeedHook = hook
}

async function seed(): Promise<void> {
  const now = nowIso()

  await db.transaction('rw', db.settings, db.categories, async () => {
    const settings = await db.settings.get('app')

    if (!settings) {
      await db.settings.add({
        id: 'app',
        schemaVersion: 1,
        sortBy: 'updatedAt',
        sortDirection: 'desc',
        categoriesInitialized: true,
      })
    }

    const categoryCount = await db.categories.filter((cat) => !cat.deletedAt).count()
    if (categoryCount > 0) return

    await db.categories.bulkAdd(
      DEFAULT_CATEGORY_SEEDS.map((category) => ({
        ...category,
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      })),
    )
  })

  if (afterSeedHook) {
    try {
      await afterSeedHook()
    } catch (err) {
      console.error('After seed hook error:', err)
    }
  }
}

/** Idempotent. Safe to call on every app start and in React StrictMode. */
export function ensureSeeded(): Promise<void> {
  if (!seeding) {
    seeding = seed().catch((error: unknown) => {
      seeding = null
      throw error
    })
  }

  return seeding
}

/** Lets resetAll() seed again from a clean database. */
export function resetSeeding(): void {
  seeding = null
}
