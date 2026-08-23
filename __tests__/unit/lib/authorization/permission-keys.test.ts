/**
 * permission-keys.test.ts - Phase 0: Authorization System Foundation
 *
 * Unit tests for permission helper functions.
 */

import { describe, expect, it } from 'vitest'
import {
  Permissions,
  getPermissionScope,
  getPermissionAction,
  getPermissionResource,
} from '@/lib/authorization/permission-keys'

describe('Permission Helper Functions', () => {
  describe('getPermissionScope', () => {
    it('extracts business scope correctly', () => {
      expect(getPermissionScope(Permissions.BUSINESS_VIEW_BILLING)).toBe('business')
      expect(getPermissionScope(Permissions.BUSINESS_MANAGE_BILLING)).toBe('business')
    })

    it('extracts branch scope correctly', () => {
      expect(getPermissionScope(Permissions.BRANCH_VIEW_PRODUCTS)).toBe('branch')
      expect(getPermissionScope(Permissions.BRANCH_MANAGE_EMPLOYEES)).toBe('branch')
    })

    it('extracts user scope correctly', () => {
      expect(getPermissionScope(Permissions.USER_VIEW_ACCOUNT)).toBe('user')
      expect(getPermissionScope(Permissions.USER_MANAGE_PREFERENCES)).toBe('user')
    })
  })

  describe('getPermissionAction', () => {
    it('extracts view action correctly', () => {
      expect(getPermissionAction(Permissions.BUSINESS_VIEW_BILLING)).toBe('view')
      expect(getPermissionAction(Permissions.BRANCH_VIEW_PRODUCTS)).toBe('view')
    })

    it('extracts manage action correctly', () => {
      expect(getPermissionAction(Permissions.BUSINESS_MANAGE_BILLING)).toBe('manage')
      expect(getPermissionAction(Permissions.BRANCH_MANAGE_EMPLOYEES)).toBe('manage')
    })

    it('extracts create action correctly', () => {
      expect(getPermissionAction(Permissions.BRANCH_CREATE_PRODUCT)).toBe('create')
      expect(getPermissionAction(Permissions.BUSINESS_CREATE_BRANCH)).toBe('create')
    })

    it('extracts edit action correctly', () => {
      expect(getPermissionAction(Permissions.BRANCH_EDIT_PRODUCT)).toBe('edit')
      expect(getPermissionAction(Permissions.BRANCH_EDIT_EMPLOYEE)).toBe('edit')
    })

    it('extracts delete action correctly', () => {
      expect(getPermissionAction(Permissions.BRANCH_DELETE_PRODUCT)).toBe('delete')
      expect(getPermissionAction(Permissions.BUSINESS_DELETE_BRANCH)).toBe('delete')
    })

    it('extracts export action correctly', () => {
      expect(getPermissionAction(Permissions.BUSINESS_EXPORT_DATA)).toBe('export')
      expect(getPermissionAction(Permissions.BRANCH_EXPORT_REPORTS)).toBe('export')
    })
  })

  describe('getPermissionResource', () => {
    it('extracts billing resource correctly', () => {
      expect(getPermissionResource(Permissions.BUSINESS_VIEW_BILLING)).toBe('billing')
      expect(getPermissionResource(Permissions.BUSINESS_MANAGE_BILLING)).toBe('billing')
    })

    it('extracts products resource correctly', () => {
      expect(getPermissionResource(Permissions.BRANCH_VIEW_PRODUCTS)).toBe('products')
      expect(getPermissionResource(Permissions.BRANCH_MANAGE_PRODUCTS)).toBe('products')
    })

    it('extracts employees resource correctly', () => {
      expect(getPermissionResource(Permissions.BRANCH_VIEW_EMPLOYEES)).toBe('employees')
      expect(getPermissionResource(Permissions.BRANCH_MANAGE_EMPLOYEES)).toBe('employees')
    })

    it('extracts account resource correctly', () => {
      expect(getPermissionResource(Permissions.USER_VIEW_ACCOUNT)).toBe('account')
      expect(getPermissionResource(Permissions.USER_MANAGE_ACCOUNT)).toBe('account')
    })
  })

  describe('Permission key format', () => {
    it('all permissions follow SCOPE:ACTION:RESOURCE format', () => {
      const allPermissions = Object.values(Permissions)
      
      for (const permission of allPermissions) {
        const parts = permission.split(':')
        expect(parts).toHaveLength(3)
        
        // Validate scope
        expect(['business', 'branch', 'user']).toContain(parts[0])
        
        // Validate action
        expect(['view', 'manage', 'create', 'edit', 'delete', 'export']).toContain(parts[1])
        
        // Validate resource exists
        expect(parts[2]).toBeTruthy()
        expect(parts[2].length).toBeGreaterThan(0)
      }
    })

    it('has no duplicate permission keys', () => {
      const allPermissions = Object.values(Permissions)
      const uniquePermissions = new Set(allPermissions)
      
      expect(uniquePermissions.size).toBe(allPermissions.length)
    })
  })
})
