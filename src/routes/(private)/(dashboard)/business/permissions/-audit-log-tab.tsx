/**
 * Audit Log Tab
 *
 * Shows audit history of permission grants and revokes in a table.
 * Click on an entry to see full details in a drawer.
 */

import { useSearch } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useCallback, useMemo, useState } from 'react'
import { getColumns } from '@/components/custom/data-view'
import { MultiView } from '@/components/custom/data-view/multi-view'
import { auditCols } from '@/lib/columns/audit-columns'
import { tableCols } from '@/lib/columns/table-columns'
import MountManager from '@/lib/mount-manager'
import { fetchPermissionAuditLog, fetchUsersWithPermissions, fetchAllPermissions } from '@/lib/queries/permission-management'
import { AuditDetailsSidebar } from './audit/-components/audit-details-sidebar'
import { AUDIT_ASIDE_ID, closeAuditSidebar, showAuditSidebar } from './audit/-components/audit-sidebar'
import { Route } from './index'
import type { AuditEntry } from './audit'

export function AuditLogTab() {
  const { view = 'table', search = '', page = 1, pageSize = 20 } = useSearch({ from: '/(private)/(dashboard)/business/permissions/' })
  const navigate = Route.useNavigate()
  const [selectedId, setSelectedId] = useState<string>('')

  // Fetch audit log entries
  const { data: auditData, isLoading: isLoadingAudit } = useQuery({
    queryKey: ['permission-audit-log'],
    queryFn: () => fetchPermissionAuditLog(),
    refetchOnMount: 'always',
  })

  // Fetch users to get user details for the audit entries
  const { data: usersData } = useQuery({
    queryKey: ['users-with-permissions'],
    queryFn: () => fetchUsersWithPermissions(),
    refetchOnMount: 'always',
  })

  // Fetch all permissions to get permission details
  const { data: permissionsData } = useQuery({
    queryKey: ['all-permissions'],
    queryFn: () => fetchAllPermissions(),
    refetchOnMount: 'always',
  })

  // Build audit entries with user and permission details
  const auditEntries = useMemo(() => {
    if (!auditData || !usersData || !permissionsData) return []

    return auditData.entries.map(entry => {
      const user = usersData.users.find(u => u.id === entry.targetId)
      const actor = usersData.users.find(u => u.id === entry.actorId)
      const permission = permissionsData.permissions.find(p => p.key === entry.permissionKey)

      return {
        id: entry.id,
        type: entry.action === 'PERMISSION_GRANTED' ? ('grant' as const) : entry.action === 'PERMISSION_REVOKED' ? ('revoke' as const) : ('reset' as const),
        user: user
          ? {
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role,
              image: user.image,
            }
          : {
              id: entry.targetId,
              name: null,
              email: 'Unknown User',
              role: 'UNKNOWN',
              image: null,
            },
        permission: permission
          ? {
              id: permission.id,
              key: permission.key,
              name: permission.name,
              description: permission.description,
              scope: permission.scope,
              action: permission.action,
              resource: permission.resource,
            }
          : {
              id: '',
              key: entry.permissionKey,
              name: entry.permissionName,
              description: null,
              scope: 'UNKNOWN',
              action: '',
              resource: '',
            },
        actionBy: entry.actorId,
        actionAt: entry.createdAt,
        reason: entry.reason || null,
        actorName: actor?.name || actor?.email || 'Unknown',
      }
    })
  }, [auditData, usersData, permissionsData])

  const isLoading = isLoadingAudit

  // Filter audit entries by search query
  const filteredEntries = useMemo(() => {
    if (!search.trim()) return auditEntries
    const query = search.toLowerCase()
    return auditEntries.filter(
      entry =>
        entry.user.name?.toLowerCase().includes(query) ||
        entry.user.email.toLowerCase().includes(query) ||
        entry.permission.name.toLowerCase().includes(query) ||
        entry.permission.key.toLowerCase().includes(query) ||
        entry.reason?.toLowerCase().includes(query),
    )
  }, [auditEntries, search])

  const handleSelectRow = useCallback((entry: AuditEntry) => {
    setSelectedId(entry.id)
    showAuditSidebar(
      <AuditDetailsSidebar
        entry={entry}
        onClose={() => {
          setSelectedId('')
          closeAuditSidebar()
        }}
      />,
    )
  }, [])

  const columns = useMemo(
    () =>
      getColumns<AuditEntry>(
        h =>
          [
            tableCols.number(h),
            auditCols.action(h),
            auditCols.permission(h),
            auditCols.user(h),
            auditCols.timestamp(h),
            auditCols.reason(h),
            // biome-ignore lint/suspicious/noExplicitAny: ColumnDef generic type required by library
          ] as ColumnDef<AuditEntry, any>[],
      ),
    [],
  )

  return (
    <div className='w-full h-full bg-background flex overflow-hidden relative min-h-0 flex-1 gap-4'>
      <div className='flex-1 min-w-0 h-full flex flex-col overflow-hidden transition-all duration-300 ease-in-out bg-background/50 space-y-2'>
        <MultiView<AuditEntry>
          label='Permission Audit Log'
          description='Complete history of permission grants and revokes.'
          data={filteredEntries}
          isFetching={isLoading}
          searchable={{
            searchValue: search,
            onSearchChange: search => {
              navigate({ search: prev => ({ ...prev, search, tab: 'Audit Log' }), replace: true })
            },
          }}
          paginable={{
            pageSize,
            pageIndex: page - 1,
            totalItems: filteredEntries.length,
            onPaginationChange: next => {
              navigate({ search: prev => ({ ...prev, page: next.pageIndex + 1, pageSize: next.pageSize, tab: 'Audit Log' }), replace: true })
            },
          }}
          views={{
            onViewChange: view => {
              navigate({ search: prev => ({ ...prev, view, tab: 'Audit Log' }), replace: true })
            },
            selectedView: view,
            list: [
              {
                type: 'table',
                columns,
                selectableRow: { onClick: handleSelectRow, isSelected: (entry: AuditEntry) => entry.id === selectedId },
              },
            ],
          }}
        />
      </div>

      <MountManager id={AUDIT_ASIDE_ID} />
    </div>
  )
}
