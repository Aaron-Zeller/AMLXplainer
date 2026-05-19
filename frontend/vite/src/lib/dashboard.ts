export type IconProps = {
  className?: string
}

export type MetricCardProps = {
  label: string
  value: string
  detail: string
}

export type WorkspaceTab = 'dashboard' | 'world'

export const amlFeatures = [
  { key: 'timestamp', label: 'Timestamp', kind: 'temporal' },
  { key: 'fromBank', label: 'From Bank', kind: 'categorical' },
  { key: 'fromAccount', label: 'From Account', kind: 'categorical' },
  { key: 'fromCountry', label: 'From Country', kind: 'categorical' },
  { key: 'toBank', label: 'To Bank', kind: 'categorical' },
  { key: 'toAccount', label: 'To Account', kind: 'categorical' },
  { key: 'toCountry', label: 'To Country', kind: 'categorical' },
  { key: 'amountReceived', label: 'Amount Received', kind: 'numeric' },
  { key: 'receivingCurrency', label: 'Receiving Currency', kind: 'categorical' },
  { key: 'amountPaid', label: 'Amount Paid', kind: 'numeric' },
  { key: 'paymentCurrency', label: 'Payment Currency', kind: 'categorical' },
  { key: 'paymentFormat', label: 'Payment Format', kind: 'categorical' },
] as const

export type FeatureDefinition = (typeof amlFeatures)[number]
export type FeatureKey = FeatureDefinition['key']

export type BackendFeatureRecord = {
  id?: number
  recordKey?: string
  timestamp: string
  fromBank: string
  fromAccount: string
  fromCountry: string
  toBank: string
  toAccount: string
  toCountry: string
  amountReceived: number
  receivingCurrency: string
  amountPaid: number
  paymentCurrency: string
  paymentFormat: string
  isLaundering: boolean
  predictedAlert: boolean
  modelScore: number
}

export type DashboardPayload = {
  records: BackendFeatureRecord[]
  metrics: Array<MetricCardProps>
  shap: Array<{
    featureKey: FeatureKey
    importance: number
    points: Array<{
      shapValue: number
      featureValue: number
      jitter: number
      recordKey?: string
    }>
  }>
  confusionMatrix: {
    total: number
    alertCount: number
    truePositive: number
    falsePositive: number
    falseNegative: number
    trueNegative: number
  }
  predictions?: MlRecordPrediction[]
  roc?: MlRocCurve
  model?: MlResultsPayload['model']
  batch?: MlResultsPayload['batch']
  totalRecordCount?: number
  dashboardSampleCount?: number
}

export type DashboardSummary = {
  metrics: MetricCardProps[]
  confusionMatrix: {
    total: number
    alertCount: number
    truePositive: number
    falsePositive: number
    falseNegative: number
    trueNegative: number
  }
  filteredRecordCount: number
  totalRecordCount: number
}

export type AlertsResponse = {
  alerts: AlertPreview[]
  filteredAlertCount: number
  totalFilteredRecordCount: number
}

export type MlWaterfallContribution = {
  featureKey: FeatureKey
  contribution: number
  start: number
  end: number
}

export type MlRecordPrediction = {
  recordKey: string
  modelScore: number
  predictedAlert: boolean
  baseValue: number
  waterfall: MlWaterfallContribution[]
}

export type MlRocCurve = {
  auc: number
  points: Array<{
    threshold: number
    falsePositiveRate: number
    truePositiveRate: number
  }>
}

export type MlResultsPayload = {
  model: {
    modelType: string
    modelStoragePath: string | null
    trainedRecordCount: number
    positiveTrainCount: number
    negativeTrainCount: number
    trainingMinId: number | null
    trainingMaxId: number | null
    threshold: number
    featureKeys: FeatureKey[]
  }
  batch: {
    batchNumber: number
    batchSize: number
    offset: number
    nextCursorId: number | null
    inferenceMinId: number | null
    inferenceMaxId: number | null
    returnedRecordCount: number
    totalFilteredRecordCount: number
    totalBatchCount: number
    hasNextBatch: boolean
    dashboardSampleOnly?: boolean
  }
  records: BackendFeatureRecord[]
  predictions: MlRecordPrediction[]
  shap: DashboardPayload['shap']
  roc: MlRocCurve
  confusionMatrix: DashboardPayload['confusionMatrix']
  metrics: MetricCardProps[]
  filteredRecordCount: number
  totalFilteredRecordCount: number
}

export type FeatureFilterState = {
  min?: string
  max?: string
  timeStart?: string
  timeEnd?: string
  search: string
  selectedValues: string[]
}

export const createDefaultFilterState = (): FeatureFilterState => ({
  min: '',
  max: '',
  timeStart: '00:00',
  timeEnd: '23:59',
  search: '',
  selectedValues: [],
})

export const ALERT_THRESHOLD = 0.56
export const INITIAL_ML_RESULT_LIMIT = 1000
export const DASHBOARD_SAMPLE_RESULT_LIMIT = 10000
export const PROGRESSIVE_ML_RESULT_LIMIT = 2500
export const STREAMING_ML_RESULT_BATCH_SIZE = 256
export const PROGRESSIVE_ML_RESULT_MAX_RECORDS = 100000
export const compactNumberFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
})
export const wholeNumberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
})
export const compactDecimalFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
})
export const OVERVIEW_BAR_PLOT_ROW_HEIGHT_PX = 20
export const OVERVIEW_BAR_PLOT_ROW_GAP_PX = 24
export const OVERVIEW_BAR_PLOT_CHART_HEIGHT_PX =
  amlFeatures.length * OVERVIEW_BAR_PLOT_ROW_HEIGHT_PX +
  (amlFeatures.length - 1) * OVERVIEW_BAR_PLOT_ROW_GAP_PX

export const featureLabelMap = amlFeatures.reduce<Record<FeatureKey, string>>(
  (accumulator, feature) => {
    accumulator[feature.key] = feature.label
    return accumulator
  },
  {} as Record<FeatureKey, string>,
)

export const categoryOrderByFeature: Partial<Record<FeatureKey, string[]>> = {
  fromBank: [
    'Helvetia Trust',
    'Alpine Capital',
    'Orchid Finance',
    'Lakeside Bank',
    'Meridian Bank',
    'Harbor Union',
    'Northline',
    'Pacific Credit',
  ],
  toBank: [
    'Helvetia Trust',
    'Alpine Capital',
    'Orchid Finance',
    'Lakeside Bank',
    'Meridian Bank',
    'Harbor Union',
    'Northline',
    'Pacific Credit',
  ],
  fromAccount: ['CH-4001', 'CH-2208', 'SG-1882', 'DE-0317', 'GB-8821', 'AE-5520', 'US-1033', 'HK-7704'],
  toAccount: ['CH-4001', 'CH-2208', 'SG-1882', 'DE-0317', 'GB-8821', 'AE-5520', 'US-1033', 'HK-7704'],
  fromCountry: ['CH', 'DE', 'SG', 'GB', 'AE', 'US', 'HK', 'NL'],
  toCountry: ['CH', 'DE', 'SG', 'GB', 'AE', 'US', 'HK', 'NL'],
  receivingCurrency: ['CHF', 'EUR', 'SGD', 'GBP', 'AED', 'USD', 'HKD'],
  paymentCurrency: ['CHF', 'EUR', 'SGD', 'GBP', 'AED', 'USD', 'HKD'],
  paymentFormat: ['ACH', 'SEPA', 'Wire', 'SWIFT'],
}

export const countryCoordinates: Record<string, [number, number]> = {
  CH: [8.2275, 46.8182],
  DE: [10.4515, 51.1657],
  SG: [103.8198, 1.3521],
  GB: [-3.436, 55.3781],
  AE: [53.8478, 23.4241],
  US: [-98.5795, 39.8283],
  HK: [114.1694, 22.3193],
  NL: [5.2913, 52.1326],
}

export type WorldAtlasTopology = {
  type: string
  objects: {
    countries: unknown
    land: unknown
  }
}

export type MapTooltip =
  | {
      type: 'country'
      x: number
      y: number
      title: string
      lines: string[]
    }
  | {
      type: 'route'
      x: number
      y: number
      title: string
      lines: string[]
    }

export type SelectedRoutePanel = {
  panelType: 'route' | 'country'
  title: string
  lines: string[]
  toggles?: Array<{
    label: string
    kind: 'account' | 'bank' | 'country'
    value: string
  }>
}

export type SafariGestureEvent = Event & {
  scale: number
  clientX?: number
  clientY?: number
}

export const timestampToEpoch = (timestamp: string) => Date.parse(timestamp)

export const epochToDateInputValue = (epoch: number) => {
  const date = new Date(epoch)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

export const epochToDateTimeLabel = (epoch: number) => {
  const date = new Date(epoch)
  const month = date.toLocaleString('en-US', { month: 'short' })
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')

  return `${month} ${day}, ${hours}:${minutes}`
}

export const dateInputToEpochStart = (value: string) => {
  if (!value) {
    return ''
  }

  const parsed = Date.parse(`${value}T00:00`)
  return Number.isNaN(parsed) ? '' : String(parsed)
}

export const dateInputToEpochEnd = (value: string) => {
  if (!value) {
    return ''
  }

  const parsed = Date.parse(`${value}T23:59`)
  return Number.isNaN(parsed) ? '' : String(parsed)
}

export const timeInputToMinutes = (value: string) => {
  if (!value) {
    return 0
  }

  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

export const normalizeFeatureValue = (record: BackendFeatureRecord, featureKey: FeatureKey) => {
  if (featureKey === 'timestamp') {
    const date = new Date(record.timestamp)
    const minutes = date.getUTCHours() * 60 + date.getUTCMinutes()
    return minutes / (24 * 60)
  }

  if (featureKey === 'amountPaid') {
    return Math.min(record.amountPaid / 150000, 1)
  }

  if (featureKey === 'amountReceived') {
    return Math.min(record.amountReceived / 150000, 1)
  }

  return 0
}

export const normalizeShapFeatureValue = (record: BackendFeatureRecord, featureKey: FeatureKey) => {
  if (
    amlFeatures.some(
      (feature) =>
        feature.key === featureKey && (feature.kind === 'numeric' || feature.kind === 'temporal'),
    )
  ) {
    return normalizeFeatureValue(record, featureKey)
  }

  const orderedCategories = categoryOrderByFeature[featureKey]

  if (!orderedCategories) {
    return 0.5
  }

  const rawValue = String(record[featureKey])
  const categoryIndex = orderedCategories.indexOf(rawValue)

  if (categoryIndex < 0 || orderedCategories.length === 1) {
    return 0.5
  }

  return categoryIndex / (orderedCategories.length - 1)
}

export const shapSeedFeatures = [
  { featureKey: 'amountPaid', importance: 88, directionBias: 1 },
  { featureKey: 'amountReceived', importance: 82, directionBias: 1 },
  { featureKey: 'paymentFormat', importance: 74, directionBias: 1 },
  { featureKey: 'timestamp', importance: 67, directionBias: 1 },
  { featureKey: 'toCountry', importance: 61, directionBias: 1 },
  { featureKey: 'fromCountry', importance: 58, directionBias: -1 },
  { featureKey: 'paymentCurrency', importance: 51, directionBias: -1 },
  { featureKey: 'receivingCurrency', importance: 47, directionBias: -1 },
  { featureKey: 'toBank', importance: 43, directionBias: 1 },
  { featureKey: 'fromBank', importance: 39, directionBias: -1 },
  { featureKey: 'toAccount', importance: 33, directionBias: 1 },
  { featureKey: 'fromAccount', importance: 29, directionBias: -1 },
] as const satisfies ReadonlyArray<{
  featureKey: FeatureKey
  importance: number
  directionBias: 1 | -1
}>

export const hashText = (value: string) =>
  value.split('').reduce((total, character) => total + character.charCodeAt(0), 0)

export const sampleRecordsForPlot = (records: BackendFeatureRecord[], maxSamples: number) => {
  if (records.length <= maxSamples) {
    return records
  }

  const sampleStep = Math.max(1, Math.floor(records.length / maxSamples))
  return records.filter((_, index) => index % sampleStep === 0).slice(0, maxSamples)
}

export const buildShapRows = (
  records: BackendFeatureRecord[],
  selectedFeatures: FeatureKey[] = amlFeatures.map((feature) => feature.key),
) => {
  const sampledRecords = sampleRecordsForPlot(records, 220)
  const selectedFeatureSet = new Set(selectedFeatures)
  const activeSeedFeatures = shapSeedFeatures.filter((feature) => selectedFeatureSet.has(feature.featureKey))

  if (activeSeedFeatures.length === 0) {
    return []
  }

  const baseRows = activeSeedFeatures
    .map((feature, featureIndex) => {
      const points = sampledRecords.map((_, pointIndex) => {
        const record = sampledRecords[(featureIndex * 17 + pointIndex) % sampledRecords.length]
        const featureValue = normalizeShapFeatureValue(record, feature.featureKey)
        const centeredValue = (featureValue - 0.5) * feature.directionBias
        const spread = 0.35 + feature.importance / 46
        const noise = Math.sin((featureIndex + 2) * (pointIndex + 1) * 0.41) * 0.2
        const shapValue = Math.max(-2.5, Math.min(2.5, centeredValue * spread * 1.85 + noise))
        const density = 1 - Math.min(Math.abs(shapValue) / 2.6, 1)
        const jitter = Math.sin((pointIndex + 3) * 1.79 + featureIndex) * density * 0.92

        return {
          shapValue,
          featureValue,
          jitter,
          recordKey: record.recordKey ?? String(record.id ?? ''),
        }
      })
      const meanMagnitude =
        points.length > 0
          ? points.reduce((total, point) => total + Math.abs(point.shapValue), 0) / points.length
          : 0

      return {
        featureKey: feature.featureKey,
        importance: Math.round(meanMagnitude * 36),
        points,
      }
    })

  const omittedRows = shapSeedFeatures
    .filter((feature) => !selectedFeatureSet.has(feature.featureKey))
    .map((feature, featureIndex) => {
      const points = sampledRecords.map((_, pointIndex) => {
        const record = sampledRecords[(featureIndex * 17 + pointIndex) % sampledRecords.length]
        const featureValue = normalizeShapFeatureValue(record, feature.featureKey)
        const centeredValue = (featureValue - 0.5) * feature.directionBias
        const spread = 0.35 + feature.importance / 46
        const noise = Math.sin((featureIndex + 2) * (pointIndex + 1) * 0.41) * 0.2
        return Math.max(-2.5, Math.min(2.5, centeredValue * spread * 1.85 + noise))
      })

      return {
        featureKey: feature.featureKey,
        meanSigned: points.length > 0 ? points.reduce((total, point) => total + point, 0) / points.length : 0,
        meanMagnitude:
          points.length > 0 ? points.reduce((total, point) => total + Math.abs(point), 0) / points.length : 0,
      }
    })

  const omittedSignedMass = omittedRows.reduce((total, row) => total + row.meanSigned, 0)
  const omittedMagnitudeMass = omittedRows.reduce((total, row) => total + row.meanMagnitude, 0)
  const omittedFeatureCount = omittedRows.length
  const omittedImportanceMass = shapSeedFeatures
    .filter((feature) => !selectedFeatureSet.has(feature.featureKey))
    .reduce((total, feature) => total + feature.importance, 0)
  const activeWeightTotal = Math.max(
    baseRows.reduce((total, row) => total + row.importance + 1, 0),
    1,
  )

  return baseRows
    .map((row) => {
      const rowWeight = (row.importance + 1) / activeWeightTotal
      const interactionDrift = omittedRows.reduce((total, omittedRow, omittedIndex) => {
        const interactionDirection =
          hashText(`${row.featureKey}-${omittedRow.featureKey}`) % 2 === 0 ? 1 : -1
        const interactionWeight =
          (Math.abs(omittedRow.meanSigned) * 1.2 + omittedRow.meanMagnitude * 0.85) /
          Math.max(omittedRows.length, 1)

        return total + interactionDirection * interactionWeight * (1 + omittedIndex * 0.06)
      }, 0)
      const adjustedPoints = row.points.map((point) => {
        const scaleBoost =
          1 +
          omittedFeatureCount * 0.075 +
          omittedMagnitudeMass * 0.032 * (0.5 + rowWeight)
        const directionalShift =
          omittedSignedMass * 0.44 * (0.45 + rowWeight) * (point.featureValue >= 0.5 ? 1 : -1)
        const contextualShift =
          interactionDrift *
          (0.12 + omittedImportanceMass / 1600) *
          (0.65 + Math.abs(point.featureValue - 0.5))
        const adjustedShapValue = Math.max(
          -2.5,
          Math.min(2.5, point.shapValue * scaleBoost + directionalShift + contextualShift),
        )
        const density = 1 - Math.min(Math.abs(adjustedShapValue) / 2.6, 1)
        const adjustedJitter = point.jitter * (0.84 + density * 0.16)

        return {
          ...point,
          shapValue: adjustedShapValue,
          jitter: adjustedJitter,
        }
      })
      const meanMagnitude =
        adjustedPoints.length > 0
          ? adjustedPoints.reduce((total, point) => total + Math.abs(point.shapValue), 0) / adjustedPoints.length
          : 0

      return {
        featureKey: row.featureKey,
        importance: Math.round(meanMagnitude * 36),
        points: adjustedPoints,
      }
    })
    .sort((left, right) => right.importance - left.importance)
}

export const scoreTransactionRisk = (record: BackendFeatureRecord) => {
  return record.modelScore
}

export const labelTransactionOutcome = (record: BackendFeatureRecord) => record.isLaundering
export const isPredictedAlert = (record: BackendFeatureRecord) => record.predictedAlert

export const buildConfusionMatrixFromRecords = (
  records: BackendFeatureRecord[],
): DashboardPayload['confusionMatrix'] => {
  const matrix = records.reduce(
    (accumulator, record) => {
      const predictedPositive = isPredictedAlert(record)
      const actualPositive = labelTransactionOutcome(record)

      if (predictedPositive && actualPositive) accumulator.truePositive += 1
      if (predictedPositive && !actualPositive) accumulator.falsePositive += 1
      if (!predictedPositive && actualPositive) accumulator.falseNegative += 1
      if (!predictedPositive && !actualPositive) accumulator.trueNegative += 1

      if (predictedPositive) accumulator.alertCount += 1
      accumulator.total += 1
      return accumulator
    },
    {
      total: 0,
      alertCount: 0,
      truePositive: 0,
      falsePositive: 0,
      falseNegative: 0,
      trueNegative: 0,
    },
  )

  return {
    total: Math.max(0, matrix.total),
    alertCount: Math.max(0, matrix.alertCount),
    truePositive: Math.max(0, matrix.truePositive),
    falsePositive: Math.max(0, matrix.falsePositive),
    falseNegative: Math.max(0, matrix.falseNegative),
    trueNegative: Math.max(0, matrix.trueNegative),
  }
}

export const buildMetricsFromConfusionMatrix = (
  confusionMatrix: DashboardPayload['confusionMatrix'],
): MetricCardProps[] => {
  const { truePositive, falsePositive, falseNegative, trueNegative, total } = confusionMatrix
  const predictedPositive = truePositive + falsePositive
  const actualPositive = truePositive + falseNegative

  if (total === 0) {
    return [
      { label: 'Accuracy', value: 'N/A', detail: 'No matching records' },
      { label: 'Precision', value: 'N/A', detail: 'No matching records' },
      { label: 'Recall', value: 'N/A', detail: 'No matching records' },
      { label: 'F1 Score', value: 'N/A', detail: 'No matching records' },
    ]
  }

  const accuracy = (truePositive + trueNegative) / total
  const precision = predictedPositive > 0 ? truePositive / predictedPositive : null
  const recall = actualPositive > 0 ? truePositive / actualPositive : null
  const f1Score =
    precision != null && recall != null && precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : null
  const formatPercentMetricValue = (value: number | null) =>
    value == null ? 'N/A' : `${(value * 100).toFixed(1)}%`
  const formatUnitMetricValue = (value: number | null) =>
    value == null ? 'N/A' : value.toFixed(3)

  return [
    { label: 'Accuracy', value: `${(accuracy * 100).toFixed(1)}%`, detail: 'Correct predictions' },
    {
      label: 'Precision',
      value: formatUnitMetricValue(precision),
      detail: predictedPositive > 0 ? 'Filtered alerts' : 'No predicted alerts',
    },
    {
      label: 'Recall',
      value: formatPercentMetricValue(recall),
      detail: actualPositive > 0 ? 'Filtered positives' : 'No known positives',
    },
    {
      label: 'F1 Score',
      value: formatUnitMetricValue(f1Score),
      detail: precision != null && recall != null ? 'Filtered balance' : 'Needs precision and recall',
    },
  ]
}

const addConfusionMatrices = (
  currentMatrix: DashboardPayload['confusionMatrix'],
  nextMatrix: DashboardPayload['confusionMatrix'],
): DashboardPayload['confusionMatrix'] => ({
  total: currentMatrix.total + nextMatrix.total,
  alertCount: currentMatrix.alertCount + nextMatrix.alertCount,
  truePositive: currentMatrix.truePositive + nextMatrix.truePositive,
  falsePositive: currentMatrix.falsePositive + nextMatrix.falsePositive,
  falseNegative: currentMatrix.falseNegative + nextMatrix.falseNegative,
  trueNegative: currentMatrix.trueNegative + nextMatrix.trueNegative,
})

export type AlertSeverity = 'high' | 'medium' | 'low'
export type AlertDecision = 'inReview' | 'closed' | 'mrosReview'

export type AlertPreview = {
  id: string
  severity: AlertSeverity
  confidence: number
  timeLabel: string
  routeLabel: string
  amountLabel: string
  record: BackendFeatureRecord
}

export const severityMeta: Record<
  AlertSeverity,
  { label: string; tone: string; badgeTone: string; dotTone: string }
> = {
  high: {
    label: 'High Importance',
    tone: 'border-[var(--signal)]/50 bg-[var(--signal-soft)]',
    badgeTone: 'bg-[var(--signal)] text-white',
    dotTone: 'bg-[var(--signal)]',
  },
  medium: {
    label: 'Medium Importance',
    tone: 'border-[var(--aux)]/45 bg-[var(--aux-soft)]',
    badgeTone: 'bg-[var(--aux)] text-white',
    dotTone: 'bg-[var(--aux)]',
  },
  low: {
    label: 'Low Importance',
    tone: 'border-[var(--line-strong)] bg-[var(--surface-strong)]',
    badgeTone: 'bg-[var(--surface-strong)] text-[var(--ink)]',
    dotTone: 'bg-[var(--chart-axis)]',
  },
}

export const severityRouteStyle: Record<
  AlertSeverity,
  { strokeDasharray?: string }
> = {
  high: {},
  medium: {
    strokeDasharray: '9 4',
  },
  low: {
    strokeDasharray: '2.5 4.5',
  },
}

export const processedAlertMeta: Record<
  AlertDecision,
  { label: string; actionLabel: string; tone: string; badgeTone: string }
> = {
  inReview: {
    label: 'In Review',
    actionLabel: 'Start Review',
    tone: 'border-[var(--line)] bg-[var(--surface)]',
    badgeTone: 'bg-[var(--surface-strong)] text-[var(--ink)]',
  },
  closed: {
    label: 'Closed',
    actionLabel: 'Close',
    tone: 'border-[var(--line)] bg-white',
    badgeTone: 'bg-white text-[var(--muted)]',
  },
  mrosReview: {
    label: 'MROS Review',
    actionLabel: 'Send to MROS Review',
    tone: 'border-[var(--line)] bg-[var(--surface)]',
    badgeTone: 'bg-[var(--surface-strong)] text-[var(--ink)]',
  },
}

export const formatAlertTime = (timestamp: string) => {
  const date = new Date(timestamp)
  const month = date.toLocaleString('en-US', { month: 'short' })
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')

  return `${month} ${day}, ${hours}:${minutes}`
}

export const formatCompactNumber = (value: number) =>
  !Number.isFinite(value)
    ? 'N/A'
    : Math.abs(value) >= 1000
    ? compactNumberFormatter.format(value).replace(/([0-9])([A-Z])$/, '$1 $2')
    : wholeNumberFormatter.format(value)

export const formatCompactAmount = (value: number, currency: string) => `${formatCompactNumber(value)} ${currency}`

export const buildAlertPreviews = (records: BackendFeatureRecord[]): AlertPreview[] =>
  [...records]
    .filter((record) => isPredictedAlert(record))
    .sort((left, right) => scoreTransactionRisk(right) - scoreTransactionRisk(left))
    .map((record) => {
    const confidence = scoreTransactionRisk(record)
    const severity = getAlertSeverity(confidence)

    return {
      id:
        record.recordKey ??
        [
          record.timestamp,
          record.fromBank,
          record.fromAccount,
          record.toBank,
          record.toAccount,
          record.amountPaid,
          record.paymentCurrency,
        ].join('-'),
      severity,
      confidence,
      timeLabel: formatAlertTime(record.timestamp),
      routeLabel: `${record.fromCountry} -> ${record.toCountry}`,
      amountLabel: formatCompactAmount(record.amountPaid, record.paymentCurrency),
      record,
    }
  })

export const alertMatchesSearch = (alert: AlertPreview, query: string) => {
  const normalizedQuery = query.trim().toLowerCase()

  if (!normalizedQuery) {
    return true
  }

  const searchTokens = normalizedQuery.split(/\s+/).filter(Boolean)
  const searchText = [
    alert.routeLabel,
    alert.timeLabel,
    alert.amountLabel,
    alert.severity,
    alert.record.timestamp,
    alert.record.fromBank,
    alert.record.fromAccount,
    alert.record.fromCountry,
    alert.record.toBank,
    alert.record.toAccount,
    alert.record.toCountry,
    alert.record.amountReceived,
    alert.record.receivingCurrency,
    alert.record.amountPaid,
    alert.record.paymentCurrency,
    alert.record.paymentFormat,
  ]
    .join(' ')
    .toLowerCase()

  return searchTokens.every((token) => searchText.includes(token))
}

export const getAlertSeverity = (confidence: number): AlertSeverity =>
  confidence >= 0.82 ? 'high' : confidence >= 0.68 ? 'medium' : 'low'

export const computeBaseWaterfallContributions = (record: BackendFeatureRecord) =>
  amlFeatures.map((feature, index) => {
    const normalizedValue = normalizeShapFeatureValue(record, feature.key)
    const centeredValue = normalizedValue - 0.5
    const direction =
      feature.kind === 'categorical'
        ? hashText(feature.key) % 2 === 0
          ? 1
          : -1
        : 1
    const magnitudeSeed =
      feature.kind === 'numeric'
        ? 0.22
        : feature.kind === 'temporal'
          ? 0.18
          : 0.12
    const contribution = Number(
      (centeredValue * direction * (magnitudeSeed + (index % 4) * 0.03)).toFixed(3),
    )

    return {
      featureKey: feature.key,
      centeredValue,
      contribution,
    }
  })

export const buildWaterfallShapData = (record: BackendFeatureRecord, selectedFeatures: FeatureKey[]) => {
  const selectedFeatureSet = new Set(selectedFeatures)
  const baseContributions = computeBaseWaterfallContributions(record)
  const activeBaseContributions = baseContributions.filter((feature) =>
    selectedFeatureSet.has(feature.featureKey),
  )

  if (activeBaseContributions.length === 0) {
    return []
  }

  const omittedContributionMass = baseContributions
    .filter((feature) => !selectedFeatureSet.has(feature.featureKey))
    .reduce((total, feature) => total + feature.contribution, 0)

  const weightedActiveContributions = activeBaseContributions.map((feature) => {
    const weight =
      (Math.abs(feature.contribution) + 0.05) * (1 + Math.abs(feature.centeredValue) * 0.7)
    const directionalBlend =
      omittedContributionMass === 0
        ? 1
        : Math.sign(feature.contribution || 1) === Math.sign(omittedContributionMass)
          ? 1.1
          : 0.55

    return {
      ...feature,
      weight,
      directionalBlend,
    }
  })

  const adjustmentWeightTotal = weightedActiveContributions.reduce(
    (total, feature) => total + feature.weight * feature.directionalBlend,
    0,
  )

  const adjustedFeatures = weightedActiveContributions.map((feature) => {
    const contextualAdjustment =
      adjustmentWeightTotal > 0
        ? omittedContributionMass * ((feature.weight * feature.directionalBlend) / adjustmentWeightTotal)
        : 0

    return {
      featureKey: feature.featureKey,
      contribution: Number((feature.contribution + contextualAdjustment).toFixed(3)),
    }
  })

  const sortedFeatures = [...adjustedFeatures].sort(
    (left, right) => Math.abs(right.contribution) - Math.abs(left.contribution),
  )
  let runningTotal = 0

  return sortedFeatures.map((feature) => {
    const start = runningTotal
    const end = runningTotal + feature.contribution
    runningTotal = end

    return {
      ...feature,
      start,
      end,
    }
  })
}

export const buildRocCurveData = (records: BackendFeatureRecord[]) => {
  const thresholds = Array.from({ length: 21 }, (_, index) => index / 20)
  const points = thresholds.map((threshold) => {
    let truePositive = 0
    let falsePositive = 0
    let falseNegative = 0
    let trueNegative = 0

    records.forEach((record) => {
      const actualPositive = labelTransactionOutcome(record)
      const predictedPositive = record.modelScore >= threshold

      if (predictedPositive && actualPositive) truePositive += 1
      if (predictedPositive && !actualPositive) falsePositive += 1
      if (!predictedPositive && actualPositive) falseNegative += 1
      if (!predictedPositive && !actualPositive) trueNegative += 1
    })

    const truePositiveRate =
      truePositive + falseNegative > 0 ? truePositive / (truePositive + falseNegative) : 0
    const falsePositiveRate =
      falsePositive + trueNegative > 0 ? falsePositive / (falsePositive + trueNegative) : 0

    return {
      threshold,
      falsePositiveRate,
      truePositiveRate,
    }
  })

  const auc = points.slice(1).reduce((total, point, index) => {
    const previous = points[index]
    const width = Math.abs(point.falsePositiveRate - previous.falsePositiveRate)
    const height = (point.truePositiveRate + previous.truePositiveRate) / 2
    return total + width * height
  }, 0)

  return {
    points,
    auc,
  }
}

const resolveApiBaseUrl = () => {
  const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL

  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/$/, '')
  }

  if (typeof window === 'undefined') {
    return 'http://127.0.0.1:8080'
  }

  const { protocol, hostname } = window.location
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://127.0.0.1:8080'
  }

  return `${protocol}//be.${hostname}`.replace(/\/$/, '')
}

const API_BASE_URL = resolveApiBaseUrl()

const featureKeyToQueryKey: Record<FeatureKey, string> = {
  timestamp: 'timestamp',
  fromBank: 'fromBank',
  fromAccount: 'fromAccount',
  fromCountry: 'fromCountry',
  toBank: 'toBank',
  toAccount: 'toAccount',
  toCountry: 'toCountry',
  amountReceived: 'amountReceived',
  receivingCurrency: 'receivingCurrency',
  amountPaid: 'amountPaid',
  paymentCurrency: 'paymentCurrency',
  paymentFormat: 'paymentFormat',
}

const buildFilterQueryParams = (featureFilters: Record<FeatureKey, FeatureFilterState>) => {
  const params = new URLSearchParams()

  amlFeatures.forEach((feature) => {
    const filter = featureFilters[feature.key]

    if (feature.kind === 'categorical') {
      filter.selectedValues.forEach((value) => {
        params.append(featureKeyToQueryKey[feature.key], value)
      })
      return
    }

    if (feature.key === 'timestamp') {
      if (filter.min) {
        params.set('timestampMin', new Date(Number(filter.min)).toISOString())
      }
      if (filter.max) {
        params.set('timestampMax', new Date(Number(filter.max)).toISOString())
      }
      if (filter.timeStart && filter.timeStart !== '00:00') {
        params.set('timeStart', filter.timeStart)
      }
      if (filter.timeEnd && filter.timeEnd !== '23:59') {
        params.set('timeEnd', filter.timeEnd)
      }
      return
    }

    if (filter.min) {
      params.set(`${featureKeyToQueryKey[feature.key]}Min`, filter.min)
    }
    if (filter.max) {
      params.set(`${featureKeyToQueryKey[feature.key]}Max`, filter.max)
    }
  })

  return params
}

const applyActiveFeatureQueryParams = (params: URLSearchParams, activeFeatureKeys?: FeatureKey[]) => {
  if (!activeFeatureKeys) {
    return
  }

  if (activeFeatureKeys.length === 0) {
    params.append('featureKeys', '')
    return
  }

  activeFeatureKeys.forEach((featureKey) => {
    params.append('featureKeys', featureKey)
  })
}

const applyMlPredictionsToRecords = (
  records: BackendFeatureRecord[],
  predictions: MlRecordPrediction[],
) => {
  const predictionByRecordKey = new Map(
    predictions.map((prediction) => [prediction.recordKey, prediction] as const),
  )

  return records.map((record) => {
    const prediction = record.recordKey ? predictionByRecordKey.get(record.recordKey) : undefined

    if (!prediction) {
      return record
    }

    return {
      ...record,
      predictedAlert: prediction.predictedAlert,
      modelScore: prediction.modelScore,
    }
  })
}

const buildDashboardPayloadFromMlResults = (payload: MlResultsPayload): DashboardPayload => ({
  records: applyMlPredictionsToRecords(payload.records, payload.predictions),
  metrics: payload.metrics,
  shap: payload.shap.map((row) => {
    const sampleStep = Math.max(1, Math.floor(payload.records.length / 220))
    const sampledRecords = payload.records.filter((_, index) => index % sampleStep === 0).slice(0, 220)

    return {
      ...row,
      points: row.points.map((point, pointIndex) => ({
        ...point,
        recordKey: sampledRecords[pointIndex]?.recordKey ?? String(sampledRecords[pointIndex]?.id ?? ''),
      })),
    }
  }),
  confusionMatrix: payload.confusionMatrix,
  predictions: payload.predictions,
  roc: payload.roc,
  model: payload.model,
  batch: payload.batch,
  totalRecordCount: payload.totalFilteredRecordCount,
  dashboardSampleCount: payload.totalFilteredRecordCount,
})

export const createEmptyDashboardPayload = (): DashboardPayload => {
  const confusionMatrix: DashboardPayload['confusionMatrix'] = {
    total: 0,
    alertCount: 0,
    truePositive: 0,
    falsePositive: 0,
    falseNegative: 0,
    trueNegative: 0,
  }

  return {
    records: [],
    metrics: buildMetricsFromConfusionMatrix(confusionMatrix),
    shap: [],
    confusionMatrix,
    predictions: [],
    roc: buildRocCurveData([]),
    totalRecordCount: 0,
    dashboardSampleCount: 0,
  }
}

export const sliceDashboardPayload = (
  payload: DashboardPayload,
  startIndex: number,
  endIndex: number,
): DashboardPayload => ({
  ...payload,
  records: payload.records.slice(startIndex, endIndex),
  predictions: payload.predictions?.slice(startIndex, endIndex),
  batch: payload.batch
    ? {
        ...payload.batch,
        batchSize: Math.max(0, endIndex - startIndex),
        returnedRecordCount: Math.max(0, endIndex - startIndex),
        hasNextBatch: endIndex < payload.records.length || payload.batch.hasNextBatch,
        nextCursorId:
          payload.records[Math.max(0, endIndex - 1)]?.id ?? payload.batch.nextCursorId,
        inferenceMinId:
          payload.records[startIndex]?.id ?? payload.batch.inferenceMinId,
        inferenceMaxId:
          payload.records[Math.max(0, endIndex - 1)]?.id ?? payload.batch.inferenceMaxId,
      }
    : payload.batch,
})

const mergeShapRows = (
  existingRows: DashboardPayload['shap'],
  incomingRows: DashboardPayload['shap'],
): DashboardPayload['shap'] => {
  const rowsByFeature = new Map<FeatureKey, DashboardPayload['shap'][number]>()

  ;[...existingRows, ...incomingRows].forEach((row) => {
    const currentRow = rowsByFeature.get(row.featureKey)
    if (!currentRow) {
      rowsByFeature.set(row.featureKey, {
        ...row,
        points: row.points.slice(0, 220),
      })
      return
    }

    const combinedPoints = [...currentRow.points, ...row.points]
    const sampleStep = Math.max(1, Math.ceil(combinedPoints.length / 220))
    rowsByFeature.set(row.featureKey, {
      featureKey: row.featureKey,
      importance: Number(((currentRow.importance + row.importance) / 2).toFixed(2)),
      points: combinedPoints.filter((_, index) => index % sampleStep === 0).slice(0, 220),
    })
  })

  return Array.from(rowsByFeature.values()).sort((left, right) => right.importance - left.importance)
}

export const mergeDashboardPayloads = (
  currentPayload: DashboardPayload,
  nextPayload: DashboardPayload,
): DashboardPayload => {
  const recordsByKey = new Map<string, BackendFeatureRecord>()
  currentPayload.records.forEach((record) => {
    recordsByKey.set(record.recordKey ?? String(record.id), record)
  })

  const incomingRecords = nextPayload.records.filter((record) => {
    const recordKey = record.recordKey ?? String(record.id)
    return !recordsByKey.has(recordKey)
  })
  incomingRecords.forEach((record) => {
    recordsByKey.set(record.recordKey ?? String(record.id), record)
  })

  const predictionsByKey = new Map<string, MlRecordPrediction>()
  ;[...(currentPayload.predictions ?? []), ...(nextPayload.predictions ?? [])].forEach((prediction) => {
    predictionsByKey.set(prediction.recordKey, prediction)
  })

  const records = Array.from(recordsByKey.values())
  const predictions = Array.from(predictionsByKey.values())
  const incomingConfusionMatrix = buildConfusionMatrixFromRecords(incomingRecords)
  const confusionMatrix = addConfusionMatrices(
    currentPayload.confusionMatrix,
    incomingConfusionMatrix,
  )

  return {
    ...nextPayload,
    records,
    predictions,
    metrics: buildMetricsFromConfusionMatrix(confusionMatrix),
    shap: mergeShapRows(currentPayload.shap, nextPayload.shap),
    confusionMatrix,
    roc: buildRocCurveData(records),
    model: nextPayload.model ?? currentPayload.model,
    batch: nextPayload.batch ?? currentPayload.batch,
    totalRecordCount: nextPayload.totalRecordCount ?? currentPayload.totalRecordCount,
    dashboardSampleCount: nextPayload.dashboardSampleCount ?? currentPayload.dashboardSampleCount,
  }
}

export const isSameInferenceRun = (
  currentPayload: DashboardPayload | null,
  nextPayload: DashboardPayload,
) => {
  if (!currentPayload?.model || !nextPayload.model) {
    return false
  }

  return (
    currentPayload.model.modelStoragePath === nextPayload.model.modelStoragePath &&
    currentPayload.model.threshold === nextPayload.model.threshold &&
    currentPayload.model.featureKeys.length === nextPayload.model.featureKeys.length &&
    currentPayload.model.featureKeys.every((featureKey, index) => featureKey === nextPayload.model?.featureKeys[index])
  )
}

export const shouldAddDashboardPayload = (
  currentPayload: DashboardPayload | null,
  nextPayload: DashboardPayload,
) => {
  if (!isSameInferenceRun(currentPayload, nextPayload)) {
    return false
  }

  const currentCursor = currentPayload?.batch?.nextCursorId ?? 0
  const nextMinId = nextPayload.batch?.inferenceMinId ?? 0
  return nextMinId > currentCursor
}

export const shouldIgnoreStaleDashboardPayload = (
  currentPayload: DashboardPayload | null,
  nextPayload: DashboardPayload,
) => {
  return (
    isSameInferenceRun(currentPayload, nextPayload) &&
    (nextPayload.records.length < (currentPayload?.records.length ?? 0) ||
      nextPayload.confusionMatrix.total < (currentPayload?.confusionMatrix.total ?? 0))
  )
}

export const loadMlResults = async (
  featureFilters?: Record<FeatureKey, FeatureFilterState>,
  signal?: AbortSignal,
  limit = INITIAL_ML_RESULT_LIMIT,
  activeFeatureKeys?: FeatureKey[],
  afterId?: number,
  dashboardSampleOnly = false,
): Promise<MlResultsPayload> => {
  const params = featureFilters ? buildFilterQueryParams(featureFilters) : new URLSearchParams()
  params.set('limit', String(limit))
  params.set('dashboardSampleOnly', String(dashboardSampleOnly))
  if (afterId !== undefined) {
    params.set('afterId', String(afterId))
  }
  applyActiveFeatureQueryParams(params, activeFeatureKeys)

  const response = await fetch(`${API_BASE_URL}/transactions/ml-results?${params.toString()}`, {
    signal,
  })

  if (!response.ok) {
    throw new Error('Failed to load backend ML results')
  }

  return (await response.json()) as MlResultsPayload
}

export const streamMlResults = async (
  featureFilters: Record<FeatureKey, FeatureFilterState> | undefined,
  signal: AbortSignal,
  onPayload: (payload: MlResultsPayload) => void,
  options: {
    activeFeatureKeys?: FeatureKey[]
    afterId?: number
    batchSize?: number
    dashboardSampleOnly?: boolean
    maxRecords?: number
  } = {},
): Promise<void> => {
  const params = featureFilters ? buildFilterQueryParams(featureFilters) : new URLSearchParams()
  params.set('batchSize', String(options.batchSize ?? STREAMING_ML_RESULT_BATCH_SIZE))
  params.set('dashboardSampleOnly', String(options.dashboardSampleOnly ?? false))
  params.set('maxRecords', String(options.maxRecords ?? PROGRESSIVE_ML_RESULT_MAX_RECORDS))
  if (options.afterId !== undefined) {
    params.set('afterId', String(options.afterId))
  }
  applyActiveFeatureQueryParams(params, options.activeFeatureKeys)

  const response = await fetch(`${API_BASE_URL}/transactions/ml-results/stream?${params.toString()}`, {
    signal,
  })

  if (!response.ok || !response.body) {
    throw new Error('Failed to stream backend ML results')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (signal.aborted) {
      break
    }

    buffer += decoder.decode(value, { stream: !done })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    lines.forEach((line) => {
      if (signal.aborted) {
        return
      }

      const trimmedLine = line.trim()
      if (trimmedLine) {
        onPayload(JSON.parse(trimmedLine) as MlResultsPayload)
      }
    })

    if (done) {
      break
    }
  }

  const finalLine = buffer.trim()
  if (!signal.aborted && finalLine) {
    onPayload(JSON.parse(finalLine) as MlResultsPayload)
  }
}

export const loadDashboardPayload = async (
  signal?: AbortSignal,
  featureFilters?: Record<FeatureKey, FeatureFilterState>,
  activeFeatureKeys?: FeatureKey[],
  dashboardSampleOnly = false,
): Promise<DashboardPayload> => {
  const dashboardPayload = buildDashboardPayloadFromMlResults(
    await loadMlResults(
      featureFilters,
      signal,
      dashboardSampleOnly ? DASHBOARD_SAMPLE_RESULT_LIMIT : INITIAL_ML_RESULT_LIMIT,
      activeFeatureKeys,
      undefined,
      dashboardSampleOnly,
    ),
  )

  return {
    ...dashboardPayload,
    batch: dashboardPayload.batch
      ? {
          ...dashboardPayload.batch,
          dashboardSampleOnly,
        }
      : undefined,
  }
}

export { buildDashboardPayloadFromMlResults }

export const loadDashboardSummary = async (
  featureFilters: Record<FeatureKey, FeatureFilterState>,
  signal?: AbortSignal,
): Promise<DashboardSummary> => {
  try {
    const payload = await loadMlResults(featureFilters, signal)

    return {
      metrics: payload.metrics,
      confusionMatrix: payload.confusionMatrix,
      filteredRecordCount: payload.filteredRecordCount,
      totalRecordCount: payload.filteredRecordCount,
    }
  } catch {
    const params = buildFilterQueryParams(featureFilters)
    const response = await fetch(`${API_BASE_URL}/transactions/dashboard-summary?${params.toString()}`, {
      signal,
    })

    if (!response.ok) {
      throw new Error('Failed to load dashboard summary from backend')
    }

    return (await response.json()) as DashboardSummary
  }
}

export const loadTransactionAlerts = async (
  featureFilters: Record<FeatureKey, FeatureFilterState>,
  limit = 600,
  signal?: AbortSignal,
): Promise<AlertsResponse> => {
  try {
    const payload = await loadMlResults(featureFilters, signal, Math.min(limit, 1000))
    const records = applyMlPredictionsToRecords(payload.records, payload.predictions)
    const alerts = buildAlertPreviews(records)

    return {
      alerts,
      filteredAlertCount: alerts.length,
      totalFilteredRecordCount: payload.filteredRecordCount,
    }
  } catch {
    const params = buildFilterQueryParams(featureFilters)
    params.set('limit', String(limit))
    const response = await fetch(`${API_BASE_URL}/transactions/alerts?${params.toString()}`, {
      signal,
    })

    if (!response.ok) {
      throw new Error('Failed to load alert queue from backend')
    }

    return (await response.json()) as AlertsResponse
  }
}
