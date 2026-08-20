/** biome-ignore-all lint/suspicious/noExplicitAny: allowing any type for flexibility */
import { createServerFn } from '@tanstack/react-start'
import { err, ok, type Result } from 'neverthrow'
import { SequenceType } from 'prisma/generated/prisma/enums'
import { getTenantPrisma } from '@/lib/prisma-client'
import { authMiddleware } from '../better-auth/auth-middleware'

// ---------------------------------------------------------------------------
// SEQUENCE ALLOCATION API — Phase 1: Server-Side Atomic Allocation
// ---------------------------------------------------------------------------
//
// Critical Fix:
// Sequence numbers are now allocated SERVER-SIDE with atomic database operations
// instead of client-side in TanStack DB collections.
//
// This eliminates race conditions where multiple concurrent checkouts could
// read the same lastNumber from their local OPFS and generate duplicate invoiceNos.
//
// Architecture:
//   1. Client requests sequence allocation BEFORE creating transaction
//   2. Server atomically increments counter in Prisma transaction
//   3. Server returns formatted sequence number
//   4. Client uses returned sequence to create transaction
//
// Concurrency Safety:
//   - Uses Prisma $transaction with Serializable isolation level
//   - SELECT FOR UPDATE equivalent through findUnique in transaction
//   - Atomic upsert ensures no race conditions
//   - Retry logic handles serialization conflicts
//
// Offline Mode:
//   - Falls back to client-side allocation when navigator.onLine = false
//   - Offline restriction enforced at checkout level (Phase 2)
//
// Phase 3: Monitoring & Logging
//   - Tracks serialization conflicts, retries, and allocation timing
//   - Logs to console with structured format for production monitoring
//   - Metrics can be aggregated for performance analysis
// ---------------------------------------------------------------------------

// Monitoring metrics for sequence allocation
interface AllocationMetrics {
  type: SequenceType
  businessId: string
  branchId: string
  attempts: number
  totalDurationMs: number
  conflicts: number
  success: boolean
  errorType?: string
  timestamp: Date
}

// In-memory metrics buffer (can be extended to send to external monitoring service)
const metricsBuffer: AllocationMetrics[] = []
const MAX_METRICS_BUFFER_SIZE = 1000

/**
 * Log structured allocation metrics
 * Phase 3: Centralized logging for monitoring and debugging
 */
function logAllocationMetrics(metrics: AllocationMetrics) {
  // Add to buffer
  metricsBuffer.push(metrics)

  // Prevent memory leak - keep only last N metrics
  if (metricsBuffer.length > MAX_METRICS_BUFFER_SIZE) {
    metricsBuffer.shift()
  }

  // Structured console logging for production monitoring tools
  const logLevel = metrics.success ? 'info' : 'error'
  const logData = {
    event: 'sequence_allocation',
    level: logLevel,
    ...metrics,
    // Add helpful context
    retriesNeeded: metrics.attempts - 1,
    hadConflicts: metrics.conflicts > 0,
  }

  if (logLevel === 'error') {
    console.error('[SEQUENCE_ALLOCATION_ERROR]', JSON.stringify(logData))
  } else if (metrics.conflicts > 0) {
    // Highlight allocations that needed retries due to conflicts
    console.warn('[SEQUENCE_ALLOCATION_RETRY]', JSON.stringify(logData))
  } else {
    // Normal allocation - only log in development or when debugging
    if (process.env.NODE_ENV === 'development') {
      console.log('[SEQUENCE_ALLOCATION_SUCCESS]', JSON.stringify(logData))
    }
  }
}

/**
 * Get recent allocation metrics for monitoring dashboards
 * Phase 3: Expose metrics for admin monitoring UI
 */
export function getSequenceAllocationMetrics(limit = 100): AllocationMetrics[] {
  return metricsBuffer.slice(-limit)
}

/**
 * Get aggregated conflict statistics
 * Phase 3: Summary metrics for operational visibility
 */
export function getConflictStatistics(): {
  totalAllocations: number
  totalConflicts: number
  conflictRate: number
  avgRetries: number
  avgDurationMs: number
} {
  const total = metricsBuffer.length

  if (total === 0) {
    return {
      totalAllocations: 0,
      totalConflicts: 0,
      conflictRate: 0,
      avgRetries: 0,
      avgDurationMs: 0,
    }
  }

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

interface AllocateSequenceInput {
  type: SequenceType
}

interface AllocateSequenceOutput {
  invoiceNo: string
  lastNumber: number
  counterId: string
}

// ---------------------------------------------------------------------------
// Server Function — Allocate Sequence
// ---------------------------------------------------------------------------

const allocateSequenceServerFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((d: AllocateSequenceInput) => d)
  .handler(async ({ context, data }): Promise<{ value: AllocateSequenceOutput } | { error: string }> => {
    const startTime = Date.now()

    if (!context?.user?.businessId || !context?.user?.branchId) {
      console.error('[allocateSequence] Session context missing', {
        hasContext: !!context,
        hasUser: !!context?.user,
        hasBusiness: !!context?.user?.businessId,
        hasBranch: !!context?.user?.branchId,
      })
      return { error: 'Session context missing: businessId or branchId not set.' }
    }

    const { businessId, branchId } = context.user
    const { type } = data

    const tenantPrisma = getTenantPrisma(businessId, branchId)

    // Calculate period components
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1
    const day = type === SequenceType.ORDER ? now.getDate() : 0

    try {
      // ATOMIC: Use Prisma transaction with Serializable isolation
      // This ensures that concurrent allocations cannot read the same lastNumber
      const result = await tenantPrisma.$transaction(
        async tx => {
          // Find existing counter (locks row for update in Serializable mode)
          const existingCounter = await tx.sequenceCounter.findUnique({
            where: {
              businessId_branchId_type_year_month_day: {
                businessId,
                branchId,
                type,
                year,
                month,
                day,
              },
            },
          })

          // Calculate new lastNumber
          const newLastNumber = (existingCounter?.lastNumber ?? 0) + 1

          // Check BIR permit limit for invoices
          if (type === SequenceType.INVOICE && context.user.branch?.maxInvoiceNo) {
            if (newLastNumber > context.user.branch.maxInvoiceNo) {
              console.warn('[allocateSequence] BIR permit limit exceeded', {
                businessId,
                branchId,
                type,
                currentNumber: newLastNumber,
                maxAllowed: context.user.branch.maxInvoiceNo,
              })
              throw new Error(`BIR Permit Limit Reached: ${newLastNumber} > ${context.user.branch.maxInvoiceNo}`)
            }
          }

          // Atomic upsert with new lastNumber
          const counter = await tx.sequenceCounter.upsert({
            where: {
              businessId_branchId_type_year_month_day: {
                businessId,
                branchId,
                type,
                year,
                month,
                day,
              },
            },
            create: {
              businessId,
              branchId,
              type,
              year,
              month,
              day,
              lastNumber: newLastNumber,
            },
            update: {
              lastNumber: newLastNumber,
            },
          })

          // Format invoice number based on type
          const paddedNumber = newLastNumber.toString().padStart(6, '0')
          let invoiceNo: string

          switch (type) {
            case SequenceType.INVOICE:
              invoiceNo = `SI-${year}-${paddedNumber}`
              break
            case SequenceType.REFUND:
              invoiceNo = `RF-${year}-${paddedNumber}`
              break
            case SequenceType.ORDER:
              invoiceNo = `#${paddedNumber}`
              break
            case SequenceType.STOCK_TRANSFER:
              invoiceNo = `ST-${year}-${paddedNumber}`
              break
            case SequenceType.PURCHASE:
              invoiceNo = `PO-${year}-${paddedNumber}`
              break
            case SequenceType.COLLECTION_RECEIPT:
              invoiceNo = `CR-${year}-${paddedNumber}`
              break
            default:
              invoiceNo = `${type}-${paddedNumber}`
          }

          const duration = Date.now() - startTime

          // Phase 3: Log successful allocation with timing
          if (process.env.NODE_ENV === 'development') {
            console.log('[allocateSequence] Success', {
              businessId,
              branchId,
              type,
              invoiceNo,
              lastNumber: newLastNumber,
              durationMs: duration,
            })
          }

          return {
            invoiceNo,
            lastNumber: newLastNumber,
            counterId: counter.id,
          }
        },
        {
          isolationLevel: 'Serializable', // Prevents phantom reads and write skew
          timeout: 5000, // 5 second timeout
        },
      )

      return { value: result }
    } catch (error: any) {
      const duration = Date.now() - startTime

      // Handle Prisma transaction errors
      if (error.code === 'P2034') {
        // Serialization failure - will be retried by client
        console.warn('[allocateSequence] Serialization conflict detected', {
          businessId,
          branchId,
          type,
          errorCode: error.code,
          durationMs: duration,
          willRetry: true,
        })
        return { error: 'Sequence allocation conflict. Please retry.' }
      }

      if (error.code === 'P2002') {
        // Unique constraint violation (shouldn't happen with upsert, but handle it)
        console.error('[allocateSequence] Unique constraint violation', {
          businessId,
          branchId,
          type,
          errorCode: error.code,
          durationMs: duration,
        })
        return { error: 'Duplicate sequence detected. Please retry.' }
      }

      // BIR permit limit or other business logic errors
      if (error.message?.includes('BIR Permit Limit')) {
        return { error: error.message }
      }

      console.error('[allocateSequence] Unexpected error', {
        businessId,
        branchId,
        type,
        error: error.message,
        errorCode: error.code,
        durationMs: duration,
        stack: error.stack,
      })
      return { error: 'Failed to allocate sequence number. Please try again.' }
    }
  })

// ---------------------------------------------------------------------------
// Exported Public API
// ---------------------------------------------------------------------------

export const sequenceAPI = {
  /**
   * Allocate the next sequence number atomically on the server.
   *
   * This function MUST be called before creating a transaction/order to ensure
   * unique sequence numbers across concurrent checkouts.
   *
   * @param type - The type of sequence to allocate (INVOICE, ORDER, etc.)
   * @returns Result with allocated sequence number or error
   *
   * @example
   * const result = await sequenceAPI.allocate(SequenceType.INVOICE)
   * if (result.isErr()) {
   *   console.error('Failed to allocate sequence:', result.error)
   *   return
   * }
   * const { invoiceNo, lastNumber } = result.value
   */
  allocate: async (type: SequenceType): Promise<Result<AllocateSequenceOutput, string>> => {
    const response = await allocateSequenceServerFn({
      data: { type },
    })

    if ('error' in response) {
      return err(response.error as string)
    }

    return ok(response.value)
  },

  /**
   * Allocate sequence with automatic retry on serialization conflicts.
   *
   * Retries up to maxRetries times with exponential backoff when encountering
   * serialization failures (Prisma error P2034). This handles high-concurrency
   * scenarios gracefully.
   *
   * Phase 3: Enhanced with metrics tracking and structured logging
   *
   * @param type - The type of sequence to allocate
   * @param maxRetries - Maximum number of retry attempts (default: 3)
   * @returns Result with allocated sequence number or error
   */
  allocateWithRetry: async (type: SequenceType, maxRetries = 3): Promise<Result<AllocateSequenceOutput, string>> => {
    const startTime = Date.now()
    let conflicts = 0
    const businessId = ''
    const branchId = ''
    let errorType: string | undefined

    try {
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const result = await sequenceAPI.allocate(type)

        if (result.isOk()) {
          // Success - log metrics
          const duration = Date.now() - startTime

          // Extract IDs from successful result (available in closure)
          // Note: We'd need to pass context or extract from result if needed
          logAllocationMetrics({
            type,
            businessId: businessId || 'unknown',
            branchId: branchId || 'unknown',
            attempts: attempt + 1,
            totalDurationMs: duration,
            conflicts,
            success: true,
            timestamp: new Date(),
          })

          return result
        }

        // Track conflict
        if (result.error.includes('conflict')) {
          conflicts++
          errorType = 'SERIALIZATION_CONFLICT'
        }

        // Retry on serialization conflict
        if (result.error.includes('conflict') && attempt < maxRetries - 1) {
          // Exponential backoff: 100ms, 200ms, 400ms
          const delayMs = 2 ** attempt * 100
          await new Promise(resolve => setTimeout(resolve, delayMs))

          console.warn(
            `[sequenceAPI] Serialization conflict detected. Retry ${attempt + 1}/${maxRetries} after ${delayMs}ms delay. ` +
              `Type: ${type}, Conflicts: ${conflicts}`,
          )
          continue
        }

        // Non-retryable error or max retries exceeded
        errorType = result.error.includes('BIR Permit') ? 'BIR_LIMIT_EXCEEDED' : 'ALLOCATION_FAILED'

        // Log failure metrics
        logAllocationMetrics({
          type,
          businessId: businessId || 'unknown',
          branchId: branchId || 'unknown',
          attempts: attempt + 1,
          totalDurationMs: Date.now() - startTime,
          conflicts,
          success: false,
          errorType,
          timestamp: new Date(),
        })

        return result
      }

      // Max retries exceeded
      const finalError = 'Failed to allocate sequence after multiple retries'

      logAllocationMetrics({
        type,
        businessId: businessId || 'unknown',
        branchId: branchId || 'unknown',
        attempts: maxRetries,
        totalDurationMs: Date.now() - startTime,
        conflicts,
        success: false,
        errorType: 'MAX_RETRIES_EXCEEDED',
        timestamp: new Date(),
      })

      return err(finalError)
    } catch (error: any) {
      // Unexpected error outside retry loop
      console.error('[sequenceAPI] Unexpected error in allocateWithRetry:', error)

      logAllocationMetrics({
        type,
        businessId: businessId || 'unknown',
        branchId: branchId || 'unknown',
        attempts: 1,
        totalDurationMs: Date.now() - startTime,
        conflicts: 0,
        success: false,
        errorType: 'UNEXPECTED_ERROR',
        timestamp: new Date(),
      })

      return err('Unexpected error during sequence allocation')
    }
  },
}
