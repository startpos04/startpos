import { LegalFooter } from '@platform/components/custom/legal-footer'
import { SidebarInset, SidebarProvider } from '@platform/components/ui/sidebar'
import { TooltipProvider } from '@platform/components/ui/tooltip'
import AppNav from './app-nav'
import { AppSidebar } from './app-sidebar'

export function Dashboard({
  children,
  contextSwitcher,
}: {
  children?: React.ReactNode
  /**
   * Optional context switcher slot — rendered as the fixed narrow bar to the
   * left of the main sidebar. Supply an app-specific component here so the
   * platform never imports tenant-aware user fields (e.g. user.branch.id).
   *
   * If omitted the slot is simply empty and the layout collapses gracefully.
   */
  contextSwitcher?: React.ReactNode
}) {
  return (
    <TooltipProvider>
      {/* Outer flex container for context switcher + main app */}
      <div className='flex w-full min-h-screen'>
        {/* Context Switcher slot — provided by the app layer */}
        {contextSwitcher}

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
