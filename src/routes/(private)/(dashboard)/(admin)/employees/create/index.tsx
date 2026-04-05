import { Dialog, DialogContent } from '@/components/ui/dialog'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { toast } from 'sonner'
import { CreateAccount, CreateAccountFormData } from './-create-account'

export const Route = createFileRoute('/(private)/(dashboard)/(admin)/employees/create/')({
  component: () => <RouteComponent />,
})

export function CreateEmployeeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-4xl max-h-[90vh] overflow-y-auto'>
        <RouteComponent onClose={onClose} />
      </DialogContent>
    </Dialog>
  )
}

function RouteComponent({ onClose }: { onClose?: () => void }) {
  const queryClient = useQueryClient()

  const handleSubmit = async ({ value }: { value: CreateAccountFormData }) => {
    const result = await crudAPI.user('create', {
      data: {
        ...value,
        image: value.image || null,
        emailVerified: false,
      },
    })

    result.match(
      async () => {
        await queryClient.invalidateQueries({ queryKey: ['employees'] })
        toast.success('Employee successfully added')
        onClose?.()
      },
      error => toast.error(error),
    )
  }

  return (
    <CreateAccount
      defaultValues={{ name: '', email: '', image: '', role: 'CASHIER' }}
      onSubmit={handleSubmit}
      textBtn={{ default: 'Add Employee', isSubmitting: 'Adding Employee...' }}
      children={
        <div>
          <h1 className='text-3xl font-bold tracking-tight'>Add Employee</h1>
          <p className='text-muted-foreground text-sm'>Create a new staff account and assign permissions.</p>
        </div>
      }
    />
  )
}
