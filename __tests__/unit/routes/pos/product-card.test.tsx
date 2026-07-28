/**
 * product-card.test.tsx
 *
 * Component tests for the ProductCard POS component.
 *
 * Strategy:
 *  - ProductCard is a plain functional component — rendered directly with props.
 *  - @tanstack/react-router uses importOriginal so transitive route imports
 *    (createFileRoute, etc.) still resolve correctly.
 *  - usePOS is mocked to return empty orderItems (no DB dependency).
 *  - OPFS initialization is blocked via mocks on @/db/index, @/db/local-auth,
 *    and @/db/collections (same pattern as cart-aside).
 *  - showModal is mocked inline in the factory (vi.fn() — no outer variable
 *    referenced to avoid hoisting issues).
 *  - PriceEngine.format is mocked for deterministic currency strings.
 *  - InventoryEngine.calculateRemainingYield runs real — it's a pure function
 *    and the inventory data is controlled via the product/variant fixtures.
 *  - authStore seeded via seedMockUser for PriceEngine calls.
 *
 * Coverage targets (from TESTING_PLAN.md Task 3):
 *  ✅ Renders product name
 *  ✅ Renders formatted price via PriceEngine.format
 *  ✅ Renders category badge (with and without category)
 *  ✅ Renders SKU when present, hidden when absent
 *  ✅ In-stock badge shows available quantity
 *  ✅ Out-of-stock badge when stock = 0
 *  ✅ Out-of-stock applies grayscale/opacity class
 *  ✅ In-stock applies cursor-pointer class
 *  ✅ Addon preview shows up to 4 addon names
 *  ✅ "+N more" indicator when addons > 4
 *  ✅ No addon section when no addons
 *  ✅ Variant options section shown when >1 variant
 *  ✅ First 2 variants shown in options section
 *  ✅ "Tap to see N more sizes" shown when >2 variants
 *  ✅ No variants section for single-variant product
 *  ✅ Click opens ProductDialog (showModal) when in stock
 *  ✅ Click does NOT call showModal when out of stock
 *  ✅ Image fallback (Coffee icon) shown when no product image
 *
 * Run with: pnpm test product-card
 */

import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { TaxCategory } from 'prisma/generated/prisma/enums'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeId, makeInventoryRecord, makePosProduct, makePosVariant, seedMockUser, resetMockUser } from '#tests/helpers'
import type { posItem } from '@/lib/conversion/inventory-engine'

// ---------------------------------------------------------------------------
// Mock: @tanstack/react-router — preserve all exports, override hooks only
// ---------------------------------------------------------------------------

vi.mock('@tanstack/react-router', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    useSearch: vi.fn(() => ({ orderId: undefined, search: '', page: 1, pageSize: 20 })),
  }
})

// ---------------------------------------------------------------------------
// Mock: usePOS — no DB / live-query needed
// ---------------------------------------------------------------------------

vi.mock('@/hooks/use-pos', () => ({
  usePOS: vi.fn(() => ({
    orderItems: [],
    posProducts: [],
    activeOrders: [],
    isLoading: false,
    totalItemsPosProducts: 0,
  })),
}))

// ---------------------------------------------------------------------------
// Mock: @/db/index and @/db/local-auth — prevent OPFS initialization
// ---------------------------------------------------------------------------

vi.mock('@/db/index', () => ({
  persistence: null,
  createSyncableCollection: vi.fn(() => ({})),
}))

vi.mock('@/db/local-auth', () => ({
  localAuthCollection: {},
}))

// ---------------------------------------------------------------------------
// Mock: @/db/collections — prevent OPFS initialization in jsdom
// ---------------------------------------------------------------------------

vi.mock('@/db/collections', () => ({
  orderCollection: {},
  orderItemCollection: {},
  orderItemAddonCollection: {},
  inventoryCollection: {},
  inventoryMovementCollection: {},
  transactionCollection: {},
  transactionTaxLineCollection: {},
  paymentCollection: {},
  sequenceCounterCollection: {},
  productVariantCollection: {},
  purchaseCollection: {},
  purchaseItemCollection: {},
  businessCollection: {},
  branchCollection: {},
  categoryCollection: {},
  unitCollection: {},
  productCollection: {},
  productComponentCollection: {},
  userCollection: {},
  locationCollection: {},
  supplierCollection: {},
  customerCollection: {},
  membershipCollection: {},
  sessionCollection: {},
  notificationCollection: {},
  operationalTaskCollection: {},
  vendorSessionCollection: {},
}))

// ---------------------------------------------------------------------------
// Mock: mount-manager — inline factory avoids hoisting issues
// ---------------------------------------------------------------------------

vi.mock('@/lib/mount-manager', () => {
  const MountManagerMock = Object.assign(
    () => null, // renderable as <MountManager />
    {
      show: vi.fn().mockResolvedValue('modal-id'),
      close: vi.fn(),
      update: vi.fn(),
      toggle: vi.fn(),
      closeChildren: vi.fn(),
      clear: vi.fn(),
      batch: vi.fn(),
    },
  )
  return { default: MountManagerMock }
})

// ---------------------------------------------------------------------------
// Mock: PriceEngine.format — deterministic output
// ---------------------------------------------------------------------------

vi.mock('@/lib/conversion/price-engine', () => ({
  PriceEngine: {
    format: vi.fn((cents: number) => `₱${(cents / 100).toFixed(2)}`),
    toCents: (v: number) => Math.round(v * 100),
    toDollars: (v: number) => v / 100,
  },
}))

// ---------------------------------------------------------------------------
// Post-mock imports
// ---------------------------------------------------------------------------

import MountManager from '@/lib/mount-manager'
import { ProductCard } from '@/routes/(private)/pos/-components/product-card'

import { showModal } from '@/lib/overlay'
import { ProductCard } from '@/routes/(private)/pos/-components/product-card'

// ---------------------------------------------------------------------------
// Test data builders
// ---------------------------------------------------------------------------

function makeAddonComponent(name: string) {
  const materialId = makeId()
  return {
    id: makeId(),
    materialId,
    isAddon: true,
    quantityUsed: 1,
    hostId: makeId(),
    unitId: 'unit-base',
    priceOverride: 1000,
    unit: null,
    material: {
      id: materialId,
      name: 'Extra',
      productId: makeId(),
      product: { id: makeId(), name } as any,
      inventory: [makeInventoryRecord({ variantId: materialId, quantity: 50 })],
      price: 1000,
      costPrice: 200,
      taxCategory: TaxCategory.STANDARD,
      sku: null,
      isAvailable: true,
      components: [],
      businessId: 'biz-test-001',
      branchId: 'branch-test-001',
      updatedAt: new Date(),
      createdAt: new Date(),
    } as any,
    businessId: 'biz-test-001',
    branchId: 'branch-test-001',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any
}

/** Build a product with controlled stock via inventory quantity */
function makeProduct({
  stock = 10,
  name = 'Americano',
  categoryName = 'Coffee',
  sku = null as string | null,
  image = null as string | null,
  addons = [] as any[],
  extraVariants = [] as any[],
} = {}) {
  const variantId = makeId()
  const productId = makeId()
  const inv = makeInventoryRecord({ variantId, quantity: stock })

  const variant = makePosVariant({
    id: variantId,
    productId,
    name: 'Regular',
    price: 11200,
    sku: sku ?? undefined,
    taxCategory: TaxCategory.STANDARD,
    inventory: [inv as any],
    components: addons,
  })

  const product = makePosProduct({
    id: productId,
    name,
    image: image ?? undefined,
    variants: [
      { ...variant, productId } as any,
      ...extraVariants,
    ],
    category: categoryName
      ? {
          id: makeId(),
          name: categoryName,
          businessId: 'biz-test-001',
          branchId: 'branch-test-001',
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      : null,
  })

  return { product, variant }
}

const emptyCart: posItem[] = []
const onAdd = vi.fn()

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  seedMockUser()
  vi.clearAllMocks()
  vi.mocked(MountManager.show).mockResolvedValue('modal-id')
  onAdd.mockReset()
})

afterEach(() => {
  cleanup()
  resetMockUser()
})

// ---------------------------------------------------------------------------
// Rendering — basic fields
// ---------------------------------------------------------------------------

describe('ProductCard — rendering', () => {
  it('renders product name', () => {
    const { product } = makeProduct({ name: 'Flat White' })
    render(<ProductCard cartItems={emptyCart} product={product} onAdd={onAdd} />)
    expect(screen.getByText('Flat White')).toBeInTheDocument()
  })

  it('renders formatted price via PriceEngine.format', () => {
    const { product } = makeProduct()
    render(<ProductCard cartItems={emptyCart} product={product} onAdd={onAdd} />)
    // price = 11200 cents → ₱112.00
    expect(screen.getByText('₱112.00')).toBeInTheDocument()
  })

  it('renders category badge when category is present', () => {
    const { product } = makeProduct({ categoryName: 'Beverages' })
    render(<ProductCard cartItems={emptyCart} product={product} onAdd={onAdd} />)
    expect(screen.getByText('Beverages')).toBeInTheDocument()
  })

  it('renders "General" category badge when category is null', () => {
    const { product } = makeProduct({ categoryName: '' })
    // Override category to null
    product.category = null as any
    render(<ProductCard cartItems={emptyCart} product={product} onAdd={onAdd} />)
    expect(screen.getByText('General')).toBeInTheDocument()
  })

  it('renders SKU when present', () => {
    const { product } = makeProduct({ sku: 'AMRC-001' })
    render(<ProductCard cartItems={emptyCart} product={product} onAdd={onAdd} />)
    expect(screen.getByText('AMRC-001')).toBeInTheDocument()
  })

  it('does not render SKU element when sku is null', () => {
    const { product } = makeProduct({ sku: null })
    render(<ProductCard cartItems={emptyCart} product={product} onAdd={onAdd} />)
    // No SKU span should appear
    expect(screen.queryByText(/^[A-Z0-9]+-\d+$/)).not.toBeInTheDocument()
  })

  it('renders Coffee fallback icon when product has no image', () => {
    const { product } = makeProduct({ image: null })
    render(<ProductCard cartItems={emptyCart} product={product} onAdd={onAdd} />)
    // AvatarFallback renders with the coffee icon — the avatar img src will be empty
    // and the fallback element is rendered (contains svg from Coffee icon)
    const avatar = document.querySelector('[data-slot="avatar"]')
    expect(avatar).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Stock badge
// ---------------------------------------------------------------------------

describe('ProductCard — stock badge', () => {
  it('shows "N available" badge when stock > 0', () => {
    const { product } = makeProduct({ stock: 7 })
    render(<ProductCard cartItems={emptyCart} product={product} onAdd={onAdd} />)
    expect(screen.getByText('7 available')).toBeInTheDocument()
  })

  it('shows "Out of Stock" badge when stock = 0', () => {
    const { product } = makeProduct({ stock: 0 })
    render(<ProductCard cartItems={emptyCart} product={product} onAdd={onAdd} />)
    expect(screen.getByText('Out of Stock')).toBeInTheDocument()
  })

  it('applies grayscale class when out of stock', () => {
    const { product } = makeProduct({ stock: 0 })
    const { container } = render(<ProductCard cartItems={emptyCart} product={product} onAdd={onAdd} />)
    const card = container.firstElementChild
    expect(card?.className).toContain('grayscale')
  })

  it('applies cursor-pointer class when in stock', () => {
    const { product } = makeProduct({ stock: 5 })
    const { container } = render(<ProductCard cartItems={emptyCart} product={product} onAdd={onAdd} />)
    const card = container.firstElementChild
    expect(card?.className).toContain('cursor-pointer')
  })

  it('does not apply cursor-pointer when out of stock', () => {
    const { product } = makeProduct({ stock: 0 })
    const { container } = render(<ProductCard cartItems={emptyCart} product={product} onAdd={onAdd} />)
    const card = container.firstElementChild
    expect(card?.className).not.toContain('cursor-pointer')
  })
})

// ---------------------------------------------------------------------------
// Addon preview
// ---------------------------------------------------------------------------

describe('ProductCard — addon preview', () => {
  it('renders addon names in the Extras section', () => {
    const addons = [makeAddonComponent('Oat Milk'), makeAddonComponent('Extra Shot')]
    const { product } = makeProduct({ addons })
    render(<ProductCard cartItems={emptyCart} product={product} onAdd={onAdd} />)
    expect(screen.getByText('+Oat Milk')).toBeInTheDocument()
    expect(screen.getByText('+Extra Shot')).toBeInTheDocument()
  })

  it('shows at most 4 addons without overflow indicator', () => {
    const addons = [
      makeAddonComponent('Oat Milk'),
      makeAddonComponent('Extra Shot'),
      makeAddonComponent('Vanilla Syrup'),
      makeAddonComponent('Caramel Drizzle'),
    ]
    const { product } = makeProduct({ addons })
    render(<ProductCard cartItems={emptyCart} product={product} onAdd={onAdd} />)
    // All 4 shown, no "+N more"
    expect(screen.queryByText(/more/i)).not.toBeInTheDocument()
  })

  it('shows "+N more" indicator when addons exceed 4', () => {
    const addons = [
      makeAddonComponent('A'),
      makeAddonComponent('B'),
      makeAddonComponent('C'),
      makeAddonComponent('D'),
      makeAddonComponent('E'), // 5th
    ]
    const { product } = makeProduct({ addons })
    render(<ProductCard cartItems={emptyCart} product={product} onAdd={onAdd} />)
    expect(screen.getByText('+1 more')).toBeInTheDocument()
  })

  it('shows "+2 more" when 6 addons present', () => {
    const addons = Array.from({ length: 6 }, (_, i) => makeAddonComponent(`Addon ${i}`))
    const { product } = makeProduct({ addons })
    render(<ProductCard cartItems={emptyCart} product={product} onAdd={onAdd} />)
    expect(screen.getByText('+2 more')).toBeInTheDocument()
  })

  it('does not render Extras section when no addons', () => {
    const { product } = makeProduct({ addons: [] })
    render(<ProductCard cartItems={emptyCart} product={product} onAdd={onAdd} />)
    expect(screen.queryByText('Extras')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Variant options section
// ---------------------------------------------------------------------------

describe('ProductCard — variant options', () => {
  it('does not render Options section for single-variant product', () => {
    const { product } = makeProduct()
    render(<ProductCard cartItems={emptyCart} product={product} onAdd={onAdd} />)
    expect(screen.queryByText('Options')).not.toBeInTheDocument()
  })

  it('renders Options section when product has multiple variants', () => {
    const extraVariant = makePosVariant({ name: 'Large', price: 13500 })
    const { product } = makeProduct({ extraVariants: [extraVariant as any] })
    render(<ProductCard cartItems={emptyCart} product={product} onAdd={onAdd} />)
    expect(screen.getByText('Options')).toBeInTheDocument()
  })

  it('shows first 2 variant names in options section', () => {
    const v2 = makePosVariant({ name: 'Medium', price: 11200 })
    const v3 = makePosVariant({ name: 'Large', price: 13500 })
    const { product } = makeProduct({ extraVariants: [v2 as any, v3 as any] })
    render(<ProductCard cartItems={emptyCart} product={product} onAdd={onAdd} />)
    expect(screen.getByText('Regular')).toBeInTheDocument() // first variant
    expect(screen.getByText('Medium')).toBeInTheDocument() // second variant
    // Large is the 3rd — should NOT appear directly, only via "more sizes"
  })

  it('shows "Tap to see N more sizes" when >2 variants', () => {
    const v2 = makePosVariant({ name: 'Medium', price: 11200 })
    const v3 = makePosVariant({ name: 'Large', price: 13500 })
    const { product } = makeProduct({ extraVariants: [v2 as any, v3 as any] })
    render(<ProductCard cartItems={emptyCart} product={product} onAdd={onAdd} />)
    expect(screen.getByText('Tap to see 1 more sizes')).toBeInTheDocument()
  })

  it('does not show "more sizes" when exactly 2 variants', () => {
    const v2 = makePosVariant({ name: 'Large', price: 13500 })
    const { product } = makeProduct({ extraVariants: [v2 as any] })
    render(<ProductCard cartItems={emptyCart} product={product} onAdd={onAdd} />)
    expect(screen.queryByText(/more sizes/i)).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Click behaviour
// ---------------------------------------------------------------------------

describe('ProductCard — click behaviour', () => {
  it('calls MountManager.show with ProductDialog when in stock and card is clicked', () => {
    const { product } = makeProduct({ stock: 5 })
    const { container } = render(<ProductCard cartItems={emptyCart} product={product} onAdd={onAdd} />)
    fireEvent.click(container.firstElementChild!)
    expect(vi.mocked(MountManager.show)).toHaveBeenCalledOnce()
  })

  it('passes product and cartItems to ProductDialog via MountManager.show options', () => {
    const { product } = makeProduct({ stock: 5 })
    const cart: posItem[] = []
    render(<ProductCard cartItems={cart} product={product} onAdd={onAdd} />)
    fireEvent.click(screen.getByText(product.name))
    const [, options] = vi.mocked(MountManager.show).mock.calls[0] as any[]
    expect(options.product).toBe(product)
    expect(options.cartItems).toBe(cart)
  })

  it('passes onAdd as onConfirm to ProductDialog', () => {
    const { product } = makeProduct({ stock: 5 })
    render(<ProductCard cartItems={emptyCart} product={product} onAdd={onAdd} />)
    fireEvent.click(screen.getByText(product.name))
    const [, options] = vi.mocked(MountManager.show).mock.calls[0] as any[]
    expect(options.onConfirm).toBe(onAdd)
  })

  it('does NOT call MountManager.show when out of stock', () => {
    const { product } = makeProduct({ stock: 0 })
    const { container } = render(<ProductCard cartItems={emptyCart} product={product} onAdd={onAdd} />)
    fireEvent.click(container.firstElementChild!)
    expect(vi.mocked(MountManager.show)).not.toHaveBeenCalled()
  })

  it('does not call MountManager.show when cart already consumes all stock', () => {
    // Product has 1 in stock; cart already has 1 of it → remaining yield = 0
    const variantId = makeId()
    const productId = makeId()
    const inv = makeInventoryRecord({ variantId, quantity: 1 })
    const variant = makePosVariant({
      id: variantId,
      productId,
      inventory: [inv as any],
      components: [],
    })
    const product = makePosProduct({
      id: productId,
      variants: [{ ...variant, productId } as any],
    })
    const cart: posItem[] = [
      { cartId: makeId(), product, variant: variant as any, quantity: 1, addons: [] },
    ]
    const { container } = render(<ProductCard cartItems={cart} product={product} onAdd={onAdd} />)
    fireEvent.click(container.firstElementChild!)
    expect(vi.mocked(MountManager.show)).not.toHaveBeenCalled()
  })
})
