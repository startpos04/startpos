import { toast } from 'sonner'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { userCollection } from '@/db/collections'
import { CreateAccount, type CreateAccountFormData } from '../create/-create-account'

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
  const handleSubmit = async ({ value }: { value: CreateAccountFormData }) => {
    const result = await userCollection.update(employeeId, draft => {
      Object.assign(draft, value)
      draft.image = value.image || null
    })

    if (result.error) toast.error(result.error.message)
    else {
      toast.success('Employee successfully updated')
      onClose()
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
