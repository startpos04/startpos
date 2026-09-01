/**
 * fetch-eligible-hint.ts
 *
 * Server function that returns the next eligible hint for the current user
 * and page, and records a HintLog entry once the hint is shown.
 *
 * Architecture:
 *   - Server function — runs on the server only.
 *   - Reads Hint table + HintLog for this user + configuration frequency.
 *   - Delegates selection to HintEngine (pure).
 *   - Writes a HintLog entry after the hint is selected (optimistic — the
 *     UI shows the hint, then the log is written asynchronously).
 *   - Returns null if no hint is eligible at this time.
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { Permissions } from '@startpos-core/lib/authorization/permission-keys'
import { authMiddleware } from '@startpos-core/lib/better-auth/auth-middleware'
import { requirePermission } from '@startpos-core/lib/better-auth/permission-middleware'
import { ConfigurationEngine } from '@startpos-core/lib/configuration/configuration-engine'
import { HintEngine } from '../hint/hint-engine'
import type { HintDTO, HintLogDTO } from '../hint/hint-types'
import { prisma as rootPrisma } from '@startpos-core/lib/prisma-client'

const DEFAULT_HINT_FREQUENCY_DAYS = 1

const FetchEligibleHintInputSchema = z.object({
  page: z.string(),
})

export type FetchEligibleHintInput = z.infer<typeof FetchEligibleHintInputSchema>

export const fetchEligibleHint = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requirePermission(Permissions.BRANCH_VIEW_DASHBOARD)])
  .inputValidator((data: FetchEligibleHintInput) => FetchEligibleHintInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    if (!context?.user?.id) return null

    const userId = context.user.id
    const now = new Date()

    // Read HINT_FREQUENCY_DAYS from platform-level configuration
    const frequencyValue = await ConfigurationEngine.get('HINT_FREQUENCY_DAYS', {})
    const frequencyDays = frequencyValue ? Number.parseFloat(frequencyValue) : DEFAULT_HINT_FREQUENCY_DAYS

    // Fetch all active hints
    const rawHints = await rootPrisma.hint.findMany({
      where: { isActive: true },
      select: { id: true, title: true, body: true, page: true, isActive: true, sortOrder: true },
      orderBy: { sortOrder: 'asc' },
    })

    const hints: HintDTO[] = rawHints

    // Fetch HintLog entries for this user (only recent — within frequencyDays * 2)
    const cutoff = new Date(now.getTime() - frequencyDays * 2 * 24 * 60 * 60 * 1000)
    const rawLogs = await rootPrisma.hintLog.findMany({
      where: { userId, shownAt: { gte: cutoff } },
      select: { hintId: true, userId: true, shownAt: true },
    })

    const logs: HintLogDTO[] = rawLogs.map((l: { hintId: string; userId: string; shownAt: Date }) => ({
      hintId: l.hintId,
      userId: l.userId,
      shownAt: l.shownAt.toISOString(),
    }))

    const selected = HintEngine.selectHint(hints, logs, userId, frequencyDays, data.page, now)

    if (!selected) return null

    // Record HintLog (fire-and-forget — don't block the response)
    rootPrisma.hintLog.create({ data: { hintId: selected.id, userId } }).catch((err: unknown) => console.warn('[fetchEligibleHint] HintLog write failed:', err))

    return selected
  })
