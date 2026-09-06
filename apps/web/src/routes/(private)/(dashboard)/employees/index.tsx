import { getColumns } from '@platform/components/custom/data-view'
import { TableView } from '@platform/components/custom/data-view/table-view'
import { Button } from '@platform/components/ui/button'
import { userCollection } from '@platform/db/collections'
import { Capabilities } from '@platform/lib/entitlement/capability-keys'
import MountManager from '@platform/lib/mount-manager'
import { useLiveQuery } from '@tanstack/react-db'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { authStore } from '@/lib/better-auth/auth-store'
import { employeeCols } from '@/lib/columns/employee-columns'
import { tableCols } from '@/lib/columns/table-columns'
import { closeEmployeeSidebar, EMPLOYEE_ASIDE_ID, showEmployeeSidebar } from './-components/employee-sidebar'
import { EmployeeDetailsSidebar } from './$employeeId'
import { CreateEmployeeSidebar } from './create'

export const Route = createFileRoute('/(private)/(dashboard)/employees/')({
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
  const { user } = authStore.state

  // Calculate employee usage and limits
  const activeEmployees = data?.filter(u => !u.deletedAt) ?? []
  const currentEmployeeCount = activeEmployees.length

  // Get employee limit from user entitlement
  const employeeEntitlement = user?.entitlement?.planFeatures?.find(f => f === 'MANAGE_EMPLOYEES')
  const employeeUsageLimit = user?.entitlement?.usageLimits?.MANAGE_EMPLOYEES
  const planEmployeeLimit = employeeUsageLimit ?? (employeeEntitlement ? -1 : 0) // -1 = unlimited, 0 = no access

  // Note: Add-on calculation would require a separate query, for now just show plan limits
  const atEmployeeLimit = planEmployeeLimit !== -1 && currentEmployeeCount >= planEmployeeLimit

  const getEmployeeLimitText = () => {
    if (planEmployeeLimit === -1) return 'Unlimited employees'
    if (planEmployeeLimit === 0) return 'No employee access'
    return `${currentEmployeeCount} of ${planEmployeeLimit} employees`
  }

  const handleAdd = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()

    if (atEmployeeLimit) {
      toast.error(
        `Employee limit reached. Your plan allows ${planEmployeeLimit} employee${planEmployeeLimit === 1 ? '' : 's'}. Consider upgrading your plan or purchasing employee add-ons.`,
      )
      return
    }

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
        tableCols.number(h),
        employeeCols.avatar(h),
        employeeCols.name(h),
        employeeCols.email(h),
        employeeCols.role(h),
        employeeCols.deleteAction(h),
      ]),
    [],
  )

  return (
    <div className='w-full h-screen bg-background flex overflow-hidden relative min-h-0 flex-1'>
      <div className='flex-1 min-w-0 h-full px-4 flex flex-col overflow-hidden transition-all duration-300 ease-in-out bg-background/50 space-y-2'>
        <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4'>
          <div>
            <h1 className='text-3xl font-bold tracking-tight text-foreground'>Employees</h1>
            <div className='space-y-1'>
              <p className='text-muted-foreground text-sm'>Manage your team and their workspace roles.</p>
              <p className='text-xs text-muted-foreground'>{getEmployeeLimitText()}</p>
            </div>
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
