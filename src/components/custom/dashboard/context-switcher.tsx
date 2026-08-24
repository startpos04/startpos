import { useLocation, useNavigate } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { BookOpen, Building2, HelpCircle } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { useBranchSwitch } from '@/hooks/use-branch-switch'
import { usePermission } from '@/hooks/use-permission'
import { Permissions } from '@/lib/authorization/permission-keys'
import { authStore } from '@/store/auth-store'
import { ContextSwitcherItem } from './context-switcher-item'

/**
 * ContextSwitcher - A fixed-width vertical navigation bar for switching between
 * business/branch contexts. Sits outside the SidebarProvider to avoid conflicts.
 */
export function ContextSwitcher() {
  const user = useStore(authStore, state => state.user)
  const location = useLocation()
  const navigate = useNavigate()
  const { switchBranch } = useBranchSwitch()

  // Permission check (replaces role check)
  const canViewBusiness = usePermission(Permissions.BUSINESS_VIEW_PROFILE)

  // Don't render if no user (shouldn't happen in dashboard, but safe check)
  if (!user) return null

  const isBusinessActive = location.pathname.startsWith('/business')
  const currentBranchId = user.branch?.id

  // Get all branches (for now, just current branch - will expand later when multi-branch support is added)
  const branches = user.branch ? [user.branch] : []

  return (
    <div className='hidden md:flex bg-card w-12 border-r flex-col items-center shrink-0 h-screen sticky top-0 z-20'>
      {/* Business + Branches - Top Section */}
      <div className='flex flex-col gap-2 items-center flex-1 overflow-y-auto py-4 w-full px-2 overflow-x-hidden'>
        {/* Business Admin (users with business permissions) */}
        {canViewBusiness && (
          <ContextSwitcherItem
            label='Business Admin'
            icon={<Building2 className='size-5' />}
            active={isBusinessActive}
            onClick={() => navigate({ to: '/business' })}
          />
        )}

        {/* Current Branch (or list of branches) */}
        {branches.map(branch => (
          <ContextSwitcherItem
            key={branch.id}
            label={branch.name}
            icon={<span className='text-lg font-bold'>{branch.name?.[0]?.toUpperCase() ?? ''}</span>}
            active={branch.id === currentBranchId && !isBusinessActive}
            onClick={() => {
              // If we're in business context, navigate back to dashboard
              if (isBusinessActive) {
                navigate({ to: '/dashboard' })
              }
              // If switching to a different branch, call switchBranch
              else if (branch.id !== currentBranchId) {
                switchBranch(branch.id)
              }
              // If already on this branch and not in business context, do nothing
            }}
          />
        ))}
      </div>

      {/* Divider */}
      <Separator className='w-10 mx-auto' />

      {/* Action Items - Bottom Section */}
      <div className='flex flex-col gap-2 items-center py-4 w-full px-2'>
        {/* Contact Us */}
        <ContextSwitcherItem
          label='Contact Us'
          icon={<HelpCircle className='size-5' />}
          active={location.pathname === '/contact-us'}
          onClick={() => navigate({ to: '/contact-us' })}
        />

        {/* FAQ */}
        <ContextSwitcherItem
          label='Help & FAQ'
          icon={<BookOpen className='size-5' />}
          active={false}
          onClick={() => {
            // TODO: Replace with actual FAQ link when available
            window.open('https://help.yourapp.com', '_blank')
          }}
        />
      </div>
    </div>
  )
}
