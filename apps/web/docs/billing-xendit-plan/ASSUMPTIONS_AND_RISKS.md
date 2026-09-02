
# Assumptions and Risks

**Version:** Post-validation (August 2026)
**Read in conjunction with:** `ARCHITECTURE_VALIDATION_REPORT.md`

This document is a forward-looking register. It records:
- every assumption the architecture still relies on (even the validated ones),
- the risk each assumption carries if it turns out to be wrong,
- and the open technical risks that exist regardless of assumptions.

It is intended to be updated as the system evolves. Mark resolved items rather than deleting them — the history matters.

---

## Section 1 — Xendit API Assumptions

These are assumptions about Xendit's API behaviour that the adapter implementation will depend on. Verified assumptions are marked. Unverified or fragile assumptions are flagged for monitoring.

---

### A1 — Payment Sessions API is stable and not imminently deprecated

**Status:** Assumed stable (current, not deprecated)
**Confidence:** High — Xendit is actively adding features here; it is the stated future of their platform
**Risk if wrong:** If Xendit deprecates `POST /sessions` before this integration ships, the adapter needs a new endpoint. The `BillingProviderAdapter` interface is unaffected.
**Monitoring:** Watch [docs.xendit.co/docs/migrating-to-xendit-s-latest-payments-stack](https://docs.xendit.co/docs/migrating-to-xendit-s-latest-payments-stack) for deprecation notices

---

### A2 — `x-callback-token` verification remains the standard webhook security model

**Status:** Verified against current docs
**Confidence:** High — static token is documented and unchanged
**Risk if wrong:** If Xendit introduces HMAC-based verification, the `verifyWebhookSignature()` implementation becomes wrong. Likelihood is low but not zero — Xendit may improve security in a future API version.
**Monitoring:** Watch Xendit changelog for webhook security changes. The adapter method signature is already correct for an HMAC upgrade — only the implementation changes.

---

### A3 — Webhook event names are stable (`payment.succeeded`, `payment.failure`, `recurring.cycle.succeeded`, `recurring.plan.inactivated`)

**Status:** Verified against current docs (July 2026)
**Confidence:** Medium — Xendit has renamed events before (legacy → new subscription migration changed event names)
**Risk if wrong:** Adapter normalisation switch will silently drop unrecognised events. The `WebhookEvent` table logs all received event types — mismatches will be visible in the `eventType` column but no handler fires.
**Monitoring:** After go-live, query `SELECT DISTINCT event_type FROM webhook_events WHERE provider = 'xendit'` to confirm actual event names match expectations. Do this in the first week of production.

---

### A4 — `payment.succeeded` fires for every successful subscription renewal cycle

**Status:** Verified — `recurring.cycle.succeeded` arrives alongside `payment.succeeded`
**Confidence:** High
**Risk if wrong:** If Xendit sends only `recurring.cycle.succeeded` without `payment.succeeded` for some edge case, `handleInvoicePaid` (which relies on `payment.succeeded`) would not fire. Subscription period would not advance.
**Mitigation already in place:** Handle `recurring.cycle.succeeded` as a separate trigger for `handleSubscriptionUpdated` (period date sync). Period advancement should not depend solely on `payment.succeeded`.

---

### A5 — GCash one-time payments (Payment Links) are available in the Philippines

**Status:** Verified — GCash supports one-time payments; only auto-debit (recurring) is on-hold
**Confidence:** High for one-time; zero for recurring
**Impact on design:** Credit package purchases (one-time payment links) can offer GCash. Subscription renewals cannot use GCash auto-debit.
**Risk if wrong:** If Xendit further restricts GCash (e.g. requires additional verification for payment links), credit purchases via GCash would stop working. No application-level protection against this.

---

### A6 — Maya/GrabPay auto-debit activation is instant

**Status:** Verified — Xendit help docs confirm instant activation for Maya/GrabPay
**Confidence:** Medium — "instant" in Xendit's docs may mean "within the business day" in practice
**Risk:** If activation takes days rather than minutes, sandbox testing of recurring Maya flows is blocked. Only cards (3-day SLA) and instant channels can be tested for recurring. Mitigation: test recurring with cards in sandbox first.

---

### A7 — Xendit sandbox accurately represents production behaviour

**Status:** Assumed — cannot be fully verified without production traffic
**Confidence:** Medium — Xendit sandbox is known to have some discrepancies with production for less-common payment flows
**Risk if wrong:** A flow that works in sandbox fails in production. The gap is most likely in:
- e-wallet auto-debit behaviour
- Payment session expiry timing
- Webhook delivery reliability under load
**Mitigation:** The smoke test in Phase 6 on production (with a real payment) is the only way to validate this. Budget for at least one failed production test.

---

### A8 — `POST /sessions` response always includes `payment_link_url` when `mode: PAYMENT_LINK`

**Status:** Verified from docs example responses
**Confidence:** High
**Risk if wrong:** `createCreditPurchaseLink()` and `createSubscription()` both return `checkoutUrl` from this field. If it is null or missing, the client redirect fails with no URL. Add a null guard and a descriptive error in the adapter.

---

### A9 — Payment session expiry is ~30 minutes (configurable via `expires_at`)

**Status:** Verified from docs (`expires_at` field is in the response)
**Confidence:** High — `expires_at` is a configurable timestamp, not a fixed duration
**Implication:** The adapter should set `expires_at` to a reasonable window when creating payment sessions (e.g. 24 hours for subscription checkout, 1 hour for credit purchases). The 30-minute default shown in docs is for the Xendit-hosted page — it can be extended via the `expires_at` parameter.
**Risk if wrong:** Customers with slow decision cycles may arrive at an expired payment page.

---

### A10 — `xendit-node` SDK types are accurate and up to date

**Status:** Assumed — SDK was last updated May 2025; Payment Sessions API types may be newer
**Confidence:** Medium — SDK is auto-generated from OpenAPI spec, so types should track the API
**Risk if wrong:** TypeScript errors during adapter implementation; may need to use raw `fetch` for endpoints not yet in the SDK. The adapter is isolated — any SDK gap affects only `xendit-adapter.ts`.

---

## Section 2 — Architecture Assumptions

These are assumptions about the application's own architecture that the integration relies on.

---

### A11 — `BILLING_PROVIDER` env var is sufficient for provider selection (single provider per deployment)

**Status:** Intentional design decision
**Confidence:** Accepted limitation
**Risk:** If the platform needs to serve both Stripe (international) and Xendit (Philippine) businesses simultaneously from a single deployment, this design fails. Each `createBillingAdapter()` call returns one provider only.
**Mitigation path:** `Business.billingProvider` field is already in the schema. When per-business routing is needed, `createBillingAdapter()` can accept an optional `providerName` parameter derived from the business record.

---

### A12 — The `WebhookEvent.externalId` is unique per provider delivery

**Status:** Assumed for Stripe (Stripe event IDs are globally unique). Assumed for Xendit (Xendit event IDs appear in payload).
**Confidence:** High for Stripe; Medium for Xendit
**Risk:** Xendit may re-deliver a failed event with a new `id` (different from the original). In this case, the constraint-based idempotency gate does not protect against duplicate business logic execution. The handler-level secondary checks (e.g. "is this invoice already PAID?") are the fallback.
**Note:** This is documented in `WEBHOOK_ARCHITECTURE.md §6.3` and is an accepted known limitation.

---

### A13 — `BusinessSubscription.externalId` stores the Xendit plan ID for Option A, or null for Option B

**Status:** Intentional design
**Risk for Option B:** With no recurring plan, `externalId` is null for Xendit Option B subscriptions. Any code that assumes `externalId` is non-null for an ACTIVE subscription must guard against null. The webhook handler lookup `BusinessSubscription.findFirst({ where: { externalId: sub.externalSubscriptionId } })` will correctly find nothing for a null `externalId` row.
**Mitigation:** Handler secondary checks resolve business by `businessId` from metadata when `externalId` lookup fails.

---

### A14 — The `BillingProviderAdapter` interface does not need a `createRenewalPaymentLink()` method for Option B

**Status:** Assumption — Option B requires sending a renewal link at period end, which is not currently in the interface
**Risk:** Option B renewals require a new adapter method (or reuse of `createCreditPurchaseLink()` with different metadata). The interface is extensible — adding a method is non-breaking for the Stripe adapter (can return `null` or `not_supported`).
**Resolution needed:** Before Phase 4, decide whether to add `createRenewalLink()` to the interface or reuse `createCreditPurchaseLink()` with a different `metadata.source` value (e.g. `source: 'subscription_renewal'`).

---

### A15 — The lifecycle job runs daily and is reliable enough for billing-critical transitions

**Status:** Accepted design limitation
**Risk:** The lifecycle job handles: TRIAL expiry, GRACE_PERIOD expiry, LONG_TERM_INACTIVE promotion, and (for Xendit Option B) cancel-at-period-end execution. A job failure means these transitions are delayed by up to 24 hours.
**Mitigation:** The grace period is 7 days — a 24-hour job failure is acceptable. Subscription cancellations delayed by one day are acceptable. If a job fails, the next day's run catches up (idempotent design).
**Monitor:** Alert on job failure. Log job results to a `JobRun` table or application log with duration and processed/skipped counts.

---

## Section 3 — Environment Variable Design (Revised)

The original `XENDIT_PLAN_*_ID` env var design is wrong (see Error 5 in `ARCHITECTURE_VALIDATION_REPORT.md`). The corrected design:

### Recommended env var schema for Option B (Phase 1)

Xendit does not have pre-created plan template IDs. The plan configuration (amount, currency, interval) comes from your application. Store it as env vars:

```bash
# Plan amounts — in cents (PHP)
XENDIT_PLAN_STARTER_AMOUNT=49900      # ₱499/month
XENDIT_PLAN_GROWTH_AMOUNT=99900       # ₱999/month
XENDIT_PLAN_PREMIUM_AMOUNT=199900     # ₱1,999/month

# Currency (default PHP for all plans)
XENDIT_PLAN_CURRENCY=PHP

# Payment session expiry for subscription checkout (ISO 8601 duration or timestamp offset)
# Set to 24 hours to give business owners time to review before paying
XENDIT_SESSION_EXPIRY_HOURS=24
```

For credit packages (these still use a Payment Session per-purchase, no template ID needed):

```bash
# Credit package amounts — in cents (PHP)
XENDIT_CREDIT_PKG_10_AMOUNT=5000     # ₱50
XENDIT_CREDIT_PKG_50_AMOUNT=22000    # ₱220
XENDIT_CREDIT_PKG_100_AMOUNT=40000   # ₱400
```

Remove from `.env.example`:
```bash
# REMOVE THESE — wrong concept for Xendit:
# XENDIT_PLAN_STARTER_ID=
# XENDIT_PLAN_GROWTH_ID=
# XENDIT_PLAN_PREMIUM_ID=
# XENDIT_CREDIT_PKG_10_ID=
# XENDIT_CREDIT_PKG_50_ID=
# XENDIT_CREDIT_PKG_100_ID=
```

### For Option A (Phase 2 — when implemented)

Option A still uses `POST /recurring/plans` per customer — still no template ID. The same amount env vars apply. The interval is always `MONTH` / `interval_count: 1` for monthly SaaS. No additional env vars are needed beyond the amounts.

---

## Section 4 — Technical Risks

Risks that exist independent of API assumptions.

---

### R1 — Webhook delivery is best-effort; payment state can diverge from provider state

**Probability:** Low per event, near-certain over months of operation
**Impact:** Medium — a subscription shows ACTIVE in the DB while the provider has no active plan
**Mitigation:** The reconciliation gap identified in `ARCHITECTURE_VALIDATION_REPORT.md §6` (Operational Gap 1). A daily reconciliation step comparing `currentPeriodEnd` against provider state resolves this without real-time polling.
**Priority:** Phase 2

---

### R2 — Auto-debit activation is outside the developer's control

**Probability:** High (it is a guaranteed prerequisite for Option A)
**Impact:** High if attempting Option A without activation; zero impact for Option B
**Mitigation:** Adopt Option B for Phase 1. Do not promise customers auto-debit renewals until activation is confirmed. Track activation status in a feature flag or system config.

---

### R3 — `payment.succeeded` ambiguity (credit purchase vs subscription renewal)

**Probability:** Low — relies on `metadata.source` being correctly set at checkout creation
**Impact:** High — a credit purchase could be misidentified as a subscription renewal and trigger TRIAL → ACTIVE instead of CreditLedger insert
**Mitigation already designed:** The adapter normalises based on `metadata.source`. If `source === 'credit_purchase'`, maps to `checkout.session.completed`. Otherwise maps to `invoice.paid`. The unit tests for this disambiguation are mandatory (already in the test plan).
**Additional mitigation:** The handler for `checkout.session.completed` checks for a credit-specific metadata field (`creditAmount`) before inserting the ledger entry. Missing metadata returns SKIPPED, not an error.

---

### R4 — Concurrent subscription creation for the same business

**Probability:** Very low (requires double-submit within milliseconds)
**Impact:** Low — `BusinessSubscription` has `@unique` on `businessId`. Second insert fails with a constraint violation. The idempotency check in `createSubscription.ts` catches this (`if (existingSubscription.externalId) return alreadyActive`).
**Residual risk:** A race between two concurrent `createSubscription` calls that both pass the `externalId` check before either writes. Results in two provider subscriptions for one business. Handle by checking `externalId` inside a `$transaction` with a `SELECT FOR UPDATE` equivalent, or by relying on the provider to reject a duplicate customer subscription.

---

### R5 — Legacy Xendit endpoints stop accepting new requests before migration is complete

**Probability:** Low — Xendit is known to maintain legacy endpoints for years
**Impact:** Medium — credit package purchases and any code using `/v2/invoices` stops working
**Mitigation:** Phase 2 should migrate all adapter calls to `POST /sessions`. The `BillingProviderAdapter` interface is unchanged — only `xendit-adapter.ts` is updated.

---

### R6 — `WebhookEvent.rawPayload` contains sensitive data

**Probability:** Medium — Xendit payloads may include masked PAN digits or partial account numbers
**Impact:** Low — data is stored in a server-side DB with tenant isolation; not exposed to the client
**Mitigation:** The `rawPayload` field stores the full provider payload for replay purposes. Ensure the `webhook_events` table is excluded from any data export features. Do not include `rawPayload` in admin UI displays — show `eventType`, `status`, and `errorMessage` only.

---

### R7 — `XENDIT_WEBHOOK_TOKEN` rotation causes missed events

**Probability:** Low during normal operation; near-certain on first rotation
**Impact:** Medium — webhook events during the rotation window are rejected (400) and may be retried with the new token before the old one expires
**Mitigation:** Xendit does not support token grace periods (unlike Stripe's dual-secret rotation). Rotation procedure: (1) update `XENDIT_WEBHOOK_TOKEN` in deploy secrets, (2) deploy the new env var, (3) immediately update the token in the Xendit dashboard. The window between steps 2 and 3 is the risk window. Minimise by doing both in rapid succession during low-traffic hours.

---

### R8 — `subscription-lifecycle` job and webhook handler produce conflicting transitions

**Probability:** Very low — the lifecycle job and webhook handler can both attempt to transition the same subscription simultaneously
**Impact:** Low — one transaction wins; the other sees the state has already changed and the state machine rejects the invalid transition as a no-op
**Existing protection:** `SubscriptionEngine.canTransition()` returns `opFail` for invalid transitions. The handler returns `SKIPPED`. No data corruption occurs.

---

## Section 5 — Decision Log

Decisions made during validation that differ from the initial planning documents. These are recorded here so future maintainers understand why the implementation diverges from the original plan.

| Decision | Original plan | Revised decision | Reason |
|---|---|---|---|
| Subscription strategy Phase 1 | Option A (Recurring Plans with auto-debit) | **Option B (monthly payment link per cycle)** | GCash auto-debit on-hold; auto-debit activation has per-channel SLAs outside developer control; Option B is simpler and works with all payment methods |
| `XENDIT_PLAN_*_ID` env vars | Mirror Stripe's Price ID concept | **Replace with `XENDIT_PLAN_*_AMOUNT` config** | Xendit has no plan template ID concept; plans are per-customer dynamic objects |
| Webhook failure event name | `payment.failed` | **`payment.failure`** | Verified against live docs — wrong name would silently drop all failure events |
| Renewal webhook event | `recurring.payment.created` | **`recurring.cycle.succeeded`** | Non-existent event in current Xendit API |
| Primary subscription API | `POST /recurring/plans` | **`POST /sessions` with `session_type: SUBSCRIPTION`** | Legacy endpoint; new API is `POST /sessions` |
| Payment link API | `/payment-links` or `/v2/invoices` | **`POST /sessions` with `mode: PAYMENT_LINK`** | Legacy endpoint migration — use new API for all new code |
| `createCustomer()` implementation | No-op, return `businessId` as synthetic ID | **Real API call for Option A; no-op acceptable for Option B** | Xendit Customer API exists and is required for PAY_AND_SAVE recurring flows |
| GCash recurring support | Listed as supported | **GCash is one-time only; recurring is on-hold** | Verified against Xendit support documentation |

---

## Section 6 — Monitoring Checklist (Post-Launch)

After going live, verify these within the first 7 days:

- [ ] Query `webhook_events` table — confirm actual Xendit event type names match the normalisation mapping (see A3)
- [ ] Confirm `payment.succeeded` events are being received and processed (not silently dropped)
- [ ] Confirm no `payment.failed` events appear in `webhook_events.event_type` (would indicate wrong event name is still in production)
- [ ] Confirm `payment_session.expired` events are being logged (even if no handler fires)
- [ ] Verify `BusinessSubscription.currentPeriodEnd` advances after a successful renewal payment
- [ ] Verify `PaymentAttempt` rows are created for each `payment.succeeded` and `payment.failure` event
- [ ] Check Xendit dashboard — confirm all webhook deliveries show HTTP 200 responses
- [ ] Confirm no `WebhookEvent` rows with `status = ERROR` accumulate in the first week
