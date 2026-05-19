import {
  formatCompactNumber,
  type DashboardPayload,
} from '../../lib/dashboard'
import { useAnimatedNumber } from '../../hooks/useAnimatedNumber'
import TutorialInfo from '../common/TutorialInfo'

function AnimatedCount({ value, animated = true }: { value: number; animated?: boolean }) {
  const animatedValue = useAnimatedNumber(Math.max(0, value), 700)
  const displayValue = animated ? animatedValue : value

  return <>{formatCompactNumber(Math.max(0, Math.round(displayValue)))}</>
}

function ConfusionMatrixCard({
  data,
  isStreaming = false,
}: {
  data: DashboardPayload['confusionMatrix']
  isStreaming?: boolean
}) {
  const displayData = {
    total: Math.max(0, data.total),
    alertCount: Math.max(0, data.alertCount),
    truePositive: Math.max(0, data.truePositive),
    falsePositive: Math.max(0, data.falsePositive),
    falseNegative: Math.max(0, data.falseNegative),
    trueNegative: Math.max(0, data.trueNegative),
  }
  const animatedAlertCount = useAnimatedNumber(displayData.alertCount, 700)
  const alertCount = isStreaming ? displayData.alertCount : animatedAlertCount
  const cells = [
    {
      label: 'True Positive',
      value: displayData.truePositive,
      tone: 'bg-[var(--semantic-good-soft)] text-[var(--semantic-good)]',
    },
    {
      label: 'False Positive',
      value: displayData.falsePositive,
      tone: 'bg-[var(--semantic-bad-soft)] text-[var(--semantic-bad)]',
    },
    {
      label: 'False Negative',
      value: displayData.falseNegative,
      tone: 'bg-[var(--semantic-bad-soft)] text-[var(--semantic-bad)]',
    },
    {
      label: 'True Negative',
      value: displayData.trueNegative,
      tone: 'bg-[var(--surface-strong)] text-[var(--ink)]',
    },
  ] as const

  return (
    <div
      data-tour="overview-confusion-matrix"
      className="flex min-h-[260px] min-w-0 flex-col rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] p-5 min-[900px]:min-h-[300px] min-[1200px]:min-h-[330px]"
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-[var(--muted)]">
            Confusion Matrix
          </p>
          <h3 className="mt-2 text-lg font-semibold text-[var(--ink)]">
            Validation Snapshot
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="figure-text rounded-md bg-[var(--surface-strong)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
            {formatCompactNumber(Math.max(0, Math.round(alertCount)))} Alerts
          </span>
          <TutorialInfo topic="confusion-matrix" />
        </div>
      </div>

      <div className="mt-5 grid flex-1 grid-cols-2 gap-3">
        {cells.map((cell) => (
          <div key={cell.label} className={`flex flex-col justify-center rounded-md p-4 ${cell.tone}`}>
            <p className="text-xs font-semibold opacity-80">
              {cell.label}
            </p>
            <p className="figure-text mt-2 break-words text-2xl font-semibold tabular-nums">
              <AnimatedCount value={cell.value} animated={!isStreaming} />
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default ConfusionMatrixCard
