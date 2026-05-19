import type { MetricCardProps } from '../../lib/dashboard'
import { useAnimatedNumber } from '../../hooks/useAnimatedNumber'
import TutorialInfo, { type TutorialTopic } from '../common/TutorialInfo'

const metricTutorialTopics: Partial<Record<string, TutorialTopic>> = {
  Accuracy: 'accuracy',
  Precision: 'precision',
  Recall: 'recall',
  'F1 Score': 'f1-score',
}

function MetricCard({
  label,
  value,
  detail,
  className = '',
  displayMode = 'number',
  isLoading = false,
}: MetricCardProps & { className?: string; displayMode?: 'number' | 'progress'; isLoading?: boolean }) {
  const tutorialTopic = metricTutorialTopics[label]
  const isPercent = value.endsWith('%')
  const numericValue = isPercent ? Number(value.slice(0, -1)) : Number(value)
  const hasNumericValue = Number.isFinite(numericValue)
  const animatedValue = useAnimatedNumber(hasNumericValue ? numericValue : 0)
  const displayValue = !hasNumericValue
    ? value
    : isPercent
      ? `${animatedValue.toFixed(1)}%`
      : animatedValue.toFixed(3)
  const progressSourceValue = hasNumericValue ? numericValue : 0
  const progressPercent = Math.max(
    0,
    Math.min(100, isPercent ? progressSourceValue : progressSourceValue * 100),
  )
  const progressDisplayValue = hasNumericValue ? `${progressPercent.toFixed(1)}%` : value

  return (
    <div
      className={`relative overflow-hidden rounded-md border border-[var(--line)] bg-[var(--surface-raised)] p-4 ${className}`}
      aria-busy={isLoading}
    >
      {isLoading ? (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-[rgba(255,255,255,0.58)]"
          aria-label={`Recomputing ${label}`}
          role="status"
        >
          <svg className="loading-desk__mark" viewBox="0 0 132 64" aria-hidden="true">
            <line x1="22" y1="10" x2="22" y2="54" />
            <rect className="loading-desk__bar loading-desk__bar--one" x="34" y="14" width="74" height="8" rx="4" />
            <rect className="loading-desk__bar loading-desk__bar--two" x="34" y="28" width="58" height="8" rx="4" />
            <rect className="loading-desk__bar loading-desk__bar--three" x="34" y="42" width="86" height="8" rx="4" />
            <circle className="loading-desk__dot loading-desk__dot--one" cx="112" cy="18" r="3" />
            <circle className="loading-desk__dot loading-desk__dot--two" cx="96" cy="32" r="3" />
            <circle className="loading-desk__dot loading-desk__dot--three" cx="124" cy="46" r="3" />
          </svg>
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-[var(--muted)]">
          {label}
        </p>
        {tutorialTopic ? <TutorialInfo topic={tutorialTopic} /> : null}
      </div>
      {displayMode === 'progress' && hasNumericValue ? (
        <div className="mt-4">
          <div className="flex items-center gap-3">
            <div
              className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--surface-strong)]"
              role="progressbar"
              aria-label={label}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Number(progressPercent.toFixed(1))}
            >
              <div
                className="h-full rounded-full bg-[var(--line-strong)] transition-[width] duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="figure-text w-12 text-right text-sm font-semibold tabular-nums text-[var(--ink)]">
              {progressDisplayValue}
            </span>
          </div>
        </div>
      ) : (
        <p className="figure-text mt-3 break-words text-2xl font-semibold tabular-nums text-[var(--ink)]">
          {displayValue}
        </p>
      )}
      <p className="mt-2 text-sm text-[var(--muted)]">{detail}</p>
    </div>
  )
}

export default MetricCard
