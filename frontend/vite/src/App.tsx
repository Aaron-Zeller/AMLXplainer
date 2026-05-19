import 'driver.js/dist/driver.css'
import { useCallback, useEffect, useRef, useState } from 'react'

import { AlertIcon, LayersIcon, PauseIcon, PlayIcon } from './components/common/icons'
import ConfusionMatrixCard from './components/charts/ConfusionMatrixCard'
import MetricCard from './components/charts/MetricCard'
import RocCurvePlot from './components/charts/RocCurvePlot'
import ShapBarPlot from './components/charts/ShapBarPlot'
import ShapPlot from './components/charts/ShapPlot'
import TransactionsAlertExplorer from './components/transactions/TransactionsAlertExplorer'
import TransactionsWorkbench from './components/transactions/TransactionsWorkbench'
import { useOnboardingTour } from './hooks/useOnboardingTour'
import {
  amlFeatures,
  buildAlertPreviews,
  buildConfusionMatrixFromRecords,
  buildMetricsFromConfusionMatrix,
  createEmptyDashboardPayload,
  buildDashboardPayloadFromMlResults,
  dateInputToEpochEnd,
  dateInputToEpochStart,
  epochToDateInputValue,
  epochToDateTimeLabel,
  formatCompactNumber,
  loadDashboardPayload,
  mergeDashboardPayloads,
  PROGRESSIVE_ML_RESULT_MAX_RECORDS,
  sliceDashboardPayload,
  STREAMING_ML_RESULT_BATCH_SIZE,
  streamMlResults,
  timeInputToMinutes,
  timestampToEpoch,
  type DashboardPayload,
  type FeatureKey,
  type WorkspaceTab,
} from './lib/dashboard'
import { useAppStore } from './store/appStore'

const featureSelectionNavigationItem = {
  id: 'feature-selection',
  label: 'Feature Selection',
  subtitle: 'Inputs and variables',
  shortLabel: 'Features',
  icon: LayersIcon,
  sections: amlFeatures.map((feature) => feature.label),
} as const

const alertQueueNavigationItem = {
  id: 'alert-queue',
  label: 'Alerts',
  subtitle: 'Flagged transactions',
  shortLabel: 'Alerts',
  icon: AlertIcon,
  sections: ['Filtered Alerts', 'Triage Status'],
} as const

const navigationItems = [alertQueueNavigationItem, featureSelectionNavigationItem] as const

type NavigationItem = (typeof navigationItems)[number]

const loadingMessages = [
  'Preparing model outputs',
  'Loading representative transaction sample',
  'Starting inference stream',
] as const
const STREAMING_REVEAL_CHUNK_SIZE = 8
const STREAMING_REVEAL_INTERVAL_MS = 24

function App() {
  const initialFeatureFilters = useRef(useAppStore.getState().featureFilters)
  const streamAbortControllerRef = useRef<AbortController | null>(null)
  const streamRunIdRef = useRef(0)
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0)
  const [isSlowLoading, setIsSlowLoading] = useState(false)
  const [isStreamingMlResults, setIsStreamingMlResults] = useState(false)
  const [hasStartedMlResultStream, setHasStartedMlResultStream] = useState(false)
  const [streamingError, setStreamingError] = useState<string | null>(null)
  const [isWaterfallRecomputing, setIsWaterfallRecomputing] = useState(false)
  const activeWorkspaceTab = useAppStore((state) => state.activeWorkspaceTab)
  const setActiveWorkspaceTab = useAppStore((state) => state.setActiveWorkspaceTab)
  const activeWorldItemId = useAppStore((state) => state.activeWorldItemId)
  const setActiveWorldItemId = useAppStore((state) => state.setActiveWorldItemId)
  const isExplorerCollapsed = useAppStore((state) => state.isExplorerCollapsed)
  const setIsExplorerCollapsed = useAppStore((state) => state.setIsExplorerCollapsed)
  const selectedFeatureKeys = useAppStore((state) => state.selectedFeatureKeys)
  const expandedFeatureKeys = useAppStore((state) => state.expandedFeatureKeys)
  const expandedAlertSeverities = useAppStore((state) => state.expandedAlertSeverities)
  const expandedProcessedCategories = useAppStore((state) => state.expandedProcessedCategories)
  const selectedTransactionAlertId = useAppStore((state) => state.selectedTransactionAlertId)
  const processedAlertDecisions = useAppStore((state) => state.processedAlertDecisions)
  const featureFilters = useAppStore((state) => state.featureFilters)
  const dashboardPayload = useAppStore((state) => state.dashboardPayload)
  const setDashboardPayload = useAppStore((state) => state.setDashboardPayload)
  const toggleFeatureSelection = useAppStore((state) => state.toggleFeatureSelection)
  const toggleFeatureExpansion = useAppStore((state) => state.toggleFeatureExpansion)
  const toggleAlertSeverity = useAppStore((state) => state.toggleAlertSeverity)
  const toggleProcessedCategory = useAppStore((state) => state.toggleProcessedCategory)
  const setSelectedTransactionAlertId = useAppStore((state) => state.setSelectedTransactionAlertId)
  const setAlertDecision = useAppStore((state) => state.setAlertDecision)
  const updateFeatureFilter = useAppStore((state) => state.updateFeatureFilter)
  const addCategoryFilterValue = useAppStore((state) => state.addCategoryFilterValue)
  const removeCategoryFilterValue = useAppStore((state) => state.removeCategoryFilterValue)
  const activeWorldItem =
    navigationItems.find((item) => item.id === activeWorldItemId) ?? alertQueueNavigationItem
  const sourceRecords = dashboardPayload?.records ?? []
  const selectedFeatureSet = new Set(selectedFeatureKeys)
  const categoricalOptionsByFeature = amlFeatures.reduce<Partial<Record<FeatureKey, string[]>>>(
    (accumulator, feature) => {
      if (feature.kind === 'categorical' && sourceRecords.length > 0) {
        accumulator[feature.key] = Array.from(
          new Set(sourceRecords.map((record) => String(record[feature.key]))),
        ).sort()
      }

      return accumulator
    },
    {},
  )
  const numericBoundsByFeature = amlFeatures.reduce<
    Partial<Record<FeatureKey, { min: number; max: number; step: number }>>
  >((accumulator, feature) => {
    if (feature.kind === 'numeric' && sourceRecords.length > 0) {
      const values = sourceRecords.map((record) => Number(record[feature.key]))
      accumulator[feature.key] = {
        min: Math.min(...values),
        max: Math.max(...values),
        step: 1000,
      }
    }

    if (feature.key === 'timestamp' && sourceRecords.length > 0) {
      const values = sourceRecords.map((record) => timestampToEpoch(record.timestamp))
      accumulator[feature.key] = {
        min: Math.min(...values),
        max: Math.max(...values),
        step: 15 * 60 * 1000,
      }
    }

    return accumulator
  }, {})
  const activeDashboardPayload = dashboardPayload
  const dashboardRecords =
    activeDashboardPayload?.records.filter((record) =>
      amlFeatures.every((feature) => {
        const filter = featureFilters[feature.key]

        if (feature.kind === 'categorical') {
          if (filter.selectedValues.length === 0) {
            return true
          }

          return filter.selectedValues.includes(String(record[feature.key]))
        }

        const rawValue =
          feature.key === 'timestamp'
            ? timestampToEpoch(record.timestamp)
            : Number(record[feature.key])
        const minValue = filter.min ? Number(filter.min) : undefined
        const maxValue = filter.max ? Number(filter.max) : undefined

        if (minValue !== undefined && !Number.isNaN(minValue) && rawValue < minValue) {
          return false
        }

        if (maxValue !== undefined && !Number.isNaN(maxValue) && rawValue > maxValue) {
          return false
        }

        if (feature.key === 'timestamp') {
          const date = new Date(record.timestamp)
          const minutes = date.getHours() * 60 + date.getMinutes()
          const startMinutes = timeInputToMinutes(filter.timeStart || '00:00')
          const endMinutes = timeInputToMinutes(filter.timeEnd || '23:59')

          if (startMinutes <= endMinutes) {
            if (minutes < startMinutes || minutes > endMinutes) {
              return false
            }
          } else if (minutes < startMinutes && minutes > endMinutes) {
            return false
          }
        }

        return true
      }),
    ) ?? []
  const allShap = activeDashboardPayload?.shap ?? []
  const allNumericalShap = allShap.filter((row) =>
    amlFeatures.some((feature) => feature.key === row.featureKey && feature.kind === 'numeric'),
  )
  const fallbackConfusionMatrix = buildConfusionMatrixFromRecords(dashboardRecords)
  const fallbackMetrics = buildMetricsFromConfusionMatrix(fallbackConfusionMatrix)
  const fallbackAlerts = buildAlertPreviews(dashboardRecords)
  const hasActiveFeatureFilters = Object.values(featureFilters).some(
    (filter) =>
      Boolean(filter.min) ||
      Boolean(filter.max) ||
      (filter.timeStart != null && filter.timeStart !== '00:00') ||
      (filter.timeEnd != null && filter.timeEnd !== '23:59') ||
      filter.selectedValues.length > 0,
  )
  const filteredConfusionMatrix = hasActiveFeatureFilters
    ? fallbackConfusionMatrix
    : activeDashboardPayload?.confusionMatrix ?? fallbackConfusionMatrix
  const filteredMetrics = hasActiveFeatureFilters
    ? fallbackMetrics
    : activeDashboardPayload?.metrics ?? fallbackMetrics
  const hasKnownPositive =
    filteredConfusionMatrix.truePositive + filteredConfusionMatrix.falseNegative > 0
  const hasPredictedAlert = filteredConfusionMatrix.alertCount > 0
  const shouldShowNoConfirmedFraudOverlay =
    filteredConfusionMatrix.total > 0 &&
    !hasKnownPositive
  const shouldShowNoFraudOverlay =
    filteredConfusionMatrix.total > 0 &&
    !hasKnownPositive &&
    !hasPredictedAlert
  const transactionAlerts = fallbackAlerts
  const predictionByRecordKey = new Map(
    (activeDashboardPayload?.predictions ?? []).map((prediction) => [prediction.recordKey, prediction] as const),
  )
  const explorerNavigationItems =
    activeWorkspaceTab === 'world'
      ? ([featureSelectionNavigationItem, alertQueueNavigationItem] as const)
      : ([featureSelectionNavigationItem] as const)
  const activeItem =
    activeWorkspaceTab === 'world' ? activeWorldItem : featureSelectionNavigationItem
  const hasReachedMlResultStreamEnd = Boolean(
    hasStartedMlResultStream &&
      !isStreamingMlResults &&
      dashboardPayload &&
      ((dashboardPayload.batch != null && !dashboardPayload.batch.hasNextBatch) ||
        dashboardPayload.records.length >= PROGRESSIVE_ML_RESULT_MAX_RECORDS),
  )

  const stopMlResultStream = useCallback((options: { resetSession?: boolean } = {}) => {
    streamRunIdRef.current += 1
    streamAbortControllerRef.current?.abort()
    streamAbortControllerRef.current = null
    setIsStreamingMlResults(false)
    if (options.resetSession) {
      setHasStartedMlResultStream(false)
    }
  }, [])

  const startMlResultStream = useCallback((options: { restartWithDashboardSample?: boolean } = {}) => {
    if (streamAbortControllerRef.current) {
      return
    }

    if (options.restartWithDashboardSample) {
      const abortController = new AbortController()
      const streamRunId = streamRunIdRef.current + 1
      const selectedFeatureSnapshot = [...useAppStore.getState().selectedFeatureKeys]
      let accumulatedSamplePayload: DashboardPayload | null = createEmptyDashboardPayload()
      let pendingDashboardPayloadSlices: DashboardPayload[] = []
      let revealTimerId: number | null = null
      let hasSampleStreamFinished = false

      const startFullStreamAfterSample = () => {
        if (
          streamAbortControllerRef.current === abortController &&
          streamRunIdRef.current === streamRunId &&
          !abortController.signal.aborted
        ) {
          streamAbortControllerRef.current = null
          startMlResultStream()
        }
      }

      const finishSampleIfRevealQueueDrained = () => {
        if (!hasSampleStreamFinished || pendingDashboardPayloadSlices.length > 0) {
          return
        }

        startFullStreamAfterSample()
      }

      const revealNextSamplePayloadSlice = () => {
        revealTimerId = null

        if (abortController.signal.aborted || streamRunIdRef.current !== streamRunId) {
          pendingDashboardPayloadSlices = []
          return
        }

        const nextDashboardPayload = pendingDashboardPayloadSlices.shift()
        if (!nextDashboardPayload) {
          finishSampleIfRevealQueueDrained()
          return
        }

        accumulatedSamplePayload = accumulatedSamplePayload
          ? mergeDashboardPayloads(accumulatedSamplePayload, nextDashboardPayload)
          : nextDashboardPayload
        setDashboardPayload(accumulatedSamplePayload)

        scheduleSampleReveal()
        finishSampleIfRevealQueueDrained()
      }

      const scheduleSampleReveal = () => {
        if (revealTimerId != null || pendingDashboardPayloadSlices.length === 0) {
          return
        }

        revealTimerId = window.setTimeout(revealNextSamplePayloadSlice, STREAMING_REVEAL_INTERVAL_MS)
      }

      streamRunIdRef.current = streamRunId
      streamAbortControllerRef.current = abortController
      setStreamingError(null)
      setHasStartedMlResultStream(true)
      setIsStreamingMlResults(true)
      setDashboardPayload(createEmptyDashboardPayload())

      void streamMlResults(
        undefined,
        abortController.signal,
        (mlPayload) => {
          if (abortController.signal.aborted || streamRunIdRef.current !== streamRunId) {
            return
          }

          const nextDashboardPayload = buildDashboardPayloadFromMlResults(mlPayload)
          nextDashboardPayload.batch = nextDashboardPayload.batch
            ? {
                ...nextDashboardPayload.batch,
                dashboardSampleOnly: true,
              }
            : nextDashboardPayload.batch

          for (
            let startIndex = 0;
            startIndex < nextDashboardPayload.records.length;
            startIndex += STREAMING_REVEAL_CHUNK_SIZE
          ) {
            pendingDashboardPayloadSlices.push(
              sliceDashboardPayload(
                nextDashboardPayload,
                startIndex,
                Math.min(startIndex + STREAMING_REVEAL_CHUNK_SIZE, nextDashboardPayload.records.length),
              ),
            )
          }
          scheduleSampleReveal()
        },
        {
          activeFeatureKeys: selectedFeatureSnapshot,
          batchSize: STREAMING_ML_RESULT_BATCH_SIZE,
          dashboardSampleOnly: true,
        },
      )
        .catch((error) => {
          if (abortController.signal.aborted) {
            return
          }

          setStreamingError(error instanceof Error ? error.message : 'Failed to load dashboard sample')
          setIsStreamingMlResults(false)
          streamAbortControllerRef.current = null
        })
        .finally(() => {
          hasSampleStreamFinished = true
          if (streamAbortControllerRef.current === abortController && streamRunIdRef.current === streamRunId) {
            if (abortController.signal.aborted) {
              pendingDashboardPayloadSlices = []
              if (revealTimerId != null) {
                window.clearTimeout(revealTimerId)
              }
              streamAbortControllerRef.current = null
              setIsStreamingMlResults(false)
              return
            }

            scheduleSampleReveal()
            finishSampleIfRevealQueueDrained()
          }
        })

      return
    }

    const currentPayload = useAppStore.getState().dashboardPayload
    const currentRecordCount = currentPayload?.records.length ?? 0
    const remainingRecordCapacity = PROGRESSIVE_ML_RESULT_MAX_RECORDS - currentRecordCount
    const shouldStreamAfterDashboardSample = Boolean(currentPayload?.batch?.dashboardSampleOnly)
    if (
      remainingRecordCapacity <= 0 ||
      (currentPayload?.batch != null && !currentPayload.batch.hasNextBatch && !shouldStreamAfterDashboardSample)
    ) {
      streamAbortControllerRef.current = null
      setHasStartedMlResultStream(true)
      setIsStreamingMlResults(false)
      setStreamingError(null)
      return
    }

    const abortController = new AbortController()
    const streamRunId = streamRunIdRef.current + 1
    const selectedFeatureSnapshot = [...useAppStore.getState().selectedFeatureKeys]
    let accumulatedPayload = currentPayload
    let pendingDashboardPayloadSlices: DashboardPayload[] = []
    let revealTimerId: number | null = null
    let hasStreamReaderFinished = false

    const finishStreamIfRevealQueueDrained = () => {
      if (!hasStreamReaderFinished || pendingDashboardPayloadSlices.length > 0) {
        return
      }

      if (streamAbortControllerRef.current === abortController && streamRunIdRef.current === streamRunId) {
        streamAbortControllerRef.current = null
        setIsStreamingMlResults(false)
      }
    }

    const revealNextPayloadSlice = () => {
      revealTimerId = null

      if (abortController.signal.aborted || streamRunIdRef.current !== streamRunId) {
        pendingDashboardPayloadSlices = []
        return
      }

      const nextDashboardPayload = pendingDashboardPayloadSlices.shift()
      if (!nextDashboardPayload) {
        finishStreamIfRevealQueueDrained()
        return
      }

      accumulatedPayload = accumulatedPayload
        ? mergeDashboardPayloads(accumulatedPayload, nextDashboardPayload)
        : nextDashboardPayload

      if (accumulatedPayload) {
        setDashboardPayload(accumulatedPayload)
      }

      scheduleReveal()
      finishStreamIfRevealQueueDrained()
    }

    const scheduleReveal = () => {
      if (revealTimerId != null || pendingDashboardPayloadSlices.length === 0) {
        return
      }

      revealTimerId = window.setTimeout(revealNextPayloadSlice, STREAMING_REVEAL_INTERVAL_MS)
    }

    streamRunIdRef.current = streamRunId
    streamAbortControllerRef.current = abortController
    setStreamingError(null)
    setHasStartedMlResultStream(true)
    setIsStreamingMlResults(true)

    void streamMlResults(
      undefined,
      abortController.signal,
      (mlPayload) => {
        if (abortController.signal.aborted || streamRunIdRef.current !== streamRunId) {
          return
        }

        const nextDashboardPayload = buildDashboardPayloadFromMlResults(mlPayload)
        for (
          let startIndex = 0;
          startIndex < nextDashboardPayload.records.length;
          startIndex += STREAMING_REVEAL_CHUNK_SIZE
        ) {
          pendingDashboardPayloadSlices.push(
            sliceDashboardPayload(
              nextDashboardPayload,
              startIndex,
              Math.min(startIndex + STREAMING_REVEAL_CHUNK_SIZE, nextDashboardPayload.records.length),
            ),
          )
        }
        scheduleReveal()
      },
      {
        activeFeatureKeys: selectedFeatureSnapshot,
        afterId: shouldStreamAfterDashboardSample ? undefined : currentPayload?.batch?.nextCursorId ?? undefined,
        batchSize: STREAMING_ML_RESULT_BATCH_SIZE,
        dashboardSampleOnly: false,
        maxRecords: remainingRecordCapacity,
      },
    )
      .catch((error) => {
        if (abortController.signal.aborted) {
          return
        }

        setStreamingError(error instanceof Error ? error.message : 'Failed to stream backend ML results')
      })
      .finally(() => {
        hasStreamReaderFinished = true
        if (streamAbortControllerRef.current === abortController && streamRunIdRef.current === streamRunId) {
          if (abortController.signal.aborted) {
            pendingDashboardPayloadSlices = []
            if (revealTimerId != null) {
              window.clearTimeout(revealTimerId)
            }
            streamAbortControllerRef.current = null
            setIsStreamingMlResults(false)
            return
          }

          scheduleReveal()
          finishStreamIfRevealQueueDrained()
        }
      })
  }, [setDashboardPayload])

  const handleStreamingToggle = () => {
    if (isStreamingMlResults) {
      stopMlResultStream()
      return
    }

    startMlResultStream({ restartWithDashboardSample: !hasStartedMlResultStream })
  }

  const handleWaterfallFeatureToggle = useCallback(
    (featureKey: FeatureKey) => {
      if (isWaterfallRecomputing) {
        return
      }

      if (useAppStore.getState().dashboardPayload != null) {
        setIsWaterfallRecomputing(true)
      }
      toggleFeatureSelection(featureKey)
    },
    [isWaterfallRecomputing, toggleFeatureSelection],
  )

  useEffect(() => {
    let isCancelled = false
    const abortController = new AbortController()
    const featureFiltersSnapshot = initialFeatureFilters.current
    const selectedFeatureSnapshot = [...selectedFeatureKeys]
    const shouldShowWaterfallLoading = useAppStore.getState().dashboardPayload != null
    stopMlResultStream({ resetSession: true })

    if (shouldShowWaterfallLoading) {
      setIsWaterfallRecomputing(true)
    }

    const loadInitialDashboardPayload = async () => {
      try {
        return await loadDashboardPayload(
          abortController.signal,
          featureFiltersSnapshot,
          selectedFeatureSnapshot,
          true,
        )
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw error
        }

        return loadDashboardPayload(abortController.signal, undefined, selectedFeatureSnapshot, true)
      }
    }

    void loadInitialDashboardPayload()
      .then((payload) => {
        if (isCancelled) {
          return
        }

        setDashboardPayload(payload)
      })
      .catch((error) => {
        if (isCancelled || abortController.signal.aborted) {
          return
        }

        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }

        console.error(error)
      })
      .finally(() => {
        if (!isCancelled && shouldShowWaterfallLoading) {
          setIsWaterfallRecomputing(false)
        }
      })

    return () => {
      isCancelled = true
      abortController.abort()
    }
  }, [selectedFeatureKeys, setDashboardPayload, stopMlResultStream])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const mediaQuery = window.matchMedia('(max-width: 1199px)')

    const syncExplorerState = (event?: MediaQueryListEvent) => {
      if ((event?.matches ?? mediaQuery.matches) === true) {
        setIsExplorerCollapsed(true)
        return
      }

      setIsExplorerCollapsed(false)
    }

    syncExplorerState()

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', syncExplorerState)

      return () => {
        mediaQuery.removeEventListener('change', syncExplorerState)
      }
    }

    mediaQuery.addListener(syncExplorerState)

    return () => {
      mediaQuery.removeListener(syncExplorerState)
    }
  }, [setIsExplorerCollapsed])

  useEffect(() => {
    if (
      selectedTransactionAlertId &&
      (transactionAlerts.some((alert) => alert.id === selectedTransactionAlertId) ||
        dashboardRecords.some((record) => record.recordKey === selectedTransactionAlertId))
    ) {
      return
    }

    if (transactionAlerts.length > 0) {
      setSelectedTransactionAlertId(transactionAlerts[0].id)
      return
    }

    setSelectedTransactionAlertId(null)
  }, [dashboardRecords, transactionAlerts, selectedTransactionAlertId, setSelectedTransactionAlertId])

  const { runOnboardingTour, isTourProcessMenuOpen, tourFullscreenFocus } = useOnboardingTour({
    numericTimestampBounds: numericBoundsByFeature.timestamp,
    featureFilters,
    selectedFeatureKeys,
    expandedFeatureKeys,
    expandedAlertSeverities,
    expandedProcessedCategories,
    activeWorkspaceTab,
    activeWorldItemId,
    selectedTransactionAlertId,
    transactionAlerts,
    processedAlertDecisions,
    setActiveWorkspaceTab,
    setActiveWorldItemId,
    setIsExplorerCollapsed,
    toggleFeatureSelection,
    toggleFeatureExpansion,
    toggleAlertSeverity,
    toggleProcessedCategory,
    setSelectedTransactionAlertId,
    updateFeatureFilter,
  })

  useEffect(() => {
    if (dashboardPayload) {
      return undefined
    }

    const messageTimer = window.setInterval(() => {
      setLoadingMessageIndex((currentIndex) => (currentIndex + 1) % loadingMessages.length)
    }, 1700)
    const slowTimer = window.setTimeout(() => setIsSlowLoading(true), 5200)

    return () => {
      window.clearInterval(messageTimer)
      window.clearTimeout(slowTimer)
    }
  }, [dashboardPayload])

  const handleWorkspaceTabChange = (nextTab: WorkspaceTab) => {
    if (nextTab === 'world') {
      setActiveWorldItemId(alertQueueNavigationItem.id)
      setIsExplorerCollapsed(false)
    }
    setActiveWorkspaceTab(nextTab)
  }

  const handleNavigationClick = (item: NavigationItem) => {
    if (item.id === activeItem.id) {
      setIsExplorerCollapsed((isCollapsed) => !isCollapsed)
      return
    }

    if (activeWorkspaceTab === 'world') {
      setActiveWorldItemId(item.id)
    }
    setIsExplorerCollapsed(false)
  }

  if (!dashboardPayload) {
    return (
      <div className="app-shell flex min-h-screen items-center justify-center text-[var(--ink)]">
        <div className="loading-desk w-full max-w-[360px] px-6 text-center">
          <svg className="loading-desk__mark mx-auto" viewBox="0 0 132 64" aria-hidden="true">
            <line x1="22" y1="10" x2="22" y2="54" />
            <rect className="loading-desk__bar loading-desk__bar--one" x="34" y="14" width="74" height="8" rx="4" />
            <rect className="loading-desk__bar loading-desk__bar--two" x="34" y="28" width="58" height="8" rx="4" />
            <rect className="loading-desk__bar loading-desk__bar--three" x="34" y="42" width="86" height="8" rx="4" />
            <circle className="loading-desk__dot loading-desk__dot--one" cx="112" cy="18" r="3" />
            <circle className="loading-desk__dot loading-desk__dot--two" cx="96" cy="32" r="3" />
            <circle className="loading-desk__dot loading-desk__dot--three" cx="124" cy="46" r="3" />
          </svg>
          <p className="mt-5 text-sm font-semibold text-[var(--ink)]">Preparing analyst desk</p>
          <p className="loading-desk__status mx-auto mt-2 text-xs font-medium text-[var(--ink-soft)]">
            <span className="loading-desk__pulse" aria-hidden="true" />
            <span>{loadingMessages[loadingMessageIndex]}</span>
          </p>
          <p
            className={`mt-2 min-h-4 text-xs text-[var(--muted)] transition-opacity duration-300 ${
              isSlowLoading ? 'opacity-100' : 'opacity-0'
            }`}
          >
            Large datasets can take a moment to initialize.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell relative min-h-screen overflow-hidden text-[var(--ink)]">
      <div className="relative flex min-h-screen w-full flex-col">
        <header
          data-tour="app-header"
          className="rise-in flex flex-col gap-4 border-b border-[var(--line)] bg-[var(--surface)] px-5 py-4 text-[var(--ink)] sm:px-6 lg:flex-row lg:items-center lg:justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center">
              <img
                src="/favicon.svg"
                alt=""
                aria-hidden="true"
                className="h-10 w-10"
              />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-[var(--ink)] sm:text-3xl">
                Alert Triage Console
              </h1>
            </div>
          </div>
          <div className="flex items-center">
            <button
              type="button"
              onClick={runOnboardingTour}
              className="rounded-md border border-[var(--line-strong)] bg-[var(--surface-raised)] px-4 py-2 text-sm font-semibold text-[var(--ink)] transition hover:bg-[var(--surface-strong)]"
            >
              Guided Tour
            </button>
          </div>
        </header>

        <main
          className={`paper-panel grid flex-1 overflow-hidden ${
            isExplorerCollapsed
              ? 'min-[1200px]:grid-cols-[64px_minmax(0,1fr)]'
              : 'min-[1200px]:grid-cols-[320px_minmax(0,1fr)]'
          }`}
        >
          <div className="rise-in delay-1 relative overflow-hidden min-[1200px]:h-full">
            <div
              className={`grid h-full ${
                isExplorerCollapsed
                  ? 'min-[1200px]:grid-cols-[64px]'
                  : 'min-[1200px]:grid-cols-[64px_minmax(0,1fr)]'
              }`}
            >
              <aside className="p-3 min-[1200px]:h-full">
                <nav className="flex gap-2 overflow-x-auto min-[1200px]:flex-col min-[1200px]:overflow-visible">
              {explorerNavigationItems.map((item) => {
                const isActive = item.id === activeItem.id
                const Icon = item.icon

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavigationClick(item)}
                    title={item.label}
                    aria-label={item.label}
                    className={`flex h-11 min-w-11 items-center justify-center rounded-md border transition duration-150 ${
                      isActive
                        ? 'border-[var(--line-strong)] bg-transparent text-[var(--ink)]'
                        : 'border-transparent bg-transparent text-[var(--muted)] hover:border-[var(--line)] hover:bg-[var(--surface-strong)] hover:text-[var(--ink)]'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </button>
                )
              })}
                </nav>
              </aside>

              <aside className={`${isExplorerCollapsed ? 'hidden' : 'block'} relative overflow-hidden p-4 pr-5`}>
                {shouldShowNoFraudOverlay && activeItem.id === 'alert-queue' ? (
                  <div
                    className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-md bg-[rgba(255,255,255,0.68)] backdrop-blur-[3px]"
                    aria-hidden="true"
                  >
                    <span className="rounded-md border border-[rgba(203,215,207,0.75)] bg-[rgba(255,255,255,0.86)] px-5 py-2.5 text-sm font-semibold text-[var(--ink)] shadow-sm">
                      No Fraud Detected
                    </span>
                  </div>
                ) : null}
                <div
                  data-tour={activeItem.id === 'feature-selection' ? 'feature-selection-panel' : undefined}
                  className="flex items-start justify-between gap-4"
                >
                  <div>
                    <h2 className="text-xl font-semibold text-[var(--ink)]">
                      {activeItem.label}
                    </h2>
                    {activeItem.id === 'feature-selection' ? (
                      <p className="mt-2 text-sm text-[var(--muted)]">Toggle features by clicking them</p>
                    ) : activeItem.id === 'alert-queue' ? (
                      <p className="mt-2 text-sm text-[var(--muted)]">Review, process, select transaction alerts.</p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3">
                  {activeItem.id === 'feature-selection' ? (
                    <div className="space-y-0.5">
                      {amlFeatures.map((feature) => {
                        const isSelected = selectedFeatureSet.has(feature.key)
                        const isExpanded = expandedFeatureKeys.includes(feature.key)
                        const filter = featureFilters[feature.key]
                        const categoricalOptions = (categoricalOptionsByFeature[feature.key] ?? []).filter((option) =>
                          option.toLowerCase().includes(filter.search.toLowerCase()),
                        )
                        const bounds = numericBoundsByFeature[feature.key]
                        const numericMinValue =
                          feature.kind === 'numeric' && bounds
                            ? Number(filter.min || bounds.min)
                            : undefined
                        const numericMaxValue =
                          feature.kind === 'numeric' && bounds
                            ? Number(filter.max || bounds.max)
                            : undefined
                        const numericRange =
                          bounds && bounds.max > bounds.min ? bounds.max - bounds.min : 1
                        const numericMinPercent =
                          feature.kind === 'numeric' && bounds && numericMinValue !== undefined
                            ? ((numericMinValue - bounds.min) / numericRange) * 100
                            : 0
                        const numericMaxPercent =
                          feature.kind === 'numeric' && bounds && numericMaxValue !== undefined
                            ? ((numericMaxValue - bounds.min) / numericRange) * 100
                            : 100
                        const clampedNumericMinPercent = Math.max(0, Math.min(100, numericMinPercent))
                        const clampedNumericMaxPercent = Math.max(0, Math.min(100, numericMaxPercent))

                        return (
                          <div
                            key={feature.key}
                            data-tour={feature.key === 'timestamp' ? 'timestamp-feature' : undefined}
                            className={`transition ${
                              isExpanded
                                ? `rounded-md border ${
                                    isSelected
                                      ? 'border-[var(--line-strong)] bg-[var(--surface-raised)]'
                                      : 'border-[var(--line)] bg-[var(--surface-raised)] opacity-70'
                                  }`
                                : `rounded-md border ${
                                    isSelected
                                      ? 'border-transparent bg-[var(--surface-strong)]'
                                      : 'border-transparent bg-transparent opacity-70 hover:bg-[var(--surface-strong)] hover:opacity-100'
                                  }`
                            }`}
                          >
                            <div className="flex items-center gap-2 px-2.5 py-2.5">
                              <button
                                type="button"
                                onClick={() => handleWaterfallFeatureToggle(feature.key)}
                                aria-pressed={isSelected}
                                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                              >
                                <span
                                  aria-hidden="true"
                                  className={`h-4 w-4 shrink-0 rounded-[4px] border ${
                                    isSelected
                                      ? 'border-[var(--line-strong)] bg-[var(--line-strong)]'
                                      : 'border-[var(--line-strong)] bg-[var(--surface-raised)]'
                                  }`}
                                />
                                <span className="min-w-0">
                                  <span className="block truncate text-sm font-semibold text-[var(--ink)]">
                                    {feature.label}
                                  </span>
                                  <span className="figure-text mt-1 block text-xs text-[var(--muted)]">
                                    {feature.kind}
                                  </span>
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleFeatureExpansion(feature.key)}
                                className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--surface-raised)] text-[var(--muted)] hover:border-[var(--line-strong)]"
                                aria-label={isExpanded ? `Collapse ${feature.label}` : `Expand ${feature.label}`}
                              >
                                <span className={`text-sm transition ${isExpanded ? 'rotate-180' : ''}`}>⌄</span>
                              </button>
                            </div>

                            {isExpanded ? (
                              <div
                                data-tour={feature.key === 'timestamp' ? 'timestamp-filter' : undefined}
                                className="border-t border-[var(--line)] px-2.5 py-3"
                              >
                                {feature.kind === 'numeric' || feature.kind === 'temporal' ? (
                                  <div className="space-y-3">
                                    <p className="text-xs font-semibold text-[var(--muted)]">
                                      Range filter
                                    </p>
                                    {feature.kind === 'numeric' && bounds ? (
                                      <div className="space-y-4">
                                        <div className="grid gap-3">
                                          <div className="rounded-md border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2">
                                            <p className="text-xs font-semibold text-[var(--muted)]">
                                              Min
                                            </p>
                                            <p className="mt-1 text-sm font-semibold text-[var(--ink)]">
                                              {numericMinValue != null ? formatCompactNumber(numericMinValue) : ''}
                                            </p>
                                          </div>
                                          <div className="rounded-md border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2">
                                            <p className="text-xs font-semibold text-[var(--muted)]">
                                              Max
                                            </p>
                                            <p className="mt-1 text-sm font-semibold text-[var(--ink)]">
                                              {numericMaxValue != null ? formatCompactNumber(numericMaxValue) : ''}
                                            </p>
                                          </div>
                                        </div>

                                        <div className="space-y-2">
                                          <p className="text-xs font-semibold text-[var(--muted)]">
                                            Selected range
                                          </p>
                                          <div className="range-slider">
                                            <div className="range-slider__track" />
                                            <div
                                              className="range-slider__range"
                                              style={{
                                                left: `${clampedNumericMinPercent}%`,
                                                width: `${Math.max(0, clampedNumericMaxPercent - clampedNumericMinPercent)}%`,
                                              }}
                                            />
                                            <input
                                              type="range"
                                              step={bounds.step}
                                              min={bounds.min}
                                              max={numericMaxValue}
                                              value={numericMinValue}
                                              onChange={(event) =>
                                                updateFeatureFilter(feature.key, (currentFilter) => ({
                                                  ...currentFilter,
                                                  min: event.target.value,
                                                }))
                                              }
                                              className="range-slider__input"
                                              aria-label={`${feature.label} minimum`}
                                            />
                                            <input
                                              type="range"
                                              step={bounds.step}
                                              min={numericMinValue}
                                              max={bounds.max}
                                              value={numericMaxValue}
                                              onChange={(event) =>
                                                updateFeatureFilter(feature.key, (currentFilter) => ({
                                                  ...currentFilter,
                                                  max: event.target.value,
                                                }))
                                              }
                                              className="range-slider__input"
                                              aria-label={`${feature.label} maximum`}
                                            />
                                          </div>
                                          <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--muted)]">
                                            <span>{formatCompactNumber(bounds.min)}</span>
                                            <span>{formatCompactNumber(bounds.max)}</span>
                                          </div>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="space-y-3">
                                        <div className="grid gap-3">
                                          <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--muted)]">
                                            Start Date
                                            <input
                                              type="date"
                                              min={bounds ? epochToDateInputValue(bounds.min) : undefined}
                                              max={
                                                filter.max
                                                  ? epochToDateInputValue(Number(filter.max))
                                                  : bounds
                                                    ? epochToDateInputValue(bounds.max)
                                                    : undefined
                                              }
                                              value={filter.min ? epochToDateInputValue(Number(filter.min)) : ''}
                                              onChange={(event) =>
                                                updateFeatureFilter(feature.key, (currentFilter) => ({
                                                  ...currentFilter,
                                                  min: dateInputToEpochStart(event.target.value),
                                                }))
                                              }
                                              className="rounded-md border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 text-sm font-medium text-[var(--ink)]"
                                            />
                                          </label>
                                          <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--muted)]">
                                            End Date
                                            <input
                                              type="date"
                                              min={
                                                filter.min
                                                  ? epochToDateInputValue(Number(filter.min))
                                                  : bounds
                                                    ? epochToDateInputValue(bounds.min)
                                                    : undefined
                                              }
                                              max={bounds ? epochToDateInputValue(bounds.max) : undefined}
                                              value={filter.max ? epochToDateInputValue(Number(filter.max)) : ''}
                                              onChange={(event) =>
                                                updateFeatureFilter(feature.key, (currentFilter) => ({
                                                  ...currentFilter,
                                                  max: dateInputToEpochEnd(event.target.value),
                                                }))
                                              }
                                              className="rounded-md border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 text-sm font-medium text-[var(--ink)]"
                                            />
                                          </label>
                                        </div>
                                        <div className="grid gap-3">
                                          <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--muted)]">
                                            Time From
                                            <input
                                              type="time"
                                              step={900}
                                              value={filter.timeStart || '00:00'}
                                              onChange={(event) =>
                                                updateFeatureFilter(feature.key, (currentFilter) => ({
                                                  ...currentFilter,
                                                  timeStart: event.target.value,
                                                }))
                                              }
                                              className="rounded-md border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 text-sm font-medium text-[var(--ink)]"
                                            />
                                          </label>
                                          <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--muted)]">
                                            Time To
                                            <input
                                              type="time"
                                              step={900}
                                              value={filter.timeEnd || '23:59'}
                                              onChange={(event) =>
                                                updateFeatureFilter(feature.key, (currentFilter) => ({
                                                  ...currentFilter,
                                                  timeEnd: event.target.value,
                                                }))
                                              }
                                              className="rounded-md border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 text-sm font-medium text-[var(--ink)]"
                                            />
                                          </label>
                                        </div>
                                      </div>
                                    )}
                                    {bounds ? (
                                      <p className="text-xs text-[var(--muted)]">
                                        Available range:{' '}
                                        {feature.key === 'timestamp'
                                          ? `${epochToDateTimeLabel(bounds.min)} - ${epochToDateTimeLabel(bounds.max)} | Daily time window: 00:00 - 24:00`
                                          : `${formatCompactNumber(bounds.min)} - ${formatCompactNumber(bounds.max)}`}
                                      </p>
                                    ) : null}
                                  </div>
                                ) : (
                                  <div className="space-y-3">
                                    <p className="text-xs font-semibold text-[var(--muted)]">
                                      Category filter
                                    </p>
                                    <input
                                      type="text"
                                      value={filter.search}
                                      onChange={(event) =>
                                        updateFeatureFilter(feature.key, (currentFilter) => ({
                                          ...currentFilter,
                                          search: event.target.value,
                                        }))
                                      }
                                      placeholder="Search category..."
                                      className="w-full rounded-md border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 text-sm font-medium text-[var(--ink)]"
                                    />
                                    {filter.selectedValues.length > 0 ? (
                                      <div className="flex flex-wrap gap-2">
                                        {filter.selectedValues.map((value) => (
                                          <button
                                            key={value}
                                            type="button"
                                            onClick={() => removeCategoryFilterValue(feature.key, value)}
                                            className="rounded-md border border-[var(--line-strong)] bg-[var(--surface-strong)] px-2.5 py-1 text-xs font-semibold text-[var(--ink)]"
                                          >
                                            {value} x
                                          </button>
                                        ))}
                                      </div>
                                    ) : null}
                                    <div className="max-h-36 space-y-2 overflow-auto pr-1">
                                      {categoricalOptions.slice(0, 10).map((option) => (
                                        <button
                                          key={option}
                                          type="button"
                                          onClick={() => addCategoryFilterValue(feature.key, option)}
                                          disabled={filter.selectedValues.includes(option)}
                                          className="flex w-full items-center justify-between rounded-md border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 text-left text-sm font-medium text-[var(--ink)] disabled:opacity-45"
                                        >
                                          <span>{option}</span>
                                          <span className="text-xs text-[var(--muted)]">
                                            Add
                                          </span>
                                        </button>
                                      ))}
                                      {categoricalOptions.length === 0 ? (
                                        <p className="text-xs text-[var(--muted)]">No matching categories.</p>
                                      ) : null}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  ) : activeItem.id === 'alert-queue' && activeWorkspaceTab === 'world' ? (
                    <TransactionsAlertExplorer
                      alerts={transactionAlerts}
                      expandedAlertSeverities={expandedAlertSeverities}
                      onToggleSeverity={toggleAlertSeverity}
                      expandedProcessedCategories={expandedProcessedCategories}
                      onToggleProcessedCategory={toggleProcessedCategory}
                      selectedAlertId={selectedTransactionAlertId}
                      onSelectAlert={setSelectedTransactionAlertId}
                      processedAlertDecisions={processedAlertDecisions}
                      onSetAlertDecision={setAlertDecision}
                      tourOpenActionMenuForFirstAlert={isTourProcessMenuOpen}
                    />
                  ) : null}
                </div>
              </aside>
            </div>
          </div>

          <section className="grid min-w-0">
            <article className="ledger-panel rise-in delay-3 flex min-h-[360px] flex-col overflow-hidden p-5 sm:min-h-[420px] sm:p-6 min-[900px]:min-h-[500px]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div
                  data-tour="workspace-tabs"
                  className="inline-flex rounded-md border border-[var(--line)] bg-[var(--surface-raised)] p-1"
                >
                  <button
                    type="button"
                    onClick={() => handleWorkspaceTabChange('dashboard')}
                    className={`rounded px-4 py-2 text-sm font-semibold transition ${
                      activeWorkspaceTab === 'dashboard'
                        ? 'bg-[var(--ink)] text-[var(--surface-raised)]'
                        : 'text-[var(--ink-soft)] hover:bg-[var(--surface-strong)] hover:text-[var(--ink)]'
                    }`}
                  >
                    Overview
                  </button>
                  <button
                    type="button"
                    onClick={() => handleWorkspaceTabChange('world')}
                    className={`rounded px-4 py-2 text-sm font-semibold transition ${
                      activeWorkspaceTab === 'world'
                        ? 'bg-[var(--ink)] text-[var(--surface-raised)]'
                        : 'text-[var(--ink-soft)] hover:bg-[var(--surface-strong)] hover:text-[var(--ink)]'
                    }`}
                  >
                    Transactions
                  </button>
                </div>
                <div className="flex items-center justify-end gap-3">
                  <div className="text-right text-xs font-semibold text-[var(--muted)]">
                    {streamingError ? (
                      <p className="text-[#8a5a00]">{streamingError}</p>
                    ) : (
                      <p>{formatCompactNumber(dashboardPayload.records.length)} transactions processed</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleStreamingToggle}
                    aria-label={
                      isStreamingMlResults
                ? 'Pause inference streaming'
                : hasReachedMlResultStreamEnd
                  ? 'Inference streaming complete'
                : hasStartedMlResultStream
                  ? 'Resume inference streaming'
                  : 'Play inference streaming'
            }
            aria-pressed={isStreamingMlResults}
            disabled={hasReachedMlResultStreamEnd}
            title={
              isStreamingMlResults
                ? 'Pause inference streaming'
                : hasReachedMlResultStreamEnd
                  ? 'Inference streaming complete'
                : hasStartedMlResultStream
                  ? 'Resume inference streaming'
                  : 'Play inference streaming'
            }
            className={`flex h-10 w-10 items-center justify-center rounded-md border transition ${
              hasReachedMlResultStreamEnd
                ? 'cursor-not-allowed border-[var(--line)] bg-transparent text-[var(--muted)] opacity-70'
                : isStreamingMlResults
                ? 'border-[var(--line-strong)] bg-transparent text-[var(--ink)] hover:bg-[var(--surface-strong)]'
                : 'border-[var(--line-strong)] bg-transparent text-[var(--ink)] hover:bg-[var(--surface-strong)]'
            }`}
                  >
                    {isStreamingMlResults ? <PauseIcon className="h-5 w-5" /> : <PlayIcon className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <div className="relative flex min-h-0 flex-1 flex-col">
                {shouldShowNoFraudOverlay && activeWorkspaceTab === 'world' ? (
                  <div
                    className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center rounded-md bg-[rgba(255,255,255,0.68)] backdrop-blur-[3px]"
                    aria-hidden="true"
                  >
                    <span className="rounded-md border border-[rgba(203,215,207,0.75)] bg-[rgba(255,255,255,0.86)] px-5 py-2.5 text-sm font-semibold text-[var(--ink)] shadow-sm">
                      No Fraud Detected
                    </span>
                  </div>
                ) : null}

                {activeWorkspaceTab === 'dashboard' ? (
                  <div className="mt-5 flex flex-1 sm:mt-6">
                    <div className="flex w-full flex-col">
                      <div className="grid gap-6 min-[900px]:grid-cols-[minmax(0,1.22fr)_minmax(340px,0.92fr)] min-[900px]:grid-rows-[auto_auto]">
                        <div data-tour="overview-shap-bars" className="min-[900px]:row-start-1">
                          <ShapBarPlot
                            rows={allShap}
                            selectedFeatures={selectedFeatureKeys}
                            isLoading={isWaterfallRecomputing}
                          />
                        </div>

                        <div data-tour="overview-validation" className="flex flex-col gap-5 min-[900px]:row-start-1 min-[900px]:h-full min-[900px]:justify-between">
                          <div data-tour="overview-metrics" className="w-full">
                            <div className="grid gap-3 sm:grid-cols-2 min-[900px]:grid-cols-2">
                              {filteredMetrics.map((metric) => {
                                const needsConfirmedFraud =
                                  metric.label === 'Precision' ||
                                  metric.label === 'Recall' ||
                                  metric.label === 'F1 Score'

                                return (
                                  <div key={metric.label} className="relative">
                                    <MetricCard
                                      label={metric.label}
                                      value={metric.value}
                                      detail={metric.detail}
                                      displayMode={hasStartedMlResultStream ? 'progress' : 'number'}
                                      isLoading={isWaterfallRecomputing}
                                    />
                                    {needsConfirmedFraud && shouldShowNoConfirmedFraudOverlay ? (
                                      <div
                                        className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md bg-[rgba(255,255,255,0.68)] backdrop-blur-[3px]"
                                        aria-hidden="true"
                                      >
                                        <span className="rounded-md border border-[rgba(203,215,207,0.75)] bg-[rgba(255,255,255,0.86)] px-4 py-2 text-sm font-semibold text-[var(--ink)] shadow-sm">
                                          No Confirmed Fraud
                                        </span>
                                      </div>
                                    ) : null}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                          <ConfusionMatrixCard
                            key={activeDashboardPayload?.model?.featureKeys.join('|') ?? 'default'}
                            data={filteredConfusionMatrix}
                            isStreaming={hasStartedMlResultStream}
                          />
                        </div>

                        <div className="min-[900px]:row-start-2 min-[900px]:h-full">
                          <ShapPlot
                            rows={allNumericalShap}
                            records={activeDashboardPayload?.records ?? []}
                            selectedFeatures={selectedFeatureKeys}
                            onSelectRecord={(recordKey) => {
                              setSelectedTransactionAlertId(recordKey)
                              setActiveWorkspaceTab('world')
                              setActiveWorldItemId('alert-queue')
                              window.requestAnimationFrame(() => {
                                window.scrollTo({ top: 0, left: 0 })
                                document.querySelector('[data-tour="transaction-waterfall"]')?.scrollIntoView({
                                  block: 'start',
                                  inline: 'nearest',
                                })
                              })
                            }}
                            isLoading={isWaterfallRecomputing}
                          />
                        </div>

                        <div className="min-[900px]:row-start-2 min-[900px]:h-full">
                          <RocCurvePlot
                            records={dashboardRecords}
                            roc={hasActiveFeatureFilters ? undefined : activeDashboardPayload?.roc}
                            showNoFraudOverlay={shouldShowNoConfirmedFraudOverlay}
                            noFraudOverlayLabel="No Confirmed Fraud"
                            isLoading={isWaterfallRecomputing}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <TransactionsWorkbench
                    alerts={transactionAlerts}
                    records={dashboardRecords}
                    predictionByRecordKey={predictionByRecordKey}
                    selectedFeatures={selectedFeatureKeys}
                    selectedAlertId={selectedTransactionAlertId}
                    onToggleFeature={handleWaterfallFeatureToggle}
                    isWaterfallLoading={isWaterfallRecomputing}
                    tourFullscreenFocus={tourFullscreenFocus}
                  />
                )}
              </div>
            </article>
          </section>
        </main>
      </div>
    </div>
  )
}

export default App
