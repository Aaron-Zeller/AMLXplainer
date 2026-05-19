import {
  buildRocCurveData,
  type BackendFeatureRecord,
} from '../../lib/dashboard'

function RocCurvePlot({ records }: { records: BackendFeatureRecord[] }) {
  const left = 62
  const right = 506
  const top = 18
  const bottom = 190
  const roc = buildRocCurveData(records)
  const xToSvg = (value: number) => left + value * (right - left)
  const yToSvg = (value: number) => bottom - value * (bottom - top)
  const polylinePoints = roc.points
    .map((point) => `${xToSvg(point.falsePositiveRate)},${yToSvg(point.truePositiveRate)}`)
    .join(' ')

  return (
    <div data-tour="overview-roc-curve" className="flex min-w-0 flex-col rounded-[26px] border border-[var(--line)] bg-white/82 p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
            ROC Curve
          </p>
          <h3 className="mt-2 text-lg font-semibold text-[var(--ink)]">
            Classification Trade-Off
          </h3>
        </div>
        <span className="rounded-full bg-[var(--surface-strong)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
          AUC {roc.auc.toFixed(3)}
        </span>
      </div>
      {records.length > 0 ? (
        <div className="mt-5 flex flex-1 items-center">
          <svg viewBox="0 0 560 238" className="mt-2 h-[176px] w-full sm:h-[194px] min-[900px]:h-[214px]">
            {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
              <g key={tick}>
                <line
                  x1={xToSvg(tick)}
                  y1={top}
                  x2={xToSvg(tick)}
                  y2={bottom}
                  stroke="#dbe4eb"
                  strokeDasharray="3 5"
                />
                <line
                  x1={left}
                  y1={yToSvg(tick)}
                  x2={right}
                  y2={yToSvg(tick)}
                  stroke="#dbe4eb"
                  strokeDasharray="3 5"
                />
                <text x={xToSvg(tick)} y="210" textAnchor="middle" fill="var(--muted)" fontSize="11" fontWeight="600">
                  {tick.toFixed(2)}
                </text>
                <text x="52" y={yToSvg(tick) + 4} textAnchor="end" fill="var(--muted)" fontSize="11" fontWeight="600">
                  {tick.toFixed(2)}
                </text>
              </g>
            ))}

            <line x1={left} y1={top} x2={left} y2={bottom} stroke="var(--line-strong)" strokeWidth="1.5" />
            <line x1={left} y1={bottom} x2={right} y2={bottom} stroke="var(--line-strong)" strokeWidth="1.5" />
            <line
              x1={left}
              y1={bottom}
              x2={right}
              y2={top}
              stroke="#bfcbd6"
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
            {roc.points.map((point) => (
              <circle
                key={point.threshold}
                cx={xToSvg(point.falsePositiveRate)}
                cy={yToSvg(point.truePositiveRate)}
                r="3.2"
                fill="var(--chart-bar)"
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
