import { Link } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { LayoutDashboard } from 'lucide-react'
import { Role } from 'prisma/generated/prisma/enums'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { authStore } from '@/store/auth-store'
import { ProfileDropdown as BaseProfileDropdown } from '../../../../components/custom/dashboard/profile-dropdown'

export const ProfileDropdown = () => {
  const user = useStore(authStore, state => state.user)

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
    </BaseProfileDropdown>
  )
}
