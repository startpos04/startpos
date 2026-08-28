
# Architecture Validation Report

**Date:** August 2026
**Status:** Pre-implementation validation — implementation blocked pending doc updates

---

## 1. Purpose

This report is the output of a structured validation pass against the Xendit integration architecture produced in the initial planning phase. Every assumption in `XENDIT_ARCHITECTURE.md`, `WEBHOOK_ARCHITECTURE.md`, `BILLING_STATE_MACHINE.md`, and `IMPLEMENTATION_PLAN.md` was verified against live Xendit documentation before any code was written.

The goal is not to redesign the system. The core abstractions — `BillingProviderAdapter`, the shared webhook handlers, the state machine, the schema additions — are all sound. The validation found **eight concrete errors** that must be corrected before implementation begins, plus one strategic recommendation on subscription approach.

---

## 2. Validated Assumptions (Correct)

These assumptions were verified against live Xendit documentation and are correct.

| Assumption | Verified |
|---|---|
| Xendit webhooks use `x-callback-token` header for verification (static token, not HMAC) | ✅ Confirmed — [docs.xendit.co/docs/handling-webhooks](https://docs.xendit.co/docs/handling-webhooks) |
| `xendit-node` npm package is the official Xendit SDK | ✅ Confirmed — published at github.com/xendit/xendit-node, last updated Oct 2025 |
| Xendit supports Payment Links / hosted checkout | ✅ Confirmed — now via Payment Sessions API (`POST /sessions`, `mode: PAYMENT_LINK`) |
| Xendit Recurring Plans exist (`POST /recurring/plans`) | ✅ Confirmed — still active, also accessible via `POST /sessions` with `session_type: SUBSCRIPTION` |
| `recurring.plan.inactivated` is a real webhook event | ✅ Confirmed — triggered when a plan is manually deactivated or all cycles complete |
| `recurring.cycle.failed` fires when all retries are exhausted | ✅ Confirmed |
| `payment.succeeded` fires on successful payment | ✅ Confirmed |
| Xendit sandbox uses `xnd_development_*` API keys | ✅ Confirmed |
| Xendit supports auto-debit activation per payment channel | ✅ Confirmed — required for recurring; self-serve on cards via dashboard |
| `BillingProviderAdapter` interface requires no changes | ✅ The interface methods map correctly once the adapter implementation is corrected |
| Adapter factory pattern (`createBillingAdapter()`) is correct | ✅ Sound architecture — no changes needed |
| `WebhookEvent` idempotency table is the right approach | ✅ Sound — Xendit may retry with new event IDs, making constraint-based dedup the correct primary gate |
| Phase 0 refactoring tasks (0.1–0.5) are correct | ✅ All internal refactors are valid and unaffected by the API findings |
| Phase 1 schema migrations are correct | ✅ All four schema additions are appropriate and unchanged |

---

## 3. Invalid Assumptions — Errors Requiring Correction

Eight assumptions in the planning documents were found to be incorrect against the current Xendit API. Each is documented with its impact and the required fix.

---

### Error 1 — Wrong webhook event name: `payment.failed` does not exist

**Severity: CRITICAL — will cause silent webhook drops at runtime**

**What was written (WEBHOOK_ARCHITECTURE.md §12, XENDIT_ARCHITECTURE.md §4.5):**
```
"payment.failed"  →  invoice.payment_failed  →  handleInvoicePaymentFailed
```

**What Xendit actually sends:**
```
"payment.failure"   (not "payment.failed")
```

Source: [docs.xendit.co/docs/migrate-from-legacy-subscriptions-to-new-subscriptions](https://docs.xendit.co/docs/migrate-from-legacy-subscriptions-to-new-subscriptions) and [docs.xendit.co/subscriptions-webhook](https://docs.xendit.co/subscriptions-webhook)

**Impact:** The normalisation switch in `XenditAdapter.normaliseXenditEvent()` will never match `payment.failed`. Payment failure events will fall through to the default `SKIPPED` branch. Failed payments will not move the subscription to `GRACE_PERIOD`. The system will silently ignore all Xendit payment failures.

**Fix:** Replace every occurrence of `payment.failed` with `payment.failure` in:
- `XENDIT_ARCHITECTURE.md §4.5`
- `WEBHOOK_ARCHITECTURE.md §12`
- `BILLING_STATE_MACHINE.md §5.1`
- `xendit-adapter.ts` (when written) — the normalisation switch must match `"payment.failure"`
- Unit test payloads in `xendit-adapter.test.ts`

---

### Error 2 — Wrong webhook event name: `recurring.payment.created` does not exist

**Severity: CRITICAL — will cause silent webhook drops at runtime**

**What was written (WEBHOOK_ARCHITECTURE.md §12, XENDIT_ARCHITECTURE.md §4.5):**
```
"recurring.payment.created"  →  customer.subscription.updated  →  handleSubscriptionUpdated
```

**What Xendit actually sends for renewal cycles:**
```
"recurring.cycle.succeeded"  (fires per cycle when payment succeeds)
"recurring.cycle.created"    (fires when next cycle is generated — no payment yet)
"recurring.cycle.retrying"   (fires when a retry is scheduled)
```

Source: [docs.xendit.co/subscriptions-webhook](https://docs.xendit.co/subscriptions-webhook)

**Impact:** There is no `recurring.payment.created` event. The subscription update handler will never fire via Xendit. Period dates (`currentPeriodStart` / `currentPeriodEnd`) will never advance. Subscription will appear perpetually in the original billing period.

**Fix:** Map `recurring.cycle.succeeded` → `customer.subscription.updated` for period date advancement. The `payment.succeeded` event arriving alongside it handles the payment side. Update all webhook mapping tables in the docs and in the adapter implementation.

---

### Error 3 — GCash cannot be used for recurring subscriptions (currently on-hold)

**Severity: HIGH — marketing claim, customer expectation, and test plan are all wrong**

**What was written (XENDIT_ARCHITECTURE.md §11, XENDIT_INTEGRATION_PLAN.md §3.1):**
> GCash (E-wallet) listed as an available recurring payment method

**What Xendit actually supports:**
GCash auto-debit for recurring subscriptions is **currently on-hold** in the Philippines as of 2025-2026. GCash can only be used for **one-time payments** (Payment Links / Payment Sessions without saving). For SaaS subscription renewals, the available payment methods requiring auto-debit are: credit/debit cards, Maya, GrabPay, ShopeePay (with CS approval), and direct debit (BPI, UBP — with extensive documentation).

Source: [help.xendit.co — How to activate auto debit](https://help.xendit.co/hc/en-us/articles/20698430664985-How-to-activate-auto-debit-to-support-Subscriptions-payments)

**Impact:**
- Customers who pay their first subscription with GCash will not be able to auto-renew
- Any marketing material or UI copy stating "subscribe with GCash" is incorrect for recurring billing
- Test plan Scenario 1 (successful subscription) needs to account for GCash NOT working as a recurring method
- GCash is still valid for one-time credit package purchases

**Fix:** Remove GCash from the list of recurring payment methods. Add a note that GCash is one-time-only. Update the supported payment methods table. The sandbox testing procedures must use cards or Maya for recurring subscription tests.

---

### Error 4 — Wrong API endpoint for creating payment sessions

**Severity: HIGH — adapter will call a deprecated endpoint**

**What was written (XENDIT_ARCHITECTURE.md §4.2, IMPLEMENTATION_PLAN.md Task 2.2):**
> `createCreditPurchaseLink` → Xendit Payment Links (`/payment-links`)
> `createSubscription` → `POST /recurring/plans`

**What Xendit currently recommends:**
Xendit has deprecated `/v2/invoices` and the legacy Payment Links product. The current stack is the **Payment Sessions API**: `POST /sessions`. Legacy endpoints still function but receive no new features and new channels are only available via the new API.

For Payment Links specifically: `POST /sessions` with `mode: PAYMENT_LINK` is the replacement.
For Subscriptions: `POST /sessions` with `session_type: SUBSCRIPTION` is the recommended flow for new integrations.

Source: [docs.xendit.co/docs/migrate-to-payment-session](https://docs.xendit.co/docs/migrate-to-payment-session)

**Impact:** The adapter will technically work with legacy endpoints for now, but:
- New payment channels (including newer GCash flows when available) will not appear on checkout
- The webhook model differs between legacy and new APIs — the new API fires `payment_session.completed` / `payment_session.expired`
- Technical debt begins at line 1 of the adapter

**Fix:** The adapter should use `POST /sessions` for both payment links and subscription setup. The `mode: PAYMENT_LINK` parameter maps exactly to what the architecture intended. This change is internal to the adapter only — the `BillingProviderAdapter` interface is unaffected.

---

### Error 5 — `XENDIT_PLAN_*_ID` env var concept does not map to Xendit's model

**Severity: MEDIUM — will require rethinking env var strategy before Phase 4**

**What was written (XENDIT_ARCHITECTURE.md §6.1, IMPLEMENTATION_PLAN.md Task 4.2):**
```bash
XENDIT_PLAN_STARTER_ID=<from Xendit dashboard>
XENDIT_PLAN_GROWTH_ID=<from Xendit dashboard>
```
Framed as equivalent to Stripe's `STRIPE_PLAN_STARTER_PRICE_ID` — a pre-created provider resource ID.

**What Xendit actually uses:**
Xendit Recurring Plans are **per-customer, dynamically created objects** — not templates. There is no "plan template" that produces an ID you configure in the dashboard. The plan amount, interval, and retry config are sent in the API request body each time.

For Stripe, the Price ID is immutable and pre-configured in the dashboard. For Xendit, the subscription parameters come from your application's own configuration (amount, currency, interval).

**Impact:** `XENDIT_PLAN_*_ID` env vars have no Xendit equivalent. The implementation as written would set these env vars to nothing useful. `create-subscription.ts` Task 4.2 code would always return `null` for the Xendit path.

**Fix:** Replace `XENDIT_PLAN_*_ID` env vars with `XENDIT_PLAN_*_AMOUNT` and `XENDIT_PLAN_*_CURRENCY`. Or encode plan config as JSON in a single env var. The adapter builds the subscription request from these values — no dashboard-side ID is needed. See `ASSUMPTIONS_AND_RISKS.md §3` for the recommended env var schema.

---

### Error 6 — Xendit Customer object assumption is partially wrong

**Severity: LOW — only affects the PAY_AND_SAVE recurring flow**

**What was written (XENDIT_ARCHITECTURE.md §4.3):**
> "Xendit does not have an equivalent customer concept — resources are identified by `reference_id`"

**What Xendit actually has:**
Xendit has a Customer API (`POST /customers`, returns `customer_id` like `cust-xxx`). The customer object is **required** when using `allow_save_payment_method` on a Payment Session and when creating Recurring Plans from a tokenized payment method.

For pure one-time Payment Links (`POST /sessions` with `session_type: PAY` and no save), the customer object is optional. So the assumption is correct for the credit purchase flow but wrong for the subscription-with-recurring flow.

**Impact:** The `createCustomer()` adapter method returning a synthetic `businessId` as the `externalCustomerId` will fail when the adapter tries to create a Recurring Plan that requires a real `customer_id`. The plan creation API will reject a `customer_id` that isn't a real `cust-xxx` ID.

**Fix:** For the Xendit recurring subscription flow, `createCustomer()` must make a real API call to `POST /customers` and return the actual `cust-xxx` ID. This customer ID is then used when creating the Recurring Plan. The `Business.externalCustomerId` field stores this `cust-xxx` value (already designed correctly in the schema). For credit purchase links only, the customer call remains optional.

---

### Error 7 — `getInvoice()` uses deprecated endpoint

**Severity: LOW — functional but locked to legacy**

**What was written (XENDIT_ARCHITECTURE.md §4.2):**
> `getInvoice` → `GET /v2/invoices/{id}` — legacy Xendit invoice endpoint

**What the current API provides:**
The `/v2/invoices` endpoint is the legacy Payment Link / Invoice product. For the new Payment Sessions flow, the equivalent is `GET /sessions/{payment_session_id}`. For subscription cycle tracking, use `GET /recurring/plans/{plan_id}/cycles`.

**Impact:** For new integrations using `POST /sessions`, there is no invoice ID to look up via `/v2/invoices`. The IDs returned by the new API are `payment_session_id` (prefixed `ps-`) and `plan_id` (prefixed `repl_`), not invoice IDs.

**Fix:** Repurpose `getInvoice()` in the Xendit adapter to call `GET /sessions/{id}` for payment session lookups, or `GET /recurring/plans/{id}` for subscription status queries. The method signature in `BillingProviderAdapter` does not need to change.

---

### Error 8 — Payment session expiry is unhandled

**Severity: MEDIUM — creates operational gaps for abandoned checkouts**

**What was not covered in any planning document:**
Xendit Payment Sessions expire after approximately 30 minutes by default. When a customer starts checkout but does not complete it (session expires), Xendit sends a `payment_session.expired` webhook.

**Impact:** An abandoned checkout creates a subscription record in a non-ACTIVE state (TRIAL or GRACE_PERIOD holding) that is never resolved. Without handling the expiry webhook, these records accumulate silently. The lifecycle job will eventually move them to EXPIRED, but the delay and lack of explicit handling is confusing for operators.

**Fix:** Add `payment_session.expired` to the webhook event mapping. The handler should either: (a) log the expiry to the `WebhookEvent` table and take no subscription action (let the lifecycle job handle it naturally), or (b) immediately notify the business owner to retry checkout. Option (a) is simpler and sufficient for Phase 1.

---

## 4. Subscription Strategy Review: Option A vs Option B

### The Options

**Option A — Recurring Plans (original design):**
1. First payment via Payment Session (`session_type: PAY` + `allow_save_payment_method: FORCED`)
2. On `payment_token.activation` webhook → create Recurring Plan using the saved token
3. Xendit auto-charges on each cycle; sends `recurring.cycle.succeeded` webhooks
4. Cancellation: set plan to INACTIVE

**Option B — Monthly Payment Link:**
1. Subscription status tracked locally; no recurring plan at provider
2. At each renewal date, the lifecycle job creates a new Payment Session and emails the link
3. Customer pays manually each month
4. No payment token saved; no auto-debit required

### Comparative Analysis

| Dimension | Option A (Recurring Plans) | Option B (Payment Link per cycle) |
|---|---|---|
| Implementation complexity | High — two-step setup, payment token lifecycle, plan management | Low — one Payment Session per cycle, no token management |
| Auto-debit activation required | Yes — must request per channel (3-day SLA for cards, instant for Maya) | No — one-time payments, no auto-debit needed |
| GCash support | No — GCash auto-debit is currently on-hold in Philippines | Yes — GCash works for one-time payments |
| Customer experience | Better — automatic renewals, no monthly action required | Worse — customer must click and pay each month |
| Churn risk | Lower — frictionless renewal | Higher — each payment link is a churn event |
| Failure recovery | Provider handles retries automatically (configurable) | Application must track non-payment and follow up |
| Provider coupling | High — plan lifecycle tightly coupled to Xendit | Low — only payment link creation is provider-specific |
| Solo developer sustainability | Low — more moving parts, more failure modes | High — simpler, fewer things to break |
| Operational complexity | Medium — plan status drift possible | Low — each cycle is self-contained |
| Scalability | High — scales to many customers without email volume | Medium — generates emails at scale |
| Time to implement | Phase 4 is the heaviest phase | Significantly shorter Phase 4 |

### Recommendation: Option B for Phase 1, Option A as Phase 2 upgrade

For a solo developer building a SaaS in the Philippines, Option B is meaningfully lower risk for Phase 1:

- GCash is the dominant payment method in the Philippines and cannot be used with Option A recurring plans right now
- Auto-debit activation has per-channel SLAs and approval processes that are out of your control
- Option A's two-step webhook flow (PAY_AND_SAVE → plan creation) is the most complex part of the integration and the hardest to test
- Option B's entire implementation is: create a Payment Session, handle `payment.succeeded`, advance the billing period — three steps, all already designed

Option B is not a compromise — it is the correct starting point. Many Philippine SaaS products use monthly invoices with payment links. The customer experience is worse than auto-debit, but it is a solved, predictable problem. Once launched and stable, Option A (auto-debit via cards or Maya) can be offered as an upgrade for customers who want frictionless renewals.

**The architecture does not need to change to accommodate this decision.** The `BillingProviderAdapter` interface, the state machine, the webhook handlers, and the schema are all Option B compatible. Only `XENDIT_ARCHITECTURE.md §4.4` (Subscription Flow) and `IMPLEMENTATION_PLAN.md Phase 4` need to be updated to reflect Option B as the Phase 1 strategy.

---

## 5. Provider Coupling Review

### Current Leakage Points

| Location | Leaked concept | Severity | Fix |
|---|---|---|---|
| `XENDIT_PLAN_*_ID` env vars | Stripe Price ID concept doesn't exist in Xendit | Medium | Replace with amount/interval config vars |
| `createCustomer()` no-op | Incorrect for recurring flows | Low | Real API call for subscription flow |
| `getInvoice()` → `/v2/invoices/{id}` | Legacy Xendit endpoint | Low | Map to `/sessions/{id}` |
| `payment.failed` in webhook mapping | Wrong event name | Critical | Replace with `payment.failure` |
| `recurring.payment.created` in mapping | Non-existent event | Critical | Replace with `recurring.cycle.succeeded` |
| `invoice.expired` in mapping | Not a subscription event | Low | Replace with `payment_session.expired` |
| `XENDIT_CREDIT_PKG_*_ID` | Maps correctly to a Payment Session parameter | ✅ No change needed |

### What Is Correctly Abstracted

The following concepts are already cleanly abstracted and require no changes:

- `BillingProviderAdapter` interface — zero Xendit types leak through
- `WebhookEvent` DTO — provider-agnostic by design
- Shared handler functions — operate on normalised types only
- `SubscriptionEngine` — zero provider awareness
- `CreditEngine`, `InvoiceEngine`, `UsageEngine` — zero provider awareness
- Schema fields (`externalId`, `externalCustomerId`, `externalInvoiceId`) — provider-agnostic strings

---

## 6. Operational Readiness Assessment

### What the Architecture Gets Right

- **`WebhookEvent` table** is the correct foundation for observability. It enables SQL-based incident investigation without needing external logging tools.
- **`PaymentAttempt` table** gives a complete payment history per business, queryable by operations.
- **`SubscriptionStatusHistory`** is the authoritative audit log — no transition happens without a record.
- **Manual replay** via `WebhookEvent.rawPayload` is the right self-service recovery mechanism.

### Operational Gaps to Address

**Gap 1: No polling fallback for missed webhooks**
If a Xendit webhook is never delivered (provider outage, DNS issue, network split), the subscription silently stays in its previous state. There is no reconciliation job that compares local state against the Xendit API.

Recommendation: Add a lightweight daily reconciliation step to the existing `subscription-lifecycle` job that queries `GET /sessions/{id}` for any subscription whose `currentPeriodEnd` has passed but whose status is still ACTIVE. This catches the "webhook was lost" scenario.

**Gap 2: No payment link status polling**
Under Option B, the application sends a payment link and waits for the webhook. If the customer pays but the webhook is delayed, the subscription shows as overdue. A polling fallback (`GET /sessions/{payment_session_id}`) on the lifecycle job fills this gap.

**Gap 3: No customer notification system**
Payment failure, grace period entry, and upcoming renewal have no notification path. This is noted as a future enhancement in `XENDIT_INTEGRATION_PLAN.md` but its absence is worth flagging as an operational gap — a solo developer will get support requests about "my subscription isn't working" without being able to redirect customers to a self-service notification.

**Gap 4: No admin replay endpoint (Phase 1)**
`WebhookEvent.rawPayload` enables replay but there is no admin HTTP endpoint to trigger it. For a solo developer, this means manually writing a script to replay from the DB. Acceptable for Phase 1 but should be in Phase 2.

---

## 7. Failure Scenario Coverage

Review of each scenario against the current architecture:

| Scenario | Covered? | Notes |
|---|---|---|
| Webhook never arrives | ⚠️ Partial | Lifecycle job catches TRIAL/GRACE_PERIOD expiry. No active reconciliation for ACTIVE subscriptions. |
| Webhook arrives twice | ✅ | `WebhookEvent` unique constraint gate. |
| Webhook arrives out of order | ✅ | Handlers check current status, not expected previous status. State machine rejects invalid transitions. |
| Payment succeeds but redirect fails | ✅ | Webhook confirms payment regardless of redirect. Status is correct. Customer may see stale UI until refresh. |
| Redirect succeeds but webhook delayed | ⚠️ | Customer returns to app, subscription still shows previous state. No polling. Clears on webhook arrival. |
| Payment session expires (customer abandons) | ❌ (Error 8) | `payment_session.expired` not handled. Records accumulate in non-ACTIVE state. |
| Customer retries payment | ✅ | New payment session created; webhook confirms on success. Idempotency gate handles if old session also resolves. |
| Provider (Xendit) experiences downtime | ✅ | Lifecycle job runs independently. Webhook delivery queued by Xendit and retried on recovery. |
| Webhook processing fails midway | ✅ | `WebhookEvent.status = ERROR`, HTTP 500 returned, Xendit retries. Error retry path documented. |
| Auto-debit activation not completed | ❌ | Not covered. Subscription creation will succeed (Payment Session created) but recurring charges will fail silently if auto-debit isn't enabled. Needs pre-flight check. |

---

## 8. Development Experience Assessment

### Strengths

- Phase 0 refactoring leaves a clean baseline with no regressions
- `BILLING_PROVIDER` env var enables instant switching between Stripe and Xendit
- `xendit-node` SDK is well-maintained with TypeScript support
- Pattern A tests for the adapter normalisation can be written and run entirely without Xendit credentials

### Gaps

**Local webhook testing requires ngrok** — no way around this with Xendit. Stripe CLI provides a local proxy; Xendit does not. This is not an architecture gap but it is a daily friction point. Mitigate by building a thin `MockXenditAdapter` (implements `BillingProviderAdapter`, returns configured responses without any HTTP calls) for local unit and integration tests.

**No feature flag for gradual rollout** — `BILLING_PROVIDER` is binary. If you want to test Xendit with 10% of new signups while keeping Stripe for the rest, the current design doesn't support that. Acceptable for Phase 1, but worth noting.

**Sandbox limitations** — Xendit sandbox does not simulate all failure scenarios reliably. Specifically, recurring plan charge failures are hard to trigger in sandbox. Plan for this by writing unit tests that construct failure payloads manually rather than relying on sandbox delivery.

---

## 9. Recommended Implementation Order (Revised)

The phase order in `IMPLEMENTATION_PLAN.md` remains correct. These refinements apply within Phase 4:

**Original Phase 4 order:**
1. Update credit package env vars
2. Update create-subscription for Xendit
3. First-payment → recurring plan activation (in webhook handler)
4. Sandbox validation

**Revised Phase 4 order (Option B):**
1. Update credit package env vars (unchanged)
2. Update create-subscription to use `POST /sessions` with `mode: PAYMENT_LINK`, amount from `XENDIT_PLAN_*_AMOUNT` config
3. Handle `payment.succeeded` webhook for first subscription payment → activate subscription, no recurring plan in Phase 1
4. Handle `payment_session.expired` → log to WebhookEvent, no subscription change
5. Sandbox validation

This is simpler than the original Phase 4 because there is no two-step webhook chain and no recurring plan management.

---

## 10. Outstanding Questions for Xendit Onboarding

These questions must be answered with your Xendit account manager before going live:

1. **Auto-debit status:** For Option A (Phase 2), what is the current activation timeline for card recurring and Maya recurring in the Philippines? Is there a way to test this in sandbox?
2. **GCash recurring timeline:** When is GCash auto-debit for subscriptions expected to be available again in the Philippines?
3. **Payment session expiry:** Can the 30-minute default session expiry be extended? For SaaS subscriptions where the owner needs to review the plan before paying, 30 minutes may be too short.
4. **Webhook IP ranges:** Are Xendit's callback source IPs published for allowlisting? (For Nginx / Cloudflare defence-in-depth)
5. **Callback token rotation:** What is the recommended procedure for rotating `XENDIT_WEBHOOK_TOKEN` with zero missed events? Is there a grace period where both old and new tokens are accepted?
6. **Sandbox limitations:** Are failed recurring cycle scenarios simulatable in sandbox, or must they be tested in production with a card that declines?

---

## 11. Production Readiness Assessment

| Area | Status | Notes |
|---|---|---|
| Provider abstraction | ✅ Ready | Interface is clean. No rework needed. |
| Webhook infrastructure | ✅ Ready | After Error 1 + Error 2 fixes |
| State machine | ✅ Ready | No changes needed |
| Schema | ✅ Ready | Phase 1 migrations are correct |
| Adapter factory | ✅ Ready | Correct approach |
| Xendit event mapping | ❌ Not ready | Errors 1 and 2 must be fixed before any code is written |
| Subscription flow | ❌ Not ready | Must decide Option A or B; env vars need redesign (Error 5) |
| GCash recurring | ❌ Not available | Cannot promise to customers until Xendit lifts on-hold status |
| Customer creation | ⚠️ Partial | Must be a real API call for Option A; acceptable as no-op for Option B |
| Payment session expiry | ❌ Not covered | Error 8 — add `payment_session.expired` handling |
| Operational tooling | ⚠️ Partial | `WebhookEvent` table covers 80%. Admin replay endpoint missing. |

**Overall assessment:** Architecture is sound. Six specific errors and one strategic decision (Option B) must be resolved before Phase 2 begins. None of these require structural changes — they are corrections to event names, endpoint references, env var design, and a simplification of the subscription flow.
