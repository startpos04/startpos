import { createFileRoute } from '@tanstack/react-router'
import { toast } from 'sonner'
import { userCollection } from '@/db/collections'
import { closeEmployeeSidebar } from '../-components/employee-sidebar'
import { CreateAccount, type CreateAccountFormData } from './-create-account'

export const Route = createFileRoute('/(private)/(dashboard)/(admin)/employees/create/')({
  component: () => <CreateEmployeeSidebar />,
})

export function CreateEmployeeSidebar() {
  const handleSubmit = async ({ value }: { value: CreateAccountFormData }) => {
    try {
      userCollection.insert({
        ...value,
        id: crypto.randomUUID(),
        image: value.image || null,
        emailVerified: false,
        updatedAt: new Date(),
        createdAt: new Date(),
        deletedAt: null,
      })

      toast.success('Employee successfully added')
      closeEmployeeSidebar()
    } catch (error) {
      console.error('Transaction failed:', error)
      toast.error('Failed to add Employee. Please try again.')
    }
  }

  return (
    <CreateAccount
      defaultValues={{ name: '', email: '', image: '', role: 'CASHIER' }}
      onSubmit={handleSubmit}
      textBtn={{ default: 'Add Employee', isSubmitting: 'Adding Employee...' }}
    >
      <div>
        <h2 className='text-xl font-semibold'>New Employee</h2>
        <p className='text-muted-foreground text-sm'>Create a new staff account and assign permissions.</p>
      </div>
    </CreateAccount>
  )
}
