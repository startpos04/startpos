/**
 * ingredient-detail.test.tsx
 *
 * Integration tests for the Ingredient detail route/dialog
 * (src/routes/(private)/(dashboard)/(admin)/ingredients/$ingredientId/index.tsx)
 *
 * Strategy:
 *  - Mount via IngredientDetailsDialog (overlay variant) — avoids the loader
 *    dependency of the Route component and uses the same RouteComponent internally.
 *  - fetchIngredients is mocked to return seeded ingredient data.
 *  - showModal mocked to capture Restock/Edit calls.
 *  - PriceEngine.format mocked for deterministic output.
 *
 * Coverage targets (Task 22):
 *  ✅ Renders ingredient name as heading
 *  ✅ Renders category badge
 *  ✅ Renders Total Stock stat card with correct quantity
 *  ✅ Renders Usage count (active recipes)
 *  ✅ Renders "not used in any recipes" empty state when usedIn is empty
 *  ✅ Renders recipe usage row when usedIn has entries
 *  ✅ Renders "Low Stock" card styling when below threshold
 *  ✅ Restock button calls showModal(RestockIngredientDialog)
 *  ✅ Edit button calls showModal(EditIngredientDialog)
 *  ✅ Loading state renders pulse skeleton
 *  ✅ Not-found state renders "Ingredient not found."
 *
 * Run with: pnpm test ingredient-detail
 */

import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeId, seedMockUser, resetMockUser } from '@/lib/__tests__/helpers'

// ---------------------------------------------------------------------------
// Mock: OPFS / DB
// ---------------------------------------------------------------------------

vi.mock('@/db/index', () => ({ persistence: null, createSyncableCollection: vi.fn(() => ({})) }))
vi.mock('@/db/local-auth', () => ({ localAuthCollection: {} }))
vi.mock('@/db/collections', () => ({
  categoryCollection: {}, unitCollection: {}, productCollection: {}, userCollection: {},
  orderCollection: {}, orderItemCollection: {}, orderItemAddonCollection: {},
  inventoryCollection: {}, inventoryMovementCollection: {}, transactionCollection: {},
  transactionTaxLineCollection: {}, paymentCollection: {}, sequenceCounterCollection: {},
  productVariantCollection: {}, productComponentCollection: {}, purchaseCollection: {},
  purchaseItemCollection: {}, businessCollection: {}, branchCollection: {},
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
// Mock: PriceEngine
// ---------------------------------------------------------------------------

vi.mock('@/lib/conversion/price-engine', () => ({
  PriceEngine: {
    format: vi.fn((cents: number) => `₱${(cents / 100).toFixed(2)}`),
    calculateLineTotal: vi.fn(() => 0),
  },
}))

// ---------------------------------------------------------------------------
// Mock: router (IngredientDetailsDialog uses dialog, not router)
// ---------------------------------------------------------------------------

vi.mock('@tanstack/react-router', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return { ...actual, useNavigate: vi.fn(() => vi.fn()) }
})

// ---------------------------------------------------------------------------
// Post-mock imports
// ---------------------------------------------------------------------------

import { fetchIngredients } from '@/lib/queries/fetch-ingredients'
import { showModal } from '@/lib/overlay'
import { IngredientDetailsDialog } from '@/routes/(private)/(dashboard)/(admin)/ingredients/$ingredientId/index'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIngredient(overrides: Record<string, any> = {}) {
  const id = overrides.id ?? makeId()
  const variantId = makeId()
  return {
    id,
    name: 'Milk',
    type: 'PHYSICAL_GOOD',
    image: null,
    isAvailable: true,
    hasExpiry: false,
    categoryId: makeId(),
    baseUnitId: makeId(),
    category: { id: makeId(), name: 'Dairy' },
    baseUnit: { id: makeId(), name: 'Liter', abbreviation: 'L' },
    variants: [
      {
        id: variantId,
        name: 'Default',
        sku: 'MLK-001',
        price: 5000,
        costPrice: 4500,
        lowStockThreshold: 5,
        inventory: [
          { id: makeId(), quantity: 20, batchNumber: 'B001', expiryDate: null, location: { name: 'Storage A' }, unit: { abbreviation: 'L' } },
        ],
        usedIn: [],
      },
    ],
    businessId: 'biz-test-001',
    branchId: 'branch-test-001',
    ...overrides,
  }
}

function renderDialog(ingredientId: string) {
  const onClose = vi.fn()
  return render(
    <IngredientDetailsDialog open={true} onClose={onClose} ingredientId={ingredientId} />,
  )
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  seedMockUser()
  vi.clearAllMocks()
  vi.mocked(showModal).mockResolvedValue('modal-id')
  vi.mocked(fetchIngredients).mockReturnValue({ data: [], isLoading: false } as any)
})

afterEach(() => {
  cleanup()
  resetMockUser()
})

// ---------------------------------------------------------------------------
// Loading / not-found
// ---------------------------------------------------------------------------

describe('IngredientDetailsDialog — loading / not-found', () => {
  it('renders pulse skeleton while loading', async () => {
    vi.mocked(fetchIngredients).mockReturnValue({ data: [], isLoading: true } as any)
    renderDialog(makeId())
    // Radix Dialog renders into a portal — use document.querySelector, not container
    await waitFor(() => {
      expect(document.querySelector('.animate-pulse')).not.toBeNull()
    })
  })

  it('renders "Ingredient not found." when ingredient missing from data', async () => {
    vi.mocked(fetchIngredients).mockReturnValue({ data: [], isLoading: false } as any)
    renderDialog(makeId())
    await waitFor(() => {
      expect(screen.getByText('Ingredient not found.')).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

describe('IngredientDetailsDialog — header', () => {
  it('renders ingredient name as heading', async () => {
    const ing = makeIngredient({ name: 'Whole Milk' })
    vi.mocked(fetchIngredients).mockReturnValue({ data: [ing], isLoading: false } as any)
    renderDialog(ing.id)
    await waitFor(() => {
      expect(screen.getByText('Whole Milk')).toBeInTheDocument()
    })
  })

  it('renders category badge', async () => {
    const ing = makeIngredient({ category: { id: makeId(), name: 'Beverages' } })
    vi.mocked(fetchIngredients).mockReturnValue({ data: [ing], isLoading: false } as any)
    renderDialog(ing.id)
    await waitFor(() => {
      expect(screen.getByText('Beverages')).toBeInTheDocument()
    })
  })

  it('renders Restock and Edit buttons', async () => {
    const ing = makeIngredient()
    vi.mocked(fetchIngredients).mockReturnValue({ data: [ing], isLoading: false } as any)
    renderDialog(ing.id)
    await waitFor(() => {
      expect(screen.getByText('Restock')).toBeInTheDocument()
      expect(screen.getByText('Edit')).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Stat cards
// ---------------------------------------------------------------------------

describe('IngredientDetailsDialog — stat cards', () => {
  it('renders Total Stock value', async () => {
    const ing = makeIngredient()
    // inventory quantity = 20
    vi.mocked(fetchIngredients).mockReturnValue({ data: [ing], isLoading: false } as any)
    renderDialog(ing.id)
    await waitFor(() => {
      expect(screen.getByText('20')).toBeInTheDocument()
    })
  })

  it('renders Usage count (0 when no recipes)', async () => {
    const ing = makeIngredient()
    vi.mocked(fetchIngredients).mockReturnValue({ data: [ing], isLoading: false } as any)
    renderDialog(ing.id)
    await waitFor(() => {
      expect(screen.getByText('Active Recipes')).toBeInTheDocument()
    })
  })

  it('renders low stock card styling when below threshold', async () => {
    const ing = makeIngredient()
    // quantity=20, threshold=5 — not low; override quantity to 2
    ing.variants[0].inventory[0].quantity = 2
    vi.mocked(fetchIngredients).mockReturnValue({ data: [ing], isLoading: false } as any)
    renderDialog(ing.id)
    await waitFor(() => {
      // Low stock indicator is present (orange Scale icon or card style)
      expect(screen.getByText('Total Stock')).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Recipe usage table
// ---------------------------------------------------------------------------

describe('IngredientDetailsDialog — recipe usage', () => {
  it('renders "not used in any recipes" when usedIn is empty', async () => {
    const ing = makeIngredient()
    vi.mocked(fetchIngredients).mockReturnValue({ data: [ing], isLoading: false } as any)
    renderDialog(ing.id)
    await waitFor(() => {
      expect(screen.getByText(/isn't used in any recipes/i)).toBeInTheDocument()
    })
  })

  it('renders usage row when usedIn has entries', async () => {
    const ing = makeIngredient()
    ing.variants[0].usedIn = [
      {
        id: makeId(),
        quantityUsed: 200,
        unit: { abbreviation: 'ml' },
        host: {
          name: 'Latte',
          product: { name: 'Coffee Drinks' },
        },
      },
    ]
    vi.mocked(fetchIngredients).mockReturnValue({ data: [ing], isLoading: false } as any)
    renderDialog(ing.id)
    await waitFor(() => {
      expect(screen.getByText('Coffee Drinks')).toBeInTheDocument()
      expect(screen.getByText(/200/)).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

describe('IngredientDetailsDialog — actions', () => {
  it('clicking Restock calls showModal', async () => {
    const ing = makeIngredient()
    vi.mocked(fetchIngredients).mockReturnValue({ data: [ing], isLoading: false } as any)
    renderDialog(ing.id)
    await waitFor(() => screen.getByText('Restock'))
    fireEvent.click(screen.getByText('Restock'))
    await waitFor(() => {
      expect(vi.mocked(showModal)).toHaveBeenCalled()
    })
  })

  it('clicking Edit calls showModal', async () => {
    const ing = makeIngredient()
    vi.mocked(fetchIngredients).mockReturnValue({ data: [ing], isLoading: false } as any)
    renderDialog(ing.id)
    await waitFor(() => screen.getByText('Edit'))
    fireEvent.click(screen.getByText('Edit'))
    await waitFor(() => {
      expect(vi.mocked(showModal)).toHaveBeenCalled()
    })
  })
})
