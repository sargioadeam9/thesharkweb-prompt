import type { Req, Res } from '../guards'
import { requireAdmin } from '../guards'
import {
  DEFAULT_SYSTEM_PROMPT,
  chainForPlan,
  isSafeBaseUrl,
  loadAiConfig,
  normalizeBaseUrl,
  runChain,
  type AiConfigRow,
} from '../ai'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/* Option A: this tests the CURRENT form values, not the saved config, so a new
   key or model id can be proven before Save. Nothing is persisted here. */
export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' })
    return
  }

  const admin = await requireAdmin(req, res)
  if (!admin) return

  const body = isRecord(req.body) ? req.body : {}

  const saved = await loadAiConfig()

  const baseUrlRaw =
    typeof body.baseUrl === 'string' && body.baseUrl.trim()
      ? body.baseUrl.trim()
      : saved?.base_url ?? ''

  if (!baseUrlRaw) {
    res.status(400).json({ ok: false, error: 'baseUrl is required' })
    return
  }
  if (!isSafeBaseUrl(baseUrlRaw)) {
    res.status(400).json({ ok: false, error: 'baseUrl must be a public https URL' })
    return
  }

  const providedKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : ''
  const apiKey = providedKey || saved?.api_key || ''
  if (!apiKey) {
    res.status(400).json({ ok: false, error: 'apiKey is required' })
    return
  }

  const plan = typeof body.plan === 'string' && body.plan.trim() ? body.plan.trim() : 'free'

  const defaultModel =
    typeof body.model === 'string' && body.model.trim()
      ? body.model.trim()
      : saved?.default_model ?? ''

  if (!defaultModel) {
    res.status(400).json({ ok: false, error: 'model is required' })
    return
  }

  // Build a config view from the form values, falling back to saved settings for
  // anything the form does not carry.
  const effective: AiConfigRow = {
    id: 'app',
    enabled: true,
    base_url: normalizeBaseUrl(baseUrlRaw),
    default_model: defaultModel,
    api_key: apiKey,
    system_prompt: saved?.system_prompt ?? null,
    temperature: saved?.temperature ?? 0.4,
    max_tokens: saved?.max_tokens ?? 800,
    request_timeout_ms: saved?.request_timeout_ms ?? 25000,
    total_budget_ms: saved?.total_budget_ms ?? 45000,
    max_attempts: saved?.max_attempts ?? 3,
    plan_models: saved?.plan_models ?? {},
    plan_limits: saved?.plan_limits ?? {},
    monthly_budget_usd: saved?.monthly_budget_usd ?? null,
  }

  // The form may also carry an unsaved chain for this plan.
  if (isRecord(body.planModels)) {
    const rawChain = body.planModels[plan]
    if (Array.isArray(rawChain)) {
      effective.plan_models = {
        ...(effective.plan_models ?? {}),
        [plan]: rawChain.filter((item): item is string => typeof item === 'string'),
      }
    } else if (typeof rawChain === 'string') {
      effective.plan_models = {
        ...(effective.plan_models ?? {}),
        [plan]: rawChain.split(',').map((item) => item.trim()).filter(Boolean),
      }
    }
  }

  const chain = chainForPlan(effective, plan, Number(effective.max_attempts) || 3)
  const budget = Number(effective.total_budget_ms) || 45000

  const outcome = await runChain({
    config: effective,
    apiKey,
    baseUrl: effective.base_url,
    chain,
    systemPrompt: effective.system_prompt || DEFAULT_SYSTEM_PROMPT,
    input: 'Reply with the single word: ready',
    deadline: Date.now() + budget,
  })

  res.status(200).json({
    ok: outcome.ok,
    servedBy: outcome.model,
    plan,
    results: outcome.chain.map((step) => ({
      model: step.model,
      ok: step.error === null,
      ms: step.ms,
      errorCode: step.error,
      sample: step.error === null && step.model === outcome.model ? (outcome.text ?? '').slice(0, 120) : null,
    })),
  })
}
