import type { Req, Res, LicenseRow } from '../../guards'
import { licenseState, limited, requireUser } from '../../guards'
import { getServiceClient } from '../../supabase'
import {
  DEFAULT_SYSTEM_PROMPT,
  chainForPlan,
  currentPeriod,
  estimateCostUsd,
  limitForPlan,
  loadAiConfig,
  logAiCall,
  isSafeBaseUrl,
  runChain,
  type AiMode,
} from '../../ai'

const MAX_INPUT = 4000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' })
    return
  }

  // 1. auth
  const user = await requireUser(req, res)
  if (!user) return

  // 2. burst rate limit
  const rate = await limited(`ai:${user.id}`, 10, 60)
  if (rate.limited) {
    res.setHeader?.('Retry-After', String(rate.retryAfter))
    res.status(429).json({ ok: false, error: 'rate_limit_exceeded' })
    return
  }

  const body = isRecord(req.body) ? req.body : {}
  const mode = body.mode === 'generate' ? 'generate' : body.mode === 'enhance' ? 'enhance' : null
  const rawInput = typeof body.input === 'string' ? body.input : ''
  const input = rawInput.trim()

  const supabase = getServiceClient()

  // 3. plan: an active license decides, otherwise free
  const { data: rawLicense } = await supabase
    .from('licenses')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  const licenseRow = (rawLicense as LicenseRow | null) ?? null
  const state = licenseState(licenseRow)
  const plan = state.active && licenseRow ? licenseRow.plan : 'free'

  // 4. config must exist and be enabled
  const config = await loadAiConfig()
  if (!config || !config.enabled) {
    res.status(503).json({ ok: false, error: 'ai_unavailable' })
    return
  }

  // 5. base_url must be https + public
  if (!isSafeBaseUrl(config.base_url ?? '')) {
    console.error('ai_config base_url rejected as unsafe')
    res.status(503).json({ ok: false, error: 'ai_misconfigured' })
    return
  }

  // 6. input bounds
  if (!mode || input.length < 1 || input.length > MAX_INPUT) {
    res.status(400).json({ ok: false, error: 'input_invalid' })
    return
  }

  // 7. plan limit
  const limit = limitForPlan(config, plan)
  if (limit !== null && limit <= 0) {
    res.status(403).json({ ok: false, error: 'quota_exhausted' })
    return
  }

  const period = currentPeriod()

  // 7.5 global monthly budget (kill switch).
  // Deliberately BEFORE quota consume: a budget-rejected request must cost the
  // user nothing and must never reach the provider.
  const monthlyBudget = Number(config.monthly_budget_usd)
  if (Number.isFinite(monthlyBudget) && monthlyBudget > 0) {
    const { data: spentRaw, error: spendError } = await supabase.rpc('ai_month_spend_usd', {
      p_period: period,
    })

    if (spendError) {
      console.error('ai_month_spend_usd failed:', spendError.message)
      res.status(503).json({ ok: false, error: 'ai_unavailable' })
      return
    }

    if (Number(spentRaw) >= monthlyBudget) {
      // No quota consumed, no provider call. Generic code only: the budget
      // figure is never exposed to a non-admin caller.
      res.status(429).json({ ok: false, error: 'budget_exhausted' })
      return
    }
  }

  // 8. atomic quota consume
  const { data: usedRaw, error: quotaError } = await supabase.rpc('consume_ai_quota', {
    p_uid: user.id,
    p_period: period,
    p_limit: limit,
  })

  if (quotaError) {
    console.error('consume_ai_quota failed:', quotaError.message)
    res.status(503).json({ ok: false, error: 'ai_unavailable' })
    return
  }
  if (usedRaw === null || usedRaw === undefined) {
    res.status(429).json({ ok: false, error: 'quota_exhausted' })
    return
  }

  // 9. model chain
  const chain = chainForPlan(config, plan, Number(config.max_attempts) || 3)
  const budget = Number(config.total_budget_ms) || 45000
  const deadline = Date.now() + budget
  const startedAt = Date.now()

  const outcome = await runChain({
    config,
    apiKey: config.api_key,
    baseUrl: config.base_url,
    chain,
    systemPrompt: config.system_prompt || DEFAULT_SYSTEM_PROMPT,
    input,
    deadline,
  })

  const ms = Date.now() - startedAt
  const costUsd = outcome.ok ? estimateCostUsd(outcome.tokensIn, outcome.tokensOut, config) : 0

  // Awaited, not fire-and-forget: the cost row IS the budget's ledger. If it
  // were lost, the kill switch would undercount spend and never trip.
  await logAiCall({
    userId: user.id,
    kind: mode as AiMode,
    model: outcome.model,
    plan,
    attempts: outcome.chain.length,
    chain: outcome.chain,
    ok: outcome.ok,
    errorCode: outcome.errorCode,
    tokensIn: outcome.tokensIn,
    tokensOut: outcome.tokensOut,
    costUsd,
    ms,
  })

  // 10. whole chain failed: give the call back
  if (!outcome.ok || !outcome.text) {
    await supabase.rpc('refund_ai_quota', { p_uid: user.id, p_period: period }).then(
      () => {},
      () => {},
    )
    res.status(502).json({ ok: false, error: 'ai_failed' })
    return
  }

  if (outcome.tokensIn !== null || outcome.tokensOut !== null || costUsd > 0) {
    supabase
      .rpc('add_ai_tokens', {
        p_uid: user.id,
        p_period: period,
        p_in: outcome.tokensIn ?? 0,
        p_out: outcome.tokensOut ?? 0,
        p_cost: costUsd,
      })
      .then(() => {}, () => {})
  }

  // Only the text. No model, no attempts, no usage.
  res.status(200).json({ text: outcome.text })
}
