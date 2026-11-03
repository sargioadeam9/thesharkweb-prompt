import type { Req, Res } from '../../api/_guards'
import { requireAdmin } from '../../api/_guards'
import { getServiceClient } from '../../api/_supabase'

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' })
    return
  }

  const admin = await requireAdmin(req, res)
  if (!admin) return

  const supabase = getServiceClient()

  const [pendingResult, recentResult] = await Promise.all([
    supabase
      .from('payment_requests')
      .select('*')
      .eq('status', 'pending')
      .order('submitted_at', { ascending: false })
      .limit(50),
    supabase
      .from('payment_requests')
      .select('*')
      .in('status', ['approved', 'rejected'])
      .order('reviewed_at', { ascending: false })
      .limit(50),
  ])

  if (pendingResult.error) {
    console.error('Failed to fetch pending requests:', pendingResult.error)
    res.status(500).json({ ok: false, error: pendingResult.error.message })
    return
  }

  if (recentResult.error) {
    console.error('Failed to fetch recent requests:', recentResult.error)
    res.status(500).json({ ok: false, error: recentResult.error.message })
    return
  }

  res.status(200).json({
    pending: pendingResult.data ?? [],
    recent: recentResult.data ?? [],
  })
}

