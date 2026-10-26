import Dexie, { type Table } from 'dexie'
import type { Category, Prompt, Settings } from './types'
import { nowIso } from './utils'

export const DB_NAME = 'PromptNookDB'
export const DB_VERSION = 1

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

  constructor() {
    super(DB_NAME)

    this.version(DB_VERSION).stores({
      prompts: 'id, categoryId, updatedAt, createdAt, title',
      categories: 'id, &name, updatedAt',
      settings: 'id',
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
