/**
 * write-audit.ts
 *
 * Server function wrapper for recording audit log entries from client-side
 * collection mutations.
 *
 * Why a server function is needed here:
 *   Employee disable, role change, and refund are all local-first collection
 *   mutations (dbTransaction / collection.update) — they run in the browser.
 *   AuditLog is an append-only server-side record that must be written via
 *   Prisma. This server function bridges that gap: the client fires it after
 *   the primary mutation succeeds.
 *
 * Fire-and-forget semantics:
 *   The caller should NOT await this in a way that blocks the UI success path.
 *   If the audit write fails, it is logged server-side but the primary
 *   operation is already committed and cannot be rolled back.
 *
 * Usage:
 *   // After a successful collection mutation:
 *   writeAudit({
 *     data: AuditEngine.build({ action, targetType, targetId, context, before, after })
 *   }).catch(console.error)
 */

import { createServerFn } from '@tanstack/react-start'
import { AuditEngine } from '../audit/audit-engine'
import { recordAudit } from '../audit/record-audit'
import type { AuditEntryDTO } from '../audit/types'
import { authMiddleware } from '../better-auth/auth-middleware'

export const writeAudit = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((d: Omit<AuditEntryDTO, 'businessId' | 'actorId'> & { businessId?: string; actorId?: string }) => d)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    // Always use the session-verified actor and business — never trust client-provided values.
    // This prevents a malicious caller from spoofing the actorId or businessId.
    const actorId = context.user.id
    const businessId = context.user.businessId!

    const entry = AuditEngine.build({
      action: data.action,
      targetType: data.targetType,
      targetId: data.targetId,
      context: { actorId, businessId },
      before: data.before ?? null,
      after: data.after ?? null,
    })

    await recordAudit(entry)
    return { ok: true }
  })
