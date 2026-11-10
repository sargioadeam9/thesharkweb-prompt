import type { Req, Res } from '../guards'
import { requireAdmin } from '../guards'
import { getServiceClient } from '../supabase'
import { isSafeBaseUrl, maskKey, normalizeBaseUrl, type AiConfigRow } from '../ai'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
}

/** { plan: [model, ...] } — empty arrays are dropped so the default model applies. */
function asPlanModels(value: unknown): Record<string, string[]> {
  if (!isRecord(value)) return {}
  const out: Record<string, string[]> = {}
  for (const [plan, raw] of Object.entries(value)) {
    const list = asStringList(raw)
    if (list.length > 0) out[plan] = list
  }
  return out
}

/** { plan: number | null } — null means unlimited, blank input means unlimited. */
function asPlanLimits(value: unknown): Record<string, number | null> {
  if (!isRecord(value)) return {}
  const out: Record<string, number | null> = {}
  for (const [plan, raw] of Object.entries(value)) {
    if (raw === null || raw === '') {
      out[plan] = null
      continue
    }
    const parsed = typeof raw === 'number' ? raw : Number(raw)
    if (Number.isFinite(parsed)) out[plan] = Math.max(0, Math.trunc(parsed))
  }
  return out
}

export default async function handler(req: Req, res: Res) {
  const admin = await requireAdmin(req, res)
  if (!admin) return

  const supabase = getServiceClient()

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('ai_config').select('*').eq('id', 'app').maybeSingle()
    if (error) {
      console.error('Failed to read ai_config:', error.message)
      res.status(500).json({ ok: false, error: 'ai_config_read_failed' })
      return
    }

    if (!data) {
      res.status(200).json({
        enabled: false,
        baseUrl: '',
        defaultModel: '',
        maskedKey: '',
        systemPrompt: '',
        temperature: 0.4,
        maxTokens: 2500,
        request_timeout_ms: 25000,
        total_budget_ms: 45000,
        max_attempts: 3,
        planModels: {},
        planLimits: { free: 3 },
        monthly_budget_usd: null,
        price_per_million_in: null,
        price_per_million_out: null,
      })
      return
    }

    const row = data as AiConfigRow
    res.status(200).json({
      enabled: Boolean(row.enabled),
      baseUrl: row.base_url ?? '',
      defaultModel: row.default_model ?? '',
      maskedKey: maskKey(row.api_key),
      systemPrompt: row.system_prompt ?? '',
      temperature: Number(row.temperature ?? 0.4),
      maxTokens: Number(row.max_tokens ?? 2500),
      request_timeout_ms: Number(row.request_timeout_ms ?? 25000),
      total_budget_ms: Number(row.total_budget_ms ?? 45000),
      max_attempts: Number(row.max_attempts ?? 3),
      planModels: row.plan_models ?? {},
      planLimits: row.plan_limits ?? { free: 3 },
      monthly_budget_usd:
        row.monthly_budget_usd === null || row.monthly_budget_usd === undefined
          ? null
          : Number(row.monthly_budget_usd),
      price_per_million_in:
        row.price_per_million_in === null || row.price_per_million_in === undefined
          ? null
          : Number(row.price_per_million_in),
      price_per_million_out:
        row.price_per_million_out === null || row.price_per_million_out === undefined
          ? null
          : Number(row.price_per_million_out),
    })
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' })
    return
  }

  const body = isRecord(req.body) ? req.body : {}

  const { data: existingRaw, error: readError } = await supabase
    .from('ai_config')
    .select('*')
    .eq('id', 'app')
    .maybeSingle()

  if (readError) {
    console.error('Failed to read ai_config before update:', readError.message)
    res.status(500).json({ ok: false, error: 'ai_config_read_failed' })
    return
  }

  const existing = (existingRaw as AiConfigRow | null) ?? null

  const baseUrlRaw = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : existing?.base_url ?? ''
  if (!baseUrlRaw) {
    res.status(400).json({ ok: false, error: 'baseUrl is required' })
    return
  }
  if (!isSafeBaseUrl(baseUrlRaw)) {
    res.status(400).json({ ok: false, error: 'baseUrl must be a public https URL' })
    return
  }

  const defaultModel =
    typeof body.defaultModel === 'string' && body.defaultModel.trim()
      ? body.defaultModel.trim()
      : existing?.default_model ?? ''

  if (!defaultModel) {
    res.status(400).json({ ok: false, error: 'defaultModel is required' })
    return
  }

  // Omitted apiKey keeps the stored one. An explicit empty string is ignored too.
  const providedKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : ''
  const apiKey = providedKey || existing?.api_key || ''
  if (!apiKey) {
    res.status(400).json({ ok: false, error: 'apiKey is required on first save' })
    return
  }

  const systemPrompt =
    typeof body.systemPrompt === 'string' ? body.systemPrompt.trim() : existing?.system_prompt ?? null

  const monthlyRaw = body.monthly_budget_usd
  const monthlyBudget =
    monthlyRaw === null || monthlyRaw === '' || monthlyRaw === undefined
      ? null
      : Math.max(0, asNumber(monthlyRaw, 0))

  const priceInRaw = body.price_per_million_in
  const priceIn =
    priceInRaw === null || priceInRaw === '' || priceInRaw === undefined
      ? null
      : Math.max(0, asNumber(priceInRaw, 0))

  const priceOutRaw = body.price_per_million_out
  const priceOut =
    priceOutRaw === null || priceOutRaw === '' || priceOutRaw === undefined
      ? null
      : Math.max(0, asNumber(priceOutRaw, 0))

  const patch = {
    id: 'app',
    enabled: typeof body.enabled === 'boolean' ? body.enabled : Boolean(existing?.enabled),
    base_url: normalizeBaseUrl(baseUrlRaw),
    default_model: defaultModel,
    api_key: apiKey,
    system_prompt: systemPrompt,
    temperature: Math.min(2, Math.max(0, asNumber(body.temperature, 0.4))),
    max_tokens: Math.max(1, Math.trunc(asNumber(body.maxTokens, 2500))),
    request_timeout_ms: Math.max(1000, Math.trunc(asNumber(body.request_timeout_ms, 25000))),
    total_budget_ms: Math.max(1000, Math.trunc(asNumber(body.total_budget_ms, 45000))),
    max_attempts: Math.min(6, Math.max(1, Math.trunc(asNumber(body.max_attempts, 3)))),
    plan_models: asPlanModels(body.planModels),
    plan_limits: asPlanLimits(body.planLimits),
    monthly_budget_usd: monthlyBudget,
    price_per_million_in: priceIn,
    price_per_million_out: priceOut,
    updated_at: new Date().toISOString(),
    updated_by: admin.email || 'admin',
  }

  const { error: upsertError } = await supabase
    .from('ai_config')
    .upsert(patch, { onConflict: 'id' })

  if (upsertError) {
    console.error('Failed to save ai_config:', upsertError.message)
    res.status(500).json({ ok: false, error: 'ai_config_save_failed' })
    return
  }

  // Audit without the key.
  await supabase.from('audit_log').insert({
    actor: admin.email || 'admin',
    action: 'ai.config',
    subject: null,
    detail: {
      enabled: patch.enabled,
      baseUrl: patch.base_url,
      defaultModel: patch.default_model,
      keyChanged: Boolean(providedKey),
      temperature: patch.temperature,
      maxTokens: patch.max_tokens,
      request_timeout_ms: patch.request_timeout_ms,
      total_budget_ms: patch.total_budget_ms,
      max_attempts: patch.max_attempts,
      planModels: patch.plan_models,
      planLimits: patch.plan_limits,
      monthly_budget_usd: patch.monthly_budget_usd,
      price_per_million_in: patch.price_per_million_in,
      price_per_million_out: patch.price_per_million_out,
    },
  })

  res.status(200).json({ ok: true, maskedKey: maskKey(apiKey) })
}
