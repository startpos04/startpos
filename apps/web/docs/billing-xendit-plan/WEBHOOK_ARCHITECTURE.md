# Webhook Architecture

## 1. Purpose

This document describes the complete webhook processing architecture for both the existing Stripe integration and the new Xendit integration. It covers security, idempotency, routing, event handling, failure recovery, logging, and testing.

---

## 2. Current State vs. Target State

### Current (Stripe only)

```
POST /api/billing/webhook
  └── single route, single adapter
  └── signature verification (Stripe HMAC)
  └── in-handler idempotency (per-event checks inside each handler function)
  └── no persistent event log
  └── no deduplication table
```

The existing handler works correctly for a single provider. The idempotency checks are per-event-type (e.g. "is this invoice already PAID?") rather than a universal deduplication gate. This is functional but brittle — a duplicate delivery of a `customer.subscription.deleted` event could attempt a double-cancellation, and the only protection is the state machine rejecting the invalid transition.

### Target (Stripe + Xendit)

```
POST /api/billing/webhook/stripe   ← provider-specific route
POST /api/billing/webhook/xendit   ← provider-specific route
  └── provider-specific signature/token verification
  └── WebhookEvent row INSERT (universal idempotency gate — constraint-based)
  └── shared handler functions (operate on normalised WebhookEvent DTO)
  └── WebhookEvent row UPDATE (status = PROCESSED | ERROR)
  └── PaymentAttempt row written for payment events
```

---

## 3. Route Structure

### 3.1 File Layout

```
src/routes/api/billing/webhook/
  stripe/
    index.ts    ← Stripe-specific: reads stripe-signature, calls createStripeAdapter()
  xendit/
    index.ts    ← Xendit-specific: reads x-callback-token, calls createXenditAdapter()
  -shared/
    handlers.ts ← shared handler functions (no provider coupling)
```

The `-shared/` directory prefix follows TanStack Router's convention for non-route files in the routes tree. The handlers file is not a route — it is a plain module imported by both route files.

### 3.2 Why Separate Routes

- Each provider uses a different verification mechanism. Mixing them in one handler requires branching on `Content-Type` or a custom `provider` query param, both of which are fragile.
- Separate routes allow different rate-limiting, logging, and monitoring rules at the infrastructure level (Nginx, Cloudflare) without code changes.
- The Xendit dashboard requires a single callback URL per event type — `/api/billing/webhook/xendit` is that URL.
- The Stripe dashboard requires a single webhook endpoint URL — `/api/billing/webhook/stripe` is that URL.

---

## 4. Processing Pipeline

Every incoming webhook, regardless of provider, follows the same pipeline:

```
Step 1: Read raw body
Step 2: Verify signature / token
Step 3: Parse and normalise to WebhookEvent DTO
Step 4: INSERT WebhookEvent row (idempotency gate)
Step 5: Dispatch to handler
Step 6: UPDATE WebhookEvent row (PROCESSED or ERROR)
Step 7: Return HTTP 200
```

Steps 2 and 3 happen inside `adapter.verifyWebhookSignature()`. Steps 4–6 happen in the route handler. Step 7 always returns 200 to the provider unless Step 2 fails (in which case 400 is returned).

### 4.1 Step 1 — Raw Body

Both Stripe HMAC verification and Xendit token verification require the raw, unparsed request body. TanStack Start / Nitro expose this via `request.text()`. The body must be read before any JSON parsing — `JSON.parse()` is called only after signature verification inside the adapter.

```ts
const rawBody = await request.text()
```

**Do not call `request.json()` before verification.** The resulting string differs from the raw bytes and will cause HMAC verification failures.

### 4.2 Step 2 — Signature Verification

**Stripe:** HMAC-SHA256 computed over the raw body + timestamp using `STRIPE_WEBHOOK_SECRET`. Stripe's SDK handles this — the adapter calls `stripe.webhooks.constructEvent()`.

**Xendit:** Bearer token comparison. The `x-callback-token` header value must equal `XENDIT_WEBHOOK_TOKEN` exactly (case-sensitive string equality). No cryptographic computation is involved.

If verification fails, the route returns HTTP 400 immediately. No DB writes, no handler calls. The provider treats a 400 as a permanent failure and does not retry (Stripe behaviour) or retries according to its own policy (Xendit retries several times on non-200 responses).

### 4.3 Step 3 — Normalisation

The adapter's `verifyWebhookSignature()` method returns a normalised `WebhookEvent` DTO (defined in `billing-provider.ts`). The route handler and all shared handler functions work exclusively with this DTO — they never see provider-specific types.

Normalisation responsibilities by adapter:

**StripeAdapter:**
- Maps Stripe event types to `WebhookEventType` string literals
- Extracts `invoice`, `subscription`, or `checkoutSession` payload fields
- Converts Unix timestamps to `Date` objects
- Resolves expandable fields (e.g. `subscription` may be an ID string or an expanded object)

**XenditAdapter:**
- Maps Xendit event types (`payment.succeeded`, `payment.failed`, `recurring.plan.inactivated`, etc.) to the same `WebhookEventType` string literals used by Stripe normalisation
- Constructs `invoice`, `subscription`, or `checkoutSession` fields from the Xendit payload shape
- Parses ISO timestamps to `Date` objects
- Extracts `reference_id` for `businessId` resolution

### 4.4 Step 4 — Idempotency Gate

```ts
try {
  await rootPrisma.webhookEvent.create({
    data: {
      provider,
      externalId: event.id,
      eventType: event.type,
      status: 'RECEIVED',
      rawPayload: JSON.parse(rawBody),
      createdAt: new Date(),
    },
  })
} catch (err) {
  // Unique constraint violation = duplicate delivery
  if (isUniqueConstraintViolation(err)) {
    return new Response(JSON.stringify({ outcome: 'skipped', reason: 'duplicate' }), {
      status: 200,
    })
  }
  throw err
}
```

The `@@unique([provider, externalId])` constraint on `WebhookEvent` is the deduplication gate. If a row already exists for this `(provider, externalId)` pair, the INSERT fails with a unique constraint violation. The route catches this, returns 200 (so the provider stops retrying), and does no further processing.

This replaces the scattered per-event idempotency checks in the individual handler functions. Those checks remain as a secondary defence but are no longer the primary gate.

### 4.5 Step 5 — Handler Dispatch

```ts
switch (event.type) {
  case 'invoice.paid':
    result = await handleInvoicePaid(event)
    break
  case 'invoice.payment_failed':
    result = await handleInvoicePaymentFailed(event)
    break
  case 'customer.subscription.deleted':
    result = await handleSubscriptionDeleted(event)
    break
  case 'customer.subscription.updated':
    result = await handleSubscriptionUpdated(event)
    break
  case 'checkout.session.completed':
    result = await handleCheckoutSessionCompleted(event)
    break
  default:
    result = { outcome: 'skipped', message: `Unhandled event type: ${event.type}` }
}
```

This dispatch block is identical in both route files. The shared handler functions are provider-agnostic — they query `BusinessSubscription.externalId` to find the affected business, apply the state machine transition, and persist the result.

### 4.6 Step 6 — Status Update

After the handler returns, the `WebhookEvent` row is updated:

```ts
await rootPrisma.webhookEvent.update({
  where: { provider_externalId: { provider, externalId: event.id } },
  data: {
    status: result.outcome === 'error' ? 'ERROR' : 'PROCESSED',
    businessId: result.businessId ?? null,
    errorMessage: result.errorMessage ?? null,
    processedAt: new Date(),
  },
})
```

If the handler throws an exception, the catch block sets `status = 'ERROR'` and stores the error message. The route then returns HTTP 500 so the provider retries the event.

### 4.7 Step 7 — Response

The route always returns HTTP 200 after successful processing or after a skip (duplicate). It returns HTTP 500 only when an unexpected error occurs in the handler — this signals the provider to retry.

HTTP 400 is returned only on signature verification failure.

```
200 — processed or skipped (duplicate / unhandled type)
400 — invalid signature or missing header
500 — handler threw an exception → provider will retry
```

---

## 5. Shared Handler Functions

All handler functions live in `src/routes/api/billing/webhook/-shared/handlers.ts`. They accept a `WebhookEvent` and return a `WebhookProcessingResult`.

### handleInvoicePaid

Triggered by: Stripe `invoice.paid`, Xendit `payment.succeeded` (subscription renewal)

```
1. Look up BillingInvoice by externalInvoiceId
2. If already PAID → return SKIPPED (secondary idempotency check)
3. Look up BusinessSubscription by externalSubscriptionId
4. rootPrisma.$transaction:
   a. UPDATE BillingInvoice.status = PAID, paidAt = now
   b. If subscription not ACTIVE → validate transition → UPDATE to ACTIVE
   c. INSERT SubscriptionStatusHistory
   d. INSERT PaymentAttempt(status=SUCCEEDED)
   e. UPDATE BusinessSubscription.currentPeriodStart/End (if provided)
5. Return PROCESSED
```

### handleInvoicePaymentFailed

Triggered by: Stripe `invoice.payment_failed`, Xendit `payment.failed`, Xendit `invoice.expired`

```
1. Resolve BusinessSubscription by externalSubscriptionId
2. If subscription not ACTIVE → return SKIPPED
3. Validate ACTIVE → GRACE_PERIOD transition
4. Compute gracePeriodEndsAt = now + GRACE_PERIOD_DAYS
5. rootPrisma.$transaction:
   a. UPDATE BusinessSubscription status=GRACE_PERIOD, gracePeriodEndsAt, expiredAt=now
   b. INSERT SubscriptionStatusHistory
   c. INSERT PaymentAttempt(status=FAILED, failureCode, failureMessage)
6. Return PROCESSED
```

### handleSubscriptionDeleted

Triggered by: Stripe `customer.subscription.deleted`, Xendit `recurring.plan.inactivated`

```
1. Look up BusinessSubscription by externalSubscriptionId
2. If already CANCELLED → return SKIPPED
3. Validate * → CANCELLED transition
4. rootPrisma.$transaction:
   a. UPDATE BusinessSubscription status=CANCELLED, cancelledAt
   b. INSERT SubscriptionStatusHistory
5. Return PROCESSED
```

### handleSubscriptionUpdated

Triggered by: Stripe `customer.subscription.updated`, Xendit `recurring.payment.created`

```
1. Look up BusinessSubscription by externalSubscriptionId
2. Map provider status → SubscriptionStatus (active→ACTIVE, past_due→GRACE_PERIOD, etc.)
3. If status change is needed AND transition is valid → UPDATE + INSERT history
4. Always UPDATE currentPeriodStart / currentPeriodEnd from event payload
5. Return PROCESSED
```

### handleCheckoutSessionCompleted

Triggered by: Stripe `checkout.session.completed`, Xendit `payment.succeeded` (one-time payment link)

```
1. Validate metadata: businessId, userId, packageId, creditAmount present
2. Validate paymentStatus = 'paid'
3. Look up BusinessSubscription to get the businessId context
4. Call CreditEngine.grant() to compute the new ledger entry
5. rootPrisma.$transaction:
   a. INSERT CreditLedger (PURCHASE event, amount=creditAmount, balanceAfter)
   b. INSERT PaymentAttempt(status=SUCCEEDED, amountCents=amountTotal)
6. Return PROCESSED
```

---

## 6. Idempotency Design

### 6.1 Primary Gate — Constraint-Based

The `WebhookEvent.@@unique([provider, externalId])` constraint is the primary idempotency mechanism. It works at the database level without any application-level check or distributed lock.

Race condition behaviour: if two identical webhook deliveries arrive simultaneously, one INSERT succeeds and one gets a constraint violation. The first one processes; the second returns 200 immediately. This is correct and safe.

### 6.2 Secondary Gate — Handler-Level Checks

Each handler still contains a logical check (e.g. "is this invoice already PAID?"). These checks defend against:
- Edge cases where the same business logic outcome could be triggered by two different event IDs (unlikely but possible in Xendit's retry model)
- Future code paths that call handler functions directly without going through the route

### 6.3 Xendit-Specific Idempotency Notes

Xendit event IDs are included in the webhook payload as `id` (top-level field). The XenditAdapter extracts this and returns it as `WebhookEvent.id`. Unlike Stripe, Xendit may retry an event with a new ID if the original delivery timed out — in this case the constraint-based gate does not help. The handler-level check (e.g. "invoice already PAID") is the fallback.

---

## 7. Failure Recovery

### 7.1 Handler Exception → HTTP 500

When a handler throws an uncaught exception:
1. The route's catch block updates `WebhookEvent.status = 'ERROR'` with the error message.
2. HTTP 500 is returned.
3. The provider (Stripe or Xendit) will retry the event according to its retry schedule.
4. On the next delivery, the `WebhookEvent` row already exists with `status = 'ERROR'`. The INSERT in Step 4 will succeed because there is no unique constraint violation — the row exists with `ERROR` status, not `PROCESSED`.

Wait — this needs careful handling. The idempotency INSERT on retry will fail because the row already exists (regardless of status). The route must handle this:

```ts
// On duplicate constraint violation, check the existing row's status
const existing = await rootPrisma.webhookEvent.findUnique({
  where: { provider_externalId: { provider, externalId: event.id } },
  select: { status: true },
})

if (existing?.status === 'PROCESSED') {
  return 200 // Already successfully processed — skip
}

if (existing?.status === 'ERROR') {
  // Previous attempt failed — allow retry processing
  // Reset status to RECEIVED and proceed
  await rootPrisma.webhookEvent.update({
    where: { provider_externalId: { provider, externalId: event.id } },
    data: { status: 'RECEIVED', errorMessage: null },
  })
  // proceed to handler dispatch
}
```

This means the full idempotency logic is:

```
INSERT WebhookEvent
  → success: proceed to handler
  → unique constraint violation:
      → status = PROCESSED → return 200 (skip)
      → status = ERROR     → reset to RECEIVED, proceed to handler (retry)
      → status = RECEIVED  → previous attempt in-flight, return 200 (skip)
```

### 7.2 Stripe Retry Schedule

Stripe retries failed webhooks over 3 days with exponential backoff: after 5 minutes, 30 minutes, 2 hours, 5 hours, 10 hours, and so on up to 72 hours. After that, the endpoint is marked as failing and Stripe alerts the developer.

### 7.3 Xendit Retry Schedule

Xendit retries failed callbacks (non-200 responses) up to 5 times with increasing delays. After 5 failed attempts, the event is marked as failed in the Xendit dashboard. Events can be manually replayed from the Xendit dashboard.

### 7.4 Manual Replay

The `WebhookEvent.rawPayload` field stores the full original provider payload as `Json`. This enables manual replay without provider involvement:

```ts
// Admin endpoint: POST /api/admin/billing/replay-webhook
const event = await rootPrisma.webhookEvent.findUnique({ where: { id } })
// Reset status and re-run through handler dispatch
await resetAndReprocess(event)
```

This is particularly valuable for Xendit, where replay from the dashboard is limited.

---

## 8. Security

### 8.1 Stripe Signature Verification

Stripe signs webhook payloads with HMAC-SHA256. The signature includes a timestamp to prevent replay attacks — signatures older than 5 minutes (configurable) are rejected by the SDK.

The secret (`STRIPE_WEBHOOK_SECRET`) is a `whsec_*` string set in the Stripe dashboard. It is environment-specific — test webhooks use a different secret than production webhooks.

### 8.2 Xendit Token Verification

Xendit uses a static callback verification token. The token is set in the Xendit dashboard under "Webhook settings" and stored in `XENDIT_WEBHOOK_TOKEN`.

```ts
if (params.signature !== params.secret) {
  throw new Error('[XenditAdapter] Invalid callback token')
}
```

Limitations compared to HMAC:
- No replay protection — a captured request body + token could be replayed
- Token rotation requires updating `XENDIT_WEBHOOK_TOKEN` and the Xendit dashboard simultaneously

Mitigations:
- All requests arrive over HTTPS (TLS prevents interception)
- The raw body + token are never logged
- Token rotation procedure: update the Xendit dashboard first, then deploy the new `XENDIT_WEBHOOK_TOKEN` env var — there is a brief window where old deliveries may fail, but new deliveries succeed immediately

### 8.3 IP Allowlisting (Optional)

Xendit publishes its webhook source IP ranges. An Nginx or Cloudflare rule can allowlist these ranges before the request reaches the application. This is a defence-in-depth measure and is not required for correctness but is recommended for production.

Stripe's webhook delivery IPs are not guaranteed to be stable — IP allowlisting is not recommended for Stripe.

### 8.4 Secret Logging Policy

Neither webhook secret nor callback token may appear in:
- `console.log` / `console.error` output
- Application error messages returned in HTTP responses
- `WebhookEvent.errorMessage` field
- `WebhookEvent.rawPayload` field (the payload itself does not contain secrets)
- Any structured logging service output

The adapter factory functions (`getStripeWebhookSecret()`, `getXenditWebhookToken()`) are the only places that read these values. They are passed to the adapter and immediately consumed — never stored in a variable that persists beyond the request.

### 8.5 `businessId` Integrity

Webhook payloads from both providers do not contain a `businessId` directly (except in metadata set by this application). The handlers resolve `businessId` by looking up `BusinessSubscription.externalId = event.subscription.externalSubscriptionId`. This means a crafted webhook with a spoofed external subscription ID can only affect a business if the ID happens to match a real subscription in the database — not a realistic attack vector, but still worth noting.

For `checkout.session.completed` events, `businessId` comes from the session metadata that this application set when creating the checkout session — it is not caller-supplied.

---

## 9. Event Ordering

Neither Stripe nor Xendit guarantees event delivery order. The handlers are designed to be order-independent:

- Each handler checks the current subscription status before acting (not the previous status from the event).
- The state machine `canTransition()` rejects transitions that don't make sense from the current state.
- Period date updates (`currentPeriodStart` / `currentPeriodEnd`) use the values from the event payload, not a computed delta, so out-of-order delivery overwrites with the correct value either way.

The one ordering-sensitive scenario is `invoice.paid` arriving before `customer.subscription.updated` for the same renewal cycle. Both handlers check the current status independently. The `invoice.paid` handler transitions `GRACE_PERIOD → ACTIVE` and updates period dates. If `customer.subscription.updated` arrives after, it attempts the same status change (which the state machine skips as a no-op since status is already `ACTIVE`) and updates period dates again (idempotent since the values are the same). This is safe.

---

## 10. Logging Strategy

### 10.1 Structured Log Fields

Every webhook processing attempt should emit a structured log entry with:

```ts
{
  provider: 'stripe' | 'xendit',
  eventId: string,
  eventType: string,
  outcome: 'processed' | 'skipped' | 'error',
  businessId: string | null,
  durationMs: number,
  errorMessage?: string,
}
```

### 10.2 What to Log

| Event | Log level |
|---|---|
| Signature verification failure | `warn` — include provider and event type but not the signature value |
| Duplicate event received (skip) | `info` |
| Successfully processed | `info` |
| Handler error | `error` — include full error stack |
| Unhandled event type | `info` |

### 10.3 What Never to Log

- Raw webhook body (may contain PII from provider)
- Signature / callback token values
- Full Prisma stack traces in production (they can expose schema details)

### 10.4 Observability

The `WebhookEvent` table is the primary observability tool — it is queryable by operations staff without needing access to log infrastructure:

```sql
-- Recent errors
SELECT provider, event_type, error_message, created_at
FROM webhook_events
WHERE status = 'ERROR'
ORDER BY created_at DESC
LIMIT 50;

-- Event volume by type in the last 24 hours
SELECT provider, event_type, status, COUNT(*)
FROM webhook_events
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY provider, event_type, status;
```

---

## 11. Testing Strategy

### 11.1 Signature Verification Tests (Pattern A)

Pure unit tests for the adapter normalisation logic. No HTTP, no DB.

```
__tests__/unit/lib/billing/adapters/xendit-adapter.test.ts

Tests:
- verifyWebhookSignature() → throws on wrong token
- verifyWebhookSignature() → throws on missing token
- normaliseXenditEvent() → payment.succeeded (no source metadata) maps to invoice.paid
- normaliseXenditEvent() → payment.succeeded (source=credit_purchase) maps to checkout.session.completed
- normaliseXenditEvent() → payment.failure maps to invoice.payment_failed  ← NOT payment.failed
- normaliseXenditEvent() → recurring.cycle.succeeded maps to customer.subscription.updated  ← NOT recurring.payment.created
- normaliseXenditEvent() → recurring.plan.inactivated maps to customer.subscription.deleted
- normaliseXenditEvent() → payment_session.expired returns SKIPPED outcome
- normaliseXenditEvent() → extracts correct externalSubscriptionId from reference_id
- normaliseXenditEvent() → ISO timestamp converted to Date
```

### 11.2 Handler Unit Tests (Pattern B)

In-memory integration tests for each shared handler function. DB is replaced by mocked Prisma.

```
__tests__/unit/lib/billing/webhook/handlers.test.ts

Tests for handleInvoicePaid:
- Transitions GRACE_PERIOD → ACTIVE on valid payment
- Writes SubscriptionStatusHistory record
- Marks BillingInvoice as PAID
- Returns SKIPPED when invoice is already PAID
- Returns SKIPPED when subscription not found

Tests for handleInvoicePaymentFailed:
- Transitions ACTIVE → GRACE_PERIOD
- Sets gracePeriodEndsAt to now + GRACE_PERIOD_DAYS
- Returns SKIPPED when subscription not ACTIVE
- Writes SubscriptionStatusHistory record

Tests for handleSubscriptionDeleted:
- Transitions * → CANCELLED
- Returns SKIPPED when already CANCELLED
- Writes SubscriptionStatusHistory record

Tests for handleCheckoutSessionCompleted:
- Inserts CreditLedger PURCHASE entry
- Skips when paymentStatus != 'paid'
- Skips when metadata is missing required fields
```

### 11.3 Idempotency Tests (Pattern B)

```
Tests for duplicate webhook delivery:
- Second delivery with same (provider, externalId) returns SKIPPED immediately
- No additional DB mutations on duplicate
- PROCESSED row is not overwritten
- ERROR row is reprocessed (retry path)
```

### 11.4 End-to-End Webhook Tests (Pattern C2)

Multi-handler orchestration tests simulating the full payment lifecycle.

```
__tests__/integration/billing/xendit-payment-journey.integration.test.ts

Scenarios:
- Subscription creation → first payment success → TRIAL → ACTIVE
- Renewal payment success → ACTIVE stays ACTIVE, period dates updated
- Payment failure → ACTIVE → GRACE_PERIOD
- Payment recovery during grace → GRACE_PERIOD → ACTIVE
- Grace period expires → GRACE_PERIOD → EXPIRED (lifecycle job)
- Subscription cancelled by provider → * → CANCELLED
- Credit package purchase → CreditLedger PURCHASE entry inserted
- Duplicate invoice.paid delivery → second call is skipped
```

### 11.5 Sandbox Testing

Xendit provides a sandbox environment (`xnd_development_*` API key). Test the full flow end-to-end by:

1. Setting `XENDIT_SECRET_KEY=xnd_development_*` and `BILLING_PROVIDER=xendit` in `.env.local`
2. Using the Xendit sandbox dashboard to create test payment scenarios
3. Using the Xendit callback simulator to send test webhook payloads to a local ngrok tunnel
4. Verifying `WebhookEvent` rows are created and `BusinessSubscription` status changes correctly

For local development, ngrok (or similar) is required to expose the local server to Xendit's callback system:
```
ngrok http 3000
# then set in Xendit dashboard: https://<ngrok-url>/api/billing/webhook/xendit
```

---

## 12. Xendit Webhook Event Reference

> **Post-validation correction:** Two event names in the original table were wrong and are corrected below. See `ARCHITECTURE_VALIDATION_REPORT.md` Errors 1 and 2.

Complete mapping of Xendit webhook events to this system's normalised types and handlers.

**Phase 1 (Option B — monthly payment links):**

| Xendit event type | Payload model | Normalised to | Handler |
|---|---|---|---|
| `payment.succeeded` (subscription payment) | `Payment` | `invoice.paid` | `handleInvoicePaid` |
| `payment.succeeded` (one-time, `source: credit_purchase`) | `Payment` + metadata | `checkout.session.completed` | `handleCheckoutSessionCompleted` |
| `payment.failure` *(not `payment.failed`)* | `Payment` | `invoice.payment_failed` | `handleInvoicePaymentFailed` |
| `payment_session.expired` | `PaymentSession` | *(log only)* | SKIPPED — log to `WebhookEvent` |

**Phase 2 additions (Option A — recurring plans):**

| Xendit event type | Payload model | Normalised to | Handler |
|---|---|---|---|
| `recurring.cycle.succeeded` *(not `recurring.payment.created`)* | `RecurringCycle` | `customer.subscription.updated` | `handleSubscriptionUpdated` |
| `recurring.cycle.failed` | `RecurringCycle` | `invoice.payment_failed` | `handleInvoicePaymentFailed` |
| `recurring.plan.inactivated` | `RecurringPlan` | `customer.subscription.deleted` | `handleSubscriptionDeleted` |
| `recurring.plan.activated` | `RecurringPlan` | *(informational)* | SKIPPED |
| `recurring.cycle.retrying` | `RecurringCycle` | *(informational)* | SKIPPED |

### Distinguishing one-time vs. subscription `payment.succeeded`

Both credit package purchases and subscription payments produce `payment.succeeded` events. The adapter distinguishes them by inspecting the `metadata` field:

```ts
// In normaliseXenditEvent()
if (payload.metadata?.source === 'credit_purchase') {
  // Map to checkout.session.completed
} else {
  // Map to invoice.paid (subscription payment)
}
```

This metadata is set by `createCreditPurchaseLink()` in the XenditAdapter at Payment Session creation time.

---

## 13. Configuration Reference

| Environment variable | Provider | Purpose |
|---|---|---|
| `STRIPE_WEBHOOK_SECRET` | Stripe | HMAC signing secret (`whsec_*`) |
| `XENDIT_WEBHOOK_TOKEN` | Xendit | Static callback verification token |
| `BILLING_PROVIDER` | Both | Selects active provider (`stripe` or `xendit`) |

The webhook routes do not use `BILLING_PROVIDER` — both `/stripe` and `/xendit` routes are always active. This allows Xendit webhooks to arrive and be processed even while the application is still running in Stripe mode (e.g. during migration), and vice versa.
