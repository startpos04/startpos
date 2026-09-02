/**
 * fetch-structured-id.test.ts
 *
 * Tests for fetchStructuredId — the local sequence counter logic that
 * generates invoice, order, purchase, and other structured IDs.
 *
 * Mock strategy:
 *  - sequenceCounterCollection → in-memory Map stub
 *  - authStore → seeded with seedMockUser
 *
 * Coverage:
 *  - First call inserts a new counter with lastNumber=1
 *  - Second call increments existing counter
 *  - Format: INVOICE → SI-{year}-{padded6}
 *  - Format: ORDER   → #{padded6}
 *  - Format: PURCHASE → PO-{year}-{padded6}
 *  - Format: REFUND  → RF-{year}-{padded6}
 *  - Throws when invoice number exceeds branch maxInvoiceNo
 *  - Counter ID is scoped to business + branch + type + year + month
 *  - ORDER counter also scoped to day
 *
 * Run with: pnpm test
 */

import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { SequenceType } from 'prisma/generated/prisma/enums'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetMockUser, seedMockUser } from '#tests/helpers'
import { createMockCollections } from '#tests/helpers/mock-collections'

// Extend dayjs with UTC plugin — required because fetch-structured-id calls dayjs.utc()
dayjs.extend(utc)

// ---------------------------------------------------------------------------
// Mock: only the collections module, using sequenceCounterCollection
// ---------------------------------------------------------------------------

const mocks = createMockCollections()
vi.mock('@/db/collections', () => mocks)

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  seedMockUser()
  mocks.sequenceCounterCollection._store.clear()
  vi.clearAllMocks()
})

afterEach(() => {
  resetMockUser()
})

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

const { fetchStructuredId } = await import('@/lib/queries/fetch-structured-id')

// ---------------------------------------------------------------------------
// First-call (insert) behaviour
// ---------------------------------------------------------------------------

describe('fetchStructuredId — first call inserts counter at 1', () => {
  it('INVOICE: first call returns SI-{year}-000001', () => {
    const id = fetchStructuredId(SequenceType.INVOICE)
    const year = new Date().getFullYear()
    expect(id).toBe(`SI-${year}-000001`)
  })

  it('ORDER: first call returns #000001', () => {
    const id = fetchStructuredId(SequenceType.ORDER)
    expect(id).toBe('#000001')
  })

  it('PURCHASE: first call returns PO-{year}-000001', () => {
    const id = fetchStructuredId(SequenceType.PURCHASE)
    const year = new Date().getFullYear()
    expect(id).toBe(`PO-${year}-000001`)
  })

  it('REFUND: first call returns RF-{year}-000001', () => {
    const id = fetchStructuredId(SequenceType.REFUND)
    const year = new Date().getFullYear()
    expect(id).toBe(`RF-${year}-000001`)
  })

  it('STOCK_TRANSFER: first call returns ST-{year}-000001', () => {
    const id = fetchStructuredId(SequenceType.STOCK_TRANSFER)
    const year = new Date().getFullYear()
    expect(id).toBe(`ST-${year}-000001`)
  })

  it('inserts a sequenceCounter record on first call', () => {
    fetchStructuredId(SequenceType.INVOICE)
    expect(mocks.sequenceCounterCollection.insert).toHaveBeenCalledOnce()
    const inserted = mocks.sequenceCounterCollection.insert.mock.calls[0]![0] as any
    expect(inserted.lastNumber).toBe(1)
    expect(inserted.type).toBe(SequenceType.INVOICE)
    expect(inserted.businessId).toBe('biz-test-001')
    expect(inserted.branchId).toBe('branch-test-001')
  })
})

// ---------------------------------------------------------------------------
// Subsequent-call (update) behaviour
// ---------------------------------------------------------------------------

describe('fetchStructuredId — subsequent calls increment the counter', () => {
  it('second call returns 000002', () => {
    const first = fetchStructuredId(SequenceType.INVOICE)
    const second = fetchStructuredId(SequenceType.INVOICE)
    const year = new Date().getFullYear()
    expect(first).toBe(`SI-${year}-000001`)
    expect(second).toBe(`SI-${year}-000002`)
  })

  it('updates the counter record on second call (not insert)', () => {
    fetchStructuredId(SequenceType.INVOICE) // creates
    vi.clearAllMocks()
    fetchStructuredId(SequenceType.INVOICE) // updates

    expect(mocks.sequenceCounterCollection.update).toHaveBeenCalledOnce()
    expect(mocks.sequenceCounterCollection.insert).not.toHaveBeenCalled()
  })

  it('three consecutive calls produce 000001, 000002, 000003', () => {
    const year = new Date().getFullYear()
    expect(fetchStructuredId(SequenceType.PURCHASE)).toBe(`PO-${year}-000001`)
    expect(fetchStructuredId(SequenceType.PURCHASE)).toBe(`PO-${year}-000002`)
    expect(fetchStructuredId(SequenceType.PURCHASE)).toBe(`PO-${year}-000003`)
  })
})

// ---------------------------------------------------------------------------
// Counter scoping
// ---------------------------------------------------------------------------

describe('fetchStructuredId — counter scoping', () => {
  it('INVOICE and ORDER use separate counters (independent sequences)', () => {
    const invoice = fetchStructuredId(SequenceType.INVOICE)
    const order = fetchStructuredId(SequenceType.ORDER)
    // Both start at 1 since they have different counter IDs
    const year = new Date().getFullYear()
    expect(invoice).toBe(`SI-${year}-000001`)
    expect(order).toBe('#000001')
  })

  it('ORDER counter ID includes day, INVOICE counter does not', () => {
    fetchStructuredId(SequenceType.INVOICE)
    fetchStructuredId(SequenceType.ORDER)

    const insertCalls = mocks.sequenceCounterCollection.insert.mock.calls
    const invoiceCounter = insertCalls[0]![0] as any
    const orderCounter = insertCalls[1]![0] as any

    expect(invoiceCounter.day).toBe(0) // INVOICE: day=0
    expect(orderCounter.day).toBeGreaterThan(0) // ORDER: day = today
  })
})

// ---------------------------------------------------------------------------
// BIR permit limit enforcement
// ---------------------------------------------------------------------------

describe('fetchStructuredId — invoice limit enforcement', () => {
  it('throws when invoice number exceeds branch maxInvoiceNo', () => {
    // Seed a user with maxInvoiceNo = 1 (only 1 invoice allowed)
    seedMockUser({
      branch: {
        id: 'branch-test-001',
        name: 'Main Branch',
        maxInvoiceNo: 1, // only invoice #1 is allowed
      } as any,
    })
    mocks.sequenceCounterCollection._store.clear()

    // First call: generates #1 (within limit, no throw)
    expect(() => fetchStructuredId(SequenceType.INVOICE)).not.toThrow()

    // Second call: generates #2 (exceeds maxInvoiceNo=1, should throw)
    expect(() => fetchStructuredId(SequenceType.INVOICE)).toThrow('BIR Permit Limit Reached')
  })

  it('does not throw for ORDER type even when maxInvoiceNo is exceeded', () => {
    seedMockUser({
      branch: {
        id: 'branch-test-001',
        name: 'Main Branch',
        maxInvoiceNo: 1,
      } as any,
    })
    mocks.sequenceCounterCollection._store.clear()

    // Generate multiple orders — none should throw
    expect(() => fetchStructuredId(SequenceType.ORDER)).not.toThrow()
    expect(() => fetchStructuredId(SequenceType.ORDER)).not.toThrow()
    expect(() => fetchStructuredId(SequenceType.ORDER)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Task 7 additions — remaining edge cases
// ---------------------------------------------------------------------------

// COLLECTION_RECEIPT sequence type
describe('fetchStructuredId — COLLECTION_RECEIPT', () => {
  it('first call returns CR-{year}-000001', () => {
    const id = fetchStructuredId(SequenceType.COLLECTION_RECEIPT)
    const year = new Date().getFullYear()
    expect(id).toBe(`CR-${year}-000001`)
  })

  it('COLLECTION_RECEIPT counter is independent from INVOICE', () => {
    const invoice = fetchStructuredId(SequenceType.INVOICE)
    const cr = fetchStructuredId(SequenceType.COLLECTION_RECEIPT)
    const year = new Date().getFullYear()
    expect(invoice).toBe(`SI-${year}-000001`)
    expect(cr).toBe(`CR-${year}-000001`) // starts at 1, not 2
  })

  it('increments independently on repeated calls', () => {
    const year = new Date().getFullYear()
    expect(fetchStructuredId(SequenceType.COLLECTION_RECEIPT)).toBe(`CR-${year}-000001`)
    expect(fetchStructuredId(SequenceType.COLLECTION_RECEIPT)).toBe(`CR-${year}-000002`)
  })

  it('COLLECTION_RECEIPT counter day is 0 (not day-scoped)', () => {
    fetchStructuredId(SequenceType.COLLECTION_RECEIPT)
    const inserted = mocks.sequenceCounterCollection.insert.mock.calls[0]![0] as any
    expect(inserted.day).toBe(0)
  })
})

// BIR limit — non-INVOICE types should never throw
describe('fetchStructuredId — BIR limit only applies to INVOICE', () => {
  beforeEach(() => {
    seedMockUser({
      branch: {
        id: 'branch-test-001',
        name: 'Main Branch',
        maxInvoiceNo: 1,
      } as any,
    })
    mocks.sequenceCounterCollection._store.clear()
  })

  it('REFUND does not throw even when maxInvoiceNo is exceeded', () => {
    expect(() => fetchStructuredId(SequenceType.REFUND)).not.toThrow()
    expect(() => fetchStructuredId(SequenceType.REFUND)).not.toThrow()
    expect(() => fetchStructuredId(SequenceType.REFUND)).not.toThrow()
  })

  it('PURCHASE does not throw even when maxInvoiceNo is exceeded', () => {
    expect(() => fetchStructuredId(SequenceType.PURCHASE)).not.toThrow()
    expect(() => fetchStructuredId(SequenceType.PURCHASE)).not.toThrow()
  })

  it('STOCK_TRANSFER does not throw even when maxInvoiceNo is exceeded', () => {
    expect(() => fetchStructuredId(SequenceType.STOCK_TRANSFER)).not.toThrow()
    expect(() => fetchStructuredId(SequenceType.STOCK_TRANSFER)).not.toThrow()
  })

  it('COLLECTION_RECEIPT does not throw even when maxInvoiceNo is exceeded', () => {
    expect(() => fetchStructuredId(SequenceType.COLLECTION_RECEIPT)).not.toThrow()
    expect(() => fetchStructuredId(SequenceType.COLLECTION_RECEIPT)).not.toThrow()
  })
})

// Rapid succession — sequential IDs without gaps
describe('fetchStructuredId — rapid successive calls', () => {
  it('10 consecutive INVOICE calls produce 000001 through 000010', () => {
    const year = new Date().getFullYear()
    const ids = Array.from({ length: 10 }, () => fetchStructuredId(SequenceType.INVOICE))
    expect(ids[0]).toBe(`SI-${year}-000001`)
    expect(ids[4]).toBe(`SI-${year}-000005`)
    expect(ids[9]).toBe(`SI-${year}-000010`)
  })

  it('10 consecutive ORDER calls produce #000001 through #000010', () => {
    const ids = Array.from({ length: 10 }, () => fetchStructuredId(SequenceType.ORDER))
    expect(ids[0]).toBe('#000001')
    expect(ids[9]).toBe('#000010')
  })

  it('interleaved types each maintain their own independent counter', () => {
    const year = new Date().getFullYear()
    // Alternate between INVOICE and PURCHASE
    const i1 = fetchStructuredId(SequenceType.INVOICE)
    const p1 = fetchStructuredId(SequenceType.PURCHASE)
    const i2 = fetchStructuredId(SequenceType.INVOICE)
    const p2 = fetchStructuredId(SequenceType.PURCHASE)
    expect(i1).toBe(`SI-${year}-000001`)
    expect(p1).toBe(`PO-${year}-000001`)
    expect(i2).toBe(`SI-${year}-000002`)
    expect(p2).toBe(`PO-${year}-000002`)
  })
})

// Counter scoping — all types use separate counter IDs
describe('fetchStructuredId — all types use separate counters', () => {
  it('all five main types each produce 000001 on first call', () => {
    const year = new Date().getFullYear()
    expect(fetchStructuredId(SequenceType.INVOICE)).toBe(`SI-${year}-000001`)
    expect(fetchStructuredId(SequenceType.REFUND)).toBe(`RF-${year}-000001`)
    expect(fetchStructuredId(SequenceType.PURCHASE)).toBe(`PO-${year}-000001`)
    expect(fetchStructuredId(SequenceType.STOCK_TRANSFER)).toBe(`ST-${year}-000001`)
    expect(fetchStructuredId(SequenceType.COLLECTION_RECEIPT)).toBe(`CR-${year}-000001`)
  })

  it('ORDER counter is day-scoped while all others are not', () => {
    // Run all types once, then inspect the insert calls
    fetchStructuredId(SequenceType.INVOICE)
    fetchStructuredId(SequenceType.ORDER)
    fetchStructuredId(SequenceType.PURCHASE)

    const inserts = mocks.sequenceCounterCollection.insert.mock.calls.map(c => c[0] as any)
    const invoiceInsert = inserts.find(i => i.type === SequenceType.INVOICE)
    const orderInsert = inserts.find(i => i.type === SequenceType.ORDER)
    const purchaseInsert = inserts.find(i => i.type === SequenceType.PURCHASE)

    expect(invoiceInsert.day).toBe(0)
    expect(orderInsert.day).toBeGreaterThan(0)
    expect(purchaseInsert.day).toBe(0)
  })
})
