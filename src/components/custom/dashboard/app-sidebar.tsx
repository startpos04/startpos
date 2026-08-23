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
  ShieldIcon,
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
import { usePermissions } from '@/hooks/use-permission'
import { Permissions } from '@/lib/authorization/permission-keys'
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
    Capabilities.VIEW_ORDER_HISTORY,
  ])

  // Permission checks — replaces role-based checks
  const perms = usePermissions([
    // Business section permissions
    Permissions.BUSINESS_VIEW_BILLING,
    Permissions.BUSINESS_VIEW_PROFILE,
    Permissions.BUSINESS_VIEW_CAPABILITIES,
    Permissions.BUSINESS_VIEW_BRANCHES,
    Permissions.BUSINESS_VIEW_SUPPLIERS,
    Permissions.BUSINESS_VIEW_CUSTOMERS,
    // User management permissions
    Permissions.USER_MANAGE_PERMISSIONS,
    // Branch section permissions
    Permissions.BRANCH_VIEW_EMPLOYEES,
    Permissions.BRANCH_VIEW_PRODUCTS,
    Permissions.BRANCH_VIEW_PURCHASES,
    Permissions.BRANCH_VIEW_PRODUCTION,
    Permissions.BRANCH_VIEW_SALES_REPORTS,
    Permissions.BRANCH_VIEW_INVENTORY_REPORTS,
    Permissions.BRANCH_VIEW_TRANSACTIONS,
    Permissions.BRANCH_VIEW_ORDERS,
    Permissions.BRANCH_CREATE_ORDER,
    Permissions.BRANCH_VIEW_SETTINGS,
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

    const isBusinessContext = location.pathname.startsWith('/business')

    // Check if user has any business-level permissions (replaces isAdmin check)
    const hasBusinessAccess =
      perms[Permissions.BUSINESS_VIEW_BILLING] || perms[Permissions.BUSINESS_VIEW_PROFILE] || perms[Permissions.BUSINESS_VIEW_CAPABILITIES]

    // Check if user has supervisor-level permissions (view reports, transactions)
    const hasSupervisorAccess = perms[Permissions.BRANCH_VIEW_SALES_REPORTS] || perms[Permissions.BRANCH_VIEW_TRANSACTIONS]

    // Business context navigation (for users with business-level permissions)
    if (isBusinessContext && hasBusinessAccess) {
      return {
        team: {
          name: APP_NAME,
          logo: <GalleryVerticalEndIcon />,
          plan: 'Business Admin',
        },
        items: [
          perms[Permissions.BUSINESS_VIEW_PROFILE]
            ? {
                title: 'Overview',
                url: '/business',
                icon: <LayoutDashboardIcon />,
                allowedRoles: [] as Role[], // Not used anymore, kept for type compatibility
              }
            : null,
          perms[Permissions.BUSINESS_VIEW_CAPABILITIES]
            ? {
                title: 'Capabilities',
                url: '/business/capabilities',
                icon: <TerminalSquareIcon />,
                allowedRoles: [] as Role[],
              }
            : null,
          perms[Permissions.BUSINESS_VIEW_BRANCHES]
            ? {
                title: 'Branches',
                url: '/business/branches',
                icon: <BotIcon />,
                allowedRoles: [] as Role[],
              }
            : null,
          perms[Permissions.BUSINESS_VIEW_BILLING]
            ? {
                title: 'Billing',
                url: '/business/billing',
                icon: <CreditCardIcon />,
                allowedRoles: [] as Role[],
              }
            : null,
          perms[Permissions.BUSINESS_VIEW_SUPPLIERS]
            ? {
                title: 'Suppliers',
                url: '/business/suppliers',
                icon: <ClipboardPenLine />,
                allowedRoles: [] as Role[],
              }
            : null,
          perms[Permissions.BUSINESS_VIEW_CUSTOMERS]
            ? {
                title: 'Customers',
                url: '/business/customers',
                icon: <BookOpenIcon />,
                allowedRoles: [] as Role[],
              }
            : null,
          perms[Permissions.USER_MANAGE_PERMISSIONS]
            ? {
                title: 'Permissions',
                url: '/business/permissions',
                icon: <ShieldIcon />,
                allowedRoles: [] as Role[],
              }
            : null,
          perms[Permissions.BUSINESS_VIEW_PROFILE]
            ? {
                title: 'Profile',
                url: '/business/profile',
                icon: <SettingsIcon />,
                allowedRoles: [] as Role[],
              }
            : null,
        ]
          .filter(Boolean)
          .map(item => ({
            ...item!,
            items: [],
            isActive: isRouteActive(item!.url),
          })) as Items[],
      }
    }

    // Branch context navigation (default)
    const data = {
      team: {
        name: APP_NAME,
        logo: <GalleryVerticalEndIcon />,
        plan: user.role || 'Guest',
      },
      items: [
        perms[Permissions.BRANCH_VIEW_SALES_REPORTS] || hasSupervisorAccess
          ? {
              title: 'Dashboard',
              url: '/dashboard',
              icon: <LayoutDashboardIcon />,
              allowedRoles: [Role.ADMIN, Role.SUPERVISOR],
            }
          : null,
        perms[Permissions.BRANCH_VIEW_EMPLOYEES] || perms[Permissions.BRANCH_VIEW_PRODUCTS]
          ? {
              title: 'Admin',
              url: '#',
              icon: <TerminalSquareIcon />,
              allowedRoles: [Role.ADMIN],
              items: [
                perms[Permissions.BRANCH_VIEW_EMPLOYEES] ? { title: 'Employees', url: '/employees' } : null,
                perms[Permissions.BRANCH_VIEW_PRODUCTS] ? { title: 'Products', url: '/products' } : null,
                caps.BATCH_PREPARATION && perms[Permissions.BRANCH_VIEW_PRODUCTION] ? { title: 'Preparation', url: '/preparation' } : null,
                caps.CREATE_PURCHASE && perms[Permissions.BRANCH_VIEW_PURCHASES] ? { title: 'Purchases', url: '/purchases' } : null,
                user.business?.businessType === BusinessType.RESTAURANT && perms[Permissions.BRANCH_VIEW_PRODUCTS]
                  ? { title: 'Ingredients', url: '/ingredients' }
                  : null,
              ].filter(Boolean),
            }
          : null,
        perms[Permissions.BRANCH_VIEW_SALES_REPORTS] || perms[Permissions.BRANCH_VIEW_TRANSACTIONS]
          ? {
              title: 'Supervisor',
              url: '#',
              icon: <BotIcon />,
              allowedRoles: [Role.ADMIN, Role.SUPERVISOR],
              items: [
                caps.VIEW_SALES_REPORTS && perms[Permissions.BRANCH_VIEW_SALES_REPORTS] ? { title: 'Sales Report', url: '/sales-reports' } : null,
                caps.MANAGE_INVENTORY && perms[Permissions.BRANCH_VIEW_INVENTORY_REPORTS] ? { title: 'Inventory Reports', url: '/inventory-reports' } : null,
                perms[Permissions.BRANCH_VIEW_TRANSACTIONS] ? { title: 'Transactions', url: '/transactions' } : null,
                caps.VIEW_ORDER_HISTORY && perms[Permissions.BRANCH_VIEW_ORDERS] ? { title: 'Order History', url: '/order-history' } : null,
              ].filter(Boolean),
            }
          : null,
        caps.CREATE_TASK
          ? {
              title: 'Tasks',
              url: '/tasks',
              icon: <ClipboardPenLine />,
              allowedRoles: [Role.ADMIN, Role.SUPERVISOR, Role.CASHIER],
            }
          : null,
        perms[Permissions.BRANCH_CREATE_ORDER] || perms[Permissions.BRANCH_VIEW_ORDERS]
          ? {
              title: 'POS',
              url: '/pos',
              icon: <BookOpenIcon />,
              allowedRoles: [Role.ADMIN, Role.SUPERVISOR, Role.CASHIER],
            }
          : null,
        perms[Permissions.BRANCH_VIEW_SETTINGS]
          ? {
              title: 'Settings',
              url: '/settings',
              icon: <SettingsIcon />,
              allowedRoles: [Role.ADMIN, Role.SUPERVISOR],
            }
          : null,
        // Note: Contact Us and Billing have been moved to the Context Switcher and Business section
      ].filter(Boolean) as Items[],
    }

    data.items = data.items.map(item => {
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
  }, [isRouteActive, user, caps, perms, location.pathname])

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
              item.items && item.items.length > 0 ? (
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
// Only visible for users with billing view permission.
// Shows an upgrade CTA when in TRIAL (warning window) or blocked states.
// ---------------------------------------------------------------------------
function SubscriptionStatusFooter() {
  const user = useStore(authStore, state => state.user)
  const authorization = useStore(authStore, state => state.authorization)

  // Check if user has permission to view billing (replaces role check)
  const canViewBilling = authorization?.permissions.includes(Permissions.BUSINESS_VIEW_BILLING) ?? false
  if (!canViewBilling) return null

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
        to='/business/billing'
        className={cn('flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition-colors hover:opacity-80', colorClass)}
      >
        <CreditCardIcon className='h-3.5 w-3.5 shrink-0' />
        <span className='truncate'>{label} — View Billing</span>
      </Link>
    </SidebarFooter>
  )
}
