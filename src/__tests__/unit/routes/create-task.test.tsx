/**
 * create-task.test.tsx
 *
 * Tests for:
 *   src/routes/(private)/tasks/create/index.tsx        (CreateTaskDialog)
 *   src/routes/(private)/tasks/create/-create-task.tsx  (CreateTask form)
 *
 * Strategy:
 *  - Mount CreateTaskDialog with open=true.
 *  - useLiveQuery returns empty employees array (no user options needed).
 *  - fetchProductVariantOptions, fetchBranchOptions, fetchLocationOptions,
 *    fetchSupplierOptions all return empty arrays.
 *  - operationalTaskCollection.insert mocked.
 *  - withForm sub-components (TASK_FIELD entries) are simple renders —
 *    they work as long as SelectInput/TextInput are rendered correctly.
 *  - Assert form heading, task type select, clerk/approver selects,
 *    notes textarea, and submit button.
 *
 * Run with: pnpm test create-task
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
  operationalTaskCollection: { insert: vi.fn() },
  userCollection: {},
  orderCollection: {}, orderItemCollection: {}, orderItemAddonCollection: {},
  inventoryCollection: {}, inventoryMovementCollection: {}, transactionCollection: {},
  transactionTaxLineCollection: {}, paymentCollection: {}, sequenceCounterCollection: {},
  productVariantCollection: {}, productComponentCollection: {}, purchaseCollection: {},
  purchaseItemCollection: {}, businessCollection: {}, branchCollection: {},
  categoryCollection: {}, unitCollection: {}, productCollection: {},
  locationCollection: {}, supplierCollection: {}, customerCollection: {},
  membershipCollection: {}, sessionCollection: {}, notificationCollection: {},
  vendorSessionCollection: {},
}))

vi.mock('@tanstack/react-db', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-db')>()
  return { ...actual, useLiveQuery: vi.fn(() => ({ data: [], isLoading: false })) }
})

vi.mock('@/lib/queries/fetch-product-variant-options', () => ({
  fetchProductVariantOptions: vi.fn(() => ({ data: [], isLoading: false })),
}))

vi.mock('@/lib/queries/fetch-branch-options', () => ({
  fetchBranchOptions: vi.fn(() => ({ data: [], isLoading: false })),
}))

vi.mock('@/lib/queries/fetch-location-options', () => ({
  fetchLocationOptions: vi.fn(() => ({ data: [], isLoading: false })),
}))

vi.mock('@/lib/queries/fetch-supplier-options', () => ({
  fetchSupplierOptions: vi.fn(() => ({ data: [], isLoading: false })),
}))

vi.mock('@tanstack/react-router', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return { ...actual, useNavigate: vi.fn(() => vi.fn()) }
})

// ---------------------------------------------------------------------------
// Post-mock imports
// ---------------------------------------------------------------------------

import { operationalTaskCollection } from '@/db/collections'
import { CreateTaskDialog } from '@/routes/(private)/tasks/create/index'

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => seedMockUser())
afterEach(() => { cleanup(); resetMockUser() })

// ---------------------------------------------------------------------------
// CreateTaskDialog
// ---------------------------------------------------------------------------

describe('CreateTaskDialog — rendering', () => {
  it('renders "Create Task" heading', async () => {
    render(<CreateTaskDialog open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(document.body.textContent).toContain('Create Task')
    })
  })

  it('renders Operation Type select label', async () => {
    render(<CreateTaskDialog open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(document.body.textContent).toContain('Operation Type')
    })
  })

  it('renders Assigned Clerk select label', async () => {
    render(<CreateTaskDialog open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(document.body.textContent).toContain('Assigned Clerk')
    })
  })

  it('renders Designated Approver select label', async () => {
    render(<CreateTaskDialog open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(document.body.textContent).toContain('Designated Approver')
    })
  })

  it('renders Instructions / Reason notes field', async () => {
    render(<CreateTaskDialog open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(document.body.textContent).toContain('Instructions / Reason')
    })
  })

  it('renders Create Task submit button', async () => {
    render(<CreateTaskDialog open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(document.body.textContent).toContain('Create Task')
    })
  })

  it('does not render when open=false', () => {
    render(<CreateTaskDialog open={false} onClose={vi.fn()} />)
    expect(document.body.textContent).not.toContain('Operation Type')
  })
})

describe('CreateTaskDialog — task type options', () => {
  it('shows General Chore option in task type select (default selected)', async () => {
    render(<CreateTaskDialog open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      // Default value is GENERAL_CHORE — already displayed in the trigger
      expect(document.body.textContent).toContain('General Chore')
    })
  })

  it('opens Operation Type popover and shows all task types', async () => {
    render(<CreateTaskDialog open={true} onClose={vi.fn()} />)
    await waitFor(() => screen.getByText('Operation Type'))
    // There are 3 comboboxes — target the first one (Operation Type)
    const comboboxes = screen.getAllByRole('combobox')
    fireEvent.pointerDown(comboboxes[0]!)
    fireEvent.click(comboboxes[0]!)
    await waitFor(() => {
      expect(document.body.textContent).toContain('Shelf Refill')
    })
  })

  it('shows Purchase Request option in task type dropdown', async () => {
    render(<CreateTaskDialog open={true} onClose={vi.fn()} />)
    await waitFor(() => screen.getByText('Operation Type'))
    const comboboxes = screen.getAllByRole('combobox')
    fireEvent.pointerDown(comboboxes[0]!)
    fireEvent.click(comboboxes[0]!)
    await waitFor(() => {
      expect(document.body.textContent).toContain('Purchase Request')
    })
  })
})

describe('CreateTaskDialog — form submission', () => {
  it('calls operationalTaskCollection.insert when submit button clicked', async () => {
    render(<CreateTaskDialog open={true} onClose={vi.fn()} />)
    await waitFor(() => screen.getByText('Operation Type'))

    // The submit button uses onClick + form.handleSubmit() — type="button" not type="submit"
    // Find by textContent match
    const allBtns = Array.from(document.querySelectorAll('button'))
    const submitBtn = allBtns.find(
      b => b.textContent?.trim() === 'Create Task' || b.textContent?.includes('Create Task'),
    )
    // The submit btn is the last button rendered
    const lastBtn = allBtns.filter(b => b.textContent?.includes('Create Task')).pop()
    expect(lastBtn).not.toBeNull()
    fireEvent.click(lastBtn!)

    await waitFor(() => {
      expect(vi.mocked(operationalTaskCollection.insert)).toHaveBeenCalled()
    })
  })
})
