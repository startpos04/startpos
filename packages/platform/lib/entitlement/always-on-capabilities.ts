/**
 * always-on-capabilities.ts
 *
 * Capability IDs that are always required for every business — enabled
 * automatically during seeding and onboarding without needing business
 * characteristics context.
 *
 * This is the platform-level source of truth for always-on capability IDs.
 * The full capability definitions (outputs, boosters, tracking events) live
 * in apps/web/src/lib/onboarding/capability-registry.ts.
 *
 * When adding a new always-on capability, add its id here AND in the
 * ALWAYS_ON array in capability-registry.ts.
 */

export const ALWAYS_ON_CAPABILITY_IDS = [
  'COMPLETE_CHECKOUT',
  'RECORD_PAYMENT',
  'ISSUE_REFUND',
  'MANAGE_PRODUCTS',
  'VIEW_SALES_REPORTS',
  'VIEW_TRANSACTION_HISTORY',
  'MANAGE_SETTINGS',
  'MANAGE_EMPLOYEES',
  'MANAGE_BILLING',
  'REACTIVATE_SUBSCRIPTION',
  'EXPORT_DATA',
] as const

export type AlwaysOnCapabilityId = (typeof ALWAYS_ON_CAPABILITY_IDS)[number]
