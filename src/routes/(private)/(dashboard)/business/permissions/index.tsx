/**
 * Permission Management Page
 *
 * Admin interface for viewing and managing permissions.
 * Tabbed interface with Permissions and Audit Log tabs.
 *
 * Access: Requires USER.MANAGE_PERMISSIONS permission
 */

import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import Tab from '@/components/custom/tab'
import { RequirePermission } from '@/components/custom/guards/require-permission'
import { Permissions } from '@/lib/authorization/permission-keys'
import { PermissionsTab } from './-permissions-tab'
import { AuditLogTab } from './-audit-log-tab'

const searchSchema = z.object({
  tab: z.string().optional(),
  view: z.enum(['table', 'grid']).optional(),
  search: z.string().optional(),
  page: z.number().optional(),
  pageSize: z.number().optional(),
})

export const Route = createFileRoute('/(private)/(dashboard)/business/permissions/')({
  validateSearch: searchSchema,
  component: RouteComponent,
})

function RouteComponent() {
  const { tab } = Route.useSearch()

  return (
    <RequirePermission permission={Permissions.USER_MANAGE_PERMISSIONS}>
      <div className='px-4 grow flex flex-col gap-2'>
        {/* Tabs */}
        <PermissionManagementTabs defaultTab={tab} />
      </div>
    </RequirePermission>
  )
}

function PermissionManagementTabs({ defaultTab }: { defaultTab?: string }) {
  const TABS = [
    {
      label: 'Permissions',
      Component: PermissionsTab,
    },
    {
      label: 'Audit Log',
      Component: AuditLogTab,
    },
  ] as const

  const VALID_TABS: Set<string> = new Set(TABS.map(t => t.label))
  const defaultValue = defaultTab && VALID_TABS.has(defaultTab) ? defaultTab : 'Permissions'

  return <Tab defaultValue={defaultValue} className='grow h-1' tabClass='px-4' tabs={[...TABS]} />
}
