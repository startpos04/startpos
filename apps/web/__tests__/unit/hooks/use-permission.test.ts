/**
 * use-permission.test.ts
 *
 * Unit tests for permission hooks using @testing-library/react.
 * Tests all hooks that read from authStore.authorization:
 *   - usePermission
 *   - usePermissions
 *   - useHasAllPermissions
 *   - useHasAnyPermission
 *   - useUserRole
 *   - useCustomPermissions
 *
 * Coverage:
 *  ✅ usePermission returns true when user has permission
 *  ✅ usePermission returns false when user lacks permission
 *  ✅ usePermission returns false when authorization is null
 *  ✅ usePermissions returns object with boolean values for each permission
 *  ✅ useHasAllPermissions returns true only when user has ALL permissions
 *  ✅ useHasAnyPermission returns true when user has ANY permission
 *  ✅ useUserRole returns user role
 *  ✅ useCustomPermissions returns custom grants and revokes
 *  ✅ Hooks react to authStore changes
 *
 * Run with: pnpm test use-permission
 */

import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Role } from 'prisma/generated/prisma/enums'
import {
  usePermission,
  usePermissions,
  useHasAllPermissions,
  useHasAnyPermission,
  useUserRole,
  useCustomPermissions,
} from '@/hooks/use-permission'
import { authStore } from '@/store/auth-store'
import { PermissionKeys } from '@/lib/authorization/permission-keys'
import type { AuthorizationSummary } from '@/store/auth-store'

describe('usePermission', () => {
  beforeEach(() => {
    // Reset authStore to default state
    authStore.setState({
      isAuthenticated: false,
      isLoggingOut: false,
      user: {} as any,
      authorization: null,
    })
  })

  afterEach(() => {
    authStore.setState({
      isAuthenticated: false,
      isLoggingOut: false,
      user: {} as any,
      authorization: null,
    })
  })

  it('returns true when user has the permission', () => {
    const authorization: AuthorizationSummary = {
      permissions: [PermissionKeys.BUSINESS.MANAGE_BILLING, PermissionKeys.BUSINESS.VIEW_REPORTS],
      role: Role.ADMIN,
      customGrants: [],
      customRevokes: [],
    }

    authStore.setState(state => ({ ...state, authorization }))

    const { result } = renderHook(() => usePermission(PermissionKeys.BUSINESS.MANAGE_BILLING))
    expect(result.current).toBe(true)
  })

  it('returns false when user lacks the permission', () => {
    const authorization: AuthorizationSummary = {
      permissions: [PermissionKeys.BUSINESS.VIEW_REPORTS],
      role: Role.CASHIER,
      customGrants: [],
      customRevokes: [],
    }

    authStore.setState(state => ({ ...state, authorization }))

    const { result } = renderHook(() => usePermission(PermissionKeys.BUSINESS.MANAGE_BILLING))
    expect(result.current).toBe(false)
  })

  it('returns false when authorization is null', () => {
    authStore.setState(state => ({ ...state, authorization: null }))

    const { result } = renderHook(() => usePermission(PermissionKeys.BUSINESS.MANAGE_BILLING))
    expect(result.current).toBe(false)
  })

  it('reacts to authStore changes', async () => {
    const { result } = renderHook(() => usePermission(PermissionKeys.BUSINESS.MANAGE_BILLING))

    // Initially no permission
    expect(result.current).toBe(false)

    // Grant permission
    const authorization: AuthorizationSummary = {
      permissions: [PermissionKeys.BUSINESS.MANAGE_BILLING],
      role: Role.ADMIN,
      customGrants: [],
      customRevokes: [],
    }
    authStore.setState(state => ({ ...state, authorization }))

    await waitFor(() => expect(result.current).toBe(true))
  })
})

describe('usePermissions', () => {
  it('returns object with boolean values for each permission', () => {
    const authorization: AuthorizationSummary = {
      permissions: [PermissionKeys.BUSINESS.MANAGE_BILLING, PermissionKeys.BUSINESS.VIEW_REPORTS],
      role: Role.ADMIN,
      customGrants: [],
      customRevokes: [],
    }

    authStore.setState(state => ({ ...state, authorization }))

    const { result } = renderHook(() =>
      usePermissions([
        PermissionKeys.BUSINESS.MANAGE_BILLING,
        PermissionKeys.BUSINESS.VIEW_REPORTS,
        PermissionKeys.BUSINESS.EXPORT_DATA,
      ]),
    )

    expect(result.current).toEqual({
      [PermissionKeys.BUSINESS.MANAGE_BILLING]: true,
      [PermissionKeys.BUSINESS.VIEW_REPORTS]: true,
      [PermissionKeys.BUSINESS.EXPORT_DATA]: false,
    })
  })

  it('returns all false when authorization is null', () => {
    authStore.setState(state => ({ ...state, authorization: null }))

    const { result } = renderHook(() =>
      usePermissions([PermissionKeys.BUSINESS.MANAGE_BILLING, PermissionKeys.BUSINESS.VIEW_REPORTS]),
    )

    expect(result.current).toEqual({
      [PermissionKeys.BUSINESS.MANAGE_BILLING]: false,
      [PermissionKeys.BUSINESS.VIEW_REPORTS]: false,
    })
  })
})

describe('useHasAllPermissions', () => {
  it('returns true when user has ALL permissions', () => {
    const authorization: AuthorizationSummary = {
      permissions: [
        PermissionKeys.BUSINESS.MANAGE_BILLING,
        PermissionKeys.BUSINESS.VIEW_REPORTS,
        PermissionKeys.BUSINESS.EXPORT_DATA,
      ],
      role: Role.ADMIN,
      customGrants: [],
      customRevokes: [],
    }

    authStore.setState(state => ({ ...state, authorization }))

    const { result } = renderHook(() =>
      useHasAllPermissions([PermissionKeys.BUSINESS.MANAGE_BILLING, PermissionKeys.BUSINESS.VIEW_REPORTS]),
    )

    expect(result.current).toBe(true)
  })

  it('returns false when user lacks ANY permission', () => {
    const authorization: AuthorizationSummary = {
      permissions: [PermissionKeys.BUSINESS.MANAGE_BILLING],
      role: Role.ADMIN,
      customGrants: [],
      customRevokes: [],
    }

    authStore.setState(state => ({ ...state, authorization }))

    const { result } = renderHook(() =>
      useHasAllPermissions([PermissionKeys.BUSINESS.MANAGE_BILLING, PermissionKeys.BUSINESS.VIEW_REPORTS]),
    )

    expect(result.current).toBe(false)
  })

  it('returns true when checking empty array', () => {
    const authorization: AuthorizationSummary = {
      permissions: [],
      role: Role.CASHIER,
      customGrants: [],
      customRevokes: [],
    }

    authStore.setState(state => ({ ...state, authorization }))

    const { result } = renderHook(() => useHasAllPermissions([]))
    expect(result.current).toBe(true)
  })
})

describe('useHasAnyPermission', () => {
  it('returns true when user has ANY permission', () => {
    const authorization: AuthorizationSummary = {
      permissions: [PermissionKeys.BUSINESS.VIEW_REPORTS],
      role: Role.SUPERVISOR,
      customGrants: [],
      customRevokes: [],
    }

    authStore.setState(state => ({ ...state, authorization }))

    const { result } = renderHook(() =>
      useHasAnyPermission([PermissionKeys.BUSINESS.MANAGE_BILLING, PermissionKeys.BUSINESS.VIEW_REPORTS]),
    )

    expect(result.current).toBe(true)
  })

  it('returns false when user has NONE of the permissions', () => {
    const authorization: AuthorizationSummary = {
      permissions: [PermissionKeys.BUSINESS.EXPORT_DATA],
      role: Role.CASHIER,
      customGrants: [],
      customRevokes: [],
    }

    authStore.setState(state => ({ ...state, authorization }))

    const { result } = renderHook(() =>
      useHasAnyPermission([PermissionKeys.BUSINESS.MANAGE_BILLING, PermissionKeys.BUSINESS.VIEW_REPORTS]),
    )

    expect(result.current).toBe(false)
  })

  it('returns false when checking empty array', () => {
    const authorization: AuthorizationSummary = {
      permissions: [PermissionKeys.BUSINESS.MANAGE_BILLING],
      role: Role.ADMIN,
      customGrants: [],
      customRevokes: [],
    }

    authStore.setState(state => ({ ...state, authorization }))

    const { result } = renderHook(() => useHasAnyPermission([]))
    expect(result.current).toBe(false)
  })
})

describe('useUserRole', () => {
  it('returns user role when user is loaded', () => {
    authStore.setState(state => ({
      ...state,
      isAuthenticated: true,
      user: { id: 'user-1', role: Role.ADMIN } as any,
    }))

    const { result } = renderHook(() => useUserRole())
    expect(result.current).toBe(Role.ADMIN)
  })

  it('returns undefined when user is not loaded', () => {
    authStore.setState(state => ({
      ...state,
      isAuthenticated: false,
      user: {} as any,
    }))

    const { result } = renderHook(() => useUserRole())
    expect(result.current).toBeUndefined()
  })
})

describe('useCustomPermissions', () => {
  it('returns custom grants and revokes', () => {
    const authorization: AuthorizationSummary = {
      permissions: [PermissionKeys.BUSINESS.MANAGE_BILLING],
      role: Role.CASHIER,
      customGrants: [PermissionKeys.BUSINESS.MANAGE_BILLING],
      customRevokes: [PermissionKeys.BRANCH.CREATE_ORDER],
    }

    authStore.setState(state => ({ ...state, authorization }))

    const { result } = renderHook(() => useCustomPermissions())
    expect(result.current).toEqual({
      customGrants: [PermissionKeys.BUSINESS.MANAGE_BILLING],
      customRevokes: [PermissionKeys.BRANCH.CREATE_ORDER],
    })
  })

  it('returns empty arrays when authorization is null', () => {
    authStore.setState(state => ({ ...state, authorization: null }))

    const { result } = renderHook(() => useCustomPermissions())
    expect(result.current).toEqual({
      customGrants: [],
      customRevokes: [],
    })
  })
})
