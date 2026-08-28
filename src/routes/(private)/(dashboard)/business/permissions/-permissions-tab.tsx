/**
 * Permissions Tab
 *
 * Shows all permissions in a table with employee counts.
 * Click on a permission to see assigned employees and manage them via side drawer.
 */

import { useSearch } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useCallback, useMemo, useState } from 'react'
import { getColumns } from '@/components/custom/data-view'
import { MultiView } from '@/components/custom/data-view/multi-view'
import { permissionCols } from '@/lib/columns/permission-columns'
import { tableCols } from '@/lib/columns/table-columns'
import MountManager from '@/lib/mount-manager'
import { fetchPermissionsWithEmployees, type PermissionWithEmployees } from '@/lib/queries/permission-management'
import { PermissionEmployeesSidebar } from './-components/permission-employees-sidebar'
import { closePermissionSidebar, PERMISSION_ASIDE_ID, showPermissionSidebar } from './-components/permission-sidebar'
import { Route } from './index'

export function PermissionsTab() {
  const { view = 'table', search = '', page = 1, pageSize = 20 } = useSearch({ from: '/(private)/(dashboard)/business/permissions/' })
  const navigate = Route.useNavigate()
  const [selectedId, setSelectedId] = useState<string>('')

  // Fetch permissions with employee assignments
  const { data, isLoading } = useQuery({
    queryKey: ['permissions-with-employees'],
    queryFn: () => fetchPermissionsWithEmployees(),
  })

  const permissions = data?.permissions || []

  // Filter permissions by search query
  const filteredPermissions = useMemo(() => {
    if (!search.trim()) return permissions
    const query = search.toLowerCase()
    return permissions.filter(
      perm =>
        perm.name.toLowerCase().includes(query) ||
        perm.key.toLowerCase().includes(query) ||
        perm.description?.toLowerCase().includes(query) ||
        perm.scope.toLowerCase().includes(query) ||
        perm.category?.toLowerCase().includes(query) ||
        perm.action.toLowerCase().includes(query) ||
        perm.resource.toLowerCase().includes(query),
    )
  }, [permissions, search])

  const handleSelectRow = useCallback((permission: PermissionWithEmployees) => {
    setSelectedId(permission.id)
    showPermissionSidebar(
      <PermissionEmployeesSidebar
        permissionId={permission.id}
        onClose={() => {
          setSelectedId('')
          closePermissionSidebar()
        }}
      />,
    )
  }, [])

  const columns = useMemo(
    () =>
      getColumns<PermissionWithEmployees>(
        h =>
          [
            tableCols.number(h),
            permissionCols.name(h),
            permissionCols.description(h),
            permissionCols.scope(h),
            permissionCols.category(h),
            permissionCols.employees(h),
            // biome-ignore lint/suspicious/noExplicitAny: ColumnDef generic type required by library
          ] as ColumnDef<PermissionWithEmployees, any>[],
      ),
    [],
  )

  return (
    <div className='w-full h-full bg-background flex overflow-hidden relative min-h-0 flex-1 gap-4'>
      <div className='flex-1 min-w-0 h-full flex flex-col overflow-hidden transition-all duration-300 ease-in-out bg-background/50 space-y-2'>
        <MultiView<PermissionWithEmployees>
          label='Permissions'
          description='View all permissions and manage employee assignments.'
          data={filteredPermissions}
          isFetching={isLoading}
          searchable={{
            searchValue: search,
            onSearchChange: search => {
              navigate({ search: prev => ({ ...prev, search, tab: 'Permissions' }), replace: true })
            },
          }}
          paginable={{
            pageSize,
            pageIndex: page - 1,
            totalItems: filteredPermissions.length,
            onPaginationChange: next => {
              navigate({ search: prev => ({ ...prev, page: next.pageIndex + 1, pageSize: next.pageSize, tab: 'Permissions' }), replace: true })
            },
          }}
          views={{
            onViewChange: view => {
              navigate({ search: prev => ({ ...prev, view, tab: 'Permissions' }), replace: true })
            },
            selectedView: view,
            list: [
              {
                type: 'table',
                columns,
                selectableRow: { onClick: handleSelectRow, isSelected: (p: PermissionWithEmployees) => p.id === selectedId },
              },
            ],
          }}
        />
      </div>

      <MountManager id={PERMISSION_ASIDE_ID} />
    </div>
  )
}
