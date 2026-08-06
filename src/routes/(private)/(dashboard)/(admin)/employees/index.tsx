import { useLiveQuery } from '@tanstack/react-db'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { Plus, Trash2 } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { getColumns } from '@/components/custom/data-view'
import { TableView } from '@/components/custom/data-view/table-view'
import { WarningPrompt } from '@/components/custom/prompt/warning-prompt'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { userCollection } from '@/db/collections'
import { Capabilities } from '@/lib/entitlement/capability-keys'
import MountManager from '@/lib/mount-manager'
import { authStore } from '@/store/auth-store'
import { closeEmployeeSidebar, EMPLOYEE_ASIDE_ID, showEmployeeSidebar } from './-components/employee-sidebar'
import { EmployeeDetailsSidebar } from './$employeeId'
import { CreateEmployeeSidebar } from './create'

export const Route = createFileRoute('/(private)/(dashboard)/(admin)/employees/')({
  component: RouteComponent,
  beforeLoad: () => {
    const { user } = authStore.state
    if (!user?.entitlement?.capabilities?.includes(Capabilities.MANAGE_EMPLOYEES)) {
      throw redirect({ to: '/unauthorized' })
    }
  },
})

function RouteComponent() {
  const { data, isLoading } = useLiveQuery(q => q.from({ user: userCollection }))
  const [selectedId, setSelectedId] = useState<string>('')

  const handleAdd = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    setSelectedId('')
    showEmployeeSidebar(<CreateEmployeeSidebar />)
  }

  const handleSelectRow = useCallback((employee: NonNullable<typeof data>[number]) => {
    setSelectedId(employee.id)
    showEmployeeSidebar(
      <EmployeeDetailsSidebar
        open
        employeeId={employee.id}
        onClose={() => {
          setSelectedId('')
          closeEmployeeSidebar()
        }}
      />,
    )
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
        h.accessor('name', { header: 'Employee' }),
        h.accessor('email', { header: 'Email' }),
        h.accessor('role', {
          maxSize: 100,
          header: 'Role',
          cell: info => <span className='capitalize text-slate-600'>{info.getValue()}</span>,
        }),
        h.display({
          maxSize: 60,
          id: 'actions',
          header: () => <div className='text-right pr-4'>Actions</div>,
          cell: ({ row }) => {
            const handleDelete = async () => {
              MountManager.show(WarningPrompt, {
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
              <div className='flex justify-end pr-2'>
                <Button
                  variant='ghost'
                  size='icon'
                  className='rounded-full text-destructive hover:text-destructive hover:bg-destructive/10'
                  onClick={e => {
                    e.stopPropagation()
                    handleDelete()
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
            )
          },
        }),
      ]),
    [],
  )

  return (
    <div className='w-full h-screen bg-background flex overflow-hidden relative min-h-0 flex-1'>
      <div className='flex-1 min-w-0 h-full p-4 pt-0 flex flex-col overflow-hidden transition-all duration-300 ease-in-out bg-background/50 space-y-2'>
        <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4'>
          <div>
            <h1 className='text-3xl font-bold tracking-tight text-foreground'>Employees</h1>
            <p className='text-muted-foreground text-sm'>Manage your team and their workspace roles.</p>
          </div>
          <a href='/employees/create' onClick={handleAdd} className='contents'>
            <Button size='sm' className='shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]'>
              <Plus /> Add Employee
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

      <MountManager id={EMPLOYEE_ASIDE_ID} />
    </div>
  )
}
