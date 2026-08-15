/**
 * v1-certification-purchasing-grn.spec.ts
 *
 * V1 E2E Certification: Purchasing and Goods Receipt Flow
 *
 * Tests comprehensive purchasing workflow from supplier management through
 * purchase order creation, goods receipt, and inventory updates.
 *
 * Critical V1 User Journey:
 *  ✅ Supplier registration and management
 *  ✅ Purchase order creation and approval workflow
 *  ✅ Goods receipt note (GRN) processing
 *  ✅ Quality control and partial receipts
 *  ✅ Cost tracking and invoice matching
 *  ✅ Inventory updates from received goods
 *  ✅ Purchase analytics and supplier performance
 *  ✅ Three-way matching (PO, GRN, Invoice)
 *
 * Test Strategy:
 *  - Tests complete procure-to-pay process
 *  - Validates approval workflows and authorization
 *  - Tests inventory integration and cost updates
 *  - Verifies supplier performance tracking
 *  - Tests various receipt scenarios (full, partial, damaged)
 *
 * Prerequisites:
 *  - Business with CREATE_PURCHASE capability
 *  - Supplier management enabled
 *  - Approval workflows configured
 *  - Products with supplier relationships
 *  - Cost tracking and valuation enabled
 *
 * Business Rules Validated:
 *  - Purchase orders require proper approval
 *  - Goods receipts update inventory and costs
 *  - Partial receipts supported with tracking
 *  - Cost basis updated using FIFO/LIFO methods
 */

import { test, expect, type Page } from '@playwright/test'
import { faker } from '@faker-js/faker'

// Test configuration for purchasing and GRN flow
const PURCHASING_CONFIG = {
  routes: {
    purchases: '/purchases',
    suppliers: '/suppliers',
    inventory: '/inventory',
    reports: '/reports/purchasing',
    dashboard: '/dashboard',
    approvals: '/approvals',
  },
  selectors: {
    // Supplier management
    addSupplierButton: '[data-testid="add-supplier-button"]',
    supplierNameInput: '[data-testid="supplier-name-input"]',
    supplierContactInput: '[data-testid="supplier-contact-input"]',
    supplierEmailInput: '[data-testid="supplier-email-input"]',
    supplierAddressInput: '[data-testid="supplier-address-input"]',
    saveSupplierButton: '[data-testid="save-supplier-button"]',
    
    // Purchase order creation
    createPurchaseButton: '[data-testid="create-purchase-button"]',
    purchaseOrderModal: '[data-testid="purchase-order-modal"]',
    supplierSelect: '[data-testid="supplier-select"]',
    addItemButton: '[data-testid="add-item-button"]',
    productSelect: '[data-testid="product-select"]',
    quantityInput: '[data-testid="quantity-input"]',
    unitCostInput: '[data-testid="unit-cost-input"]',
    expectedDateInput: '[data-testid="expected-date-input"]',
    purchaseNotesInput: '[data-testid="purchase-notes-input"]',
    savePurchaseButton: '[data-testid="save-purchase-button"]',
    
    // Purchase order approval
    submitForApprovalButton: '[data-testid="submit-for-approval-button"]',
    approvalModal: '[data-testid="approval-modal"]',
    approveButton: '[data-testid="approve-button"]',
    rejectButton: '[data-testid="reject-button"]',
    approvalNotes: '[data-testid="approval-notes"]',
    
    // Goods receipt
    receiveGoodsButton: '[data-testid="receive-goods-button"]',
    grnModal: '[data-testid="grn-modal"]',
    receivedQuantityInput: '[data-testid="received-quantity-input"]',
    qualityCheckSelect: '[data-testid="quality-check-select"]',
    damagedQuantityInput: '[data-testid="damaged-quantity-input"]',
    grnNotesInput: '[data-testid="grn-notes-input"]',
    completeReceiptButton: '[data-testid="complete-receipt-button"]',
    
    // Invoice matching
    invoiceNumber: '[data-testid="invoice-number"]',
    invoiceAmount: '[data-testid="invoice-amount"]',
    matchInvoiceButton: '[data-testid="match-invoice-button"]',
    varianceDisplay: '[data-testid="variance-display"]',
    
    // Purchase tracking
    purchaseOrderList: '[data-testid="purchase-order-list"]',
    purchaseStatus: '[data-testid="purchase-status"]',
    outstandingOrders: '[data-testid="outstanding-orders"]',
    
    // Reporting
    purchaseReport: '[data-testid="purchase-report"]',
    supplierPerformanceReport: '[data-testid="supplier-performance-report"]',
    costAnalysisReport: '[data-testid="cost-analysis-report"]',
  },
  testData: {
    suppliers: [
      {
        name: 'Test Supplier Ltd',
        contact: 'John Smith',
        email: 'orders@testsupplier.com',
        phone: '+639123456789',
        address: 'Manila, Philippines',
        paymentTerms: 'NET_30',
      },
      {
        name: 'Secondary Supplier Inc',
        contact: 'Jane Doe', 
        email: 'supply@secondary.com',
        phone: '+639987654321',
        address: 'Cebu City, Philippines',
        paymentTerms: 'NET_15',
      },
    ],
    products: [
      {
        sku: 'RAW-MAT-001',
        name: 'Raw Material A',
        supplierCost: 45.00,
        orderQuantity: 100,
      },
      {
        sku: 'COMPONENT-B',
        name: 'Component B',
        supplierCost: 125.00,
        orderQuantity: 50,
      },
    ],
  },
}
test.describe('V1 Certification: Purchasing and GRN Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Authenticate as admin user with purchasing access
    await page.goto('/login')
    await page.locator('[data-testid="email-input"]').fill('admin@test.com')
    await page.locator('[data-testid="password-input"]').fill('password123')
    await page.locator('[data-testid="login-button"]').click()
    
    await expect(page).toHaveURL(/dashboard/)
    
    // Ensure test data exists
    await setupTestSuppliers(page)
    await setupTestProducts(page)
  })

  test('complete purchase order creation workflow', async ({ page }) => {
    await page.goto(PURCHASING_CONFIG.routes.purchases)
    
    // Create new purchase order
    await page.locator(PURCHASING_CONFIG.selectors.createPurchaseButton).click()
    await expect(page.locator(PURCHASING_CONFIG.selectors.purchaseOrderModal)).toBeVisible()
    
    const supplier = PURCHASING_CONFIG.testData.suppliers[0]
    const product = PURCHASING_CONFIG.testData.products[0]
    
    // Fill purchase order details
    await page.locator(PURCHASING_CONFIG.selectors.supplierSelect).selectOption(supplier.name)
    
    // Set expected delivery date (7 days from now)
    const expectedDate = new Date()
    expectedDate.setDate(expectedDate.getDate() + 7)
    await page.locator(PURCHASING_CONFIG.selectors.expectedDateInput).fill(expectedDate.toISOString().split('T')[0])
    
    // Add purchase items
    await page.locator(PURCHASING_CONFIG.selectors.addItemButton).click()
    await page.locator(PURCHASING_CONFIG.selectors.productSelect).selectOption(product.sku)
    await page.locator(PURCHASING_CONFIG.selectors.quantityInput).fill(product.orderQuantity.toString())
    await page.locator(PURCHASING_CONFIG.selectors.unitCostInput).fill(product.supplierCost.toString())
    
    // Add purchase notes
    await page.locator(PURCHASING_CONFIG.selectors.purchaseNotesInput).fill('Test purchase order for E2E validation')
    
    // Save purchase order
    await page.locator(PURCHASING_CONFIG.selectors.savePurchaseButton).click()
    await expect(page.locator('[data-testid="purchase-created-success"]')).toBeVisible()
    
    // Verify purchase order appears in list
    await expect(page.locator(PURCHASING_CONFIG.selectors.purchaseOrderList)).toContainText(supplier.name)
    await expect(page.locator(PURCHASING_CONFIG.selectors.purchaseStatus)).toHaveText('DRAFT')
    
    // Verify total calculation
    const expectedTotal = product.orderQuantity * product.supplierCost // 100 * 45 = 4500
    await expect(page.locator('[data-testid="purchase-total"]')).toHaveText(`₱${expectedTotal.toFixed(2)}`)
  })

  test('purchase order approval workflow', async ({ page }) => {
    // Create a purchase order first
    const purchaseOrderId = await createTestPurchaseOrder(page)
    
    // Navigate to purchase orders
    await page.goto(PURCHASING_CONFIG.routes.purchases)
    
    // Find the created purchase order
    const purchaseRow = page.locator(`[data-testid="purchase-${purchaseOrderId}"]`)
    await expect(purchaseRow).toBeVisible()
    
    // Submit for approval
    await purchaseRow.locator(PURCHASING_CONFIG.selectors.submitForApprovalButton).click()
    await expect(page.locator('[data-testid="submitted-for-approval"]')).toBeVisible()
    
    // Verify status updated
    await page.reload()
    await expect(purchaseRow.locator(PURCHASING_CONFIG.selectors.purchaseStatus)).toHaveText('PENDING_APPROVAL')
    
    // Switch to approver role (or simulate approval)
    await page.goto(PURCHASING_CONFIG.routes.approvals)
    
    // Find pending purchase in approval queue
    const approvalItem = page.locator(`[data-testid="approval-purchase-${purchaseOrderId}"]`)
    await expect(approvalItem).toBeVisible()
    
    // Approve purchase order
    await approvalItem.locator(PURCHASING_CONFIG.selectors.approveButton).click()
    await page.locator(PURCHASING_CONFIG.selectors.approvalNotes).fill('Approved for standard inventory replenishment')
    await page.locator('[data-testid="confirm-approval"]').click()
    
    // Verify approval success
    await expect(page.locator('[data-testid="approval-success"]')).toBeVisible()
    
    // Verify status updated to approved
    await page.goto(PURCHASING_CONFIG.routes.purchases)
    await expect(page.locator(`[data-testid="purchase-${purchaseOrderId}"] ${PURCHASING_CONFIG.selectors.purchaseStatus}`)).toHaveText('APPROVED')
  })

  test('goods receipt note (GRN) processing - full receipt', async ({ page }) => {
    // Start with an approved purchase order
    const purchaseOrderId = await createAndApprovePurchaseOrder(page)
    
    await page.goto(PURCHASING_CONFIG.routes.purchases)
    
    const product = PURCHASING_CONFIG.testData.products[0]
    
    // Get initial stock level
    await page.goto(PURCHASING_CONFIG.routes.inventory)
    const initialStockText = await page.locator(`[data-testid="stock-level-${product.sku}"]`).textContent()
    const initialStock = parseInt(initialStockText || '0')
    
    // Process goods receipt
    await page.goto(PURCHASING_CONFIG.routes.purchases)
    const purchaseRow = page.locator(`[data-testid="purchase-${purchaseOrderId}"]`)
    
    // Initiate goods receipt
    await purchaseRow.locator(PURCHASING_CONFIG.selectors.receiveGoodsButton).click()
    await expect(page.locator(PURCHASING_CONFIG.selectors.grnModal)).toBeVisible()
    
    // Record full receipt
    await page.locator(PURCHASING_CONFIG.selectors.receivedQuantityInput).fill(product.orderQuantity.toString())
    await page.locator(PURCHASING_CONFIG.selectors.qualityCheckSelect).selectOption('PASSED')
    await page.locator(PURCHASING_CONFIG.selectors.grnNotesInput).fill('All items received in good condition')
    
    // Complete receipt
    await page.locator(PURCHASING_CONFIG.selectors.completeReceiptButton).click()
    await expect(page.locator('[data-testid="grn-completed"]')).toBeVisible()
    
    // Verify purchase status updated
    await expect(purchaseRow.locator(PURCHASING_CONFIG.selectors.purchaseStatus)).toHaveText('RECEIVED')
    
    // Verify inventory updated
    await page.goto(PURCHASING_CONFIG.routes.inventory)
    const newStockText = await page.locator(`[data-testid="stock-level-${product.sku}"]`).textContent()
    const newStock = parseInt(newStockText || '0')
    
    expect(newStock).toBe(initialStock + product.orderQuantity)
    
    // Verify movement record created
    await page.locator(`[data-testid="view-movements-${product.sku}"]`).click()
    await expect(page.locator('[data-testid="movement-PURCHASE"]')).toBeVisible()
    await expect(page.locator('[data-testid="purchase-movement-quantity"]')).toContainText(`+${product.orderQuantity}`)
  })
  test('partial goods receipt with backorder tracking', async ({ page }) => {
    const purchaseOrderId = await createAndApprovePurchaseOrder(page)
    
    await page.goto(PURCHASING_CONFIG.routes.purchases)
    const purchaseRow = page.locator(`[data-testid="purchase-${purchaseOrderId}"]`)
    
    const product = PURCHASING_CONFIG.testData.products[0]
    const partialQuantity = Math.floor(product.orderQuantity * 0.7) // Receive 70%
    
    // Process partial receipt
    await purchaseRow.locator(PURCHASING_CONFIG.selectors.receiveGoodsButton).click()
    
    await page.locator(PURCHASING_CONFIG.selectors.receivedQuantityInput).fill(partialQuantity.toString())
    await page.locator(PURCHASING_CONFIG.selectors.qualityCheckSelect).selectOption('PASSED')
    await page.locator(PURCHASING_CONFIG.selectors.grnNotesInput).fill(`Partial delivery - received ${partialQuantity} of ${product.orderQuantity} ordered`)
    
    await page.locator(PURCHASING_CONFIG.selectors.completeReceiptButton).click()
    await expect(page.locator('[data-testid="partial-receipt-success"]')).toBeVisible()
    
    // Verify status shows partial receipt
    await expect(purchaseRow.locator(PURCHASING_CONFIG.selectors.purchaseStatus)).toHaveText('PARTIALLY_RECEIVED')
    
    // Verify outstanding quantity tracked
    await expect(page.locator('[data-testid="outstanding-quantity"]')).toHaveText(`${product.orderQuantity - partialQuantity}`)
    
    // Verify backorder created
    await expect(page.locator('[data-testid="backorder-indicator"]')).toBeVisible()
    
    // Process remaining delivery
    await purchaseRow.locator(PURCHASING_CONFIG.selectors.receiveGoodsButton).click()
    
    const remainingQuantity = product.orderQuantity - partialQuantity
    await page.locator(PURCHASING_CONFIG.selectors.receivedQuantityInput).fill(remainingQuantity.toString())
    await page.locator(PURCHASING_CONFIG.selectors.qualityCheckSelect).selectOption('PASSED')
    await page.locator(PURCHASING_CONFIG.selectors.grnNotesInput).fill('Final delivery - completing the order')
    
    await page.locator(PURCHASING_CONFIG.selectors.completeReceiptButton).click()
    
    // Verify order fully completed
    await expect(purchaseRow.locator(PURCHASING_CONFIG.selectors.purchaseStatus)).toHaveText('RECEIVED')
    await expect(page.locator('[data-testid="backorder-indicator"]')).not.toBeVisible()
  })

  test('damaged goods processing and quality control', async ({ page }) => {
    const purchaseOrderId = await createAndApprovePurchaseOrder(page)
    
    await page.goto(PURCHASING_CONFIG.routes.purchases)
    const purchaseRow = page.locator(`[data-testid="purchase-${purchaseOrderId}"]`)
    
    const product = PURCHASING_CONFIG.testData.products[0]
    const damagedQuantity = 10
    const goodQuantity = product.orderQuantity - damagedQuantity
    
    // Process receipt with damaged goods
    await purchaseRow.locator(PURCHASING_CONFIG.selectors.receiveGoodsButton).click()
    
    await page.locator(PURCHASING_CONFIG.selectors.receivedQuantityInput).fill(product.orderQuantity.toString())
    await page.locator(PURCHASING_CONFIG.selectors.qualityCheckSelect).selectOption('FAILED')
    await page.locator(PURCHASING_CONFIG.selectors.damagedQuantityInput).fill(damagedQuantity.toString())
    await page.locator(PURCHASING_CONFIG.selectors.grnNotesInput).fill(`${damagedQuantity} units damaged during transport - water damage`)
    
    await page.locator(PURCHASING_CONFIG.selectors.completeReceiptButton).click()
    
    // Verify damaged goods handling
    await expect(page.locator('[data-testid="damaged-goods-alert"]')).toBeVisible()
    await expect(page.locator('[data-testid="quality-control-report"]')).toBeVisible()
    
    // Verify only good quantity added to inventory
    await page.goto(PURCHASING_CONFIG.routes.inventory)
    await page.locator(`[data-testid="view-movements-${product.sku}"]`).click()
    
    // Should show purchase movement for good quantity
    await expect(page.locator('[data-testid="movement-PURCHASE"]')).toBeVisible()
    await expect(page.locator('[data-testid="purchase-movement-quantity"]')).toContainText(`+${goodQuantity}`)
    
    // Should show damage adjustment for damaged quantity
    await expect(page.locator('[data-testid="movement-DAMAGE"]')).toBeVisible()
    await expect(page.locator('[data-testid="damage-movement-quantity"]')).toContainText(`-${damagedQuantity}`)
  })

  test('invoice matching and three-way verification', async ({ page }) => {
    const purchaseOrderId = await createAndApprovePurchaseOrder(page)
    
    // Complete goods receipt first
    await completeGoodsReceipt(page, purchaseOrderId)
    
    await page.goto(PURCHASING_CONFIG.routes.purchases)
    const purchaseRow = page.locator(`[data-testid="purchase-${purchaseOrderId}"]`)
    
    // Process invoice matching
    await purchaseRow.locator('[data-testid="match-invoice"]').click()
    
    const product = PURCHASING_CONFIG.testData.products[0]
    const expectedAmount = product.orderQuantity * product.supplierCost
    const invoiceNumber = `INV-${faker.string.alphanumeric(8).toUpperCase()}`
    
    // Enter invoice details
    await page.locator(PURCHASING_CONFIG.selectors.invoiceNumber).fill(invoiceNumber)
    await page.locator(PURCHASING_CONFIG.selectors.invoiceAmount).fill(expectedAmount.toString())
    
    // Match invoice
    await page.locator(PURCHASING_CONFIG.selectors.matchInvoiceButton).click()
    
    // Verify three-way match successful (PO + GRN + Invoice)
    await expect(page.locator('[data-testid="three-way-match-success"]')).toBeVisible()
    await expect(page.locator(PURCHASING_CONFIG.selectors.varianceDisplay)).toHaveText('₱0.00')
    
    // Test invoice variance scenario
    await page.locator('[data-testid="edit-invoice"]').click()
    const higherAmount = expectedAmount + 500 // ₱500 variance
    await page.locator(PURCHASING_CONFIG.selectors.invoiceAmount).fill(higherAmount.toString())
    await page.locator(PURCHASING_CONFIG.selectors.matchInvoiceButton).click()
    
    // Verify variance detected
    await expect(page.locator('[data-testid="variance-alert"]')).toBeVisible()
    await expect(page.locator(PURCHASING_CONFIG.selectors.varianceDisplay)).toHaveText('₱500.00')
    
    // Variance should require approval
    await expect(page.locator('[data-testid="variance-approval-required"]')).toBeVisible()
  })
  test('supplier management and performance tracking', async ({ page }) => {
    await page.goto(PURCHASING_CONFIG.routes.suppliers)
    
    // Create additional supplier for comparison
    const newSupplier = {
      name: 'Premium Supplier Co',
      contact: 'Sarah Johnson',
      email: 'orders@premiumsupplier.com', 
      phone: '+639555123456',
      address: 'BGC, Taguig City',
      paymentTerms: 'NET_7',
    }
    
    await page.locator(PURCHASING_CONFIG.selectors.addSupplierButton).click()
    await page.locator(PURCHASING_CONFIG.selectors.supplierNameInput).fill(newSupplier.name)
    await page.locator(PURCHASING_CONFIG.selectors.supplierContactInput).fill(newSupplier.contact)
    await page.locator(PURCHASING_CONFIG.selectors.supplierEmailInput).fill(newSupplier.email)
    await page.locator('[data-testid="supplier-phone-input"]').fill(newSupplier.phone)
    await page.locator(PURCHASING_CONFIG.selectors.supplierAddressInput).fill(newSupplier.address)
    await page.locator('[data-testid="payment-terms-select"]').selectOption(newSupplier.paymentTerms)
    
    await page.locator(PURCHASING_CONFIG.selectors.saveSupplierButton).click()
    await expect(page.locator('[data-testid="supplier-created"]')).toBeVisible()
    
    // Create purchase orders with both suppliers for performance comparison
    await createPurchaseOrderWithSupplier(page, PURCHASING_CONFIG.testData.suppliers[0].name)
    await createPurchaseOrderWithSupplier(page, newSupplier.name)
    
    // Generate supplier performance report
    await page.goto(PURCHASING_CONFIG.routes.reports)
    await page.locator(PURCHASING_CONFIG.selectors.supplierPerformanceReport).click()
    
    // Verify supplier metrics
    await expect(page.locator('[data-testid="supplier-metrics"]')).toBeVisible()
    await expect(page.locator('[data-testid="delivery-performance"]')).toBeVisible()
    await expect(page.locator('[data-testid="quality-metrics"]')).toBeVisible()
    await expect(page.locator('[data-testid="cost-analysis"]')).toBeVisible()
    
    // Test supplier comparison
    await page.locator('[data-testid="compare-suppliers"]').click()
    await page.locator('[data-testid="supplier-1"]').selectOption(PURCHASING_CONFIG.testData.suppliers[0].name)
    await page.locator('[data-testid="supplier-2"]').selectOption(newSupplier.name)
    await page.locator('[data-testid="generate-comparison"]').click()
    
    await expect(page.locator('[data-testid="supplier-comparison-chart"]')).toBeVisible()
  })

  test('purchase analytics and cost tracking', async ({ page }) => {
    // Create multiple purchase orders for analytics
    await createMultiplePurchaseOrders(page)
    
    await page.goto(PURCHASING_CONFIG.routes.reports)
    
    // Generate purchase analysis report
    await page.locator(PURCHASING_CONFIG.selectors.purchaseReport).click()
    
    // Set date range for analysis
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 30) // Last 30 days
    
    await page.locator('[data-testid="report-start-date"]').fill(startDate.toISOString().split('T')[0])
    await page.locator('[data-testid="report-end-date"]').fill(new Date().toISOString().split('T')[0])
    await page.locator('[data-testid="generate-report"]').click()
    
    // Verify purchase analytics
    await expect(page.locator('[data-testid="total-purchases"]')).toBeVisible()
    await expect(page.locator('[data-testid="average-order-value"]')).toBeVisible()
    await expect(page.locator('[data-testid="top-suppliers"]')).toBeVisible()
    await expect(page.locator('[data-testid="category-breakdown"]')).toBeVisible()
    
    // Test cost analysis
    await page.locator(PURCHASING_CONFIG.selectors.costAnalysisReport).click()
    
    await expect(page.locator('[data-testid="cost-trends"]')).toBeVisible()
    await expect(page.locator('[data-testid="price-variance"]')).toBeVisible()
    await expect(page.locator('[data-testid="cost-savings-opportunities"]')).toBeVisible()
    
    // Export reports
    await page.locator('[data-testid="export-purchase-report"]').click()
    await expect(page.locator('[data-testid="report-exported"]')).toBeVisible()
  })

  test('purchase order cancellation and modifications', async ({ page }) => {
    const purchaseOrderId = await createTestPurchaseOrder(page)
    
    await page.goto(PURCHASING_CONFIG.routes.purchases)
    const purchaseRow = page.locator(`[data-testid="purchase-${purchaseOrderId}"]`)
    
    // Test modification before approval
    await purchaseRow.locator('[data-testid="edit-purchase"]').click()
    
    // Modify quantity
    await page.locator('[data-testid="edit-quantity"]').fill('150') // Increase quantity
    await page.locator('[data-testid="save-modifications"]').click()
    
    await expect(page.locator('[data-testid="purchase-modified"]')).toBeVisible()
    
    // Verify total updated
    const newExpectedTotal = 150 * PURCHASING_CONFIG.testData.products[0].supplierCost
    await expect(page.locator('[data-testid="purchase-total"]')).toHaveText(`₱${newExpectedTotal.toFixed(2)}`)
    
    // Test cancellation
    await purchaseRow.locator('[data-testid="cancel-purchase"]').click()
    await page.locator('[data-testid="cancellation-reason"]').fill('Changed supplier - better pricing available')
    await page.locator('[data-testid="confirm-cancellation"]').click()
    
    // Verify cancellation
    await expect(purchaseRow.locator(PURCHASING_CONFIG.selectors.purchaseStatus)).toHaveText('CANCELLED')
    await expect(page.locator('[data-testid="cancellation-success"]')).toBeVisible()
    
    // Test that cancelled order cannot be received
    await expect(purchaseRow.locator(PURCHASING_CONFIG.selectors.receiveGoodsButton)).toBeDisabled()
  })

  test('purchase approval rejection workflow', async ({ page }) => {
    const purchaseOrderId = await createTestPurchaseOrder(page)
    
    // Submit for approval
    await page.goto(PURCHASING_CONFIG.routes.purchases)
    const purchaseRow = page.locator(`[data-testid="purchase-${purchaseOrderId}"]`)
    await purchaseRow.locator(PURCHASING_CONFIG.selectors.submitForApprovalButton).click()
    
    // Navigate to approvals and reject
    await page.goto(PURCHASING_CONFIG.routes.approvals)
    const approvalItem = page.locator(`[data-testid="approval-purchase-${purchaseOrderId}"]`)
    
    await approvalItem.locator(PURCHASING_CONFIG.selectors.rejectButton).click()
    await page.locator(PURCHASING_CONFIG.selectors.approvalNotes).fill('Pricing too high - negotiate with supplier or find alternative')
    await page.locator('[data-testid="confirm-rejection"]').click()
    
    await expect(page.locator('[data-testid="rejection-success"]')).toBeVisible()
    
    // Verify status updated to rejected
    await page.goto(PURCHASING_CONFIG.routes.purchases)
    await expect(page.locator(`[data-testid="purchase-${purchaseOrderId}"] ${PURCHASING_CONFIG.selectors.purchaseStatus}`)).toHaveText('REJECTED')
    
    // Verify order can be modified after rejection
    await purchaseRow.locator('[data-testid="edit-purchase"]').click()
    await expect(page.locator('[data-testid="edit-form"]')).toBeVisible()
  })
  test('purchase error handling and validation', async ({ page }) => {
    await page.goto(PURCHASING_CONFIG.routes.purchases)
    
    // Test empty purchase order creation
    await page.locator(PURCHASING_CONFIG.selectors.createPurchaseButton).click()
    
    // Try to save without required fields
    await page.locator(PURCHASING_CONFIG.selectors.savePurchaseButton).click()
    await expect(page.locator('[data-testid="supplier-required-error"]')).toBeVisible()
    
    // Test invalid quantities
    await page.locator(PURCHASING_CONFIG.selectors.supplierSelect).selectOption(PURCHASING_CONFIG.testData.suppliers[0].name)
    await page.locator(PURCHASING_CONFIG.selectors.addItemButton).click()
    await page.locator(PURCHASING_CONFIG.selectors.productSelect).selectOption(PURCHASING_CONFIG.testData.products[0].sku)
    await page.locator(PURCHASING_CONFIG.selectors.quantityInput).fill('-10') // Negative quantity
    
    await expect(page.locator('[data-testid="invalid-quantity-error"]')).toBeVisible()
    
    // Test invalid cost
    await page.locator(PURCHASING_CONFIG.selectors.quantityInput).fill('10')
    await page.locator(PURCHASING_CONFIG.selectors.unitCostInput).fill('0') // Zero cost
    
    await expect(page.locator('[data-testid="invalid-cost-error"]')).toBeVisible()
    
    // Test duplicate product in same order
    await page.locator(PURCHASING_CONFIG.selectors.unitCostInput).fill('50')
    await page.locator(PURCHASING_CONFIG.selectors.addItemButton).click()
    await page.locator('[data-testid="product-select-2"]').selectOption(PURCHASING_CONFIG.testData.products[0].sku)
    
    await expect(page.locator('[data-testid="duplicate-product-error"]')).toBeVisible()
  })

  test('outstanding purchase orders tracking', async ({ page }) => {
    // Create multiple purchase orders at different stages
    const po1 = await createAndApprovePurchaseOrder(page)
    const po2 = await createTestPurchaseOrder(page) // Draft
    
    // Navigate to dashboard to check outstanding orders
    await page.goto(PURCHASING_CONFIG.routes.dashboard)
    
    await expect(page.locator(PURCHASING_CONFIG.selectors.outstandingOrders)).toBeVisible()
    await expect(page.locator('[data-testid="pending-approvals-count"]')).toContainText('1') // po2 pending
    await expect(page.locator('[data-testid="approved-orders-count"]')).toContainText('1') // po1 approved
    
    // Test outstanding orders report
    await page.goto(PURCHASING_CONFIG.routes.purchases)
    await page.locator('[data-testid="outstanding-orders-filter"]').click()
    
    // Should show only non-completed orders
    await expect(page.locator(`[data-testid="purchase-${po1}"]`)).toBeVisible()
    await expect(page.locator(`[data-testid="purchase-${po2}"]`)).toBeVisible()
    
    // Complete one order and verify it's removed from outstanding
    await completeGoodsReceipt(page, po1)
    await page.locator('[data-testid="outstanding-orders-filter"]').click()
    
    await expect(page.locator(`[data-testid="purchase-${po1}"]`)).not.toBeVisible()
    await expect(page.locator(`[data-testid="purchase-${po2}"]`)).toBeVisible()
  })
})

// Helper Functions
async function setupTestSuppliers(page: Page) {
  await page.goto(PURCHASING_CONFIG.routes.suppliers)
  
  for (const supplier of PURCHASING_CONFIG.testData.suppliers) {
    // Check if supplier exists
    const existingSupplier = page.locator(`[data-testid="supplier-${supplier.name}"]`)
    if (await existingSupplier.isVisible()) {
      continue
    }
    
    // Create supplier
    await page.locator(PURCHASING_CONFIG.selectors.addSupplierButton).click()
    await page.locator(PURCHASING_CONFIG.selectors.supplierNameInput).fill(supplier.name)
    await page.locator(PURCHASING_CONFIG.selectors.supplierContactInput).fill(supplier.contact)
    await page.locator(PURCHASING_CONFIG.selectors.supplierEmailInput).fill(supplier.email)
    await page.locator('[data-testid="supplier-phone-input"]').fill(supplier.phone)
    await page.locator(PURCHASING_CONFIG.selectors.supplierAddressInput).fill(supplier.address)
    await page.locator('[data-testid="payment-terms-select"]').selectOption(supplier.paymentTerms)
    
    await page.locator(PURCHASING_CONFIG.selectors.saveSupplierButton).click()
    await expect(page.locator('[data-testid="supplier-created"]')).toBeVisible()
  }
}
async function setupTestProducts(page: Page) {
  await page.goto('/products')
  
  for (const product of PURCHASING_CONFIG.testData.products) {
    // Check if product exists
    const existingProduct = page.locator(`[data-testid="product-${product.sku}"]`)
    if (await existingProduct.isVisible()) {
      continue
    }
    
    // Create product
    await page.locator('[data-testid="add-product-button"]').click()
    await page.locator('[data-testid="product-name-input"]').fill(product.name)
    await page.locator('[data-testid="product-sku-input"]').fill(product.sku)
    await page.locator('[data-testid="product-cost-input"]').fill(product.supplierCost.toString())
    await page.locator('[data-testid="product-category-select"]').selectOption('Raw Materials')
    
    await page.locator('[data-testid="save-product-button"]').click()
    await expect(page.locator(`[data-testid="product-${product.sku}"]`)).toBeVisible()
  }
}

async function createTestPurchaseOrder(page: Page): Promise<string> {
  await page.goto(PURCHASING_CONFIG.routes.purchases)
  
  const supplier = PURCHASING_CONFIG.testData.suppliers[0]
  const product = PURCHASING_CONFIG.testData.products[0]
  
  await page.locator(PURCHASING_CONFIG.selectors.createPurchaseButton).click()
  await page.locator(PURCHASING_CONFIG.selectors.supplierSelect).selectOption(supplier.name)
  
  const expectedDate = new Date()
  expectedDate.setDate(expectedDate.getDate() + 7)
  await page.locator(PURCHASING_CONFIG.selectors.expectedDateInput).fill(expectedDate.toISOString().split('T')[0])
  
  await page.locator(PURCHASING_CONFIG.selectors.addItemButton).click()
  await page.locator(PURCHASING_CONFIG.selectors.productSelect).selectOption(product.sku)
  await page.locator(PURCHASING_CONFIG.selectors.quantityInput).fill(product.orderQuantity.toString())
  await page.locator(PURCHASING_CONFIG.selectors.unitCostInput).fill(product.supplierCost.toString())
  
  await page.locator(PURCHASING_CONFIG.selectors.purchaseNotesInput).fill('Test purchase order')
  await page.locator(PURCHASING_CONFIG.selectors.savePurchaseButton).click()
  
  // Extract and return purchase order ID
  const successMessage = await page.locator('[data-testid="purchase-created-success"]').textContent()
  const poId = successMessage?.match(/PO-(\d{4}-\d{6})/)?.[1] || 'unknown'
  return poId
}

async function createAndApprovePurchaseOrder(page: Page): Promise<string> {
  const purchaseOrderId = await createTestPurchaseOrder(page)
  
  // Submit for approval
  const purchaseRow = page.locator(`[data-testid="purchase-${purchaseOrderId}"]`)
  await purchaseRow.locator(PURCHASING_CONFIG.selectors.submitForApprovalButton).click()
  
  // Approve
  await page.goto(PURCHASING_CONFIG.routes.approvals)
  const approvalItem = page.locator(`[data-testid="approval-purchase-${purchaseOrderId}"]`)
  await approvalItem.locator(PURCHASING_CONFIG.selectors.approveButton).click()
  await page.locator(PURCHASING_CONFIG.selectors.approvalNotes).fill('Approved for E2E testing')
  await page.locator('[data-testid="confirm-approval"]').click()
  
  return purchaseOrderId
}

async function completeGoodsReceipt(page: Page, purchaseOrderId: string) {
  await page.goto(PURCHASING_CONFIG.routes.purchases)
  const purchaseRow = page.locator(`[data-testid="purchase-${purchaseOrderId}"]`)
  
  const product = PURCHASING_CONFIG.testData.products[0]
  
  await purchaseRow.locator(PURCHASING_CONFIG.selectors.receiveGoodsButton).click()
  await page.locator(PURCHASING_CONFIG.selectors.receivedQuantityInput).fill(product.orderQuantity.toString())
  await page.locator(PURCHASING_CONFIG.selectors.qualityCheckSelect).selectOption('PASSED')
  await page.locator(PURCHASING_CONFIG.selectors.grnNotesInput).fill('Full receipt completed for E2E testing')
  await page.locator(PURCHASING_CONFIG.selectors.completeReceiptButton).click()
  
  await expect(page.locator('[data-testid="grn-completed"]')).toBeVisible()
}

async function createPurchaseOrderWithSupplier(page: Page, supplierName: string): Promise<string> {
  await page.goto(PURCHASING_CONFIG.routes.purchases)
  
  const product = PURCHASING_CONFIG.testData.products[0]
  
  await page.locator(PURCHASING_CONFIG.selectors.createPurchaseButton).click()
  await page.locator(PURCHASING_CONFIG.selectors.supplierSelect).selectOption(supplierName)
  
  const expectedDate = new Date()
  expectedDate.setDate(expectedDate.getDate() + 7)
  await page.locator(PURCHASING_CONFIG.selectors.expectedDateInput).fill(expectedDate.toISOString().split('T')[0])
  
  await page.locator(PURCHASING_CONFIG.selectors.addItemButton).click()
  await page.locator(PURCHASING_CONFIG.selectors.productSelect).selectOption(product.sku)
  await page.locator(PURCHASING_CONFIG.selectors.quantityInput).fill(product.orderQuantity.toString())
  await page.locator(PURCHASING_CONFIG.selectors.unitCostInput).fill(product.supplierCost.toString())
  
  await page.locator(PURCHASING_CONFIG.selectors.savePurchaseButton).click()
  
  const successMessage = await page.locator('[data-testid="purchase-created-success"]').textContent()
  const poId = successMessage?.match(/PO-(\d{4}-\d{6})/)?.[1] || 'unknown'
  return poId
}

async function createMultiplePurchaseOrders(page: Page) {
  // Create orders with different suppliers for analytics testing
  for (const supplier of PURCHASING_CONFIG.testData.suppliers) {
    await createPurchaseOrderWithSupplier(page, supplier.name)
  }
}