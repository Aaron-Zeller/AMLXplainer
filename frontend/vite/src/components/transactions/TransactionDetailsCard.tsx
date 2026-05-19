import {
  formatCompactAmount,
  formatAlertTime,
  scoreTransactionRisk,
  type BackendFeatureRecord,
} from '../../lib/dashboard'

function TransactionDetailsCard({ record }: { record: BackendFeatureRecord | null }) {
  if (!record) {
    return (
      <div className="flex h-full min-w-0 flex-col rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] p-4">
        <p className="text-xs font-semibold text-[var(--muted)]">
          Transaction Details
        </p>
        <h3 className="mt-2 text-lg font-semibold text-[var(--ink)]">Selected Alert</h3>
        <p className="mt-4 text-sm text-[var(--muted)]">Choose an alert to inspect its transaction details.</p>
      </div>
    )
  }

  const rows = [
    ['Timestamp', formatAlertTime(record.timestamp)],
    ['From Bank', record.fromBank],
    ['From Account', record.fromAccount],
    ['From Country', record.fromCountry],
    ['To Bank', record.toBank],
    ['To Account', record.toAccount],
    ['To Country', record.toCountry],
    ['Amount Paid', formatCompactAmount(record.amountPaid, record.paymentCurrency)],
    ['Amount Received', formatCompactAmount(record.amountReceived, record.receivingCurrency)],
    ['Payment Format', record.paymentFormat],
  ]

  return (
    <div className="flex h-full min-w-0 flex-col rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-[var(--muted)]">
            Transaction Details
          </p>
          <h3 className="mt-2 text-lg font-semibold text-[var(--ink)]">Selected Alert</h3>
        </div>
        <span className="figure-text rounded-md bg-[var(--surface-strong)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
          {(scoreTransactionRisk(record) * 100).toFixed(1)}% confidence
        </span>
      </div>

      <div className="mt-4 grid border-t border-[var(--line)] sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="border-b border-[var(--line)] px-1 py-3 sm:odd:pr-4 sm:even:border-l sm:even:pl-4">
            <p className="text-[11px] font-semibold text-[var(--muted)]">{label}</p>
            <p className="figure-text mt-1 text-sm font-semibold leading-5 text-[var(--ink)]">{value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default TransactionDetailsCard
