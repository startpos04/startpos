import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { Permissions } from '@startpos-core/lib/authorization/permission-keys'
import { authMiddleware } from '@startpos-core/lib/better-auth/auth-middleware'
import { requirePermission } from '@startpos-core/lib/better-auth/permission-middleware'
import { prisma as rootPrisma } from '@startpos-core/lib/prisma-client'
import { crudAPI } from '@startpos-core/lib/prisma-client/crud-api'

const fetchCreditLedgerSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(30),
})

export type FetchCreditLedgerInput = z.infer<typeof fetchCreditLedgerSchema>

// ---------------------------------------------------------------------------
// fetchCreditLedger
// Returns paginated CreditLedger history for the session's business,
// ordered newest-first, plus the current running balance and actor names.
//
// Wrapped in createServerFn so that both the crudAPI calls and the
// rootPrisma user lookup run exclusively on the server — importing
// rootPrisma in a plain async function would pull the Prisma client
// (which uses the Node.js Buffer global) into the browser bundle.
// ---------------------------------------------------------------------------
export const fetchCreditLedger = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requirePermission(Permissions.BUSINESS_VIEW_BILLING)])
  .inputValidator((data: FetchCreditLedgerInput) => fetchCreditLedgerSchema.parse(data))
  .handler(async ({ data }) => {
    const where = {}

    const [entriesResult, countResult] = await Promise.all([
      crudAPI.creditLedger('findMany', {
        where,
        orderBy: { createdAt: 'desc' as const },
        skip: (data.page - 1) * data.pageSize,
        take: data.pageSize,
        select: {
          id: true,
          eventType: true,
          amount: true,
          balanceAfter: true,
          transactionId: true,
          note: true,
          actorId: true,
          createdAt: true,
        },
      }),
      crudAPI.creditLedger('count', { where }),
    ])

    if (entriesResult.isErr()) throw new Error(entriesResult.error)
    if (countResult.isErr()) throw new Error(countResult.error)

    const entries = entriesResult.value

    // Resolve actor names — actorId has no @relation on CreditLedger, so we
    // do a secondary lookup keyed by the unique set of actor IDs on this page.
    const actorIds = [...new Set(entries.map(e => e.actorId).filter((id): id is string => !!id))]
    const actorMap = new Map<string, string>()

    if (actorIds.length > 0) {
      const actors = await rootPrisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true },
      })
      for (const actor of actors) {
        actorMap.set(actor.id, actor.name)
      }
    }

    const entriesWithActor = entries.map(e => ({
      ...e,
      actorName: e.actorId ? (actorMap.get(e.actorId) ?? null) : null,
    }))

    // Current balance = balanceAfter of the most recent entry.
    // On page 1 we already have it; on deeper pages fetch just the latest row.
    const latestEntry =
      data.page === 1 && entries.length > 0
        ? entries[0]
        : await crudAPI
            .creditLedger('findFirst', {
              orderBy: { createdAt: 'desc' as const },
              select: { balanceAfter: true },
            })
            .then(r => (r.isOk() ? r.value : null))

    return {
      entries: entriesWithActor,
      totalItems: countResult.value,
      currentBalance: latestEntry?.balanceAfter ?? 0,
      page: data.page,
      pageSize: data.pageSize,
    }
  })

export type CreditLedgerEntry = Awaited<ReturnType<typeof fetchCreditLedger>>['entries'][number]
