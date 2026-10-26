/**
 * POST /api/email-backup
 *
 * Two jobs in one request:
 *   1. record the visitor's email in the Google Sheet (this is the lead)
 *   2. email them their backup file through Resend
 *
 * Order matters: the lead is written before the send, so a provider failure
 * still leaves you with the address.
 *
 * Env: RESEND_API_KEY, OWNER_EMAIL, SHEET_WEBHOOK_URL
 */

type Req = {
  method?: string
  body?: unknown
  headers: Record<string, string | string[] | undefined>
}

type Res = {
  status: (code: number) => Res
  json: (body: unknown) => void
}

const MAX_PROMPTS = 20_000
const RATE_LIMIT = 5
const RATE_WINDOW_MS = 60 * 60 * 1000

const hits = new Map<string, number[]>()

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter((time) => now - time < RATE_WINDOW_MS)
  recent.push(now)
  hits.set(ip, recent)
  return recent.length > RATE_LIMIT
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method not allowed' })
    return
  }

  const forwarded = req.headers['x-forwarded-for']
  const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim() ?? 'unknown'
  if (rateLimited(ip)) {
    res.status(429).json({ ok: false, error: 'too many requests, try again later' })
    return
  }

  const body = isRecord(req.body) ? req.body : {}
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const newsletter = body.newsletter === true
  const backup = isRecord(body.backup) ? body.backup : null

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 200) {
    res.status(400).json({ ok: false, error: 'That email address does not look right.' })
    return
  }

  if (!backup || !Array.isArray(backup.prompts)) {
    res.status(400).json({ ok: false, error: 'No backup was attached.' })
    return
  }

  if (backup.prompts.length > MAX_PROMPTS) {
    res.status(413).json({ ok: false, error: 'This library is too large to email.' })
    return
  }

  const promptCount = backup.prompts.length
  const sheetUrl = process.env.SHEET_WEBHOOK_URL
  const resendKey = process.env.RESEND_API_KEY
  const owner = process.env.OWNER_EMAIL
  const from = process.env.RESEND_FROM || 'TheSharkWebPrompt <backup@thesharkweb.com>'

  let recorded = false
  if (sheetUrl) {
    try {
      const sheetRes = await fetch(sheetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ email, prompts: promptCount, source: newsletter ? 'newsletter' : 'backup' }),
      })
      recorded = sheetRes.ok
    } catch {
      recorded = false
    }
  }

  if (!resendKey) {
    res.status(503).json({
      ok: false,
      recorded,
      error: 'Email backup is not configured yet. Use the download button instead.',
    })
    return
  }

  try {
    const send = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: email,
        ...(owner ? { bcc: owner } : {}),
        subject: 'Your TheSharkWebPrompt backup',
        text:
          'Your backup file is attached.\n\n' +
          'Keep it somewhere safe. To restore it, open Backup and data in the app, ' +
          'choose this file, then pick Merge or Replace.\n\n' +
          'Your prompts are not stored on our side.',
        attachments: [
          {
            filename: `thesharkwebprompt-backup-${new Date().toISOString().slice(0, 10)}.json`,
            content: Buffer.from(JSON.stringify(backup)).toString('base64'),
          },
        ],
      }),
    })

    if (!send.ok) {
      const detail = await send.text().catch(() => '')
      console.error('Resend refused the send', send.status, detail.slice(0, 400))
      res.status(502).json({
        ok: false,
        recorded,
        error: 'Our email provider refused the message. Use the download button instead.',
      })
      return
    }
  } catch (error) {
    console.error('Resend request failed', error)
    res.status(502).json({
      ok: false,
      recorded,
      error: 'Could not reach the email provider. Use the download button instead.',
    })
    return
  }

  res.status(200).json({ ok: true, sent: true, recorded })
}
