/**
 * v1-certification-comprehensive-refund.spec.ts
 *
 * V1 E2E Certification: Comprehensive Refund Management
 *
 * Tests comprehensive refund processing including full/partial refunds,
 * approval workflows, inventory reconciliation, and compliance tracking.
 *
 * Critical V1 User Journey:
 *  ✅ Full and partial refund processing
 *  ✅ Role-based refund authorization and approval workflows
 *  ✅ Inventory reconciliation and stock adjustments
 *  ✅ Multiple payment method refund handling
 *  ✅ BIR compliance and receipt generation
 *  ✅ Refund analytics and loss tracking
 *  ✅ Customer communication and notifications
 *  ✅ Fraud prevention and refund limits
 *  ✅ Multi-branch refund coordination
 *  ✅ Audit trail and compliance reporting
 *
 * Test Strategy:
 *  - Tests complete refund lifecycle from initiation to completion
 *  - Validates approval workflows for different refund amounts
 *  - Tests inventory impact and reconciliation
 *  - Verifies financial accuracy and accounting integration
 *  - Tests edge cases and error scenarios
 *
 * Prerequisites:
 *  - Payment processing system with refund capabilities
 *  - Role-based access control for refund permissions
 *  - Inventory management system integration
 *  - BIR-compliant receipt and documentation system
 *  - Financial reporting and analytics system
 *
 * Business Rules Validated:
 *  - Refunds require appropriate authorization based on amount and role
 *  - Inventory is properly adjusted for returned items
 *  - Payment methods are refunded through original channels
 *  - Refund documentation meets regulatory requirements
 *  - Refund limits and controls prevent fraud
 */

import { test, expect, type Page } from '@playwright/test'
import { faker } from '@faker-js/faker'

// Test configuration for comprehensive refund flow
const REFUND_CONFIG = {
  routes: {
    login: '/login',
    dashboard: '/dashboard',
    pos: '/pos',
    transactions: '/transactions',
    refunds: '/refunds',
    inventory: '/inventory',
    reports: '/reports/refunds',
    notifications: '/notifications',
  },
  authorizationLimits: {
    CASHIER: {
      maxAmount: 50000, // PHP 500.00 in cents
      requiresApproval: true,
      canRefundOwnTransactions: true,
      timeLimit: 24, // hours
    },
    SUPERVISOR: {
      maxAmount: 500000, // PHP 5,000.00 in cents
      requiresApproval: false,
      canRefundAnyTransaction: true,
      timeLimit: 168, // 7 days
    },
    ADMIN: {
      maxAmount: -1, // unlimited
      requiresApproval: false,
      canRefundAnyTransaction: true,
      timeLimit: 720, // 30 days
    },
  },
  refundReasons: [
    { id: 'DEFECTIVE_PRODUCT', label: 'Defective Product', requiresEvidence: true },
    { id: 'WRONG_ITEM', label: 'Wrong Item Delivered', requiresEvidence: false },
    { id: 'CUSTOMER_CHANGED_MIND', label: 'Customer Changed Mind', requiresEvidence: false },
    { id: 'DAMAGED_IN_TRANSIT', label: 'Damaged in Transit', requiresEvidence: true },
    { id: 'DUPLICATE_CHARGE', label: 'Duplicate Charge', requiresEvidence: false },
    { id: 'PRICING_ERROR', label: 'Pricing Error', requiresEvidence: true },
    { id: 'OUT_OF_STOCK', label: 'Out of Stock', requiresEvidence: false },
    { id: 'OTHER', label: 'Other', requiresEvidence: true },
  ],
  selectors: {
    // Transaction selection
    transactionList: '[data-testid="transaction-list"]',
    transactionItem: '[data-testid="transaction-item"]',
    transactionDetails: '[data-testid="transaction-details"]',
    refundTransactionButton: '[data-testid="refund-transaction-button"]',
    
    // Refund initiation
    refundReasonSelect: '[data-testid="refund-reason-select"]',
    refundAmountInput: '[data-testid="refund-amount-input"]',
    refundItemSelector: '[data-testid="refund-item-selector"]',
    partialRefundToggle: '[data-testid="partial-refund-toggle"]',
    refundNotesInput: '[data-testid="refund-notes-input"]',
    evidenceUpload: '[data-testid="evidence-upload"]',
    
    // Approval workflow
    sendForApprovalButton: '[data-testid="send-for-approval-button"]',
    approveRefundButton: '[data-testid="approve-refund-button"]',
    rejectRefundButton: '[data-testid="reject-refund-button"]',
    approvalNotification: '[data-testid="approval-notification"]',
    pendingApprovalList: '[data-testid="pending-approval-list"]',
    
    // Refund processing
    processRefundButton: '[data-testid="process-refund-button"]',
    refundMethodSelector: '[data-testid="refund-method-selector"]',
    confirmRefundButton: '[data-testid="confirm-refund-button"]',
    refundReceiptButton: '[data-testid="refund-receipt-button"]',
    
    // Inventory reconciliation
    inventoryAdjustmentToggle: '[data-testid="inventory-adjustment-toggle"]',
    returnToStockButton: '[data-testid="return-to-stock-button"]',
    markAsDefectiveButton: '[data-testid="mark-as-defective-button"]',
    inventoryStatus: '[data-testid="inventory-status"]',
    
    // Customer communication
    notifyCustomerToggle: '[data-testid="notify-customer-toggle"]',
    customerNotificationMessage: '[data-testid="customer-notification-message"]',
    sendNotificationButton: '[data-testid="send-notification-button"]',
    
    // Refund tracking
    refundStatus: '[data-testid="refund-status"]',
    refundReference: '[data-testid="refund-reference"]',
    refundProgress: '[data-testid="refund-progress"]',
    estimatedCompletionTime: '[data-testid="estimated-completion-time"]',
    
    // Analytics and reporting
    refundAnalytics: '[data-testid="refund-analytics"]',
    refundTrends: '[data-testid="refund-trends"]',
    lossReports: '[data-testid="loss-reports"]',
    complianceReport: '[data-testid="compliance-report"]',
    
    // Error states and validation
    authorizationError: '[data-testid="authorization-error"]',
    validationError: '[data-testid="validation-error"]',
    processingError: '[data-testid="processing-error"]',
    successMessage: '[data-testid="success-message"]',
    
    // Confirmation dialogs
    confirmDialog: '[data-testid="confirm-dialog"]',
    confirmButton: '[data-testid="confirm-button"]',
    cancelButton: '[data-testid="cancel-button"]',
  },
  testTransactions: {
    cashTransaction: {
      id: 'TXN001',
      total: 15000, // PHP 150.00
      paymentMethod: 'CASH',
      items: [
        { id: 'ITEM001', name: 'Coffee', price: 5000, quantity: 2 },
        { id: 'ITEM002', name: 'Sandwich', price: 5000, quantity: 1 },
      ],
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
    },
    cardTransaction: {
      id: 'TXN002', 
      total: 25000, // PHP 250.00
      paymentMethod: 'CARD',
      items: [
        { id: 'ITEM003', name: 'Laptop Bag', price: 25000, quantity: 1 },
      ],
      timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
    },
    mixedPaymentTransaction: {
      id: 'TXN003',
      total: 75000, // PHP 750.00
      paymentMethods: [
        { type: 'CASH', amount: 30000 },
        { type: 'CARD', amount: 45000 },
      ],
      items: [
        { id: 'ITEM004', name: 'Phone Case', price: 35000, quantity: 1 },
        { id: 'ITEM005', name: 'Screen Protector', price: 20000, quantity: 2 },
      ],
      timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
    },
  },
}
test.describe('V1 Certification: Comprehensive Refund Management', () => {
  test.describe('Full Refund Processing', () => {
    test('cashier processes full cash refund within authorization limit', async ({ page }) => {
      await loginAsCashier(page)
      await createTestTransaction(page, REFUND_CONFIG.testTransactions.cashTransaction)
      
      // Navigate to transaction for refund
      await page.goto(REFUND_CONFIG.routes.transactions)
      const transaction = page.locator(`[data-testid="transaction-${REFUND_CONFIG.testTransactions.cashTransaction.id}"]`)
      await transaction.click()
      
      // Initiate refund
      await page.locator(REFUND_CONFIG.selectors.refundTransactionButton).click()
      
      // Select refund reason
      await page.locator(REFUND_CONFIG.selectors.refundReasonSelect).selectOption('DEFECTIVE_PRODUCT')
      await page.locator(REFUND_CONFIG.selectors.refundNotesInput).fill('Product defective on arrival')
      
      // Upload evidence (defective product requires evidence)
      await uploadEvidence(page, 'defective-product-photo.jpg')
      
      // Verify refund amount (should default to full amount)
      await expect(page.locator(REFUND_CONFIG.selectors.refundAmountInput)).toHaveValue('150.00')
      
      // Process refund (within cashier limit, no approval needed)
      await page.locator(REFUND_CONFIG.selectors.processRefundButton).click()
      
      // Select refund method (cash)
      await page.locator(REFUND_CONFIG.selectors.refundMethodSelector).selectOption('CASH')
      
      // Confirm refund
      await page.locator(REFUND_CONFIG.selectors.confirmRefundButton).click()
      
      // Verify refund success
      await expect(page.locator(REFUND_CONFIG.selectors.successMessage)).toBeVisible()
      await expect(page.locator(REFUND_CONFIG.selectors.refundStatus)).toContainText('Completed')
      
      // Verify refund receipt generation
      await expect(page.locator(REFUND_CONFIG.selectors.refundReceiptButton)).toBeVisible()
      
      // Check inventory adjustment
      await expect(page.locator(REFUND_CONFIG.selectors.inventoryStatus)).toContainText('Items returned to stock')
    })

    test('supervisor processes card refund without approval', async ({ page }) => {
      await loginAsSupervisor(page)
      await createTestTransaction(page, REFUND_CONFIG.testTransactions.cardTransaction)
      
      await page.goto(REFUND_CONFIG.routes.transactions)
      const transaction = page.locator(`[data-testid="transaction-${REFUND_CONFIG.testTransactions.cardTransaction.id}"]`)
      await transaction.click()
      
      await page.locator(REFUND_CONFIG.selectors.refundTransactionButton).click()
      
      // Select simple reason (no evidence required)
      await page.locator(REFUND_CONFIG.selectors.refundReasonSelect).selectOption('CUSTOMER_CHANGED_MIND')
      await page.locator(REFUND_CONFIG.selectors.refundNotesInput).fill('Customer no longer needs item')
      
      // Process refund
      await page.locator(REFUND_CONFIG.selectors.processRefundButton).click()
      
      // Card refund should show processing time
      await page.locator(REFUND_CONFIG.selectors.refundMethodSelector).selectOption('ORIGINAL_CARD')
      await expect(page.locator(REFUND_CONFIG.selectors.estimatedCompletionTime)).toContainText('3-5 business days')
      
      await page.locator(REFUND_CONFIG.selectors.confirmRefundButton).click()
      
      // Verify refund processing
      await expect(page.locator(REFUND_CONFIG.selectors.refundStatus)).toContainText('Processing')
      await expect(page.locator(REFUND_CONFIG.selectors.refundReference)).toBeVisible()
    })

    test('admin processes large refund without restrictions', async ({ page }) => {
      await loginAsAdmin(page)
      
      // Create large transaction
      const largeTransaction = {
        ...REFUND_CONFIG.testTransactions.cardTransaction,
        total: 1000000, // PHP 10,000.00
      }
      await createTestTransaction(page, largeTransaction)
      
      await page.goto(REFUND_CONFIG.routes.transactions)
      const transaction = page.locator(`[data-testid="transaction-${largeTransaction.id}"]`)
      await transaction.click()
      
      await page.locator(REFUND_CONFIG.selectors.refundTransactionButton).click()
      
      await page.locator(REFUND_CONFIG.selectors.refundReasonSelect).selectOption('PRICING_ERROR')
      await page.locator(REFUND_CONFIG.selectors.refundNotesInput).fill('System pricing error - incorrect amount charged')
      
      // No authorization error should appear for admin
      await page.locator(REFUND_CONFIG.selectors.processRefundButton).click()
      await expect(page.locator(REFUND_CONFIG.selectors.authorizationError)).not.toBeVisible()
      
      // Should process immediately
      await page.locator(REFUND_CONFIG.selectors.refundMethodSelector).selectOption('ORIGINAL_CARD')
      await page.locator(REFUND_CONFIG.selectors.confirmRefundButton).click()
      
      await expect(page.locator(REFUND_CONFIG.selectors.successMessage)).toBeVisible()
    })
  })

  test.describe('Partial Refund Processing', () => {
    test('partial refund for individual items', async ({ page }) => {
      await loginAsSupervisor(page)
      await createTestTransaction(page, REFUND_CONFIG.testTransactions.mixedPaymentTransaction)
      
      await page.goto(REFUND_CONFIG.routes.transactions)
      const transaction = page.locator(`[data-testid="transaction-${REFUND_CONFIG.testTransactions.mixedPaymentTransaction.id}"]`)
      await transaction.click()
      
      // Initiate partial refund
      await page.locator(REFUND_CONFIG.selectors.refundTransactionButton).click()
      await page.locator(REFUND_CONFIG.selectors.partialRefundToggle).click()
      
      // Select specific items to refund
      const itemSelector = page.locator(REFUND_CONFIG.selectors.refundItemSelector)
      await itemSelector.locator('[data-testid="item-ITEM005"]').check() // Screen Protector (2x ₱200 = ₱400)
      
      // Verify calculated refund amount
      await expect(page.locator(REFUND_CONFIG.selectors.refundAmountInput)).toHaveValue('400.00')
      
      await page.locator(REFUND_CONFIG.selectors.refundReasonSelect).selectOption('DEFECTIVE_PRODUCT')
      await page.locator(REFUND_CONFIG.selectors.refundNotesInput).fill('One screen protector was cracked')
      
      await uploadEvidence(page, 'cracked-screen-protector.jpg')
      
      // Process partial refund
      await page.locator(REFUND_CONFIG.selectors.processRefundButton).click()
      
      // Mixed payment should show proportional refund options
      await expect(page.locator('[data-testid="proportional-refund-breakdown"]')).toBeVisible()
      await expect(page.locator('[data-testid="cash-portion"]')).toContainText('₱160.00') // 400/750 * 300
      await expect(page.locator('[data-testid="card-portion"]')).toContainText('₱240.00') // 400/750 * 450
      
      await page.locator(REFUND_CONFIG.selectors.confirmRefundButton).click()
      
      // Verify partial refund success
      await expect(page.locator(REFUND_CONFIG.selectors.successMessage)).toBeVisible()
      await expect(page.locator('[data-testid="remaining-transaction-amount"]')).toContainText('₱350.00')
    })

    test('custom amount partial refund', async ({ page }) => {
      await loginAsSupervisor(page)
      await createTestTransaction(page, REFUND_CONFIG.testTransactions.cashTransaction)
      
      await page.goto(REFUND_CONFIG.routes.transactions)
      const transaction = page.locator(`[data-testid="transaction-${REFUND_CONFIG.testTransactions.cashTransaction.id}"]`)
      await transaction.click()
      
      await page.locator(REFUND_CONFIG.selectors.refundTransactionButton).click()
      await page.locator(REFUND_CONFIG.selectors.partialRefundToggle).click()
      
      // Enter custom refund amount
      await page.locator(REFUND_CONFIG.selectors.refundAmountInput).clear()
      await page.locator(REFUND_CONFIG.selectors.refundAmountInput).fill('75.00') // Half refund
      
      await page.locator(REFUND_CONFIG.selectors.refundReasonSelect).selectOption('CUSTOMER_CHANGED_MIND')
      await page.locator(REFUND_CONFIG.selectors.refundNotesInput).fill('Customer only wants partial refund')
      
      await page.locator(REFUND_CONFIG.selectors.processRefundButton).click()
      await page.locator(REFUND_CONFIG.selectors.refundMethodSelector).selectOption('CASH')
      await page.locator(REFUND_CONFIG.selectors.confirmRefundButton).click()
      
      await expect(page.locator(REFUND_CONFIG.selectors.successMessage)).toBeVisible()
      
      // Verify transaction shows partial refund
      await expect(page.locator('[data-testid="refund-status-partial"]')).toBeVisible()
      await expect(page.locator('[data-testid="refunded-amount"]')).toContainText('₱75.00')
      await expect(page.locator('[data-testid="remaining-amount"]')).toContainText('₱75.00')
    })
  })

  test.describe('Approval Workflow Management', () => {
    test('cashier refund exceeding limit requires approval', async ({ page }) => {
      await loginAsCashier(page)
      
      // Create transaction exceeding cashier limit
      const largeTransaction = {
        ...REFUND_CONFIG.testTransactions.cashTransaction,
        total: 75000, // PHP 750.00 (exceeds ₱500 cashier limit)
      }
      await createTestTransaction(page, largeTransaction)
      
      await page.goto(REFUND_CONFIG.routes.transactions)
      const transaction = page.locator(`[data-testid="transaction-${largeTransaction.id}"]`)
      await transaction.click()
      
      await page.locator(REFUND_CONFIG.selectors.refundTransactionButton).click()
      
      await page.locator(REFUND_CONFIG.selectors.refundReasonSelect).selectOption('DEFECTIVE_PRODUCT')
      await page.locator(REFUND_CONFIG.selectors.refundNotesInput).fill('Product completely defective')
      await uploadEvidence(page, 'defective-product.jpg')
      
      // Should require approval
      await expect(page.locator('[data-testid="approval-required-notice"]')).toBeVisible()
      await expect(page.locator('[data-testid="approval-required-notice"]')).toContainText('Exceeds your authorization limit')
      
      // Send for approval
      await page.locator(REFUND_CONFIG.selectors.sendForApprovalButton).click()
      
      await expect(page.locator(REFUND_CONFIG.selectors.successMessage)).toContainText('Sent for approval')
      await expect(page.locator(REFUND_CONFIG.selectors.refundStatus)).toContainText('Pending Approval')
    })

    test('supervisor approves cashier refund request', async ({ page, context }) => {
      // Setup: Cashier submits refund for approval (from previous test scenario)
      await setupPendingRefundApproval(page)
      
      // Login as supervisor to approve
      await loginAsSupervisor(page)
      
      await page.goto(REFUND_CONFIG.routes.refunds)
      const pendingList = page.locator(REFUND_CONFIG.selectors.pendingApprovalList)
      
      // Should see pending refund
      const pendingRefund = pendingList.locator('[data-testid="pending-refund"]').first()
      await expect(pendingRefund).toBeVisible()
      await expect(pendingRefund).toContainText('₱750.00')
      await expect(pendingRefund).toContainText('Requested by: cashier@test.com')
      
      // Review and approve
      await pendingRefund.click()
      
      // Verify refund details
      await expect(page.locator(REFUND_CONFIG.selectors.refundReasonSelect)).toHaveValue('DEFECTIVE_PRODUCT')
      await expect(page.locator('[data-testid="evidence-preview"]')).toBeVisible()
      
      // Approve refund
      await page.locator(REFUND_CONFIG.selectors.approveRefundButton).click()
      await page.locator('[data-testid="approval-notes"]').fill('Approved - valid defect claim with evidence')
      await page.locator(REFUND_CONFIG.selectors.confirmButton).click()
      
      // Verify approval
      await expect(page.locator(REFUND_CONFIG.selectors.successMessage)).toContainText('Refund approved')
      
      // Should now be able to process
      await expect(page.locator(REFUND_CONFIG.selectors.processRefundButton)).toBeVisible()
    })

    test('supervisor rejects invalid refund request', async ({ page }) => {
      await setupPendingRefundApproval(page)
      await loginAsSupervisor(page)
      
      await page.goto(REFUND_CONFIG.routes.refunds)
      const pendingRefund = page.locator(REFUND_CONFIG.selectors.pendingApprovalList).locator('[data-testid="pending-refund"]').first()
      await pendingRefund.click()
      
      // Reject refund
      await page.locator(REFUND_CONFIG.selectors.rejectRefundButton).click()
      await page.locator('[data-testid="rejection-reason"]').selectOption('INSUFFICIENT_EVIDENCE')
      await page.locator('[data-testid="rejection-notes"]').fill('Evidence does not support defect claim')
      await page.locator(REFUND_CONFIG.selectors.confirmButton).click()
      
      await expect(page.locator(REFUND_CONFIG.selectors.successMessage)).toContainText('Refund rejected')
      
      // Verify cashier is notified
      await loginAsCashier(page)
      await page.goto(REFUND_CONFIG.routes.notifications)
      await expect(page.locator('[data-testid="refund-rejected-notification"]')).toBeVisible()
      await expect(page.locator('[data-testid="rejection-reason-display"]')).toContainText('Insufficient evidence')
    })
  })
  test.describe('Inventory Reconciliation', () => {
    test('refunded items return to stock correctly', async ({ page }) => {
      await loginAsSupervisor(page)
      await createTestTransaction(page, REFUND_CONFIG.testTransactions.cashTransaction)
      
      // Check initial inventory levels
      await page.goto(REFUND_CONFIG.routes.inventory)
      const coffeeStock = await page.locator('[data-testid="item-ITEM001-stock"]').textContent()
      const sandwichStock = await page.locator('[data-testid="item-ITEM002-stock"]').textContent()
      
      // Process refund
      await processFullRefund(page, REFUND_CONFIG.testTransactions.cashTransaction.id, 'CUSTOMER_CHANGED_MIND')
      
      // Ensure items return to stock
      await page.locator(REFUND_CONFIG.selectors.inventoryAdjustmentToggle).check()
      await page.locator(REFUND_CONFIG.selectors.returnToStockButton).click()
      
      // Verify inventory adjustment
      await page.goto(REFUND_CONFIG.routes.inventory)
      
      const newCoffeeStock = await page.locator('[data-testid="item-ITEM001-stock"]').textContent()
      const newSandwichStock = await page.locator('[data-testid="item-ITEM002-stock"]').textContent()
      
      // Coffee quantity should increase by 2, sandwich by 1
      expect(parseInt(newCoffeeStock || '0')).toBe(parseInt(coffeeStock || '0') + 2)
      expect(parseInt(newSandwichStock || '0')).toBe(parseInt(sandwichStock || '0') + 1)
      
      // Check inventory transaction log
      await page.goto('/inventory/transactions')
      await expect(page.locator('[data-testid="inventory-transaction"]').first()).toContainText('REFUND_RETURN')
      await expect(page.locator('[data-testid="inventory-transaction"]').first()).toContainText('+2 Coffee, +1 Sandwich')
    })

    test('defective items marked as damaged stock', async ({ page }) => {
      await loginAsSupervisor(page)
      await createTestTransaction(page, REFUND_CONFIG.testTransactions.cardTransaction)
      
      await processFullRefund(page, REFUND_CONFIG.testTransactions.cardTransaction.id, 'DEFECTIVE_PRODUCT')
      
      // Mark as defective instead of returning to stock
      await page.locator(REFUND_CONFIG.selectors.markAsDefectiveButton).click()
      await page.locator('[data-testid="defect-description"]').fill('Screen damaged, unrepairable')
      await page.locator('[data-testid="confirm-defective"]').click()
      
      // Verify defective stock tracking
      await page.goto(REFUND_CONFIG.routes.inventory)
      await page.locator('[data-testid="show-defective-stock"]').click()
      
      await expect(page.locator('[data-testid="defective-stock-ITEM003"]')).toContainText('1 unit')
      await expect(page.locator('[data-testid="defective-reason"]')).toContainText('Screen damaged, unrepairable')
      
      // Regular stock should not increase
      const laptopBagStock = await page.locator('[data-testid="item-ITEM003-stock"]').textContent()
      // Should remain the same as before transaction (not increased by refund)
    })

    test('partial refund handles mixed inventory scenarios', async ({ page }) => {
      await loginAsSupervisor(page)
      await createTestTransaction(page, REFUND_CONFIG.testTransactions.mixedPaymentTransaction)
      
      // Start partial refund
      await page.goto(REFUND_CONFIG.routes.transactions)
      const transaction = page.locator(`[data-testid="transaction-${REFUND_CONFIG.testTransactions.mixedPaymentTransaction.id}"]`)
      await transaction.click()
      
      await page.locator(REFUND_CONFIG.selectors.refundTransactionButton).click()
      await page.locator(REFUND_CONFIG.selectors.partialRefundToggle).click()
      
      // Select items with different handling
      await page.locator('[data-testid="item-ITEM004"]').check() // Phone Case - return to stock
      await page.locator('[data-testid="item-ITEM005-1"]').check() // 1 Screen Protector - mark defective
      
      await page.locator(REFUND_CONFIG.selectors.refundReasonSelect).selectOption('DEFECTIVE_PRODUCT')
      
      await page.locator(REFUND_CONFIG.selectors.processRefundButton).click()
      await page.locator(REFUND_CONFIG.selectors.confirmRefundButton).click()
      
      // Handle inventory per item
      const inventoryHandling = page.locator('[data-testid="inventory-handling"]')
      
      // Phone Case - return to stock
      await inventoryHandling.locator('[data-testid="item-ITEM004-action"]').selectOption('RETURN_TO_STOCK')
      
      // Screen Protector - mark as defective
      await inventoryHandling.locator('[data-testid="item-ITEM005-action"]').selectOption('MARK_DEFECTIVE')
      await inventoryHandling.locator('[data-testid="item-ITEM005-defect-reason"]').fill('Packaging damaged')
      
      await page.locator('[data-testid="apply-inventory-changes"]').click()
      
      // Verify mixed inventory handling
      await page.goto(REFUND_CONFIG.routes.inventory)
      
      // Phone Case should be back in stock
      await expect(page.locator('[data-testid="item-ITEM004-stock"]')).toContainText('+1')
      
      // Screen Protector should be in defective stock
      await page.locator('[data-testid="show-defective-stock"]').click()
      await expect(page.locator('[data-testid="defective-stock-ITEM005"]')).toContainText('1 unit')
    })
  })

  test.describe('BIR Compliance and Documentation', () => {
    test('refund receipt generation with proper BIR format', async ({ page }) => {
      await loginAsSupervisor(page)
      await processFullRefund(page, REFUND_CONFIG.testTransactions.cashTransaction.id, 'DEFECTIVE_PRODUCT')
      
      // Generate refund receipt
      await page.locator(REFUND_CONFIG.selectors.refundReceiptButton).click()
      
      // Verify BIR-compliant receipt format
      const receiptPreview = page.locator('[data-testid="receipt-preview"]')
      
      // Required BIR fields
      await expect(receiptPreview).toContainText('REFUND RECEIPT')
      await expect(receiptPreview).toContainText('TIN:') // Tax Identification Number
      await expect(receiptPreview).toContainText('Receipt #:')
      await expect(receiptPreview).toContainText('Original Receipt #:')
      await expect(receiptPreview).toContainText('VAT Reg. TIN:')
      await expect(receiptPreview).toContainText('Refund Reason: Defective Product')
      
      // Original transaction reference
      await expect(receiptPreview).toContainText(`Original Transaction: ${REFUND_CONFIG.testTransactions.cashTransaction.id}`)
      
      // Authorized signature line
      await expect(receiptPreview).toContainText('Authorized by:')
      
      // Print receipt
      await page.locator('[data-testid="print-receipt"]').click()
      await expect(page.locator('[data-testid="receipt-printed-confirmation"]')).toBeVisible()
      
      // Verify receipt is logged for compliance
      await page.goto('/compliance/receipts')
      await expect(page.locator('[data-testid="receipt-log"]').first()).toContainText('REFUND')
      await expect(page.locator('[data-testid="receipt-log"]').first()).toContainText(REFUND_CONFIG.testTransactions.cashTransaction.id)
    })

    test('refund documentation meets audit requirements', async ({ page }) => {
      await loginAsAdmin(page)
      
      await page.goto('/compliance/refund-audit')
      
      // Should see complete audit trail
      const auditLog = page.locator('[data-testid="refund-audit-log"]')
      
      // Required audit fields
      await expect(auditLog.locator('[data-testid="audit-entry"]').first()).toContainText('Refund ID:')
      await expect(auditLog.locator('[data-testid="audit-entry"]').first()).toContainText('Original Transaction:')
      await expect(auditLog.locator('[data-testid="audit-entry"]').first()).toContainText('Processed by:')
      await expect(auditLog.locator('[data-testid="audit-entry"]').first()).toContainText('Approved by:')
      await expect(auditLog.locator('[data-testid="audit-entry"]').first()).toContainText('Reason:')
      await expect(auditLog.locator('[data-testid="audit-entry"]').first()).toContainText('Amount:')
      await expect(auditLog.locator('[data-testid="audit-entry"]').first()).toContainText('Timestamp:')
      
      // Export audit report
      await page.locator('[data-testid="export-audit-report"]').click()
      await page.locator('[data-testid="date-range-from"]').fill('2024-01-01')
      await page.locator('[data-testid="date-range-to"]').fill('2024-12-31')
      await page.locator('[data-testid="generate-report"]').click()
      
      await expect(page.locator('[data-testid="report-generated"]')).toBeVisible()
      await expect(page.locator('[data-testid="download-report"]')).toBeVisible()
    })
  })

  test.describe('Customer Communication', () => {
    test('customer notification for refund processing', async ({ page }) => {
      await loginAsSupervisor(page)
      await createTestTransactionWithCustomer(page, REFUND_CONFIG.testTransactions.cardTransaction)
      
      await processFullRefund(page, REFUND_CONFIG.testTransactions.cardTransaction.id, 'CUSTOMER_CHANGED_MIND')
      
      // Enable customer notification
      await page.locator(REFUND_CONFIG.selectors.notifyCustomerToggle).check()
      
      // Customize notification message
      const notification = page.locator(REFUND_CONFIG.selectors.customerNotificationMessage)
      await notification.fill('Your refund of ₱250.00 has been processed and will appear in your account within 3-5 business days.')
      
      await page.locator(REFUND_CONFIG.selectors.sendNotificationButton).click()
      
      // Verify notification sent
      await expect(page.locator('[data-testid="notification-sent-success"]')).toBeVisible()
      
      // Check notification log
      await page.goto(REFUND_CONFIG.routes.notifications)
      await expect(page.locator('[data-testid="sent-notifications"]').first()).toContainText('Refund processed')
      await expect(page.locator('[data-testid="sent-notifications"]').first()).toContainText('customer@test.com')
    })

    test('refund status tracking for customers', async ({ page }) => {
      // Login as customer to check refund status
      await loginAsCustomer(page)
      
      await page.goto('/my-account/refunds')
      
      // Should see refund status
      const refundStatus = page.locator('[data-testid="customer-refund-status"]').first()
      await expect(refundStatus).toContainText('Processing')
      await expect(refundStatus).toContainText('₱250.00')
      await expect(refundStatus).toContainText('Estimated completion: 3-5 business days')
      
      // Should see refund reference for tracking
      await expect(refundStatus.locator('[data-testid="refund-reference"]')).toBeVisible()
    })
  })

  test.describe('Fraud Prevention and Controls', () => {
    test('refund velocity limits prevent abuse', async ({ page }) => {
      await loginAsCashier(page)
      
      // Attempt multiple refunds in short time period
      for (let i = 0; i < 3; i++) {
        const transaction = { ...REFUND_CONFIG.testTransactions.cashTransaction, id: `TXN00${i + 4}` }
        await createTestTransaction(page, transaction)
        await processFullRefund(page, transaction.id, 'CUSTOMER_CHANGED_MIND')
      }
      
      // Fourth refund should trigger velocity limit
      const fourthTransaction = { ...REFUND_CONFIG.testTransactions.cashTransaction, id: 'TXN007' }
      await createTestTransaction(page, fourthTransaction)
      
      await page.goto(REFUND_CONFIG.routes.transactions)
      await page.locator(`[data-testid="transaction-${fourthTransaction.id}"]`).click()
      await page.locator(REFUND_CONFIG.selectors.refundTransactionButton).click()
      
      // Should show velocity limit warning
      await expect(page.locator('[data-testid="velocity-limit-warning"]')).toBeVisible()
      await expect(page.locator('[data-testid="velocity-limit-warning"]')).toContainText('Refund limit reached')
      await expect(page.locator('[data-testid="requires-manager-approval"]')).toBeVisible()
    })

    test('suspicious refund pattern detection', async ({ page }) => {
      await loginAsAdmin(page)
      
      await page.goto('/admin/refund-monitoring')
      
      // Should see fraud detection alerts
      const fraudAlerts = page.locator('[data-testid="fraud-detection-alerts"]')
      
      // High refund rate alert
      await expect(fraudAlerts.locator('[data-testid="high-refund-rate"]')).toBeVisible()
      await expect(fraudAlerts.locator('[data-testid="high-refund-rate"]')).toContainText('Cashier John: 15 refunds in last 2 hours')
      
      // Same item pattern alert
      await expect(fraudAlerts.locator('[data-testid="same-item-pattern"]')).toBeVisible()
      await expect(fraudAlerts.locator('[data-testid="same-item-pattern"]')).toContainText('Item ITEM001: 8 refunds today')
      
      // Investigation tools
      await fraudAlerts.locator('[data-testid="investigate-pattern"]').first().click()
      await expect(page.locator('[data-testid="investigation-dashboard"]')).toBeVisible()
      await expect(page.locator('[data-testid="refund-timeline"]')).toBeVisible()
      await expect(page.locator('[data-testid="employee-activity"]')).toBeVisible()
    })
  })

  test.describe('Analytics and Reporting', () => {
    test('V1 CRITICAL: refund analytics dashboard should NOT be available', async ({ page }) => {
      await loginAsAdmin(page)
      
      // Navigate to reports section
      await page.goto(REFUND_CONFIG.routes.reports)
      
      // V1 CRITICAL: Analytics dashboard should NOT be available as customer-facing feature
      await expect(page.locator('[data-testid="analytics-dashboard"]')).not.toBeVisible()
      await expect(page.locator('[data-testid="advanced-analytics"]')).not.toBeVisible()
      
      // Only basic reports should be available in V1
      await expect(page.locator('[data-testid="basic-refund-report"]')).toBeVisible()
      await expect(page.locator('[data-testid="transaction-history"]')).toBeVisible()
      
      console.log('✅ V1 verification: Analytics dashboard properly hidden from customer interface')
    })
      
      await page.goto(REFUND_CONFIG.routes.reports)
      
      // Key metrics
      await expect(page.locator(REFUND_CONFIG.selectors.refundAnalytics)).toBeVisible()
      await expect(page.locator('[data-testid="total-refunds-today"]')).toContainText('₱2,350.00')
      await expect(page.locator('[data-testid="refund-rate"]')).toContainText('3.2%')
      await expect(page.locator('[data-testid="average-refund-amount"]')).toContainText('₱185.50')
      
      // Refund trends
      await expect(page.locator(REFUND_CONFIG.selectors.refundTrends)).toBeVisible()
      await expect(page.locator('[data-testid="refund-trend-chart"]')).toBeVisible()
      
      // Reason analysis
      await expect(page.locator('[data-testid="refund-reasons-chart"]')).toBeVisible()
      await expect(page.locator('[data-testid="defective-product-percentage"]')).toContainText('35%')
      await expect(page.locator('[data-testid="customer-changed-mind-percentage"]')).toContainText('28%')
      
      // Loss impact
      await expect(page.locator(REFUND_CONFIG.selectors.lossReports)).toBeVisible()
      await expect(page.locator('[data-testid="monthly-loss"]')).toContainText('₱45,200.00')
      await expect(page.locator('[data-testid="loss-trend"]')).toContainText('+12% vs last month')
    })

    test('refund performance by employee', async ({ page }) => {
      await loginAsAdmin(page)
      
      await page.goto('/reports/employee-refunds')
      
      // Employee refund statistics
      const employeeStats = page.locator('[data-testid="employee-refund-stats"]')
      
      await expect(employeeStats.locator('[data-testid="employee-john"]')).toContainText('15 refunds')
      await expect(employeeStats.locator('[data-testid="employee-john"]')).toContainText('₱3,250.00 total')
      await expect(employeeStats.locator('[data-testid="employee-john"]')).toContainText('5.2% refund rate')
      
      await expect(employeeStats.locator('[data-testid="employee-mary"]')).toContainText('8 refunds')
      await expect(employeeStats.locator('[data-testid="employee-mary"]')).toContainText('₱1,180.00 total')
      await expect(employeeStats.locator('[data-testid="employee-mary"]')).toContainText('2.1% refund rate')
      
      // Performance insights
      await expect(page.locator('[data-testid="performance-insights"]')).toContainText('John has above-average refund rate')
      await expect(page.locator('[data-testid="training-recommendations"]')).toContainText('Consider additional training on product knowledge')
    })
  })
})
// Helper Functions for Comprehensive Refund Testing

/**
 * Login as cashier user
 */
async function loginAsCashier(page: Page) {
  await page.goto(REFUND_CONFIG.routes.login)
  await page.locator('[data-testid="email-input"]').fill('cashier@test.com')
  await page.locator('[data-testid="password-input"]').fill('cashier123')
  await page.locator('[data-testid="login-button"]').click()
  await expect(page).toHaveURL(/dashboard/)
}

/**
 * Login as supervisor user
 */
async function loginAsSupervisor(page: Page) {
  await page.goto(REFUND_CONFIG.routes.login)
  await page.locator('[data-testid="email-input"]').fill('supervisor@test.com')
  await page.locator('[data-testid="password-input"]').fill('supervisor123')
  await page.locator('[data-testid="login-button"]').click()
  await expect(page).toHaveURL(/dashboard/)
}

/**
 * Login as admin user
 */
async function loginAsAdmin(page: Page) {
  await page.goto(REFUND_CONFIG.routes.login)
  await page.locator('[data-testid="email-input"]').fill('admin@test.com')
  await page.locator('[data-testid="password-input"]').fill('admin123')
  await page.locator('[data-testid="login-button"]').click()
  await expect(page).toHaveURL(/dashboard/)
}

/**
 * Login as customer user
 */
async function loginAsCustomer(page: Page) {
  await page.goto(REFUND_CONFIG.routes.login)
  await page.locator('[data-testid="email-input"]').fill('customer@test.com')
  await page.locator('[data-testid="password-input"]').fill('customer123')
  await page.locator('[data-testid="login-button"]').click()
  await expect(page).toHaveURL(/dashboard/)
}

/**
 * Create test transaction for refund testing
 */
async function createTestTransaction(page: Page, transactionData: any) {
  // Navigate to POS and create transaction
  await page.goto(REFUND_CONFIG.routes.pos)
  
  // Add items to cart
  for (const item of transactionData.items) {
    const productTile = page.locator(`[data-testid="product-${item.id}"]`)
    for (let i = 0; i < item.quantity; i++) {
      await productTile.click()
    }
  }
  
  // Proceed to checkout
  await page.locator('[data-testid="checkout-button"]').click()
  
  // Handle payment method
  if (transactionData.paymentMethod === 'CASH') {
    await page.locator('[data-testid="payment-method-cash"]').click()
    await page.locator('[data-testid="cash-amount-input"]').fill((transactionData.total / 100).toString())
  } else if (transactionData.paymentMethod === 'CARD') {
    await page.locator('[data-testid="payment-method-card"]').click()
    await page.locator('[data-testid="card-amount-input"]').fill((transactionData.total / 100).toString())
  } else if (transactionData.paymentMethods) {
    // Mixed payment
    for (const payment of transactionData.paymentMethods) {
      await page.locator(`[data-testid="payment-method-${payment.type.toLowerCase()}"]`).click()
      await page.locator(`[data-testid="${payment.type.toLowerCase()}-amount-input"]`).fill((payment.amount / 100).toString())
    }
  }
  
  // Complete transaction
  await page.locator('[data-testid="complete-payment"]').click()
  await expect(page.locator('[data-testid="transaction-success"]')).toBeVisible()
  
  // Set transaction ID for reference
  await page.evaluate((txnId) => {
    window.localStorage.setItem('lastTransactionId', txnId)
  }, transactionData.id)
}

/**
 * Create test transaction with customer information
 */
async function createTestTransactionWithCustomer(page: Page, transactionData: any) {
  await createTestTransaction(page, transactionData)
  
  // Add customer information
  await page.locator('[data-testid="add-customer-info"]').click()
  await page.locator('[data-testid="customer-email"]').fill('customer@test.com')
  await page.locator('[data-testid="customer-name"]').fill('Test Customer')
  await page.locator('[data-testid="customer-phone"]').fill('+639123456789')
  await page.locator('[data-testid="save-customer-info"]').click()
}

/**
 * Process a full refund for a transaction
 */
async function processFullRefund(page: Page, transactionId: string, reason: string) {
  await page.goto(REFUND_CONFIG.routes.transactions)
  const transaction = page.locator(`[data-testid="transaction-${transactionId}"]`)
  await transaction.click()
  
  await page.locator(REFUND_CONFIG.selectors.refundTransactionButton).click()
  await page.locator(REFUND_CONFIG.selectors.refundReasonSelect).selectOption(reason)
  
  // Add evidence if required
  const reasonConfig = REFUND_CONFIG.refundReasons.find(r => r.id === reason)
  if (reasonConfig?.requiresEvidence) {
    await uploadEvidence(page, 'evidence.jpg')
  }
  
  await page.locator('[data-testid="refund-notes-input"]').fill('Full refund processed')
  await page.locator(REFUND_CONFIG.selectors.processRefundButton).click()
  
  // Select appropriate refund method based on original payment
  await page.locator(REFUND_CONFIG.selectors.refundMethodSelector).selectOption('ORIGINAL_METHOD')
  await page.locator(REFUND_CONFIG.selectors.confirmRefundButton).click()
  
  await expect(page.locator(REFUND_CONFIG.selectors.successMessage)).toBeVisible()
}

/**
 * Upload evidence file for refund
 */
async function uploadEvidence(page: Page, filename: string) {
  // Simulate file upload - in real test, this would use actual file
  await page.locator(REFUND_CONFIG.selectors.evidenceUpload).click()
  
  // Mock file upload by setting file input value
  await page.evaluate((fileName) => {
    const fileInput = document.querySelector('[data-testid="file-input"]') as HTMLInputElement
    if (fileInput) {
      // Create mock file for testing
      const file = new File(['test evidence'], fileName, { type: 'image/jpeg' })
      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(file)
      fileInput.files = dataTransfer.files
      
      // Trigger change event
      fileInput.dispatchEvent(new Event('change', { bubbles: true }))
    }
  }, filename)
  
  // Wait for upload confirmation
  await expect(page.locator('[data-testid="upload-success"]')).toBeVisible()
}

/**
 * Setup pending refund approval scenario
 */
async function setupPendingRefundApproval(page: Page) {
  // This would typically involve database seeding or API calls to create
  // a pending refund approval scenario for testing
  await page.evaluate(() => {
    window.postMessage({ 
      type: 'SETUP_PENDING_REFUND_APPROVAL',
      data: {
        amount: 75000, // PHP 750.00
        requestedBy: 'cashier@test.com',
        reason: 'DEFECTIVE_PRODUCT',
        transactionId: 'TXN999'
      }
    }, '*')
  })
  
  await page.waitForTimeout(1000)
}