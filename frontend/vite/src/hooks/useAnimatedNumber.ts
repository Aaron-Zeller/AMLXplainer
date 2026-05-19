import { useEffect, useRef, useState } from 'react'

const easeOutCubic = (value: number) => 1 - Math.pow(1 - value, 3)

export const useAnimatedNumber = (targetValue: number, durationMs = 650) => {
  const [displayValue, setDisplayValue] = useState(targetValue)
  const displayValueRef = useRef(targetValue)
  const frameRef = useRef<number | null>(null)

  useEffect(() => {
    const startValue = displayValueRef.current
    const delta = targetValue - startValue
    const startedAt = performance.now()

    if (frameRef.current != null) {
      window.cancelAnimationFrame(frameRef.current)
    }

    if (Math.abs(delta) < 0.001) {
      setDisplayValue(targetValue)
      displayValueRef.current = targetValue
      return undefined
    }

    const tick = (now: number) => {
      const progress = Math.min((now - startedAt) / durationMs, 1)
      const nextValue = startValue + delta * easeOutCubic(progress)
      displayValueRef.current = nextValue
      setDisplayValue(nextValue)

      if (progress < 1) {
        frameRef.current = window.requestAnimationFrame(tick)
        return
      }

      displayValueRef.current = targetValue
      frameRef.current = null
    }

    frameRef.current = window.requestAnimationFrame(tick)

    return () => {
      if (frameRef.current != null) {
        window.cancelAnimationFrame(frameRef.current)
      }
    }
  }, [durationMs, targetValue])

  return displayValue
}
