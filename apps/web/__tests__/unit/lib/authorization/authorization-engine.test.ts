/**
 * authorization-engine.test.ts - Phase 0: Authorization System Foundation
 *
 * Unit tests for AuthorizationEngine covering:
 *  - buildSummary: Combines role defaults + user grants - user revokes
 *  - check: Single permission verification
 *  - checkAll: Multiple permissions (all must be granted)
 *  - checkAny: Multiple permissions (at least one must be granted)
 *  - grant: Add permissions beyond role defaults
 *  - revoke: Remove permissions from role defaults
 *  - resetToDefault: Remove custom grants/revokes
 *
 * These are pure unit tests - they mock coreAPI to avoid database dependencies.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ok, err } from 'neverthrow'
import { AuthorizationEngine } from '@/lib/authorization/authorization-engine'
import { Permissions } from '@/lib/authorization/permission-keys'
import { RolePermissions } from '@/lib/authorization/role-permissions'

// ---------------------------------------------------------------------------
// Mock coreAPI
// ---------------------------------------------------------------------------

const mockCoreAPI = {
  permission: vi.fn(),
  userPermission: vi.fn(),
}

// Mock the coreAPI import
vi.mock('@/lib/prisma-client/core-api', () => ({
  coreAPI: mockCoreAPI,
}))

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function createMockPermission(key: string) {
  return {
    id: `perm_${key}`,
    key,
    name: key,
    description: key,
    scope: 'BUSINESS',
    resource: 'test',
    action: 'VIEW',
    category: 'Test',
    isSystem: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

function createMockUserPermission(permissionKey: string, granted: boolean) {
  return {
    id: `user_perm_${permissionKey}`,
    userId: 'user123',
    permissionId: `perm_${permissionKey}`,
    granted,
    grantedBy: 'admin456',
    grantedAt: new Date(),
    expiresAt: null,
    note: null,
    permission: createMockPermission(permissionKey),
  }
}

// ---------------------------------------------------------------------------
// buildSummary Tests
// ---------------------------------------------------------------------------

describe('AuthorizationEngine.buildSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns role default permissions when user has no custom grants/revokes', async () => {
    mockCoreAPI.userPermission.mockResolvedValue(ok([]))

    const result = await AuthorizationEngine.buildSummary({
      userId: 'user123',
      role: 'CASHIER',
    })

    expect(result.role).toBe('CASHIER')
    expect(result.permissions).toEqual(RolePermissions.CASHIER)
    expect(result.customGrants).toEqual([])
    expect(result.customRevokes).toEqual([])
  })

  it('includes custom grants in final permissions', async () => {
    const extraPermission = Permissions.BRANCH_VIEW_SALES_REPORTS
    mockCoreAPI.userPermission.mockResolvedValue(
      ok([createMockUserPermission(extraPermission, true)])
    )

    const result = await AuthorizationEngine.buildSummary({
      userId: 'cashier123',
      role: 'CASHIER',
    })

    expect(result.permissions).toContain(extraPermission)
    expect(result.customGrants).toContain(extraPermission)
    expect(result.customRevokes).toEqual([])
  })

  it('removes revoked permissions from final set', async () => {
    const revokedPermission = Permissions.BRANCH_CREATE_ORDER
    mockCoreAPI.userPermission.mockResolvedValue(
      ok([createMockUserPermission(revokedPermission, false)])
    )

    const result = await AuthorizationEngine.buildSummary({
      userId: 'cashier123',
      role: 'CASHIER',
    })

    expect(result.permissions).not.toContain(revokedPermission)
    expect(result.customRevokes).toContain(revokedPermission)
    expect(result.customGrants).toEqual([])
  })

  it('combines role defaults + grants - revokes correctly', async () => {
    const grantedPermission = Permissions.BRANCH_VIEW_SALES_REPORTS
    const revokedPermission = Permissions.BRANCH_VIEW_PRODUCTS

    mockCoreAPI.userPermission.mockResolvedValue(
      ok([
        createMockUserPermission(grantedPermission, true),
        createMockUserPermission(revokedPermission, false),
      ])
    )

    const result = await AuthorizationEngine.buildSummary({
      userId: 'cashier123',
      role: 'CASHIER',
    })

    // Should have the granted permission
    expect(result.permissions).toContain(grantedPermission)
    // Should not have the revoked permission
    expect(result.permissions).not.toContain(revokedPermission)
    // Should still have other default permissions
    expect(result.permissions).toContain(Permissions.USER_VIEW_ACCOUNT)
  })

  it('filters out expired permissions', async () => {
    const expiredGrant = {
      ...createMockUserPermission(Permissions.BRANCH_VIEW_SALES_REPORTS, true),
      expiresAt: new Date('2020-01-01'), // Past date
    }

    mockCoreAPI.userPermission.mockResolvedValue(ok([expiredGrant]))

    const result = await AuthorizationEngine.buildSummary({
      userId: 'user123',
      role: 'CASHIER',
    })

    // Expired grant should not be included
    expect(result.customGrants).toEqual([])
  })

  it('includes permissions with future expiration', async () => {
    const futureExpiry = new Date()
    futureExpiry.setFullYear(futureExpiry.getFullYear() + 1)

    const futureGrant = {
      ...createMockUserPermission(Permissions.BRANCH_VIEW_SALES_REPORTS, true),
      expiresAt: futureExpiry,
    }

    mockCoreAPI.userPermission.mockResolvedValue(ok([futureGrant]))

    const result = await AuthorizationEngine.buildSummary({
      userId: 'user123',
      role: 'CASHIER',
    })

    expect(result.customGrants).toContain(Permissions.BRANCH_VIEW_SALES_REPORTS)
  })

  it('handles OWNER role with all permissions', async () => {
    mockCoreAPI.userPermission.mockResolvedValue(ok([]))

    const result = await AuthorizationEngine.buildSummary({
      userId: 'owner123',
      role: 'OWNER',
    })

    expect(result.role).toBe('OWNER')
    expect(result.permissions.length).toBeGreaterThan(50) // OWNER has many permissions
    expect(result.permissions).toContain(Permissions.BUSINESS_MANAGE_BILLING)
    expect(result.permissions).toContain(Permissions.BUSINESS_MANAGE_SUBSCRIPTION)
  })

  it('throws error on database failure', async () => {
    mockCoreAPI.userPermission.mockResolvedValue(err('Database connection failed'))

    await expect(
      AuthorizationEngine.buildSummary({
        userId: 'user123',
        role: 'CASHIER',
      })
    ).rejects.toThrow('Failed to fetch user permissions')
  })
})

// ---------------------------------------------------------------------------
// check Tests
// ---------------------------------------------------------------------------

describe('AuthorizationEngine.check', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('grants permission when user has it', async () => {
    mockCoreAPI.userPermission.mockResolvedValue(ok([]))

    const result = await AuthorizationEngine.check(
      Permissions.BRANCH_VIEW_PRODUCTS,
      { userId: 'cashier123', role: 'CASHIER' }
    )

    expect(result.granted).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  it('denies permission when user does not have it', async () => {
    mockCoreAPI.userPermission.mockResolvedValue(ok([]))

    const result = await AuthorizationEngine.check(
      Permissions.BUSINESS_MANAGE_BILLING,
      { userId: 'cashier123', role: 'CASHIER' }
    )

    expect(result.granted).toBe(false)
    expect(result.reason).toContain('not granted')
  })

  it('respects custom grants', async () => {
    mockCoreAPI.userPermission.mockResolvedValue(
      ok([createMockUserPermission(Permissions.BUSINESS_MANAGE_BILLING, true)])
    )

    const result = await AuthorizationEngine.check(
      Permissions.BUSINESS_MANAGE_BILLING,
      { userId: 'cashier123', role: 'CASHIER' }
    )

    expect(result.granted).toBe(true)
  })

  it('respects custom revokes', async () => {
    mockCoreAPI.userPermission.mockResolvedValue(
      ok([createMockUserPermission(Permissions.BRANCH_VIEW_PRODUCTS, false)])
    )

    const result = await AuthorizationEngine.check(
      Permissions.BRANCH_VIEW_PRODUCTS,
      { userId: 'cashier123', role: 'CASHIER' }
    )

    expect(result.granted).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// checkAll Tests
// ---------------------------------------------------------------------------

describe('AuthorizationEngine.checkAll', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('grants when user has all permissions', async () => {
    mockCoreAPI.userPermission.mockResolvedValue(ok([]))

    const result = await AuthorizationEngine.checkAll(
      [Permissions.BRANCH_VIEW_PRODUCTS, Permissions.BRANCH_VIEW_ORDERS],
      { userId: 'cashier123', role: 'CASHIER' }
    )

    expect(result.granted).toBe(true)
    expect(result.missing).toBeUndefined()
  })

  it('denies when user is missing any permission', async () => {
    mockCoreAPI.userPermission.mockResolvedValue(ok([]))

    const result = await AuthorizationEngine.checkAll(
      [
        Permissions.BRANCH_VIEW_PRODUCTS,
        Permissions.BUSINESS_MANAGE_BILLING,
      ],
      { userId: 'cashier123', role: 'CASHIER' }
    )

    expect(result.granted).toBe(false)
    expect(result.missing).toEqual([Permissions.BUSINESS_MANAGE_BILLING])
  })

  it('returns all missing permissions', async () => {
    mockCoreAPI.userPermission.mockResolvedValue(ok([]))

    const result = await AuthorizationEngine.checkAll(
      [
        Permissions.BUSINESS_MANAGE_BILLING,
        Permissions.BUSINESS_MANAGE_SUBSCRIPTION,
        Permissions.BRANCH_DELETE_EMPLOYEE,
      ],
      { userId: 'cashier123', role: 'CASHIER' }
    )

    expect(result.granted).toBe(false)
    expect(result.missing).toHaveLength(3)
  })
})

// ---------------------------------------------------------------------------
// checkAny Tests
// ---------------------------------------------------------------------------

describe('AuthorizationEngine.checkAny', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('grants when user has at least one permission', async () => {
    mockCoreAPI.userPermission.mockResolvedValue(ok([]))

    const result = await AuthorizationEngine.checkAny(
      [
        Permissions.BRANCH_VIEW_PRODUCTS,
        Permissions.BUSINESS_MANAGE_BILLING,
      ],
      { userId: 'cashier123', role: 'CASHIER' }
    )

    expect(result.granted).toBe(true)
    expect(result.matched).toEqual([Permissions.BRANCH_VIEW_PRODUCTS])
  })

  it('denies when user has none of the permissions', async () => {
    mockCoreAPI.userPermission.mockResolvedValue(ok([]))

    const result = await AuthorizationEngine.checkAny(
      [
        Permissions.BUSINESS_MANAGE_BILLING,
        Permissions.BUSINESS_MANAGE_SUBSCRIPTION,
      ],
      { userId: 'cashier123', role: 'CASHIER' }
    )

    expect(result.granted).toBe(false)
    expect(result.matched).toBeUndefined()
  })

  it('returns all matched permissions', async () => {
    mockCoreAPI.userPermission.mockResolvedValue(ok([]))

    const result = await AuthorizationEngine.checkAny(
      [
        Permissions.BRANCH_VIEW_PRODUCTS,
        Permissions.BRANCH_VIEW_ORDERS,
        Permissions.BRANCH_CREATE_ORDER,
      ],
      { userId: 'cashier123', role: 'CASHIER' }
    )

    expect(result.granted).toBe(true)
    expect(result.matched).toHaveLength(3)
  })
})

// ---------------------------------------------------------------------------
// grant Tests
// ---------------------------------------------------------------------------

describe('AuthorizationEngine.grant', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a grant record', async () => {
    mockCoreAPI.permission.mockResolvedValue(
      ok(createMockPermission(Permissions.BUSINESS_MANAGE_BILLING))
    )
    mockCoreAPI.userPermission.mockResolvedValue(ok({}))

    await AuthorizationEngine.grant(
      'user123',
      Permissions.BUSINESS_MANAGE_BILLING,
      'admin456',
      'Temporary access for review'
    )

    expect(mockCoreAPI.permission).toHaveBeenCalledWith('findUnique', {
      where: { key: Permissions.BUSINESS_MANAGE_BILLING },
    })

    expect(mockCoreAPI.userPermission).toHaveBeenCalledWith(
      'upsert',
      expect.objectContaining({
        create: expect.objectContaining({
          granted: true,
          grantedBy: 'admin456',
          note: 'Temporary access for review',
        }),
      })
    )
  })

  it('throws error when permission not found', async () => {
    mockCoreAPI.permission.mockResolvedValue(ok(null))

    await expect(
      AuthorizationEngine.grant(
        'user123',
        'invalid:permission:key' as any,
        'admin456'
      )
    ).rejects.toThrow('Permission invalid:permission:key not found')
  })

  it('supports expiration date for temporary grants', async () => {
    mockCoreAPI.permission.mockResolvedValue(
      ok(createMockPermission(Permissions.BUSINESS_VIEW_BILLING))
    )
    mockCoreAPI.userPermission.mockResolvedValue(ok({}))

    const expiresAt = new Date('2026-12-31')

    await AuthorizationEngine.grant(
      'user123',
      Permissions.BUSINESS_VIEW_BILLING,
      'admin456',
      'Temporary for Q4 review',
      expiresAt
    )

    expect(mockCoreAPI.userPermission).toHaveBeenCalledWith(
      'upsert',
      expect.objectContaining({
        create: expect.objectContaining({
          expiresAt,
        }),
      })
    )
  })

  it('throws error when database operation fails', async () => {
    mockCoreAPI.permission.mockResolvedValue(
      ok(createMockPermission(Permissions.BUSINESS_VIEW_BILLING))
    )
    mockCoreAPI.userPermission.mockResolvedValue(err('Database error'))

    await expect(
      AuthorizationEngine.grant(
        'user123',
        Permissions.BUSINESS_VIEW_BILLING,
        'admin456'
      )
    ).rejects.toThrow('Failed to grant permission')
  })
})

// ---------------------------------------------------------------------------
// revoke Tests
// ---------------------------------------------------------------------------

describe('AuthorizationEngine.revoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a revoke record', async () => {
    mockCoreAPI.permission.mockResolvedValue(
      ok(createMockPermission(Permissions.BRANCH_DELETE_PRODUCT))
    )
    mockCoreAPI.userPermission.mockResolvedValue(ok({}))

    await AuthorizationEngine.revoke(
      'user123',
      Permissions.BRANCH_DELETE_PRODUCT,
      'admin456',
      'Training period - read-only access'
    )

    expect(mockCoreAPI.userPermission).toHaveBeenCalledWith(
      'upsert',
      expect.objectContaining({
        create: expect.objectContaining({
          granted: false,
          grantedBy: 'admin456',
          note: 'Training period - read-only access',
        }),
      })
    )
  })

  it('throws error when permission not found', async () => {
    mockCoreAPI.permission.mockResolvedValue(ok(null))

    await expect(
      AuthorizationEngine.revoke(
        'user123',
        'invalid:permission:key' as any,
        'admin456'
      )
    ).rejects.toThrow('Permission invalid:permission:key not found')
  })
})

// ---------------------------------------------------------------------------
// resetToDefault Tests
// ---------------------------------------------------------------------------

describe('AuthorizationEngine.resetToDefault', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deletes custom permission records', async () => {
    mockCoreAPI.permission.mockResolvedValue(
      ok(createMockPermission(Permissions.BRANCH_MANAGE_PRODUCTS))
    )
    mockCoreAPI.userPermission.mockResolvedValue(ok({ count: 1 }))

    await AuthorizationEngine.resetToDefault(
      'user123',
      Permissions.BRANCH_MANAGE_PRODUCTS
    )

    expect(mockCoreAPI.userPermission).toHaveBeenCalledWith('deleteMany', {
      where: {
        userId: 'user123',
        permissionId: `perm_${Permissions.BRANCH_MANAGE_PRODUCTS}`,
      },
    })
  })

  it('handles non-existent permission gracefully', async () => {
    mockCoreAPI.permission.mockResolvedValue(ok(null))

    await expect(
      AuthorizationEngine.resetToDefault(
        'user123',
        'invalid:permission:key' as any
      )
    ).resolves.not.toThrow()

    expect(mockCoreAPI.userPermission).not.toHaveBeenCalled()
  })
})
