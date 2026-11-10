import type { Req, Res, LicenseRow } from '../../guards'
import { licenseState, limited, requireUser } from '../../guards'
import { getServiceClient } from '../../supabase'
import { currentPeriod, isSafeBaseUrl, limitForPlan, loadAiConfig } from '../../ai'

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' })
    return
  }

  const user = await requireUser(req, res)
  if (!user) return

  const rate = await limited(`aist:${user.id}`, 60, 60)
  if (rate.limited) {
    res.setHeader?.('Retry-After', String(rate.retryAfter))
    res.status(429).json({ ok: false, error: 'rate_limit_exceeded' })
    return
  }

  const supabase = getServiceClient()

  const { data: rawLicense } = await supabase
    .from('licenses')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  const licenseRow = (rawLicense as LicenseRow | null) ?? null
  const state = licenseState(licenseRow)

  // AI Tools are package-locked, so a free account has nothing to report on.
  if (!state.active || !licenseRow) {
    res.status(200).json({
      available: false,
      reason: 'pro_required',
      plan: 'free',
      used: 0,
      limit: null,
      period: currentPeriod(),
    })
    return
  }

  const plan = licenseRow.plan

  const period = currentPeriod()
  const { data: usageRow } = await supabase
    .from('ai_usage')
    .select('calls')
    .eq('user_id', user.id)
    .eq('period', period)
    .maybeSingle()

  const used = (usageRow?.calls as number | undefined) ?? 0

  const config = await loadAiConfig()

  // Never leak api_key, base_url, or the model chain.
  if (!config || !config.enabled || !isSafeBaseUrl(config.base_url ?? '')) {
    res.status(200).json({
      available: false,
      reason: 'ai_unavailable',
      plan,
      used,
      limit: null,
      period,
    })
    return
  }

  const limit = limitForPlan(config, plan)
  const exhausted = limit !== null && used >= limit

  res.status(200).json({
    available: !exhausted,
    reason: exhausted ? 'quota_exhausted' : null,
    plan,
    used,
    limit,
    period,
  })
}
