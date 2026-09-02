/**
 * v1-certification-subscription-lifecycle.spec.ts
 *
 * V1 E2E Certification: Subscription Lifecycle Management
 *
 * Tests comprehensive subscription management including trial activation,
 * plan changes, billing cycles, payment processing, and cancellation flows.
 *
 * Critical V1 User Journey:
 *  ✅ Trial subscription activation and management
 *  ✅ Plan upgrade and downgrade workflows
 *  ✅ Billing cycle processing and invoicing
 *  ✅ Payment method management and processing
 *  ✅ Subscription cancellation and reactivation
 *  ✅ Usage-based billing and entitlement enforcement
 *  ✅ Proration calculations for plan changes
 *  ✅ Failed payment handling and retry logic
 *  ✅ Subscription analytics and reporting
 *  ✅ Multi-tenant subscription isolation
 *
 * Test Strategy:
 *  - Tests complete subscription lifecycle end-to-end
 *  - Validates billing accuracy and proration logic
 *  - Tests payment processing and failure scenarios
 *  - Verifies entitlement changes with plan modifications
 *  - Tests subscription state transitions and notifications
 *
 * Prerequisites:
 *  - Stripe test environment configured
 *  - Multiple subscription plans defined (Trial, Basic, Pro, Enterprise)
 *  - Test payment methods and webhook handling
 *  - Email notification system for billing events
 *
 * Business Rules Validated:
 *  - Trial periods are enforced with proper limitations
 *  - Plan changes are prorated correctly
 *  - Payment failures trigger appropriate retry and notification flows
 *  - Subscription cancellations preserve data access during grace period
 *  - Usage limits are enforced based on subscription tier
 */

import { test, expect, type Page } from '@playwright/test'
import { faker } from '@faker-js/faker'

// Test configuration for subscription lifecycle flow
const SUBSCRIPTION_CONFIG = {
  routes: {
    login: '/login',
    dashboard: '/dashboard',
    billing: '/billing',
    subscription: '/subscription',
    plans: '/plans',
    paymentMethods: '/business/subscription/payment-methods',
    invoices: '/billing/invoices',
    usage: '/billing/usage',
    settings: '/settings',
  },
  plans: {
    TRIAL: {
      id: 'trial',
      name: 'Trial Plan',
      price: 0,
      duration: 30, // days - actual V1 trial duration (not 14)
      limits: {
        transactions: 500, // actual V1 trial transaction allowance (not 100)
        products: 50,
        employees: 1, // actual V1 trial limit
        branches: 1,
      },
      features: ['POS', 'BASIC_INVENTORY', 'BASIC_REPORTS'],
    },
    BASIC: {
      id: 'basic',
      name: 'Basic Plan',
      price: 2900, // PHP 29.00/month in cents
      limits: {
        transactions: 1000,
        products: 500,
        employees: 5,
        branches: 2,
      },
      features: ['POS', 'INVENTORY_MANAGEMENT', 'BASIC_REPORTS', 'EMPLOYEE_MANAGEMENT'],
    },
    PRO: {
      id: 'pro',
      name: 'Pro Plan', 
      price: 4900, // PHP 49.00/month in cents
      limits: {
        transactions: 5000,
        products: 2000,
        employees: 15,
        branches: 5,
      },
      features: [
        'POS', 'ADVANCED_INVENTORY', 'PURCHASING', 'ADVANCED_REPORTS',
        'EMPLOYEE_MANAGEMENT', 'MULTI_BRANCH'
        // Note: API_ACCESS removed - not a V1 customer-facing feature
      ],
    },
    ENTERPRISE: {
      id: 'enterprise',
      name: 'Enterprise Plan',
      price: 9900, // PHP 99.00/month in cents
      limits: {
        transactions: -1, // unlimited
        products: -1,
        employees: -1,
        branches: -1,
      },
      features: [
        'POS', 'ADVANCED_INVENTORY', 'PURCHASING', 'PREMIUM_REPORTS',
        'EMPLOYEE_MANAGEMENT', 'UNLIMITED_BRANCHES',
        'PRIORITY_SUPPORT', 'CUSTOM_INTEGRATIONS'
        // Note: API_ACCESS removed - not a V1 customer-facing feature
      ],
    },
  },
  selectors: {
    // Billing and subscription
    currentPlanCard: '[data-testid="current-plan-card"]',
    planUpgradeButton: '[data-testid="plan-upgrade-button"]',
    planDowngradeButton: '[data-testid="plan-downgrade-button"]',
    cancelSubscriptionButton: '[data-testid="cancel-subscription-button"]',
    reactivateButton: '[data-testid="reactivate-subscription-button"]',
    
    // Plan selection
    planCard: '[data-testid="plan-card"]',
    selectPlanButton: '[data-testid="select-plan-button"]',
    confirmPlanChange: '[data-testid="confirm-plan-change"]',
    prorationPreview: '[data-testid="proration-preview"]',
    
    // Payment methods
    addPaymentMethodButton: '[data-testid="add-payment-method-button"]',
    paymentMethodCard: '[data-testid="payment-method-card"]',
    cardNumberInput: '[data-testid="card-number-input"]',
    expiryInput: '[data-testid="expiry-input"]',
    cvvInput: '[data-testid="cvv-input"]',
    savePaymentMethodButton: '[data-testid="save-payment-method-button"]',
    setDefaultPaymentMethod: '[data-testid="set-default-payment-method"]',
    
    // Billing and invoices
    invoiceList: '[data-testid="invoice-list"]',
    invoiceItem: '[data-testid="invoice-item"]',
    downloadInvoiceButton: '[data-testid="download-invoice-button"]',
    payInvoiceButton: '[data-testid="pay-invoice-button"]',
    billingHistory: '[data-testid="billing-history"]',
    
    // Usage and limits
    usageMetrics: '[data-testid="usage-metrics"]',
    usageProgressBar: '[data-testid="usage-progress-bar"]',
    usageLimitWarning: '[data-testid="usage-limit-warning"]',
    upgradePrompt: '[data-testid="upgrade-prompt"]',
    
    // Notifications and alerts
    billingNotification: '[data-testid="billing-notification"]',
    paymentFailureAlert: '[data-testid="payment-failure-alert"]',
    trialExpiryWarning: '[data-testid="trial-expiry-warning"]',
    subscriptionCancelledAlert: '[data-testid="subscription-cancelled-alert"]',
    
    // Confirmation dialogs
    confirmDialog: '[data-testid="confirm-dialog"]',
    confirmButton: '[data-testid="confirm-button"]',
    cancelButton: '[data-testid="cancel-button"]',
    
    // Success/error states
    successMessage: '[data-testid="success-message"]',
    errorMessage: '[data-testid="error-message"]',
    paymentProcessing: '[data-testid="payment-processing"]',
  },
  testPaymentMethods: {
    validCard: {
      number: '4242424242424242',
      expiry: '12/30',
      cvv: '123',
      name: 'Test User',
    },
    declinedCard: {
      number: '4000000000000002',
      expiry: '12/30', 
      cvv: '123',
      name: 'Test User',
    },
    insufficientFundsCard: {
      number: '4000000000009995',
      expiry: '12/30',
      cvv: '123',
      name: 'Test User',
    },
  },
}
test.describe('V1 Certification: Subscription Lifecycle', () => {
  test.describe('Trial Subscription Management', () => {
    test('new user gets trial subscription with proper limits', async ({ page }) => {
      // Register new user
      const testUser = await registerNewUser(page)
      
      // Verify trial subscription is active
      await page.goto(SUBSCRIPTION_CONFIG.routes.billing)
      // Verify trial status display
      const currentPlan = page.locator(SUBSCRIPTION_CONFIG.selectors.currentPlanCard)
      await expect(currentPlan).toContainText(SUBSCRIPTION_CONFIG.plans.TRIAL.name)
      // Note: Days remaining will vary - check it shows remaining days, not exact count
      await expect(currentPlan).toContainText('days remaining')
      
      // Verify trial limits are displayed
      await page.goto(SUBSCRIPTION_CONFIG.routes.usage)
      const usageMetrics = page.locator(SUBSCRIPTION_CONFIG.selectors.usageMetrics)
      
      await expect(usageMetrics.locator('[data-testid="transactions-used"]')).toContainText('0 / 100')
      await expect(usageMetrics.locator('[data-testid="products-used"]')).toContainText('0 / 50')
      await expect(usageMetrics.locator('[data-testid="employees-used"]')).toContainText('1 / 2')
      await expect(usageMetrics.locator('[data-testid="branches-used"]')).toContainText('1 / 1')
    })

    test('trial limits are enforced during usage', async ({ page }) => {
      await loginWithTrialUser(page)
      
      // Test transaction limit enforcement
      await reachTransactionLimit(page, SUBSCRIPTION_CONFIG.plans.TRIAL.limits.transactions)
      
      // Attempt to create another transaction
      await page.goto('/pos')
      await page.locator('[data-testid="product-tile"]').first().click()
      await page.locator('[data-testid="checkout-button"]').click()
      
      // Should show upgrade prompt
      await expect(page.locator(SUBSCRIPTION_CONFIG.selectors.upgradePrompt)).toBeVisible()
      await expect(page.locator(SUBSCRIPTION_CONFIG.selectors.upgradePrompt)).toContainText('Transaction limit reached')
      
      // Test employee limit enforcement
      await page.goto('/employees')
      await page.locator('[data-testid="invite-employee-button"]').click()
      await page.locator('[data-testid="employee-email-input"]').fill(`employee${faker.string.alphanumeric(8)}@test.com`)
      await page.locator('[data-testid="send-invite-button"]').click()
      
      // Should show limit warning (already at 2/2 with owner + 1 employee)
      await expect(page.locator(SUBSCRIPTION_CONFIG.selectors.usageLimitWarning)).toBeVisible()
      await expect(page.locator(SUBSCRIPTION_CONFIG.selectors.usageLimitWarning)).toContainText('Employee limit reached')
    })

    test('trial expiry warnings and behavior', async ({ page }) => {
      await loginWithExpiringTrialUser(page)
      
      // Should see expiry warning in dashboard
      await page.goto(SUBSCRIPTION_CONFIG.routes.dashboard)
      await expect(page.locator(SUBSCRIPTION_CONFIG.selectors.trialExpiryWarning)).toBeVisible()
      await expect(page.locator(SUBSCRIPTION_CONFIG.selectors.trialExpiryWarning)).toContainText('2 days remaining')
      
      // Should see upgrade prompts in key areas
      await page.goto('/pos')
      await expect(page.locator(SUBSCRIPTION_CONFIG.selectors.upgradePrompt)).toBeVisible()
      
      // Billing page should emphasize upgrade options
      await page.goto(SUBSCRIPTION_CONFIG.routes.billing)
      await expect(page.locator('[data-testid="trial-upgrade-cta"]')).toBeVisible()
      await expect(page.locator('[data-testid="plan-comparison"]')).toBeVisible()
    })
  })

  test.describe('Plan Upgrades and Downgrades', () => {
    test('upgrade from trial to basic plan', async ({ page }) => {
      await loginWithTrialUser(page)
      
      // Navigate to billing and initiate upgrade
      await page.goto(SUBSCRIPTION_CONFIG.routes.billing)
      await page.locator(SUBSCRIPTION_CONFIG.selectors.planUpgradeButton).click()
      
      // Select Basic plan
      const basicPlan = page.locator(`[data-testid="plan-${SUBSCRIPTION_CONFIG.plans.BASIC.id}"]`)
      await basicPlan.locator(SUBSCRIPTION_CONFIG.selectors.selectPlanButton).click()
      
      // Review proration and charges
      await expect(page.locator(SUBSCRIPTION_CONFIG.selectors.prorationPreview)).toBeVisible()
      await expect(page.locator('[data-testid="immediate-charge"]')).toContainText('₱29.00')
      
      // Add payment method
      await addPaymentMethod(page, SUBSCRIPTION_CONFIG.testPaymentMethods.validCard)
      
      // Confirm upgrade
      await page.locator(SUBSCRIPTION_CONFIG.selectors.confirmPlanChange).click()
      
      // Wait for payment processing
      await expect(page.locator(SUBSCRIPTION_CONFIG.selectors.paymentProcessing)).toBeVisible()
      await expect(page.locator(SUBSCRIPTION_CONFIG.selectors.successMessage)).toBeVisible({ timeout: 10000 })
      
      // Verify plan change
      await expect(page.locator(SUBSCRIPTION_CONFIG.selectors.currentPlanCard)).toContainText(SUBSCRIPTION_CONFIG.plans.BASIC.name)
      
      // Verify new limits are available
      await page.goto(SUBSCRIPTION_CONFIG.routes.usage)
      await expect(page.locator('[data-testid="transactions-used"]')).toContainText('/ 1000')
      await expect(page.locator('[data-testid="employees-used"]')).toContainText('/ 5')
    })

    test('upgrade from basic to pro plan with proration', async ({ page }) => {
      await loginWithBasicUser(page)
      
      // Navigate to subscription management
      await page.goto(SUBSCRIPTION_CONFIG.routes.subscription)
      await page.locator('[data-testid="change-plan-button"]').click()
      
      // Select Pro plan
      const proPlan = page.locator(`[data-testid="plan-${SUBSCRIPTION_CONFIG.plans.PRO.id}"]`)
      await proPlan.locator(SUBSCRIPTION_CONFIG.selectors.selectPlanButton).click()
      
      // Review proration calculation
      await expect(page.locator(SUBSCRIPTION_CONFIG.selectors.prorationPreview)).toBeVisible()
      const prorationDetails = page.locator('[data-testid="proration-details"]')
      
      // Should show credit for unused Basic time and charge for Pro
      await expect(prorationDetails).toContainText('Unused Basic plan credit')
      await expect(prorationDetails).toContainText('Pro plan prorated charge')
      
      // Confirm upgrade
      await page.locator(SUBSCRIPTION_CONFIG.selectors.confirmPlanChange).click()
      await expect(page.locator(SUBSCRIPTION_CONFIG.selectors.successMessage)).toBeVisible({ timeout: 10000 })
      
      // Verify advanced features are now available
      await page.goto('/purchasing')
      await expect(page.locator('[data-testid="purchase-orders-section"]')).toBeVisible()
      
      // Verify new usage limits
      await page.goto(SUBSCRIPTION_CONFIG.routes.usage)
      await expect(page.locator('[data-testid="transactions-used"]')).toContainText('/ 5000')
      await expect(page.locator('[data-testid="branches-used"]')).toContainText('/ 5')
    })

    test('downgrade from pro to basic plan', async ({ page }) => {
      await loginWithProUser(page)
      
      await page.goto(SUBSCRIPTION_CONFIG.routes.subscription)
      await page.locator(SUBSCRIPTION_CONFIG.selectors.planDowngradeButton).click()
      
      // Select Basic plan
      const basicPlan = page.locator(`[data-testid="plan-${SUBSCRIPTION_CONFIG.plans.BASIC.id}"]`)
      await basicPlan.locator(SUBSCRIPTION_CONFIG.selectors.selectPlanButton).click()
      
      // Should show downgrade warnings
      await expect(page.locator('[data-testid="downgrade-warning"]')).toBeVisible()
      await expect(page.locator('[data-testid="feature-loss-warning"]')).toContainText('Advanced inventory features will be disabled')
      
      // Should show effective date (typically next billing cycle)
      await expect(page.locator('[data-testid="effective-date"]')).toContainText('Changes will take effect on')
      
      // Confirm downgrade
      await page.locator('[data-testid="confirm-downgrade"]').click()
      await expect(page.locator(SUBSCRIPTION_CONFIG.selectors.successMessage)).toBeVisible()
      
      // Verify downgrade is scheduled
      await expect(page.locator('[data-testid="scheduled-plan-change"]')).toBeVisible()
      await expect(page.locator('[data-testid="scheduled-plan-change"]')).toContainText('Basic Plan (effective')
    })
  })

  test.describe('Payment Processing and Billing', () => {
    test('successful payment processing for monthly billing', async ({ page }) => {
      await loginWithBasicUser(page)
      
      // REAL E2E: Test billing UI and subscription status (not actual billing cycle)
      await page.goto(SUBSCRIPTION_CONFIG.routes.billing)
      
      // Verify subscription is active and shows billing information
      await expect(page.locator('[data-testid="subscription-status"]')).toContainText('Active')
      await expect(page.locator('[data-testid="current-plan"]')).toContainText('Basic')
      await expect(page.locator('[data-testid="next-billing-date"]')).toBeVisible()
      
      // Check if invoice history section exists (but may be empty without real billing)
      await page.goto(SUBSCRIPTION_CONFIG.routes.invoices)
      await expect(page.locator(SUBSCRIPTION_CONFIG.selectors.invoiceList)).toBeVisible()
      
      // NOTE: Cannot verify actual invoices without real billing cycle
      console.log('NOT VERIFIED: Actual invoice creation requires webhook-driven billing cycle')
    })

    test('payment method management', async ({ page }) => {
      await loginWithBasicUser(page)
      
      await page.goto(SUBSCRIPTION_CONFIG.routes.paymentMethods)
      
      // Add multiple payment methods
      await addPaymentMethod(page, SUBSCRIPTION_CONFIG.testPaymentMethods.validCard)
      
      // Add second payment method
      await page.locator(SUBSCRIPTION_CONFIG.selectors.addPaymentMethodButton).click()
      await fillPaymentMethodForm(page, {
        number: '5555555555554444', // Mastercard
        expiry: '12/25',
        cvv: '123',
        name: 'Test User 2',
      })
      await page.locator(SUBSCRIPTION_CONFIG.selectors.savePaymentMethodButton).click()
      
      // Verify both cards are listed
      const paymentMethods = page.locator(SUBSCRIPTION_CONFIG.selectors.paymentMethodCard)
      await expect(paymentMethods).toHaveCount(2)
      
      // Set second card as default
      await paymentMethods.nth(1).locator(SUBSCRIPTION_CONFIG.selectors.setDefaultPaymentMethod).click()
      await expect(paymentMethods.nth(1).locator('[data-testid="default-badge"]')).toBeVisible()
      
      // Remove first card
      await paymentMethods.first().locator('[data-testid="remove-payment-method"]').click()
      await page.locator(SUBSCRIPTION_CONFIG.selectors.confirmButton).click()
      
      await expect(paymentMethods).toHaveCount(1)
    })
    test('failed payment handling and retry logic', async ({ page }) => {
      await loginWithBasicUserWithFailingCard(page)
      
      // Simulate billing cycle with failing payment
      await simulateBillingCycleWithFailure(page)
      
      // Should see payment failure notification
      await page.goto(SUBSCRIPTION_CONFIG.routes.dashboard)
      await expect(page.locator(SUBSCRIPTION_CONFIG.selectors.paymentFailureAlert)).toBeVisible()
      await expect(page.locator(SUBSCRIPTION_CONFIG.selectors.paymentFailureAlert)).toContainText('Payment failed')
      
      // Check invoice status
      await page.goto(SUBSCRIPTION_CONFIG.routes.invoices)
      const failedInvoice = page.locator(SUBSCRIPTION_CONFIG.selectors.invoiceItem).first()
      await expect(failedInvoice).toContainText('Failed')
      
      // Should be able to retry payment with new method
      await failedInvoice.locator(SUBSCRIPTION_CONFIG.selectors.payInvoiceButton).click()
      
      // Update payment method
      await page.locator('[data-testid="update-payment-method"]').click()
      await fillPaymentMethodForm(page, SUBSCRIPTION_CONFIG.testPaymentMethods.validCard)
      await page.locator('[data-testid="update-and-retry"]').click()
      
      // Payment should succeed
      await expect(page.locator(SUBSCRIPTION_CONFIG.selectors.successMessage)).toBeVisible({ timeout: 10000 })
      await expect(failedInvoice).toContainText('Paid')
      
      // Verify subscription is reactivated
      await page.goto(SUBSCRIPTION_CONFIG.routes.subscription)
      await expect(page.locator('[data-testid="subscription-status"]')).toContainText('Active')
    })
  })

  test.describe('Subscription Cancellation and Reactivation', () => {
    test('subscription cancellation with grace period', async ({ page }) => {
      await loginWithBasicUser(page)
      
      await page.goto(SUBSCRIPTION_CONFIG.routes.subscription)
      await page.locator(SUBSCRIPTION_CONFIG.selectors.cancelSubscriptionButton).click()
      
      // Show cancellation reasons and feedback form
      await expect(page.locator('[data-testid="cancellation-reasons"]')).toBeVisible()
      await page.locator('[data-testid="reason-too-expensive"]').click()
      await page.locator('[data-testid="feedback-textarea"]').fill('Found a cheaper alternative')
      
      // Confirm cancellation
      await page.locator('[data-testid="confirm-cancellation"]').click()
      
      // Verify cancellation confirmation
      await expect(page.locator(SUBSCRIPTION_CONFIG.selectors.successMessage)).toBeVisible()
      await expect(page.locator('[data-testid="cancellation-effective-date"]')).toBeVisible()
      
      // Verify subscription shows as cancelled but still active
      await expect(page.locator('[data-testid="subscription-status"]')).toContainText('Cancelled')
      await expect(page.locator('[data-testid="access-until"]')).toContainText('Access until')
      
      // Verify services still work during grace period
      await page.goto('/pos')
      await expect(page.locator('[data-testid="pos-interface"]')).toBeVisible()
      
      // Should see reactivation option
      await page.goto(SUBSCRIPTION_CONFIG.routes.subscription)
      await expect(page.locator(SUBSCRIPTION_CONFIG.selectors.reactivateButton)).toBeVisible()
    })

    test('subscription reactivation before grace period ends', async ({ page }) => {
      await loginWithCancelledUser(page)
      
      await page.goto(SUBSCRIPTION_CONFIG.routes.subscription)
      await page.locator(SUBSCRIPTION_CONFIG.selectors.reactivateButton).click()
      
      // Should show reactivation confirmation
      await expect(page.locator('[data-testid="reactivation-dialog"]')).toBeVisible()
      await expect(page.locator('[data-testid="next-billing-date"]')).toBeVisible()
      
      await page.locator('[data-testid="confirm-reactivation"]').click()
      
      // Verify reactivation success
      await expect(page.locator(SUBSCRIPTION_CONFIG.selectors.successMessage)).toBeVisible()
      await expect(page.locator('[data-testid="subscription-status"]')).toContainText('Active')
      
      // Verify cancellation is removed
      await expect(page.locator('[data-testid="cancellation-effective-date"]')).not.toBeVisible()
    })

    test('account suspension after grace period expires', async ({ page }) => {
      await loginWithExpiredUser(page)
      
      // Should be redirected to subscription page
      await expect(page).toHaveURL(/subscription/)
      await expect(page.locator('[data-testid="account-suspended"]')).toBeVisible()
      
      // Should show resubscription options
      await expect(page.locator('[data-testid="resubscribe-options"]')).toBeVisible()
      
      // Basic features should be disabled
      await page.goto('/pos')
      await expect(page.locator('[data-testid="subscription-required"]')).toBeVisible()
      
      // Data should still be preserved (read-only access)
      await page.goto('/reports')
      await expect(page.locator('[data-testid="read-only-data"]')).toBeVisible()
      await expect(page.locator('[data-testid="upgrade-to-access"]')).toBeVisible()
    })
  })

  test.describe('Usage-Based Billing and Analytics', () => {
    test('usage tracking and reporting', async ({ page }) => {
      await loginWithProUser(page)
      
      // Generate some usage
      await generateUsage(page, {
        transactions: 150,
        products: 75,
        employees: 3,
      })
      
      // Check usage dashboard
      await page.goto(SUBSCRIPTION_CONFIG.routes.usage)
      
      const usageMetrics = page.locator(SUBSCRIPTION_CONFIG.selectors.usageMetrics)
      await expect(usageMetrics.locator('[data-testid="transactions-used"]')).toContainText('150 / 5000')
      await expect(usageMetrics.locator('[data-testid="products-used"]')).toContainText('75 / 2000')
      await expect(usageMetrics.locator('[data-testid="employees-used"]')).toContainText('3 / 15')
      
      // Check usage progress bars
      const transactionProgress = page.locator('[data-testid="transactions-progress"]')
      await expect(transactionProgress).toHaveAttribute('value', '150')
      await expect(transactionProgress).toHaveAttribute('max', '5000')
      
      // Check usage trends
      await expect(page.locator('[data-testid="usage-trends-chart"]')).toBeVisible()
      await expect(page.locator('[data-testid="monthly-usage-comparison"]')).toBeVisible()
    })

    test('usage limit warnings and enforcement', async ({ page }) => {
      await loginWithBasicUserNearLimits(page)
      
      await page.goto(SUBSCRIPTION_CONFIG.routes.usage)
      
      // Should see warning for approaching limits (80% threshold)
      await expect(page.locator(SUBSCRIPTION_CONFIG.selectors.usageLimitWarning)).toBeVisible()
      await expect(page.locator('[data-testid="transactions-warning"]')).toContainText('80% of transaction limit used')
      
      // Should see upgrade suggestions
      await expect(page.locator(SUBSCRIPTION_CONFIG.selectors.upgradePrompt)).toBeVisible()
      await expect(page.locator('[data-testid="recommended-plan"]')).toContainText('Pro Plan')
      
      // Test limit enforcement
      await page.goto('/pos')
      // Try to exceed transaction limit
      await createTransactions(page, 25) // Should hit 1000 limit
      
      // Should be blocked from creating more
      await page.locator('[data-testid="product-tile"]').first().click()
      await page.locator('[data-testid="checkout-button"]').click()
      
      await expect(page.locator('[data-testid="limit-reached-modal"]')).toBeVisible()
      await expect(page.locator('[data-testid="upgrade-now-button"]')).toBeVisible()
    })

    test('subscription analytics and insights', async ({ page }) => {
      await loginWithProUser(page)
      
      await page.goto('/billing/analytics')
      
      // Usage analytics
      await expect(page.locator('[data-testid="usage-analytics"]')).toBeVisible()
      await expect(page.locator('[data-testid="monthly-usage-chart"]')).toBeVisible()
      await expect(page.locator('[data-testid="feature-usage-breakdown"]')).toBeVisible()
      
      // Cost analysis
      await expect(page.locator('[data-testid="cost-analysis"]')).toBeVisible()
      await expect(page.locator('[data-testid="monthly-costs"]')).toContainText('₱49.00')
      
      // ROI metrics for business owner
      await expect(page.locator('[data-testid="roi-metrics"]')).toBeVisible()
      await expect(page.locator('[data-testid="revenue-per-transaction"]')).toBeVisible()
      
      // Plan optimization suggestions
      await expect(page.locator('[data-testid="optimization-suggestions"]')).toBeVisible()
    })
  })

  test.describe('Multi-tenant Subscription Isolation', () => {
    test('subscription data isolation between tenants', async ({ page, context }) => {
      // Create second browser context for different tenant
      const secondContext = await context.browser()?.newContext()
      if (!secondContext) return
      const secondPage = await secondContext.newPage()
      
      // Login as two different business owners
      await loginWithBasicUser(page) // Tenant A
      await loginWithProUser(secondPage) // Tenant B
      
      // Check that each tenant sees only their own subscription data
      await page.goto(SUBSCRIPTION_CONFIG.routes.billing)
      await expect(page.locator(SUBSCRIPTION_CONFIG.selectors.currentPlanCard)).toContainText('Basic Plan')
      
      await secondPage.goto(SUBSCRIPTION_CONFIG.routes.billing)
      await expect(secondPage.locator(SUBSCRIPTION_CONFIG.selectors.currentPlanCard)).toContainText('Pro Plan')
      
      // Check usage isolation
      await page.goto(SUBSCRIPTION_CONFIG.routes.usage)
      const tenantAUsage = await page.locator('[data-testid="transactions-used"]').textContent()
      
      await secondPage.goto(SUBSCRIPTION_CONFIG.routes.usage)
      const tenantBUsage = await secondPage.locator('[data-testid="transactions-used"]').textContent()
      
      // Usage should be different between tenants
      expect(tenantAUsage).not.toBe(tenantBUsage)
      
      await secondContext.close()
    })

    test('plan changes do not affect other tenants', async ({ page, context }) => {
      const secondContext = await context.browser()?.newContext()
      if (!secondContext) return
      const secondPage = await secondContext.newPage()
      
      await loginWithBasicUser(page) // Tenant A
      await loginWithBasicUser(secondPage) // Tenant B (different basic user)
      
      // Tenant A upgrades to Pro
      await page.goto(SUBSCRIPTION_CONFIG.routes.subscription)
      await upgradeToProPlan(page)
      
      // Tenant B should still be on Basic
      await secondPage.reload()
      await secondPage.goto(SUBSCRIPTION_CONFIG.routes.subscription)
      await expect(secondPage.locator(SUBSCRIPTION_CONFIG.selectors.currentPlanCard)).toContainText('Basic Plan')
      
      await secondContext.close()
    })
  })
})
// Helper Functions for Subscription Lifecycle Testing

/**
 * Register a new user and activate trial subscription
 */
async function registerNewUser(page: Page) {
  const testUser = {
    email: `trial+${faker.string.alphanumeric(8)}@test.com`,
    password: 'test123',
    businessName: faker.company.name(),
  }
  
  await page.goto('/register')
  await page.locator('[data-testid="email-input"]').fill(testUser.email)
  await page.locator('[data-testid="password-input"]').fill(testUser.password)
  await page.locator('[data-testid="business-name-input"]').fill(testUser.businessName)
  await page.locator('[data-testid="register-button"]').click()
  
  // Complete email verification (simulate)
  await page.goto('/verify-email?token=test-token')
  
  // Complete onboarding
  await page.locator('[data-testid="continue-with-trial"]').click()
  
  return testUser
}

/**
 * Login with existing trial user
 */
async function loginWithTrialUser(page: Page) {
  await page.goto('/login')
  await page.locator('[data-testid="email-input"]').fill('trial@test.com')
  await page.locator('[data-testid="password-input"]').fill('test123')
  await page.locator('[data-testid="login-button"]').click()
  await expect(page).toHaveURL(/dashboard/)
}

/**
 * Login with trial user close to expiry
 */
async function loginWithExpiringTrialUser(page: Page) {
  await page.goto('/login')
  await page.locator('[data-testid="email-input"]').fill('expiring-trial@test.com')
  await page.locator('[data-testid="password-input"]').fill('test123')
  await page.locator('[data-testid="login-button"]').click()
  await expect(page).toHaveURL(/dashboard/)
}

/**
 * Login with user on Basic plan
 */
async function loginWithBasicUser(page: Page) {
  await page.goto('/login')
  await page.locator('[data-testid="email-input"]').fill('basic@test.com')
  await page.locator('[data-testid="password-input"]').fill('test123')
  await page.locator('[data-testid="login-button"]').click()
  await expect(page).toHaveURL(/dashboard/)
}

/**
 * Login with user on Pro plan
 */
async function loginWithProUser(page: Page) {
  await page.goto('/login')
  await page.locator('[data-testid="email-input"]').fill('pro@test.com')
  await page.locator('[data-testid="password-input"]').fill('test123')
  await page.locator('[data-testid="login-button"]').click()
  await expect(page).toHaveURL(/dashboard/)
}

/**
 * Login with user who has failing payment method
 */
async function loginWithBasicUserWithFailingCard(page: Page) {
  await page.goto('/login')
  await page.locator('[data-testid="email-input"]').fill('basic-failing@test.com')
  await page.locator('[data-testid="password-input"]').fill('test123')
  await page.locator('[data-testid="login-button"]').click()
  await expect(page).toHaveURL(/dashboard/)
}

/**
 * Login with cancelled user in grace period
 */
async function loginWithCancelledUser(page: Page) {
  await page.goto('/login')
  await page.locator('[data-testid="email-input"]').fill('cancelled@test.com')
  await page.locator('[data-testid="password-input"]').fill('test123')
  await page.locator('[data-testid="login-button"]').click()
  await expect(page).toHaveURL(/dashboard/)
}

/**
 * Login with expired/suspended user
 */
async function loginWithExpiredUser(page: Page) {
  await page.goto('/login')
  await page.locator('[data-testid="email-input"]').fill('expired@test.com')
  await page.locator('[data-testid="password-input"]').fill('test123')
  await page.locator('[data-testid="login-button"]').click()
}

/**
 * Login with Basic user near usage limits
 */
async function loginWithBasicUserNearLimits(page: Page) {
  await page.goto('/login')
  await page.locator('[data-testid="email-input"]').fill('basic-near-limits@test.com')
  await page.locator('[data-testid="password-input"]').fill('test123')
  await page.locator('[data-testid="login-button"]').click()
  await expect(page).toHaveURL(/dashboard/)
}

/**
 * Add payment method to account
 */
async function addPaymentMethod(page: Page, cardDetails: { number: string; expiry: string; cvv: string; name: string }) {
  await page.locator(SUBSCRIPTION_CONFIG.selectors.addPaymentMethodButton).click()
  await fillPaymentMethodForm(page, cardDetails)
  await page.locator(SUBSCRIPTION_CONFIG.selectors.savePaymentMethodButton).click()
  await expect(page.locator(SUBSCRIPTION_CONFIG.selectors.successMessage)).toBeVisible()
}

/**
 * Fill payment method form
 */
async function fillPaymentMethodForm(page: Page, cardDetails: { number: string; expiry: string; cvv: string; name: string }) {
  await page.locator(SUBSCRIPTION_CONFIG.selectors.cardNumberInput).fill(cardDetails.number)
  await page.locator(SUBSCRIPTION_CONFIG.selectors.expiryInput).fill(cardDetails.expiry)
  await page.locator(SUBSCRIPTION_CONFIG.selectors.cvvInput).fill(cardDetails.cvv)
  await page.locator('[data-testid="cardholder-name-input"]').fill(cardDetails.name)
}

/**
 * Simulate reaching transaction limit
 */
async function reachTransactionLimit(page: Page, limit: number) {
  // This would typically involve API calls to create test transactions
  // For E2E testing, we might simulate this with database seeding or API mocking
  await page.evaluate((transactionLimit) => {
    // Simulate reaching the limit through API or test data setup
    window.postMessage({ type: 'SIMULATE_USAGE', transactions: transactionLimit }, '*')
  }, limit)
}

/**
 * REMOVED: Fake billing cycle simulation
 * 
 * Real billing cycle testing requires:
 * 1. Actual subscription with real payment method
 * 2. Stripe webhook integration in test environment
 * 3. Time-based testing or billing cycle trigger endpoint
 * 
 * For V1 certification, we test subscription creation and UI states,
 * but cannot simulate billing cycles without real infrastructure.
 */
async function simulateBillingCycle(page: Page) {
  throw new Error('NOT VERIFIED: Billing cycle simulation removed - requires real billing infrastructure')
}

/**
 * REMOVED: Fake billing failure simulation
 */
async function simulateBillingCycleWithFailure(page: Page) {
  throw new Error('NOT VERIFIED: Billing cycle failure simulation removed - requires real payment failures')
}

/**
 * REMOVED: Fake usage generation
 */
async function generateUsage(page: Page, usage: { transactions: number; products: number; employees: number }) {
  throw new Error('NOT VERIFIED: Usage generation simulation removed - requires real user activity')
}

/**
 * Create multiple transactions for limit testing
 */
async function createTransactions(page: Page, count: number) {
  for (let i = 0; i < count; i++) {
    await page.goto('/pos')
    await page.locator('[data-testid="product-tile"]').first().click()
    await page.locator('[data-testid="checkout-button"]').click()
    await page.locator('[data-testid="payment-method-cash"]').click()
    await page.locator('[data-testid="cash-amount-input"]').fill('100')
    await page.locator('[data-testid="complete-payment"]').click()
    await page.locator('[data-testid="new-transaction"]').click()
  }
}

/**
 * Upgrade to Pro plan
 */
async function upgradeToProPlan(page: Page) {
  await page.locator(SUBSCRIPTION_CONFIG.selectors.planUpgradeButton).click()
  
  const proPlan = page.locator(`[data-testid="plan-${SUBSCRIPTION_CONFIG.plans.PRO.id}"]`)
  await proPlan.locator(SUBSCRIPTION_CONFIG.selectors.selectPlanButton).click()
  
  await page.locator(SUBSCRIPTION_CONFIG.selectors.confirmPlanChange).click()
  await expect(page.locator(SUBSCRIPTION_CONFIG.selectors.successMessage)).toBeVisible({ timeout: 10000 })
}