import { createFileRoute, Link } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { Calendar, ClipboardList, Edit, Plus, Trash2 } from 'lucide-react'
import { Role, TaskStatus, TaskType } from 'prisma/generated/prisma/enums'
import { useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { Dashboard } from '@/components/custom/dashboard'
import { getColumns } from '@/components/custom/data-view'
import { TableView } from '@/components/custom/data-view/table-view'
import { WarningPrompt } from '@/components/custom/prompt/warning-prompt'
import { FeatureDisabledPage } from '@/components/pages/feature-disabled-page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { operationalTaskCollection } from '@/db/collections'
import { showModal } from '@/lib/overlay'
import { fetchTasks } from '@/lib/queries/fetch-tasks'
import { cn } from '@/lib/utils'
import { authStore } from '@/store/auth-store'
import { TaskDetailsDialog } from './$taskId'
import { CreateTaskDialog } from './create'

const TYPE_CONFIG: Record<string, string> = {
  [TaskType.SHELF_REFILL]: 'bg-blue-50 text-blue-600',
  [TaskType.PURCHASE_REQUEST]: 'bg-green-50 text-green-600', // Fixed typo from 'gree-50'
  [TaskType.BRANCH_TRANSFER]: 'bg-indigo-50 text-indigo-600',
  [TaskType.STOCK_COUNT]: 'bg-gray-50 text-gray-600',
  [TaskType.WASTE_DISPOSAL]: 'bg-orange-50 text-orange-600',
  [TaskType.CASH_RECONCILIATION]: 'bg-emerald-50 text-emerald-600',
  [TaskType.GENERAL_CHORE]: 'bg-purple-50 text-purple-600',
}

export const Route = createFileRoute('/(private)/tasks/')({
  component: () => {
    const user = useStore(authStore, state => state.user)
    if (!user.systemConfigs.ENABLE_TASK) return <FeatureDisabledPage />
    if (user.role === Role.CASHIER) return <RouteComponent />

    return (
      <Dashboard>
        <RouteComponent />
      </Dashboard>
    )
  },
})

function RouteComponent() {
  const { data, isLoading } = fetchTasks()

  const handleAdd = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    showModal(CreateTaskDialog)
  }

  const handleEdit = useCallback((e: React.MouseEvent<HTMLAnchorElement>, taskId: string) => {
    e.preventDefault()
    showModal(TaskDetailsDialog, { taskId })
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

            // Render subtle variants based on Task Types
            if (type === TaskType.CASH_RECONCILIATION && meta.variance !== undefined) {
              const isDiscrepancy = meta.variance !== 0
              return (
                <div className='flex flex-col gap-0.5'>
                  <span className='text-xs font-medium'>Cash Reconciliation</span>
                  <span className={cn('text-[10px] font-mono font-semibold', isDiscrepancy ? 'text-destructive' : 'text-emerald-600')}>
                    Variance: ₱{(meta.variance / 100).toFixed(2)}
                  </span>
                </div>
              )
            }

            if ((type === TaskType.BRANCH_TRANSFER || type === TaskType.SHELF_REFILL) && (meta.sourceLocation || meta.targetLocation)) {
              return (
                <div className='flex flex-col gap-0.5 text-xs text-muted-foreground'>
                  <div className='flex items-center gap-1'>
                    <span className='font-medium text-foreground'>{meta.sourceLocation || 'Stock'}</span>
                    <span>→</span>
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
                <Calendar className='h-4! w-4! shrink-0' />
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
            const handleDelete = async () => {
              showModal(WarningPrompt, {
                title: 'Delete Task',
                description: 'Are you sure you want to remove this task? This action cannot be undone.',
                onConfirm: async () => {
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
              <div className='flex justify-end gap-2 pr-2'>
                <Link to='/tasks/$taskId' params={{ taskId: row.original.id }} onClick={e => handleEdit(e, row.original.id)} className='contents'>
                  <Button variant='ghost' size='icon' className='h-8 w-8 rounded-full'>
                    <Edit className='h-4 w-4' />
                  </Button>
                </Link>
                <Button variant='ghost' size='icon' className='h-8 w-8 rounded-full text-destructive hover:text-destructive' onClick={handleDelete}>
                  <Trash2 className='h-4 w-4' />
                </Button>
              </div>
            )
          },
        }),
      ]),
    [handleEdit],
  )

  return (
    <div className='flex flex-col grow gap-4 px-4 h-screen'>
      <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4'>
        <div>
          <h1 className='text-3xl font-bold tracking-tight text-foreground'>Operational Tasks</h1>
          <p className='text-muted-foreground text-sm'>Monitor and approve store refills, audits, and daily reconciliations.</p>
        </div>
        <a href='/tasks/create' onClick={handleAdd} className='contents'>
          <Button className='shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]'>
            <Plus className='h-4 w-4' /> Add Task
          </Button>
        </a>
      </div>

      <TableView data={data} isFetching={isLoading} columns={columns} />
    </div>
  )
}
