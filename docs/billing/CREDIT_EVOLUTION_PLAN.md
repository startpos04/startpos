# Credit System Evolution Plan

## Overview

This document is the authoritative implementation plan for the next generation of the
Start POS billing and credit system. It covers six interconnected features, all of which
were designed as a unit to ensure they compose correctly at runtime.

**Background:** The current credit system treats all credits as a single flat balance in
`CreditLedger`. A business gets credits from any source (purchase, promotional, plan
allowance) and they are indistinguishable. This plan introduces source-awareness,
expiry rules, FIFO deduction, auto-refill, free-form purchases, GCash payments, a
full-onboarding CSV importer, and admin configurability for all of the above.

**Self-hosted note:** A `SELF_HOSTED_LICENSE` billing model is designed for but not
built in this plan. The architecture leaves a clean seam: one `billingModel` guard in
the deduction path. No current work is blocked or complicated by this future path.

---

## Features in this Plan

| # | Feature | Phase |
|---|---|---|
| 1 | Credit bucketing — plan credits vs. paid top-up credits | A + B |
| 2 | Capped rollover for plan credits | A + C |
| 3 | FIFO deduction (burn plan credits before top-up credits) | B |
| 4 | Free-form credit purchase (any amount, price-per-credit) | D + E |
| 5 | Auto-refill (threshold trigger, saved payment method required) | A + E |
| 6 | GCash payment support via Xendit | E |
| 7 | CSV full-onboarding importer | F |
| 8 | Admin configurability for all of the above | D |

---

## Architectural Decisions

### AD-1 — Credit Source Discriminator

Add a `creditSource` column to `CreditLedger` to distinguish plan-granted credits from
paid top-up credits. All existing rows default to `TOPUP` (the more permissive value —
no existing balance is accidentally expired).

```prisma
enum CreditSource {
  PLAN_MONTHLY  // Granted by the monthly plan allowance. Subject to rollover cap.
  TOPUP         // Purchased by the business. Never expires, no cap.
}
```

### AD-2 — Rollover Cap on SubscriptionPlan

Add `rolloverCapCredits` to `SubscriptionPlan`. `0` = no rollover. `-1` = unlimited
(Enterprise). Admin can edit this per plan in the admin panel.

### AD-3 — FIFO in CreditEngine

`CreditEngine.deduct()` receives two separate balance snapshots — `planBalance` and
`topupBalance`. It burns `planBalance` to zero first, then `topupBalance`. It may
produce up to two `CreditLedgerEntryDTO` objects per checkout (one per source bucket
crossed). The Application Layer inserts both atomically.

### AD-4 — Free-form Purchase, No Fixed Packs

The business enters any credit amount they want. The server computes the charge:
`amount × CREDIT_PRICE_PER_UNIT`. Minimum and maximum purchase amounts are enforced
server-side and configurable in admin via `SystemConfig`.

### AD-5 — Auto-Refill Requires Saved Payment Method

`AutoRefillConfig.isEnabled` can only be `true` when `xenditCustomerId` is not null.
The UI enforces this by disabling the toggle when no payment method is on file. The
server enforces this by skipping auto-refill logic when `xenditCustomerId` is null,
regardless of the `isEnabled` flag. If a saved method fails, `isEnabled` is set to
`false` automatically and the business is notified.

### AD-6 — Xendit is the Single Payment Gateway

GCash, card, and auto-refill all go through Xendit. The existing Xendit adapter is
extended — no second gateway is introduced. PayMongo is the documented fallback if
Xendit onboarding is blocked for GCash, but is not implemented in this plan.

### AD-7 — CSV Importer is Server-Side PapaParse

Follows the same pattern as `download-inventory.ts` (createServerFn + Papa + getTenantPrisma).
Two-phase: parse+validate returns a preview; commit runs a `dbTransaction`. The seeder
path (`prisma/seeders/import-products.ts`) calls the same core import logic directly,
reading from `prisma/seeders/data/{tenantSlug}/products.csv`.

---

## Phase A — Schema Foundation

Everything else depends on this phase. Run migration and update seeders before any
engine work.

### Task A.1 — Add `CreditSource` enum and column to `CreditLedger`

**File:** `prisma/schema.prisma`

```prisma
enum CreditSource {
  PLAN_MONTHLY
  TOPUP
}

model CreditLedger {
  // ... existing fields ...

  // NEW — source of this credit event. Null on legacy rows; treated as TOPUP at runtime.
  creditSource CreditSource @default(TOPUP)
}
```

**Migration:** `pnpm prisma migrate dev --name add_credit_source`

**Seeder impact:** No existing seeder rows break — `TOPUP` is the default and is the
safe fallback for all historical entries.

---

### Task A.2 — Add `rolloverCapCredits` to `SubscriptionPlan`

**File:** `prisma/schema.prisma`

```prisma
model SubscriptionPlan {
  // ... existing fields ...

  // NEW — maximum plan credits that carry over to the next period.
  // 0 = no rollover. -1 = unlimited (Enterprise).
  rolloverCapCredits Int @default(0)
}
```

**Migration:** `pnpm prisma migrate dev --name add_rollover_cap`

**Seeder update** (`prisma/seeders/entitlements.ts` — `PLANS` array):

| Plan | rolloverCapCredits |
|---|---|
| Trial | 0 |
| Basic | 500 |
| Premium | 4000 |
| Enterprise | -1 |

---

### Task A.3 — Add `AutoRefillConfig` model

**File:** `prisma/schema.prisma`

```prisma
model AutoRefillConfig {
  id         String   @id @default(cuid())
  businessId String   @unique
  business   Business @relation(fields: [businessId], references: [id], onDelete: Cascade)

  // Whether auto-refill is active. Can only be true when xenditCustomerId is set.
  isEnabled Boolean @default(false)

  // Trigger a refill when the TOTAL credit balance (plan + topup) falls below this.
  threshold Int @default(50)

  // Number of TOPUP credits to purchase on each auto-refill trigger.
  refillAmount Int @default(500)

  // Xendit customer ID for the saved payment method.
  // null = no saved method → auto-refill unavailable.
  xenditCustomerId String?

  // Timestamp of the last auto-refill trigger (for rate-limiting / audit).
  lastRefillAt DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("auto_refill_configs")
}
```

**Migration:** `pnpm prisma migrate dev --name add_auto_refill_config`

**When is this row created?** The webhook handler (`handleCheckoutSessionCompleted`)
creates an `AutoRefillConfig` row with `isEnabled: false` the first time a business
completes any Xendit payment, saving their `xenditCustomerId`. If the row already
exists, it updates `xenditCustomerId` only.

---

### Task A.4 — Add `SystemConfig` keys for credit pricing and auto-refill defaults

**File:** `prisma/seeders/system-config.ts` (or equivalent config seeder)

New keys to seed at platform level:

| Key | Default value | Description |
|---|---|---|
| `CREDIT_PRICE_PER_UNIT` | `50` | Price per credit in PHP centavos (₱0.50) |
| `CREDIT_MIN_PURCHASE` | `100` | Minimum credits per single purchase |
| `CREDIT_MAX_PURCHASE` | `10000` | Maximum credits per single purchase |
| `AUTO_REFILL_DEFAULT_THRESHOLD` | `50` | Default threshold for new auto-refill configs |
| `AUTO_REFILL_DEFAULT_AMOUNT` | `500` | Default refill amount for new auto-refill configs |
| `AUTO_REFILL_COOLDOWN_MINUTES` | `60` | Minimum minutes between auto-refill triggers (rate limit) |

All existing keys (`CREDIT_LOW_BALANCE_THRESHOLD`, `GRACE_PERIOD_DAYS`, etc.) remain
unchanged.

---

## Phase B — Credit Engine Bucketing + FIFO

Pure engine changes. No DB writes. Fully testable with Pattern A tests.

### Task B.1 — Add `CreditBucketSnapshot` type

**File:** `src/lib/billing/types.ts`

```ts
// Replaces the single CreditLedgerSnapshot used by CreditEngine.
// The Application Layer assembles this by running two separate balance queries:
//   - planBalance: latest CreditLedger row where creditSource = PLAN_MONTHLY
//   - topupBalance: latest CreditLedger row where creditSource = TOPUP
export type CreditBucketSnapshot = {
  planBalance: number   // Current plan credit balance (0 if no rows)
  topupBalance: number  // Current top-up credit balance (0 if no rows)
}
```

---

### Task B.2 — Update `CreditEngine.deduct()` for FIFO

**File:** `src/lib/billing/credit-engine.ts`

Replace the single `CreditLedgerSnapshot` parameter with `CreditBucketSnapshot`.

**FIFO rules:**
1. Total available = `planBalance + topupBalance`. If `< COST_PER_TX` → `PRECONDITION_FAILED`.
2. Deduct from `planBalance` first. If `planBalance >= 1` → one entry with `creditSource: PLAN_MONTHLY`.
3. If `planBalance = 0` → one entry with `creditSource: TOPUP`.
4. If `planBalance > 0` but `< 1` (edge case: shouldn't happen with integer credits, but guard anyway) → consume from both buckets, produce two entries.

**Return type change:** `CreditDeductionResult.entry` becomes `CreditDeductionResult.entries: CreditLedgerEntryDTO[]` (1 or 2 items).

```ts
export type CreditDeductionResult = {
  entries: CreditLedgerEntryDTO[]   // 1 entry normally, 2 if both buckets consumed
  newPlanBalance: number
  newTopupBalance: number
  isLowBalance: boolean             // total balance after < lowBalanceThreshold
}
```

**Backward compatibility:** The Application Layer (createPosTransaction) must be updated
to insert `entries` (array) instead of a single `entry`. This is the only call site.

---

### Task B.3 — Update `CreditEngine.restore()` for source awareness

**File:** `src/lib/billing/credit-engine.ts`

On refund, credits are restored to the same bucket they were consumed from. The
`createPosRefund` handler already stores the original transaction ID — the Application
Layer must read the original `CreditLedger` row to determine which `creditSource` was
consumed, then pass that source to `restore()`.

```ts
restore(
  businessId: string,
  snapshot: CreditBucketSnapshot,
  transactionId: string,
  originalSource: CreditSource,  // NEW — which bucket to restore to
): OperationResult<CreditLedgerEntryDTO>
```

---

### Task B.4 — Update `CreditEngine.grant()` for source

**File:** `src/lib/billing/credit-engine.ts`

Add `creditSource: CreditSource` parameter. All `PURCHASE` and `PROMOTIONAL` grants
default to `TOPUP`. Monthly plan grants use `PLAN_MONTHLY` (called by the rollover job
in Phase C and the period-opening logic).

---

### Task B.5 — Update Application Layer call sites

**Files to update:**
- `src/lib/queries/create-pos-transaction.ts` — insert `entries[]` instead of `entry`
- `src/lib/queries/create-pos-refund.ts` — read original source, pass to `restore()`
- `src/routes/api/billing/webhook/-shared/handlers.ts` — pass `creditSource: TOPUP`
  to `CreditEngine.grant()` in `handleCheckoutSessionCompleted`

---

### Task B.6 — Pattern A tests for bucketed CreditEngine

**File:** `__tests__/unit/lib/billing/credit-engine-buckets.test.ts`

```
Tests:
- deduct() burns plan credits when planBalance >= 1 → single PLAN_MONTHLY entry
- deduct() burns topup credits when planBalance = 0 → single TOPUP entry
- deduct() fails when planBalance = 0 AND topupBalance = 0
- deduct() produces correct newPlanBalance and newTopupBalance
- deduct() isLowBalance uses total balance (plan + topup)
- restore() returns entry with correct creditSource matching originalSource
- grant() with TOPUP source produces TOPUP entry
- grant() with PLAN_MONTHLY source produces PLAN_MONTHLY entry
```

---

## Phase C — Rollover Job

### Task C.1 — Add rollover step to `subscription-lifecycle` background job

**File:** `src/lib/jobs/subscription-lifecycle.ts` (or equivalent)

At period end, before opening the new period's usage counter, run the rollover step:

```
1. Read current planBalance for the business (latest PLAN_MONTHLY CreditLedger row)
2. Read the plan's rolloverCapCredits
3. carryOver = min(planBalance, rolloverCapCredits)  [if rolloverCapCredits = -1, carryOver = planBalance]
4. expired   = planBalance - carryOver
5. If expired > 0: write CreditLedger entry (EXPIRED, amount = -expired, creditSource = PLAN_MONTHLY)
6. If carryOver > 0: write CreditLedger entry (PLAN_MONTHLY, amount = +carryOver, creditSource = PLAN_MONTHLY,
                      note = "Rollover from {period}")
7. If plan has an includedTxPerMonth > 0: write CreditLedger entry for the new period's plan allowance
   (PLAN_MONTHLY, amount = +includedTxPerMonth, creditSource = PLAN_MONTHLY,
    note = "Monthly plan credits — {period}")
```

Steps 5–7 are written atomically in a single `rootPrisma.$transaction`.

**Idempotency:** Check whether a `PLAN_MONTHLY` grant entry already exists for the new
`billingPeriodStart` before writing. If it does, skip (job was already run).

---

### Task C.2 — Pattern A tests for rollover logic

**File:** `__tests__/unit/lib/billing/rollover.test.ts`

Extract the rollover computation into a pure `RolloverEngine.compute()` function so it
is unit-testable without the job infrastructure.

```
Tests:
- carryOver = min(unused, cap) when unused < cap
- carryOver = cap when unused > cap
- carryOver = unused when cap = -1 (unlimited / Enterprise)
- carryOver = 0 when cap = 0 (Trial)
- expired = unused - carryOver, written as negative EXPIRED entry
- No expired entry written when carryOver = unused
```

---

## Phase D — Admin Configurability

### Task D.1 — Admin: credit pricing config

**Route:** `/admin/billing/credit-config` (new admin page)

Fields (all backed by `SystemConfig` via `coreAPI` reads / `coreTransactionAPI` mutations):

- Price per credit (PHP centavos)
- Minimum purchase amount (credits)
- Maximum purchase amount (credits)
- Low balance threshold (credits)

---

### Task D.2 — Admin: rollover caps per plan

**Route:** `/admin/billing/plans` (extend existing plan management page if it exists,
otherwise new page)

For each `SubscriptionPlan`, allow editing `rolloverCapCredits`. Uses `coreTransactionAPI`
to update `SubscriptionPlan` (platform-level model).

---

### Task D.3 — Admin: auto-refill defaults

**Route:** `/admin/billing/credit-config` (same page as D.1, new section)

Fields:
- Default threshold (credits)
- Default refill amount (credits)
- Cooldown period (minutes)

These are `SystemConfig` keys — they set the default values pre-filled when a business
configures auto-refill for the first time. Each business can then adjust their own values.

---

### Task D.4 — Business owner: auto-refill settings

**Route:** `/billing/auto-refill` or as a section on the existing `/billing` page

**UI state machine:**

```
xenditCustomerId = null
  → Section shows as locked
  → "Complete a credit purchase to unlock auto-refill"

xenditCustomerId set, isEnabled = false
  → Toggle available (off)
  → Threshold and amount fields visible but greyed out

xenditCustomerId set, isEnabled = true
  → Toggle on
  → Threshold and amount fields active and editable
  → Last refill date shown if lastRefillAt is set
```

**Server functions:**
- `getAutoRefillConfig` — reads `AutoRefillConfig` for the business (`crudAPI`)
- `updateAutoRefillConfig` — updates threshold, refillAmount, isEnabled (`dbTransaction` +
  `autoRefillConfigCollection`)

**Validation rules (server-side):**
- `isEnabled = true` is rejected if `xenditCustomerId` is null
- `threshold` must be ≥ 1 and ≤ `CREDIT_MIN_PURCHASE`
- `refillAmount` must be ≥ `CREDIT_MIN_PURCHASE` and ≤ `CREDIT_MAX_PURCHASE`

---

## Phase E — Payment Features (GCash + Auto-Refill + Free-Form Purchase)

### Task E.1 — Add GCash to Xendit adapter

**File:** `src/lib/billing/adapters/xendit-adapter.ts`

When creating a payment link (`createCreditPurchaseLink` and `createSubscription`),
pass `payment_method_types: ['gcash', 'card', 'qr_ph']` instead of a hardcoded set.

Add a `XENDIT_PAYMENT_METHODS` env var (comma-separated) so this is configurable
without a code change:

```ts
const methods = (process.env['XENDIT_PAYMENT_METHODS'] ?? 'gcash,card').split(',')
```

No webhook handler changes required — `payment.succeeded` is identical for GCash and
card payments.

---

### Task E.2 — Free-form credit purchase server function

**File:** `src/lib/queries/purchase-credits.ts` (replaces or extends `purchase-credit-package.ts`)

```
Input:
  creditAmount: number   // User-entered amount

Server-side:
  1. Read CREDIT_PRICE_PER_UNIT, CREDIT_MIN_PURCHASE, CREDIT_MAX_PURCHASE from SystemConfig
  2. Validate: creditAmount >= min AND creditAmount <= max
  3. Compute chargeAmount = creditAmount × pricePerUnit (in centavos)
  4. Call adapter.createCreditPurchaseLink({ creditAmount, chargeAmount, metadata: { source: 'credit_purchase' } })
  5. Return { checkoutUrl, creditAmount, chargeAmount }
```

---

### Task E.3 — Auto-refill trigger in POS checkout

**File:** `src/lib/queries/create-pos-transaction.ts`

After the credit deduction succeeds, check auto-refill:

```
1. Read AutoRefillConfig for the business
2. If isEnabled = false OR xenditCustomerId = null → skip
3. If totalBalance (newPlanBalance + newTopupBalance) > threshold → skip
4. If lastRefillAt is within cooldown window → skip (rate limit)
5. Otherwise: enqueue auto-refill job (or call inline)
```

The actual Xendit charge happens asynchronously (background job) to keep the POS
checkout response fast. The POS checkout never blocks on a payment call.

---

### Task E.4 — Auto-refill background job

**File:** `src/lib/jobs/auto-refill.ts` (new)

```
1. Look up AutoRefillConfig where isEnabled = true AND xenditCustomerId IS NOT NULL
   AND lastRefillAt < now - cooldown (or null)
2. For each qualifying config:
   a. Re-check current total balance (race condition guard)
   b. If balance > threshold → skip (already topped up by a manual purchase)
   c. Call adapter.chargeCustomer({ xenditCustomerId, amount: refillAmount × pricePerUnit,
                                    metadata: { source: 'credit_purchase', autoRefill: true } })
   d. On success: update lastRefillAt = now
   e. On failure: set isEnabled = false, write notification
3. The payment.succeeded webhook handles the CreditLedger insert as normal
```

**Note:** `adapter.chargeCustomer()` is a new method on the Xendit adapter that uses
Xendit's tokenized charge API (`POST /v2/charges`) rather than creating a payment link.
This requires the business's `xenditCustomerId` as the saved payment method token.

---

### Task E.5 — Save `xenditCustomerId` on first payment

**File:** `src/routes/api/billing/webhook/-shared/handlers.ts`

In `handleCheckoutSessionCompleted`, after inserting the `CreditLedger` entry:

```ts
// Upsert AutoRefillConfig with the Xendit customer ID
await rootPrisma.autoRefillConfig.upsert({
  where: { businessId },
  create: {
    businessId,
    xenditCustomerId: event.payment?.xenditCustomerId ?? null,
    isEnabled: false,
    threshold: defaultThreshold,    // from SystemConfig AUTO_REFILL_DEFAULT_THRESHOLD
    refillAmount: defaultAmount,    // from SystemConfig AUTO_REFILL_DEFAULT_AMOUNT
  },
  update: {
    xenditCustomerId: event.payment?.xenditCustomerId ?? undefined,
  },
})
```

---

### Task E.6 — Auto-refill failure handling

When a Xendit tokenized charge fails in Task E.4:

```
1. Log the failure to WebhookEvent table (or a new AutoRefillLog table)
2. Set AutoRefillConfig.isEnabled = false
3. Write a system notification to the business:
   "Auto-refill failed. Your saved payment method could not be charged.
    Please update your payment method to re-enable auto-refill."
4. Do NOT block POS operations — the business still has their current balance
```

---

## Phase F — CSV Full-Onboarding Importer

### Task F.1 — Define the import CSV schema

**Target column set (single flat file):**

| Column | Required | Notes |
|---|---|---|
| `category_name` | Yes | Created if not exists |
| `product_name` | Yes | |
| `variant_name` | No | Defaults to product name if blank |
| `sku` | No | Auto-generated if blank |
| `unit_abbreviation` | Yes | e.g. `pcs`, `kg`, `L` |
| `unit_name` | No | Required only if unit is new |
| `cost_price` | Yes | In PHP (e.g. `25.00`) |
| `selling_price` | Yes | In PHP |
| `reorder_point` | No | Defaults to 0 |
| `opening_qty` | No | Defaults to 0. Creates inventory batch if > 0 |
| `supplier_name` | No | Matched by name. Ignored if not found. |
| `barcode` | No | |

**Blank template:** A downloadable CSV with headers only and 3 example rows (different
categories) is available at `GET /api/import/products/template`.

---

### Task F.2 — Parse + validate server function

**File:** `src/lib/server-fn/import-products-preview.ts`

```
Input: { csvText: string }

1. Papa.parse(csvText, { header: true, skipEmptyLines: true })
2. Validate each row: required fields present, prices are valid numbers, etc.
3. Group rows into: categories, units, products, variants, inventory batches
4. Return ImportPreviewResult:
   {
     totalRows: number,
     validRows: number,
     errorRows: Array<{ rowNumber: number, column: string, reason: string }>,
     preview: Array<{ category, productName, variantName, sku, qty, costPrice, sellingPrice }>
   }
```

No DB writes in this step. The UI shows the preview and errors. The user confirms
before committing.

---

### Task F.3 — Commit server function

**File:** `src/lib/server-fn/import-products-commit.ts`

```
Input: { csvText: string }  (same CSV re-sent on confirm — server re-parses for safety)

dbTransaction(() => {
  for each row (in order):
    1. categoryCollection.upsert({ name: category_name }) — idempotent by name
    2. unitCollection.upsert({ abbreviation }) — idempotent by abbreviation
    3. productCollection.insert or update
    4. variantCollection.insert or update (SKU as unique key)
    5. if opening_qty > 0: inventoryCollection.insert batch
})

Return: { created: N, updated: N, errors: [...] }
```

**Idempotency:** Running the same CSV twice is safe — products/variants are upserted by
name+category or SKU. The opening inventory batch is only created if no inventory row
already exists for the variant.

---

### Task F.4 — Seeder path for white-glove onboarding

**File:** `prisma/seeders/import-products.ts` (new)

```ts
// Usage: TENANT_SLUG=my-store pnpm seed:products
//
// Reads from: prisma/seeders/data/{TENANT_SLUG}/products.csv
// Calls the same core import logic as the server function (shared pure function)
// Runs outside the server function wrapper — no auth context needed
```

The core import logic (parse + group + upsert) is extracted into a shared function
`src/lib/import/products-importer.ts` that both the server function and the seeder call.
This function has no `createServerFn` wrapper and no `authMiddleware` dependency.

---

## Phase G — Self-Hosted License (Future — Not Built Now)

This phase is documented so the architecture is intentionally left open for it. No
tasks are actioned in this plan.

### Design notes

**BillingModel:** Add `SELF_HOSTED_LICENSE` to the `BillingModel` enum in
`src/lib/billing/types.ts` when building this. One guard in the Application Layer:

```ts
if (subscription.billingModel === BillingModel.SELF_HOSTED_LICENSE) {
  return ok({ entries: [], newPlanBalance: 0, newTopupBalance: 0, isLowBalance: false })
}
```

**License validation:** A license key is validated at server startup and cached. The
validation call pings a licensing endpoint on your infrastructure. If the ping fails
(network partition, not expiry), the app continues with the cached result for a grace
window (e.g. 72 hours).

**Who buys it:** Enterprise customers who want to host on their own AWS/GCP account.
Sold as an annual license. No per-transaction billing, no credit system.

---

## Testing Strategy by Phase

| Phase | Pattern | File location |
|---|---|---|
| B — CreditEngine bucketing | Pattern A | `__tests__/unit/lib/billing/credit-engine-buckets.test.ts` |
| C — Rollover logic | Pattern A | `__tests__/unit/lib/billing/rollover.test.ts` |
| D — Auto-refill config server fn | Pattern B | `__tests__/unit/lib/queries/update-auto-refill-config.test.ts` |
| E — Free-form purchase server fn | Pattern B | `__tests__/unit/lib/queries/purchase-credits.test.ts` |
| E — Auto-refill trigger in POS checkout | Pattern B | extend `create-pos-transaction.test.ts` |
| E — Auto-refill failure flow | Pattern C2 | `__tests__/integration/billing/auto-refill-journey.integration.test.ts` |
| F — CSV importer (preview + commit) | Pattern B | `__tests__/unit/lib/queries/import-products.test.ts` |

**Pre-test protocol:** Pattern B and C tests for Phase E and F require manual validation
in the running app first (per testing-patterns rule). Phase A and B tests (pure engine)
can be written immediately with no manual validation gate.

---

## Rollback Safety

Each phase is independently shippable. Migration rollback notes:

| Migration | Rollback safety |
|---|---|
| `add_credit_source` | Safe — column defaults to TOPUP. Dropping it restores prior behaviour. |
| `add_rollover_cap` | Safe — column defaults to 0 (no rollover). Dropping it restores prior behaviour. |
| `add_auto_refill_config` | Safe — new table, no FK from existing tables to it (except Business cascade). Drop table to rollback. |

No existing credit balance is affected by Phase A migrations. The engine reads the new
column only when the Application Layer starts passing `CreditBucketSnapshot` — until
then, the old snapshot type still works unchanged.

---

## Environment Variables Added in This Plan

| Variable | Phase | Description |
|---|---|---|
| `XENDIT_PAYMENT_METHODS` | E.1 | Comma-separated list of Xendit payment method types (default: `gcash,card`) |

All other configuration is stored in `SystemConfig` (DB) and editable in the admin panel.
No additional `.env` keys beyond the above.

---

## Open Items / Parking Lot

- **Volume discounts on credit purchase:** Not in this plan. If users ask for it,
  add a `CREDIT_VOLUME_DISCOUNT_TIERS` SystemConfig key (JSON array of threshold+rate
  pairs). The free-form purchase server function already computes `amount × rate` —
  replacing `rate` with a tiered lookup is a one-function change.

- **PayMongo fallback for GCash:** Not built. If Xendit GCash onboarding is delayed,
  a `PayMongoAdapter` can be added without touching the webhook handlers (same
  normalised `WebhookEvent` DTO contract).

- **Credit expiry notifications:** The `EXPIRED` ledger event is written by the rollover
  job (Phase C). A push/email notification when credits are about to expire (e.g. 3 days
  before period end) is a future notification system feature.

- **Self-hosted license:** Designed for, not built. See Phase G.
