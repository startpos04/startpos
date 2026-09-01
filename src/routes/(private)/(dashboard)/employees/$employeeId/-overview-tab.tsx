/**
 * Employee Overview Tab
 * 
 * Displays contact information, activity stats, session status, and account management controls
 */

import { Ban, Calendar, Mail, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import dayjs from '@/lib/dayjs'
import { cn } from '@/lib/utils'

interface OverviewTabProps {
  employee: any
  isOnline: boolean
  handleRevokeSession: () => void
  handleDisable: () => void
}

export function OverviewTab({ employee, isOnline, handleRevokeSession, handleDisable }: OverviewTabProps) {
  return (
    <div className='space-y-5'>
      {/* Contact */}
      <div className='space-y-3'>
        <h4 className='text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2'>
          <Mail className='w-3 h-3' /> Contact
        </h4>
        <div className='space-y-2.5'>
          <div className='flex items-center gap-2.5 text-sm'>
            <Mail className='h-3.5 w-3.5 text-muted-foreground shrink-0' />
            <span className='truncate text-sm'>{employee.email}</span>
          </div>
          <div className='flex items-center gap-2.5 text-sm'>
            <Calendar className='h-3.5 w-3.5 text-muted-foreground shrink-0' />
            <span className='text-sm'>Joined {dayjs(employee.createdAt).format('MMM DD, YYYY')}</span>
          </div>
        </div>
      </div>

      <Separator />

      {/* Quick stats */}
      <div className='space-y-3'>
        <h4 className='text-[10px] font-bold uppercase tracking-widest text-muted-foreground'>Activity</h4>
        <div className='grid grid-cols-2 gap-2'>
          <div className='rounded-xl border bg-card p-3'>
            <p className='text-2xl font-bold'>{employee.processedSales[0]?.count || 0}</p>
            <p className='text-[10px] text-muted-foreground uppercase font-bold mt-0.5'>Sales</p>
          </div>
          <div className='rounded-xl border bg-card p-3'>
            <p className='text-2xl font-bold'>{employee.performedServices[0]?.count || 0}</p>
            <p className='text-[10px] text-muted-foreground uppercase font-bold mt-0.5'>Services</p>
          </div>
        </div>
      </div>

      <Separator />

      {/* Session status */}
      <div className='space-y-3'>
        <h4 className='text-[10px] font-bold uppercase tracking-widest text-muted-foreground'>Session</h4>
        <div className='flex items-center justify-between'>
          <div>
            <p className='text-sm font-semibold'>{isOnline ? 'Currently active' : 'Offline'}</p>
            {employee.sessions[0] && (
              <p className='text-[10px] text-muted-foreground mt-0.5'>
                {employee.sessions[0].ipAddress} · {dayjs().to(dayjs(employee.sessions[0].expiresAt))}
              </p>
            )}
          </div>
          <div className={cn('h-2 w-2 rounded-full shrink-0', isOnline ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground/30')} />
        </div>
      </div>

      <Separator />

      {/* Danger zone */}
      <div className='space-y-3'>
        <h4 className='text-[10px] font-bold uppercase tracking-widest text-destructive flex items-center gap-1.5'>
          <ShieldAlert className='h-3 w-3' /> Danger Zone
        </h4>
        <div className='space-y-2'>
          <div className='flex items-center justify-between'>
            <div>
              <p className='text-xs font-bold'>Revoke All Sessions</p>
              <p className='text-[10px] text-muted-foreground mt-0.5'>Forces sign-out on all devices.</p>
            </div>
            <Button variant='destructive' size='sm' className='h-7 text-xs' onClick={handleRevokeSession}>
              Sign Out
            </Button>
          </div>
          <div className='flex items-center justify-between'>
            <div>
              <p className='text-xs font-bold'>Disable Account</p>
              <p className='text-[10px] text-muted-foreground mt-0.5'>Prevents login without deleting data.</p>
            </div>
            <Button variant='outline' size='sm' className='h-7 text-xs border-destructive/40 text-destructive hover:bg-destructive/10' onClick={handleDisable}>
              <Ban className='size-3 mr-1' /> Disable
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
