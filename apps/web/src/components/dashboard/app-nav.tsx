import { AppBreadcrumb } from '@platform/components/custom/dashboard/app-breadcrumb'
import { NotificationButton } from '@platform/components/custom/dashboard/notification-btn'
import { ThemeToggle } from '@platform/components/custom/theme/theme-toggle'
import { Separator } from '@platform/components/ui/separator'
import { SidebarTrigger } from '@platform/components/ui/sidebar'
import { ProfileDropdown } from '@/components/dashboard/profile-dropdown'
import { RegistrationStatusIndicator } from './registration-status-indicator'

function AppNav() {
  return (
    <header className='flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12'>
      <div className='flex items-center gap-2 px-4 w-full'>
        <SidebarTrigger size='lg' />
        <Separator orientation='vertical' className='mr-2 ' />
        <AppBreadcrumb />
        <div className='flex items-center justify-end grow gap-1'>
          <div className='w-10'>
            <ThemeToggle />
          </div>
          <RegistrationStatusIndicator />
          <NotificationButton />
          <ProfileDropdown />
        </div>
      </div>
    </header>
  )
}

export default AppNav
