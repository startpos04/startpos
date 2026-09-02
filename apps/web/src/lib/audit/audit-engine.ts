/**
 * audit/audit-engine.ts
 *
 * AuditEngine — pure domain engine for building audit log entry DTOs.
 *
 * Architectural contract (mirrors ADR-001 pattern from billing/credit-engine.ts):
 *   - No Prisma imports, no collection reads, no HTTP calls.
 *   - Deterministic: same inputs → same output.
 *   - All data arrives as explicit parameters from the Application Layer.
 *   - Returns AuditEntryDTO — the Application Layer is responsible for persisting it.
 *   - All methods are synchronous — safe to call before or inside any transaction.
 *
 * Usage:
 *   // 1. Build the DTO (pure, no IO)
 *   const entry = AuditEngine.build({
 *     action: AuditAction.EMPLOYEE_DISABLED,
 *     targetType: AuditTargetType.User,
 *     targetId: employeeId,
 *     context: { actorId: user.id, businessId: user.businessId },
 *     before: { name: employee.name, role: employee.role },
 *   })
 *
 *   // 2. Persist (Application Layer, after the primary mutation succeeds)
 *   await recordAudit(entry)
 */

import type { AuditAction, AuditContext, AuditEntryDTO, AuditTargetType } from './types'

// ---------------------------------------------------------------------------
// BuildParams
// Input shape for AuditEngine.build(). All fields are explicit — no global
// state is read inside the engine.
// ---------------------------------------------------------------------------

export type BuildAuditEntryParams = {
  action: AuditAction
  targetType: AuditTargetType
  /** DB id of the entity being acted upon. */
  targetId: string
  /** Who did it, from which business, and from which IP. */
  context: AuditContext
  /**
   * State of the entity before the change.
   * Pass null for pure-create actions (EMPLOYEE_CREATED, etc.).
   * Strip sensitive fields (passwords, tokens) before passing.
   */
  before?: Record<string, unknown> | null
  /**
   * State of the entity after the change.
   * Pass null for hard-delete actions. For soft-deletes, pass the updated snapshot.
   * Strip sensitive fields before passing.
   */
  after?: Record<string, unknown> | null
}

// ---------------------------------------------------------------------------
// AuditEngine
// ---------------------------------------------------------------------------

export const AuditEngine = {
  /**
   * build
   *
   * Constructs an AuditEntryDTO from the provided parameters.
   * The caller is responsible for persisting the returned DTO.
   *
   * Sensitive fields (passwords, tokens, secrets) must be stripped by the
   * caller before passing them as `before` / `after` snapshots.
   */
  build(params: BuildAuditEntryParams): AuditEntryDTO {
    return {
      businessId: params.context.businessId,
      actorId: params.context.actorId,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      before: params.before ?? null,
      after: params.after ?? null,
      ipAddress: params.context.ipAddress ?? null,
    }
  },

  /**
   * stripSensitive
   *
   * Removes known sensitive keys from a snapshot object before it is stored
   * in the audit log. Call this on `before` / `after` snapshots that come
   * from raw entity reads.
   *
   * Extend SENSITIVE_KEYS as new secret fields are added to the schema.
   */
  stripSensitive(snapshot: Record<string, unknown>): Record<string, unknown> {
    const SENSITIVE_KEYS = new Set(['password', 'hashedPassword', 'token', 'secret', 'accessToken', 'refreshToken', 'otp', 'verificationToken'])

    return Object.fromEntries(Object.entries(snapshot).filter(([key]) => !SENSITIVE_KEYS.has(key)))
  },
}
