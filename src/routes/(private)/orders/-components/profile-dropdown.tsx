import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { authClient } from '@/lib/better-auth/auth-client'
import { authStore } from '@/store/auth-store'
import { Link, useNavigate } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { LayoutDashboard, LogOut, UserCircle } from 'lucide-react'

export const ProfileDropdown = function () {
  const user = useStore(authStore, state => state.user)
  const navigate = useNavigate()

  const handleLogout = () => {
    authClient.signOut(
      {},
      {
        onSuccess: () => navigate({ to: '/', reloadDocument: true }),
      },
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='ghost' className='h-10 w-10 '>
          <UserCircle className='w-6! h-6!' />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align='end' className='w-56 mt-2 rounded-2xl p-2'>
        <DropdownMenuLabel className='px-2 py-1.5 text-xs font-black uppercase text-muted-foreground tracking-widest'>
          {user.name || 'Account'} ({user.role})
        </DropdownMenuLabel>

        <DropdownMenuSeparator className='my-2' />

        {user.role !== 'CASHIER' && (
          <DropdownMenuItem asChild className='rounded-xl cursor-pointer py-3'>
            <Link to='/'>
              <LayoutDashboard className='w-4 h-4 mr-2' />
              <span className='font-bold'>Dashboard</span>
            </Link>
          </DropdownMenuItem>
        )}

        <DropdownMenuItem className='rounded-xl cursor-pointer py-3 text-destructive focus:text-destructive focus:bg-destructive/10' onClick={handleLogout}>
          <LogOut className='w-4 h-4 mr-2' />
          <span className='font-bold'>Logout</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
