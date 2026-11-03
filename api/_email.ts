export async function sendEmail({
  to,
  subject,
  text,
}: {
  to: string
  subject: string
  text: string
}): Promise<boolean> {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey || resendKey.includes('placeholder')) {
    return false
  }

  const from = process.env.RESEND_FROM || 'TheSharkWebPrompt <backup@thesharkweb.com>'
  const owner = process.env.OWNER_EMAIL

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to,
        ...(owner ? { bcc: owner } : {}),
        subject,
        text,
      }),
    })
    return res.ok
  } catch (err) {
    console.error('Failed to send email:', err)
    return false
  }
}

export async function sendPaymentReceivedEmail(email: string, txnId: string, amount: number) {
  return sendEmail({
    to: email,
    subject: 'Payment received, waiting for review',
    text: `We received your payment request (TxnID: ${txnId}, Amount: ${amount} BDT).\n\nActivation usually takes a few minutes. We will verify your transaction shortly.`,
  })
}

export async function sendLicenseActiveEmail(email: string, expiresAt: string | null) {
  const dateStr = expiresAt ? new Date(expiresAt).toISOString().slice(0, 10) : null
  const subject = dateStr ? `License active until ${dateStr}` : 'License active'
  return sendEmail({
    to: email,
    subject,
    text: dateStr
      ? `Your cloud sync license is now active until ${dateStr}. Open TheSharkWebPrompt to start syncing.`
      : 'Your lifetime cloud sync license is now active. Open TheSharkWebPrompt to start syncing.',
  })
}

export async function sendPaymentRejectedEmail(email: string, reason: string) {
  return sendEmail({
    to: email,
    subject: 'We could not match that transaction',
    text: `We could not match that transaction.\n\nReason: ${reason}\n\nPlease check your transaction ID or contact support.`,
  })
}

export async function sendLicenseExpiryWarningEmail(email: string, expiresAt: string) {
  const dateStr = new Date(expiresAt).toISOString().slice(0, 10)
  return sendEmail({
    to: email,
    subject: 'Your license expires in 3 days',
    text: `Your cloud sync license expires in 3 days (on ${dateStr}). Renew your plan to keep syncing without interruption. Your prompts are safe in your browser.`,
  })
}

