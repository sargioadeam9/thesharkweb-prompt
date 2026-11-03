import { useEffect, useState } from 'react'
import { Check, Clock, Cloud, LogOut, MessageCircle, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { fetchPlans } from '../lib/api-client'
import { refreshLicense, useLicense } from '../lib/license-store'
import { getSupabase, signInWithGoogle, signOutSupabase } from '../lib/supabase'
import { getSyncStatus, syncNow } from '../lib/sync'
import type { Plan, PaymentDestinations } from '../lib/sync-types'
import PaymentForm from './PaymentForm'
import { TERMS_TEXT } from '../lib/legal'

const SUPPORT_WHATSAPP = '8801896444400'

function whatsappLink(message: string): string {
  return `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(message)}`
}

function formatDate(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function planPerks(plan: Plan): string[] {
  const devices =
    plan.maxDevices === null ? 'Unlimited devices' : `${plan.maxDevices} device${plan.maxDevices === 1 ? '' : 's'}`
  const prompts =
    plan.maxPrompts === null ? 'Unlimited prompts' : `${plan.maxPrompts} prompts`
  const tail = plan.days === null ? 'Pay once, keep sync forever' : 'Cancel anytime'

  return [`Cloud sync`, devices, prompts, tail]
}

function SectionCard({
  tone = 'plain',
  children,
}: {
  tone?: 'plain' | 'brand'
  children: React.ReactNode
}) {
  return (
    <div
      className={[
        'rounded-2xl border p-5',
        tone === 'brand' ? 'border-brand/25 bg-brand-tint/25' : 'border-line bg-surface',
      ].join(' ')}
    >
      {children}
    </div>
  )
}

function PlanCard({
  plan,
  featured,
  onSelect,
}: {
  plan: Plan
  featured: boolean
  onSelect: () => void
}) {
  return (
    <div
      className={[
        'flex flex-col rounded-2xl border p-4 text-left transition-colors',
        featured ? 'border-brand/40 bg-brand-tint/20' : 'border-line bg-surface',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-semibold text-ink">{plan.label}</p>
        {featured ? (
          <span className="rounded-full bg-brand-tint px-2 py-0.5 text-[10px] font-semibold tracking-wide text-brand-deep uppercase">
            Best value
          </span>
        ) : null}
      </div>

      <p className="mt-2 text-[22px] leading-none font-semibold tracking-[-0.02em] text-ink">
        ৳{plan.priceBdt}
        <span className="ml-1 text-[11px] font-medium text-ink-muted">
          {plan.days === 30 ? '/ month' : plan.days === 365 ? '/ year' : 'one-time'}
        </span>
      </p>

      <ul className="mt-3 flex-1 space-y-1.5">
        {planPerks(plan).map((perk) => (
          <li key={perk} className="flex items-start gap-1.5 text-[12px] text-ink-muted">
            <Check className="mt-0.5 size-3.5 shrink-0 text-brand-deep" strokeWidth={2.25} aria-hidden="true" />
            {perk}
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onSelect}
        className={[
          'mt-4 inline-flex h-9 items-center justify-center rounded-lg px-3 text-[12px] font-semibold transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
          featured
            ? 'bg-brand text-white hover:bg-brand-deep'
            : 'border border-line bg-surface text-ink hover:border-ink-faint/50 hover:bg-canvas',
        ].join(' ')}
      >
        Choose {plan.label}
      </button>
    </div>
  )
}

export default function SyncPanel() {
  const { user, license, loading } = useLicense()
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [payment, setPayment] = useState<PaymentDestinations | null>(null)
  const [plansFailed, setPlansFailed] = useState(false)
  const [chosen, setChosen] = useState<Plan | null>(null)
  const [busy, setBusy] = useState(false)
  const [termsOpen, setTermsOpen] = useState(false)

  useEffect(() => {
    let alive = true

    void getSupabase().then((client) => {
      if (!alive) return
      setConfigured(client !== null)
      if (!client) return

      void fetchPlans().then((result) => {
        if (!alive) return
        if (result.ok && result.data.plans.length > 0) {
          setPlans(result.data.plans)
          setPayment(result.data.payment)
        } else {
          setPlansFailed(true)
        }
      })
    })

    return () => {
      alive = false
    }
  }, [])

  const status = configured === false ? 'unavailable' : loading ? 'loading' : getSyncStatus()

  async function handleSignIn() {
    setBusy(true)
    try {
      await signInWithGoogle()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not start sign in')
      setBusy(false)
    }
  }

  async function handleSignOut() {
    setBusy(true)
    try {
      await signOutSupabase()
      await refreshLicense()
    } catch {
      toast.error('Could not sign out')
    } finally {
      setBusy(false)
    }
  }

  async function handleSyncNow() {
    setBusy(true)
    try {
      const result = await syncNow()
      if (result.ok) {
        toast.success(`Synced · version ${result.version}`)
        if (result.warning === 'size') {
          toast.warning('Your library is getting large. Sync still works, but export a backup.')
        }
        await refreshLicense()
        return
      }

      if (result.reason === 'device_limit') {
        toast.error(
          `You can sync ${result.maxDevices ?? 3} devices. Ask support to reset a device you no longer use.`,
        )
      } else if (result.reason === 'prompt_limit') {
        toast.error('Monthly sync includes 500 prompts. Upgrade to Annual for unlimited prompts.')
      } else if (result.reason === 'no_license') {
        toast.error('Your sync plan ended. Your prompts are safe — renew to sync again.')
      } else {
        toast.error(result.message ?? 'Sync did not finish. Try again.')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Sync did not finish')
    } finally {
      setBusy(false)
    }
  }

  const header = (
    <div className="mb-5">
      <h2 className="text-[20px] font-semibold tracking-[-0.025em]">Live cloud sync</h2>
      <p className="mt-1 text-[13px] text-ink-muted">
        Keep this library the same on every device. Local use stays free and complete without it.
      </p>
    </div>
  )

  if (status === 'unavailable') {
    return (
      <div className="mx-auto w-full max-w-[760px] px-5 py-8 lg:px-8 lg:py-10">
        {header}
        <SectionCard>
          <p className="flex items-center gap-2 text-[13px] font-medium text-ink">
            <Cloud className="size-4 text-ink-faint" strokeWidth={1.75} aria-hidden="true" />
            Sync is not available yet.
          </p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-ink-muted">
            Everything you already have keeps working. Export a backup from Backup &amp; data if you
            want a copy outside this browser.
          </p>
        </SectionCard>
      </div>
    )
  }

  if (status === 'loading') {
    return (
      <div className="mx-auto w-full max-w-[760px] px-5 py-8 lg:px-8 lg:py-10">
        {header}
        <div className="h-28 animate-pulse rounded-2xl border border-line bg-surface/60" />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[860px] px-5 py-8 lg:px-8 lg:py-10">
      {header}

      {status === 'signed_out' ? (
        <SectionCard tone="brand">
          <span
            aria-hidden="true"
            className="mb-4 grid size-11 place-items-center rounded-2xl border border-line bg-surface shadow-sm"
          >
            <Cloud className="size-5 text-brand-deep" strokeWidth={1.75} />
          </span>
          <p className="text-[15px] font-semibold tracking-[-0.02em]">
            Sync keeps this library the same on every device.
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
            Sign in with Google, pick a plan, and your prompts and tasks follow you. Nothing is
            uploaded until you activate a plan.
          </p>
          <button
            type="button"
            onClick={() => void handleSignIn()}
            disabled={busy}
            className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-ink px-4 text-[13px] font-semibold text-surface transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
          >
            <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M21.35 11.1H12v2.9h5.35c-.25 1.5-1.75 4.4-5.35 4.4a5.9 5.9 0 0 1 0-11.8c1.7 0 2.85.72 3.5 1.34l2.4-2.31A9.4 9.4 0 0 0 12 2.6a9.4 9.4 0 1 0 0 18.8c5.42 0 9-3.8 9-9.16 0-.62-.07-1.09-.15-1.54Z"
              />
            </svg>
            Sign in with Google
          </button>
        </SectionCard>
      ) : null}

      {status === 'offline' ? (
        <SectionCard>
          <p className="flex items-center gap-2 text-[13px] font-medium text-ink">
            <Cloud className="size-4 text-ink-faint" strokeWidth={1.75} aria-hidden="true" />
            You are offline. Sync will work when you are back.
          </p>
        </SectionCard>
      ) : null}

      {status === 'pending' ? (
        <SectionCard>
          <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
            <Clock className="size-4 text-brand-deep" strokeWidth={1.75} aria-hidden="true" />
            We received your request. Activation usually takes a few minutes.
          </p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-ink-muted">
            We check every payment by hand. Need it faster? Message us for instant 24/7 live
            support.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void refreshLicense()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[12px] font-medium text-ink transition-colors hover:border-ink-faint/50 hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <RefreshCw className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
              Check again
            </button>
            <a
              href={whatsappLink(
                `Hi! I need help with my TheSharkWebPrompt Live Sync activation${
                  user?.email ? ` — ${user.email}` : ''
                }.`,
              )}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#25D366] px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <MessageCircle className="size-3.5" strokeWidth={2} aria-hidden="true" />
              WhatsApp support · 24/7
            </a>
          </div>
        </SectionCard>
      ) : null}

      {status === 'active' && license ? (
        <div className="space-y-4">
          <SectionCard tone="brand">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                  <ShieldCheck className="size-4 text-brand-deep" strokeWidth={1.75} aria-hidden="true" />
                  {license.expiresAt
                    ? `Sync active until ${formatDate(license.expiresAt)}`
                    : license.plan === 'master'
                      ? 'Sync active — owner account'
                      : 'Sync active — lifetime'}
                </p>
                <p className="mt-1 text-[12px] text-ink-muted">
                  {license.maxDevices === null
                    ? 'Unlimited devices'
                    : `${license.devices?.length ?? 0} of ${license.maxDevices} devices`}
                  {license.maxPrompts === null ? ' · unlimited prompts' : ` · up to ${license.maxPrompts} prompts`}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleSyncNow()}
                  disabled={busy}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3.5 text-[12px] font-semibold text-white transition-colors hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
                >
                  <RefreshCw
                    className={busy ? 'size-3.5 animate-spin' : 'size-3.5'}
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                  {busy ? 'Syncing…' : 'Sync now'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[12px] font-medium text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  <LogOut className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
                  Sign out
                </button>
              </div>
            </div>
          </SectionCard>

          <SectionCard>
            <p className="text-[12px] font-semibold text-ink">Devices</p>
            {license.devices && license.devices.length > 0 ? (
              <ul className="mt-2 space-y-1.5">
                {license.devices.map((device) => (
                  <li
                    key={device.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-line bg-canvas/60 px-3 py-2 text-[12px]"
                  >
                    <span className="min-w-0 truncate text-ink">{device.label ?? 'Unknown device'}</span>
                    <span className="shrink-0 text-[11px] text-ink-faint">
                      seen {formatDate(device.lastSeenAt)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1.5 text-[12px] text-ink-muted">No devices have synced yet.</p>
            )}
            <p className="mt-2 text-[11px] text-ink-faint">
              Removing a device is done from support.{' '}
              <a
                href={whatsappLink(
                  `Hi! Please remove a device from my TheSharkWebPrompt Live Sync account${
                    user?.email ? ` — ${user.email}` : ''
                  }. The device I no longer use is: `,
                )}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-brand-deep underline underline-offset-2 hover:no-underline"
              >
                Message us on WhatsApp
              </a>{' '}
              with the device you no longer use.
            </p>
          </SectionCard>
        </div>
      ) : null}

      {(status === 'no_license' || status === 'expired') && !chosen ? (
        <div className="space-y-4">
          {status === 'expired' ? (
            <SectionCard>
              <p className="text-[13px] font-semibold text-ink">
                Your sync plan ended. Your prompts are safe — renew to sync again.
              </p>
              <p className="mt-1 text-[12px] text-ink-muted">
                Everything in this browser keeps working, including export.
              </p>
            </SectionCard>
          ) : null}

          {plans.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-3">
              {plans.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  featured={plan.id === 'sync_annual'}
                  onSelect={() => setChosen(plan)}
                />
              ))}
            </div>
          ) : plansFailed ? (
            <SectionCard>
              <p className="text-[13px] font-medium text-ink">Plans could not be loaded.</p>
              <p className="mt-1 text-[12px] text-ink-muted">
                Check your connection and reload. Your local library is untouched.
              </p>
            </SectionCard>
          ) : (
            <div className="h-32 animate-pulse rounded-2xl border border-line bg-surface/60" />
          )}
        </div>
      ) : null}

      {chosen && payment ? (
        <PaymentForm
          plan={chosen}
          payment={payment}
          email={user?.email ?? ''}
          reference={user ? `TSW-${user.id.slice(0, 6).toUpperCase()}` : 'TSW-'}
          onCancel={() => setChosen(null)}
          onSubmitted={() => {
            setChosen(null)
            void refreshLicense()
          }}
        />
      ) : null}

      <div className="mt-6 rounded-2xl border border-line bg-surface">
        <button
          type="button"
          onClick={() => setTermsOpen((open) => !open)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-[12px] font-medium text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
        >
          <span className="flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-ink-faint" strokeWidth={1.75} aria-hidden="true" />
            What sync does with your data
          </span>
          <span aria-hidden="true" className="text-[11px] text-ink-faint">
            {termsOpen ? 'Hide' : 'Read'}
          </span>
        </button>
        {termsOpen ? (
          <p className="border-t border-line px-4 py-3 text-[12px] leading-relaxed whitespace-pre-line text-ink-muted">
            {TERMS_TEXT}
          </p>
        ) : null}
      </div>

      {!chosen && user?.email ? (
        <p className="mt-4 text-center text-[11px] text-ink-faint">Signed in as {user.email}</p>
      ) : null}
    </div>
  )
}
