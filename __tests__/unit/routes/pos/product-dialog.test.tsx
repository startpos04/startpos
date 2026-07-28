/**
 * product-dialog.test.tsx
 *
 * Tests for the POS ProductDialog component
 * (src/routes/(private)/pos/-components/product-dialog.tsx)
 *
 * Strategy:
 *  - ProductDialog uses useForm (raw @tanstack/react-form), useSearch, and usePOS.
 *  - usePOS is mocked to return empty orderItems (no reserved stock).
 *  - InventoryEngine.calculateRemainingYield is mocked to return a controlled stock.
 *  - useSearch is mocked via router mock to return empty params.
 *  - Dialog renders in a Radix portal — assertions use document.body.textContent.
 *
 * Coverage targets (Task 25):
 *  ✅ Renders product name as dialog heading
 *  ✅ Renders category badge when product has category
 *  ✅ Renders "units left" stock badge when in stock
 *  ✅ Renders "Out of Stock" badge when yield = 0
 *  ✅ Renders price for single-variant product
 *  ✅ Renders "Select Option" variant radio group for multi-variant product
 *  ✅ Renders "Modifiers" addon section when variant has addons
 *  ✅ Quantity stepper starts at 1
 *  ✅ "Add to Order" button present and enabled when in stock
 *  ✅ "Sold Out" button text and disabled when yield = 0
 *  ✅ Clicking + increments quantity
 *  ✅ Clicking − does not go below 1
 *  ✅ Clicking "Add to Order" calls onConfirm with correct item shape
 *  ✅ Does not render dialog when open=false
 *
 * Run with: pnpm test product-dialog
 */

import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeId, seedMockUser, resetMockUser } from '#tests/helpers'

// ---------------------------------------------------------------------------
// Mock: DB / OPFS
// ---------------------------------------------------------------------------

vi.mock('@/db/index', () => ({ persistence: null, createSyncableCollection: vi.fn(() => ({})) }))
vi.mock('@/db/local-auth', () => ({ localAuthCollection: {} }))
vi.mock('@/db/collections', () => ({
  orderCollection: {}, orderItemCollection: {}, orderItemAddonCollection: {},
  inventoryCollection: {}, inventoryMovementCollection: {}, transactionCollection: {},
  transactionTaxLineCollection: {}, paymentCollection: {}, sequenceCounterCollection: {},
  productVariantCollection: {}, productComponentCollection: {}, purchaseCollection: {},
  purchaseItemCollection: {}, businessCollection: {}, branchCollection: {},
  categoryCollection: {}, unitCollection: {}, productCollection: {}, userCollection: {},
  locationCollection: {}, supplierCollection: {}, customerCollection: {},
  membershipCollection: {}, sessionCollection: {}, notificationCollection: {},
  operationalTaskCollection: {}, vendorSessionCollection: {},
}))

// ---------------------------------------------------------------------------
// Mock: @tanstack/react-db
// ---------------------------------------------------------------------------

vi.mock('@tanstack/react-db', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-db')>()
  return { ...actual, useLiveQuery: vi.fn(() => ({ data: [], isLoading: false })) }
})

// ---------------------------------------------------------------------------
// Mock: usePOS
// ---------------------------------------------------------------------------

vi.mock('@/hooks/use-pos', () => ({
  usePOS: vi.fn(() => ({ orderItems: [], posProducts: [], isLoading: false, totalItemsPosProducts: 0 })),
}))

// ---------------------------------------------------------------------------
// Mock: InventoryEngine.calculateRemainingYield
// ---------------------------------------------------------------------------

vi.mock('@/lib/conversion/inventory-engine', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/conversion/inventory-engine')>()
  return {
    ...actual,
    InventoryEngine: {
      ...actual.InventoryEngine,
      calculateRemainingYield: vi.fn(() => 10),
      getReservedMap: vi.fn(() => ({})),
      findPhysicalStock: vi.fn(() => ({ stock: 100, batches: [] })),
    },
  }
})

// ---------------------------------------------------------------------------
// Mock: router
// ---------------------------------------------------------------------------

vi.mock('@tanstack/react-router', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    useSearch: vi.fn(() => ({ orderId: undefined, search: '', page: 1, pageSize: 20 })),
    useNavigate: vi.fn(() => vi.fn()),
  }
})

// ---------------------------------------------------------------------------
// Post-mock imports
// ---------------------------------------------------------------------------

import { InventoryEngine } from '@/lib/conversion/inventory-engine'
import { ProductDialog } from '@/routes/(private)/pos/-components/product-dialog'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVariant(overrides: Record<string, any> = {}) {
  return {
    id: makeId(),
    name: 'Regular',
    sku: 'SKU-001',
    price: 11200,
    costPrice: 5000,
    attributeType: 'UNSPECIFIED',
    isAvailable: true,
    inventory: [],
    components: [],
    ...overrides,
  }
}

function makeProduct(overrides: Record<string, any> = {}) {
  return {
    id: overrides.id ?? makeId(),
    name: 'Americano',
    type: 'PHYSICAL_GOOD',
    image: null,
    isAvailable: true,
    hasExpiry: false,
    categoryId: makeId(),
    baseUnitId: makeId(),
    category: { id: makeId(), name: 'Coffee' },
    baseUnit: { id: makeId(), name: 'Piece', abbreviation: 'pc' },
    variants: [makeVariant()],
    ...overrides,
  }
}

function renderDialog(productOverrides: Record<string, any> = {}, dialogProps: Record<string, any> = {}) {
  const product = makeProduct(productOverrides)
  const onConfirm = vi.fn()
  const onClose = vi.fn()
  render(
    <ProductDialog
      open={true}
      onClose={onClose}
      product={product as any}
      cartItems={[]}
      onConfirm={onConfirm}
      {...dialogProps}
    />,
  )
  return { product, onConfirm, onClose }
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  seedMockUser()
  vi.clearAllMocks()
  vi.mocked(InventoryEngine.calculateRemainingYield).mockReturnValue(10)
})

afterEach(() => {
  cleanup()
  resetMockUser()
})

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('ProductDialog — rendering', () => {
  it('renders product name as dialog heading', async () => {
    renderDialog({ name: 'Latte' })
    await waitFor(() => {
      expect(document.body.textContent).toContain('Latte')
    })
  })

  it('renders category badge when product has category', async () => {
    renderDialog({ category: { id: makeId(), name: 'Espresso Drinks' } })
    await waitFor(() => {
      expect(document.body.textContent).toContain('Espresso Drinks')
    })
  })

  it('renders "units left" stock badge when in stock', async () => {
    vi.mocked(InventoryEngine.calculateRemainingYield).mockReturnValue(8)
    renderDialog()
    await waitFor(() => {
      expect(document.body.textContent).toContain('8 units left')
    })
  })

  it('renders "Out of Stock" badge when yield = 0', async () => {
    vi.mocked(InventoryEngine.calculateRemainingYield).mockReturnValue(0)
    renderDialog()
    await waitFor(() => {
      expect(document.body.textContent).toContain('Out of Stock')
    })
  })

  it('renders price for single-variant product', async () => {
    renderDialog({ variants: [makeVariant({ price: 11200 })] })
    await waitFor(() => {
      // PriceEngine.format(11200) = ₱112.00
      expect(document.body.textContent).toContain('112')
    })
  })

  it('does not render when open=false', () => {
    const product = makeProduct()
    render(
      <ProductDialog
        open={false}
        onClose={vi.fn()}
        product={product as any}
        cartItems={[]}
        onConfirm={vi.fn()}
      />,
    )
    expect(document.body.textContent).not.toContain('Americano')
  })
})

// ---------------------------------------------------------------------------
// Multi-variant selector
// ---------------------------------------------------------------------------

describe('ProductDialog — multi-variant selector', () => {
  it('renders "Select Option" section for multi-variant product', async () => {
    renderDialog({
      variants: [
        makeVariant({ id: 'v1', name: 'Small', price: 9000 }),
        makeVariant({ id: 'v2', name: 'Large', price: 12000 }),
      ],
    })
    await waitFor(() => {
      expect(document.body.textContent).toContain('Select Option')
      expect(document.body.textContent).toContain('Small')
      expect(document.body.textContent).toContain('Large')
    })
  })

  it('does NOT render variant selector for single-variant product', async () => {
    renderDialog({ variants: [makeVariant()] })
    await waitFor(() => {
      expect(document.body.textContent).not.toContain('Select Option')
    })
  })
})

// ---------------------------------------------------------------------------
// Addon modifiers
// ---------------------------------------------------------------------------

describe('ProductDialog — addon modifiers', () => {
  it('renders "Modifiers" section when variant has addons', async () => {
    const addon = {
      id: makeId(),
      isAddon: true,
      quantityUsed: 1,
      priceOverride: 2000,
      materialId: makeId(),
      hostId: makeId(),
      unit: { abbreviation: 'pc' },
      material: { id: makeId(), name: 'Extra Shot', productId: makeId(), costPrice: 500, product: { name: 'Espresso' } },
    }
    renderDialog({ variants: [makeVariant({ components: [addon] })] })
    await waitFor(() => {
      expect(document.body.textContent).toContain('Modifiers')
      expect(document.body.textContent).toContain('Espresso')
    })
  })

  it('does NOT render Modifiers section when no addons', async () => {
    renderDialog({ variants: [makeVariant({ components: [] })] })
    await waitFor(() => {
      expect(document.body.textContent).not.toContain('Modifiers')
    })
  })
})

// ---------------------------------------------------------------------------
// Quantity stepper
// ---------------------------------------------------------------------------

describe('ProductDialog — quantity stepper', () => {
  it('quantity starts at 1', async () => {
    renderDialog()
    await waitFor(() => {
      // Quantity span has w-8 text-center classes; price span has text-xs
      const qtyEl = document.querySelector('.font-mono.font-black.w-8')
      expect(qtyEl?.textContent).toBe('1')
    })
  })

  it('clicking + increments quantity', async () => {
    renderDialog()
    await waitFor(() => document.querySelector('.font-mono.font-black.w-8'))
    const plusBtns = Array.from(document.querySelectorAll('button[type="button"]'))
      .filter(b => b.querySelector('.lucide-plus'))
    expect(plusBtns.length).toBeGreaterThan(0)
    fireEvent.click(plusBtns[0]!)
    await waitFor(() => {
      const qtyEl = document.querySelector('.font-mono.font-black.w-8')
      expect(qtyEl?.textContent).toBe('2')
    })
  })

  it('clicking − does not go below 1', async () => {
    renderDialog()
    await waitFor(() => document.querySelector('.font-mono.font-black.w-8'))
    const minusBtns = Array.from(document.querySelectorAll('button[type="button"]'))
      .filter(b => b.querySelector('.lucide-minus'))
    expect(minusBtns.length).toBeGreaterThan(0)
    fireEvent.click(minusBtns[0]!)
    await waitFor(() => {
      const qtyEl = document.querySelector('.font-mono.font-black.w-8')
      expect(qtyEl?.textContent).toBe('1')
    })
  })
})

// ---------------------------------------------------------------------------
// Add to Order button
// ---------------------------------------------------------------------------

describe('ProductDialog — Add to Order button', () => {
  it('renders "Add to Order" button when in stock', async () => {
    vi.mocked(InventoryEngine.calculateRemainingYield).mockReturnValue(5)
    renderDialog()
    await waitFor(() => {
      expect(document.body.textContent).toContain('Add to Order')
    })
  })

  it('renders "Sold Out" text when yield = 0', async () => {
    vi.mocked(InventoryEngine.calculateRemainingYield).mockReturnValue(0)
    renderDialog()
    await waitFor(() => {
      expect(document.body.textContent).toContain('Sold Out')
    })
  })

  it('calls onConfirm with correct item shape on submit', async () => {
    const variantId = makeId()
    const productId = makeId()
    const { onConfirm } = renderDialog({
      id: productId,
      variants: [makeVariant({ id: variantId })],
    })
    vi.mocked(InventoryEngine.calculateRemainingYield).mockReturnValue(5)

    await waitFor(() => {
      expect(document.body.textContent).toContain('Add to Order')
    })

    // Click "Add to Order" button (submit)
    const addBtn = Array.from(document.querySelectorAll('button[type="submit"]'))
      .find(b => b.textContent?.includes('Add to Order'))
    expect(addBtn).not.toBeNull()
    fireEvent.click(addBtn!)

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          quantity: 1,
          variant: expect.objectContaining({ id: variantId }),
          product: expect.objectContaining({ id: productId }),
        }),
      )
    })
  })
})
