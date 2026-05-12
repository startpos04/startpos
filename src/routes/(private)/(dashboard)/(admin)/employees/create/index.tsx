import type { Transaction } from '@tanstack/db'
import { createFileRoute } from '@tanstack/react-router'
import { toast } from 'sonner'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { userCollection } from '@/db/collections'
import { CreateAccount, type CreateAccountFormData } from './-create-account'

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
  const handleSubmit = async ({ value }: { value: CreateAccountFormData }) => {
    const results: Record<string, Transaction<Record<string, unknown>>> = {}

    try {
      results['employee'] = await userCollection.insert({
        ...value,
        id: crypto.randomUUID(),
        image: value.image || null,
        emailVerified: false,
        updatedAt: new Date(),
        createdAt: new Date(),
        deletedAt: null,
      })
      await results['employee'].isPersisted.promise

      onClose?.()
      toast.success('Employee successfully added')
    } catch (error) {
      await Promise.all(Object.values(results).map(r => r.rollback()))

      console.error('Transaction failed:', error)
      toast.error('Failed to add Employee. Please try again.')
    }
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
