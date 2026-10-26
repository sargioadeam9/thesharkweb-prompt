import type { BackupFile } from './types'

export type EmailBackupResult = {
  ok: boolean
  sent?: boolean
  recorded?: boolean
  error?: string
}

export async function emailBackup(
  email: string,
  backup: BackupFile,
  newsletter: boolean,
): Promise<EmailBackupResult> {
  try {
    const res = await fetch('/api/email-backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, backup, newsletter }),
    })

    const data = (await res.json().catch(() => null)) as EmailBackupResult | null

    if (!res.ok) {
      return { ok: false, error: data?.error ?? 'Could not send the email.' }
    }

    return data ?? { ok: true, sent: true }
  } catch {
    return { ok: false, error: 'Could not reach the server. Check your connection.' }
  }
}
