import type { Req, Res } from '../guards'
import { requireAdmin } from '../guards'
import { getServiceClient } from '../supabase'

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
  const { uid, version } = body

  if (typeof uid !== 'string' || !uid.trim() || typeof version !== 'number') {
    res.status(400).json({ error: 'Valid uid and version number are required' })
    return
  }

  const cleanUid = uid.trim()
  const supabase = getServiceClient()

  // 1. Fetch history version
  const { data: historyRow, error: histError } = await supabase
    .from('sync_blob_history')
    .select('payload, bytes')
    .eq('user_id', cleanUid)
    .eq('version', version)
    .maybeSingle()

  if (histError || !historyRow) {
    res.status(400).json({ error: 'Blob version not found in history' })
    return
  }

  // 2. Fetch current blob version
  const { data: currentBlob } = await supabase
    .from('sync_blobs')
    .select('version')
    .eq('user_id', cleanUid)
    .maybeSingle()

  const currentVersion = (currentBlob?.version as number | undefined) ?? 0
  const newVersion = currentVersion + 1

  // 3. Upsert restored payload into sync_blobs
  const { error: upsertError } = await supabase.from('sync_blobs').upsert(
    {
      user_id: cleanUid,
      version: newVersion,
      payload: historyRow.payload,
      bytes: historyRow.bytes,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )

  if (upsertError) {
    console.error('Failed to restore blob:', upsertError)
    res.status(500).json({ ok: false, error: upsertError.message })
    return
  }

  // 4. Audit log
  await supabase.from('audit_log').insert({
    actor: admin.email || 'admin',
    action: 'blob.restore',
    subject: cleanUid,
    detail: {
      restoredFromVersion: version,
      newVersion,
    },
  })

  res.status(200).json({ version: newVersion })
}

