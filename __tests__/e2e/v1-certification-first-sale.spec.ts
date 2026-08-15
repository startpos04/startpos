/**
 * v1-certification-first-sale.spec.ts
 *
 * V1 E2E Certification: First Sale Flow
 *
 * Tests the complete POS transaction journey from initial product setup
 * through checkout completion and receipt generation.
 *
 * Critical V1 User Journey:
 *  ✅ Product catalog setup and configuration
 *  ✅ POS interface navigation and product selection
 *  ✅ Cart management and item modifications
 *  ✅ Payment processing across multiple payment methods
 *  ✅ Receipt generation and printing
 *  ✅ Transaction history recording
 *  ✅ Inventory deduction and stock tracking
 *  ✅ Tax calculation and BIR compliance
 *  ✅ Credit/transaction limit consumption
 *
 * Test Strategy:
 *  - Tests complete end-to-end sales process
 *  - Validates business logic and calculations
 *  - Tests multiple payment methods and combinations
 *  - Verifies tax compliance and receipt requirements
 *  - Tests inventory integration and stock management
 *
 * Prerequisites:
 *  - Business with activated subscription
 *  - Product catalog with test products
 *  - Inventory tracking enabled
 *  - BIR compliance configured
 *  - Payment methods configured
 *
 * Business Rules Validated:
 *  - Transaction consumes credits and counts toward limits
 *  - Inventory automatically decremented on sale
 *  - Tax calculations follow BIR requirements
 *  - Receipt contains all required compliance fields
 */

import { test, expect, type Page } from '@playwright/test'
import { faker } from '@faker-js/faker'

// Test configuration for first sale flow
const FIRST_SALE_CONFIG = {
  routes: {
    pos: '/pos',
    products: '/products',
    dashboard: '/dashboard',
    transactions: '/transactions',
    inventory: '/inventory',
    receipts: '/receipts',
    billing: '/billing',
  },
  selectors: {
    // Product management
    addProductButton: '[data-testid="add-product-button"]',
    productNameInput: '[data-testid="product-name-input"]',
    productPriceInput: '[data-testid="product-price-input"]',
    productCategorySelect: '[data-testid="product-category-select"]',
    saveProductButton: '[data-testid="save-product-button"]',
    
    // POS interface
    posInterface: '[data-testid="pos-interface"]',
    productGrid: '[data-testid="product-grid"]',
    productCard: '[data-testid="product-card"]',
    cart: '[data-testid="cart"]',
    cartItem: '[data-testid="cart-item"]',
    quantityInput: '[data-testid="quantity-input"]',
    
    // Checkout process  
    checkoutButton: '[data-testid="checkout-button"]',
    paymentMethodTab: '[data-testid="payment-method-tab"]',
    cashAmountInput: '[data-testid="cash-amount-input"]',
    cardPaymentButton: '[data-testid="card-payment-button"]',
    processPaymentButton: '[data-testid="process-payment-button"]',
    
    // Receipt and completion
    receiptPreview: '[data-testid="receipt-preview"]',
    printReceiptButton: '[data-testid="print-receipt-button"]',
    emailReceiptButton: '[data-testid="email-receipt-button"]',
    completeTransactionButton: '[data-testid="complete-transaction-button"]',
    transactionSuccessModal: '[data-testid="transaction-success-modal"]',
    
    // Transaction details
    invoiceNumber: '[data-testid="invoice-number"]',
    transactionTotal: '[data-testid="transaction-total"]',
    taxAmount: '[data-testid="tax-amount"]',
    changeAmount: '[data-testid="change-amount"]',
    
    // Customer information
    customerNameInput: '[data-testid="customer-name-input"]',
    customerEmailInput: '[data-testid="customer-email-input"]',
    customerPhoneInput: '[data-testid="customer-phone-input"]',
    addCustomerButton: '[data-testid="add-customer-button"]',
  },
  testData: {
    products: [
      {
        name: 'Test Coffee',
        price: 120.00,
        category: 'Beverages',
        sku: 'COFFEE-001',
        stockQuantity: 100,
      },
      {
        name: 'Chocolate Cake',
        price: 250.00,
        category: 'Desserts',
        sku: 'CAKE-001',
        stockQuantity: 50,
      },
      {
        name: 'Sandwich',
        price: 180.00,
        category: 'Food',
        sku: 'SAND-001',
        stockQuantity: 75,
      },
    ],
    customers: [
      {
        name: 'John Doe',
        email: 'john.doe@example.com',
        phone: '+639123456789',
      },
    ],
    paymentMethods: ['CASH', 'CARD', 'E_WALLET'],
  },
}
test.describe('V1 Certification: First Sale Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Authenticate as admin user with POS access
    await page.goto('/login')
    await page.locator('[data-testid="email-input"]').fill('admin@test.com')
    await page.locator('[data-testid="password-input"]').fill('password123')
    await page.locator('[data-testid="login-button"]').click()
    
    // Verify we're logged in and have POS access
    await expect(page).toHaveURL(/dashboard/)
  })

  test('complete first sale flow - cash payment', async ({ page }) => {
    // Step 1: Set up test products
    await setupTestProducts(page)
    
    // Step 2: Navigate to POS interface
    await page.goto(FIRST_SALE_CONFIG.routes.pos)
    await expect(page.locator(FIRST_SALE_CONFIG.selectors.posInterface)).toBeVisible()
    
    // Step 3: Add products to cart
    const coffee = FIRST_SALE_CONFIG.testData.products[0]
    const cake = FIRST_SALE_CONFIG.testData.products[1]
    
    // Add coffee to cart
    await page.locator(`[data-testid="product-card-${coffee.sku}"]`).click()
    await expect(page.locator(FIRST_SALE_CONFIG.selectors.cart)).toContainText(coffee.name)
    
    // Add cake to cart with quantity 2
    await page.locator(`[data-testid="product-card-${cake.sku}"]`).click()
    await page.locator(`[data-testid="quantity-input-${cake.sku}"]`).fill('2')
    
    // Step 4: Verify cart totals
    const expectedSubtotal = coffee.price + (cake.price * 2) // 120 + (250 * 2) = 620
    const expectedTax = Math.round(expectedSubtotal * 0.12) // 12% VAT
    const expectedTotal = expectedSubtotal + expectedTax
    
    await expect(page.locator('[data-testid="cart-subtotal"]')).toHaveText(`₱${expectedSubtotal.toFixed(2)}`)
    await expect(page.locator('[data-testid="cart-tax"]')).toHaveText(`₱${expectedTax.toFixed(2)}`)
    await expect(page.locator('[data-testid="cart-total"]')).toHaveText(`₱${expectedTotal.toFixed(2)}`)
    
    // Step 5: Proceed to checkout
    await page.locator(FIRST_SALE_CONFIG.selectors.checkoutButton).click()
    await expect(page.locator('[data-testid="checkout-modal"]')).toBeVisible()
  })

  test('cash payment with change calculation', async ({ page }) => {
    await setupTestProducts(page)
    await addProductsToCart(page, [FIRST_SALE_CONFIG.testData.products[0]])
    
    // Proceed to checkout
    await page.locator(FIRST_SALE_CONFIG.selectors.checkoutButton).click()
    
    // Select cash payment method
    await page.locator('[data-testid="payment-method-CASH"]').click()
    
    // Enter cash amount greater than total
    const total = 120 + (120 * 0.12) // Coffee price + tax
    const cashGiven = 200
    const expectedChange = cashGiven - total
    
    await page.locator(FIRST_SALE_CONFIG.selectors.cashAmountInput).fill(cashGiven.toString())
    
    // Verify change calculation
    await expect(page.locator(FIRST_SALE_CONFIG.selectors.changeAmount)).toHaveText(`₱${expectedChange.toFixed(2)}`)
    
    // Complete payment
    await page.locator(FIRST_SALE_CONFIG.selectors.processPaymentButton).click()
    
    // Verify transaction success
    await expect(page.locator(FIRST_SALE_CONFIG.selectors.transactionSuccessModal)).toBeVisible()
    await expect(page.locator('[data-testid="transaction-status"]')).toHaveText('Payment Completed')
  })
  test('card payment processing', async ({ page }) => {
    await setupTestProducts(page)
    await addProductsToCart(page, [FIRST_SALE_CONFIG.testData.products[1]])
    
    await page.locator(FIRST_SALE_CONFIG.selectors.checkoutButton).click()
    
    // Select card payment method
    await page.locator('[data-testid="payment-method-CARD"]').click()
    
    // Simulate card payment (no actual card processing in E2E)
    await page.locator(FIRST_SALE_CONFIG.selectors.cardPaymentButton).click()
    await expect(page.locator('[data-testid="card-payment-simulator"]')).toBeVisible()
    
    // Simulate successful card transaction
    await page.locator('[data-testid="simulate-card-success"]').click()
    
    // Complete transaction
    await page.locator(FIRST_SALE_CONFIG.selectors.processPaymentButton).click()
    await expect(page.locator(FIRST_SALE_CONFIG.selectors.transactionSuccessModal)).toBeVisible()
  })

  test('mixed payment methods', async ({ page }) => {
    await setupTestProducts(page)
    await addProductsToCart(page, FIRST_SALE_CONFIG.testData.products)
    
    await page.locator(FIRST_SALE_CONFIG.selectors.checkoutButton).click()
    
    // Get total amount
    const totalAmount = await page.locator('[data-testid="checkout-total"]').textContent()
    const total = parseFloat(totalAmount?.replace('₱', '').replace(',', '') || '0')
    
    // Split payment: 60% cash, 40% card
    const cashAmount = Math.round(total * 0.6)
    const cardAmount = total - cashAmount
    
    // Add cash payment
    await page.locator('[data-testid="add-payment-method"]').click()
    await page.locator('[data-testid="payment-method-CASH"]').click()
    await page.locator('[data-testid="cash-amount-input"]').fill(cashAmount.toString())
    await page.locator('[data-testid="add-cash-payment"]').click()
    
    // Add card payment for remaining amount
    await page.locator('[data-testid="add-payment-method"]').click()
    await page.locator('[data-testid="payment-method-CARD"]').click()
    await page.locator('[data-testid="card-amount-input"]').fill(cardAmount.toString())
    await page.locator('[data-testid="simulate-card-success"]').click()
    await page.locator('[data-testid="add-card-payment"]').click()
    
    // Verify payment breakdown
    await expect(page.locator('[data-testid="payment-summary"]')).toContainText('Cash: ₱' + cashAmount.toFixed(2))
    await expect(page.locator('[data-testid="payment-summary"]')).toContainText('Card: ₱' + cardAmount.toFixed(2))
    
    // Complete transaction
    await page.locator(FIRST_SALE_CONFIG.selectors.processPaymentButton).click()
    await expect(page.locator(FIRST_SALE_CONFIG.selectors.transactionSuccessModal)).toBeVisible()
  })

  test('receipt generation and BIR compliance', async ({ page }) => {
    await setupTestProducts(page)
    await completeTestTransaction(page)
    
    // Verify receipt preview
    await expect(page.locator(FIRST_SALE_CONFIG.selectors.receiptPreview)).toBeVisible()
    
    // Verify BIR compliance fields on receipt
    await expect(page.locator('[data-testid="receipt-tin"]')).toContainText('123-456-789-000')
    await expect(page.locator('[data-testid="receipt-business-name"]')).toBeVisible()
    await expect(page.locator('[data-testid="receipt-address"]')).toBeVisible()
    await expect(page.locator('[data-testid="receipt-date"]')).toBeVisible()
    
    // Verify tax breakdown
    await expect(page.locator('[data-testid="receipt-subtotal"]')).toBeVisible()
    await expect(page.locator('[data-testid="receipt-vat"]')).toContainText('VAT (12%)')
    await expect(page.locator('[data-testid="receipt-total"]')).toBeVisible()
    
    // Verify invoice number format (SI-YYYY-NNNNNN)
    const invoiceNumber = await page.locator('[data-testid="receipt-invoice-number"]').textContent()
    expect(invoiceNumber).toMatch(/SI-\d{4}-\d{6}/)
    
    // Test receipt printing
    await page.locator(FIRST_SALE_CONFIG.selectors.printReceiptButton).click()
    await expect(page.locator('[data-testid="print-success-message"]')).toBeVisible()
  })
  test('inventory deduction after sale', async ({ page }) => {
    await setupTestProducts(page)
    
    // Check initial inventory levels
    await page.goto(FIRST_SALE_CONFIG.routes.inventory)
    const initialCoffeeStock = await page.locator('[data-testid="stock-COFFEE-001"]').textContent()
    const initialStock = parseInt(initialCoffeeStock || '0')
    
    // Complete a sale
    await page.goto(FIRST_SALE_CONFIG.routes.pos)
    await page.locator('[data-testid="product-card-COFFEE-001"]').click()
    await page.locator('[data-testid="quantity-input-COFFEE-001"]').fill('3')
    
    await completeCashPayment(page)
    
    // Verify inventory reduction
    await page.goto(FIRST_SALE_CONFIG.routes.inventory)
    const newCoffeeStock = await page.locator('[data-testid="stock-COFFEE-001"]').textContent()
    const newStock = parseInt(newCoffeeStock || '0')
    
    expect(newStock).toBe(initialStock - 3)
    
    // Verify stock movement record
    await expect(page.locator('[data-testid="movement-COFFEE-001"]')).toContainText('SALE')
    await expect(page.locator('[data-testid="movement-quantity"]')).toContainText('-3')
  })

  test('transaction limits and credit consumption', async ({ page }) => {
    // Check initial credit/transaction state
    await page.goto(FIRST_SALE_CONFIG.routes.billing)
    const initialCredits = await page.locator('[data-testid="credit-balance"]').textContent()
    const initialTransactions = await page.locator('[data-testid="transaction-usage"]').textContent()
    
    // Complete a sale
    await setupTestProducts(page)
    await completeTestTransaction(page)
    
    // Verify transaction consumption
    await page.goto(FIRST_SALE_CONFIG.routes.billing)
    
    // For PREPAID_CREDITS model
    if (initialCredits && parseInt(initialCredits) > 0) {
      const newCredits = await page.locator('[data-testid="credit-balance"]').textContent()
      expect(parseInt(newCredits || '0')).toBe(parseInt(initialCredits) - 1)
    }
    
    // For MONTHLY_SUBSCRIPTION model  
    if (initialTransactions) {
      const newTransactions = await page.locator('[data-testid="transaction-usage"]').textContent()
      const oldUsage = parseInt(initialTransactions.match(/(\d+)\//) ?.[1] || '0')
      const newUsage = parseInt(newTransactions?.match(/(\d+)\//) ?.[1] || '0')
      expect(newUsage).toBe(oldUsage + 1)
    }
  })

  test('customer information and receipt email', async ({ page }) => {
    await setupTestProducts(page)
    await addProductsToCart(page, [FIRST_SALE_CONFIG.testData.products[0]])
    
    await page.locator(FIRST_SALE_CONFIG.selectors.checkoutButton).click()
    
    // Add customer information
    await page.locator('[data-testid="add-customer-button"]').click()
    const customer = FIRST_SALE_CONFIG.testData.customers[0]
    
    await page.locator(FIRST_SALE_CONFIG.selectors.customerNameInput).fill(customer.name)
    await page.locator(FIRST_SALE_CONFIG.selectors.customerEmailInput).fill(customer.email)
    await page.locator(FIRST_SALE_CONFIG.selectors.customerPhoneInput).fill(customer.phone)
    await page.locator('[data-testid="save-customer-button"]').click()
    
    // Complete payment
    await completeCashPayment(page)
    
    // Verify customer information on receipt
    await expect(page.locator('[data-testid="receipt-customer-name"]')).toHaveText(customer.name)
    await expect(page.locator('[data-testid="receipt-customer-email"]')).toHaveText(customer.email)
    
    // Test email receipt
    await page.locator(FIRST_SALE_CONFIG.selectors.emailReceiptButton).click()
    await expect(page.locator('[data-testid="email-sent-confirmation"]')).toBeVisible()
    await expect(page.locator('[data-testid="email-sent-confirmation"]')).toContainText(customer.email)
  })

  test('transaction history and audit trail', async ({ page }) => {
    await setupTestProducts(page)
    await completeTestTransaction(page)
    
    // Get transaction details from completion
    const invoiceNumber = await page.locator('[data-testid="completed-invoice-number"]').textContent()
    const transactionTotal = await page.locator('[data-testid="completed-total"]').textContent()
    
    // Navigate to transaction history
    await page.goto(FIRST_SALE_CONFIG.routes.transactions)
    
    // Verify transaction appears in history
    await expect(page.locator(`[data-testid="transaction-${invoiceNumber}"]`)).toBeVisible()
    await expect(page.locator(`[data-testid="transaction-${invoiceNumber}"]`)).toContainText(transactionTotal || '')
    await expect(page.locator(`[data-testid="transaction-${invoiceNumber}"]`)).toContainText('COMPLETED')
    
    // Click to view transaction details
    await page.locator(`[data-testid="transaction-${invoiceNumber}"]`).click()
    
    // Verify detailed transaction view
    await expect(page.locator('[data-testid="transaction-details"]')).toBeVisible()
    await expect(page.locator('[data-testid="transaction-items"]')).toBeVisible()
    await expect(page.locator('[data-testid="transaction-payments"]')).toBeVisible()
    await expect(page.locator('[data-testid="transaction-taxes"]')).toBeVisible()
  })
  test('error handling and edge cases', async ({ page }) => {
    await setupTestProducts(page)
    
    // Test insufficient cash payment
    await addProductsToCart(page, [FIRST_SALE_CONFIG.testData.products[0]])
    await page.locator(FIRST_SALE_CONFIG.selectors.checkoutButton).click()
    
    await page.locator('[data-testid="payment-method-CASH"]').click()
    await page.locator(FIRST_SALE_CONFIG.selectors.cashAmountInput).fill('50') // Less than required
    
    await expect(page.locator('[data-testid="insufficient-payment-error"]')).toBeVisible()
    await expect(page.locator(FIRST_SALE_CONFIG.selectors.processPaymentButton)).toBeDisabled()
    
    // Test out of stock scenario
    await page.goto(FIRST_SALE_CONFIG.routes.pos)
    
    // Set product stock to 0 first
    await updateProductStock(page, 'COFFEE-001', 0)
    
    // Try to add out of stock product
    await page.locator('[data-testid="product-card-COFFEE-001"]').click()
    await expect(page.locator('[data-testid="out-of-stock-warning"]')).toBeVisible()
    await expect(page.locator(FIRST_SALE_CONFIG.selectors.cart)).not.toContainText('Test Coffee')
  })

  test('transaction cancellation', async ({ page }) => {
    await setupTestProducts(page)
    await addProductsToCart(page, FIRST_SALE_CONFIG.testData.products)
    
    await page.locator(FIRST_SALE_CONFIG.selectors.checkoutButton).click()
    
    // Cancel transaction
    await page.locator('[data-testid="cancel-transaction-button"]').click()
    await page.locator('[data-testid="confirm-cancel-button"]').click()
    
    // Verify return to POS with empty cart
    await expect(page.locator(FIRST_SALE_CONFIG.selectors.posInterface)).toBeVisible()
    await expect(page.locator('[data-testid="cart-empty-message"]')).toBeVisible()
    
    // Verify no transaction was recorded
    await page.goto(FIRST_SALE_CONFIG.routes.transactions)
    await expect(page.locator('[data-testid="no-transactions-message"]')).toBeVisible()
  })
})

// Helper Functions
async function setupTestProducts(page: Page) {
  await page.goto(FIRST_SALE_CONFIG.routes.products)
  
  for (const product of FIRST_SALE_CONFIG.testData.products) {
    // Check if product already exists
    const existingProduct = page.locator(`[data-testid="product-${product.sku}"]`)
    if (await existingProduct.isVisible()) {
      continue
    }
    
    // Create new product
    await page.locator(FIRST_SALE_CONFIG.selectors.addProductButton).click()
    await page.locator(FIRST_SALE_CONFIG.selectors.productNameInput).fill(product.name)
    await page.locator(FIRST_SALE_CONFIG.selectors.productPriceInput).fill(product.price.toString())
    await page.locator('[data-testid="product-sku-input"]').fill(product.sku)
    await page.locator(FIRST_SALE_CONFIG.selectors.productCategorySelect).selectOption(product.category)
    
    // Set initial stock
    await page.locator('[data-testid="initial-stock-input"]').fill(product.stockQuantity.toString())
    
    await page.locator(FIRST_SALE_CONFIG.selectors.saveProductButton).click()
    await expect(page.locator(`[data-testid="product-${product.sku}"]`)).toBeVisible()
  }
}
async function addProductsToCart(page: Page, products: typeof FIRST_SALE_CONFIG.testData.products) {
  await page.goto(FIRST_SALE_CONFIG.routes.pos)
  
  for (const product of products) {
    await page.locator(`[data-testid="product-card-${product.sku}"]`).click()
    await expect(page.locator(FIRST_SALE_CONFIG.selectors.cart)).toContainText(product.name)
  }
}

async function completeCashPayment(page: Page) {
  await page.locator('[data-testid="payment-method-CASH"]').click()
  
  // Get total and add some extra for change
  const totalText = await page.locator('[data-testid="checkout-total"]').textContent()
  const total = parseFloat(totalText?.replace('₱', '').replace(',', '') || '0')
  const cashAmount = Math.ceil(total) + 50 // Round up and add 50 pesos
  
  await page.locator(FIRST_SALE_CONFIG.selectors.cashAmountInput).fill(cashAmount.toString())
  await page.locator(FIRST_SALE_CONFIG.selectors.processPaymentButton).click()
  
  await expect(page.locator(FIRST_SALE_CONFIG.selectors.transactionSuccessModal)).toBeVisible()
}

async function completeTestTransaction(page: Page) {
  await addProductsToCart(page, [FIRST_SALE_CONFIG.testData.products[0]])
  await page.locator(FIRST_SALE_CONFIG.selectors.checkoutButton).click()
  await completeCashPayment(page)
}

async function updateProductStock(page: Page, sku: string, quantity: number) {
  await page.goto(FIRST_SALE_CONFIG.routes.inventory)
  await page.locator(`[data-testid="adjust-stock-${sku}"]`).click()
  await page.locator('[data-testid="adjustment-quantity"]').fill(quantity.toString())
  await page.locator('[data-testid="adjustment-reason"]').selectOption('CORRECTION')
  await page.locator('[data-testid="save-adjustment"]').click()
  await expect(page.locator('[data-testid="adjustment-success"]')).toBeVisible()
}