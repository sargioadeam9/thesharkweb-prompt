import type { Req, Res, LicenseRow } from '../../api/_guards'
import { getPlansConfig, licenseState, requireAdmin } from '../../api/_guards'
import { getServiceClient } from '../../api/_supabase'
import { sendLicenseActiveEmail } from '../../api/_email'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' })
    return
  }

  const admin = await requireAdmin(req, res)
  if (!admin) return

  const body = isRecord(req.body) ? req.body : {}
  const { requestId } = body

  if (typeof requestId !== 'string' || !requestId) {
    res.status(400).json({ error: 'requestId is required' })
    return
  }

  const supabase = getServiceClient()

  // 1. Fetch payment request
  const { data: requestRow, error: reqError } = await supabase
    .from('payment_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle()

  if (reqError || !requestRow) {
    res.status(400).json({ error: 'Payment request not found' })
    return
  }

  if (requestRow.status !== 'pending') {
    res.status(400).json({ error: 'Request is not pending review' })
    return
  }

  // Reject master plan
  if (requestRow.plan === 'master') {
    res.status(400).json({ error: 'Cannot approve master plan' })
    return
  }

  // 2. Validate against PLANS_JSON
  const plans = getPlansConfig()
  const planCfg = plans.find((p) => p.id === requestRow.plan)
  if (!planCfg) {
    res.status(400).json({ error: 'Plan is not configured' })
    return
  }

  if (requestRow.amount_bdt !== planCfg.priceBdt) {
    res.status(400).json({
      error: `The amount does not match this plan. Send exactly ${planCfg.priceBdt} BDT.`,
    })
    return
  }

  // 3. Check user email_confirmed_at
  const { data: userData, error: userError } = await supabase.auth.admin.getUserById(
    requestRow.user_id as string,
  )

  if (userError || !userData?.user) {
    res.status(400).json({ error: 'User account not found' })
    return
  }

  if (!userData.user.email_confirmed_at) {
    res.status(400).json({ error: 'Verify your email first, then submit again.' })
    return
  }

  // 4. Check txn not already approved (exact comparison on normalized value, F6)
  const normalizedTxn = (requestRow.txn_id as string).toLowerCase().trim()
  const { data: duplicateApproved } = await supabase
    .from('payment_requests')
    .select('id')
    .eq('txn_id', normalizedTxn)
    .eq('status', 'approved')
    .neq('id', requestId)
    .maybeSingle()

  if (duplicateApproved) {
    res.status(400).json({ error: 'That transaction ID was already used.' })
    return
  }

  // 5. Check existing license & calculate expires_at
  const { data: rawLicense } = await supabase
    .from('licenses')
    .select('*')
    .eq('user_id', requestRow.user_id)
    .maybeSingle()

  const existingLicense = rawLicense as LicenseRow | null
  const currentLicenseState = licenseState(existingLicense)

  let expiresAt: string | null = null

  if (planCfg.days === null) {
    // Lifetime plan: expires_at is null
    expiresAt = null
  } else {
    const daysMs = planCfg.days * 86400000
    if (
      currentLicenseState.active &&
      existingLicense?.expires_at &&
      existingLicense.plan === planCfg.id
    ) {
      // Extend existing active license of same plan
      const currentExpiryMs = new Date(existingLicense.expires_at).getTime()
      expiresAt = new Date(currentExpiryMs + daysMs).toISOString()
    } else {
      expiresAt = new Date(Date.now() + daysMs).toISOString()
    }
  }

  // 6. Upsert license
  const now = new Date().toISOString()
  const { error: licenseError } = await supabase.from('licenses').upsert(
    {
      user_id: requestRow.user_id,
      plan: planCfg.id,
      status: 'active',
      started_at: existingLicense?.started_at ?? now,
      expires_at: expiresAt,
      max_devices: planCfg.maxDevices,
      max_prompts: planCfg.maxPrompts,
      created_by: admin.email || 'admin',
    },
    { onConflict: 'user_id' },
  )

  if (licenseError) {
    console.error('Failed to upsert license:', licenseError)
    res.status(500).json({ ok: false, error: licenseError.message })
    return
  }

  // 7. Mark request approved
  await supabase
    .from('payment_requests')
    .update({
      status: 'approved',
      reviewed_by: admin.email || 'admin',
      reviewed_at: now,
    })
    .eq('id', requestId)

  // 8. Audit log
  await supabase.from('audit_log').insert({
    actor: admin.email || 'admin',
    action: 'payment.approve',
    subject: requestRow.user_id as string,
    detail: {
      requestId,
      plan: planCfg.id,
      amountBdt: requestRow.amount_bdt,
      txnId: requestRow.txn_id,
      expiresAt,
    },
  })

  // 9. Send active email
  if (userData.user.email) {
    sendLicenseActiveEmail(userData.user.email, expiresAt).catch(() => {})
  }

  res.status(200).json({ expiresAt })
}

