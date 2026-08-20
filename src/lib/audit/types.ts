/**
 * audit/types.ts
 *
 * Shared plain-object types for the Audit domain.
 * No infrastructure dependencies — safe to import from any layer.
 *
 * Follows the same const-object + union pattern used in billing/types.ts.
 * No TypeScript enums (erasableSyntaxOnly constraint).
 */

// ---------------------------------------------------------------------------
// AuditAction
// Every auditable action in the system. Add new values here as new destructive
// or privilege-elevating admin operations are identified.
// ---------------------------------------------------------------------------

export const AuditAction = {
  // Employee management
  EMPLOYEE_CREATED: 'EMPLOYEE_CREATED',
  EMPLOYEE_UPDATED: 'EMPLOYEE_UPDATED',
  EMPLOYEE_DISABLED: 'EMPLOYEE_DISABLED', // soft-delete (deletedAt set)
  EMPLOYEE_ROLE_CHANGED: 'EMPLOYEE_ROLE_CHANGED',
  EMPLOYEE_SESSION_REVOKED: 'EMPLOYEE_SESSION_REVOKED',

  // Financial operations
  TRANSACTION_REFUNDED: 'TRANSACTION_REFUNDED',
  PURCHASE_VOIDED: 'PURCHASE_VOIDED',

  // Sequence allocation failures (Phase 1: Server-side atomic allocation)
  SEQUENCE_ALLOCATION_FAILED: 'SEQUENCE_ALLOCATION_FAILED', // Sequence allocated but transaction failed

  // Account lifecycle
  ACCOUNT_DELETION_REQUESTED: 'ACCOUNT_DELETION_REQUESTED',
  ACCOUNT_DELETED: 'ACCOUNT_DELETED',

  // Business settings
  BUSINESS_SETTINGS_CHANGED: 'BUSINESS_SETTINGS_CHANGED',
  SUBSCRIPTION_PLAN_CHANGED: 'SUBSCRIPTION_PLAN_CHANGED',
} as const

export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction]

// ---------------------------------------------------------------------------
// AuditTargetType
// The entity type that was affected. Maps 1-to-1 with Prisma model names
// for clarity and easy JOIN if ever needed.
// ---------------------------------------------------------------------------

export const AuditTargetType = {
  User: 'User',
  Membership: 'Membership',
  Transaction: 'Transaction',
  Purchase: 'Purchase',
  Business: 'Business',
  BusinessSubscription: 'BusinessSubscription',
  Session: 'Session',
  SequenceCounter: 'SequenceCounter', // For sequence allocation failures
} as const

export type AuditTargetType = (typeof AuditTargetType)[keyof typeof AuditTargetType]

// ---------------------------------------------------------------------------
// AuditContext
// Caller-provided context injected by the Application Layer.
// The engine never reads authStore or HTTP context directly.
// ---------------------------------------------------------------------------

export type AuditContext = {
  /** ID of the user performing the action. */
  actorId: string
  /** Business that owns this audit record. */
  businessId: string
  /** Optional: IP address of the actor's current session. */
  ipAddress?: string | null
}

// ---------------------------------------------------------------------------
// AuditEntryDTO
// Plain DTO for an AuditLog row. Returned by AuditEngine.build() and
// persisted by the Application Layer. The engine never writes to the DB.
// ---------------------------------------------------------------------------

export type AuditEntryDTO = {
  businessId: string
  actorId: string
  action: AuditAction
  targetType: AuditTargetType
  targetId: string
  /** Snapshot of the entity state before the change. Null for create actions. */
  before: Record<string, unknown> | null
  /** Snapshot of the entity state after the change. Null for delete actions. */
  after: Record<string, unknown> | null
  ipAddress: string | null
}
