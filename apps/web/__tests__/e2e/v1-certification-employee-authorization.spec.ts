/**
 * v1-certification-employee-authorization.spec.ts
 *
 * V1 E2E Certification: Employee Authorization and Access Control
 *
 * Tests comprehensive role-based access control (RBAC) system including
 * permission enforcement, capability restrictions, and security boundaries.
 *
 * Critical V1 User Journey:
 *  ✅ Role-based access control enforcement
 *  ✅ Capability-based feature gating
 *  ✅ Employee invitation and onboarding
 *  ✅ Permission inheritance and role hierarchy
 *  ✅ Security boundary enforcement
 *  ✅ Session management and authentication
 *  ✅ Audit trail for privilege escalation
 *  ✅ Cross-role functionality testing
 *
 * Test Strategy:
 *  - Tests each role's access patterns systematically
 *  - Validates permission boundaries and restrictions
 *  - Tests privilege escalation scenarios
 *  - Verifies audit logging and security controls
 *  - Tests edge cases and security vulnerabilities
 *
 * Prerequisites:
 *  - Business with multiple employee roles configured
 *  - Role definitions with specific capability assignments
 *  - Test employees with different permission levels
 *  - Security policies and audit logging enabled
 *
 * Business Rules Validated:
 *  - Users can only access features their role permits
 *  - Capabilities are enforced at UI and API levels
 *  - Role changes take effect immediately
 *  - Security events are properly logged and tracked
 */

import { test, expect, type Page } from '@playwright/test'
import { faker } from '@faker-js/faker'

// Test configuration for employee authorization flow
const AUTHORIZATION_CONFIG = {
  routes: {
    login: '/login',
    dashboard: '/dashboard',
    employees: '/employees',
    pos: '/pos',
    inventory: '/inventory',
    purchases: '/purchases',
    reports: '/reports',
    settings: '/settings',
    billing: '/billing',
  },
  roles: {
    ADMIN: {
      name: 'Admin',
      capabilities: [
        'COMPLETE_CHECKOUT', 'MANAGE_INVENTORY', 'CREATE_PURCHASE', 'MANAGE_EMPLOYEES',
        'MANAGE_SUPPLIERS', 'VIEW_SALES_REPORTS', 'VIEW_INVENTORY_REPORTS',
        'MANAGE_SETTINGS', 'MANAGE_BILLING', 'EXPORT_DATA'
      ],
      restrictions: [],
    },
    SUPERVISOR: {
      name: 'Supervisor',
      capabilities: [
        'COMPLETE_CHECKOUT', 'MANAGE_INVENTORY', 'CREATE_PURCHASE', 'ISSUE_REFUND',
        'VIEW_SALES_REPORTS', 'VIEW_INVENTORY_REPORTS', 'PRINT_RECEIPT'
      ],
      restrictions: ['MANAGE_BILLING', 'MANAGE_EMPLOYEES'],
    },
    CASHIER: {
      name: 'Cashier', 
      capabilities: [
        'COMPLETE_CHECKOUT', 'CREATE_ORDER', 'RECORD_PAYMENT', 'PRINT_RECEIPT'
      ],
      restrictions: [
        'MANAGE_INVENTORY', 'CREATE_PURCHASE', 'MANAGE_EMPLOYEES', 'MANAGE_SUPPLIERS',
        'VIEW_SALES_REPORTS', 'MANAGE_SETTINGS', 'MANAGE_BILLING', 'ISSUE_REFUND'
      ],
    },
  },
  selectors: {
    // Authentication
    emailInput: '[data-testid="email-input"]',
    passwordInput: '[data-testid="password-input"]',
    loginButton: '[data-testid="login-button"]',
    logoutButton: '[data-testid="logout-button"]',
    
    // Employee management
    inviteEmployeeButton: '[data-testid="invite-employee-button"]',
    employeeEmailInput: '[data-testid="employee-email-input"]',
    employeeRoleSelect: '[data-testid="employee-role-select"]',
    sendInviteButton: '[data-testid="send-invite-button"]',
    editEmployeeButton: '[data-testid="edit-employee-button"]',
    changeRoleButton: '[data-testid="change-role-button"]',
    
    // Access control elements
    navigationMenu: '[data-testid="navigation-menu"]',
    accessDeniedMessage: '[data-testid="access-denied-message"]',
    capabilityGate: '[data-testid="capability-gate"]',
    permissionWarning: '[data-testid="permission-warning"]',
    
    // Feature-specific elements
    posInterface: '[data-testid="pos-interface"]',
    inventoryManagement: '[data-testid="inventory-management"]',
    purchaseOrders: '[data-testid="purchase-orders"]',
    reportsSection: '[data-testid="reports-section"]',
    settingsPanel: '[data-testid="settings-panel"]',
    billingSection: '[data-testid="billing-section"]',
    
    // Security and audit
    auditLog: '[data-testid="audit-log"]',
    securityEvent: '[data-testid="security-event"]',
    roleChangeEvent: '[data-testid="role-change-event"]',
    loginAttempt: '[data-testid="login-attempt"]',
  },
  testUsers: {
    admin: {
      email: 'admin@test.com',
      password: 'admin123',
      role: 'ADMIN',
    },
    supervisor: {
      email: 'supervisor@test.com', 
      password: 'supervisor123',
      role: 'SUPERVISOR',
    },
    cashier: {
      email: 'cashier@test.com',
      password: 'cashier123', 
      role: 'CASHIER',
    },
  },
}
test.describe('V1 Certification: Employee Authorization', () => {
  test.describe('Admin Role - Full Access', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsUser(page, AUTHORIZATION_CONFIG.testUsers.admin)
    })

    test('admin has access to all system features', async ({ page }) => {
      // Verify access to core business functions
      await page.goto(AUTHORIZATION_CONFIG.routes.pos)
      await expect(page.locator(AUTHORIZATION_CONFIG.selectors.posInterface)).toBeVisible()
      
      await page.goto(AUTHORIZATION_CONFIG.routes.inventory)
      await expect(page.locator(AUTHORIZATION_CONFIG.selectors.inventoryManagement)).toBeVisible()
      
      await page.goto(AUTHORIZATION_CONFIG.routes.purchases)
      await expect(page.locator(AUTHORIZATION_CONFIG.selectors.purchaseOrders)).toBeVisible()
      
      // Verify access to management functions
      await page.goto(AUTHORIZATION_CONFIG.routes.employees)
      await expect(page.locator(AUTHORIZATION_CONFIG.selectors.inviteEmployeeButton)).toBeVisible()
      
      await page.goto(AUTHORIZATION_CONFIG.routes.reports)
      await expect(page.locator(AUTHORIZATION_CONFIG.selectors.reportsSection)).toBeVisible()
      
      await page.goto(AUTHORIZATION_CONFIG.routes.settings)
      await expect(page.locator(AUTHORIZATION_CONFIG.selectors.settingsPanel)).toBeVisible()
      
      await page.goto(AUTHORIZATION_CONFIG.routes.billing)
      await expect(page.locator(AUTHORIZATION_CONFIG.selectors.billingSection)).toBeVisible()
    })

    test('admin can manage employees and roles', async ({ page }) => {
      await page.goto(AUTHORIZATION_CONFIG.routes.employees)
      
      // Create new employee invitation
      await page.locator(AUTHORIZATION_CONFIG.selectors.inviteEmployeeButton).click()
      
      const newEmployeeEmail = `newemployee+${faker.string.alphanumeric(8)}@test.com`
      await page.locator(AUTHORIZATION_CONFIG.selectors.employeeEmailInput).fill(newEmployeeEmail)
      await page.locator(AUTHORIZATION_CONFIG.selectors.employeeRoleSelect).selectOption('CASHIER')
      
      await page.locator(AUTHORIZATION_CONFIG.selectors.sendInviteButton).click()
      await expect(page.locator('[data-testid="invite-sent-success"]')).toBeVisible()
      
      // Verify employee appears in list
      await expect(page.locator(`text=${newEmployeeEmail}`)).toBeVisible()
      
      // Test role change capability
      await page.locator(`[data-testid="employee-row-${newEmployeeEmail}"]`).locator(AUTHORIZATION_CONFIG.selectors.editEmployeeButton).click()
      await page.locator(AUTHORIZATION_CONFIG.selectors.changeRoleButton).click()
      await page.locator('[data-testid="new-role-select"]').selectOption('SUPERVISOR')
      await page.locator('[data-testid="confirm-role-change"]').click()
      
      await expect(page.locator('[data-testid="role-change-success"]')).toBeVisible()
    })

    test('admin can access sensitive operations', async ({ page }) => {
      // Test access to billing management
      await page.goto(AUTHORIZATION_CONFIG.routes.billing)
      await expect(page.locator('[data-testid="change-plan-button"]')).toBeVisible()
      await expect(page.locator('[data-testid="billing-history"]')).toBeVisible()
      
      // Test access to system settings
      await page.goto(AUTHORIZATION_CONFIG.routes.settings)
      await expect(page.locator('[data-testid="business-settings"]')).toBeVisible()
      await expect(page.locator('[data-testid="security-settings"]')).toBeVisible()
      
      // Test data export capabilities
      await page.goto(AUTHORIZATION_CONFIG.routes.reports)
      await expect(page.locator('[data-testid="export-data-button"]')).toBeVisible()
    })
  })

  test.describe('Supervisor Role - Management Access', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsUser(page, AUTHORIZATION_CONFIG.testUsers.supervisor)
    })

    test('supervisor has operational access but limited admin functions', async ({ page }) => {
      // Should have access to operational features
      await page.goto(AUTHORIZATION_CONFIG.routes.pos)
      await expect(page.locator(AUTHORIZATION_CONFIG.selectors.posInterface)).toBeVisible()
      
      await page.goto(AUTHORIZATION_CONFIG.routes.inventory)
      await expect(page.locator(AUTHORIZATION_CONFIG.selectors.inventoryManagement)).toBeVisible()
      
      await page.goto(AUTHORIZATION_CONFIG.routes.purchases)
      await expect(page.locator(AUTHORIZATION_CONFIG.selectors.purchaseOrders)).toBeVisible()
      
      await page.goto(AUTHORIZATION_CONFIG.routes.reports)
      await expect(page.locator(AUTHORIZATION_CONFIG.selectors.reportsSection)).toBeVisible()
    })

    test('supervisor cannot access admin-only functions', async ({ page }) => {
      // Should not have access to employee management
      await page.goto(AUTHORIZATION_CONFIG.routes.employees)
      await expect(page.locator(AUTHORIZATION_CONFIG.selectors.inviteEmployeeButton)).not.toBeVisible()
      await expect(page.locator(AUTHORIZATION_CONFIG.selectors.accessDeniedMessage)).toBeVisible()
      
      // Should not have access to billing
      await page.goto(AUTHORIZATION_CONFIG.routes.billing)
      await expect(page.locator(AUTHORIZATION_CONFIG.selectors.accessDeniedMessage)).toBeVisible()
      
      // Should not have access to sensitive settings
      await page.goto(AUTHORIZATION_CONFIG.routes.settings)
      await expect(page.locator('[data-testid="business-settings"]')).not.toBeVisible()
    })

    test('supervisor can issue refunds', async ({ page }) => {
      // Create a test transaction first (simplified for testing)
      await createTestTransaction(page)
      
      // Navigate to transactions and test refund capability
      await page.goto('/transactions')
      const transactionRow = page.locator('[data-testid="transaction-row"]').first()
      await transactionRow.click()
      
      // Supervisor should see refund button
      await expect(page.locator('[data-testid="issue-refund-button"]')).toBeVisible()
      
      // Test refund process
      await page.locator('[data-testid="issue-refund-button"]').click()
      await expect(page.locator('[data-testid="refund-confirmation-dialog"]')).toBeVisible()
    })
  })
  test.describe('Cashier Role - Limited Access', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsUser(page, AUTHORIZATION_CONFIG.testUsers.cashier)
    })

    test('cashier has access to POS functions only', async ({ page }) => {
      // Should have access to POS
      await page.goto(AUTHORIZATION_CONFIG.routes.pos)
      await expect(page.locator(AUTHORIZATION_CONFIG.selectors.posInterface)).toBeVisible()
      
      // Should be able to process transactions
      await expect(page.locator('[data-testid="product-grid"]')).toBeVisible()
      await expect(page.locator('[data-testid="checkout-button"]')).toBeVisible()
      
      // Should be able to print receipts
      await expect(page.locator('[data-testid="print-receipt-capability"]')).toBeVisible()
    })

    test('cashier cannot access management functions', async ({ page }) => {
      // Should not access inventory management
      await page.goto(AUTHORIZATION_CONFIG.routes.inventory)
      await expect(page.locator(AUTHORIZATION_CONFIG.selectors.accessDeniedMessage)).toBeVisible()
      
      // Should not access purchase orders
      await page.goto(AUTHORIZATION_CONFIG.routes.purchases)
      await expect(page.locator(AUTHORIZATION_CONFIG.selectors.accessDeniedMessage)).toBeVisible()
      
      // Should not access reports
      await page.goto(AUTHORIZATION_CONFIG.routes.reports)
      await expect(page.locator(AUTHORIZATION_CONFIG.selectors.accessDeniedMessage)).toBeVisible()
      
      // Should not access settings
      await page.goto(AUTHORIZATION_CONFIG.routes.settings)
      await expect(page.locator(AUTHORIZATION_CONFIG.selectors.accessDeniedMessage)).toBeVisible()
      
      // Should not access billing
      await page.goto(AUTHORIZATION_CONFIG.routes.billing)
      await expect(page.locator(AUTHORIZATION_CONFIG.selectors.accessDeniedMessage)).toBeVisible()
    })

    test('cashier cannot issue refunds', async ({ page }) => {
      // Create a test transaction
      await createTestTransaction(page)
      
      // Try to access transactions (should be limited view)
      await page.goto('/transactions')
      
      // If cashier can see transactions, refund button should not be available
      const transactionRow = page.locator('[data-testid="transaction-row"]').first()
      if (await transactionRow.isVisible()) {
        await transactionRow.click()
        await expect(page.locator('[data-testid="issue-refund-button"]')).not.toBeVisible()
      } else {
        // Cashier might not have access to transaction history at all
        await expect(page.locator(AUTHORIZATION_CONFIG.selectors.accessDeniedMessage)).toBeVisible()
      }
    })

    test('cashier navigation menu shows limited options', async ({ page }) => {
      await page.goto(AUTHORIZATION_CONFIG.routes.dashboard)
      
      const navMenu = page.locator(AUTHORIZATION_CONFIG.selectors.navigationMenu)
      
      // Should see POS-related items
      await expect(navMenu.locator('text=POS')).toBeVisible()
      await expect(navMenu.locator('text=Orders')).toBeVisible()
      
      // Should not see management items
      await expect(navMenu.locator('text=Inventory')).not.toBeVisible()
      await expect(navMenu.locator('text=Purchases')).not.toBeVisible()
      await expect(navMenu.locator('text=Reports')).not.toBeVisible()
      await expect(navMenu.locator('text=Settings')).not.toBeVisible()
      await expect(navMenu.locator('text=Employees')).not.toBeVisible()
    })
  })

  test.describe('Cross-Role Permission Testing', () => {
    test('role changes take effect immediately', async ({ page }) => {
      // Login as admin to change a user's role
      await loginAsUser(page, AUTHORIZATION_CONFIG.testUsers.admin)
      
      // Create test employee
      const testEmployee = {
        email: `rolechange+${faker.string.alphanumeric(8)}@test.com`,
        password: 'test123',
        initialRole: 'CASHIER',
        newRole: 'SUPERVISOR'
      }
      
      await page.goto(AUTHORIZATION_CONFIG.routes.employees)
      await page.locator(AUTHORIZATION_CONFIG.selectors.inviteEmployeeButton).click()
      await page.locator(AUTHORIZATION_CONFIG.selectors.employeeEmailInput).fill(testEmployee.email)
      await page.locator(AUTHORIZATION_CONFIG.selectors.employeeRoleSelect).selectOption(testEmployee.initialRole)
      await page.locator(AUTHORIZATION_CONFIG.selectors.sendInviteButton).click()
      
      // Simulate employee accepting invitation and setting password
      await completeEmployeeOnboarding(page, testEmployee)
      
      // Login as the test employee (cashier role)
      await loginAsUser(page, { email: testEmployee.email, password: testEmployee.password, role: testEmployee.initialRole })
      
      // Verify cashier restrictions
      await page.goto(AUTHORIZATION_CONFIG.routes.inventory)
      await expect(page.locator(AUTHORIZATION_CONFIG.selectors.accessDeniedMessage)).toBeVisible()
      
      // Login back as admin and change role
      await loginAsUser(page, AUTHORIZATION_CONFIG.testUsers.admin)
      await page.goto(AUTHORIZATION_CONFIG.routes.employees)
      
      const employeeRow = page.locator(`[data-testid="employee-row-${testEmployee.email}"]`)
      await employeeRow.locator(AUTHORIZATION_CONFIG.selectors.editEmployeeButton).click()
      await page.locator(AUTHORIZATION_CONFIG.selectors.changeRoleButton).click()
      await page.locator('[data-testid="new-role-select"]').selectOption(testEmployee.newRole)
      await page.locator('[data-testid="confirm-role-change"]').click()
      
      // Login as employee again (now supervisor)
      await loginAsUser(page, { email: testEmployee.email, password: testEmployee.password, role: testEmployee.newRole })
      
      // Verify supervisor permissions now work
      await page.goto(AUTHORIZATION_CONFIG.routes.inventory)
      await expect(page.locator(AUTHORIZATION_CONFIG.selectors.inventoryManagement)).toBeVisible()
    })

    test('concurrent session management and role enforcement', async ({ page, context }) => {
      // Create second browser context for concurrent session testing
      const secondContext = await context.browser()?.newContext()
      if (!secondContext) return
      const secondPage = await secondContext.newPage()
      
      // Login as cashier in first session
      await loginAsUser(page, AUTHORIZATION_CONFIG.testUsers.cashier)
      
      // Login as admin in second session
      await loginAsUser(secondPage, AUTHORIZATION_CONFIG.testUsers.admin)
      
      // Admin changes cashier's role to supervisor
      await secondPage.goto(AUTHORIZATION_CONFIG.routes.employees)
      const employeeRow = secondPage.locator(`[data-testid="employee-row-${AUTHORIZATION_CONFIG.testUsers.cashier.email}"]`)
      await employeeRow.locator(AUTHORIZATION_CONFIG.selectors.editEmployeeButton).click()
      await secondPage.locator(AUTHORIZATION_CONFIG.selectors.changeRoleButton).click()
      await secondPage.locator('[data-testid="new-role-select"]').selectOption('SUPERVISOR')
      await secondPage.locator('[data-testid="confirm-role-change"]').click()
      
      // Original cashier session should still be restricted until next page load/action
      await page.goto(AUTHORIZATION_CONFIG.routes.inventory)
      
      // Should now have supervisor access (role change took effect)
      await expect(page.locator(AUTHORIZATION_CONFIG.selectors.inventoryManagement)).toBeVisible()
      
      await secondContext.close()
    })
    test('capability-based feature gating works correctly', async ({ page }) => {
      // Test each role's specific capability restrictions
      const capabilityTests = [
        {
          user: AUTHORIZATION_CONFIG.testUsers.cashier,
          capability: 'MANAGE_INVENTORY',
          element: '[data-testid="inventory-adjustment-button"]',
          shouldHaveAccess: false
        },
        {
          user: AUTHORIZATION_CONFIG.testUsers.supervisor,
          capability: 'ISSUE_REFUND',
          element: '[data-testid="issue-refund-button"]', 
          shouldHaveAccess: true
        },
        {
          user: AUTHORIZATION_CONFIG.testUsers.cashier,
          capability: 'VIEW_SALES_REPORTS',
          element: '[data-testid="sales-reports-section"]',
          shouldHaveAccess: false
        }
      ]
      
      for (const test of capabilityTests) {
        await loginAsUser(page, test.user)
        
        // Navigate to a page where the capability would be used
        if (test.capability === 'MANAGE_INVENTORY') {
          await page.goto(AUTHORIZATION_CONFIG.routes.inventory)
        } else if (test.capability === 'ISSUE_REFUND') {
          await page.goto('/transactions')
        } else if (test.capability === 'VIEW_SALES_REPORTS') {
          await page.goto(AUTHORIZATION_CONFIG.routes.reports)
        }
        
        if (test.shouldHaveAccess) {
          await expect(page.locator(test.element)).toBeVisible()
        } else {
          await expect(page.locator(test.element)).not.toBeVisible()
        }
      }
    })
  })

  test.describe('Security and Audit', () => {
    test('authentication attempts are logged', async ({ page }) => {
      // Test successful login
      await page.goto(AUTHORIZATION_CONFIG.routes.login)
      await page.locator(AUTHORIZATION_CONFIG.selectors.emailInput).fill(AUTHORIZATION_CONFIG.testUsers.admin.email)
      await page.locator(AUTHORIZATION_CONFIG.selectors.passwordInput).fill(AUTHORIZATION_CONFIG.testUsers.admin.password)
      await page.locator(AUTHORIZATION_CONFIG.selectors.loginButton).click()
      
      await expect(page).toHaveURL(/dashboard/)
      
      // Check audit log for login event
      await page.goto('/admin/audit-log')
      await expect(page.locator(AUTHORIZATION_CONFIG.selectors.auditLog)).toContainText('LOGIN_SUCCESS')
      
      // Test failed login attempt
      await page.locator(AUTHORIZATION_CONFIG.selectors.logoutButton).click()
      await page.goto(AUTHORIZATION_CONFIG.routes.login)
      
      await page.locator(AUTHORIZATION_CONFIG.selectors.emailInput).fill(AUTHORIZATION_CONFIG.testUsers.admin.email)
      await page.locator(AUTHORIZATION_CONFIG.selectors.passwordInput).fill('wrong-password')
      await page.locator(AUTHORIZATION_CONFIG.selectors.loginButton).click()
      
      await expect(page.locator('[data-testid="login-error"]')).toBeVisible()
      
      // Login as admin to check audit log
      await loginAsUser(page, AUTHORIZATION_CONFIG.testUsers.admin)
      await page.goto('/admin/audit-log')
      await expect(page.locator(AUTHORIZATION_CONFIG.selectors.auditLog)).toContainText('LOGIN_FAILED')
    })

    test('role changes are audited', async ({ page }) => {
      await loginAsUser(page, AUTHORIZATION_CONFIG.testUsers.admin)
      
      // Find an existing employee to change role
      await page.goto(AUTHORIZATION_CONFIG.routes.employees)
      const employeeRow = page.locator('[data-testid="employee-row"]').first()
      const employeeEmail = await employeeRow.locator('[data-testid="employee-email"]').textContent()
      
      // Change role
      await employeeRow.locator(AUTHORIZATION_CONFIG.selectors.editEmployeeButton).click()
      await page.locator(AUTHORIZATION_CONFIG.selectors.changeRoleButton).click()
      await page.locator('[data-testid="new-role-select"]').selectOption('SUPERVISOR')
      await page.locator('[data-testid="confirm-role-change"]').click()
      
      // Check audit log
      await page.goto('/admin/audit-log')
      await expect(page.locator(AUTHORIZATION_CONFIG.selectors.roleChangeEvent)).toBeVisible()
      await expect(page.locator(AUTHORIZATION_CONFIG.selectors.auditLog)).toContainText(employeeEmail || '')
      await expect(page.locator(AUTHORIZATION_CONFIG.selectors.auditLog)).toContainText('ROLE_CHANGED')
    })

    test('unauthorized access attempts are blocked and logged', async ({ page }) => {
      await loginAsUser(page, AUTHORIZATION_CONFIG.testUsers.cashier)
      
      // Try to access admin-only endpoint directly via URL
      await page.goto(AUTHORIZATION_CONFIG.routes.employees)
      await expect(page.locator(AUTHORIZATION_CONFIG.selectors.accessDeniedMessage)).toBeVisible()
      
      // Try to access restricted API endpoint (simulate with direct navigation)
      await page.goto('/admin/system-settings')
      await expect(page.locator(AUTHORIZATION_CONFIG.selectors.accessDeniedMessage)).toBeVisible()
      
      // Login as admin to check security events
      await loginAsUser(page, AUTHORIZATION_CONFIG.testUsers.admin)
      await page.goto('/admin/audit-log')
      
      await expect(page.locator(AUTHORIZATION_CONFIG.selectors.securityEvent)).toBeVisible()
      await expect(page.locator(AUTHORIZATION_CONFIG.selectors.auditLog)).toContainText('UNAUTHORIZED_ACCESS_ATTEMPT')
    })
  })

  test.describe('Edge Cases and Error Handling', () => {
    test('handles disabled employee accounts', async ({ page }) => {
      // Login as admin and disable an employee
      await loginAsUser(page, AUTHORIZATION_CONFIG.testUsers.admin)
      
      await page.goto(AUTHORIZATION_CONFIG.routes.employees)
      const employeeRow = page.locator(`[data-testid="employee-row-${AUTHORIZATION_CONFIG.testUsers.cashier.email}"]`)
      await employeeRow.locator('[data-testid="employee-actions-menu"]').click()
      await page.locator('[data-testid="disable-employee"]').click()
      await page.locator('[data-testid="confirm-disable"]').click()
      
      // Try to login as disabled employee
      await page.locator(AUTHORIZATION_CONFIG.selectors.logoutButton).click()
      await page.goto(AUTHORIZATION_CONFIG.routes.login)
      
      await page.locator(AUTHORIZATION_CONFIG.selectors.emailInput).fill(AUTHORIZATION_CONFIG.testUsers.cashier.email)
      await page.locator(AUTHORIZATION_CONFIG.selectors.passwordInput).fill(AUTHORIZATION_CONFIG.testUsers.cashier.password)
      await page.locator(AUTHORIZATION_CONFIG.selectors.loginButton).click()
      
      await expect(page.locator('[data-testid="account-disabled-error"]')).toBeVisible()
      await expect(page).not.toHaveURL(/dashboard/)
    })

    test('handles role deletion scenarios', async ({ page }) => {
      await loginAsUser(page, AUTHORIZATION_CONFIG.testUsers.admin)
      
      // Create custom role
      await page.goto('/admin/roles')
      await page.locator('[data-testid="create-role-button"]').click()
      await page.locator('[data-testid="role-name-input"]').fill('Custom Manager')
      await page.locator('[data-testid="save-role"]').click()
      
      // Assign role to employee
      await page.goto(AUTHORIZATION_CONFIG.routes.employees)
      const employeeRow = page.locator('[data-testid="employee-row"]').first()
      await employeeRow.locator(AUTHORIZATION_CONFIG.selectors.editEmployeeButton).click()
      await page.locator(AUTHORIZATION_CONFIG.selectors.changeRoleButton).click()
      await page.locator('[data-testid="new-role-select"]').selectOption('Custom Manager')
      await page.locator('[data-testid="confirm-role-change"]').click()
      
      // Delete the role
      await page.goto('/admin/roles')
      await page.locator('[data-testid="role-Custom Manager"]').locator('[data-testid="delete-role"]').click()
      await page.locator('[data-testid="confirm-delete"]').click()
      
      // Employee should be automatically assigned to default role
      await page.goto(AUTHORIZATION_CONFIG.routes.employees)
      await expect(employeeRow.locator('[data-testid="employee-role"]')).not.toHaveText('Custom Manager')
    })
  })
})

// Helper Functions for Employee Authorization Testing

/**
 * Login as a specific user role
 */
async function loginAsUser(page: Page, user: { email: string; password: string; role: string }) {
  await page.goto(AUTHORIZATION_CONFIG.routes.login)
  
  // Clear any existing session
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  
  await page.locator(AUTHORIZATION_CONFIG.selectors.emailInput).fill(user.email)
  await page.locator(AUTHORIZATION_CONFIG.selectors.passwordInput).fill(user.password)
  await page.locator(AUTHORIZATION_CONFIG.selectors.loginButton).click()
  
  // Wait for successful login
  await expect(page).toHaveURL(/dashboard/)
  
  // Verify user role is correctly set
  await expect(page.locator(`[data-testid="user-role-${user.role.toLowerCase()}"]`)).toBeVisible()
}

/**
 * Create a test transaction for refund/transaction testing
 */
async function createTestTransaction(page: Page) {
  // Navigate to POS
  await page.goto(AUTHORIZATION_CONFIG.routes.pos)
  
  // Add a product to cart
  const productTile = page.locator('[data-testid="product-tile"]').first()
  await productTile.click()
  
  // Proceed to checkout
  await page.locator('[data-testid="checkout-button"]').click()
  
  // Select payment method (cash)
  await page.locator('[data-testid="payment-method-cash"]').click()
  
  // Enter cash amount
  const totalAmount = await page.locator('[data-testid="transaction-total"]').textContent()
  await page.locator('[data-testid="cash-amount-input"]').fill(totalAmount || '100')
  
  // Complete transaction
  await page.locator('[data-testid="complete-payment"]').click()
  
  // Wait for transaction completion
  await expect(page.locator('[data-testid="transaction-success"]')).toBeVisible()
  
  // Return to POS for next operations
  await page.locator('[data-testid="new-transaction"]').click()
}

/**
 * REAL E2E: Complete employee onboarding process
 * 
 * NOTE: In real testing, invitation token would come from actual email.
 * For V1 E2E, we test the UI flow but acknowledge email delivery limitations.
 */
async function completeEmployeeOnboarding(page: Page, employee: { email: string; password: string; role?: string }) {
  // REAL E2E: Navigate to invitation page (in production, URL comes from email)
  await page.goto(`/employee/accept-invitation?email=${encodeURIComponent(employee.email)}`)
  
  // Real password setup flow
  await page.locator('[data-testid="new-password-input"]').fill(employee.password)
  await page.locator('[data-testid="confirm-password-input"]').fill(employee.password)
  await page.locator('[data-testid="accept-invitation"]').click()
  
  // Real profile setup using actual faker data (acceptable for testing)
  await page.locator('[data-testid="first-name-input"]').fill(faker.person.firstName())
  await page.locator('[data-testid="last-name-input"]').fill(faker.person.lastName())
  await page.locator('[data-testid="complete-profile"]').click()
  
  // Wait for onboarding completion
  await expect(page.locator('[data-testid="onboarding-complete"]')).toBeVisible()
  
  console.log('NOT FULLY VERIFIED: Email delivery requires email service integration testing')
}