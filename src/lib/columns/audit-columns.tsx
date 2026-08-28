/** biome-ignore-all lint/suspicious/noExplicitAny: TODO: fix */
import type { ColumnHelper } from '@tanstack/react-table'
import { Calendar, ShieldCheck, ShieldX } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import dayjs from '@/lib/dayjs'
import type { AuditEntry } from '@/routes/(private)/(dashboard)/business/permissions/audit'

export const auditCols = {
  action: (h: ColumnHelper<AuditEntry>) =>
    h.accessor('type', {
      header: 'Action',
      cell: info => {
        const type = info.getValue()
        return (
          <div className='flex items-center gap-2'>
            {type === 'grant' ? (
              <>
                <div className='w-8 h-8 rounded-full bg-green-100 dark:bg-green-950 flex items-center justify-center shrink-0'>
                  <ShieldCheck className='h-4 w-4 text-green-700 dark:text-green-400' />
                </div>
                <Badge variant='default' className='bg-green-600 hover:bg-green-700'>
                  Granted
                </Badge>
              </>
            ) : type === 'revoke' ? (
              <>
                <div className='w-8 h-8 rounded-full bg-red-100 dark:bg-red-950 flex items-center justify-center shrink-0'>
                  <ShieldX className='h-4 w-4 text-red-700 dark:text-red-400' />
                </div>
                <Badge variant='destructive'>Revoked</Badge>
              </>
            ) : (
              <>
                <div className='w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-950 flex items-center justify-center shrink-0'>
                  <ShieldCheck className='h-4 w-4 text-blue-700 dark:text-blue-400' />
                </div>
                <Badge variant='outline' className='border-blue-600 text-blue-700 dark:text-blue-400'>
                  Reset
                </Badge>
              </>
            )}
          </div>
        )
      },
    }),

  permission: (h: ColumnHelper<AuditEntry>) =>
    h.accessor('permission', {
      header: 'Permission',
      cell: info => {
        const permission = info.getValue()
        return (
          <div className='flex flex-col'>
            <span className='font-semibold text-foreground'>{permission.name}</span>
            <div className='flex gap-1.5 mt-1'>
              <Badge variant='outline' className='text-[10px] py-0 h-4'>
                {permission.scope}
              </Badge>
            </div>
          </div>
        )
      },
    }),

  user: (h: ColumnHelper<AuditEntry>) =>
    h.accessor('user', {
      header: 'Employee',
      cell: info => {
        const user = info.getValue()
        const initials = user.name
          ? user.name
              .split(' ')
              .map(n => n[0])
              .join('')
              .toUpperCase()
              .slice(0, 2)
          : user.email.slice(0, 2).toUpperCase()

        return (
          <div className='flex items-center gap-3'>
            <Avatar className='h-8 w-8'>
              <AvatarImage src={user.image || undefined} alt={user.name || user.email} />
              <AvatarFallback className='text-xs'>{initials}</AvatarFallback>
            </Avatar>
            <div className='flex flex-col'>
              <span className='font-medium text-sm'>{user.name || user.email}</span>
              <Badge variant='outline' className='text-[10px] py-0 h-4 w-fit'>
                {user.role}
              </Badge>
            </div>
          </div>
        )
      },
    }),

  timestamp: (h: ColumnHelper<AuditEntry>) =>
    h.accessor('actionAt', {
      header: 'When',
      cell: info => {
        const timestamp = info.getValue()
        if (!timestamp) return <span className='text-xs text-muted-foreground'>Unknown</span>

        return (
          <div className='flex items-center gap-2'>
            <Calendar className='h-4 w-4 text-muted-foreground shrink-0' />
            <div className='flex flex-col'>
              <span className='text-sm font-medium'>{dayjs(timestamp).fromNow()}</span>
              <span className='text-xs text-muted-foreground'>{dayjs(timestamp).format('MMM DD, YYYY h:mm A')}</span>
            </div>
          </div>
        )
      },
    }),

  reason: (h: ColumnHelper<AuditEntry>) =>
    h.accessor('reason', {
      header: 'Reason',
      cell: info => {
        const reason = info.getValue()
        return reason ? (
          <span className='text-sm text-muted-foreground line-clamp-2'>{reason}</span>
        ) : (
          <span className='text-xs text-muted-foreground italic'>No reason provided</span>
        )
      },
    }),
}
