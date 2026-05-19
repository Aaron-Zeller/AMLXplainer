import { useState } from 'react'
import { createPortal } from 'react-dom'

import {
  type BackendFeatureRecord,
  type DashboardPayload,
  type FeatureKey,
  featureLabelMap,
  formatAlertTime,
  formatCompactAmount,
  scoreTransactionRisk,
} from '../../lib/dashboard'
import TutorialInfo from '../common/TutorialInfo'

type BeeswarmTooltip = {
  x: number
  y: number
  featureLabel: string
  shapValue: number
}

function ShapPlot({
  rows,
  records,
  selectedFeatures,
  onSelectRecord,
  isLoading = false,
}: {
  rows: DashboardPayload['shap']
  records: BackendFeatureRecord[]
  selectedFeatures: FeatureKey[]
  onSelectRecord?: (recordKey: string) => void
  isLoading?: boolean
}) {
  const [tooltip, setTooltip] = useState<BeeswarmTooltip | null>(null)
  const [previewRecordKey, setPreviewRecordKey] = useState<string | null>(null)
  const selectedFeatureSet = new Set(selectedFeatures)
  const recordByKey = new Map(
    records.map((record) => [record.recordKey ?? String(record.id ?? ''), record] as const),
  )
  const previewRecord = previewRecordKey ? recordByKey.get(previewRecordKey) ?? null : null
  const previewRows = previewRecord
    ? [
        ['Timestamp', formatAlertTime(previewRecord.timestamp)],
        ['From Bank', previewRecord.fromBank],
        ['From Account', previewRecord.fromAccount],
        ['From Country', previewRecord.fromCountry],
        ['To Bank', previewRecord.toBank],
        ['To Account', previewRecord.toAccount],
        ['To Country', previewRecord.toCountry],
        ['Amount Paid', formatCompactAmount(previewRecord.amountPaid, previewRecord.paymentCurrency)],
        ['Amount Received', formatCompactAmount(previewRecord.amountReceived, previewRecord.receivingCurrency)],
        ['Payment Format', previewRecord.paymentFormat],
      ]
    : []
  const svgWidth = 590
  const labelX = 96
  const left = 190
  const plotWidth = 292
  const top = 34
  const rowHeight = 92
  const maxAbsShap = Math.max(
    1,
    ...rows.flatMap((row) => row.points.map((point) => Math.abs(point.shapValue))),
  )
  const xBound = Math.ceil(maxAbsShap * 1.1)
  const xMin = -xBound
  const xMax = xBound
  const xToSvg = (value: number) => left + ((value - xMin) / (xMax - xMin)) * plotWidth
  const xTicks = Array.from({ length: 5 }, (_, index) => xMin + (index * (xMax - xMin)) / 4)
  const colorForFeatureValue = (value: number) => {
    const clamped = Math.max(0, Math.min(1, value))
    const low = [29, 78, 216]
    const high = [179, 38, 30]
    const red = Math.round(low[0] + clamped * (high[0] - low[0]))
    const middleChannel = Math.round(low[1] + clamped * (high[1] - low[1]))
    const blue = Math.round(low[2] + clamped * (high[2] - low[2]))

    return `rgb(${red}, ${middleChannel}, ${blue})`
  }
  const svgHeight = top + rows.length * rowHeight + 62
  const tooltipWidth = 150
  const tooltipHeight = 76
  const getSvgTooltipPosition = (pointX: number, pointY: number) => {
    const padding = 8
    const preferredX = pointX + 12
    const flippedX = pointX - tooltipWidth - 12
    const x = preferredX + tooltipWidth > svgWidth - padding ? flippedX : preferredX
    const y = pointY - tooltipHeight / 2

    return {
      x: Math.max(padding, Math.min(svgWidth - tooltipWidth - padding, x)),
      y: Math.max(padding, Math.min(svgHeight - tooltipHeight - padding, y)),
    }
  }

  return (
    <div
      data-tour="overview-numerical-shap"
      className="relative flex h-full min-w-0 flex-col rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] p-5"
      aria-busy={isLoading}
    >
      {isLoading ? (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-[rgba(255,255,255,0.58)]"
          aria-label="Recomputing numerical SHAP plot"
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
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-[var(--muted)]">
            SHAP Plot
          </p>
          <h3 className="mt-2 text-lg font-semibold text-[var(--ink)]">
            Numerical Feature Beeswarm
          </h3>
        </div>
        <TutorialInfo topic="numerical-shap" placement="up" />
      </div>

      {rows.length > 0 ? (
        <div className="mt-5 flex flex-1 items-center">
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="mx-auto h-auto w-full max-w-full"
          >
            {rows.map((row, rowIndex) => {
              const isSelected = selectedFeatureSet.has(row.featureKey)
              const y = top + rowIndex * rowHeight + 12
              const laneBinCounts = new Map<string, number>()

              return (
                <g key={row.featureKey}>
                  <line
                    x1={left}
                    y1={y}
                    x2={left + plotWidth}
                    y2={y}
                    stroke="var(--chart-grid)"
                    strokeDasharray="2 5"
                    strokeWidth="1.1"
                  />
                  <text
                    x={labelX}
                    y={y + 4}
                    textAnchor="end"
                    fill={isSelected ? 'var(--ink)' : 'var(--muted)'}
                    fontSize="12"
                    fontWeight="500"
                  >
                    {featureLabelMap[row.featureKey]}
                  </text>
                  <g aria-hidden="true">
                    <text
                      x={left - 14}
                      y={y - 13}
                      textAnchor="end"
                      fill="var(--muted)"
                      fontSize="9"
                      fontWeight="600"
                    >
                      high value
                    </text>
                    <text
                      x={left - 14}
                      y={y + 20}
                      textAnchor="end"
                      fill="var(--muted)"
                      fontSize="9"
                      fontWeight="600"
                    >
                      low value
                    </text>
                  </g>
                  {row.points.map((point, pointIndex) => {
                    const isHighValue = point.featureValue >= 0.5
                    const verticalLaneOffset = isHighValue ? -24 : 24
                    const recordKey = point.recordKey
                    const pointX = xToSvg(point.shapValue)
                    const laneKey = isHighValue ? 'high' : 'low'
                    const binKey = `${laneKey}-${Math.round(pointX / 4)}`
                    const stackIndex = laneBinCounts.get(binKey) ?? 0
                    laneBinCounts.set(binKey, stackIndex + 1)
                    const stackDirection = stackIndex % 2 === 0 ? -1 : 1
                    const stackLevel = Math.ceil(stackIndex / 2)
                    const stackOffset = Math.max(-16, Math.min(16, stackDirection * stackLevel * 3.2))
                    const jitterOffset = point.jitter * 2.4
                    const pointY = y + verticalLaneOffset + stackOffset + jitterOffset

                    return (
                      <circle
                        key={`${row.featureKey}-${pointIndex}`}
                        cx={pointX}
                        cy={pointY}
                        r="1.9"
                        fill={colorForFeatureValue(point.featureValue)}
                        opacity={isSelected ? 0.88 : 0.24}
                        stroke={isHighValue ? 'var(--ink-soft)' : 'var(--surface-raised)'}
                        strokeOpacity={isSelected ? 0.58 : 0.18}
                        strokeWidth="0.65"
                        className={recordKey ? 'cursor-pointer' : undefined}
                        onMouseMove={() => {
                          if (!recordKey) {
                            return
                          }

                          setTooltip({
                            ...getSvgTooltipPosition(pointX, pointY),
                            featureLabel: featureLabelMap[row.featureKey],
                            shapValue: point.shapValue,
                          })
                        }}
                        onMouseLeave={() => setTooltip(null)}
                        onClick={(event) => {
                          if (!recordKey || !onSelectRecord) {
                            return
                          }

                          event.stopPropagation()
                          setTooltip(null)
                          setPreviewRecordKey(recordKey)
                        }}
                      />
                    )
                  })}
                </g>
              )
            })}

            {xTicks.map((tick) => {
              const x = xToSvg(tick)

              return (
                <g key={tick}>
                  <line
                    x1={x}
                    y1={top + rows.length * rowHeight + 4}
                    x2={x}
                    y2={top + rows.length * rowHeight + 10}
                    stroke="var(--chart-axis)"
                    strokeWidth="1.2"
                  />
                  <text
                    x={x}
                    y={top + rows.length * rowHeight + 28}
                    textAnchor="middle"
                    fill="var(--muted)"
                    fontSize="11"
                  >
                    {Number.isInteger(tick) ? tick : tick.toFixed(1)}
                  </text>
                </g>
              )
            })}

            <line
              x1={xToSvg(0)}
              y1={top - 4}
              x2={xToSvg(0)}
              y2={top + rows.length * rowHeight - 8}
              stroke="var(--chart-axis-soft)"
              strokeWidth="1.5"
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
              y={svgHeight - 10}
              textAnchor="middle"
              fill="var(--ink)"
              fontSize="13"
            >
              SHAP value (impact on model output)
            </text>

            <defs>
              <linearGradient id="shap-feature-scale" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="var(--shap-low)" />
                <stop offset="100%" stopColor="var(--shap-high)" />
              </linearGradient>
            </defs>

            <rect
              x={left + plotWidth + 26}
              y={top}
              width="4"
              height={rows.length * rowHeight - 18}
              fill="url(#shap-feature-scale)"
            />
            <text
              x={left + plotWidth + 34}
              y={top + 6}
              fill="var(--ink)"
              fontSize="11"
            >
              High
            </text>
            <text
              x={left + plotWidth + 34}
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
            {tooltip ? (
              <g pointerEvents="none">
                <rect
                  x={tooltip.x}
                  y={tooltip.y}
                  width={tooltipWidth}
                  height={tooltipHeight}
                  rx="7"
                  fill="var(--surface-raised)"
                  stroke="var(--line-strong)"
                  strokeWidth="1"
                />
                <text x={tooltip.x + 12} y={tooltip.y + 19} fill="var(--ink)" fontSize="12" fontWeight="700">
                  Transaction point
                </text>
                <text x={tooltip.x + 12} y={tooltip.y + 36} fill="var(--muted)" fontSize="11">
                  {tooltip.featureLabel}
                </text>
                <text x={tooltip.x + 12} y={tooltip.y + 53} fill="var(--muted)" fontSize="11" fontWeight="600">
                  SHAP {tooltip.shapValue >= 0 ? '+' : ''}
                  {tooltip.shapValue.toFixed(3)}
                </text>
                <text x={tooltip.x + 12} y={tooltip.y + 68} fill="var(--muted)" fontSize="10">
                  Click for preview.
                </text>
              </g>
            ) : null}
          </svg>
          {previewRecordKey ? createPortal(
            <div className="fixed inset-0 z-[290] flex items-center justify-center bg-[rgba(24,32,42,0.18)] px-4 py-6">
              <div className="max-h-[calc(100vh-3rem)] w-full max-w-2xl overflow-auto rounded-lg border border-[var(--line-strong)] bg-[var(--surface-raised)] p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[var(--muted)]">Datapoint Preview</p>
                    <h3 className="mt-2 text-lg font-semibold text-[var(--ink)]">
                      Transaction Details
                    </h3>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {previewRecord ? (
                      <span className="figure-text rounded-md bg-[var(--surface-strong)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
                        {(scoreTransactionRisk(previewRecord) * 100).toFixed(1)}% confidence
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setPreviewRecordKey(null)}
                      className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--line)] bg-transparent text-sm font-semibold text-[var(--muted)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
                      aria-label="Close datapoint preview"
                    >
                      x
                    </button>
                  </div>
                </div>

                {previewRecord ? (
                  <div className="mt-4 grid border-t border-[var(--line)] sm:grid-cols-2">
                    {previewRows.map(([label, value]) => (
                      <div key={label} className="border-b border-[var(--line)] px-1 py-3 sm:odd:pr-4 sm:even:border-l sm:even:pl-4">
                        <p className="text-[11px] font-semibold text-[var(--muted)]">{label}</p>
                        <p className="figure-text mt-1 break-words text-sm font-semibold leading-5 text-[var(--ink)]">{value}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-5 text-sm text-[var(--muted)]">
                    This datapoint is no longer available in the current transaction window.
                  </p>
                )}

                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewRecordKey(null)}
                    className="rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-sm font-semibold text-[var(--ink)] hover:bg-[var(--surface-strong)]"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    disabled={!onSelectRecord}
                    onClick={() => {
                      onSelectRecord?.(previewRecordKey)
                      setPreviewRecordKey(null)
                    }}
                    className="rounded-md border border-[var(--ink)] bg-[var(--ink)] px-3 py-2 text-sm font-semibold text-[var(--surface-raised)] disabled:cursor-not-allowed disabled:border-[var(--line)] disabled:bg-[var(--surface-strong)] disabled:text-[var(--muted)]"
                  >
                    Open in Transactions
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          ) : null}
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
