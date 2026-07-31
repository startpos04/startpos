/**
 * result.ts
 *
 * Domain-layer operation result type. Distinct from the infrastructure-layer
 * neverthrow ResultAsync used in dbTransaction / crudAPI.
 *
 * Usage:
 *   Infrastructure failures (network, sync, DB constraint) → neverthrow ResultAsync
 *   Business condition outcomes (permission denied, precondition failed) → OperationResult
 *
 * ADR-003: Accepted — Already Active
 * The discriminated union gives callers type-safe narrowing without try/catch.
 */

// ---------------------------------------------------------------------------
// Operation codes — machine-readable reason for branching in UI handlers
// ---------------------------------------------------------------------------

export type OperationCode =
  | 'PERMISSION_DENIED' // Role or identity guard rejected the action
  | 'PRECONDITION_FAILED' // State precondition not met (wrong status, missing data)
  | 'NOT_FOUND' // Required entity does not exist
  | 'CONFLICT' // Action conflicts with existing state
  | 'VALIDATION_FAILED' // Input did not pass domain validation

// ---------------------------------------------------------------------------
// OperationResult — typed outcome for synchronous domain operations
// ---------------------------------------------------------------------------

export type OperationResult<T = void> = { ok: true; value: T } | { ok: false; code: OperationCode; reason: string }

// ---------------------------------------------------------------------------
// Constructors
// ---------------------------------------------------------------------------

export function opOk(): OperationResult<void>
export function opOk<T>(value: T): OperationResult<T>
export function opOk<T>(value?: T): OperationResult<T | undefined> {
  return { ok: true, value }
}

export function opFail<T = void>(code: OperationCode, reason: string): OperationResult<T> {
  return { ok: false, code, reason }
}
