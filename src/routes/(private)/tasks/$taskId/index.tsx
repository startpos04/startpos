import { createFileRoute } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { AlertCircle, CheckCircle2, ClipboardList, FileCheck, Play, ShieldAlert, X } from 'lucide-react'
import { TaskStatus } from 'prisma/generated/prisma/enums'
import { toast } from 'sonner'
import Tab from '@/components/custom/tab'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { inventoryCollection, inventoryMovementCollection, operationalTaskCollection } from '@/db/collections'
import { dbTransaction } from '@/db/local-db-transaction'
import { useAppForm } from '@/hooks/form'
import { getInventoryMode } from '@/lib/inventory'
import { InventoryEngine } from '@/lib/inventory/inventory-engine'
import type { MountProps } from '@/lib/mount-manager'
import { NotificationEngine } from '@/lib/notification/notification-engine'
import { fetchTasks } from '@/lib/queries/fetch-tasks'
import { validateTaskTransition } from '@/lib/server-fn/validate-task-transition'
import { cn } from '@/lib/utils'
import { authStore } from '@/lib/better-auth/auth-store'
import { closeTaskSidebar } from '../-components/task-sidebar'
import { taskFormOpts } from '../create/-create-task'
import { TaskDetailsTab } from './-components/task-details-tab'
import { TaskTimelineTab } from './-components/task-timeline-tab'
import { getAllowedTransitionsForUser, getStatusUIMetadata } from './-components/task-workflow'

interface TaskDetailsSidebarProps extends MountProps {
  taskId: string
}

interface RouteComponentProps {
  taskId?: string
  onClose?: () => void
}

export const Route = createFileRoute('/(private)/tasks/$taskId/')({
  loader: ({ params }) => ({ taskId: params.taskId }),
  component: () => <RouteComponent />,
})

export function TaskDetailsSidebar({ open: _open, onClose, taskId }: TaskDetailsSidebarProps) {
  return <RouteComponent taskId={taskId} onClose={onClose} />
}

function RouteComponent({ taskId: propId, onClose }: RouteComponentProps) {
  // biome-ignore lint/correctness/useHookAtTopLevel: guaranteed React context — used inside MountManager or route component
  const taskId = propId ?? Route.useLoaderData().taskId
  const user = useStore(authStore, state => state.user)

  const {
    data: [task],
    isLoading,
  } = fetchTasks(taskId)

  const handleStatusChange = async ({ nextStatus }: { nextStatus: TaskStatus }) => {
    if (!task || !user) return

    // B1 — Server-side transition validator (Architecture Compliance Phase 6).
    //
    // Calls a TanStack Start server function that:
    //   1. Reads the task's CURRENT state from Prisma (server-authoritative — not from
    //      client state, preventing spoofed currentStatus attacks).
    //   2. Asserts tenant isolation (task.businessId === session.businessId).
    //   3. Calls checkWorkflowPermission with the server-fetched state.
    //   4. Returns { permitted: false, reason } if the transition is disallowed.
    //
    // This replaces the previous client-only guard (which ran in the client process and
    // could be bypassed by a direct transactionAPI call). The server function runs in the
    // TanStack Start server process with session context injected by authMiddleware.
    //
    // The UI still shows `getAllowedTransitionsForUser` buttons (client-side pre-filter
    // for UX responsiveness), but this server call is the authoritative enforcement gate.
    const validationResult = await validateTaskTransition({
      data: { taskId: task.id, targetStatus: nextStatus },
    })

    if (!validationResult.permitted) {
      toast.error(validationResult.reason)
      return
    }

    const timestamp = new Date()

    // C6: Capture the effective clerk before the transaction so we can notify
    // after it commits. The clerk is either already assigned or will be set to
    // the current user by the IN_PROGRESS handler below.
    const effectiveClerkId = nextStatus === TaskStatus.IN_PROGRESS ? (task.clerkId ?? user.id) : null

    await dbTransaction(() => {
      operationalTaskCollection.update(taskId, draft => {
        draft.status = nextStatus
        draft.updatedAt = timestamp

        if (nextStatus === 'PENDING') draft.creatorId = user?.id
        if (nextStatus === 'APPROVED') {
          draft.approverId = user?.id
          draft.approvedAt = timestamp
        }
        if (nextStatus === 'IN_PROGRESS') {
          if (!draft.clerkId) draft.clerkId = user?.id
          draft.inProgressAt = timestamp
        }
        if (nextStatus === 'FULFILLED') {
          if (!draft.clerkId) draft.clerkId = user?.id
          draft.fulfilledAt = timestamp
        }
        if (nextStatus === 'REVIEWED') {
          draft.reviewerId = user?.id
          draft.reviewedAt = timestamp
        }
        if (nextStatus === 'CANCELLED') {
          draft.cancelerId = user?.id
          draft.canceledAt = timestamp
        }
      })

      // --- INVENTORY SIDE EFFECTS ON FULFILLED ---
      // Delegated to InventoryEngine — single owner of all inventory mutations.
      if (nextStatus === TaskStatus.FULFILLED && task) {
        InventoryEngine.applyTaskFulfillment({
          task,
          inventoryCollection,
          movementCollection: inventoryMovementCollection,
          ctx: {
            userId: user.id,
            branchId: user.branch.id,
            businessId: user.business.id,
          },
          inventoryMode: getInventoryMode(user.business.id),
        })
      }
    })

    // C6: TASK_ASSIGNED notification — sent after the transaction commits so
    // the clerk's record is guaranteed to be written before the notification
    // is delivered. Only fires when transitioning to IN_PROGRESS and the
    // assigned clerk is a different person from the one performing the action
    // (no self-notification when a clerk starts their own task).
    if (nextStatus === TaskStatus.IN_PROGRESS && effectiveClerkId && effectiveClerkId !== user.id) {
      const taskTypeLabel = task.type.replace(/_/g, ' ').toLowerCase()
      await NotificationEngine.send([effectiveClerkId], {
        type: 'TASK_ASSIGNED',
        title: 'Task Assigned to You',
        message: `You have been assigned a ${taskTypeLabel} task. Please review and begin when ready.`,
        metadata: { taskId: task.id, taskType: task.type },
        link: `/tasks/${task.id}`,
      })
    }
  }

  const form = useAppForm({
    ...taskFormOpts,
    defaultValues: {},
    onSubmit: async () => {},
  })

  const handleClose = () => {
    if (onClose) onClose()
    else closeTaskSidebar()
  }

  if (isLoading)
    return (
      <div className='p-6 space-y-3 animate-pulse'>
        <div className='flex items-center gap-3'>
          <div className='h-10 w-10 rounded-2xl bg-muted' />
          <div className='space-y-1.5'>
            <div className='h-4 w-36 bg-muted rounded' />
            <div className='h-3 w-20 bg-muted rounded' />
          </div>
        </div>
        <div className='h-64 bg-muted rounded-xl' />
      </div>
    )

  if (!task) return <div className='p-6 text-destructive text-sm'>Task record not found.</div>

  const getActionIcon = (status: TaskStatus) => {
    switch (status) {
      case 'APPROVED':
        return <Play className='size-3.5' />
      case 'FULFILLED':
        return <FileCheck className='size-3.5' />
      case 'REVIEWED':
        return <CheckCircle2 className='size-3.5' />
      case 'CANCELLED':
        return <ShieldAlert className='size-3.5' />
      default:
        return <AlertCircle className='size-3.5' />
    }
  }

  const viableActions = getAllowedTransitionsForUser(task, user)
  const currentStatusMetadata = getStatusUIMetadata(task.status)

  return (
    <div className='flex flex-col h-full'>
      {/* Header band */}
      <div className='flex items-center justify-between p-4 border-b shrink-0'>
        <div className='flex items-center gap-3'>
          <div className='h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0'>
            <ClipboardList className='h-5 w-5' />
          </div>
          <div>
            <div className='flex items-center gap-2'>
              <h2 className='text-sm font-semibold leading-tight capitalize'>{task.type.replace(/_/g, ' ').toLowerCase()}</h2>
              <Badge variant='outline' className={cn('text-[10px] py-0 h-4', currentStatusMetadata.colorClass)}>
                {currentStatusMetadata.label}
              </Badge>
            </div>
            <p className='text-[10px] text-muted-foreground mt-0.5 font-mono'>#{task.id.slice(0, 8)}</p>
          </div>
        </div>
        <Button variant='ghost' size='icon' onClick={handleClose} className='h-7 w-7 shrink-0'>
          <X className='size-4' />
        </Button>
      </div>

      {/* Tab content — fills remaining height */}
      <div className='flex-1 overflow-hidden flex flex-col'>
        <Tab
          defaultValue='Task Details'
          className='grow h-1'
          tabClass='px-4'
          tabs={[
            { label: 'Task Details', Component: TaskDetailsTab, task, form },
            { label: 'Timeline', Component: TaskTimelineTab, task },
          ]}
        />
      </div>

      {/* Sticky footer — action buttons */}
      {viableActions.length > 0 && (
        <div className='p-4 border-t shrink-0 flex flex-wrap gap-2'>
          {viableActions.map(action => (
            <Button
              key={action.value}
              variant={action.variant}
              size='sm'
              className='flex-1 gap-1.5 rounded-xl text-xs font-medium transition-all shadow-sm'
              onClick={() => handleStatusChange({ nextStatus: action.value })}
            >
              {getActionIcon(action.value)}
              {action.buttonLabel}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}
