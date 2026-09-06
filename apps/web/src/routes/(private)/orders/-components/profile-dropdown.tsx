import { DropdownMenuItem } from '@platform/components/ui/dropdown-menu'
import { useCapabilities } from '@platform/hooks/use-capability'
import { Capabilities } from '@platform/lib/entitlement/capability-keys'
import MountManager from '@platform/lib/mount-manager'
import { Link } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { ClipboardPenLine, LayoutDashboard, PanelTopClose } from 'lucide-react'
import { Role, SessionStatus } from 'prisma/generated/prisma/enums'
import { ProfileDropdown as BaseProfileDropdown } from '@/components/dashboard/profile-dropdown'
import { authStore } from '@/lib/better-auth/auth-store'
import { CloseSessionDialog } from '../../pos/-components/close-session-dialog'

export const ProfileDropdown = () => {
  const user = useStore(authStore, state => state.user)
  const caps = useCapabilities([Capabilities.START_VENDOR_SESSION, Capabilities.CREATE_TASK])

  const handleEndShift = () => {
    MountManager.show(CloseSessionDialog, {
      key: 'close-session',
    })
  }

  if (!user) return null

  return (
    <BaseProfileDropdown>
      {user.role !== Role.CASHIER && (
        <DropdownMenuItem asChild className='flex items-center gap-3 rounded-xl cursor-pointer py-3 px-3 transition-all focus:bg-accent hover:bg-accent'>
          <Link to='/'>
            <LayoutDashboard className='w-4! h-4!' />
            <span className='font-bold'>Dashboard</span>
          </Link>
        </DropdownMenuItem>
      )}
      {/* Tasks link — only when CREATE_TASK is enabled */}
      {user.role === Role.CASHIER && caps.CREATE_TASK && (
        <DropdownMenuItem asChild className='flex items-center gap-3 rounded-xl cursor-pointer py-3 px-3 transition-all focus:bg-accent hover:bg-accent'>
          <Link to='/tasks'>
            <ClipboardPenLine className='w-4! h-4!' />
            <span className='font-bold'>Tasks</span>
          </Link>
        </DropdownMenuItem>
      )}
      {/* End Shift — only when cash reconciliation (START_VENDOR_SESSION) is enabled */}
      {caps.START_VENDOR_SESSION && user.vendorSession?.status === SessionStatus.OPEN && (
        <DropdownMenuItem
          className='flex items-center gap-3 rounded-xl cursor-pointer py-3 px-3 transition-all focus:bg-accent hover:bg-accent'
          onClick={handleEndShift}
        >
          <PanelTopClose className='w-4! h-4!' />
          <span className='font-bold'>End Shift</span>
        </DropdownMenuItem>
      )}
    </BaseProfileDropdown>
  )
}
