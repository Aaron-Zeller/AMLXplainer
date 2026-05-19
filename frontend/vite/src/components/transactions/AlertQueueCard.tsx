import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import {
  type AlertDecision,
  type AlertPreview,
  processedAlertMeta,
} from '../../lib/dashboard'

function AlertQueueCard({
  alert,
  isSelected,
  badgeTone,
  onSelect,
  actionMenuOpen,
  onToggleActionMenu,
  onSetDecision,
  actionButtonLabel = 'Triage',
  cardTourId,
  actionButtonTourId,
  actionMenuTourId,
  acceptOptionTourId,
  rejectOptionTourId,
}: {
  alert: AlertPreview
  isSelected: boolean
  badgeTone: string
  onSelect: () => void
  actionMenuOpen?: boolean
  onToggleActionMenu?: () => void
  onSetDecision?: (decision: AlertDecision) => void
  actionButtonLabel?: string
  cardTourId?: string
  actionButtonTourId?: string
  actionMenuTourId?: string
  acceptOptionTourId?: string
  rejectOptionTourId?: string
}) {
  const actionTriggerRef = useRef<HTMLButtonElement | null>(null)
  const [actionMenuPosition, setActionMenuPosition] = useState<{ top: number; left: number } | null>(null)
  const modelDecision = alert.record.predictedAlert ? 'Alert' : 'No alert'
  const knownOutcome = alert.record.isLaundering ? 'Confirmed suspicious' : 'No confirmed fraud'
  const evaluationOutcome = alert.record.predictedAlert
    ? alert.record.isLaundering
      ? 'True positive'
      : 'False positive'
    : alert.record.isLaundering
      ? 'False negative'
      : 'True negative'

  useEffect(() => {
    if (!actionMenuOpen || !actionTriggerRef.current || typeof window === 'undefined') {
      return
    }

    const updatePosition = () => {
      const triggerRect = actionTriggerRef.current?.getBoundingClientRect()
      if (!triggerRect) {
        return
      }

      const menuWidth = 390
      const estimatedMenuHeight = 470
      const viewportPadding = 12
      const preferredTop = triggerRect.bottom + 8
      const top = Math.max(
        viewportPadding,
        Math.min(
          window.innerHeight - estimatedMenuHeight - viewportPadding,
          Math.max(viewportPadding, preferredTop),
        ),
      )
      const left = Math.min(
        window.innerWidth - menuWidth - viewportPadding,
        Math.max(viewportPadding, triggerRect.right - menuWidth),
      )

      setActionMenuPosition({ top, left })
    }

    updatePosition()

    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [actionMenuOpen])

  return (
    <div
      data-tour={cardTourId}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect()
        }
      }}
      role="button"
      tabIndex={0}
      className={`w-full cursor-pointer select-none rounded-md border px-3 py-3 text-left transition duration-150 outline-none focus-visible:ring-2 focus-visible:ring-[var(--line-strong)] ${
        isSelected
          ? 'border-[var(--line-strong)] bg-[var(--surface-strong)]'
          : 'border-[var(--line)] bg-[var(--surface-raised)] hover:border-[var(--line-strong)] hover:bg-[var(--surface)]'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--ink)]">{alert.routeLabel}</p>
          <p className="figure-text mt-1 text-xs text-[var(--muted)]">{alert.timeLabel}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className={`figure-text min-w-[74px] rounded-md px-2.5 py-1 text-center text-[11px] font-semibold ${badgeTone}`}>
            {(alert.confidence * 100).toFixed(0)}%
          </span>
          {onToggleActionMenu ? (
            <div className="relative">
              <button
                ref={actionTriggerRef}
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  onToggleActionMenu()
                }}
                data-tour={actionButtonTourId}
                data-alert-action-trigger="true"
                className="inline-flex min-w-[74px] cursor-pointer items-center justify-center rounded-md border border-[var(--line)] bg-[var(--surface-raised)] px-2.5 py-1 text-[11px] font-semibold text-[var(--muted)] transition hover:border-[var(--line-strong)] hover:bg-[var(--surface-strong)]"
              >
                {actionButtonLabel}
              </button>
              {actionMenuOpen && onSetDecision && actionMenuPosition && typeof document !== 'undefined'
                ? createPortal(
                    <div
                      data-tour={actionMenuTourId}
                      data-alert-action-menu="true"
                      className="fixed z-[120] w-[min(390px,calc(100vw-24px))] overflow-auto rounded-md border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-[0_8px_20px_rgba(0,0,0,0.16)]"
                      style={{
                        top: actionMenuPosition.top,
                        left: actionMenuPosition.left,
                        maxHeight: 'calc(100vh - 24px)',
                      }}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h4 className="text-sm font-semibold text-[var(--ink)]">Triage</h4>
                          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                            Compare the model signal with the known case outcome, then set the analyst status.
                          </p>
                        </div>
                        <span className={`figure-text rounded-md px-2.5 py-1 text-[11px] font-semibold ${badgeTone}`}>
                          {(alert.confidence * 100).toFixed(1)}%
                        </span>
                      </div>

                      <div className="mt-4 rounded-md border border-[var(--line)]">
                        {[
                          ['Confidence', `${(alert.confidence * 100).toFixed(1)}%`],
                          ['Model assessment', modelDecision],
                          ['Known outcome', knownOutcome],
                          ['Evaluation', evaluationOutcome],
                        ].map(([label, value]) => (
                          <div
                            key={label}
                            className="grid grid-cols-[125px_minmax(0,1fr)] border-b border-[var(--line)] px-3 py-2.5 last:border-b-0"
                          >
                            <span className="text-xs font-semibold text-[var(--muted)]">{label}</span>
                            <span className="text-xs font-semibold text-[var(--ink)]">{value}</span>
                          </div>
                        ))}
                      </div>

                      <div className="mt-4 space-y-2">
                        {(['inReview', 'closed', 'mrosReview'] as const).map((decision) => (
                          <button
                            key={decision}
                            type="button"
                            data-tour={
                              decision === 'inReview'
                                ? acceptOptionTourId
                                : decision === 'closed'
                                  ? rejectOptionTourId
                                  : undefined
                            }
                            onClick={(event) => {
                              event.stopPropagation()
                              onSetDecision(decision)
                            }}
                            className="flex w-full items-center justify-between rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-left transition hover:border-[var(--line-strong)] hover:bg-[var(--surface-strong)]"
                          >
                            <span>
                              <span className="block text-xs font-semibold text-[var(--ink)]">
                                {processedAlertMeta[decision].actionLabel}
                              </span>
                              <span className="mt-0.5 block text-[11px] text-[var(--muted)]">
                                {decision === 'inReview'
                                  ? 'Open an analyst review record.'
                                  : decision === 'closed'
                                    ? 'Close as explained or not suspicious.'
                                    : 'Escalate for Swiss reporting review.'}
                              </span>
                            </span>
                            <span className={`figure-text rounded-md px-2 py-1 text-[10px] font-semibold ${processedAlertMeta[decision].badgeTone}`}>
                              {processedAlertMeta[decision].label}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>,
                    document.body,
                  )
                : null}
            </div>
          ) : null}
        </div>
      </div>
      <p className="mt-3 text-sm text-[var(--muted)]">Amount: {alert.amountLabel}</p>
    </div>
  )
}

export default AlertQueueCard
