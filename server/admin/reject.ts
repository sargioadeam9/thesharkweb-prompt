import type { Req, Res } from '../../api/_guards.ts'
import { requireAdmin } from '../../api/_guards.ts'
import { getServiceClient } from '../../api/_supabase.ts'
import { sendPaymentRejectedEmail } from '../../api/_email.ts'

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
  const { requestId, reason } = body

  if (
    typeof requestId !== 'string' ||
    !requestId.trim() ||
    typeof reason !== 'string' ||
    !reason.trim()
  ) {
    res.status(400).json({ error: 'requestId and reason are required' })
    return
  }

  const supabase = getServiceClient()

  const { data: requestRow, error: reqError } = await supabase
    .from('payment_requests')
    .select('*')
    .eq('id', requestId.trim())
    .maybeSingle()

  if (reqError || !requestRow) {
    res.status(400).json({ error: 'Payment request not found' })
    return
  }

  const now = new Date().toISOString()
  const cleanReason = reason.trim()

  const { error: updateError } = await supabase
    .from('payment_requests')
    .update({
      status: 'rejected',
      reject_reason: cleanReason,
      reviewed_by: admin.email || 'admin',
      reviewed_at: now,
    })
    .eq('id', requestId.trim())

  if (updateError) {
    console.error('Failed to reject payment request:', updateError)
    res.status(500).json({ ok: false, error: updateError.message })
    return
  }

  await supabase.from('audit_log').insert({
    actor: admin.email || 'admin',
    action: 'payment.reject',
    subject: requestRow.user_id as string,
    detail: {
      requestId: requestRow.id,
      reason: cleanReason,
    },
  })

  // Send rejection email
  const recipientEmail = (requestRow.email as string) || ''
  if (recipientEmail) {
    sendPaymentRejectedEmail(recipientEmail, cleanReason).catch(() => {})
  }

  res.status(200).json({ ok: true })
}

