import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Edit, User } from 'lucide-react'

interface EditEmployeeDialogProps {
  employeeId: string
  open: boolean
  onClose: () => void
}

interface RouteComponentProps {
  employeeId?: string
  onClose?: () => void
}

export const Route = createFileRoute('/(private)/(dashboard)/(admin)/employees/$employeeId')({
  loader: ({ params }) => ({ employeeId: params.employeeId }),
  component: () => <RouteComponent />,
})

export function EditEmployeeDialog({ open, onClose, employeeId }: EditEmployeeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-4xl'>
        <RouteComponent onClose={onClose} employeeId={employeeId} />
      </DialogContent>
    </Dialog>
  )
}

function RouteComponent(props: RouteComponentProps) {
  const employeeId = props.employeeId || Route.useLoaderData().employeeId

  const {
    data: employee,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['employee', employeeId],
    queryFn: async () => {
      const data = await crudAPI({
        data: {
          action: 'findUnique',
          table: 'user',
          args: { where: { id: employeeId } },
        },
      })
      return data
    },
  })

  if (isLoading) return <div className='p-6 animate-pulse'>Loading employee profile...</div>
  if (error || !employee) return <div className='p-6 text-destructive'>Employee not found.</div>

  return (
    <div className='flex flex-col gap-6 p-6'>
      <div className='flex items-center justify-between'>
        <div className='flex flex-col gap-1'>
          <h1 className='text-2xl font-semibold tracking-tight'>{employee.name}</h1>
        </div>

        <Button variant='outline' size='sm' className='gap-2'>
          <Edit className='h-4 w-4' />
          Edit Profile
        </Button>
      </div>

      <hr className='border-border' />

      <div className='grid gap-6 md:grid-cols-3'>
        <div className='flex flex-col items-center p-6 border rounded-xl bg-card text-card-foreground shadow-sm'>
          <div className='h-24 w-24 rounded-full bg-muted flex items-center justify-center mb-4 overflow-hidden'>
            {employee.image ? (
              <img src={employee.image} alt={employee.name} className='h-full w-full object-cover' />
            ) : (
              <User className='h-12 w-12 text-muted-foreground' />
            )}
          </div>
          <h2 className='font-medium text-lg'>{employee.name}</h2>
          <span className='inline-flex items-center rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary ring-1 ring-inset ring-primary/20'>
            {employee.role}
          </span>
        </div>

        <div className='md:col-span-2 space-y-4'>
          <div className='rounded-xl border bg-card p-6 shadow-sm'>
            <h3 className='text-sm font-semibold mb-4'>Account Information</h3>
            <dl className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
              <div>
                <dt className='text-xs text-muted-foreground uppercase tracking-wider'>Email Address</dt>
                <dd className='text-sm font-medium'>{employee.email}</dd>
              </div>
              <div>
                <dt className='text-xs text-muted-foreground uppercase tracking-wider'>Email Status</dt>
                <dd className='text-sm'>
                  {employee.emailVerified ? <span className='text-green-600'>Verified</span> : <span className='text-yellow-600'>Pending</span>}
                </dd>
              </div>
              <div>
                <dt className='text-xs text-muted-foreground uppercase tracking-wider'>Employee ID</dt>
                <dd className='text-sm font-mono text-muted-foreground'>{employee.id}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  )
}
