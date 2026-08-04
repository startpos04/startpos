# Billing State Machine

## 1. Purpose

This document is the authoritative reference for every subscription lifecycle state, every valid transition between states, and every actor or event that can trigger a transition. It covers both the existing system and the changes introduced by Xendit integration.

The state machine is implemented in `src/lib/billing/subscription-engine.ts` as `VALID_TRANSITIONS`. This document is the human-readable specification that the code must always match.

---

## 2. States

### TRIAL

The initial state for every new business. Access to all plan features is granted. No payment has been collected.

- Entry: automatic at business registration (auto-provisioned by `auth-server.ts`)
- Duration: `TRIAL_DURATION_DAYS` system config value (default: 30 days), measured from `BusinessSubscription.trialEndsAt`
- Payment required: no
- Feature access: full, as defined by the Trial plan entitlements
- Exits to: `ACTIVE`, `EXPIRED`, `CANCELLED`, `SUSPENDED`

### ACTIVE

The subscription is fully paid and current. This is the normal operating state.

- Entry: payment confirmed (via webhook `invoice.paid` / `payment.succeeded`), or immediate after trial conversion with no payment required
- Duration: one billing period (`currentPeriodStart` → `currentPeriodEnd`). Renewed automatically via provider webhook at each period end.
- Payment required: yes — collected by the billing provider on a recurring schedule
- Feature access: full, as defined by plan entitlements
- Exits to: `GRACE_PERIOD`, `EXPIRED`, `SUSPENDED`, `CANCELLED`

### GRACE_PERIOD

Payment has failed but the account is not yet locked. The business retains full access during this window to allow payment recovery without operational disruption.

- Entry: `invoice.payment_failed` webhook received while `ACTIVE`
- Duration: `GRACE_PERIOD_DAYS` system config value (default: 7 days), measured from `BusinessSubscription.gracePeriodEndsAt`
- Payment required: yes — overdue
- Feature access: full (same as ACTIVE) — intentional; the grace period is a recovery window
- Exits to: `ACTIVE` (payment recovered), `EXPIRED` (grace window closes), `SUSPENDED` (admin action), `CANCELLED` (business cancels)

### EXPIRED

The billing period has ended and no payment was received during the grace window. Feature access is blocked for operational features.

- Entry: `subscription-lifecycle` background job when `gracePeriodEndsAt` is in the past, or when a TRIAL subscription's `trialEndsAt` passes
- Duration: until the business reactivates or reaches `LONG_TERM_INACTIVE_DAYS` threshold
- Payment required: yes — to reactivate
- Feature access: blocked for `isOperational = true` features. Management features (reporting, settings, data export) remain accessible.
- Exits to: `ACTIVE` (reactivation with payment), `LONG_TERM_INACTIVE` (prolonged inactivity), `CANCELLED` (explicit cancellation)

### SUSPENDED

An admin has manually suspended the account. Distinct from expiry — this is a deliberate platform action (e.g. abuse, compliance hold, payment dispute investigation).

- Entry: explicit admin action via admin panel
- Duration: indefinite, until admin lifts it
- Payment required: not applicable during suspension
- Feature access: all operational features blocked. Read-only access to data may be preserved at admin discretion.
- Exits to: `ACTIVE` (admin reinstates), `CANCELLED` (admin cancels suspended account)

### LONG_TERM_INACTIVE

The subscription has been expired for longer than `LONG_TERM_INACTIVE_DAYS` (default: 90 days) without any reactivation attempt. This state enables tiered data archival and storage reclamation policies.

- Entry: `subscription-lifecycle` background job when `expiredAt + LONG_TERM_INACTIVE_DAYS` is in the past
- Duration: indefinite
- Payment required: yes — to reactivate
- Feature access: all operational features blocked. May trigger data archival (future policy).
- Exits to: `ACTIVE` (business reactivates), `CANCELLED` (explicit cancellation)

### CANCELLED

The subscription has been explicitly cancelled by the business owner or the billing provider (e.g. repeated payment failure after all retries exhausted). This is a terminal state — re-entry requires creating a brand-new subscription.

- Entry:
  - Business-initiated: `cancel-subscription.ts` server function
  - Provider-initiated: `customer.subscription.deleted` / `recurring.plan.inactivated` webhook
  - Immediate: access revoked at cancellation time
  - Scheduled: `cancelledAt` is set now but status remains `ACTIVE` or `GRACE_PERIOD` until `currentPeriodEnd`, at which point the lifecycle job finalises the transition
- Payment required: no
- Feature access: all operational features blocked. Data is retained for the retention period.
- Exits to: `ACTIVE` (business resubscribes — creates a new subscription row or reactivates this one)

---

## 3. Transition Table

Every valid state → state transition in the system.

| From | To | Trigger | Actor |
|---|---|---|---|
| `TRIAL` | `ACTIVE` | First payment confirmed (webhook) | `PAYMENT` |
| `TRIAL` | `EXPIRED` | `trialEndsAt` in the past | `SYSTEM` (lifecycle job) |
| `TRIAL` | `CANCELLED` | Business owner cancels during trial | `USER` |
| `TRIAL` | `SUSPENDED` | Admin manual action | `ADMIN` |
| `ACTIVE` | `GRACE_PERIOD` | `invoice.payment_failed` webhook | `PAYMENT` |
| `ACTIVE` | `EXPIRED` | Grace period ends (should be rare — GRACE_PERIOD is the normal intermediary) | `SYSTEM` |
| `ACTIVE` | `SUSPENDED` | Admin manual action | `ADMIN` |
| `ACTIVE` | `CANCELLED` | Business owner cancels; or provider subscription deleted | `USER` / `PAYMENT` |
| `GRACE_PERIOD` | `ACTIVE` | Payment recovered (`invoice.paid` webhook during grace) | `PAYMENT` |
| `GRACE_PERIOD` | `EXPIRED` | `gracePeriodEndsAt` in the past | `SYSTEM` (lifecycle job) |
| `GRACE_PERIOD` | `SUSPENDED` | Admin manual action | `ADMIN` |
| `GRACE_PERIOD` | `CANCELLED` | Business owner cancels during grace | `USER` |
| `EXPIRED` | `ACTIVE` | Business pays and reactivates | `PAYMENT` |
| `EXPIRED` | `LONG_TERM_INACTIVE` | `expiredAt + LONG_TERM_INACTIVE_DAYS` in the past | `SYSTEM` (lifecycle job) |
| `EXPIRED` | `CANCELLED` | Business explicitly cancels | `USER` |
| `SUSPENDED` | `ACTIVE` | Admin lifts suspension | `ADMIN` |
| `SUSPENDED` | `CANCELLED` | Admin cancels suspended account | `ADMIN` |
| `LONG_TERM_INACTIVE` | `ACTIVE` | Business reactivates | `PAYMENT` |
| `LONG_TERM_INACTIVE` | `CANCELLED` | Business explicitly cancels | `USER` |
| `CANCELLED` | `ACTIVE` | Business resubscribes | `PAYMENT` |

Transitions not in this table are invalid. `SubscriptionEngine.canTransition()` enforces this at runtime — it returns `opFail('PRECONDITION_FAILED', ...)` for any unlisted edge.

---

## 4. State Diagram

```
                     ┌─────────┐
           register  │         │  trialEndsAt passes
           ─────────►│  TRIAL  │──────────────────────────────────┐
                     │         │                                  │
                     └────┬────┘                                  │
                          │  payment confirmed                    │
                          ▼                                       │
                     ┌─────────┐  payment failed                  │
                     │         │───────────────►┌──────────────┐  │
                     │ ACTIVE  │                │ GRACE_PERIOD │  │
                     │         │◄───────────────│              │  │
                     └────┬────┘  payment ok   └──────┬───────┘  │
                          │                           │           │
              admin       │  cancel/provider          │ grace     │ trial
              suspend     │  deletes sub              │ expires   │ ends
                ┌─────────┤                           │           │
                ▼         │                           │           │
          ┌───────────┐   │                           │           │
          │ SUSPENDED │   │                           ▼           │
          │           │   │              ┌──────────────────┐     │
          └─────┬─────┘   └────────────►│                  │◄────┘
                │ admin                 │    EXPIRED        │
                │ reinstates            │                   │
                │                      └────────┬──────────┘
                └──────────────►ACTIVE          │
                                                │ LONG_TERM_INACTIVE_DAYS
                                                ▼
                                  ┌─────────────────────────┐
                                  │    LONG_TERM_INACTIVE   │
                                  └────────────┬────────────┘
                                               │
                                  ─────────────┘
                               (all states can reach CANCELLED via explicit action)
                                  CANCELLED ──► ACTIVE (resubscribe)
```

---

## 5. Transition Triggers in Detail

### 5.1 PAYMENT Trigger

Fired by incoming webhooks. The webhook handler looks up `BusinessSubscription` by `externalId` (the provider subscription/plan ID) and applies the transition after validating via `SubscriptionEngine.canTransition()`.

All payment trigger transitions are atomic — status update + `SubscriptionStatusHistory` row are written in a single `rootPrisma.$transaction`.

**Webhook events that fire PAYMENT transitions:**

> **Post-validation correction:** `payment.failed` → corrected to `payment.failure`. `recurring.payment.created` → corrected to `recurring.cycle.succeeded`. See `ARCHITECTURE_VALIDATION_REPORT.md` Errors 1 and 2.

| Webhook event | Normalised type | Transition |
|---|---|---|
| Stripe `invoice.paid` / Xendit `payment.succeeded` (subscription) | `invoice.paid` | `GRACE_PERIOD → ACTIVE`, `TRIAL → ACTIVE` |
| Stripe `invoice.payment_failed` / Xendit `payment.failure` *(not `payment.failed`)* | `invoice.payment_failed` | `ACTIVE → GRACE_PERIOD` |
| Stripe `customer.subscription.deleted` / Xendit `recurring.plan.inactivated` | `customer.subscription.deleted` | `* → CANCELLED` |
| Stripe `customer.subscription.updated` / Xendit `recurring.cycle.succeeded` *(not `recurring.payment.created`)* | `customer.subscription.updated` | Period date sync; status change if provider status changed |
| Stripe `checkout.session.completed` / Xendit `payment.succeeded` (`source: credit_purchase`) | `checkout.session.completed` | No subscription transition — inserts `CreditLedger` PURCHASE entry |

### 5.2 SYSTEM Trigger

Fired by the `subscription-lifecycle` background job (daily cron). Evaluates all subscriptions in `TRIAL`, `GRACE_PERIOD`, and `EXPIRED` states.

The job calls:
- `SubscriptionEngine.evaluateTrialExpiry()` — `TRIAL → EXPIRED`
- `SubscriptionEngine.evaluateGracePeriodExpiry()` — `GRACE_PERIOD → EXPIRED`
- `SubscriptionEngine.evaluateLongTermInactivity()` — `EXPIRED → LONG_TERM_INACTIVE`

The job is idempotent — re-running it on already-transitioned subscriptions produces no-ops because the source state no longer matches.

### 5.3 USER Trigger

Fired by the `cancelSubscription` server function. Validates the transition via `SubscriptionEngine.canTransition()`, calls the billing provider adapter to cancel the provider subscription, then writes the DB update + history record atomically.

### 5.4 ADMIN Trigger

Currently, admin transitions (SUSPEND, REINSTATE) are performed directly via Prisma in admin panel server functions. They follow the same pattern: validate with the engine, write atomically with a history record.

---

## 6. Invoice Lifecycle

Invoices are closely coupled to subscription billing periods but have their own status machine. They live in `BillingInvoice`.

### Invoice States

| State | Meaning |
|---|---|
| `DRAFT` | Invoice is being assembled by the generation job. Not yet sent. |
| `OPEN` | Invoice has been generated. Payment is due. |
| `PAID` | Payment confirmed — either by provider webhook or manual confirmation. |
| `VOID` | Invoice was cancelled (error, duplicate, adjustment). |
| `UNCOLLECTIBLE` | Deemed uncollectible after exhausting all retry attempts. Written off. |

### Invoice Transitions

```
DRAFT → OPEN          billing-invoice-generation job finalises the invoice
OPEN  → PAID          invoice.paid webhook (Stripe) / payment.succeeded webhook (Xendit)
OPEN  → VOID          admin voids the invoice (error correction)
OPEN  → UNCOLLECTIBLE after N failed payment attempts and all retries exhausted
PAID  → (terminal)    paid invoices are never modified
VOID  → (terminal)    voided invoices are never modified
UNCOLLECTIBLE → (terminal)
```

### Invoice ↔ Subscription Relationship

An invoice is created per billing period. The subscription status and invoice status are updated together when a payment webhook arrives:

```
invoice.paid webhook received
  → BillingInvoice.status = PAID
  → BusinessSubscription.status = ACTIVE  (if was GRACE_PERIOD)
```

Both updates happen inside a single `rootPrisma.$transaction`.

---

## 7. Credit Lifecycle (PREPAID_CREDITS billing model)

Credits live in the append-only `CreditLedger`. There is no single "credit status" — the balance is derived from `balanceAfter` on the most recent row.

### Credit Event Types

| Event | `amount` sign | Trigger |
|---|---|---|
| `PURCHASE` | positive | `checkout.session.completed` webhook (payment link paid) |
| `CONSUMED` | negative | POS checkout via `createPosTransaction` |
| `REFUNDED` | positive | POS refund via `createPosRefund` |
| `EXPIRED` | negative | Future: credit expiry job |
| `ADJUSTMENT` | positive or negative | Admin manual correction |
| `PROMOTIONAL` | positive | Admin grants free credits |

### Balance Rules

- Balance cannot go below zero in the normal flow. The `CreditEngine.canDeduct()` check is performed before every POS checkout.
- Concurrent deductions can temporarily allow a negative balance (known race condition, documented in `credit-engine.ts`). This is auditable via the ledger and acceptable for Phase 1.
- `CONSUMED` entries are written by `createPosTransaction` (via `dbTransaction` + `creditLedgerCollection`), not by the billing webhook.
- `PURCHASE` entries are written by the `checkout.session.completed` webhook handler only — never by the client.

---

## 8. Payment Attempt Lifecycle

Tracked in `PaymentAttempt` (new table — see `XENDIT_ARCHITECTURE.md §7.2`).

### Payment Attempt States

| State | Meaning |
|---|---|
| `PENDING` | Payment attempt initiated; awaiting provider response |
| `SUCCEEDED` | Provider confirmed payment |
| `FAILED` | Provider reported failure (insufficient funds, expired card, etc.) |
| `EXPIRED` | Payment link or invoice expired before the customer paid |
| `REFUNDED` | Previously succeeded payment was refunded |

### Attempt Sequence

```
First billing cycle:
  PENDING (on subscription creation / payment link creation)
    → SUCCEEDED  (invoice.paid webhook)
    → FAILED     (invoice.payment_failed webhook)

On FAILED:
  Xendit retries up to N times (configured in Xendit dashboard recurring plan settings).
  Each retry creates a new PaymentAttempt row with attemptNumber incremented.
  After all retries exhausted → subscription transitions to CANCELLED or UNCOLLECTIBLE.
```

---

## 9. State vs. Feature Access Matrix

The `EntitlementEngine` uses this matrix to determine whether a given feature is accessible. Features with `isOperational = true` are blocked in all states except `ACTIVE`, `TRIAL`, and `GRACE_PERIOD`.

| State | Operational features | Management features | Data access |
|---|---|---|---|
| `TRIAL` | ✅ Full | ✅ Full | ✅ Full |
| `ACTIVE` | ✅ Full | ✅ Full | ✅ Full |
| `GRACE_PERIOD` | ✅ Full | ✅ Full | ✅ Full |
| `EXPIRED` | ❌ Blocked | ✅ Full | ✅ Read-only |
| `SUSPENDED` | ❌ Blocked | ❌ Blocked | ✅ Read-only |
| `LONG_TERM_INACTIVE` | ❌ Blocked | ❌ Blocked | ⚠️ May be archived |
| `CANCELLED` | ❌ Blocked | ❌ Blocked | ✅ Read-only (retention period) |

The grace period intentionally grants full operational access. Blocking POS operations because of a payment failure would cause immediate revenue loss for the business owner — the grace window is designed to be transparent to end customers.

---

## 10. Xendit-Specific State Concerns

### 10.1 First Payment — Phase 1 (Option B)

In Phase 1, the entire subscription lifecycle is managed via one-time Payment Sessions. There is no saved payment method and no Recurring Plan.

1. `create-subscription.ts` creates a Xendit Payment Session (`session_type: PAY`, `mode: PAYMENT_LINK`) with the plan amount from `XENDIT_PLAN_*_AMOUNT` env var.
2. Subscription status remains at `TRIAL` until the first payment is confirmed.
3. On `payment.succeeded` webhook → transition subscription to `ACTIVE`, set `currentPeriodStart`/`currentPeriodEnd`.
4. At `currentPeriodEnd`, the lifecycle job creates a new Payment Session and sends the renewal link to the customer.

> **Note:** GCash auto-debit is currently on-hold in the Philippines. For recurring subscriptions in Phase 1, customers will use the renewal payment link with any available one-time payment method (cards, Maya, GCash, OTC, etc.) each month.

### 10.2 First Payment — Phase 2 (Option A, future)

When auto-debit is enabled and activated:

1. `create-subscription.ts` creates a Payment Session (`session_type: PAY`, `allow_save_payment_method: FORCED`) — customer pays first charge and saves payment method.
2. On `payment_token.activation` webhook → create `POST /recurring/plans` using the saved token. Set `BusinessSubscription.externalId` to the plan ID (`repl_xxx`).
3. Transition subscription to `ACTIVE`.
4. Subsequent renewals: Xendit auto-charges; `recurring.cycle.succeeded` + `payment.succeeded` arrive per cycle.

### 10.3 Cancel at Period End

Xendit Recurring Plans (Phase 2) have no native "cancel at period end" concept. The approach:

1. When `cancelImmediately = false`, record `cancelledAt` locally and set `cancelReason`.
2. The subscription remains `ACTIVE` until `currentPeriodEnd`.
3. When the period ends, the lifecycle job checks whether `cancelledAt` is set and `currentPeriodEnd` has passed — if so, it transitions to `CANCELLED` and calls `adapter.cancelSubscription({ cancelImmediately: true })` at that point.

For Phase 1 (Option B), there is no recurring plan to cancel at the provider. Cancel-at-period-end is purely a local state transition — no provider API call needed.

### 10.4 Renewal Date Synchronisation

**Phase 1 (Option B):** Period dates are set by the application at payment confirmation time. The lifecycle job advances them when a renewal payment is confirmed.

**Phase 2 (Option A):** Xendit sends `recurring.cycle.succeeded` (not `recurring.payment.created`) per successful cycle. The adapter maps this to `customer.subscription.updated`, which triggers `handleSubscriptionUpdated` to advance period dates.

---

## 11. History and Audit Requirements

Every state transition writes an immutable `SubscriptionStatusHistory` row. This is a hard requirement — no transition may occur without a history record. The record captures:

- `fromStatus` — previous state (null for initial creation)
- `toStatus` — new state
- `reason` — human-readable description of why the transition occurred
- `triggeredBy` — `userId` for user/admin actions; `'system'` for lifecycle job; `'payment'` for webhook-triggered transitions
- `createdAt` — timestamp (immutable, set by DB default)

This history is the primary audit trail for billing disputes, compliance reviews, and debugging.
