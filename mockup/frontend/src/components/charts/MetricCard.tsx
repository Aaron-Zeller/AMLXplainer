import type { MetricCardProps } from '../../lib/dashboard'

function MetricCard({ label, value, detail }: MetricCardProps) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-white/85 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-3 break-words text-3xl font-semibold tracking-[-0.04em] text-[var(--ink)]">
        {value}
      </p>
      <p className="mt-2 text-sm text-[var(--muted)]">{detail}</p>
    </div>
  )
}

export default MetricCard
