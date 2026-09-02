/**
 * task-workflow.ts
 *
 * Task lifecycle state machine — migrated to createWorkflow() at Phase D.
 * Migration is justified by the simultaneous introduction of purchaseWorkflow
 * as the second consumer (ADR-002).
 *
 * All previously exported symbols are preserved for backward compatibility
 * with existing consumers:
 *   - STATUS_PRIORITY         (unchanged — display utility, not in framework)
 *   - TransitionUIConfig      (unchanged — used by getAllowedTransitionsForUser)
 *   - TRANSITION_UI_CONFIG    (kept as re-export for any future direct readers)
 *   - WORKFLOW_TRANSITIONS    (kept as re-export for any future direct readers)
 *   - getTaskWorkflowRules    (unchanged — display utility, not in framework)
 *   - getValidNextStatuses    (unchanged — GENERAL_CHORE override logic)
 *   - checkWorkflowPermission (now delegates to taskWorkflow.canTransition)
 *   - getAllowedTransitionsForUser (now delegates to taskWorkflow.allowedTransitions)
 *   - getStatusUIMetadata     (unchanged — display utility, not in framework)
 */

import { TaskStatus, TaskType } from 'prisma/generated/prisma/enums'
import type { feTask } from '@/lib/queries/fetch-tasks'
import type { TransitionDef } from '@/lib/workflow'
import { createWorkflow } from '@/lib/workflow'

// ---------------------------------------------------------------------------
// Status display priority (unchanged — display utility, not in framework)
// ---------------------------------------------------------------------------

export const STATUS_PRIORITY: Record<TaskStatus, number> = {
  [TaskStatus.DRAFT]: 0,
  [TaskStatus.PENDING]: 1,
  [TaskStatus.APPROVED]: 2,
  [TaskStatus.IN_PROGRESS]: 3,
  [TaskStatus.FULFILLED]: 4,
  [TaskStatus.REVIEWED]: 5,
  [TaskStatus.CANCELLED]: -1,
}

// ---------------------------------------------------------------------------
// StatusRules — used by task-details-tab.tsx for conditional rendering
// ---------------------------------------------------------------------------

export interface StatusRules {
  isTerminal: boolean
  hasPassedApproval: boolean
  hasPassedFulfillment: boolean
  hasPassedReview: boolean
}

export function getTaskWorkflowRules(currentStatus: TaskStatus): StatusRules {
  const currentWeight = STATUS_PRIORITY[currentStatus] ?? 0
  return {
    isTerminal: taskWorkflow.isTerminal(currentStatus),
    hasPassedApproval: currentWeight >= STATUS_PRIORITY[TaskStatus.APPROVED] && currentWeight !== -1,
    hasPassedFulfillment: currentWeight >= STATUS_PRIORITY[TaskStatus.FULFILLED] && currentWeight !== -1,
    hasPassedReview: currentWeight >= STATUS_PRIORITY[TaskStatus.REVIEWED] && currentWeight !== -1,
  }
}

// ---------------------------------------------------------------------------
// Workflow context
// ---------------------------------------------------------------------------

export interface TaskWorkflowContext {
  userRole: string
  userId: string
  taskClerkId?: string | null | undefined
  taskApproverId?: string | null | undefined
  taskReviewerId?: string | null | undefined
}

// ---------------------------------------------------------------------------
// Guard helpers
// ---------------------------------------------------------------------------

function requireRole(...roles: string[]) {
  return (ctx: TaskWorkflowContext): string | null =>
    roles.includes(ctx.userRole) ? null : `This action requires one of: ${roles.join(', ')}. Your role: ${ctx.userRole}`
}

/** Passes when there is no assigned identity, or the caller IS that person. */
function requireAssignedOrUnset(selector: (ctx: TaskWorkflowContext) => string | null | undefined, label: string) {
  return (ctx: TaskWorkflowContext): string | null => {
    const assignedId = selector(ctx)
    if (!assignedId) return null
    return assignedId === ctx.userId ? null : `Only the assigned ${label} can perform this action.`
  }
}

/** Cancellation guard: if both approver and reviewer are set, one of them must be the caller. */
function requireApproverOrReviewerForCancel(ctx: TaskWorkflowContext): string | null {
  const { taskApproverId, taskReviewerId, userId } = ctx
  if (taskApproverId && taskReviewerId) {
    return taskApproverId === userId || taskReviewerId === userId ? null : 'Only the assigned approver or reviewer can cancel this task.'
  }
  if (taskApproverId && taskApproverId !== userId) return 'Only the assigned approver can cancel this task.'
  if (taskReviewerId && taskReviewerId !== userId) return 'Only the assigned reviewer can cancel this task.'
  return null
}

// ---------------------------------------------------------------------------
// taskWorkflow — createWorkflow() consumer #2 (task-workflow.ts migration)
// ---------------------------------------------------------------------------

export const taskWorkflow = createWorkflow<TaskStatus, TaskWorkflowContext>({
  states: [TaskStatus.DRAFT, TaskStatus.PENDING, TaskStatus.APPROVED, TaskStatus.IN_PROGRESS, TaskStatus.FULFILLED, TaskStatus.REVIEWED, TaskStatus.CANCELLED],

  terminalStates: [TaskStatus.REVIEWED, TaskStatus.CANCELLED],

  transitions: [
    // DRAFT → PENDING (submit for approval)
    {
      from: TaskStatus.DRAFT,
      to: TaskStatus.PENDING,
      guards: [requireRole('CASHIER', 'SUPERVISOR', 'ADMIN')],
      meta: { buttonLabel: 'Submit for Approval', label: 'Pending Approval', variant: 'default' },
    },

    // PENDING → APPROVED
    {
      from: TaskStatus.PENDING,
      to: TaskStatus.APPROVED,
      guards: [requireRole('SUPERVISOR', 'ADMIN'), requireAssignedOrUnset(c => c.taskApproverId, 'approver')],
      meta: { buttonLabel: 'Approve Task', label: 'Approved', variant: 'default' },
    },

    // PENDING → CANCELLED
    {
      from: TaskStatus.PENDING,
      to: TaskStatus.CANCELLED,
      guards: [requireRole('SUPERVISOR', 'ADMIN'), requireApproverOrReviewerForCancel],
      meta: { buttonLabel: 'Reject / Cancel', label: 'Cancelled', variant: 'destructive' },
    },

    // APPROVED → IN_PROGRESS
    {
      from: TaskStatus.APPROVED,
      to: TaskStatus.IN_PROGRESS,
      guards: [requireRole('CASHIER', 'SUPERVISOR', 'ADMIN'), requireAssignedOrUnset(c => c.taskClerkId, 'clerk')],
      meta: { buttonLabel: 'Start Execution', label: 'In Progress', variant: 'default' },
    },

    // IN_PROGRESS → FULFILLED
    {
      from: TaskStatus.IN_PROGRESS,
      to: TaskStatus.FULFILLED,
      guards: [requireRole('CASHIER', 'SUPERVISOR', 'ADMIN'), requireAssignedOrUnset(c => c.taskClerkId, 'clerk')],
      meta: { buttonLabel: 'Mark as Fulfilled', label: 'Fulfilled', variant: 'default' },
    },

    // IN_PROGRESS → CANCELLED
    {
      from: TaskStatus.IN_PROGRESS,
      to: TaskStatus.CANCELLED,
      guards: [requireRole('SUPERVISOR', 'ADMIN'), requireApproverOrReviewerForCancel],
      meta: { buttonLabel: 'Halt / Cancel', label: 'Cancelled', variant: 'destructive' },
    },

    // FULFILLED → REVIEWED
    {
      from: TaskStatus.FULFILLED,
      to: TaskStatus.REVIEWED,
      guards: [requireRole('SUPERVISOR', 'ADMIN'), requireAssignedOrUnset(c => c.taskReviewerId, 'reviewer')],
      meta: { buttonLabel: 'Verify & Lock', label: 'Reviewed & Locked', variant: 'default' },
    },
  ],
})

// ---------------------------------------------------------------------------
// WORKFLOW_TRANSITIONS — re-exported for any direct reader
// ---------------------------------------------------------------------------

export const WORKFLOW_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  [TaskStatus.DRAFT]: [TaskStatus.PENDING],
  [TaskStatus.PENDING]: [TaskStatus.APPROVED, TaskStatus.CANCELLED],
  [TaskStatus.APPROVED]: [TaskStatus.IN_PROGRESS],
  [TaskStatus.IN_PROGRESS]: [TaskStatus.FULFILLED, TaskStatus.CANCELLED],
  [TaskStatus.FULFILLED]: [TaskStatus.REVIEWED],
  [TaskStatus.REVIEWED]: [],
  [TaskStatus.CANCELLED]: [],
}

// ---------------------------------------------------------------------------
// TransitionUIConfig — kept for backward compat with getAllowedTransitionsForUser
// ---------------------------------------------------------------------------

export interface TransitionUIConfig {
  value: TaskStatus
  label: string
  buttonLabel: string
  variant: 'default' | 'outline' | 'secondary' | 'destructive'
  roleRequired: string[]
}

// The raw TRANSITION_UI_CONFIG record is now derived from the workflow definition
// to avoid duplication. Kept as a re-export for any future direct readers.
export const TRANSITION_UI_CONFIG: Record<TaskStatus, Record<TaskStatus, Omit<TransitionUIConfig, 'value'>>> = (() => {
  const config: Partial<Record<TaskStatus, Partial<Record<TaskStatus, Omit<TransitionUIConfig, 'value'>>>>> = {}
  // Build from the canonical transition list — source of truth is taskWorkflow above
  const transitions: TransitionDef<TaskStatus, TaskWorkflowContext>[] = [
    { from: TaskStatus.DRAFT, to: TaskStatus.PENDING, guards: [], meta: { buttonLabel: 'Submit for Approval', label: 'Pending Approval', variant: 'default' } },
    { from: TaskStatus.PENDING, to: TaskStatus.APPROVED, guards: [], meta: { buttonLabel: 'Approve Task', label: 'Approved', variant: 'default' } },
    { from: TaskStatus.PENDING, to: TaskStatus.CANCELLED, guards: [], meta: { buttonLabel: 'Reject / Cancel', label: 'Cancelled', variant: 'destructive' } },
    { from: TaskStatus.APPROVED, to: TaskStatus.IN_PROGRESS, guards: [], meta: { buttonLabel: 'Start Execution', label: 'In Progress', variant: 'default' } },
    { from: TaskStatus.IN_PROGRESS, to: TaskStatus.FULFILLED, guards: [], meta: { buttonLabel: 'Mark as Fulfilled', label: 'Fulfilled', variant: 'default' } },
    { from: TaskStatus.IN_PROGRESS, to: TaskStatus.CANCELLED, guards: [], meta: { buttonLabel: 'Halt / Cancel', label: 'Cancelled', variant: 'destructive' } },
    { from: TaskStatus.FULFILLED, to: TaskStatus.REVIEWED, guards: [], meta: { buttonLabel: 'Verify & Lock', label: 'Reviewed & Locked', variant: 'default' } },
  ]
  for (const t of transitions) {
    if (!config[t.from]) config[t.from] = {}
    config[t.from]![t.to] = {
      buttonLabel: t.meta.buttonLabel,
      label: t.meta.label,
      variant: t.meta.variant,
      roleRequired: [],
    }
  }
  return config as Record<TaskStatus, Record<TaskStatus, Omit<TransitionUIConfig, 'value'>>>
})()

// ---------------------------------------------------------------------------
// getValidNextStatuses — preserves GENERAL_CHORE override
// ---------------------------------------------------------------------------

export function getValidNextStatuses(currentStatus: TaskStatus, taskType?: TaskType): TaskStatus[] {
  const baseTransitions = WORKFLOW_TRANSITIONS[currentStatus] || []
  // GENERAL_CHORE: PENDING skips APPROVED and goes directly to IN_PROGRESS
  if (taskType === TaskType.GENERAL_CHORE && currentStatus === TaskStatus.PENDING) {
    return [TaskStatus.IN_PROGRESS, TaskStatus.CANCELLED]
  }
  return baseTransitions
}

// ---------------------------------------------------------------------------
// checkWorkflowPermission — backward-compat wrapper over taskWorkflow.canTransition
// ---------------------------------------------------------------------------

export function checkWorkflowPermission(args: {
  currentStatus: TaskStatus
  targetStatus: TaskStatus
  taskType?: TaskType
  userRole: string
  taskClerkId?: string | null
  taskApproverId?: string | null
  taskReviewerId?: string | null
  currentUserId: string
}): boolean {
  const { currentStatus, targetStatus, taskType, userRole, taskClerkId, taskApproverId, taskReviewerId, currentUserId } = args

  // GENERAL_CHORE override: treat PENDING→IN_PROGRESS as APPROVED→IN_PROGRESS
  const effectiveFrom =
    taskType === TaskType.GENERAL_CHORE && currentStatus === TaskStatus.PENDING && targetStatus === TaskStatus.IN_PROGRESS ? TaskStatus.APPROVED : currentStatus

  const ctx: TaskWorkflowContext = {
    userRole,
    userId: currentUserId,
    taskClerkId,
    taskApproverId,
    taskReviewerId,
  }

  const result = taskWorkflow.canTransition(effectiveFrom, targetStatus, ctx)
  return result.ok
}

// ---------------------------------------------------------------------------
// getAllowedTransitionsForUser — backward-compat, returns TransitionUIConfig[]
// ---------------------------------------------------------------------------

export function getAllowedTransitionsForUser(task: feTask, user: { id: string; role: string } | null | undefined): TransitionUIConfig[] {
  if (!user) return []

  const rawNextStates = getValidNextStatuses(task.status, task.type)

  return rawNextStates
    .filter(targetStatus =>
      checkWorkflowPermission({
        currentStatus: task.status,
        targetStatus,
        taskType: task.type,
        userRole: user.role,
        taskClerkId: task.clerkId,
        taskApproverId: task.approverId,
        taskReviewerId: task.reviewerId,
        currentUserId: user.id,
      }),
    )
    .map(targetStatus => {
      const def = taskWorkflow.getTransition(task.status, targetStatus)

      // Fallback for GENERAL_CHORE override (PENDING→IN_PROGRESS uses APPROVED→IN_PROGRESS meta)
      const fallbackDef =
        task.type === TaskType.GENERAL_CHORE && task.status === TaskStatus.PENDING && targetStatus === TaskStatus.IN_PROGRESS
          ? taskWorkflow.getTransition(TaskStatus.APPROVED, TaskStatus.IN_PROGRESS)
          : null

      const meta = (def ?? fallbackDef)?.meta

      return {
        value: targetStatus,
        label: meta?.label ?? targetStatus,
        buttonLabel: meta?.buttonLabel ?? targetStatus,
        variant: meta?.variant ?? 'default',
        roleRequired: [],
      }
    })
}

// ---------------------------------------------------------------------------
// getStatusUIMetadata — display utility, unchanged
// ---------------------------------------------------------------------------

export function getStatusUIMetadata(status: TaskStatus) {
  const uiMap: Record<TaskStatus, { label: string; colorClass: string }> = {
    [TaskStatus.DRAFT]: { label: 'Draft', colorClass: 'text-zinc-600 border-zinc-200 bg-zinc-50' },
    [TaskStatus.PENDING]: { label: 'Pending Approval', colorClass: 'text-amber-600 border-amber-200 bg-amber-50' },
    [TaskStatus.APPROVED]: { label: 'Approved', colorClass: 'text-purple-600 border-purple-200 bg-purple-50' },
    [TaskStatus.IN_PROGRESS]: { label: 'In Progress', colorClass: 'text-blue-600 border-blue-200 bg-blue-50' },
    [TaskStatus.FULFILLED]: { label: 'Fulfilled', colorClass: 'text-indigo-600 border-indigo-200 bg-indigo-50' },
    [TaskStatus.REVIEWED]: { label: 'Reviewed & Locked', colorClass: 'text-emerald-600 border-emerald-200 bg-emerald-50' },
    [TaskStatus.CANCELLED]: { label: 'Cancelled', colorClass: 'text-destructive border-destructive/20 bg-destructive/5' },
  }
  return uiMap[status] || { label: status, colorClass: '' }
}
