import { Dashboard } from '@platform/components/custom/dashboard'
import { getColumns } from '@platform/components/custom/data-view'
import { TableView } from '@platform/components/custom/data-view/table-view'
import { WarningPrompt } from '@platform/components/custom/prompt/warning-prompt'
import { Badge } from '@platform/components/ui/badge'
import { Button } from '@platform/components/ui/button'
import { operationalTaskCollection } from '@platform/db/collections'
import { authStore } from '@platform/lib/better-auth/auth-store'
import { Capabilities } from '@platform/lib/entitlement/capability-keys'
import { cn } from '@platform/lib/utils'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { Calendar, ClipboardList, Plus, Trash2 } from 'lucide-react'
import { Role, TaskStatus, TaskType } from 'prisma/generated/prisma/enums'
import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import MountManager from '@/lib/mount-manager'
import { fetchTasks } from '@/lib/queries/fetch-tasks'
import { showTaskSidebar, TASK_ASIDE_ID } from './-components/task-sidebar'
import { TaskDetailsSidebar } from './$taskId'
import { CreateTaskSidebar } from './create'

const TYPE_CONFIG: Record<string, string> = {
  [TaskType.SHELF_REFILL]: 'bg-blue-50 text-blue-600',
  [TaskType.PURCHASE_REQUEST]: 'bg-green-50 text-green-600',
  [TaskType.BRANCH_TRANSFER]: 'bg-indigo-50 text-indigo-600',
  [TaskType.STOCK_COUNT]: 'bg-gray-50 text-gray-600',
  [TaskType.WASTE_DISPOSAL]: 'bg-orange-50 text-orange-600',
  [TaskType.CASH_RECONCILIATION]: 'bg-emerald-50 text-emerald-600',
  [TaskType.GENERAL_CHORE]: 'bg-purple-50 text-purple-600',
}

export const Route = createFileRoute('/(private)/tasks/')({
  beforeLoad: () => {
    const { user } = authStore.state
    if (!user?.entitlement?.capabilities?.includes(Capabilities.CREATE_TASK)) {
      throw redirect({ to: '/unauthorized' })
    }
  },
  component: () => {
    const user = useStore(authStore, state => state.user)
    if (user.role === Role.CASHIER) return <RouteComponent />
    return (
      <Dashboard>
        <RouteComponent />
      </Dashboard>
    )
  },
})

// B3: only these statuses permit deletion
const DELETABLE_STATUSES: TaskStatus[] = [TaskStatus.DRAFT, TaskStatus.PENDING]
// B3: only these roles may delete tasks
const DELETABLE_ROLES: Role[] = [Role.ADMIN, Role.SUPERVISOR]

function RouteComponent() {
  const { data, isLoading } = fetchTasks()
  const user = useStore(authStore, state => state.user)
  const [selectedId, setSelectedId] = useState<string>('')

  const handleAdd = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    setSelectedId('')
    showTaskSidebar(<CreateTaskSidebar />)
  }

  const handleSelectRow = useCallback((task: NonNullable<typeof data>[number]) => {
    setSelectedId(task.id)
    showTaskSidebar(
      <TaskDetailsSidebar
        open
        taskId={task.id}
        onClose={() => {
          setSelectedId('')
          MountManager.clear(TASK_ASIDE_ID)
        }}
      />,
    )
  }, [])

  const columns = useMemo(
    () =>
      getColumns<NonNullable<typeof data>[number]>(h => [
        h.display({
          id: 'number',
          maxSize: 40,
          header: 'No.',
          cell: info => <span className='text-xs font-mono text-muted-foreground/50'>{(info.row.index + 1).toString().padStart(2, '0')}</span>,
        }),

        h.accessor('type', {
          header: 'Task Type',
          cell: info => {
            const type = info.getValue()
            const statusStyle = TYPE_CONFIG[type] || 'bg-slate-100 text-slate-700'
            return (
              <div className='flex items-center gap-2'>
                <div className={cn('p-1.5 rounded-md', statusStyle)}>
                  <ClipboardList className='h-3.5 w-3.5' />
                </div>
                <span className='text-sm font-medium leading-none capitalize'>{type.replace('_', ' ').toLowerCase()}</span>
              </div>
            )
          },
        }),

        h.accessor('status', {
          header: 'Status',
          maxSize: 100,
          cell: info => {
            const status = info.getValue()
            return (
              <Badge
                variant='secondary'
                className={cn(
                  'font-semibold text-[10px] uppercase tracking-wider',
                  status === TaskStatus.DRAFT && 'bg-slate-100 text-slate-600 hover:bg-slate-100',
                  status === TaskStatus.PENDING && 'bg-amber-100 text-amber-700 hover:bg-amber-100',
                  status === TaskStatus.APPROVED && 'bg-blue-100 text-blue-700 hover:bg-blue-100',
                  status === TaskStatus.IN_PROGRESS && 'bg-indigo-100 text-indigo-700 hover:bg-indigo-100',
                  status === TaskStatus.FULFILLED && 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100',
                  status === TaskStatus.REVIEWED && 'bg-teal-100 text-teal-800 hover:bg-teal-100',
                  status === TaskStatus.CANCELLED && 'bg-rose-100 text-rose-700 hover:bg-rose-100',
                )}
              >
                {status.replace('_', ' ')}
              </Badge>
            )
          },
        }),

        h.display({
          id: 'context',
          header: 'Details / Scope',
          cell: ({ row }) => {
            const meta = row.original.metadata
            const type = row.original.type
            const notes = row.original.notes

            if (!meta) return <span className='text-xs text-muted-foreground'>-</span>

            if (type === TaskType.CASH_RECONCILIATION && meta.variance !== undefined) {
              const isDiscrepancy = meta.variance !== 0
              return (
                <div className='flex flex-col gap-0.5'>
                  <span className='text-xs font-medium'>Cash Reconciliation</span>
                  <span className={cn('text-[10px] font-mono font-semibold', isDiscrepancy ? 'text-destructive' : 'text-emerald-600')}>
                    Variance: â‚±{(meta.variance / 100).toFixed(2)}
                  </span>
                </div>
              )
            }

            if ((type === TaskType.BRANCH_TRANSFER || type === TaskType.SHELF_REFILL) && (meta.sourceLocation || meta.targetLocation)) {
              return (
                <div className='flex flex-col gap-0.5 text-xs text-muted-foreground'>
                  <div className='flex items-center gap-1'>
                    <span className='font-medium text-foreground'>{meta.sourceLocation || 'Stock'}</span>
                    <span>â†’</span>
                    <span className='font-medium text-foreground'>{meta.targetLocation || 'Floor'}</span>
                  </div>
                </div>
              )
            }

            return (
              <div className='max-w-45 truncate'>
                <span className='text-xs text-muted-foreground'>{notes || 'No notes provided'}</span>
              </div>
            )
          },
        }),

        h.display({
          id: 'createdBy',
          header: 'Created By',
          cell: ({ row }) => {
            const creatorName = row.original.creator?.name || 'System'
            return <span className='text-xs font-medium text-muted-foreground truncate max-w-30 block'>{creatorName}</span>
          },
        }),

        h.display({
          id: 'assignedTo',
          header: 'Assigned To',
          cell: ({ row }) => {
            const clerkName = row.original.clerk?.name || 'Unassigned'
            const isUnassigned = !row.original.clerk?.name
            return (
              <span className={cn('text-xs font-medium truncate max-w-30 block', isUnassigned ? 'text-muted-foreground/50 italic' : 'text-foreground')}>
                {clerkName}
              </span>
            )
          },
        }),

        h.accessor('dueDate', {
          header: 'Due Date',
          cell: info => {
            const dateVal = info.getValue()
            if (!dateVal) return <span className='text-xs text-muted-foreground'>-</span>
            const date = new Date(dateVal)
            const isOverdue = date < new Date() && info.row.original.status !== TaskStatus.FULFILLED && info.row.original.status !== TaskStatus.REVIEWED

            return (
              <div className={cn('flex items-center gap-1.5 text-xs', isOverdue && 'text-destructive font-medium')}>
                <Calendar className='size-4 shrink-0' />
                <div className='flex flex-col'>
                  <span>{date.toLocaleDateString()}</span>
                  <span className={cn('text-[10px] text-muted-foreground', isOverdue && 'text-destructive/80')}>
                    {isOverdue ? 'Overdue' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            )
          },
        }),

        h.accessor('createdAt', {
          header: 'Created',
          cell: info => {
            const date = info.getValue()
            if (!date) return null
            const d = new Date(date)
            return (
              <div className='flex flex-col text-muted-foreground/80'>
                <span className='text-xs'>{d.toLocaleDateString()}</span>
                <span className='text-[10px]'>{d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            )
          },
        }),

        h.display({
          maxSize: 100,
          id: 'actions',
          header: () => <div className='text-right pr-4'>Actions</div>,
          cell: ({ row }) => {
            const canDelete = DELETABLE_ROLES.includes(user?.role as Role) && DELETABLE_STATUSES.includes(row.original.status as TaskStatus)

            if (!canDelete) return <div className='pr-2 h-8' />

            const handleDelete = async () => {
              MountManager.show(WarningPrompt, {
                title: 'Delete Task',
                description: 'Are you sure you want to remove this task? This action cannot be undone.',
                onConfirm: async () => {
                  // B3: re-check at confirmation time in case status changed while prompt was open
                  if (!DELETABLE_ROLES.includes(user?.role as Role) || !DELETABLE_STATUSES.includes(row.original.status as TaskStatus)) {
                    toast.error('This task can no longer be deleted.')
                    return false
                  }
                  try {
                    operationalTaskCollection.delete(row.original.id)
                    toast.success('Task removed successfully')
                    return true
                  } catch {
                    toast.error('Failed to delete Task. Please try again.')
                  }
                  return false
                },
              })
            }

            return (
              <div className='flex justify-end pr-2'>
                <Button
                  variant='ghost'
                  size='icon'
                  className='h-8 w-8 rounded-full text-destructive hover:text-destructive'
                  onClick={e => {
                    e.stopPropagation()
                    handleDelete()
                  }}
                >
                  <Trash2 className='size-4' />
                </Button>
              </div>
            )
          },
        }),
      ]),
    [user],
  )

  return (
    <div className='w-full h-screen bg-background flex overflow-hidden relative min-h-0 flex-1'>
      <div className='flex-1 min-w-0 h-full px-4 flex flex-col overflow-hidden transition-all duration-300 ease-in-out bg-background/50 space-y-2'>
        <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pt-4'>
          <div>
            <h1 className='text-3xl font-bold tracking-tight text-foreground'>Operational Tasks</h1>
            <p className='text-muted-foreground text-sm'>Monitor and approve store refills, audits, and daily reconciliations.</p>
          </div>
          <a href='/tasks/create' onClick={handleAdd} className='contents'>
            <Button className='shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]'>
              <Plus className='size-4' /> Add Task
            </Button>
          </a>
        </div>

        <TableView
          data={data}
          isFetching={isLoading}
          columns={columns}
          selectableRow={{
            onClick: handleSelectRow,
            isSelected: row => row.id === selectedId,
          }}
        />
      </div>

      <MountManager id={TASK_ASIDE_ID} />
    </div>
  )
}
