import { Link } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { ClipboardPenLine, LayoutDashboard, PanelTopClose } from 'lucide-react'
import { Role, SessionStatus } from 'prisma/generated/prisma/enums'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import MountManager from '@/lib/mount-manager'
import { authStore } from '@/store/auth-store'
import { ProfileDropdown as BaseProfileDropdown } from '../../../../components/custom/dashboard/profile-dropdown'
import { CloseSessionDialog } from '../../pos/-components/close-session-dialog'

export const ProfileDropdown = () => {
  const user = useStore(authStore, state => state.user)

  const handleEndShift = () => {
    MountManager.show(CloseSessionDialog, {
      key: 'close-session',
    })
  }

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
      {user.role === Role.CASHIER && (
        <DropdownMenuItem asChild className='flex items-center gap-3 rounded-xl cursor-pointer py-3 px-3 transition-all focus:bg-accent hover:bg-accent'>
          <Link to='/tasks'>
            <ClipboardPenLine className='w-4! h-4!' />
            <span className='font-bold'>Tasks</span>
          </Link>
        </DropdownMenuItem>
      )}
      {user.vendorSession?.status === SessionStatus.OPEN && (
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
