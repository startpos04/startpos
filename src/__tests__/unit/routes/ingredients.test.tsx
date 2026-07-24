/**
 * ingredients.test.tsx
 *
 * Integration tests for the Ingredients route page.
 *
 * Run with: pnpm test routes/ingredients
 */

import { RouterProvider } from '@tanstack/react-router'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildRouter } from '@/lib/__tests__/helpers/router-wrapper'
import { makeId, seedMockUser, resetMockUser, makePosProduct, makePosVariant, makeInventoryRecord } from '@/lib/__tests__/helpers'

// ---------------------------------------------------------------------------
// Mock: OPFS / DB
// ---------------------------------------------------------------------------

vi.mock('@/db/index', () => ({ persistence: null, createSyncableCollection: vi.fn(() => ({})) }))
vi.mock('@/db/local-auth', () => ({ localAuthCollection: {} }))
vi.mock('@/db/collections', () => ({
  productCollection: { update: vi.fn() },
  orderCollection: {}, orderItemCollection: {}, orderItemAddonCollection: {},
  inventoryCollection: {}, inventoryMovementCollection: {}, transactionCollection: {},
  transactionTaxLineCollection: {}, paymentCollection: {}, sequenceCounterCollection: {},
  productVariantCollection: {}, productComponentCollection: {}, purchaseCollection: {},
  purchaseItemCollection: {}, businessCollection: {}, branchCollection: {},
  categoryCollection: {}, unitCollection: {}, userCollection: {},
  locationCollection: {}, supplierCollection: {}, customerCollection: {},
  membershipCollection: {}, sessionCollection: {}, notificationCollection: {},
  operationalTaskCollection: {}, vendorSessionCollection: {},
}))

// ---------------------------------------------------------------------------
// Mock: fetchIngredients
// ---------------------------------------------------------------------------

vi.mock('@/lib/queries/fetch-ingredients', () => ({
  fetchIngredients: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Mock: overlay
// ---------------------------------------------------------------------------

vi.mock('@/lib/overlay', () => ({
  showModal: vi.fn().mockResolvedValue('modal-id'),
  delModal: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Mock: PriceEngine — deterministic output
// ---------------------------------------------------------------------------

vi.mock('@/lib/conversion/price-engine', () => ({
  PriceEngine: {
    format: vi.fn((cents: number) => `₱${(cents / 100).toFixed(2)}`),
    calculateLineTotal: vi.fn(() => 0),
    toCents: (v: number) => Math.round(v * 100),
    toDollars: (v: number) => v / 100,
  },
}))

// ---------------------------------------------------------------------------
// Post-mock imports
// ---------------------------------------------------------------------------

import { fetchIngredients } from '@/lib/queries/fetch-ingredients'
import { showModal } from '@/lib/overlay'
import { Route } from '@/routes/(private)/(dashboard)/(admin)/ingredients/index'

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------

function makeIngredient(overrides: Record<string, any> = {}) {
  const productId = makeId()
  const variantId = makeId()
  const inv = makeInventoryRecord({ variantId, quantity: 25 })
  const variant = {
    ...makePosVariant({ id: variantId, productId, name: '1kg Bag', price: 0, costPrice: 8000 }),
    inventory: [inv],
    usedIn: [],
    lowStockThreshold: 5,
  }
  const product = {
    ...makePosProduct({ id: productId, name: 'Flour', type: 'RAW_MATERIAL' }),
    variants: [variant],
    category: { id: makeId(), name: 'Dry Goods' },
    baseUnit: { id: 'unit-base', name: 'Kilogram', abbreviation: 'kg' },
    ...overrides,
  }
  return product
}

function renderIngredientsPage() {
  const router = buildRouter(
    Route.options.component as any,
    '/ingredients',
  )
  return render(<RouterProvider router={router} />)
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  seedMockUser()
  vi.clearAllMocks()
  vi.mocked(showModal).mockResolvedValue('modal-id')
})

afterEach(() => {
  cleanup()
  resetMockUser()
})

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('Ingredients page — rendering', () => {
  it('renders the "Ingredients" heading', async () => {
    vi.mocked(fetchIngredients).mockReturnValue({ data: [], isLoading: false } as any)
    renderIngredientsPage()
    await waitFor(() => {
      expect(screen.getByText('Ingredients')).toBeInTheDocument()
    })
  })

  it('renders the Add Ingredient button', async () => {
    vi.mocked(fetchIngredients).mockReturnValue({ data: [], isLoading: false } as any)
    renderIngredientsPage()
    await waitFor(() => {
      expect(screen.getByText('Add Ingredient')).toBeInTheDocument()
    })
  })

  it('renders the page description', async () => {
    vi.mocked(fetchIngredients).mockReturnValue({ data: [], isLoading: false } as any)
    renderIngredientsPage()
    await waitFor(() => {
      expect(screen.getByText(/Manage raw materials/i)).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Ingredient data rendering
// ---------------------------------------------------------------------------

describe('Ingredients page — ingredient data', () => {
  it('renders ingredient name in the table', async () => {
    const ingredient = makeIngredient({ name: 'Rice Flour' })
    vi.mocked(fetchIngredients).mockReturnValue({ data: [ingredient], isLoading: false } as any)
    renderIngredientsPage()
    await waitFor(() => {
      expect(screen.getByText('Rice Flour')).toBeInTheDocument()
    })
  })

  it('renders multiple ingredients', async () => {
    const ingredients = [
      makeIngredient({ name: 'Sugar' }),
      makeIngredient({ name: 'Salt' }),
      makeIngredient({ name: 'Flour' }),
    ]
    vi.mocked(fetchIngredients).mockReturnValue({ data: ingredients, isLoading: false } as any)
    renderIngredientsPage()
    await waitFor(() => {
      expect(screen.getByText('Sugar')).toBeInTheDocument()
      expect(screen.getByText('Salt')).toBeInTheDocument()
      expect(screen.getByText('Flour')).toBeInTheDocument()
    })
  })

  it('renders empty state when no ingredients', async () => {
    vi.mocked(fetchIngredients).mockReturnValue({ data: [], isLoading: false } as any)
    renderIngredientsPage()
    await waitFor(() => {
      expect(screen.getByText('No ingredients found')).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Add Ingredient
// ---------------------------------------------------------------------------

describe('Ingredients page — add ingredient', () => {
  it('clicking Add Ingredient calls showModal', async () => {
    vi.mocked(fetchIngredients).mockReturnValue({ data: [], isLoading: false } as any)
    renderIngredientsPage()
    await waitFor(() => screen.getByText('Add Ingredient'))
    fireEvent.click(screen.getByText('Add Ingredient'))
    expect(vi.mocked(showModal)).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// Edit Ingredient
// ---------------------------------------------------------------------------

describe('Ingredients page — edit ingredient', () => {
  it('clicking edit button on a row calls showModal', async () => {
    const ingredient = makeIngredient({ name: 'Cocoa Powder' })
    vi.mocked(fetchIngredients).mockReturnValue({ data: [ingredient], isLoading: false } as any)
    renderIngredientsPage()
    await waitFor(() => screen.getByText('Cocoa Powder'))

    // Edit button is the pencil icon button in the actions column
    const editButtons = screen.getAllByRole('button').filter(btn =>
      btn.querySelector('svg')
    )
    // Click the first icon button in the actions row (Edit)
    fireEvent.click(editButtons[0]!)
    expect(vi.mocked(showModal)).toHaveBeenCalled()
  })
})
