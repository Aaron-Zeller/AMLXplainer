import {
  OVERVIEW_BAR_PLOT_CHART_HEIGHT_PX,
  OVERVIEW_BAR_PLOT_ROW_GAP_PX,
  type DashboardPayload,
  featureLabelMap,
} from '../../lib/dashboard'

function ShapBarPlot({ rows }: { rows: DashboardPayload['shap'] }) {
  const maxImportance = Math.max(...rows.map((row) => row.importance), 1)

  return (
    <div className="flex min-w-0 flex-col rounded-[26px] border border-[var(--line)] bg-white/82 p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
            SHAP Plot
          </p>
          <h3 className="mt-2 text-lg font-semibold text-[var(--ink)]">
            Feature Importance Bars
          </h3>
        </div>
      </div>
      {rows.length > 0 ? (
        <div
          className="mt-5 flex flex-col"
          style={{
            minHeight: `${OVERVIEW_BAR_PLOT_CHART_HEIGHT_PX}px`,
            gap: `${OVERVIEW_BAR_PLOT_ROW_GAP_PX}px`,
          }}
        >
          {rows.map((row) => (
            <div key={row.featureKey} className="grid grid-cols-[156px_minmax(0,1fr)_42px] items-center gap-5">
              <p className="text-sm font-medium text-[var(--ink)]">{featureLabelMap[row.featureKey]}</p>
              <div className="h-4 rounded-full bg-[var(--surface-strong)]">
                <div
                  className="h-full rounded-full bg-[var(--chart-bar)]"
                  style={{ width: `${(row.importance / maxImportance) * 100}%` }}
                />
              </div>
              <p className="text-right text-sm font-semibold text-[var(--muted)]">{row.importance}</p>
            </div>
          ))}
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
