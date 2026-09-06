/**
 * billing/types.ts
 *
 * Shared plain-object types for the Billing domain.
 * No infrastructure dependencies — safe to import from any layer.
 *
 * All types use the const-object + union pattern (no TypeScript enums)
 * to comply with the project's erasableSyntaxOnly constraint.
 */

import type { SubscriptionStatus } from '@platform/lib/entitlement/entitlement-types'

// ---------------------------------------------------------------------------
// BillingModel
// Mirrors the Prisma BillingModel enum but lives in the domain layer so
// engines never import from prisma/generated/prisma.
// ---------------------------------------------------------------------------
export const BillingModel = {
  MONTHLY_SUBSCRIPTION: 'MONTHLY_SUBSCRIPTION',
  YEARLY_SUBSCRIPTION: 'YEARLY_SUBSCRIPTION',
  PREPAID_CREDITS: 'PREPAID_CREDITS',
  HYBRID: 'HYBRID',
  COMPOSABLE_FEATURES: 'COMPOSABLE_FEATURES',
} as const

export type BillingModel = (typeof BillingModel)[keyof typeof BillingModel]

// ---------------------------------------------------------------------------
// SubscriptionTransitionTrigger
// Named trigger source for status transitions — recorded in SubscriptionStatusHistory.
// ---------------------------------------------------------------------------
export const TransitionTrigger = {
  SYSTEM: 'system', // Automated background job
  ADMIN: 'admin', // Platform administrator action
  USER: 'user', // Business owner action (e.g. cancellation)
  PAYMENT: 'payment', // Payment provider webhook
} as const

export type TransitionTrigger = (typeof TransitionTrigger)[keyof typeof TransitionTrigger]

// ---------------------------------------------------------------------------
// SubscriptionSnapshot
// Plain DTO representing the fields needed by SubscriptionEngine and
// SubscriptionPolicy. Assembled by the Application Layer from a
// BusinessSubscription Prisma record — the engine never touches Prisma types.
// ---------------------------------------------------------------------------
export type SubscriptionSnapshot = {
  id: string
  businessId: string
  status: SubscriptionStatus
  billingModel: BillingModel
  trialEndsAt: Date | null
  currentPeriodStart: Date | null
  currentPeriodEnd: Date | null
  gracePeriodEndsAt: Date | null
  expiredAt: Date | null
  longTermInactiveAt: Date | null
  activatedAt: Date | null
  cancelledAt: Date | null
  suspendedAt: Date | null
  // Advance payment fields
  advancePaymentCredits: number
  advancePaymentExpiresAt: Date | null
}

// ---------------------------------------------------------------------------
// StatusTransitionRecord
// The data written to SubscriptionStatusHistory on every transition.
// Returned by SubscriptionEngine transition helpers so the Application Layer
// can persist it without the engine knowing about infrastructure.
// ---------------------------------------------------------------------------
export type StatusTransitionRecord = {
  subscriptionId: string
  fromStatus: SubscriptionStatus | null
  toStatus: SubscriptionStatus
  reason: string
  triggeredBy: string // userId or TransitionTrigger constant
}

// ---------------------------------------------------------------------------
// LifecycleThresholds
// Policy configuration values read from BusinessConfiguration and passed into
// SubscriptionPolicy and SubscriptionEngine as a plain DTO.
// All values are in days.
// ---------------------------------------------------------------------------
export type LifecycleThresholds = {
  /** Days from subscription creation before TRIAL expires (default: 30) */
  trialDurationDays: number
  /** Days after expiry before GRACE_PERIOD ends and EXPIRED begins (default: 7) */
  gracePeriodDays: number
  /** Days after EXPIRED before LONG_TERM_INACTIVE transition (default: 90) */
  longTermInactiveDays: number
}

// ---------------------------------------------------------------------------
// Phase 2 — Usage Tracking + Monthly Billing Foundation
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// UsageCounterSnapshot
// Plain DTO representing a UsageCounter row. Assembled by the Application
// Layer (job or auth-server) and passed into UsageEngine — the engine never
// touches Prisma types directly.
// ---------------------------------------------------------------------------
export type UsageCounterSnapshot = {
  id: string
  businessId: string
  branchId: string
  billingPeriodStart: Date
  billingPeriodEnd: Date
  txCount: number
  overageTxCount: number
  isClosed: boolean
}

// ---------------------------------------------------------------------------
// InvoiceStatus
// Mirrors the Prisma InvoiceStatus enum in the domain layer.
// ---------------------------------------------------------------------------
export const InvoiceStatus = {
  DRAFT: 'DRAFT',
  OPEN: 'OPEN',
  PAID: 'PAID',
  VOID: 'VOID',
  UNCOLLECTIBLE: 'UNCOLLECTIBLE',
} as const

export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus]

// ---------------------------------------------------------------------------
// InvoiceItemType
// Mirrors the Prisma InvoiceItemType enum in the domain layer.
// ---------------------------------------------------------------------------
export const InvoiceItemType = {
  SUBSCRIPTION_FEE: 'SUBSCRIPTION_FEE',
  OVERAGE_CHARGE: 'OVERAGE_CHARGE',
  CREDIT_PURCHASE: 'CREDIT_PURCHASE',
  ADJUSTMENT: 'ADJUSTMENT',
  ONE_TIME_FEE: 'ONE_TIME_FEE',
} as const

export type InvoiceItemType = (typeof InvoiceItemType)[keyof typeof InvoiceItemType]

// ---------------------------------------------------------------------------
// InvoiceItemDTO
// Plain DTO for a single BillingInvoiceItem line — passed in/out of
// InvoiceEngine without any Prisma type dependencies.
// ---------------------------------------------------------------------------
export type InvoiceItemDTO = {
  type: InvoiceItemType
  description: string
  /** Number of units (1 for a flat fee; N for per-tx overage) */
  quantity: number
  /** Cents per unit */
  unitAmount: number
  /** quantity × unitAmount (pre-computed) */
  lineAmount: number
}

// ---------------------------------------------------------------------------
// InvoiceDTO
// Plain DTO representing a BillingInvoice record — returned by InvoiceEngine
// so the Application Layer can persist it without the engine touching Prisma.
// ---------------------------------------------------------------------------
export type InvoiceDTO = {
  businessId: string
  billingPeriodStart: Date
  billingPeriodEnd: Date
  status: InvoiceStatus
  /** Sum of all line items before tax (cents) */
  subtotalAmount: number
  /** Tax amount (cents) */
  taxAmount: number
  /** subtotalAmount + taxAmount (cents) */
  totalAmount: number
  items: InvoiceItemDTO[]
}

// ---------------------------------------------------------------------------
// OveragePolicy
// Configuration passed into InvoiceEngine — read from BusinessConfiguration by the
// Application Layer and injected as a plain object.
// ---------------------------------------------------------------------------
export type OveragePolicy = {
  /** Whether overage transactions are billed rather than blocked */
  overageBillingEnabled: boolean
  /** Cents per overage transaction (from SubscriptionPlan.overagePerTx) */
  overageRatePerTx: number
  /** VAT rate as a decimal (e.g. 0.12 for 12%). 0 = no tax applied. */
  vatRate: number
}

// ---------------------------------------------------------------------------
// Phase 3 — Prepaid Credits
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// CreditEventType
// Mirrors the Prisma CreditEventType enum in the domain layer.
// ---------------------------------------------------------------------------
export const CreditEventType = {
  PURCHASE: 'PURCHASE',
  CONSUMED: 'CONSUMED',
  REFUNDED: 'REFUNDED',
  EXPIRED: 'EXPIRED',
  ADJUSTMENT: 'ADJUSTMENT',
  PROMOTIONAL: 'PROMOTIONAL',
} as const

export type CreditEventType = (typeof CreditEventType)[keyof typeof CreditEventType]

// ---------------------------------------------------------------------------
// CreditLedgerEntryDTO
// Plain DTO for a CreditLedger row — used by the Application Layer for
// persistence and by the UI for ledger history display.
// ---------------------------------------------------------------------------
export type CreditLedgerEntryDTO = {
  id?: string
  businessId: string
  branchId: string
  eventType: CreditEventType
  /** Signed: positive = credit in, negative = credit out. */
  amount: number
  /** Running balance snapshot for this branch after this event. */
  balanceAfter: number
  transactionId: string | null
  note: string | null
  actorId: string | null
  createdAt?: Date
}

// ---------------------------------------------------------------------------
// Phase 4 — External Billing Integration
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// CreditPackage
// Represents a purchasable credit bundle displayed on the credits page.
// Configured via environment variables / configuration; not stored in the DB.
// ---------------------------------------------------------------------------
export type CreditPackage = {
  /** Internal identifier — used as metadata on the Stripe checkout session */
  id: string
  /** Human-readable label shown to the user */
  label: string
  /** Number of credits included in this package */
  creditAmount: number
  /** Display price string (e.g. "₱500") — cosmetic only; actual charge from Stripe price */
  displayPrice: string
  /** Stripe Price ID for this package (configured in Stripe Dashboard) */
  stripePriceId: string
}

// ---------------------------------------------------------------------------
// InvoiceSummaryDTO
// Lightweight DTO returned by the fetch-invoices server function.
// Used by the /billing/invoices route; avoids returning full Prisma objects.
// ---------------------------------------------------------------------------
export type InvoiceSummaryDTO = {
  id: string
  billingPeriodStart: Date
  billingPeriodEnd: Date
  status: InvoiceStatus
  subtotalAmount: number
  taxAmount: number
  totalAmount: number
  dueAt: Date | null
  paidAt: Date | null
  /** Stripe-hosted invoice URL (null until externalInvoiceId is populated) */
  hostedInvoiceUrl: string | null
  /** Stripe invoice PDF URL */
  pdfUrl: string | null
  externalInvoiceId: string | null
}

// ---------------------------------------------------------------------------
// WebhookProcessingResult
// Returned by the webhook handler after processing a single event.
// Used for logging and idempotency tracking.
// ---------------------------------------------------------------------------
export const WebhookOutcome = {
  PROCESSED: 'processed',
  SKIPPED: 'skipped', // event type not handled or already processed
  ERROR: 'error',
} as const

export type WebhookOutcome = (typeof WebhookOutcome)[keyof typeof WebhookOutcome]

export type WebhookProcessingResult = {
  eventId: string
  eventType: string
  outcome: WebhookOutcome
  message?: string
}
