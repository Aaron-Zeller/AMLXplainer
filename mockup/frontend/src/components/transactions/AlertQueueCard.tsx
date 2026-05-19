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
  actionButtonLabel = 'Process',
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

  useEffect(() => {
    if (!actionMenuOpen || !actionTriggerRef.current || typeof window === 'undefined') {
      return
    }

    const updatePosition = () => {
      const triggerRect = actionTriggerRef.current?.getBoundingClientRect()
      if (!triggerRect) {
        return
      }

      const menuWidth = 120
      const viewportPadding = 12
      const top = triggerRect.bottom + 8
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
      className={`w-full cursor-pointer select-none rounded-2xl border px-3 py-3 text-left transition duration-200 outline-none focus-visible:ring-2 focus-visible:ring-[var(--line-strong)] ${
        isSelected
          ? 'border-[var(--line-strong)] bg-[var(--surface-strong)] shadow-[0_8px_18px_rgba(15,23,42,0.08)]'
          : 'border-[var(--line)] bg-white/88 hover:border-[var(--line-strong)] hover:bg-white hover:shadow-[0_10px_24px_rgba(15,23,42,0.08)]'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--ink)]">{alert.routeLabel}</p>
          <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[var(--muted)]">{alert.timeLabel}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className={`min-w-[74px] rounded-full px-2.5 py-1 text-center text-[11px] font-semibold ${badgeTone}`}>
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
                className="inline-flex min-w-[74px] cursor-pointer items-center justify-center rounded-full border border-[var(--line)] bg-white px-2.5 py-1 text-[11px] font-semibold text-[var(--muted)] transition hover:border-[var(--line-strong)] hover:bg-[var(--surface-strong)]"
              >
                {actionButtonLabel}
              </button>
              {actionMenuOpen && onSetDecision && actionMenuPosition && typeof document !== 'undefined'
                ? createPortal(
                    <div
                      data-tour={actionMenuTourId}
                      data-alert-action-menu="true"
                      className="fixed z-[120] flex w-[120px] flex-col rounded-2xl border border-[var(--line)] bg-white p-1 shadow-[0_12px_28px_rgba(15,23,42,0.12)]"
                      style={{
                        top: actionMenuPosition.top,
                        left: actionMenuPosition.left,
                      }}
                    >
                      {(['accepted', 'rejected'] as const).map((decision) => (
                        <button
                          key={decision}
                          type="button"
                          data-tour={
                            decision === 'accepted'
                              ? acceptOptionTourId
                              : decision === 'rejected'
                                ? rejectOptionTourId
                                : undefined
                          }
                          onClick={(event) => {
                            event.stopPropagation()
                            onSetDecision(decision)
                          }}
                          className="rounded-xl px-3 py-2 text-left text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-strong)]"
                        >
                          {processedAlertMeta[decision].actionLabel}
                        </button>
                      ))}
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
