import type { Req, Res } from '../_guards.ts'
import { requireAdmin } from '../_guards.ts'
import { getServiceClient } from '../_supabase.ts'

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' })
    return
  }

  const admin = await requireAdmin(req, res)
  if (!admin) return

  const uid = req.query?.uid
  if (typeof uid !== 'string' || !uid.trim()) {
    res.status(400).json({ error: 'uid query parameter is required' })
    return
  }

  const cleanUid = uid.trim()
  const supabase = getServiceClient()

  const { data: historyRows, error: histError } = await supabase
    .from('sync_blob_history')
    .select('version, bytes, created_at')
    .eq('user_id', cleanUid)
    .order('version', { ascending: false })

  if (histError) {
    console.error('Failed to list blob versions:', histError)
    res.status(500).json({ ok: false, error: histError.message })
    return
  }

  const versions = (historyRows ?? []).map((row) => ({
    version: row.version as number,
    bytes: row.bytes as number,
    createdAt: row.created_at as string,
  }))

  res.status(200).json({ versions })
}

