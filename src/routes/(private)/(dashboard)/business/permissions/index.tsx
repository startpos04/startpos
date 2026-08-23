/**
 * Permission Management Page
 *
 * Admin interface for viewing and managing user permissions.
 * Allows OWNER/ADMIN to:
 * - View all users and their permissions
 * - Grant custom permissions to users
 * - Revoke custom permissions from users
 * - View permission audit history
 *
 * Access: Requires USER.MANAGE_PERMISSIONS permission
 */

import { createFileRoute } from '@tanstack/react-router'
import { Shield } from 'lucide-react'
import { z } from 'zod'
import Tab from '@/components/custom/tab'
import { RequirePermission } from '@/components/require-permission'
import { Permissions } from '@/lib/authorization/permission-keys'
import { PermissionAuditTab } from './-permission-audit'
import { UserPermissionsTab } from './-user-permissions'

const searchSchema = z.object({
  tab: z.string().optional(),
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
        {/* Header */}
        <div className='flex flex-col gap-2 flex-shrink-0'>
          <div className='flex items-center gap-2'>
            <Shield className='h-8 w-8 text-primary' />
            <h1 className='text-3xl font-bold'>Permission Management</h1>
          </div>
          <p className='text-muted-foreground'>
            Manage user permissions and view audit history. Grant or revoke custom permissions to control what users can access.
          </p>
        </div>

        {/* Tabs */}
        <PermissionManagementTabs defaultTab={tab} />
      </div>
    </RequirePermission>
  )
}

function PermissionManagementTabs({ defaultTab }: { defaultTab?: string }) {
  const TABS = [
    {
      label: 'User Permissions',
      Component: UserPermissionsTab,
    },
    {
      label: 'Audit Log',
      Component: PermissionAuditTab,
    },
  ] as const

  const VALID_TABS: Set<string> = new Set(TABS.map(t => t.label))
  const defaultValue = defaultTab && VALID_TABS.has(defaultTab) ? defaultTab : 'User Permissions'

  return <Tab defaultValue={defaultValue} className='grow h-1' tabClass='px-4' tabs={[...TABS]} />
}
