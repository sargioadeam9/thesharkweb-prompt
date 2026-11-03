import type { Req, Res } from '../../api/_guards'
import { requireAdmin } from '../../api/_guards'
import { getServiceClient } from '../../api/_supabase'

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

  const cleanUid = uid.trim()
  const supabase = getServiceClient()

  const { error: deleteError } = await supabase
    .from('devices')
    .delete()
    .eq('user_id', cleanUid)

  if (deleteError) {
    console.error('Failed to reset devices:', deleteError)
    res.status(500).json({ ok: false, error: deleteError.message })
    return
  }

  await supabase.from('audit_log').insert({
    actor: admin.email || 'admin',
    action: 'devices.reset',
    subject: cleanUid,
  })

  res.status(200).json({ ok: true })
}

