import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

export type TutorialTopic =
  | 'shap-importance'
  | 'accuracy'
  | 'precision'
  | 'recall'
  | 'f1-score'
  | 'confusion-matrix'
  | 'numerical-shap'
  | 'roc-curve'
  | 'shap-waterfall'

type MathFraction = {
  kind:
    | 'shap-importance'
    | 'accuracy'
    | 'precision'
    | 'recall'
    | 'f1-score'
    | 'auc'
    | 'shap-waterfall'
  detail: string
}

type TutorialContent = {
  title: string
  question: string
  interpretation: string
  visual?: TutorialVisual
  formula?: MathFraction
  calculation?: string
  caution: string
}

type TutorialVisual =
  | { kind: 'importance' }
  | { kind: 'confusion'; focus: 'accuracy' | 'precision' | 'recall' | 'f1-score' | 'matrix' }
  | { kind: 'beeswarm' }
  | { kind: 'roc' }
  | { kind: 'waterfall' }

const tutorialContent: Record<TutorialTopic, TutorialContent> = {
  'shap-importance': {
    title: 'SHAP feature importance',
    question: 'Which fields move the alert scores the most?',
    interpretation:
      'Use this as a global ranking of drivers across the visible records. Longer bars mean the feature usually has a stronger effect on the model output; direction is intentionally removed.',
    visual: { kind: 'importance' },
    formula: {
      kind: 'shap-importance',
      detail:
        'Average absolute contribution for feature j across the visible transactions.',
    },
    calculation:
      'For every visible transaction, take the absolute SHAP contribution of the feature, then average those magnitudes.',
    caution:
      'Do not use this plot to say whether a feature increases or decreases risk. For direction on one alert, use the SHAP waterfall.',
  },
  accuracy: {
    title: 'Accuracy',
    question: 'How often is the model correct overall?',
    interpretation:
      'Accuracy is the share of evaluated transactions where the predicted class matches the known label.',
    visual: { kind: 'confusion', focus: 'accuracy' },
    formula: {
      kind: 'accuracy',
      detail:
        'TP and TN are correct predictions; N is every evaluated transaction.',
    },
    calculation:
      'Count correct alerts and correct non-alerts, then divide by all evaluated transactions.',
    caution:
      'AML data is imbalanced, so high accuracy can coexist with weak detection of positives. Read it with recall and precision.',
  },
  precision: {
    title: 'Precision',
    question: 'Of the alerts raised, how many are real positives?',
    interpretation:
      'Precision estimates alert quality from the analyst queue perspective: high precision means fewer unnecessary reviews.',
    visual: { kind: 'confusion', focus: 'precision' },
    formula: {
      kind: 'precision',
      detail:
        'TP is a correct alert; FP is an alert that was actually negative.',
    },
    calculation:
      'Divide correct alerts by all predicted alerts, including false positives.',
    caution:
      'Precision does not measure missed suspicious transactions. A precise model can still let many positives escape.',
  },
  recall: {
    title: 'Recall',
    question: 'Of all known positives, how many did the model catch?',
    interpretation:
      'Recall measures coverage of suspicious activity. In an alerting workflow, low recall means many known positives never reach the queue.',
    visual: { kind: 'confusion', focus: 'recall' },
    formula: {
      kind: 'recall',
      detail:
        'FN is a known positive transaction that was not flagged.',
    },
    calculation:
      'Divide correct alerts by all known positives, including false negatives.',
    caution:
      'Improving recall often increases false positives. Use precision to understand the operational cost.',
  },
  'f1-score': {
    title: 'F1 score',
    question: 'How balanced are precision and recall?',
    interpretation:
      'F1 is a compact balance score. It drops when either precision or recall is weak, so it is useful for comparing model settings.',
    visual: { kind: 'confusion', focus: 'f1-score' },
    formula: {
      kind: 'f1-score',
      detail:
        'P is precision and R is recall; the harmonic mean penalizes imbalance.',
    },
    calculation:
      'Take the harmonic mean of precision and recall rather than a simple average.',
    caution:
      'F1 hides which side of the trade-off is failing. Inspect precision and recall before changing thresholds.',
  },
  'confusion-matrix': {
    title: 'Confusion matrix',
    question: 'Where do the evaluation metrics come from?',
    interpretation:
      'The matrix is the audit table behind accuracy, precision, recall, and F1. It separates correct alerts, false alerts, missed positives, and correct non-alerts.',
    visual: { kind: 'confusion', focus: 'matrix' },
    calculation:
      'Each evaluated transaction is assigned to one cell by comparing the model decision with the known label.',
    caution:
      'If a metric looks surprising, inspect the counts first. Ratios can hide whether the problem is missed positives or excess alerts.',
  },
  'numerical-shap': {
    title: 'Numerical SHAP beeswarm',
    question: 'How do numerical values push predictions?',
    interpretation:
      'Each dot is one transaction-feature pair. Position shows the SHAP effect; color shows whether the original feature value is low or high.',
    visual: { kind: 'beeswarm' },
    calculation:
      'For each visible numerical feature, the plot places every sampled transaction at its SHAP value and vertically jitters overlapping points.',
    caution:
      'This is a distribution view, not a case explanation. Use the waterfall to explain one selected transaction.',
  },
  'roc-curve': {
    title: 'ROC curve',
    question: 'How well does the model rank positives above negatives?',
    interpretation:
      'ROC shows the ranking quality before committing to one alert threshold. Better curves rise quickly toward the top-left.',
    visual: { kind: 'roc' },
    formula: {
      kind: 'auc',
      detail:
        'AUC is the area under the ROC curve; it summarizes ranking quality across thresholds.',
    },
    calculation:
      'Sweep the decision threshold and compute true-positive rate against false-positive rate at each point.',
    caution:
      'ROC does not tell you queue volume. Use precision, recall, and the confusion matrix to judge the chosen operating point.',
  },
  'shap-waterfall': {
    title: 'SHAP waterfall',
    question: 'Why did this transaction receive its score?',
    interpretation:
      'The waterfall is a local explanation for the selected alert. It starts at the baseline output and adds feature contributions until it reaches the final score.',
    visual: { kind: 'waterfall' },
    formula: {
      kind: 'shap-waterfall',
      detail:
        'Final score equals the baseline plus this transaction’s selected feature contributions.',
    },
    calculation:
      'For the selected transaction, add each displayed SHAP contribution to the baseline model output.',
    caution:
      'This is not a global ranking. A feature can dominate one alert while being less important across the full sample.',
  },
}

const formulaTex: Record<MathFraction['kind'], string> = {
  'shap-importance': String.raw`\operatorname{Importance}_j=\frac{1}{N}\sum_{i=1}^{N}\left|\text{SHAP}_{i,j}\right|`,
  accuracy: String.raw`\operatorname{Accuracy}=\frac{TP+TN}{N}`,
  precision: String.raw`\operatorname{Precision}=\frac{TP}{TP+FP}`,
  recall: String.raw`\operatorname{Recall}=\frac{TP}{TP+FN}`,
  'f1-score': String.raw`F_1=\frac{2PR}{P+R}`,
  auc: String.raw`\operatorname{AUC}=\int_0^1 \text{TPR}(\text{FPR})\,d\text{FPR}`,
  'shap-waterfall': String.raw`f(x)=\operatorname{base}+\sum_{j=1}^{M}\text{SHAP}_j`,
}

function FormulaBlock({ formula }: { formula: MathFraction }) {
  const renderedFormula = useMemo(
    () =>
      katex.renderToString(formulaTex[formula.kind], {
        displayMode: true,
        throwOnError: false,
        strict: 'ignore',
      }),
    [formula.kind],
  )

  return (
    <span className="block rounded-md border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2.5 text-xs text-[var(--ink)]">
      <span
        className="tutorial-formula block min-h-8 overflow-x-auto text-[14px] font-semibold leading-none text-[var(--ink)]"
        dangerouslySetInnerHTML={{ __html: renderedFormula }}
      />
      <span className="mt-1.5 block leading-5 text-[var(--muted)]">{formula.detail}</span>
    </span>
  )
}

function TutorialSection({ label, children }: { label: string; children: string }) {
  return (
    <span className="block">
      <span className="block text-[11px] font-semibold text-[var(--ink-soft)]">{label}</span>
      <span className="mt-1 block text-xs leading-5 text-[var(--muted)]">{children}</span>
    </span>
  )
}

function MiniImportanceVisual() {
  const rows = [
    { label: 'Payment format', width: 170 },
    { label: 'From bank', width: 96 },
    { label: 'Amount paid', width: 54 },
  ]

  return (
    <span className="block rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
      <svg aria-hidden="true" className="block h-[86px] w-full" viewBox="0 0 360 86">
        {rows.map((row, index) => (
          <g key={row.label} transform={`translate(0 ${index * 25})`}>
            <text x="0" y="14" fill="var(--ink)" fontSize="11" fontWeight="600">
              {row.label}
            </text>
            <rect x="126" y="4" width="184" height="10" rx="3" fill="var(--surface-strong)" />
            <rect x="126" y="4" width={row.width} height="10" rx="3" fill="var(--line-strong)" />
          </g>
        ))}
      </svg>
      <span className="block text-xs leading-5 text-[var(--muted)]">
        Bar length compares average impact. It does not show whether the feature raises or lowers risk.
      </span>
    </span>
  )
}

function MiniConfusionVisual({ focus }: { focus: Extract<TutorialVisual, { kind: 'confusion' }>['focus'] }) {
  const activeCells: Record<typeof focus, string[]> = {
    accuracy: ['tp', 'tn'],
    precision: ['tp', 'fp'],
    recall: ['tp', 'fn'],
    'f1-score': ['tp', 'fp', 'fn'],
    matrix: ['tp', 'fp', 'fn', 'tn'],
  }
  const cells = [
    { id: 'tp', label: 'TP', detail: 'correct alerts', x: 0, y: 0 },
    { id: 'fp', label: 'FP', detail: 'false alerts', x: 1, y: 0 },
    { id: 'fn', label: 'FN', detail: 'missed positives', x: 0, y: 1 },
    { id: 'tn', label: 'TN', detail: 'correct non-alerts', x: 1, y: 1 },
  ]
  const captions: Record<typeof focus, string> = {
    accuracy: 'Accuracy uses both correct cells: true positives and true negatives.',
    precision: 'Precision reads the alert column: correct alerts over all raised alerts.',
    recall: 'Recall reads the positive cases: caught positives over caught plus missed positives.',
    'f1-score': 'F1 balances precision and recall, so it depends on TP, FP, and FN.',
    matrix: 'Each transaction lands in exactly one cell after prediction is compared with the known label.',
  }

  return (
    <span className="block rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
      <svg aria-hidden="true" className="block h-[112px] w-full" viewBox="0 0 360 112">
        <text x="86" y="12" fill="var(--muted)" fontSize="10" fontWeight="600">
          Predicted alert
        </text>
        <text x="224" y="12" fill="var(--muted)" fontSize="10" fontWeight="600">
          Predicted clear
        </text>
        <text x="0" y="46" fill="var(--muted)" fontSize="10" fontWeight="600">
          Known positive
        </text>
        <text x="0" y="91" fill="var(--muted)" fontSize="10" fontWeight="600">
          Known negative
        </text>
        {cells.map((cell) => {
          const isActive = activeCells[focus].includes(cell.id)
          const x = 96 + cell.x * 124
          const y = 24 + cell.y * 43

          return (
            <g key={cell.id}>
              <rect
                x={x}
                y={y}
                width="112"
                height="34"
                rx="5"
                fill={isActive ? 'var(--accent-soft)' : 'var(--surface-strong)'}
                stroke={isActive ? 'var(--accent)' : 'var(--line)'}
              />
              <text x={x + 10} y={y + 15} fill="var(--ink)" fontSize="12" fontWeight="700">
                {cell.label}
              </text>
              <text x={x + 10} y={y + 27} fill="var(--muted)" fontSize="9">
                {cell.detail}
              </text>
            </g>
          )
        })}
      </svg>
      <span className="block text-xs leading-5 text-[var(--muted)]">{captions[focus]}</span>
    </span>
  )
}

function MiniBeeswarmVisual() {
  const dots: Array<[number, number, string]> = [
    [110, 29, 'var(--shap-low)'],
    [126, 22, 'var(--shap-low)'],
    [136, 33, 'var(--shap-low)'],
    [153, 27, 'var(--shap-low)'],
    [172, 31, 'var(--shap-high)'],
    [186, 24, 'var(--shap-high)'],
    [198, 35, 'var(--shap-high)'],
    [220, 28, 'var(--shap-high)'],
  ]

  return (
    <span className="block rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
      <svg aria-hidden="true" className="block h-[78px] w-full" viewBox="0 0 360 78">
        <line x1="50" y1="42" x2="310" y2="42" stroke="var(--line)" />
        <line x1="180" y1="17" x2="180" y2="51" stroke="var(--line-strong)" />
        <text x="47" y="66" fill="var(--muted)" fontSize="10">
          lowers output
        </text>
        <text x="235" y="66" fill="var(--muted)" fontSize="10">
          raises output
        </text>
        {dots.map(([x, y, fill], index) => (
          <circle key={`${x}-${y}-${index}`} cx={x} cy={y} r="3.4" fill={fill} opacity="0.9" />
        ))}
        <text x="264" y="20" fill="var(--muted)" fontSize="10">
          high value
        </text>
        <circle cx="254" cy="17" r="3.2" fill="var(--shap-high)" />
        <text x="264" y="34" fill="var(--muted)" fontSize="10">
          low value
        </text>
        <circle cx="254" cy="31" r="3.2" fill="var(--shap-low)" />
      </svg>
      <span className="block text-xs leading-5 text-[var(--muted)]">
        Position shows effect direction; color shows whether the underlying value is low or high.
      </span>
    </span>
  )
}

function MiniRocVisual() {
  return (
    <span className="block rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
      <svg aria-hidden="true" className="block h-[100px] w-full" viewBox="0 0 360 100">
        <line x1="44" y1="76" x2="316" y2="76" stroke="var(--line-strong)" />
        <line x1="44" y1="12" x2="44" y2="76" stroke="var(--line-strong)" />
        <line x1="44" y1="76" x2="316" y2="12" stroke="var(--line)" strokeDasharray="4 4" />
        <polyline
          points="44,76 53,43 70,29 94,20 124,15 168,13 316,12"
          fill="none"
          stroke="var(--chart-bar)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <text x="48" y="10" fill="var(--muted)" fontSize="10">
          TPR
        </text>
        <text x="294" y="92" fill="var(--muted)" fontSize="10">
          FPR
        </text>
      </svg>
      <span className="block text-xs leading-5 text-[var(--muted)]">
        The useful curve rises above the diagonal baseline. Closer to the top-left means better ranking.
      </span>
    </span>
  )
}

function MiniWaterfallVisual() {
  const rows = [
    { label: 'Payment Format', value: '+2.619', x: 84, y: 11, width: 176, color: 'var(--shap-positive)', positive: true },
    { label: 'Amount Paid', value: '+0.769', x: 260, y: 35, width: 56, color: 'var(--shap-positive)', positive: true },
    { label: 'From Bank', value: '-0.392', x: 226, y: 59, width: 34, color: 'var(--shap-negative)', positive: false },
  ]

  return (
    <span className="block rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
      <svg aria-hidden="true" className="block h-[102px] w-full" viewBox="0 0 360 102">
        <line x1="84" y1="6" x2="84" y2="91" stroke="var(--line-strong)" />
        {rows.map((row) => (
          <g key={row.label}>
            <line x1="84" y1={row.y + 9} x2="322" y2={row.y + 9} stroke="var(--line)" strokeDasharray="2 4" />
            <text x="0" y={row.y + 12} fill="var(--ink)" fontSize="10" fontWeight="600">
              {row.label}
            </text>
            <path
              d={
                row.positive
                  ? `M ${row.x} ${row.y} H ${row.x + row.width - 8} L ${row.x + row.width} ${row.y + 9} L ${row.x + row.width - 8} ${row.y + 18} H ${row.x} Z`
                  : `M ${row.x + row.width} ${row.y} H ${row.x + 8} L ${row.x} ${row.y + 9} L ${row.x + 8} ${row.y + 18} H ${row.x + row.width} Z`
              }
              fill={row.color}
            />
            <text x="326" y={row.y + 12} fill="var(--ink-soft)" fontSize="10" fontWeight="600">
              {row.value}
            </text>
          </g>
        ))}
        <text x="88" y="100" fill="var(--muted)" fontSize="10">
          baseline
        </text>
        <text x="247" y="100" fill="var(--muted)" fontSize="10">
          cumulative score
        </text>
      </svg>
      <span className="block text-xs leading-5 text-[var(--muted)]">
        Each row adds or subtracts from the running score. Bar length is the local contribution size.
      </span>
    </span>
  )
}

function TutorialVisualBlock({ visual }: { visual: TutorialVisual }) {
  if (visual.kind === 'importance') {
    return <MiniImportanceVisual />
  }

  if (visual.kind === 'confusion') {
    return <MiniConfusionVisual focus={visual.focus} />
  }

  if (visual.kind === 'beeswarm') {
    return <MiniBeeswarmVisual />
  }

  if (visual.kind === 'roc') {
    return <MiniRocVisual />
  }

  return <MiniWaterfallVisual />
}

function TutorialInfo({ topic, placement = 'down' }: { topic: TutorialTopic; placement?: 'up' | 'down' }) {
  const content = tutorialContent[topic]
  const [isOpen, setIsOpen] = useState(false)
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({
    position: 'fixed',
    right: 16,
    top: 48,
  })
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const popoverRef = useRef<HTMLSpanElement | null>(null)
  const closeTimerRef = useRef<number | null>(null)

  const updatePopoverPosition = useCallback(() => {
    const button = buttonRef.current

    if (!button) {
      return
    }

    const margin = 16
    const gap = 8
    const rect = button.getBoundingClientRect()
    const panel = popoverRef.current
    const panelWidth = Math.min(448, Math.max(300, window.innerWidth - margin * 2))
    const panelHeight = Math.min(panel?.scrollHeight ?? 560, window.innerHeight - margin * 2)
    const maxRight = Math.max(margin, window.innerWidth - panelWidth - margin)
    const right = Math.min(Math.max(margin, window.innerWidth - rect.right), maxRight)
    const spaceAbove = rect.top - margin - gap
    const spaceBelow = window.innerHeight - rect.bottom - margin - gap
    let openUp = placement === 'up'

    if (openUp && spaceAbove < panelHeight && spaceBelow > spaceAbove) {
      openUp = false
    }

    if (!openUp && spaceBelow < panelHeight && spaceAbove > spaceBelow) {
      openUp = true
    }

    const preferredTop = openUp ? rect.top - panelHeight - gap : rect.bottom + gap
    const top = Math.min(
      Math.max(margin, preferredTop),
      Math.max(margin, window.innerHeight - panelHeight - margin),
    )

    setPopoverStyle({
      position: 'fixed',
      right,
      top,
      width: panelWidth,
      maxHeight: window.innerHeight - margin * 2,
    })
  }, [placement])

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const openTutorial = useCallback(() => {
    clearCloseTimer()
    updatePopoverPosition()
    setIsOpen(true)
  }, [clearCloseTimer, updatePopoverPosition])

  const scheduleClose = useCallback(() => {
    clearCloseTimer()
    closeTimerRef.current = window.setTimeout(() => {
      setIsOpen(false)
      closeTimerRef.current = null
    }, 240)
  }, [clearCloseTimer])

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    updatePopoverPosition()
    window.addEventListener('resize', updatePopoverPosition)
    window.addEventListener('scroll', updatePopoverPosition, true)

    return () => {
      window.removeEventListener('resize', updatePopoverPosition)
      window.removeEventListener('scroll', updatePopoverPosition, true)
    }
  }, [isOpen, updatePopoverPosition])

  useEffect(() => clearCloseTimer, [clearCloseTimer])

  useLayoutEffect(() => {
    if (isOpen) {
      updatePopoverPosition()
    }
  }, [isOpen, updatePopoverPosition])

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={openTutorial}
      onMouseLeave={scheduleClose}
      onFocus={openTutorial}
      onBlur={scheduleClose}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Show explanation: ${content.title}`}
        aria-expanded={isOpen}
        onClick={(event) => event.preventDefault()}
        className="relative grid h-5 w-5 place-items-center rounded-full border border-[var(--line)] bg-[var(--surface-strong)] p-0 text-[var(--muted)] transition hover:border-[var(--line-strong)] hover:text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        <span aria-hidden="true" className="absolute left-1/2 top-[4px] h-[3px] w-[3px] -translate-x-1/2 rounded-full bg-current" />
        <span aria-hidden="true" className="absolute left-1/2 top-[8px] h-[7px] w-[2px] -translate-x-1/2 rounded-full bg-current" />
      </button>

      <span
        ref={popoverRef}
        role="dialog"
        aria-label={content.title}
        onMouseEnter={openTutorial}
        onMouseLeave={scheduleClose}
        style={popoverStyle}
        className={`pointer-events-auto z-40 overflow-visible rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] p-4 text-left text-sm text-[var(--ink)] shadow-[0_10px_24px_rgba(24,34,29,0.16)] transition ${isOpen ? 'visible opacity-100' : 'invisible opacity-0'}`}
      >
        <span className="block text-sm font-semibold text-[var(--ink)]">{content.title}</span>
        <span className="mt-1 block text-[13px] font-medium leading-5 text-[var(--ink-soft)]">{content.question}</span>
        <span className="mt-3 block space-y-2.5">
          <span className="block text-xs leading-5 text-[var(--muted)]">{content.interpretation}</span>
          {content.visual ? <TutorialVisualBlock visual={content.visual} /> : null}
          {content.formula ? <FormulaBlock formula={content.formula} /> : null}
          {content.calculation ? <TutorialSection label="Calculation">{content.calculation}</TutorialSection> : null}
          <TutorialSection label="Caution">{content.caution}</TutorialSection>
        </span>
      </span>
    </span>
  )
}

export default TutorialInfo
