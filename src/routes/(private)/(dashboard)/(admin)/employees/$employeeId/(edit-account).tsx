import { Dialog, DialogContent } from '@/components/ui/dialog'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { useQueryClient } from '@tanstack/react-query'
import { CreateAccount, CreateAccountFormData } from '../create/(create-account)'

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
    try {
      await crudAPI({
        data: {
          table: 'user',
          action: 'update',
          args: {
            where: { id: employeeId },
            data: {
              ...value,
              image: value.image || null,
            },
          },
        },
      })

      await queryClient.invalidateQueries({ queryKey: ['employees'] })
      await queryClient.invalidateQueries({ queryKey: ['employee', employeeId] })
      onClose?.()
    } catch (error) {
      console.error('Failed to create employee:', error)
    }
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
