# Xendit Integration Plan

## 1. Purpose

This document covers everything that does not belong in a purely technical architecture document: the user experience flows, security review, configuration guide, sandbox testing procedures, and the decisions made during planning. It is the business-and-product companion to `XENDIT_ARCHITECTURE.md`.

---

## 2. Integration Scope

### In Scope

- Xendit as a Philippine billing provider for SaaS subscriptions (plan selection, first payment, recurring renewals)
- Xendit-hosted checkout for credit package purchases
- Webhook processing for all Xendit payment lifecycle events
- Provider-agnostic adapter factory so the application works with either Stripe or Xendit

### Out of Scope

- GCash / Maya / OTC as payment methods inside the POS checkout flow (separate feature — see POS payment provider planning)
- Xendit as a payment method for B2B invoicing between tenants
- Simultaneous use of both Stripe and Xendit for the same tenant
- Refunds via the Xendit API (Phase 2 — noted in architecture but not implemented now)
- Xendit Disbursements (payouts)

---

## 3. User Experience Flows

### 3.1 New Business — First Subscription (Xendit path)

The customer experience is nearly identical to the Stripe path. The only visible difference is the payment page — Xendit's hosted checkout replaces Stripe Checkout.

```
1. Business owner completes registration → Trial subscription auto-provisioned
2. Owner navigates to /billing/plans
3. Selects a plan → clicks "Subscribe"
4. Server: createSubscription() calls XenditAdapter.createCreditPurchaseLink()
          (for first payment — no saved method yet)
          Returns a Xendit Payment Link URL
5. Client: redirects to Xendit-hosted payment page
6. Owner selects payment method:
     - GCash
     - Maya
     - Credit/debit card (Visa, Mastercard)
     - Online banking (BPI, UnionBank)
     - OTC (7-Eleven, Cebuana, Palawan)
     - QRPH
7. Completes payment
8. Xendit redirects to /billing?payment=success
9. Xendit sends payment.succeeded webhook → handler activates subscription,
   creates Xendit Recurring Plan for future renewals
10. /billing page shows ACTIVE subscription status
```

**UX consideration:** There is a brief window (step 8 to end of step 9) where the owner is back in the app but the subscription is not yet ACTIVE. The billing page should show a "Verifying payment..." state that polls the subscription status and transitions to the ACTIVE view once the webhook is processed. This is the same behaviour as the Stripe Checkout flow.

### 3.2 Subscription Renewal (Xendit path)

Renewals are fully automated and invisible to the user in the happy path.

```
1. Xendit charges the customer's saved payment method at period end
2. Xendit sends payment.succeeded webhook
3. Handler: BusinessSubscription.currentPeriodStart/End updated
4. No user action required
```

If the renewal charge fails:

```
1. Xendit sends payment.failed webhook
2. Handler: subscription moves to GRACE_PERIOD
3. Owner receives email notification (future — notification engine)
4. /billing page shows "Payment overdue" banner with "Update payment method" CTA
5. Owner updates payment method in Xendit customer portal (or re-initiates payment)
6. Xendit retries charge / owner pays manually
7. payment.succeeded webhook → subscription returns to ACTIVE
```

### 3.3 Plan Upgrade

```
1. Owner navigates to /billing/plans → selects higher plan
2. Server: cancelSubscription() on current Xendit plan (at period end)
3. Server: createSubscription() with new plan → new Payment Link
4. Owner completes payment on Xendit checkout
5. Webhook activates new plan subscription
```

Upgrade is handled as a cancel-and-resubscribe at the provider level. Proration is not supported in Phase 1. The owner retains access to the old plan until the current period ends, at which point the new plan activates.

### 3.4 Plan Downgrade

Same flow as upgrade. Downgrade takes effect at next renewal period to avoid disrupting active operations mid-period.

### 3.5 Subscription Cancellation

```
1. Owner navigates to /billing → clicks "Cancel subscription"
2. Cancellation dialog: "Cancel immediately" or "Cancel at period end"
3. Server: cancelSubscription({ immediate: false })
   → records cancelledAt locally
   → Xendit plan status set to INACTIVE (adapter call)
   → subscription remains ACTIVE until currentPeriodEnd
4. /billing shows "Cancellation scheduled for [date]" banner
5. At period end: lifecycle job transitions status → CANCELLED
```

For immediate cancellation:

```
3. Server: cancelSubscription({ immediate: true })
   → Xendit plan set to INACTIVE now
   → subscription status → CANCELLED immediately
4. /billing shows CANCELLED state
```

### 3.6 Credit Package Purchase

```
1. Owner navigates to /billing/credits
2. Selects a package (10, 50, or 100 credits)
3. Server: purchaseCreditPackage() → XenditAdapter.createCreditPurchaseLink()
4. Client: redirects to Xendit Payment Link
5. Owner completes payment
6. Xendit redirects to /billing/credits?purchase=success
7. Xendit sends payment.succeeded webhook (metadata: source=credit_purchase)
8. Handler: inserts CreditLedger PURCHASE entry
9. /billing/credits shows updated credit balance
```

### 3.7 Payment History and Invoice Access

```
/billing/invoices → lists BillingInvoice records for the business
  - Shows status (DRAFT, OPEN, PAID, VOID)
  - Shows billingPeriodStart / billingPeriodEnd
  - Shows totalAmount
  - Links to hostedInvoiceUrl (Xendit's hosted invoice page) when available
```

For Xendit, `hostedInvoiceUrl` is populated from the Xendit invoice object returned via `adapter.getInvoice()`. Until `externalInvoiceId` is populated on the `BillingInvoice` row, this link is null — the owner can still see the invoice amount and dates.

---

## 4. Provider Comparison

Understanding the differences between Stripe and Xendit informs several architectural decisions.

| Concern | Stripe | Xendit |
|---|---|---|
| Customer object | Required — `cus_xxx` stored per business | Not required — `reference_id` is a caller-supplied string |
| Subscription model | First-class `Subscription` object with items, schedules, invoices | Recurring Payment Plan — simpler, fewer configuration options |
| First payment | Subscription created with `payment_behavior: default_incomplete`, then customer completes via Checkout | Payment Link for first charge, then Recurring Plan created after success |
| Cancel at period end | Native: `cancel_at_period_end: true` | Not native — simulated by recording intent + lifecycle job |
| Webhook security | HMAC-SHA256 with timestamp (replay-safe) | Static callback token (simpler but no replay protection) |
| Event ID stability | Each event has a unique `evt_xxx` ID | Each event has a unique `id` field |
| Retry on failure | Exponential backoff over 3 days | Up to 5 retries; manual replay available |
| Payment methods | Cards, bank redirects, wallets (international) | GCash, Maya, cards, OTC, online banking, QRPH (Philippine-focused) |
| Sandbox environment | `sk_test_*` keys, Stripe CLI for local testing | `xnd_development_*` keys, dashboard callback simulator |
| Dashboard | Comprehensive — subscriptions, invoices, disputes, reporting | Solid — payments, recurring, invoices, good local support |

---

## 5. Security Review

### 5.1 Webhook Authenticity

**Stripe:** HMAC-SHA256 over raw body + timestamp. The timestamp component prevents replay attacks — requests older than 5 minutes are rejected by the Stripe SDK. This is cryptographically strong.

**Xendit:** Static token equality check. No timestamp, no HMAC. Mitigations applied:
- HTTPS is enforced at infrastructure level (all traffic over TLS)
- Token is never logged, never stored in DB, never returned to client
- Token is rotatable without code deployment
- Optional: Nginx/Cloudflare IP allowlist for Xendit's published callback IPs

Risk assessment: the static token model is standard for Xendit integrations in the Philippine market. The absence of replay protection is acceptable given HTTPS enforcement and the idempotency gate in the application layer (a replayed event is deduplicated by the `WebhookEvent` unique constraint).

### 5.2 Secret Management

All secrets are environment variables. The following secrets are required for Xendit:

| Secret | Where stored | Who can read it |
|---|---|---|
| `XENDIT_SECRET_KEY` | `.env.local` (dev), deploy secrets (prod) | Server process only |
| `XENDIT_WEBHOOK_TOKEN` | `.env.local` (dev), deploy secrets (prod) | Server process only |

Neither secret appears in:
- Source code
- Database
- Log output
- HTTP responses
- Error messages

### 5.3 Payment Validation

Payment amounts are never accepted from client-submitted input. The flow:

1. Client submits `packageId` (e.g. `credits_10`) — a key into a server-side catalog
2. Server resolves the `providerPriceId` from the catalog (sourced from env vars)
3. Xendit enforces the amount defined in the Payment Link or product configuration
4. The webhook payload's `amountTotal` is stored in `PaymentAttempt` for audit but is not used to compute credits — `creditAmount` comes from `metadata.creditAmount` which was set by the server at checkout creation time

This means a client cannot manipulate the payment amount by modifying requests.

### 5.4 `businessId` Integrity

Three scenarios where `businessId` is resolved:

1. **Subscription webhooks:** `businessId` resolved via `BusinessSubscription.externalId = event.subscription.externalSubscriptionId`. The external ID was set by the server — not caller-controlled.
2. **Credit purchase webhooks:** `businessId` comes from `metadata.businessId` which was set by the server at Payment Link creation time. The server reads `businessId` from the authenticated session context — never from client input.
3. **Server functions:** `businessId` always comes from `context.user.businessId` (auth middleware) — never from `data` (client-submitted input).

### 5.5 Access Control

All billing server functions are protected by `authMiddleware`. The middleware enforces:
- Valid session token
- `businessId` resolved from the authenticated user's context

No billing operation can be initiated for a business other than the one the authenticated user belongs to.

Admin-only operations (grant credits, void invoices, suspend subscription) additionally check `role === 'ADMIN'` — this check is in the admin panel server functions and is not part of the Xendit integration scope.

### 5.6 Audit Trail

The combination of `WebhookEvent` (all incoming events), `SubscriptionStatusHistory` (all status transitions), `PaymentAttempt` (all payment outcomes), and `CreditLedger` (all credit movements) provides a complete, append-only audit trail suitable for:
- Billing dispute resolution
- Regulatory compliance review
- Operations debugging
- Customer support investigations

No record in any of these tables is ever updated in a way that loses information — `WebhookEvent.status` transitions forward (RECEIVED → PROCESSED/ERROR), and `SubscriptionStatusHistory` / `CreditLedger` are strictly append-only.

---

## 6. Configuration Guide

### 6.1 Development / Sandbox

```bash
# .env.local

# Select Xendit as the billing provider
BILLING_PROVIDER=xendit

# Xendit sandbox API key (from Xendit Dashboard → Settings → API Keys)
XENDIT_SECRET_KEY=xnd_development_XXXXXXXXXXXXXXXX

# Xendit callback token (from Xendit Dashboard → Settings → Callbacks)
# Set this to any string in sandbox; configure the same value in the dashboard
XENDIT_WEBHOOK_TOKEN=dev-callback-token-change-me

# Recurring plan IDs — create these in the Xendit sandbox dashboard
# under Products → Recurring → Plans
XENDIT_PLAN_STARTER_ID=
XENDIT_PLAN_GROWTH_ID=
XENDIT_PLAN_PREMIUM_ID=

# Credit package product IDs — create Payment Link templates or use price references
XENDIT_CREDIT_PKG_10_ID=
XENDIT_CREDIT_PKG_50_ID=
XENDIT_CREDIT_PKG_100_ID=

# App URL for redirect after payment
APP_URL=http://localhost:3200
```

### 6.2 Production

```bash
# .env (server environment / deploy secrets)

BILLING_PROVIDER=xendit

# Xendit production API key
XENDIT_SECRET_KEY=xnd_production_XXXXXXXXXXXXXXXX

# Xendit production callback token
XENDIT_WEBHOOK_TOKEN=<strong-random-token>

# Xendit production plan IDs
XENDIT_PLAN_STARTER_ID=<xendit-plan-id>
XENDIT_PLAN_GROWTH_ID=<xendit-plan-id>
XENDIT_PLAN_PREMIUM_ID=<xendit-plan-id>

XENDIT_CREDIT_PKG_10_ID=<xendit-product-id>
XENDIT_CREDIT_PKG_50_ID=<xendit-product-id>
XENDIT_CREDIT_PKG_100_ID=<xendit-product-id>

APP_URL=https://app.startpos.ph
```

### 6.3 Xendit Dashboard Setup Checklist

Before going live, the following must be configured in the Xendit merchant dashboard:

- [ ] API key generated (production)
- [ ] Callback token set under Settings → Callbacks
- [ ] Callback URLs configured:
  - `https://app.startpos.ph/api/billing/webhook/xendit`
  - Enable: `payment.succeeded`, `payment.failed`, `recurring.plan.inactivated`, `recurring.payment.created`, `invoice.paid`, `invoice.expired`
- [ ] Recurring payment plans created per subscription tier (Starter, Growth, Premium)
- [ ] Payment Link templates or products created per credit package (10, 50, 100 credits)
- [ ] Test a payment end-to-end in sandbox before switching `BILLING_PROVIDER=xendit`

### 6.4 Local Webhook Testing

Xendit cannot send callbacks to `localhost`. Use ngrok to expose the local dev server:

```bash
# Terminal 1 — start the app
pnpm dev

# Terminal 2 — expose to public internet
ngrok http 3200
# ngrok gives you: https://abc123.ngrok-free.app

# In Xendit sandbox dashboard → Settings → Callbacks:
# Set URL to: https://abc123.ngrok-free.app/api/billing/webhook/xendit

# Test with Xendit's callback simulator in the dashboard, or trigger
# a real payment in the sandbox environment
```

---

## 7. Sandbox Testing Procedures

### 7.1 Test Scenario: Successful Subscription

1. Register a new business in the dev app
2. Navigate to `/billing/plans`
3. Select Starter plan → Subscribe
4. On Xendit sandbox checkout: use test card `4000 0000 0000 0002` (success)
5. Expected result after redirect:
   - `BusinessSubscription.status = ACTIVE`
   - `SubscriptionStatusHistory` has TRIAL → ACTIVE record
   - `WebhookEvent` row with `status = PROCESSED`
6. Verify in DB: `SELECT * FROM business_subscriptions WHERE business_id = '...'`

### 7.2 Test Scenario: Failed Payment → Grace Period

1. Start from an ACTIVE subscription
2. Use Xendit dashboard callback simulator to send `payment.failed` event
3. Expected result:
   - `BusinessSubscription.status = GRACE_PERIOD`
   - `gracePeriodEndsAt` set to now + 7 days
   - `PaymentAttempt` row with `status = FAILED`
4. App should display payment overdue banner on `/billing`

### 7.3 Test Scenario: Credit Purchase

1. Navigate to `/billing/credits`
2. Select 10 credits
3. Complete payment on Xendit sandbox checkout
4. Expected result:
   - `CreditLedger` row with `eventType = PURCHASE`, `amount = 10`
   - `/billing/credits` shows updated balance

### 7.4 Test Scenario: Duplicate Webhook

1. Use Xendit callback simulator to send the same `payment.succeeded` event twice (same `id` field)
2. Expected result:
   - First delivery: `WebhookEvent.status = PROCESSED`
   - Second delivery: route returns 200 immediately, no handler called, no DB mutation
3. Verify: `SELECT * FROM webhook_events WHERE external_id = '...'` shows only one row

### 7.5 Test Scenario: Webhook with Invalid Token

1. Send a POST to `/api/billing/webhook/xendit` with wrong `x-callback-token`
2. Expected result: HTTP 400, no `WebhookEvent` row created

---

## 8. Migration Path: Stripe → Xendit for Philippine Deployments

If the system is currently running with `BILLING_PROVIDER=stripe` and needs to switch to Xendit for new Philippine businesses:

### Phase 1 — Parallel operation (both routes live)

Both `/api/billing/webhook/stripe` and `/api/billing/webhook/xendit` are always active regardless of `BILLING_PROVIDER`. This means:
- Existing Stripe businesses continue to receive and process Stripe webhooks
- New businesses onboarded after `BILLING_PROVIDER=xendit` is set use Xendit
- No existing subscriptions are migrated

### Phase 2 — Gradual migration (optional, future)

For each existing Stripe business that wants to switch:
1. Cancel their Stripe subscription at period end
2. At period end, create a Xendit subscription for the same business
3. Update `BusinessSubscription.externalId` to the Xendit plan ID
4. Update `Business.billingProvider` to `'xendit'`

This is a manual, per-business operation. Tooling can be added to the admin panel later.

### Decision: Per-Instance vs. Per-Business Provider

The current design uses a single `BILLING_PROVIDER` environment variable — all new subscriptions on a deployment use the same provider. This is the simplest approach for a solo developer and avoids the complexity of per-business provider routing in every server function.

If the business requires serving both international (Stripe) and Philippine (Xendit) customers from the same deployment, per-business provider routing would be needed. This is documented as a future enhancement — the `Business.billingProvider` field in the schema is the hook for that feature.

---

## 9. Failure Handling Reference

| Scenario | Immediate effect | Recovery path |
|---|---|---|
| Payment link creation fails (Xendit API error) | `createSubscription()` returns `success: false` | User retries from `/billing/plans`; error displayed in UI |
| Webhook delivery fails (Xendit can't reach server) | Xendit retries up to 5 times | Fix server availability; use Xendit dashboard to manually replay |
| Webhook processing throws exception | `WebhookEvent.status = ERROR`, HTTP 500, Xendit retries | Fix code bug; `ERROR` events are retried on next delivery |
| Xendit API outage during subscription creation | Server function returns error | User retries; outage is Xendit's problem; no partial state written |
| Duplicate webhook | Second delivery skipped (idempotency gate) | No action needed — this is correct behaviour |
| Invalid callback token | HTTP 400, no processing | Verify `XENDIT_WEBHOOK_TOKEN` matches Xendit dashboard setting |
| `XENDIT_SECRET_KEY` missing | Adapter factory throws at startup | Set env var; restart server |
| `BILLING_PROVIDER` set to unknown value | Factory throws at first adapter call | Set to `'stripe'` or `'xendit'` |
| Grace period expires, no payment | Lifecycle job: `GRACE_PERIOD → EXPIRED` | Owner pays to reactivate; or subscription lapses |
| Xendit plan ID not found in DB | Webhook handler returns SKIPPED | Check `BusinessSubscription.externalId` matches Xendit plan ID |

---

## 10. Known Limitations (Phase 1)

These are acknowledged limitations that are acceptable for the initial implementation and documented for future resolution.

**No refunds via API.** Refunds must be processed manually through the Xendit dashboard. A `createRefund()` adapter method is planned for Phase 2.

**No payment method management UI.** Customers cannot update their saved payment method from within the app. They must do this through Xendit's customer portal or by contacting support to re-initiate the payment flow.

**No prorated upgrades.** Upgrading a plan mid-period is a cancel + resubscribe. The customer pays the full new plan price at the next billing cycle. Xendit's Recurring Plans do not support proration natively.

**Cancel at period end is simulated.** Xendit has no native `cancel_at_period_end` flag. The lifecycle job handles the delayed cancellation. If the job fails to run on the transition date, cancellation is delayed until the next job run (daily).

**Static callback token.** Xendit's webhook authentication is weaker than Stripe's HMAC. This is standard for the platform and mitigated by HTTPS, but worth noting for security-conscious stakeholders.

**Single provider per deployment.** A single `BILLING_PROVIDER` env var applies to all new subscriptions. Per-business routing requires a future enhancement.

**No automated Xendit customer portal link.** Stripe provides a customer portal for payment method management. Xendit does not have an equivalent embeddable portal. Self-service payment method updates require a custom implementation or directing users to contact support.

---

## 11. Future Enhancements (Post-Phase 1)

Listed in rough priority order:

1. **Refund API support** — add `createRefund()` to `BillingProviderAdapter`; implement in both adapters; add refund UI to billing portal
2. **Payment method update flow** — guide customers through updating their saved payment method in Xendit
3. **Email notifications** — notify owners on payment failure, grace period entry, upcoming renewal
4. **Per-business billing provider** — `Business.billingProvider` field used in adapter factory for multi-provider deployments
5. **Proration on plan upgrade** — requires Xendit Recurring Plan schedule management
6. **Admin webhook replay UI** — admin panel endpoint to replay `ERROR` events from `WebhookEvent.rawPayload`
7. **Xendit customer portal link** — if Xendit introduces a hosted portal, integrate the link into `/billing`
8. **BIR invoice compliance** — Philippine tax authority requires specific invoice formats; add BIR-compliant invoice generation on top of the existing `BillingInvoice` model
