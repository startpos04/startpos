import { useLiveQuery } from '@tanstack/react-db'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Edit, Plus, Trash2 } from 'lucide-react'
import { useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { getColumns } from '@/components/custom/data-view'
import { TableView } from '@/components/custom/data-view/table-view'
import { WarningPrompt } from '@/components/custom/prompt/warning-prompt'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { userCollection } from '@/db/collections'
import { showModal } from '@/lib/overlay'
import { EmployeeDetailsDialog } from './$employeeId'
import { CreateEmployeeDialog } from './create'

export const Route = createFileRoute('/(private)/(dashboard)/(admin)/employees/')({
  component: RouteComponent,
})

function RouteComponent() {
  const { data, isLoading } = useLiveQuery(q => q.from({ user: userCollection }))

  const handleAdd = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    showModal(CreateEmployeeDialog)
  }

  const handleEdit = useCallback((e: React.MouseEvent<HTMLAnchorElement>, employeeId: string) => {
    e.preventDefault()
    showModal(EmployeeDetailsDialog, {
      employeeId,
    })
  }, [])

  const columns = useMemo(
    () =>
      getColumns<NonNullable<typeof data>[number]>(h => [
        h.display({
          id: 'number',
          maxSize: 20,
          header: 'No.',
          cell: info => <span className='text-xs font-mono text-muted-foreground/50'>{(info.row.index + 1).toString().padStart(2, '0')}</span>,
        }),
        h.accessor('image', {
          header: 'Avatar',
          maxSize: 20,
          cell: info => {
            const user = info.row.original
            return (
              <Avatar className='h-9 w-9 border border-border/50 shadow-sm'>
                <AvatarImage src={user.image ?? ''} alt={user.name} />
                <AvatarFallback className='bg-primary/5 text-primary text-xs font-bold'>{user.name?.charAt(0)}</AvatarFallback>
              </Avatar>
            )
          },
        }),
        h.accessor('name', {
          header: 'Employee',
        }),
        h.accessor('email', {
          header: 'Email',
        }),
        h.accessor('role', {
          maxSize: 100,
          header: 'Role',
          cell: info => <span className='capitalize text-slate-600'>{info.getValue()}</span>,
        }),
        h.display({
          maxSize: 100,
          id: 'actions',
          header: () => <div className='text-right pr-4'>Actions</div>,
          cell: ({ row }) => {
            const handleDelete = async () => {
              showModal(WarningPrompt, {
                title: 'Delete Employee',
                description: 'Are you sure you want to delete this employee? This will affect their access to the system.',
                onConfirm: async () => {
                  try {
                    userCollection.update(row.original.id, draft => {
                      draft.deletedAt = new Date()
                    })

                    toast.success('Employee archived successfully')
                    return true
                  } catch (error) {
                    console.error('Transaction failed:', error)
                    toast.error('Failed to archive employee. Please try again.')
                  }
                  return false
                },
              })
            }

            return (
              <div className='flex justify-end gap-2 pr-2'>
                <Link to='/employees/$employeeId' params={{ employeeId: row.original.id }} onClick={e => handleEdit(e, row.original.id)} className='contents'>
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
    <div className='flex flex-col grow gap-4 px-4'>
      <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4'>
        <div>
          <h1 className='text-3xl font-bold tracking-tight text-foreground'>Employees</h1>
          <p className='text-muted-foreground text-sm'>Manage your team and their workspace roles.</p>
        </div>
        <a href='/employees/create' onClick={handleAdd} className='contents'>
          <Button className='shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]'>
            <Plus className='h-4 w-4' /> Add Employee
          </Button>
        </a>
      </div>

      <TableView data={data} isFetching={isLoading} columns={columns} />
    </div>
  )
}
