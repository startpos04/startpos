import { Button } from '@platform/components/ui/button'
import { createFileRoute } from '@tanstack/react-router'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { createEmployee } from '@/lib/server-fn/create-employee'
import { closeEmployeeSidebar } from '../-components/employee-sidebar'
import { CreateAccount, type CreateAccountFormData } from './-create-account'

export const Route = createFileRoute('/(private)/(dashboard)/employees/create/')({
  component: () => <CreateEmployeeSidebar />,
})

interface CreateEmployeeSidebarProps {
  onClose?: () => void
}

export function CreateEmployeeSidebar({ onClose }: CreateEmployeeSidebarProps) {
  const handleClose = onClose ?? closeEmployeeSidebar

  const handleSubmit = async ({ value }: { value: CreateAccountFormData }) => {
    try {
      const result = await createEmployee({
        data: {
          name: value.name,
          email: value.email,
          image: value.image || undefined,
          role: value.role,
        },
      })

      if (!result.success) {
        toast.error(result.error ?? 'Failed to create employee')
        return
      }

      toast.success('Employee successfully added')
      handleClose()
    } catch (error) {
      console.error('Employee creation failed:', error)
      toast.error('Failed to add Employee. Please try again.')
    }
  }

  return (
    <CreateAccount
      defaultValues={{ name: '', email: '', image: '', role: 'CASHIER' }}
      onSubmit={handleSubmit}
      textBtn={{ default: 'Add Employee', isSubmitting: 'Adding Employee...' }}
    >
      <div className='flex items-start justify-between gap-2'>
        <div>
          <h2 className='text-xl font-semibold'>New Employee</h2>
          <p className='text-muted-foreground text-sm'>Create a new staff account and assign permissions.</p>
        </div>
        <Button type='button' variant='ghost' size='icon' onClick={handleClose} className='shrink-0 mt-0.5'>
          <X />
        </Button>
      </div>
    </CreateAccount>
  )
}
