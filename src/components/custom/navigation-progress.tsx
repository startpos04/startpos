import { useRouter } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'

const MIN_PROGRESS = 0.08
const TRICKLE_INTERVAL_MS = 200

/**
 * Thin top-of-page progress bar shown during route transitions.
 * Uses direct DOM updates so the bar appears immediately, even when
 * navigation runs inside a React transition.
 */
export function NavigationProgress() {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const trickleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const progressRef = useRef(0)
  const visibleRef = useRef(false)

  useEffect(() => {
    const container = containerRef.current
    const bar = barRef.current
    if (!container || !bar) return

    const clearTimers = () => {
      if (trickleTimerRef.current) {
        clearInterval(trickleTimerRef.current)
        trickleTimerRef.current = null
      }
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current)
        hideTimerRef.current = null
      }
    }

    const setProgress = (value: number) => {
      progressRef.current = value
      bar.style.transform = `translate3d(${(value - 1) * 100}%, 0, 0)`
    }

    const startTrickle = () => {
      trickleTimerRef.current = setInterval(() => {
        if (!visibleRef.current) return

        const current = progressRef.current
        if (current >= 0.9) return

        const increment = (1 - current) * (Math.random() * 0.1 + 0.05)
        setProgress(Math.min(current + increment, 0.9))
      }, TRICKLE_INTERVAL_MS)
    }

    const show = (event: { pathChanged: boolean; fromLocation?: unknown }) => {
      if (!event.pathChanged || !event.fromLocation) return

      clearTimers()
      visibleRef.current = true
      container.style.opacity = '1'
      setProgress(MIN_PROGRESS)
      startTrickle()
    }

    const hide = () => {
      if (!visibleRef.current) return

      clearTimers()
      setProgress(1)

      hideTimerRef.current = setTimeout(() => {
        visibleRef.current = false
        container.style.opacity = '0'
        setProgress(0)
      }, 250)
    }

    const unsubStart = router.subscribe('onBeforeNavigate', show)
    const unsubEnd = router.subscribe('onResolved', hide)

    return () => {
      unsubStart()
      unsubEnd()
      clearTimers()
    }
  }, [router])

  return (
    <div
      ref={containerRef}
      role='progressbar'
      aria-hidden='true'
      className='pointer-events-none fixed inset-x-0 top-0 z-9999 h-0.5 opacity-0 transition-opacity duration-300'
    >
      <div
        ref={barRef}
        className='relative h-full w-full bg-linear-to-r from-primary via-chart-2 to-primary will-change-transform'
        style={{ transform: 'translate3d(-100%, 0, 0)' }}
      >
        <div className='absolute right-0 h-full w-24 -translate-y-px rotate-2 shadow-[0_0_10px_var(--primary),0_0_6px_color-mix(in_oklch,var(--primary)_70%,transparent)]' />
      </div>
    </div>
  )
}
