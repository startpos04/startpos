/** biome-ignore-all lint/suspicious/noExplicitAny: allowing any type for flexibility */

/**
 * sequence-api.ts — Web-layer sequence allocation
 *
 * Owns the full sequence allocation flow:
 *   1. Extract businessId, branchId, maxInvoiceNo from session context
 *   2. Build a tenant-scoped Prisma client via getTenantPrisma
 *   3. Atomically allocate the next number with retry on conflicts
 *
 * Invoice numbers, order IDs, purchase numbers, etc. are web domain concepts.
 * Platform has no reason to know about SI-2026-000001 or #000001.
 *
 * Import from here (not from @platform) in apps/web:
 *   import { sequenceAPI } from '@/lib/prisma-client/sequence-api'
 */

import { getServerContext } from '@platform/lib/better-auth/server-context'
import { createServerFn } from '@tanstack/react-start'
import { err, ok, type Result } from 'neverthrow'
import { SequenceType } from 'prisma/generated/prisma/enums'
import { authMiddleware } from '@/lib/better-auth/auth-middleware'
import { getTenantPrisma, type TenantPrismaClient } from '@/lib/prisma-client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AllocateSequenceOutput {
  invoiceNo: string
  lastNumber: number
  counterId: string
}

export interface AllocateOptions {
  businessId: string
  branchId: string
  /** BIR permit ceiling — null/undefined if unconfigured. Only enforced for INVOICE type. */
  maxInvoiceNo?: number | null
  /** Maximum retry attempts on serialization conflict (default: 3) */
  maxRetries?: number
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

interface AllocationMetrics {
  type: SequenceType
  attempts: number
  totalDurationMs: number
  conflicts: number
  success: boolean
  errorType?: string
  timestamp: Date
}

const metricsBuffer: AllocationMetrics[] = []
const MAX_METRICS_BUFFER_SIZE = 1000

function logAllocationMetrics(metrics: AllocationMetrics): void {
  metricsBuffer.push(metrics)
  if (metricsBuffer.length > MAX_METRICS_BUFFER_SIZE) metricsBuffer.shift()

  const logData = {
    event: 'sequence_allocation',
    level: metrics.success ? 'info' : 'error',
    ...metrics,
    retriesNeeded: metrics.attempts - 1,
    hadConflicts: metrics.conflicts > 0,
  }

  if (!metrics.success) {
    console.error('[SEQUENCE_ALLOCATION_ERROR]', JSON.stringify(logData))
  } else if (metrics.conflicts > 0) {
    console.warn('[SEQUENCE_ALLOCATION_RETRY]', JSON.stringify(logData))
  } else if (process.env['NODE_ENV'] === 'development') {
    console.log('[SEQUENCE_ALLOCATION_SUCCESS]', JSON.stringify(logData))
  }
}

export function getSequenceAllocationMetrics(limit = 100): AllocationMetrics[] {
  return metricsBuffer.slice(-limit)
}

export function getConflictStatistics(): {
  totalAllocations: number
  totalConflicts: number
  conflictRate: number
  avgRetries: number
  avgDurationMs: number
} {
  const total = metricsBuffer.length
  if (total === 0) return { totalAllocations: 0, totalConflicts: 0, conflictRate: 0, avgRetries: 0, avgDurationMs: 0 }

  const withConflicts = metricsBuffer.filter(m => m.conflicts > 0).length
  const totalRetries = metricsBuffer.reduce((sum, m) => sum + (m.attempts - 1), 0)
  const totalDuration = metricsBuffer.reduce((sum, m) => sum + m.totalDurationMs, 0)

  return {
    totalAllocations: total,
    totalConflicts: withConflicts,
    conflictRate: withConflicts / total,
    avgRetries: totalRetries / total,
    avgDurationMs: totalDuration / total,
  }
}

// ---------------------------------------------------------------------------
// formatSequenceNumber — pure formatting
// ---------------------------------------------------------------------------

export function formatSequenceNumber(type: SequenceType, year: number, paddedNumber: string): string {
  switch (type) {
    case SequenceType.INVOICE:
      return `SI-${year}-${paddedNumber}`
    case SequenceType.REFUND:
      return `RF-${year}-${paddedNumber}`
    case SequenceType.ORDER:
      return `#${paddedNumber}`
    case SequenceType.STOCK_TRANSFER:
      return `ST-${year}-${paddedNumber}`
    case SequenceType.PURCHASE:
      return `PO-${year}-${paddedNumber}`
    case SequenceType.COLLECTION_RECEIPT:
      return `CR-${year}-${paddedNumber}`
    default:
      return `${type}-${paddedNumber}`
  }
}

// ---------------------------------------------------------------------------
// allocateSequenceCore — single atomic allocation attempt
// ---------------------------------------------------------------------------

export async function allocateSequenceCore(prisma: TenantPrismaClient, type: SequenceType, options: AllocateOptions): Promise<AllocateSequenceOutput> {
  const { businessId, branchId, maxInvoiceNo } = options
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const day = type === SequenceType.ORDER ? now.getDate() : 0

  return prisma.$transaction(
    async (tx: any) => {
      const existingCounter = await tx.sequenceCounter.findUnique({
        where: {
          businessId_branchId_type_year_month_day: { businessId, branchId, type, year, month, day },
        },
      })

      const newLastNumber = (existingCounter?.lastNumber ?? 0) + 1

      if (type === SequenceType.INVOICE && maxInvoiceNo != null && newLastNumber > maxInvoiceNo) {
        throw new Error(
          `BIR Permit Limit Reached: The current invoice number (${newLastNumber}) exceeds the authorized range (Max: ${maxInvoiceNo}). Please update your PTU settings.`,
        )
      }

      const counter = await tx.sequenceCounter.upsert({
        where: {
          businessId_branchId_type_year_month_day: { businessId, branchId, type, year, month, day },
        },
        create: { type, year, month, day, lastNumber: newLastNumber },
        update: { lastNumber: newLastNumber },
      })

      const paddedNumber = newLastNumber.toString().padStart(6, '0')

      return {
        invoiceNo: formatSequenceNumber(type, year, paddedNumber),
        lastNumber: newLastNumber,
        counterId: counter.id,
      }
    },
    { isolationLevel: 'Serializable' },
  ) as Promise<AllocateSequenceOutput>
}

// ---------------------------------------------------------------------------
// allocateWithRetry — retry wrapper with exponential backoff
// ---------------------------------------------------------------------------

export async function allocateWithRetry(
  prisma: TenantPrismaClient,
  type: SequenceType,
  options: AllocateOptions,
): Promise<Result<AllocateSequenceOutput, string>> {
  const maxRetries = options.maxRetries ?? 3
  const startTime = Date.now()
  let conflicts = 0
  let errorType: string | undefined

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const value = await allocateSequenceCore(prisma, type, options)
      logAllocationMetrics({ type, attempts: attempt + 1, totalDurationMs: Date.now() - startTime, conflicts, success: true, timestamp: new Date() })
      return ok(value)
    } catch (error: any) {
      const duration = Date.now() - startTime

      if (error.code === 'P2034' && attempt < maxRetries - 1) {
        conflicts++
        errorType = 'SERIALIZATION_CONFLICT'
        const delayMs = 2 ** attempt * 100
        console.warn(`[sequenceAPI] Serialization conflict. Retry ${attempt + 1}/${maxRetries} after ${delayMs}ms. Type: ${type}`)
        await new Promise(resolve => setTimeout(resolve, delayMs))
        continue
      }

      if (error.message?.includes('BIR Permit Limit')) {
        errorType = 'BIR_LIMIT_EXCEEDED'
        logAllocationMetrics({ type, attempts: attempt + 1, totalDurationMs: duration, conflicts, success: false, errorType, timestamp: new Date() })
        return err(error.message as string)
      }

      errorType = error.code === 'P2034' ? 'MAX_RETRIES_EXCEEDED' : 'ALLOCATION_FAILED'
      logAllocationMetrics({ type, attempts: attempt + 1, totalDurationMs: duration, conflicts, success: false, errorType, timestamp: new Date() })
      return err(error.code === 'P2034' ? 'Sequence allocation conflict. Please retry.' : 'Failed to allocate sequence number. Please try again.')
    }
  }

  logAllocationMetrics({
    type,
    attempts: maxRetries,
    totalDurationMs: Date.now() - startTime,
    conflicts,
    success: false,
    errorType: 'MAX_RETRIES_EXCEEDED',
    timestamp: new Date(),
  })
  return err('Failed to allocate sequence after multiple retries')
}

// ---------------------------------------------------------------------------
// Server function — tenant extraction + allocation
// ---------------------------------------------------------------------------

const allocateSequenceServerFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((d: { type: SequenceType }) => d)
  .handler(async ({ context, data }): Promise<{ value: AllocateSequenceOutput } | { error: string }> => {
    const user = getServerContext(context).user

    if (!user?.businessId || !user?.branchId) {
      console.error('[allocateSequence] Session context missing', {
        hasUser: !!user,
        hasBusiness: !!user?.businessId,
        hasBranch: !!user?.branchId,
      })
      return { error: 'Session context missing: businessId or branchId not set.' }
    }

    const { businessId, branchId } = user
    const { type } = data
    const maxInvoiceNo = (user as any).branch?.maxInvoiceNo ?? null
    const tenantPrisma = getTenantPrisma(businessId, branchId)

    const result = await allocateWithRetry(tenantPrisma, type, { businessId, branchId, maxInvoiceNo })

    if (result.isErr()) return { error: result.error }
    return { value: result.value }
  })

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const sequenceAPI = {
  allocate: async (type: SequenceType): Promise<Result<AllocateSequenceOutput, string>> => {
    const response = await allocateSequenceServerFn({ data: { type } })
    if ('error' in response) return err(response.error as string)
    return ok(response.value)
  },

  allocateWithRetry: async (type: SequenceType, _maxRetries = 3): Promise<Result<AllocateSequenceOutput, string>> => {
    // Retry logic runs inside the server function — client-side retry no longer needed
    return sequenceAPI.allocate(type)
  },
}
