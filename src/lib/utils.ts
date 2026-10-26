import type { Category, Prompt, SortDirection, SortField } from './types'

export function nowIso(): string {
  return new Date().toISOString()
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

/** Default categories keep a fixed position, everything else sorts by creation. */
const CATEGORY_RANK: Record<string, number> = {
  'cat-image-gen': 0,
  'cat-video-gen': 1,
  'cat-landing-page': 2,
  'cat-vibe-coding': 3,
}

export function sortCategories(categories: Category[]): Category[] {
  return [...categories].sort((a, b) => {
    const rankA = CATEGORY_RANK[a.id]
    const rankB = CATEGORY_RANK[b.id]

    if (rankA !== undefined && rankB !== undefined) return rankA - rankB
    if (rankA !== undefined) return -1
    if (rankB !== undefined) return 1

    const createdA = Date.parse(a.createdAt) || 0
    const createdB = Date.parse(b.createdAt) || 0
    if (createdA !== createdB) return createdA - createdB

    return a.name.localeCompare(b.name)
  })
}

export function sortPrompts(
  prompts: Prompt[],
  field: SortField,
  direction: SortDirection,
): Prompt[] {
  const sign = direction === 'asc' ? 1 : -1

  return [...prompts].sort((a, b) => {
    if (field === 'title') {
      return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) * sign
    }

    const left = Date.parse(field === 'createdAt' ? a.createdAt : a.updatedAt) || 0
    const right = Date.parse(field === 'createdAt' ? b.createdAt : b.updatedAt) || 0
    return (left - right) * sign
  })
}

export function wordCount(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}
