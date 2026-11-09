import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-[400px] text-center">
        <span
          aria-hidden="true"
          className="mx-auto mb-6 grid size-11 place-items-center rounded-2xl border border-line bg-surface shadow-sm"
        >
          <Icon className="size-5 text-ink-muted" strokeWidth={1.75} />
        </span>
        <h2 className="text-[20px] font-semibold tracking-[-0.025em] text-balance">{title}</h2>
        <p className="mx-auto mt-2.5 max-w-[340px] text-[14px] leading-relaxed text-pretty text-ink-muted">
          {description}
        </p>
        {action ? <div className="mt-5">{action}</div> : null}
      </div>
    </div>
  )
}
