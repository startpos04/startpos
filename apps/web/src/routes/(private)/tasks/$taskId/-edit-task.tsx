import { Button } from '@platform/components/ui/button'
import { operationalTaskCollection } from '@platform/db/collections'
import { ArrowLeft, Lock, X } from 'lucide-react'
import { TaskStatus } from 'prisma/generated/prisma/enums'
import { toast } from 'sonner'
import type { MountProps } from '@platform/lib/mount-manager'
import { closeTaskSidebar } from '../../-components/task-sidebar'
import { CreateTask, type CreateTaskFormData } from '../../create/-create-task'

// B2: statuses that lock editing â€” task has already progressed past the point
// where its requirements or assignment can meaningfully change.
const LOCKED_STATUSES: TaskStatus[] = [TaskStatus.FULFILLED, TaskStatus.REVIEWED, TaskStatus.CANCELLED]

interface EditTaskSidebarProps extends MountProps {
  taskId: string
  taskStatus: TaskStatus
  defaultValues: CreateTaskFormData
  onBack?: () => void
}

export function EditTaskSidebar({ taskId, taskStatus, defaultValues, open: _open, onClose, onBack }: EditTaskSidebarProps) {
  const isLocked = LOCKED_STATUSES.includes(taskStatus)

  const handleSubmit = async ({ value }: { value: CreateTaskFormData }) => {
    // B2: safety-net guard â€” reject if status has changed since the sidebar was opened
    if (isLocked) {
      toast.error('This task can no longer be edited.')
      return
    }

    const { type, clerkId, approverId, notes, ...subTaskMetadata } = value
    try {
      operationalTaskCollection.update(taskId, draft => {
        draft.dueDate = null
        draft.type = type
        draft.notes = notes
        draft.clerkId = clerkId
        draft.approverId = approverId
        draft.metadata = subTaskMetadata
        draft.updatedAt = new Date()
      })

      toast.success('Task successfully updated')
      if (onBack) onBack()
      else if (onClose) onClose()
      else closeTaskSidebar()
    } catch (error) {
      console.error('Transaction failed:', error)
      toast.error('Failed to update Task. Please try again.')
    }
  }

  const handleClose = () => {
    if (onClose) onClose()
    else closeTaskSidebar()
  }

  return (
    <div className='flex flex-col h-full'>
      {/* Header band */}
      <div className='flex items-center justify-between p-4 border-b shrink-0'>
        <div className='flex items-center gap-2'>
          {onBack && (
            <Button variant='ghost' size='icon' onClick={onBack} className='h-7 w-7'>
              <ArrowLeft className='size-4' />
            </Button>
          )}
          <div>
            <h2 className='text-base font-semibold leading-none'>Edit Task</h2>
            <p className='text-xs text-muted-foreground mt-1'>Modify requirements, assignment, or instructions.</p>
          </div>
        </div>
        <Button variant='ghost' size='icon' onClick={handleClose} className='h-7 w-7'>
          <X className='size-4' />
        </Button>
      </div>

      {/* B2: Locked state â€” task has passed a terminal or post-fulfillment status */}
      {isLocked ? (
        <div className='flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center'>
          <div className='h-10 w-10 rounded-xl bg-muted flex items-center justify-center'>
            <Lock className='size-5 text-muted-foreground' />
          </div>
          <div>
            <p className='text-sm font-semibold'>Task is locked</p>
            <p className='text-xs text-muted-foreground mt-1'>
              Tasks in <span className='font-medium'>{taskStatus.replace(/_/g, ' ').toLowerCase()}</span> status cannot be edited.
            </p>
          </div>
          <Button variant='outline' size='sm' onClick={handleClose} className='mt-2'>
            Close
          </Button>
        </div>
      ) : (
        /* Form â€” CreateTask already has flex-col h-full with scrollable body + sticky footer */
        <CreateTask
          defaultValues={defaultValues}
          onSubmit={handleSubmit}
          textBtn={{
            default: 'Save Changes',
            isSubmitting: 'Saving...',
          }}
        />
      )}
    </div>
  )
}
