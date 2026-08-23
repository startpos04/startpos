/**
 * require-permission.test.tsx
 *
 * Unit tests for the RequirePermission component.
 * Tests permission-based access control gates.
 *
 * Coverage:
 *  ✅ Renders children when user has the permission
 *  ✅ Renders default denied view when user lacks permission
 *  ✅ Renders custom fallback when provided
 *  ✅ Renders inline denied message when inline=true
 *  ✅ Supports multiple permissions with requireAll logic
 *  ✅ Supports multiple permissions with requireAny (default) logic
 *  ✅ Shows appropriate labels for known permissions
 *
 * Run with: pnpm test require-permission
 */

import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Role } from 'prisma/generated/prisma/enums'
import { RequirePermission } from '@/components/require-permission'
import { authStore } from '@/store/auth-store'
import { PermissionKeys } from '@/lib/authorization/permission-keys'
import type { AuthorizationSummary } from '@/store/auth-store'

// Mock @tanstack/react-router Link component
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

afterEach(cleanup)

describe('RequirePermission - single permission', () => {
  beforeEach(() => {
    authStore.setState({
      isAuthenticated: false,
      isLoggingOut: false,
      user: {} as any,
      authorization: null,
    })
  })

  it('renders children when user has the permission', () => {
    const authorization: AuthorizationSummary = {
      permissions: [PermissionKeys.BUSINESS.MANAGE_BILLING],
      role: Role.ADMIN,
      customGrants: [],
      customRevokes: [],
    }
    authStore.setState(state => ({ ...state, authorization }))

    render(
      <RequirePermission permission={PermissionKeys.BUSINESS.MANAGE_BILLING}>
        <div>Protected Content</div>
      </RequirePermission>,
    )

    expect(screen.getByText('Protected Content')).toBeInTheDocument()
  })

  it('renders default denied view when user lacks permission', () => {
    const authorization: AuthorizationSummary = {
      permissions: [],
      role: Role.CASHIER,
      customGrants: [],
      customRevokes: [],
    }
    authStore.setState(state => ({ ...state, authorization }))

    render(
      <RequirePermission permission={PermissionKeys.BUSINESS.MANAGE_BILLING}>
        <div>Protected Content</div>
      </RequirePermission>,
    )

    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
    expect(screen.getByText('Access denied')).toBeInTheDocument()
    expect(screen.getByText(/You don't have permission to access/)).toBeInTheDocument()
  })

  it('renders custom fallback when provided', () => {
    const authorization: AuthorizationSummary = {
      permissions: [],
      role: Role.CASHIER,
      customGrants: [],
      customRevokes: [],
    }
    authStore.setState(state => ({ ...state, authorization }))

    render(
      <RequirePermission
        permission={PermissionKeys.BUSINESS.MANAGE_BILLING}
        fallback={<div>Custom Denial Message</div>}
      >
        <div>Protected Content</div>
      </RequirePermission>,
    )

    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
    expect(screen.getByText('Custom Denial Message')).toBeInTheDocument()
  })

  it('renders inline denied message when inline=true', () => {
    const authorization: AuthorizationSummary = {
      permissions: [],
      role: Role.CASHIER,
      customGrants: [],
      customRevokes: [],
    }
    authStore.setState(state => ({ ...state, authorization }))

    render(
      <RequirePermission permission={PermissionKeys.BUSINESS.MANAGE_BILLING} inline>
        <div>Protected Content</div>
      </RequirePermission>,
    )

    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
    expect(screen.queryByText('Access denied')).not.toBeInTheDocument() // Full-page title not shown
    expect(screen.getByText(/You don't have permission to/)).toBeInTheDocument()
  })

  it('shows permission label in denial message', () => {
    const authorization: AuthorizationSummary = {
      permissions: [],
      role: Role.CASHIER,
      customGrants: [],
      customRevokes: [],
    }
    authStore.setState(state => ({ ...state, authorization }))

    render(
      <RequirePermission permission={PermissionKeys.BUSINESS.MANAGE_BILLING}>
        <div>Protected Content</div>
      </RequirePermission>,
    )

    expect(screen.getByText(/Manage billing/i)).toBeInTheDocument()
  })
})

describe('RequirePermission - multiple permissions', () => {
  it('grants access when user has ANY permission (default)', () => {
    const authorization: AuthorizationSummary = {
      permissions: [PermissionKeys.BUSINESS.VIEW_BILLING],
      role: Role.SUPERVISOR,
      customGrants: [],
      customRevokes: [],
    }
    authStore.setState(state => ({ ...state, authorization }))

    render(
      <RequirePermission
        permissions={[PermissionKeys.BUSINESS.MANAGE_BILLING, PermissionKeys.BUSINESS.VIEW_BILLING]}
      >
        <div>Billing Dashboard</div>
      </RequirePermission>,
    )

    expect(screen.getByText('Billing Dashboard')).toBeInTheDocument()
  })

  it('denies access when user has NONE of the permissions', () => {
    const authorization: AuthorizationSummary = {
      permissions: [PermissionKeys.BUSINESS.EXPORT_DATA],
      role: Role.CASHIER,
      customGrants: [],
      customRevokes: [],
    }
    authStore.setState(state => ({ ...state, authorization }))

    render(
      <RequirePermission
        permissions={[PermissionKeys.BUSINESS.MANAGE_BILLING, PermissionKeys.BUSINESS.VIEW_BILLING]}
      >
        <div>Billing Dashboard</div>
      </RequirePermission>,
    )

    expect(screen.queryByText('Billing Dashboard')).not.toBeInTheDocument()
    expect(screen.getByText('Access denied')).toBeInTheDocument()
  })

  it('grants access only when user has ALL permissions (requireAll=true)', () => {
    const authorization: AuthorizationSummary = {
      permissions: [PermissionKeys.BUSINESS.MANAGE_BILLING, PermissionKeys.BUSINESS.VIEW_REPORTS],
      role: Role.ADMIN,
      customGrants: [],
      customRevokes: [],
    }
    authStore.setState(state => ({ ...state, authorization }))

    render(
      <RequirePermission
        permissions={[PermissionKeys.BUSINESS.MANAGE_BILLING, PermissionKeys.BUSINESS.VIEW_REPORTS]}
        requireAll
      >
        <div>Advanced Billing Panel</div>
      </RequirePermission>,
    )

    expect(screen.getByText('Advanced Billing Panel')).toBeInTheDocument()
  })

  it('denies access when user lacks ANY permission (requireAll=true)', () => {
    const authorization: AuthorizationSummary = {
      permissions: [PermissionKeys.BUSINESS.MANAGE_BILLING],
      role: Role.ADMIN,
      customGrants: [],
      customRevokes: [],
    }
    authStore.setState(state => ({ ...state, authorization }))

    render(
      <RequirePermission
        permissions={[PermissionKeys.BUSINESS.MANAGE_BILLING, PermissionKeys.BUSINESS.VIEW_REPORTS]}
        requireAll
      >
        <div>Advanced Billing Panel</div>
      </RequirePermission>,
    )

    expect(screen.queryByText('Advanced Billing Panel')).not.toBeInTheDocument()
    expect(screen.getByText('Access denied')).toBeInTheDocument()
  })
})

describe('RequirePermission - edge cases', () => {
  it('denies access when authorization is null', () => {
    authStore.setState(state => ({ ...state, authorization: null }))

    render(
      <RequirePermission permission={PermissionKeys.BUSINESS.MANAGE_BILLING}>
        <div>Protected Content</div>
      </RequirePermission>,
    )

    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
    expect(screen.getByText('Access denied')).toBeInTheDocument()
  })

  it('shows Back to dashboard button in full-page denied view', () => {
    const authorization: AuthorizationSummary = {
      permissions: [],
      role: Role.CASHIER,
      customGrants: [],
      customRevokes: [],
    }
    authStore.setState(state => ({ ...state, authorization }))

    render(
      <RequirePermission permission={PermissionKeys.BUSINESS.MANAGE_BILLING}>
        <div>Protected Content</div>
      </RequirePermission>,
    )

    expect(screen.getByText('Back to dashboard')).toBeInTheDocument()
  })
})
