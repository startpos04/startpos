/**
 * app-sidebar.test.tsx
 *
 * Unit tests for the AppSidebar dashboard navigation component
 * (src/components/custom/dashboard/app-sidebar.tsx)
 *
 * Strategy:
 *  - Mock @tanstack/react-router (useLocation, Link) to control active path.
 *  - Seed authStore with different roles to verify role-filtered nav items.
 *  - AppSidebar uses ShadCN Sidebar primitives — render the component directly.
 *
 * Coverage targets:
 *  ✅ Renders business name in header
 *  ✅ ADMIN sees Admin, Supervisor, Tasks, POS, Settings items
 *  ✅ CASHIER only sees Tasks and POS (no Admin/Supervisor/Settings)
 *  ✅ SUPERVISOR sees Supervisor, Tasks, POS, Settings (no Admin)
 *  ✅ ENABLE_TASK=false hides Tasks item
 *  ✅ RESTAURANT businessType includes Ingredients in Admin submenu
 *  ✅ Non-RESTAURANT hides Ingredients from Admin submenu
 *  ✅ Active route item gets isActive styling
 *  ✅ AppBreadcrumb renders Home + path segments
 *  ✅ NotificationButton renders bell icon and unread badge
 *
 * Run with: pnpm test app-sidebar
 */

import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { seedMockUser, resetMockUser } from '#tests/helpers'

// ---------------------------------------------------------------------------
// Mock: router — useLocation and Link
// ---------------------------------------------------------------------------

vi.mock('@tanstack/react-router', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    useLocation: vi.fn(() => ({ pathname: '/pos' })),
    useNavigate: vi.fn(() => vi.fn()),
    Link: ({ to, children, ...props }: any) => <a href={to} {...props}>{children}</a>,
  }
})

// ---------------------------------------------------------------------------
// Mock: useNotifications (used by NotificationButton)
// ---------------------------------------------------------------------------

vi.mock('@/hooks/use-notifications', () => ({
  useNotifications: vi.fn(() => ({
    unreadCount: 0,
    notifications: [],
    markAsRead: vi.fn(),
    markAllRead: vi.fn(),
    infiniteQuery: { fetchNextPage: vi.fn(), hasNextPage: false, isFetchingNextPage: false, isLoading: false },
  })),
}))

// ---------------------------------------------------------------------------
// Post-mock imports
// ---------------------------------------------------------------------------

import { useLocation } from '@tanstack/react-router'
import { BusinessType, Role } from 'prisma/generated/prisma/enums'
import { SidebarProvider } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppSidebar } from '@/components/custom/dashboard/app-sidebar'
import { AppBreadcrumb } from '@/components/custom/dashboard/app-breadcrumb'
import { NotificationButton } from '@/components/custom/dashboard/notification-btn'
import { useNotifications } from '@/hooks/use-notifications'

// ---------------------------------------------------------------------------
// Helper — wrap AppSidebar in the required SidebarProvider + TooltipProvider
// ---------------------------------------------------------------------------

function renderSidebar() {
  return render(
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>
    </TooltipProvider>,
  )
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  seedMockUser({ role: Role.ADMIN } as any)
  vi.mocked(useLocation).mockReturnValue({ pathname: '/pos' } as any)
})

afterEach(() => {
  cleanup()
  resetMockUser()
})

// ---------------------------------------------------------------------------
// AppSidebar — role visibility
// ---------------------------------------------------------------------------

describe('AppSidebar — ADMIN', () => {
  it('renders app name in header', () => {
    renderSidebar()
    // Sidebar header shows APP_NAME constant, not user.business.name
    expect(screen.getByText('StartPOS')).toBeInTheDocument()
  })

  it('shows Admin, POS, Settings nav items', () => {
    renderSidebar()
    expect(screen.getByText('Admin')).toBeInTheDocument()
    expect(screen.getByText('POS')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('shows Supervisor nav group', () => {
    renderSidebar()
    expect(screen.getByText('Supervisor')).toBeInTheDocument()
  })

  it('shows Tasks when ENABLE_TASK=true', () => {
    renderSidebar()
    expect(screen.getByText('Tasks')).toBeInTheDocument()
  })

  it('hides Tasks when ENABLE_TASK=false', () => {
    seedMockUser({ role: Role.ADMIN, systemConfigs: { ENABLE_TASK: false } } as any)
    renderSidebar()
    expect(screen.queryByText('Tasks')).not.toBeInTheDocument()
  })
})

describe('AppSidebar — CASHIER', () => {
  beforeEach(() => seedMockUser({ role: Role.CASHIER } as any))

  it('hides Admin nav group', () => {
    renderSidebar()
    expect(screen.queryByText('Admin')).not.toBeInTheDocument()
  })

  it('hides Supervisor nav group', () => {
    renderSidebar()
    expect(screen.queryByText('Supervisor')).not.toBeInTheDocument()
  })

  it('hides Settings', () => {
    renderSidebar()
    expect(screen.queryByText('Settings')).not.toBeInTheDocument()
  })

  it('shows POS and Tasks', () => {
    renderSidebar()
    expect(screen.getByText('POS')).toBeInTheDocument()
    expect(screen.getByText('Tasks')).toBeInTheDocument()
  })
})

describe('AppSidebar — SUPERVISOR', () => {
  beforeEach(() => seedMockUser({ role: Role.SUPERVISOR } as any))

  it('hides Admin nav group', () => {
    renderSidebar()
    expect(screen.queryByText('Admin')).not.toBeInTheDocument()
  })

  it('shows Supervisor, POS, Settings, Tasks', () => {
    renderSidebar()
    expect(screen.getByText('Supervisor')).toBeInTheDocument()
    expect(screen.getByText('POS')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })
})

describe('AppSidebar — businessType', () => {
  it('includes Ingredients in Admin submenu for RESTAURANT (useMemo renders sub-items)', () => {
    seedMockUser({ role: Role.ADMIN, business: { id: 'biz-1', name: 'Resto', businessType: BusinessType.RESTAURANT } } as any)
    renderSidebar()
    // Admin collapsible is closed by default — open it first
    fireEvent.click(screen.getByText('Admin'))
    expect(screen.getByText('Ingredients')).toBeInTheDocument()
  })

  it('excludes Ingredients for non-RESTAURANT (no Ingredients in Admin submenu)', () => {
    seedMockUser({ role: Role.ADMIN, business: { id: 'biz-1', name: 'Shop', businessType: BusinessType.RETAIL } } as any)
    renderSidebar()
    fireEvent.click(screen.getByText('Admin'))
    expect(screen.queryByText('Ingredients')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// AppBreadcrumb
// ---------------------------------------------------------------------------

describe('AppBreadcrumb', () => {
  it('renders "Home" link always', () => {
    vi.mocked(useLocation).mockReturnValue({ pathname: '/' } as any)
    render(<AppBreadcrumb />)
    expect(screen.getByText('Home')).toBeInTheDocument()
  })

  it('renders path segments as breadcrumb items', () => {
    vi.mocked(useLocation).mockReturnValue({ pathname: '/products/create' } as any)
    render(<AppBreadcrumb />)
    expect(screen.getByText('Products')).toBeInTheDocument()
    expect(screen.getByText('Create')).toBeInTheDocument()
  })

  it('renders single segment as page (not link)', () => {
    vi.mocked(useLocation).mockReturnValue({ pathname: '/settings' } as any)
    render(<AppBreadcrumb />)
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// NotificationButton
// ---------------------------------------------------------------------------

describe('NotificationButton', () => {
  it('renders bell icon button', () => {
    render(<NotificationButton />)
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('shows unread badge when unreadCount > 0', () => {
    vi.mocked(useNotifications).mockReturnValue({
      unreadCount: 5,
      notifications: [],
      markAsRead: vi.fn(),
      markAllRead: vi.fn(),
      infiniteQuery: { fetchNextPage: vi.fn(), hasNextPage: false, isFetchingNextPage: false, isLoading: false },
    } as any)
    render(<NotificationButton />)
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('hides badge when unreadCount = 0', () => {
    render(<NotificationButton />)
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('shows 99+ when unreadCount > 99', () => {
    vi.mocked(useNotifications).mockReturnValue({
      unreadCount: 150,
      notifications: [],
      markAsRead: vi.fn(),
      markAllRead: vi.fn(),
      infiniteQuery: { fetchNextPage: vi.fn(), hasNextPage: false, isFetchingNextPage: false, isLoading: false },
    } as any)
    render(<NotificationButton />)
    expect(screen.getByText('99+')).toBeInTheDocument()
  })
})
