import { Link, useLocation } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import {
  BookOpenIcon,
  BotIcon,
  ChevronRightIcon,
  ClipboardPenLine,
  CreditCardIcon,
  GalleryVerticalEndIcon,
  LayoutDashboardIcon,
  LifeBuoyIcon,
  SettingsIcon,
  TerminalSquareIcon,
} from 'lucide-react'
import { BusinessType, Role } from 'prisma/generated/prisma/enums'
import * as React from 'react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
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
import { useCapabilities } from '@/hooks/use-capability'
import { SubscriptionStatusVO } from '@/lib/billing/value-objects/subscription-status'
import { APP_NAME } from '@/lib/constants'
import { Capabilities } from '@/lib/entitlement/capability-keys'
import { SubscriptionStatus } from '@/lib/entitlement/entitlement-types'
import { cn } from '@/lib/utils'
import { authStore } from '@/store/auth-store'

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

  // Capability checks — drives sidebar item visibility
  const caps = useCapabilities([
    Capabilities.CREATE_TASK,
    Capabilities.CREATE_PURCHASE,
    Capabilities.VIEW_SALES_REPORTS,
    Capabilities.MANAGE_INVENTORY,
    Capabilities.VIEW_TRANSACTION_HISTORY,
    Capabilities.VIEW_ORDER_HISTORY,
  ])

  // Helper to determine if a route is a match or a sub-path of the current location
  const isRouteActive = React.useCallback(
    (itemUrl: string) => {
      if (itemUrl === '#' || !itemUrl) return false

      const currentPath = location.pathname
      // Exact match
      if (currentPath === itemUrl) return true
      // Nested match: check if current path starts with itemUrl
      // Example: /employees/admin-1 starts with /employees
      return currentPath.startsWith(`${itemUrl}/`)
    },
    [location.pathname],
  )

  const { team, items } = React.useMemo(() => {
    if (!user?.business) return { team: { name: APP_NAME, logo: <GalleryVerticalEndIcon />, plan: 'Guest' }, items: [] }

    const data = {
      team: {
        name: APP_NAME,
        logo: <GalleryVerticalEndIcon />,
        plan: user.role || 'Guest',
      },
      items: [
        {
          title: 'Dashboard',
          url: '/dashboard',
          icon: <LayoutDashboardIcon />,
          allowedRoles: [Role.ADMIN, Role.SUPERVISOR],
        },
        {
          title: 'Admin',
          url: '#',
          icon: <TerminalSquareIcon />,
          allowedRoles: [Role.ADMIN],
          items: [
            { title: 'Employees', url: '/employees' },
            { title: 'Products', url: '/products' },
            caps.CREATE_PURCHASE ? { title: 'Purchases', url: '/purchases' } : null,
            user.business?.businessType === BusinessType.RESTAURANT ? { title: 'Ingredients', url: '/ingredients' } : null,
          ].filter(Boolean),
        },
        {
          title: 'Supervisor',
          url: '#',
          icon: <BotIcon />,
          allowedRoles: [Role.ADMIN, Role.SUPERVISOR],
          items: [
            caps.VIEW_SALES_REPORTS ? { title: 'Sales Report', url: '/sales-reports' } : null,
            caps.MANAGE_INVENTORY ? { title: 'Inventory Reports', url: '/inventory-reports' } : null,
            caps.VIEW_TRANSACTION_HISTORY ? { title: 'Transactions', url: '/transactions' } : null,
            caps.VIEW_ORDER_HISTORY ? { title: 'Order History', url: '/order-history' } : null,
          ].filter(Boolean),
        },
        caps.CREATE_TASK
          ? {
              title: 'Tasks',
              url: '/tasks',
              icon: <ClipboardPenLine />,
              allowedRoles: [Role.ADMIN, Role.SUPERVISOR, Role.CASHIER],
            }
          : null,
        {
          title: 'POS',
          url: '/pos',
          icon: <BookOpenIcon />,
          allowedRoles: [Role.ADMIN, Role.SUPERVISOR, Role.CASHIER],
        },
        {
          title: 'Settings',
          url: '/settings',
          icon: <SettingsIcon />,
          allowedRoles: [Role.ADMIN, Role.SUPERVISOR],
        },
        {
          title: 'Contact us',
          url: '/contact-us',
          icon: <LifeBuoyIcon />,
          allowedRoles: [Role.ADMIN, Role.SUPERVISOR, Role.CASHIER, Role.SERVICE_PROVIDER],
        },
        {
          title: 'Billing',
          url: '/billing',
          icon: <CreditCardIcon />,
          allowedRoles: [Role.ADMIN],
        },
      ].filter(Boolean) as Items[],
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
  }, [isRouteActive, user, caps])

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
      <SubscriptionStatusFooter />
      <SidebarRail />
    </Sidebar>
  )
}

// ---------------------------------------------------------------------------
// SubscriptionStatusFooter
// Shows a compact subscription status badge at the bottom of the sidebar.
// Only visible for ADMIN users (they're the ones managing billing).
// Shows an upgrade CTA when in TRIAL (warning window) or blocked states.
// ---------------------------------------------------------------------------
function SubscriptionStatusFooter() {
  const user = useStore(authStore, state => state.user)
  if (user?.role !== Role.ADMIN) return null

  const status = user?.entitlement?.status
  if (!status || status === SubscriptionStatus.ACTIVE) return null

  const severity = SubscriptionStatusVO.toBannerSeverity(status)
  const label = SubscriptionStatusVO.toLabel(status)

  const colorClass =
    severity === 'error'
      ? 'text-destructive border-destructive/30 bg-destructive/5'
      : severity === 'warning'
        ? 'text-amber-600 border-amber-300/50 bg-amber-50/50 dark:text-amber-400 dark:bg-amber-950/20'
        : 'text-blue-600 border-blue-300/50 bg-blue-50/50 dark:text-blue-400 dark:bg-blue-950/20'

  return (
    <SidebarFooter className='p-2'>
      <Link
        to='/billing'
        className={cn('flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition-colors hover:opacity-80', colorClass)}
      >
        <CreditCardIcon className='h-3.5 w-3.5 shrink-0' />
        <span className='truncate'>{label} — View Billing</span>
      </Link>
    </SidebarFooter>
  )
}
