import { getAccessToken } from './supabase'
import type {
  AdminLicense,
  AdminRequests,
  BlobVersion,
  LicenseView,
  PaymentInput,
  Plan,
  Result,
} from './sync-types'
import type { AiAdminConfig, AiTestResult } from './ai-types'

export type { Result }

async function request<T>(
  url: string,
  options: {
    method?: string
    body?: unknown
    requiresAuth?: boolean
  } = {},
): Promise<Result<T>> {
  const method = options.method ?? 'GET'
  const headers: Record<string, string> = {}

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  if (options.requiresAuth !== false) {
    const token = await getAccessToken()
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }
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
      const errorMsg =
        (data && typeof data.error === 'string' && data.error) ||
        (data && typeof data.message === 'string' && data.message) ||
        `Request failed with status ${res.status}`
      const code =
        (data && typeof data.code === 'string' && data.code) ||
        (data && typeof data.error === 'string' && data.error) ||
        String(res.status)

      return {
        ok: false,
        error: errorMsg,
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

export async function fetchPlans(): Promise<
  Result<{ plans: Plan[]; payment: { bkash: string; nagad: string } }>
> {
  return request<{ plans: Plan[]; payment: { bkash: string; nagad: string } }>('/api/plans', {
    method: 'GET',
    requiresAuth: false,
  })
}

export async function fetchLicense(): Promise<Result<LicenseView | { status: 'none' }>> {
  return request<LicenseView | { status: 'none' }>('/api/license', { method: 'GET' })
}

export async function submitPayment(input: PaymentInput): Promise<Result<{ requestId: string }>> {
  return request<{ requestId: string }>('/api/payments/request', {
    method: 'POST',
    body: input,
  })
}

export async function adminListRequests(): Promise<Result<AdminRequests>> {
  return request<AdminRequests>('/api/admin/requests', { method: 'GET' })
}

export async function adminApprove(
  requestId: string,
): Promise<Result<{ expiresAt: string | null }>> {
  return request<{ expiresAt: string | null }>('/api/admin/approve', {
    method: 'POST',
    body: { requestId },
  })
}

export async function adminReject(requestId: string, reason: string): Promise<Result<null>> {
  return request<null>('/api/admin/reject', {
    method: 'POST',
    body: { requestId, reason },
  })
}

export async function adminExtend(
  uid: string,
  days: number,
): Promise<Result<{ expiresAt: string | null }>> {
  return request<{ expiresAt: string | null }>('/api/admin/extend', {
    method: 'POST',
    body: { uid, days },
  })
}

export async function adminRevoke(uid: string): Promise<Result<null>> {
  return request<null>('/api/admin/revoke', {
    method: 'POST',
    body: { uid },
  })
}

export async function adminResetDevices(uid: string): Promise<Result<null>> {
  return request<null>('/api/admin/reset-devices', {
    method: 'POST',
    body: { uid },
  })
}

export async function adminListLicenses(): Promise<Result<{ rows: AdminLicense[] }>> {
  return request<{ rows: AdminLicense[] }>('/api/admin/licenses', { method: 'GET' })
}

export async function adminBlobVersions(
  uid: string,
): Promise<Result<{ versions: BlobVersion[] }>> {
  return request<{ versions: BlobVersion[] }>(
    `/api/admin/blob-versions?uid=${encodeURIComponent(uid)}`,
    { method: 'GET' },
  )
}

export async function adminRestoreBlob(
  uid: string,
  version: number,
): Promise<Result<{ version: number }>> {
  return request<{ version: number }>('/api/admin/restore-blob', {
    method: 'POST',
    body: { uid, version },
  })
}

export async function adminAiConfig(): Promise<Result<AiAdminConfig>> {
  return request<AiAdminConfig>('/api/admin/ai-config', { method: 'GET' })
}

export async function adminSaveAiConfig(
  input: Partial<AiAdminConfig> & { apiKey?: string },
): Promise<Result<{ ok: boolean; maskedKey: string }>> {
  return request<{ ok: boolean; maskedKey: string }>('/api/admin/ai-config', {
    method: 'POST',
    body: input,
  })
}

export async function adminTestAi(input: {
  baseUrl: string
  model: string
  apiKey?: string
  plan: string
  planModels?: Record<string, string[]>
}): Promise<Result<AiTestResult>> {
  return request<AiTestResult>('/api/admin/ai-test', { method: 'POST', body: input })
}

export async function apiGetSync(): Promise<
  Result<{ version: number; payload: unknown; updatedAt: string }>
> {
  return request<{ version: number; payload: unknown; updatedAt: string }>('/api/sync', {
    method: 'GET',
  })
}

export async function apiPutSync(body: {
  baseVersion: number
  payload: unknown
  deviceId: string
  deviceLabel?: string | null
}): Promise<
  Result<{ version: number }> & {
    bytes?: number
    cap?: number
    maxPrompts?: number
    maxDevices?: number
    count?: number
    version?: number
    payload?: unknown
  }
> {
  const token = await getAccessToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  try {
    const res = await fetch('/api/sync', {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
    })

    const isJson = res.headers.get('content-type')?.includes('application/json')
    const data = isJson ? await res.json() : null

    if (!res.ok) {
      return {
        ok: false,
        error: data?.error || res.statusText,
        code: data?.error || String(res.status),
        ...(data || {}),
      }
    }

    return { ok: true, data: data as { version: number } }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Network error',
      code: 'network_error',
    }
  }
}

