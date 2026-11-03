import type { Req, Res } from '../server/guards'
import { getPlansConfig } from '../server/guards'
import { getServiceClient } from '../server/supabase'

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' })
    return
  }

  const plans = getPlansConfig()

  const bkash = process.env.PAYMENT_BKASH_NUMBER?.trim() || ''
  const nagad = process.env.PAYMENT_NAGAD_NUMBER?.trim() || ''

  if (!bkash || !nagad) {
    try {
      const supabase = getServiceClient()
      await supabase.from('audit_log').insert({
        actor: 'system',
        action: 'data.error',
        subject: null,
        detail: {
          reason: 'missing_payment_number',
          missingBkash: !bkash,
          missingNagad: !nagad,
        },
      })
    } catch (err) {
      console.error('Failed to log audit error for missing payment number:', err)
    }
  }

  res.status(200).json({
    plans,
    payment: {
      bkash,
      nagad,
    },
  })
}
