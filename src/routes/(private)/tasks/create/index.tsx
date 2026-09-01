import { createFileRoute } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { TaskStatus, TaskType } from 'prisma/generated/prisma/enums'
import { toast } from 'sonner'
import { operationalTaskCollection } from '@startpos-core/db/collections'
import { authStore } from '@startpos-core/lib/better-auth/auth-store'
import { closeTaskSidebar } from '../-components/task-sidebar'
import { CreateTask, type CreateTaskFormData } from './-create-task'

export const Route = createFileRoute('/(private)/tasks/create/')({
  component: () => <CreateTaskSidebar />,
})

export function CreateTaskSidebar() {
  const user = useStore(authStore, state => state.user)

  const handleSubmit = async ({ value }: { value: CreateTaskFormData }) => {
    const { type, clerkId, approverId, notes, ...subTaskMetadata } = value

    try {
      operationalTaskCollection.insert({
        id: crypto.randomUUID(),
        // C1: Tasks start as DRAFT — creator must submit for approval explicitly.
        // The DRAFT→PENDING transition is already wired in task-workflow.ts with
        // buttonLabel "Submit for Approval" and is available to all roles.
        status: TaskStatus.DRAFT,
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
      closeTaskSidebar()
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
      <div>
        <h2 className='text-xl font-semibold'>New Task</h2>
        <p className='text-muted-foreground text-sm'>Initiate a new store movement or audit task for your staff.</p>
      </div>
    </CreateTask>
  )
}
