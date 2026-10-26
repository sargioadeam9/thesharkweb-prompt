import { db, DEFAULT_CATEGORY_SEEDS, ensureSeeded, resetSeeding } from './db'
import { clearDraft } from './draft'
import type {
  BackupFile,
  Category,
  CategoryDeleteOptions,
  ImportMode,
  ImportResult,
  Prompt,
  PromptInput,
  Settings,
  SortDirection,
  SortField,
} from './types'
import { nowIso, sortCategories, uid } from './utils'

const SORT_FIELDS: SortField[] = ['updatedAt', 'createdAt', 'title']
const SORT_DIRECTIONS: SortDirection[] = ['asc', 'desc']

function defaultSettings(): Settings {
  return {
    id: 'app',
    schemaVersion: 1,
    sortBy: 'updatedAt',
    sortDirection: 'desc',
    categoriesInitialized: true,
  }
}

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return []

  const seen = new Set<string>()
  for (const tag of tags) {
    if (typeof tag !== 'string') continue
    const trimmed = tag.trim()
    if (!trimmed) continue
    seen.add(trimmed)
  }

  return [...seen]
}

function requireText(value: unknown, field: string, max = 4000): string {
  if (typeof value !== 'string') throw new Error(`${field} must be text`)
  const trimmed = value.trim()
  if (!trimmed) throw new Error(`${field} is required`)
  if (trimmed.length > max) throw new Error(`${field} is too long`)
  return trimmed
}

/* ---------------------------------- prompts --------------------------------- */

export async function listPrompts(): Promise<Prompt[]> {
  return db.prompts.toArray()
}

export async function getPrompt(id: string): Promise<Prompt | undefined> {
  return db.prompts.get(id)
}

export async function createPrompt(input: PromptInput): Promise<Prompt> {
  const title = requireText(input.title, 'Title', 200)
  const content = requireText(input.content, 'Prompt content', 20000)
  const category = await db.categories.get(input.categoryId)
  if (!category) throw new Error('Select a valid category')

  const timestamp = nowIso()
  const prompt: Prompt = {
    id: uid(),
    title,
    content,
    categoryId: input.categoryId,
    notes: input.notes?.trim() || undefined,
    tags: normalizeTags(input.tags),
    isFavorite: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  await db.prompts.add(prompt)
  return prompt
}

export async function updatePrompt(
  id: string,
  patch: Partial<PromptInput> & { isFavorite?: boolean },
): Promise<Prompt> {
  const existing = await db.prompts.get(id)
  if (!existing) throw new Error('Prompt not found')

  const next: Prompt = { ...existing }

  if (patch.title !== undefined) next.title = requireText(patch.title, 'Title', 200)
  if (patch.content !== undefined) next.content = requireText(patch.content, 'Prompt content', 20000)
  if (patch.notes !== undefined) next.notes = patch.notes.trim() || undefined
  if (patch.tags !== undefined) next.tags = normalizeTags(patch.tags)
  if (patch.isFavorite !== undefined) next.isFavorite = patch.isFavorite

  if (patch.categoryId !== undefined && patch.categoryId !== existing.categoryId) {
    const category = await db.categories.get(patch.categoryId)
    if (!category) throw new Error('Select a valid category')
    next.categoryId = patch.categoryId
  }

  next.updatedAt = nowIso()
  await db.prompts.put(next)
  return next
}

export async function deletePrompt(id: string): Promise<void> {
  await db.prompts.delete(id)
}

/** Puts a deleted prompt back, id and timestamps included, for the undo toast. */
export async function restorePrompt(prompt: Prompt): Promise<void> {
  await db.prompts.put(prompt)
}

export async function duplicatePrompt(id: string): Promise<Prompt> {
  const existing = await db.prompts.get(id)
  if (!existing) throw new Error('Prompt not found')

  const timestamp = nowIso()
  const copy: Prompt = {
    ...existing,
    id: uid(),
    title: `${existing.title} (copy)`.slice(0, 200),
    isFavorite: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  await db.prompts.add(copy)
  return copy
}

/** Favourite is metadata, not an edit, so updatedAt is left alone on purpose. */
export async function toggleFavorite(id: string): Promise<Prompt> {
  const existing = await db.prompts.get(id)
  if (!existing) throw new Error('Prompt not found')

  const next: Prompt = { ...existing, isFavorite: !existing.isFavorite }
  await db.prompts.put(next)
  return next
}

/* -------------------------------- categories -------------------------------- */

export async function listCategories(): Promise<Category[]> {
  return sortCategories(await db.categories.toArray())
}

export async function createCategory(name: string, color?: string): Promise<Category> {
  const trimmed = requireText(name, 'Category name', 40)

  const clash = await db.categories.where('name').equalsIgnoreCase(trimmed).first()
  if (clash) throw new Error(`A category named "${trimmed}" already exists`)

  const timestamp = nowIso()
  const category: Category = {
    id: uid(),
    name: trimmed,
    color,
    isDefault: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  await db.categories.add(category)
  return category
}

export async function renameCategory(id: string, name: string): Promise<Category> {
  const existing = await db.categories.get(id)
  if (!existing) throw new Error('Category not found')

  const trimmed = requireText(name, 'Category name', 40)
  const clash = await db.categories.where('name').equalsIgnoreCase(trimmed).first()
  if (clash && clash.id !== id) throw new Error(`A category named "${trimmed}" already exists`)

  const next: Category = { ...existing, name: trimmed, updatedAt: nowIso() }
  await db.categories.put(next)
  return next
}

export async function deleteCategory(
  id: string,
  options: CategoryDeleteOptions,
): Promise<{ moved: number; deleted: number }> {
  const existing = await db.categories.get(id)
  if (!existing) throw new Error('Category not found')
  if ((await db.categories.count()) <= 1) {
    throw new Error('Keep at least one category')
  }

  let moved = 0
  let deleted = 0

  await db.transaction('rw', db.prompts, db.categories, async () => {
    const affected = await db.prompts.where('categoryId').equals(id).toArray()

    if (options.mode === 'move' && affected.length) {
      if (options.targetId === id) throw new Error('Pick a different target category')
      const target = await db.categories.get(options.targetId)
      if (!target) throw new Error('Target category not found')

      const timestamp = nowIso()
      await db.prompts.bulkPut(
        affected.map((prompt) => ({ ...prompt, categoryId: target.id, updatedAt: timestamp })),
      )
      moved = affected.length
    }

    if (options.mode === 'delete' && affected.length) {
      await db.prompts.bulkDelete(affected.map((prompt) => prompt.id))
      deleted = affected.length
    }

    await db.categories.delete(id)
  })

  return { moved, deleted }
}

/* --------------------------------- settings --------------------------------- */

export async function getSettings(): Promise<Settings> {
  return (await db.settings.get('app')) ?? defaultSettings()
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings()
  const next: Settings = { ...current, ...patch, id: 'app', schemaVersion: 1 }

  if (!SORT_FIELDS.includes(next.sortBy)) next.sortBy = current.sortBy
  if (!SORT_DIRECTIONS.includes(next.sortDirection)) next.sortDirection = current.sortDirection

  await db.settings.put(next)
  return next
}

/* ------------------------------ backup / import ----------------------------- */

export async function exportBackup(): Promise<BackupFile> {
  const [prompts, categories, settings] = await Promise.all([
    db.prompts.toArray(),
    db.categories.toArray(),
    getSettings(),
  ])

  const exportedAt = nowIso()
  await db.settings.put({ ...settings, lastBackupAt: exportedAt })

  return {
    app: 'TheSharkWebPrompt',
    formatVersion: 1,
    exportedAt,
    prompts,
    categories,
    settings: {
      sortBy: settings.sortBy,
      sortDirection: settings.sortDirection,
      lastBackupAt: exportedAt,
      backupReminderDismissed: settings.backupReminderDismissed,
    },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireIsoDate(value: unknown, field: string): string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new Error(`${field} must be a valid date`)
  }
  return value
}

/** Throws a readable message on the first problem found. */
export function parseBackup(raw: unknown): BackupFile {
  if (!isRecord(raw)) throw new Error('Invalid backup: root must be an object')

  // 'PromptNook' is the pre-rename marker, still accepted so old files import.
  const knownApp = raw.app === 'TheSharkWebPrompt' || raw.app === 'PromptNook'
  if (raw.app !== undefined && !knownApp) {
    throw new Error('Invalid backup: not a TheSharkWebPrompt file')
  }
  if (raw.formatVersion !== 1) throw new Error('Invalid backup: unsupported format version')
  requireIsoDate(raw.exportedAt, 'exportedAt')
  if (!Array.isArray(raw.prompts)) throw new Error('Invalid backup: prompts must be an array')
  if (!Array.isArray(raw.categories)) throw new Error('Invalid backup: categories must be an array')

  const categories: Category[] = raw.categories.map((entry, index) => {
    if (!isRecord(entry)) throw new Error(`Invalid category at position ${index + 1}`)
    return {
      id: requireText(entry.id, `Category ${index + 1} id`, 200),
      name: requireText(entry.name, `Category ${index + 1} name`, 40),
      color: typeof entry.color === 'string' ? entry.color : undefined,
      isDefault: entry.isDefault === true,
      createdAt: requireIsoDate(entry.createdAt, `Category ${index + 1} createdAt`),
      updatedAt: requireIsoDate(entry.updatedAt, `Category ${index + 1} updatedAt`),
    }
  })

  const categoryIds = new Set(categories.map((category) => category.id))

  const prompts: Prompt[] = raw.prompts.map((entry, index) => {
    if (!isRecord(entry)) throw new Error(`Invalid prompt at position ${index + 1}`)
    const categoryId = requireText(entry.categoryId, `Prompt ${index + 1} categoryId`, 200)
    if (!categoryIds.has(categoryId)) {
      throw new Error(`Prompt ${index + 1} points at a category that is not in the file`)
    }

    return {
      id: requireText(entry.id, `Prompt ${index + 1} id`, 200),
      title: requireText(entry.title, `Prompt ${index + 1} title`, 200),
      content: requireText(entry.content, `Prompt ${index + 1} content`, 20000),
      categoryId,
      notes: typeof entry.notes === 'string' ? entry.notes : undefined,
      tags: normalizeTags(entry.tags),
      isFavorite: entry.isFavorite === true,
      createdAt: requireIsoDate(entry.createdAt, `Prompt ${index + 1} createdAt`),
      updatedAt: requireIsoDate(entry.updatedAt, `Prompt ${index + 1} updatedAt`),
    }
  })

  const settings = isRecord(raw.settings) ? raw.settings : {}
  const sortBy = SORT_FIELDS.includes(settings.sortBy as SortField)
    ? (settings.sortBy as SortField)
    : 'updatedAt'
  const sortDirection = SORT_DIRECTIONS.includes(settings.sortDirection as SortDirection)
    ? (settings.sortDirection as SortDirection)
    : 'desc'

  return {
    app: 'TheSharkWebPrompt',
    formatVersion: 1,
    exportedAt: raw.exportedAt as string,
    prompts,
    categories,
    settings: {
      sortBy,
      sortDirection,
      lastBackupAt:
        typeof settings.lastBackupAt === 'string' ? settings.lastBackupAt : undefined,
      backupReminderDismissed:
        typeof settings.backupReminderDismissed === 'boolean'
          ? settings.backupReminderDismissed
          : undefined,
    },
  }
}

export async function importBackup(raw: unknown, mode: ImportMode): Promise<ImportResult> {
  let backup: BackupFile
  try {
    backup = parseBackup(raw)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Invalid backup file' }
  }

  try {
    await db.transaction('rw', db.prompts, db.categories, db.settings, async () => {
      if (mode === 'replace') {
        await db.prompts.clear()
        await db.categories.clear()
        await db.categories.bulkAdd(backup.categories)
        await db.prompts.bulkAdd(backup.prompts)
      } else {
        const idMap = new Map<string, string>()
        const existingCategories = await db.categories.toArray()
        const byName = new Map(
          existingCategories.map((category) => [category.name.toLowerCase(), category]),
        )

        for (const category of backup.categories) {
          if (existingCategories.some((existing) => existing.id === category.id)) {
            idMap.set(category.id, category.id)
            continue
          }

          const nameClash = byName.get(category.name.toLowerCase())
          if (nameClash) {
            idMap.set(category.id, nameClash.id)
            continue
          }

          await db.categories.add(category)
          byName.set(category.name.toLowerCase(), category)
          idMap.set(category.id, category.id)
        }

        const existingPromptIds = new Set((await db.prompts.toArray()).map((prompt) => prompt.id))

        const toAdd = backup.prompts.map((prompt) => {
          const categoryId = idMap.get(prompt.categoryId) ?? prompt.categoryId
          const id = existingPromptIds.has(prompt.id) ? uid() : prompt.id
          existingPromptIds.add(id)
          return { ...prompt, id, categoryId }
        })

        await db.prompts.bulkAdd(toAdd)
      }

      const current = (await db.settings.get('app')) ?? defaultSettings()
      await db.settings.put({
        ...current,
        sortBy: backup.settings.sortBy,
        sortDirection: backup.settings.sortDirection,
        lastBackupAt: backup.settings.lastBackupAt ?? current.lastBackupAt,
        backupReminderDismissed:
          backup.settings.backupReminderDismissed ?? current.backupReminderDismissed,
      })
    })
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Import failed, stored data was not modified',
    }
  }

  return { ok: true, prompts: backup.prompts.length, categories: backup.categories.length }
}

export async function resetAll(): Promise<void> {
  await db.transaction('rw', db.prompts, db.categories, db.settings, async () => {
    await db.prompts.clear()
    await db.categories.clear()
    await db.settings.clear()
  })

  // A half-written prompt in sessionStorage is part of the old library too.
  clearDraft()
  resetSeeding()
  await ensureSeeded()
}

/** Re-exported so the UI can show the locked default categories. */
export const defaultCategories = DEFAULT_CATEGORY_SEEDS
