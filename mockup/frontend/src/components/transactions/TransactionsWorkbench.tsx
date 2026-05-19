import type { AlertPreview, BackendFeatureRecord, FeatureKey } from '../../lib/dashboard'
import WaterfallShapPlot from '../charts/WaterfallShapPlot'
import WorldViewMap from '../map/WorldViewMap'
import TransactionDetailsCard from './TransactionDetailsCard'

function TransactionsWorkbench({
  alerts,
  records,
  selectedFeatures,
  selectedAlertId,
  onToggleFeature,
  tourFullscreenFocus,
}: {
  alerts: AlertPreview[]
  records: BackendFeatureRecord[]
  selectedFeatures: FeatureKey[]
  selectedAlertId: string | null
  onToggleFeature: (featureKey: FeatureKey) => void
  tourFullscreenFocus: 'edge' | 'node' | null
}) {
  const selectedAlert = alerts.find((alert) => alert.id === selectedAlertId) ?? alerts[0] ?? null

  return (
    <div className="mt-5 grid flex-1 gap-6 sm:mt-6 min-[900px]:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)] min-[900px]:grid-rows-[auto_minmax(0,1fr)]">
      <div data-tour="transaction-waterfall">
        <WaterfallShapPlot
          record={selectedAlert?.record ?? null}
          selectedFeatures={selectedFeatures}
          onToggleFeature={onToggleFeature}
        />
      </div>
      <TransactionDetailsCard record={selectedAlert?.record ?? null} />

      <div data-tour="transaction-map" className="min-[900px]:col-span-2">
        <WorldViewMap
          record={selectedAlert?.record ?? null}
          alerts={alerts}
          allRecords={records}
          selectedAlertId={selectedAlert?.id ?? null}
          tourFullscreenFocus={tourFullscreenFocus}
        />
      </div>
    </div>
  )
}

export default TransactionsWorkbench
