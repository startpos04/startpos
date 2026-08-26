import { useNavigate } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { LogOut, User, UserCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useIsOnline } from '@/hooks/use-is-online'
import { AuthEngine } from '@/lib/better-auth/auth-engine'
import { cn } from '@/lib/utils'
import { authStore } from '@/store/auth-store'

export const ProfileDropdown = ({ children }: { children?: ReactNode }) => {
  const user = useStore(authStore, state => state.user)
  const navigate = useNavigate()
  const isOnline = useIsOnline()

  const handleLogout = () => {
    AuthEngine.logout({
      onSuccess: () => navigate({ to: '/login' }),
    })
  }

  // Don't render if user is null (during logout)
  if (!user) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div className='relative'>
          <Button variant='ghost' size='icon-lg'>
            <UserCircle />
          </Button>

          <Badge
            className={cn(
              'absolute bottom-1 right-1 h-3 w-3 p-0 rounded-full border-2 border-card pointer-events-none',
              isOnline ? 'bg-primary' : 'bg-red-400',
            )}
          />
        </div>
      </DropdownMenuTrigger>

      <DropdownMenuContent align='end' className='w-56'>
        <div className='px-2 py-2'>
          <div className='flex flex-col'>
            <div className='flex gap-1'>
              <span className='text-sm grow font-bold truncate leading-tight'>{user.name || 'Anonymous User'}</span>
              <Badge className={cn('rounded-full border-2 border-card pointer-events-none', isOnline ? 'bg-primary' : 'bg-destructive')}>
                {isOnline ? 'online' : 'offline'}
              </Badge>
            </div>
            <span className='text-[11px] text-muted-foreground font-medium'>
              {user.role} • {user.email}
            </span>
          </div>
        </div>

        <DropdownMenuSeparator className='my-2' />
        {children}

        <DropdownMenuItem className='flex items-center gap-3 rounded-xl cursor-pointer py-3 px-3 transition-all' onClick={() => navigate({ to: '/account' })}>
          <User className='size-4' />
          <span className='font-bold'>My Account</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator className='my-2' />

        <DropdownMenuItem
          className='flex items-center gap-3 rounded-xl cursor-pointer py-3 px-3 text-destructive transition-all focus:bg-destructive/10 hover:bg-destructive/10'
          onClick={handleLogout}
        >
          <LogOut />
          <span className='font-bold'>Logout</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
