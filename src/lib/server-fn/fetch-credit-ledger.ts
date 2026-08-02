import { z } from 'zod'
import { crudAPI } from '@/lib/prisma-client/crud-api'

const fetchCreditLedgerSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(30),
})

export type FetchCreditLedgerInput = z.infer<typeof fetchCreditLedgerSchema>

// ---------------------------------------------------------------------------
// fetchCreditLedger
// Returns paginated CreditLedger history for the session's business,
// ordered newest-first, plus the current running balance.
//
// Uses crudAPI — CreditLedger has a `business` relation so getTenantPrisma
// automatically scopes all queries to context.user.businessId. No manual
// businessId filtering needed.
// ---------------------------------------------------------------------------
export const fetchCreditLedger = async (input: FetchCreditLedgerInput) => {
  const data = fetchCreditLedgerSchema.parse(input)

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
    entries,
    totalItems: countResult.value,
    currentBalance: latestEntry?.balanceAfter ?? 0,
    page: data.page,
    pageSize: data.pageSize,
  }
}

export type CreditLedgerEntry = Awaited<ReturnType<typeof fetchCreditLedger>>['entries'][number]
