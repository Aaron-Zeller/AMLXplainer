import {
  formatCompactNumber,
  type DashboardPayload,
} from '../../lib/dashboard'

function ConfusionMatrixCard({ data }: { data: DashboardPayload['confusionMatrix'] }) {
  const cells = [
    {
      label: 'True Positive',
      value: String(data.truePositive),
      tone: 'bg-[var(--accent-soft)] text-[var(--accent)]',
    },
    {
      label: 'False Positive',
      value: String(data.falsePositive),
      tone: 'bg-[var(--signal-soft)] text-[var(--signal)]',
    },
    {
      label: 'False Negative',
      value: String(data.falseNegative),
      tone: 'bg-[var(--signal-soft)] text-[var(--signal)]',
    },
    {
      label: 'True Negative',
      value: String(data.trueNegative),
      tone: 'bg-[var(--surface-strong)] text-[var(--ink)]',
    },
  ] as const

  return (
    <div data-tour="overview-confusion-matrix" className="min-w-0 rounded-[26px] border border-[var(--line)] bg-white/82 p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
            Confusion Matrix
          </p>
          <h3 className="mt-2 text-lg font-semibold text-[var(--ink)]">
            Validation Snapshot
          </h3>
        </div>
        <span className="rounded-full bg-[var(--surface-strong)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
          {formatCompactNumber(data.alertCount)} Alerts
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        {cells.map((cell) => (
          <div key={cell.label} className={`rounded-2xl p-4 ${cell.tone}`}>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] opacity-80">
              {cell.label}
            </p>
            <p className="mt-2 break-words text-3xl font-semibold tracking-[-0.04em]">
              {formatCompactNumber(Number(cell.value))}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default ConfusionMatrixCard
