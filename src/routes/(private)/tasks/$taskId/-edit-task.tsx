import { toast } from 'sonner'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { operationalTaskCollection } from '@/db/collections'
import { CreateTask, type CreateTaskFormData } from '../create/-create-task'

interface EditTaskDialogProps {
  taskId: string
  defaultValues: CreateTaskFormData
  open: boolean
  onClose: () => void
}

export function EditTaskDialog({ taskId, defaultValues, open, onClose }: EditTaskDialogProps) {
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
      onClose()
    } catch (error) {
      console.error('Transaction failed:', error)
      toast.error('Failed to update Task. Please try again.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-4xl max-h-[90vh] overflow-y-auto border-none'>
        <CreateTask
          defaultValues={defaultValues}
          onSubmit={handleSubmit}
          textBtn={{
            default: 'Save Changes',
            isSubmitting: 'Saving Changes...',
          }}
        >
          <div className='mb-2'>
            <h1 className='text-3xl font-bold tracking-tight'>Edit Task</h1>
            <p className='text-muted-foreground text-sm'>Modify the requirements, assignment, or instructions for this operation.</p>
          </div>
        </CreateTask>
      </DialogContent>
    </Dialog>
  )
}
