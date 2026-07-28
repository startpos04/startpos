import { ArrowLeft, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { operationalTaskCollection } from '@/db/collections'
import type { MountProps } from '@/lib/mount-manager'
import { closeTaskSidebar } from '../../-components/task-sidebar'
import { CreateTask, type CreateTaskFormData } from '../../create/-create-task'

interface EditTaskSidebarProps extends MountProps {
  taskId: string
  defaultValues: CreateTaskFormData
  onBack?: () => void
}

export function EditTaskSidebar({ taskId, defaultValues, open: _open, onClose, onBack }: EditTaskSidebarProps) {
  const handleSubmit = async ({ value }: { value: CreateTaskFormData }) => {
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

      {/* Form — CreateTask already has flex-col h-full with scrollable body + sticky footer */}
      <CreateTask
        defaultValues={defaultValues}
        onSubmit={handleSubmit}
        textBtn={{
          default: 'Save Changes',
          isSubmitting: 'Saving...',
        }}
      />
    </div>
  )
}
