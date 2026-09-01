import { ArrowLeft, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { userCollection } from '@/db/collections'
import { AuditAction, AuditTargetType } from '@/lib/audit/types'
import type { MountProps } from '@/lib/mount-manager'
import { writeAudit } from '@/lib/server-fn/write-audit'
import { closeEmployeeSidebar } from '../-components/employee-sidebar'
import { CreateAccount, type CreateAccountFormData } from '../create/-create-account'

interface EditEmployeeSidebarProps extends MountProps {
  employeeId: string
  defaultValues: CreateAccountFormData
  onBack?: () => void
}

export function EditEmployeeSidebar({ employeeId, defaultValues, open: _open, onClose, onBack }: EditEmployeeSidebarProps) {
  const handleSubmit = async ({ value }: { value: CreateAccountFormData }) => {
    try {
      const before = { name: defaultValues.name, email: defaultValues.email, role: defaultValues.role }
      userCollection.update(employeeId, draft => {
        Object.assign(draft, value)
        draft.image = value.image || null
      })

      toast.success('Employee successfully updated')

      // Audit role changes specifically — role escalation is a privilege-elevating action.
      if (value.role !== defaultValues.role) {
        writeAudit({
          data: {
            action: AuditAction.EMPLOYEE_ROLE_CHANGED,
            targetType: AuditTargetType.User,
            targetId: employeeId,
            before,
            after: { name: value.name, email: value.email, role: value.role },
          },
        }).catch(err => console.error('[audit] EMPLOYEE_ROLE_CHANGED write failed:', err))
      } else {
        // Non-role profile update — still auditable but lower severity
        writeAudit({
          data: {
            action: AuditAction.EMPLOYEE_UPDATED,
            targetType: AuditTargetType.User,
            targetId: employeeId,
            before,
            after: { name: value.name, email: value.email, role: value.role },
          },
        }).catch(err => console.error('[audit] EMPLOYEE_UPDATED write failed:', err))
      }

      if (onBack) onBack()
      else if (onClose) onClose()
      else closeEmployeeSidebar()
    } catch (error) {
      console.error('Transaction failed:', error)
      toast.error('Failed to update Employee. Please try again.')
    }
  }

  const handleClose = () => {
    if (onClose) onClose()
    else closeEmployeeSidebar()
  }

  return (
    <div className='flex flex-col h-full'>
      {/* Header band */}
      <div className='flex items-center justify-between p-4 border-b shrink-0'>
        <div className='flex items-center gap-2'>
          {onBack && (
            <Button variant='ghost' size='icon' onClick={onBack} className='h-7 w-7'>
              <ArrowLeft className='size-4' />
            </Button>
          )}
          <div>
            <h2 className='text-base font-semibold leading-none'>Edit Employee</h2>
            <p className='text-xs text-muted-foreground mt-1'>Update staff account and permissions.</p>
          </div>
        </div>
        <Button variant='ghost' size='icon' onClick={handleClose} className='h-7 w-7'>
          <X className='size-4' />
        </Button>
      </div>

      {/* Form — CreateAccount already has flex-col h-full with scrollable body + sticky footer */}
      <CreateAccount defaultValues={defaultValues} onSubmit={handleSubmit} textBtn={{ default: 'Update Employee', isSubmitting: 'Updating...' }} />
    </div>
  )
}
