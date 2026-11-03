import type { Req, Res } from '../guards'
import { requireAdmin } from '../guards'
import { getServiceClient } from '../supabase'

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' })
    return
  }

  const admin = await requireAdmin(req, res)
  if (!admin) return

  const supabase = getServiceClient()

  const { data: licenses, error: licError } = await supabase
    .from('licenses')
    .select('user_id, plan, status, expires_at, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  if (licError) {
    console.error('Failed to list licenses:', licError)
    res.status(500).json({ ok: false, error: licError.message })
    return
  }

  const userIds = (licenses ?? []).map((l) => l.user_id as string)

  let emailMap = new Map<string, string>()
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, email')
      .in('user_id', userIds)

    if (profiles) {
      emailMap = new Map(profiles.map((p) => [p.user_id as string, p.email as string]))
    }
  }

  const rows = (licenses ?? []).map((lic) => ({
    uid: lic.user_id as string,
    email: emailMap.get(lic.user_id as string) ?? '',
    plan: lic.plan as string,
    status: lic.status as string,
    expiresAt: (lic.expires_at as string | null) ?? null,
    isMaster: lic.plan === 'master',
  }))

  res.status(200).json({ rows })
}

