import { createFileRoute } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { AlertCircle, CheckCircle2, ClipboardList, FileCheck, Play, ShieldAlert, X } from 'lucide-react'
import { TaskStatus, TaskType } from 'prisma/generated/prisma/enums'
import Tab from '@/components/custom/tab'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { inventoryCollection, inventoryMovementCollection, operationalTaskCollection } from '@/db/collections'
import { dbTransaction } from '@/db/local-db-transaction'
import { useAppForm } from '@/hooks/form'
import type { MountProps } from '@/lib/mount-manager'
import { fetchTasks } from '@/lib/queries/fetch-tasks'
import { cn } from '@/lib/utils'
import { authStore } from '@/store/auth-store'
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
    const timestamp = new Date()

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
      if (nextStatus === TaskStatus.FULFILLED && task) {
        const meta = task.metadata
        const variantId = meta?.variantId
        const qty = meta?.suggestedQty ?? 0

        if (variantId && qty > 0) {
          const movementBase = {
            id: crypto.randomUUID(),
            variantId,
            userId: user?.id,
            transactionId: null,
            purchaseId: null,
            operationalTaskId: taskId,
            businessId: user.business.id,
            branchId: user.branch.id,
            updatedAt: timestamp,
            createdAt: timestamp,
          }

          if (task.type === TaskType.SHELF_REFILL) {
            // Deduct from source location, add to target location
            const sourceId = meta?.sourceLocationId
            const targetId = meta?.targetLocationId

            // Find existing source batch
            const sourceBatch = [...inventoryCollection.values()].find(i => i.variantId === variantId && i.locationId === sourceId && i.quantity > 0)
            if (sourceBatch) {
              inventoryCollection.update(sourceBatch.id, draft => {
                draft.quantity -= Math.min(qty, sourceBatch.quantity)
              })
            }

            // Upsert target batch
            const targetBatch = [...inventoryCollection.values()].find(i => i.variantId === variantId && i.locationId === targetId)
            if (targetBatch) {
              inventoryCollection.update(targetBatch.id, draft => {
                draft.quantity += qty
              })
            } else {
              inventoryCollection.insert({
                id: crypto.randomUUID(),
                variantId,
                quantity: qty,
                unitId: sourceBatch?.unitId ?? '',
                batchNumber: 'SHELF-REFILL',
                costPrice: sourceBatch?.costPrice ?? 0,
                locationId: targetId ?? null,
                expiryDate: null,
                lastRestocked: timestamp,
                businessId: user.business.id,
                branchId: user.branch.id,
                updatedAt: timestamp,
                createdAt: timestamp,
              })
            }

            inventoryMovementCollection.insert({
              ...movementBase,
              type: 'ADJUST',
              quantity: qty,
              unitId: sourceBatch?.unitId ?? '',
              reason: `Shelf Refill: Task #${taskId.slice(0, 8)}`,
              locationId: targetId ?? null,
              targetBranchId: null,
              inventoryId: targetBatch?.id ?? movementBase.id,
            })
          } else if (task.type === TaskType.BRANCH_TRANSFER) {
            // Deduct from current branch inventory
            const sourceBatch = [...inventoryCollection.values()].find(i => i.variantId === variantId && i.quantity > 0)
            if (sourceBatch) {
              inventoryCollection.update(sourceBatch.id, draft => {
                draft.quantity -= Math.min(qty, sourceBatch.quantity)
              })
            }

            inventoryMovementCollection.insert({
              ...movementBase,
              type: 'ADJUST',
              quantity: qty,
              unitId: sourceBatch?.unitId ?? '',
              reason: `Branch Transfer: Task #${taskId.slice(0, 8)}`,
              locationId: sourceBatch?.locationId ?? null,
              targetBranchId: meta?.targetBranchId ?? null,
              inventoryId: sourceBatch?.id ?? movementBase.id,
            })
          } else if (task.type === TaskType.STOCK_COUNT) {
            // Reconcile: set inventory to the physically counted qty
            const existingBatch = [...inventoryCollection.values()].find(i => i.variantId === variantId && i.locationId === (meta?.locationId ?? null))
            if (existingBatch) {
              const diff = qty - existingBatch.quantity
              inventoryCollection.update(existingBatch.id, draft => {
                draft.quantity = qty
              })
              inventoryMovementCollection.insert({
                ...movementBase,
                type: 'ADJUST',
                quantity: Math.abs(diff),
                unitId: existingBatch.unitId,
                reason: `Stock Count Reconciliation: Task #${taskId.slice(0, 8)} (${diff >= 0 ? '+' : ''}${diff})`,
                locationId: meta?.locationId ?? null,
                targetBranchId: null,
                inventoryId: existingBatch.id,
              })
            }
          } else if (task.type === TaskType.WASTE_DISPOSAL) {
            // Deduct the wasted quantity
            const wasteLocationId = meta?.locationId ?? null
            const batch = [...inventoryCollection.values()].find(i => i.variantId === variantId && i.locationId === wasteLocationId && i.quantity > 0)
            if (batch) {
              inventoryCollection.update(batch.id, draft => {
                draft.quantity -= Math.min(qty, batch.quantity)
              })
              inventoryMovementCollection.insert({
                ...movementBase,
                type: 'OUT',
                quantity: qty,
                unitId: batch.unitId,
                reason: `Waste Disposal: Task #${taskId.slice(0, 8)}`,
                locationId: wasteLocationId,
                targetBranchId: null,
                inventoryId: batch.id,
              })
            }
          }
        }
      }
    })
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
