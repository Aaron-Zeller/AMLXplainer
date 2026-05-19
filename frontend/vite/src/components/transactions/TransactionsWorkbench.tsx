import type { AlertPreview, BackendFeatureRecord, FeatureKey, MlRecordPrediction } from '../../lib/dashboard'
import WaterfallShapPlot from '../charts/WaterfallShapPlot'
import WorldViewMap from '../map/WorldViewMap'
import TransactionDetailsCard from './TransactionDetailsCard'

function TransactionsWorkbench({
  alerts,
  records,
  predictionByRecordKey,
  selectedFeatures,
  selectedAlertId,
  onToggleFeature,
  isWaterfallLoading,
  tourFullscreenFocus,
}: {
  alerts: AlertPreview[]
  records: BackendFeatureRecord[]
  predictionByRecordKey: Map<string, MlRecordPrediction>
  selectedFeatures: FeatureKey[]
  selectedAlertId: string | null
  onToggleFeature: (featureKey: FeatureKey) => void
  isWaterfallLoading?: boolean
  tourFullscreenFocus: 'edge' | 'node' | null
}) {
  const selectedAlert = alerts.find((alert) => alert.id === selectedAlertId) ?? alerts[0] ?? null
  const retainedSelectedRecord =
    selectedAlert?.record ??
    records.find((record) => record.recordKey === selectedAlertId) ??
    null
  const selectedPrediction = retainedSelectedRecord?.recordKey
    ? predictionByRecordKey.get(retainedSelectedRecord.recordKey)
    : undefined

  return (
    <div className="relative mt-3 grid flex-1 gap-4 sm:mt-4 min-[900px]:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)] min-[900px]:grid-rows-[auto_minmax(0,1fr)]">
      <div data-tour="transaction-waterfall">
        <WaterfallShapPlot
          record={retainedSelectedRecord}
          waterfall={selectedPrediction?.waterfall}
          baseValue={selectedPrediction?.baseValue}
          selectedFeatures={selectedFeatures}
          onToggleFeature={onToggleFeature}
          isLoading={isWaterfallLoading}
        />
      </div>
      <TransactionDetailsCard record={retainedSelectedRecord} />

      <div data-tour="transaction-map" className="min-[900px]:col-span-2">
        <WorldViewMap
          record={selectedAlert?.record ?? null}
          alerts={alerts}
          allRecords={records}
          selectedAlertId={selectedAlert?.id ?? selectedAlertId}
          tourFullscreenFocus={tourFullscreenFocus}
        />
      </div>
    </div>
  )
}

export default TransactionsWorkbench
