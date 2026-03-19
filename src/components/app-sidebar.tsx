import { NavMain } from '@/components/nav-main'
import { Sidebar, SidebarContent, SidebarHeader, SidebarRail } from '@/components/ui/sidebar'
import { getRouteApi, useLocation } from '@tanstack/react-router'
import { BookOpenIcon, BotIcon, GalleryVerticalEndIcon, TerminalSquareIcon } from 'lucide-react'
import { Role } from 'prisma/generated/prisma/enums'
import * as React from 'react'

const rootApi = getRouteApi('__root__')

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user } = rootApi.useRouteContext()
  const location = useLocation()

  const sidebarData = React.useMemo(() => {
    const navMain = [
      {
        title: 'Admin',
        url: '#',
        icon: <TerminalSquareIcon />,
        allowedRoles: [Role.ADMIN] as Role[],
        items: [
          { title: 'Employees', url: '/employees' },
          { title: 'Inventory', url: '/inventory' },
        ],
      },
      {
        title: 'Supervisor',
        url: '#',
        icon: <BotIcon />,
        allowedRoles: [Role.ADMIN, Role.SUPERVISOR] as Role[],
        items: [
          { title: 'Sales Report', url: '/sales-reports' },
          { title: 'Inventory Reports', url: '/inventory-reports' },
        ],
      },
      {
        title: 'POS',
        url: '/pos',
        icon: <BookOpenIcon />,
        allowedRoles: [Role.ADMIN, Role.SUPERVISOR, Role.CASHIER] as Role[],
      },
    ]

    const filteredNav = navMain
      .filter(item => user && item.allowedRoles.includes(user.role as Role))
      .map(item => {
        const items = item.items?.map(subItem => ({
          ...subItem,
          isActive: location.pathname === subItem.url,
        }))

        const isChildActive = items?.some(child => child.isActive)
        const isParentActive = location.pathname === item.url

        return {
          ...item,
          items,
          isActive: isParentActive || isChildActive,
        }
      })

    return {
      team: {
        name: 'POS & Inventory',
        logo: <GalleryVerticalEndIcon />,
        plan: user?.role || 'Guest',
      },
      navMain: filteredNav,
    }
  }, [user, location.pathname])

  console.log(sidebarData)

  return (
    <Sidebar collapsible='icon' {...props}>
      <SidebarHeader>
        <div className='flex gap-2 py-2'>
          <div className='bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg'>
            {sidebarData.team.logo}
          </div>
          <div className='grid flex-1 text-left text-sm leading-tight'>
            <span className='truncate font-medium'>{sidebarData.team.name}</span>
            <span className='truncate text-xs'>{sidebarData.team.plan}</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={sidebarData.navMain} />
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
