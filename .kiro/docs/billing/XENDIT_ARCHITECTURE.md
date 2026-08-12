# Xendit Integration Architecture

## 1. Purpose

This document describes the complete technical architecture for integrating Xendit as a Philippine billing provider into the StartPOS SaaS platform. It is the primary reference for implementation decisions and serves as the authoritative design record for all Xendit-related code.

Xendit handles SaaS subscriptions and invoice payments only. It is never used inside the POS checkout flow.

---

## 2. Current Architecture — What Already Exists

### 2.1 Provider Abstraction Layer

The codebase already has a well-structured provider abstraction in `src/lib/billing/billing-provider.ts`. The `BillingProviderAdapter` interface defines six methods:

```
createCustomer(params)          → CreateCustomerResult
createSubscription(params)      → CreateSubscriptionResult
cancelSubscription(params)      → CancelSubscriptionResult
createCreditPurchaseLink(params) → CreatePaymentLinkResult
getInvoice(externalInvoiceId)   → ProviderInvoice
verifyWebhookSignature(params)  → WebhookEvent
```

The interface is already provider-agnostic. `WebhookEvent` is a normalised DTO — the webhook handler never touches provider SDK types directly. This is the correct foundation for multi-provider support.

### 2.2 Stripe Adapter

`src/lib/billing/adapters/stripe-adapter.ts` is the only Stripe-coupled file. It:

- Is the sole importer of the `stripe` npm package
- Implements `BillingProviderAdapter` fully
- Exposes two factory functions: `createStripeAdapter()` and `getStripeWebhookSecret()`
- Normalises Stripe events to `WebhookEvent` in `normaliseStripeEvent()`

The Xendit adapter follows this exact pattern.

### 2.3 Domain Engines

All five billing engines are pure functions with no infrastructure dependencies. None require changes for Xendit:

| Engine | Responsibility |
|---|---|
| `SubscriptionEngine` | State machine transitions, lifecycle evaluation |
| `InvoiceEngine` | Invoice assembly from usage counters and plan config |
| `CreditEngine` | Credit ledger deduction, granting, balance reads |
| `UsageEngine` | Transaction count tracking, overage computation |
| `PlanEngine` | Plan entitlement resolution |

### 2.4 Webhook Handler

`src/routes/api/billing/webhook/index.ts` handles all five event types and routes them to handler functions. The handler functions operate exclusively on `WebhookEvent` (the normalised DTO). The only Stripe-specific code is in the signature verification step at the top of the POST handler.

### 2.5 Background Jobs

Both background jobs are provider-agnostic and require no changes:

- `billing-invoice-generation.ts` — accepts `BillingProviderAdapter | null` via injection
- `subscription-lifecycle.ts` — pure DB + engine work; no provider calls at all

---

## 3. What Needs to Change

### 3.1 Hardcoded Adapter Instantiation

Three server functions call `createStripeAdapter()` directly:

| File | Coupling |
|---|---|
| `src/lib/queries/create-subscription.ts` | `createStripeAdapter()`, `STRIPE_PLAN_*_PRICE_ID` env vars |
| `src/lib/queries/cancel-subscription.ts` | `createStripeAdapter()` |
| `src/lib/queries/purchase-credit-package.ts` | `createStripeAdapter()`, `STRIPE_CREDIT_PKG_*_PRICE_ID` env vars, `CreditPackage.stripePriceId` field name |

The webhook route also instantiates `createStripeAdapter()` and calls `getStripeWebhookSecret()` directly.

**Fix:** Introduce a `createBillingAdapter()` factory in `src/lib/billing/adapters/index.ts` that reads `BILLING_PROVIDER` from the environment and returns the appropriate adapter. All four callers switch to this factory.

### 3.2 CreditPackage Type

`CreditPackage` in `src/lib/billing/types.ts` has a `stripePriceId` field. This leaks a provider name into a shared domain type.

**Fix:** Rename `stripePriceId` to `providerPriceId`. Update `purchase-credit-package.ts` accordingly.

### 3.3 Missing Schema Tables

Two tables are missing that are needed for robust Xendit integration:

**`WebhookEvent`** — idempotency and audit log for all incoming webhook events from all providers.

**`PaymentAttempt`** — tracks individual payment attempts with outcome, failure code, and retry count. Needed because Xendit sends explicit `payment.failed` events and supports manual retries via their dashboard.

### 3.4 Missing `providerName` on `BillingInvoice`

`BillingInvoice.externalInvoiceId` is a bare string. Once both Stripe and Xendit are live, querying or reconciling invoices requires knowing which provider issued the external ID.

**Fix:** Add `providerName String?` to `BillingInvoice`.

### 3.5 Missing `externalCustomerId` on `Business`

`BusinessSubscription.externalId` stores the provider subscription ID. The Stripe customer ID is passed around in-memory during subscription creation but never persisted to the `Business` row. For Xendit, the customer reference is reused across subscription renewals and payment link creation — it must be stored.

**Fix:** Add `externalCustomerId String?` to the `Business` model.

### 3.6 Webhook Route Multi-Provider Routing

The single `/api/billing/webhook` route currently expects only Stripe. With two providers, each sends webhooks to a different path with a different signature scheme.

**Fix:** Create two routes:
- `/api/billing/webhook/stripe` — existing handler, minimal changes
- `/api/billing/webhook/xendit` — new handler using Xendit token verification

Both routes share the same event handler functions (`handleInvoicePaid`, etc.) since those operate on the normalised `WebhookEvent` DTO.

---

## 4. Xendit Adapter Design

### 4.1 File Location

```
src/lib/billing/adapters/xendit-adapter.ts
```

This is the only file that may import from the `xendit-node` package (or make direct Xendit HTTP calls if the SDK is not used).

### 4.2 Xendit API Concepts → Adapter Methods

> **Note (post-validation):** The API mappings below reflect the current Xendit stack. The legacy `/v2/invoices` and `/payment-links` endpoints are superseded by the Payment Sessions API (`POST /sessions`). See `ARCHITECTURE_VALIDATION_REPORT.md` for the full correction log.

| `BillingProviderAdapter` method | Xendit API concept |
|---|---|
| `createCustomer` | **Phase 1 (Option B):** No customer API call needed — returns `{ externalCustomerId: params.businessId }` as a reference ID. **Phase 2 (Option A — recurring plans):** Must call `POST /customers` and return the real `cust-xxx` ID, which is required to create a Recurring Plan. |
| `createSubscription` | **Phase 1 (Option B):** `POST /sessions` with `session_type: PAY`, `mode: PAYMENT_LINK`, `allow_save_payment_method: DISABLED`. Returns the `payment_link_url` as `checkoutUrl`. No recurring plan is created. **Phase 2 (Option A):** `POST /sessions` with `session_type: SUBSCRIPTION` to set up auto-debit. |
| `cancelSubscription` | **Phase 1 (Option B):** Local-only operation — no provider API call since there is no recurring plan. **Phase 2 (Option A):** `PATCH /recurring/plans/{id}` with `{ status: "INACTIVE" }`. |
| `createCreditPurchaseLink` | `POST /sessions` with `session_type: PAY`, `mode: PAYMENT_LINK`. The `reference_id` and `metadata` carry `businessId`, `packageId`, `creditAmount` for webhook reconciliation. (Replaces deprecated `/payment-links` endpoint.) |
| `getInvoice` | `GET /sessions/{payment_session_id}` for Payment Session status lookups. (The legacy `GET /v2/invoices/{id}` endpoint is for the deprecated Invoice product and must not be used for new code.) |
| `verifyWebhookSignature` | Compares `x-callback-token` request header against `XENDIT_WEBHOOK_TOKEN` env var. No HMAC — static token equality is the contract. |

### 4.3 Xendit Customer Object

> **Post-validation correction:** Xendit does have a Customer API (`POST /customers`, returns `cust-xxx` IDs). The original claim that Xendit has no customer concept was incorrect.

**For Phase 1 (Option B — monthly payment links):** A real Xendit Customer record is not required. One-time Payment Sessions (`POST /sessions`, `session_type: PAY`) accept an inline `customer` object or can operate without a stored customer. The `createCustomer()` adapter method returns `{ externalCustomerId: params.businessId }` as a stable reference ID without making an API call. `Business.externalCustomerId` stores this `businessId` value.

**For Phase 2 (Option A — recurring plans with auto-debit):** A real Xendit Customer record is required. `createCustomer()` must call `POST /customers` and return the actual `cust-xxx` ID. This ID is stored in `Business.externalCustomerId` and used when creating Recurring Plans.

### 4.4 Subscription Flow

> **Post-validation decision:** Phase 1 uses **Option B (monthly payment link per cycle)**. Option A (recurring plans with auto-debit) is deferred to Phase 2. See `ARCHITECTURE_VALIDATION_REPORT.md §4` and `ASSUMPTIONS_AND_RISKS.md §5` for the full rationale. The primary reason: GCash auto-debit is currently on-hold in the Philippines and auto-debit requires per-channel activation with SLAs outside the developer's control.

**Phase 1 — Option B (monthly payment link):**

1. Business owner selects a plan. `createSubscription()` calls `POST /sessions` (`session_type: PAY`, `mode: PAYMENT_LINK`) with the plan amount from `XENDIT_PLAN_*_AMOUNT` env var.
2. Returns `payment_link_url` as `checkoutUrl`. Client redirects there.
3. Customer pays. Xendit sends `payment.succeeded` webhook.
4. `handleInvoicePaid` activates the subscription (`TRIAL → ACTIVE`), sets `currentPeriodStart` / `currentPeriodEnd`.
5. No recurring plan is created. `BusinessSubscription.externalId` stores the Payment Session ID (`ps-xxx`) for reference.
6. At `currentPeriodEnd`, the lifecycle job creates a new Payment Session for the next cycle and sends the link to the customer.

**Phase 2 — Option A (auto-debit recurring plan), prerequisites:**

- Auto-debit activation completed with Xendit for at least one channel (cards or Maya)
- GCash auto-debit available (currently on-hold — check with Xendit)

The two-step flow:
1. `POST /sessions` with `session_type: PAY`, `allow_save_payment_method: FORCED` → customer pays first charge and saves payment method
2. On `payment_token.activation` webhook → create `POST /recurring/plans` using the saved token
3. Xendit auto-charges on each cycle; `recurring.cycle.succeeded` + `payment.succeeded` webhooks fire

The adapter maps Phase 2 to `CreateSubscriptionResult`:
- `externalSubscriptionId` = Xendit recurring plan ID (`repl_xxx`)
- `checkoutUrl` = the `payment_link_url` from the initial Payment Session
- `currentPeriodStart` / `currentPeriodEnd` = computed from plan `anchor_date` and interval

### 4.5 Webhook Event Mapping

> **Post-validation correction:** Two event names in the original design were wrong. `payment.failed` does not exist — the correct name is `payment.failure`. `recurring.payment.created` does not exist — the correct renewal cycle event is `recurring.cycle.succeeded`. See `ARCHITECTURE_VALIDATION_REPORT.md` Errors 1 and 2.

**Phase 1 (Option B) — events to subscribe to:**

| Xendit event | Normalised `WebhookEventType` | Handler called |
|---|---|---|
| `payment.succeeded` (subscription payment) | `invoice.paid` | `handleInvoicePaid` |
| `payment.failure` | `invoice.payment_failed` | `handleInvoicePaymentFailed` |
| `payment_session.expired` | *(log only — no handler transition)* | Log to `WebhookEvent`, return SKIPPED |
| `payment.succeeded` (metadata `source: credit_purchase`) | `checkout.session.completed` | `handleCheckoutSessionCompleted` |

**Phase 2 (Option A) — additional events when recurring plans are active:**

| Xendit event | Normalised `WebhookEventType` | Handler called |
|---|---|---|
| `recurring.cycle.succeeded` + `payment.succeeded` | `customer.subscription.updated` | `handleSubscriptionUpdated` (period date advance) |
| `recurring.cycle.failed` | `invoice.payment_failed` | `handleInvoicePaymentFailed` |
| `recurring.plan.inactivated` | `customer.subscription.deleted` | `handleSubscriptionDeleted` |
| `recurring.plan.activated` | *(internal — subscription already ACTIVE)* | SKIPPED |
| `recurring.cycle.retrying` | *(informational)* | Log to `WebhookEvent`, return SKIPPED |

The normalisation happens inside `XenditAdapter.verifyWebhookSignature()` — the webhook handler never sees Xendit-specific types.

### 4.6 Signature Verification

Xendit uses a static callback token, not an HMAC signature:

```ts
async verifyWebhookSignature(params: {
  rawBody: string | Buffer
  signature: string   // value of x-callback-token header
  secret: string      // XENDIT_WEBHOOK_TOKEN env var
}): Promise<WebhookEvent> {
  if (params.signature !== params.secret) {
    throw new Error('[XenditAdapter] Invalid webhook callback token')
  }
  const payload = JSON.parse(
    typeof params.rawBody === 'string' ? params.rawBody : params.rawBody.toString('utf8')
  )
  return this.normaliseXenditEvent(payload)
}
```

The webhook route reads `x-callback-token` instead of `stripe-signature` and passes it as `signature`.

### 4.7 Factory Functions

```ts
export function createXenditAdapter(): BillingProviderAdapter
export function getXenditWebhookToken(): string
```

Mirrors the Stripe adapter pattern exactly.

---

## 5. Provider Selection — The Adapter Factory

### 5.1 Location

```
src/lib/billing/adapters/index.ts
```

### 5.2 Logic

```ts
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
  if (provider === 'xendit') return createXenditAdapter()
  return createStripeAdapter()
}
```

### 5.3 Per-Business Provider

In a multi-provider setup, a business created before Xendit was added stays on Stripe. A business created after can use either. The provider in use is implied by `BusinessSubscription.externalId` format — but for explicit tracking, `Business.billingProvider` (`String?`) can be added later.

For Phase 1 of this integration, `BILLING_PROVIDER` is a single environment variable — all businesses on an instance use the same provider. Per-business routing is a future concern.

---

## 6. Environment Variables

### 6.1 New Variables Required

> **Post-validation correction:** `XENDIT_PLAN_*_ID` and `XENDIT_CREDIT_PKG_*_ID` have been replaced. Xendit has no plan template ID concept — plans and payment sessions are created dynamically with amounts passed in the API request body. See `ASSUMPTIONS_AND_RISKS.md §3` for the full explanation.

```bash
# --- Billing Provider Selection ---
# "stripe" or "xendit". Defaults to "stripe" if unset.
BILLING_PROVIDER=xendit

# --- Xendit ---
XENDIT_SECRET_KEY=              # Xendit API key (xnd_production_* or xnd_development_*)
XENDIT_WEBHOOK_TOKEN=           # Xendit callback verification token (set in Xendit dashboard)

# Plan amounts — in PHP cents (e.g. 49900 = ₱499)
# Used by create-subscription.ts to set the Payment Session amount dynamically.
XENDIT_PLAN_STARTER_AMOUNT=
XENDIT_PLAN_GROWTH_AMOUNT=
XENDIT_PLAN_PREMIUM_AMOUNT=
XENDIT_PLAN_CURRENCY=PHP

# Credit package amounts — in PHP cents
XENDIT_CREDIT_PKG_10_AMOUNT=5000    # ₱50
XENDIT_CREDIT_PKG_50_AMOUNT=22000   # ₱220
XENDIT_CREDIT_PKG_100_AMOUNT=40000  # ₱400

# Payment session expiry window in hours (default: 24)
XENDIT_SESSION_EXPIRY_HOURS=24
```

### 6.2 Existing Stripe Variables

All `STRIPE_*` variables remain. The app runs one provider at a time per deployment; both sets of variables can coexist in `.env` without conflict.

---

## 7. Database Schema Changes

### 7.1 New: `WebhookEvent` Table

```prisma
model WebhookEvent {
  id           String   @id @default(cuid())
  provider     String   // "stripe" | "xendit"
  externalId   String   // Provider event ID
  eventType    String   // e.g. "invoice.paid", "payment.succeeded"
  status       String   @default("RECEIVED") // RECEIVED | PROCESSED | SKIPPED | ERROR
  rawPayload   Json     // Full provider payload — stored for replay
  errorMessage String?  // Set when status = ERROR
  processedAt  DateTime?

  businessId   String?  // Resolved after processing, if applicable

  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@unique([provider, externalId])  // Idempotency constraint
  @@index([provider, status])
  @@index([createdAt])
  @@map("webhook_events")
}
```

### 7.2 New: `PaymentAttempt` Table

```prisma
model PaymentAttempt {
  id           String   @id @default(cuid())
  businessId   String
  business     Business @relation(fields: [businessId], references: [id], onDelete: Cascade)

  invoiceId    String?  // Links to BillingInvoice if available
  invoice      BillingInvoice? @relation(fields: [invoiceId], references: [id])

  provider     String   // "stripe" | "xendit"
  externalId   String?  // Provider payment/charge ID

  amountCents  Int
  currency     String   @default("PHP")
  status       String   // PENDING | SUCCEEDED | FAILED | EXPIRED | REFUNDED

  failureCode  String?  // Provider-specific failure reason code
  failureMessage String?

  attemptNumber Int     @default(1)  // 1 = first attempt, 2 = first retry, etc.

  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([businessId, createdAt])
  @@index([invoiceId])
  @@map("payment_attempts")
}
```

### 7.3 Additions to Existing Tables

```prisma
// Business
model Business {
  // ... existing fields ...
  externalCustomerId String?  // Provider customer ID (Stripe: cus_xxx; Xendit: businessId)
  billingProvider    String?  // "stripe" | "xendit" — provider used at subscription creation
}

// BillingInvoice
model BillingInvoice {
  // ... existing fields ...
  providerName String?  // "stripe" | "xendit" — which provider issued externalInvoiceId
}
```

---

## 8. Webhook Routes

### 8.1 Route Structure

```
src/routes/api/billing/webhook/stripe/index.ts   ← renamed from /webhook/index.ts
src/routes/api/billing/webhook/xendit/index.ts   ← new
src/routes/api/billing/webhook/-shared/handlers.ts  ← shared handler functions (extracted)
```

The shared handlers file exports:

```ts
export async function handleInvoicePaid(event: WebhookEvent): Promise<WebhookProcessingResult>
export async function handleInvoicePaymentFailed(event: WebhookEvent): Promise<WebhookProcessingResult>
export async function handleSubscriptionDeleted(event: WebhookEvent): Promise<WebhookProcessingResult>
export async function handleSubscriptionUpdated(event: WebhookEvent): Promise<WebhookProcessingResult>
export async function handleCheckoutSessionCompleted(event: WebhookEvent): Promise<WebhookProcessingResult>
```

Each route file handles only the provider-specific concerns: reading the correct header, calling the correct adapter's `verifyWebhookSignature`, writing a `WebhookEvent` row for idempotency, then dispatching to the shared handlers.

### 8.2 Idempotency Flow

```
POST /api/billing/webhook/xendit
  ↓
1. Read raw body and x-callback-token header
2. verifyWebhookSignature() → throws on invalid token
3. INSERT WebhookEvent(provider, externalId, status=RECEIVED) — fails if duplicate (@@unique)
   → on duplicate key violation: return 200 immediately (already processed)
4. dispatch to handler function
5. UPDATE WebhookEvent.status = PROCESSED | ERROR
6. return 200
```

The `@@unique([provider, externalId])` constraint on `WebhookEvent` is the idempotency gate. A duplicate delivery fails the INSERT, returns 200 (so the provider stops retrying), and skips all processing.

---

## 9. Refund Strategy

Xendit supports refunds via `POST /refunds`. The refund flow:

1. Admin initiates refund from the billing dashboard (future UI).
2. `createServerFn` calls `adapter.createRefund(params)` — a new method to add to `BillingProviderAdapter`.
3. Adapter calls Xendit `POST /refunds` or Stripe `POST /refunds`.
4. On `refund.succeeded` webhook (Xendit) or `charge.refunded` (Stripe), a `CreditLedger` entry with `eventType: REFUNDED` is inserted and `BillingInvoice.status` is updated.

Refund support is **out of scope for Phase 1**. The interface method should be planned but not implemented.

---

## 10. Security Posture

### 10.1 Webhook Token vs HMAC

Xendit's callback token is a static bearer token — possession equals authentication. Key mitigations:

- Token is stored exclusively in environment variables; never in source code or DB.
- The token is rotatable from the Xendit dashboard; rotation does not require a code deployment.
- All webhook requests are rejected before any processing if the token is missing or incorrect.
- HTTPS is enforced at the infrastructure level (Nginx / Cloudflare in front of Nitro).

### 10.2 Secret Management

Neither `XENDIT_SECRET_KEY` nor `XENDIT_WEBHOOK_TOKEN` are ever:
- Logged (console.log, error messages, audit records)
- Returned to the client
- Stored in the database

The Xendit adapter reads them via `process.env['XENDIT_SECRET_KEY']` using the same bracket-notation pattern as the Stripe adapter.

### 10.3 `businessId` Integrity

All billing mutations resolve `businessId` from the authenticated session context, never from the incoming webhook payload. The webhook resolves `businessId` by looking up `BusinessSubscription.externalId` — the business never self-reports its own ID in a webhook.

---

## 11. Philippine Market Payment Methods

> **Post-validation correction:** GCash **cannot** be used for recurring subscription auto-debit. GCash auto-debit is currently on-hold in the Philippines per Xendit support documentation. GCash is available for **one-time payments only** (credit package purchases via Payment Links).

**Available for one-time Payment Links (credit purchases):**
- GCash (E-wallet) — one-time only
- Maya (E-wallet) — one-time and recurring
- OTC via 7-Eleven, Cebuana, Palawan — one-time only
- Online banking (BPI, UnionBank, etc.) — one-time and recurring with activation
- Credit/debit cards (Visa, Mastercard) — one-time and recurring with activation
- QRPH (instapay / pesonet) — one-time only

**Available for recurring subscription auto-debit (Phase 2 — Option A):**
- Credit/debit cards — self-serve activation, 3-day SLA
- Maya / GrabPay — instant activation
- ShopeePay — requires CS/AM contact
- Direct Debit BPI/UBP — requires documentation submission
- GCash — **currently on-hold**, timeline unknown

For Phase 1 (Option B — monthly payment link), all one-time payment methods are available because each renewal cycle is a fresh one-time payment. Customers select their preferred method on the Xendit-hosted checkout page each time they pay.

---

## 12. Architecture Diagram

```
Business Owner Browser
        │
        │  POST /billing (select plan)
        ▼
create-subscription.ts
  createBillingAdapter()          ← reads BILLING_PROVIDER env var
        │
        ├─ STRIPE → createStripeAdapter() → Stripe API
        └─ XENDIT → createXenditAdapter() → Xendit API
                           │
                     returns checkoutUrl (Payment Link)
                           │
        ◄──────────────────┘
        │  Redirect to Xendit-hosted checkout
        ▼
Customer completes payment on Xendit
        │
        │  POST /api/billing/webhook/xendit
        ▼
XenditWebhookRoute
  verifyWebhookSignature (x-callback-token)
  INSERT WebhookEvent (idempotency gate)
  dispatch to shared handlers
        │
        ├─ handleInvoicePaid → ACTIVE subscription + PAID invoice
        ├─ handleInvoicePaymentFailed → GRACE_PERIOD subscription
        ├─ handleSubscriptionDeleted → CANCELLED subscription
        ├─ handleSubscriptionUpdated → period date sync
        └─ handleCheckoutSessionCompleted → CreditLedger PURCHASE entry
```

---

## 13. What Does Not Change

The following files require no modifications for Xendit support:

- `src/lib/billing/billing-provider.ts` — interface is already complete
- `src/lib/billing/subscription-engine.ts` — pure state machine, no provider awareness
- `src/lib/billing/invoice-engine.ts` — pure invoice assembly
- `src/lib/billing/credit-engine.ts` — pure credit ledger operations
- `src/lib/billing/usage-engine.ts` — pure usage counting
- `src/lib/billing/types.ts` — domain types (except `CreditPackage.stripePriceId` rename)
- `src/lib/jobs/billing-invoice-generation.ts` — already accepts adapter via injection
- `src/lib/jobs/subscription-lifecycle.ts` — no provider calls at all
- `src/lib/better-auth/auth-server.ts` — reads from DB only
