/**
 * Permission Audit Tab
 *
 * Shows audit history of permission grants and revokes.
 * Displays who granted/revoked permissions, when, and why.
 */

import { useSuspenseQuery } from '@tanstack/react-query'
import { Calendar, Shield, ShieldCheck, ShieldX, User } from 'lucide-react'
import { Avatar, AvatarFallback } from '@startpos-core/components/ui/avatar'
import { Badge } from '@startpos-core/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@startpos-core/components/ui/card'
import { ScrollArea } from '@startpos-core/components/ui/scroll-area'
import { Separator } from '@startpos-core/components/ui/separator'
import dayjs from '@startpos-core/lib/dayjs'
import { fetchUsersWithPermissions } from '@/lib/queries/permission-management'

export function PermissionAuditTab() {
  const { data } = useSuspenseQuery({
    queryKey: ['users-with-permissions'],
    queryFn: () => fetchUsersWithPermissions(),
  })

  // Collect all permission changes (grants and revokes) into a single timeline
  const auditEntries = data.users.flatMap(user => {
    const grants = user.customGrants.map(grant => ({
      type: 'grant' as const,
      user,
      permission: grant.permission,
      actionBy: grant.grantedBy,
      actionAt: grant.grantedAt,
      reason: grant.reason,
      id: `grant-${grant.id}`,
    }))

    const revokes = user.customRevokes.map(revoke => ({
      type: 'revoke' as const,
      user,
      permission: revoke.permission,
      actionBy: revoke.revokedBy,
      actionAt: revoke.revokedAt,
      reason: revoke.reason,
      id: `revoke-${revoke.id}`,
    }))

    return [...grants, ...revokes]
  })

  // Sort by date (most recent first)
  const sortedEntries = auditEntries.sort((a, b) => {
    if (!a.actionAt) return 1
    if (!b.actionAt) return -1
    return new Date(b.actionAt).getTime() - new Date(a.actionAt).getTime()
  })

  return (
    <div className='flex flex-col gap-4'>
      <Card>
        <CardHeader>
          <CardTitle>Permission Audit Log</CardTitle>
          <CardDescription>Complete history of all permission grants and revokes in your business</CardDescription>
        </CardHeader>
        <CardContent>
          {sortedEntries.length === 0 ? (
            <div className='text-center py-12 text-muted-foreground'>
              <Shield className='mx-auto h-16 w-16 mb-4 opacity-50' />
              <p className='text-lg font-medium mb-2'>No Permission Changes</p>
              <p className='text-sm'>Custom permission grants and revokes will appear here</p>
            </div>
          ) : (
            <ScrollArea className='h-[600px] pr-4'>
              <div className='space-y-4'>
                {sortedEntries.map((entry, index) => (
                  <div key={entry.id}>
                    {index > 0 && <Separator className='my-4' />}
                    <AuditEntry entry={entry} />
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

interface AuditEntryProps {
  entry: {
    type: 'grant' | 'revoke'
    user: {
      id: string
      name: string | null
      email: string
      role: string
    }
    permission: {
      key: string
      name: string
      description: string | null
      scope: string
      action: string
      resource: string
    }
    actionBy: string | null
    actionAt: Date | null
    reason: string | null
  }
}

function AuditEntry({ entry }: AuditEntryProps) {
  const { type, user, permission, actionBy, actionAt, reason } = entry

  const userInitials = user.name
    ? user.name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : user.email.slice(0, 2).toUpperCase()

  const timeAgo = actionAt ? dayjs(actionAt).fromNow() : 'Unknown time'

  return (
    <div className='flex gap-4'>
      {/* Icon */}
      <div
        className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${type === 'grant' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
      >
        {type === 'grant' ? <ShieldCheck className='h-5 w-5' /> : <ShieldX className='h-5 w-5' />}
      </div>

      {/* Content */}
      <div className='flex-1 space-y-2'>
        {/* Main Action */}
        <div className='flex items-start justify-between gap-2'>
          <div className='flex-1'>
            <div className='flex items-center gap-2 flex-wrap'>
              <Badge variant={type === 'grant' ? 'default' : 'destructive'} className={type === 'grant' ? 'bg-green-600 hover:bg-green-700' : ''}>
                {type === 'grant' ? 'Granted' : 'Revoked'}
              </Badge>
              <span className='font-medium'>{permission.name}</span>
            </div>
            <p className='text-sm text-muted-foreground mt-1'>
              {type === 'grant' ? 'Granted to' : 'Revoked from'} <span className='font-medium'>{user.name || user.email}</span>
            </p>
          </div>
        </div>

        {/* Permission Details */}
        <div className='flex flex-wrap gap-2 text-xs text-muted-foreground'>
          <Badge variant='outline' className='gap-1'>
            <Shield className='h-3 w-3' />
            {permission.key}
          </Badge>
          <Badge variant='outline'>{permission.scope}</Badge>
          <Badge variant='outline'>{user.role}</Badge>
        </div>

        {/* Reason */}
        {reason && (
          <div className='bg-muted/50 rounded-lg p-3'>
            <p className='text-sm'>
              <span className='font-medium'>Reason:</span> {reason}
            </p>
          </div>
        )}

        {/* Metadata */}
        <div className='flex items-center gap-4 text-xs text-muted-foreground'>
          <div className='flex items-center gap-1'>
            <Calendar className='h-3 w-3' />
            <span>{timeAgo}</span>
          </div>
          {actionBy && (
            <div className='flex items-center gap-1'>
              <User className='h-3 w-3' />
              <span>by Admin</span>
            </div>
          )}
        </div>
      </div>

      {/* User Avatar */}
      <Avatar className='h-10 w-10 shrink-0'>
        <AvatarFallback>{userInitials}</AvatarFallback>
      </Avatar>
    </div>
  )
}
