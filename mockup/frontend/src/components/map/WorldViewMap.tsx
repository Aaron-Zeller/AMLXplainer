import { geoGraticule, geoNaturalEarth1, geoPath } from 'd3-geo'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import { createPortal } from 'react-dom'
import { type RefObject, useEffect, useRef, useState } from 'react'
import { feature } from 'topojson-client'

import { CloseIcon, ExpandIcon, LayersIcon } from '../common/icons'
import {
  alertMatchesSearch,
  type AlertPreview,
  type AlertSeverity,
  type BackendFeatureRecord,
  countryCoordinates,
  formatAlertTime,
  formatCompactAmount,
  formatCompactNumber,
  getAlertSeverity,
  hashText,
  type MapTooltip,
  scoreTransactionRisk,
  type SafariGestureEvent,
  type SelectedRoutePanel,
  severityMeta,
  type WorldAtlasTopology,
} from '../../lib/dashboard'

const MAP_VIEWBOX_WIDTH = 560
const MAP_VIEWBOX_HEIGHT = 300

type Viewport = {
  scale: number
  x: number
  y: number
}

const clampViewport = (x: number, y: number, scale: number): Viewport => {
  const minX = MAP_VIEWBOX_WIDTH * (1 - scale)
  const minY = MAP_VIEWBOX_HEIGHT * (1 - scale)

  return {
    x: Math.min(0, Math.max(minX, x)),
    y: Math.min(0, Math.max(minY, y)),
    scale,
  }
}

const zoomToViewportPoint = (
  pointerX: number,
  pointerY: number,
  nextScale: number,
  baseViewport: Viewport,
): Viewport => {
  const clampedScale = Math.max(1, Math.min(5, Number(nextScale.toFixed(3))))
  const worldX = (pointerX - baseViewport.x) / baseViewport.scale
  const worldY = (pointerY - baseViewport.y) / baseViewport.scale
  const nextX = pointerX - worldX * clampedScale
  const nextY = pointerY - worldY * clampedScale

  return clampViewport(nextX, nextY, clampedScale)
}

function WorldViewMap({
  record,
  alerts,
  allRecords,
  selectedAlertId,
  tourFullscreenFocus,
}: {
  record: BackendFeatureRecord | null
  alerts: AlertPreview[]
  allRecords: BackendFeatureRecord[]
  selectedAlertId: string | null
  tourFullscreenFocus: 'edge' | 'node' | null
}) {
  const records = record ? [record] : []
  const [topology, setTopology] = useState<WorldAtlasTopology | null>(null)
  const [tooltip, setTooltip] = useState<MapTooltip | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isFullscreenAlertMenuOpen, setIsFullscreenAlertMenuOpen] = useState(false)
  const [fullscreenAlertSearchQuery, setFullscreenAlertSearchQuery] = useState('')
  const [expandedFullscreenAlertSeverities, setExpandedFullscreenAlertSeverities] = useState<
    AlertSeverity[]
  >([])
  const [fullscreenSelectedAlertIds, setFullscreenSelectedAlertIds] = useState<string[]>([])
  const [fullscreenSelectedAccounts, setFullscreenSelectedAccounts] = useState<string[]>([])
  const [fullscreenSelectedBanks, setFullscreenSelectedBanks] = useState<string[]>([])
  const [fullscreenSelectedCountries, setFullscreenSelectedCountries] = useState<string[]>([])
  const [selectedRoutePanels, setSelectedRoutePanels] = useState<{
    light: SelectedRoutePanel | null
    dark: SelectedRoutePanel | null
  }>({
    light: null,
    dark: null,
  })
  const [mapViewport, setMapViewport] = useState({
    light: { scale: 1, x: 0, y: 0 },
    dark: { scale: 1, x: 0, y: 0 },
  })
  const [draggingMode, setDraggingMode] = useState<'light' | 'dark' | null>(null)
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const fullscreenMapContainerRef = useRef<HTMLDivElement | null>(null)
  const dragStateRef = useRef<{
    mode: 'light' | 'dark'
    pointerId: number
    lastX: number
    lastY: number
  } | null>(null)
  const activePointersRef = useRef<
    Record<
      number,
      {
        pointerId: number
        mode: 'light' | 'dark'
        pointerType: string
        clientX: number
        clientY: number
      }
    >
  >({})
  const pinchStateRef = useRef<{
    mode: 'light' | 'dark'
    initialDistance: number
    initialScale: number
    initialWorldX: number
    initialWorldY: number
  } | null>(null)
  const safariGestureStateRef = useRef<{
    mode: 'light' | 'dark'
    initialScale: number
    initialWorldX: number
    initialWorldY: number
  } | null>(null)
  const mapViewportRef = useRef(mapViewport)

  useEffect(() => {
    mapViewportRef.current = mapViewport
  }, [mapViewport])

  useEffect(() => {
    let isCancelled = false

    void fetch('/world-countries.json')
      .then((response) => response.json())
      .then((data: WorldAtlasTopology) => {
        if (!isCancelled) {
          setTopology(data)
        }
      })

    return () => {
      isCancelled = true
    }
  }, [])

  useEffect(() => {
    if (!isFullscreen) {
      return
    }

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsFullscreen(false)
      }
    }

    window.addEventListener('keydown', handleEscape)

    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', handleEscape)
    }
  }, [isFullscreen])

  const toggleFullscreenSeverity = (severity: AlertSeverity) => {
    setExpandedFullscreenAlertSeverities((currentSeverities) =>
      currentSeverities.includes(severity)
        ? currentSeverities.filter((currentSeverity) => currentSeverity !== severity)
        : [...currentSeverities, severity],
    )
  }

  const toggleFullscreenAlertSelection = (alertId: string) => {
    setFullscreenSelectedAlertIds((currentIds) =>
      currentIds.includes(alertId)
        ? currentIds.filter((currentId) => currentId !== alertId)
        : [...currentIds, alertId],
    )
  }

  const toggleFullscreenAccountSelection = (accountId: string) => {
    setFullscreenSelectedAccounts((currentAccounts) =>
      currentAccounts.includes(accountId)
        ? currentAccounts.filter((currentAccount) => currentAccount !== accountId)
        : [...currentAccounts, accountId],
    )
  }

  const toggleFullscreenBankSelection = (bankName: string) => {
    setFullscreenSelectedBanks((currentBanks) =>
      currentBanks.includes(bankName)
        ? currentBanks.filter((currentBank) => currentBank !== bankName)
        : [...currentBanks, bankName],
    )
  }

  const toggleFullscreenCountrySelection = (countryCode: string) => {
    setFullscreenSelectedCountries((currentCountries) =>
      currentCountries.includes(countryCode)
        ? currentCountries.filter((currentCountry) => currentCountry !== countryCode)
        : [...currentCountries, countryCode],
    )
  }

  const updateViewport = (
    mode: 'light' | 'dark',
    updater: (current: Viewport) => Viewport,
  ) => {
    setMapViewport((current) => ({
      ...current,
      [mode]: updater(current[mode]),
    }))
  }

  const resetViewport = (mode: 'light' | 'dark') => {
    setTooltip(null)
    setMapViewport((current) => ({
      ...current,
      [mode]: { scale: 1, x: 0, y: 0 },
    }))
  }

  const setSelectedRoutePanel = (mode: 'light' | 'dark', panel: SelectedRoutePanel | null) => {
    setSelectedRoutePanels((current) => ({
      ...current,
      [mode]: panel,
    }))
  }

  const openFullscreenView = () => {
    setTooltip(null)
    setFullscreenSelectedAlertIds(selectedAlertId ? [selectedAlertId] : [])
    setFullscreenSelectedAccounts([])
    setFullscreenSelectedBanks([])
    setFullscreenSelectedCountries([])
    setSelectedRoutePanels((current) => ({
      ...current,
      dark: null,
    }))
    setIsFullscreenAlertMenuOpen(false)
    setFullscreenAlertSearchQuery('')
    setExpandedFullscreenAlertSeverities([])
    setIsFullscreen(true)
  }

  const closeFullscreenView = () => {
    setTooltip(null)
    setIsFullscreen(false)
  }

  const getTouchPointersForMode = (mode: 'light' | 'dark') =>
    Object.values(activePointersRef.current).filter(
      (pointer) => pointer.mode === mode && pointer.pointerType === 'touch',
    )

  const beginPinchGesture = (
    mode: 'light' | 'dark',
    containerRef: RefObject<HTMLDivElement | null>,
  ) => {
    const touchPointers = getTouchPointersForMode(mode)
    if (touchPointers.length < 2) {
      return
    }

    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) {
      return
    }

    const [firstPointer, secondPointer] = touchPointers
    const midpointClientX = (firstPointer.clientX + secondPointer.clientX) / 2
    const midpointClientY = (firstPointer.clientY + secondPointer.clientY) / 2
    const pointerX = ((midpointClientX - rect.left) / rect.width) * MAP_VIEWBOX_WIDTH
    const pointerY = ((midpointClientY - rect.top) / rect.height) * MAP_VIEWBOX_HEIGHT
    const initialDistance = Math.hypot(
      secondPointer.clientX - firstPointer.clientX,
      secondPointer.clientY - firstPointer.clientY,
    )

    if (initialDistance <= 0) {
      return
    }

    pinchStateRef.current = {
      mode,
      initialDistance,
      initialScale: mapViewport[mode].scale,
      initialWorldX: (pointerX - mapViewport[mode].x) / mapViewport[mode].scale,
      initialWorldY: (pointerY - mapViewport[mode].y) / mapViewport[mode].scale,
    }
  }

  useEffect(() => {
    const bindSafariGestures = (
      mode: 'light' | 'dark',
      containerRef: RefObject<HTMLDivElement | null>,
    ) => {
      const element = containerRef.current
      if (!element) {
        return () => {}
      }

      const getPointerPosition = (event: SafariGestureEvent) => {
        const rect = element.getBoundingClientRect()
        const clientX = typeof event.clientX === 'number' ? event.clientX : rect.left + rect.width / 2
        const clientY = typeof event.clientY === 'number' ? event.clientY : rect.top + rect.height / 2

        return {
          x: ((clientX - rect.left) / rect.width) * MAP_VIEWBOX_WIDTH,
          y: ((clientY - rect.top) / rect.height) * MAP_VIEWBOX_HEIGHT,
        }
      }

      const handleGestureStart = (event: Event) => {
        const gestureEvent = event as SafariGestureEvent
        event.preventDefault()
        setTooltip(null)

        const pointer = getPointerPosition(gestureEvent)
        const currentViewport = mapViewportRef.current[mode]

        safariGestureStateRef.current = {
          mode,
          initialScale: currentViewport.scale,
          initialWorldX: (pointer.x - currentViewport.x) / currentViewport.scale,
          initialWorldY: (pointer.y - currentViewport.y) / currentViewport.scale,
        }
      }

      const handleGestureChange = (event: Event) => {
        const gestureEvent = event as SafariGestureEvent
        const gestureState = safariGestureStateRef.current
        if (!gestureState || gestureState.mode !== mode) {
          return
        }

        event.preventDefault()
        const pointer = getPointerPosition(gestureEvent)
        const nextScale = gestureState.initialScale * gestureEvent.scale

        updateViewport(mode, () =>
          zoomToViewportPoint(
            pointer.x,
            pointer.y,
            nextScale,
            {
              scale: gestureState.initialScale,
              x: pointer.x - gestureState.initialWorldX * gestureState.initialScale,
              y: pointer.y - gestureState.initialWorldY * gestureState.initialScale,
            },
          ),
        )
      }

      const handleGestureEnd = (event: Event) => {
        event.preventDefault()
        safariGestureStateRef.current = null
      }

      element.addEventListener('gesturestart', handleGestureStart, { passive: false })
      element.addEventListener('gesturechange', handleGestureChange, { passive: false })
      element.addEventListener('gestureend', handleGestureEnd, { passive: false })

      return () => {
        element.removeEventListener('gesturestart', handleGestureStart)
        element.removeEventListener('gesturechange', handleGestureChange)
        element.removeEventListener('gestureend', handleGestureEnd)
      }
    }

    const cleanupLight = bindSafariGestures('light', mapContainerRef)
    const cleanupDark = bindSafariGestures('dark', fullscreenMapContainerRef)

    return () => {
      cleanupLight()
      cleanupDark()
    }
  }, [isFullscreen])

  const buildWorldRoutes = (activeRecords: BackendFeatureRecord[], mode: 'light' | 'dark') => {
    const routes = Object.values(
      activeRecords.reduce<
      Record<
        string,
        {
          routeKey: string
          pairKey: string
          duplicateIndex: number
          duplicateCount: number
          fromCountry: string
          toCountry: string
          count: number
          totalAmount: number
          sampleRecord: BackendFeatureRecord
          maxScore: number
          severity: AlertSeverity
        }
      >
      >((accumulator, record) => {
        if (!countryCoordinates[record.fromCountry] || !countryCoordinates[record.toCountry]) {
          return accumulator
        }

        const key = `${record.fromCountry}-${record.toCountry}`
        const existing = accumulator[key]
        const recordScore = scoreTransactionRisk(record)

        if (existing) {
          existing.count += 1
          existing.totalAmount += record.amountPaid
          if (recordScore > existing.maxScore) {
            existing.maxScore = recordScore
            existing.sampleRecord = record
            existing.severity = getAlertSeverity(recordScore)
          }
          return accumulator
        }

        accumulator[key] = {
          routeKey: key,
          pairKey: key,
          duplicateIndex: 0,
          duplicateCount: 1,
          fromCountry: record.fromCountry,
          toCountry: record.toCountry,
          count: 1,
          totalAmount: record.amountPaid,
          sampleRecord: record,
          maxScore: recordScore,
          severity: getAlertSeverity(recordScore),
        }

        return accumulator
      }, {}),
    )
      .sort((left, right) =>
        mode === 'dark'
          ? right.count - left.count || right.totalAmount - left.totalAmount
          : right.totalAmount - left.totalAmount,
      )

    return mode === 'dark' ? routes : routes.slice(0, 18)
  }

  const getRouteDistance = (fromCountry: string, toCountry: string) => {
    const from = countryCoordinates[fromCountry]
    const to = countryCoordinates[toCountry]

    if (!from || !to) {
      return 0
    }

    return Math.hypot(to[0] - from[0], to[1] - from[1])
  }

  const buildCountrySummaries = (
    activeRecords: BackendFeatureRecord[],
    worldRoutes: Array<{
      fromCountry: string
      toCountry: string
      count: number
      totalAmount: number
      sampleRecord: BackendFeatureRecord
    }>,
  ) => {
    const visibleCountries = Array.from(
      new Set(worldRoutes.flatMap((route) => [route.fromCountry, route.toCountry])),
    )

    return visibleCountries.map((countryCode) => {
      const countryRecords = activeRecords.filter(
        (record) => record.fromCountry === countryCode || record.toCountry === countryCode,
      )
      const totalAmount = countryRecords.reduce((total, record) => total + record.amountPaid, 0)
      const distinctBanks = Array.from(
        new Set(
          countryRecords.flatMap((record) => [
            record.fromCountry === countryCode ? record.fromBank : '',
            record.toCountry === countryCode ? record.toBank : '',
          ]),
        ),
      ).filter(Boolean)

      return {
        countryCode,
        count: countryRecords.length,
        totalAmount,
        banks: distinctBanks.slice(0, 3),
        latestTimestamp: countryRecords[0]?.timestamp,
        sampleRecord: countryRecords[0] ?? null,
      }
    })
  }

  const countriesFeatureCollection = topology
    ? (feature(
        topology as never,
        (topology.objects as { countries: unknown }).countries as never,
      ) as unknown as FeatureCollection<Geometry>)
    : null
  const landFeature = topology
    ? (feature(
        topology as never,
        (topology.objects as { land: unknown }).land as never,
      ) as unknown as Feature<Geometry>)
    : null
  const projection =
    landFeature != null ? geoNaturalEarth1().fitSize([560, 300], landFeature) : null
  const pathGenerator = projection ? geoPath(projection) : null
  const graticule = projection ? geoGraticule().step([15, 15])() : null
  const projectCountry = (countryCode: string) => {
    if (!projection) {
      return null
    }

    return projection(countryCoordinates[countryCode])
  }
  const filteredFullscreenAlerts = alerts.filter((alert) =>
    alertMatchesSearch(alert, fullscreenAlertSearchQuery),
  )
  const primaryFullscreenAlertId = filteredFullscreenAlerts[0]?.id ?? null
  const secondaryFullscreenAlertId =
    filteredFullscreenAlerts.find((alert) => alert.id !== primaryFullscreenAlertId)?.id ?? null
  const fullscreenAlertGroups = (['high', 'medium', 'low'] as const).map((severity) => ({
    severity,
    alerts: filteredFullscreenAlerts.filter((alert) => alert.severity === severity),
  }))
  const fullscreenAlertRecords = alerts
    .filter((alert) => fullscreenSelectedAlertIds.includes(alert.id))
    .map((alert) => alert.record)
  const hasFullscreenPropertySelections =
    fullscreenSelectedAccounts.length > 0 ||
    fullscreenSelectedBanks.length > 0 ||
    fullscreenSelectedCountries.length > 0
  const fullscreenPropertyFilteredRecords = hasFullscreenPropertySelections
    ? allRecords.filter((candidateRecord) => {
        const matchesAccounts =
          fullscreenSelectedAccounts.length === 0 ||
          fullscreenSelectedAccounts.every(
            (selectedAccount) =>
              candidateRecord.fromAccount === selectedAccount ||
              candidateRecord.toAccount === selectedAccount,
          )
        const matchesBanks =
          fullscreenSelectedBanks.length === 0 ||
          fullscreenSelectedBanks.every(
            (selectedBank) =>
              candidateRecord.fromBank === selectedBank || candidateRecord.toBank === selectedBank,
          )
        const matchesCountries =
          fullscreenSelectedCountries.length === 0 ||
          fullscreenSelectedCountries.every(
            (selectedCountry) =>
              candidateRecord.fromCountry === selectedCountry ||
              candidateRecord.toCountry === selectedCountry,
          )

        return matchesAccounts && matchesBanks && matchesCountries
      })
    : []
  const fullscreenActiveRecords = Array.from(
    new Map(
      [
        ...fullscreenAlertRecords,
        ...fullscreenPropertyFilteredRecords,
      ].map((candidateRecord) => [
        [
          candidateRecord.timestamp,
          candidateRecord.fromBank,
          candidateRecord.fromAccount,
          candidateRecord.toBank,
          candidateRecord.toAccount,
          candidateRecord.amountPaid,
          candidateRecord.paymentCurrency,
        ].join('|'),
        candidateRecord,
      ]),
    ).values(),
  )
  const fullscreenWorldRoutes = buildWorldRoutes(fullscreenActiveRecords, 'dark')
  const fullscreenCountrySummaries = buildCountrySummaries(fullscreenActiveRecords, fullscreenWorldRoutes)
  const severityToRouteColor = (severity: AlertSeverity) =>
    severity === 'high' ? '#b45309' : severity === 'medium' ? '#5b6cfa' : '#0f766e'

  const buildRoutePanel = (route: {
    fromCountry: string
    toCountry: string
    count: number
    totalAmount: number
    sampleRecord: BackendFeatureRecord
  }): SelectedRoutePanel => ({
    panelType: 'route',
    title: `${route.fromCountry} -> ${route.toCountry}`,
    lines: [
      `${formatCompactNumber(route.count)} Transactions`,
      `Total amount: ${formatCompactAmount(route.totalAmount, route.sampleRecord.paymentCurrency)}`,
      `From bank: ${route.sampleRecord.fromBank}`,
      `To bank: ${route.sampleRecord.toBank}`,
      `Payment format: ${route.sampleRecord.paymentFormat}`,
      `Latest activity: ${formatAlertTime(route.sampleRecord.timestamp)}`,
    ],
    toggles: [
      { label: 'From Country', kind: 'country' as const, value: route.sampleRecord.fromCountry },
      { label: 'To Country', kind: 'country' as const, value: route.sampleRecord.toCountry },
      { label: 'From Bank', kind: 'bank' as const, value: route.sampleRecord.fromBank },
      { label: 'To Bank', kind: 'bank' as const, value: route.sampleRecord.toBank },
      { label: 'From Account', kind: 'account' as const, value: route.sampleRecord.fromAccount },
      { label: 'To Account', kind: 'account' as const, value: route.sampleRecord.toAccount },
    ],
  })

  const buildCountryPanel = (country: {
    countryCode: string
    count: number
    totalAmount: number
    latestTimestamp?: string
    sampleRecord: BackendFeatureRecord | null
  }): SelectedRoutePanel | null => {
    if (!country.sampleRecord) {
      return null
    }

    return {
      panelType: 'country',
      title: country.countryCode,
      lines: [
        `${formatCompactNumber(country.count)} Linked Transactions`,
        `Total amount: ${formatCompactNumber(country.totalAmount)}`,
        `Sample from bank: ${country.sampleRecord.fromBank}`,
        `Sample to bank: ${country.sampleRecord.toBank}`,
        country.latestTimestamp
          ? `Latest activity: ${formatAlertTime(country.latestTimestamp)}`
          : 'Latest activity: N/A',
      ],
      toggles: [
        { label: 'Country', kind: 'country', value: country.countryCode },
        { label: 'From Bank', kind: 'bank', value: country.sampleRecord.fromBank },
        { label: 'To Bank', kind: 'bank', value: country.sampleRecord.toBank },
        { label: 'From Account', kind: 'account', value: country.sampleRecord.fromAccount },
        { label: 'To Account', kind: 'account', value: country.sampleRecord.toAccount },
      ],
    }
  }
  const forcedFullscreenPanel = (() => {
    if (!isFullscreen || !tourFullscreenFocus) {
      return null
    }

    if (tourFullscreenFocus === 'edge') {
      const longestRoute =
        fullscreenWorldRoutes.reduce<{ route: (typeof fullscreenWorldRoutes)[number] | null; distance: number }>(
          (best, route) => {
            const distance = getRouteDistance(route.fromCountry, route.toCountry)
            if (distance > best.distance) {
              return {
                route,
                distance,
              }
            }

            return best
          },
          { route: null, distance: -1 },
        ).route ?? null

      return longestRoute ? buildRoutePanel(longestRoute) : null
    }

    const primaryCountry = fullscreenCountrySummaries[0] ?? null
    return primaryCountry ? buildCountryPanel(primaryCountry) : null
  })()
  const updateTooltipPosition = (
    clientX: number,
    clientY: number,
    containerRef: React.RefObject<HTMLDivElement | null>,
  ) => {
    const rect = containerRef.current?.getBoundingClientRect()

    if (!rect) {
      return { x: 0, y: 0 }
    }

    return {
      x: clientX - rect.left + 12,
      y: clientY - rect.top + 12,
    }
  }
  const buildRoutePath = (
    fromCountry: string,
    toCountry: string,
    routeKey: string,
    duplicateIndex = 0,
    duplicateCount = 1,
    mode: 'light' | 'dark' = 'light',
  ) => {
    const from = projectCountry(fromCountry)
    const to = projectCountry(toCountry)

    if (!from || !to) {
      return null
    }

    const [fromX, fromY] = from
    const [toX, toY] = to
    const deltaX = toX - fromX
    const deltaY = toY - fromY
    const routeLength = Math.hypot(deltaX, deltaY) || 1
    const normalX = -deltaY / routeLength
    const normalY = deltaX / routeLength
    const laneSpacing = mode === 'dark' ? 2.2 : 4
    const laneOffset =
      duplicateCount > 1 ? (duplicateIndex - (duplicateCount - 1) / 2) * laneSpacing : 0
    const adjustedFromX = fromX + normalX * laneOffset
    const adjustedFromY = fromY + normalY * laneOffset
    const adjustedToX = toX + normalX * laneOffset
    const adjustedToY = toY + normalY * laneOffset

    if (mode === 'dark') {
      const mapCenterX = MAP_VIEWBOX_WIDTH / 2
      const mapCenterY = MAP_VIEWBOX_HEIGHT / 2
      const midX = (adjustedFromX + adjustedToX) / 2
      const midY = (adjustedFromY + adjustedToY) / 2
      const centerBias = Math.max(0.28, Math.min(0.72, routeLength / 260))
      const corridorSide = midX >= mapCenterX ? 1 : -1
      const corridorX =
        mapCenterX +
        corridorSide * (24 + Math.min(56, Math.abs(midX - mapCenterX) * 0.26)) +
        normalX * laneOffset * 0.8
      const corridorY =
        mapCenterY +
        (midY - mapCenterY) * 0.34 -
        Math.min(30, routeLength * 0.08) +
        ((hashText(routeKey) % 5) - 2) * 1.6
      const controlOneX = adjustedFromX + (corridorX - adjustedFromX) * centerBias
      const controlOneY = adjustedFromY + (corridorY - adjustedFromY) * centerBias
      const controlTwoX = adjustedToX + (corridorX - adjustedToX) * centerBias
      const controlTwoY = adjustedToY + (corridorY - adjustedToY) * centerBias

      return `M ${adjustedFromX} ${adjustedFromY} C ${controlOneX} ${controlOneY} ${controlTwoX} ${controlTwoY} ${adjustedToX} ${adjustedToY}`
    }

    const midX = (adjustedFromX + adjustedToX) / 2
    const archHeight = 18 + (hashText(routeKey) % 5) * 8 + Math.abs(adjustedFromX - adjustedToX) * 0.04
    const controlY = Math.min(adjustedFromY, adjustedToY) - archHeight

    return `M ${adjustedFromX} ${adjustedFromY} Q ${midX} ${controlY} ${adjustedToX} ${adjustedToY}`
  }

  const renderMapSurface = ({
    mode,
    containerRef,
    svgClassName,
    containerClassName,
    emptyStateClassName,
    tooltipClassName,
    activeRecords,
  }: {
    mode: 'light' | 'dark'
    containerRef: RefObject<HTMLDivElement | null>
    svgClassName: string
    containerClassName: string
    emptyStateClassName: string
    tooltipClassName: string
    activeRecords: BackendFeatureRecord[]
  }) => {
    const worldRoutes = buildWorldRoutes(activeRecords, mode)
    const longestRouteKey =
      worldRoutes.reduce<{ routeKey: string | null; distance: number }>(
        (best, route) => {
          const distance = getRouteDistance(route.fromCountry, route.toCountry)
          if (distance > best.distance) {
            return {
              routeKey: route.routeKey,
              distance,
            }
          }

          return best
        },
        {
          routeKey: null,
          distance: -1,
        },
      ).routeKey ?? null
    const strongestRouteAmount = worldRoutes[0]?.totalAmount ?? 1
    const countrySummaries = buildCountrySummaries(activeRecords, worldRoutes)
    const activeRoutePanel =
      mode === 'dark' && forcedFullscreenPanel ? forcedFullscreenPanel : selectedRoutePanels[mode]
    const palette =
      mode === 'dark'
        ? {
            container: 'border-[var(--line)] bg-[#eef4f7]',
            markerFill: '#284255',
            markerOpacity: 0.42,
            graticule: '#d5e0e8',
            landFill: '#d4dee6',
            landStroke: '#c1ced8',
            routeOpacityBase: 0.34,
            routeOpacityScale: 0.34,
            dotFill: '#102235',
            dotStroke: 'white',
            loadingText: '#5f7384',
            tooltipBorder: 'border-[var(--line)]',
            tooltipBg: 'bg-white/96',
            tooltipTitle: 'text-[var(--ink)]',
            tooltipText: 'text-[var(--muted)]',
            landStrokeWidth: 0.48,
          }
        : {
            container: 'border-[var(--line)] bg-[#eef4f7]',
            markerFill: '#284255',
            markerOpacity: 0.38,
            graticule: '#d5e0e8',
            landFill: '#d4dee6',
            landStroke: '#c1ced8',
            routeOpacityBase: 0.34,
            routeOpacityScale: 0.3,
            dotFill: '#102235',
            dotStroke: 'white',
            loadingText: '#5f7384',
            tooltipBorder: 'border-[var(--line)]',
            tooltipBg: 'bg-white/96',
            tooltipTitle: 'text-[var(--ink)]',
            tooltipText: 'text-[var(--muted)]',
            landStrokeWidth: 0.48,
          }

    return (
      <div
        ref={containerRef}
        className={`relative overflow-hidden rounded-[28px] ${
          mode === 'dark' ? '' : 'border'
        } ${palette.container} ${containerClassName}`}
      >
        {activeRoutePanel ? (
          <div
            data-tour={
              mode === 'dark'
                ? activeRoutePanel.panelType === 'country'
                  ? 'fullscreen-node-panel'
                  : 'fullscreen-edge-panel'
                : undefined
            }
            className={`absolute right-5 top-5 z-10 w-[300px] rounded-[24px] border px-4 py-4 shadow-[0_18px_40px_rgba(0,0,0,0.24)] ${
              mode === 'dark'
                ? 'top-20 border-[var(--line)] bg-white/96 text-[var(--ink)] backdrop-blur'
                : 'border-[var(--line)] bg-white/96 text-[var(--ink)]'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-[var(--ink)]">
                  {activeRoutePanel.title}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRoutePanel(mode, null)}
                className={`inline-flex h-8 w-8 items-center justify-center rounded-xl border transition ${
                  mode === 'dark'
                    ? 'border-[var(--line)] bg-white text-[var(--muted)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-strong)] hover:text-[var(--ink)]'
                    : 'border-[var(--line)] bg-white text-[var(--muted)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-strong)] hover:text-[var(--ink)]'
                }`}
                aria-label="Close route details"
                title="Close details"
              >
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-3 space-y-1.5">
              {activeRoutePanel.lines.map((line) => (
                <p
                  key={line}
                  className={`text-xs leading-5 ${mode === 'dark' ? 'text-[var(--muted)]' : 'text-[var(--muted)]'}`}
                >
                  {line}
                </p>
              ))}
            </div>
            {mode === 'dark' && activeRoutePanel.toggles && activeRoutePanel.toggles.length > 0 ? (
              <div data-tour="fullscreen-related-transactions" className="mt-4 border-t border-[var(--line)] pt-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                  Add Related Transactions
                </p>
                <div className="mt-3 space-y-2">
                  {activeRoutePanel.toggles.map((toggle, toggleIndex) => {
                    const isAdded =
                      toggle.kind === 'account'
                        ? fullscreenSelectedAccounts.includes(toggle.value)
                        : toggle.kind === 'bank'
                          ? fullscreenSelectedBanks.includes(toggle.value)
                          : fullscreenSelectedCountries.includes(toggle.value)

                    return (
                      <button
                        key={`${toggle.kind}-${toggle.value}`}
                        type="button"
                        data-tour={toggleIndex === 0 ? 'fullscreen-related-toggle' : undefined}
                        onClick={() => {
                          if (toggle.kind === 'account') {
                            toggleFullscreenAccountSelection(toggle.value)
                            return
                          }

                          if (toggle.kind === 'bank') {
                            toggleFullscreenBankSelection(toggle.value)
                            return
                          }

                          toggleFullscreenCountrySelection(toggle.value)
                        }}
                        className={`flex w-full items-center justify-between rounded-2xl border px-3 py-2.5 text-left transition ${
                          isAdded
                            ? 'border-[var(--line-strong)] bg-[var(--surface-strong)]'
                            : 'border-[var(--line)] bg-white/88 hover:border-[var(--line-strong)] hover:bg-white'
                        }`}
                      >
                        <span>
                          <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                            {toggle.label}
                          </span>
                          <span className="mt-1 block text-sm font-semibold text-[var(--ink)]">
                            {toggle.value}
                          </span>
                        </span>
                        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                          {isAdded ? 'Added' : 'Add'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="absolute bottom-5 left-5 z-10 flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              updateViewport(mode, (current) => {
                const nextScale = Math.min(5, Number((current.scale * 1.2).toFixed(3)))
                const centeredX = (MAP_VIEWBOX_WIDTH - MAP_VIEWBOX_WIDTH * nextScale) / 2
                const centeredY = (MAP_VIEWBOX_HEIGHT - MAP_VIEWBOX_HEIGHT * nextScale) / 2
                return clampViewport(centeredX, centeredY, nextScale)
              })
            }
            className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border text-sm font-semibold shadow-[0_8px_20px_rgba(15,23,42,0.08)] transition ${
              mode === 'dark'
                ? 'border-[var(--line)] bg-white/96 text-[var(--muted)] shadow-[0_14px_30px_rgba(15,23,42,0.14)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-strong)] hover:text-[var(--ink)]'
                : 'border-[var(--line)] bg-white/90 text-[var(--ink)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-strong)]'
            }`}
            aria-label="Zoom in"
            title="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            onClick={() =>
              updateViewport(mode, (current) => {
                const nextScale = Math.max(1, Number((current.scale / 1.2).toFixed(3)))
                if (nextScale === 1) {
                  return { scale: 1, x: 0, y: 0 }
                }

                const centeredX = (MAP_VIEWBOX_WIDTH - MAP_VIEWBOX_WIDTH * nextScale) / 2
                const centeredY = (MAP_VIEWBOX_HEIGHT - MAP_VIEWBOX_HEIGHT * nextScale) / 2
                return clampViewport(centeredX, centeredY, nextScale)
              })
            }
            className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border text-sm font-semibold shadow-[0_8px_20px_rgba(15,23,42,0.08)] transition ${
              mode === 'dark'
                ? 'border-[var(--line)] bg-white/96 text-[var(--muted)] shadow-[0_14px_30px_rgba(15,23,42,0.14)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-strong)] hover:text-[var(--ink)]'
                : 'border-[var(--line)] bg-white/90 text-[var(--ink)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-strong)]'
            }`}
            aria-label="Zoom out"
            title="Zoom out"
          >
            -
          </button>
          <button
            type="button"
            onClick={() => resetViewport(mode)}
            className={`inline-flex h-9 items-center justify-center rounded-xl border px-3 text-xs font-semibold shadow-[0_8px_20px_rgba(15,23,42,0.08)] transition ${
              mode === 'dark'
                ? 'border-[var(--line)] bg-white/96 text-[var(--muted)] shadow-[0_14px_30px_rgba(15,23,42,0.14)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-strong)] hover:text-[var(--ink)]'
                : 'border-[var(--line)] bg-white/90 text-[var(--ink)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-strong)]'
            }`}
            aria-label="Reset map view"
            title="Reset view"
          >
            Reset
          </button>
        </div>
        <svg
          viewBox={`0 0 ${MAP_VIEWBOX_WIDTH} ${MAP_VIEWBOX_HEIGHT}`}
          className={`${svgClassName} touch-none ${draggingMode === mode ? 'cursor-grabbing' : 'cursor-grab'}`}
          onWheel={(event) => {
            if (!event.ctrlKey && !event.metaKey) {
              return
            }

            event.preventDefault()

            const rect = containerRef.current?.getBoundingClientRect()
            if (!rect) {
              return
            }

            const pointerX = ((event.clientX - rect.left) / rect.width) * MAP_VIEWBOX_WIDTH
            const pointerY = ((event.clientY - rect.top) / rect.height) * MAP_VIEWBOX_HEIGHT
            const deltaMagnitude = Math.min(Math.abs(event.deltaY), 90)
            const zoomIntensity = deltaMagnitude / 260
            const direction = event.deltaY < 0 ? 1 + zoomIntensity : 1 / (1 + zoomIntensity)

            updateViewport(mode, (current) => {
              const nextScale = Math.max(1, Math.min(5, Number((current.scale * direction).toFixed(3))))
              if (nextScale === current.scale) {
                return current
              }

              const worldX = (pointerX - current.x) / current.scale
              const worldY = (pointerY - current.y) / current.scale
              const nextX = pointerX - worldX * nextScale
              const nextY = pointerY - worldY * nextScale

              return clampViewport(nextX, nextY, nextScale)
            })
          }}
          onPointerDown={(event) => {
            const target = event.target as HTMLElement | null

            if (
              event.pointerType !== 'touch' &&
              (target?.closest('[data-map-clickable="route"]') ||
                target?.closest('[data-map-clickable="country"]'))
            ) {
              return
            }

            setTooltip(null)
            activePointersRef.current[event.pointerId] = {
              pointerId: event.pointerId,
              mode,
              pointerType: event.pointerType,
              clientX: event.clientX,
              clientY: event.clientY,
            }
            event.currentTarget.setPointerCapture(event.pointerId)

            if (event.pointerType === 'touch') {
              const touchPointers = getTouchPointersForMode(mode)

              if (touchPointers.length >= 2) {
                dragStateRef.current = null
                setDraggingMode(null)
                beginPinchGesture(mode, containerRef)
                return
              }
            }

            dragStateRef.current = {
              mode,
              pointerId: event.pointerId,
              lastX: event.clientX,
              lastY: event.clientY,
            }
            setDraggingMode(mode)
          }}
          onPointerMove={(event) => {
            if (activePointersRef.current[event.pointerId]) {
              activePointersRef.current[event.pointerId] = {
                ...activePointersRef.current[event.pointerId],
                clientX: event.clientX,
                clientY: event.clientY,
              }
            }

            const pinchState = pinchStateRef.current
            const touchPointers = getTouchPointersForMode(mode)
            if (pinchState && pinchState.mode === mode && touchPointers.length >= 2) {
              const rect = containerRef.current?.getBoundingClientRect()
              if (!rect) {
                return
              }

              const [firstPointer, secondPointer] = touchPointers
              const midpointClientX = (firstPointer.clientX + secondPointer.clientX) / 2
              const midpointClientY = (firstPointer.clientY + secondPointer.clientY) / 2
              const pointerX = ((midpointClientX - rect.left) / rect.width) * MAP_VIEWBOX_WIDTH
              const pointerY = ((midpointClientY - rect.top) / rect.height) * MAP_VIEWBOX_HEIGHT
              const currentDistance = Math.hypot(
                secondPointer.clientX - firstPointer.clientX,
                secondPointer.clientY - firstPointer.clientY,
              )
              const nextScale = Math.max(
                1,
                Math.min(5, Number(((pinchState.initialScale * currentDistance) / pinchState.initialDistance).toFixed(3))),
              )
              const nextX = pointerX - pinchState.initialWorldX * nextScale
              const nextY = pointerY - pinchState.initialWorldY * nextScale

              updateViewport(mode, () => clampViewport(nextX, nextY, nextScale))
              return
            }

            const dragState = dragStateRef.current
            if (!dragState || dragState.mode !== mode || dragState.pointerId !== event.pointerId) {
              return
            }

            const rect = containerRef.current?.getBoundingClientRect()
            if (!rect) {
              return
            }

            const deltaX = ((event.clientX - dragState.lastX) / rect.width) * MAP_VIEWBOX_WIDTH
            const deltaY = ((event.clientY - dragState.lastY) / rect.height) * MAP_VIEWBOX_HEIGHT

            dragStateRef.current = {
              ...dragState,
              lastX: event.clientX,
              lastY: event.clientY,
            }

            updateViewport(mode, (current) =>
              clampViewport(
                current.x + deltaX / current.scale,
                current.y + deltaY / current.scale,
                current.scale,
              ),
            )
          }}
          onPointerUp={(event) => {
            delete activePointersRef.current[event.pointerId]
            if (dragStateRef.current?.pointerId === event.pointerId) {
              dragStateRef.current = null
              setDraggingMode(null)
            }

            const touchPointers = getTouchPointersForMode(mode)
            if (pinchStateRef.current?.mode === mode && touchPointers.length < 2) {
              pinchStateRef.current = null

              if (touchPointers.length === 1) {
                const [remainingPointer] = touchPointers
                dragStateRef.current = {
                  mode,
                  pointerId: remainingPointer.pointerId,
                  lastX: remainingPointer.clientX,
                  lastY: remainingPointer.clientY,
                }
                setDraggingMode(mode)
              }
            }
          }}
          onPointerCancel={(event) => {
            delete activePointersRef.current[event.pointerId]
            if (dragStateRef.current?.pointerId === event.pointerId) {
              dragStateRef.current = null
              setDraggingMode(null)
            }
            if (pinchStateRef.current?.mode === mode && getTouchPointersForMode(mode).length < 2) {
              pinchStateRef.current = null
            }
          }}
          onPointerLeave={(event) => {
            delete activePointersRef.current[event.pointerId]
            if (dragStateRef.current?.pointerId === event.pointerId) {
              dragStateRef.current = null
              setDraggingMode(null)
            }
            if (pinchStateRef.current?.mode === mode && getTouchPointersForMode(mode).length < 2) {
              pinchStateRef.current = null
            }
          }}
        >
          <defs>
            {(['high', 'medium', 'low'] as const).map((severity) => {
              const routeColor = severityToRouteColor(severity)
              const routeOpacity = mode === 'dark' ? 0.62 : palette.routeOpacityBase + palette.routeOpacityScale

              return (
                <marker
                  key={`marker-${mode}-${severity}`}
                  id={`route-direction-${mode}-${severity}`}
                  markerWidth="5.4"
                  markerHeight="5.4"
                  refX="4.2"
                  refY="2.7"
                  orient="auto"
                  markerUnits="userSpaceOnUse"
                >
                  <path d="M0,0 L4.8,2.7 L0,5.4 Z" fill={routeColor} fillOpacity={routeOpacity} />
                </marker>
              )
            })}
          </defs>
          <g
            transform={`translate(${mapViewport[mode].x} ${mapViewport[mode].y}) scale(${mapViewport[mode].scale})`}
          >
            {graticule ? (
              <path
                d={pathGenerator?.(graticule) ?? ''}
                fill="none"
                stroke={palette.graticule}
                strokeWidth="0.8"
                strokeDasharray="2 5"
              />
            ) : null}

            {countriesFeatureCollection?.features.map((geo: Feature<Geometry>, index: number) => (
              <path
                key={geo.id ?? geo.properties?.name ?? `country-${index}`}
                d={pathGenerator?.(geo) ?? ''}
                fill={palette.landFill}
                stroke={palette.landStroke}
                strokeWidth={palette.landStrokeWidth}
                strokeLinejoin="round"
              />
            ))}

            {worldRoutes.map((route) => {
              const routePath = buildRoutePath(
                route.fromCountry,
                route.toCountry,
                route.routeKey,
                route.duplicateIndex,
                route.duplicateCount,
                mode,
              )

              if (!routePath) {
                return null
              }

              const routeStrength = route.totalAmount / strongestRouteAmount
              const strokeWidth = mode === 'dark' ? 0.32 : 0.22 + routeStrength * 0.52
              const hoverStrokeWidth = mode === 'dark' ? 30 : 28
              const strokeOpacity =
                mode === 'dark'
                  ? 0.62
                  : palette.routeOpacityBase + routeStrength * palette.routeOpacityScale
              const routeColor = severityToRouteColor(route.severity)
              const routePanel = {
                panelType: 'route' as const,
                title: `${route.fromCountry} -> ${route.toCountry}`,
                lines: [
                  `${formatCompactNumber(route.count)} Transactions`,
                  `Total amount: ${formatCompactAmount(route.totalAmount, route.sampleRecord.paymentCurrency)}`,
                  `From bank: ${route.sampleRecord.fromBank}`,
                  `To bank: ${route.sampleRecord.toBank}`,
                  `Payment format: ${route.sampleRecord.paymentFormat}`,
                  `Latest activity: ${formatAlertTime(route.sampleRecord.timestamp)}`,
                ],
                toggles: [
                  { label: 'From Country', kind: 'country' as const, value: route.sampleRecord.fromCountry },
                  { label: 'To Country', kind: 'country' as const, value: route.sampleRecord.toCountry },
                  { label: 'From Bank', kind: 'bank' as const, value: route.sampleRecord.fromBank },
                  { label: 'To Bank', kind: 'bank' as const, value: route.sampleRecord.toBank },
                  { label: 'From Account', kind: 'account' as const, value: route.sampleRecord.fromAccount },
                  { label: 'To Account', kind: 'account' as const, value: route.sampleRecord.toAccount },
                ],
              }

              return (
                <g key={`${mode}-${route.routeKey}`} className="cursor-pointer">
                  <path
                    d={routePath}
                    fill="none"
                    stroke="rgba(255,255,255,0.001)"
                    strokeWidth={hoverStrokeWidth}
                    strokeLinecap="round"
                    data-tour={
                      mode === 'dark' && route.routeKey === longestRouteKey ? 'fullscreen-route-target' : undefined
                    }
                    data-map-clickable="route"
                    style={{ pointerEvents: 'stroke' }}
                    onPointerDown={(event) => {
                      if (event.pointerType !== 'touch') {
                        event.stopPropagation()
                      }
                    }}
                    onMouseMove={(event) => {
                      const position = updateTooltipPosition(event.clientX, event.clientY, containerRef)
                      const tooltipData: MapTooltip = {
                        type: 'route',
                        x: position.x,
                        y: position.y,
                        title: `${route.fromCountry} -> ${route.toCountry}`,
                        lines: [
                          `${formatCompactNumber(route.count)} Transactions`,
                          `Total amount: ${formatCompactAmount(route.totalAmount, route.sampleRecord.paymentCurrency)}`,
                          `Sample: ${route.sampleRecord.fromBank} -> ${route.sampleRecord.toBank}`,
                          `Format: ${route.sampleRecord.paymentFormat}`,
                        ],
                      }
                      setTooltip(tooltipData)
                    }}
                    onMouseLeave={() => setTooltip(null)}
                    onClick={(event) => {
                      event.stopPropagation()
                      setSelectedRoutePanel(mode, routePanel)
                    }}
                  />
                  <path
                    d={routePath}
                    fill="none"
                    stroke={routeColor}
                    strokeOpacity={strokeOpacity}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    markerEnd={`url(#route-direction-${mode}-${route.severity})`}
                    style={{ pointerEvents: 'none' }}
                  />
                </g>
              )
            })}

            {countrySummaries.map((country, countryIndex) => {
              const position = projectCountry(country.countryCode)

              if (!position) {
                return null
              }

              return (
                <g key={`${mode}-${country.countryCode}`}>
                  <circle
                    cx={position[0]}
                    cy={position[1]}
                    r={mode === 'dark' ? '2.6' : '2.1'}
                    fill={palette.dotFill}
                    stroke={palette.dotStroke}
                    strokeWidth={mode === 'dark' ? '0.9' : '0.8'}
                    className="cursor-pointer"
                    data-tour={mode === 'dark' && countryIndex === 0 ? 'fullscreen-country-target' : undefined}
                    data-map-clickable="country"
                    onPointerDown={(event) => {
                      if (event.pointerType !== 'touch') {
                        event.stopPropagation()
                      }
                    }}
                    onMouseMove={(event) => {
                      const tooltipPosition = updateTooltipPosition(event.clientX, event.clientY, containerRef)
                      setTooltip({
                        type: 'country',
                        x: tooltipPosition.x,
                        y: tooltipPosition.y,
                        title: country.countryCode,
                        lines: [
                          `${formatCompactNumber(country.count)} Linked Transactions`,
                          `Total amount: ${formatCompactNumber(country.totalAmount)}`,
                          `Banks: ${country.banks.join(', ') || 'N/A'}`,
                          country.latestTimestamp
                            ? `Latest activity: ${formatAlertTime(country.latestTimestamp)}`
                            : 'Latest activity: N/A',
                        ],
                      })
                    }}
                    onMouseLeave={() => setTooltip(null)}
                    onClick={(event) => {
                      event.stopPropagation()
                      if (!country.sampleRecord) {
                        return
                      }

                      setSelectedRoutePanel(mode, {
                        panelType: 'country',
                        title: country.countryCode,
                        lines: [
                          `${formatCompactNumber(country.count)} Linked Transactions`,
                          `Total amount: ${formatCompactNumber(country.totalAmount)}`,
                          `Sample from bank: ${country.sampleRecord.fromBank}`,
                          `Sample to bank: ${country.sampleRecord.toBank}`,
                          country.latestTimestamp
                            ? `Latest activity: ${formatAlertTime(country.latestTimestamp)}`
                            : 'Latest activity: N/A',
                        ],
                        toggles: [
                          { label: 'Country', kind: 'country', value: country.countryCode },
                          { label: 'From Bank', kind: 'bank', value: country.sampleRecord.fromBank },
                          { label: 'To Bank', kind: 'bank', value: country.sampleRecord.toBank },
                          { label: 'From Account', kind: 'account', value: country.sampleRecord.fromAccount },
                          { label: 'To Account', kind: 'account', value: country.sampleRecord.toAccount },
                        ],
                      })
                    }}
                  />
                </g>
              )
            })}
          </g>

          {!topology ? (
            <text x="474" y="28" textAnchor="end" fill={palette.loadingText} fontSize="11" fontWeight="700">
              Loading map geometry...
            </text>
          ) : null}
        </svg>
        {records.length === 0 ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className={emptyStateClassName}>
              Select an alert to show its transaction on the map.
            </div>
          </div>
        ) : null}
        {tooltip ? (
          <div
            className={`pointer-events-none absolute z-10 max-w-[260px] rounded-2xl border px-3 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.18)] ${palette.tooltipBorder} ${palette.tooltipBg} ${tooltipClassName}`}
            style={{
              left: tooltip.x,
              top: tooltip.y,
            }}
          >
            <p className={`text-sm font-semibold ${palette.tooltipTitle}`}>{tooltip.title}</p>
            <div className="mt-2 space-y-1">
              {tooltip.lines.map((line) => (
                <p key={line} className={`text-xs leading-5 ${palette.tooltipText}`}>
                  {line}
                </p>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="mt-5 flex flex-1 sm:mt-6">
      <div className="flex w-full flex-col gap-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-[var(--ink)]">Selected Transaction Route</h3>
          </div>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => {
              openFullscreenView()
            }}
            data-tour="transaction-map-expand"
            className="absolute right-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--line)] bg-white/90 text-[var(--muted)] shadow-[0_8px_20px_rgba(15,23,42,0.08)] transition hover:border-[var(--line-strong)] hover:bg-[var(--surface-strong)] hover:text-[var(--ink)]"
            aria-label="Expand transaction map"
            title="Expand map"
          >
            <ExpandIcon className="h-4 w-4" />
          </button>

          {renderMapSurface({
            mode: 'light',
            containerRef: mapContainerRef,
            svgClassName: 'h-[400px] w-full sm:h-[460px] min-[900px]:h-[560px]',
            containerClassName: '',
            emptyStateClassName:
              'rounded-2xl border border-[var(--line)] bg-white/94 px-4 py-3 text-sm text-[var(--muted)] shadow-[0_10px_24px_rgba(15,23,42,0.08)]',
            tooltipClassName: '',
            activeRecords: records,
          })}
        </div>
      </div>

      {isFullscreen
        ? createPortal(
            <div className="fixed inset-0 z-[200] h-screen w-screen bg-[#eef4f7]">
              <div className="absolute left-5 top-5 z-20">
                {isFullscreenAlertMenuOpen ? (
                  <div data-tour="fullscreen-alerts-panel" className="w-[340px] overflow-hidden rounded-[28px] border border-[var(--line)] bg-white/96 shadow-[0_24px_50px_rgba(15,23,42,0.16)] backdrop-blur">
                    <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-4">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                          Flagged Transactions
                        </p>
                        <p className="mt-1 text-sm text-[var(--muted)]">
                          {formatCompactNumber(filteredFullscreenAlerts.length)} Alerts
                        </p>
                      </div>
                      <button
                        type="button"
                onClick={() => setIsFullscreenAlertMenuOpen(false)}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--line)] bg-white text-[var(--muted)] transition hover:border-[var(--line-strong)] hover:bg-[var(--surface-strong)] hover:text-[var(--ink)]"
                        aria-label="Collapse flagged transactions menu"
                        title="Collapse menu"
                      >
                        <CloseIcon className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="max-h-[calc(100vh-8rem)] overflow-auto px-3 py-3">
                      <div className="mb-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                          Search Alerts
                        </p>
                        <input
                          type="text"
                          value={fullscreenAlertSearchQuery}
                          onChange={(event) => setFullscreenAlertSearchQuery(event.target.value)}
                          placeholder="Search in features..."
                          className="mt-2 w-full rounded-2xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm font-medium text-[var(--ink)] placeholder:text-[var(--muted)]"
                        />
                      </div>

                      <div className="space-y-2">
                        {fullscreenAlertGroups.map((group) => {
                          const isExpanded = expandedFullscreenAlertSeverities.includes(group.severity)

                          return (
                            <div key={group.severity} className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
                              <button
                                type="button"
                                onClick={() => toggleFullscreenSeverity(group.severity)}
                                data-fullscreen-severity-toggle={group.severity}
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
                                <div className="max-h-[280px] space-y-2 overflow-auto border-t border-[var(--line)] px-3 py-3">
                                  {group.alerts.length > 0 ? (
                                    group.alerts.map((alert) => {
                                      return (
                                        <button
                                          key={alert.id}
                                          type="button"
                                          onClick={() => toggleFullscreenAlertSelection(alert.id)}
                                          data-tour={
                                            alert.id === primaryFullscreenAlertId
                                              ? 'fullscreen-primary-alert'
                                              : alert.id === secondaryFullscreenAlertId
                                                ? 'fullscreen-secondary-alert'
                                                : undefined
                                          }
                                          className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                                            fullscreenSelectedAlertIds.includes(alert.id)
                                              ? 'border-[var(--line-strong)] bg-[var(--surface-strong)] shadow-[0_8px_20px_rgba(15,23,42,0.10)]'
                                              : 'border-[var(--line)] bg-white/88 hover:border-[var(--line-strong)] hover:bg-white'
                                          }`}
                                        >
                                          <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0 flex-1">
                                              <p className="text-sm font-semibold text-[var(--ink)]">{alert.routeLabel}</p>
                                              <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
                                                {alert.timeLabel}
                                              </p>
                                            </div>
                                            <span
                                              className={`min-w-[74px] rounded-full px-2.5 py-1 text-center text-[11px] font-semibold ${severityMeta[group.severity].badgeTone}`}
                                            >
                                              {(alert.confidence * 100).toFixed(0)}%
                                            </span>
                                          </div>
                                          <p className="mt-3 text-sm text-[var(--muted)]">Amount: {alert.amountLabel}</p>
                                        </button>
                                      )
                                    })
                                  ) : (
                                    <p className="text-sm text-[var(--muted)]">No alerts in this category.</p>
                                  )}
                                </div>
                              ) : null}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                onClick={() => setIsFullscreenAlertMenuOpen(true)}
                    data-tour="fullscreen-alerts-launcher"
                    className="inline-flex h-12 items-center gap-2 rounded-2xl border border-[var(--line)] bg-white/96 px-4 text-[var(--muted)] shadow-[0_18px_40px_rgba(15,23,42,0.14)] backdrop-blur transition hover:border-[var(--line-strong)] hover:bg-[var(--surface-strong)] hover:text-[var(--ink)]"
                    aria-label="Open flagged transactions menu"
                    title="Open flagged transactions"
                  >
                    <LayersIcon className="h-4 w-4" />
                    <span className="text-xs font-semibold uppercase tracking-[0.16em]">Alerts</span>
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  closeFullscreenView()
                }}
                className="absolute right-5 top-5 z-20 inline-flex h-11 min-w-[120px] items-center justify-center gap-2 rounded-2xl border border-[var(--line)] bg-white/96 px-4 text-[var(--muted)] shadow-[0_14px_30px_rgba(15,23,42,0.14)] transition hover:border-[var(--line-strong)] hover:bg-[var(--surface-strong)] hover:text-[var(--ink)]"
                aria-label="Exit full-screen map"
                title="Exit full screen"
              >
                <CloseIcon className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-[0.16em]">Exit</span>
              </button>

              <div className="absolute inset-0 h-full w-full">
                <div data-tour="fullscreen-map-surface" className="absolute inset-0 h-full w-full">
                  {renderMapSurface({
                  mode: 'dark',
                  containerRef: fullscreenMapContainerRef,
                  svgClassName: 'h-full w-full',
                  containerClassName: 'absolute inset-0 h-full w-full rounded-none border-0',
                  emptyStateClassName:
                    'rounded-2xl border border-[#214258] bg-[#081722]/96 px-4 py-3 text-sm text-[#a6c2d1] shadow-[0_16px_30px_rgba(0,0,0,0.25)]',
                  tooltipClassName: 'backdrop-blur',
                  activeRecords: fullscreenActiveRecords,
                  })}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

export default WorldViewMap
