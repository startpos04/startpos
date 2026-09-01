/**
 * Permission Audit Page
 *
 * Shows audit history of permission grants and revokes in a table.
 * Click on an entry to see full details in a drawer.
 */

import { createFileRoute, useSearch, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { ArrowLeft } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { z } from 'zod'
import { getColumns } from '@/components/custom/data-view'
import { MultiView } from '@/components/custom/data-view/multi-view'
import { RequirePermission } from '@/components/custom/guards/require-permission'
import { Button } from '@/components/ui/button'
import { Permissions } from '@/lib/authorization/permission-keys'
import { auditCols } from '@/lib/columns/audit-columns'
import { tableCols } from '@/lib/columns/table-columns'
import MountManager from '@/lib/mount-manager'
import { fetchUsersWithPermissions } from '@/lib/queries/permission-management'
import { AuditDetailsSidebar } from './-components/audit-details-sidebar'
import { AUDIT_ASIDE_ID, closeAuditSidebar, showAuditSidebar } from './-components/audit-sidebar'

const searchSchema = z.object({
  view: z.enum(['table']).optional(),
  search: z.string().optional(),
  page: z.number().optional(),
  pageSize: z.number().optional(),
})

export const Route = createFileRoute('/(private)/(dashboard)/business/permissions/audit/')({
  validateSearch: searchSchema,
  component: RouteComponent,
})

export interface AuditEntry {
  id: string
  type: 'grant' | 'revoke'
  user: {
    id: string
    name: string | null
    email: string
    role: string
    image: string | null
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

function RouteComponent() {
  const { view = 'table', search = '', page = 1, pageSize = 20 } = useSearch({ from: '/(private)/(dashboard)/business/permissions/audit/' })
  const navigate = Route.useNavigate()
  const [selectedId, setSelectedId] = useState<string>('')

  // Fetch users with permissions to build audit log
  const { data, isLoading } = useQuery({
    queryKey: ['users-with-permissions'],
    queryFn: () => fetchUsersWithPermissions(),
  })

  // Build audit entries from user permissions
  const auditEntries = useMemo(() => {
    if (!data) return []

    const entries = data.users.flatMap(user => {
      const grants = user.customGrants.map(grant => ({
        type: 'grant' as const,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          image: user.image,
        },
        permission: grant.permission,
        actionBy: grant.grantedBy,
        actionAt: grant.grantedAt,
        reason: grant.reason,
        id: `grant-${grant.id}`,
      }))

      const revokes = user.customRevokes.map(revoke => ({
        type: 'revoke' as const,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          image: user.image,
        },
        permission: revoke.permission,
        actionBy: revoke.revokedBy,
        actionAt: revoke.revokedAt,
        reason: revoke.reason,
        id: `revoke-${revoke.id}`,
      }))

      return [...grants, ...revokes]
    })

    // Sort by date (most recent first)
    return entries.sort((a, b) => {
      if (!a.actionAt) return 1
      if (!b.actionAt) return -1
      return new Date(b.actionAt).getTime() - new Date(a.actionAt).getTime()
    })
  }, [data])

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
    <RequirePermission permission={Permissions.USER_MANAGE_PERMISSIONS}>
      <div className='w-full h-screen bg-background flex overflow-hidden relative min-h-0 flex-1'>
        <div className='flex-1 min-w-0 h-full px-4 flex flex-col overflow-hidden transition-all duration-300 ease-in-out bg-background/50 space-y-2'>
          <MultiView<AuditEntry>
            label='Permission Audit Log'
            description='Complete history of permission grants and revokes.'
            data={filteredEntries}
            isFetching={isLoading}
            actions={
              <Link to='/business/permissions' search={{}}>
                <Button variant='outline' size='sm' className='gap-2'>
                  <ArrowLeft className='h-4 w-4' />
                  Back to Permissions
                </Button>
              </Link>
            }
            searchable={{
              searchValue: search,
              onSearchChange: search => {
                navigate({ search: prev => ({ ...prev, search }), replace: true })
              },
            }}
            paginable={{
              pageSize,
              pageIndex: page - 1,
              totalItems: filteredEntries.length,
              onPaginationChange: next => {
                navigate({ search: prev => ({ ...prev, page: next.pageIndex + 1, pageSize: next.pageSize }), replace: true })
              },
            }}
            views={{
              onViewChange: view => {
                navigate({ search: prev => ({ ...prev, view }), replace: true })
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
    </RequirePermission>
  )
}
