import { TaskStatus, TaskType } from 'prisma/generated/prisma/enums'
import type { feTask } from '@/lib/queries/fetch-tasks'

export const STATUS_PRIORITY: Record<TaskStatus, number> = {
  [TaskStatus.DRAFT]: 0,
  [TaskStatus.PENDING]: 1,
  [TaskStatus.APPROVED]: 2,
  [TaskStatus.IN_PROGRESS]: 3,
  [TaskStatus.FULFILLED]: 4,
  [TaskStatus.REVIEWED]: 5,
  [TaskStatus.CANCELLED]: -1,
}

export interface StatusRules {
  isTerminal: boolean
  hasPassedApproval: boolean
  hasPassedFulfillment: boolean
  hasPassedReview: boolean
}

export interface TransitionUIConfig {
  value: TaskStatus
  label: string
  buttonLabel: string
  variant: 'default' | 'outline' | 'secondary' | 'destructive'
  roleRequired: string[]
}

export const TRANSITION_UI_CONFIG: Record<TaskStatus, Record<TaskStatus, Omit<TransitionUIConfig, 'value'>>> = {
  [TaskStatus.DRAFT]: {
    [TaskStatus.PENDING]: {
      buttonLabel: 'Submit for Approval',
      label: 'Pending Approval',
      variant: 'default',
      roleRequired: ['CASHIER', 'SUPERVISOR', 'ADMIN'],
    },
  },
  [TaskStatus.PENDING]: {
    [TaskStatus.APPROVED]: { buttonLabel: 'Approve Task', label: 'Approved', variant: 'default', roleRequired: ['SUPERVISOR', 'ADMIN'] },
    [TaskStatus.CANCELLED]: { buttonLabel: 'Reject / Cancel', label: 'Cancelled', variant: 'destructive', roleRequired: ['SUPERVISOR', 'ADMIN'] },
  },
  [TaskStatus.APPROVED]: {
    [TaskStatus.IN_PROGRESS]: { buttonLabel: 'Start Execution', label: 'In Progress', variant: 'default', roleRequired: ['CASHIER', 'SUPERVISOR', 'ADMIN'] },
  },
  [TaskStatus.IN_PROGRESS]: {
    [TaskStatus.FULFILLED]: { buttonLabel: 'Mark as Fulfilled', label: 'Fulfilled', variant: 'default', roleRequired: ['CASHIER', 'SUPERVISOR', 'ADMIN'] },
    [TaskStatus.CANCELLED]: { buttonLabel: 'Halt / Cancel', label: 'Cancelled', variant: 'destructive', roleRequired: ['SUPERVISOR', 'ADMIN'] },
  },
  [TaskStatus.FULFILLED]: {
    [TaskStatus.REVIEWED]: { buttonLabel: 'Verify & Lock', label: 'Reviewed & Locked', variant: 'default', roleRequired: ['SUPERVISOR', 'ADMIN'] },
  },
  [TaskStatus.REVIEWED]: {},
  [TaskStatus.CANCELLED]: {},
}

export function getTaskWorkflowRules(currentStatus: TaskStatus): StatusRules {
  const currentWeight = STATUS_PRIORITY[currentStatus] ?? 0
  return {
    isTerminal: currentWeight === -1 || currentStatus === TaskStatus.REVIEWED,
    hasPassedApproval: currentWeight >= STATUS_PRIORITY[TaskStatus.APPROVED] && currentWeight !== -1,
    hasPassedFulfillment: currentWeight >= STATUS_PRIORITY[TaskStatus.FULFILLED] && currentWeight !== -1,
    hasPassedReview: currentWeight >= STATUS_PRIORITY[TaskStatus.REVIEWED] && currentWeight !== -1,
  }
}

export const WORKFLOW_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  [TaskStatus.DRAFT]: [TaskStatus.PENDING],
  [TaskStatus.PENDING]: [TaskStatus.APPROVED, TaskStatus.CANCELLED],
  [TaskStatus.APPROVED]: [TaskStatus.IN_PROGRESS],
  [TaskStatus.IN_PROGRESS]: [TaskStatus.FULFILLED, TaskStatus.CANCELLED],
  [TaskStatus.FULFILLED]: [TaskStatus.REVIEWED],
  [TaskStatus.REVIEWED]: [],
  [TaskStatus.CANCELLED]: [],
}

export function getValidNextStatuses(currentStatus: TaskStatus, taskType?: TaskType): TaskStatus[] {
  const baseTransitions = WORKFLOW_TRANSITIONS[currentStatus] || []
  if (taskType === TaskType.GENERAL_CHORE && currentStatus === TaskStatus.PENDING) {
    return [TaskStatus.IN_PROGRESS, TaskStatus.CANCELLED]
  }
  return baseTransitions
}

/**
 * Verifies user execution access factoring in both explicit assignments and system roles.
 */
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

  let config = TRANSITION_UI_CONFIG[currentStatus]?.[targetStatus]

  if (taskType === TaskType.GENERAL_CHORE && currentStatus === TaskStatus.PENDING && targetStatus === TaskStatus.IN_PROGRESS) {
    config = TRANSITION_UI_CONFIG[TaskStatus.APPROVED]?.[TaskStatus.IN_PROGRESS]
  }

  if (!config) return false

  // 1. Role-based Guard Check
  const hasRole = config.roleRequired.includes(userRole)
  if (!hasRole) return false

  // 2. Strict Explicit User Identity Checks

  // Execution Phase (IN_PROGRESS, FULFILLED): Must be the assigned clerk if one exists
  if (targetStatus === TaskStatus.IN_PROGRESS || targetStatus === TaskStatus.FULFILLED) {
    if (taskClerkId && taskClerkId !== currentUserId) return false
  }

  // Approval Phase (APPROVED): Must be the assigned approver if one exists
  if (targetStatus === TaskStatus.APPROVED) {
    if (taskApproverId && taskApproverId !== currentUserId) return false
  }

  // Review Phase (REVIEWED): Must be the assigned reviewer if one exists
  if (targetStatus === TaskStatus.REVIEWED) {
    if (taskReviewerId && taskReviewerId !== currentUserId) return false
  }

  // Cancellation Rules
  if (targetStatus === TaskStatus.CANCELLED) {
    // If it's already assigned to an approver or reviewer, only they can void it
    if (taskApproverId && taskReviewerId) {
      return taskApproverId === currentUserId || taskReviewerId === currentUserId
    }
    if (taskApproverId && taskApproverId !== currentUserId) return false
    if (taskReviewerId && taskReviewerId !== currentUserId) return false
  }

  return true
}

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
      const stepConfig =
        TRANSITION_UI_CONFIG[task.status]?.[targetStatus] ||
        (task.type === TaskType.GENERAL_CHORE && task.status === TaskStatus.PENDING && targetStatus === TaskStatus.IN_PROGRESS
          ? TRANSITION_UI_CONFIG[TaskStatus.APPROVED][TaskStatus.IN_PROGRESS]
          : null)

      return {
        value: targetStatus,
        label: stepConfig?.label ?? targetStatus,
        buttonLabel: stepConfig?.buttonLabel ?? targetStatus,
        variant: stepConfig?.variant ?? 'default',
        roleRequired: stepConfig?.roleRequired ?? [],
      }
    })
}

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
