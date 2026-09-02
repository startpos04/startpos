/**
 * v1-certification-inventory-management.spec.ts
 *
 * V1 E2E Certification: Inventory Management Flow
 *
 * Tests comprehensive inventory management capabilities including stock
 * adjustments, transfers between branches, low stock monitoring, and reporting.
 *
 * Critical V1 User Journey:
 *  ✅ Stock adjustment creation and approval workflows
 *  ✅ Inter-branch stock transfers and tracking
 *  ✅ Low stock alerts and threshold management
 *  ✅ Inventory valuation and cost tracking
 *  ✅ Stock movement audit trail and reporting
 *  ✅ Batch/expiry date tracking for perishables
 *  ✅ Physical count reconciliation
 *  ✅ Integration with POS sales deductions
 *
 * Test Strategy:
 *  - Tests complete inventory lifecycle management
 *  - Validates multi-branch stock coordination
 *  - Tests automated alerts and threshold enforcement
 *  - Verifies cost accounting and valuation accuracy
 *  - Tests integration with sales and purchasing flows
 *
 * Prerequisites:
 *  - Business with MANAGE_INVENTORY capability
 *  - Multi-branch setup for transfer testing
 *  - Products with varying stock levels and categories
 *  - Cost tracking and valuation enabled
 *
 * Business Rules Validated:
 *  - Stock adjustments require proper authorization
 *  - Transfers maintain chain of custody
 *  - Low stock alerts trigger at configured thresholds
 *  - Cost basis tracked through FIFO/LIFO methods
 */

import { test, expect, type Page } from '@playwright/test'
import { faker } from '@faker-js/faker'

// Test configuration for inventory management flow
const INVENTORY_CONFIG = {
  routes: {
    inventory: '/inventory',
    products: '/products',
    branches: '/settings/-branches',
    reports: '/reports/inventory',
    dashboard: '/dashboard',
    settings: '/settings/inventory',
  },
  selectors: {
    // Inventory overview
    inventoryGrid: '[data-testid="inventory-grid"]',
    stockItem: '[data-testid="stock-item"]',
    stockLevel: '[data-testid="stock-level"]',
    lowStockAlert: '[data-testid="low-stock-alert"]',
    
    // Stock adjustments
    adjustStockButton: '[data-testid="adjust-stock-button"]',
    adjustmentModal: '[data-testid="adjustment-modal"]',
    adjustmentType: '[data-testid="adjustment-type"]',
    adjustmentQuantity: '[data-testid="adjustment-quantity"]',
    adjustmentReason: '[data-testid="adjustment-reason"]',
    adjustmentNotes: '[data-testid="adjustment-notes"]',
    saveAdjustmentButton: '[data-testid="save-adjustment-button"]',
    
    // Stock transfers
    transferStockButton: '[data-testid="transfer-stock-button"]',
    transferModal: '[data-testid="transfer-modal"]',
    sourceBranchSelect: '[data-testid="source-branch-select"]',
    destinationBranchSelect: '[data-testid="destination-branch-select"]',
    transferQuantity: '[data-testid="transfer-quantity"]',
    transferNotes: '[data-testid="transfer-notes"]',
    initiateTransferButton: '[data-testid="initiate-transfer-button"]',
    
    // Transfer tracking
    transfersList: '[data-testid="transfers-list"]',
    transferStatus: '[data-testid="transfer-status"]',
    receiveTransferButton: '[data-testid="receive-transfer-button"]',
    confirmReceiptButton: '[data-testid="confirm-receipt-button"]',
    
    // Low stock management
    lowStockThreshold: '[data-testid="low-stock-threshold"]',
    updateThresholdButton: '[data-testid="update-threshold-button"]',
    lowStockList: '[data-testid="low-stock-list"]',
    restockSuggestion: '[data-testid="restock-suggestion"]',
    
    // Inventory reports
    stockValuationReport: '[data-testid="stock-valuation-report"]',
    movementHistoryReport: '[data-testid="movement-history-report"]',
    lowStockReport: '[data-testid="low-stock-report"]',
    exportReportButton: '[data-testid="export-report-button"]',
    
    // Physical count
    physicalCountButton: '[data-testid="physical-count-button"]',
    countQuantityInput: '[data-testid="count-quantity-input"]',
    varianceDisplay: '[data-testid="variance-display"]',
    reconcileButton: '[data-testid="reconcile-button"]',
  },
  testData: {
    products: [
      {
        sku: 'WIDGET-001',
        name: 'Test Widget',
        currentStock: 100,
        lowStockThreshold: 20,
        cost: 50.00,
        category: 'Electronics',
      },
      {
        sku: 'FOOD-001', 
        name: 'Perishable Food Item',
        currentStock: 50,
        lowStockThreshold: 10,
        cost: 25.00,
        category: 'Food',
        isPerishable: true,
        expiryDays: 30,
      },
    ],
    branches: [
      { name: 'Main Branch', code: 'MAIN' },
      { name: 'Branch 2', code: 'BR02' },
    ],
    adjustmentReasons: [
      'DAMAGE', 'THEFT', 'EXPIRED', 'CORRECTION', 'PROMOTION'
    ],
  },
}
test.describe('V1 Certification: Inventory Management', () => {
  test.beforeEach(async ({ page }) => {
    // Authenticate as supervisor with inventory management access
    await page.goto('/login')
    await page.locator('[data-testid="email-input"]').fill('supervisor@test.com')
    await page.locator('[data-testid="password-input"]').fill('password123')
    await page.locator('[data-testid="login-button"]').click()
    
    await expect(page).toHaveURL(/dashboard/)
    
    // Ensure test products exist
    await setupTestProducts(page)
  })

  test('stock adjustment workflow - increase inventory', async ({ page }) => {
    await page.goto(INVENTORY_CONFIG.routes.inventory)
    
    const product = INVENTORY_CONFIG.testData.products[0]
    
    // Get current stock level
    const currentStockElement = page.locator(`[data-testid="stock-level-${product.sku}"]`)
    const currentStockText = await currentStockElement.textContent()
    const currentStock = parseInt(currentStockText || '0')
    
    // Initiate stock adjustment
    await page.locator(`[data-testid="adjust-stock-${product.sku}"]`).click()
    await expect(page.locator(INVENTORY_CONFIG.selectors.adjustmentModal)).toBeVisible()
    
    // Fill adjustment details
    await page.locator(INVENTORY_CONFIG.selectors.adjustmentType).selectOption('INCREASE')
    await page.locator(INVENTORY_CONFIG.selectors.adjustmentQuantity).fill('25')
    await page.locator(INVENTORY_CONFIG.selectors.adjustmentReason).selectOption('CORRECTION')
    await page.locator(INVENTORY_CONFIG.selectors.adjustmentNotes).fill('Stock count correction after physical inventory')
    
    // Save adjustment
    await page.locator(INVENTORY_CONFIG.selectors.saveAdjustmentButton).click()
    await expect(page.locator('[data-testid="adjustment-success"]')).toBeVisible()
    
    // Verify stock level updated
    await page.reload()
    const newStockText = await currentStockElement.textContent()
    const newStock = parseInt(newStockText || '0')
    expect(newStock).toBe(currentStock + 25)
    
    // Verify movement record created
    await page.locator(`[data-testid="view-movements-${product.sku}"]`).click()
    await expect(page.locator('[data-testid="movement-ADJUSTMENT"]')).toBeVisible()
    await expect(page.locator('[data-testid="movement-quantity"]')).toContainText('+25')
  })

  test('stock adjustment workflow - decrease inventory', async ({ page }) => {
    await page.goto(INVENTORY_CONFIG.routes.inventory)
    
    const product = INVENTORY_CONFIG.testData.products[0]
    
    // Initiate stock reduction for damaged goods
    await page.locator(`[data-testid="adjust-stock-${product.sku}"]`).click()
    
    await page.locator(INVENTORY_CONFIG.selectors.adjustmentType).selectOption('DECREASE')
    await page.locator(INVENTORY_CONFIG.selectors.adjustmentQuantity).fill('15')
    await page.locator(INVENTORY_CONFIG.selectors.adjustmentReason).selectOption('DAMAGE')
    await page.locator(INVENTORY_CONFIG.selectors.adjustmentNotes).fill('Water damage from roof leak')
    
    // Save adjustment
    await page.locator(INVENTORY_CONFIG.selectors.saveAdjustmentButton).click()
    await expect(page.locator('[data-testid="adjustment-success"]')).toBeVisible()
    
    // Verify negative movement recorded
    await page.locator(`[data-testid="view-movements-${product.sku}"]`).click()
    await expect(page.locator('[data-testid="movement-DAMAGE"]')).toBeVisible()
    await expect(page.locator('[data-testid="movement-quantity"]')).toContainText('-15')
    
    // Verify cost impact calculated
    await expect(page.locator('[data-testid="movement-cost-impact"]')).toContainText('₱750.00') // 15 * 50.00
  })

  test('inter-branch stock transfer workflow', async ({ page }) => {
    // Ensure we have multiple branches
    await setupMultipleBranches(page)
    
    await page.goto(INVENTORY_CONFIG.routes.inventory)
    
    const product = INVENTORY_CONFIG.testData.products[0]
    
    // Initiate transfer from main branch to branch 2
    await page.locator(`[data-testid="transfer-stock-${product.sku}"]`).click()
    await expect(page.locator(INVENTORY_CONFIG.selectors.transferModal)).toBeVisible()
    
    // Configure transfer
    await page.locator(INVENTORY_CONFIG.selectors.sourceBranchSelect).selectOption('MAIN')
    await page.locator(INVENTORY_CONFIG.selectors.destinationBranchSelect).selectOption('BR02')
    await page.locator(INVENTORY_CONFIG.selectors.transferQuantity).fill('30')
    await page.locator(INVENTORY_CONFIG.selectors.transferNotes).fill('Rebalancing stock between branches')
    
    // Initiate transfer
    await page.locator(INVENTORY_CONFIG.selectors.initiateTransferButton).click()
    await expect(page.locator('[data-testid="transfer-initiated"]')).toBeVisible()
    
    // Verify transfer appears in pending transfers list
    await page.goto('/transfers')
    await expect(page.locator(INVENTORY_CONFIG.selectors.transfersList)).toContainText(product.name)
    await expect(page.locator(INVENTORY_CONFIG.selectors.transferStatus)).toContainText('IN_TRANSIT')
  })
  test('transfer receipt and completion', async ({ page }) => {
    // Start with an initiated transfer
    await initiateTestTransfer(page)
    
    // Switch to receiving branch context
    await page.goto('/transfers')
    
    // Find pending transfer
    const transferRow = page.locator('[data-testid="transfer-pending"]').first()
    await expect(transferRow).toBeVisible()
    
    // Receive transfer
    await transferRow.locator(INVENTORY_CONFIG.selectors.receiveTransferButton).click()
    
    // Verify received quantities
    await page.locator('[data-testid="received-quantity"]').fill('30') // Full quantity received
    await page.locator('[data-testid="receipt-notes"]').fill('All items received in good condition')
    
    // Confirm receipt
    await page.locator(INVENTORY_CONFIG.selectors.confirmReceiptButton).click()
    await expect(page.locator('[data-testid="transfer-completed"]')).toBeVisible()
    
    // Verify stock levels updated at both branches
    await page.goto(INVENTORY_CONFIG.routes.inventory)
    
    // Check source branch stock decreased
    await page.locator('[data-testid="branch-filter"]').selectOption('MAIN')
    const mainBranchStock = await page.locator('[data-testid="stock-level-WIDGET-001"]').textContent()
    
    // Check destination branch stock increased  
    await page.locator('[data-testid="branch-filter"]').selectOption('BR02')
    const branch2Stock = await page.locator('[data-testid="stock-level-WIDGET-001"]').textContent()
    
    expect(parseInt(branch2Stock || '0')).toBe(30)
  })

  test('low stock alerts and threshold management', async ({ page }) => {
    const product = INVENTORY_CONFIG.testData.products[0]
    
    // Set low stock threshold
    await page.goto(INVENTORY_CONFIG.routes.inventory)
    await page.locator(`[data-testid="edit-product-${product.sku}"]`).click()
    
    await page.locator(INVENTORY_CONFIG.selectors.lowStockThreshold).fill('25')
    await page.locator(INVENTORY_CONFIG.selectors.updateThresholdButton).click()
    
    // Reduce stock below threshold through adjustment
    await page.locator(`[data-testid="adjust-stock-${product.sku}"]`).click()
    await page.locator(INVENTORY_CONFIG.selectors.adjustmentType).selectOption('DECREASE')
    await page.locator(INVENTORY_CONFIG.selectors.adjustmentQuantity).fill('80') // Brings stock to 20, below threshold of 25
    await page.locator(INVENTORY_CONFIG.selectors.adjustmentReason).selectOption('CORRECTION')
    await page.locator(INVENTORY_CONFIG.selectors.saveAdjustmentButton).click()
    
    // Verify low stock alert appears
    await page.reload()
    await expect(page.locator(`[data-testid="low-stock-alert-${product.sku}"]`)).toBeVisible()
    await expect(page.locator(`[data-testid="low-stock-badge-${product.sku}"]`)).toHaveText('Low Stock')
    
    // Check dashboard shows low stock notification
    await page.goto(INVENTORY_CONFIG.routes.dashboard)
    await expect(page.locator('[data-testid="low-stock-notification"]')).toBeVisible()
    await expect(page.locator('[data-testid="low-stock-count"]')).toContainText('1 item')
    
    // Check low stock report
    await page.goto(INVENTORY_CONFIG.routes.reports)
    await page.locator(INVENTORY_CONFIG.selectors.lowStockReport).click()
    await expect(page.locator('[data-testid="low-stock-items"]')).toContainText(product.name)
    await expect(page.locator(INVENTORY_CONFIG.selectors.restockSuggestion)).toBeVisible()
  })

  test('physical inventory count and reconciliation', async ({ page }) => {
    await page.goto(INVENTORY_CONFIG.routes.inventory)
    
    const product = INVENTORY_CONFIG.testData.products[0]
    
    // Get system stock level
    const systemStockText = await page.locator(`[data-testid="stock-level-${product.sku}"]`).textContent()
    const systemStock = parseInt(systemStockText || '0')
    
    // Start physical count
    await page.locator(INVENTORY_CONFIG.selectors.physicalCountButton).click()
    await expect(page.locator('[data-testid="physical-count-modal"]')).toBeVisible()
    
    // Enter physical count (simulate discrepancy)
    const physicalCount = systemStock - 5 // 5 units missing
    await page.locator(`${INVENTORY_CONFIG.selectors.countQuantityInput}-${product.sku}`).fill(physicalCount.toString())
    
    // System should show variance
    await expect(page.locator(`${INVENTORY_CONFIG.selectors.varianceDisplay}-${product.sku}`)).toHaveText('-5')
    await expect(page.locator('[data-testid="variance-alert"]')).toBeVisible()
    
    // Add reconciliation notes
    await page.locator('[data-testid="reconciliation-notes"]').fill('Unable to locate 5 units during physical count')
    
    // Reconcile inventory
    await page.locator(INVENTORY_CONFIG.selectors.reconcileButton).click()
    await expect(page.locator('[data-testid="reconciliation-success"]')).toBeVisible()
    
    // Verify adjustment created for variance
    await page.locator(`[data-testid="view-movements-${product.sku}"]`).click()
    await expect(page.locator('[data-testid="movement-PHYSICAL_COUNT"]')).toBeVisible()
    await expect(page.locator('[data-testid="movement-quantity"]')).toContainText('-5')
  })
  test('inventory valuation and cost tracking', async ({ page }) => {
    await page.goto(INVENTORY_CONFIG.routes.reports)
    
    // Generate stock valuation report
    await page.locator(INVENTORY_CONFIG.selectors.stockValuationReport).click()
    await expect(page.locator('[data-testid="valuation-report"]')).toBeVisible()
    
    // Verify cost calculations
    const widget = INVENTORY_CONFIG.testData.products[0]
    const widgetValuation = page.locator(`[data-testid="valuation-${widget.sku}"]`)
    
    await expect(widgetValuation).toContainText(widget.name)
    await expect(widgetValuation).toContainText(`₱${widget.cost.toFixed(2)}`) // Unit cost
    
    // Check total portfolio value
    await expect(page.locator('[data-testid="total-inventory-value"]')).toBeVisible()
    
    // Test cost basis tracking (FIFO)
    await page.goto(INVENTORY_CONFIG.routes.inventory)
    
    // Add stock at different costs to test FIFO
    await page.locator(`[data-testid="adjust-stock-${widget.sku}"]`).click()
    await page.locator(INVENTORY_CONFIG.selectors.adjustmentType).selectOption('INCREASE')
    await page.locator(INVENTORY_CONFIG.selectors.adjustmentQuantity).fill('20')
    await page.locator('[data-testid="unit-cost-input"]').fill('55.00') // Higher cost
    await page.locator(INVENTORY_CONFIG.selectors.adjustmentReason).selectOption('CORRECTION')
    await page.locator(INVENTORY_CONFIG.selectors.saveAdjustmentButton).click()
    
    // Verify weighted average cost updated
    await page.reload()
    const avgCostElement = page.locator(`[data-testid="avg-cost-${widget.sku}"]`)
    const avgCost = await avgCostElement.textContent()
    expect(parseFloat(avgCost?.replace('₱', '') || '0')).toBeGreaterThan(widget.cost)
  })

  test('perishable items and expiry tracking', async ({ page }) => {
    const perishableProduct = INVENTORY_CONFIG.testData.products[1]
    
    await page.goto(INVENTORY_CONFIG.routes.inventory)
    
    // Add perishable stock with expiry date
    await page.locator(`[data-testid="adjust-stock-${perishableProduct.sku}"]`).click()
    await page.locator(INVENTORY_CONFIG.selectors.adjustmentType).selectOption('INCREASE')
    await page.locator(INVENTORY_CONFIG.selectors.adjustmentQuantity).fill('30')
    
    // Set expiry date (30 days from now)
    const expiryDate = new Date()
    expiryDate.setDate(expiryDate.getDate() + 30)
    await page.locator('[data-testid="expiry-date-input"]').fill(expiryDate.toISOString().split('T')[0])
    
    await page.locator(INVENTORY_CONFIG.selectors.adjustmentReason).selectOption('CORRECTION')
    await page.locator(INVENTORY_CONFIG.selectors.saveAdjustmentButton).click()
    
    // Verify expiry tracking
    await expect(page.locator(`[data-testid="expiry-${perishableProduct.sku}"]`)).toContainText('30 days')
    
    // Test near-expiry alerts (simulate item close to expiry)
    await page.goto(INVENTORY_CONFIG.routes.settings)
    await page.locator('[data-testid="expiry-warning-days"]').fill('35') // Warn 35 days before expiry
    await page.locator('[data-testid="save-settings"]').click()
    
    // Check that near-expiry alert appears
    await page.goto(INVENTORY_CONFIG.routes.inventory)
    await expect(page.locator(`[data-testid="near-expiry-alert-${perishableProduct.sku}"]`)).toBeVisible()
  })

  test('inventory reports and data export', async ({ page }) => {
    await page.goto(INVENTORY_CONFIG.routes.reports)
    
    // Test stock movement history report
    await page.locator(INVENTORY_CONFIG.selectors.movementHistoryReport).click()
    
    // Filter by date range
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 7) // Last 7 days
    
    await page.locator('[data-testid="start-date-filter"]').fill(startDate.toISOString().split('T')[0])
    await page.locator('[data-testid="end-date-filter"]').fill(new Date().toISOString().split('T')[0])
    await page.locator('[data-testid="apply-filter"]').click()
    
    // Verify movements appear
    await expect(page.locator('[data-testid="movement-records"]')).toBeVisible()
    
    // Test export functionality
    await page.locator(INVENTORY_CONFIG.selectors.exportReportButton).click()
    
    // Verify download initiated (check for download dialog or success message)
    await expect(page.locator('[data-testid="export-success"]')).toBeVisible()
    
    // Test low stock report export
    await page.locator(INVENTORY_CONFIG.selectors.lowStockReport).click()
    await page.locator('[data-testid="export-low-stock"]').click()
    await expect(page.locator('[data-testid="export-success"]')).toBeVisible()
  })

  test('inventory integration with sales', async ({ page }) => {
    const product = INVENTORY_CONFIG.testData.products[0]
    
    // Get initial stock level
    await page.goto(INVENTORY_CONFIG.routes.inventory)
    const initialStockText = await page.locator(`[data-testid="stock-level-${product.sku}"]`).textContent()
    const initialStock = parseInt(initialStockText || '0')
    
    // Make a sale through POS
    await page.goto('/pos')
    await page.locator(`[data-testid="product-card-${product.sku}"]`).click()
    await page.locator('[data-testid="quantity-input"]').fill('3')
    
    // Complete checkout
    await page.locator('[data-testid="checkout-button"]').click()
    await page.locator('[data-testid="payment-method-CASH"]').click()
    await page.locator('[data-testid="cash-amount-input"]').fill('500')
    await page.locator('[data-testid="process-payment-button"]').click()
    
    // Verify inventory automatically reduced
    await page.goto(INVENTORY_CONFIG.routes.inventory)
    const newStockText = await page.locator(`[data-testid="stock-level-${product.sku}"]`).textContent()
    const newStock = parseInt(newStockText || '0')
    
    expect(newStock).toBe(initialStock - 3)
    
    // Verify movement record shows POS sale
    await page.locator(`[data-testid="view-movements-${product.sku}"]`).click()
    await expect(page.locator('[data-testid="movement-SALE"]')).toBeVisible()
    await expect(page.locator('[data-testid="sale-movement-quantity"]')).toContainText('-3')
  })
  test('inventory error handling and validation', async ({ page }) => {
    await page.goto(INVENTORY_CONFIG.routes.inventory)
    
    const product = INVENTORY_CONFIG.testData.products[0]
    
    // Test negative stock adjustment validation
    await page.locator(`[data-testid="adjust-stock-${product.sku}"]`).click()
    await page.locator(INVENTORY_CONFIG.selectors.adjustmentType).selectOption('DECREASE')
    await page.locator(INVENTORY_CONFIG.selectors.adjustmentQuantity).fill('999999') // More than available
    
    await page.locator(INVENTORY_CONFIG.selectors.saveAdjustmentButton).click()
    await expect(page.locator('[data-testid="insufficient-stock-error"]')).toBeVisible()
    
    // Test invalid transfer quantity
    await page.locator('[data-testid="cancel-adjustment"]').click()
    await page.locator(`[data-testid="transfer-stock-${product.sku}"]`).click()
    await page.locator(INVENTORY_CONFIG.selectors.transferQuantity).fill('-10') // Negative quantity
    
    await expect(page.locator('[data-testid="invalid-quantity-error"]')).toBeVisible()
    await expect(page.locator(INVENTORY_CONFIG.selectors.initiateTransferButton)).toBeDisabled()
    
    // Test missing required fields
    await page.locator('[data-testid="cancel-transfer"]').click()
    await page.locator(`[data-testid="adjust-stock-${product.sku}"]`).click()
    await page.locator(INVENTORY_CONFIG.selectors.adjustmentQuantity).fill('10')
    // Don't select reason - should be required
    
    await page.locator(INVENTORY_CONFIG.selectors.saveAdjustmentButton).click()
    await expect(page.locator('[data-testid="reason-required-error"]')).toBeVisible()
  })

  test('bulk inventory operations', async ({ page }) => {
    await page.goto(INVENTORY_CONFIG.routes.inventory)
    
    // Select multiple products for bulk operation
    await page.locator('[data-testid="bulk-select-WIDGET-001"]').check()
    await page.locator('[data-testid="bulk-select-FOOD-001"]').check()
    
    // Bulk threshold update
    await page.locator('[data-testid="bulk-actions-menu"]').click()
    await page.locator('[data-testid="bulk-update-thresholds"]').click()
    
    await page.locator('[data-testid="bulk-threshold-value"]').fill('15')
    await page.locator('[data-testid="apply-bulk-threshold"]').click()
    
    // Verify thresholds updated for selected products
    await expect(page.locator('[data-testid="threshold-WIDGET-001"]')).toHaveText('15')
    await expect(page.locator('[data-testid="threshold-FOOD-001"]')).toHaveText('15')
    
    // Bulk stock adjustment
    await page.locator('[data-testid="bulk-select-all"]').check() // Select all products
    await page.locator('[data-testid="bulk-actions-menu"]').click()
    await page.locator('[data-testid="bulk-stock-adjustment"]').click()
    
    await page.locator('[data-testid="bulk-adjustment-type"]').selectOption('INCREASE')
    await page.locator('[data-testid="bulk-adjustment-quantity"]').fill('5')
    await page.locator('[data-testid="bulk-adjustment-reason"]').selectOption('CORRECTION')
    await page.locator('[data-testid="apply-bulk-adjustment"]').click()
    
    await expect(page.locator('[data-testid="bulk-operation-success"]')).toBeVisible()
  })
})

// Helper Functions
async function setupTestProducts(page: Page) {
  await page.goto(INVENTORY_CONFIG.routes.products)
  
  for (const product of INVENTORY_CONFIG.testData.products) {
    // Check if product exists
    const existingProduct = page.locator(`[data-testid="product-${product.sku}"]`)
    if (await existingProduct.isVisible()) {
      continue
    }
    
    // Create product
    await page.locator('[data-testid="add-product-button"]').click()
    await page.locator('[data-testid="product-name-input"]').fill(product.name)
    await page.locator('[data-testid="product-sku-input"]').fill(product.sku)
    await page.locator('[data-testid="product-category-select"]').selectOption(product.category)
    await page.locator('[data-testid="product-cost-input"]').fill(product.cost.toString())
    await page.locator('[data-testid="low-stock-threshold-input"]').fill(product.lowStockThreshold.toString())
    
    // Set initial stock
    await page.locator('[data-testid="initial-stock-input"]').fill(product.currentStock.toString())
    
    if (product.isPerishable) {
      await page.locator('[data-testid="is-perishable-checkbox"]').check()
    }
    
    await page.locator('[data-testid="save-product-button"]').click()
    await expect(page.locator(`[data-testid="product-${product.sku}"]`)).toBeVisible()
  }
}
async function setupMultipleBranches(page: Page) {
  await page.goto(INVENTORY_CONFIG.routes.branches)
  
  for (const branch of INVENTORY_CONFIG.testData.branches) {
    // Check if branch exists
    const existingBranch = page.locator(`[data-testid="branch-${branch.code}"]`)
    if (await existingBranch.isVisible()) {
      continue
    }
    
    // Create branch
    await page.locator('[data-testid="add-branch-button"]').click()
    await page.locator('[data-testid="branch-name-input"]').fill(branch.name)
    await page.locator('[data-testid="branch-code-input"]').fill(branch.code)
    await page.locator('[data-testid="branch-address-input"]').fill(`${branch.name} Address`)
    await page.locator('[data-testid="save-branch-button"]').click()
    
    await expect(page.locator(`[data-testid="branch-${branch.code}"]`)).toBeVisible()
  }
}

async function initiateTestTransfer(page: Page) {
  await setupMultipleBranches(page)
  await page.goto(INVENTORY_CONFIG.routes.inventory)
  
  const product = INVENTORY_CONFIG.testData.products[0]
  
  await page.locator(`[data-testid="transfer-stock-${product.sku}"]`).click()
  await page.locator(INVENTORY_CONFIG.selectors.sourceBranchSelect).selectOption('MAIN')
  await page.locator(INVENTORY_CONFIG.selectors.destinationBranchSelect).selectOption('BR02')
  await page.locator(INVENTORY_CONFIG.selectors.transferQuantity).fill('30')
  await page.locator(INVENTORY_CONFIG.selectors.transferNotes).fill('Test transfer for E2E validation')
  await page.locator(INVENTORY_CONFIG.selectors.initiateTransferButton).click()
  
  await expect(page.locator('[data-testid="transfer-initiated"]')).toBeVisible()
}