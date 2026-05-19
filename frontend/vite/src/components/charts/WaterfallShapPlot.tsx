import {
  buildWaterfallShapData,
  computeBaseWaterfallContributions,
  type BackendFeatureRecord,
  type FeatureKey,
  featureLabelMap,
  type MlWaterfallContribution,
} from '../../lib/dashboard'
import TutorialInfo from '../common/TutorialInfo'

function WaterfallShapPlot({
  record,
  waterfall,
  baseValue,
  selectedFeatures,
  onToggleFeature,
  isLoading = false,
}: {
  record: BackendFeatureRecord | null
  waterfall?: MlWaterfallContribution[]
  baseValue?: number
  selectedFeatures: FeatureKey[]
  onToggleFeature: (featureKey: FeatureKey) => void
  isLoading?: boolean
}) {
  if (!record) {
    return (
      <div className="flex h-full min-w-0 flex-col rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-[var(--muted)]">
              SHAP Waterfall
            </p>
            <h3 className="mt-2 text-lg font-semibold text-[var(--ink)]">Transaction Explanation</h3>
          </div>
          <TutorialInfo topic="shap-waterfall" />
        </div>
        <p className="mt-5 text-sm text-[var(--muted)]">Select an alert to inspect its feature contributions.</p>
      </div>
    )
  }

  const mlContributionByKey = new Map(
    (waterfall ?? []).map((item) => [item.featureKey, item.contribution] as const),
  )
  const baseContributions = computeBaseWaterfallContributions(record)
  const rowOrder = (waterfall && waterfall.length > 0
    ? [...waterfall].sort((left, right) => Math.abs(right.contribution) - Math.abs(left.contribution))
    : baseContributions
  )
    .sort((left, right) => Math.abs(right.contribution) - Math.abs(left.contribution))
    .map((item) => item.featureKey)
  const selectedFeatureSet = new Set(selectedFeatures)
  const startingValue = waterfall && waterfall.length > 0 ? (baseValue ?? 0) : 0
  const activeContributions =
    waterfall && waterfall.length > 0
      ? rowOrder
          .filter((featureKey) => selectedFeatureSet.has(featureKey))
          .reduce<Array<MlWaterfallContribution>>((items, featureKey) => {
            const contribution = mlContributionByKey.get(featureKey) ?? 0
            const start = items[items.length - 1]?.end ?? startingValue
            const end = start + contribution

            return [
              ...items,
              {
                featureKey,
                contribution,
                start,
                end,
              },
            ]
          }, [])
      : buildWaterfallShapData(record, selectedFeatures)
  const activeContributionByKey = new Map(
    activeContributions.map((item) => [item.featureKey, item] as const),
  )
  const { contributions, runningTotal: finalContributionValue } = rowOrder.reduce<{
    contributions: Array<{
      featureKey: FeatureKey
      contribution: number
      start: number
      end: number
    }>
    runningTotal: number
  }>(
    (accumulator, featureKey) => {
      const activeItem = activeContributionByKey.get(featureKey)

      if (!activeItem || !selectedFeatureSet.has(featureKey)) {
        accumulator.contributions.push({
          featureKey,
          contribution: 0,
          start: accumulator.runningTotal,
          end: accumulator.runningTotal,
        })
        return accumulator
      }

      const start = accumulator.runningTotal
      const end = accumulator.runningTotal + activeItem.contribution

      accumulator.contributions.push({
        featureKey,
        contribution: activeItem.contribution,
        start,
        end,
      })
      accumulator.runningTotal = end
      return accumulator
    },
    {
      contributions: [],
      runningTotal: startingValue,
    },
  )
  const firstRowFeatureKey = contributions[0]?.featureKey ?? null
  const minValue = Math.min(
    0,
    ...contributions
      .filter((item) => selectedFeatureSet.has(item.featureKey))
      .map((item) => Math.min(item.start, item.end)),
    startingValue,
  )
  const maxValue = Math.max(
    0,
    ...contributions
      .filter((item) => selectedFeatureSet.has(item.featureKey))
      .map((item) => Math.max(item.start, item.end)),
    startingValue,
  )
  const svgWidth = 590
  const left = 142
  const right = 504
  const labelX = left - 10
  const valueColumnX = svgWidth - 12
  const top = 24
  const rowHeight = 28
  const svgHeight = top + contributions.length * rowHeight + 44
  const xToSvg = (value: number) => left + ((value - minValue) / Math.max(maxValue - minValue, 0.01)) * (right - left)
  const baselineX = xToSvg(startingValue)

  return (
    <div
      className="flex h-full min-w-0 flex-col rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] p-5"
      aria-busy={isLoading}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-[var(--muted)]">
            SHAP Waterfall
          </p>
          <h3 className="mt-2 text-lg font-semibold text-[var(--ink)]">Transaction Explanation</h3>
        </div>
        <div className="flex items-center gap-2">
          <div className="figure-text rounded-md bg-[var(--surface-strong)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
            <span className="mr-1">f(x) =</span>
            <span>
              {finalContributionValue >= 0 ? '+' : ''}
              {finalContributionValue.toFixed(3)}
            </span>
          </div>
          <TutorialInfo topic="shap-waterfall" />
        </div>
      </div>

      <p className="mt-3 text-xs text-[var(--muted)]">
        {isLoading
          ? 'Recomputing SHAP values...'
          : `Base value ${startingValue >= 0 ? '+' : ''}${startingValue.toFixed(3)}. Click arrows to toggle features.`}
      </p>

      <div className="relative mt-5">
        {isLoading ? (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-[rgba(255,255,255,0.58)]"
            aria-label="Recomputing SHAP waterfall"
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
        <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="h-[300px] w-full sm:h-[330px] min-[900px]:h-[360px]">
          <line
            x1={baselineX}
            y1={top - 10}
            x2={baselineX}
            y2={top + contributions.length * rowHeight - 8}
            stroke="var(--chart-axis)"
            strokeWidth="1.2"
          />
          {contributions.map((item, index) => {
            const isSelected = selectedFeatureSet.has(item.featureKey)
            const y = top + index * rowHeight
            const startX = xToSvg(item.start)
            const endX = xToSvg(item.end)
            const width = Math.max(Math.abs(endX - startX), 2)
            const tipSize = Math.min(10, width / 2)
            const topY = y - 2
            const middleY = y + 6
            const bottomY = y + 14
            const barLeftX = Math.min(startX, endX)
            const guideEndX = Math.max(left, barLeftX - 8)
            const points =
              item.contribution >= 0
                ? [
                    `${startX},${topY}`,
                    `${endX - tipSize},${topY}`,
                    `${endX},${middleY}`,
                    `${endX - tipSize},${bottomY}`,
                    `${startX},${bottomY}`,
                  ].join(' ')
                : [
                    `${startX},${topY}`,
                    `${endX + tipSize},${topY}`,
                    `${endX},${middleY}`,
                    `${endX + tipSize},${bottomY}`,
                    `${startX},${bottomY}`,
                  ].join(' ')

            return (
              <g
                key={item.featureKey}
                data-tour={item.featureKey === firstRowFeatureKey ? 'waterfall-primary-row' : undefined}
                className={isLoading ? 'pointer-events-none opacity-70' : 'cursor-pointer'}
              >
                {!isSelected ? (
                  <rect
                    x="8"
                    y={y - 8}
                    width={svgWidth - 16}
                    height="24"
                    fill="transparent"
                    onClick={isLoading ? undefined : () => onToggleFeature(item.featureKey)}
                  />
                ) : null}
                <text
                  x={labelX}
                  y={y + 11}
                  textAnchor="end"
                  fill={isSelected ? 'var(--ink)' : 'var(--muted)'}
                  fontSize="12"
                  fontWeight="500"
                >
                  {featureLabelMap[item.featureKey] ?? item.featureKey}
                </text>
                {guideEndX > left ? (
                  <line x1={left} y1={y + 6} x2={guideEndX} y2={y + 6} stroke="var(--chart-grid)" strokeDasharray="2 4" />
                ) : null}
                <polygon
                  points={points}
                  fill={item.contribution >= 0 ? 'var(--shap-positive)' : 'var(--shap-negative)'}
                  fillOpacity={isSelected ? '1' : '0.22'}
                  stroke={isSelected ? 'none' : 'var(--chart-axis-soft)'}
                  strokeWidth={isSelected ? '0' : '0.9'}
                  onClick={isSelected && !isLoading ? () => onToggleFeature(item.featureKey) : undefined}
                />
                <text
                  x={valueColumnX}
                  y={y + 10}
                  textAnchor="end"
                  fill={isSelected ? 'var(--muted)' : 'var(--chart-axis-soft)'}
                  fontSize="11"
                  fontWeight="600"
                >
                  {item.contribution >= 0 ? '+' : ''}
                  {item.contribution.toFixed(3)}
                </text>
              </g>
            )
          })}

        </svg>
      </div>
    </div>
  )
}

export default WaterfallShapPlot
