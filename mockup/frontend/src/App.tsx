import 'driver.js/dist/driver.css'
import { useEffect } from 'react'

import { AlertIcon, LayersIcon } from './components/common/icons'
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
  buildShapRows,
  dateInputToEpochEnd,
  dateInputToEpochStart,
  epochToDateInputValue,
  epochToDateTimeLabel,
  formatCompactNumber,
  loadDashboardPayload,
  timeInputToMinutes,
  timestampToEpoch,
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
  sections: ['Filtered Alerts', 'Processed Alerts'],
} as const

const navigationItems = [alertQueueNavigationItem, featureSelectionNavigationItem] as const

type NavigationItem = (typeof navigationItems)[number]

function App() {
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
  const dashboardRecords =
    dashboardPayload?.records.filter((record) =>
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
  const allShap =
    dashboardRecords.length > 0
      ? buildShapRows(dashboardRecords, selectedFeatureKeys)
      : []
  const allNumericalShap = allShap.filter((row) =>
    amlFeatures.some((feature) => feature.key === row.featureKey && feature.kind === 'numeric'),
  )
  const filteredConfusionMatrix = buildConfusionMatrixFromRecords(dashboardRecords)
  const filteredMetrics = buildMetricsFromConfusionMatrix(filteredConfusionMatrix)
  const transactionAlerts = buildAlertPreviews(dashboardRecords)
  const explorerNavigationItems =
    activeWorkspaceTab === 'world'
      ? ([featureSelectionNavigationItem, alertQueueNavigationItem] as const)
      : ([featureSelectionNavigationItem] as const)
  const activeItem =
    activeWorkspaceTab === 'world' ? activeWorldItem : featureSelectionNavigationItem

  useEffect(() => {
    let isCancelled = false

    void loadDashboardPayload().then((payload) => {
      if (!isCancelled) {
        setDashboardPayload(payload)
      }
    })

    return () => {
      isCancelled = true
    }
  }, [setDashboardPayload])

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
    if (transactionAlerts.length === 0) {
      setSelectedTransactionAlertId(null)
      return
    }

    if (!transactionAlerts.some((alert) => alert.id === selectedTransactionAlertId)) {
      setSelectedTransactionAlertId(transactionAlerts[0].id)
    }
  }, [transactionAlerts, selectedTransactionAlertId, setSelectedTransactionAlertId])

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
    filteredDashboardRecords: dashboardRecords,
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
      <div className="min-h-screen bg-[var(--canvas)] px-4 py-4 text-[var(--ink)] sm:px-6 sm:py-6 lg:px-8 xl:px-10">
        <div className="mx-auto flex min-h-[320px] w-full max-w-[1800px] items-center justify-center rounded-[32px] border border-[var(--line)] bg-[var(--surface)]/94 text-sm font-semibold text-[var(--muted)]">
          Loading dashboard payload...
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--canvas)] text-[var(--ink)]">
      <div className="relative mx-auto flex min-h-screen w-full max-w-[1800px] flex-col px-4 py-4 sm:px-6 sm:py-6 lg:px-8 xl:px-10">
        <header
          data-tour="app-header"
          className="rise-in flex flex-col gap-4 rounded-[28px] border border-[var(--line)] bg-[var(--surface)]/90 px-5 py-5 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur sm:px-6 lg:flex-row lg:items-center lg:justify-between"
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--muted)]">
              Financial Crime Monitoring
            </p>
            <h1 className="font-['Manrope'] text-xl font-semibold tracking-[-0.04em] text-[var(--ink)] sm:text-2xl">
              Alert Triage Console
            </h1>
          </div>
          <div className="flex items-center">
            <button
              type="button"
              onClick={runOnboardingTour}
              className="rounded-2xl border border-[var(--line)] bg-white px-4 py-2 text-sm font-semibold text-[var(--ink)] transition hover:border-[var(--line-strong)] hover:bg-[var(--surface-strong)]"
            >
              Guided Tour
            </button>
          </div>
        </header>

        <main
          className={`mt-5 grid flex-1 gap-5 lg:mt-6 lg:gap-6 ${
            isExplorerCollapsed
              ? 'min-[1200px]:grid-cols-[72px_minmax(0,1fr)]'
              : 'min-[1200px]:grid-cols-[372px_minmax(0,1fr)]'
          }`}
        >
          <div className="rise-in delay-1 relative overflow-hidden rounded-[28px] border border-[var(--line)] bg-[var(--surface)]/94 shadow-[0_24px_70px_rgba(15,23,42,0.07)] backdrop-blur min-[1200px]:h-full">
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-y-0 left-[71px] hidden w-px bg-[var(--line)] min-[1200px]:block ${
                isExplorerCollapsed ? 'min-[1200px]:hidden' : ''
              }`}
            />
            <div
              className={`grid h-full ${
                isExplorerCollapsed
                  ? 'min-[1200px]:grid-cols-[72px]'
                  : 'min-[1200px]:grid-cols-[72px_minmax(0,1fr)]'
              }`}
            >
              <aside className="border-b border-[var(--line)] p-3 min-[1200px]:h-full min-[1200px]:border-b-0">
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
                    className={`flex h-12 min-w-12 items-center justify-center rounded-2xl border transition duration-200 ${
                      isActive
                        ? 'border-[var(--line-strong)] bg-[var(--surface-strong)] text-[var(--ink)] shadow-[0_12px_24px_rgba(15,23,42,0.10)]'
                        : 'border-transparent bg-transparent text-[var(--muted)] hover:border-[var(--line)] hover:bg-[var(--surface-strong)] hover:text-[var(--ink)]'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </button>
                )
              })}
                </nav>
              </aside>

              <aside className={`${isExplorerCollapsed ? 'hidden' : 'block'} p-5`}>
                <div
                  data-tour={activeItem.id === 'feature-selection' ? 'feature-selection-panel' : undefined}
                  className="flex items-start justify-between gap-4"
                >
                  <div>
                    <h2 className="font-['Manrope'] text-xl font-semibold tracking-[-0.04em] text-[var(--ink)]">
                      {activeItem.label}
                    </h2>
                    {activeItem.id === 'feature-selection' ? (
                      <p className="mt-2 text-sm text-[var(--muted)]">Toggle features by clicking them</p>
                    ) : activeItem.id === 'alert-queue' ? (
                      <p className="mt-2 text-sm text-[var(--muted)]">Review, process, select transaction alerts.</p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-5">
                  {activeItem.id === 'feature-selection' ? (
                    <div className="space-y-2">
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
                        const numericMinPercent =
                          feature.kind === 'numeric' && bounds && numericMinValue !== undefined
                            ? ((numericMinValue - bounds.min) / (bounds.max - bounds.min)) * 100
                            : 0
                        const numericMaxPercent =
                          feature.kind === 'numeric' && bounds && numericMaxValue !== undefined
                            ? ((numericMaxValue - bounds.min) / (bounds.max - bounds.min)) * 100
                            : 100

                        return (
                          <div
                            key={feature.key}
                            data-tour={feature.key === 'timestamp' ? 'timestamp-feature' : undefined}
                            className={`rounded-2xl border transition ${
                              isSelected
                                ? 'border-[var(--line-strong)] bg-[var(--surface-strong)]'
                                : 'border-[var(--line)] bg-white/80'
                            }`}
                          >
                            <div className="flex items-center gap-2 px-3 py-3">
                              <button
                                type="button"
                                onClick={() => toggleFeatureSelection(feature.key)}
                                className="flex min-w-0 flex-1 items-center text-left"
                              >
                                <span className="min-w-0">
                                  <span className="block truncate text-sm font-semibold text-[var(--ink)]">
                                    {feature.label}
                                  </span>
                                  <span className="mt-1 block text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
                                    {feature.kind}
                                  </span>
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleFeatureExpansion(feature.key)}
                                className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--line)] bg-white/80 text-[var(--muted)]"
                                aria-label={isExpanded ? `Collapse ${feature.label}` : `Expand ${feature.label}`}
                              >
                                <span className={`text-sm transition ${isExpanded ? 'rotate-180' : ''}`}>⌄</span>
                              </button>
                            </div>

                            {isExpanded ? (
                              <div
                                data-tour={feature.key === 'timestamp' ? 'timestamp-filter' : undefined}
                                className="border-t border-[var(--line)] px-3 py-3"
                              >
                                {feature.kind === 'numeric' || feature.kind === 'temporal' ? (
                                  <div className="space-y-3">
                                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                                      Range filter
                                    </p>
                                    {feature.kind === 'numeric' && bounds ? (
                                      <div className="space-y-4">
                                        <div className="grid gap-3">
                                          <div className="rounded-xl border border-[var(--line)] bg-white px-3 py-2">
                                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                                              Min
                                            </p>
                                            <p className="mt-1 text-sm font-semibold text-[var(--ink)]">
                                              {numericMinValue != null ? formatCompactNumber(numericMinValue) : ''}
                                            </p>
                                          </div>
                                          <div className="rounded-xl border border-[var(--line)] bg-white px-3 py-2">
                                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                                              Max
                                            </p>
                                            <p className="mt-1 text-sm font-semibold text-[var(--ink)]">
                                              {numericMaxValue != null ? formatCompactNumber(numericMaxValue) : ''}
                                            </p>
                                          </div>
                                        </div>

                                        <div className="space-y-2">
                                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                                            Selected range
                                          </p>
                                          <div className="range-slider">
                                            <div className="range-slider__track" />
                                            <div
                                              className="range-slider__range"
                                              style={{
                                                left: `${numericMinPercent}%`,
                                                width: `${numericMaxPercent - numericMinPercent}%`,
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
                                          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                                            <span>{formatCompactNumber(bounds.min)}</span>
                                            <span>{formatCompactNumber(bounds.max)}</span>
                                          </div>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="space-y-3">
                                        <div className="grid gap-3">
                                          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
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
                                              className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm font-medium text-[var(--ink)]"
                                            />
                                          </label>
                                          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
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
                                              className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm font-medium text-[var(--ink)]"
                                            />
                                          </label>
                                        </div>
                                        <div className="grid gap-3">
                                          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
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
                                              className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm font-medium text-[var(--ink)]"
                                            />
                                          </label>
                                          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
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
                                              className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm font-medium text-[var(--ink)]"
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
                                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
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
                                      className="w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm font-medium text-[var(--ink)]"
                                    />
                                    {filter.selectedValues.length > 0 ? (
                                      <div className="flex flex-wrap gap-2">
                                        {filter.selectedValues.map((value) => (
                                          <button
                                            key={value}
                                            type="button"
                                            onClick={() => removeCategoryFilterValue(feature.key, value)}
                                            className="rounded-full border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold text-[var(--accent)]"
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
                                          className="flex w-full items-center justify-between rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-left text-sm font-medium text-[var(--ink)] disabled:opacity-45"
                                        >
                                          <span>{option}</span>
                                          <span className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
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
            <article className="rise-in delay-3 flex min-h-[360px] flex-col overflow-hidden rounded-[32px] border border-[var(--line)] bg-[var(--surface)]/94 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur sm:min-h-[420px] sm:p-6 min-[900px]:min-h-[500px]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div
                  data-tour="workspace-tabs"
                  className="inline-flex rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] p-1"
                >
                  <button
                    type="button"
                    onClick={() => handleWorkspaceTabChange('dashboard')}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                      activeWorkspaceTab === 'dashboard'
                        ? 'bg-white text-[var(--ink)] shadow-[0_6px_16px_rgba(15,23,42,0.08)]'
                        : 'text-[var(--muted)]'
                    }`}
                  >
                    Overview
                  </button>
                  <button
                    type="button"
                    onClick={() => handleWorkspaceTabChange('world')}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                      activeWorkspaceTab === 'world'
                        ? 'bg-white text-[var(--ink)] shadow-[0_6px_16px_rgba(15,23,42,0.08)]'
                        : 'text-[var(--muted)]'
                    }`}
                  >
                    Transactions
                  </button>
                </div>
                {activeWorkspaceTab === 'world' ? (
                  <span className="rounded-full border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
                    {formatCompactNumber(transactionAlerts.length)} Alerts
                  </span>
                ) : (
                  <span className="rounded-full border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
                    {dashboardRecords.length} / {dashboardPayload.records.length} records
                  </span>
                )}
              </div>

              {activeWorkspaceTab === 'dashboard' ? (
                <div className="mt-5 flex flex-1 sm:mt-6">
                  <div className="flex w-full flex-col">
                    <div className="grid gap-8 min-[900px]:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.95fr)] min-[900px]:grid-rows-[auto_minmax(0,1fr)]">
                      <div data-tour="overview-shap-bars" className="min-[900px]:row-start-1">
                        <ShapBarPlot rows={allShap} />
                      </div>

                      <div data-tour="overview-validation" className="flex flex-col gap-6 min-[900px]:row-start-1 min-[900px]:h-full min-[900px]:gap-0">
                        <div data-tour="overview-metrics" className="w-full">
                          <div className="grid gap-3 sm:grid-cols-2 min-[900px]:grid-cols-2">
                            {filteredMetrics.map((metric) => (
                              <MetricCard
                                key={metric.label}
                                label={metric.label}
                                value={metric.value}
                                detail={metric.detail}
                              />
                            ))}
                          </div>
                        </div>
                        <div className="hidden min-[900px]:block min-[900px]:flex-1" />
                        <ConfusionMatrixCard data={filteredConfusionMatrix} />
                      </div>

                      <div className="min-[900px]:row-start-2">
                        <ShapPlot rows={allNumericalShap} />
                      </div>

                      <div className="min-[900px]:row-start-2">
                        <RocCurvePlot records={dashboardRecords} />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <TransactionsWorkbench
                  alerts={transactionAlerts}
                  records={dashboardRecords}
                  selectedFeatures={selectedFeatureKeys}
                  selectedAlertId={selectedTransactionAlertId}
                  onToggleFeature={toggleFeatureSelection}
                  tourFullscreenFocus={tourFullscreenFocus}
                />
              )}
            </article>
          </section>
        </main>
      </div>
    </div>
  )
}

export default App
