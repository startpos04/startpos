import { SidebarInset, SidebarProvider } from '@platform/components/ui/sidebar'
import { TooltipProvider } from '@platform/components/ui/tooltip'
import { LegalFooter } from '../legal-footer'
import AppNav from './app-nav'
import { AppSidebar } from './app-sidebar'
import { ContextSwitcher } from './context-switcher'

export function Dashboard({ children }: { children?: React.ReactNode }) {
  return (
    <TooltipProvider>
      {/* Outer flex container for context switcher + main app */}
      <div className='flex w-full min-h-screen'>
        {/* Context Switcher - Fixed narrow bar, completely independent */}
        <ContextSwitcher />

        {/* Main app with shadcn sidebar system */}
        <div className='flex-1 flex min-w-0 isolate relative'>
          <SidebarProvider>
            <AppSidebar />
            <SidebarInset className='flex flex-col h-screen overflow-hidden justify-start'>
              <AppNav />
              <div className='pt-0 grow h-1 overflow-y-auto flex flex-col gap-2'>{children}</div>
              <LegalFooter />
            </SidebarInset>
          </SidebarProvider>
        </div>
      </div>
    </TooltipProvider>
  )
}
