import { PriceConfiguration, Role } from 'prisma/generated/prisma/enums'
import type { ServerUser } from '@/lib/better-auth/auth-server'
import { authStore } from '@/store/auth-store'

/**
 * Creates a minimal mock ServerUser for tests.
 * Override individual fields via the `overrides` parameter.
 */
export function createMockUser(overrides: Partial<ServerUser> = {}): ServerUser {
  return {
    id: 'user-test-001',
    name: 'Test Cashier',
    email: 'cashier@test.com',
    image: null,
    role: Role.CASHIER,
    business: {
      id: 'biz-test-001',
      name: 'Test Business',
      ...((overrides as any).business ?? {}),
    },
    branch: {
      id: 'branch-test-001',
      name: 'Main Branch',
      maxInvoiceNo: 99999,
      ...((overrides as any).branch ?? {}),
    },
    vendorSession: null,
    systemConfigs: {
      LOW_STOCK_THRESHOLD: 10,
      VAT_RATE: 0.12,
      IS_VAT_REGISTERED: true,
      PRICE_CONFIGURATION: PriceConfiguration.INCLUSIVE,
      BUFFER_RATE: 0,
      LOCALE: 'en-PH',
      CURRENCY: 'PHP',
      ENABLE_PRINT_RECEIPT: true,
      ENABLE_ORDER_TAB: true,
      ENABLE_CASH_RECONCILIATION: false,
      ENABLE_TASK: true,
      ENABLE_ORDER: true,
      ...((overrides as any).systemConfigs ?? {}),
    },
    complianceRegistry: {
      BIR_TIN: '123-456-789-000',
      BIR_PTU_NUMBER: 'PTU-2024-001',
      BIR_PTU_ISSUED_AT: '2024-01-01',
      ...((overrides as any).complianceRegistry ?? {}),
    },
    landingPage: '/pos',
    localOverrides: [],
    ...overrides,
  } as unknown as ServerUser
}

/**
 * Seeds the global authStore with a mock user.
 * Call this in beforeEach for tests that rely on authStore.state.user.
 * Call resetMockUser() in afterEach to clean up.
 */
export function seedMockUser(overrides: Partial<ServerUser> = {}) {
  const mockUser = createMockUser(overrides)
  authStore.setState(state => ({
    ...state,
    isAuthenticated: true,
    user: mockUser,
  }))
  return mockUser
}

export function resetMockUser() {
  authStore.setState({
    isAuthenticated: false,
    isLoggingOut: false,
    user: {} as unknown as ServerUser,
  })
}
