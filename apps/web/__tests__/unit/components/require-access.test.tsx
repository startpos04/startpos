/**
 * require-access.test.tsx
 *
 * Unit tests for the RequireAccess component (combined capability + permission guard).
 * Tests dual-gating logic where both business-level capability and user-level permission must be granted.
 *
 * Coverage:
 *  ✅ Renders children when both capability and permission are granted
 *  ✅ Shows capability-locked message when capability is disabled
 *  ✅ Shows permission-denied message when capability is enabled but permission is missing
 *  ✅ Supports single permission check
 *  ✅ Supports multiple permissions with requireAll logic
 *  ✅ Supports multiple permissions with requireAny (default) logic
 *  ✅ Supports inline mode
 *
 * Run with: pnpm test require-access
 */

import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Role } from 'prisma/generated/prisma/enums'
import { RequireAccess } from '@/components/custom/guards/require-access'
import { authStore } from '@/store/auth-store'
import { Capabilities } from '@/lib/entitlement/capability-keys'
import { PermissionKeys } from '@/lib/authorization/permission-keys'
import type { AuthorizationSummary } from '@/store/auth-store'

// Mock @tanstack/react-router Link component
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

afterEach(cleanup)

describe('RequireAccess - dual gate logic', () => {
  beforeEach(() => {
    authStore.setState({
      isAuthenticated: false,
      isLoggingOut: false,
      user: {
        id: 'user-1',
        role: Role.ADMIN,
        entitlement: {
          capabilities: [],
          status: 'ACTIVE',
        },
      } as any,
      authorization: null,
    })
  })

  it('renders children when both capability and permission are granted', () => {
    const authorization: AuthorizationSummary = {
      permissions: [PermissionKeys.BUSINESS.MANAGE_BILLING],
      role: Role.ADMIN,
      customGrants: [],
      customRevokes: [],
    }

    authStore.setState(state => ({
      ...state,
      user: {
        ...state.user,
        entitlement: {
          capabilities: [Capabilities.MANAGE_BILLING],
          status: 'ACTIVE',
        },
      } as any,
      authorization,
    }))

    render(
      <RequireAccess capability={Capabilities.MANAGE_BILLING} permission={PermissionKeys.BUSINESS.MANAGE_BILLING}>
        <div>Billing Settings</div>
      </RequireAccess>,
    )

    expect(screen.getByText('Billing Settings')).toBeInTheDocument()
  })

  it('shows capability-locked message when capability is disabled', () => {
    const authorization: AuthorizationSummary = {
      permissions: [PermissionKeys.BUSINESS.MANAGE_BILLING],
      role: Role.ADMIN,
      customGrants: [],
      customRevokes: [],
    }

    authStore.setState(state => ({
      ...state,
      user: {
        ...state.user,
        entitlement: {
          capabilities: [], // Capability not enabled
          status: 'ACTIVE',
        },
      } as any,
      authorization,
    }))

    render(
      <RequireAccess capability={Capabilities.MANAGE_BILLING} permission={PermissionKeys.BUSINESS.MANAGE_BILLING}>
        <div>Billing Settings</div>
      </RequireAccess>,
    )

    expect(screen.queryByText('Billing Settings')).not.toBeInTheDocument()
    expect(screen.getByText(/is not available/)).toBeInTheDocument()
    expect(screen.getByText('View capabilities')).toBeInTheDocument()
  })

  it('shows permission-denied message when capability is enabled but permission is missing', () => {
    const authorization: AuthorizationSummary = {
      permissions: [], // No permissions
      role: Role.CASHIER,
      customGrants: [],
      customRevokes: [],
    }

    authStore.setState(state => ({
      ...state,
      user: {
        ...state.user,
        entitlement: {
          capabilities: [Capabilities.MANAGE_BILLING], // Capability enabled
          status: 'ACTIVE',
        },
      } as any,
      authorization,
    }))

    render(
      <RequireAccess capability={Capabilities.MANAGE_BILLING} permission={PermissionKeys.BUSINESS.MANAGE_BILLING}>
        <div>Billing Settings</div>
      </RequireAccess>,
    )

    expect(screen.queryByText('Billing Settings')).not.toBeInTheDocument()
    expect(screen.getByText('Access denied')).toBeInTheDocument()
    expect(screen.getByText(/You don't have permission/)).toBeInTheDocument()
  })
})

describe('RequireAccess - multiple permissions', () => {
  it('grants access when user has ANY permission (default)', () => {
    const authorization: AuthorizationSummary = {
      permissions: [PermissionKeys.BUSINESS.VIEW_BILLING],
      role: Role.SUPERVISOR,
      customGrants: [],
      customRevokes: [],
    }

    authStore.setState(state => ({
      ...state,
      user: {
        ...state.user,
        entitlement: {
          capabilities: [Capabilities.MANAGE_BILLING],
          status: 'ACTIVE',
        },
      } as any,
      authorization,
    }))

    render(
      <RequireAccess
        capability={Capabilities.MANAGE_BILLING}
        permissions={[PermissionKeys.BUSINESS.MANAGE_BILLING, PermissionKeys.BUSINESS.VIEW_BILLING]}
      >
        <div>Billing Dashboard</div>
      </RequireAccess>,
    )

    expect(screen.getByText('Billing Dashboard')).toBeInTheDocument()
  })

  it('grants access only when user has ALL permissions (requireAllPermissions=true)', () => {
    const authorization: AuthorizationSummary = {
      permissions: [PermissionKeys.BUSINESS.MANAGE_BILLING, PermissionKeys.BUSINESS.VIEW_REPORTS],
      role: Role.ADMIN,
      customGrants: [],
      customRevokes: [],
    }

    authStore.setState(state => ({
      ...state,
      user: {
        ...state.user,
        entitlement: {
          capabilities: [Capabilities.MANAGE_BILLING],
          status: 'ACTIVE',
        },
      } as any,
      authorization,
    }))

    render(
      <RequireAccess
        capability={Capabilities.MANAGE_BILLING}
        permissions={[PermissionKeys.BUSINESS.MANAGE_BILLING, PermissionKeys.BUSINESS.VIEW_REPORTS]}
        requireAllPermissions
      >
        <div>Advanced Billing</div>
      </RequireAccess>,
    )

    expect(screen.getByText('Advanced Billing')).toBeInTheDocument()
  })

  it('denies access when user lacks ANY permission (requireAllPermissions=true)', () => {
    const authorization: AuthorizationSummary = {
      permissions: [PermissionKeys.BUSINESS.MANAGE_BILLING],
      role: Role.ADMIN,
      customGrants: [],
      customRevokes: [],
    }

    authStore.setState(state => ({
      ...state,
      user: {
        ...state.user,
        entitlement: {
          capabilities: [Capabilities.MANAGE_BILLING],
          status: 'ACTIVE',
        },
      } as any,
      authorization,
    }))

    render(
      <RequireAccess
        capability={Capabilities.MANAGE_BILLING}
        permissions={[PermissionKeys.BUSINESS.MANAGE_BILLING, PermissionKeys.BUSINESS.VIEW_REPORTS]}
        requireAllPermissions
      >
        <div>Advanced Billing</div>
      </RequireAccess>,
    )

    expect(screen.queryByText('Advanced Billing')).not.toBeInTheDocument()
    expect(screen.getByText('Access denied')).toBeInTheDocument()
  })
})

describe('RequireAccess - inline mode', () => {
  it('shows inline messages when inline=true', () => {
    const authorization: AuthorizationSummary = {
      permissions: [],
      role: Role.CASHIER,
      customGrants: [],
      customRevokes: [],
    }

    authStore.setState(state => ({
      ...state,
      user: {
        ...state.user,
        entitlement: {
          capabilities: [Capabilities.MANAGE_BILLING],
          status: 'ACTIVE',
        },
      } as any,
      authorization,
    }))

    render(
      <RequireAccess
        capability={Capabilities.MANAGE_BILLING}
        permission={PermissionKeys.BUSINESS.MANAGE_BILLING}
        inline
      >
        <div>Billing Settings</div>
      </RequireAccess>,
    )

    expect(screen.queryByText('Billing Settings')).not.toBeInTheDocument()
    // Inline mode should NOT show full-page cards
    expect(screen.queryByText('Back to dashboard')).not.toBeInTheDocument()
    expect(screen.queryByText('View capabilities')).not.toBeInTheDocument()
  })
})
