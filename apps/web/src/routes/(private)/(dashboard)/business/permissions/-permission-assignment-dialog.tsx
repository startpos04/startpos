/**
 * Permission Assignment Dialog
 *
 * Dialog for granting/revoking custom permissions to/from a user.
 * Shows available permissions grouped by scope/category with search and filtering.
 */

import { Badge } from '@platform/components/ui/badge'
import { Button } from '@platform/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@platform/components/ui/collapsible'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@platform/components/ui/dialog'
import { Input } from '@platform/components/ui/input'
import { Label } from '@platform/components/ui/label'
import { ScrollArea } from '@platform/components/ui/scroll-area'
import { Separator } from '@platform/components/ui/separator'
import { Textarea } from '@platform/components/ui/textarea'
import type { PermissionKey } from '@platform/lib/authorization/permission-keys'
import { getDefaultPermissionsForRole } from '@platform/lib/authorization/role-permissions'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Loader2, RotateCcw, Search, Shield, ShieldCheck, ShieldX } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { MountProps } from '@platform/lib/mount-manager'
import {
  fetchAllPermissions,
  grantPermissionToUser,
  type PermissionDefinition,
  removePermissionOverride,
  revokePermissionFromUser,
  type UserWithPermissions,
} from '@/lib/queries/permission-management'

interface PermissionAssignmentDialogProps extends MountProps {
  user: UserWithPermissions
}

type PermissionStatus = 'role-default' | 'custom-granted' | 'custom-revoked'

export function PermissionAssignmentDialog({ user, open, onClose }: PermissionAssignmentDialogProps) {
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedPermission, setSelectedPermission] = useState<PermissionDefinition | null>(null)
  const [reason, setReason] = useState('')

  // Fetch all available permissions
  const { data: permissionsData } = useSuspenseQuery({
    queryKey: ['all-permissions'],
    queryFn: () => fetchAllPermissions(),
  })

  // Get role-based default permissions for this user
  const rolePermissions = useMemo(() => {
    return new Set(getDefaultPermissionsForRole(user.role))
  }, [user.role])

  // Build permission status map
  const permissionStatusMap = useMemo(() => {
    const statusMap = new Map<string, PermissionStatus>()

    // Start with role defaults
    permissionsData.permissions.forEach(perm => {
      if (rolePermissions.has(perm.key as PermissionKey)) {
        statusMap.set(perm.key, 'role-default')
      }
    })

    // Apply custom grants
    user.customGrants.forEach(grant => {
      statusMap.set(grant.permission.key, 'custom-granted')
    })

    // Apply custom revokes
    user.customRevokes.forEach(revoke => {
      statusMap.set(revoke.permission.key, 'custom-revoked')
    })

    return statusMap
  }, [permissionsData.permissions, rolePermissions, user.customGrants, user.customRevokes])

  // Filter permissions by search query
  const filteredPermissions = useMemo(() => {
    if (!searchQuery.trim()) return permissionsData.permissions

    const query = searchQuery.toLowerCase()
    return permissionsData.permissions.filter(
      perm =>
        perm.name.toLowerCase().includes(query) ||
        perm.key.toLowerCase().includes(query) ||
        perm.description?.toLowerCase().includes(query) ||
        perm.scope.toLowerCase().includes(query) ||
        perm.category?.toLowerCase().includes(query),
    )
  }, [permissionsData.permissions, searchQuery])

  // Group permissions by scope
  const permissionsByScope = useMemo(() => {
    const grouped = filteredPermissions.reduce(
      (acc, perm) => {
        if (!acc[perm.scope]) {
          acc[perm.scope] = []
        }
        acc[perm.scope].push(perm)
        return acc
      },
      {} as Record<string, PermissionDefinition[]>,
    )

    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b))
  }, [filteredPermissions])

  // Mutations
  const grantMutation = useMutation({
    mutationFn: (data: { userId: string; permissionKey: string; reason?: string }) => grantPermissionToUser({ data }),
    onSuccess: data => {
      toast.success(data.message)
      queryClient.invalidateQueries({ queryKey: ['users-with-permissions'] })
      queryClient.invalidateQueries({ queryKey: ['permissions-with-employees'] })
      queryClient.invalidateQueries({ queryKey: ['permission-audit-log'] })
      setSelectedPermission(null)
      setReason('')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to grant permission')
    },
  })

  const revokeMutation = useMutation({
    mutationFn: (data: { userId: string; permissionKey: string; reason?: string }) => revokePermissionFromUser({ data }),
    onSuccess: data => {
      toast.success(data.message)
      queryClient.invalidateQueries({ queryKey: ['users-with-permissions'] })
      queryClient.invalidateQueries({ queryKey: ['permissions-with-employees'] })
      queryClient.invalidateQueries({ queryKey: ['permission-audit-log'] })
      setSelectedPermission(null)
      setReason('')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to revoke permission')
    },
  })

  const removeMutation = useMutation({
    mutationFn: (data: { userId: string; permissionKey: string }) => removePermissionOverride({ data }),
    onSuccess: data => {
      toast.success(data.message)
      queryClient.invalidateQueries({ queryKey: ['users-with-permissions'] })
      queryClient.invalidateQueries({ queryKey: ['permissions-with-employees'] })
      queryClient.invalidateQueries({ queryKey: ['permission-audit-log'] })
      setSelectedPermission(null)
      setReason('')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to remove override')
    },
  })

  const handleGrant = () => {
    if (!selectedPermission) return
    grantMutation.mutate({
      userId: user.id,
      permissionKey: selectedPermission.key,
      reason: reason.trim() || undefined,
    })
  }

  const handleRevoke = () => {
    if (!selectedPermission) return
    revokeMutation.mutate({
      userId: user.id,
      permissionKey: selectedPermission.key,
      reason: reason.trim() || undefined,
    })
  }

  const handleRemove = () => {
    if (!selectedPermission) return
    removeMutation.mutate({
      userId: user.id,
      permissionKey: selectedPermission.key,
    })
  }

  const getPermissionStatus = (permissionKey: string): PermissionStatus => {
    return permissionStatusMap.get(permissionKey) || 'role-default'
  }

  const isLoading = grantMutation.isPending || revokeMutation.isPending || removeMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className='max-w-4xl h-[85vh] max-h-[85vh] flex flex-col'>
        <DialogHeader>
          <DialogTitle>Manage Permissions: {user.name || user.email}</DialogTitle>
          <DialogDescription>Grant or revoke custom permissions for this user. Role defaults are shown in gray.</DialogDescription>
        </DialogHeader>

        <div className='flex-1 flex flex-col gap-4 overflow-hidden'>
          {/* Search */}
          <div className='relative shrink-0'>
            <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
            <Input placeholder='Search permissions...' value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className='pl-9' />
          </div>

          {/* Two-column layout */}
          <div className='flex-1 grid grid-cols-2 gap-4 overflow-hidden'>
            {/* Left: Permission List */}
            <ScrollArea className='h-full border rounded-lg'>
              <div className='p-4 space-y-4'>
                {permissionsByScope.length === 0 ? (
                  <div className='text-center py-8 text-muted-foreground'>
                    <Shield className='mx-auto h-12 w-12 mb-4 opacity-50' />
                    <p>No permissions found</p>
                  </div>
                ) : (
                  permissionsByScope.map(([scope, permissions]) => (
                    <Collapsible key={scope} defaultOpen>
                      <CollapsibleTrigger className='flex items-center justify-between w-full p-2 hover:bg-accent rounded-lg'>
                        <span className='font-semibold'>{scope}</span>
                        <Badge variant='outline'>{permissions.length}</Badge>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className='mt-2 space-y-1'>
                          {permissions.map(permission => {
                            const status = getPermissionStatus(permission.key)
                            const isSelected = selectedPermission?.id === permission.id

                            return (
                              <button
                                type='button'
                                key={permission.id}
                                onClick={() => setSelectedPermission(permission)}
                                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                                  isSelected ? 'bg-accent border-primary' : 'hover:bg-accent border-transparent'
                                }`}
                              >
                                <div className='flex items-start justify-between gap-2'>
                                  <div className='flex-1 min-w-0'>
                                    <div className='font-medium truncate'>{permission.name}</div>
                                    {permission.description && <div className='text-xs text-muted-foreground truncate'>{permission.description}</div>}
                                  </div>
                                  {status === 'custom-granted' && <ShieldCheck className='h-4 w-4 text-green-600 shrink-0' />}
                                  {status === 'custom-revoked' && <ShieldX className='h-4 w-4 text-red-600 shrink-0' />}
                                  {status === 'role-default' && rolePermissions.has(permission.key as PermissionKey) && (
                                    <Shield className='h-4 w-4 text-muted-foreground shrink-0' />
                                  )}
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  ))
                )}
              </div>
            </ScrollArea>

            {/* Right: Permission Details & Actions */}
            <div className='border rounded-lg p-4 flex flex-col gap-4'>
              {selectedPermission ? (
                <>
                  <div className='flex flex-col gap-2'>
                    <h3 className='text-lg font-semibold'>{selectedPermission.name}</h3>
                    <Badge variant='outline' className='w-fit'>
                      {selectedPermission.key}
                    </Badge>
                    {selectedPermission.description && <p className='text-sm text-muted-foreground'>{selectedPermission.description}</p>}
                  </div>

                  <Separator />

                  {/* Current Status */}
                  <div className='flex flex-col gap-2'>
                    <Label>Current Status</Label>
                    <PermissionStatusBadge status={getPermissionStatus(selectedPermission.key)} />
                  </div>

                  {/* Reason Input */}
                  <div className='flex flex-col gap-2'>
                    <Label htmlFor='reason'>Reason (Optional)</Label>
                    <Textarea
                      id='reason'
                      placeholder='Why are you granting/revoking this permission?'
                      value={reason}
                      onChange={e => setReason(e.target.value)}
                      rows={3}
                    />
                  </div>

                  {/* Actions */}
                  <div className='flex flex-col gap-2 mt-auto'>
                    {getPermissionStatus(selectedPermission.key) === 'custom-granted' ? (
                      <>
                        <Button onClick={handleRemove} variant='outline' disabled={isLoading} className='w-full'>
                          {isLoading ? (
                            <>
                              <Loader2 className='h-4 w-4 mr-2 animate-spin' />
                              Removing...
                            </>
                          ) : (
                            <>
                              <RotateCcw className='h-4 w-4 mr-2' />
                              Reset to Role Default
                            </>
                          )}
                        </Button>
                        <Button onClick={handleRevoke} variant='destructive' disabled={isLoading} className='w-full'>
                          {isLoading ? (
                            <>
                              <Loader2 className='h-4 w-4 mr-2 animate-spin' />
                              Revoking...
                            </>
                          ) : (
                            <>
                              <ShieldX className='h-4 w-4 mr-2' />
                              Revoke Permission
                            </>
                          )}
                        </Button>
                      </>
                    ) : getPermissionStatus(selectedPermission.key) === 'custom-revoked' ? (
                      <>
                        <Button onClick={handleRemove} variant='outline' disabled={isLoading} className='w-full'>
                          {isLoading ? (
                            <>
                              <Loader2 className='h-4 w-4 mr-2 animate-spin' />
                              Removing...
                            </>
                          ) : (
                            <>
                              <RotateCcw className='h-4 w-4 mr-2' />
                              Reset to Role Default
                            </>
                          )}
                        </Button>
                        <Button onClick={handleGrant} disabled={isLoading} className='w-full'>
                          {isLoading ? (
                            <>
                              <Loader2 className='h-4 w-4 mr-2 animate-spin' />
                              Granting...
                            </>
                          ) : (
                            <>
                              <ShieldCheck className='h-4 w-4 mr-2' />
                              Grant Permission
                            </>
                          )}
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button onClick={handleGrant} disabled={isLoading} className='w-full'>
                          {isLoading ? (
                            <>
                              <Loader2 className='h-4 w-4 mr-2 animate-spin' />
                              Granting...
                            </>
                          ) : (
                            <>
                              <ShieldCheck className='h-4 w-4 mr-2' />
                              Grant Permission
                            </>
                          )}
                        </Button>
                        <Button onClick={handleRevoke} variant='destructive' disabled={isLoading} className='w-full'>
                          {isLoading ? (
                            <>
                              <Loader2 className='h-4 w-4 mr-2 animate-spin' />
                              Revoking...
                            </>
                          ) : (
                            <>
                              <ShieldX className='h-4 w-4 mr-2' />
                              Revoke Permission
                            </>
                          )}
                        </Button>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <div className='flex items-center justify-center h-full text-muted-foreground'>
                  <div className='text-center'>
                    <Shield className='mx-auto h-12 w-12 mb-4 opacity-50' />
                    <p>Select a permission to manage</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function PermissionStatusBadge({ status }: { status: PermissionStatus }) {
  switch (status) {
    case 'custom-granted':
      return (
        <Badge variant='default' className='w-fit bg-green-600 hover:bg-green-700'>
          <ShieldCheck className='h-3 w-3 mr-1' />
          Custom Grant
        </Badge>
      )
    case 'custom-revoked':
      return (
        <Badge variant='destructive' className='w-fit'>
          <ShieldX className='h-3 w-3 mr-1' />
          Custom Revoke
        </Badge>
      )
    case 'role-default':
      return (
        <Badge variant='outline' className='w-fit'>
          <Shield className='h-3 w-3 mr-1' />
          Role Default
        </Badge>
      )
  }
}
