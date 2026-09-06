/**
 * ContextSwitcher — App-layer implementation.
 *
 * Lives here (not in @platform) because it accesses `user.branch.id` which is
 * a ServerUser-only field — not on BaseUser. The platform Dashboard accepts it
 * as a `contextSwitcher` slot prop so the platform never imports this file.
 */

import { Separator } from '@platform/components/ui/separator'
import { useCapability } from '@platform/hooks/use-capability'
import { usePermission } from '@platform/hooks/use-permission'
import { Permissions } from '@platform/lib/authorization/permission-keys'
import { Capabilities } from '@platform/lib/entitlement/capability-keys'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { BookOpen, Building2, HelpCircle } from 'lucide-react'
import { ContextSwitcherItem } from '@/components/dashboard/context-switcher-item'
import { useBranchSwitch } from '@/hooks/use-branch-switch'
import { useAuthenticatedUser } from '@/lib/better-auth/auth-store'

export function ContextSwitcher() {
  // ServerUser is required — this component only renders inside authenticated routes
  const user = useAuthenticatedUser()
  const location = useLocation()
  const navigate = useNavigate()
  const { switchBranch } = useBranchSwitch()

  const canViewBusiness = usePermission(Permissions.BUSINESS_VIEW_PROFILE)
  const hasMultiBranchCapability = useCapability(Capabilities.MANAGE_BRANCHES)

  // Get all branches (current branch only — will expand when multi-branch is added)
  const branches = user.branch ? [user.branch] : []

  // Hide for single-branch businesses
  const isSingleBranch = !hasMultiBranchCapability || branches.length === 1
  if (isSingleBranch) return null

  const isBusinessActive = location.pathname.startsWith('/business')
  const currentBranchId = user.branch?.id

  return (
    <div className='hidden md:flex bg-card w-12 border-r flex-col items-center shrink-0 h-screen sticky top-0 z-20'>
      {/* Business + Branches - Top Section */}
      <div className='flex flex-col gap-2 items-center flex-1 overflow-y-auto py-4 w-full px-2 overflow-x-hidden'>
        {canViewBusiness && (
          <ContextSwitcherItem
            label='Business Admin'
            icon={<Building2 className='size-5' />}
            active={isBusinessActive}
            onClick={() => navigate({ to: '/business' })}
          />
        )}

        {branches.map(branch => (
          <ContextSwitcherItem
            key={branch.id}
            label={branch.name}
            icon={<span className='text-lg font-bold'>{branch.name?.[0]?.toUpperCase() ?? ''}</span>}
            active={branch.id === currentBranchId && !isBusinessActive}
            onClick={() => {
              if (isBusinessActive) {
                navigate({ to: '/dashboard' })
              } else if (branch.id !== currentBranchId) {
                switchBranch(branch.id)
              }
            }}
          />
        ))}
      </div>

      <Separator className='w-10 mx-auto' />

      {/* Action Items - Bottom Section */}
      <div className='flex flex-col gap-2 items-center py-4 w-full px-2'>
        <ContextSwitcherItem
          label='Contact Us'
          icon={<HelpCircle className='size-5' />}
          active={location.pathname === '/contact-us'}
          onClick={() => navigate({ to: '/contact-us' })}
        />
        <ContextSwitcherItem
          label='Help & FAQ'
          icon={<BookOpen className='size-5' />}
          active={false}
          onClick={() => window.open('https://www.bir.gov.ph/', '_blank')}
        />
      </div>
    </div>
  )
}
