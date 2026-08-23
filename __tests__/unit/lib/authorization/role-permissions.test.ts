/**
 * role-permissions.test.ts - Phase 0: Authorization System Foundation
 *
 * Unit tests for role permission functions.
 */

import { describe, expect, it } from 'vitest'
import { Permissions } from '@/lib/authorization/permission-keys'
import {
  RolePermissions,
  getDefaultPermissionsForRole,
  roleHasPermission,
  getAllPermissions,
  getRolesWithPermission,
} from '@/lib/authorization/role-permissions'

describe('Role Permission Functions', () => {
  describe('getDefaultPermissionsForRole', () => {
    it('returns OWNER permissions', () => {
      const permissions = getDefaultPermissionsForRole('OWNER')
      
      expect(permissions).toContain(Permissions.BUSINESS_MANAGE_BILLING)
      expect(permissions).toContain(Permissions.BUSINESS_MANAGE_SUBSCRIPTION)
      expect(permissions).toContain(Permissions.BRANCH_MANAGE_EMPLOYEES)
      expect(permissions.length).toBeGreaterThan(50)
    })

    it('returns ADMIN permissions', () => {
      const permissions = getDefaultPermissionsForRole('ADMIN')
      
      expect(permissions).toContain(Permissions.BRANCH_MANAGE_PRODUCTS)
      expect(permissions).toContain(Permissions.BRANCH_MANAGE_EMPLOYEES)
      expect(permissions).toContain(Permissions.BUSINESS_VIEW_SUPPLIERS)
    })

    it('returns SUPERVISOR permissions', () => {
      const permissions = getDefaultPermissionsForRole('SUPERVISOR')
      
      expect(permissions).toContain(Permissions.BRANCH_VIEW_EMPLOYEES)
      expect(permissions).toContain(Permissions.BRANCH_MANAGE_PRODUCTS)
      expect(permissions).not.toContain(Permissions.BRANCH_MANAGE_EMPLOYEES)
    })

    it('returns CASHIER permissions', () => {
      const permissions = getDefaultPermissionsForRole('CASHIER')
      
      expect(permissions).toContain(Permissions.BRANCH_VIEW_PRODUCTS)
      expect(permissions).toContain(Permissions.BRANCH_CREATE_ORDER)
      expect(permissions).not.toContain(Permissions.BRANCH_MANAGE_PRODUCTS)
      expect(permissions.length).toBeLessThan(10)
    })

    it('returns SERVICE_PROVIDER permissions', () => {
      const permissions = getDefaultPermissionsForRole('SERVICE_PROVIDER')
      
      expect(permissions).toContain(Permissions.BRANCH_VIEW_PRODUCTS)
      expect(permissions).toContain(Permissions.BRANCH_CREATE_ORDER)
      expect(permissions.length).toBeLessThan(10)
    })

    it('returns empty array for unknown role', () => {
      const permissions = getDefaultPermissionsForRole('UNKNOWN_ROLE')
      
      expect(permissions).toEqual([])
    })
  })

  describe('roleHasPermission', () => {
    it('returns true when role has permission', () => {
      expect(
        roleHasPermission('OWNER', Permissions.BUSINESS_MANAGE_BILLING)
      ).toBe(true)
      
      expect(
        roleHasPermission('ADMIN', Permissions.BRANCH_MANAGE_PRODUCTS)
      ).toBe(true)
      
      expect(
        roleHasPermission('CASHIER', Permissions.BRANCH_CREATE_ORDER)
      ).toBe(true)
    })

    it('returns false when role does not have permission', () => {
      expect(
        roleHasPermission('CASHIER', Permissions.BUSINESS_MANAGE_BILLING)
      ).toBe(false)
      
      expect(
        roleHasPermission('SUPERVISOR', Permissions.BRANCH_MANAGE_EMPLOYEES)
      ).toBe(false)
    })

    it('returns false for unknown role', () => {
      expect(
        roleHasPermission('UNKNOWN_ROLE', Permissions.BRANCH_VIEW_PRODUCTS)
      ).toBe(false)
    })
  })

  describe('getAllPermissions', () => {
    it('returns all unique permissions across all roles', () => {
      const allPermissions = getAllPermissions()
      
      // Should include permissions from all roles
      expect(allPermissions).toContain(Permissions.BUSINESS_MANAGE_BILLING)
      expect(allPermissions).toContain(Permissions.BRANCH_MANAGE_PRODUCTS)
      expect(allPermissions).toContain(Permissions.USER_VIEW_ACCOUNT)
      
      // Should be unique (no duplicates)
      const uniqueSet = new Set(allPermissions)
      expect(uniqueSet.size).toBe(allPermissions.length)
      
      // Should be a reasonable number
      expect(allPermissions.length).toBeGreaterThan(20)
      expect(allPermissions.length).toBeLessThan(100)
    })

    it('includes all permission scopes', () => {
      const allPermissions = getAllPermissions()
      
      const hasBusinessScope = allPermissions.some(p => p.startsWith('business:'))
      const hasBranchScope = allPermissions.some(p => p.startsWith('branch:'))
      const hasUserScope = allPermissions.some(p => p.startsWith('user:'))
      
      expect(hasBusinessScope).toBe(true)
      expect(hasBranchScope).toBe(true)
      expect(hasUserScope).toBe(true)
    })
  })

  describe('getRolesWithPermission', () => {
    it('returns roles that have a specific permission', () => {
      const rolesWithBilling = getRolesWithPermission(
        Permissions.BUSINESS_MANAGE_BILLING
      )
      
      expect(rolesWithBilling).toContain('OWNER')
      expect(rolesWithBilling).not.toContain('CASHIER')
    })

    it('returns all roles for common permissions', () => {
      const rolesWithAccount = getRolesWithPermission(
        Permissions.USER_VIEW_ACCOUNT
      )
      
      // All roles should have user account permissions
      expect(rolesWithAccount).toContain('OWNER')
      expect(rolesWithAccount).toContain('ADMIN')
      expect(rolesWithAccount).toContain('SUPERVISOR')
      expect(rolesWithAccount).toContain('CASHIER')
      expect(rolesWithAccount).toContain('SERVICE_PROVIDER')
    })

    it('returns empty array for permission no role has', () => {
      const roles = getRolesWithPermission('fake:permission:key' as any)
      
      expect(roles).toEqual([])
    })
  })

  describe('Role Hierarchy (implicit)', () => {
    it('OWNER has all business permissions', () => {
      const ownerPermissions = RolePermissions.OWNER
      
      expect(ownerPermissions).toContain(Permissions.BUSINESS_MANAGE_BILLING)
      expect(ownerPermissions).toContain(Permissions.BUSINESS_MANAGE_SUBSCRIPTION)
      expect(ownerPermissions).toContain(Permissions.BUSINESS_MANAGE_BRANCHES)
      expect(ownerPermissions).toContain(Permissions.BUSINESS_MANAGE_USERS)
    })

    it('ADMIN has more permissions than SUPERVISOR', () => {
      const adminPermissions = RolePermissions.ADMIN
      const supervisorPermissions = RolePermissions.SUPERVISOR
      
      expect(adminPermissions.length).toBeGreaterThan(supervisorPermissions.length)
    })

    it('SUPERVISOR has more permissions than CASHIER', () => {
      const supervisorPermissions = RolePermissions.SUPERVISOR
      const cashierPermissions = RolePermissions.CASHIER
      
      expect(supervisorPermissions.length).toBeGreaterThan(cashierPermissions.length)
    })

    it('CASHIER has minimal operational permissions', () => {
      const cashierPermissions = RolePermissions.CASHIER
      
      // Should have POS-related permissions
      expect(cashierPermissions).toContain(Permissions.BRANCH_CREATE_ORDER)
      expect(cashierPermissions).toContain(Permissions.BRANCH_CREATE_TRANSACTION)
      
      // Should NOT have management permissions
      expect(cashierPermissions).not.toContain(Permissions.BRANCH_MANAGE_PRODUCTS)
      expect(cashierPermissions).not.toContain(Permissions.BRANCH_MANAGE_EMPLOYEES)
      expect(cashierPermissions).not.toContain(Permissions.BUSINESS_MANAGE_BILLING)
    })
  })

  describe('Permission Consistency', () => {
    it('all roles have user account permissions', () => {
      const roles = ['OWNER', 'ADMIN', 'SUPERVISOR', 'CASHIER', 'SERVICE_PROVIDER']
      
      for (const role of roles) {
        const permissions = RolePermissions[role]
        
        expect(permissions).toContain(Permissions.USER_VIEW_ACCOUNT)
        expect(permissions).toContain(Permissions.USER_MANAGE_ACCOUNT)
        expect(permissions).toContain(Permissions.USER_CHANGE_PASSWORD)
        expect(permissions).toContain(Permissions.USER_MANAGE_PREFERENCES)
      }
    })

    it('ADMIN and SUPERVISOR both have supplier/customer access', () => {
      const adminPermissions = RolePermissions.ADMIN
      const supervisorPermissions = RolePermissions.SUPERVISOR
      
      // Both should have supplier/customer view and manage
      expect(adminPermissions).toContain(Permissions.BUSINESS_VIEW_SUPPLIERS)
      expect(adminPermissions).toContain(Permissions.BUSINESS_MANAGE_SUPPLIERS)
      
      expect(supervisorPermissions).toContain(Permissions.BUSINESS_VIEW_SUPPLIERS)
      expect(supervisorPermissions).toContain(Permissions.BUSINESS_MANAGE_SUPPLIERS)
    })

    it('no role has duplicate permissions', () => {
      const roles = ['OWNER', 'ADMIN', 'SUPERVISOR', 'CASHIER', 'SERVICE_PROVIDER']
      
      for (const role of roles) {
        const permissions = RolePermissions[role]
        const uniquePermissions = new Set(permissions)
        
        expect(uniquePermissions.size).toBe(permissions.length)
      }
    })
  })
})
