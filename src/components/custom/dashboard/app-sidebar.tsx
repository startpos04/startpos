import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import { APP_NAME } from '@/lib/constants'
import { getRouteApi, useLocation } from '@tanstack/react-router'
import { BookOpenIcon, BotIcon, ChevronRightIcon, GalleryVerticalEndIcon, TerminalSquareIcon } from 'lucide-react'
import { Role } from 'prisma/generated/prisma/enums'
import * as React from 'react'

interface Items {
  title: string
  url: string
  icon?: React.ReactNode
  isActive?: boolean
  allowedRoles: Role[]
  items?: {
    title: string
    url: string
    isActive?: boolean
  }[]
}

const rootApi = getRouteApi('__root__')

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user } = rootApi.useRouteContext()
  const location = useLocation()

  const { team, items } = React.useMemo(() => {
    const data = {
      team: {
        name: APP_NAME,
        logo: <GalleryVerticalEndIcon />,
        plan: user?.role || 'Guest',
      },
      items: [
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
      ] as Items[],
    }

    data.items = data.items
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

    return data
  }, [user, location.pathname])

  return (
    <Sidebar collapsible='icon' {...props}>
      <SidebarHeader>
        <div className='flex gap-2 py-2'>
          <div className='bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg'>{team.logo}</div>
          <div className='grid flex-1 text-left text-sm leading-tight'>
            <span className='truncate font-medium'>{team.name}</span>
            <span className='truncate text-xs'>{team.plan}</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {items.map(item =>
              item.items ? (
                <Collapsible key={item.title} asChild defaultOpen={item.isActive} className='group/collapsible'>
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton tooltip={item.title} isActive={item.isActive}>
                        {item.icon}
                        <span>{item.title}</span>
                        <ChevronRightIcon className='ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90' />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {item.items?.map(subItem => (
                          <SidebarMenuSubItem key={subItem.title}>
                            <SidebarMenuSubButton asChild isActive={subItem.isActive}>
                              <a href={subItem.url}>
                                <span>{subItem.title}</span>
                              </a>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              ) : (
                <SidebarMenuSubItem key={item.title}>
                  <SidebarMenuSubButton asChild>
                    <a href={item.url}>
                      {item.icon}
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              ),
            )}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
