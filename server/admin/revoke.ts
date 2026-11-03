import type { Req, Res, LicenseRow } from '../../api/_guards.ts'
import { requireAdmin } from '../../api/_guards.ts'
import { getServiceClient } from '../../api/_supabase.ts'

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
  const { uid } = body

  if (typeof uid !== 'string' || !uid.trim()) {
    res.status(400).json({ error: 'uid is required' })
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

  if (licenseRow.plan === 'master') {
    res.status(400).json({ error: 'Cannot revoke master license' })
    return
  }

  const { error: updateError } = await supabase
    .from('licenses')
    .update({
      status: 'revoked',
    })
    .eq('user_id', uid.trim())

  if (updateError) {
    console.error('Failed to revoke license:', updateError)
    res.status(500).json({ ok: false, error: updateError.message })
    return
  }

  await supabase.from('audit_log').insert({
    actor: admin.email || 'admin',
    action: 'license.revoke',
    subject: uid.trim(),
    detail: {
      previousStatus: licenseRow.status,
      plan: licenseRow.plan,
    },
  })

  res.status(200).json({ ok: true })
}

