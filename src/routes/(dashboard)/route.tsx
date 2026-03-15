import { AppSidebar } from '@/components/app-sidebar'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { authClient } from '@/lib/better-auth/auth-client'
import { getUserId } from '@/lib/better-auth/auth-server'
import { createFileRoute, Outlet, redirect, useNavigate } from '@tanstack/react-router'

export const Route = createFileRoute('/(dashboard)')({
  component: RouteComponent,
  beforeLoad: async () => {
    const userId = await getUserId()
    if (!userId) {
      throw redirect({ to: '/login' })
    }
  },
})

function RouteComponent() {
  const navigate = useNavigate()
  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className='flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12'>
            <div className='flex items-center gap-2 px-4'>
              <SidebarTrigger className='-ml-1' />
              <Separator orientation='vertical' className='mr-2 data-[orientation=vertical]:h-4' />
              <Button
                variant='outline'
                size='sm'
                onClick={() => {
                  authClient.signOut(
                    {},
                    {
                      onSuccess: () => {
                        navigate({ to: '/', reloadDocument: true })
                      },
                    },
                  )
                }}
              >
                Logout
              </Button>
            </div>
          </header>
          <div className='flex flex-1 flex-col gap-4 p-4 pt-0'>
            <Outlet />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
