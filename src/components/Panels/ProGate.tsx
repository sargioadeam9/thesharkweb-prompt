import type { ReactNode } from 'react'
import { Lock } from 'lucide-react'
import type { Gate } from '../../lib/nav'
import { useProAccess, gateState } from '../../lib/entitlement'
import EmptyState from './EmptyState'

export default function ProGate({
  gate,
  title,
  description,
  onUpgrade,
  children,
}: {
  gate: Gate
  title: string
  description: string
  onUpgrade: () => void
  children: ReactNode
}) {
  const { license, loading } = useProAccess()
  const state = gateState(gate, license, loading)

  if (state === 'loading') {
    return (
      <div className="mx-auto w-full max-w-[500px] px-5 py-10">
        <div className="h-40 animate-pulse rounded-2xl border border-line bg-surface/60" />
      </div>
    )
  }

  if (state === 'upsell') {
    return (
      <EmptyState
        icon={Lock}
        title={title}
        description={description}
        action={
          <button
            type="button"
            onClick={onUpgrade}
            className="inline-flex h-10 items-center rounded-lg bg-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            সাবস্ক্রিপশন দেখুন
          </button>
        }
      />
    )
  }

  return <>{children}</>
}
