import { create } from 'zustand'

import {
  amlFeatures,
  createDefaultFilterState,
  shouldIgnoreStaleDashboardPayload,
  type AlertDecision,
  type AlertSeverity,
  type DashboardPayload,
  type FeatureFilterState,
  type FeatureKey,
  type WorkspaceTab,
} from '../lib/dashboard'

export type NavigationItemId = 'feature-selection' | 'alert-queue'

type AppState = {
  activeWorkspaceTab: WorkspaceTab
  activeWorldItemId: NavigationItemId
  isExplorerCollapsed: boolean
  selectedFeatureKeys: FeatureKey[]
  expandedFeatureKeys: FeatureKey[]
  expandedAlertSeverities: AlertSeverity[]
  expandedProcessedCategories: AlertDecision[]
  selectedTransactionAlertId: string | null
  processedAlertDecisions: Record<string, AlertDecision>
  featureFilters: Record<FeatureKey, FeatureFilterState>
  dashboardPayload: DashboardPayload | null
  setDashboardPayload: (payload: DashboardPayload) => void
  setActiveWorkspaceTab: (tab: WorkspaceTab) => void
  setActiveWorldItemId: (itemId: NavigationItemId) => void
  setIsExplorerCollapsed: (isCollapsed: boolean | ((current: boolean) => boolean)) => void
  toggleFeatureSelection: (featureKey: FeatureKey) => void
  toggleFeatureExpansion: (featureKey: FeatureKey) => void
  toggleAlertSeverity: (severity: AlertSeverity) => void
  toggleProcessedCategory: (decision: AlertDecision) => void
  setSelectedTransactionAlertId: (id: string | null) => void
  setAlertDecision: (id: string, decision: AlertDecision) => void
  updateFeatureFilter: (
    featureKey: FeatureKey,
    updater: (currentFilter: FeatureFilterState) => FeatureFilterState,
  ) => void
  addCategoryFilterValue: (featureKey: FeatureKey, value: string) => void
  removeCategoryFilterValue: (featureKey: FeatureKey, value: string) => void
}

const initialFeatureFilters = amlFeatures.reduce<Record<FeatureKey, FeatureFilterState>>(
  (accumulator, feature) => {
    accumulator[feature.key] = createDefaultFilterState()
    return accumulator
  },
  {} as Record<FeatureKey, FeatureFilterState>,
)

export const useAppStore = create<AppState>((set) => ({
  activeWorkspaceTab: 'dashboard',
  activeWorldItemId: 'alert-queue',
  isExplorerCollapsed: false,
  selectedFeatureKeys: amlFeatures.map((feature) => feature.key),
  expandedFeatureKeys: ['timestamp'],
  expandedAlertSeverities: [],
  expandedProcessedCategories: [],
  selectedTransactionAlertId: null,
  processedAlertDecisions: {},
  featureFilters: initialFeatureFilters,
  dashboardPayload: null,
  setDashboardPayload: (payload) =>
    set((state) => ({
      dashboardPayload: shouldIgnoreStaleDashboardPayload(state.dashboardPayload, payload)
        ? state.dashboardPayload
        : payload,
    })),
  setActiveWorkspaceTab: (tab) => set({ activeWorkspaceTab: tab }),
  setActiveWorldItemId: (itemId) => set({ activeWorldItemId: itemId }),
  setIsExplorerCollapsed: (isCollapsed) =>
    set((state) => ({
      isExplorerCollapsed:
        typeof isCollapsed === 'function' ? isCollapsed(state.isExplorerCollapsed) : isCollapsed,
    })),
  toggleFeatureSelection: (featureKey) =>
    set((state) => ({
      selectedFeatureKeys: amlFeatures
        .map((feature) => feature.key)
        .filter((currentKey) =>
          currentKey === featureKey
            ? !state.selectedFeatureKeys.includes(featureKey)
            : state.selectedFeatureKeys.includes(currentKey),
        ),
    })),
  toggleFeatureExpansion: (featureKey) =>
    set((state) => ({
      expandedFeatureKeys: state.expandedFeatureKeys.includes(featureKey)
        ? state.expandedFeatureKeys.filter((currentKey) => currentKey !== featureKey)
        : [...state.expandedFeatureKeys, featureKey],
    })),
  toggleAlertSeverity: (severity) =>
    set((state) => ({
      expandedAlertSeverities: state.expandedAlertSeverities.includes(severity)
        ? state.expandedAlertSeverities.filter((currentSeverity) => currentSeverity !== severity)
        : [...state.expandedAlertSeverities, severity],
    })),
  toggleProcessedCategory: (decision) =>
    set((state) => ({
      expandedProcessedCategories: state.expandedProcessedCategories.includes(decision)
        ? state.expandedProcessedCategories.filter((currentDecision) => currentDecision !== decision)
        : [...state.expandedProcessedCategories, decision],
    })),
  setSelectedTransactionAlertId: (id) => set({ selectedTransactionAlertId: id }),
  setAlertDecision: (id, decision) =>
    set((state) => ({
      processedAlertDecisions: {
        ...state.processedAlertDecisions,
        [id]: decision,
      },
    })),
  updateFeatureFilter: (featureKey, updater) =>
    set((state) => ({
      featureFilters: {
        ...state.featureFilters,
        [featureKey]: updater(state.featureFilters[featureKey]),
      },
    })),
  addCategoryFilterValue: (featureKey, value) =>
    set((state) => {
      const currentFilter = state.featureFilters[featureKey]
      return {
        featureFilters: {
          ...state.featureFilters,
          [featureKey]: {
            ...currentFilter,
            search: '',
            selectedValues: currentFilter.selectedValues.includes(value)
              ? currentFilter.selectedValues
              : [...currentFilter.selectedValues, value],
          },
        },
      }
    }),
  removeCategoryFilterValue: (featureKey, value) =>
    set((state) => {
      const currentFilter = state.featureFilters[featureKey]
      return {
        featureFilters: {
          ...state.featureFilters,
          [featureKey]: {
            ...currentFilter,
            selectedValues: currentFilter.selectedValues.filter((selectedValue) => selectedValue !== value),
          },
        },
      }
    }),
}))
