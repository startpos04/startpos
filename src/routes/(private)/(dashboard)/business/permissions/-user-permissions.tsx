/**
 * User Permissions Tab
 *
 * Shows all users in the business with their assigned permissions.
 * Allows admins to grant/revoke custom permissions.
 */

import { useSuspenseQuery } from '@tanstack/react-query'
import { Crown, Plus, Shield, ShieldCheck, ShieldX, User } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import MountManager from '@/lib/mount-manager'
import { fetchUsersWithPermissions, type UserWithPermissions } from '@/lib/queries/permission-management'
import { PermissionAssignmentDialog } from './-permission-assignment-dialog'

export function UserPermissionsTab() {
  const { data } = useSuspenseQuery({
    queryKey: ['users-with-permissions'],
    queryFn: () => fetchUsersWithPermissions(),
  })

  const handleManagePermissions = (user: UserWithPermissions) => {
    MountManager.show(PermissionAssignmentDialog, {
      user,
    })
  }

  return (
    <div className='flex flex-col gap-4'>
      <Card>
        <CardHeader>
          <CardTitle>User Permissions</CardTitle>
          <CardDescription>
            View and manage custom permissions for each user. Role-based permissions are shown in light gray and cannot be removed directly.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='flex flex-col gap-4'>
            {data.users.length === 0 ? (
              <div className='text-center py-8 text-muted-foreground'>
                <User className='mx-auto h-12 w-12 mb-4 opacity-50' />
                <p>No users found</p>
              </div>
            ) : (
              data.users.map((user, index) => (
                <div key={user.id}>
                  {index > 0 && <Separator className='my-4' />}
                  <UserPermissionCard user={user} onManage={handleManagePermissions} />
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function UserPermissionCard({ user, onManage }: { user: UserWithPermissions; onManage: (user: UserWithPermissions) => void }) {
  const initials = user.name
    ? user.name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : user.email.slice(0, 2).toUpperCase()

  const isOwner = user.role === 'OWNER'
  const hasCustomGrants = user.customGrants.length > 0
  const hasCustomRevokes = user.customRevokes.length > 0
  const hasCustomPermissions = hasCustomGrants || hasCustomRevokes

  return (
    <div className='flex flex-col gap-4'>
      {/* User Info Row */}
      <div className='flex items-start justify-between'>
        <div className='flex items-center gap-3'>
          <Avatar className='h-10 w-10'>
            <AvatarImage src={user.image || undefined} alt={user.name || user.email} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className='flex flex-col'>
            <div className='flex items-center gap-2'>
              <span className='font-semibold'>{user.name || user.email}</span>
              {isOwner && (
                <Badge variant='default' className='gap-1'>
                  <Crown className='h-3 w-3' />
                  Owner
                </Badge>
              )}
            </div>
            <div className='flex items-center gap-2 text-sm text-muted-foreground'>
              <span>{user.email}</span>
              <span>•</span>
              <Badge variant='outline'>{user.role}</Badge>
            </div>
          </div>
        </div>

        <Button size='sm' variant='outline' onClick={() => onManage(user)} disabled={isOwner}>
          <Plus className='h-4 w-4 mr-2' />
          Manage Permissions
        </Button>
      </div>

      {/* Permissions Display */}
      {isOwner ? (
        <div className='flex items-center gap-2 p-3 bg-primary/5 border border-primary/20 rounded-lg'>
          <Crown className='h-4 w-4 text-primary' />
          <span className='text-sm text-muted-foreground'>Owner has all permissions by default</span>
        </div>
      ) : hasCustomPermissions ? (
        <div className='flex flex-col gap-3'>
          {/* Custom Grants */}
          {hasCustomGrants && (
            <div className='flex flex-col gap-2'>
              <div className='flex items-center gap-2 text-sm font-medium'>
                <ShieldCheck className='h-4 w-4 text-green-600' />
                <span>Custom Grants ({user.customGrants.length})</span>
              </div>
              <div className='flex flex-wrap gap-2'>
                {user.customGrants.map(grant => (
                  <Badge key={grant.id} variant='default' className='gap-1 bg-green-600 hover:bg-green-700'>
                    <Shield className='h-3 w-3' />
                    {grant.permission.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Custom Revokes */}
          {hasCustomRevokes && (
            <div className='flex flex-col gap-2'>
              <div className='flex items-center gap-2 text-sm font-medium'>
                <ShieldX className='h-4 w-4 text-red-600' />
                <span>Custom Revokes ({user.customRevokes.length})</span>
              </div>
              <div className='flex flex-wrap gap-2'>
                {user.customRevokes.map(revoke => (
                  <Badge key={revoke.id} variant='destructive' className='gap-1'>
                    <ShieldX className='h-3 w-3' />
                    {revoke.permission.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className='flex items-center gap-2 p-3 bg-muted rounded-lg'>
          <Shield className='h-4 w-4 text-muted-foreground' />
          <span className='text-sm text-muted-foreground'>Using role-based permissions only</span>
        </div>
      )}
    </div>
  )
}
