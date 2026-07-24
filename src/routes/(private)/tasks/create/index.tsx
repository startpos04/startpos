import { createFileRoute } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { TaskStatus, TaskType } from 'prisma/generated/prisma/enums'
import { toast } from 'sonner'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { operationalTaskCollection } from '@/db/collections'
import { authStore } from '@/store/auth-store'
// Import the updated Task Form component and its types
import { CreateTask, type CreateTaskFormData } from './-create-task'

export const Route = createFileRoute('/(private)/tasks/create/')({
  component: () => <RouteComponent />,
})

export function CreateTaskDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-4xl max-h-[90vh] overflow-y-auto border-none'>
        <RouteComponent onClose={onClose} />
      </DialogContent>
    </Dialog>
  )
}

function RouteComponent({ onClose }: { onClose?: () => void }) {
  const user = useStore(authStore, state => state.user)

  const handleSubmit = async ({ value }: { value: CreateTaskFormData }) => {
    const { type, clerkId, approverId, notes, ...subTaskMetadata } = value

    try {
      operationalTaskCollection.insert({
        id: crypto.randomUUID(),
        status: TaskStatus.PENDING,
        businessId: user.business.id,
        branchId: user.branch.id,
        creatorId: user.id,
        dueDate: null,
        type,
        notes,
        clerkId,
        approverId,
        approvedAt: null,
        inProgressAt: null,
        fulfilledAt: null,
        suggestedQty: null,
        approvedQty: null,
        fulfilledQty: null,
        reviewerId: null,
        reviewedAt: null,
        metadata: subTaskMetadata,
        cancelerId: null,
        canceledAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      toast.success('Operational task successfully created')
      onClose?.()
    } catch (error) {
      console.error('Transaction failed:', error)
      toast.error('Failed to add Task. Please try again.')
    }
  }

  return (
    <CreateTask
      defaultValues={{
        type: TaskType.GENERAL_CHORE,
        approverId: user.id,
        clerkId: null,
        notes: '',
      }}
      onSubmit={handleSubmit}
      textBtn={{ default: 'Create Task', isSubmitting: 'Creating...' }}
    >
      <div className='mb-2'>
        <h1 className='text-3xl font-bold tracking-tight'>Create Task</h1>
        <p className='text-muted-foreground text-sm'>Initiate a new store movement or audit task for your staff.</p>
      </div>
    </CreateTask>
  )
}
