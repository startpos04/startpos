import * as React from 'react'
import { NavMain } from '@/components/nav-main'
import { Sidebar, SidebarContent, SidebarHeader, SidebarRail } from '@/components/ui/sidebar'
import { BookOpenIcon, BotIcon, GalleryVerticalEndIcon, TerminalSquareIcon } from 'lucide-react'

const data = {
  team: {
    name: 'POS & Inventory System',
    logo: <GalleryVerticalEndIcon />,
    plan: 'Admin',
  },
  navMain: [
    {
      title: 'Admin',
      url: '#',
      icon: <TerminalSquareIcon />,
      isActive: true,
      items: [
        {
          title: 'Employees',
          url: '/employees',
        },
        {
          title: 'Inventory',
          url: '/inventory',
        },
      ],
    },
    {
      title: 'Supervisor',
      url: '#',
      icon: <BotIcon />,
      items: [
        {
          title: 'Sales Report',
          url: '#',
        },
        {
          title: 'Inventiry Reports',
          url: '#',
        },
      ],
    },
    {
      title: 'POS',
      url: '/pos',
      icon: <BookOpenIcon />,
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const sidebarMenu = React.useMemo(() => {
    return data.navMain
  }, [])

  return (
    <Sidebar collapsible='icon' {...props}>
      <SidebarHeader>
        <div className='flex gap-2 py-2'>
          <div className='bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg'>
            {data.team.logo}
          </div>
          <div className='grid flex-1 text-left text-sm leading-tight'>
            <span className='truncate font-medium'>{data.team.name}</span>
            <span className='truncate text-xs'>{data.team.plan}</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={sidebarMenu} />
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
