import { Dialog, DialogContent } from '@/components/ui/dialog'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CreateAccount, CreateAccountFormData } from '../create/-create-account'

export function EditEmployeeDialog({
  employeeId,
  defaultValues,
  open,
  onClose,
}: {
  employeeId: string
  defaultValues: CreateAccountFormData
  open: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()

  const handleSubmit = async ({ value }: { value: CreateAccountFormData }) => {
    const result = await crudAPI.user('update', {
      where: { id: employeeId },
      data: {
        ...value,
        image: value.image || null,
      },
    })

    result.match(
      async () => {
        await queryClient.invalidateQueries({ queryKey: ['employees'] })
        await queryClient.invalidateQueries({ queryKey: ['employee', employeeId] })
        toast.success('Employee successfully added')
        onClose?.()
      },
      error => toast.error(error),
    )
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-4xl max-h-[90vh] overflow-y-auto'>
        <CreateAccount
          defaultValues={defaultValues}
          onSubmit={handleSubmit}
          textBtn={{ default: 'Update Employee', isSubmitting: 'Updating Employee...' }}
          children={
            <div>
              <h1 className='text-3xl font-bold tracking-tight'>Update Employee</h1>
              <p className='text-muted-foreground text-sm'>Update staff account and its permissions.</p>
            </div>
          }
        />
      </DialogContent>
    </Dialog>
  )
}
