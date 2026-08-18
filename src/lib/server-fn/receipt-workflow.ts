/**
 * receipt-workflow.ts
 *
 * Goods Receipt Note (GRN) lifecycle state machine — the third production
 * consumer of createWorkflow() from src/lib/workflow.ts.
 *
 * ADR-002: activation condition satisfied. Three simultaneous consumers:
 *   1. purchaseWorkflow  (Phase D)
 *   2. taskWorkflow      (Phase D migration)
 *   3. receiptWorkflow   (Phase E — this file)
 *
 * GRN lifecycle:
 *
 *   PENDING ──► CONFIRMED  (goods accepted; inventory is credited)
 *            └► DISPUTED   (discrepancy found; inventory NOT credited)
 *
 * Both CONFIRMED and DISPUTED are terminal. A disputed GRN requires a new
 * receipt to be created after the supplier resolves the issue.
 *
 * Context shape: ReceiptWorkflowContext
 *   userRole — the current user's Role string
 *   userId   — the current user's id
 */

import { GoodsReceiptStatus, Role } from 'prisma/generated/prisma/enums'
import { createWorkflow } from '@/lib/workflow'

// ---------------------------------------------------------------------------
// Context shape passed to every guard
// ---------------------------------------------------------------------------

export interface ReceiptWorkflowContext {
  userRole: string
  userId: string
}

// ---------------------------------------------------------------------------
// Guard helpers
// ---------------------------------------------------------------------------

/** Passes only when the caller holds one of the listed roles. */
function requireRole(...roles: Role[]) {
  return (ctx: ReceiptWorkflowContext): string | null =>
    (roles as string[]).includes(ctx.userRole) ? null : `This action requires one of: ${roles.join(', ')}. Your role: ${ctx.userRole}`
}

// ---------------------------------------------------------------------------
// Receipt workflow definition
// ---------------------------------------------------------------------------

export const receiptWorkflow = createWorkflow<GoodsReceiptStatus, ReceiptWorkflowContext>({
  states: [GoodsReceiptStatus.PENDING, GoodsReceiptStatus.CONFIRMED, GoodsReceiptStatus.DISPUTED],

  // Both outcomes are terminal — no further transitions once a GRN is resolved
  terminalStates: [GoodsReceiptStatus.CONFIRMED, GoodsReceiptStatus.DISPUTED],

  transitions: [
    // ── Confirm receipt (inventory is credited on this transition) ───────────
    {
      from: GoodsReceiptStatus.PENDING,
      to: GoodsReceiptStatus.CONFIRMED,
      guards: [requireRole(Role.SUPERVISOR, Role.ADMIN)],
      meta: {
        buttonLabel: 'Confirm Receipt',
        label: 'Confirmed',
        variant: 'default',
      },
    },

    // ── Flag as disputed (inventory NOT credited; awaits supplier resolution) ─
    {
      from: GoodsReceiptStatus.PENDING,
      to: GoodsReceiptStatus.DISPUTED,
      guards: [requireRole(Role.CASHIER, Role.SUPERVISOR, Role.ADMIN)],
      meta: {
        buttonLabel: 'Flag Discrepancy',
        label: 'Disputed',
        variant: 'destructive',
      },
    },
  ],
})

// ---------------------------------------------------------------------------
// UI metadata helper — parallel to getPurchaseStatusUIMetadata
// ---------------------------------------------------------------------------

export function getReceiptStatusUIMetadata(status: GoodsReceiptStatus): {
  label: string
  colorClass: string
} {
  const uiMap: Record<GoodsReceiptStatus, { label: string; colorClass: string }> = {
    [GoodsReceiptStatus.PENDING]: {
      label: 'Pending',
      colorClass: 'text-amber-600 border-amber-200 bg-amber-50',
    },
    [GoodsReceiptStatus.CONFIRMED]: {
      label: 'Confirmed',
      colorClass: 'text-emerald-600 border-emerald-200 bg-emerald-50',
    },
    [GoodsReceiptStatus.DISPUTED]: {
      label: 'Disputed',
      colorClass: 'text-destructive border-destructive/20 bg-destructive/5',
    },
  }
  return uiMap[status] ?? { label: status, colorClass: '' }
}
