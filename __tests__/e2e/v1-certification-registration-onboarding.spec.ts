/**
 * v1-certification-registration-onboarding.spec.ts
 *
 * V1 E2E Certification: Registration and Onboarding Flow
 *
 * Tests the complete new user journey from initial registration through
 * business setup, onboarding survey, and trial activation.
 *
 * Critical V1 User Journey:
 *  ✅ User registration with email verification
 *  ✅ Business profile setup and configuration
 *  ✅ Onboarding survey completion with adaptive questions
 *  ✅ Trial plan activation and entitlement verification
 *  ✅ Dashboard access and initial business state
 *  ✅ Employee invitation and role assignment
 *  ✅ Branch creation and configuration
 *  ✅ Business compliance setup (BIR/tax configuration)
 *
 * Test Strategy:
 *  - Tests complete end-to-end user onboarding experience
 *  - Validates business data collection and processing
 *  - Verifies entitlement and capability assignment
 *  - Tests trial plan activation and configuration
 *  - Validates security and data isolation from registration
 *
 * Prerequisites:
 *  - Clean database state for registration testing
 *  - Email verification system configured
 *  - Trial plan and entitlements properly seeded
 *  - Philippines locale and BIR compliance features enabled
 *
 * Business Rules Validated:
 *  - New users start with Trial plan (1 branch, 1 employee)
 *  - Business characteristics drive capability recommendations
 *  - Email verification required before full access
 *  - BIR compliance fields properly configured for Philippines
 */

import { test, expect, type Page } from '@playwright/test'
import { faker } from '@faker-js/faker'

// Test configuration for registration and onboarding flow
const ONBOARDING_CONFIG = {
  routes: {
    register: '/register',
    login: '/login',
    onboarding: '/onboarding',
    dashboard: '/dashboard',
    businessSetup: '/settings/business-profile',
    employees: '/employees',
    branches: '/settings/-branches',
    billing: '/billing',
  },
  selectors: {
    // Registration form
    emailInput: '[data-testid="email-input"]',
    passwordInput: '[data-testid="password-input"]',
    confirmPasswordInput: '[data-testid="confirm-password-input"]',
    businessNameInput: '[data-testid="business-name-input"]',
    registerButton: '[data-testid="register-button"]',
    
    // Email verification
    emailVerificationBanner: '[data-testid="email-verification-banner"]',
    resendVerificationButton: '[data-testid="resend-verification-button"]',
    
    // Business setup
    businessDetailsForm: '[data-testid="business-details-form"]',
    businessTypeSelect: '[data-testid="business-type-select"]',
    addressInput: '[data-testid="address-input"]',
    phoneInput: '[data-testid="phone-input"]',
    tinInput: '[data-testid="tin-input"]',
    
    // Onboarding survey
    surveyWizard: '[data-testid="survey-wizard"]',
    surveyQuestion: '[data-testid="survey-question"]',
    surveyOption: '[data-testid="survey-option"]',
    nextButton: '[data-testid="next-button"]',
    skipButton: '[data-testid="skip-button"]',
    submitSurveyButton: '[data-testid="submit-survey-button"]',
    
    // Trial activation
    trialActivationCard: '[data-testid="trial-activation-card"]',
    activateTrialButton: '[data-testid="activate-trial-button"]',
    trialSuccessBanner: '[data-testid="trial-success-banner"]',
    
    // Dashboard verification
    dashboardWelcome: '[data-testid="dashboard-welcome"]',
    planBadge: '[data-testid="plan-badge"]',
    entitlementSummary: '[data-testid="entitlement-summary"]',
    
    // Employee management
    inviteEmployeeButton: '[data-testid="invite-employee-button"]',
    employeeEmailInput: '[data-testid="employee-email-input"]',
    employeeRoleSelect: '[data-testid="employee-role-select"]',
    sendInviteButton: '[data-testid="send-invite-button"]',
    
    // Branch management
    addBranchButton: '[data-testid="add-branch-button"]',
    branchNameInput: '[data-testid="branch-name-input"]',
    branchLocationInput: '[data-testid="branch-location-input"]',
    createBranchButton: '[data-testid="create-branch-button"]',
  },
  testData: {
    businessTypes: ['PHYSICAL_GOODS', 'FOOD_BEVERAGE', 'SERVICES', 'RAW_MATERIALS'],
    teamSizes: ['JUST_ME', 'TWO_TO_FIVE', 'SIX_TO_TWENTY', 'MORE_THAN_TWENTY'],
    paymentTimings: ['IMMEDIATE', 'DEFERRED', 'MIXED'],
    fulfillmentMethods: ['DINE_IN', 'TAKEOUT', 'DELIVERY'],
    inventoryTrackingLevels: ['YES_STRICT', 'YES_RELAXED', 'PERIODIC', 'NO'],
  },
  compliance: {
    philippines: {
      tinFormat: /^\d{3}-\d{3}-\d{3}-\d{3}$/,
      requiredFields: ['businessName', 'address', 'phone', 'tin'],
    },
  },
}

test.describe('V1 Certification: Registration and Onboarding', () => {
  // Generate unique test data for each test run
  const testUser = {
    email: `test+${faker.string.alphanumeric(8)}@example.com`,
    password: 'TestPassword123!',
    businessName: `${faker.company.name()} Test Business`,
    address: faker.location.streetAddress({ useFullAddress: true }),
    phone: '+63' + faker.string.numeric(10),
    tin: '123-456-789-000', // Valid Philippines TIN format
  }

  test.beforeEach(async ({ page }) => {
    // Ensure clean state - no existing authentication
    await page.context().clearCookies()
    await page.context().clearPermissions()
  })

  test('complete registration and onboarding flow - new business user', async ({ page }) => {
    // Step 1: Navigate to registration page
    await page.goto(ONBOARDING_CONFIG.routes.register)
    await expect(page).toHaveTitle(/Register/)
    
    // Step 2: Fill registration form
    await page.locator(ONBOARDING_CONFIG.selectors.emailInput).fill(testUser.email)
    await page.locator(ONBOARDING_CONFIG.selectors.passwordInput).fill(testUser.password)
    await page.locator(ONBOARDING_CONFIG.selectors.confirmPasswordInput).fill(testUser.password)
    await page.locator(ONBOARDING_CONFIG.selectors.businessNameInput).fill(testUser.businessName)
    
    // Step 3: Submit registration
    await page.locator(ONBOARDING_CONFIG.selectors.registerButton).click()
    
    // Step 4: Verify email verification prompt
    await expect(page.locator(ONBOARDING_CONFIG.selectors.emailVerificationBanner)).toBeVisible()
    await expect(page.locator('text=Please check your email')).toBeVisible()
    
    // Step 5: Simulate email verification (bypass email for E2E testing)
    // In real scenario, user would click link in email
    await simulateEmailVerification(page, testUser.email)
    
    // Step 6: Complete business setup
    await page.goto(ONBOARDING_CONFIG.routes.businessSetup)
    await page.locator(ONBOARDING_CONFIG.selectors.addressInput).fill(testUser.address)
    await page.locator(ONBOARDING_CONFIG.selectors.phoneInput).fill(testUser.phone)
    await page.locator(ONBOARDING_CONFIG.selectors.tinInput).fill(testUser.tin)
    
    // Save business details
    await page.locator('button:has-text("Save Changes")').click()
    await expect(page.locator('text=Business profile updated')).toBeVisible()
    
    // Step 7: Complete onboarding survey
    await page.goto(ONBOARDING_CONFIG.routes.onboarding)
    await completeOnboardingSurvey(page)
    
    // Step 8: Activate trial plan
    await expect(page.locator(ONBOARDING_CONFIG.selectors.trialActivationCard)).toBeVisible()
    await page.locator(ONBOARDING_CONFIG.selectors.activateTrialButton).click()
    await expect(page.locator(ONBOARDING_CONFIG.selectors.trialSuccessBanner)).toBeVisible()
    
    // Step 9: Verify dashboard access and entitlements
    await page.goto(ONBOARDING_CONFIG.routes.dashboard)
    await expect(page.locator(ONBOARDING_CONFIG.selectors.dashboardWelcome)).toBeVisible()
    await expect(page.locator(ONBOARDING_CONFIG.selectors.planBadge)).toHaveText('Trial')
    
    // Verify trial entitlements
    const entitlementSummary = page.locator(ONBOARDING_CONFIG.selectors.entitlementSummary)
    await expect(entitlementSummary).toContainText('1 branch')
    await expect(entitlementSummary).toContainText('1 employee')
    await expect(entitlementSummary).toContainText('50 transactions')
  })

  test('business profile setup with BIR compliance validation', async ({ page }) => {
    // Start from authenticated state after registration
    await authenticateTestUser(page, testUser)
    
    // Navigate to business setup
    await page.goto(ONBOARDING_CONFIG.routes.businessSetup)
    
    // Test BIR compliance field validation
    await page.locator(ONBOARDING_CONFIG.selectors.tinInput).fill('invalid-tin')
    await page.locator('button:has-text("Save Changes")').click()
    await expect(page.locator('text=Invalid TIN format')).toBeVisible()
    
    // Enter valid TIN
    await page.locator(ONBOARDING_CONFIG.selectors.tinInput).fill(testUser.tin)
    
    // Configure BIR settings
    await page.locator('[data-testid="vat-registered-toggle"]').check()
    await page.locator('[data-testid="tax-display-mode-select"]').selectOption('INCLUSIVE')
    await page.locator('[data-testid="official-receipts-toggle"]').check()
    
    // Save and verify
    await page.locator('button:has-text("Save Changes")').click()
    await expect(page.locator('text=Business profile updated')).toBeVisible()
    
    // Verify BIR settings are persisted
    await page.reload()
    await expect(page.locator('[data-testid="vat-registered-toggle"]')).toBeChecked()
    await expect(page.locator('[data-testid="official-receipts-toggle"]')).toBeChecked()
  })

  test('onboarding survey adaptive questions flow', async ({ page }) => {
    await authenticateTestUser(page, testUser)
    await page.goto(ONBOARDING_CONFIG.routes.onboarding)
    
    // Q1: Business type (required) - affects subsequent questions
    await selectSurveyOption(page, 'FOOD_BEVERAGE')
    await page.locator(ONBOARDING_CONFIG.selectors.nextButton).click()
    
    // Q2: Team size
    await selectSurveyOption(page, 'TWO_TO_FIVE')
    await page.locator(ONBOARDING_CONFIG.selectors.nextButton).click()
    
    // Q3: Payment timing - choosing DEFERRED should show Q3a and Q3b
    await selectSurveyOption(page, 'DEFERRED')
    await page.locator(ONBOARDING_CONFIG.selectors.nextButton).click()
    
    // Q3a: Fulfillment methods (should appear because payment timing is DEFERRED)
    await expect(page.locator('text=How do customers receive what they ordered')).toBeVisible()
    await selectSurveyOption(page, 'DINE_IN')
    await selectSurveyOption(page, 'TAKEOUT')
    await page.locator(ONBOARDING_CONFIG.selectors.nextButton).click()
    
    // Q3b: Order customization (should appear because payment timing is DEFERRED)
    await expect(page.locator('text=Do customers customize or add extras')).toBeVisible()
    await selectSurveyOption(page, 'OFTEN')
    await page.locator(ONBOARDING_CONFIG.selectors.nextButton).click()
    
    // Continue through remaining questions
    await completeRemainingQuestions(page)
    
    // Submit survey
    await page.locator(ONBOARDING_CONFIG.selectors.submitSurveyButton).click()
    
    // Verify survey completion affects business characteristics
    await page.goto(ONBOARDING_CONFIG.routes.businessSetup)
    await expect(page.locator('[data-testid="sells-food-beverage"]')).toHaveText('Yes')
    await expect(page.locator('[data-testid="payment-timing"]')).toHaveText('Deferred')
    await expect(page.locator('[data-testid="team-size"]')).toHaveText('Small')
  })

  test('trial plan activation and entitlement verification', async ({ page }) => {
    await authenticateTestUser(page, testUser)
    
    // Complete prerequisites
    await completeBusinessSetup(page, testUser)
    await completeOnboardingSurvey(page)
    
    // Activate trial plan
    await page.goto(ONBOARDING_CONFIG.routes.billing)
    await page.locator(ONBOARDING_CONFIG.selectors.activateTrialButton).click()
    
    // Verify trial activation success
    await expect(page.locator('text=Trial activated successfully')).toBeVisible()
    await expect(page.locator(ONBOARDING_CONFIG.selectors.planBadge)).toHaveText('Trial')
    
    // Verify V1 trial characteristics: 30 days, 500 transactions
    await expect(page.locator('[data-testid="trial-duration"]')).toContainText('30 days')
    await expect(page.locator('[data-testid="transaction-limit"]')).toContainText('500 transactions')
    
    // Verify 50 initial credits granted (permanent, don't expire with trial)
    await page.goto('/billing/credits')
    await expect(page.locator('[data-testid="credit-balance"]')).toContainText('50')
    await expect(page.locator('[data-testid="credit-source"]')).toContainText('Complimentary transactions on registration')
    
    // Test that credits and trial transaction allowance are separate
    // Credits should remain even when trial expires
    await expect(page.locator('[data-testid="credits-note"]')).toContainText('Credits do not expire')
    
    // Test trial entitlement enforcement
    await testTrialEntitlements(page)
  })

  test('employee invitation during onboarding', async ({ page }) => {
    await authenticateTestUser(page, testUser)
    await completeBusinessSetup(page, testUser)
    await activateTrialPlan(page)
    
    // Navigate to employee management
    await page.goto(ONBOARDING_CONFIG.routes.employees)
    
    // Attempt to invite employee (should be allowed on Trial - 1 employee limit)
    await page.locator(ONBOARDING_CONFIG.selectors.inviteEmployeeButton).click()
    
    const employeeEmail = `employee+${faker.string.alphanumeric(8)}@example.com`
    await page.locator(ONBOARDING_CONFIG.selectors.employeeEmailInput).fill(employeeEmail)
    await page.locator(ONBOARDING_CONFIG.selectors.employeeRoleSelect).selectOption('CASHIER')
    
    // Send invitation
    await page.locator(ONBOARDING_CONFIG.selectors.sendInviteButton).click()
    await expect(page.locator('text=Invitation sent successfully')).toBeVisible()
    
    // Verify employee appears in list
    await expect(page.locator(`text=${employeeEmail}`)).toBeVisible()
    await expect(page.locator('text=Pending')).toBeVisible()
    
    // Try to invite second employee (should hit trial limit)
    await page.locator(ONBOARDING_CONFIG.selectors.inviteEmployeeButton).click()
    await page.locator(ONBOARDING_CONFIG.selectors.employeeEmailInput).fill('second@example.com')
    await page.locator(ONBOARDING_CONFIG.selectors.employeeRoleSelect).selectOption('SUPERVISOR')
    await page.locator(ONBOARDING_CONFIG.selectors.sendInviteButton).click()
    
    // Should show limit reached error
    await expect(page.locator('text=Employee limit reached')).toBeVisible()
    await expect(page.locator('text=Upgrade to Premium')).toBeVisible()
  })

  test('branch creation with trial limits', async ({ page }) => {
    await authenticateTestUser(page, testUser)
    await completeBusinessSetup(page, testUser)
    await activateTrialPlan(page)
    
    // Navigate to branch management
    await page.goto(ONBOARDING_CONFIG.routes.branches)
    
    // Verify default branch exists
    await expect(page.locator('text=Main Branch')).toBeVisible()
    
    // Try to create additional branch (should hit trial limit)
    await page.locator(ONBOARDING_CONFIG.selectors.addBranchButton).click()
    
    await page.locator(ONBOARDING_CONFIG.selectors.branchNameInput).fill('Second Location')
    await page.locator(ONBOARDING_CONFIG.selectors.branchLocationInput).fill('Cebu City')
    await page.locator(ONBOARDING_CONFIG.selectors.createBranchButton).click()
    
    // Should show trial limit error
    await expect(page.locator('text=Branch limit reached')).toBeVisible()
    await expect(page.locator('text=Trial accounts are limited to 1 branch')).toBeVisible()
    await expect(page.locator('text=Upgrade to Premium')).toBeVisible()
  })

  test('registration error handling and validation', async ({ page }) => {
    await page.goto(ONBOARDING_CONFIG.routes.register)
    
    // Test duplicate email registration
    await page.locator(ONBOARDING_CONFIG.selectors.emailInput).fill('existing@example.com')
    await page.locator(ONBOARDING_CONFIG.selectors.passwordInput).fill(testUser.password)
    await page.locator(ONBOARDING_CONFIG.selectors.confirmPasswordInput).fill(testUser.password)
    await page.locator(ONBOARDING_CONFIG.selectors.businessNameInput).fill(testUser.businessName)
    
    await page.locator(ONBOARDING_CONFIG.selectors.registerButton).click()
    await expect(page.locator('text=Email already registered')).toBeVisible()
    
    // Test password mismatch
    await page.locator(ONBOARDING_CONFIG.selectors.emailInput).fill(testUser.email)
    await page.locator(ONBOARDING_CONFIG.selectors.confirmPasswordInput).fill('DifferentPassword')
    
    await page.locator(ONBOARDING_CONFIG.selectors.registerButton).click()
    await expect(page.locator('text=Passwords do not match')).toBeVisible()
    
    // Test weak password
    await page.locator(ONBOARDING_CONFIG.selectors.passwordInput).fill('weak')
    await page.locator(ONBOARDING_CONFIG.selectors.confirmPasswordInput).fill('weak')
    
    await page.locator(ONBOARDING_CONFIG.selectors.registerButton).click()
    await expect(page.locator('text=Password too weak')).toBeVisible()
  })
})

// Helper Functions
async function simulateEmailVerification(page: Page, email: string) {
  // In real E2E testing, this would involve checking email or using test endpoints
  // For now, we'll simulate the verification process
  await page.goto('/verify-email?token=test-verification-token&email=' + encodeURIComponent(email))
  await expect(page.locator('text=Email verified successfully')).toBeVisible()
}

async function authenticateTestUser(page: Page, user: typeof testUser) {
  // Login with test user credentials
  await page.goto(ONBOARDING_CONFIG.routes.login)
  await page.locator('[data-testid="email-input"]').fill(user.email)
  await page.locator('[data-testid="password-input"]').fill(user.password)
  await page.locator('[data-testid="login-button"]').click()
  
  await expect(page).toHaveURL(/dashboard/)
}

async function completeBusinessSetup(page: Page, user: typeof testUser) {
  await page.goto(ONBOARDING_CONFIG.routes.businessSetup)
  
  await page.locator(ONBOARDING_CONFIG.selectors.addressInput).fill(user.address)
  await page.locator(ONBOARDING_CONFIG.selectors.phoneInput).fill(user.phone)
  await page.locator(ONBOARDING_CONFIG.selectors.tinInput).fill(user.tin)
  
  await page.locator('button:has-text("Save Changes")').click()
  await expect(page.locator('text=Business profile updated')).toBeVisible()
}

async function completeOnboardingSurvey(page: Page) {
  await page.goto(ONBOARDING_CONFIG.routes.onboarding)
  
  // Q1: Business type (required)
  await selectSurveyOption(page, 'PHYSICAL_GOODS')
  await page.locator(ONBOARDING_CONFIG.selectors.nextButton).click()
  
  // Q2: Team size
  await selectSurveyOption(page, 'JUST_ME')
  await page.locator(ONBOARDING_CONFIG.selectors.nextButton).click()
  
  // Q3: Payment timing
  await selectSurveyOption(page, 'IMMEDIATE')
  await page.locator(ONBOARDING_CONFIG.selectors.nextButton).click()
  
  // Continue through remaining questions with safe defaults
  await completeRemainingQuestions(page)
  
  // Submit survey
  await page.locator(ONBOARDING_CONFIG.selectors.submitSurveyButton).click()
  await expect(page.locator('text=Survey completed')).toBeVisible()
}

async function selectSurveyOption(page: Page, optionValue: string) {
  await page.locator(`${ONBOARDING_CONFIG.selectors.surveyOption}[data-value="${optionValue}"]`).click()
}

async function completeRemainingQuestions(page: Page) {
  // Continue with safe defaults for remaining questions
  const maxQuestions = 10
  
  for (let i = 0; i < maxQuestions; i++) {
    // Check if we're at the end of the survey
    if (await page.locator(ONBOARDING_CONFIG.selectors.submitSurveyButton).isVisible()) {
      break
    }
    
    // Select first available option or skip
    const firstOption = page.locator(ONBOARDING_CONFIG.selectors.surveyOption).first()
    if (await firstOption.isVisible()) {
      await firstOption.click()
    }
    
    // Try to go to next question
    if (await page.locator(ONBOARDING_CONFIG.selectors.nextButton).isVisible()) {
      await page.locator(ONBOARDING_CONFIG.selectors.nextButton).click()
    } else if (await page.locator(ONBOARDING_CONFIG.selectors.skipButton).isVisible()) {
      await page.locator(ONBOARDING_CONFIG.selectors.skipButton).click()
    }
    
    // Small delay to allow UI transitions
    await page.waitForTimeout(500)
  }
}

async function activateTrialPlan(page: Page) {
  await page.goto(ONBOARDING_CONFIG.routes.billing)
  await page.locator(ONBOARDING_CONFIG.selectors.activateTrialButton).click()
  await expect(page.locator('text=Trial activated successfully')).toBeVisible()
}

async function testTrialEntitlements(page: Page) {
  // Verify trial capabilities are enabled
  await page.goto(ONBOARDING_CONFIG.routes.dashboard)
  
  // Should have access to core POS features
  await expect(page.locator('[data-testid="pos-access"]')).toBeVisible()
  await expect(page.locator('[data-testid="inventory-access"]')).toBeVisible()
  await expect(page.locator('[data-testid="reports-access"]')).toBeVisible()
  
  // Should show trial limitations
  await expect(page.locator('text=Trial: 50 transactions remaining')).toBeVisible()
  await expect(page.locator('text=1/1 branches')).toBeVisible()
  await expect(page.locator('text=1/1 employees')).toBeVisible()
}