/**
 * use-hints.ts
 *
 * useHints(page) — fetches the next eligible hint for the current page and
 * schedules auto-dismiss after HINT_DISPLAY_SECONDS.
 *
 * Architecture:
 *   - Calls fetchEligibleHint server function on mount.
 *   - Auto-dismisses after the configured display duration.
 *   - Returns the current hint (or null) for GuidanceBanner to render.
 */

import { useStore } from '@tanstack/react-store'
import { useEffect, useState } from 'react'
import type { HintDTO } from '@/lib/hint/hint-types'
import { fetchEligibleHint } from '@/lib/server-fn/fetch-eligible-hint'
import { authStore } from '@/store/auth-store'

const DEFAULT_DISPLAY_SECONDS = 6

export function useHints(page: string) {
  const [hint, setHint] = useState<HintDTO | null>(null)
  const user = useStore(authStore, state => state.user)

  // Read display seconds from configs — cast from merged config
  const displaySeconds = (user?.configs?.['HINT_DISPLAY_SECONDS' as keyof typeof user.configs] as number | undefined) ?? DEFAULT_DISPLAY_SECONDS

  useEffect(() => {
    if (!user?.id) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    fetchEligibleHint({ data: { page } })
      .then(result => {
        if (cancelled || !result) return
        setHint(result)

        // Schedule auto-dismiss
        timer = setTimeout(() => {
          if (!cancelled) setHint(null)
        }, displaySeconds * 1000)
      })
      .catch(() => {
        // Non-fatal — hints are informational, never block the UI
      })

    return () => {
      cancelled = true
      if (timer !== null) clearTimeout(timer)
    }
    // Re-fetch when page changes (not on every displaySeconds change)
  }, [page, user?.id, displaySeconds])

  const dismiss = () => setHint(null)

  return { hint, dismiss }
}
