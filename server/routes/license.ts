import type { Req, Res, LicenseRow } from '../guards'
import { licenseState, limited, requireUser } from '../guards'
import { getServiceClient } from '../supabase'
import { sendLicenseExpiryWarningEmail } from '../email'

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' })
    return
  }

  const user = await requireUser(req, res)
  if (!user) return

  const rate = await limited(`lic:${user.id}`, 60, 60)
  if (rate.limited) {
    res.setHeader?.('Retry-After', String(rate.retryAfter))
    res.status(429).json({ ok: false, error: 'rate_limit_exceeded' })
    return
  }

  const supabase = getServiceClient()

  // Check for pending payment request (F9)
  const { data: pendingReq } = await supabase
    .from('payment_requests')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .maybeSingle()

  const pendingRequest = Boolean(pendingReq)

  const { data: rawLicense, error } = await supabase
    .from('licenses')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    console.error('Failed to fetch license:', error)
    res.status(200).json({ status: 'none', pendingRequest })
    return
  }

  if (!rawLicense) {
    res.status(200).json({ status: 'none', pendingRequest })
    return
  }

  const licenseRow = rawLicense as LicenseRow
  const state = licenseState(licenseRow)

  const { data: deviceRows } = await supabase
    .from('devices')
    .select('device_id, label, last_seen_at')
    .eq('user_id', user.id)

  const devices = (deviceRows ?? []).map((row) => ({
    id: row.device_id as string,
    label: (row.label as string | null) ?? null,
    lastSeenAt: row.last_seen_at as string,
  }))

  // F4: effectiveStatus must not echo raw row status
  // active -> 'active'; revoked -> 'revoked'; otherwise -> 'expired'
  const effectiveStatus = state.active
    ? 'active'
    : licenseRow.status === 'revoked'
      ? 'revoked'
      : 'expired'

  // Expiry notice email: fires only when <= 3 days remain, max once per day
  if (licenseRow.expires_at && user.email) {
    const expiresAtMs = new Date(licenseRow.expires_at).getTime()
    const nowMs = Date.now()
    const remainingMs = expiresAtMs - nowMs
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000
    const oneDayMs = 24 * 60 * 60 * 1000

    if (remainingMs > 0 && remainingMs <= threeDaysMs) {
      const lastNoticeMs = licenseRow.last_expiry_notice_at
        ? new Date(licenseRow.last_expiry_notice_at).getTime()
        : 0

      if (nowMs - lastNoticeMs >= oneDayMs) {
        const noticeIso = new Date().toISOString()
        sendLicenseExpiryWarningEmail(user.email, licenseRow.expires_at).catch(() => {})
        supabase
          .from('licenses')
          .update({ last_expiry_notice_at: noticeIso })
          .eq('user_id', user.id)
          .then(() => {}, () => {})
      }
    }
  }

  res.status(200).json({
    plan: licenseRow.plan,
    status: effectiveStatus,
    expiresAt: licenseRow.expires_at ?? null,
    maxDevices: state.maxDevices,
    maxPrompts: state.maxPrompts,
    blobCap: state.blobCap,
    devices,
    pendingRequest,
  })
}

