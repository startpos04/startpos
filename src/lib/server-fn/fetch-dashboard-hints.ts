/**
 * fetch-dashboard-hints.ts
 *
 * Returns all active hints for the dashboard tips carousel, shuffled randomly
 * so the content changes on every visit or refresh.
 *
 * Unlike fetchEligibleHint (which respects frequency limits for the corner
 * toast), this endpoint returns all hints — the carousel is always populated
 * and the user navigates through them with prev/next.
 */

import { createServerFn } from '@tanstack/react-start'
import { Permissions } from '../authorization/permission-keys'
import { authMiddleware } from '../better-auth/auth-middleware'
import { requirePermission } from '../better-auth/permission-middleware'
import { prisma as rootPrisma } from '../prisma-client'

export const fetchDashboardHints = createServerFn({ method: 'GET' })
  .middleware([authMiddleware, requirePermission(Permissions.BRANCH_VIEW_DASHBOARD)])
  .handler(async ({ context }) => {
    if (!context?.user?.id) return []

    const hints = await rootPrisma.hint.findMany({
      where: { isActive: true },
      select: { id: true, title: true, body: true },
      orderBy: { sortOrder: 'asc' },
    })

    // Fisher-Yates shuffle — different order on every call
    for (let i = hints.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[hints[i], hints[j]] = [hints[j], hints[i]]
    }

    return hints
  })
