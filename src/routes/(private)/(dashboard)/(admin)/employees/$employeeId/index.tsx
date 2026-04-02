import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import dayjs from '@/lib/dayjs'
import { showModal } from '@/lib/Overlay'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Calendar, Edit, Mail, Package, Receipt, ShieldAlert, Smartphone, User as UserIcon } from 'lucide-react'
import { toast } from 'sonner'
import { EditEmployeeDialog } from './(edit-account)'

interface EditEmployeeDialogProps {
  employeeId: string
  open: boolean
  onClose: () => void
}

interface RouteComponentProps {
  employeeId?: string
  onClose?: () => void
}

export const Route = createFileRoute('/(private)/(dashboard)/(admin)/employees/$employeeId/')({
  loader: ({ params }) => ({ employeeId: params.employeeId }),
  component: () => <RouteComponent />,
})

export function EmployeeDetailsDialog({ open, onClose, employeeId }: EditEmployeeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-4xl h-[75vh]'>
        <RouteComponent onClose={onClose} employeeId={employeeId} />
      </DialogContent>
    </Dialog>
  )
}

function RouteComponent(props: RouteComponentProps) {
  const employeeId = props.employeeId || Route.useLoaderData().employeeId
  const queryClient = useQueryClient()

  const {
    data: employee,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['employee', employeeId],
    queryFn: async () => {
      const result = await crudAPI({
        data: {
          action: 'findUnique',
          table: 'user',
          args: {
            where: { id: employeeId },
            include: {
              memberships: { include: { organization: true, branch: true } },
              sessions: { orderBy: { expiresAt: 'desc' }, take: 1 },
              // Fetching actual transaction data for revenue calculation
              processedSales: {
                select: { totalAmount: true },
              },
              _count: {
                select: {
                  processedSales: true,
                  performedServices: true,
                  inventoryMovements: true,
                },
              },
            },
          },
        },
      })
      if (result.isErr()) throw new Error(result.error)
      return result.value
    },
  })

  // FUNCTIONALITY: Revoke Sessions Mutation
  const { mutate: revokeSessions, isPending: isRevoking } = useMutation({
    mutationFn: async () => {
      const result = await crudAPI({
        data: {
          action: 'deleteMany',
          table: 'session',
          args: { where: { userId: employeeId } },
        },
      })
      if (result.isErr()) throw new Error(result.error)
      return result.value
    },
    onSuccess: () => {
      toast.success('All sessions revoked. User will be logged out.')
      queryClient.invalidateQueries({ queryKey: ['employee', employeeId] })
    },
    onError: err => toast.error(`Failed to revoke sessions: ${err.message}`),
  })

  if (isLoading)
    return (
      <div className='p-8 space-y-4 animate-pulse'>
        <div className='h-8 w-64 bg-muted rounded' />
        <div className='h-80 bg-muted rounded-xl' />
      </div>
    )
  if (error || !employee) return <div className='p-6 text-destructive'>Employee not found.</div>

  // CALCULATION: Real Revenue from processedSales (stored in cents)
  const totalRevenueCents = employee.processedSales?.reduce((acc: number, sale: any) => acc + sale.totalAmount, 0) || 0
  const totalRevenue = totalRevenueCents / 100
  const salesTarget = 10000 // Set a dynamic target or keep static
  const targetReached = Math.min(Math.round((totalRevenue / salesTarget) * 100), 100)

  const handleEdit = () => {
    showModal(EditEmployeeDialog, {
      employeeId: employee.id,
      defaultValues: {
        email: employee.email,
        name: employee.name,
        role: employee.role as any,
        image: employee.image || '',
      },
    })
  }

  return (
    <div className='flex flex-col gap-6 p-1 md:p-6 overflow-y-auto max-h-full'>
      {/* Header Section */}
      <div className='flex flex-col md:flex-row md:items-center justify-between gap-4'>
        <div className='flex items-center gap-4'>
          <div className='h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center border-2 border-background shadow-sm overflow-hidden'>
            {employee.image ? (
              <img src={employee.image} alt={employee.name} className='h-full w-full object-cover' />
            ) : (
              <UserIcon className='h-8 w-8 text-primary' />
            )}
          </div>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>{employee.name}</h1>
            <div className='flex gap-2 mt-1'>
              <Badge variant='secondary'>{employee.role}</Badge>
              {employee.emailVerified && (
                <Badge variant='outline' className='text-green-600 border-green-200 bg-green-50'>
                  Verified
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className='flex gap-2'>
          <Button variant='outline' size='sm' className='gap-2 shadow-sm' onClick={handleEdit}>
            <Edit className='h-4 w-4' /> Edit Profile
          </Button>
        </div>
      </div>

      <Tabs defaultValue='overview' className='w-full'>
        <TabsList className='grid w-full max-w-md grid-cols-2 mb-4'>
          <TabsTrigger value='overview'>Overview</TabsTrigger>
          <TabsTrigger value='activity'>Performance</TabsTrigger>
        </TabsList>

        {/* OVERVIEW TAB */}
        <TabsContent value='overview' className='space-y-4'>
          <div className='grid gap-4 md:grid-cols-2'>
            <Card>
              <CardHeader className='pb-2'>
                <CardTitle className='text-sm font-medium text-muted-foreground'>Contact Details</CardTitle>
              </CardHeader>
              <CardContent className='space-y-3'>
                <div className='flex items-center gap-3 text-sm'>
                  <Mail className='h-4 w-4 text-muted-foreground' />
                  <span>{employee.email}</span>
                </div>
                <div className='flex items-center gap-3 text-sm'>
                  <Calendar className='h-4 w-4 text-muted-foreground' />
                  <span>Joined {dayjs(employee.createdAt).format('MMMM DD, YYYY')}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className='pb-2'>
                <CardTitle className='text-sm font-medium text-muted-foreground'>Quick Stats</CardTitle>
              </CardHeader>
              <CardContent className='grid grid-cols-2 gap-4'>
                <div>
                  <p className='text-2xl font-bold'>{employee._count?.processedSales || 0}</p>
                  <p className='text-xs text-muted-foreground uppercase'>Sales Processed</p>
                </div>
                <div>
                  <p className='text-2xl font-bold'>{employee._count?.performedServices || 0}</p>
                  <p className='text-xs text-muted-foreground uppercase'>Services Rendered</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className='border-destructive/20 shadow-none'>
            <CardHeader className='pb-3'>
              <CardTitle className='text-base text-destructive flex items-center gap-2'>
                <ShieldAlert className='h-4 w-4' /> Danger Zone
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className='flex items-center justify-between p-4 border border-destructive/10 rounded-lg bg-destructive/5'>
                <div>
                  <p className='text-sm font-bold'>Revoke All Sessions</p>
                  <p className='text-xs text-muted-foreground'>Force user to log out from all devices (clears session table).</p>
                </div>
                <Button variant='destructive' size='sm' disabled={isRevoking} onClick={() => revokeSessions()}>
                  {isRevoking ? 'Revoking...' : 'Sign Out Everywhere'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* PERFORMANCE TAB */}
        <TabsContent value='activity' className='space-y-4'>
          <Card>
            <CardHeader>
              <CardTitle className='text-lg flex items-center gap-2'>
                <Receipt className='h-5 w-5' /> Transaction Summary
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
                <Card className='bg-primary/5 border-primary/20'>
                  <CardContent className='pt-6'>
                    <div className='flex items-center justify-between'>
                      <p className='text-sm font-medium'>Total Revenue</p>
                      <Receipt className='h-4 w-4 text-primary' />
                    </div>
                    <p className='text-2xl font-bold mt-2'>₱{totalRevenue.toLocaleString()}</p>
                    <div className='mt-4 space-y-2'>
                      <div className='flex justify-between text-xs'>
                        <span>Target Achievement</span>
                        <span>{targetReached}%</span>
                      </div>
                      <Progress value={targetReached} className='h-1' />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className='pt-6'>
                    <div className='flex items-center justify-between text-muted-foreground'>
                      <p className='text-sm font-medium'>Service Volume</p>
                      <Smartphone className='h-4 w-4' />
                    </div>
                    <p className='text-2xl font-bold mt-2'>{employee._count.performedServices}</p>
                    <p className='text-xs text-muted-foreground mt-1'>Lifetime tasks</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className='pt-6'>
                    <div className='flex items-center justify-between text-muted-foreground'>
                      <p className='text-sm font-medium'>Logistics Activity</p>
                      <Package className='h-4 w-4' />
                    </div>
                    <p className='text-2xl font-bold mt-2'>{employee._count.inventoryMovements}</p>
                    <p className='text-xs text-muted-foreground mt-1'>Inventory adjustments</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className='pt-6'>
                    <div className='flex items-center justify-between'>
                      <p className='text-sm font-medium'>System Status</p>
                      <div className={`h-2 w-2 rounded-full animate-pulse ${employee.sessions.length > 0 ? 'bg-green-500' : 'bg-gray-400'}`} />
                    </div>
                    <p className='text-sm font-medium mt-2 truncate'>{employee.sessions[0]?.ipAddress || 'Disconnected'}</p>
                    {employee.sessions[0] && (
                      <p className='text-xs text-muted-foreground mt-1 tracking-tighter'>Active: {dayjs().to(dayjs(employee.sessions[0].expiresAt))}</p>
                    )}
                  </CardContent>
                </Card>
              </div>
              <div className='h-50 flex items-center justify-center border-2 border-dashed rounded-lg'>
                <p className='text-sm text-muted-foreground text-center px-6'>Activity logs and sales charts for this specific employee would load here.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
