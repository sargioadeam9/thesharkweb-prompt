import type { Req, Res, LicenseRow } from '../_guards.ts'
import { requireAdmin } from '../_guards.ts'
import { getServiceClient } from '../_supabase.ts'

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
  const { uid, days } = body

  if (typeof uid !== 'string' || !uid.trim() || typeof days !== 'number' || days <= 0) {
    res.status(400).json({ error: 'Valid uid and positive days number are required' })
    return
  }

  const supabase = getServiceClient()

  const { data: rawLicense, error: licError } = await supabase
    .from('licenses')
    .select('*')
    .eq('user_id', uid.trim())
    .maybeSingle()

  if (licError || !rawLicense) {
    res.status(400).json({ error: 'License not found for user' })
    return
  }

  const licenseRow = rawLicense as LicenseRow

  if (licenseRow.plan === 'master' || licenseRow.plan === 'lifetime') {
    res.status(400).json({ error: 'Cannot extend master or lifetime license' })
    return
  }

  const currentExpiry = licenseRow.expires_at ? new Date(licenseRow.expires_at).getTime() : Date.now()
  const baseMs = Math.max(currentExpiry, Date.now())
  const newExpiresAt = new Date(baseMs + days * 86400000).toISOString()

  const { error: updateError } = await supabase
    .from('licenses')
    .update({
      expires_at: newExpiresAt,
      status: 'active',
    })
    .eq('user_id', uid.trim())

  if (updateError) {
    console.error('Failed to extend license:', updateError)
    res.status(500).json({ ok: false, error: updateError.message })
    return
  }

  await supabase.from('audit_log').insert({
    actor: admin.email || 'admin',
    action: 'license.extend',
    subject: uid.trim(),
    detail: {
      days,
      previousExpiresAt: licenseRow.expires_at,
      newExpiresAt,
    },
  })

  res.status(200).json({ expiresAt: newExpiresAt })
}

