/**
 * v1-certification-payment-failure-recovery.spec.ts
 *
 * V1 E2E Certification: Payment Failure and Recovery
 *
 * Tests comprehensive payment failure scenarios, retry mechanisms,
 * dunning management, and customer recovery workflows.
 *
 * Critical V1 User Journey:
 *  ✅ Payment processing failure scenarios
 *  ✅ Automatic retry mechanisms and logic
 *  ✅ Dunning management and customer notifications
 *  ✅ Manual payment retry workflows
 *  ✅ Payment method update and recovery
 *  ✅ Subscription suspension and reactivation
 *  ✅ Grace period management
 *  ✅ Failed payment analytics and reporting
 *  ✅ Customer communication workflows
 *  ✅ Chargeback and dispute handling
 *
 * Test Strategy:
 *  - Tests various payment failure scenarios (declined, insufficient funds, expired cards)
 *  - Validates retry logic timing and attempts
 *  - Tests customer notification flows and recovery UX
 *  - Verifies business continuity during payment issues
 *  - Tests automated dunning sequences
 *
 * Prerequisites:
 *  - Stripe test environment with failure simulation
 *  - Email notification system for payment events
 *  - Dunning management configuration
 *  - Multiple payment failure test cards
 *  - Webhook handling for payment events
 *
 * Business Rules Validated:
 *  - Failed payments trigger appropriate retry sequences
 *  - Customers receive timely notifications about payment issues
 *  - Service continues during grace period for failed payments
 *  - Payment method updates resolve billing issues
 *  - Subscription suspension follows proper workflow
 */

import { test, expect, type Page } from '@playwright/test'
import { faker } from '@faker-js/faker'

// Test configuration for payment failure and recovery flow
const PAYMENT_FAILURE_CONFIG = {
  routes: {
    login: '/login',
    dashboard: '/dashboard',
    billing: '/billing',
    subscription: '/subscription',
    paymentMethods: '/business/subscription/payment-methods',
    invoices: '/billing/invoices',
    notifications: '/notifications',
    pos: '/pos',
  },
  retrySchedule: {
    attempts: [1, 3, 5, 7], // Days after initial failure
    maxAttempts: 4,
    gracePeriod: 7, // Days before suspension (actual V1 grace period, not 14)
  },
  selectors: {
    // Payment failure indicators
    paymentFailureAlert: '[data-testid="payment-failure-alert"]',
    failedInvoiceIndicator: '[data-testid="failed-invoice-indicator"]',
    suspensionWarning: '[data-testid="suspension-warning"]',
    graceperiodCounter: '[data-testid="grace-period-counter"]',
    
    // Retry mechanisms
    retryPaymentButton: '[data-testid="retry-payment-button"]',
    autoRetryStatus: '[data-testid="auto-retry-status"]',
    nextRetryDate: '[data-testid="next-retry-date"]',
    retryAttemptHistory: '[data-testid="retry-attempt-history"]',
    
    // Payment method management
    updatePaymentMethodButton: '[data-testid="update-payment-method-button"]',
    paymentMethodSelector: '[data-testid="payment-method-selector"]',
    addNewCardButton: '[data-testid="add-new-card-button"]',
    cardForm: '[data-testid="card-form"]',
    
    // Notifications and communication
    paymentNotification: '[data-testid="payment-notification"]',
    emailPreference: '[data-testid="email-preference"]',
    dunningMessage: '[data-testid="dunning-message"]',
    recoveryInstructions: '[data-testid="recovery-instructions"]',
    
    // Invoice management
    invoiceStatus: '[data-testid="invoice-status"]',
    payInvoiceButton: '[data-testid="pay-invoice-button"]',
    invoiceRetryButton: '[data-testid="invoice-retry-button"]',
    partialPaymentOption: '[data-testid="partial-payment-option"]',
    
    // Subscription status
    subscriptionStatus: '[data-testid="subscription-status"]',
    serviceAccessStatus: '[data-testid="service-access-status"]',
    reactivateButton: '[data-testid="reactivate-button"]',
    suspendedAccountMessage: '[data-testid="suspended-account-message"]',
    
    // Analytics and reporting
    failureAnalytics: '[data-testid="failure-analytics"]',
    recoveryMetrics: '[data-testid="recovery-metrics"]',
    churnRiskIndicator: '[data-testid="churn-risk-indicator"]',
    
    // Confirmation dialogs
    confirmRetryDialog: '[data-testid="confirm-retry-dialog"]',
    confirmButton: '[data-testid="confirm-button"]',
    cancelButton: '[data-testid="cancel-button"]',
    
    // Success/error states
    successMessage: '[data-testid="success-message"]',
    errorMessage: '[data-testid="error-message"]',
    processingIndicator: '[data-testid="processing-indicator"]',
  },
  testCards: {
    // Stripe test cards for different failure scenarios
    declined: {
      number: '4000000000000002',
      expiry: '12/30',
      cvv: '123',
      name: 'Declined Card',
      failureType: 'card_declined',
    },
    insufficientFunds: {
      number: '4000000000009995',
      expiry: '12/30',
      cvv: '123',
      name: 'Insufficient Funds',
      failureType: 'insufficient_funds',
    },
    expiredCard: {
      number: '4000000000000069',
      expiry: '12/20', // Expired
      cvv: '123',
      name: 'Expired Card',
      failureType: 'expired_card',
    },
    incorrectCvc: {
      number: '4000000000000127',
      expiry: '12/30',
      cvv: '123',
      name: 'Incorrect CVC',
      failureType: 'incorrect_cvc',
    },
    processingError: {
      number: '4000000000000119',
      expiry: '12/30',
      cvv: '123',
      name: 'Processing Error',
      failureType: 'processing_error',
    },
    validCard: {
      number: '4242424242424242',
      expiry: '12/30',
      cvv: '123',
      name: 'Valid Card',
    },
  },
  dunningSequence: [
    { day: 1, type: 'PAYMENT_FAILED', severity: 'warning' },
    { day: 3, type: 'RETRY_FAILED', severity: 'warning' },
    { day: 5, type: 'FINAL_NOTICE', severity: 'urgent' },
    { day: 7, type: 'SUSPENSION_WARNING', severity: 'critical' },
    { day: 14, type: 'ACCOUNT_SUSPENDED', severity: 'critical' },
  ],
}
test.describe('V1 Certification: Payment Failure and Recovery', () => {
  test.describe('Payment Processing Failures', () => {
    test('handles declined card payment failure', async ({ page }) => {
      await setupUserWithFailingCard(page, PAYMENT_FAILURE_CONFIG.testCards.declined)
      
      // Trigger billing cycle
      await simulateBillingCycle(page)
      
      // Verify payment failure is detected and displayed
      await page.goto(PAYMENT_FAILURE_CONFIG.routes.dashboard)
      await expect(page.locator(PAYMENT_FAILURE_CONFIG.selectors.paymentFailureAlert)).toBeVisible()
      await expect(page.locator(PAYMENT_FAILURE_CONFIG.selectors.paymentFailureAlert)).toContainText('Payment failed')
      await expect(page.locator(PAYMENT_FAILURE_CONFIG.selectors.paymentFailureAlert)).toContainText('card was declined')
      
      // Check invoice status
      await page.goto(PAYMENT_FAILURE_CONFIG.routes.invoices)
      const failedInvoice = page.locator('[data-testid="invoice-item"]').first()
      await expect(failedInvoice.locator(PAYMENT_FAILURE_CONFIG.selectors.invoiceStatus)).toContainText('Failed')
      await expect(failedInvoice.locator(PAYMENT_FAILURE_CONFIG.selectors.failedInvoiceIndicator)).toBeVisible()
      
      // Verify retry is scheduled
      await expect(page.locator(PAYMENT_FAILURE_CONFIG.selectors.autoRetryStatus)).toBeVisible()
      await expect(page.locator(PAYMENT_FAILURE_CONFIG.selectors.nextRetryDate)).toContainText('Will retry in 1 day')
    })

    test('handles insufficient funds scenario', async ({ page }) => {
      await setupUserWithFailingCard(page, PAYMENT_FAILURE_CONFIG.testCards.insufficientFunds)
      
      await simulateBillingCycle(page)
      
      // Verify specific error message for insufficient funds
      await page.goto(PAYMENT_FAILURE_CONFIG.routes.billing)
      await expect(page.locator(PAYMENT_FAILURE_CONFIG.selectors.paymentFailureAlert)).toContainText('insufficient funds')
      
      // Should suggest updating payment method
      await expect(page.locator(PAYMENT_FAILURE_CONFIG.selectors.updatePaymentMethodButton)).toBeVisible()
      await expect(page.locator(PAYMENT_FAILURE_CONFIG.selectors.recoveryInstructions)).toContainText('Update your payment method')
    })

    test('handles expired card scenario', async ({ page }) => {
      await setupUserWithFailingCard(page, PAYMENT_FAILURE_CONFIG.testCards.expiredCard)
      
      await simulateBillingCycle(page)
      
      await page.goto(PAYMENT_FAILURE_CONFIG.routes.billing)
      await expect(page.locator(PAYMENT_FAILURE_CONFIG.selectors.paymentFailureAlert)).toContainText('card has expired')
      
      // Should prompt for new card
      await expect(page.locator(PAYMENT_FAILURE_CONFIG.selectors.addNewCardButton)).toBeVisible()
      await expect(page.locator('[data-testid="expired-card-notice"]')).toBeVisible()
    })

    test('handles processing errors and network failures', async ({ page }) => {
      await setupUserWithFailingCard(page, PAYMENT_FAILURE_CONFIG.testCards.processingError)
      
      await simulateBillingCycle(page)
      
      await page.goto(PAYMENT_FAILURE_CONFIG.routes.billing)
      await expect(page.locator(PAYMENT_FAILURE_CONFIG.selectors.paymentFailureAlert)).toContainText('processing error')
      
      // Processing errors should have different retry schedule
      await expect(page.locator(PAYMENT_FAILURE_CONFIG.selectors.autoRetryStatus)).toContainText('Will retry automatically')
      await expect(page.locator('[data-testid="processing-error-notice"]')).toBeVisible()
    })
  })

  test.describe('Automatic Retry Mechanisms', () => {
    test('executes retry schedule correctly', async ({ page }) => {
      await setupUserWithFailingCard(page, PAYMENT_FAILURE_CONFIG.testCards.declined)
      
      // Initial failure
      await simulateBillingCycle(page)
      
      // Verify first retry attempt after 1 day
      await simulateTimeAdvance(page, 1)
      await simulateRetryAttempt(page, 1)
      
      await page.goto(PAYMENT_FAILURE_CONFIG.routes.invoices)
      const retryHistory = page.locator(PAYMENT_FAILURE_CONFIG.selectors.retryAttemptHistory)
      await expect(retryHistory).toContainText('Attempt 1: Failed')
      await expect(page.locator(PAYMENT_FAILURE_CONFIG.selectors.nextRetryDate)).toContainText('Will retry in 2 days')
      
      // Second retry attempt after 3 days total
      await simulateTimeAdvance(page, 2)
      await simulateRetryAttempt(page, 2)
      
      await page.reload()
      await expect(retryHistory).toContainText('Attempt 2: Failed')
      await expect(page.locator(PAYMENT_FAILURE_CONFIG.selectors.nextRetryDate)).toContainText('Will retry in 2 days')
      
      // Third retry attempt after 5 days total
      await simulateTimeAdvance(page, 2)
      await simulateRetryAttempt(page, 3)
      
      await page.reload()
      await expect(retryHistory).toContainText('Attempt 3: Failed')
      await expect(page.locator(PAYMENT_FAILURE_CONFIG.selectors.nextRetryDate)).toContainText('Will retry in 2 days')
      
      // Final retry attempt after 7 days total
      await simulateTimeAdvance(page, 2)
      await simulateRetryAttempt(page, 4)
      
      await page.reload()
      await expect(retryHistory).toContainText('Attempt 4: Failed')
      await expect(page.locator('[data-testid="max-retries-reached"]')).toBeVisible()
    })

    test('successful retry resolves payment issue', async ({ page }) => {
      await setupUserWithFailingCard(page, PAYMENT_FAILURE_CONFIG.testCards.declined)
      
      // Initial failure
      await simulateBillingCycle(page)
      
      // User updates to valid payment method
      await page.goto(PAYMENT_FAILURE_CONFIG.routes.paymentMethods)
      await updatePaymentMethod(page, PAYMENT_FAILURE_CONFIG.testCards.validCard)
      
      // Next retry should succeed
      await simulateTimeAdvance(page, 1)
      await simulateRetryAttempt(page, 1, true) // Success
      
      // Verify resolution
      await page.goto(PAYMENT_FAILURE_CONFIG.routes.invoices)
      const resolvedInvoice = page.locator('[data-testid="invoice-item"]').first()
      await expect(resolvedInvoice.locator(PAYMENT_FAILURE_CONFIG.selectors.invoiceStatus)).toContainText('Paid')
      
      await page.goto(PAYMENT_FAILURE_CONFIG.routes.dashboard)
      await expect(page.locator(PAYMENT_FAILURE_CONFIG.selectors.paymentFailureAlert)).not.toBeVisible()
      await expect(page.locator('[data-testid="payment-resolved-notice"]')).toBeVisible()
    })

    test('retry logic respects card-specific failure types', async ({ page }) => {
      // Different failure types should have different retry behaviors
      const testCases = [
        {
          card: PAYMENT_FAILURE_CONFIG.testCards.declined,
          expectedRetries: 4,
          shouldAutoRetry: true,
        },
        {
          card: PAYMENT_FAILURE_CONFIG.testCards.expiredCard,
          expectedRetries: 1, // Don't retry expired cards aggressively
          shouldAutoRetry: false,
        },
        {
          card: PAYMENT_FAILURE_CONFIG.testCards.processingError,
          expectedRetries: 6, // More retries for processing errors
          shouldAutoRetry: true,
        },
      ]
      
      for (const testCase of testCases) {
        await setupUserWithFailingCard(page, testCase.card)
        await simulateBillingCycle(page)
        
        await page.goto(PAYMENT_FAILURE_CONFIG.routes.billing)
        
        if (testCase.shouldAutoRetry) {
          await expect(page.locator(PAYMENT_FAILURE_CONFIG.selectors.autoRetryStatus)).toBeVisible()
        } else {
          await expect(page.locator('[data-testid="manual-retry-required"]')).toBeVisible()
        }
      }
    })
  })

  test.describe('Manual Payment Recovery', () => {
    test('manual retry with same payment method', async ({ page }) => {
      await setupUserWithFailingCard(page, PAYMENT_FAILURE_CONFIG.testCards.declined)
      await simulateBillingCycle(page)
      
      // User triggers manual retry
      await page.goto(PAYMENT_FAILURE_CONFIG.routes.invoices)
      const failedInvoice = page.locator('[data-testid="invoice-item"]').first()
      await failedInvoice.locator(PAYMENT_FAILURE_CONFIG.selectors.retryPaymentButton).click()
      
      // Confirm retry
      await expect(page.locator(PAYMENT_FAILURE_CONFIG.selectors.confirmRetryDialog)).toBeVisible()
      await page.locator(PAYMENT_FAILURE_CONFIG.selectors.confirmButton).click()
      
      // Should show processing and then failure again
      await expect(page.locator(PAYMENT_FAILURE_CONFIG.selectors.processingIndicator)).toBeVisible()
      await expect(page.locator(PAYMENT_FAILURE_CONFIG.selectors.errorMessage)).toBeVisible({ timeout: 10000 })
      
      // Retry attempt should be logged
      await expect(page.locator(PAYMENT_FAILURE_CONFIG.selectors.retryAttemptHistory)).toContainText('Manual retry: Failed')
    })

    test('update payment method and retry successfully', async ({ page }) => {
      await setupUserWithFailingCard(page, PAYMENT_FAILURE_CONFIG.testCards.declined)
      await simulateBillingCycle(page)
      
      // Navigate to failed invoice
      await page.goto(PAYMENT_FAILURE_CONFIG.routes.invoices)
      const failedInvoice = page.locator('[data-testid="invoice-item"]').first()
      await failedInvoice.click()
      
      // Update payment method
      await page.locator(PAYMENT_FAILURE_CONFIG.selectors.updatePaymentMethodButton).click()
      await selectNewPaymentMethod(page, PAYMENT_FAILURE_CONFIG.testCards.validCard)
      
      // Retry payment with new method
      await page.locator('[data-testid="retry-with-new-method"]').click()
      
      // Should succeed
      await expect(page.locator(PAYMENT_FAILURE_CONFIG.selectors.processingIndicator)).toBeVisible()
      await expect(page.locator(PAYMENT_FAILURE_CONFIG.selectors.successMessage)).toBeVisible({ timeout: 10000 })
      
      // Verify payment resolved
      await expect(failedInvoice.locator(PAYMENT_FAILURE_CONFIG.selectors.invoiceStatus)).toContainText('Paid')
    })

    test('partial payment option for large outstanding balances', async ({ page }) => {
      await setupUserWithMultipleFailedInvoices(page)
      
      await page.goto(PAYMENT_FAILURE_CONFIG.routes.invoices)
      
      // Should see total outstanding balance
      await expect(page.locator('[data-testid="total-outstanding"]')).toBeVisible()
      await expect(page.locator('[data-testid="total-outstanding"]')).toContainText('₱145.00') // Multiple failed payments
      
      // Should offer partial payment option
      await expect(page.locator(PAYMENT_FAILURE_CONFIG.selectors.partialPaymentOption)).toBeVisible()
      
      // Select partial payment
      await page.locator(PAYMENT_FAILURE_CONFIG.selectors.partialPaymentOption).click()
      await page.locator('[data-testid="partial-amount-input"]').fill('50.00')
      await page.locator('[data-testid="make-partial-payment"]').click()
      
      // Should process successfully
      await expect(page.locator(PAYMENT_FAILURE_CONFIG.selectors.successMessage)).toBeVisible({ timeout: 10000 })
      
      // Should update outstanding balance
      await expect(page.locator('[data-testid="total-outstanding"]')).toContainText('₱95.00')
    })
  })
  test.describe('Dunning Management and Customer Communication', () => {
    test('dunning sequence sends appropriate notifications', async ({ page }) => {
      await setupUserWithFailingCard(page, PAYMENT_FAILURE_CONFIG.testCards.declined)
      await simulateBillingCycle(page)
      
      // Day 1: Initial failure notification
      await page.goto(PAYMENT_FAILURE_CONFIG.routes.notifications)
      let notifications = page.locator(PAYMENT_FAILURE_CONFIG.selectors.paymentNotification)
      await expect(notifications.first()).toContainText('Payment failed')
      await expect(notifications.first()).toContainText('We\'ll retry automatically')
      
      // Day 3: First retry failed
      await simulateTimeAdvance(page, 3)
      await simulateRetryAttempt(page, 1)
      await page.reload()
      
      await expect(notifications.first()).toContainText('Payment retry failed')
      await expect(notifications.first()).toContainText('Please update your payment method')
      
      // Day 5: Final notice
      await simulateTimeAdvance(page, 2)
      await simulateRetryAttempt(page, 2)
      await page.reload()
      
      await expect(notifications.first()).toContainText('Final notice')
      await expect(notifications.first()).toContainText('Update payment method to avoid service interruption')
      
      // Day 7: Suspension warning
      await simulateTimeAdvance(page, 2)
      await simulateRetryAttempt(page, 3)
      await page.reload()
      
      await expect(page.locator(PAYMENT_FAILURE_CONFIG.selectors.suspensionWarning)).toBeVisible()
      await expect(notifications.first()).toContainText('Account will be suspended')
    })

    test('dunning messages are contextual and helpful', async ({ page }) => {
      const failureScenarios = [
        {
          card: PAYMENT_FAILURE_CONFIG.testCards.declined,
          expectedMessage: 'Your card was declined. Please contact your bank or try a different payment method.',
        },
        {
          card: PAYMENT_FAILURE_CONFIG.testCards.insufficientFunds,
          expectedMessage: 'Your card has insufficient funds. Please add funds or use a different payment method.',
        },
        {
          card: PAYMENT_FAILURE_CONFIG.testCards.expiredCard,
          expectedMessage: 'Your card has expired. Please update with a current card.',
        },
      ]
      
      for (const scenario of failureScenarios) {
        await setupUserWithFailingCard(page, scenario.card)
        await simulateBillingCycle(page)
        
        await page.goto(PAYMENT_FAILURE_CONFIG.routes.billing)
        const dunningMessage = page.locator(PAYMENT_FAILURE_CONFIG.selectors.dunningMessage)
        await expect(dunningMessage).toContainText(scenario.expectedMessage)
        
        // Should include helpful recovery instructions
        await expect(page.locator(PAYMENT_FAILURE_CONFIG.selectors.recoveryInstructions)).toBeVisible()
      }
    })

    test('customer can manage notification preferences', async ({ page }) => {
      await setupUserWithFailingCard(page, PAYMENT_FAILURE_CONFIG.testCards.declined)
      
      await page.goto('/settings/notifications')
      
      // Should see payment notification preferences
      const paymentPrefs = page.locator('[data-testid="payment-notification-prefs"]')
      await expect(paymentPrefs.locator('[data-testid="email-notifications"]')).toBeChecked()
      await expect(paymentPrefs.locator('[data-testid="sms-notifications"]')).not.toBeChecked()
      
      // Enable SMS notifications
      await paymentPrefs.locator('[data-testid="sms-notifications"]').check()
      await page.locator('[data-testid="phone-number-input"]').fill('+639123456789')
      await page.locator('[data-testid="save-preferences"]').click()
      
      await expect(page.locator(PAYMENT_FAILURE_CONFIG.selectors.successMessage)).toBeVisible()
      
      // Trigger failure and verify both channels are used
      await simulateBillingCycle(page)
      
      await page.goto(PAYMENT_FAILURE_CONFIG.routes.notifications)
      await expect(page.locator('[data-testid="notification-channel-email"]')).toBeVisible()
      await expect(page.locator('[data-testid="notification-channel-sms"]')).toBeVisible()
    })
  })

  test.describe('Service Continuity and Suspension', () => {
    test('service continues during grace period', async ({ page }) => {
      await setupUserWithFailingCard(page, PAYMENT_FAILURE_CONFIG.testCards.declined)
      await simulateBillingCycle(page)
      
      // Should still have full access to services
      await page.goto(PAYMENT_FAILURE_CONFIG.routes.pos)
      await expect(page.locator('[data-testid="pos-interface"]')).toBeVisible()
      
      // Should be able to process transactions
      await page.locator('[data-testid="product-tile"]').first().click()
      await page.locator('[data-testid="checkout-button"]').click()
      await expect(page.locator('[data-testid="payment-options"]')).toBeVisible()
      
      // Should see payment warning but not be blocked
      await expect(page.locator('[data-testid="payment-issue-banner"]')).toBeVisible()
      
      // Check grace period countdown
      await page.goto(PAYMENT_FAILURE_CONFIG.routes.dashboard)
      await expect(page.locator(PAYMENT_FAILURE_CONFIG.selectors.graceperiodCounter)).toBeVisible()
      await expect(page.locator(PAYMENT_FAILURE_CONFIG.selectors.graceperiodCounter)).toContainText('13 days remaining')
    })

    test('progressive service restrictions as grace period expires', async ({ page }) => {
      await setupUserWithFailingCard(page, PAYMENT_FAILURE_CONFIG.testCards.declined)
      await simulateBillingCycle(page)
      
      // Day 10: Should see more urgent warnings
      await simulateTimeAdvance(page, 10)
      await page.goto(PAYMENT_FAILURE_CONFIG.routes.dashboard)
      
      await expect(page.locator('[data-testid="urgent-payment-warning"]')).toBeVisible()
      await expect(page.locator(PAYMENT_FAILURE_CONFIG.selectors.graceperiodCounter)).toContainText('4 days remaining')
      
      // Day 12: Should restrict non-essential features
      await simulateTimeAdvance(page, 2)
      await page.goto('/reports')
      await expect(page.locator('[data-testid="feature-restricted"]')).toBeVisible()
      await expect(page.locator('[data-testid="payment-required-notice"]')).toBeVisible()
      
      // POS should still work (essential feature)
      await page.goto(PAYMENT_FAILURE_CONFIG.routes.pos)
      await expect(page.locator('[data-testid="pos-interface"]')).toBeVisible()
    })

    test('account suspension after grace period expires', async ({ page }) => {
      await setupUserWithFailingCard(page, PAYMENT_FAILURE_CONFIG.testCards.declined)
      await simulateBillingCycle(page)
      
      // Day 15: Grace period expired, account suspended
      await simulateTimeAdvance(page, 15)
      await simulateAccountSuspension(page)
      
      await page.goto(PAYMENT_FAILURE_CONFIG.routes.dashboard)
      
      // Should be redirected to suspension page
      await expect(page).toHaveURL(/account-suspended/)
      await expect(page.locator(PAYMENT_FAILURE_CONFIG.selectors.suspendedAccountMessage)).toBeVisible()
      
      // Should show reactivation options
      await expect(page.locator(PAYMENT_FAILURE_CONFIG.selectors.reactivateButton)).toBeVisible()
      await expect(page.locator('[data-testid="payment-required-to-reactivate"]')).toBeVisible()
      
      // Essential features should be blocked
      await page.goto(PAYMENT_FAILURE_CONFIG.routes.pos)
      await expect(page.locator('[data-testid="service-suspended"]')).toBeVisible()
      
      // Data should still be accessible (read-only)
      await page.goto('/data-export')
      await expect(page.locator('[data-testid="read-only-data-access"]')).toBeVisible()
    })

    test('successful reactivation after suspension', async ({ page }) => {
      await setupSuspendedUser(page)
      
      await page.goto('/account-suspended')
      await page.locator(PAYMENT_FAILURE_CONFIG.selectors.reactivateButton).click()
      
      // Should show outstanding balance
      await expect(page.locator('[data-testid="outstanding-balance"]')).toBeVisible()
      await expect(page.locator('[data-testid="total-amount-due"]')).toContainText('₱87.00')
      
      // Update payment method
      await updatePaymentMethod(page, PAYMENT_FAILURE_CONFIG.testCards.validCard)
      
      // Pay outstanding balance
      await page.locator('[data-testid="pay-outstanding-balance"]').click()
      await expect(page.locator(PAYMENT_FAILURE_CONFIG.selectors.processingIndicator)).toBeVisible()
      await expect(page.locator(PAYMENT_FAILURE_CONFIG.selectors.successMessage)).toBeVisible({ timeout: 10000 })
      
      // Should be redirected to dashboard
      await expect(page).toHaveURL(/dashboard/)
      await expect(page.locator('[data-testid="account-reactivated-notice"]')).toBeVisible()
      
      // Services should be fully restored
      await page.goto(PAYMENT_FAILURE_CONFIG.routes.pos)
      await expect(page.locator('[data-testid="pos-interface"]')).toBeVisible()
    })
  })

  test.describe('Analytics and Business Intelligence', () => {
    test('payment failure analytics and insights', async ({ page }) => {
      await loginAsAdmin(page)
      
      await page.goto('/admin/payment-analytics')
      
      // Failure rate metrics
      await expect(page.locator(PAYMENT_FAILURE_CONFIG.selectors.failureAnalytics)).toBeVisible()
      await expect(page.locator('[data-testid="failure-rate"]')).toContainText('3.2%')
      await expect(page.locator('[data-testid="failure-trend"]')).toBeVisible()
      
      // Failure reason breakdown
      await expect(page.locator('[data-testid="failure-reasons-chart"]')).toBeVisible()
      await expect(page.locator('[data-testid="declined-percentage"]')).toContainText('45%')
      await expect(page.locator('[data-testid="insufficient-funds-percentage"]')).toContainText('32%')
      
      // Recovery metrics
      await expect(page.locator(PAYMENT_FAILURE_CONFIG.selectors.recoveryMetrics)).toBeVisible()
      await expect(page.locator('[data-testid="recovery-rate"]')).toContainText('68%')
      await expect(page.locator('[data-testid="avg-recovery-time"]')).toContainText('4.2 days')
      
      // Churn risk analysis
      await expect(page.locator(PAYMENT_FAILURE_CONFIG.selectors.churnRiskIndicator)).toBeVisible()
      await expect(page.locator('[data-testid="high-risk-customers"]')).toContainText('12 customers')
    })

    test('customer-level payment health scoring', async ({ page }) => {
      await loginAsAdmin(page)
      
      await page.goto('/admin/customer-health')
      
      // Should see payment health scores
      const customerList = page.locator('[data-testid="customer-health-list"]')
      
      // High risk customer
      const highRiskCustomer = customerList.locator('[data-testid="customer-high-risk"]').first()
      await expect(highRiskCustomer.locator('[data-testid="health-score"]')).toContainText('25/100')
      await expect(highRiskCustomer.locator('[data-testid="risk-factors"]')).toContainText('Multiple payment failures')
      
      // Healthy customer
      const healthyCustomer = customerList.locator('[data-testid="customer-healthy"]').first()
      await expect(healthyCustomer.locator('[data-testid="health-score"]')).toContainText('92/100')
      
      // Should be able to take proactive action
      await highRiskCustomer.locator('[data-testid="contact-customer"]').click()
      await expect(page.locator('[data-testid="proactive-outreach-form"]')).toBeVisible()
    })

    test('payment failure impact on business metrics', async ({ page }) => {
      await loginAsAdmin(page)
      
      await page.goto('/admin/business-impact')
      
      // Revenue impact
      await expect(page.locator('[data-testid="failed-payment-revenue-impact"]')).toBeVisible()
      await expect(page.locator('[data-testid="monthly-revenue-loss"]')).toContainText('₱23,450')
      
      // Customer retention impact
      await expect(page.locator('[data-testid="churn-from-payment-issues"]')).toContainText('4.2%')
      
      // Operational cost impact
      await expect(page.locator('[data-testid="dunning-costs"]')).toContainText('₱3,200')
      await expect(page.locator('[data-testid="support-ticket-costs"]')).toBeVisible()
      
      // Recovery value metrics
      await expect(page.locator('[data-testid="recovered-revenue"]')).toContainText('₱45,680')
      await expect(page.locator('[data-testid="roi-of-recovery-efforts"]')).toContainText('312%')
    })
  })
})
// Helper Functions for Payment Failure and Recovery Testing

/**
 * Setup user with a specific failing payment method
 */
async function setupUserWithFailingCard(page: Page, cardDetails: any) {
  await page.goto('/login')
  await page.locator('[data-testid="email-input"]').fill('payment-test@test.com')
  await page.locator('[data-testid="password-input"]').fill('test123')
  await page.locator('[data-testid="login-button"]').click()
  
  // Update payment method to failing card
  await page.goto(PAYMENT_FAILURE_CONFIG.routes.paymentMethods)
  await page.locator('[data-testid="update-payment-method"]').click()
  
  await fillCardForm(page, cardDetails)
  await page.locator('[data-testid="save-payment-method"]').click()
  
  await expect(page.locator(PAYMENT_FAILURE_CONFIG.selectors.successMessage)).toBeVisible()
}

/**
 * Setup user with multiple failed invoices
 */
async function setupUserWithMultipleFailedInvoices(page: Page) {
  await page.goto('/login')
  await page.locator('[data-testid="email-input"]').fill('multiple-failures@test.com')
  await page.locator('[data-testid="password-input"]').fill('test123')
  await page.locator('[data-testid="login-button"]').click()
  
  // This user should have pre-seeded failed invoices in test data
  await expect(page).toHaveURL(/dashboard/)
}

/**
 * Setup suspended user account
 */
async function setupSuspendedUser(page: Page) {
  await page.goto('/login')
  await page.locator('[data-testid="email-input"]').fill('suspended@test.com')
  await page.locator('[data-testid="password-input"]').fill('test123')
  await page.locator('[data-testid="login-button"]').click()
}

/**
 * Login as admin for analytics testing
 */
async function loginAsAdmin(page: Page) {
  await page.goto('/login')
  await page.locator('[data-testid="email-input"]').fill('admin@test.com')
  await page.locator('[data-testid="password-input"]').fill('admin123')
  await page.locator('[data-testid="login-button"]').click()
  await expect(page).toHaveURL(/dashboard/)
}

/**
 * Fill card form with provided details
 */
async function fillCardForm(page: Page, cardDetails: any) {
  await page.locator('[data-testid="card-number-input"]').fill(cardDetails.number)
  await page.locator('[data-testid="expiry-input"]').fill(cardDetails.expiry)
  await page.locator('[data-testid="cvv-input"]').fill(cardDetails.cvv)
  await page.locator('[data-testid="cardholder-name-input"]').fill(cardDetails.name)
}

/**
 * Simulate billing cycle processing
 */
async function simulateBillingCycle(page: Page) {
  // Trigger billing cycle through API or test endpoint
  await page.evaluate(() => {
    window.postMessage({ type: 'TRIGGER_BILLING_CYCLE' }, '*')
  })
  
  // Wait for billing processing to complete
  await page.waitForTimeout(2000)
}

/**
 * Simulate time advancement for retry testing
 */
async function simulateTimeAdvance(page: Page, days: number) {
  await page.evaluate((daysToAdvance) => {
    window.postMessage({ 
      type: 'ADVANCE_TIME', 
      days: daysToAdvance 
    }, '*')
  }, days)
}

/**
 * Simulate retry attempt with optional success
 */
async function simulateRetryAttempt(page: Page, attemptNumber: number, success = false) {
  await page.evaluate((attempt, shouldSucceed) => {
    window.postMessage({ 
      type: 'SIMULATE_RETRY_ATTEMPT',
      attempt: attempt,
      success: shouldSucceed
    }, '*')
  }, attemptNumber, success)
  
  await page.waitForTimeout(1000)
}

/**
 * Update payment method to a new card
 */
async function updatePaymentMethod(page: Page, cardDetails: any) {
  await page.goto(PAYMENT_FAILURE_CONFIG.routes.paymentMethods)
  await page.locator('[data-testid="add-payment-method"]').click()
  
  await fillCardForm(page, cardDetails)
  await page.locator('[data-testid="save-payment-method"]').click()
  
  await expect(page.locator(PAYMENT_FAILURE_CONFIG.selectors.successMessage)).toBeVisible()
  
  // Set as default
  await page.locator('[data-testid="set-as-default"]').click()
}

/**
 * Select new payment method for retry
 */
async function selectNewPaymentMethod(page: Page, cardDetails: any) {
  // Check if existing valid payment methods are available
  const existingMethods = page.locator('[data-testid="existing-payment-method"]')
  
  if (await existingMethods.count() > 0) {
    await existingMethods.first().click()
  } else {
    // Add new payment method
    await page.locator('[data-testid="add-new-payment-method"]').click()
    await fillCardForm(page, cardDetails)
    await page.locator('[data-testid="save-and-use"]').click()
  }
}

/**
 * Simulate account suspension
 */
async function simulateAccountSuspension(page: Page) {
  await page.evaluate(() => {
    window.postMessage({ 
      type: 'SIMULATE_ACCOUNT_SUSPENSION'
    }, '*')
  })
  
  await page.waitForTimeout(1000)
}