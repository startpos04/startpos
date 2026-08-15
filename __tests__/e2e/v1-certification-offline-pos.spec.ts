/**
 * v1-certification-offline-pos.spec.ts
 *
 * V1 E2E Certification: Offline POS Operations
 *
 * Tests comprehensive offline POS functionality including transaction processing,
 * data synchronization, conflict resolution, and resilient operation capabilities.
 *
 * Critical V1 User Journey:
 *  ✅ Offline transaction processing and queuing
 *  ✅ Data synchronization and conflict resolution
 *  ✅ Offline inventory management and tracking
 *  ✅ Network connectivity detection and handling
 *  ✅ Offline receipt generation and printing
 *  ✅ Data integrity and consistency validation
 *  ✅ Automatic reconnection and sync workflows
 *  ✅ Offline analytics and reporting capabilities
 *  ✅ Multi-device offline coordination
 *  ✅ Emergency offline operations and fallbacks
 *
 * Test Strategy:
 *  - Tests complete offline operation workflows
 *  - Validates data synchronization accuracy and conflict resolution
 *  - Tests network interruption and recovery scenarios
 *  - Verifies offline data integrity and consistency
 *  - Tests edge cases and error recovery
 *
 * Prerequisites:
 *  - Service Worker and offline storage implementation
 *  - Data synchronization and conflict resolution system
 *  - Offline-capable POS interface and functionality
 *  - Local database and caching mechanisms
 *  - Network connectivity monitoring and management
 *
 * Business Rules Validated:
 *  - POS operations continue seamlessly during network outages
 *  - Offline transactions are properly queued and synchronized
 *  - Data conflicts are resolved with proper business logic
 *  - Offline inventory tracking maintains accuracy
 *  - Emergency operations can function independently
 */

import { test, expect, type Page } from '@playwright/test'
import { faker } from '@faker-js/faker'

// Test configuration for offline POS operations
const OFFLINE_POS_CONFIG = {
  routes: {
    login: '/login',
    dashboard: '/dashboard',
    pos: '/pos',
    inventory: '/inventory',
    transactions: '/transactions',
    settings: '/settings/offline',
    sync: '/sync-status',
  },
  networkStates: {
    ONLINE: 'online',
    OFFLINE: 'offline',
    SLOW_CONNECTION: 'slow-3g',
    INTERMITTENT: 'intermittent',
  },
  syncStates: {
    SYNCED: 'synced',
    PENDING: 'pending',
    SYNCING: 'syncing',
    CONFLICT: 'conflict',
    ERROR: 'error',
  },
  selectors: {
    // Network status indicators
    networkStatusIndicator: '[data-testid="network-status-indicator"]',
    offlineIndicator: '[data-testid="offline-indicator"]',
    syncStatusIndicator: '[data-testid="sync-status-indicator"]',
    pendingSyncCounter: '[data-testid="pending-sync-counter"]',
    
    // Offline POS interface
    offlinePosInterface: '[data-testid="offline-pos-interface"]',
    offlineModeToggle: '[data-testid="offline-mode-toggle"]',
    offlineTransactionQueue: '[data-testid="offline-transaction-queue"]',
    queuedTransaction: '[data-testid="queued-transaction"]',
    
    // Product and inventory
    offlineProductGrid: '[data-testid="offline-product-grid"]',
    productTile: '[data-testid="product-tile"]',
    inventoryWarning: '[data-testid="inventory-warning"]',
    lastSyncTimestamp: '[data-testid="last-sync-timestamp"]',
    
    // Transaction processing
    offlineCheckoutButton: '[data-testid="offline-checkout-button"]',
    offlinePaymentOptions: '[data-testid="offline-payment-options"]',
    offlineReceiptGeneration: '[data-testid="offline-receipt-generation"]',
    transactionReference: '[data-testid="transaction-reference"]',
    
    // Synchronization
    syncNowButton: '[data-testid="sync-now-button"]',
    syncProgress: '[data-testid="sync-progress"]',
    syncConflictDialog: '[data-testid="sync-conflict-dialog"]',
    conflictResolutionOptions: '[data-testid="conflict-resolution-options"]',
    autoSyncToggle: '[data-testid="auto-sync-toggle"]',
    
    // Data management
    offlineStorageStatus: '[data-testid="offline-storage-status"]',
    cachedDataSize: '[data-testid="cached-data-size"]',
    clearCacheButton: '[data-testid="clear-cache-button"]',
    exportOfflineDataButton: '[data-testid="export-offline-data-button"]',
    
    // Error handling
    connectionErrorMessage: '[data-testid="connection-error-message"]',
    syncErrorMessage: '[data-testid="sync-error-message"]',
    retryConnectionButton: '[data-testid="retry-connection-button"]',
    offlineBackupNotice: '[data-testid="offline-backup-notice"]',
    
    // Analytics and reporting
    offlineAnalytics: '[data-testid="offline-analytics"]',
    offlineTransactionCount: '[data-testid="offline-transaction-count"]',
    syncSuccessRate: '[data-testid="sync-success-rate"]',
    
    // Confirmation dialogs
    confirmDialog: '[data-testid="confirm-dialog"]',
    confirmButton: '[data-testid="confirm-button"]',
    cancelButton: '[data-testid="cancel-button"]',
    
    // Success/error states
    successMessage: '[data-testid="success-message"]',
    errorMessage: '[data-testid="error-message"]',
    warningMessage: '[data-testid="warning-message"]',
  },
  testProducts: [
    { id: 'PROD001', name: 'Coffee', price: 5000, stock: 100 }, // PHP 50.00
    { id: 'PROD002', name: 'Sandwich', price: 12000, stock: 50 }, // PHP 120.00
    { id: 'PROD003', name: 'Pastry', price: 8000, stock: 30 }, // PHP 80.00
    { id: 'PROD004', name: 'Juice', price: 6500, stock: 25 }, // PHP 65.00
  ],
  syncConfiguration: {
    autoSyncInterval: 30000, // 30 seconds
    conflictResolutionStrategy: 'MANUAL', // MANUAL, AUTO_SERVER, AUTO_CLIENT
    maxOfflineTransactions: 1000,
    maxCacheSize: '50MB',
    compressionEnabled: true,
  },
}
test.describe('V1 Certification: Offline POS Operations', () => {
  test.describe('Network Connectivity Management', () => {
    test('detects network status changes and updates UI accordingly', async ({ page }) => {
      await loginAndNavigateToPos(page)
      
      // Verify initial online status
      await expect(page.locator(OFFLINE_POS_CONFIG.selectors.networkStatusIndicator)).toContainText('Online')
      await expect(page.locator(OFFLINE_POS_CONFIG.selectors.offlineIndicator)).not.toBeVisible()
      
      // REAL E2E: Use Playwright's actual network offline functionality
      await page.context().setOffline(true)
      
      // Verify offline status detection (real browser behavior)
      await expect(page.locator(OFFLINE_POS_CONFIG.selectors.offlineIndicator)).toBeVisible()
      await expect(page.locator(OFFLINE_POS_CONFIG.selectors.networkStatusIndicator)).toContainText('Offline')
      await expect(page.locator(OFFLINE_POS_CONFIG.selectors.offlineIndicator)).toBeVisible()
      await expect(page.locator(OFFLINE_POS_CONFIG.selectors.offlineIndicator)).toContainText('Working offline')
      
      // Verify offline mode activation
      await expect(page.locator(OFFLINE_POS_CONFIG.selectors.offlinePosInterface)).toBeVisible()
      await expect(page.locator('[data-testid="offline-mode-banner"]')).toBeVisible()
    })

    test('handles intermittent connectivity gracefully', async ({ page }) => {
      await loginAndNavigateToPos(page)
      
      // REAL E2E: Test what actually happens with intermittent connection
      // Note: Playwright doesn't simulate intermittent - this would need real network testing
      console.log('NOT VERIFIED: Intermittent connection testing requires network simulation infrastructure')
      
      // Instead, test offline/online toggle behavior
      await page.context().setOffline(true)
      await expect(page.locator(OFFLINE_POS_CONFIG.selectors.connectionWarning)).toBeVisible()
      
      await page.context().setOffline(false)
      await expect(page.locator(OFFLINE_POS_CONFIG.selectors.connectionWarning)).not.toBeVisible()
      await expect(page.locator('[data-testid="unstable-connection-warning"]')).toBeVisible()
      
      // Should enable offline backup mode
      await expect(page.locator(OFFLINE_POS_CONFIG.selectors.offlineBackupNotice)).toBeVisible()
      
      // Verify automatic fallback to offline operations
      await page.locator(OFFLINE_POS_CONFIG.selectors.productTile).first().click()
      await page.locator(OFFLINE_POS_CONFIG.selectors.offlineCheckoutButton).click()
      
      // Should process transaction offline
      await expect(page.locator('[data-testid="processing-offline"]')).toBeVisible()
    })

    test('automatically reconnects when network is restored', async ({ page }) => {
      await loginAndNavigateToPos(page)
      
      // REAL E2E: Go offline using Playwright's real offline functionality
      await page.context().setOffline(true)
      await expect(page.locator(OFFLINE_POS_CONFIG.selectors.offlineIndicator)).toBeVisible()
      
      // REAL E2E: Restore network using Playwright's real online functionality
      await page.context().setOffline(false)
      
      // Should detect reconnection
      await expect(page.locator('[data-testid="reconnection-detected"]')).toBeVisible()
      
      // Should automatically trigger sync
      await expect(page.locator(OFFLINE_POS_CONFIG.selectors.syncProgress)).toBeVisible()
      await expect(page.locator('[data-testid="auto-sync-started"]')).toContainText('Syncing offline data')
      
      // Should return to online mode
      await expect(page.locator(OFFLINE_POS_CONFIG.selectors.networkStatusIndicator)).toContainText('Online')
      await expect(page.locator(OFFLINE_POS_CONFIG.selectors.offlineIndicator)).not.toBeVisible()
    })
  })

  test.describe('Offline Transaction Processing', () => {
    test('processes transactions completely offline', async ({ page }) => {
      await loginAndNavigateToPos(page)
      
      // Switch to offline mode
      await simulateNetworkCondition(page, OFFLINE_POS_CONFIG.networkStates.OFFLINE)
      
      // Create offline transaction
      await page.locator(`[data-testid="product-${OFFLINE_POS_CONFIG.testProducts[0].id}"]`).click()
      await page.locator(`[data-testid="product-${OFFLINE_POS_CONFIG.testProducts[1].id}"]`).click()
      
      // Verify cart total calculation works offline
      await expect(page.locator('[data-testid="cart-total"]')).toContainText('₱170.00') // 50 + 120
      
      // Proceed to checkout
      await page.locator(OFFLINE_POS_CONFIG.selectors.offlineCheckoutButton).click()
      
      // Select offline payment method
      await page.locator('[data-testid="offline-payment-cash"]').click()
      await page.locator('[data-testid="cash-amount-input"]').fill('200.00')
      
      // Complete offline transaction
      await page.locator('[data-testid="complete-offline-payment"]').click()
      
      // Verify offline transaction completion
      await expect(page.locator(OFFLINE_POS_CONFIG.selectors.successMessage)).toBeVisible()
      await expect(page.locator('[data-testid="offline-transaction-success"]')).toContainText('Transaction processed offline')
      
      // Verify transaction gets queued for sync
      await expect(page.locator(OFFLINE_POS_CONFIG.selectors.offlineTransactionQueue)).toContainText('1 transaction pending sync')
      
      // Verify offline receipt generation
      await expect(page.locator(OFFLINE_POS_CONFIG.selectors.offlineReceiptGeneration)).toBeVisible()
      await expect(page.locator('[data-testid="offline-receipt-notice"]')).toContainText('Receipt generated offline')
    })

    test('handles multiple offline transactions', async ({ page }) => {
      await loginAndNavigateToPos(page)
      await simulateNetworkCondition(page, OFFLINE_POS_CONFIG.networkStates.OFFLINE)
      
      // Process multiple offline transactions
      const transactionCount = 5
      
      for (let i = 0; i < transactionCount; i++) {
        // Select random products
        const product = OFFLINE_POS_CONFIG.testProducts[i % OFFLINE_POS_CONFIG.testProducts.length]
        await page.locator(`[data-testid="product-${product.id}"]`).click()
        
        await page.locator(OFFLINE_POS_CONFIG.selectors.offlineCheckoutButton).click()
        await page.locator('[data-testid="offline-payment-cash"]').click()
        await page.locator('[data-testid="cash-amount-input"]').fill('100.00')
        await page.locator('[data-testid="complete-offline-payment"]').click()
        
        await page.locator('[data-testid="new-transaction"]').click()
      }
      
      // Verify all transactions are queued
      await expect(page.locator(OFFLINE_POS_CONFIG.selectors.pendingSyncCounter)).toContainText(transactionCount.toString())
      
      // Verify transaction queue management
      await page.locator('[data-testid="view-offline-queue"]').click()
      const queuedTransactions = page.locator(OFFLINE_POS_CONFIG.selectors.queuedTransaction)
      await expect(queuedTransactions).toHaveCount(transactionCount)
      
      // Verify each transaction has proper metadata
      const firstTransaction = queuedTransactions.first()
      await expect(firstTransaction.locator('[data-testid="transaction-timestamp"]')).toBeVisible()
      await expect(firstTransaction.locator('[data-testid="transaction-amount"]')).toBeVisible()
      await expect(firstTransaction.locator('[data-testid="sync-status"]')).toContainText('Pending')
    })

    test('maintains transaction sequence and referential integrity', async ({ page }) => {
      await loginAndNavigateToPos(page)
      await simulateNetworkCondition(page, OFFLINE_POS_CONFIG.networkStates.OFFLINE)
      
      // Create offline transaction with specific items
      await page.locator(`[data-testid="product-${OFFLINE_POS_CONFIG.testProducts[0].id}"]`).dblclick() // 2x Coffee
      await page.locator(`[data-testid="product-${OFFLINE_POS_CONFIG.testProducts[2].id}"]`).click() // 1x Pastry
      
      // Verify cart items and quantities
      await expect(page.locator('[data-testid="cart-item-PROD001"]')).toContainText('Coffee × 2')
      await expect(page.locator('[data-testid="cart-item-PROD003"]')).toContainText('Pastry × 1')
      
      // Complete transaction
      await page.locator(OFFLINE_POS_CONFIG.selectors.offlineCheckoutButton).click()
      await page.locator('[data-testid="offline-payment-cash"]').click()
      await page.locator('[data-testid="cash-amount-input"]').fill('200.00')
      await page.locator('[data-testid="complete-offline-payment"]').click()
      
      // Verify transaction reference generation
      const transactionRef = await page.locator(OFFLINE_POS_CONFIG.selectors.transactionReference).textContent()
      expect(transactionRef).toMatch(/OFF-\d{8}-\d{6}/) // Offline transaction format
      
      // Verify local inventory deduction
      await page.goto(OFFLINE_POS_CONFIG.routes.inventory)
      await expect(page.locator('[data-testid="local-stock-PROD001"]')).toContainText('98') // 100 - 2
      await expect(page.locator('[data-testid="local-stock-PROD003"]')).toContainText('29') // 30 - 1
      
      // Verify sync pending indicators
      await expect(page.locator('[data-testid="inventory-sync-pending"]')).toBeVisible()
    })
  })

  test.describe('Data Synchronization', () => {
    test('successfully syncs offline transactions when reconnected', async ({ page }) => {
      await loginAndNavigateToPos(page)
      
      // Create offline transactions
      await simulateNetworkCondition(page, OFFLINE_POS_CONFIG.networkStates.OFFLINE)
      await createOfflineTransactions(page, 3)
      
      // Verify transactions are queued
      await expect(page.locator(OFFLINE_POS_CONFIG.selectors.pendingSyncCounter)).toContainText('3')
      
      // Reconnect to network
      await simulateNetworkCondition(page, OFFLINE_POS_CONFIG.networkStates.ONLINE)
      
      // Should automatically start syncing
      await expect(page.locator(OFFLINE_POS_CONFIG.selectors.syncProgress)).toBeVisible()
      await expect(page.locator('[data-testid="sync-status-text"]')).toContainText('Syncing 3 transactions')
      
      // Wait for sync completion
      await expect(page.locator('[data-testid="sync-complete"]')).toBeVisible({ timeout: 30000 })
      await expect(page.locator(OFFLINE_POS_CONFIG.selectors.successMessage)).toContainText('All transactions synced successfully')
      
      // Verify queue is cleared
      await expect(page.locator(OFFLINE_POS_CONFIG.selectors.pendingSyncCounter)).toContainText('0')
      
      // Verify transactions appear in online system
      await page.goto(OFFLINE_POS_CONFIG.routes.transactions)
      await expect(page.locator('[data-testid="transaction-list"]').locator('[data-testid="transaction-item"]')).toHaveCount(3)
    })

    test('handles sync conflicts with manual resolution', async ({ page }) => {
      await loginAndNavigateToPos(page)
      
      // Setup conflict scenario - same product modified offline and online
      await setupSyncConflictScenario(page)
      
      // Go offline and modify inventory
      await simulateNetworkCondition(page, OFFLINE_POS_CONFIG.networkStates.OFFLINE)
      await page.goto(OFFLINE_POS_CONFIG.routes.inventory)
      
      // Modify product price offline
      await page.locator('[data-testid="edit-product-PROD001"]').click()
      await page.locator('[data-testid="price-input"]').fill('55.00') // Changed from 50.00
      await page.locator('[data-testid="save-offline-changes"]').click()
      
      // Reconnect and trigger sync
      await simulateNetworkCondition(page, OFFLINE_POS_CONFIG.networkStates.ONLINE)
      
      // Should detect conflict
      await expect(page.locator(OFFLINE_POS_CONFIG.selectors.syncConflictDialog)).toBeVisible()
      await expect(page.locator('[data-testid="conflict-message"]')).toContainText('Product PROD001 has conflicting changes')
      
      // Show conflict resolution options
      const resolutionOptions = page.locator(OFFLINE_POS_CONFIG.selectors.conflictResolutionOptions)
      await expect(resolutionOptions.locator('[data-testid="use-offline-version"]')).toBeVisible()
      await expect(resolutionOptions.locator('[data-testid="use-server-version"]')).toBeVisible()
      await expect(resolutionOptions.locator('[data-testid="merge-changes"]')).toBeVisible()
      
      // Choose to use offline version
      await resolutionOptions.locator('[data-testid="use-offline-version"]').click()
      await page.locator('[data-testid="resolve-conflict"]').click()
      
      // Verify conflict resolution
      await expect(page.locator(OFFLINE_POS_CONFIG.selectors.successMessage)).toContainText('Conflict resolved')
      await expect(page.locator('[data-testid="product-PROD001-price"]')).toContainText('₱55.00')
    })

    test('performs incremental sync for large datasets', async ({ page }) => {
      await loginAndNavigateToPos(page)
      
      // Create many offline transactions
      await simulateNetworkCondition(page, OFFLINE_POS_CONFIG.networkStates.OFFLINE)
      await createOfflineTransactions(page, 50)
      
      // Reconnect and start sync
      await simulateNetworkCondition(page, OFFLINE_POS_CONFIG.networkStates.ONLINE)
      
      // Should show batch sync progress
      await expect(page.locator('[data-testid="batch-sync-progress"]')).toBeVisible()
      await expect(page.locator('[data-testid="sync-batch-info"]')).toContainText('Batch 1 of 5') // 50 transactions in 5 batches
      
      // Monitor sync progress
      let currentBatch = 1
      while (currentBatch <= 5) {
        await expect(page.locator('[data-testid="sync-batch-info"]')).toContainText(`Batch ${currentBatch}`)
        
        // Wait for batch completion
        await page.waitForSelector(`[data-testid="batch-${currentBatch}-complete"]`, { timeout: 10000 })
        currentBatch++
      }
      
      // Verify all transactions synced
      await expect(page.locator('[data-testid="all-batches-complete"]')).toBeVisible()
      await expect(page.locator(OFFLINE_POS_CONFIG.selectors.pendingSyncCounter)).toContainText('0')
    })
  })

  test.describe('Offline Inventory Management', () => {
    test('tracks inventory changes offline accurately', async ({ page }) => {
      await loginAndNavigateToPos(page)
      await simulateNetworkCondition(page, OFFLINE_POS_CONFIG.networkStates.OFFLINE)
      
      // Check initial offline inventory state
      await page.goto(OFFLINE_POS_CONFIG.routes.inventory)
      const initialCoffeeStock = await page.locator('[data-testid="local-stock-PROD001"]').textContent()
      
      // Process multiple transactions affecting same product
      await page.goto(OFFLINE_POS_CONFIG.routes.pos)
      
      // Transaction 1: 2x Coffee
      await page.locator(`[data-testid="product-PROD001"]`).dblclick()
      await processOfflineTransaction(page)
      
      // Transaction 2: 3x Coffee  
      await page.locator(`[data-testid="product-PROD001"]`).click()
      await page.locator(`[data-testid="product-PROD001"]`).click()
      await page.locator(`[data-testid="product-PROD001"]`).click()
      await processOfflineTransaction(page)
      
      // Verify cumulative inventory deduction
      await page.goto(OFFLINE_POS_CONFIG.routes.inventory)
      const finalCoffeeStock = await page.locator('[data-testid="local-stock-PROD001"]').textContent()
      
      const stockReduction = parseInt(initialCoffeeStock || '0') - parseInt(finalCoffeeStock || '0')
      expect(stockReduction).toBe(5) // 2 + 3 = 5 units sold
      
      // Verify offline change tracking
      await expect(page.locator('[data-testid="offline-changes-PROD001"]')).toContainText('-5')
      await expect(page.locator('[data-testid="sync-pending-indicator"]')).toBeVisible()
    })

    test('handles low stock warnings in offline mode', async ({ page }) => {
      await loginAndNavigateToPos(page)
      await simulateNetworkCondition(page, OFFLINE_POS_CONFIG.networkStates.OFFLINE)
      
      // Setup product with low initial stock
      await setupLowStockProduct(page, 'PROD004', 3)
      
      // Process transactions to trigger low stock
      await page.goto(OFFLINE_POS_CONFIG.routes.pos)
      
      // Sell 2 units (leaves 1)
      await page.locator(`[data-testid="product-PROD004"]`).dblclick()
      await processOfflineTransaction(page)
      
      // Should show low stock warning
      await expect(page.locator(OFFLINE_POS_CONFIG.selectors.inventoryWarning)).toBeVisible()
      await expect(page.locator(OFFLINE_POS_CONFIG.selectors.inventoryWarning)).toContainText('Low stock: Juice (1 remaining)')
      
      // Try to sell remaining stock
      await page.locator(`[data-testid="product-PROD004"]`).click()
      await page.locator(OFFLINE_POS_CONFIG.selectors.offlineCheckoutButton).click()
      
      // Should show out of stock warning but allow override
      await expect(page.locator('[data-testid="out-of-stock-warning"]')).toBeVisible()
      await expect(page.locator('[data-testid="allow-negative-stock"]')).toBeVisible()
      
      // Complete transaction with override
      await page.locator('[data-testid="allow-negative-stock"]').check()
      await page.locator('[data-testid="offline-payment-cash"]').click()
      await page.locator('[data-testid="complete-offline-payment"]').click()
      
      // Verify negative stock tracking
      await page.goto(OFFLINE_POS_CONFIG.routes.inventory)
      await expect(page.locator('[data-testid="local-stock-PROD004"]')).toContainText('0')
      await expect(page.locator('[data-testid="negative-stock-flag"]')).toBeVisible()
    })

    test('synchronizes inventory adjustments correctly', async ({ page }) => {
      await loginAndNavigateToPos(page)
      
      // Make offline inventory adjustment
      await simulateNetworkCondition(page, OFFLINE_POS_CONFIG.networkStates.OFFLINE)
      await page.goto(OFFLINE_POS_CONFIG.routes.inventory)
      
      // Adjust stock levels
      await page.locator('[data-testid="adjust-stock-PROD002"]').click()
      await page.locator('[data-testid="adjustment-type"]').selectOption('INCREASE')
      await page.locator('[data-testid="adjustment-quantity"]').fill('20')
      await page.locator('[data-testid="adjustment-reason"]').fill('Stock replenishment - offline')
      await page.locator('[data-testid="save-adjustment"]').click()
      
      // Verify offline adjustment
      await expect(page.locator('[data-testid="local-stock-PROD002"]')).toContainText('70') // 50 + 20
      await expect(page.locator('[data-testid="adjustment-pending-sync"]')).toBeVisible()
      
      // Reconnect and sync
      await simulateNetworkCondition(page, OFFLINE_POS_CONFIG.networkStates.ONLINE)
      await waitForSync(page)
      
      // Verify adjustment synchronized
      await page.reload()
      await expect(page.locator('[data-testid="server-stock-PROD002"]')).toContainText('70')
      await expect(page.locator('[data-testid="adjustment-synced"]')).toBeVisible()
      
      // Verify adjustment history
      await page.locator('[data-testid="view-adjustment-history"]').click()
      await expect(page.locator('[data-testid="adjustment-entry"]').first()).toContainText('Stock replenishment - offline')
      await expect(page.locator('[data-testid="adjustment-entry"]').first()).toContainText('+20')
    })
  })
  test.describe('Offline Receipt and Documentation', () => {
    test('generates compliant receipts in offline mode', async ({ page }) => {
      await loginAndNavigateToPos(page)
      await simulateNetworkCondition(page, OFFLINE_POS_CONFIG.networkStates.OFFLINE)
      
      // Create offline transaction
      await page.locator(`[data-testid="product-PROD001"]`).click()
      await page.locator(`[data-testid="product-PROD002"]`).click()
      await processOfflineTransaction(page)
      
      // Generate offline receipt
      await page.locator('[data-testid="print-offline-receipt"]').click()
      
      // Verify offline receipt format
      const receiptPreview = page.locator('[data-testid="offline-receipt-preview"]')
      
      // Required fields should be present
      await expect(receiptPreview).toContainText('OFFLINE RECEIPT')
      await expect(receiptPreview).toContainText('Receipt will sync when online')
      await expect(receiptPreview).toContainText('Offline Transaction ID:')
      await expect(receiptPreview).toContainText('Generated:')
      
      // Transaction details
      await expect(receiptPreview).toContainText('Coffee')
      await expect(receiptPreview).toContainText('Sandwich')
      await expect(receiptPreview).toContainText('Total: ₱170.00')
      
      // Offline-specific notices
      await expect(receiptPreview).toContainText('Transaction processed offline')
      await expect(receiptPreview).toContainText('Official receipt will be issued upon sync')
      
      // Print receipt
      await page.locator('[data-testid="confirm-print-offline"]').click()
      await expect(page.locator('[data-testid="offline-receipt-printed"]')).toBeVisible()
    })

    test('maintains receipt numbering sequence offline', async ({ page }) => {
      await loginAndNavigateToPos(page)
      await simulateNetworkCondition(page, OFFLINE_POS_CONFIG.networkStates.OFFLINE)
      
      // Process multiple offline transactions
      const receiptNumbers = []
      
      for (let i = 0; i < 3; i++) {
        await page.locator(`[data-testid="product-PROD001"]`).click()
        await processOfflineTransaction(page)
        
        // Get offline receipt number
        const receiptNumber = await page.locator('[data-testid="offline-receipt-number"]').textContent()
        receiptNumbers.push(receiptNumber)
        
        await page.locator('[data-testid="new-transaction"]').click()
      }
      
      // Verify sequential numbering
      for (let i = 1; i < receiptNumbers.length; i++) {
        const current = parseInt(receiptNumbers[i]?.replace('OFF-', '') || '0')
        const previous = parseInt(receiptNumbers[i-1]?.replace('OFF-', '') || '0')
        expect(current).toBe(previous + 1)
      }
      
      // Reconnect and verify official receipt generation
      await simulateNetworkCondition(page, OFFLINE_POS_CONFIG.networkStates.ONLINE)
      await waitForSync(page)
      
      // Check official receipt assignment
      await page.goto(OFFLINE_POS_CONFIG.routes.transactions)
      const transactions = page.locator('[data-testid="transaction-item"]')
      
      for (let i = 0; i < 3; i++) {
        const transaction = transactions.nth(i)
        await expect(transaction.locator('[data-testid="official-receipt-number"]')).toBeVisible()
        await expect(transaction.locator('[data-testid="offline-receipt-converted"]')).toBeVisible()
      }
    })
  })

  test.describe('Data Integrity and Storage', () => {
    test('maintains data consistency during offline operations', async ({ page }) => {
      await loginAndNavigateToPos(page)
      await simulateNetworkCondition(page, OFFLINE_POS_CONFIG.networkStates.OFFLINE)
      
      // Check offline storage status
      await page.goto(OFFLINE_POS_CONFIG.routes.settings)
      await expect(page.locator(OFFLINE_POS_CONFIG.selectors.offlineStorageStatus)).toContainText('Available')
      await expect(page.locator(OFFLINE_POS_CONFIG.selectors.cachedDataSize)).toBeVisible()
      
      // Perform multiple operations
      await createOfflineTransactions(page, 10)
      await makeInventoryAdjustments(page, 5)
      
      // Verify data integrity checks
      await page.locator('[data-testid="run-integrity-check"]').click()
      await expect(page.locator('[data-testid="integrity-check-passed"]')).toBeVisible()
      
      // Check storage utilization
      const storageSize = await page.locator(OFFLINE_POS_CONFIG.selectors.cachedDataSize).textContent()
      expect(storageSize).toMatch(/^\d+\.\d+ [KMGT]B$/) // Valid size format
      
      // Verify transaction checksums
      await page.locator('[data-testid="verify-checksums"]').click()
      await expect(page.locator('[data-testid="checksum-verification-passed"]')).toBeVisible()
    })

    test('handles storage quota limits gracefully', async ({ page }) => {
      await loginAndNavigateToPos(page)
      await simulateNetworkCondition(page, OFFLINE_POS_CONFIG.networkStates.OFFLINE)
      
      // Simulate approaching storage limit
      await simulateStorageQuotaReached(page, 90) // 90% full
      
      // Should show storage warning
      await expect(page.locator('[data-testid="storage-quota-warning"]')).toBeVisible()
      await expect(page.locator('[data-testid="storage-quota-warning"]')).toContainText('Storage 90% full')
      
      // Should suggest cleanup options
      await expect(page.locator('[data-testid="cleanup-suggestions"]')).toBeVisible()
      await expect(page.locator('[data-testid="sync-and-clear-button"]')).toBeVisible()
      
      // Test cleanup process
      await page.locator('[data-testid="clear-synced-data"]').click()
      await page.locator('[data-testid="confirm-cleanup"]').click()
      
      await expect(page.locator('[data-testid="cleanup-completed"]')).toBeVisible()
      
      // Verify storage freed up
      const newStorageSize = await page.locator(OFFLINE_POS_CONFIG.selectors.cachedDataSize).textContent()
      await expect(page.locator('[data-testid="storage-quota-warning"]')).not.toBeVisible()
    })

    test('exports and imports offline data for backup', async ({ page }) => {
      await loginAndNavigateToPos(page)
      await simulateNetworkCondition(page, OFFLINE_POS_CONFIG.networkStates.OFFLINE)
      
      // Create offline data
      await createOfflineTransactions(page, 5)
      
      // Export offline data
      await page.goto(OFFLINE_POS_CONFIG.routes.settings)
      await page.locator(OFFLINE_POS_CONFIG.selectors.exportOfflineDataButton).click()
      
      // Verify export options
      await expect(page.locator('[data-testid="export-transactions"]')).toBeChecked()
      await expect(page.locator('[data-testid="export-inventory"]')).toBeChecked()
      await expect(page.locator('[data-testid="export-settings"]')).toBeChecked()
      
      await page.locator('[data-testid="start-export"]').click()
      
      // Verify export completion
      await expect(page.locator('[data-testid="export-completed"]')).toBeVisible()
      await expect(page.locator('[data-testid="download-backup"]')).toBeVisible()
      
      // Test import functionality
      await page.locator(OFFLINE_POS_CONFIG.selectors.clearCacheButton).click()
      await page.locator('[data-testid="confirm-clear-cache"]').click()
      
      // Import backup data
      await page.locator('[data-testid="import-offline-data"]').click()
      await page.locator('[data-testid="select-backup-file"]').click()
      
      // Verify import success
      await expect(page.locator('[data-testid="import-completed"]')).toBeVisible()
      await expect(page.locator(OFFLINE_POS_CONFIG.selectors.pendingSyncCounter)).toContainText('5')
    })
  })

  test.describe('Multi-Device Offline Coordination', () => {
    test('handles conflicts between multiple offline devices', async ({ page, context }) => {
      // Setup: Two devices go offline and make conflicting changes
      const secondContext = await context.browser()?.newContext()
      if (!secondContext) return
      const secondPage = await secondContext.newPage()
      
      // Device 1: Go offline and process transactions
      await loginAndNavigateToPos(page)
      await simulateNetworkCondition(page, OFFLINE_POS_CONFIG.networkStates.OFFLINE)
      await createOfflineTransactions(page, 2)
      
      // Device 2: Go offline and process different transactions
      await loginAndNavigateToPos(secondPage)
      await simulateNetworkCondition(secondPage, OFFLINE_POS_CONFIG.networkStates.OFFLINE)
      await createOfflineTransactions(secondPage, 3)
      
      // Device 1 reconnects first
      await simulateNetworkCondition(page, OFFLINE_POS_CONFIG.networkStates.ONLINE)
      await waitForSync(page)
      
      // Device 2 reconnects (should detect conflicts)
      await simulateNetworkCondition(secondPage, OFFLINE_POS_CONFIG.networkStates.ONLINE)
      
      // Should show multi-device conflict resolution
      await expect(secondPage.locator('[data-testid="multi-device-conflict"]')).toBeVisible()
      await expect(secondPage.locator('[data-testid="conflict-resolution-required"]')).toContainText('Changes from multiple devices detected')
      
      // Resolve conflicts
      await secondPage.locator('[data-testid="auto-merge-transactions"]').click()
      await secondPage.locator('[data-testid="confirm-merge"]').click()
      
      await expect(secondPage.locator('[data-testid="conflicts-resolved"]')).toBeVisible()
      
      await secondContext.close()
    })

    test('synchronizes device-specific settings and preferences', async ({ page }) => {
      await loginAndNavigateToPos(page)
      
      // Configure offline settings
      await page.goto(OFFLINE_POS_CONFIG.routes.settings)
      
      // Device-specific preferences
      await page.locator('[data-testid="auto-sync-interval"]').selectOption('60') // 60 seconds
      await page.locator('[data-testid="offline-receipt-printer"]').selectOption('PRINTER_A')
      await page.locator('[data-testid="conflict-resolution-strategy"]').selectOption('AUTO_SERVER')
      
      await page.locator('[data-testid="save-offline-settings"]').click()
      
      // Go offline to test settings persistence
      await simulateNetworkCondition(page, OFFLINE_POS_CONFIG.networkStates.OFFLINE)
      
      // Verify settings are maintained
      await expect(page.locator('[data-testid="auto-sync-interval"]')).toHaveValue('60')
      await expect(page.locator('[data-testid="offline-receipt-printer"]')).toHaveValue('PRINTER_A')
      
      // Test auto-sync interval when reconnected
      await simulateNetworkCondition(page, OFFLINE_POS_CONFIG.networkStates.ONLINE)
      
      // Should sync at configured interval
      await page.waitForSelector('[data-testid="auto-sync-triggered"]', { timeout: 65000 })
    })
  })

  test.describe('Error Recovery and Resilience', () => {
    test('recovers from sync failures gracefully', async ({ page }) => {
      await loginAndNavigateToPos(page)
      await simulateNetworkCondition(page, OFFLINE_POS_CONFIG.networkStates.OFFLINE)
      
      // Create offline transactions
      await createOfflineTransactions(page, 3)
      
      // Simulate sync failure on reconnect
      await simulateSyncFailure(page)
      await simulateNetworkCondition(page, OFFLINE_POS_CONFIG.networkStates.ONLINE)
      
      // Should show sync error
      await expect(page.locator(OFFLINE_POS_CONFIG.selectors.syncErrorMessage)).toBeVisible()
      await expect(page.locator(OFFLINE_POS_CONFIG.selectors.syncErrorMessage)).toContainText('Sync failed: Server error')
      
      // Should offer retry options
      await expect(page.locator('[data-testid="retry-sync-button"]')).toBeVisible()
      await expect(page.locator('[data-testid="retry-individual-transactions"]')).toBeVisible()
      
      // Test manual retry
      await page.locator('[data-testid="retry-sync-button"]').click()
      
      // Clear sync failure simulation
      await clearSyncFailureSimulation(page)
      
      // Should succeed on retry
      await expect(page.locator('[data-testid="sync-retry-success"]')).toBeVisible()
      await expect(page.locator(OFFLINE_POS_CONFIG.selectors.pendingSyncCounter)).toContainText('0')
    })

    test('handles corrupted offline data detection and recovery', async ({ page }) => {
      await loginAndNavigateToPos(page)
      await simulateNetworkCondition(page, OFFLINE_POS_CONFIG.networkStates.OFFLINE)
      
      // Create offline data
      await createOfflineTransactions(page, 5)
      
      // Simulate data corruption
      await simulateDataCorruption(page)
      
      // Navigate to trigger integrity check
      await page.goto(OFFLINE_POS_CONFIG.routes.settings)
      
      // Should detect corruption
      await expect(page.locator('[data-testid="data-corruption-detected"]')).toBeVisible()
      await expect(page.locator('[data-testid="corruption-details"]')).toContainText('2 transactions corrupted')
      
      // Should offer recovery options
      await expect(page.locator('[data-testid="recover-from-backup"]')).toBeVisible()
      await expect(page.locator('[data-testid="discard-corrupted-data"]')).toBeVisible()
      
      // Test recovery
      await page.locator('[data-testid="recover-from-backup"]').click()
      
      await expect(page.locator('[data-testid="recovery-completed"]')).toBeVisible()
      await expect(page.locator('[data-testid="transactions-recovered"]')).toContainText('3 transactions recovered')
    })

    test('provides emergency offline operation mode', async ({ page }) => {
      await loginAndNavigateToPos(page)
      
      // Simulate critical system failure
      await simulateCriticalSystemFailure(page)
      
      // Should activate emergency mode
      await expect(page.locator('[data-testid="emergency-mode-activated"]')).toBeVisible()
      await expect(page.locator('[data-testid="emergency-mode-banner"]')).toContainText('EMERGENCY OFFLINE MODE')
      
      // Should provide basic POS functionality
      await expect(page.locator('[data-testid="emergency-pos-interface"]')).toBeVisible()
      
      // Test basic transaction processing
      await page.locator('[data-testid="emergency-product-buttons"]').locator('button').first().click()
      await page.locator('[data-testid="emergency-checkout"]').click()
      
      // Should use simplified workflow
      await page.locator('[data-testid="emergency-cash-payment"]').click()
      await page.locator('[data-testid="amount-50"]').click() // Preset amount button
      await page.locator('[data-testid="complete-emergency-transaction"]').click()
      
      // Should provide basic receipt
      await expect(page.locator('[data-testid="emergency-receipt"]')).toBeVisible()
      await expect(page.locator('[data-testid="emergency-receipt"]')).toContainText('EMERGENCY TRANSACTION')
      
      // Should log emergency transactions separately
      await page.locator('[data-testid="view-emergency-log"]').click()
      await expect(page.locator('[data-testid="emergency-transaction-log"]')).toContainText('1 emergency transaction')
    })
  })
})
// Helper Functions for Offline POS Testing

/**
 * Login and navigate to POS interface
 */
async function loginAndNavigateToPos(page: Page) {
  await page.goto(OFFLINE_POS_CONFIG.routes.login)
  await page.locator('[data-testid="email-input"]').fill('pos-user@test.com')
  await page.locator('[data-testid="password-input"]').fill('pos123')
  await page.locator('[data-testid="login-button"]').click()
  
  await expect(page).toHaveURL(/dashboard/)
  await page.goto(OFFLINE_POS_CONFIG.routes.pos)
  await expect(page.locator('[data-testid="pos-interface"]')).toBeVisible()
}

/**
 * Simulate network conditions for testing
 */
async function simulateNetworkCondition(page: Page, condition: string) {
  await page.evaluate((networkCondition) => {
    // Simulate network condition changes
    window.postMessage({ 
      type: 'SIMULATE_NETWORK_CONDITION',
      condition: networkCondition
    }, '*')
  }, condition)
  
  // Wait for condition to take effect
  await page.waitForTimeout(1000)
}

/**
 * Process a simple offline transaction
 */
async function processOfflineTransaction(page: Page) {
  await page.locator(OFFLINE_POS_CONFIG.selectors.offlineCheckoutButton).click()
  await page.locator('[data-testid="offline-payment-cash"]').click()
  await page.locator('[data-testid="cash-amount-input"]').fill('200.00')
  await page.locator('[data-testid="complete-offline-payment"]').click()
  
  await expect(page.locator(OFFLINE_POS_CONFIG.selectors.successMessage)).toBeVisible()
  await page.locator('[data-testid="new-transaction"]').click()
}

/**
 * Create multiple offline transactions for testing
 */
async function createOfflineTransactions(page: Page, count: number) {
  for (let i = 0; i < count; i++) {
    // Select a random product
    const productIndex = i % OFFLINE_POS_CONFIG.testProducts.length
    const product = OFFLINE_POS_CONFIG.testProducts[productIndex]
    
    await page.locator(`[data-testid="product-${product.id}"]`).click()
    await processOfflineTransaction(page)
  }
}

/**
 * Setup sync conflict scenario for testing
 */
async function setupSyncConflictScenario(page: Page) {
  // This would involve API calls or database seeding to create conflicting data
  await page.evaluate(() => {
    window.postMessage({ 
      type: 'SETUP_SYNC_CONFLICT',
      data: {
        productId: 'PROD001',
        serverPrice: 52.00,
        conflictType: 'PRICE_CHANGE'
      }
    }, '*')
  })
}

/**
 * Setup low stock product for testing
 */
async function setupLowStockProduct(page: Page, productId: string, stock: number) {
  await page.evaluate((id, stockLevel) => {
    window.postMessage({ 
      type: 'SET_PRODUCT_STOCK',
      productId: id,
      stock: stockLevel
    }, '*')
  }, productId, stock)
}

/**
 * Wait for synchronization to complete
 */
async function waitForSync(page: Page) {
  // Wait for sync to start
  await expect(page.locator(OFFLINE_POS_CONFIG.selectors.syncProgress)).toBeVisible()
  
  // Wait for sync to complete
  await expect(page.locator('[data-testid="sync-complete"]')).toBeVisible({ timeout: 30000 })
}

/**
 * Make inventory adjustments for testing
 */
async function makeInventoryAdjustments(page: Page, count: number) {
  await page.goto(OFFLINE_POS_CONFIG.routes.inventory)
  
  for (let i = 0; i < count; i++) {
    const product = OFFLINE_POS_CONFIG.testProducts[i % OFFLINE_POS_CONFIG.testProducts.length]
    
    await page.locator(`[data-testid="adjust-stock-${product.id}"]`).click()
    await page.locator('[data-testid="adjustment-type"]').selectOption('INCREASE')
    await page.locator('[data-testid="adjustment-quantity"]').fill('10')
    await page.locator('[data-testid="adjustment-reason"]').fill(`Offline adjustment ${i + 1}`)
    await page.locator('[data-testid="save-adjustment"]').click()
    
    await expect(page.locator('[data-testid="adjustment-saved"]')).toBeVisible()
  }
}

/**
 * Simulate storage quota being reached
 */
async function simulateStorageQuotaReached(page: Page, percentage: number) {
  await page.evaluate((quotaPercentage) => {
    window.postMessage({ 
      type: 'SIMULATE_STORAGE_QUOTA',
      percentage: quotaPercentage
    }, '*')
  }, percentage)
}

/**
 * Simulate sync failure for error testing
 */
async function simulateSyncFailure(page: Page) {
  await page.evaluate(() => {
    window.postMessage({ 
      type: 'SIMULATE_SYNC_FAILURE',
      error: 'SERVER_ERROR'
    }, '*')
  })
}

/**
 * Clear sync failure simulation
 */
async function clearSyncFailureSimulation(page: Page) {
  await page.evaluate(() => {
    window.postMessage({ 
      type: 'CLEAR_SYNC_FAILURE_SIMULATION'
    }, '*')
  })
}

/**
 * Simulate data corruption for testing recovery
 */
async function simulateDataCorruption(page: Page) {
  await page.evaluate(() => {
    window.postMessage({ 
      type: 'SIMULATE_DATA_CORRUPTION',
      corruptedTransactions: 2
    }, '*')
  })
}

/**
 * Simulate critical system failure for emergency mode
 */
async function simulateCriticalSystemFailure(page: Page) {
  await page.evaluate(() => {
    window.postMessage({ 
      type: 'SIMULATE_CRITICAL_FAILURE',
      failureType: 'SYSTEM_CRITICAL'
    }, '*')
  })
}