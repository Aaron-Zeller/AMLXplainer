import { driver } from 'driver.js'
import { useState } from 'react'

import {
  buildAlertPreviews,
  computeBaseWaterfallContributions,
  dateInputToEpochEnd,
  dateInputToEpochStart,
  epochToDateInputValue,
  type FeatureFilterState,
  type FeatureKey,
  type WorkspaceTab,
} from '../lib/dashboard'
import { useAppStore } from '../store/appStore'

type AlertDecision = 'accepted' | 'rejected'
type AlertSeverity = 'high' | 'medium' | 'low'
type NavigationItemId = 'feature-selection' | 'alert-queue'

type UseOnboardingTourArgs = {
  numericTimestampBounds?: { min: number; max: number; step: number }
  featureFilters: Record<FeatureKey, FeatureFilterState>
  selectedFeatureKeys: FeatureKey[]
  expandedFeatureKeys: FeatureKey[]
  expandedAlertSeverities: AlertSeverity[]
  expandedProcessedCategories: AlertDecision[]
  activeWorkspaceTab: WorkspaceTab
  activeWorldItemId: NavigationItemId
  selectedTransactionAlertId: string | null
  filteredDashboardRecords: ReturnType<typeof buildAlertPreviews>[number]['record'][]
  processedAlertDecisions: Record<string, AlertDecision>
  setActiveWorkspaceTab: (tab: WorkspaceTab) => void
  setActiveWorldItemId: (itemId: NavigationItemId) => void
  setIsExplorerCollapsed: (isCollapsed: boolean | ((current: boolean) => boolean)) => void
  toggleFeatureSelection: (featureKey: FeatureKey) => void
  toggleFeatureExpansion: (featureKey: FeatureKey) => void
  toggleAlertSeverity: (severity: AlertSeverity) => void
  toggleProcessedCategory: (decision: AlertDecision) => void
  setSelectedTransactionAlertId: (id: string | null) => void
  updateFeatureFilter: (
    featureKey: FeatureKey,
    updater: (currentFilter: FeatureFilterState) => FeatureFilterState,
  ) => void
}

export function useOnboardingTour({
  numericTimestampBounds,
  featureFilters,
  selectedFeatureKeys,
  expandedFeatureKeys,
  expandedAlertSeverities,
  expandedProcessedCategories,
  activeWorkspaceTab,
  activeWorldItemId,
  selectedTransactionAlertId,
  filteredDashboardRecords,
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
}: UseOnboardingTourArgs) {
  const [isTourProcessMenuOpen, setIsTourProcessMenuOpen] = useState(false)
  const [tourFullscreenFocus, setTourFullscreenFocus] = useState<'edge' | 'node' | null>(null)

  const runOnboardingTour = () => {
    let hasShownShapToggleDemo = false
    let hasShownValidationFilterDemo = false
    let hasShownWaterfallDisableDemo = false
    let hasShownWaterfallReaddDemo = false
    let hasShownFullscreenAlertToggleDemo = false

    const transactionAlerts = buildAlertPreviews(filteredDashboardRecords)

    const refreshAfterScroll = () => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          driverObj.refresh()
        })
      })
    }

    const waitForTourElement = (
      selector: string,
      onSettled: (found: boolean) => void,
      timeout = 2400,
    ) => {
      const startTime = Date.now()

      const check = () => {
        if (document.querySelector(selector)) {
          onSettled(true)
          return
        }

        if (Date.now() - startTime >= timeout) {
          onSettled(false)
          return
        }

        window.requestAnimationFrame(check)
      }

      check()
    }

    const syncAfterLayout = (callback: () => void) => {
      callback()
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          driverObj.moveNext()
        })
      })
    }

    const openOverview = () => {
      setActiveWorkspaceTab('dashboard')
      setIsExplorerCollapsed(false)
    }

    const ensureTimestampFeatureVisible = () => {
      openOverview()
      if (!useAppStore.getState().expandedFeatureKeys.includes('timestamp')) {
        toggleFeatureExpansion('timestamp')
      }
    }

    const timestampFilterSnapshot = { ...featureFilters.timestamp }
    const selectedFeatureSnapshot = [...selectedFeatureKeys]
    const expandedFeatureSnapshot = [...expandedFeatureKeys]
    const expandedAlertSeveritiesSnapshot = [...expandedAlertSeverities]
    const expandedProcessedCategoriesSnapshot = [...expandedProcessedCategories]
    const workspaceSnapshot = activeWorkspaceTab
    const worldItemSnapshot = activeWorldItemId
    const selectedTransactionAlertSnapshot = selectedTransactionAlertId
    const firstPendingAlert =
      transactionAlerts.find((alert) => !processedAlertDecisions[alert.id]) ?? transactionAlerts[0] ?? null
    const secondTransactionAlert =
      transactionAlerts.find((alert) => firstPendingAlert && alert.id !== firstPendingAlert.id) ?? null

    const clickIfPresent = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector)
      element?.click()
    }

    const ensureSeverityExpanded = (severity: AlertSeverity) => {
      if (!useAppStore.getState().expandedAlertSeverities.includes(severity)) {
        toggleAlertSeverity(severity)
      }
    }

    const applyTimestampDemoFilter = () => {
      if (!numericTimestampBounds) {
        return
      }

      const range = numericTimestampBounds.max - numericTimestampBounds.min
      const rawStart = numericTimestampBounds.min + range * 0.18
      const rawEnd = numericTimestampBounds.min + range * 0.42
      const demoStart = dateInputToEpochStart(epochToDateInputValue(rawStart))
      const demoEnd = dateInputToEpochEnd(epochToDateInputValue(rawEnd))

      updateFeatureFilter('timestamp', (currentFilter) => ({
        ...currentFilter,
        min: String(demoStart),
        max: String(demoEnd),
        timeStart: '08:00',
        timeEnd: '18:00',
      }))
    }

    const clearTimestampDemoFilter = () => {
      updateFeatureFilter('timestamp', (currentFilter) => ({
        ...currentFilter,
        min: '',
        max: '',
        timeStart: '00:00',
        timeEnd: '23:59',
      }))
    }

    const ensureTimestampDemoFilterState = (shouldBeApplied: boolean) => {
      if (shouldBeApplied) {
        applyTimestampDemoFilter()
        return
      }

      clearTimestampDemoFilter()
    }

    const restoreOnboardingState = () => {
      const currentSelectedFeatureKeys = useAppStore.getState().selectedFeatureKeys
      const currentExpandedFeatureKeys = useAppStore.getState().expandedFeatureKeys
      const currentExpandedAlertSeverities = useAppStore.getState().expandedAlertSeverities
      const currentExpandedProcessedCategories = useAppStore.getState().expandedProcessedCategories

      currentSelectedFeatureKeys.forEach((featureKey) => {
        if (!selectedFeatureSnapshot.includes(featureKey)) {
          toggleFeatureSelection(featureKey)
        }
      })
      selectedFeatureSnapshot.forEach((featureKey) => {
        if (!currentSelectedFeatureKeys.includes(featureKey)) {
          toggleFeatureSelection(featureKey)
        }
      })
      currentExpandedFeatureKeys.forEach((featureKey) => {
        if (!expandedFeatureSnapshot.includes(featureKey)) {
          toggleFeatureExpansion(featureKey)
        }
      })
      expandedFeatureSnapshot.forEach((featureKey) => {
        if (!currentExpandedFeatureKeys.includes(featureKey)) {
          toggleFeatureExpansion(featureKey)
        }
      })
      currentExpandedAlertSeverities.forEach((severity) => {
        if (!expandedAlertSeveritiesSnapshot.includes(severity)) {
          toggleAlertSeverity(severity)
        }
      })
      expandedAlertSeveritiesSnapshot.forEach((severity) => {
        if (!currentExpandedAlertSeverities.includes(severity)) {
          toggleAlertSeverity(severity)
        }
      })
      currentExpandedProcessedCategories.forEach((decision) => {
        if (!expandedProcessedCategoriesSnapshot.includes(decision)) {
          toggleProcessedCategory(decision)
        }
      })
      expandedProcessedCategoriesSnapshot.forEach((decision) => {
        if (!currentExpandedProcessedCategories.includes(decision)) {
          toggleProcessedCategory(decision)
        }
      })
      updateFeatureFilter('timestamp', () => timestampFilterSnapshot)
      setIsTourProcessMenuOpen(false)
      setTourFullscreenFocus(null)
      setSelectedTransactionAlertId(selectedTransactionAlertSnapshot)
      setActiveWorkspaceTab(workspaceSnapshot)
      setActiveWorldItemId(worldItemSnapshot)
      clickIfPresent('[aria-label="Exit full-screen map"]')
    }

    const openTransactionsAlerts = () => {
      setActiveWorkspaceTab('world')
      setActiveWorldItemId('alert-queue')
      setIsExplorerCollapsed(false)
    }

    const prepareTransactionsAlertDemo = () => {
      openTransactionsAlerts()
      setIsTourProcessMenuOpen(false)
      if (firstPendingAlert) {
        ensureSeverityExpanded(firstPendingAlert.severity)
        setSelectedTransactionAlertId(firstPendingAlert.id)
      }
    }

    const showAlertProcessTriggerDemo = () => {
      prepareTransactionsAlertDemo()
      refreshAfterScroll()
    }

    const openAlertProcessMenuDemo = () => {
      if (!firstPendingAlert) {
        return
      }

      openTransactionsAlerts()
      ensureSeverityExpanded(firstPendingAlert.severity)
      setSelectedTransactionAlertId(firstPendingAlert.id)

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          setIsTourProcessMenuOpen(true)
          waitForTourElement('[data-tour="alert-process-menu"]', (found) => {
            if (found) {
              const menuElement = document.querySelector<HTMLElement>('[data-tour="alert-process-menu"]')
              menuElement?.scrollIntoView({ block: 'nearest' })
              refreshAfterScroll()
            }
          })
        })
      })
    }

    const moveToProcessMenuStep = () => {
      openAlertProcessMenuDemo()
      waitForTourElement('[data-tour="alert-process-menu"]', (found) => {
        if (!found) {
          openAlertProcessMenuDemo()
          refreshAfterScroll()
          return
        }

        const menuElement = document.querySelector<HTMLElement>('[data-tour="alert-process-menu"]')
        menuElement?.scrollIntoView({ block: 'nearest' })
        refreshAfterScroll()
        window.requestAnimationFrame(() => {
          driverObj.moveNext()
        })
      })
    }

    const getPrimaryWaterfallFeatureKey = () => {
      if (!firstPendingAlert) {
        return null
      }

      return (
        computeBaseWaterfallContributions(firstPendingAlert.record)
          .sort((left, right) => Math.abs(right.contribution) - Math.abs(left.contribution))[0]?.featureKey
        ?? null
      )
    }

    const runWaterfallDisableDemo = () => {
      if (hasShownWaterfallDisableDemo || !firstPendingAlert) {
        return
      }

      hasShownWaterfallDisableDemo = true
      const waterfallFeatureKey = getPrimaryWaterfallFeatureKey()

      if (!waterfallFeatureKey) {
        return
      }

      window.setTimeout(() => {
        setIsTourProcessMenuOpen(false)
        setSelectedTransactionAlertId(firstPendingAlert.id)
        const selectedFeatureKeysNow = useAppStore.getState().selectedFeatureKeys
        if (selectedFeatureKeysNow.includes(waterfallFeatureKey)) {
          toggleFeatureSelection(waterfallFeatureKey)
        }
        refreshAfterScroll()
      }, 450)
    }

    const runWaterfallReaddDemo = () => {
      if (hasShownWaterfallReaddDemo) {
        return
      }

      hasShownWaterfallReaddDemo = true
      const waterfallFeatureKey = getPrimaryWaterfallFeatureKey()

      if (!waterfallFeatureKey) {
        return
      }

      window.setTimeout(() => {
        const updatedSelectedFeatureKeys = useAppStore.getState().selectedFeatureKeys
        if (!updatedSelectedFeatureKeys.includes(waterfallFeatureKey)) {
          toggleFeatureSelection(waterfallFeatureKey)
        }
        refreshAfterScroll()
      }, 450)
    }

    const openFullscreenMapDemo = () => {
      setTourFullscreenFocus(null)
      clickIfPresent('[data-tour="transaction-map-expand"]')
    }

    const closeFullscreenMapDemo = () => {
      setTourFullscreenFocus(null)
      clickIfPresent('[aria-label="Exit full-screen map"]')
    }

    const openFullscreenAlertsMenu = () => {
      window.setTimeout(() => {
        clickIfPresent('[data-tour="fullscreen-alerts-launcher"]')
        refreshAfterScroll()
      }, 250)
    }

    const expandFullscreenAlertGroups = () => {
      ;(['high', 'medium', 'low'] as const).forEach((severity) => {
        const button = document.querySelector<HTMLElement>(`[data-fullscreen-severity-toggle="${severity}"]`)
        if (button && !button.querySelector('.rotate-180')) {
          button.click()
        }
      })
      refreshAfterScroll()
    }

    const addAnotherFullscreenAlert = () => {
      window.setTimeout(() => {
        expandFullscreenAlertGroups()
        window.setTimeout(() => {
          refreshAfterScroll()
        }, 150)
        window.setTimeout(() => {
          if (secondTransactionAlert) {
            clickIfPresent('[data-tour="fullscreen-secondary-alert"]')
          }
          refreshAfterScroll()
          window.setTimeout(() => {
            refreshAfterScroll()
          }, 250)
        }, 350)
      }, 250)
    }

    const runFullscreenAlertToggleDemo = () => {
      if (hasShownFullscreenAlertToggleDemo) {
        return
      }

      hasShownFullscreenAlertToggleDemo = true

      window.setTimeout(() => {
        expandFullscreenAlertGroups()

        window.setTimeout(() => {
          refreshAfterScroll()

          window.setTimeout(() => {
          clickIfPresent('[data-tour="fullscreen-primary-alert"]')
          refreshAfterScroll()

          window.setTimeout(() => {
            clickIfPresent('[data-tour="fullscreen-primary-alert"]')
            refreshAfterScroll()
            }, 1400)
          }, 550)
        }, 350)
      }, 250)
    }

    const runRelatedTransactionsAddDemo = () => {
      waitForTourElement('[data-tour="fullscreen-related-toggle"]', (found) => {
        if (!found) {
          return
        }

        window.setTimeout(() => {
          clickIfPresent('[data-tour="fullscreen-related-toggle"]')
          window.setTimeout(() => {
            refreshAfterScroll()
          }, 250)
        }, 650)
      })
    }

    const runRelatedTransactionsRemoveDemo = () => {
      waitForTourElement('[data-tour="fullscreen-related-toggle"]', (found) => {
        if (!found) {
          return
        }

        window.setTimeout(() => {
          clickIfPresent('[data-tour="fullscreen-related-toggle"]')
          window.setTimeout(() => {
            refreshAfterScroll()
          }, 250)
        }, 650)
      })
    }

    const focusFullscreenPanel = (target: 'edge' | 'node', selector?: string) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          setTourFullscreenFocus(target)
          if (selector) {
            waitForTourElement(selector, (found) => {
              if (found) {
                refreshAfterScroll()
              }
            })
            return
          }

          window.setTimeout(() => {
            refreshAfterScroll()
          }, 300)
        })
      })
    }

    const openFullscreenNodePanelDemo = () => {
      focusFullscreenPanel('node', '[data-tour="fullscreen-node-panel"]')
    }

    const openFullscreenEdgePanelDemo = () => {
      focusFullscreenPanel('edge', '[data-tour="fullscreen-edge-panel"]')
    }

    const ensureFullscreenEdgePanelVisible = () => {
      if (document.querySelector('[data-tour="fullscreen-edge-panel"]')) {
        refreshAfterScroll()
        return
      }

      openFullscreenEdgePanelDemo()
    }

    const ensureFullscreenNodePanelVisible = () => {
      if (document.querySelector('[data-tour="fullscreen-node-panel"]')) {
        refreshAfterScroll()
        return
      }

      openFullscreenNodePanelDemo()
    }

    const moveToFullscreenEdgePanelStep = () => {
      focusFullscreenPanel('edge', '[data-tour="fullscreen-edge-panel"]')
      waitForTourElement('[data-tour="fullscreen-edge-panel"]', (found) => {
        if (!found) {
          openFullscreenEdgePanelDemo()
          refreshAfterScroll()
          return
        }

        refreshAfterScroll()
        window.requestAnimationFrame(() => {
          driverObj.moveNext()
        })
      })
    }

    const moveToFullscreenNodePanelStep = () => {
      focusFullscreenPanel('node', '[data-tour="fullscreen-node-panel"]')
      waitForTourElement('[data-tour="fullscreen-node-panel"]', (found) => {
        if (!found) {
          openFullscreenNodePanelDemo()
          refreshAfterScroll()
          return
        }

        refreshAfterScroll()
        window.requestAnimationFrame(() => {
          driverObj.moveNext()
        })
      })
    }

    const moveToRelatedTransactionsStep = () => {
      focusFullscreenPanel('edge', '[data-tour="fullscreen-related-transactions"]')
      waitForTourElement('[data-tour="fullscreen-related-transactions"]', (found) => {
        if (!found) {
          openFullscreenEdgePanelDemo()
          refreshAfterScroll()
          return
        }

        refreshAfterScroll()
        window.requestAnimationFrame(() => {
          driverObj.moveNext()
        })
      })
    }

    const driverObj = driver({
      animate: true,
      showProgress: true,
      stagePadding: 8,
      stageRadius: 18,
      overlayColor: 'rgba(16, 34, 53, 0.32)',
      popoverClass: 'aml-driver-popover',
      onDestroyed: restoreOnboardingState,
      steps: [
        {
          element: '[data-tour="overview-shap-bars"]',
          onHighlighted: refreshAfterScroll,
          popover: {
            title: 'Overview Explainability',
            description: 'This first SHAP plot summarizes the non-numerical features, such as country, bank, account, currency, and payment format.',
            side: 'left',
            align: 'start',
          },
        },
        {
          element: '[data-tour="overview-validation"]',
          onHighlighted: refreshAfterScroll,
          popover: {
            title: 'Validation Summary',
            description: 'This section combines the quality metrics and the confusion matrix for the current transaction subset.',
            side: 'left',
            align: 'start',
          },
        },
        {
          element: '[data-tour="overview-numerical-shap"]',
          onHighlighted: refreshAfterScroll,
          popover: {
            title: 'Numerical SHAP Plot',
            description: 'This second SHAP plot focuses on numerical features, showing how their values push predictions up or down across the filtered sample.',
            side: 'left',
            align: 'start',
          },
        },
        {
          element: '[data-tour="overview-roc-curve"]',
          onHighlighted: refreshAfterScroll,
          popover: {
            title: 'ROC Curve',
            description: 'The ROC curve summarizes how the model trades off true positive rate and false positive rate across thresholds.',
            side: 'left',
            align: 'start',
          },
        },
        {
          element: '[data-tour="feature-selection-panel"]',
          onHighlighted: refreshAfterScroll,
          popover: {
            title: 'Feature Selection',
            description: 'After understanding the dashboard outputs, use this panel to narrow features and filters that affect the analytics and transaction views.',
            side: 'right',
            align: 'start',
            onNextClick: () => {
              syncAfterLayout(ensureTimestampFeatureVisible)
            },
          },
        },
        {
          element: '[data-tour="timestamp-feature"]',
          onHighlighted: refreshAfterScroll,
          popover: {
            title: 'Feature Toggling',
            description: 'This is the Timestamp feature. Clicking the feature row toggles it in or out of the SHAP views.',
            side: 'right',
            align: 'start',
            onNextClick: () => {
              syncAfterLayout(() => {
                ensureTimestampFeatureVisible()
                const currentSelectedFeatureKeys = useAppStore.getState().selectedFeatureKeys
                if (currentSelectedFeatureKeys.includes('timestamp')) {
                  toggleFeatureSelection('timestamp')
                }
              })
            },
          },
        },
        {
          element: '[data-tour="timestamp-feature"]',
          onHighlighted: refreshAfterScroll,
          popover: {
            title: 'Feature Disabled',
            description: 'With Timestamp turned off, the SHAP plots are recomputed without it. Click it again to re-enable it.',
            side: 'right',
            align: 'start',
            onNextClick: () => {
              syncAfterLayout(() => {
                ensureTimestampFeatureVisible()
                const currentSelectedFeatureKeys = useAppStore.getState().selectedFeatureKeys
                if (!currentSelectedFeatureKeys.includes('timestamp')) {
                  toggleFeatureSelection('timestamp')
                }
              })
            },
          },
        },
        {
          element: '[data-tour="overview-shap-bars"]',
          onHighlighted: () => {
            refreshAfterScroll()

            if (hasShownShapToggleDemo) {
              return
            }

            hasShownShapToggleDemo = true

            const ensureTimestampState = (shouldBeSelected: boolean) => {
              const currentSelectedFeatureKeys = useAppStore.getState().selectedFeatureKeys
              const isSelected = currentSelectedFeatureKeys.includes('timestamp')

              if (shouldBeSelected && !isSelected) {
                toggleFeatureSelection('timestamp')
              }

              if (!shouldBeSelected && isSelected) {
                toggleFeatureSelection('timestamp')
              }
            }

            window.setTimeout(() => {
              window.setTimeout(() => {
                ensureTimestampState(true)

                window.setTimeout(() => {
                  ensureTimestampState(false)

                  window.setTimeout(() => {
                    ensureTimestampState(true)
                  }, 900)
                }, 900)
              }, 900)

              ensureTimestampState(false)
            }, 500)
          },
          popover: {
            title: 'SHAP Values Update',
            description: 'This example briefly removes and restores Timestamp to show how feature inclusion changes the SHAP attribution profile.',
            side: 'left',
            align: 'start',
            onNextClick: () => {
              syncAfterLayout(() => {
                applyTimestampDemoFilter()
              })
            },
          },
        },
        {
          element: '[data-tour="timestamp-filter"]',
          onHighlighted: refreshAfterScroll,
          popover: {
            title: 'Filter The Transaction Subset',
            description: 'Use Timestamp to constrain the review period and daily time window. In this example, the analytics are recalculated for a narrower transaction subset.',
            side: 'right',
            align: 'start',
          },
        },
        {
          element: '[data-tour="overview-validation"]',
          onHighlighted: () => {
            refreshAfterScroll()

            if (hasShownValidationFilterDemo) {
              return
            }

            hasShownValidationFilterDemo = true

            window.setTimeout(() => {
              ensureTimestampDemoFilterState(false)

              window.setTimeout(() => {
                ensureTimestampDemoFilterState(true)

                window.setTimeout(() => {
                  ensureTimestampDemoFilterState(false)

                  window.setTimeout(() => {
                    ensureTimestampDemoFilterState(true)
                  }, 900)
                }, 900)
              }, 900)
            }, 500)
          },
          popover: {
            title: 'Filtered Validation Summary',
            description: 'After applying a filter, the validation metrics and confusion matrix update for the narrowed review population.',
            side: 'left',
            align: 'start',
          },
        },
        {
          element: '[data-tour="workspace-tabs"]',
          onHighlighted: refreshAfterScroll,
          popover: {
            title: 'Switch To Transactions',
            description: 'Use Transactions to move from model-level monitoring into alert-level investigation and case review.',
            side: 'bottom',
            align: 'start',
            onNextClick: () => {
              syncAfterLayout(openTransactionsAlerts)
            },
          },
        },
        {
          element: '[data-tour="transactions-alerts-panel"]',
          onHighlighted: () => {
            prepareTransactionsAlertDemo()
            refreshAfterScroll()
          },
          popover: {
            title: 'Alert Queue',
            description: 'Use the alert queue to review flagged transactions, search across transaction attributes, and select the next alert for investigation.',
            side: 'right',
            align: 'start',
            onPrevClick: () => {
              openOverview()
              window.requestAnimationFrame(() => {
                window.requestAnimationFrame(() => {
                  driverObj.movePrevious()
                })
              })
            },
          },
        },
        {
          element: '[data-tour="alert-process-trigger"]',
          onHighlighted: showAlertProcessTriggerDemo,
          popover: {
            title: 'Process Alerts',
            description: 'Use Process on a pending alert to open the case decision menu.',
            side: 'right',
            align: 'start',
            onNextClick: () => {
              moveToProcessMenuStep()
            },
          },
        },
        {
          element: '[data-tour="alert-process-menu"]',
          onHighlighted: () => {
            openAlertProcessMenuDemo()
            refreshAfterScroll()
          },
          popover: {
            title: 'Accept Or Reject',
            description: 'Record the review outcome by accepting the alert or rejecting it as a false positive.',
            side: 'bottom',
            align: 'start',
            onNextClick: () => {
              setIsTourProcessMenuOpen(false)
              window.requestAnimationFrame(() => {
                window.requestAnimationFrame(() => {
                  driverObj.moveNext()
                })
              })
            },
          },
        },
        {
          element: '[data-tour="transaction-waterfall"]',
          onHighlighted: refreshAfterScroll,
          popover: {
            title: 'Transaction Explanation',
            description: 'This local explanation shows how the selected transaction’s features contribute to the model output.',
            side: 'bottom',
            align: 'center',
          },
        },
        {
          element: '[data-tour="waterfall-primary-row"]',
          onHighlighted: () => {
            refreshAfterScroll()
            runWaterfallDisableDemo()
          },
          popover: {
            title: 'Remove A Feature',
            description: 'Temporarily removing a feature lets you assess how the explanation changes without that driver.',
            side: 'right',
            align: 'start',
          },
        },
        {
          element: '[data-tour="waterfall-primary-row"]',
          onHighlighted: () => {
            refreshAfterScroll()
            runWaterfallReaddDemo()
          },
          popover: {
            title: 'Add It Back',
            description: 'Re-adding the feature restores it to the explanation so you can compare the before-and-after attribution.',
            side: 'right',
            align: 'start',
          },
        },
        {
          element: '[data-tour="transaction-map-expand"]',
          onHighlighted: refreshAfterScroll,
          popover: {
            title: 'Expand The Map',
            description: 'Open the fullscreen map for route analysis, cross-border context, and multi-transaction comparison.',
            side: 'left',
            align: 'center',
            onNextClick: () => {
              syncAfterLayout(openFullscreenMapDemo)
            },
          },
        },
        {
          element: '[data-tour="fullscreen-alerts-launcher"]',
          onHighlighted: refreshAfterScroll,
          popover: {
            title: 'Fullscreen Alert Queue',
            description: 'In the fullscreen investigation view, open the alert queue to add further flagged transactions to the map.',
            side: 'right',
            align: 'start',
            onPrevClick: () => {
              closeFullscreenMapDemo()
              window.requestAnimationFrame(() => {
                window.requestAnimationFrame(() => {
                  driverObj.movePrevious()
                })
              })
            },
            onNextClick: () => {
              syncAfterLayout(openFullscreenAlertsMenu)
            },
          },
        },
        {
          element: '[data-tour="fullscreen-alerts-panel"]',
          onHighlighted: addAnotherFullscreenAlert,
          popover: {
            title: 'Add More Alerts',
            description: 'Selecting additional alerts adds their transaction routes to the map, allowing side-by-side comparison of multiple cases.',
            side: 'right',
            align: 'start',
          },
        },
        {
          element: '[data-tour="fullscreen-primary-alert"]',
          onHighlighted: runFullscreenAlertToggleDemo,
          popover: {
            title: 'Toggle A Transaction',
            description: 'Selecting a transaction in the fullscreen queue adds it to the map; selecting it again removes it from the current investigation view.',
            side: 'right',
            align: 'start',
          },
        },
        {
          element: '[data-tour="fullscreen-route-target"]',
          onHighlighted: refreshAfterScroll,
          popover: {
            title: 'Inspect Edges',
            description: 'Inspect route edges to review the corridor-level transaction path represented on the map.',
            side: 'left',
            align: 'center',
            onNextClick: () => {
              moveToFullscreenEdgePanelStep()
            },
          },
        },
        {
          element: '[data-tour="fullscreen-edge-panel"]',
          onHighlighted: ensureFullscreenEdgePanelVisible,
          popover: {
            title: 'Edge Detail View',
            description: 'Selecting an edge opens the corridor detail view for that transaction path.',
            side: 'left',
            align: 'start',
            onNextClick: () => {
              moveToFullscreenNodePanelStep()
            },
          },
        },
        {
          element: '[data-tour="fullscreen-country-target"]',
          onHighlighted: refreshAfterScroll,
          popover: {
            title: 'Inspect Nodes',
            description: 'Inspect nodes to review the jurisdiction-level context and related attributes attached to that location.',
            side: 'left',
            align: 'start',
            onNextClick: () => {
              moveToFullscreenNodePanelStep()
            },
          },
        },
        {
          element: '[data-tour="fullscreen-node-panel"]',
          onHighlighted: ensureFullscreenNodePanelVisible,
          popover: {
            title: 'Node Detail View',
            description: 'Selecting a node opens the node detail view with related jurisdiction, bank, and account context.',
            side: 'left',
            align: 'start',
            onNextClick: () => {
              moveToRelatedTransactionsStep()
            },
          },
        },
        {
          element: '[data-tour="fullscreen-related-transactions"]',
          onHighlighted: refreshAfterScroll,
          popover: {
            title: 'Related Transaction Menu',
            description: 'After selecting an edge, this panel exposes related country, bank, and account filters that can be added to the investigation map.',
            side: 'left',
            align: 'start',
          },
        },
        {
          element: '[data-tour="fullscreen-related-toggle"]',
          onHighlighted: () => {
            refreshAfterScroll()
            window.setTimeout(() => {
              runRelatedTransactionsAddDemo()
            }, 250)
          },
          popover: {
            title: 'Add Related Transactions',
            description: 'Selecting one of the related attributes in this panel adds the matching transactions to the current map view.',
            side: 'left',
            align: 'start',
          },
        },
        {
          element: '[data-tour="fullscreen-related-toggle"]',
          onHighlighted: () => {
            refreshAfterScroll()
            window.setTimeout(() => {
              runRelatedTransactionsRemoveDemo()
            }, 250)
          },
          popover: {
            title: 'Remove Related Transactions',
            description: 'Selecting the same related attribute again removes those transactions from the current map view.',
            side: 'left',
            align: 'start',
          },
        },
      ],
    })

    openOverview()
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        driverObj.drive()
      })
    })
  }

  return {
    runOnboardingTour,
    isTourProcessMenuOpen,
    tourFullscreenFocus,
  }
}
