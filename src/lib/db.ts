import Dexie, { type Table } from 'dexie'
import type { Category, Prompt, Settings, Todo } from './types'
import { nowIso } from './utils'

/* Kept as-is on purpose: renaming the database would orphan every prompt that
   already exists in a user's browser. Only the visible branding changed. */
export const DB_NAME = 'PromptNookDB'

/* Additive only. Version 2 introduces the `todos` store; Dexie upgrades in
   place, so existing prompts, categories and settings are never touched. */
export const DB_VERSION = 2

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
  }
}

export const db = new PromptNookDB()

let seeding: Promise<void> | null = null

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

    const categoryCount = await db.categories.count()
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
