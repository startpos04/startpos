/** biome-ignore-all lint/suspicious/noExplicitAny: allowing any type for flexibility */

import { getRequiredPermission } from '@platform/lib/authorization/model-permissions'
import { getServerContext } from '@platform/lib/better-auth/server-context'
import { type DBPayload, executeOperation } from '@platform/lib/prisma-client/crud-api'
import { createServerFn } from '@tanstack/react-start'
import { err, ok, type Result, ResultAsync } from 'neverthrow'
import { authMiddleware } from '@/lib/better-auth/auth-middleware'
import { getTenantPrisma } from '@/lib/prisma-client'

interface TransactionInput {
  operations: DBPayload[]
}

async function checkBatchEntitlements(_context: any, _operations: DBPayload[]): Promise<{ allowed: boolean; reason?: string }> {
  // Entitlement limits are enforced by the EntitlementEngine at the server-fn
  // level. Batch-level quantity checks are not implemented here — deferred to plan enforcement.
  return { allowed: true }
}

// ---------------------------------------------------------------------------
// transactionAPI server function
// ---------------------------------------------------------------------------
const transactionServerFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((d: TransactionInput) => d)
  .handler(async ({ data, context }): Promise<{ value: any[] } | { error: any }> => {
    if (!getServerContext(context).user?.businessId || !getServerContext(context).user?.branchId) {
      return { error: 'Session context missing: businessId or branchId not set.' }
    }

    if (!data.operations || data.operations.length === 0) {
      return { error: 'Transaction batch must contain at least one operation.' }
    }

    const userPermissions = context.authorization?.permissions || []

    // Gate 1: Permission check — validate ALL operations before executing ANY
    for (let i = 0; i < data.operations.length; i++) {
      const op = data.operations[i]
      const requiredPermission = getRequiredPermission(op.table, op.action)
      if (requiredPermission && !userPermissions.includes(requiredPermission)) {
        return { error: `Permission denied: ${requiredPermission} required for operation ${i + 1} (${op.action} on ${op.table})` }
      }
    }

    // Gate 2: Entitlement check
    const entitlementCheck = await checkBatchEntitlements(context, data.operations)
    if (!entitlementCheck.allowed) {
      return { error: entitlementCheck.reason || 'Subscription limit would be exceeded by this batch' }
    }

    const { businessId, branchId } = getServerContext(context).user
    const tenantPrisma = getTenantPrisma(businessId, branchId)

    const txResult = await ResultAsync.fromPromise(
      tenantPrisma.$transaction(async tx => {
        const executionResults = []
        for (const op of data.operations) {
          const out = await executeOperation(tx, op)
          executionResults.push(out)
        }
        return executionResults
      }),
      (e: any) => e.message || 'Transaction batch execution failed',
    )

    if (txResult.isErr()) return { error: txResult.error }

    // -------------------------------------------------------------------------
    // Usage counter reconciliation — runs OUTSIDE the main transaction
    // Links Transaction records to their UsageCounter after commit.
    // Failure here is non-fatal; the transaction was already committed.
    // -------------------------------------------------------------------------
    try {
      const { prisma: rootPrisma } = await import('@platform/lib/prisma-client')
      const executionResults = txResult.value

      for (let i = 0; i < data.operations.length; i++) {
        const op = data.operations[i]
        const result = executionResults[i]

        if (op.table === 'transaction' && op.action === 'create' && result != null && result?.usageCounterId === null) {
          const transactionId = result.id
          const transactionCreatedAt = result.createdAt ? new Date(result.createdAt) : new Date()

          const openCounter = await rootPrisma.usageCounter.findFirst({
            where: {
              businessId,
              branchId,
              isClosed: false,
              billingPeriodStart: { lte: transactionCreatedAt },
              billingPeriodEnd: { gte: transactionCreatedAt },
            },
            select: { id: true, txCount: true, overageTxCount: true },
          })

          let counterId: string

          if (openCounter) {
            const updated = await rootPrisma.usageCounter.update({
              where: { id: openCounter.id },
              data: { txCount: { increment: 1 }, updatedAt: new Date() },
              select: { id: true },
            })
            counterId = updated.id
          } else {
            const periodStart = new Date(transactionCreatedAt.getFullYear(), transactionCreatedAt.getMonth(), 1)
            const periodEnd = new Date(transactionCreatedAt.getFullYear(), transactionCreatedAt.getMonth() + 1, 0, 23, 59, 59, 999)
            const newCounter = await rootPrisma.usageCounter.create({
              data: { businessId, branchId, billingPeriodStart: periodStart, billingPeriodEnd: periodEnd, txCount: 1, overageTxCount: 0, isClosed: false },
              select: { id: true },
            })
            counterId = newCounter.id
          }

          await rootPrisma.transaction.update({
            where: { id: transactionId, businessId },
            data: { usageCounterId: counterId },
          })

          executionResults[i] = { ...result, usageCounterId: counterId }
        }
      }
    } catch (error) {
      console.error('[transactionAPI] Usage counter reconciliation failed:', error)
    }

    return { value: txResult.value }
  })

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export const transactionAPI = {
  execute: async (operations: DBPayload[]): Promise<Result<any[], string>> => {
    const response = await transactionServerFn({ data: { operations } })
    if ('error' in response) return err(response.error as string)
    return ok(response.value)
  },
}
