import { getAccessToken } from './supabase'
import type { AiMode, AiRunResult, AiStatus } from './ai-types'
import type { Result } from './sync-types'

async function call<T>(
  url: string,
  options: { method?: string; body?: unknown } = {},
): Promise<Result<T>> {
  const method = options.method ?? 'GET'
  const headers: Record<string, string> = {}

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  const token = await getAccessToken()
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    })

    const isJson = res.headers.get('content-type')?.includes('application/json')
    const data = isJson ? await res.json() : null

    if (!res.ok) {
      const code =
        (data && typeof data.error === 'string' && data.error) || String(res.status)
      return {
        ok: false,
        error: code,
        code,
      }
    }

    return { ok: true, data: data as T }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Network error',
      code: 'network_error',
    }
  }
}

export async function runAi(mode: AiMode, input: string): Promise<Result<AiRunResult>> {
  return call<AiRunResult>('/api/ai/run', { method: 'POST', body: { mode, input } })
}

export async function fetchAiStatus(): Promise<Result<AiStatus>> {
  return call<AiStatus>('/api/ai/status', { method: 'GET' })
}
