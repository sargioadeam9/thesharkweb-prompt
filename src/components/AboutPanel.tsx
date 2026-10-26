import { APP_LICENSE, APP_VERSION } from '../lib/app-info'
import DevelopedByCard from './DevelopedByCard'

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-3 last:border-b-0">
      <dt className="text-[12px] text-ink-muted">{label}</dt>
      <dd className="text-[13px] font-medium text-ink tabular-nums">{value}</dd>
    </div>
  )
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="rounded-md border border-line bg-canvas px-1.5 py-0.5 font-sans text-[10px] leading-none text-ink-muted">
      {children}
    </kbd>
  )
}

function Shortcut({ label, keys }: { label: string; keys: string }) {
  return (
    <li className="flex items-center justify-between gap-3 text-[12px] text-ink">
      {label}
      <Kbd>{keys}</Kbd>
    </li>
  )
}

export default function AboutPanel() {
  return (
    <div className="flex flex-1 items-center justify-center px-5 py-10 lg:px-8 lg:py-12">
      <div className="grid w-full max-w-[820px] gap-8 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:items-center lg:gap-10">
        <DevelopedByCard />

        <div className="space-y-4">
          <dl className="overflow-hidden rounded-2xl border border-line bg-surface">
            <Row label="Version" value={APP_VERSION} />
            <Row label="License" value={`${APP_LICENSE} License`} />
            <Row label="Storage" value="This browser only" />
          </dl>

          <div className="rounded-2xl border border-line bg-surface p-4">
            <p className="text-[11px] font-medium tracking-[0.06em] text-ink-faint">Shortcuts</p>
            <ul className="mt-2.5 space-y-2">
              <Shortcut label="New prompt" keys="N" />
              <Shortcut label="Search" keys="/" />
              <Shortcut label="Close a dialog" keys="Esc" />
            </ul>
          </div>

          <p className="px-1 text-[11px] leading-relaxed text-ink-muted">
            Local-first by design. Prompts never leave this browser, and the JSON backup is the only
            copy that travels.
          </p>
        </div>
      </div>
    </div>
  )
}
