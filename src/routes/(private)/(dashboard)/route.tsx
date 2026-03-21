import AppNav from '@/components/custom/dashboard/app-nav'
import { AppSidebar } from '@/components/custom/dashboard/app-sidebar'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/(private)/(dashboard)')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className='flex flex-col h-screen overflow-hidden justify-start'>
          <AppNav />
          <div className='p-4 pt-0 grow h-1 flex flex-col gap-4'>
            <Outlet />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
