import {
  type DashboardPayload,
  featureLabelMap,
} from '../../lib/dashboard'

function ShapPlot({
  rows,
}: {
  rows: DashboardPayload['shap']
}) {
  const svgWidth = 590
  const labelX = 110
  const left = 162
  const plotWidth = 320
  const top = 18
  const rowHeight = 50
  const xMin = -2.5
  const xMax = 2.5
  const xToSvg = (value: number) => left + ((value - xMin) / (xMax - xMin)) * plotWidth
  const colorForFeatureValue = (value: number) => {
    const clamped = Math.max(0, Math.min(1, value))
    const red = Math.round(30 + clamped * 225)
    const green = Math.round(132 - clamped * 50)
    const blue = Math.round(229 - clamped * 140)

    return `rgb(${red}, ${green}, ${blue})`
  }
  const svgHeight = top + rows.length * rowHeight + 46

  return (
    <div data-tour="overview-numerical-shap" className="flex h-full min-w-0 flex-col rounded-[26px] border border-[var(--line)] bg-white/82 p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
            SHAP Plot
          </p>
          <h3 className="mt-2 text-lg font-semibold text-[var(--ink)]">
            Numerical Feature Beeswarm
          </h3>
        </div>
      </div>

      {rows.length > 0 ? (
        <div className="mt-5 flex flex-1 items-center">
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="mx-auto h-auto w-full max-w-full"
          >
            {rows.map((row, rowIndex) => {
              const y = top + rowIndex * rowHeight + 10

              return (
                <g key={row.featureKey}>
                  <line
                    x1={left}
                    y1={y}
                    x2={left + plotWidth}
                    y2={y}
                    stroke="#dbe4eb"
                    strokeDasharray="2 5"
                  />
                  <text
                    x={labelX}
                    y={y + 4}
                    textAnchor="end"
                    fill="var(--ink)"
                    fontSize="12"
                    fontWeight="500"
                  >
                    {featureLabelMap[row.featureKey]}
                  </text>
                  {row.points.map((point, pointIndex) => (
                    <circle
                      key={`${row.featureKey}-${pointIndex}`}
                      cx={xToSvg(point.shapValue)}
                      cy={y + point.jitter * 10}
                      r="1.9"
                      fill={colorForFeatureValue(point.featureValue)}
                    />
                  ))}
                </g>
              )
            })}

            {[xMin, -2, -1, 0, 1, 2, xMax].map((tick) => {
              const x = xToSvg(tick)

              return (
                <g key={tick}>
                  <line
                    x1={x}
                    y1={top + rows.length * rowHeight + 4}
                    x2={x}
                    y2={top + rows.length * rowHeight + 10}
                    stroke="var(--muted)"
                    strokeWidth="1.2"
                  />
                  {tick !== xMin && tick !== xMax ? (
                    <text
                      x={x}
                      y={top + rows.length * rowHeight + 28}
                      textAnchor="middle"
                      fill="var(--muted)"
                      fontSize="11"
                    >
                      {tick}
                    </text>
                  ) : null}
                </g>
              )
            })}

            <line
              x1={xToSvg(0)}
              y1={top - 4}
              x2={xToSvg(0)}
              y2={top + rows.length * rowHeight - 8}
              stroke="#bfcbd6"
              strokeWidth="1.4"
            />
            <line
              x1={left}
              y1={top + rows.length * rowHeight + 4}
              x2={left + plotWidth}
              y2={top + rows.length * rowHeight + 4}
              stroke="var(--ink)"
              strokeWidth="1.2"
            />

            <text
              x={left + plotWidth / 2}
              y={svgHeight + 10}
              textAnchor="middle"
              fill="var(--ink)"
              fontSize="13"
            >
              SHAP value (impact on model output)
            </text>

            <defs>
              <linearGradient id="shap-feature-scale" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="#1e88e5" />
                <stop offset="100%" stopColor="#ff0d57" />
              </linearGradient>
            </defs>

            <rect
              x={left + plotWidth + 26}
              y={top}
              width="4"
              height={rows.length * rowHeight - 8}
              fill="url(#shap-feature-scale)"
            />
            <text
              x={left + plotWidth + 36}
              y={top + 6}
              fill="var(--ink)"
              fontSize="11"
            >
              High
            </text>
            <text
              x={left + plotWidth + 36}
              y={top + rows.length * rowHeight - 2}
              fill="var(--ink)"
              fontSize="11"
            >
              Low
            </text>
            <text
              x={left + plotWidth + 78}
              y={top + rows.length * rowHeight / 2}
              textAnchor="middle"
              fill="var(--ink)"
              fontSize="12"
              transform={`rotate(-90 ${left + plotWidth + 78} ${top + rows.length * rowHeight / 2})`}
            >
              Feature value
            </text>
          </svg>
        </div>
      ) : (
        <p className="mt-5 text-sm text-[var(--muted)]">
          Select at least one feature to populate the SHAP plot.
        </p>
      )}
    </div>
  )
}

export default ShapPlot
