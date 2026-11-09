import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import EmptyState from './EmptyState'

export default function PlaceholderPanel({
  icon,
  title,
  description,
  badge,
  action,
}: {
  icon: LucideIcon
  title: string
  description: string
  badge?: 'soon' | 'pro'
  action?: ReactNode
}) {
  const badgeEl = badge ? (
    <div className="mb-4 flex justify-center">
      <span
        className={
          badge === 'pro'
            ? 'rounded-full bg-brand-tint px-2.5 py-1 text-[10px] font-bold tracking-wide text-brand-deep uppercase'
            : 'rounded-full bg-canvas px-2.5 py-1 text-[10px] font-bold tracking-wide text-ink-faint uppercase'
        }
      >
        {badge === 'pro' ? 'Pro' : 'Coming Soon'}
      </span>
    </div>
  ) : null

  return (
    <div>
      {badgeEl}
      <EmptyState icon={icon} title={title} description={description} action={action} />
    </div>
  )
}
