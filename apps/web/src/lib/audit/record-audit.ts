/**
 * audit/record-audit.ts
 *
 * Application Layer helper â€” persists an AuditEntryDTO to the audit_logs table.
 *
 * Architectural position:
 *   AuditEngine (pure domain) â†’ recordAudit (Application Layer) â†’ rootPrisma
 *
 * Why rootPrisma and not dbTransaction / crudAPI?
 *   AuditLog is an append-only server-side record, not a local-first collection.
 *   It must be written atomically alongside or immediately after the primary
 *   mutation, on the server, without going through the sync layer. This is the
 *   same pattern used for SubscriptionStatusHistory in complete-registration.ts.
 *
 * Failure behaviour:
 *   Audit logging is best-effort for non-financial actions. If the write fails
 *   (e.g. transient DB hiccup), the error is logged but NOT re-thrown â€” the
 *   primary operation must not be rolled back due to an audit failure.
 *
 *   EXCEPTION: For financial actions (TRANSACTION_REFUNDED, PURCHASE_VOIDED),
 *   callers should pass `throwOnFailure: true` so that the audit failure is
 *   surfaced to the operator.
 *
 * Usage:
 *   const entry = AuditEngine.build({ action, targetType, targetId, context, before, after })
 *   await recordAudit(entry)
 *
 * Atomic usage (within an existing Prisma $transaction):
 *   await recordAuditWithTx(tx, entry)
 */

import { prisma as rootPrisma } from '@platform/lib/prisma-client'
import type { PrismaClient } from 'prisma/generated/prisma/client'
import type { AuditEntryDTO } from './types'

// ---------------------------------------------------------------------------
// recordAudit
// Standalone write â€” creates a single AuditLog row via rootPrisma.
// ---------------------------------------------------------------------------

export async function recordAudit(entry: AuditEntryDTO, options: { throwOnFailure?: boolean } = {}): Promise<void> {
  try {
    await rootPrisma.auditLog.create({ data: entry })
  } catch (error) {
    console.error('[recordAudit] Failed to write audit log entry:', {
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      businessId: entry.businessId,
      error,
    })
    if (options.throwOnFailure) throw error
  }
}

// ---------------------------------------------------------------------------
// recordAuditWithTx
// Atomic write â€” participates in an existing Prisma $transaction.
// Use this when the audit entry must commit or rollback with a primary mutation.
// ---------------------------------------------------------------------------

export async function recordAuditWithTx(
  tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>,
  entry: AuditEntryDTO,
): Promise<void> {
  await tx.auditLog.create({ data: entry })
}
