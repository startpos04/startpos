/**
 * tutorial-types.ts
 *
 * Shared types for the Tutorial system (Phase A).
 *
 * Architectural notes:
 *   - No infrastructure imports — pure type definitions only.
 *   - TutorialDefinition.condition is a pure predicate over TutorialContext.
 *   - TutorialGroup drives both catalogue organisation and dashboard sections.
 */

// ---------------------------------------------------------------------------
// TutorialGroup — organises the catalogue and dashboard SetupChecklist sections
// ---------------------------------------------------------------------------
export const TutorialGroup = {
  SETUP: 'SETUP',
  POS: 'POS',
  INVENTORY: 'INVENTORY',
  BILLING: 'BILLING',
  EMPLOYEES: 'EMPLOYEES',
  REPORTS: 'REPORTS',
} as const

export type TutorialGroup = (typeof TutorialGroup)[keyof typeof TutorialGroup]

// ---------------------------------------------------------------------------
// TutorialContext — all data TutorialEngine needs, assembled from offline
// collections by the useTutorials hook. No DB calls inside the engine.
// ---------------------------------------------------------------------------
export interface TutorialContext {
  productCount: number
  /** Variants with price > 0 */
  sellableVariantCount: number
  employeeCount: number
  hasOrders: boolean
  /** true if business name matches the default pattern */
  businessNameIsDefault: boolean
  /** true if BusinessSubscription.externalId !== null */
  billingConnected: boolean
  /** from authStore.entitlement.creditBalance — null if non-prepaid */
  creditBalance: number | null
  /** from systemConfigs.CREDIT_LOW_BALANCE_THRESHOLD */
  creditLowThreshold: number
  supplierCount: number
  inventoryCount: number
  taskCount: number
}

// ---------------------------------------------------------------------------
// TutorialDefinition — one entry in the static catalogue
// ---------------------------------------------------------------------------
export interface TutorialDefinition {
  /** Stable unique ID — used for session-dismiss keying */
  id: string
  /** Catalogue group for dashboard sections */
  group: TutorialGroup
  title: string
  body: string
  ctaLabel: string
  ctaRoute: string
  /** Route(s) where this tutorial's corner banner appears */
  page: string | string[]
  /**
   * Condition function: returns true when the tutorial SHOULD be shown
   * (i.e. the condition is NOT yet met by the user).
   */
  condition: (ctx: TutorialContext) => boolean
}
