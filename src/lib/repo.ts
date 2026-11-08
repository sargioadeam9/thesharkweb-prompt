import { db, DEFAULT_CATEGORY_SEEDS, ensureSeeded, resetSeeding, setAfterSeedHook } from './db.ts'
import { clearDraft } from './draft.ts'
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
  StorageFolder,
  StorageFolderInput,
  Todo,
  TodoInput,
} from './types.ts'
import { nowIso, sortCategories, uid } from './utils.ts'

const SORT_FIELDS: SortField[] = ['updatedAt', 'createdAt', 'title']
const SORT_DIRECTIONS: SortDirection[] = ['asc', 'desc']
const DUE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

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
  return db.prompts.filter((prompt) => !prompt.deletedAt).toArray()
}

export async function getPrompt(id: string): Promise<Prompt | undefined> {
  const prompt = await db.prompts.get(id)
  return prompt && !prompt.deletedAt ? prompt : undefined
}

export async function createPrompt(input: PromptInput): Promise<Prompt> {
  const title = requireText(input.title, 'Title', 200)
  const content = requireText(input.content, 'Prompt content', 20000)
  const category = await db.categories.get(input.categoryId)
  if (!category || category.deletedAt) throw new Error('Select a valid category')

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
  const existing = await getPrompt(id)
  if (!existing) throw new Error('Prompt not found')

  const next: Prompt = { ...existing }

  if (patch.title !== undefined) next.title = requireText(patch.title, 'Title', 200)
  if (patch.content !== undefined) next.content = requireText(patch.content, 'Prompt content', 20000)
  if (patch.notes !== undefined) next.notes = patch.notes.trim() || undefined
  if (patch.tags !== undefined) next.tags = normalizeTags(patch.tags)
  if (patch.isFavorite !== undefined) next.isFavorite = patch.isFavorite

  if (patch.categoryId !== undefined && patch.categoryId !== existing.categoryId) {
    const category = await db.categories.get(patch.categoryId)
    if (!category || category.deletedAt) throw new Error('Select a valid category')
    next.categoryId = patch.categoryId
  }

  next.updatedAt = nowIso()
  await db.prompts.put(next)
  return next
}

export async function deletePrompt(id: string): Promise<void> {
  const existing = await db.prompts.get(id)
  if (!existing) return
  const timestamp = nowIso()
  await db.prompts.put({ ...existing, deletedAt: timestamp, updatedAt: timestamp })
}

/** Puts a deleted prompt back, id and timestamps included, for the undo toast. */
export async function restorePrompt(prompt: Prompt): Promise<void> {
  const timestamp = nowIso()
  const next: Prompt = { ...prompt, updatedAt: timestamp }
  delete next.deletedAt
  await db.prompts.put(next)
}

export async function duplicatePrompt(id: string): Promise<Prompt> {
  const existing = await getPrompt(id)
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
  delete copy.deletedAt

  await db.prompts.add(copy)
  return copy
}

/** Favourite is metadata, not an edit, so updatedAt is left alone on purpose. */
export async function toggleFavorite(id: string): Promise<Prompt> {
  const existing = await getPrompt(id)
  if (!existing) throw new Error('Prompt not found')

  const next: Prompt = { ...existing, isFavorite: !existing.isFavorite }
  await db.prompts.put(next)
  return next
}

/* -------------------------------- categories -------------------------------- */

export async function listCategories(): Promise<Category[]> {
  const live = await db.categories.filter((category) => !category.deletedAt).toArray()
  return sortCategories(live)
}

export async function createCategory(name: string, color?: string): Promise<Category> {
  const trimmed = requireText(name, 'Category name', 40)

  const clash = await db.categories.where('name').equalsIgnoreCase(trimmed).first()
  if (clash && !clash.deletedAt) throw new Error(`A category named "${trimmed}" already exists`)

  const timestamp = nowIso()
  if (clash && clash.deletedAt) {
    const revived: Category = {
      ...clash,
      color,
      updatedAt: timestamp,
    }
    delete revived.deletedAt
    await db.categories.put(revived)
    return revived
  }

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
  if (!existing || existing.deletedAt) throw new Error('Category not found')

  const trimmed = requireText(name, 'Category name', 40)
  const clash = await db.categories.where('name').equalsIgnoreCase(trimmed).first()
  if (clash && clash.id !== id && !clash.deletedAt) throw new Error(`A category named "${trimmed}" already exists`)

  const next: Category = { ...existing, name: trimmed, updatedAt: nowIso() }
  await db.categories.put(next)
  return next
}

export async function deleteCategory(
  id: string,
  options: CategoryDeleteOptions,
): Promise<{ moved: number; deleted: number }> {
  const existing = await db.categories.get(id)
  if (!existing || existing.deletedAt) throw new Error('Category not found')
  const liveCount = await db.categories.filter((c) => !c.deletedAt).count()
  if (liveCount <= 1) {
    throw new Error('Keep at least one category')
  }

  let moved = 0
  let deleted = 0

  await db.transaction('rw', db.prompts, db.categories, async () => {
    const affected = await db.prompts
      .filter((prompt) => prompt.categoryId === id && !prompt.deletedAt)
      .toArray()

    const timestamp = nowIso()

    if (options.mode === 'move' && affected.length) {
      if (options.targetId === id) throw new Error('Pick a different target category')
      const target = await db.categories.get(options.targetId)
      if (!target || target.deletedAt) throw new Error('Target category not found')

      await db.prompts.bulkPut(
        affected.map((prompt) => ({ ...prompt, categoryId: target.id, updatedAt: timestamp })),
      )
      moved = affected.length
    }

    if (options.mode === 'delete' && affected.length) {
      await db.prompts.bulkPut(
        affected.map((prompt) => ({ ...prompt, deletedAt: timestamp, updatedAt: timestamp })),
      )
      deleted = affected.length
    }

    await db.categories.put({
      ...existing,
      deletedAt: timestamp,
      updatedAt: timestamp,
    })
  })

  return { moved, deleted }
}

/* ----------------------------------- todos ---------------------------------- */

function normalizeDueDate(value: unknown): string | undefined {
  return typeof value === 'string' && DUE_DATE_PATTERN.test(value) ? value : undefined
}

export async function listTodos(): Promise<Todo[]> {
  return db.todos.filter((todo) => !todo.deletedAt).toArray()
}

export async function createTodo(input: TodoInput): Promise<Todo> {
  const title = requireText(input.title, 'Task', 200)
  const timestamp = nowIso()

  const todo: Todo = {
    id: uid(),
    title,
    done: false,
    dueDate: normalizeDueDate(input.dueDate),
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  await db.todos.add(todo)
  return todo
}

export async function toggleTodo(id: string): Promise<Todo> {
  const existing = await db.todos.get(id)
  if (!existing || existing.deletedAt) throw new Error('Task not found')

  const next: Todo = { ...existing, done: !existing.done, updatedAt: nowIso() }
  await db.todos.put(next)
  return next
}

export async function deleteTodo(id: string): Promise<void> {
  const existing = await db.todos.get(id)
  if (!existing) return
  const timestamp = nowIso()
  await db.todos.put({ ...existing, deletedAt: timestamp, updatedAt: timestamp })
}

/** Puts a deleted task back, id and timestamps included, for the undo toast. */
export async function restoreTodo(todo: Todo): Promise<void> {
  const timestamp = nowIso()
  const next: Todo = { ...todo, updatedAt: timestamp }
  delete next.deletedAt
  await db.todos.put(next)
}

export async function clearCompletedTodos(): Promise<number> {
  const completed = await db.todos.filter((todo) => todo.done && !todo.deletedAt).toArray()
  if (!completed.length) return 0

  const timestamp = nowIso()
  await db.todos.bulkPut(
    completed.map((todo) => ({
      ...todo,
      deletedAt: timestamp,
      updatedAt: timestamp,
    })),
  )
  return completed.length
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

/* ------------------------------ storage folders ------------------------------ */

function normalizeFolderUrl(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Folder link must be text')
  let raw = value.trim()
  if (!raw) throw new Error('Folder link is required')
  if (raw.length > 2000) throw new Error('Folder link is too long')
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = `https://${raw}`
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error('That does not look like a link')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http and https links are allowed')
  }
  return parsed.toString()
}

export async function listStorageFolders(): Promise<StorageFolder[]> {
  return db.storageFolders.filter((folder) => !folder.deletedAt).toArray()
}

export async function createStorageFolder(input: StorageFolderInput): Promise<StorageFolder> {
  const name = requireText(input.name, 'Folder name', 120)
  const url = normalizeFolderUrl(input.url)
  const timestamp = nowIso()

  const folder: StorageFolder = {
    id: uid(),
    name,
    url,
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  await db.storageFolders.add(folder)
  return folder
}

export async function deleteStorageFolder(id: string): Promise<void> {
  const existing = await db.storageFolders.get(id)
  if (!existing) return
  const timestamp = nowIso()
  await db.storageFolders.put({ ...existing, deletedAt: timestamp, updatedAt: timestamp })
}

/** Puts a deleted folder back, id and timestamps included, for the undo toast. */
export async function restoreStorageFolder(folder: StorageFolder): Promise<void> {
  const timestamp = nowIso()
  const next: StorageFolder = { ...folder, updatedAt: timestamp }
  delete next.deletedAt
  await db.storageFolders.put(next)
}

/* ------------------------------ backup / import ----------------------------- */

export async function exportBackup(options: { stamp?: boolean } = {}): Promise<BackupFile> {
  const [rawPrompts, rawCategories, rawTodos, rawStorageFolders, settings] = await Promise.all([
    db.prompts.filter((p) => !p.deletedAt).toArray(),
    db.categories.filter((c) => !c.deletedAt).toArray(),
    db.todos.filter((t) => !t.deletedAt).toArray(),
    db.storageFolders.filter((f) => !f.deletedAt).toArray(),
    getSettings(),
  ])

  const prompts: Prompt[] = rawPrompts.map((p) => {
    const copy = { ...p }
    delete copy.deletedAt
    return copy
  })
  const categories: Category[] = rawCategories.map((c) => {
    const copy = { ...c }
    delete copy.deletedAt
    return copy
  })
  const todos: Todo[] = rawTodos.map((t) => {
    const copy = { ...t }
    delete copy.deletedAt
    return copy
  })
  const storageFolders: StorageFolder[] = rawStorageFolders.map((f) => {
    const copy = { ...f }
    delete copy.deletedAt
    return copy
  })

  const exportedAt = nowIso()
  const stamp = options.stamp ?? true
  if (stamp) await db.settings.put({ ...settings, lastBackupAt: exportedAt })

  return {
    app: 'TheSharkWebPrompt',
    formatVersion: 1,
    exportedAt,
    prompts,
    categories,
    todos,
    storageFolders,
    settings: {
      sortBy: settings.sortBy,
      sortDirection: settings.sortDirection,
      lastBackupAt: stamp ? exportedAt : settings.lastBackupAt,
      backupReminderDismissed: settings.backupReminderDismissed,
    },
  }
}

/**
 * F1: Export for cloud sync — identical to exportBackup({stamp:false}) EXCEPT it keeps
 * records that have deletedAt (and preserves the deletedAt field) so deletes reach the server.
 */
export async function exportSyncPayload(): Promise<BackupFile> {
  const [prompts, categories, todos, storageFolders, settings] = await Promise.all([
    db.prompts.toArray(),
    db.categories.toArray(),
    db.todos.toArray(),
    db.storageFolders.toArray(),
    getSettings(),
  ])

  const exportedAt = nowIso()

  return {
    app: 'TheSharkWebPrompt',
    formatVersion: 1,
    exportedAt,
    prompts,
    categories,
    todos,
    storageFolders,
    settings: {
      sortBy: settings.sortBy,
      sortDirection: settings.sortDirection,
      lastBackupAt: settings.lastBackupAt,
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

/** Older files have no `storageFolders` key, which is treated as an empty list. */
function parseStorageFolders(raw: unknown): StorageFolder[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) throw new Error('Invalid backup: storageFolders must be an array')

  return raw.map((entry, index) => {
    if (!isRecord(entry)) throw new Error(`Invalid folder at position ${index + 1}`)

    return {
      id: requireText(entry.id, `Folder ${index + 1} id`, 200),
      name: requireText(entry.name, `Folder ${index + 1} name`, 120),
      url: normalizeFolderUrl(entry.url),
      deletedAt:
        typeof entry.deletedAt === 'string'
          ? requireIsoDate(entry.deletedAt, `Folder ${index + 1} deletedAt`)
          : undefined,
      createdAt: requireIsoDate(entry.createdAt, `Folder ${index + 1} createdAt`),
      updatedAt: requireIsoDate(entry.updatedAt, `Folder ${index + 1} updatedAt`),
    }
  })
}

/** Older files have no `todos` key, which is treated as an empty list. */
function parseTodos(raw: unknown): Todo[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) throw new Error('Invalid backup: todos must be an array')

  return raw.map((entry, index) => {
    if (!isRecord(entry)) throw new Error(`Invalid task at position ${index + 1}`)

    return {
      id: requireText(entry.id, `Task ${index + 1} id`, 200),
      title: requireText(entry.title, `Task ${index + 1} title`, 200),
      done: entry.done === true,
      dueDate: normalizeDueDate(entry.dueDate),
      deletedAt:
        typeof entry.deletedAt === 'string'
          ? requireIsoDate(entry.deletedAt, `Task ${index + 1} deletedAt`)
          : undefined,
      createdAt: requireIsoDate(entry.createdAt, `Task ${index + 1} createdAt`),
      updatedAt: requireIsoDate(entry.updatedAt, `Task ${index + 1} updatedAt`),
    }
  })
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
      deletedAt:
        typeof entry.deletedAt === 'string'
          ? requireIsoDate(entry.deletedAt, `Category ${index + 1} deletedAt`)
          : undefined,
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
      deletedAt:
        typeof entry.deletedAt === 'string'
          ? requireIsoDate(entry.deletedAt, `Prompt ${index + 1} deletedAt`)
          : undefined,
      createdAt: requireIsoDate(entry.createdAt, `Prompt ${index + 1} createdAt`),
      updatedAt: requireIsoDate(entry.updatedAt, `Prompt ${index + 1} updatedAt`),
    }
  })

  const todos = parseTodos(raw.todos)
  const storageFolders = parseStorageFolders(raw.storageFolders)

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
    todos,
    storageFolders,
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
    await db.transaction('rw', db.prompts, db.categories, db.settings, db.todos, db.storageFolders, async () => {
      if (mode === 'replace') {
        await db.prompts.clear()
        await db.categories.clear()
        await db.todos.clear()
        await db.storageFolders.clear()
        await db.categories.bulkAdd(backup.categories)
        await db.prompts.bulkAdd(backup.prompts)
        if (backup.todos?.length) await db.todos.bulkAdd(backup.todos)
        if (backup.storageFolders?.length) await db.storageFolders.bulkAdd(backup.storageFolders)
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

        const existingTodoIds = new Set((await db.todos.toArray()).map((todo) => todo.id))
        const todosToAdd = (backup.todos ?? []).map((todo) => {
          const id = existingTodoIds.has(todo.id) ? uid() : todo.id
          existingTodoIds.add(id)
          return { ...todo, id }
        })

        if (todosToAdd.length) await db.todos.bulkAdd(todosToAdd)

        const existingFolderIds = new Set(
          (await db.storageFolders.toArray()).map((folder) => folder.id),
        )
        const foldersToAdd = (backup.storageFolders ?? []).map((folder) => {
          const id = existingFolderIds.has(folder.id) ? uid() : folder.id
          existingFolderIds.add(id)
          return { ...folder, id }
        })

        if (foldersToAdd.length) await db.storageFolders.bulkAdd(foldersToAdd)
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

  return {
    ok: true,
    prompts: backup.prompts.length,
    categories: backup.categories.length,
    todos: backup.todos?.length ?? 0,
    folders: backup.storageFolders?.length ?? 0,
  }
}

/**
 * F2: Remote cloud sync merge — preserves exact IDs (no duplicate bug).
 * Compares updatedAt timestamps: remote newer wins; propagates remote tombstones
 * and revives locally tombstoned items when the remote version is newer and live.
 */
export async function mergeFromRemote(
  rawPayload: unknown,
): Promise<{ added: number; updated: number }> {
  const backup = parseBackup(rawPayload)
  let added = 0
  let updated = 0

  await db.transaction('rw', db.prompts, db.categories, db.todos, db.storageFolders, db.settings, async () => {
    // 1. Categories
    const localCategories = new Map(
      (await db.categories.toArray()).map((cat) => [cat.id, cat]),
    )

    for (const remoteCat of backup.categories) {
      const localCat = localCategories.get(remoteCat.id)
      if (!localCat) {
        await db.categories.add(remoteCat)
        localCategories.set(remoteCat.id, remoteCat)
        added++
      } else {
        const remoteTime = new Date(remoteCat.updatedAt).getTime()
        const localTime = new Date(localCat.updatedAt).getTime()
        if (remoteTime > localTime) {
          await db.categories.put(remoteCat)
          localCategories.set(remoteCat.id, remoteCat)
          updated++
        }
      }
    }

    // 2. Prompts
    const localPrompts = new Map(
      (await db.prompts.toArray()).map((prompt) => [prompt.id, prompt]),
    )

    for (const remotePrompt of backup.prompts) {
      const localPrompt = localPrompts.get(remotePrompt.id)
      if (!localPrompt) {
        await db.prompts.add(remotePrompt)
        localPrompts.set(remotePrompt.id, remotePrompt)
        added++
      } else {
        const remoteTime = new Date(remotePrompt.updatedAt).getTime()
        const localTime = new Date(localPrompt.updatedAt).getTime()
        if (remoteTime > localTime) {
          await db.prompts.put(remotePrompt)
          localPrompts.set(remotePrompt.id, remotePrompt)
          updated++
        }
      }
    }

    // 3. Todos
    const localTodos = new Map(
      (await db.todos.toArray()).map((todo) => [todo.id, todo]),
    )

    for (const remoteTodo of backup.todos ?? []) {
      const localTodo = localTodos.get(remoteTodo.id)
      if (!localTodo) {
        await db.todos.add(remoteTodo)
        localTodos.set(remoteTodo.id, remoteTodo)
        added++
      } else {
        const remoteTime = new Date(remoteTodo.updatedAt).getTime()
        const localTime = new Date(localTodo.updatedAt).getTime()
        if (remoteTime > localTime) {
          await db.todos.put(remoteTodo)
          localTodos.set(remoteTodo.id, remoteTodo)
          updated++
        }
      }
    }

    // 4. Storage folders
    const localFolders = new Map(
      (await db.storageFolders.toArray()).map((folder) => [folder.id, folder]),
    )

    for (const remoteFolder of backup.storageFolders ?? []) {
      const localFolder = localFolders.get(remoteFolder.id)
      if (!localFolder) {
        await db.storageFolders.add(remoteFolder)
        localFolders.set(remoteFolder.id, remoteFolder)
        added++
      } else {
        const remoteTime = new Date(remoteFolder.updatedAt).getTime()
        const localTime = new Date(localFolder.updatedAt).getTime()
        if (remoteTime > localTime) {
          await db.storageFolders.put(remoteFolder)
          localFolders.set(remoteFolder.id, remoteFolder)
          updated++
        }
      }
    }
  })

  return { added, updated }
}

/** Wipes everything this origin stores, database included. The caller reloads after. */
export async function hardReset(): Promise<void> {
  clearDraft()
  db.close()
  await db.delete()

  try {
    window.localStorage.clear()
  } catch {
    // Storage can be blocked, the database is already gone.
  }

  if (typeof caches !== 'undefined') {
    const keys = await caches.keys()
    await Promise.all(keys.map((key) => caches.delete(key)))
  }
}

export async function resetAll(): Promise<void> {
  await db.transaction('rw', db.prompts, db.categories, db.settings, db.todos, db.storageFolders, async () => {
    await db.prompts.clear()
    await db.categories.clear()
    await db.settings.clear()
    await db.todos.clear()
    await db.storageFolders.clear()
  })

  // A half-written prompt in sessionStorage is part of the old library too.
  clearDraft()
  resetSeeding()
  await ensureSeeded()
}

/** Re-exported so the UI can show the locked default categories. */
export const defaultCategories = DEFAULT_CATEGORY_SEEDS

export async function purgeTombstonesOlderThan(days = 90): Promise<{
  prompts: number
  categories: number
  todos: number
  folders: number
}> {
  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000

  const isOlder = (deletedAt?: string) => {
    if (!deletedAt) return false
    const time = new Date(deletedAt).getTime()
    return !Number.isNaN(time) && time < cutoffMs
  }

  let purgedPrompts = 0
  let purgedCategories = 0
  let purgedTodos = 0
  let purgedFolders = 0

  await db.transaction('rw', db.prompts, db.categories, db.todos, db.storageFolders, async () => {
    const oldPrompts = await db.prompts.filter((p) => isOlder(p.deletedAt)).primaryKeys()
    if (oldPrompts.length) {
      await db.prompts.bulkDelete(oldPrompts)
      purgedPrompts = oldPrompts.length
    }

    const oldCategories = await db.categories.filter((c) => isOlder(c.deletedAt)).primaryKeys()
    if (oldCategories.length) {
      await db.categories.bulkDelete(oldCategories)
      purgedCategories = oldCategories.length
    }

    const oldTodos = await db.todos.filter((t) => isOlder(t.deletedAt)).primaryKeys()
    if (oldTodos.length) {
      await db.todos.bulkDelete(oldTodos)
      purgedTodos = oldTodos.length
    }

    const oldFolders = await db.storageFolders.filter((f) => isOlder(f.deletedAt)).primaryKeys()
    if (oldFolders.length) {
      await db.storageFolders.bulkDelete(oldFolders)
      purgedFolders = oldFolders.length
    }
  })

  return {
    prompts: purgedPrompts,
    categories: purgedCategories,
    todos: purgedTodos,
    folders: purgedFolders,
  }
}

setAfterSeedHook(async () => {
  await purgeTombstonesOlderThan(90)
})
