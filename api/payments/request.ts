import type { Req, Res } from '../../server/guards'
import { getPlansConfig, limited, requireUser } from '../../server/guards'
import { getServiceClient } from '../../server/supabase'
import { sendPaymentReceivedEmail } from '../../server/email'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' })
    return
  }

  const user = await requireUser(req, res)
  if (!user) return

  const forwarded = req.headers['x-forwarded-for']
  const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim() ?? 'unknown'

  // Rate limits: 3/day per uid, 10/day per IP (86400 seconds)
  const uidLimit = await limited(`pay:uid:${user.id}`, 3, 86400)
  if (uidLimit.limited) {
    res.setHeader?.('Retry-After', String(uidLimit.retryAfter))
    res.status(429).json({ ok: false, error: 'rate_limit_exceeded' })
    return
  }

  const ipLimit = await limited(`pay:ip:${ip}`, 10, 86400)
  if (ipLimit.limited) {
    res.setHeader?.('Retry-After', String(ipLimit.retryAfter))
    res.status(429).json({ ok: false, error: 'rate_limit_exceeded' })
    return
  }

  const body = isRecord(req.body) ? req.body : {}
  const {
    plan,
    method,
    txnId,
    senderNumber,
    turnstileToken,
    honeypot,
    elapsedMs,
  } = body

  // Honeypot check
  if (honeypot) {
    res.status(400).json({ ok: false, error: 'Could not verify you are human. Try again.' })
    return
  }

  // Elapsed time check (at least 2000ms)
  if (typeof elapsedMs !== 'number' || elapsedMs < 2000) {
    res.status(400).json({ ok: false, error: 'Could not verify you are human. Try again.' })
    return
  }

  // Turnstile verification
  const turnstileSecret = process.env.TURNSTILE_SECRET
  if (turnstileSecret && !turnstileSecret.includes('placeholder')) {
    try {
      const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          secret: turnstileSecret,
          response: typeof turnstileToken === 'string' ? turnstileToken : '',
          remoteip: ip,
        }),
      })
      const verifyData = (await verifyRes.json()) as { success: boolean }
      if (!verifyData.success) {
        res.status(400).json({ ok: false, error: 'Could not verify you are human. Try again.' })
        return
      }
    } catch (err) {
      console.error('Turnstile verification failed:', err)
      res.status(400).json({ ok: false, error: 'Could not verify you are human. Try again.' })
      return
    }
  }

  // Validate plan from PLANS_JSON
  const plans = getPlansConfig()
  const planCfg = plans.find((p) => p.id === plan)
  if (!planCfg) {
    res.status(400).json({ ok: false, error: 'Invalid plan selected.' })
    return
  }

  // Validate method
  if (method !== 'bkash' && method !== 'nagad') {
    res.status(400).json({ ok: false, error: 'Invalid payment method.' })
    return
  }

  if (typeof txnId !== 'string' || !txnId.trim()) {
    res.status(400).json({ ok: false, error: 'Transaction ID is required.' })
    return
  }

  const cleanTxn = txnId.trim().toLowerCase()
  const cleanSender = typeof senderNumber === 'string' ? senderNumber.trim() : null
  const supabase = getServiceClient()

  // Check for existing pending request for this user
  const { data: existingPending } = await supabase
    .from('payment_requests')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .maybeSingle()

  if (existingPending) {
    res.status(400).json({ ok: false, error: 'You already have a request waiting for review.' })
    return
  }

  // Check for duplicate txn_id (exact comparison on normalized value, F6)
  const { data: clash } = await supabase
    .from('payment_requests')
    .select('id')
    .eq('txn_id', cleanTxn)
    .maybeSingle()

  if (clash) {
    res.status(400).json({ ok: false, error: 'That transaction ID was already used.' })
    return
  }

  // Insert payment request
  const { data: inserted, error: insertError } = await supabase
    .from('payment_requests')
    .insert({
      user_id: user.id,
      email: user.email || '',
      plan: planCfg.id,
      amount_bdt: planCfg.priceBdt,
      method,
      txn_id: cleanTxn,
      sender_number: cleanSender,
      status: 'pending',
    })
    .select('id, status')
    .single()

  if (insertError) {
    if (insertError.code === '23505') {
      res.status(400).json({ ok: false, error: 'That transaction ID was already used.' })
      return
    }
    console.error('Failed to create payment request:', insertError)
    res.status(400).json({ ok: false, error: insertError.message })
    return
  }

  if (user.email) {
    sendPaymentReceivedEmail(user.email, cleanTxn, planCfg.priceBdt).catch(() => {})
  }

  res.status(201).json({
    requestId: inserted.id as string,
    status: inserted.status as string,
  })
}

