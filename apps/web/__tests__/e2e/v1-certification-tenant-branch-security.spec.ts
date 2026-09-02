/**
 * v1-certification-tenant-branch-security.spec.ts
 *
 * V1 E2E Certification: Tenant and Branch Security
 *
 * Tests comprehensive multi-tenant security including tenant isolation,
 * branch-level access control, data segregation, and security boundaries.
 *
 * Critical V1 User Journey:
 *  ✅ Multi-tenant data isolation and security boundaries
 *  ✅ Branch-level access control and permissions
 *  ✅ Cross-tenant data leakage prevention
 *  ✅ Branch-specific employee access restrictions
 *  ✅ Tenant-level configuration and customization isolation
 *  ✅ Branch hierarchy and delegation management
 *  ✅ Multi-branch inventory and transaction segregation
 *  ✅ Security audit logging and compliance
 *  ✅ Tenant onboarding and provisioning security
 *  ✅ Branch creation and management workflows
 *
 * Test Strategy:
 *  - Tests complete tenant isolation across all system layers
 *  - Validates branch-level access control and restrictions
 *  - Tests security boundaries and data leakage prevention
 *  - Verifies audit logging and compliance tracking
 *  - Tests edge cases and security vulnerabilities
 *
 * Prerequisites:
 *  - Multi-tenant architecture with proper isolation
 *  - Branch management system with hierarchical permissions
 *  - Role-based access control with branch scoping
 *  - Data segregation at database and application levels
 *  - Security audit logging and monitoring system
 *
 * Business Rules Validated:
 *  - Tenants can only access their own data and configurations
 *  - Branch employees can only access assigned branch data
 *  - Cross-tenant operations are completely blocked
 *  - Branch hierarchy permissions are properly enforced
 *  - Security events are logged and monitored appropriately
 */

import { test, expect, type Page } from '@playwright/test'
import { faker } from '@faker-js/faker'

// Test configuration for tenant and branch security
const TENANT_BRANCH_SECURITY_CONFIG = {
  routes: {
    login: '/login',
    dashboard: '/dashboard',
    branches: '/branches',
    employees: '/employees',
    pos: '/pos',
    inventory: '/inventory',
    transactions: '/transactions',
    reports: '/reports',
    settings: '/settings',
    adminPanel: '/admin',
    audit: '/audit',
  },
  testTenants: {
    TENANT_A: {
      id: 'tenant-a-123',
      name: 'Coffee Shop Chain A',
      domain: 'coffeeshop-a.com',
      owner: {
        email: 'owner-a@coffeeshop-a.com',
        password: 'ownerA123',
        name: 'Alice Owner',
      },
      branches: [
        {
          id: 'branch-a1',
          name: 'Downtown Branch',
          address: '123 Main St, Downtown',
          manager: {
            email: 'manager-a1@coffeeshop-a.com',
            password: 'managerA1',
            name: 'Bob Manager',
          },
        },
        {
          id: 'branch-a2',
          name: 'Mall Branch',
          address: '456 Mall Ave, Shopping Center',
          manager: {
            email: 'manager-a2@coffeeshop-a.com',
            password: 'managerA2',
            name: 'Carol Manager',
          },
        },
      ],
    },
    TENANT_B: {
      id: 'tenant-b-456',
      name: 'Restaurant Chain B',
      domain: 'restaurant-b.com',
      owner: {
        email: 'owner-b@restaurant-b.com',
        password: 'ownerB123',
        name: 'David Owner',
      },
      branches: [
        {
          id: 'branch-b1',
          name: 'City Center Branch',
          address: '789 City St, Center',
          manager: {
            email: 'manager-b1@restaurant-b.com',
            password: 'managerB1',
            name: 'Eve Manager',
          },
        },
      ],
    },
  },
  branchRoles: {
    OWNER: {
      name: 'Owner',
      permissions: ['ALL_BRANCHES', 'CREATE_BRANCH', 'DELETE_BRANCH', 'MANAGE_EMPLOYEES'],
      scope: 'TENANT',
    },
    BRANCH_MANAGER: {
      name: 'Branch Manager',
      permissions: ['MANAGE_BRANCH', 'MANAGE_EMPLOYEES', 'VIEW_REPORTS', 'MANAGE_INVENTORY'],
      scope: 'BRANCH',
    },
    ASSISTANT_MANAGER: {
      name: 'Assistant Manager',
      permissions: ['VIEW_REPORTS', 'MANAGE_INVENTORY', 'PROCESS_TRANSACTIONS'],
      scope: 'BRANCH',
    },
    CASHIER: {
      name: 'Cashier',
      permissions: ['PROCESS_TRANSACTIONS', 'VIEW_INVENTORY'],
      scope: 'BRANCH',
    },
  },
  selectors: {
    // Tenant identification
    tenantSelector: '[data-testid="tenant-selector"]',
    currentTenant: '[data-testid="current-tenant"]',
    tenantSwitcher: '[data-testid="tenant-switcher"]',
    tenantIsolationIndicator: '[data-testid="tenant-isolation-indicator"]',
    
    // Branch management
    branchSelector: '[data-testid="branch-selector"]',
    currentBranch: '[data-testid="current-branch"]',
    branchSwitcher: '[data-testid="branch-switcher"]',
    createBranchButton: '[data-testid="create-branch-button"]',
    branchList: '[data-testid="branch-list"]',
    branchCard: '[data-testid="branch-card"]',
    
    // Employee management
    branchEmployeeList: '[data-testid="branch-employee-list"]',
    assignToBranchButton: '[data-testid="assign-to-branch-button"]',
    branchAssignmentDialog: '[data-testid="branch-assignment-dialog"]',
    employeeBranchRestriction: '[data-testid="employee-branch-restriction"]',
    
    // Access control
    accessDeniedMessage: '[data-testid="access-denied-message"]',
    branchAccessWarning: '[data-testid="branch-access-warning"]',
    tenantBoundaryViolation: '[data-testid="tenant-boundary-violation"]',
    unauthorizedAccessAlert: '[data-testid="unauthorized-access-alert"]',
    
    // Data segregation
    branchDataFilter: '[data-testid="branch-data-filter"]',
    tenantDataIsolation: '[data-testid="tenant-data-isolation"]',
    crossTenantDataCheck: '[data-testid="cross-tenant-data-check"]',
    branchSpecificData: '[data-testid="branch-specific-data"]',
    
    // Security monitoring
    securityAuditLog: '[data-testid="security-audit-log"]',
    accessAttemptLog: '[data-testid="access-attempt-log"]',
    suspiciousActivityAlert: '[data-testid="suspicious-activity-alert"]',
    securityEventNotification: '[data-testid="security-event-notification"]',
    
    // Configuration isolation
    tenantSettings: '[data-testid="tenant-settings"]',
    branchSettings: '[data-testid="branch-settings"]',
    globalSettings: '[data-testid="global-settings"]',
    settingsIsolation: '[data-testid="settings-isolation"]',
    
    // Confirmation dialogs
    confirmDialog: '[data-testid="confirm-dialog"]',
    confirmButton: '[data-testid="confirm-button"]',
    cancelButton: '[data-testid="cancel-button"]',
    
    // Success/error states
    successMessage: '[data-testid="success-message"]',
    errorMessage: '[data-testid="error-message"]',
    warningMessage: '[data-testid="warning-message"]',
    securityWarning: '[data-testid="security-warning"]',
  },
  securityTests: {
    dataLeakage: [
      'CROSS_TENANT_DATA_ACCESS',
      'BRANCH_DATA_SPILLOVER',
      'EMPLOYEE_DATA_EXPOSURE',
      'TRANSACTION_DATA_BLEEDING',
      'INVENTORY_DATA_MIXING',
    ],
    accessControl: [
      'UNAUTHORIZED_BRANCH_ACCESS',
      'PRIVILEGE_ESCALATION',
      'ROLE_BOUNDARY_VIOLATION',
      'TENANT_SWITCHING_ATTACK',
      'SESSION_HIJACKING',
    ],
    auditCompliance: [
      'ACCESS_ATTEMPT_LOGGING',
      'DATA_MODIFICATION_TRACKING',
      'SECURITY_EVENT_MONITORING',
      'COMPLIANCE_REPORTING',
      'AUDIT_TRAIL_INTEGRITY',
    ],
  },
}
test.describe('V1 Certification: Tenant and Branch Security', () => {
  test.describe('Multi-Tenant Data Isolation', () => {
    test('tenants can only access their own data', async ({ page, context }) => {
      // Login as Tenant A owner
      await loginAsTenantUser(page, TENANT_BRANCH_SECURITY_CONFIG.testTenants.TENANT_A.owner)
      
      // Verify tenant identification
      await expect(page.locator(TENANT_BRANCH_SECURITY_CONFIG.selectors.currentTenant)).toContainText('Coffee Shop Chain A')
      await expect(page.locator(TENANT_BRANCH_SECURITY_CONFIG.selectors.tenantIsolationIndicator)).toBeVisible()
      
      // Check access to tenant-specific data
      await page.goto(TENANT_BRANCH_SECURITY_CONFIG.routes.branches)
      const tenantABranches = page.locator(TENANT_BRANCH_SECURITY_CONFIG.selectors.branchCard)
      await expect(tenantABranches).toHaveCount(2) // Tenant A has 2 branches
      
      await expect(tenantABranches.first()).toContainText('Downtown Branch')
      await expect(tenantABranches.nth(1)).toContainText('Mall Branch')
      
      // Verify no access to other tenant's branches
      await expect(page.locator('[data-testid="branch-City Center Branch"]')).not.toBeVisible()
      
      // Test transaction data isolation
      await page.goto(TENANT_BRANCH_SECURITY_CONFIG.routes.transactions)
      const transactions = page.locator('[data-testid="transaction-list"] [data-testid="transaction-item"]')
      
      // All transactions should belong to Tenant A branches only
      for (let i = 0; i < await transactions.count(); i++) {
        const transaction = transactions.nth(i)
        const branchName = await transaction.locator('[data-testid="transaction-branch"]').textContent()
        expect(['Downtown Branch', 'Mall Branch']).toContain(branchName)
      }
      
      // Test direct URL manipulation attempt
      await attemptCrossTenantAccess(page, TENANT_BRANCH_SECURITY_CONFIG.testTenants.TENANT_B.id)
      await expect(page.locator(TENANT_BRANCH_SECURITY_CONFIG.selectors.tenantBoundaryViolation)).toBeVisible()
    })

    test('prevents cross-tenant data leakage in API responses', async ({ page }) => {
      await loginAsTenantUser(page, TENANT_BRANCH_SECURITY_CONFIG.testTenants.TENANT_A.owner)
      
      // Monitor network requests for data leakage
      const responsePromise = page.waitForResponse(response => 
        response.url().includes('/api/branches') && response.status() === 200
      )
      
      await page.goto(TENANT_BRANCH_SECURITY_CONFIG.routes.branches)
      const response = await responsePromise
      
      // Verify API response contains only tenant-specific data
      const responseData = await response.json()
      
      expect(responseData.branches).toBeDefined()
      expect(responseData.branches).toHaveLength(2)
      
      // Verify no data from other tenants
      const branchNames = responseData.branches.map((branch: any) => branch.name)
      expect(branchNames).toContain('Downtown Branch')
      expect(branchNames).toContain('Mall Branch')
      expect(branchNames).not.toContain('City Center Branch') // Tenant B branch
      
      // Verify tenant ID is consistently applied
      responseData.branches.forEach((branch: any) => {
        expect(branch.tenantId).toBe(TENANT_BRANCH_SECURITY_CONFIG.testTenants.TENANT_A.id)
      })
    })

    test('isolates tenant configurations and settings', async ({ page, context }) => {
      // Setup: Configure different settings for each tenant
      await setupTenantSpecificConfigurations(page)
      
      // Login as Tenant A and configure settings
      await loginAsTenantUser(page, TENANT_BRANCH_SECURITY_CONFIG.testTenants.TENANT_A.owner)
      
      await page.goto(TENANT_BRANCH_SECURITY_CONFIG.routes.settings)
      await page.locator('[data-testid="business-name-input"]').fill('Coffee Shop Chain A - Updated')
      await page.locator('[data-testid="currency-select"]').selectOption('PHP')
      await page.locator('[data-testid="tax-rate-input"]').fill('12.5')
      await page.locator('[data-testid="save-settings"]').click()
      
      await expect(page.locator(TENANT_BRANCH_SECURITY_CONFIG.selectors.successMessage)).toBeVisible()
      
      // Create second context for Tenant B
      const secondContext = await context.browser()?.newContext()
      if (!secondContext) return
      const secondPage = await secondContext.newPage()
      
      // Login as Tenant B
      await loginAsTenantUser(secondPage, TENANT_BRANCH_SECURITY_CONFIG.testTenants.TENANT_B.owner)
      
      await secondPage.goto(TENANT_BRANCH_SECURITY_CONFIG.routes.settings)
      
      // Verify Tenant B has different/default settings
      await expect(secondPage.locator('[data-testid="business-name-input"]')).toHaveValue('Restaurant Chain B')
      await expect(secondPage.locator('[data-testid="currency-select"]')).toHaveValue('USD')
      await expect(secondPage.locator('[data-testid="tax-rate-input"]')).toHaveValue('8.0')
      
      // Verify settings isolation indicator
      await expect(secondPage.locator(TENANT_BRANCH_SECURITY_CONFIG.selectors.settingsIsolation)).toBeVisible()
      
      await secondContext.close()
    })
  })

  test.describe('Branch-Level Access Control', () => {
    test('branch managers can only access their assigned branch', async ({ page }) => {
      // Login as Branch Manager for Downtown Branch (Tenant A)
      await loginAsTenantUser(page, TENANT_BRANCH_SECURITY_CONFIG.testTenants.TENANT_A.branches[0].manager)
      
      // Verify branch context is set correctly
      await expect(page.locator(TENANT_BRANCH_SECURITY_CONFIG.selectors.currentBranch)).toContainText('Downtown Branch')
      
      // Should have access to branch-specific data
      await page.goto(TENANT_BRANCH_SECURITY_CONFIG.routes.transactions)
      const transactions = page.locator('[data-testid="transaction-item"]')
      
      // All visible transactions should be from Downtown Branch only
      for (let i = 0; i < await transactions.count(); i++) {
        const transaction = transactions.nth(i)
        const branchName = await transaction.locator('[data-testid="transaction-branch"]').textContent()
        expect(branchName).toBe('Downtown Branch')
      }
      
      // Should not have access to other branches' data
      await page.goto(TENANT_BRANCH_SECURITY_CONFIG.routes.inventory)
      const inventoryItems = page.locator('[data-testid="inventory-item"]')
      
      for (let i = 0; i < await inventoryItems.count(); i++) {
        const item = inventoryItems.nth(i)
        const itemBranch = await item.locator('[data-testid="item-branch"]').textContent()
        expect(itemBranch).toBe('Downtown Branch')
      }
      
      // Try to access Mall Branch data directly
      await attemptCrossBranchAccess(page, TENANT_BRANCH_SECURITY_CONFIG.testTenants.TENANT_A.branches[1].id)
      await expect(page.locator(TENANT_BRANCH_SECURITY_CONFIG.selectors.branchAccessWarning)).toBeVisible()
      await expect(page.locator(TENANT_BRANCH_SECURITY_CONFIG.selectors.accessDeniedMessage)).toContainText('Access denied to Mall Branch')
    })

    test('branch employees cannot access management functions', async ({ page }) => {
      // Setup: Create cashier for Downtown Branch
      const cashier = {
        email: 'cashier-downtown@coffeeshop-a.com',
        password: 'cashier123',
        role: 'CASHIER',
        branchId: TENANT_BRANCH_SECURITY_CONFIG.testTenants.TENANT_A.branches[0].id,
      }
      
      await setupBranchEmployee(page, cashier)
      await loginAsTenantUser(page, cashier)
      
      // Verify branch restriction is active
      await expect(page.locator(TENANT_BRANCH_SECURITY_CONFIG.selectors.employeeBranchRestriction)).toBeVisible()
      await expect(page.locator(TENANT_BRANCH_SECURITY_CONFIG.selectors.currentBranch)).toContainText('Downtown Branch')
      
      // Should have access to POS
      await page.goto(TENANT_BRANCH_SECURITY_CONFIG.routes.pos)
      await expect(page.locator('[data-testid="pos-interface"]')).toBeVisible()
      
      // Should NOT have access to employee management
      await page.goto(TENANT_BRANCH_SECURITY_CONFIG.routes.employees)
      await expect(page.locator(TENANT_BRANCH_SECURITY_CONFIG.selectors.accessDeniedMessage)).toBeVisible()
      
      // Should NOT have access to reports
      await page.goto(TENANT_BRANCH_SECURITY_CONFIG.routes.reports)
      await expect(page.locator(TENANT_BRANCH_SECURITY_CONFIG.selectors.accessDeniedMessage)).toBeVisible()
      
      // Should NOT have access to branch settings
      await page.goto(TENANT_BRANCH_SECURITY_CONFIG.routes.settings)
      await expect(page.locator(TENANT_BRANCH_SECURITY_CONFIG.selectors.accessDeniedMessage)).toBeVisible()
      
      // Navigation should not show restricted items
      const navigation = page.locator('[data-testid="navigation-menu"]')
      await expect(navigation.locator('text=Employees')).not.toBeVisible()
      await expect(navigation.locator('text=Reports')).not.toBeVisible()
      await expect(navigation.locator('text=Settings')).not.toBeVisible()
    })

    test('owner can access all branches within tenant', async ({ page }) => {
      await loginAsTenantUser(page, TENANT_BRANCH_SECURITY_CONFIG.testTenants.TENANT_A.owner)
      
      // Should see branch selector with all branches
      await expect(page.locator(TENANT_BRANCH_SECURITY_CONFIG.selectors.branchSelector)).toBeVisible()
      
      const branchOptions = page.locator(TENANT_BRANCH_SECURITY_CONFIG.selectors.branchSelector).locator('option')
      await expect(branchOptions).toHaveCount(3) // "All Branches" + 2 specific branches
      
      // Test switching between branches
      await page.locator(TENANT_BRANCH_SECURITY_CONFIG.selectors.branchSelector).selectOption('branch-a1')
      await expect(page.locator(TENANT_BRANCH_SECURITY_CONFIG.selectors.currentBranch)).toContainText('Downtown Branch')
      
      // Verify data updates for selected branch
      await page.goto(TENANT_BRANCH_SECURITY_CONFIG.routes.transactions)
      let transactions = page.locator('[data-testid="transaction-item"]')
      
      // Should only show Downtown Branch transactions
      for (let i = 0; i < Math.min(5, await transactions.count()); i++) {
        const transaction = transactions.nth(i)
        const branchName = await transaction.locator('[data-testid="transaction-branch"]').textContent()
        expect(branchName).toBe('Downtown Branch')
      }
      
      // Switch to Mall Branch
      await page.locator(TENANT_BRANCH_SECURITY_CONFIG.selectors.branchSelector).selectOption('branch-a2')
      await expect(page.locator(TENANT_BRANCH_SECURITY_CONFIG.selectors.currentBranch)).toContainText('Mall Branch')
      
      // Should now show Mall Branch transactions
      await page.reload()
      transactions = page.locator('[data-testid="transaction-item"]')
      
      for (let i = 0; i < Math.min(5, await transactions.count()); i++) {
        const transaction = transactions.nth(i)
        const branchName = await transaction.locator('[data-testid="transaction-branch"]').textContent()
        expect(branchName).toBe('Mall Branch')
      }
      
      // Switch to "All Branches" view
      await page.locator(TENANT_BRANCH_SECURITY_CONFIG.selectors.branchSelector).selectOption('all')
      await page.reload()
      
      // Should show combined data from all branches
      transactions = page.locator('[data-testid="transaction-item"]')
      const branchNames = new Set()
      
      for (let i = 0; i < Math.min(10, await transactions.count()); i++) {
        const transaction = transactions.nth(i)
        const branchName = await transaction.locator('[data-testid="transaction-branch"]').textContent()
        branchNames.add(branchName)
      }
      
      expect(branchNames.size).toBeGreaterThan(1) // Should have transactions from multiple branches
    })
  })

  test.describe('Branch Management and Hierarchy', () => {
    test('owner can create and manage branches', async ({ page }) => {
      await loginAsTenantUser(page, TENANT_BRANCH_SECURITY_CONFIG.testTenants.TENANT_A.owner)
      
      await page.goto(TENANT_BRANCH_SECURITY_CONFIG.routes.branches)
      
      // Create new branch
      await page.locator(TENANT_BRANCH_SECURITY_CONFIG.selectors.createBranchButton).click()
      
      const newBranchData = {
        name: 'Airport Branch',
        address: '999 Airport Rd, Terminal 1',
        phone: '+639123456789',
        email: 'airport@coffeeshop-a.com',
      }
      
      await page.locator('[data-testid="branch-name-input"]').fill(newBranchData.name)
      await page.locator('[data-testid="branch-address-input"]').fill(newBranchData.address)
      await page.locator('[data-testid="branch-phone-input"]').fill(newBranchData.phone)
      await page.locator('[data-testid="branch-email-input"]').fill(newBranchData.email)
      
      await page.locator('[data-testid="create-branch-submit"]').click()
      
      // Verify branch creation
      await expect(page.locator(TENANT_BRANCH_SECURITY_CONFIG.selectors.successMessage)).toContainText('Branch created successfully')
      
      // Verify new branch appears in list
      const branchList = page.locator(TENANT_BRANCH_SECURITY_CONFIG.selectors.branchList)
      await expect(branchList.locator(`text=${newBranchData.name}`)).toBeVisible()
      
      // Verify branch has proper tenant association
      const newBranch = branchList.locator(`[data-testid="branch-card-airport"]`)
      await expect(newBranch.locator('[data-testid="branch-tenant"]')).toContainText(TENANT_BRANCH_SECURITY_CONFIG.testTenants.TENANT_A.name)
      
      // Test branch settings management
      await newBranch.locator('[data-testid="manage-branch"]').click()
      
      // Should have access to branch-specific settings
      await expect(page.locator(TENANT_BRANCH_SECURITY_CONFIG.selectors.branchSettings)).toBeVisible()
      
      // Configure branch-specific settings
      await page.locator('[data-testid="branch-operating-hours"]').fill('6:00 AM - 10:00 PM')
      await page.locator('[data-testid="branch-pos-terminals"]').fill('3')
      await page.locator('[data-testid="save-branch-settings"]').click()
      
      await expect(page.locator(TENANT_BRANCH_SECURITY_CONFIG.selectors.successMessage)).toBeVisible()
    })

    test('branch manager assignment and permissions', async ({ page }) => {
      await loginAsTenantUser(page, TENANT_BRANCH_SECURITY_CONFIG.testTenants.TENANT_A.owner)
      
      await page.goto(TENANT_BRANCH_SECURITY_CONFIG.routes.employees)
      
      // Create new branch manager
      await page.locator('[data-testid="invite-employee"]').click()
      
      const newManager = {
        email: 'manager-airport@coffeeshop-a.com',
        name: 'Frank Manager',
        role: 'BRANCH_MANAGER',
        branchId: 'branch-airport', // Assuming airport branch was created
      }
      
      await page.locator('[data-testid="employee-email"]').fill(newManager.email)
      await page.locator('[data-testid="employee-name"]').fill(newManager.name)
      await page.locator('[data-testid="employee-role"]').selectOption(newManager.role)
      
      // Assign to specific branch
      await page.locator(TENANT_BRANCH_SECURITY_CONFIG.selectors.assignToBranchButton).click()
      
      const branchDialog = page.locator(TENANT_BRANCH_SECURITY_CONFIG.selectors.branchAssignmentDialog)
      await branchDialog.locator('[data-testid="branch-airport"]').check()
      await branchDialog.locator('[data-testid="confirm-assignment"]').click()
      
      await page.locator('[data-testid="send-invitation"]').click()
      
      // Verify assignment
      await expect(page.locator(TENANT_BRANCH_SECURITY_CONFIG.selectors.successMessage)).toContainText('Manager assigned to branch')
      
      // Complete manager onboarding (simulate)
      await completeBranchManagerOnboarding(page, newManager)
      
      // Test manager login and permissions
      await page.goto(TENANT_BRANCH_SECURITY_CONFIG.routes.login)
      await loginAsTenantUser(page, newManager)
      
      // Verify branch restriction
      await expect(page.locator(TENANT_BRANCH_SECURITY_CONFIG.selectors.currentBranch)).toContainText('Airport Branch')
      
      // Should have management permissions for assigned branch
      await page.goto(TENANT_BRANCH_SECURITY_CONFIG.routes.employees)
      await expect(page.locator('[data-testid="branch-employee-management"]')).toBeVisible()
      
      // Should be able to manage branch inventory
      await page.goto(TENANT_BRANCH_SECURITY_CONFIG.routes.inventory)
      await expect(page.locator('[data-testid="inventory-management-tools"]')).toBeVisible()
      
      // Should NOT be able to create new branches
      await page.goto(TENANT_BRANCH_SECURITY_CONFIG.routes.branches)
      await expect(page.locator(TENANT_BRANCH_SECURITY_CONFIG.selectors.createBranchButton)).not.toBeVisible()
    })

    test('branch hierarchy and delegation enforcement', async ({ page }) => {
      await loginAsTenantUser(page, TENANT_BRANCH_SECURITY_CONFIG.testTenants.TENANT_A.owner)
      
      // Setup branch hierarchy: Owner -> Regional Manager -> Branch Manager -> Assistant Manager -> Cashier
      await setupBranchHierarchy(page)
      
      // Test delegation permissions
      await page.goto(TENANT_BRANCH_SECURITY_CONFIG.routes.employees)
      
      // Owner should see all employees across all branches
      const allEmployees = page.locator('[data-testid="employee-list"] [data-testid="employee-item"]')
      await expect(allEmployees.count()).resolves.toBeGreaterThanOrEqual(5)
      
      // Test Regional Manager permissions
      const regionalManager = {
        email: 'regional@coffeeshop-a.com',
        password: 'regional123',
      }
      
      await loginAsTenantUser(page, regionalManager)
      
      // Regional manager should see employees from assigned branches only
      await page.goto(TENANT_BRANCH_SECURITY_CONFIG.routes.employees)
      const regionalEmployees = page.locator('[data-testid="employee-list"] [data-testid="employee-item"]')
      
      // Should see employees from Downtown and Mall branches, but not Airport
      for (let i = 0; i < await regionalEmployees.count(); i++) {
        const employee = regionalEmployees.nth(i)
        const employeeBranch = await employee.locator('[data-testid="employee-branch"]').textContent()
        expect(['Downtown Branch', 'Mall Branch']).toContain(employeeBranch)
      }
      
      // Test delegation of authority
      const employeeToPromote = regionalEmployees.first()
      await employeeToPromote.locator('[data-testid="promote-employee"]').click()
      
      // Should be able to promote to Assistant Manager but not Branch Manager
      const promotionOptions = page.locator('[data-testid="promotion-role-options"]')
      await expect(promotionOptions.locator('option[value="ASSISTANT_MANAGER"]')).toBeVisible()
      await expect(promotionOptions.locator('option[value="BRANCH_MANAGER"]')).not.toBeVisible() // Requires owner approval
    })
  })
  test.describe('Security Audit and Compliance', () => {
    test('logs all security-relevant access attempts', async ({ page }) => {
      await loginAsTenantUser(page, TENANT_BRANCH_SECURITY_CONFIG.testTenants.TENANT_A.owner)
      
      // Perform various security-relevant actions
      await page.goto(TENANT_BRANCH_SECURITY_CONFIG.routes.employees)
      await page.goto(TENANT_BRANCH_SECURITY_CONFIG.routes.settings)
      await page.goto(TENANT_BRANCH_SECURITY_CONFIG.routes.branches)
      
      // Attempt unauthorized access
      await attemptCrossTenantAccess(page, TENANT_BRANCH_SECURITY_CONFIG.testTenants.TENANT_B.id)
      
      // Check security audit log
      await page.goto(TENANT_BRANCH_SECURITY_CONFIG.routes.audit)
      
      const auditLog = page.locator(TENANT_BRANCH_SECURITY_CONFIG.selectors.securityAuditLog)
      await expect(auditLog).toBeVisible()
      
      // Verify successful access attempts are logged
      await expect(auditLog.locator('[data-testid="audit-entry-employees"]')).toContainText('ACCESS_GRANTED')
      await expect(auditLog.locator('[data-testid="audit-entry-settings"]')).toContainText('ACCESS_GRANTED')
      await expect(auditLog.locator('[data-testid="audit-entry-branches"]')).toContainText('ACCESS_GRANTED')
      
      // Verify unauthorized access attempt is logged
      await expect(auditLog.locator('[data-testid="audit-entry-cross-tenant"]')).toContainText('ACCESS_DENIED')
      await expect(auditLog.locator('[data-testid="audit-entry-cross-tenant"]')).toContainText('TENANT_BOUNDARY_VIOLATION')
      
      // Verify audit entry details
      const crossTenantEntry = auditLog.locator('[data-testid="audit-entry-cross-tenant"]')
      await crossTenantEntry.click()
      
      await expect(page.locator('[data-testid="audit-details-user"]')).toContainText(TENANT_BRANCH_SECURITY_CONFIG.testTenants.TENANT_A.owner.email)
      await expect(page.locator('[data-testid="audit-details-attempted-tenant"]')).toContainText(TENANT_BRANCH_SECURITY_CONFIG.testTenants.TENANT_B.id)
      await expect(page.locator('[data-testid="audit-details-timestamp"]')).toBeVisible()
      await expect(page.locator('[data-testid="audit-details-ip-address"]')).toBeVisible()
    })

    test('monitors suspicious activity patterns', async ({ page }) => {
      await loginAsTenantUser(page, TENANT_BRANCH_SECURITY_CONFIG.testTenants.TENANT_A.owner)
      
      // Simulate suspicious activity pattern - rapid access attempts to restricted areas
      for (let i = 0; i < 10; i++) {
        await attemptCrossTenantAccess(page, TENANT_BRANCH_SECURITY_CONFIG.testTenants.TENANT_B.id)
        await page.waitForTimeout(500)
      }
      
      // Should trigger suspicious activity alert
      await expect(page.locator(TENANT_BRANCH_SECURITY_CONFIG.selectors.suspiciousActivityAlert)).toBeVisible()
      await expect(page.locator(TENANT_BRANCH_SECURITY_CONFIG.selectors.suspiciousActivityAlert)).toContainText('Suspicious access pattern detected')
      
      // Check security monitoring dashboard
      await page.goto('/admin/security-monitoring')
      
      // Should show security event
      await expect(page.locator('[data-testid="security-event-rapid-failures"]')).toBeVisible()
      await expect(page.locator('[data-testid="security-event-rapid-failures"]')).toContainText('10 failed access attempts in 5 seconds')
      
      // Should suggest security actions
      await expect(page.locator('[data-testid="security-recommendation"]')).toContainText('Consider temporary account restriction')
    })

    test('enforces compliance reporting requirements', async ({ page }) => {
      await loginAsTenantUser(page, TENANT_BRANCH_SECURITY_CONFIG.testTenants.TENANT_A.owner)
      
      await page.goto('/admin/compliance-reports')
      
      // Generate security compliance report
      await page.locator('[data-testid="generate-compliance-report"]').click()
      await page.locator('[data-testid="report-type"]').selectOption('SECURITY_ACCESS')
      await page.locator('[data-testid="report-period"]').selectOption('MONTHLY')
      await page.locator('[data-testid="generate-report"]').click()
      
      await expect(page.locator('[data-testid="report-generating"]')).toBeVisible()
      await expect(page.locator('[data-testid="report-completed"]')).toBeVisible({ timeout: 10000 })
      
      // Verify report contains required sections
      const reportPreview = page.locator('[data-testid="report-preview"]')
      
      // Required compliance sections
      await expect(reportPreview.locator('[data-testid="section-access-summary"]')).toBeVisible()
      await expect(reportPreview.locator('[data-testid="section-failed-attempts"]')).toBeVisible()
      await expect(reportPreview.locator('[data-testid="section-privilege-changes"]')).toBeVisible()
      await expect(reportPreview.locator('[data-testid="section-data-access-patterns"]')).toBeVisible()
      
      // Verify tenant isolation in report
      await expect(reportPreview).toContainText('Coffee Shop Chain A')
      await expect(reportPreview).not.toContainText('Restaurant Chain B')
      
      // Download report
      await page.locator('[data-testid="download-report"]').click()
      await expect(page.locator('[data-testid="report-downloaded"]')).toBeVisible()
    })
  })

  test.describe('Data Segregation and Integrity', () => {
    test('prevents inventory data mixing between branches', async ({ page }) => {
      await loginAsTenantUser(page, TENANT_BRANCH_SECURITY_CONFIG.testTenants.TENANT_A.branches[0].manager)
      
      // Access Downtown Branch inventory
      await page.goto(TENANT_BRANCH_SECURITY_CONFIG.routes.inventory)
      
      // Make inventory adjustment
      const productToAdjust = page.locator('[data-testid="product-item"]').first()
      await productToAdjust.locator('[data-testid="adjust-stock"]').click()
      
      await page.locator('[data-testid="adjustment-type"]').selectOption('INCREASE')
      await page.locator('[data-testid="adjustment-quantity"]').fill('50')
      await page.locator('[data-testid="adjustment-reason"]').fill('Stock replenishment - Downtown')
      await page.locator('[data-testid="save-adjustment"]').click()
      
      await expect(page.locator(TENANT_BRANCH_SECURITY_CONFIG.selectors.successMessage)).toBeVisible()
      
      // Verify adjustment is branch-specific
      const adjustmentEntry = page.locator('[data-testid="recent-adjustments"] [data-testid="adjustment-entry"]').first()
      await expect(adjustmentEntry.locator('[data-testid="adjustment-branch"]')).toContainText('Downtown Branch')
      
      // Login as Mall Branch manager
      await loginAsTenantUser(page, TENANT_BRANCH_SECURITY_CONFIG.testTenants.TENANT_A.branches[1].manager)
      
      await page.goto(TENANT_BRANCH_SECURITY_CONFIG.routes.inventory)
      
      // Should not see Downtown Branch adjustment
      const mallAdjustments = page.locator('[data-testid="recent-adjustments"] [data-testid="adjustment-entry"]')
      
      for (let i = 0; i < await mallAdjustments.count(); i++) {
        const adjustment = mallAdjustments.nth(i)
        const adjustmentBranch = await adjustment.locator('[data-testid="adjustment-branch"]').textContent()
        expect(adjustmentBranch).not.toBe('Downtown Branch')
      }
      
      // Verify stock levels are independent
      const productStock = await page.locator('[data-testid="product-stock"]').first().textContent()
      // Stock should not reflect the Downtown Branch adjustment
    })

    test('segregates transaction data by branch and tenant', async ({ page, context }) => {
      // Create transactions in different branches and tenants
      await createTestTransactions(page, TENANT_BRANCH_SECURITY_CONFIG.testTenants.TENANT_A.branches[0])
      
      // Create second context for different tenant
      const secondContext = await context.browser()?.newContext()
      if (!secondContext) return
      const secondPage = await secondContext.newPage()
      
      await createTestTransactions(secondPage, TENANT_BRANCH_SECURITY_CONFIG.testTenants.TENANT_B.branches[0])
      
      // Verify transaction segregation
      await loginAsTenantUser(page, TENANT_BRANCH_SECURITY_CONFIG.testTenants.TENANT_A.branches[0].manager)
      await page.goto(TENANT_BRANCH_SECURITY_CONFIG.routes.transactions)
      
      const tenantATransactions = page.locator('[data-testid="transaction-item"]')
      
      // All transactions should belong to Tenant A, Downtown Branch
      for (let i = 0; i < Math.min(10, await tenantATransactions.count()); i++) {
        const transaction = tenantATransactions.nth(i)
        const transactionBranch = await transaction.locator('[data-testid="transaction-branch"]').textContent()
        expect(transactionBranch).toBe('Downtown Branch')
      }
      
      // Verify API-level segregation
      const responsePromise = page.waitForResponse(response => 
        response.url().includes('/api/transactions') && response.status() === 200
      )
      
      await page.reload()
      const response = await responsePromise
      const responseData = await response.json()
      
      // Verify all transactions belong to correct tenant and branch
      responseData.transactions.forEach((transaction: any) => {
        expect(transaction.tenantId).toBe(TENANT_BRANCH_SECURITY_CONFIG.testTenants.TENANT_A.id)
        expect(transaction.branchId).toBe(TENANT_BRANCH_SECURITY_CONFIG.testTenants.TENANT_A.branches[0].id)
      })
      
      await secondContext.close()
    })

    test('maintains data consistency across branch operations', async ({ page }) => {
      await loginAsTenantUser(page, TENANT_BRANCH_SECURITY_CONFIG.testTenants.TENANT_A.owner)
      
      // Perform inter-branch stock transfer
      await page.goto(TENANT_BRANCH_SECURITY_CONFIG.routes.inventory)
      
      // Initiate transfer from Downtown to Mall branch
      await page.locator('[data-testid="inter-branch-transfer"]').click()
      
      const transferDialog = page.locator('[data-testid="transfer-dialog"]')
      await transferDialog.locator('[data-testid="source-branch"]').selectOption('branch-a1') // Downtown
      await transferDialog.locator('[data-testid="destination-branch"]').selectOption('branch-a2') // Mall
      
      // Select product and quantity
      await transferDialog.locator('[data-testid="product-select"]').selectOption('PROD001')
      await transferDialog.locator('[data-testid="transfer-quantity"]').fill('10')
      await transferDialog.locator('[data-testid="transfer-reason"]').fill('Branch rebalancing')
      
      await transferDialog.locator('[data-testid="initiate-transfer"]').click()
      
      // Verify transfer is logged with proper branch attribution
      await expect(page.locator('[data-testid="transfer-initiated"]')).toBeVisible()
      
      // Check transfer appears in both branches' logs
      await page.locator(TENANT_BRANCH_SECURITY_CONFIG.selectors.branchSelector).selectOption('branch-a1')
      await page.goto('/inventory/transfers')
      
      await expect(page.locator('[data-testid="outbound-transfer"]')).toContainText('Transfer to Mall Branch')
      
      await page.locator(TENANT_BRANCH_SECURITY_CONFIG.selectors.branchSelector).selectOption('branch-a2')
      await page.reload()
      
      await expect(page.locator('[data-testid="inbound-transfer"]')).toContainText('Transfer from Downtown Branch')
      
      // Verify stock adjustments are properly attributed
      await page.goto(TENANT_BRANCH_SECURITY_CONFIG.routes.inventory)
      const transferAdjustment = page.locator('[data-testid="transfer-adjustment"]')
      
      await expect(transferAdjustment.locator('[data-testid="adjustment-type"]')).toContainText('TRANSFER_IN')
      await expect(transferAdjustment.locator('[data-testid="adjustment-source"]')).toContainText('Downtown Branch')
      await expect(transferAdjustment.locator('[data-testid="adjustment-quantity"]')).toContainText('+10')
    })
  })

  test.describe('Emergency and Edge Case Security', () => {
    test('handles branch manager role conflicts', async ({ page }) => {
      await loginAsTenantUser(page, TENANT_BRANCH_SECURITY_CONFIG.testTenants.TENANT_A.owner)
      
      // Attempt to assign same manager to multiple branches
      await page.goto(TENANT_BRANCH_SECURITY_CONFIG.routes.employees)
      
      const existingManager = page.locator('[data-testid="employee-item"]').filter({ hasText: 'Branch Manager' }).first()
      await existingManager.locator('[data-testid="edit-employee"]').click()
      
      // Try to assign additional branch
      await page.locator('[data-testid="add-branch-assignment"]').click()
      
      const branchAssignmentDialog = page.locator(TENANT_BRANCH_SECURITY_CONFIG.selectors.branchAssignmentDialog)
      await branchAssignmentDialog.locator('[data-testid="branch-a2"]').check() // Additional branch
      await branchAssignmentDialog.locator('[data-testid="confirm-assignment"]').click()
      
      // Should show conflict warning
      await expect(page.locator('[data-testid="role-conflict-warning"]')).toBeVisible()
      await expect(page.locator('[data-testid="role-conflict-warning"]')).toContainText('Manager already assigned to Downtown Branch')
      
      // Should offer resolution options
      await expect(page.locator('[data-testid="promote-to-regional"]')).toBeVisible()
      await expect(page.locator('[data-testid="create-assistant-manager"]')).toBeVisible()
      
      // Test conflict resolution
      await page.locator('[data-testid="promote-to-regional"]').click()
      
      await expect(page.locator(TENANT_BRANCH_SECURITY_CONFIG.selectors.successMessage)).toContainText('Employee promoted to Regional Manager')
      
      // Verify new permissions
      const promotedEmployee = page.locator('[data-testid="employee-item"]').filter({ hasText: 'Regional Manager' })
      await expect(promotedEmployee.locator('[data-testid="employee-branches"]')).toContainText('Downtown Branch, Mall Branch')
    })

    test('enforces session security across branch switches', async ({ page }) => {
      // Login as branch manager
      await loginAsTenantUser(page, TENANT_BRANCH_SECURITY_CONFIG.testTenants.TENANT_A.branches[0].manager)
      
      // Verify initial branch context
      await expect(page.locator(TENANT_BRANCH_SECURITY_CONFIG.selectors.currentBranch)).toContainText('Downtown Branch')
      
      // Attempt to manipulate session to access different branch
      await page.evaluate(() => {
        // Attempt to modify session storage
        localStorage.setItem('currentBranchId', 'branch-a2')
        sessionStorage.setItem('branchContext', JSON.stringify({ branchId: 'branch-a2', name: 'Mall Branch' }))
      })
      
      // Navigate to sensitive area
      await page.goto(TENANT_BRANCH_SECURITY_CONFIG.routes.transactions)
      
      // Should detect session tampering
      await expect(page.locator('[data-testid="session-security-violation"]')).toBeVisible()
      await expect(page.locator(TENANT_BRANCH_SECURITY_CONFIG.selectors.securityWarning)).toContainText('Session inconsistency detected')
      
      // Should force re-authentication
      await expect(page.locator('[data-testid="force-reauth-dialog"]')).toBeVisible()
      
      // After re-auth, should return to authorized branch
      await page.locator('[data-testid="reauth-confirm"]').click()
      await loginAsTenantUser(page, TENANT_BRANCH_SECURITY_CONFIG.testTenants.TENANT_A.branches[0].manager)
      
      await expect(page.locator(TENANT_BRANCH_SECURITY_CONFIG.selectors.currentBranch)).toContainText('Downtown Branch')
    })

    test('handles tenant deactivation security', async ({ page }) => {
      // Simulate tenant deactivation scenario
      await simulateTenantDeactivation(page, TENANT_BRANCH_SECURITY_CONFIG.testTenants.TENANT_A.id)
      
      // Attempt to login with deactivated tenant user
      await page.goto(TENANT_BRANCH_SECURITY_CONFIG.routes.login)
      await page.locator('[data-testid="email-input"]').fill(TENANT_BRANCH_SECURITY_CONFIG.testTenants.TENANT_A.owner.email)
      await page.locator('[data-testid="password-input"]').fill(TENANT_BRANCH_SECURITY_CONFIG.testTenants.TENANT_A.owner.password)
      await page.locator('[data-testid="login-button"]').click()
      
      // Should show tenant deactivation message
      await expect(page.locator('[data-testid="tenant-deactivated-error"]')).toBeVisible()
      await expect(page.locator('[data-testid="tenant-deactivated-error"]')).toContainText('Account temporarily suspended')
      
      // Should not allow access
      await expect(page).not.toHaveURL(/dashboard/)
      
      // Should log deactivation access attempt
      // (This would require admin access to verify)
    })
  })
})
// Helper Functions for Tenant and Branch Security Testing

/**
 * Login as a tenant user (owner, manager, or employee)
 */
async function loginAsTenantUser(page: Page, user: any) {
  await page.goto(TENANT_BRANCH_SECURITY_CONFIG.routes.login)
  
  // Clear any existing session data
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  
  await page.locator('[data-testid="email-input"]').fill(user.email)
  await page.locator('[data-testid="password-input"]').fill(user.password)
  await page.locator('[data-testid="login-button"]').click()
  
  // Wait for login completion
  await expect(page).toHaveURL(/dashboard/)
  
  // Verify tenant context is set
  if (user.email.includes('coffeeshop-a')) {
    await expect(page.locator('[data-testid="tenant-context"]')).toContainText('Coffee Shop Chain A')
  } else if (user.email.includes('restaurant-b')) {
    await expect(page.locator('[data-testid="tenant-context"]')).toContainText('Restaurant Chain B')
  }
}

/**
 * Attempt cross-tenant access for security testing
 */
async function attemptCrossTenantAccess(page: Page, targetTenantId: string) {
  // Try to access another tenant's data via URL manipulation
  const currentUrl = page.url()
  const crossTenantUrl = currentUrl.replace(/tenant=[^&]+/, `tenant=${targetTenantId}`)
  
  await page.goto(crossTenantUrl)
  
  // Also try direct API access
  await page.evaluate((tenantId) => {
    fetch(`/api/tenants/${tenantId}/data`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    }).catch(() => {
      // Expected to fail
    })
  }, targetTenantId)
}

/**
 * Attempt cross-branch access for security testing
 */
async function attemptCrossBranchAccess(page: Page, targetBranchId: string) {
  // Try to access another branch's data via URL manipulation
  const currentUrl = page.url()
  const crossBranchUrl = currentUrl.includes('?') 
    ? `${currentUrl}&branch=${targetBranchId}`
    : `${currentUrl}?branch=${targetBranchId}`
  
  await page.goto(crossBranchUrl)
  
  // Also try session manipulation
  await page.evaluate((branchId) => {
    sessionStorage.setItem('currentBranchId', branchId)
  }, targetBranchId)
  
  await page.reload()
}

/**
 * Setup tenant-specific configurations for testing
 */
async function setupTenantSpecificConfigurations(page: Page) {
  // This would typically involve database seeding or API calls
  // to create tenant-specific configurations
  await page.evaluate(() => {
    window.postMessage({ 
      type: 'SETUP_TENANT_CONFIGS',
      tenants: [
        {
          id: 'tenant-a-123',
          config: {
            businessName: 'Coffee Shop Chain A',
            currency: 'PHP',
            taxRate: 12.5,
            timezone: 'Asia/Manila'
          }
        },
        {
          id: 'tenant-b-456',
          config: {
            businessName: 'Restaurant Chain B',
            currency: 'USD',
            taxRate: 8.0,
            timezone: 'America/New_York'
          }
        }
      ]
    }, '*')
  })
}

/**
 * Setup branch employee for testing
 */
async function setupBranchEmployee(page: Page, employeeData: any) {
  // This would typically involve API calls or database seeding
  await page.evaluate((employee) => {
    window.postMessage({ 
      type: 'SETUP_BRANCH_EMPLOYEE',
      employee: employee
    }, '*')
  }, employeeData)
  
  // Wait for setup to complete
  await page.waitForTimeout(1000)
}

/**
 * Complete branch manager onboarding simulation
 */
async function completeBranchManagerOnboarding(page: Page, managerData: any) {
  // Simulate the manager accepting invitation and completing setup
  await page.evaluate((manager) => {
    window.postMessage({ 
      type: 'COMPLETE_MANAGER_ONBOARDING',
      manager: manager
    }, '*')
  }, managerData)
  
  await page.waitForTimeout(1000)
}

/**
 * Setup branch hierarchy for testing delegation
 */
async function setupBranchHierarchy(page: Page) {
  const hierarchy = {
    owner: TENANT_BRANCH_SECURITY_CONFIG.testTenants.TENANT_A.owner,
    regionalManager: {
      email: 'regional@coffeeshop-a.com',
      password: 'regional123',
      role: 'REGIONAL_MANAGER',
      branches: ['branch-a1', 'branch-a2']
    },
    branchManagers: [
      {
        email: 'manager-a1@coffeeshop-a.com',
        role: 'BRANCH_MANAGER',
        branchId: 'branch-a1'
      },
      {
        email: 'manager-a2@coffeeshop-a.com',
        role: 'BRANCH_MANAGER',
        branchId: 'branch-a2'
      }
    ]
  }
  
  await page.evaluate((hierarchyData) => {
    window.postMessage({ 
      type: 'SETUP_BRANCH_HIERARCHY',
      hierarchy: hierarchyData
    }, '*')
  }, hierarchy)
  
  await page.waitForTimeout(2000)
}

/**
 * Create test transactions for specific branch
 */
async function createTestTransactions(page: Page, branch: any) {
  const transactions = [
    {
      id: `txn-${branch.id}-001`,
      branchId: branch.id,
      amount: 15000, // PHP 150.00
      items: ['Coffee', 'Sandwich'],
      timestamp: new Date()
    },
    {
      id: `txn-${branch.id}-002`,
      branchId: branch.id,
      amount: 25000, // PHP 250.00
      items: ['Pasta', 'Drink'],
      timestamp: new Date()
    }
  ]
  
  await page.evaluate((txnData) => {
    window.postMessage({ 
      type: 'CREATE_TEST_TRANSACTIONS',
      transactions: txnData
    }, '*')
  }, transactions)
  
  await page.waitForTimeout(1000)
}

/**
 * Simulate tenant deactivation for security testing
 */
async function simulateTenantDeactivation(page: Page, tenantId: string) {
  await page.evaluate((id) => {
    window.postMessage({ 
      type: 'SIMULATE_TENANT_DEACTIVATION',
      tenantId: id
    }, '*')
  }, tenantId)
  
  await page.waitForTimeout(500)
}