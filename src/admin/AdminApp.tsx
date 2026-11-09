import { useEffect, useState } from 'react'
import { AlertTriangle, Check, History, RefreshCw, ShieldCheck, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  adminApprove,
  adminBlobVersions,
  adminExtend,
  adminListLicenses,
  adminListRequests,
  adminReject,
  adminResetDevices,
  adminRestoreBlob,
  adminRevoke,
} from '../lib/api-client'
import { useLicense } from '../lib/license-store'
import { signInWithGoogle, signOutSupabase } from '../lib/supabase'
import type { AdminLicense, AdminRequests, BlobVersion } from '../lib/sync-types'
import BrandMark from '../components/BrandMark'
import AiSettingsPanel from './AiSettingsPanel'

type Tab = 'pending' | 'licenses' | 'ai'

function formatDate(value: string | null): string {
  if (!value) return 'never'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'never'
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function AdminApp() {
  const { user, loading } = useLicense()
  const [tab, setTab] = useState<Tab>('pending')
  const [requests, setRequests] = useState<AdminRequests | null>(null)
  const [licenses, setLicenses] = useState<AdminLicense[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [versionsFor, setVersionsFor] = useState<string | null>(null)
  const [versions, setVersions] = useState<BlobVersion[]>([])
  const [refreshTick, setRefreshTick] = useState(0)

  useEffect(() => {
    if (!user) return

    let alive = true
    adminListRequests().then((result) => {
      if (!alive) return
      if (result.ok) {
        setRequests(result.data)
        setError(null)
      } else {
        setError(result.error)
      }
    })

    return () => {
      alive = false
    }
  }, [user, refreshTick])

  useEffect(() => {
    if (!user || tab !== 'licenses') return

    let alive = true
    adminListLicenses().then((result) => {
      if (!alive) return
      if (result.ok) {
        setLicenses(result.data.rows)
        setError(null)
      } else {
        setError(result.error)
      }
    })

    return () => {
      alive = false
    }
  }, [user, tab, refreshTick])

  function reloadRequests() {
    setRefreshTick((tick) => tick + 1)
  }

  function reloadLicenses() {
    setRefreshTick((tick) => tick + 1)
  }

  async function run(key: string, action: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(key)
    const result = await action()
    setBusy(null)

    if (!result.ok) {
      toast.error(result.error ?? 'That did not work')
      return false
    }
    return true
  }

  async function handleApprove(requestId: string) {
    const ok = await run(requestId, () => adminApprove(requestId))
    if (!ok) return

    toast.success('License activated')
    reloadRequests()
    if (tab === 'licenses') reloadLicenses()
  }

  async function handleReject(requestId: string) {
    if (!reason.trim()) {
      toast.error('Add a reason first')
      return
    }

    const ok = await run(requestId, () => adminReject(requestId, reason.trim()))
    if (!ok) return

    toast.success('Request rejected')
    setRejectId(null)
    setReason('')
    reloadRequests()
  }

  async function handleExtend(uid: string, days: number) {
    const ok = await run(`${uid}:${days}`, () => adminExtend(uid, days))
    if (!ok) return
    toast.success(`Extended by ${days} days`)
    reloadLicenses()
  }

  async function handleRevoke(uid: string) {
    if (!window.confirm('Revoke this license? The owner will lose access immediately.')) return

    const ok = await run(`${uid}:revoke`, () => adminRevoke(uid))
    if (!ok) return
    toast.success('License revoked')
    reloadLicenses()
  }

  async function handleResetDevices(uid: string) {
    if (!window.confirm('Clear every device for this license? They will need to sign in again.')) {
      return
    }

    const ok = await run(`${uid}:devices`, () => adminResetDevices(uid))
    if (!ok) return
    toast.success('Device list cleared')
    reloadLicenses()
  }

  async function loadVersions(uid: string) {
    const result = await adminBlobVersions(uid)
    if (!result.ok) {
      toast.error(result.error)
      return
    }

    setVersionsFor(uid)
    setVersions(result.data.versions)
  }

  async function openVersions(uid: string) {
    if (versionsFor === uid) {
      setVersionsFor(null)
      return
    }

    await loadVersions(uid)
  }

  async function handleRestore(uid: string, version: number) {
    const ok = await run(`${uid}:restore:${version}`, () => adminRestoreBlob(uid, version))
    if (!ok) return
    toast.success(`Restored version ${version}`)
    await loadVersions(uid)
  }

  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas text-[13px] text-ink-muted">
        Loading…
      </div>
    )
  }

  if (!user) {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas px-5">
        <div className="w-full max-w-[380px] rounded-2xl border border-line bg-surface p-6 text-center">
          <BrandMark size={28} />
          <h1 className="mt-3 text-[16px] font-semibold tracking-[-0.02em]">Owner sign in</h1>
          <p className="mt-1.5 text-[12px] text-ink-muted">
            Only the addresses listed in ADMIN_EMAILS can open this page.
          </p>
          <button
            type="button"
            onClick={() => void signInWithGoogle()}
            className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-lg bg-ink text-[13px] font-semibold text-surface transition-opacity hover:opacity-90"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-[60px] w-full max-w-[1000px] items-center gap-3 px-5">
          <BrandMark size={20} />
          <span className="text-[13px] font-semibold tracking-[-0.02em]">Admin</span>
          <span className="ml-auto hidden text-[12px] text-ink-muted sm:block">{user.email}</span>
          <button
            type="button"
            onClick={() => void signOutSupabase().then(() => window.location.reload())}
            className="inline-flex h-8 items-center rounded-lg border border-line px-2.5 text-[12px] font-medium text-ink-muted transition-colors hover:text-ink"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1000px] px-5 py-6">
        <div className="flex items-center gap-1.5">
          {(['pending', 'licenses', 'ai'] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              aria-pressed={tab === item}
              className={[
                'rounded-full border px-3 py-1.5 text-[12px] font-medium capitalize transition-colors',
                tab === item
                  ? 'border-ink bg-ink text-surface'
                  : 'border-line bg-surface text-ink-muted hover:text-ink',
              ].join(' ')}
            >
              {item === 'pending' ? 'Payments' : item === 'licenses' ? 'Licenses' : 'AI'}
              {item === 'pending' && requests ? ` · ${requests.pending.length}` : ''}
            </button>
          ))}

          <button
            type="button"
            onClick={() => (tab === 'pending' ? reloadRequests() : tab === 'licenses' ? reloadLicenses() : undefined)}
            aria-label="Reload"
            className="ml-auto grid size-8 place-items-center rounded-lg border border-line bg-surface text-ink-muted transition-colors hover:text-ink"
          >
            <RefreshCw className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>

        {error ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/5 px-3 py-2.5 text-[12px] text-danger">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
            {error}
          </div>
        ) : null}

        <div className={tab === 'ai' ? '' : 'hidden'}>
          <AiSettingsPanel />
        </div>

        {tab === 'pending' ? (
          <section className="mt-4 space-y-2">
            {requests === null ? (
              <div className="h-24 animate-pulse rounded-xl border border-line bg-surface/60" />
            ) : requests.pending.length === 0 ? (
              <p className="rounded-xl border border-line bg-surface px-4 py-6 text-center text-[12px] text-ink-muted">
                No payments waiting for review.
              </p>
            ) : (
              requests.pending.map((row) => (
                <div key={row.id} className="rounded-xl border border-line bg-surface p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-ink">{row.email}</p>
                      <p className="mt-0.5 text-[11px] text-ink-muted">
                        {row.plan} · ৳{row.amount_bdt} · {row.method} · {formatTime(row.submitted_at)}
                      </p>
                      <p className="mt-1 font-mono text-[11px] text-ink-muted">
                        txn {row.txn_id}
                        {row.sender_number ? ` · from ${row.sender_number}` : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handleApprove(row.id)}
                        disabled={busy === row.id}
                        className="inline-flex h-8 items-center gap-1 rounded-lg bg-brand px-2.5 text-[12px] font-semibold text-white transition-colors hover:bg-brand-deep disabled:opacity-50"
                      >
                        <Check className="size-3.5" strokeWidth={2.25} aria-hidden="true" />
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRejectId(row.id)
                          setReason('')
                        }}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-line px-2.5 text-[12px] font-medium text-ink-muted transition-colors hover:text-danger"
                      >
                        <X className="size-3.5" strokeWidth={2} aria-hidden="true" />
                        Reject
                      </button>
                    </div>
                  </div>

                  {rejectId === row.id ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                      <input
                        type="text"
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder="Reason for rejection"
                        autoFocus
                        className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 text-[12px] text-ink focus:border-brand focus:ring-2 focus:ring-brand/15 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => void handleReject(row.id)}
                        className="h-8 rounded-lg bg-danger px-2.5 text-[12px] font-semibold text-white"
                      >
                        Send rejection
                      </button>
                      <button
                        type="button"
                        onClick={() => setRejectId(null)}
                        className="h-8 rounded-lg border border-line px-2.5 text-[12px] text-ink-muted"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : null}
                </div>
              ))
            )}

            {requests && requests.recent.length > 0 ? (
              <details className="mt-4 rounded-xl border border-line bg-surface">
                <summary className="cursor-pointer px-4 py-2.5 text-[12px] font-medium text-ink-muted">
                  Recently reviewed ({requests.recent.length})
                </summary>
                <ul className="divide-y divide-line">
                  {requests.recent.map((row) => (
                    <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-2 text-[11px]">
                      <span className="min-w-0 truncate text-ink">{row.email}</span>
                      <span className="shrink-0 text-ink-muted">
                        {row.plan} · {row.status}
                        {row.reject_reason ? ` · ${row.reject_reason}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </section>
        ) : (
          <section className="mt-4 space-y-2">
            {licenses === null ? (
              <div className="h-24 animate-pulse rounded-xl border border-line bg-surface/60" />
            ) : licenses.length === 0 ? (
              <p className="rounded-xl border border-line bg-surface px-4 py-6 text-center text-[12px] text-ink-muted">
                No licenses yet.
              </p>
            ) : (
              licenses.map((row) => (
                <div key={row.uid} className="rounded-xl border border-line bg-surface p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 truncate text-[13px] font-semibold text-ink">
                        {row.email || row.uid}
                        {row.isMaster ? (
                          <span className="rounded-full bg-ink px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-surface uppercase">
                            master
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-[11px] text-ink-muted">
                        {row.plan} · {row.status} ·{' '}
                        {row.expiresAt ? `until ${formatDate(row.expiresAt)}` : 'no expiry'}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {!row.isMaster ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void handleExtend(row.uid, 30)}
                            disabled={busy === `${row.uid}:30`}
                            className="h-8 rounded-lg border border-line px-2 text-[11px] font-medium text-ink-muted hover:text-ink disabled:opacity-50"
                          >
                            +30
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleExtend(row.uid, 365)}
                            disabled={busy === `${row.uid}:365`}
                            className="h-8 rounded-lg border border-line px-2 text-[11px] font-medium text-ink-muted hover:text-ink disabled:opacity-50"
                          >
                            +365
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleRevoke(row.uid)}
                            disabled={busy === `${row.uid}:revoke`}
                            className="h-8 rounded-lg border border-line px-2 text-[11px] font-medium text-ink-muted hover:text-danger disabled:opacity-50"
                          >
                            Revoke
                          </button>
                        </>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void handleResetDevices(row.uid)}
                        disabled={busy === `${row.uid}:devices`}
                        className="h-8 rounded-lg border border-line px-2 text-[11px] font-medium text-ink-muted hover:text-ink disabled:opacity-50"
                      >
                        Reset devices
                      </button>
                      <button
                        type="button"
                        onClick={() => void openVersions(row.uid)}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-line px-2 text-[11px] font-medium text-ink-muted hover:text-ink"
                      >
                        <History className="size-3" strokeWidth={2} aria-hidden="true" />
                        Versions
                      </button>
                    </div>
                  </div>

                  {versionsFor === row.uid ? (
                    <div className="mt-3 border-t border-line pt-3">
                      {versions.length === 0 ? (
                        <p className="text-[11px] text-ink-muted">No earlier versions stored.</p>
                      ) : (
                        <ul className="flex flex-wrap gap-1.5">
                          {versions.map((version) => (
                            <li key={version.version}>
                              <button
                                type="button"
                                onClick={() => void handleRestore(row.uid, version.version)}
                                className="inline-flex h-7 items-center gap-1 rounded-md border border-line px-2 text-[11px] text-ink-muted hover:text-ink"
                              >
                                <ShieldCheck className="size-3" strokeWidth={2} aria-hidden="true" />v
                                {version.version} · {Math.round(version.bytes / 1024)} KB
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </section>
        )}
      </main>
    </div>
  )
}
