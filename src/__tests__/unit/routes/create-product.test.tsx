/**
 * create-product.test.tsx
 *
 * Tests for:
 *   src/routes/(private)/(dashboard)/(admin)/products/create/index.tsx  (CreateProductDialog)
 *   src/routes/(private)/(dashboard)/(admin)/products/$productId/-edit-product.tsx (EditProductDialog)
 *   src/routes/(private)/(dashboard)/(admin)/products/create/-create-product.tsx  (CreateProduct form)
 *
 * Strategy:
 *  - Mount dialogs with open=true and mock all external deps.
 *  - fetchCategoryOptions / fetchUnitOptions return empty arrays.
 *  - productVariantCollection.values() returns [] so SKU refine never errors.
 *  - PriceEngine.format mocked to avoid authStore dependency.
 *  - ImageUploader mocked to a sentinel.
 *  - dbTransaction mocked to return Ok.
 *  - Assert form field labels, heading, and submit button are visible.
 *
 * Run with: pnpm test create-product
 */

import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { seedMockUser, resetMockUser } from '@/lib/__tests__/helpers'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/db/index', () => ({ persistence: null, createSyncableCollection: vi.fn(() => ({})) }))
vi.mock('@/db/local-auth', () => ({ localAuthCollection: {} }))
vi.mock('@/db/collections', () => ({
  productCollection: { insert: vi.fn(), update: vi.fn(), has: vi.fn(() => false) },
  productVariantCollection: { insert: vi.fn(), update: vi.fn(), has: vi.fn(() => false), values: vi.fn(() => []) },
  productComponentCollection: { insert: vi.fn(), update: vi.fn(), delete: vi.fn(), values: vi.fn(() => []) },
  orderCollection: {}, orderItemCollection: {}, orderItemAddonCollection: {},
  inventoryCollection: {}, inventoryMovementCollection: {}, transactionCollection: {},
  transactionTaxLineCollection: {}, paymentCollection: {}, sequenceCounterCollection: {},
  purchaseCollection: {}, purchaseItemCollection: {}, businessCollection: {}, branchCollection: {},
  categoryCollection: {}, unitCollection: {}, userCollection: {},
  locationCollection: {}, supplierCollection: {}, customerCollection: {},
  membershipCollection: {}, sessionCollection: {}, notificationCollection: {},
  operationalTaskCollection: {}, vendorSessionCollection: {},
}))

vi.mock('@/db/local-db-transaction', () => ({
  dbTransaction: vi.fn(async (fn: () => void) => { fn(); return { isErr: () => false, isOk: () => true } }),
}))

vi.mock('@/lib/conversion/price-engine', () => ({
  PriceEngine: { format: vi.fn((c: number) => `₱${(c / 100).toFixed(2)}`), calculateLineTotal: vi.fn(() => 0) },
}))

vi.mock('@/components/custom/image-uploader', () => ({
  ImageUploader: ({ label }: { label: string }) => <div data-testid='image-uploader'>{label}</div>,
}))

vi.mock('@/lib/queries/fetch-category-options', () => ({
  fetchCategoryOptions: vi.fn(() => ({ data: [], isLoading: false })),
}))

vi.mock('@/lib/queries/fetch-unit-options', () => ({
  fetchUnitOptions: vi.fn(() => ({ data: [], isLoading: false })),
}))

vi.mock('@/lib/overlay', () => ({
  showModal: vi.fn().mockResolvedValue('modal-id'),
  delModal: vi.fn(),
}))

vi.mock('@tanstack/react-router', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return { ...actual, useNavigate: vi.fn(() => vi.fn()) }
})

// ---------------------------------------------------------------------------
// Post-mock imports
// ---------------------------------------------------------------------------

import { CreateProductDialog } from '@/routes/(private)/(dashboard)/(admin)/products/create/index'
import { EditProductDialog } from '@/routes/(private)/(dashboard)/(admin)/products/$productId/-edit-product'
import type { CreateProductFormData } from '@/routes/(private)/(dashboard)/(admin)/products/create/-create-product'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultValues: CreateProductFormData = {
  name: 'Test Product',
  sku: 'TST-001',
  price: 11200,
  type: 'BUNDLE',
  categoryId: 'cat-1',
  baseUnitId: 'unit-1',
  image: '',
  isAvailable: true,
  hasExpiry: false,
  ingredients: [],
  variants: [],
  allowedAddons: [],
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => seedMockUser())
afterEach(() => { cleanup(); resetMockUser() })

// ---------------------------------------------------------------------------
// CreateProductDialog
// ---------------------------------------------------------------------------

describe('CreateProductDialog', () => {
  it('renders "New Product" heading', async () => {
    render(<CreateProductDialog open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(document.body.textContent).toContain('New Product')
    })
  })

  it('renders Name field label', async () => {
    render(<CreateProductDialog open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(document.body.textContent).toContain('Name')
    })
  })

  it('renders SKU Base field label', async () => {
    render(<CreateProductDialog open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(document.body.textContent).toContain('SKU Base')
    })
  })

  it('renders Base Price field label', async () => {
    render(<CreateProductDialog open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(document.body.textContent).toContain('Base Price')
    })
  })

  it('renders Category select field', async () => {
    render(<CreateProductDialog open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(document.body.textContent).toContain('Category')
    })
  })

  it('renders Base Unit select field', async () => {
    render(<CreateProductDialog open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(document.body.textContent).toContain('Base Unit')
    })
  })

  it('renders General Information card heading', async () => {
    render(<CreateProductDialog open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(document.body.textContent).toContain('General Information')
    })
  })

  it('renders Master Recipe card heading', async () => {
    render(<CreateProductDialog open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(document.body.textContent).toContain('Master Recipe')
    })
  })

  it('renders Inventory card heading', async () => {
    render(<CreateProductDialog open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(document.body.textContent).toContain('Inventory')
    })
  })

  it('renders POS Visible toggle label', async () => {
    render(<CreateProductDialog open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(document.body.textContent).toContain('POS Visible')
    })
  })

  it('renders Track Expiry toggle label', async () => {
    render(<CreateProductDialog open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(document.body.textContent).toContain('Track Expiry')
    })
  })

  it('renders Add Product submit button', async () => {
    render(<CreateProductDialog open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(document.body.textContent).toContain('Add Product')
    })
  })

  it('renders Add Ingredient button', async () => {
    render(<CreateProductDialog open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(document.body.textContent).toContain('Add Ingredient')
    })
  })

  it('renders Add Extras button', async () => {
    render(<CreateProductDialog open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(document.body.textContent).toContain('Add Extras')
    })
  })

  it('does not render when open=false', () => {
    render(<CreateProductDialog open={false} onClose={vi.fn()} />)
    expect(document.body.textContent).not.toContain('New Product')
  })
})

// ---------------------------------------------------------------------------
// EditProductDialog
// ---------------------------------------------------------------------------

describe('EditProductDialog', () => {
  it('renders "Update Product" heading', async () => {
    render(
      <EditProductDialog
        open={true}
        onClose={vi.fn()}
        productId='prod-001'
        variantId='var-001'
        defaultValues={defaultValues}
      />,
    )
    await waitFor(() => {
      expect(document.body.textContent).toContain('Update Product')
    })
  })

  it('renders Name field pre-filled with default value', async () => {
    render(
      <EditProductDialog
        open={true}
        onClose={vi.fn()}
        productId='prod-001'
        defaultValues={defaultValues}
      />,
    )
    await waitFor(() => {
      const input = document.querySelector('input[name="name"]') as HTMLInputElement
      expect(input?.value).toBe('Test Product')
    })
  })

  it('renders Update Product submit button', async () => {
    render(
      <EditProductDialog
        open={true}
        onClose={vi.fn()}
        productId='prod-001'
        defaultValues={defaultValues}
      />,
    )
    await waitFor(() => {
      expect(document.body.textContent).toContain('Update Product')
    })
  })

  it('does not render when open=false', () => {
    render(
      <EditProductDialog
        open={false}
        onClose={vi.fn()}
        productId='prod-001'
        defaultValues={defaultValues}
      />,
    )
    expect(document.body.textContent).not.toContain('Update Product')
  })
})
