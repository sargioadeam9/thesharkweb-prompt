export type SortField = 'updatedAt' | 'createdAt' | 'title'
export type SortDirection = 'asc' | 'desc'

export interface Prompt {
  id: string
  title: string
  content: string
  categoryId: string
  notes?: string
  tags?: string[]
  isFavorite?: boolean
  createdAt: string
  updatedAt: string
}

export interface Todo {
  id: string
  title: string
  done: boolean
  /** Local YYYY-MM-DD. Optional because a task does not need a deadline. */
  dueDate?: string
  createdAt: string
  updatedAt: string
}

export interface Category {
  id: string
  name: string
  color?: string
  isDefault?: boolean
  createdAt: string
  updatedAt: string
}

export interface Settings {
  id: 'app'
  schemaVersion: 1
  sortBy: SortField
  sortDirection: SortDirection
  lastBackupAt?: string
  backupReminderDismissed?: boolean
  /** Local date key (YYYY-MM-DD) of the last day the reminder was shown. */
  backupPromptDate?: string
  categoriesInitialized?: boolean
}

/** Shape written by exportBackup() and accepted by importBackup(). */
export interface BackupFile {
  app: 'TheSharkWebPrompt'
  formatVersion: 1
  exportedAt: string
  prompts: Prompt[]
  categories: Category[]
  /** Optional so files exported before the To Do tab still import. */
  todos?: Todo[]
  settings: {
    sortBy: SortField
    sortDirection: SortDirection
    lastBackupAt?: string
    backupReminderDismissed?: boolean
  }
}

export type PromptInput = {
  title: string
  content: string
  categoryId: string
  notes?: string
  tags?: string[]
}

export type TodoInput = {
  title: string
  dueDate?: string
}

export type TodoFilter = 'all' | 'open' | 'done'

export type ImportMode = 'merge' | 'replace'

export type CategoryDeleteOptions =
  | { mode: 'delete' }
  | { mode: 'move'; targetId: string }

export type ImportResult =
  | { ok: true; prompts: number; categories: number; todos: number }
  | { ok: false; error: string }
