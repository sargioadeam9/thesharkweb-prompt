import { useState } from 'react'
import { LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { refreshLicense, useLicense } from '../lib/license-store'
import { signOutSupabase } from '../lib/supabase'

/*
  A signed-in account with no active package still has a session, and a session
  needs a way out. This chip is the always-available sign-out: it renders for any
  authenticated user regardless of license state, and signing out never touches
  the local library.
*/
export default function AccountChip() {
  const { user } = useLicense()
  const [busy, setBusy] = useState(false)

  if (!user) return null

  const email = user.email ?? 'Signed in'
  const initial = email.charAt(0).toUpperCase()

  async function handleSignOut() {
    setBusy(true)
    try {
      await signOutSupabase()
      await refreshLicense()
      toast.success('Signed out. Your prompts stay in this browser.')
    } catch {
      toast.error('Could not sign out')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-line bg-canvas/60 px-2.5 py-2">
      <span
        aria-hidden="true"
        className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-tint text-[10px] font-bold text-brand-deep"
      >
        {initial}
      </span>
      <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-ink" title={email}>
        {email}
      </span>
      <button
        type="button"
        onClick={() => void handleSignOut()}
        disabled={busy}
        aria-label={`Sign out of ${email}`}
        title="Sign out"
        className="grid size-7 shrink-0 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
      >
        <LogOut className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  )
}
