import {
  buildWaterfallShapData,
  computeBaseWaterfallContributions,
  type BackendFeatureRecord,
  type FeatureKey,
  featureLabelMap,
} from '../../lib/dashboard'

function WaterfallShapPlot({
  record,
  selectedFeatures,
  onToggleFeature,
}: {
  record: BackendFeatureRecord | null
  selectedFeatures: FeatureKey[]
  onToggleFeature: (featureKey: FeatureKey) => void
}) {
  if (!record) {
    return (
      <div className="flex h-full min-w-0 flex-col rounded-[26px] border border-[var(--line)] bg-white/82 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
          SHAP Waterfall
        </p>
        <h3 className="mt-2 text-lg font-semibold text-[var(--ink)]">Transaction Explanation</h3>
        <p className="mt-5 text-sm text-[var(--muted)]">Select an alert to inspect its feature contributions.</p>
      </div>
    )
  }

  const rowOrder = computeBaseWaterfallContributions(record)
    .sort((left, right) => Math.abs(right.contribution) - Math.abs(left.contribution))
    .map((item) => item.featureKey)
  const selectedFeatureSet = new Set(selectedFeatures)
  const activeContributions = buildWaterfallShapData(record, selectedFeatures)
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
      runningTotal: 0,
    },
  )
  const firstRowFeatureKey = contributions[0]?.featureKey ?? null
  const minValue = Math.min(
    0,
    ...contributions
      .filter((item) => selectedFeatureSet.has(item.featureKey))
      .map((item) => Math.min(item.start, item.end)),
  )
  const maxValue = Math.max(
    0,
    ...contributions
      .filter((item) => selectedFeatureSet.has(item.featureKey))
      .map((item) => Math.max(item.start, item.end)),
  )
  const left = 104
  const right = 492
  const valueColumnX = 533
  const top = 24
  const rowHeight = 28
  const svgHeight = top + contributions.length * rowHeight + 44
  const xToSvg = (value: number) => left + ((value - minValue) / Math.max(maxValue - minValue, 0.01)) * (right - left)

  return (
    <div className="flex h-full min-w-0 flex-col rounded-[26px] border border-[var(--line)] bg-white/82 p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
            SHAP Waterfall
          </p>
          <h3 className="mt-2 text-lg font-semibold text-[var(--ink)]">Transaction Explanation</h3>
        </div>
        <div className="rounded-full bg-[var(--surface-strong)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
          <span className="mr-1">f(x) =</span>
          <span>
            {finalContributionValue >= 0 ? '+' : ''}
            {finalContributionValue.toFixed(3)}
          </span>
        </div>
      </div>

      <p className="mt-3 text-xs text-[var(--muted)]">Click arrows to toggle features.</p>

      <svg viewBox={`0 0 540 ${svgHeight}`} className="mt-5 h-[300px] w-full sm:h-[330px] min-[900px]:h-[360px]">
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
              className="cursor-pointer"
            >
              {!isSelected ? (
                <rect
                  x="8"
                  y={y - 8}
                  width="525"
                  height="24"
                  fill="transparent"
                  onClick={() => onToggleFeature(item.featureKey)}
                />
              ) : null}
              <text
                x="96"
                y={y + 11}
                textAnchor="end"
                fill={isSelected ? 'var(--ink)' : 'var(--muted)'}
                fontSize="12"
                fontWeight="500"
              >
                {featureLabelMap[item.featureKey]}
              </text>
              <line x1={left} y1={y + 6} x2={right} y2={y + 6} stroke="#e1e8ee" strokeDasharray="2 4" />
              <polygon
                points={points}
                fill={item.contribution >= 0 ? 'var(--accent)' : 'var(--signal)'}
                fillOpacity={isSelected ? '0.88' : '0.22'}
                stroke={isSelected ? 'none' : '#c7d3dc'}
                strokeWidth={isSelected ? '0' : '0.9'}
                onClick={isSelected ? () => onToggleFeature(item.featureKey) : undefined}
              />
              <text
                x={valueColumnX}
                y={y + 10}
                textAnchor="end"
                fill={isSelected ? 'var(--muted)' : '#8a99a8'}
                fontSize="11"
                fontWeight="600"
              >
                {item.contribution >= 0 ? '+' : ''}
                {item.contribution.toFixed(3)}
              </text>
            </g>
          )
        })}

        <line x1={xToSvg(0)} y1={top - 10} x2={xToSvg(0)} y2={top + contributions.length * rowHeight - 8} stroke="#9db0be" strokeWidth="1.2" />
      </svg>
    </div>
  )
}

export default WaterfallShapPlot
