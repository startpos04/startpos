import { QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'

// Import the generated route tree
import { routeTree } from './routeTree.gen'

export interface MyRouterContext {
  queryClient: QueryClient
  isAuthenticated: boolean
}
export const getRouter = () => {
  const queryClient = new QueryClient()

  const router = createRouter({
    routeTree,
    context: { queryClient, isAuthenticated: false },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  })

  setupRouterSsrQueryIntegration({
    router,
    queryClient,
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}

// --- FRONTEND & UX ENGINE ---
// TODO: For grocery: table view restock directly the product no need ingredients
// TODO: onboarding flow for new users pages
// TODO: creatable select input, select2, component done, integration next

// TODO: loading state in end shift, etc
// TODO: push notifications
// TODO: accessibility, keyboard control input focus, tab index, escape
// TODO: animation transition
// TODO: theme refactor make it more enterprise looking
// TODO: rich text input

// --- CORE POS & ORDER LIFECYCLE ---
// TODO: create product with variants
// TODO: edit product with variants
// TODO: add category and unit management and others

// TODO: save the current product details to order details
// TODO: order splitting
// TODO: lock order when payment is being processed

// --- COMPLIANCE, TAX, & HARDWARE ---
// TODO: Vat and sku - partially implemented need some changes in receipt
// TODO: feature flag for receipt - partially implemented

// TODO: physical printer, barcode and drawer integration
// TODO: handle cash CASH_RECONCILIATION discrepancy
// TODO: handle type safe for compliance and config depends on country actually all custom types specially polymorphic like metadata

// --- INFRASTRUCTURE & LOCAL-FIRST SECURITY ---
// TODO: Recheck local first auth security
// TODO: rollback not working

// TODO: optimize db: Add composite performance index on high-traffic tables: @@index([businessId, branchId, createdAt]) on Transactions
// TODO: optimize db: Implement in-memory caching for SystemConfig queries in hot loops
// TODO: support diff business like resort, clinic etc: Scaffold lightweight domain extension tables (Appointments, Reservations) to support specialized verticals safely
// TODO: support local sync between devices

// TODO: use effect library https://effect.website
