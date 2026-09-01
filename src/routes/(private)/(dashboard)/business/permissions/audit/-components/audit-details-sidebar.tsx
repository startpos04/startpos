/**
 * Audit Details Sidebar
 *
 * Shows detailed information about a permission audit entry.
 */

import { Calendar, Shield, ShieldCheck, ShieldX, User, X } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@startpos-core/components/ui/avatar'
import { Badge } from '@startpos-core/components/ui/badge'
import { Button } from '@startpos-core/components/ui/button'
import { ScrollArea } from '@startpos-core/components/ui/scroll-area'
import { Separator } from '@startpos-core/components/ui/separator'
import dayjs from '@startpos-core/lib/dayjs'
import type { AuditEntry } from '../../-permissions-tab'
import { closeAuditSidebar } from './audit-sidebar'

interface AuditDetailsSidebarProps {
  entry: AuditEntry
  onClose?: () => void
}

export function AuditDetailsSidebar({ entry, onClose }: AuditDetailsSidebarProps) {
  const handleClose = onClose ?? closeAuditSidebar

  const userInitials = entry.user.name
    ? entry.user.name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : entry.user.email.slice(0, 2).toUpperCase()

  const isGrant = entry.type === 'grant'

  return (
    <div className='flex flex-col h-full'>
      {/* Header */}
      <div className='flex items-start justify-between p-4 border-b shrink-0'>
        <div className='flex gap-3'>
          <div
            className={`h-10 w-10 rounded-xl border shadow-sm shrink-0 flex items-center justify-center ${isGrant ? 'bg-green-100 dark:bg-green-950' : 'bg-red-100 dark:bg-red-950'}`}
          >
            {isGrant ? (
              <ShieldCheck className='h-5 w-5 text-green-700 dark:text-green-400' />
            ) : (
              <ShieldX className='h-5 w-5 text-red-700 dark:text-red-400' />
            )}
          </div>
          <div>
            <div className='flex items-center gap-2 flex-wrap'>
              <h2 className='text-base font-semibold leading-tight'>Permission {isGrant ? 'Granted' : 'Revoked'}</h2>
            </div>
            <div className='flex gap-1.5 mt-1 flex-wrap'>
              <Badge variant={isGrant ? 'default' : 'destructive'} className={isGrant ? 'bg-green-600 text-[10px] py-0 h-4' : 'text-[10px] py-0 h-4'}>
                {isGrant ? 'Grant' : 'Revoke'}
              </Badge>
              {entry.actionAt && (
                <Badge variant='outline' className='text-[10px] py-0 h-4'>
                  {dayjs(entry.actionAt).fromNow()}
                </Badge>
              )}
            </div>
          </div>
        </div>
        <Button variant='ghost' size='icon' onClick={handleClose} className='h-7 w-7 shrink-0'>
          <X className='size-4' />
        </Button>
      </div>

      {/* Content */}
      <ScrollArea className='flex-1'>
        <div className='p-4 space-y-6'>
          {/* Permission Details */}
          <div>
            <div className='flex items-center gap-2 mb-3'>
              <Shield className='h-4 w-4 text-primary' />
              <h3 className='font-semibold'>Permission</h3>
            </div>
            <div className='space-y-3 bg-muted/30 rounded-lg p-4'>
              <div>
                <p className='text-sm font-medium text-muted-foreground mb-1'>Name</p>
                <p className='text-sm font-semibold'>{entry.permission.name}</p>
              </div>
              <Separator />
              <div>
                <p className='text-sm font-medium text-muted-foreground mb-1'>Key</p>
                <Badge variant='outline' className='font-mono text-xs'>
                  {entry.permission.key}
                </Badge>
              </div>
              {entry.permission.description && (
                <>
                  <Separator />
                  <div>
                    <p className='text-sm font-medium text-muted-foreground mb-1'>Description</p>
                    <p className='text-sm'>{entry.permission.description}</p>
                  </div>
                </>
              )}
              <Separator />
              <div className='flex gap-2'>
                <div className='flex-1'>
                  <p className='text-sm font-medium text-muted-foreground mb-1'>Scope</p>
                  <Badge variant='secondary' className='text-xs'>
                    {entry.permission.scope}
                  </Badge>
                </div>
                <div className='flex-1'>
                  <p className='text-sm font-medium text-muted-foreground mb-1'>Action</p>
                  <Badge variant='outline' className='text-xs'>
                    {entry.permission.action}
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          {/* Employee Details */}
          <div>
            <div className='flex items-center gap-2 mb-3'>
              <User className='h-4 w-4 text-primary' />
              <h3 className='font-semibold'>Employee</h3>
            </div>
            <div className='bg-muted/30 rounded-lg p-4'>
              <div className='flex items-center gap-3 mb-3'>
                <Avatar className='h-12 w-12'>
                  <AvatarImage src={entry.user.image || undefined} alt={entry.user.name || entry.user.email} />
                  <AvatarFallback>{userInitials}</AvatarFallback>
                </Avatar>
                <div className='flex-1'>
                  <p className='font-semibold'>{entry.user.name || entry.user.email}</p>
                  <p className='text-sm text-muted-foreground'>{entry.user.email}</p>
                </div>
              </div>
              <Separator className='my-3' />
              <div>
                <p className='text-sm font-medium text-muted-foreground mb-1'>Role</p>
                <Badge variant='outline'>{entry.user.role}</Badge>
              </div>
            </div>
          </div>

          {/* Timestamp */}
          {entry.actionAt && (
            <div>
              <div className='flex items-center gap-2 mb-3'>
                <Calendar className='h-4 w-4 text-primary' />
                <h3 className='font-semibold'>Timestamp</h3>
              </div>
              <div className='bg-muted/30 rounded-lg p-4 space-y-2'>
                <div>
                  <p className='text-sm font-medium text-muted-foreground'>Relative</p>
                  <p className='text-sm font-semibold'>{dayjs(entry.actionAt).fromNow()}</p>
                </div>
                <Separator />
                <div>
                  <p className='text-sm font-medium text-muted-foreground'>Absolute</p>
                  <p className='text-sm font-semibold'>{dayjs(entry.actionAt).format('MMMM DD, YYYY at h:mm A')}</p>
                </div>
              </div>
            </div>
          )}

          {/* Reason */}
          {entry.reason && (
            <div>
              <h3 className='font-semibold mb-3'>Reason</h3>
              <div className='bg-muted/30 rounded-lg p-4'>
                <p className='text-sm'>{entry.reason}</p>
              </div>
            </div>
          )}

          {/* Action By */}
          {entry.actionBy && (
            <div>
              <h3 className='font-semibold mb-3'>Performed By</h3>
              <div className='bg-muted/30 rounded-lg p-4'>
                <p className='text-sm text-muted-foreground'>Admin User</p>
                <p className='text-xs text-muted-foreground mt-1 font-mono'>{entry.actionBy}</p>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
