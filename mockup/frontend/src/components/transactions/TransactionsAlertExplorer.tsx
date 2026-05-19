import { useEffect, useState } from 'react'

import {
  alertMatchesSearch,
  type AlertDecision,
  type AlertPreview,
  type AlertSeverity,
  formatCompactNumber,
  processedAlertMeta,
  severityMeta,
} from '../../lib/dashboard'
import AlertQueueCard from './AlertQueueCard'

function TransactionsAlertExplorer({
  alerts,
  expandedAlertSeverities,
  onToggleSeverity,
  expandedProcessedCategories,
  onToggleProcessedCategory,
  selectedAlertId,
  onSelectAlert,
  processedAlertDecisions,
  onSetAlertDecision,
  tourOpenActionMenuForFirstAlert,
}: {
  alerts: AlertPreview[]
  expandedAlertSeverities: AlertSeverity[]
  onToggleSeverity: (severity: AlertSeverity) => void
  expandedProcessedCategories: AlertDecision[]
  onToggleProcessedCategory: (decision: AlertDecision) => void
  selectedAlertId: string | null
  onSelectAlert: (id: string) => void
  processedAlertDecisions: Record<string, AlertDecision>
  onSetAlertDecision: (id: string, decision: AlertDecision) => void
  tourOpenActionMenuForFirstAlert?: boolean
}) {
  const [actionMenuAlertId, setActionMenuAlertId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const pendingAlerts = alerts.filter((alert) => !processedAlertDecisions[alert.id])
  const filteredPendingAlerts = pendingAlerts.filter((alert) => alertMatchesSearch(alert, searchQuery))
  const filteredProcessedAlerts = alerts.filter(
    (alert) => processedAlertDecisions[alert.id] && alertMatchesSearch(alert, searchQuery),
  )
  const alertGroups = (['high', 'medium', 'low'] as const).map((severity) => ({
    severity,
    alerts: filteredPendingAlerts.filter((alert) => alert.severity === severity),
  }))
  const processedGroups = (['accepted', 'rejected'] as const).map((decision) => ({
    decision,
    alerts: filteredProcessedAlerts.filter((alert) => processedAlertDecisions[alert.id] === decision),
  }))
  const firstPendingAlertId = filteredPendingAlerts[0]?.id ?? null
  const visibleActionMenuAlertId =
    actionMenuAlertId && filteredPendingAlerts.some((alert) => alert.id === actionMenuAlertId)
      ? actionMenuAlertId
      : null

  useEffect(() => {
    if (!visibleActionMenuAlertId) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null

      if (
        target?.closest('[data-alert-action-menu="true"]') ||
        target?.closest('[data-alert-action-trigger="true"]')
      ) {
        return
      }

      setActionMenuAlertId(null)
    }

    document.addEventListener('mousedown', handlePointerDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [visibleActionMenuAlertId])

  return (
    <div data-tour="transactions-alerts-panel" className="space-y-5">
      <div>
        <div className="mb-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
            Search Alerts
          </p>
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search in features..."
            className="mt-2 w-full rounded-2xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm font-medium text-[var(--ink)] placeholder:text-[var(--muted)]"
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Alert Queue</p>
            <h3 className="mt-2 text-lg font-semibold text-[var(--ink)]">Filtered Alerts</h3>
          </div>
          <span className="rounded-full bg-[var(--surface-strong)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
            {formatCompactNumber(filteredPendingAlerts.length)}
          </span>
        </div>

        <div className="mt-5 space-y-2">
          {alertGroups.map((group) => {
            const isExpanded = expandedAlertSeverities.includes(group.severity)

            return (
              <div key={group.severity} className={`rounded-2xl border ${severityMeta[group.severity].tone}`}>
                <button
                  type="button"
                  onClick={() => onToggleSeverity(group.severity)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className={`h-2.5 w-2.5 rounded-full ${severityMeta[group.severity].dotTone}`} />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-[var(--ink)]">
                        {severityMeta[group.severity].label}
                      </span>
                      <span className="mt-1 block text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
                        {formatCompactNumber(group.alerts.length)} Alerts
                      </span>
                    </span>
                  </span>
                  <span className={`text-sm text-[var(--muted)] transition ${isExpanded ? 'rotate-180' : ''}`}>⌄</span>
                </button>

                {isExpanded ? (
                  <div className="max-h-[340px] space-y-2 overflow-auto border-t border-[var(--line)] px-3 py-3">
                    {group.alerts.map((alert) => (
                      <AlertQueueCard
                        key={alert.id}
                        alert={alert}
                        isSelected={selectedAlertId === alert.id}
                        badgeTone={severityMeta[group.severity].badgeTone}
                        onSelect={() => onSelectAlert(alert.id)}
                        actionMenuOpen={
                          visibleActionMenuAlertId === alert.id ||
                          (tourOpenActionMenuForFirstAlert === true && alert.id === firstPendingAlertId)
                        }
                        onToggleActionMenu={() =>
                          setActionMenuAlertId((currentId) => (currentId === alert.id ? null : alert.id))
                        }
                        onSetDecision={(decision) => {
                          onSetAlertDecision(alert.id, decision)
                          setActionMenuAlertId(null)
                        }}
                        cardTourId={alert.id === firstPendingAlertId ? 'transaction-alert-card' : undefined}
                        actionButtonTourId={alert.id === firstPendingAlertId ? 'alert-process-trigger' : undefined}
                        actionMenuTourId={alert.id === firstPendingAlertId ? 'alert-process-menu' : undefined}
                        acceptOptionTourId={alert.id === firstPendingAlertId ? 'alert-accept-option' : undefined}
                        rejectOptionTourId={alert.id === firstPendingAlertId ? 'alert-reject-option' : undefined}
                      />
                    ))}
                    {group.alerts.length === 0 ? (
                      <p className="text-sm text-[var(--muted)]">No alerts in this category for the current filter set.</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>

      <div className="border-t border-[var(--line)] pt-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-[var(--ink)]">Processed Alerts</h3>
          <span className="rounded-full bg-[var(--surface-strong)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
            {formatCompactNumber(processedGroups.reduce((total, group) => total + group.alerts.length, 0))}
          </span>
        </div>

        <div className="mt-3 space-y-2">
          {processedGroups.map((group) => {
            const isExpanded = expandedProcessedCategories.includes(group.decision)

            return (
              <div key={group.decision} className={`rounded-2xl border ${processedAlertMeta[group.decision].tone}`}>
                <button
                  type="button"
                  onClick={() => onToggleProcessedCategory(group.decision)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
                >
                  <span className="block text-sm font-semibold text-[var(--ink)]">
                    {processedAlertMeta[group.decision].label}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${processedAlertMeta[group.decision].badgeTone}`}>
                      {formatCompactNumber(group.alerts.length)}
                    </span>
                    <span className={`text-sm text-[var(--muted)] transition ${isExpanded ? 'rotate-180' : ''}`}>⌄</span>
                  </span>
                </button>
                {isExpanded ? (
                  <div className="max-h-[220px] space-y-2 overflow-auto border-t border-[var(--line)] px-3 py-3">
                    {group.alerts.length > 0 ? (
                      group.alerts.map((alert) => (
                        <AlertQueueCard
                          key={alert.id}
                          alert={alert}
                          isSelected={selectedAlertId === alert.id}
                          badgeTone={severityMeta[alert.severity].badgeTone}
                          onSelect={() => onSelectAlert(alert.id)}
                          actionButtonLabel={processedAlertMeta[group.decision].label}
                        />
                      ))
                    ) : (
                      <p className="text-sm text-[var(--muted)]">No processed alerts yet.</p>
                    )}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default TransactionsAlertExplorer
