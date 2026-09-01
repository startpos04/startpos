/** biome-ignore-all lint/suspicious/noExplicitAny: fix any */
import { count, eq, toArray, useLiveQuery } from '@tanstack/react-db'
import { createFileRoute } from '@tanstack/react-router'
import { Edit, User as UserIcon, X } from 'lucide-react'
import { toast } from 'sonner'
import Tab from '@startpos-core/components/custom/tab'
import { Badge } from '@startpos-core/components/ui/badge'
import { Button } from '@startpos-core/components/ui/button'
import {
  branchCollection,
  businessCollection,
  inventoryMovementCollection,
  membershipCollection,
  sessionCollection,
  transactionCollection,
  userCollection,
} from '@startpos-core/db/collections'
import { AuditAction, AuditTargetType } from '@/lib/audit/types'
import type { MountProps } from '@/lib/mount-manager'
import { writeAudit } from '@/lib/server-fn/write-audit'
import { cn } from '@startpos-core/lib/utils'
import { closeEmployeeSidebar, showEmployeeSidebar } from '../-components/employee-sidebar'
import { EditEmployeeSidebar } from './-edit-account'
import { OverviewTab } from './-overview-tab'
import { PerformanceTab } from './-performance-tab'

interface EmployeeDetailsSidebarProps extends MountProps {
  employeeId: string
}

interface RouteComponentProps {
  employeeId?: string
  onClose?: () => void
}

export const Route = createFileRoute('/(private)/(dashboard)/employees/$employeeId/')({
  loader: ({ params }) => ({ employeeId: params.employeeId }),
  component: () => <RouteComponent />,
})

export function EmployeeDetailsSidebar({ open: _open, onClose, employeeId }: EmployeeDetailsSidebarProps) {
  return <RouteComponent employeeId={employeeId} onClose={onClose} />
}

function RouteComponent({ employeeId: propId, onClose }: RouteComponentProps) {
  // biome-ignore lint/correctness/useHookAtTopLevel: guaranteed React context — used inside MountManager or route component
  const employeeId = propId ?? Route.useLoaderData().employeeId

  const {
    data: [employee],
    isLoading,
  } = useLiveQuery(q =>
    q
      .from({ user: userCollection })
      .where(({ user }) => eq(user.id, employeeId))
      .select(({ user }) => ({
        ...user,
        memberships: toArray(
          q
            .from({ membership: membershipCollection })
            .where(({ membership }) => eq(membership.userId, user.id))
            .leftJoin({ org: businessCollection }, ({ membership, org }) => eq(membership.businessId, org.id))
            .leftJoin({ branch: branchCollection }, ({ membership, branch }) => eq(membership.branchId, branch.id))
            .select(({ membership, org, branch }) => ({
              ...membership,
              business: org,
              branch: branch,
            })),
        ),
        sessions: toArray(
          q
            .from({ session: sessionCollection })
            .where(({ session }) => eq(session.userId, user.id))
            .orderBy(({ session }) => session.expiresAt, 'desc')
            .limit(1),
        ),
        processedSalesHistory: toArray(
          q
            .from({ sale: transactionCollection })
            .where(({ sale }) => eq(sale.cashierId, user.id))
            .select(({ sale }) => ({ totalAmount: sale.totalAmount })),
        ),
        processedSales: toArray(
          q
            .from({ sale: transactionCollection })
            .where(({ sale }) => eq(sale.cashierId, user.id))
            .groupBy(({ sale }) => sale.cashierId)
            .select(({ sale }) => ({ count: count(sale.id) })),
        ),
        performedServices: toArray(
          q
            .from({ service: transactionCollection })
            .where(({ service }) => eq(service.providerId, user.id))
            .groupBy(({ service }) => service.providerId)
            .select(({ service }) => ({ count: count(service.id) })),
        ),
        inventoryMovements: toArray(
          q
            .from({ move: inventoryMovementCollection })
            .where(({ move }) => eq(move.userId, user.id))
            .groupBy(({ move }) => move.userId)
            .select(({ move }) => ({ count: count(move.id) })),
        ),
      })),
  )

  const handleRevokeSession = async () => {
    const sessions = [...sessionCollection.values()].filter(s => s.userId === employeeId)
    for (const item of sessions) {
      const result = await sessionCollection.delete(item.id)
      if (result.error) {
        toast.error(`Failed to revoke sessions: ${result.error.message}`)
        return
      }
    }
    toast.success('All sessions revoked. User will be logged out.')
    writeAudit({
      data: {
        action: AuditAction.EMPLOYEE_SESSION_REVOKED,
        targetType: AuditTargetType.Session,
        targetId: employeeId, // actor revoked all sessions for this user
        before: null,
        after: null,
      },
    }).catch(err => console.error('[audit] EMPLOYEE_SESSION_REVOKED write failed:', err))
  }

  const handleDisable = async () => {
    const before = employee ? { id: employee.id, name: employee.name, role: employee.role, email: employee.email } : null
    const result = await userCollection.update(employeeId, draft => {
      draft.deletedAt = new Date()
    })
    if (result.error) {
      toast.error(`Failed to disable account: ${result.error.message}`)
      return
    }
    toast.success('Account disabled. The employee can no longer log in.')
    writeAudit({
      data: {
        action: AuditAction.EMPLOYEE_DISABLED,
        targetType: AuditTargetType.User,
        targetId: employeeId,
        before,
        after: null,
      },
    }).catch(err => console.error('[audit] EMPLOYEE_DISABLED write failed:', err))
  }

  const handleClose = () => {
    if (onClose) onClose()
    else closeEmployeeSidebar()
  }

  if (isLoading)
    return (
      <div className='p-6 space-y-3 animate-pulse'>
        <div className='flex items-center gap-3'>
          <div className='h-10 w-10 rounded-full bg-muted' />
          <div className='space-y-1.5'>
            <div className='h-4 w-32 bg-muted rounded' />
            <div className='h-3 w-20 bg-muted rounded' />
          </div>
        </div>
        <div className='h-48 bg-muted rounded-xl' />
      </div>
    )

  if (!employee) return <div className='p-6 text-destructive text-sm'>Employee not found.</div>

  const totalRevenueCents = employee.processedSalesHistory?.reduce((acc: number, sale) => acc + sale.totalAmount, 0) || 0
  const totalRevenue = totalRevenueCents / 100
  const salesTarget = 10000
  const targetReached = Math.min(Math.round((totalRevenue / salesTarget) * 100), 100)
  const isOnline = employee.sessions.length > 0

  const handleEdit = () => {
    showEmployeeSidebar(
      <EditEmployeeSidebar
        open
        employeeId={employee.id}
        defaultValues={{
          email: employee.email,
          name: employee.name,
          role: employee.role,
          image: employee.image || '',
        }}
        onBack={() => showEmployeeSidebar(<EmployeeDetailsSidebar open employeeId={employeeId} onClose={handleClose} />)}
        onClose={handleClose}
      />,
    )
  }

  return (
    <div className='flex flex-col h-full'>
      {/* Header band */}
      <div className='flex items-center justify-between p-4 border-b shrink-0'>
        <div className='flex items-center gap-3'>
          <div className='h-10 w-10 rounded-full bg-muted flex items-center justify-center border overflow-hidden shrink-0'>
            {employee.image ? (
              <img
                src={employee.image}
                alt={employee.name}
                className='h-full w-full object-cover'
                onError={e => {
                  e.currentTarget.style.display = 'none'
                  e.currentTarget.nextElementSibling?.removeAttribute('style')
                }}
              />
            ) : null}
            <UserIcon className='h-5 w-5 text-muted-foreground' style={employee.image ? { display: 'none' } : undefined} />
          </div>
          <div>
            <div className='flex items-center gap-2'>
              <h2 className='text-base font-semibold leading-tight'>{employee.name}</h2>
              <div className={cn('h-1.5 w-1.5 rounded-full shrink-0', isOnline ? 'bg-green-500' : 'bg-muted-foreground/30')} />
            </div>
            <div className='flex gap-1.5 mt-1'>
              <Badge variant='secondary' className='text-[10px] py-0 h-4'>
                {employee.role}
              </Badge>
              {employee.emailVerified && (
                <Badge variant='outline' className='text-[10px] py-0 h-4 text-green-600 border-green-200 bg-green-50'>
                  Verified
                </Badge>
              )}
              {employee.deletedAt && (
                <Badge variant='destructive' className='text-[10px] py-0 h-4'>
                  Disabled
                </Badge>
              )}
            </div>
          </div>
        </div>
        <Button variant='ghost' size='icon' onClick={handleClose} className='h-7 w-7 shrink-0'>
          <X className='size-4' />
        </Button>
      </div>

      {/* Scrollable content */}
      <div className='flex-1 overflow-y-auto p-4 space-y-4'>
        <Tab
          defaultValue='Overview'
          tabs={[
            {
              label: 'Overview',
              Component: OverviewTab,
              employee,
              isOnline,
              handleRevokeSession,
              handleDisable,
            },
            {
              label: 'Performance',
              Component: PerformanceTab,
              employee,
              totalRevenue,
              targetReached,
            },
          ]}
        />
      </div>

      {/* Sticky footer */}
      <div className='p-4 border-t shrink-0 flex gap-2'>
        <Button size='sm' className='flex-1 shadow-sm shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]' onClick={handleEdit}>
          <Edit className='size-3.5' /> Edit Profile
        </Button>
      </div>
    </div>
  )
}
