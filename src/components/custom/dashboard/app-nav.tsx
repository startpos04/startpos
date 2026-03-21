import { ThemeToggle } from '@/components/custom/theme/theme-toggle'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { authClient } from '@/lib/better-auth/auth-client'
import { useNavigate } from '@tanstack/react-router'

function AppNav() {
  const navigate = useNavigate()

  const handleLogout = () => {
    authClient.signOut(
      {},
      {
        onSuccess: () => {
          navigate({ to: '/', reloadDocument: true })
        },
      },
    )
  }

  return (
    <header className='flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12'>
      <div className='flex items-center gap-2 px-4 w-full'>
        <SidebarTrigger size='lg' className='cursor-pointer' />
        <Separator orientation='vertical' className='mr-2 ' />
        <div className='flex items-center justify-end grow gap-4'>
          <ThemeToggle />
          <Button variant='outline' size='sm' onClick={handleLogout} className='cursor-pointer'>
            Logout
          </Button>
        </div>
      </div>
    </header>
  )
}

export default AppNav
