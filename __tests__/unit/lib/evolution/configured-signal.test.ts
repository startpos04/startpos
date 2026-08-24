/**
 * configured-signal.test.ts — Pattern A/B tests for configuredSignal advancement
 *
 * Tests the advanceConfiguredCapabilities function from recalculation-job.ts
 * and the configuredSignal definitions on individual capabilities.
 *
 * Coverage:
 *  - advanceConfiguredCapabilities: calls advance() for ENABLED caps whose signal fires
 *  - advanceConfiguredCapabilities: skips caps whose signal returns false
 *  - advanceConfiguredCapabilities: handles no ENABLED capabilities gracefully
 *  - configuredSignal per capability: fires at the correct usage threshold
 *  - configuredSignal per capability: does NOT fire below threshold
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CAPABILITY_REGISTRY } from '@/lib/onboarding/capability-registry'
import type { BusinessUsageSummaryData } from '@/lib/evolution/types'

// ── mocks for advanceConfiguredCapabilities ───────────────────────────────

vi.mock('@tanstack/react-start', () => ({
  createServerFn: vi.fn(() => ({
    middleware: vi.fn().mockReturnThis(),
    inputValidator: vi.fn().mockReturnThis(),
    handler: vi.fn((fn: unknown) => fn),
  })),
}))
vi.mock('@/lib/better-auth/auth-middleware', () => ({ authMiddleware: {} }))

vi.mock('@/lib/prisma-client', () => ({
  prisma: {
    businessCapabilityState: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    business: { findUnique: vi.fn(), update: vi.fn() },
    configuration: { upsert: vi.fn() },
  },
}))

vi.mock('@/lib/evolution/recalculation-queue', () => ({
  recalculationQueue: { schedule: vi.fn(), claimBatch: vi.fn(), markProcessed: vi.fn(), markFailed: vi.fn() },
  RecalculationPriority: { DEFERRED: 10, IMMEDIATE: 100, BACKGROUND: 0 },
}))

vi.mock('@/lib/evolution/business-event-bus', () => ({
  BusinessEventBus: { emit: vi.fn().mockResolvedValue(undefined) },
}))

const { advanceConfiguredCapabilities } = await import('@/lib/evolution/recalculation-job')
const { prisma: mockPrisma } = await import('@/lib/prisma-client')
const { BusinessEventBus: mockBus } = await import('@/lib/evolution/business-event-bus')

// ── helpers ───────────────────────────────────────────────────────────────

function summary(overrides: BusinessUsageSummaryData = {}): BusinessUsageSummaryData {
  return {
    supplierCount: 0,
    employeeCount: 0,
    customerCount: 0,
    inventoryAdjustmentCount: 0,
    purchaseOrderCount: 0,
    reconciliationCount: 0,
    ...overrides,
  }
}

// ── advanceConfiguredCapabilities ─────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()

  // Default: business.findUnique returns minimal object
  vi.mocked(mockPrisma.business.findUnique).mockResolvedValue({ livingCharacteristics: null } as never)
  vi.mocked(mockPrisma.businessCapabilityState.findUnique).mockResolvedValue(null as never)
  vi.mocked(mockPrisma.businessCapabilityState.update).mockResolvedValue({} as never)
  vi.mocked(mockPrisma.configuration.upsert).mockResolvedValue({} as never)
  vi.mocked(mockBus.emit).mockResolvedValue(undefined)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('advanceConfiguredCapabilities', () => {
  it('does nothing when no ENABLED capabilities exist', async () => {
    vi.mocked(mockPrisma.businessCapabilityState.findMany).mockResolvedValue([])

    await advanceConfiguredCapabilities('biz-001', summary())

    // No findUnique lookups for state rows — no state rows to advance
    expect(vi.mocked(mockPrisma.businessCapabilityState.update)).not.toHaveBeenCalled()
  })

  it('advances capability when configuredSignal fires', async () => {
    // MANAGE_SUPPLIERS: configuredSignal fires when supplierCount >= 1
    vi.mocked(mockPrisma.businessCapabilityState.findMany).mockResolvedValue([
      { capabilityId: 'MANAGE_SUPPLIERS' },
    ] as never)
    // Provide a findUnique response for the advance() call inside CapabilityControl
    vi.mocked(mockPrisma.businessCapabilityState.findUnique).mockResolvedValue({
      businessId: 'biz-001',
      capabilityId: 'MANAGE_SUPPLIERS',
      state: 'ENABLED',
      stateHistory: [],
      dismissedAt: null,
      dismissalCount: 0,
      enteredAt: new Date(),
      enteredBy: null,
      previousState: null,
    } as never)

    await advanceConfiguredCapabilities('biz-001', summary({ supplierCount: 1 }))

    // CapabilityControl.advance() should have called update with state=CONFIGURED
    expect(vi.mocked(mockPrisma.businessCapabilityState.update)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ state: 'CONFIGURED' }),
      }),
    )
  })

  it('does NOT advance when configuredSignal does not fire', async () => {
    // MANAGE_SUPPLIERS: signal needs supplierCount >= 1; summary has 0
    vi.mocked(mockPrisma.businessCapabilityState.findMany).mockResolvedValue([
      { capabilityId: 'MANAGE_SUPPLIERS' },
    ] as never)

    await advanceConfiguredCapabilities('biz-001', summary({ supplierCount: 0 }))

    expect(vi.mocked(mockPrisma.businessCapabilityState.update)).not.toHaveBeenCalled()
  })

  it('skips unknown capability IDs gracefully', async () => {
    vi.mocked(mockPrisma.businessCapabilityState.findMany).mockResolvedValue([
      { capabilityId: 'DOES_NOT_EXIST' },
    ] as never)

    // Should not throw
    await expect(
      advanceConfiguredCapabilities('biz-001', summary()),
    ).resolves.toBeUndefined()
  })

  it('processes multiple ENABLED capabilities in one pass', async () => {
    vi.mocked(mockPrisma.businessCapabilityState.findMany).mockResolvedValue([
      { capabilityId: 'MANAGE_SUPPLIERS' },
      { capabilityId: 'MANAGE_CUSTOMERS' },
    ] as never)

    // Both signals fire: supplierCount >= 1, customerCount >= 10
    vi.mocked(mockPrisma.businessCapabilityState.findUnique)
      .mockResolvedValueOnce({
        businessId: 'biz-001', capabilityId: 'MANAGE_SUPPLIERS',
        state: 'ENABLED', stateHistory: [], dismissedAt: null,
        dismissalCount: 0, enteredAt: new Date(), enteredBy: null, previousState: null,
      } as never)
      .mockResolvedValueOnce({
        businessId: 'biz-001', capabilityId: 'MANAGE_CUSTOMERS',
        state: 'ENABLED', stateHistory: [], dismissedAt: null,
        dismissalCount: 0, enteredAt: new Date(), enteredBy: null, previousState: null,
      } as never)

    await advanceConfiguredCapabilities('biz-001', summary({ supplierCount: 1, customerCount: 10 }))

    // update called twice — once per advancing capability
    expect(vi.mocked(mockPrisma.businessCapabilityState.update)).toHaveBeenCalledTimes(2)
  })
})

// ── configuredSignal per capability ──────────────────────────────────────

describe('configuredSignal definitions', () => {
  function findCap(id: string) {
    const cap = CAPABILITY_REGISTRY.find((c) => c.id === id)
    if (!cap) throw new Error(`Capability '${id}' not found`)
    return cap
  }

  describe('MANAGE_SUPPLIERS', () => {
    const cap = () => findCap('MANAGE_SUPPLIERS')

    it('fires when supplierCount >= 1', () => {
      expect(cap().configuredSignal(summary({ supplierCount: 1 }))).toBe(true)
    })

    it('does NOT fire when supplierCount = 0', () => {
      expect(cap().configuredSignal(summary({ supplierCount: 0 }))).toBe(false)
    })
  })

  describe('MANAGE_CUSTOMERS', () => {
    const cap = () => findCap('MANAGE_CUSTOMERS')

    it('fires when customerCount >= 10', () => {
      expect(cap().configuredSignal(summary({ customerCount: 10 }))).toBe(true)
    })

    it('does NOT fire when customerCount = 9', () => {
      expect(cap().configuredSignal(summary({ customerCount: 9 }))).toBe(false)
    })
  })

  describe('MANAGE_INVENTORY', () => {
    const cap = () => findCap('MANAGE_INVENTORY')

    it('fires when inventoryAdjustmentCount >= 10', () => {
      expect(cap().configuredSignal(summary({ inventoryAdjustmentCount: 10 }))).toBe(true)
    })

    it('does NOT fire when inventoryAdjustmentCount = 9', () => {
      expect(cap().configuredSignal(summary({ inventoryAdjustmentCount: 9 }))).toBe(false)
    })
  })

  describe('START_VENDOR_SESSION (cash reconciliation)', () => {
    const cap = () => findCap('START_VENDOR_SESSION')

    it('fires when reconciliationCount >= 5', () => {
      expect(cap().configuredSignal(summary({ reconciliationCount: 5 }))).toBe(true)
    })

    it('does NOT fire when reconciliationCount = 4', () => {
      expect(cap().configuredSignal(summary({ reconciliationCount: 4 }))).toBe(false)
    })
  })

  describe('CREATE_PURCHASE', () => {
    const cap = () => findCap('CREATE_PURCHASE')

    it('fires when purchaseOrderCount >= 3', () => {
      expect(cap().configuredSignal(summary({ purchaseOrderCount: 3 }))).toBe(true)
    })

    it('does NOT fire when purchaseOrderCount = 2', () => {
      expect(cap().configuredSignal(summary({ purchaseOrderCount: 2 }))).toBe(false)
    })
  })

  describe('MANAGE_BRANCHES', () => {
    const cap = () => findCap('MANAGE_BRANCHES')

    it('fires when branchCount >= 2', () => {
      expect(cap().configuredSignal(summary({ branchCount: 2 }))).toBe(true)
    })

    it('does NOT fire when branchCount = 1', () => {
      expect(cap().configuredSignal(summary({ branchCount: 1 }))).toBe(false)
    })
  })

  describe('always-on capabilities have configuredSignal = () => false', () => {
    const alwaysOn = ['COMPLETE_CHECKOUT', 'MANAGE_PRODUCTS', 'MANAGE_BILLING', 'VIEW_SALES_REPORTS']
    for (const id of alwaysOn) {
      it(`${id}.configuredSignal is always false`, () => {
        const cap = findCap(id)
        // With any usage summary — always-on caps don't advance to CONFIGURED
        expect(cap.configuredSignal(summary({ supplierCount: 100, employeeCount: 100, customerCount: 100 }))).toBe(false)
      })
    }
  })
})
