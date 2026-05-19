import {
  buildRocCurveData,
  type BackendFeatureRecord,
  type MlRocCurve,
} from '../../lib/dashboard'
import TutorialInfo from '../common/TutorialInfo'

function RocCurvePlot({
  records,
  roc: backendRoc,
  showNoFraudOverlay = false,
  noFraudOverlayLabel = 'No Fraud Detected',
  isLoading = false,
}: {
  records: BackendFeatureRecord[]
  roc?: MlRocCurve
  showNoFraudOverlay?: boolean
  noFraudOverlayLabel?: string
  isLoading?: boolean
}) {
  const left = 62
  const right = 506
  const top = 18
  const bottom = 190
  const roc = backendRoc ?? buildRocCurveData(records)
  const xToSvg = (value: number) => left + value * (right - left)
  const yToSvg = (value: number) => bottom - value * (bottom - top)
  const displayPoints = [...roc.points].sort(
    (leftPoint, rightPoint) =>
      leftPoint.falsePositiveRate - rightPoint.falsePositiveRate ||
      leftPoint.truePositiveRate - rightPoint.truePositiveRate,
  )
  const polylinePoints = displayPoints
    .map((point) => `${xToSvg(point.falsePositiveRate)},${yToSvg(point.truePositiveRate)}`)
    .join(' ')

  return (
    <div
      data-tour="overview-roc-curve"
      className="relative flex h-full min-w-0 flex-col overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] p-5"
      aria-busy={isLoading}
    >
      {isLoading ? (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center rounded-lg bg-[rgba(255,255,255,0.58)]"
          aria-label="Recomputing ROC curve"
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
      {showNoFraudOverlay ? (
        <div
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[rgba(255,255,255,0.68)] backdrop-blur-[3px]"
          aria-hidden="true"
        >
          <span className="rounded-md border border-[rgba(203,215,207,0.75)] bg-[rgba(255,255,255,0.86)] px-5 py-2.5 text-sm font-semibold text-[var(--ink)] shadow-sm">
            {noFraudOverlayLabel}
          </span>
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-[var(--muted)]">
            ROC Curve
          </p>
          <h3 className="mt-2 text-lg font-semibold text-[var(--ink)]">
            Classification Trade-Off
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="figure-text rounded-md bg-[var(--surface-strong)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
            AUC {roc.auc.toFixed(3)}
          </span>
          <TutorialInfo topic="roc-curve" placement="up" />
        </div>
      </div>
      {records.length > 0 ? (
        <div className="mt-5 flex flex-1 items-center">
          <svg viewBox="0 0 560 238" className="mt-2 h-auto w-full max-w-full">
            {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
              <g key={tick}>
                <line
                  x1={xToSvg(tick)}
                  y1={top}
                  x2={xToSvg(tick)}
                  y2={bottom}
                  stroke="var(--chart-grid)"
                  strokeDasharray="3 5"
                  strokeWidth="1.1"
                />
                <line
                  x1={left}
                  y1={yToSvg(tick)}
                  x2={right}
                  y2={yToSvg(tick)}
                  stroke="var(--chart-grid)"
                  strokeDasharray="3 5"
                  strokeWidth="1.1"
                />
                <text x={xToSvg(tick)} y="210" textAnchor="middle" fill="var(--muted)" fontSize="11" fontWeight="600">
                  {tick.toFixed(2)}
                </text>
                <text x="52" y={yToSvg(tick) + 4} textAnchor="end" fill="var(--muted)" fontSize="11" fontWeight="600">
                  {tick.toFixed(2)}
                </text>
              </g>
            ))}

            <line x1={left} y1={top} x2={left} y2={bottom} stroke="var(--chart-axis)" strokeWidth="1.6" />
            <line x1={left} y1={bottom} x2={right} y2={bottom} stroke="var(--chart-axis)" strokeWidth="1.6" />
            <line
              x1={left}
              y1={bottom}
              x2={right}
              y2={top}
              stroke="var(--chart-axis-soft)"
              strokeWidth="1.2"
              strokeDasharray="5 5"
            />
            <polyline
              points={polylinePoints}
              fill="none"
              stroke="var(--chart-bar)"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {displayPoints.map((point) => (
              <circle
                key={point.threshold}
                cx={xToSvg(point.falsePositiveRate)}
                cy={yToSvg(point.truePositiveRate)}
                r="3.6"
                fill="var(--chart-bar)"
                stroke="var(--surface-raised)"
                strokeWidth="1"
              />
            ))}

            <text
              x={(left + right) / 2}
              y="234"
              textAnchor="middle"
              fill="var(--muted)"
              fontSize="12"
              fontWeight="600"
            >
              False positive rate
            </text>
            <text
              x="18"
              y={(top + bottom) / 2}
              textAnchor="middle"
              fill="var(--muted)"
              fontSize="12"
              fontWeight="600"
              transform={`rotate(-90 18 ${(top + bottom) / 2})`}
            >
              True positive rate
            </text>
          </svg>
        </div>
      ) : (
        <p className="mt-5 text-sm text-[var(--muted)]">
          No records available for ROC evaluation.
        </p>
      )}
    </div>
  )
}

export default RocCurvePlot
