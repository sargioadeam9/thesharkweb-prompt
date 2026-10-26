const DRAFT_KEY = 'promptnook_prompt_draft'

export type PromptDraft = {
  title: string
  content: string
  categoryId: string
  notes: string
  tags: string
}

export function readDraft(): PromptDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    if (!raw) return null

    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null

    const draft = parsed as Partial<PromptDraft>
    return {
      title: typeof draft.title === 'string' ? draft.title : '',
      content: typeof draft.content === 'string' ? draft.content : '',
      categoryId: typeof draft.categoryId === 'string' ? draft.categoryId : '',
      notes: typeof draft.notes === 'string' ? draft.notes : '',
      tags: typeof draft.tags === 'string' ? draft.tags : '',
    }
  } catch {
    return null
  }
}

export function writeDraft(draft: PromptDraft): void {
  try {
    const isEmpty =
      !draft.title.trim() && !draft.content.trim() && !draft.notes.trim() && !draft.tags.trim()

    if (isEmpty) sessionStorage.removeItem(DRAFT_KEY)
    else sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  } catch {
    // A full or blocked sessionStorage must never break typing.
  }
}

export function clearDraft(): void {
  try {
    sessionStorage.removeItem(DRAFT_KEY)
  } catch {
    // ignore
  }
}
