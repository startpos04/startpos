import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { LegalFooter } from '../legal-footer'
import AppNav from './app-nav'
import { AppSidebar } from './app-sidebar'

export function Dashboard({ children }: { children?: React.ReactNode }) {
  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className='flex flex-col h-screen overflow-hidden justify-start'>
          <AppNav />
          <div className='pt-0 grow h-1 overflow-y-auto flex flex-col gap-2'>{children}</div>
          <LegalFooter />
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
