/**
 * Tells auto-sync to ignore writes that came from the cloud, not the user.
 *
 * syncNow() pulls the remote library and merges it into IndexedDB. Those writes
 * hit the same Dexie tables the auto-sync hooks watch, so without this flag a
 * pull would schedule a push, which would pull again. The flag is held only for
 * the duration of the merge.
 */
let suppressed = false

export function isMergeSuppressed(): boolean {
  return suppressed
}

export async function withMergeSuppressed<T>(fn: () => Promise<T>): Promise<T> {
  const previous = suppressed
  suppressed = true
  try {
    return await fn()
  } finally {
    suppressed = previous
  }
}
