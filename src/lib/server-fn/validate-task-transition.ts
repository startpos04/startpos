/**
 * validate-task-transition.ts
 *
 * Server-side task transition validator — resolves Architecture Compliance
 * Deviation 1 (B1, medium severity).
 *
 * Architecture Compliance — Phase 6 (Section 6.1, Deferred Item B1):
 *   "B1 server-side task authorization: when entitlement middleware is added to
 *    server functions in Phase 2, the same infrastructure can be used to implement
 *    the task authorization server function."
 *
 * Problem resolved:
 *   Previously, `checkWorkflowPermission` ran only in the client process.
 *   A technically capable actor who constructed a direct `transactionAPI` call
 *   bypassed it entirely. The comment in `tasks/$taskId/index.tsx` explicitly
 *   documented this gap:
 *     "Full server-side enforcement requires a TanStack Start server function
 *      that reads the task from Prisma and calls checkWorkflowPermission with
 *      the server-fetched state before returning a permission token."
 *   This file IS that server function.
 *
 * What it does:
 *   1. Reads the task record from the server (authoritative — not from client state).
 *   2. Calls `checkWorkflowPermission` with the server-fetched task state.
 *   3. Returns { permitted: true } or { permitted: false, reason: string }.
 *
 * Why a separate server function (not inline in the transition handler):
 *   The `dbTransaction` callback is synchronous and offline-first — it cannot
 *   make async server calls. The validation must happen BEFORE the dbTransaction
 *   begins. Separating the validation call from the local write is the correct
 *   pattern for server-authoritative checks combined with offline-first writes.
 *
 * Calling pattern (in tasks/$taskId/index.tsx):
 *   1. Call `validateTaskTransition({ data: { taskId, targetStatus } })`.
 *   2. If `result.permitted === false`, show `result.reason` in a toast and abort.
 *   3. If `result.permitted === true`, proceed to `dbTransaction(...)`.
 *
 * Security properties:
 *   - Reads task state from Prisma (not from client-provided payload) — prevents
 *     spoofed currentStatus attacks where the client sends a different `from` state.
 *   - Runs inside `authMiddleware` — the session user's businessId and branchId
 *     are injected by the server, not trusted from the client.
 *   - Returns a structured result (not a thrown error) so the caller can display
 *     the specific denial reason rather than catching a generic exception.
 *
 * Entitlement check:
 *   Task transitions that involve OPERATIONAL capabilities (CREATE_TASK) are also
 *   checked via entitlementMiddleware. Transitions that are purely workflow-level
 *   (PENDING → APPROVED, etc.) are workflow-permission checks only — the
 *   CREATE_TASK capability gate applies at task creation, not status updates.
 *   The entitlement check for CREATE_TASK is intentionally not applied here because
 *   all post-creation transitions are management operations, not new creation events.
 */

import { createServerFn } from '@tanstack/react-start'
import { TaskStatus } from 'prisma/generated/prisma/enums'
import { checkWorkflowPermission } from '../../routes/(private)/tasks/$taskId/-components/task-workflow'
import { authMiddleware } from '@startpos-core/lib/better-auth/auth-middleware'
import { getTenantPrisma } from '@startpos-core/lib/prisma-client'

// ---------------------------------------------------------------------------
// Input / Output types
// ---------------------------------------------------------------------------

export interface ValidateTaskTransitionInput {
  taskId: string
  targetStatus: TaskStatus
}

export type ValidateTaskTransitionResult = { permitted: true } | { permitted: false; reason: string }

// ---------------------------------------------------------------------------
// Server function
// ---------------------------------------------------------------------------

export const validateTaskTransition = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((d: ValidateTaskTransitionInput) => d)
  .handler(async ({ data, context }): Promise<ValidateTaskTransitionResult> => {
    if (!context?.user?.businessId || !context?.user?.branchId) {
      return { permitted: false, reason: 'Session context missing. Please refresh and try again.' }
    }

    const { businessId, branchId, id: userId, role: userRole } = context.user

    const prisma = getTenantPrisma(businessId, branchId)

    // -----------------------------------------------------------------------
    // 1. Fetch the authoritative task state from the server.
    //    This is the key security property: we do NOT trust the client's
    //    description of the current task state. We read it from Prisma.
    // -----------------------------------------------------------------------
    const task = await prisma.operationalTask.findUnique({
      where: { id: data.taskId },
      select: {
        id: true,
        status: true,
        type: true,
        clerkId: true,
        approverId: true,
        reviewerId: true,
        businessId: true,
        branchId: true,
      },
    })

    if (!task) {
      return { permitted: false, reason: 'Task not found or has been deleted.' }
    }

    // -----------------------------------------------------------------------
    // 2. Tenant isolation — confirm the task belongs to the session's business.
    //    getTenantPrisma already scopes queries to businessId + branchId, but
    //    we assert explicitly as an additional defence-in-depth check.
    // -----------------------------------------------------------------------
    if (task.businessId !== businessId || task.branchId !== branchId) {
      return { permitted: false, reason: 'Access denied: task does not belong to your branch.' }
    }

    // -----------------------------------------------------------------------
    // 3. Validate the target status is a valid TaskStatus value.
    //    Prevents injection of arbitrary string values via the API payload.
    // -----------------------------------------------------------------------
    const validStatuses = Object.values(TaskStatus) as string[]
    if (!validStatuses.includes(data.targetStatus)) {
      return { permitted: false, reason: `Invalid target status: ${data.targetStatus}` }
    }

    // -----------------------------------------------------------------------
    // 4. Run the workflow permission check with server-fetched task state.
    //    `checkWorkflowPermission` is a pure function from task-workflow.ts —
    //    it does not touch Prisma or any collection. It is safe to call here.
    // -----------------------------------------------------------------------
    const permitted = checkWorkflowPermission({
      currentStatus: task.status,
      targetStatus: data.targetStatus,
      taskType: task.type,
      userRole: userRole as string,
      taskClerkId: task.clerkId,
      taskApproverId: task.approverId,
      taskReviewerId: task.reviewerId,
      currentUserId: userId,
    })

    if (!permitted) {
      // Build a human-readable reason. The taskWorkflow.canTransition() function
      // returns a reason string, but checkWorkflowPermission returns boolean.
      // We derive a contextual message based on the transition attempted.
      const denialReason = buildDenialReason({
        currentStatus: task.status,
        targetStatus: data.targetStatus,
        userRole: userRole as string,
      })
      return { permitted: false, reason: denialReason }
    }

    return { permitted: true }
  })

// ---------------------------------------------------------------------------
// Internal helper — build a readable denial message from transition context
// ---------------------------------------------------------------------------

function buildDenialReason(args: { currentStatus: TaskStatus; targetStatus: TaskStatus; userRole: string }): string {
  const { currentStatus, targetStatus, userRole } = args

  // Check if the transition itself is structurally invalid (no such edge in the workflow)
  const validTransitions: Partial<Record<TaskStatus, TaskStatus[]>> = {
    [TaskStatus.DRAFT]: [TaskStatus.PENDING],
    [TaskStatus.PENDING]: [TaskStatus.APPROVED, TaskStatus.CANCELLED],
    [TaskStatus.APPROVED]: [TaskStatus.IN_PROGRESS],
    [TaskStatus.IN_PROGRESS]: [TaskStatus.FULFILLED, TaskStatus.CANCELLED],
    [TaskStatus.FULFILLED]: [TaskStatus.REVIEWED],
  }

  const allowedNextStatuses = validTransitions[currentStatus] ?? []
  if (!allowedNextStatuses.includes(targetStatus)) {
    return `The transition from ${currentStatus} to ${targetStatus} is not a valid workflow step.`
  }

  // The transition is structurally valid but role-restricted
  return `Your role (${userRole}) does not have permission to move a task from ${currentStatus} to ${targetStatus}.`
}
