import { createFileRoute } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { AlertCircle, CheckCircle2, ClipboardList, FileCheck, Play, ShieldAlert } from 'lucide-react'
import type { TaskStatus } from 'prisma/generated/prisma/enums'
import Tab from '@/components/custom/tab'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { operationalTaskCollection } from '@/db/collections'
import { useAppForm } from '@/hooks/form'
import type { OverlayProps } from '@/lib/overlay'
import { fetchTasks } from '@/lib/queries/fetch-tasks'
import { authStore } from '@/store/auth-store'
import { taskFormOpts } from '../create/-create-task'
import { TaskDetailsTab } from './-components/task-details-tab'
import { TaskTimelineTab } from './-components/task-timeline-tab'
import { getAllowedTransitionsForUser, getStatusUIMetadata } from './-components/task-workflow'

interface TaskDetailsDialogProps extends OverlayProps {
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

export function TaskDetailsDialog({ open, onClose, taskId }: TaskDetailsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-4xl h-[60vh] overflow-hidden flex flex-col p-0'>
        <RouteComponent onClose={onClose} taskId={taskId} />
      </DialogContent>
    </Dialog>
  )
}

function RouteComponent(props: RouteComponentProps) {
  // biome-ignore lint/correctness/useHookAtTopLevel: Context assignment guaranteed
  const taskId = props.taskId ?? Route.useLoaderData().taskId
  const user = useStore(authStore, state => state.user)

  const {
    data: [task],
    isLoading,
  } = fetchTasks(taskId)

  const handleStatusChange = async ({ nextStatus }: { nextStatus: TaskStatus }) => {
    const timestamp = new Date()

    operationalTaskCollection.update(taskId, draft => {
      draft.status = nextStatus
      draft.updatedAt = timestamp

      if (nextStatus === 'PENDING') {
        draft.creatorId = user?.id
      }
      if (nextStatus === 'APPROVED') {
        draft.approverId = user?.id
        draft.approvedAt = timestamp
      }
      if (nextStatus === 'IN_PROGRESS') {
        // If no clerk is explicitly assigned to the task yet, the user starting it becomes the clerk
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
  }

  const form = useAppForm({
    ...taskFormOpts,
    defaultValues: {},
    onSubmit: async () => {},
  })

  if (isLoading)
    return (
      <div className='p-8 space-y-4 animate-pulse'>
        <div className='h-8 w-64 bg-muted rounded' />
        <div className='h-80 bg-muted rounded-xl' />
      </div>
    )

  if (!task) return <div className='p-6 text-destructive'>Task record not found.</div>

  const getActionIcon = (status: TaskStatus) => {
    switch (status) {
      case 'APPROVED':
        return <Play className='h-4 w-4' />
      case 'FULFILLED':
        return <FileCheck className='h-4 w-4' />
      case 'REVIEWED':
        return <CheckCircle2 className='h-4 w-4' />
      case 'CANCELLED':
        return <ShieldAlert className='h-4 w-4' />
      default:
        return <AlertCircle className='h-4 w-4' />
    }
  }

  // Get filtered operational action mappings for active user context
  const viableActions = getAllowedTransitionsForUser(task, user)
  const currentStatusMetadata = getStatusUIMetadata(task.status)

  return (
    <div className='flex flex-col grow'>
      {/* Hero Header */}
      <div className='p-6 '>
        <div className='flex flex-col md:flex-row md:items-center justify-between gap-4'>
          <div className='flex items-center gap-4'>
            <div className='h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary'>
              <ClipboardList className='h-8 w-8' />
            </div>
            <div>
              <div className='flex items-center gap-3'>
                <h1 className='text-xl font-bold tracking-tight'>{task.type.replace('_', ' ')}</h1>
                <Badge variant='outline' className={currentStatusMetadata.colorClass}>
                  {currentStatusMetadata.label}
                </Badge>
              </div>
              <p className='text-sm text-muted-foreground mt-1'>ID: {task.id.slice(0, 8)}...</p>
            </div>
          </div>

          <div className='flex items-center gap-2 flex-wrap'>
            {viableActions.map(action => (
              <Button
                key={action.value}
                variant={action.variant}
                className='gap-2 rounded-xl text-sm font-medium transition-all shadow-sm'
                onClick={() => handleStatusChange({ nextStatus: action.value })}
              >
                {getActionIcon(action.value)}
                {action.buttonLabel}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <Tab
        defaultValue='Task Details'
        className='grow h-1'
        tabClass='px-6'
        tabs={[
          { label: 'Task Details', Component: TaskDetailsTab, task, form },
          { label: 'Timeline & Logs', Component: TaskTimelineTab, task },
        ]}
      />
    </div>
  )
}
