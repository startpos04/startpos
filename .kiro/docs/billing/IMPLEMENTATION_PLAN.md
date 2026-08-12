# Implementation Plan

## Overview

This plan sequences every concrete development task required to add Xendit as a billing provider. Tasks are grouped into phases. Each phase is independently shippable and leaves the system in a working state. No phase breaks existing Stripe functionality.

**Prerequisite:** All planning documents in `docs/billing/` must be reviewed before implementation begins. Implementation should not start until the Xendit sandbox API key and webhook token are available.

**Testing rule:** Pattern A (pure unit) tests are written alongside the code. Pattern B/C tests follow manual validation of the feature in the running app (see testing-patterns rule).

---

## Phase 0 — Refactoring (No New Features, Stripe Stays Green)

These tasks eliminate the existing Stripe hardcoding. They are purely internal refactors — no behaviour changes, no new env vars needed, all existing tests must still pass after each task.

### Task 0.1 — Rename `CreditPackage.stripePriceId` → `providerPriceId`

**File:** `src/lib/billing/types.ts`

Rename the `stripePriceId` field on the `CreditPackage` type to `providerPriceId`.

**Files to update:**
- `src/lib/billing/types.ts` — rename the field
- `src/lib/queries/purchase-credit-package.ts` — update all references from `.stripePriceId` to `.providerPriceId`

**Verification:** `pnpm build` passes with no type errors. Existing Stripe credit purchase flow works identically.

---

### Task 0.2 — Create the Adapter Factory

**File:** `src/lib/billing/adapters/index.ts` (new file)

Create `createBillingAdapter()` and `getBillingProviderName()`. Export `BillingProviderName` type.

```ts
// src/lib/billing/adapters/index.ts
import type { BillingProviderAdapter } from '../billing-provider'
import { createStripeAdapter } from './stripe-adapter'

export type BillingProviderName = 'stripe' | 'xendit'

export function getBillingProviderName(): BillingProviderName {
  const name = process.env['BILLING_PROVIDER'] ?? 'stripe'
  if (name !== 'stripe' && name !== 'xendit') {
    throw new Error(`[billing] Unknown BILLING_PROVIDER: "${name}". Must be "stripe" or "xendit".`)
  }
  return name
}

export function createBillingAdapter(): BillingProviderAdapter {
  const provider = getBillingProviderName()
  // XenditAdapter imported dynamically once Task 1.1 is complete.
  // For now, always returns Stripe — behaviour is identical to before.
  if (provider === 'xendit') {
    throw new Error('[billing] Xendit adapter not yet implemented. Set BILLING_PROVIDER=stripe.')
  }
  return createStripeAdapter()
}
```

**Verification:** `pnpm build` passes. Factory returns Stripe adapter when `BILLING_PROVIDER` is unset.

---

### Task 0.3 — Switch Server Functions to `createBillingAdapter()`

**Files:**
- `src/lib/queries/create-subscription.ts`
- `src/lib/queries/cancel-subscription.ts`
- `src/lib/queries/purchase-credit-package.ts`

Replace each `createStripeAdapter()` call with `createBillingAdapter()` from `@/lib/billing/adapters`. Remove direct imports of `createStripeAdapter` from these files.

Also update `purchase-credit-package.ts` to use `providerPriceId` instead of `stripePriceId` on the `CreditPackage` object (follows from Task 0.1), and rename the env var resolution function from `buildCreditPackages()` to use `XENDIT_CREDIT_PKG_*_ID` when `BILLING_PROVIDER=xendit` (details in Task 1.5).

For now, the env var logic stays Stripe-only. The function signature changes but the runtime path is identical.

**Verification:** `pnpm build` passes. Stripe subscription creation, cancellation, and credit purchase all work identically.

---

### Task 0.4 — Extract Shared Webhook Handler Functions

**Files:**
- `src/routes/api/billing/webhook/-shared/handlers.ts` (new)
- `src/routes/api/billing/webhook/index.ts` (existing — becomes the Stripe route after Task 0.5)

Move the five handler functions (`handleInvoicePaid`, `handleInvoicePaymentFailed`, `handleSubscriptionDeleted`, `handleSubscriptionUpdated`, `handleCheckoutSessionCompleted`) out of `webhook/index.ts` into `webhook/-shared/handlers.ts`.

Export each function. `webhook/index.ts` imports them from `-shared/handlers.ts`. Behaviour is identical — this is a pure file reorganisation.

**Verification:** `pnpm build` passes. Existing Stripe webhook tests (if any) pass. Manual test: trigger a Stripe test webhook locally and confirm it is handled correctly.

---

### Task 0.5 — Create the Stripe Webhook Subroute

**Files:**
- `src/routes/api/billing/webhook/stripe/index.ts` (new — copy of current webhook/index.ts after Task 0.4 cleanup)
- `src/routes/api/billing/webhook/index.ts` (to be deleted or repurposed as a redirect)

Move the Stripe-specific route logic to `/webhook/stripe/index.ts`. The route imports handlers from `-shared/handlers.ts`. Update the Stripe dashboard webhook URL to `/api/billing/webhook/stripe`.

If the old `/api/billing/webhook` URL needs to remain active during transition (to avoid updating Stripe dashboard immediately), keep the old file as a passthrough to the new route.

**Verification:** `pnpm build` passes. Stripe webhooks received at the new URL are processed correctly. Update Stripe test dashboard endpoint URL.

---

## Phase 1 — Schema Migration

Add the new database tables and columns required for Xendit and for improved webhook infrastructure. This phase has no application code changes — only schema and migration.

### Task 1.1 — Add `WebhookEvent` Table

**File:** `prisma/schema.prisma`

Add the `WebhookEvent` model as specified in `XENDIT_ARCHITECTURE.md §7.1`.

```prisma
model WebhookEvent {
  id           String    @id @default(cuid())
  provider     String
  externalId   String
  eventType    String
  status       String    @default("RECEIVED")
  rawPayload   Json
  errorMessage String?
  processedAt  DateTime?
  businessId   String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([provider, externalId])
  @@index([provider, status])
  @@index([createdAt])
  @@map("webhook_events")
}
```

Run: `pnpm prisma migrate dev --name add-webhook-event-table`

**Verification:** Migration applies cleanly. `pnpm prisma studio` shows the new table.

---

### Task 1.2 — Add `PaymentAttempt` Table

**File:** `prisma/schema.prisma`

Add the `PaymentAttempt` model as specified in `XENDIT_ARCHITECTURE.md §7.2`.

Add the `BillingInvoice` relation on `PaymentAttempt` and the reverse relation on `BillingInvoice`:

```prisma
// On BillingInvoice, add:
paymentAttempts PaymentAttempt[]
```

Run: `pnpm prisma migrate dev --name add-payment-attempt-table`

**Verification:** Migration applies cleanly. FK to `billing_invoices` resolves correctly.

---

### Task 1.3 — Add `providerName` to `BillingInvoice`

**File:** `prisma/schema.prisma`

```prisma
model BillingInvoice {
  // ... existing fields ...
  providerName String? // "stripe" | "xendit"
}
```

Run: `pnpm prisma migrate dev --name add-billing-invoice-provider-name`

---

### Task 1.4 — Add `externalCustomerId` and `billingProvider` to `Business`

**File:** `prisma/schema.prisma`

```prisma
model Business {
  // ... existing fields ...
  externalCustomerId String? // Stripe: cus_xxx; Xendit: businessId (reference_id)
  billingProvider    String? // "stripe" | "xendit" — set at subscription creation
}
```

Run: `pnpm prisma migrate dev --name add-business-billing-provider-fields`

**Verification after all Phase 1 tasks:** `pnpm prisma migrate deploy` (production migration dry-run) succeeds. Regenerate Prisma client: `pnpm prisma generate`. `pnpm build` passes.

---

## Phase 2 — Xendit Adapter

### Task 2.1 — Install the Xendit SDK

```bash
pnpm add xendit-node
```

Pin the exact version installed. Verify `xendit-node` is a legitimate package (it is — published by Xendit at https://www.npmjs.com/package/xendit-node).

**Verification:** `pnpm build` passes. No type errors from the package.

---

### Task 2.2 — Write `xendit-adapter.ts`

**File:** `src/lib/billing/adapters/xendit-adapter.ts`

Implement `BillingProviderAdapter` in full. Use `src/lib/billing/adapters/stripe-adapter.ts` as the structural template.

**Methods to implement:**

`createCustomer(params)` — returns `{ externalCustomerId: params.businessId }` immediately. No API call.

`createSubscription(params)` — creates a Xendit Payment Link for the first payment (first charge flow). Returns `checkoutUrl`. Stores Xendit `reference_id = params.metadata.businessId`. After successful first payment the recurring plan is created by the webhook handler, not here.

`cancelSubscription(params)` — calls `PATCH /recurring/plans/{id}` with `{ status: 'INACTIVE' }`. For non-immediate cancellation, sets a local sentinel value and returns immediately (lifecycle job handles the actual transition at period end).

`createCreditPurchaseLink(params)` — creates a Xendit Payment Link with `reference_id` and `metadata` carrying `source: 'credit_purchase'`, `businessId`, `packageId`, `creditAmount`.

`getInvoice(externalInvoiceId)` — calls `GET /v2/invoices/{id}`. Maps Xendit invoice status to `ProviderInvoice.status`.

`verifyWebhookSignature(params)` — compares `params.signature` to `params.secret` (string equality). On match, parses `params.rawBody` and calls `normaliseXenditEvent()`.

`normaliseXenditEvent(payload)` (private) — maps Xendit event shapes to `WebhookEvent` DTO. Implements the mapping table from `WEBHOOK_ARCHITECTURE.md §12`.

**Factory functions:**

```ts
export function createXenditAdapter(): BillingProviderAdapter
export function getXenditWebhookToken(): string
```

**Verification:** `pnpm build` passes with no type errors. The class satisfies `BillingProviderAdapter` interface completely (TypeScript enforces this).

---

### Task 2.3 — Unit Tests for `xendit-adapter.ts`

**File:** `__tests__/unit/lib/billing/adapters/xendit-adapter.test.ts`

Pattern A tests (pure unit — no DB, no HTTP):

- `verifyWebhookSignature` throws on wrong token
- `verifyWebhookSignature` throws on missing token
- `normaliseXenditEvent` maps `payment.succeeded` (no source metadata) → `invoice.paid`
- `normaliseXenditEvent` maps `payment.succeeded` (source=credit_purchase metadata) → `checkout.session.completed`
- `normaliseXenditEvent` maps `payment.failure` → `invoice.payment_failed`  ← **not** `payment.failed`
- `normaliseXenditEvent` maps `recurring.cycle.succeeded` → `customer.subscription.updated`  ← **not** `recurring.payment.created`
- `normaliseXenditEvent` maps `recurring.plan.inactivated` → `customer.subscription.deleted`
- `normaliseXenditEvent` maps `payment_session.expired` → SKIPPED outcome
- ISO timestamp strings are correctly parsed to `Date` objects
- `createCustomer` returns `businessId` as `externalCustomerId` without making API calls (Phase 1 / Option B behaviour)

Run: `pnpm test` — all tests pass before proceeding.

---

### Task 2.4 — Wire Xendit Adapter into the Factory

**File:** `src/lib/billing/adapters/index.ts`

Replace the `throw` placeholder from Task 0.2 with a real `createXenditAdapter()` call:

```ts
import { createXenditAdapter } from './xendit-adapter'

export function createBillingAdapter(): BillingProviderAdapter {
  const provider = getBillingProviderName()
  if (provider === 'xendit') return createXenditAdapter()
  return createStripeAdapter()
}
```

**Verification:** Setting `BILLING_PROVIDER=xendit` in `.env.local` and calling `createBillingAdapter()` returns a `XenditAdapter` instance without throwing.

---

## Phase 3 — Webhook Infrastructure Upgrade

### Task 3.1 — Upgrade the Stripe Webhook Route with Idempotency Gate

**File:** `src/routes/api/billing/webhook/stripe/index.ts`

Add the `WebhookEvent` idempotency gate to the existing Stripe webhook route. The gate logic (INSERT → check for PROCESSED/ERROR → dispatch → UPDATE) is described in `WEBHOOK_ARCHITECTURE.md §4.4` and `§7.1`.

This upgrade does not change any handler function. It wraps the existing dispatch block with:
1. `rootPrisma.webhookEvent.create(...)` before dispatch
2. Check for unique constraint violation — PROCESSED = skip, ERROR = reset and retry
3. `rootPrisma.webhookEvent.update(status = PROCESSED | ERROR)` after dispatch

Also write `Business.externalCustomerId` and `Business.billingProvider = 'stripe'` in the `handleInvoicePaid` handler when the subscription transitions to ACTIVE (first activation).

**Verification:** Manually trigger a Stripe test webhook. Confirm `WebhookEvent` row is created with `status = PROCESSED`. Trigger the same event again — confirm the route returns 200 and the existing row is not duplicated.

---

### Task 3.2 — Add `PaymentAttempt` Writes to Shared Handlers

**File:** `src/routes/api/billing/webhook/-shared/handlers.ts`

Add `PaymentAttempt` INSERT to each relevant handler:

- `handleInvoicePaid` → INSERT `PaymentAttempt(status=SUCCEEDED, amountCents, provider)`
- `handleInvoicePaymentFailed` → INSERT `PaymentAttempt(status=FAILED, failureCode, failureMessage, provider)`
- `handleCheckoutSessionCompleted` → INSERT `PaymentAttempt(status=SUCCEEDED, amountCents=amountTotal, provider)`

The `provider` field comes from the route layer and must be threaded through from the route into the handler call. Update handler signatures to accept a `provider: string` parameter.

**Verification:** After processing a test Stripe webhook, `PaymentAttempt` row appears with correct status and amount.

---

### Task 3.3 — Create the Xendit Webhook Route

**File:** `src/routes/api/billing/webhook/xendit/index.ts`

Implement the Xendit webhook route following the structure of the Stripe route, with two differences:
- Read `x-callback-token` header instead of `stripe-signature`
- Call `createXenditAdapter()` instead of `createStripeAdapter()`

The idempotency gate, dispatch block, and `WebhookEvent` status updates are identical to the Stripe route. Import handler functions from `-shared/handlers.ts`.

**Verification:** `pnpm build` passes. The route exists at `/api/billing/webhook/xendit`. Test by sending a POST with correct token — route returns 200 and creates a `WebhookEvent` row.

---

### Task 3.4 — Update `.env.example`

**File:** `.env.example`

Add the Xendit section after the Stripe section. Use the corrected env var schema (amounts, not plan IDs):

```bash
# --- Billing Provider Selection ---
# "stripe" or "xendit". Defaults to "stripe" if unset.
BILLING_PROVIDER=

# --- Xendit (Phase — Billing & Subscriptions) ---
# Required when BILLING_PROVIDER=xendit.
XENDIT_SECRET_KEY=
XENDIT_WEBHOOK_TOKEN=

# Plan amounts in PHP cents (e.g. 49900 = ₱499)
# No plan template IDs — Xendit plans are created dynamically per customer.
XENDIT_PLAN_STARTER_AMOUNT=
XENDIT_PLAN_GROWTH_AMOUNT=
XENDIT_PLAN_PREMIUM_AMOUNT=
XENDIT_PLAN_CURRENCY=PHP

# Credit package amounts in PHP cents
XENDIT_CREDIT_PKG_10_AMOUNT=5000
XENDIT_CREDIT_PKG_50_AMOUNT=22000
XENDIT_CREDIT_PKG_100_AMOUNT=40000

# Payment session expiry in hours (default: 24)
XENDIT_SESSION_EXPIRY_HOURS=24
```

---

## Phase 4 — Xendit Subscription Flow

> **Post-validation revision:** Phase 4 implements **Option B (monthly payment link per cycle)**. The original Phase 4 included a two-step recurring plan activation via webhook (Task 4.3). That step is removed — no recurring plan is created in Phase 1. See `ARCHITECTURE_VALIDATION_REPORT.md §4` and `ASSUMPTIONS_AND_RISKS.md §5` for the full rationale.

### Task 4.1 — Update `purchase-credit-package.ts` for Xendit

**File:** `src/lib/queries/purchase-credit-package.ts`

Update `buildCreditPackages()` to read `XENDIT_CREDIT_PKG_*_AMOUNT` (not `_ID`) when `BILLING_PROVIDER=xendit`. The adapter call is `createCreditPurchaseLink()` with the amount passed directly — no provider-side product ID needed.

```ts
function buildCreditPackages(): CreditPackage[] {
  const provider = getBillingProviderName()

  if (provider === 'xendit') {
    return [
      {
        id: 'credits_10',
        label: '10 Credits',
        creditAmount: 10,
        displayPrice: '₱50',
        providerPriceId: process.env['XENDIT_CREDIT_PKG_10_AMOUNT'] ?? '',
      },
      // 50, 100 packages follow the same pattern
    ]
  }

  // Stripe path (unchanged)
  return [
    { id: 'credits_10', ..., providerPriceId: process.env['STRIPE_CREDIT_PKG_10_PRICE_ID'] ?? '' },
    // ...
  ]
}
```

In `XenditAdapter.createCreditPurchaseLink()`, `providerPriceId` contains the amount in cents — use it as the Payment Session `amount` field, not as a provider product ID.

**Verification:** Setting `BILLING_PROVIDER=xendit` and calling `purchaseCreditPackage({ packageId: 'credits_10' })` calls `XenditAdapter.createCreditPurchaseLink()` which creates a `POST /sessions` with `amount = 5000`.

---

### Task 4.2 — Update `create-subscription.ts` for Xendit

**File:** `src/lib/queries/create-subscription.ts`

Update plan amount resolution for the Xendit path. The adapter creates a Payment Session using the plan amount — no provider plan ID:

```ts
function getProviderPlanConfig(planName: string): { amount: number; currency: string } | null {
  const provider = getBillingProviderName()
  if (provider !== 'xendit') return null   // Stripe uses price IDs, handled separately

  const normalised = planName.toLowerCase().replace(/\s+/g, '_')
  const amountStr = process.env[`XENDIT_PLAN_${normalised.toUpperCase()}_AMOUNT`]
  const currency = process.env['XENDIT_PLAN_CURRENCY'] ?? 'PHP'
  if (!amountStr) return null
  return { amount: Number(amountStr), currency }
}
```

The `createSubscription()` adapter call passes `amount` and `currency` instead of `externalPriceId`.

> This requires a small addition to the `BillingProviderAdapter.createSubscription()` signature — add optional `amount?: number` and `currency?: string` params. The Stripe adapter ignores these (uses `externalPriceId` from `STRIPE_PLAN_*_PRICE_ID`). The Xendit adapter uses them to set the Payment Session amount.

Also write `Business.externalCustomerId` and `Business.billingProvider` after `adapter.createCustomer()` succeeds:

```ts
await rootPrisma.business.update({
  where: { id: businessId },
  data: {
    externalCustomerId: customer.externalCustomerId,
    billingProvider: getBillingProviderName(),
  },
})
```

**Verification:** With `BILLING_PROVIDER=xendit` and sandbox keys set, calling `createSubscription({ planId })` returns a Xendit Payment Session URL (`payment_link_url`).

---

### Task 4.3 — Handle `payment_session.expired` webhook

**File:** `src/routes/api/billing/webhook/-shared/handlers.ts`

Add a `handlePaymentSessionExpired` function that logs the expiry to `WebhookEvent` and returns SKIPPED. No subscription state change — the lifecycle job handles TRIAL/GRACE_PERIOD expiry through its normal daily evaluation.

Add `payment_session.expired` to the Xendit webhook route's dispatch switch. This prevents unknown-event warnings and ensures expiry events are logged.

---

### Task 4.4 — End-to-End Sandbox Validation

Follow the sandbox testing procedures in `XENDIT_INTEGRATION_PLAN.md §7` for all five scenarios. Note the updated test procedures:

- [ ] Successful subscription (TRIAL → ACTIVE) — use cards or Maya, **not GCash** for recurring test
- [ ] Failed payment (ACTIVE → GRACE_PERIOD) — use Xendit callback simulator with `payment.failure` event
- [ ] Payment recovery (GRACE_PERIOD → ACTIVE) — simulate `payment.succeeded`
- [ ] Credit package purchase (CreditLedger PURCHASE entry) — GCash is valid here (one-time)
- [ ] Duplicate webhook (idempotency gate, second delivery skipped)
- [ ] Payment session expiry (send `payment_session.expired` — confirm SKIPPED, no state change)

Record the results. Do not proceed to Phase 5 until all six scenarios pass.

---

## Phase 5 — Tests

Manual validation from Phase 4 satisfies the pre-test protocol for C1/C2 tests. Write all tests after Phase 4 sandbox validation is complete.

### Task 5.1 — Pattern A: Xendit Adapter Unit Tests

Already partially specified in Task 2.3. Ensure all normalisation paths are covered.

**File:** `__tests__/unit/lib/billing/adapters/xendit-adapter.test.ts`

Additional test cases beyond Task 2.3:
- `getXenditWebhookToken()` throws when `XENDIT_WEBHOOK_TOKEN` is missing
- `createXenditAdapter()` throws when `XENDIT_SECRET_KEY` is missing
- `normaliseXenditEvent()` preserves `externalSubscriptionId` from `reference_id`
- `normaliseXenditEvent()` correctly handles `payment.failure` (not `payment.failed`) — ensure no test uses the wrong name
- `normaliseXenditEvent()` correctly handles `recurring.cycle.succeeded` (not `recurring.payment.created`)

---

### Task 5.2 — Pattern A: Adapter Factory Unit Tests

**File:** `__tests__/unit/lib/billing/adapters/adapter-factory.test.ts`

- `getBillingProviderName()` returns `'stripe'` when env var is unset
- `getBillingProviderName()` returns `'xendit'` when `BILLING_PROVIDER=xendit`
- `getBillingProviderName()` throws on unknown value
- `createBillingAdapter()` returns a StripeAdapter when `BILLING_PROVIDER=stripe`
- `createBillingAdapter()` returns a XenditAdapter when `BILLING_PROVIDER=xendit`

---

### Task 5.3 — Pattern B: Webhook Handler Tests

**File:** `__tests__/unit/lib/billing/webhook/handlers.test.ts`

Full set specified in `WEBHOOK_ARCHITECTURE.md §11.2`. Includes idempotency tests from `§11.3`.

Priority tests (must have):
- `handleInvoicePaid` transitions GRACE_PERIOD → ACTIVE
- `handleInvoicePaid` is skipped when invoice already PAID
- `handleInvoicePaymentFailed` transitions ACTIVE → GRACE_PERIOD
- `handleInvoicePaymentFailed` is skipped when subscription not ACTIVE
- `handleSubscriptionDeleted` transitions to CANCELLED
- `handleSubscriptionDeleted` is skipped when already CANCELLED
- `handleCheckoutSessionCompleted` inserts CreditLedger PURCHASE entry
- `handleCheckoutSessionCompleted` is skipped when `paymentStatus !== 'paid'`

---

### Task 5.4 — Pattern C2: Xendit Payment Journey

**File:** `__tests__/integration/billing/xendit-payment-journey.integration.test.ts`

Full end-to-end orchestration test simulating the Xendit payment lifecycle with mocked Prisma (Pattern C2 — Option B flow).

Priority scenarios (must have):
- First payment: TRIAL → ACTIVE via `payment.succeeded` (subscription, no source metadata)
- Renewal: ACTIVE stays ACTIVE, period dates advance — triggered by `payment.succeeded`
- Failure: ACTIVE → GRACE_PERIOD via `payment.failure` ← **not** `payment.failed`
- Recovery: GRACE_PERIOD → ACTIVE via `payment.succeeded`
- Cancellation: `recurring.plan.inactivated` → CANCELLED (Phase 2 path — verify handler works)
- Credit purchase: `payment.succeeded` with `source: credit_purchase` metadata → CreditLedger row
- Payment session expiry: `payment_session.expired` → SKIPPED, no subscription state change

---

### Task 5.5 — Pattern C2: Webhook Idempotency Journey

**File:** `__tests__/integration/billing/webhook-idempotency.integration.test.ts`

Tests the full idempotency gate path:
- Duplicate delivery of `payment.succeeded` — second call returns SKIPPED, no duplicate DB writes
- `ERROR` status row is retried on next delivery (reset path)
- `RECEIVED` status row on in-flight second delivery returns 200 immediately

---

## Phase 6 — Production Readiness

### Task 6.1 — Production Environment Variables

Set the following in the production deployment secrets (not in committed files):

```
BILLING_PROVIDER=xendit
XENDIT_SECRET_KEY=xnd_production_XXXXXXXXXXXXXXXX
XENDIT_WEBHOOK_TOKEN=<cryptographically random string, min 32 chars>

XENDIT_PLAN_STARTER_AMOUNT=<plan amount in PHP cents>
XENDIT_PLAN_GROWTH_AMOUNT=<plan amount in PHP cents>
XENDIT_PLAN_PREMIUM_AMOUNT=<plan amount in PHP cents>
XENDIT_PLAN_CURRENCY=PHP

XENDIT_CREDIT_PKG_10_AMOUNT=5000
XENDIT_CREDIT_PKG_50_AMOUNT=22000
XENDIT_CREDIT_PKG_100_AMOUNT=40000

XENDIT_SESSION_EXPIRY_HOURS=24
```

---

### Task 6.2 — Xendit Dashboard Production Configuration

Follow the Xendit dashboard setup checklist in `XENDIT_INTEGRATION_PLAN.md §6.3`:
- [ ] Production API key generated
- [ ] Callback token configured
- [ ] Callback URL set: `https://app.startpos.ph/api/billing/webhook/xendit`
- [ ] All required event types enabled: `payment.succeeded`, `payment.failure`, `payment_session.expired`
- [ ] For Phase 2 (Option A) only: `recurring.cycle.succeeded`, `recurring.plan.inactivated`, `recurring.cycle.failed`, `recurring.cycle.retrying`
- [ ] Auto-debit activation requested for desired channels (Phase 2 prerequisite — cards, Maya)

---

### Task 6.3 — Database Migration on Production

```bash
pnpm prisma migrate deploy
```

This applies all Phase 1 migrations (Tasks 1.1–1.4) to the production database. All migrations are additive (new tables, new nullable columns) — no destructive changes, no data loss risk. The existing application continues running during migration.

---

### Task 6.4 — Update Stripe Dashboard Webhook URL

Update the Stripe dashboard webhook endpoint URL from `/api/billing/webhook` to `/api/billing/webhook/stripe`. The old URL can be kept active temporarily (if still present as a passthrough from Task 0.5) to ensure no events are lost during the transition window.

---

### Task 6.5 — Smoke Test in Production

After deployment, verify end-to-end in production:
1. Create a test business in production (or use a staging environment)
2. Complete a Xendit sandbox payment using the production app URL
3. Confirm `BusinessSubscription.status = ACTIVE` in the production DB
4. Confirm `WebhookEvent` row with `status = PROCESSED`
5. Confirm `PaymentAttempt` row with `status = SUCCEEDED`

---

## Summary: File Change Registry

Every file touched during this implementation, with the phase that introduces the change.

| File | Change type | Phase |
|---|---|---|
| `src/lib/billing/types.ts` | Rename `stripePriceId` → `providerPriceId` | 0.1 |
| `src/lib/billing/adapters/index.ts` | New file — adapter factory | 0.2 |
| `src/lib/queries/create-subscription.ts` | Switch to `createBillingAdapter()`, add Business update | 0.3, 4.2 |
| `src/lib/queries/cancel-subscription.ts` | Switch to `createBillingAdapter()` | 0.3 |
| `src/lib/queries/purchase-credit-package.ts` | Switch adapter, rename field, multi-provider env vars | 0.3, 4.1 |
| `src/routes/api/billing/webhook/-shared/handlers.ts` | New file — extracted handler functions, PaymentAttempt writes | 0.4, 3.2, 4.3 |
| `src/routes/api/billing/webhook/stripe/index.ts` | New file (from old webhook/index.ts) + idempotency gate | 0.5, 3.1 |
| `src/routes/api/billing/webhook/xendit/index.ts` | New file — Xendit webhook route | 3.3 |
| `src/routes/api/billing/webhook/index.ts` | Delete or repurpose as redirect | 0.5 |
| `src/lib/billing/adapters/xendit-adapter.ts` | New file — Xendit adapter implementation | 2.2 |
| `prisma/schema.prisma` | Add WebhookEvent, PaymentAttempt, Business fields, BillingInvoice field | 1.1–1.4 |
| `.env.example` | Add Xendit and BILLING_PROVIDER vars | 3.4 |
| `__tests__/unit/lib/billing/adapters/xendit-adapter.test.ts` | New test file | 2.3, 5.1 |
| `__tests__/unit/lib/billing/adapters/adapter-factory.test.ts` | New test file | 5.2 |
| `__tests__/unit/lib/billing/webhook/handlers.test.ts` | New test file | 5.3 |
| `__tests__/integration/billing/xendit-payment-journey.integration.test.ts` | New test file | 5.4 |
| `__tests__/integration/billing/webhook-idempotency.integration.test.ts` | New test file | 5.5 |

**Files with zero changes** (confirmed during architecture review):
- `src/lib/billing/billing-provider.ts` — interface is complete and provider-agnostic
- `src/lib/billing/subscription-engine.ts` — pure domain engine
- `src/lib/billing/invoice-engine.ts` — pure domain engine
- `src/lib/billing/credit-engine.ts` — pure domain engine
- `src/lib/billing/usage-engine.ts` — pure domain engine
- `src/lib/jobs/billing-invoice-generation.ts` — adapter already injected
- `src/lib/jobs/subscription-lifecycle.ts` — no provider calls
- `src/lib/better-auth/auth-server.ts` — reads DB only
- `src/lib/billing/adapters/stripe-adapter.ts` — untouched; Stripe keeps working

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Xendit sandbox behaves differently from production | Medium | High | Test all sandbox scenarios before going live; keep Stripe active as fallback |
| Webhook token rotation causes missed events | Low | Medium | Rotate token during low-traffic window; Xendit retries failed deliveries |
| `payment.succeeded` disambiguation (credit vs subscription) fails | Low | High | Unit test covers both metadata paths; integration test covers credit flow end-to-end |
| Phase 1 migrations lock tables | Low | Low | All migrations are additive (new tables/nullable columns); no lock escalation |
| Cancel-at-period-end lifecycle job misses transition date | Low | Low | Job runs daily; max delay is 24 hours; subscription remains functional |
| Concurrent webhook deliveries cause duplicate `PaymentAttempt` rows | Low | Low | Idempotency gate on `WebhookEvent` prevents duplicate processing |
| `BILLING_PROVIDER` misconfiguration in production | Medium | High | Factory throws loudly with a clear error message; caught immediately on first billing action |

---

## Phase Completion Checklist

### Phase 0
- [ ] `pnpm build` passes after each task
- [ ] Stripe subscription creation, cancellation, credit purchase work identically to before
- [ ] No `createStripeAdapter()` imports remain outside `adapters/` directory

### Phase 1
- [ ] All four migrations apply cleanly on a fresh DB
- [ ] `pnpm prisma generate` succeeds
- [ ] `pnpm build` passes with new Prisma client

### Phase 2
- [ ] All Phase A unit tests pass (`pnpm test`)
- [ ] TypeScript confirms `XenditAdapter` satisfies `BillingProviderAdapter` interface

### Phase 3
- [ ] `WebhookEvent` rows created for both Stripe and Xendit test events
- [ ] Duplicate Stripe webhook delivery returns 200 with no duplicate processing
- [ ] `PaymentAttempt` rows written for test events

### Phase 4
- [ ] All five sandbox scenarios from `XENDIT_INTEGRATION_PLAN.md §7` pass
- [ ] Xendit Payment Link URL returned to client on plan selection
- [ ] Subscription activates after Xendit sandbox payment confirmation

### Phase 5
- [ ] `pnpm test` passes with all new unit tests
- [ ] Integration tests pass with `pnpm test:integration`

### Phase 6
- [ ] Production migration applied cleanly
- [ ] Production smoke test passes
- [ ] Xendit dashboard shows received and processed webhook events
