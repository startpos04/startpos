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
import { authStore } from '@/store/auth-store'
// Changed: Added Link for better navigation
import { Link, useLocation } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { BookOpenIcon, BotIcon, ChevronRightIcon, GalleryVerticalEndIcon, TerminalSquareIcon } from 'lucide-react'
import { Role } from 'prisma/generated/prisma/enums'
import * as React from 'react'

interface Items {
  title: string
  url: string
  icon?: React.ReactNode
  isActive: boolean
  allowedRoles: Role[]
  items: {
    title: string
    url: string
    isActive: boolean
  }[]
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const user = useStore(authStore, state => state.user)
  const location = useLocation()

  // Helper to determine if a route is a match or a sub-path of the current location
  const isRouteActive = React.useCallback(
    (itemUrl: string) => {
      if (itemUrl === '#' || !itemUrl) return false

      const currentPath = location.pathname
      // Exact match
      if (currentPath === itemUrl) return true
      // Nested match: check if current path starts with itemUrl
      // Example: /employees/admin-1 starts with /employees
      return currentPath.startsWith(itemUrl + '/')
    },
    [location.pathname],
  )

  const { team, items } = React.useMemo(() => {
    const data = {
      team: {
        name: APP_NAME,
        logo: <GalleryVerticalEndIcon />,
        plan: user.role || 'Guest',
      },
      items: [
        {
          title: 'Admin',
          url: '#',
          icon: <TerminalSquareIcon />,
          allowedRoles: [Role.ADMIN],
          items: [
            { title: 'Employees', url: '/employees' },
            { title: 'Products', url: '/products' },
            { title: 'Ingredients', url: '/ingredients' },
          ],
        },
        {
          title: 'Supervisor',
          url: '#',
          icon: <BotIcon />,
          allowedRoles: [Role.ADMIN, Role.SUPERVISOR],
          items: [
            { title: 'Sales Report', url: '/sales-reports' },
            { title: 'Inventory Reports', url: '/inventory-reports' },
          ],
        },
        {
          title: 'POS',
          url: '/pos',
          icon: <BookOpenIcon />,
          allowedRoles: [Role.ADMIN, Role.SUPERVISOR, Role.CASHIER],
        },
      ] as Items[],
    }

    data.items = data.items
      .filter(item => user && item.allowedRoles.includes(user.role as Role))
      .map(item => {
        // Map sub-items and check if any are active
        const subItems = item.items?.map(subItem => ({
          ...subItem,
          isActive: isRouteActive(subItem.url),
        }))

        const isChildActive = !!subItems?.some(child => child.isActive)
        const isParentActive = isRouteActive(item.url)

        return {
          ...item,
          items: subItems,
          isActive: isParentActive || isChildActive,
        }
      })

    return data
  }, [user.id, isRouteActive])

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
                              {/* Changed to Link */}
                              <Link to={subItem.url}>
                                <span>{subItem.title}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              ) : (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={item.isActive} tooltip={item.title}>
                    <Link to={item.url}>
                      {item.icon}
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ),
            )}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
