/** biome-ignore-all lint/suspicious/noExplicitAny: TODO: fix */
import type { ColumnHelper } from '@tanstack/react-table'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { WarningPrompt } from '@startpos-core/components/custom/prompt/warning-prompt'
import { Avatar, AvatarFallback, AvatarImage } from '@startpos-core/components/ui/avatar'
import { Button } from '@startpos-core/components/ui/button'
import { userCollection } from '@startpos-core/db/collections'
import { AuditAction, AuditTargetType } from '@/lib/audit/types'
import MountManager from '@/lib/mount-manager'
import { writeAudit } from '@/lib/server-fn/write-audit'

export const employeeCols = {
  avatar: (h: ColumnHelper<any>) =>
    h.accessor('image', {
      header: 'Avatar',
      maxSize: 20,
      cell: info => {
        const user = info.row.original
        return (
          <Avatar className='h-9 w-9 border border-border/50 shadow-sm'>
            <AvatarImage src={user.image ?? ''} alt={user.name} />
            <AvatarFallback className='bg-primary/5 text-primary text-xs font-bold'>{user.name?.charAt(0)}</AvatarFallback>
          </Avatar>
        )
      },
    }),

  name: (h: ColumnHelper<any>) =>
    h.accessor('name', {
      header: 'Employee',
      cell: info => <span className='font-medium text-foreground'>{info.getValue()}</span>,
    }),

  email: (h: ColumnHelper<any>) =>
    h.accessor('email', {
      header: 'Email',
      cell: info => <span className='text-sm text-muted-foreground'>{info.getValue()}</span>,
    }),

  role: (h: ColumnHelper<any>) =>
    h.accessor('role', {
      maxSize: 100,
      header: 'Role',
      cell: info => <span className='capitalize text-sm text-slate-600'>{info.getValue()}</span>,
    }),

  deleteAction: (h: ColumnHelper<any>) =>
    h.display({
      maxSize: 60,
      id: 'actions',
      header: () => <div className='text-right pr-4'>Actions</div>,
      cell: ({ row }) => {
        const handleDelete = async () => {
          MountManager.show(WarningPrompt, {
            title: 'Delete Employee',
            description: 'Are you sure you want to delete this employee? This will affect their access to the system.',
            onConfirm: async () => {
              try {
                const before = { id: row.original.id, name: row.original.name, role: row.original.role, email: row.original.email }
                userCollection.update(row.original.id, draft => {
                  draft.deletedAt = new Date()
                })
                toast.success('Employee archived successfully')
                // Fire-and-forget audit write — does not block the success path
                writeAudit({
                  data: {
                    action: AuditAction.EMPLOYEE_DISABLED,
                    targetType: AuditTargetType.User,
                    targetId: row.original.id,
                    before,
                    after: null,
                  },
                }).catch(err => console.error('[audit] EMPLOYEE_DISABLED write failed:', err))
                return true
              } catch (error) {
                console.error('Transaction failed:', error)
                toast.error('Failed to archive employee. Please try again.')
              }
              return false
            },
          })
        }

        return (
          <div className='flex justify-end pr-2'>
            <Button
              variant='ghost'
              size='icon'
              className='rounded-full text-destructive hover:text-destructive hover:bg-destructive/10'
              onClick={e => {
                e.stopPropagation()
                handleDelete()
              }}
            >
              <Trash2 />
            </Button>
          </div>
        )
      },
    }),
}
