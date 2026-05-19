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
export const compactNumberFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
})
export const wholeNumberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
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
export const isPredictedAlert = (record: BackendFeatureRecord) => record.modelScore >= ALERT_THRESHOLD

export const buildConfusionMatrixFromRecords = (
  records: BackendFeatureRecord[],
): DashboardPayload['confusionMatrix'] =>
  records.reduce(
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

export const buildMetricsFromConfusionMatrix = (
  confusionMatrix: DashboardPayload['confusionMatrix'],
): MetricCardProps[] => {
  const { truePositive, falsePositive, falseNegative, trueNegative, total } = confusionMatrix
  const accuracy = total > 0 ? (truePositive + trueNegative) / total : 0
  const precision = truePositive + falsePositive > 0 ? truePositive / (truePositive + falsePositive) : 0
  const recall = truePositive + falseNegative > 0 ? truePositive / (truePositive + falseNegative) : 0
  const f1Score = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0

  return [
    { label: 'Accuracy', value: `${(accuracy * 100).toFixed(1)}%`, detail: 'Filtered selection' },
    { label: 'Precision', value: `${(precision * 100).toFixed(1)}%`, detail: 'Filtered alerts' },
    { label: 'Recall', value: `${(recall * 100).toFixed(1)}%`, detail: 'Filtered positives' },
    { label: 'F1 Score', value: `${(f1Score * 100).toFixed(1)}%`, detail: 'Filtered balance' },
  ]
}

export type AlertSeverity = 'high' | 'medium' | 'low'
export type AlertDecision = 'accepted' | 'rejected'

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
    tone: 'border-[var(--signal)]/25 bg-[var(--signal-soft)]/55',
    badgeTone: 'bg-[var(--signal)] text-white',
    dotTone: 'bg-[var(--signal)]',
  },
  medium: {
    label: 'Medium Importance',
    tone: 'border-[var(--aux)]/20 bg-[rgba(91,108,250,0.10)]',
    badgeTone: 'bg-[var(--aux)] text-white',
    dotTone: 'bg-[var(--aux)]',
  },
  low: {
    label: 'Low Importance',
    tone: 'border-[var(--accent)]/20 bg-[var(--accent-soft)]/45',
    badgeTone: 'bg-[var(--accent)] text-white',
    dotTone: 'bg-[var(--accent)]',
  },
}

export const processedAlertMeta: Record<
  AlertDecision,
  { label: string; actionLabel: string; tone: string; badgeTone: string }
> = {
  accepted: {
    label: 'Accepted',
    actionLabel: 'Accept',
    tone: 'border-[var(--line)] bg-[var(--surface-strong)]/80',
    badgeTone: 'bg-[var(--surface-strong)] text-[var(--ink)]',
  },
  rejected: {
    label: 'Rejected',
    actionLabel: 'Reject',
    tone: 'border-[var(--line)] bg-[var(--surface-strong)]/80',
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
  Math.abs(value) >= 1000
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
      id: [
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

export const loadDashboardPayload = async (): Promise<DashboardPayload> => {
  const response = await fetch('/ibm_aml_frontend_sample.json')

  if (!response.ok) {
    throw new Error('Failed to load IBM AML dataset sample')
  }

  const records = (await response.json()) as BackendFeatureRecord[]

  return {
    records,
    metrics: buildMetricsFromConfusionMatrix(buildConfusionMatrixFromRecords(records)),
    shap: buildShapRows(records),
    confusionMatrix: buildConfusionMatrixFromRecords(records),
  }
}
