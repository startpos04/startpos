/**
 * permission-middleware.test.ts
 *
 * Unit tests for permission middleware functions.
 * Tests all middleware and utility functions that enforce server-side permission checks.
 *
 * Coverage:
 *  ✅ requirePermission throws when user is unauthenticated
 *  ✅ requirePermission throws when AuthorizationEngine fails
 *  ✅ requirePermission throws when user lacks permission
 *  ✅ requirePermission allows when user has permission
 *  ✅ requirePermission passes authorization context to handler
 *  ✅ requireAllPermissions throws when user lacks ANY permission
 *  ✅ requireAllPermissions allows when user has ALL permissions
 *  ✅ requireAnyPermission throws when user has NONE of the permissions
 *  ✅ requireAnyPermission allows when user has ANY permission
 *  ✅ checkPermission returns false when user lacks permission
 *  ✅ checkPermission returns true when user has permission
 *  ✅ checkAllPermissions returns correct boolean
 *  ✅ checkAnyPermission returns correct boolean
 *  ✅ PermissionDeniedError includes correct error details
 *
 * Run with: pnpm test permission-middleware
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ok, err } from 'neverthrow'
import { Role } from 'prisma/generated/prisma/enums'
import {
  requirePermission,
  requireAllPermissions,
  requireAnyPermission,
  checkPermission,
  checkAllPermissions,
  checkAnyPermission,
  PermissionDeniedError,
} from '@/lib/better-auth/permission-middleware'
import { AuthorizationEngine } from '@/lib/authorization/authorization-engine'
import { PermissionKeys } from '@/lib/authorization/permission-keys'

// Mock AuthorizationEngine
vi.mock('@/lib/authorization/authorization-engine', () => ({
  AuthorizationEngine: {
    buildSummary: vi.fn(),
  },
}))

describe('PermissionDeniedError', () => {
  it('includes error code, message, and missing permissions', () => {
    const error = new PermissionDeniedError('PERMISSION_DENIED', 'Access denied', [PermissionKeys.BUSINESS.MANAGE_BILLING])

    expect(error.name).toBe('PermissionDeniedError')
    expect(error.code).toBe('PERMISSION_DENIED')
    expect(error.message).toBe('Access denied')
    expect(error.missingPermissions).toEqual([PermissionKeys.BUSINESS.MANAGE_BILLING])
  })
})

describe('requirePermission', () => {
  let mockNext: ReturnType<typeof vi.fn>
  let mockContext: any

  beforeEach(() => {
    mockNext = vi.fn(({ context }: any) => Promise.resolve(context))
    mockContext = {
      user: {
        id: 'user-123',
        businessId: 'business-456',
        role: Role.ADMIN,
      },
    }
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('throws UNAUTHENTICATED when user is not logged in', async () => {
    const middleware = requirePermission(PermissionKeys.BUSINESS.MANAGE_BILLING)
    const serverMiddleware = middleware.server as any

    const contextWithoutUser = { user: undefined }

    await expect(
      serverMiddleware({
        next: mockNext,
        context: contextWithoutUser,
      }),
    ).rejects.toThrow('You must be logged in to perform this action')

    expect(mockNext).not.toHaveBeenCalled()
  })

  it('throws UNAUTHENTICATED when businessId is missing', async () => {
    const middleware = requirePermission(PermissionKeys.BUSINESS.MANAGE_BILLING)
    const serverMiddleware = middleware.server as any

    const contextWithoutBusinessId = {
      user: { id: 'user-123', businessId: undefined, role: Role.ADMIN },
    }

    await expect(
      serverMiddleware({
        next: mockNext,
        context: contextWithoutBusinessId,
      }),
    ).rejects.toThrow('You must be logged in to perform this action')
  })

  it('throws AUTHORIZATION_CHECK_FAILED when AuthorizationEngine fails', async () => {
    vi.mocked(AuthorizationEngine.buildSummary).mockResolvedValue(err(new Error('Database error')))

    const middleware = requirePermission(PermissionKeys.BUSINESS.MANAGE_BILLING)
    const serverMiddleware = middleware.server as any

    await expect(
      serverMiddleware({
        next: mockNext,
        context: mockContext,
      }),
    ).rejects.toThrow('Failed to check permissions')

    expect(mockNext).not.toHaveBeenCalled()
  })

  it('throws PERMISSION_DENIED when user lacks permission', async () => {
    vi.mocked(AuthorizationEngine.buildSummary).mockResolvedValue(
      ok({
        permissions: [PermissionKeys.BUSINESS.VIEW_BILLING], // Has VIEW but not MANAGE
        role: Role.ADMIN,
        customGrants: [],
        customRevokes: [],
      }),
    )

    const middleware = requirePermission(PermissionKeys.BUSINESS.MANAGE_BILLING)
    const serverMiddleware = middleware.server as any

    await expect(
      serverMiddleware({
        next: mockNext,
        context: mockContext,
      }),
    ).rejects.toThrow('You don\'t have permission to perform this action')

    expect(mockNext).not.toHaveBeenCalled()
  })

  it('allows when user has permission', async () => {
    vi.mocked(AuthorizationEngine.buildSummary).mockResolvedValue(
      ok({
        permissions: [PermissionKeys.BUSINESS.MANAGE_BILLING],
        role: Role.ADMIN,
        customGrants: [],
        customRevokes: [],
      }),
    )

    const middleware = requirePermission(PermissionKeys.BUSINESS.MANAGE_BILLING)
    const serverMiddleware = middleware.server as any

    await serverMiddleware({
      next: mockNext,
      context: mockContext,
    })

    expect(mockNext).toHaveBeenCalledWith({
      context: expect.objectContaining({
        authorization: expect.objectContaining({
          permissions: [PermissionKeys.BUSINESS.MANAGE_BILLING],
        }),
        permissionGranted: PermissionKeys.BUSINESS.MANAGE_BILLING,
      }),
    })
  })

  it('passes authorization context to handler', async () => {
    const authorizationSummary = {
      permissions: [PermissionKeys.BUSINESS.MANAGE_BILLING, PermissionKeys.BUSINESS.VIEW_REPORTS],
      role: Role.ADMIN,
      customGrants: [PermissionKeys.BUSINESS.MANAGE_BILLING],
      customRevokes: [],
    }

    vi.mocked(AuthorizationEngine.buildSummary).mockResolvedValue(ok(authorizationSummary))

    const middleware = requirePermission(PermissionKeys.BUSINESS.MANAGE_BILLING)
    const serverMiddleware = middleware.server as any

    await serverMiddleware({
      next: mockNext,
      context: mockContext,
    })

    expect(mockNext).toHaveBeenCalledWith({
      context: expect.objectContaining({
        authorization: authorizationSummary,
      }),
    })
  })
})

describe('requireAllPermissions', () => {
  let mockNext: ReturnType<typeof vi.fn>
  let mockContext: any

  beforeEach(() => {
    mockNext = vi.fn(({ context }: any) => Promise.resolve(context))
    mockContext = {
      user: {
        id: 'user-123',
        businessId: 'business-456',
        role: Role.ADMIN,
      },
    }
    vi.clearAllMocks()
  })

  it('throws when user lacks ANY permission', async () => {
    vi.mocked(AuthorizationEngine.buildSummary).mockResolvedValue(
      ok({
        permissions: [PermissionKeys.BUSINESS.MANAGE_BILLING], // Has MANAGE but not VIEW_REPORTS
        role: Role.ADMIN,
        customGrants: [],
        customRevokes: [],
      }),
    )

    const middleware = requireAllPermissions([PermissionKeys.BUSINESS.MANAGE_BILLING, PermissionKeys.BUSINESS.VIEW_REPORTS])
    const serverMiddleware = middleware.server as any

    await expect(
      serverMiddleware({
        next: mockNext,
        context: mockContext,
      }),
    ).rejects.toThrow('You don\'t have all required permissions')

    expect(mockNext).not.toHaveBeenCalled()
  })

  it('allows when user has ALL permissions', async () => {
    vi.mocked(AuthorizationEngine.buildSummary).mockResolvedValue(
      ok({
        permissions: [PermissionKeys.BUSINESS.MANAGE_BILLING, PermissionKeys.BUSINESS.VIEW_REPORTS],
        role: Role.ADMIN,
        customGrants: [],
        customRevokes: [],
      }),
    )

    const middleware = requireAllPermissions([PermissionKeys.BUSINESS.MANAGE_BILLING, PermissionKeys.BUSINESS.VIEW_REPORTS])
    const serverMiddleware = middleware.server as any

    await serverMiddleware({
      next: mockNext,
      context: mockContext,
    })

    expect(mockNext).toHaveBeenCalledWith({
      context: expect.objectContaining({
        permissionsGranted: [PermissionKeys.BUSINESS.MANAGE_BILLING, PermissionKeys.BUSINESS.VIEW_REPORTS],
      }),
    })
  })

  it('includes missing permissions in error', async () => {
    vi.mocked(AuthorizationEngine.buildSummary).mockResolvedValue(
      ok({
        permissions: [PermissionKeys.BUSINESS.VIEW_BILLING],
        role: Role.CASHIER,
        customGrants: [],
        customRevokes: [],
      }),
    )

    const middleware = requireAllPermissions([PermissionKeys.BUSINESS.MANAGE_BILLING, PermissionKeys.BUSINESS.VIEW_REPORTS])
    const serverMiddleware = middleware.server as any

    try {
      await serverMiddleware({
        next: mockNext,
        context: mockContext,
      })
      expect.fail('Should have thrown')
    } catch (error: any) {
      expect(error).toBeInstanceOf(PermissionDeniedError)
      expect(error.missingPermissions).toEqual([PermissionKeys.BUSINESS.MANAGE_BILLING, PermissionKeys.BUSINESS.VIEW_REPORTS])
      expect(error.message).toContain('Missing:')
    }
  })
})

describe('requireAnyPermission', () => {
  let mockNext: ReturnType<typeof vi.fn>
  let mockContext: any

  beforeEach(() => {
    mockNext = vi.fn(({ context }: any) => Promise.resolve(context))
    mockContext = {
      user: {
        id: 'user-123',
        businessId: 'business-456',
        role: Role.SUPERVISOR,
      },
    }
    vi.clearAllMocks()
  })

  it('throws when user has NONE of the permissions', async () => {
    vi.mocked(AuthorizationEngine.buildSummary).mockResolvedValue(
      ok({
        permissions: [PermissionKeys.BUSINESS.EXPORT_DATA],
        role: Role.CASHIER,
        customGrants: [],
        customRevokes: [],
      }),
    )

    const middleware = requireAnyPermission([PermissionKeys.BUSINESS.MANAGE_BILLING, PermissionKeys.BUSINESS.VIEW_BILLING])
    const serverMiddleware = middleware.server as any

    await expect(
      serverMiddleware({
        next: mockNext,
        context: mockContext,
      }),
    ).rejects.toThrow('You don\'t have any of the required permissions')

    expect(mockNext).not.toHaveBeenCalled()
  })

  it('allows when user has ANY permission', async () => {
    vi.mocked(AuthorizationEngine.buildSummary).mockResolvedValue(
      ok({
        permissions: [PermissionKeys.BUSINESS.VIEW_BILLING], // Has VIEW but not MANAGE
        role: Role.SUPERVISOR,
        customGrants: [],
        customRevokes: [],
      }),
    )

    const middleware = requireAnyPermission([PermissionKeys.BUSINESS.MANAGE_BILLING, PermissionKeys.BUSINESS.VIEW_BILLING])
    const serverMiddleware = middleware.server as any

    await serverMiddleware({
      next: mockNext,
      context: mockContext,
    })

    expect(mockNext).toHaveBeenCalledWith({
      context: expect.objectContaining({
        permissionsChecked: [PermissionKeys.BUSINESS.MANAGE_BILLING, PermissionKeys.BUSINESS.VIEW_BILLING],
      }),
    })
  })

  it('allows when user has ALL permissions (ANY is subset of ALL)', async () => {
    vi.mocked(AuthorizationEngine.buildSummary).mockResolvedValue(
      ok({
        permissions: [PermissionKeys.BUSINESS.MANAGE_BILLING, PermissionKeys.BUSINESS.VIEW_BILLING],
        role: Role.ADMIN,
        customGrants: [],
        customRevokes: [],
      }),
    )

    const middleware = requireAnyPermission([PermissionKeys.BUSINESS.MANAGE_BILLING, PermissionKeys.BUSINESS.VIEW_BILLING])
    const serverMiddleware = middleware.server as any

    await serverMiddleware({
      next: mockNext,
      context: mockContext,
    })

    expect(mockNext).toHaveBeenCalled()
  })
})

describe('checkPermission', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns false when AuthorizationEngine fails', async () => {
    vi.mocked(AuthorizationEngine.buildSummary).mockResolvedValue(err(new Error('Database error')))

    const result = await checkPermission('user-123', Role.ADMIN, PermissionKeys.BUSINESS.MANAGE_BILLING)

    expect(result).toBe(false)
  })

  it('returns false when user lacks permission', async () => {
    vi.mocked(AuthorizationEngine.buildSummary).mockResolvedValue(
      ok({
        permissions: [PermissionKeys.BUSINESS.VIEW_BILLING],
        role: Role.CASHIER,
        customGrants: [],
        customRevokes: [],
      }),
    )

    const result = await checkPermission('user-123', Role.CASHIER, PermissionKeys.BUSINESS.MANAGE_BILLING)

    expect(result).toBe(false)
  })

  it('returns true when user has permission', async () => {
    vi.mocked(AuthorizationEngine.buildSummary).mockResolvedValue(
      ok({
        permissions: [PermissionKeys.BUSINESS.MANAGE_BILLING],
        role: Role.ADMIN,
        customGrants: [],
        customRevokes: [],
      }),
    )

    const result = await checkPermission('user-123', Role.ADMIN, PermissionKeys.BUSINESS.MANAGE_BILLING)

    expect(result).toBe(true)
  })
})

describe('checkAllPermissions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns false when user lacks ANY permission', async () => {
    vi.mocked(AuthorizationEngine.buildSummary).mockResolvedValue(
      ok({
        permissions: [PermissionKeys.BUSINESS.MANAGE_BILLING],
        role: Role.ADMIN,
        customGrants: [],
        customRevokes: [],
      }),
    )

    const result = await checkAllPermissions('user-123', Role.ADMIN, [
      PermissionKeys.BUSINESS.MANAGE_BILLING,
      PermissionKeys.BUSINESS.VIEW_REPORTS,
    ])

    expect(result).toBe(false)
  })

  it('returns true when user has ALL permissions', async () => {
    vi.mocked(AuthorizationEngine.buildSummary).mockResolvedValue(
      ok({
        permissions: [PermissionKeys.BUSINESS.MANAGE_BILLING, PermissionKeys.BUSINESS.VIEW_REPORTS, PermissionKeys.BUSINESS.EXPORT_DATA],
        role: Role.ADMIN,
        customGrants: [],
        customRevokes: [],
      }),
    )

    const result = await checkAllPermissions('user-123', Role.ADMIN, [
      PermissionKeys.BUSINESS.MANAGE_BILLING,
      PermissionKeys.BUSINESS.VIEW_REPORTS,
    ])

    expect(result).toBe(true)
  })

  it('returns true when checking empty array', async () => {
    vi.mocked(AuthorizationEngine.buildSummary).mockResolvedValue(
      ok({
        permissions: [],
        role: Role.CASHIER,
        customGrants: [],
        customRevokes: [],
      }),
    )

    const result = await checkAllPermissions('user-123', Role.CASHIER, [])

    expect(result).toBe(true)
  })
})

describe('checkAnyPermission', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns false when user has NONE of the permissions', async () => {
    vi.mocked(AuthorizationEngine.buildSummary).mockResolvedValue(
      ok({
        permissions: [PermissionKeys.BUSINESS.EXPORT_DATA],
        role: Role.CASHIER,
        customGrants: [],
        customRevokes: [],
      }),
    )

    const result = await checkAnyPermission('user-123', Role.CASHIER, [
      PermissionKeys.BUSINESS.MANAGE_BILLING,
      PermissionKeys.BUSINESS.VIEW_BILLING,
    ])

    expect(result).toBe(false)
  })

  it('returns true when user has ANY permission', async () => {
    vi.mocked(AuthorizationEngine.buildSummary).mockResolvedValue(
      ok({
        permissions: [PermissionKeys.BUSINESS.VIEW_BILLING],
        role: Role.SUPERVISOR,
        customGrants: [],
        customRevokes: [],
      }),
    )

    const result = await checkAnyPermission('user-123', Role.SUPERVISOR, [
      PermissionKeys.BUSINESS.MANAGE_BILLING,
      PermissionKeys.BUSINESS.VIEW_BILLING,
    ])

    expect(result).toBe(true)
  })

  it('returns false when checking empty array', async () => {
    vi.mocked(AuthorizationEngine.buildSummary).mockResolvedValue(
      ok({
        permissions: [PermissionKeys.BUSINESS.MANAGE_BILLING],
        role: Role.ADMIN,
        customGrants: [],
        customRevokes: [],
      }),
    )

    const result = await checkAnyPermission('user-123', Role.ADMIN, [])

    expect(result).toBe(false)
  })
})
