type IconProps = {
  className?: string
}

export function LayersIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="M12 3 3.5 7.5 12 12l8.5-4.5L12 3Z" />
      <path d="M5 11.5 12 15l7-3.5" />
      <path d="M5 16 12 20l7-4" />
    </svg>
  )
}

export function AlertIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="M12 5a4 4 0 0 0-4 4v2.5c0 .8-.22 1.59-.64 2.27L6 16h12l-1.36-2.23a4.36 4.36 0 0 1-.64-2.27V9a4 4 0 0 0-4-4Z" />
      <path d="M10 18a2 2 0 0 0 4 0" />
    </svg>
  )
}

export function ExpandIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className}>
      <path d="M9 4H4v5" />
      <path d="M15 4h5v5" />
      <path d="M20 15v5h-5" />
      <path d="M4 15v5h5" />
    </svg>
  )
}

export function CloseIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className}>
      <path d="M6 6 18 18" />
      <path d="M18 6 6 18" />
    </svg>
  )
}

export function PlayIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M8 5.25v13.5L18.5 12 8 5.25Z" />
    </svg>
  )
}

export function PauseIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M7 5.5h3.75v13H7v-13Z" />
      <path d="M13.25 5.5H17v13h-3.75v-13Z" />
    </svg>
  )
}
