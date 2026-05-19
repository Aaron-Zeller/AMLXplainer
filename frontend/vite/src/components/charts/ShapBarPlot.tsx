import {
  compactDecimalFormatter,
  OVERVIEW_BAR_PLOT_CHART_HEIGHT_PX,
  OVERVIEW_BAR_PLOT_ROW_GAP_PX,
  type DashboardPayload,
  type FeatureKey,
  featureLabelMap,
} from '../../lib/dashboard'
import TutorialInfo from '../common/TutorialInfo'

function ShapBarPlot({
  rows,
  selectedFeatures,
  isLoading = false,
}: {
  rows: DashboardPayload['shap']
  selectedFeatures: FeatureKey[]
  isLoading?: boolean
}) {
  const selectedFeatureSet = new Set(selectedFeatures)
  const maxImportance = Math.max(...rows.map((row) => row.importance), 1)

  return (
    <div
      className="relative flex min-w-0 flex-col rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] p-5"
      aria-busy={isLoading}
    >
      {isLoading ? (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-[rgba(255,255,255,0.58)]"
          aria-label="Recomputing SHAP importance"
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
            Feature Importance Bars
          </h3>
        </div>
        <TutorialInfo topic="shap-importance" />
      </div>
      {rows.length > 0 ? (
        <div
          className="mt-5 flex flex-col"
          style={{
            minHeight: `${OVERVIEW_BAR_PLOT_CHART_HEIGHT_PX}px`,
            gap: `${OVERVIEW_BAR_PLOT_ROW_GAP_PX}px`,
          }}
        >
          {rows.map((row) => {
            const isSelected = selectedFeatureSet.has(row.featureKey)

            return (
              <div key={row.featureKey} className="grid grid-cols-[140px_minmax(150px,1fr)_88px] items-center gap-3">
                <p className={`text-sm font-medium ${isSelected ? 'text-[var(--ink)]' : 'text-[var(--muted)]'}`}>
                  {featureLabelMap[row.featureKey]}
                </p>
                <div className="h-4 rounded-sm bg-[var(--surface-strong)]">
                  <div
                    className={`h-full rounded-sm bg-[var(--line-strong)] ${isSelected ? '' : 'opacity-25'}`}
                    style={{ width: `${(row.importance / maxImportance) * 100}%` }}
                  />
                </div>
                <p className={`figure-text min-w-0 text-right text-sm font-semibold tabular-nums ${isSelected ? 'text-[var(--muted)]' : 'text-[var(--chart-axis-soft)]'}`}>
                  {compactDecimalFormatter.format(row.importance)}
                </p>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="mt-5 text-sm text-[var(--muted)]">
          Select at least one feature to populate the SHAP bars.
        </p>
      )}
    </div>
  )
}

export default ShapBarPlot
