import {
  Archive,
  BarChart3,
  Database,
  FolderKanban,
  FolderOpen,
  HelpCircle,
  History,
  Info,
  LayoutDashboard,
  LayoutGrid,
  LayoutTemplate,
  ListTodo,
  RefreshCw,
  Settings2,
  Sparkles,
  Star,
  Tags,
  WandSparkles,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Category } from './types'

export type View =
  | null
  | 'favorites'
  | 'todos'
  | 'storage'
  | 'sync'
  | 'about'
  | 'faq'
  | 'dashboard'
  | 'recent'
  | 'collections'
  | 'tags'
  | 'templates'
  | 'archived'
  | 'enhancer'
  | 'generator'
  | 'analytics'
  | 'settings'
  | string

export type NavStatus = 'live' | 'soon'

export type Gate = 'none' | 'soft' | 'hard'

export type NavEntry = {
  key: View
  label: string
  icon: LucideIcon
  count?: 'total' | 'favorites' | 'todos'
  status: NavStatus
  gate?: Gate
  action?: 'backup' | 'manageCategories'
  hideHeaderControls?: boolean
  hideNewPrompt?: boolean
}

export type NavGroup = { label: string; entries: NavEntry[] }

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Workspace',
    entries: [
      { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, status: 'soon', hideHeaderControls: true, hideNewPrompt: true },
      { key: null, label: 'All Prompts', icon: LayoutGrid, status: 'live', count: 'total' },
      { key: 'favorites', label: 'Favorites', icon: Star, status: 'live', count: 'favorites' },
      { key: 'todos', label: 'My Tasks', icon: ListTodo, status: 'live', count: 'todos', hideHeaderControls: true, hideNewPrompt: true },
      { key: 'recent', label: 'Recently Used', icon: History, status: 'live', hideHeaderControls: true, hideNewPrompt: true },
    ],
  },
  {
    label: 'Organize',
    entries: [
      { key: 'collections', label: 'Collections', icon: FolderKanban, status: 'soon', hideHeaderControls: true, hideNewPrompt: true },
      { key: 'tags', label: 'Tags & Labels', icon: Tags, status: 'live', hideHeaderControls: true, hideNewPrompt: true },
      { key: 'templates', label: 'Templates', icon: LayoutTemplate, status: 'soon', hideHeaderControls: true, hideNewPrompt: true },
      { key: 'archived', label: 'Archived', icon: Archive, status: 'soon', hideHeaderControls: true, hideNewPrompt: true },
      { key: 'storage', label: 'Storage', icon: FolderOpen, status: 'live', hideHeaderControls: true, hideNewPrompt: true },
    ],
  },
  {
    label: 'AI Tools',
    entries: [
      { key: 'enhancer', label: 'Prompt Enhancer', icon: WandSparkles, status: 'soon', gate: 'soft', hideHeaderControls: true, hideNewPrompt: true },
      { key: 'generator', label: 'Prompt Generator', icon: Sparkles, status: 'soon', gate: 'soft', hideHeaderControls: true, hideNewPrompt: true },
      { key: 'analytics', label: 'Analytics', icon: BarChart3, status: 'soon', gate: 'hard', hideHeaderControls: true, hideNewPrompt: true },
    ],
  },
  {
    label: 'System',
    entries: [
      { key: 'sync', label: 'Cloud Sync', icon: RefreshCw, status: 'live', gate: 'hard', hideHeaderControls: true, hideNewPrompt: true },
      { key: null, label: 'Backup & data', icon: Database, status: 'live', action: 'backup', hideHeaderControls: true, hideNewPrompt: true },
      { key: 'settings', label: 'Settings', icon: Settings2, status: 'soon', hideHeaderControls: true, hideNewPrompt: true },
      { key: 'faq', label: 'Help & FAQ', icon: HelpCircle, status: 'live', hideHeaderControls: true, hideNewPrompt: true },
    ],
  },
  {
    label: '',
    entries: [
      { key: 'about', label: 'About', icon: Info, status: 'live', hideHeaderControls: true, hideNewPrompt: true },
    ],
  },
]

export const NAV_FLAT: NavEntry[] = NAV_GROUPS.flatMap((group) => group.entries)

export const PRIMARY_VIEWS: View[] = NAV_FLAT.filter((entry) => !entry.action).map((entry) => entry.key)

const TITLE_MAP: Partial<Record<string, string>> = {
  favorites: 'Favorites',
  todos: 'My Tasks',
  storage: 'Storage',
  sync: 'Live cloud sync',
  about: 'About',
  faq: 'FAQ',
  dashboard: 'Dashboard',
  recent: 'Recently Used',
  collections: 'Collections',
  tags: 'Tags & Labels',
  templates: 'Templates',
  archived: 'Archived',
  enhancer: 'Prompt Enhancer',
  generator: 'Prompt Generator',
  analytics: 'Analytics',
  settings: 'Settings',
}

export function titleForView(view: View, categories: Category[]): string {
  if (view === null) return 'All Prompts'
  if (typeof view === 'string' && TITLE_MAP[view]) return TITLE_MAP[view]!
  return categories.find((category) => category.id === view)?.name ?? 'All Prompts'
}

export function flagsForView(view: View): {
  hideHeaderControls: boolean
  hideNewPrompt: boolean
} {
  const entry = NAV_FLAT.find((item) => item.key === view && !item.action)
  return {
    hideHeaderControls: entry?.hideHeaderControls ?? false,
    hideNewPrompt: entry?.hideNewPrompt ?? false,
  }
}
