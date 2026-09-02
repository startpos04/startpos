import { useEffect, useRef } from 'react'

interface UseInViewOptions extends IntersectionObserverInit {
  onChange?: (inView: boolean) => void
}

export function useInView(options?: UseInViewOptions) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry) options?.onChange?.(entry.isIntersecting)
    }, options)

    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [options])

  return { ref }
}
