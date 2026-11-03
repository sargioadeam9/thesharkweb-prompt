import type { User } from '@supabase/supabase-js'
import { getServiceClient, verifyUser } from './_supabase'

export type Req = {
  method?: string
  body?: unknown
  headers: Record<string, string | string[] | undefined>
  query?: Record<string, string | string[] | undefined>
}

export type Res = {
  status: (code: number) => Res
  json: (body: unknown) => void
  setHeader?: (name: string, value: string) => Res
}

export type LicenseRow = {
  user_id?: string
  plan: string
  status?: string
  started_at?: string
  expires_at?: string | null
  max_devices?: number | null
  max_prompts?: number | null
  note?: string | null
  created_by?: string
  created_at?: string
  last_expiry_notice_at?: string | null
}

export type LicenseState = {
  active: boolean
  plan: string
  maxDevices: number | null
  maxPrompts: number | null
  blobCap: number
  rateMultiplier: number
}

export type PlanConfig = {
  id: string
  label: string
  priceBdt: number
  days: number | null
  maxDevices: number | null
  maxPrompts: number | null
  blobCap: number
}

export type RateLimitResult = {
  limited: boolean
  retryAfter: number
  current: number
}

export function getPlansConfig(): PlanConfig[] {
  try {
    if (process.env.PLANS_JSON) {
      return JSON.parse(process.env.PLANS_JSON) as PlanConfig[]
    }
  } catch (err) {
    console.error('Failed to parse PLANS_JSON:', err)
  }
  return []
}

async function logAuditError(userId: string | undefined, detail: Record<string, unknown>) {
  try {
    const supabase = getServiceClient()
    await supabase.from('audit_log').insert({
      actor: 'system',
      action: 'data.error',
      subject: userId || null,
      detail,
    })
  } catch (err) {
    console.error('Failed to log audit data.error:', err)
  }
}

export async function requireUser(req: Req, res: Res): Promise<User | null> {
  const authHeader = req.headers.authorization || req.headers.Authorization
  const user = await verifyUser(authHeader)
  if (!user) {
    res.status(401).json({ ok: false, error: 'unauthorized' })
    return null
  }
  return user
}

export async function requireAdmin(req: Req, res: Res): Promise<User | null> {
  const user = await requireUser(req, res)
  if (!user) return null

  const adminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)

  const userEmail = (user.email || '').trim().toLowerCase()
  if (!userEmail || !adminEmails.includes(userEmail)) {
    res.status(403).json({ ok: false, error: 'forbidden' })
    return null
  }

  return user
}

export async function limited(
  key: string,
  max: number,
  windowSec: number
): Promise<RateLimitResult> {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!url || !token || url.includes('placeholder')) {
    return { limited: false, retryAfter: 0, current: 0 }
  }

  try {
    const res = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        ['INCR', key],
        ['TTL', key],
      ]),
    })

    if (!res.ok) {
      console.error('Upstash rate limit request failed', res.statusText)
      return { limited: false, retryAfter: 0, current: 0 }
    }

    const data = (await res.json()) as [{ result: number }, { result: number }]
    const current = data[0]?.result ?? 1
    let ttl = data[1]?.result ?? -1

    if (ttl === -1 || current === 1) {
      ttl = windowSec
      await fetch(`${url}/expire/${encodeURIComponent(key)}/${windowSec}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {})
    }

    const retryAfter = ttl > 0 ? ttl : windowSec

    return {
      limited: current > max,
      retryAfter,
      current,
    }
  } catch (err) {
    console.error('Upstash rate limit error:', err)
    return { limited: false, retryAfter: 0, current: 0 }
  }
}

export function licenseState(row: LicenseRow | null | undefined): LicenseState {
  if (!row) {
    return {
      active: false,
      plan: 'none',
      maxDevices: null,
      maxPrompts: null,
      blobCap: 0,
      rateMultiplier: 1,
    }
  }

  const plans = getPlansConfig()
  if (plans.length === 0) {
    logAuditError(row.user_id, {
      reason: 'missing_plans_json',
      plan: row.plan,
    }).catch(() => {})
    return {
      active: false,
      plan: row.plan,
      maxDevices: null,
      maxPrompts: null,
      blobCap: 0,
      rateMultiplier: 1,
    }
  }

  const planCfg = plans.find((p) => p.id === row.plan)
  const annualCfg = plans.find((p) => p.id === 'sync_annual')

  let maxDevices: number | null = null
  let maxPrompts: number | null = null
  let blobCap = 0
  let rateMultiplier = 1

  if (row.plan === 'master' || row.plan === 'founding') {
    if (!annualCfg) {
      logAuditError(row.user_id, {
        reason: 'missing_annual_config_for_special_plan',
        plan: row.plan,
      }).catch(() => {})
      return {
        active: false,
        plan: row.plan,
        maxDevices: null,
        maxPrompts: null,
        blobCap: 0,
        rateMultiplier: 1,
      }
    }
    blobCap = annualCfg.blobCap
    maxDevices = annualCfg.maxDevices
    maxPrompts = annualCfg.maxPrompts
    rateMultiplier = row.plan === 'master' ? 10 : 1
  } else if (planCfg) {
    blobCap = planCfg.blobCap
    maxDevices = planCfg.maxDevices
    maxPrompts = planCfg.maxPrompts
    rateMultiplier = 1
  } else {
    // Unknown plan
    logAuditError(row.user_id, {
      reason: 'unknown_plan',
      plan: row.plan,
    }).catch(() => {})
    return {
      active: false,
      plan: row.plan,
      maxDevices: null,
      maxPrompts: null,
      blobCap: 0,
      rateMultiplier: 1,
    }
  }

  const isLifetimeOrMaster = row.plan === 'lifetime' || row.plan === 'master'
  let active = row.status === 'active'

  if (isLifetimeOrMaster) {
    // lifetime and master never expire (expires_at null is valid)
  } else {
    // For sync_monthly, sync_annual, founding: expires_at is required
    if (!row.expires_at) {
      active = false
      logAuditError(row.user_id, {
        reason: 'missing_expires_at',
        plan: row.plan,
      }).catch(() => {})
    } else {
      const expiresAtMs = new Date(row.expires_at).getTime()
      if (Number.isNaN(expiresAtMs) || expiresAtMs <= Date.now()) {
        active = false
      }
    }
  }

  return {
    active,
    plan: row.plan,
    maxDevices,
    maxPrompts,
    blobCap,
    rateMultiplier,
  }
}

