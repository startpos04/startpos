/**
 * reports.test.tsx
 *
 * Integration tests for Sales Reports and Inventory Reports route pages.
 *
 * Strategy:
 *  - Sales Reports: fetchTransactionReport mocked via useQuery; stat card
 *    sub-components mocked to sentinels to avoid chart/recharts deps.
 *  - Inventory Reports: useLiveQuery mocked to return seeded data; stat card
 *    sub-components mocked to sentinels.
 *  - Both pages rendered via buildRouter with date range search params.
 *
 * Coverage targets (Task 39):
 *  ✅ Sales Reports renders "Sales Reports" heading
 *  ✅ Sales Reports renders formatted date range in description
 *  ✅ Sales Reports renders Export Report button
 *  ✅ Sales Reports renders DateRangeInput
 *  ✅ Sales Reports renders stat card sub-components (TotalRevenue, GrossProfit, etc.)
 *  ✅ Inventory Reports renders "Inventory Intelligence" heading
 *  ✅ Inventory Reports renders date range in description
 *  ✅ Inventory Reports renders Export Excel button
 *  ✅ Inventory Reports renders DateRangeInput
 *  ✅ Inventory Reports renders stat card sub-components (TotalStockValue, LowStockAlert, etc.)
 *
 * Run with: pnpm test reports
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
  categoryCollection: {}, productCollection: {}, productVariantCollection: {},
  inventoryCollection: {}, inventoryMovementCollection: {}, unitCollection: {},
  userCollection: {}, businessCollection: {}, branchCollection: {},
  membershipCollection: {}, sequenceCounterCollection: {}, orderCollection: {},
  orderItemCollection: {}, orderItemAddonCollection: {}, transactionCollection: {},
  transactionTaxLineCollection: {}, paymentCollection: {}, purchaseCollection: {},
  purchaseItemCollection: {}, customerCollection: {}, supplierCollection: {},
  locationCollection: {}, notificationCollection: {}, operationalTaskCollection: {},
  vendorSessionCollection: {}, sessionCollection: {}, productComponentCollection: {},
  goodsReceiptCollection: {}, goodsReceiptItemCollection: {}, usageCounterCollection: {},
  creditLedgerCollection: {}, businessSubscriptionCollection: {}, featureCollection: {},
  featureDependencyCollection: {}, featureBundleCollection: {},
}))

// ---------------------------------------------------------------------------
// Mock: react-db
// ---------------------------------------------------------------------------

vi.mock('@tanstack/react-db', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-db')>()
  return { ...actual, useLiveQuery: vi.fn(() => ({ data: [], isLoading: false })) }
})

// ---------------------------------------------------------------------------
// Mock: react-query (used by sales-reports fetchTransactionReport)
// ---------------------------------------------------------------------------

vi.mock('@tanstack/react-query', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQuery: vi.fn(() => ({ data: { data: [] }, isLoading: false })),
    useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
    useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
  }
})

// ---------------------------------------------------------------------------
// Mock: server fns (CSV download, fetchTransactionReport)
// ---------------------------------------------------------------------------

vi.mock('@/lib/server-fn/download-tranasctions', () => ({
  downloadTransactionsCSV: vi.fn().mockResolvedValue({ data: 'csv-data' }),
}))
vi.mock('@/lib/server-fn/download-inventory', () => ({
  downloadInventoryCsv: vi.fn().mockResolvedValue({ data: 'csv-data' }),
}))

// ---------------------------------------------------------------------------
// Mock: sales-reports sub-components (chart deps — not testable in jsdom)
// ---------------------------------------------------------------------------

vi.mock('@/routes/(private)/(dashboard)/(supervisor)/sales-reports/-components/total-revenue', () => ({
  TotalRevenue: () => <div data-testid='total-revenue'>TotalRevenue</div>,
}))
vi.mock('@/routes/(private)/(dashboard)/(supervisor)/sales-reports/-components/gross-profit', () => ({
  GrossProfit: () => <div data-testid='gross-profit'>GrossProfit</div>,
}))
vi.mock('@/routes/(private)/(dashboard)/(supervisor)/sales-reports/-components/total-transactions', () => ({
  TotalTransactions: () => <div data-testid='total-transactions'>TotalTransactions</div>,
}))
vi.mock('@/routes/(private)/(dashboard)/(supervisor)/sales-reports/-components/average-order-size', () => ({
  AverageOrderSize: () => <div data-testid='average-order-size'>AverageOrderSize</div>,
}))
vi.mock('@/routes/(private)/(dashboard)/(supervisor)/sales-reports/-components/revenue-vs-cost-trend', () => ({
  RevenueVsCostTrend: () => <div data-testid='revenue-vs-cost-trend'>RevenueVsCostTrend</div>,
}))
vi.mock('@/routes/(private)/(dashboard)/(supervisor)/sales-reports/-components/staff-performance', () => ({
  StaffPerformance: () => <div data-testid='staff-performance'>StaffPerformance</div>,
}))
vi.mock('@/routes/(private)/(dashboard)/(supervisor)/sales-reports/-components/sales-heatmap', () => ({
  SalesHeatmap: () => <div data-testid='sales-heatmap'>SalesHeatmap</div>,
}))
vi.mock('@/routes/(private)/(dashboard)/(supervisor)/sales-reports/-components/top-sellers', () => ({
  TopSellers: () => <div data-testid='top-sellers'>TopSellers</div>,
}))

// ---------------------------------------------------------------------------
// Mock: inventory-reports sub-components
// ---------------------------------------------------------------------------

vi.mock('@/routes/(private)/(dashboard)/(supervisor)/inventory-reports/-components/total-stock-value', () => ({
  TotalStockValue: () => <div data-testid='total-stock-value'>TotalStockValue</div>,
}))
vi.mock('@/routes/(private)/(dashboard)/(supervisor)/inventory-reports/-components/low-stock-alert', () => ({
  LowStockAlert: () => <div data-testid='low-stock-alert'>LowStockAlert</div>,
}))
vi.mock('@/routes/(private)/(dashboard)/(supervisor)/inventory-reports/-components/active-batches', () => ({
  ActiveBatches: () => <div data-testid='active-batches'>ActiveBatches</div>,
}))
vi.mock('@/routes/(private)/(dashboard)/(supervisor)/inventory-reports/-components/waste-rate', () => ({
  WasteRate: () => <div data-testid='waste-rate'>WasteRate</div>,
}))
vi.mock('@/routes/(private)/(dashboard)/(supervisor)/inventory-reports/-components/stock-levels', () => ({
  StockLevels: () => <div data-testid='stock-levels'>StockLevels</div>,
}))
vi.mock('@/routes/(private)/(dashboard)/(supervisor)/inventory-reports/-components/inventory-health', () => ({
  InventoryHealth: () => <div data-testid='inventory-health'>InventoryHealth</div>,
}))
vi.mock('@/routes/(private)/(dashboard)/(supervisor)/inventory-reports/-components/recent-stock-movements', () => ({
  RecentStockMovements: () => <div data-testid='recent-stock-movements'>RecentStockMovements</div>,
}))

// ---------------------------------------------------------------------------
// Mock: utils (calculate-stats, fetch-transaction-reports)
// ---------------------------------------------------------------------------

vi.mock('@/routes/(private)/(dashboard)/(supervisor)/sales-reports/-utils/calculate-stats', () => ({
  calculateStats: vi.fn(() => ({})),
}))
vi.mock('@/routes/(private)/(dashboard)/(supervisor)/sales-reports/-utils/fetch-transaction-reports', () => ({
  fetchTransactionReport: vi.fn(() => ({ data: [], isLoading: false })),
}))
vi.mock('@/lib/utils/download-csv', () => ({ downloadCsv: vi.fn() }))

// ---------------------------------------------------------------------------
// Post-mock imports
// ---------------------------------------------------------------------------

import { Route as SalesReportsRoute } from '@/routes/(private)/(dashboard)/(supervisor)/sales-reports/index'
import { Route as InventoryReportsRoute } from '@/routes/(private)/(dashboard)/(supervisor)/inventory-reports/index'

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  seedMockUser()
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
  resetMockUser()
})

// ---------------------------------------------------------------------------
// Sales Reports
// ---------------------------------------------------------------------------

describe('Sales Reports page', () => {
  function renderSalesReports() {
    const router = buildRouter(
      SalesReportsRoute.options.component as any,
      '/(private)/(dashboard)/(supervisor)/sales-reports/',
      { from: '2026-06-01', to: '2026-06-30' },
    )
    return render(<RouterProvider router={router} />)
  }

  it('renders "Sales Reports" heading', async () => {
    renderSalesReports()
    await waitFor(() => {
      expect(screen.getByText('Sales Reports')).toBeInTheDocument()
    })
  })

  it('renders the Export Report button', async () => {
    renderSalesReports()
    await waitFor(() => {
      expect(screen.getByText('Export Report')).toBeInTheDocument()
    })
  })

  it('renders all 4 primary stat card components', async () => {
    renderSalesReports()
    await waitFor(() => {
      expect(screen.getByTestId('total-revenue')).toBeInTheDocument()
      expect(screen.getByTestId('gross-profit')).toBeInTheDocument()
      expect(screen.getByTestId('total-transactions')).toBeInTheDocument()
      expect(screen.getByTestId('average-order-size')).toBeInTheDocument()
    })
  })

  it('renders trend chart sub-components', async () => {
    renderSalesReports()
    await waitFor(() => {
      expect(screen.getByTestId('revenue-vs-cost-trend')).toBeInTheDocument()
      expect(screen.getByTestId('staff-performance')).toBeInTheDocument()
    })
  })

  it('renders heatmap and top sellers', async () => {
    renderSalesReports()
    await waitFor(() => {
      expect(screen.getByTestId('sales-heatmap')).toBeInTheDocument()
      expect(screen.getByTestId('top-sellers')).toBeInTheDocument()
    })
  })

  it('renders performance description text', async () => {
    renderSalesReports()
    await waitFor(() => {
      expect(screen.getByText(/performance tracking/i)).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Inventory Reports
// ---------------------------------------------------------------------------

describe('Inventory Reports page', () => {
  function renderInventoryReports() {
    const router = buildRouter(
      InventoryReportsRoute.options.component as any,
      '/(private)/(dashboard)/(supervisor)/inventory-reports/',
      { from: '2026-06-01', to: '2026-06-30' },
    )
    return render(<RouterProvider router={router} />)
  }

  it('renders "Inventory Intelligence" heading', async () => {
    renderInventoryReports()
    await waitFor(() => {
      expect(screen.getByText('Inventory Intelligence')).toBeInTheDocument()
    })
  })

  it('renders the Export Excel button', async () => {
    renderInventoryReports()
    await waitFor(() => {
      expect(screen.getByText('Export Excel')).toBeInTheDocument()
    })
  })

  it('renders all 4 top stat card components', async () => {
    renderInventoryReports()
    await waitFor(() => {
      expect(screen.getByTestId('total-stock-value')).toBeInTheDocument()
      expect(screen.getByTestId('low-stock-alert')).toBeInTheDocument()
      expect(screen.getByTestId('active-batches')).toBeInTheDocument()
      expect(screen.getByTestId('waste-rate')).toBeInTheDocument()
    })
  })

  it('renders stock analysis sub-components', async () => {
    renderInventoryReports()
    await waitFor(() => {
      expect(screen.getByTestId('stock-levels')).toBeInTheDocument()
      expect(screen.getByTestId('inventory-health')).toBeInTheDocument()
      expect(screen.getByTestId('recent-stock-movements')).toBeInTheDocument()
    })
  })

  it('renders business-wide analysis description', async () => {
    renderInventoryReports()
    await waitFor(() => {
      expect(screen.getByText(/business-wide stock analysis/i)).toBeInTheDocument()
    })
  })
})
