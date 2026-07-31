/**
 * purchase-workflow.ts
 *
 * Purchase lifecycle state machine — the first production consumer of
 * createWorkflow() from src/lib/workflow.ts.
 *
 * ADR-002: This file's existence simultaneously justifies the framework and
 * triggers the task-workflow.ts migration (D5).
 *
 * Purchase lifecycle:
 *
 *   DRAFT ──► PENDING_APPROVAL ──► APPROVED ──► RECEIVED (terminal)
 *     │                                             │
 *     └────────────────────────────────────────────►┘  (quick-receive: skip approval)
 *                            VOIDED (terminal — from RECEIVED or APPROVED)
 *                            CLOSED (terminal — from RECEIVED, archival)
 *
 * Context shape: PurchaseWorkflowContext
 *   userRole   — the current user's Role string
 *   userId     — the current user's id (for future identity guards)
 */

import { PurchaseStatus, Role } from 'prisma/generated/prisma/enums'
import { createWorkflow } from '@/lib/workflow'

// ---------------------------------------------------------------------------
// Context shape passed to every guard
// ---------------------------------------------------------------------------

export interface PurchaseWorkflowContext {
  userRole: string
  userId: string
}

// ---------------------------------------------------------------------------
// Guard helpers
// ---------------------------------------------------------------------------

/** Passes only when the caller holds one of the listed roles. */
function requireRole(...roles: Role[]) {
  return (ctx: PurchaseWorkflowContext): string | null =>
    (roles as string[]).includes(ctx.userRole) ? null : `This action requires one of: ${roles.join(', ')}. Your role: ${ctx.userRole}`
}

// ---------------------------------------------------------------------------
// Purchase workflow definition
// ---------------------------------------------------------------------------

export const purchaseWorkflow = createWorkflow<PurchaseStatus, PurchaseWorkflowContext>({
  states: [
    PurchaseStatus.DRAFT,
    PurchaseStatus.PENDING_APPROVAL,
    PurchaseStatus.APPROVED,
    PurchaseStatus.RECEIVED,
    PurchaseStatus.VOIDED,
    PurchaseStatus.CLOSED,
  ],

  terminalStates: [PurchaseStatus.RECEIVED, PurchaseStatus.VOIDED, PurchaseStatus.CLOSED],

  transitions: [
    // ── Submission ──────────────────────────────────────────────────────────
    {
      from: PurchaseStatus.DRAFT,
      to: PurchaseStatus.PENDING_APPROVAL,
      guards: [requireRole(Role.CASHIER, Role.SUPERVISOR, Role.ADMIN)],
      meta: {
        buttonLabel: 'Submit for Approval',
        label: 'Pending Approval',
        variant: 'default',
      },
    },

    // ── Quick-receive (skip approval — same as current default flow) ─────────
    {
      from: PurchaseStatus.DRAFT,
      to: PurchaseStatus.RECEIVED,
      guards: [requireRole(Role.SUPERVISOR, Role.ADMIN)],
      meta: {
        buttonLabel: 'Receive Immediately',
        label: 'Received',
        variant: 'default',
      },
    },

    // ── Approval ─────────────────────────────────────────────────────────────
    {
      from: PurchaseStatus.PENDING_APPROVAL,
      to: PurchaseStatus.APPROVED,
      guards: [requireRole(Role.SUPERVISOR, Role.ADMIN)],
      meta: {
        buttonLabel: 'Approve Purchase',
        label: 'Approved',
        variant: 'default',
      },
    },

    // Reject back to draft so the clerk can amend
    {
      from: PurchaseStatus.PENDING_APPROVAL,
      to: PurchaseStatus.DRAFT,
      guards: [requireRole(Role.SUPERVISOR, Role.ADMIN)],
      meta: {
        buttonLabel: 'Reject / Return to Draft',
        label: 'Draft',
        variant: 'destructive',
      },
    },

    // ── Goods receipt ────────────────────────────────────────────────────────
    {
      from: PurchaseStatus.APPROVED,
      to: PurchaseStatus.RECEIVED,
      guards: [requireRole(Role.CASHIER, Role.SUPERVISOR, Role.ADMIN)],
      meta: {
        buttonLabel: 'Confirm Goods Received',
        label: 'Received',
        variant: 'default',
      },
    },

    // ── Void (reversal) ──────────────────────────────────────────────────────
    // Only SUPERVISOR/ADMIN can void a received purchase
    {
      from: PurchaseStatus.RECEIVED,
      to: PurchaseStatus.VOIDED,
      guards: [requireRole(Role.SUPERVISOR, Role.ADMIN)],
      meta: {
        buttonLabel: 'Void Purchase',
        label: 'Voided',
        variant: 'destructive',
      },
    },

    // Void an approved-but-not-yet-received purchase (cancellation)
    {
      from: PurchaseStatus.APPROVED,
      to: PurchaseStatus.VOIDED,
      guards: [requireRole(Role.SUPERVISOR, Role.ADMIN)],
      meta: {
        buttonLabel: 'Cancel Purchase',
        label: 'Voided',
        variant: 'destructive',
      },
    },

    // ── Archive ──────────────────────────────────────────────────────────────
    {
      from: PurchaseStatus.RECEIVED,
      to: PurchaseStatus.CLOSED,
      guards: [requireRole(Role.SUPERVISOR, Role.ADMIN)],
      meta: {
        buttonLabel: 'Archive / Close',
        label: 'Closed',
        variant: 'secondary',
      },
    },
  ],
})

// ---------------------------------------------------------------------------
// UI metadata helper — parallel to getStatusUIMetadata in task-workflow.ts
// ---------------------------------------------------------------------------

export function getPurchaseStatusUIMetadata(status: PurchaseStatus): {
  label: string
  colorClass: string
} {
  const uiMap: Record<PurchaseStatus, { label: string; colorClass: string }> = {
    [PurchaseStatus.DRAFT]: {
      label: 'Draft',
      colorClass: 'text-zinc-600 border-zinc-200 bg-zinc-50',
    },
    [PurchaseStatus.PENDING_APPROVAL]: {
      label: 'Pending Approval',
      colorClass: 'text-amber-600 border-amber-200 bg-amber-50',
    },
    [PurchaseStatus.APPROVED]: {
      label: 'Approved',
      colorClass: 'text-purple-600 border-purple-200 bg-purple-50',
    },
    [PurchaseStatus.RECEIVED]: {
      label: 'Received',
      colorClass: 'text-emerald-600 border-emerald-200 bg-emerald-50',
    },
    [PurchaseStatus.VOIDED]: {
      label: 'Voided',
      colorClass: 'text-destructive border-destructive/20 bg-destructive/5',
    },
    [PurchaseStatus.CLOSED]: {
      label: 'Closed',
      colorClass: 'text-zinc-500 border-zinc-200 bg-zinc-50',
    },
  }
  return uiMap[status] ?? { label: status, colorClass: '' }
}
