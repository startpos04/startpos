/**
 * purchases.test.tsx
 *
 * Integration tests for the Purchases route pages.
 *
 * Strategy:
 *  - Purchases list: fetchPurchases mocked (useLiveQuery-based hook).
 *  - CreatePurchaseSidebar: rendered directly; fetchSupplierOptions,
 *    fetchUnitOptions, fetchVariantOptions mocked to return empty arrays.
 *  - PurchaseDetailsSidebar: rendered directly with seeded purchase data;
 *    fetchPurchases and fetchGoodsReceipts mocked.
 *  - MountManager mocked to null (portal not needed).
 *
 * Coverage targets (Task 43):
 *  ✅ Purchases list renders "Purchases" heading
 *  ✅ Purchases list renders purchase ID in table row
 *  ✅ Purchases list renders supplier name in table row
 *  ✅ Purchases list renders total cost formatted
 *  ✅ Purchases list renders status badge
 *  ✅ Purchases list renders "New Purchase" add button
 *  ✅ CreatePurchaseSidebar renders "New Purchase" heading
 *  ✅ CreatePurchaseSidebar renders Quick Receive / Request Approval mode toggle
 *  ✅ CreatePurchaseSidebar renders Supplier field
 *  ✅ CreatePurchaseSidebar renders "Create Purchase & Update Stock" submit button
 *  ✅ PurchaseDetailsSidebar renders purchase ID
 *  ✅ PurchaseDetailsSidebar renders supplier name
 *  ✅ PurchaseDetailsSidebar renders Items and Details tabs
 *  ✅ PurchaseDetailsSidebar renders "No line items recorded" when purchase has no items
 *
 * Run with: pnpm test purchases
 */

import { RouterProvider } from '@tanstack/react-router'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildRouter } from '#tests/helpers/router-wrapper'
import { seedMockUser, resetMockUser } from '#tests/helpers'

// ---------------------------------------------------------------------------
// Mock: OPFS / DB
// ---------------------------------------------------------------------------

vi.mock('@/db/index', () => ({ persistence: null, createSyncableCollection: vi.fn(() => ({})) }))
vi.mock('@/db/local-auth', () => ({ localAuthCollection: {} }))
vi.mock('@/db/collections', () => ({
  purchaseCollection: { update: vi.fn() },
  categoryCollection: {}, productCollection: {}, unitCollection: {},
  productVariantCollection: {}, productComponentCollection: {},
  businessCollection: {}, branchCollection: {}, userCollection: {},
  membershipCollection: {}, sessionCollection: {}, orderCollection: {},
  orderItemCollection: {}, orderItemAddonCollection: {}, transactionCollection: {},
  transactionTaxLineCollection: {}, paymentCollection: {}, sequenceCounterCollection: {},
  inventoryCollection: {}, inventoryMovementCollection: {},
  purchaseItemCollection: {}, customerCollection: {}, supplierCollection: {},
  locationCollection: {}, notificationCollection: {}, operationalTaskCollection: {},
  vendorSessionCollection: {}, goodsReceiptCollection: {}, goodsReceiptItemCollection: {},
  usageCounterCollection: {}, creditLedgerCollection: {}, businessSubscriptionCollection: {},
  featureCollection: {}, featureDependencyCollection: {}, featureBundleCollection: {},
}))

// ---------------------------------------------------------------------------
// Mock: react-db
// ---------------------------------------------------------------------------

vi.mock('@tanstack/react-db', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-db')>()
  return { ...actual, useLiveQuery: vi.fn(() => ({ data: [], isLoading: false })) }
})

// ---------------------------------------------------------------------------
// Mock: react-query
// ---------------------------------------------------------------------------

vi.mock('@tanstack/react-query', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQuery: vi.fn(() => ({ data: undefined, isLoading: false })),
    useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
    useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
  }
})

// ---------------------------------------------------------------------------
// Mock: purchase query hooks
// ---------------------------------------------------------------------------

vi.mock('@/lib/queries/fetch-purchases', () => ({
  fetchPurchases: vi.fn(() => ({ data: [], isLoading: false })),
}))
vi.mock('@/lib/queries/fetch-goods-receipts', () => ({
  fetchGoodsReceipts: vi.fn(() => ({ data: [], isLoading: false })),
}))
vi.mock('@/lib/queries/fetch-supplier-options', () => ({
  fetchSupplierOptions: vi.fn(() => ({ data: [] })),
}))
vi.mock('@/lib/queries/fetch-unit-options', () => ({
  fetchUnitOptions: vi.fn(() => ({ data: [] })),
}))
vi.mock('@/lib/queries/fetch-variant-options', () => ({
  fetchVariantOptions: vi.fn(() => ({ data: [] })),
}))
vi.mock('@/lib/queries/create-purchase', () => ({
  createPurchase: vi.fn().mockResolvedValue({ data: { structuredId: 'PO-2026-000001' }, error: null }),
}))
vi.mock('@/lib/queries/create-purchase-request', () => ({
  createPurchaseRequest: vi.fn().mockResolvedValue({ data: { structuredId: 'PR-2026-000001' }, error: null }),
}))
vi.mock('@/lib/queries/confirm-goods-receipt', () => ({
  confirmGoodsReceipt: vi.fn().mockResolvedValue({ success: true }),
  disputeGoodsReceipt: vi.fn().mockResolvedValue({ success: true }),
}))
vi.mock('@/lib/queries/create-goods-receipt', () => ({
  createGoodsReceipt: vi.fn().mockResolvedValue({ success: true }),
}))
vi.mock('@/lib/queries/void-purchase', () => ({
  voidPurchase: vi.fn().mockResolvedValue({ success: true }),
}))
vi.mock('@/lib/server-fn/purchase-workflow', () => ({
  getPurchaseStatusUIMetadata: vi.fn(() => ({ label: 'Pending', colorClass: '' })),
  purchaseWorkflow: {
    canTransition: vi.fn(() => ({ ok: true, value: undefined })),
    allowedTransitions: vi.fn(() => []),
    isTerminal: vi.fn(() => false),
    getTransitionDef: vi.fn(() => null),
  },
}))
vi.mock('@/lib/queries/receipt-workflow', () => ({
  getReceiptStatusUIMetadata: vi.fn(() => ({ label: 'Pending', colorClass: '' })),
  receiptWorkflow: {
    canTransition: vi.fn(() => ({ ok: true, value: undefined })),
    allowedTransitions: vi.fn(() => []),
    isTerminal: vi.fn(() => false),
    getTransitionDef: vi.fn(() => null),
  },
}))
vi.mock('@/db/local-db-transaction', () => ({
  dbTransaction: vi.fn(async (cb: () => unknown) => {
    cb()
    return { isOk: () => true }
  }),
}))

// ---------------------------------------------------------------------------
// Mock: MountManager + purchase sidebar
// ---------------------------------------------------------------------------

vi.mock('@/lib/mount-manager', () => ({
  default: () => null,
  MountManager: () => null,
}))
vi.mock('@/routes/(private)/(dashboard)/(admin)/purchases/-components/purchase-sidebar', () => ({
  showPurchaseSidebar: vi.fn(),
  closePurchaseSidebar: vi.fn(),
  PURCHASE_ASIDE_ID: 'purchase-aside',
}))

// ---------------------------------------------------------------------------
// Post-mock imports
// ---------------------------------------------------------------------------

import { Route as PurchasesRoute } from '@/routes/(private)/(dashboard)/(admin)/purchases/index'
import { CreatePurchaseSidebar } from '@/routes/(private)/(dashboard)/(admin)/purchases/create/-index'
import { PurchaseDetailsSidebar } from '@/routes/(private)/(dashboard)/(admin)/purchases/$purchaseId/index'
import { fetchPurchases } from '@/lib/queries/fetch-purchases'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makePurchase(overrides: Record<string, any> = {}) {
  return {
    id: 'purchase-001',
    purchaseId: 'PO-2026-000001',
    status: 'PENDING',
    totalCost: 15000,
    notes: null,
    createdAt: new Date('2026-06-15'),
    supplier: { id: 'sup-001', name: 'Fresh Produce Co.' },
    items: [],
    goodsReceipts: [],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  seedMockUser()
})

afterEach(() => {
  cleanup()
  resetMockUser()
})

// ---------------------------------------------------------------------------
// Purchases list page
// ---------------------------------------------------------------------------

describe('Purchases list page', () => {
  function renderPurchases() {
    const router = buildRouter(
      PurchasesRoute.options.component as any,
      '/(private)/(dashboard)/(admin)/purchases/',
    )
    return render(<RouterProvider router={router} />)
  }

  it('renders "Purchases" heading', async () => {
    vi.mocked(fetchPurchases).mockReturnValue({ data: [], isLoading: false } as any)
    renderPurchases()
    await waitFor(() => {
      expect(screen.getByText('Purchases')).toBeInTheDocument()
    })
  })

  it('renders description text', async () => {
    vi.mocked(fetchPurchases).mockReturnValue({ data: [], isLoading: false } as any)
    renderPurchases()
    await waitFor(() => {
      expect(screen.getByText(/supplier purchases/i)).toBeInTheDocument()
    })
  })

  it('renders "New Purchase" button', async () => {
    vi.mocked(fetchPurchases).mockReturnValue({ data: [], isLoading: false } as any)
    renderPurchases()
    await waitFor(() => {
      expect(screen.getByText('New Purchase')).toBeInTheDocument()
    })
  })

  it('renders purchase ID in table row', async () => {
    vi.mocked(fetchPurchases).mockReturnValue({ data: [makePurchase()], isLoading: false } as any)
    renderPurchases()
    await waitFor(() => {
      expect(screen.getByText('PO-2026-000001')).toBeInTheDocument()
    })
  })

  it('renders supplier name in table row', async () => {
    vi.mocked(fetchPurchases).mockReturnValue({ data: [makePurchase()], isLoading: false } as any)
    renderPurchases()
    await waitFor(() => {
      expect(screen.getByText('Fresh Produce Co.')).toBeInTheDocument()
    })
  })

  it('renders formatted total cost', async () => {
    vi.mocked(fetchPurchases).mockReturnValue({ data: [makePurchase({ totalCost: 15000 })], isLoading: false } as any)
    renderPurchases()
    await waitFor(() => {
      // PriceEngine.format(15000) = "₱150.00"
      expect(document.body.textContent).toMatch(/150/)
    })
  })

  it('renders status badge via getPurchaseStatusUIMetadata', async () => {
    // Make sure getPurchaseStatusUIMetadata is properly mocked before rendering
    const { getPurchaseStatusUIMetadata } = await import('@/lib/server-fn/purchase-workflow')
    vi.mocked(getPurchaseStatusUIMetadata).mockReturnValue({ label: 'Pending', colorClass: 'text-muted-foreground', variant: 'secondary' } as any)
    
    vi.mocked(fetchPurchases).mockReturnValue({ data: [makePurchase()], isLoading: false } as any)
    renderPurchases()
    await waitFor(() => {
      // The mock returns { label: 'Pending', colorClass: '', variant: 'secondary' }
      expect(screen.getByText('Pending')).toBeInTheDocument()
    })
  })

  it('renders "—" for null notes/reference', async () => {
    vi.mocked(fetchPurchases).mockReturnValue({ data: [makePurchase({ notes: null })], isLoading: false } as any)
    renderPurchases()
    await waitFor(() => {
      expect(screen.getByText('—')).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// CreatePurchaseSidebar
// ---------------------------------------------------------------------------

describe('CreatePurchaseSidebar', () => {
  it('renders "New Purchase" heading', async () => {
    render(<CreatePurchaseSidebar />)
    await waitFor(() => {
      expect(screen.getByText('New Purchase')).toBeInTheDocument()
    })
  })

  it('renders Quick Receive / Request Approval mode toggle', async () => {
    render(<CreatePurchaseSidebar />)
    await waitFor(() => {
      expect(screen.getByText('Quick Receive')).toBeInTheDocument()
      expect(screen.getByText('Request Approval')).toBeInTheDocument()
    })
  })

  it('renders "Purchase Details" section with Supplier label', async () => {
    render(<CreatePurchaseSidebar />)
    await waitFor(() => {
      expect(screen.getByText('Purchase Details')).toBeInTheDocument()
      expect(screen.getByText('Supplier')).toBeInTheDocument()
    })
  })

  it('renders "Add Item" button for line items', async () => {
    render(<CreatePurchaseSidebar />)
    await waitFor(() => {
      expect(screen.getByText('Add Item')).toBeInTheDocument()
    })
  })

  it('renders "Create Purchase & Update Stock" submit button in quick-receive mode', async () => {
    render(<CreatePurchaseSidebar />)
    await waitFor(() => {
      expect(screen.getByText('Create Purchase & Update Stock')).toBeInTheDocument()
    })
  })

  it('renders Total Cost section', async () => {
    render(<CreatePurchaseSidebar />)
    await waitFor(() => {
      expect(screen.getByText('Total Cost')).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// PurchaseDetailsSidebar
// ---------------------------------------------------------------------------

describe('PurchaseDetailsSidebar', () => {
  const purchase = makePurchase()

  it('renders purchase ID', async () => {
    render(<PurchaseDetailsSidebar open purchaseId='purchase-001' onClose={vi.fn()} />)
    // fetchPurchases returns empty by default so detail shows loading/not-found
    // seed the return value
    vi.mocked(fetchPurchases).mockReturnValue({ data: [purchase], isLoading: false } as any)
    cleanup()
    render(<PurchaseDetailsSidebar open purchaseId='purchase-001' onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('PO-2026-000001')).toBeInTheDocument()
    })
  })

  it('renders supplier name', async () => {
    vi.mocked(fetchPurchases).mockReturnValue({ data: [purchase], isLoading: false } as any)
    render(<PurchaseDetailsSidebar open purchaseId='purchase-001' onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('Fresh Produce Co.')).toBeInTheDocument()
    })
  })

  it('renders Items and Details tabs', async () => {
    vi.mocked(fetchPurchases).mockReturnValue({ data: [purchase], isLoading: false } as any)
    render(<PurchaseDetailsSidebar open purchaseId='purchase-001' onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('Items')).toBeInTheDocument()
      expect(screen.getByText('Details')).toBeInTheDocument()
    })
  })

  it('renders "No line items recorded" when purchase has no items', async () => {
    vi.mocked(fetchPurchases).mockReturnValue({ data: [makePurchase({ items: [] })], isLoading: false } as any)
    render(<PurchaseDetailsSidebar open purchaseId='purchase-001' onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('No line items recorded.')).toBeInTheDocument()
    })
  })
})
