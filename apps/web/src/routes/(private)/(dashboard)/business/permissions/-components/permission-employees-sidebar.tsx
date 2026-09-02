/**
 * Permission Employees Sidebar
 *
 * Side drawer that shows all employees who have a specific permission.
 * Allows adding or removing employees from the permission.
 */

import { Avatar, AvatarFallback, AvatarImage } from '@platform/components/ui/avatar'
import { Badge } from '@platform/components/ui/badge'
import { Button } from '@platform/components/ui/button'
import { Input } from '@platform/components/ui/input'
import { Label } from '@platform/components/ui/label'
import { Textarea } from '@platform/components/ui/textarea'
import type { PermissionKey } from '@platform/lib/authorization/permission-keys'
import { getDefaultPermissionsForRole } from '@platform/lib/authorization/role-permissions'
import dayjs from '@platform/lib/dayjs'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Plus, RotateCcw, Search, Shield, ShieldCheck, ShieldX, User, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  fetchPermissionsWithEmployees,
  fetchUsersWithPermissions,
  grantPermissionToUser,
  removePermissionOverride,
  revokePermissionFromUser,
} from '@/lib/queries/permission-management'
import { closePermissionSidebar } from './permission-sidebar'

interface PermissionEmployeesSidebarProps {
  permissionId: string
  onClose?: () => void
}

type EmployeeStatus = 'role-default' | 'custom-granted' | 'custom-revoked' | 'not-assigned'

export function PermissionEmployeesSidebar({ permissionId, onClose }: PermissionEmployeesSidebarProps) {
  const queryClient = useQueryClient()
  const handleClose = onClose ?? closePermissionSidebar
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [showAddDialog, setShowAddDialog] = useState(false)

  // Fetch all permissions to get the current permission data
  const { data: permissionsData } = useQuery({
    queryKey: ['permissions-with-employees'],
    queryFn: () => fetchPermissionsWithEmployees(),
  })

  const permission = useMemo(() => {
    return permissionsData?.permissions.find(p => p.id === permissionId)
  }, [permissionsData, permissionId])

  // Fetch all users to allow adding new employees
  const { data: usersData } = useQuery({
    queryKey: ['users-with-permissions'],
    queryFn: () => fetchUsersWithPermissions(),
  })

  // Build employee status map
  const employeeStatusMap = useMemo(() => {
    const statusMap = new Map<string, EmployeeStatus>()

    if (!usersData || !permission) return statusMap

    usersData.users.forEach(user => {
      // Check role defaults
      const rolePermissions = getDefaultPermissionsForRole(user.role)
      if (rolePermissions.includes(permission.key as PermissionKey)) {
        statusMap.set(user.id, 'role-default')
      } else {
        statusMap.set(user.id, 'not-assigned')
      }
    })

    // Apply custom grants
    permission.employeesWithGrant.forEach(emp => {
      statusMap.set(emp.id, 'custom-granted')
    })

    // Apply custom revokes
    permission.employeesWithRevoke.forEach(emp => {
      statusMap.set(emp.id, 'custom-revoked')
    })

    return statusMap
  }, [usersData, permission])

  // Get all employees with this permission (role default or custom grant), excluding OWNER
  const assignedEmployees = useMemo(() => {
    if (!usersData) return []
    return usersData.users.filter(user => {
      if (user.role === 'OWNER') return false // Exclude owners
      const status = employeeStatusMap.get(user.id)
      return status === 'role-default' || status === 'custom-granted'
    })
  }, [usersData, employeeStatusMap])

  // Get employees that can be added (not assigned and not revoked), excluding OWNER
  const availableEmployees = useMemo(() => {
    if (!usersData) return []
    return usersData.users.filter(user => {
      if (user.role === 'OWNER') return false // Exclude owners
      const status = employeeStatusMap.get(user.id)
      return status === 'not-assigned' || status === 'custom-revoked'
    })
  }, [usersData, employeeStatusMap])

  // Filter by search
  const filteredAssigned = useMemo(() => {
    if (!searchQuery.trim()) return assignedEmployees
    const query = searchQuery.toLowerCase()
    return assignedEmployees.filter(
      emp => emp.name?.toLowerCase().includes(query) || emp.email.toLowerCase().includes(query) || emp.role.toLowerCase().includes(query),
    )
  }, [assignedEmployees, searchQuery])

  const filteredAvailable = useMemo(() => {
    if (!searchQuery.trim()) return availableEmployees
    const query = searchQuery.toLowerCase()
    return availableEmployees.filter(
      emp => emp.name?.toLowerCase().includes(query) || emp.email.toLowerCase().includes(query) || emp.role.toLowerCase().includes(query),
    )
  }, [availableEmployees, searchQuery])

  // Mutations
  const grantMutation = useMutation({
    mutationFn: (data: { userId: string; permissionKey: string; reason?: string }) => grantPermissionToUser({ data }),
    onSuccess: data => {
      toast.success(data.message)
      queryClient.invalidateQueries({ queryKey: ['permissions-with-employees'] })
      queryClient.invalidateQueries({ queryKey: ['users-with-permissions'] })
      queryClient.invalidateQueries({ queryKey: ['permission-audit-log'] })
      setReason('')
      setSelectedEmployee(null)
      setShowAddDialog(false)
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to grant permission')
    },
  })

  const revokeMutation = useMutation({
    mutationFn: (data: { userId: string; permissionKey: string; reason?: string }) => revokePermissionFromUser({ data }),
    onSuccess: data => {
      toast.success(data.message)
      queryClient.invalidateQueries({ queryKey: ['permissions-with-employees'] })
      queryClient.invalidateQueries({ queryKey: ['users-with-permissions'] })
      queryClient.invalidateQueries({ queryKey: ['permission-audit-log'] })
      setReason('')
      setSelectedEmployee(null)
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to revoke permission')
    },
  })

  const removeMutation = useMutation({
    mutationFn: (data: { userId: string; permissionKey: string }) => removePermissionOverride({ data }),
    onSuccess: data => {
      toast.success(data.message)
      queryClient.invalidateQueries({ queryKey: ['permissions-with-employees'] })
      queryClient.invalidateQueries({ queryKey: ['users-with-permissions'] })
      queryClient.invalidateQueries({ queryKey: ['permission-audit-log'] })
      setReason('')
      setSelectedEmployee(null)
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to remove override')
    },
  })

  const handleGrant = (userId: string) => {
    if (!permission) return
    grantMutation.mutate({
      userId,
      permissionKey: permission.key,
      reason: reason.trim() || undefined,
    })
  }

  const handleRevoke = (userId: string) => {
    if (!permission) return
    revokeMutation.mutate({
      userId,
      permissionKey: permission.key,
      reason: reason.trim() || undefined,
    })
  }

  const handleRemove = (userId: string) => {
    if (!permission) return
    removeMutation.mutate({
      userId,
      permissionKey: permission.key,
    })
  }

  const getEmployeeStatus = (userId: string): EmployeeStatus => {
    return employeeStatusMap.get(userId) || 'not-assigned'
  }

  const isLoading = grantMutation.isPending || revokeMutation.isPending || removeMutation.isPending

  if (!permission) {
    return (
      <div className='flex flex-col h-full items-center justify-center p-8'>
        <Loader2 className='h-8 w-8 animate-spin text-muted-foreground mb-4' />
        <p className='text-sm text-muted-foreground'>Loading permission details...</p>
      </div>
    )
  }

  return (
    <div className='flex flex-col h-full'>
      {/* Header */}
      <div className='flex items-start justify-between p-4 border-b shrink-0'>
        <div className='flex gap-3'>
          <div className='h-10 w-10 rounded-xl border shadow-sm shrink-0 flex items-center justify-center bg-primary/10'>
            <Shield className='h-5 w-5 text-primary' />
          </div>
          <div>
            <div className='flex items-center gap-2 flex-wrap'>
              <h2 className='text-base font-semibold leading-tight'>{permission.name}</h2>
            </div>
            <div className='flex gap-1.5 mt-1 flex-wrap'>
              <Badge variant='secondary' className='text-[10px] py-0 h-4'>
                {permission.scope}
              </Badge>
              <Badge variant='outline' className='text-[10px] py-0 h-4'>
                {assignedEmployees.length} {assignedEmployees.length === 1 ? 'Employee' : 'Employees'}
              </Badge>
            </div>
            {permission.description && <p className='text-xs text-muted-foreground mt-1.5'>{permission.description}</p>}
          </div>
        </div>
        <Button variant='ghost' size='icon' onClick={handleClose} className='h-7 w-7 shrink-0'>
          <X className='size-4' />
        </Button>
      </div>

      {/* Search and Add Button */}
      <div className='p-4 pb-3 border-b shrink-0 space-y-3'>
        <div className='relative'>
          <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
          <Input placeholder='Search employees...' value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className='pl-9' />
        </div>
        <Button onClick={() => setShowAddDialog(!showAddDialog)} variant='outline' className='w-full'>
          <Plus className='h-4 w-4 mr-2' />
          Add Employee
        </Button>
      </div>

      {/* Content */}
      <div className='flex-1 overflow-y-auto'>
        <div className='p-4 space-y-6'>
          {/* Add Employee Section */}
          {showAddDialog && (
            <div className='border rounded-lg p-4 space-y-4 bg-muted/30'>
              <div className='flex items-center justify-between'>
                <h3 className='font-semibold'>Available Employees</h3>
                <Button variant='ghost' size='sm' onClick={() => setShowAddDialog(false)}>
                  Cancel
                </Button>
              </div>
              {filteredAvailable.length === 0 ? (
                <div className='text-center py-6 text-muted-foreground'>
                  <User className='mx-auto h-8 w-8 mb-2 opacity-50' />
                  <p className='text-sm'>No available employees</p>
                </div>
              ) : (
                <div className='space-y-2 max-h-60 overflow-y-auto'>
                  {filteredAvailable.map(employee => {
                    const status = getEmployeeStatus(employee.id)
                    const initials = employee.name
                      ? employee.name
                          .split(' ')
                          .map(n => n[0])
                          .join('')
                          .toUpperCase()
                          .slice(0, 2)
                      : employee.email.slice(0, 2).toUpperCase()

                    return (
                      <div key={employee.id} className='flex items-center justify-between p-3 border rounded-lg bg-card hover:bg-accent transition-colors'>
                        <div className='flex items-center gap-3'>
                          <Avatar className='h-8 w-8'>
                            <AvatarImage src={employee.image || undefined} alt={employee.name || employee.email} />
                            <AvatarFallback className='text-xs'>{initials}</AvatarFallback>
                          </Avatar>
                          <div>
                            <div className='font-medium text-sm'>{employee.name || employee.email}</div>
                            <div className='text-xs text-muted-foreground'>{employee.email}</div>
                          </div>
                        </div>
                        <Button
                          size='sm'
                          onClick={() => handleGrant(employee.id)}
                          disabled={isLoading}
                          variant={status === 'custom-revoked' ? 'outline' : 'default'}
                        >
                          {isLoading && selectedEmployee === employee.id ? (
                            <Loader2 className='h-3 w-3 animate-spin' />
                          ) : status === 'custom-revoked' ? (
                            <>
                              <RotateCcw className='h-3 w-3 mr-1' />
                              Restore
                            </>
                          ) : (
                            <>
                              <Plus className='h-3 w-3 mr-1' />
                              Add
                            </>
                          )}
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Assigned Employees List */}
          <div>
            <h3 className='font-semibold mb-4'>Employees with Permission</h3>
            {filteredAssigned.length === 0 ? (
              <div className='text-center py-12 text-muted-foreground border rounded-lg'>
                <User className='mx-auto h-12 w-12 mb-4 opacity-50' />
                <p>No employees found</p>
              </div>
            ) : (
              <div className='space-y-3'>
                {filteredAssigned.map(employee => {
                  const status = getEmployeeStatus(employee.id)
                  const isRoleDefault = status === 'role-default'
                  const isCustomGrant = status === 'custom-granted'
                  const grantInfo = permission.employeesWithGrant.find(e => e.id === employee.id)

                  const initials = employee.name
                    ? employee.name
                        .split(' ')
                        .map(n => n[0])
                        .join('')
                        .toUpperCase()
                        .slice(0, 2)
                    : employee.email.slice(0, 2).toUpperCase()

                  return (
                    <div key={employee.id} className='border rounded-lg p-4 space-y-3 bg-card'>
                      {/* Employee Info */}
                      <div className='flex items-start justify-between gap-3'>
                        <div className='flex items-center gap-3'>
                          <Avatar className='h-10 w-10'>
                            <AvatarImage src={employee.image || undefined} alt={employee.name || employee.email} />
                            <AvatarFallback>{initials}</AvatarFallback>
                          </Avatar>
                          <div>
                            <div className='font-semibold'>{employee.name || employee.email}</div>
                            <div className='text-sm text-muted-foreground'>{employee.email}</div>
                            <Badge variant='outline' className='mt-1 text-xs'>
                              {employee.role}
                            </Badge>
                          </div>
                        </div>

                        {/* Status Badge */}
                        <div className='flex flex-col items-end gap-2'>
                          {isRoleDefault && (
                            <Badge variant='outline' className='gap-1'>
                              <Shield className='h-3 w-3' />
                              Role Default
                            </Badge>
                          )}
                          {isCustomGrant && (
                            <Badge variant='default' className='gap-1 bg-green-600 hover:bg-green-700'>
                              <ShieldCheck className='h-3 w-3' />
                              Custom Grant
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Grant Details */}
                      {isCustomGrant && grantInfo && (
                        <div className='text-xs text-muted-foreground space-y-1 pl-13'>
                          {grantInfo.grantedAt && <div>Granted {dayjs(grantInfo.grantedAt).fromNow()}</div>}
                          {grantInfo.reason && (
                            <div className='bg-muted/50 rounded p-2 mt-2'>
                              <span className='font-medium'>Reason:</span> {grantInfo.reason}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Actions */}
                      <div className='flex gap-2 pt-2 border-t'>
                        {isCustomGrant && (
                          <>
                            <Button size='sm' variant='outline' onClick={() => handleRemove(employee.id)} disabled={isLoading} className='flex-1'>
                              {isLoading && selectedEmployee === employee.id ? (
                                <Loader2 className='h-3 w-3 mr-2 animate-spin' />
                              ) : (
                                <RotateCcw className='h-3 w-3 mr-2' />
                              )}
                              Reset to Default
                            </Button>
                            <Button
                              size='sm'
                              variant='destructive'
                              onClick={() => {
                                setSelectedEmployee(employee.id)
                                handleRevoke(employee.id)
                              }}
                              disabled={isLoading}
                              className='flex-1'
                            >
                              {isLoading && selectedEmployee === employee.id ? (
                                <Loader2 className='h-3 w-3 mr-2 animate-spin' />
                              ) : (
                                <ShieldX className='h-3 w-3 mr-2' />
                              )}
                              Revoke
                            </Button>
                          </>
                        )}
                        {isRoleDefault && (
                          <Button
                            size='sm'
                            variant='destructive'
                            onClick={() => {
                              setSelectedEmployee(employee.id)
                              handleRevoke(employee.id)
                            }}
                            disabled={isLoading}
                            className='w-full'
                          >
                            {isLoading && selectedEmployee === employee.id ? (
                              <Loader2 className='h-3 w-3 mr-2 animate-spin' />
                            ) : (
                              <ShieldX className='h-3 w-3 mr-2' />
                            )}
                            Revoke Permission
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Reason Input (shown when action requires it) */}
          {selectedEmployee && !isLoading && (
            <div className='border rounded-lg p-4 space-y-3 bg-muted/30'>
              <Label>Reason (Optional)</Label>
              <Textarea placeholder='Why are you making this change?' value={reason} onChange={e => setReason(e.target.value)} rows={3} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
