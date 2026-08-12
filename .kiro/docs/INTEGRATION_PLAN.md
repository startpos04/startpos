# Integration Test Master Plan

## Goal

90–100% confidence across every critical path. Tests at each layer do distinct work — they are
not redundant with each other. The three layers are complementary:

| Layer | What it owns | Cannot do |
|---|---|---|
| Unit | Engine logic, algorithms, edge cases — deterministic, fast, always-on | Cannot verify DB constraints, real Prisma queries, or browser behavior |
| Integration | DB atomicity, FK enforcement, multi-function orchestration, real Prisma queries | Cannot verify browser navigation, session behavior, or UI rendering |
| E2E | Complete user journeys from browser to DB and back | Cannot isolate specific engine bugs or run without a live server |

---

## How to use this document

- Read the **Coverage Map** to find which source files are untested at the integration layer
- Pick the **Pattern** (C1 or C2) using the decision rule below
- Follow the **boilerplate** in `.kiro/steering/testing-patterns.md` exactly
- After writing the test, update this document with ✅ and the test count

---

## Pattern Decision Rule

```
Does the test need real FK constraints, unique indexes, or real $transaction atomicity?
└── Yes → C1 (real Postgres, withRollback, dbDescribe)

Does it test multiple server functions in sequence with an external service (Stripe)?
└── Yes → C2 (mocked DB boundary, stable singleton adapter, wireMocks in beforeEach)
```

---

## C2 Critical Rules (anti-patterns that cause flaky tests)

These rules exist because we burned time on them. Do not skip them.

1. **`vi.mock` factory = stubs only.** No store access, no logic. Implementations go in `wireMocks()`.
2. **`getStore()` indirection.** Never close over `store` directly in `mockImplementation` — always use a `getStore()` function because `vi.mock` factories are hoisted above `let store` declarations.
3. **`mockClear()` not `clearAllMocks()`.** In `beforeEach`, call `mockClear()` on specific mocks to reset call counts. `vi.clearAllMocks()` wipes `mockImplementation` and breaks the next test.
4. **Stable singleton for external adapters.** `vi.mock('@/lib/stripe-adapter', () => { const a = { fn: vi.fn() }; return { createStripeAdapter: vi.fn(() => a) } })` — the adapter object must be the same reference every call.
5. **Set env vars in `beforeEach`, delete in `afterEach`.** `STRIPE_PLAN_*_PRICE_ID` and similar must be set before the handler runs and cleaned up after.

---

## Current Status

**Last Updated**: 2026-08-02  
**Run command**: `pnpm test:integration`  
**Test DB**: `start-pos-test`

| File | Pattern | Tests | Status |
|---|---|---|---|
| `registration/complete-registration.integration.test.ts` | C1 | 16 | ✅ Written — skips when no Postgres |
| `billing/billing-journey.integration.test.ts` | C2 | 24 | ⚠️ Written — 7 failing (see Known Issues I1–I3) |

---

## Coverage Map

Legend: ✅ covered · ⚠️ partial/failing · 🔴 zero coverage · — not applicable

### Registration & Auth

| Source file | Unit A | Unit B | Integration C1 | Integration C2 | E2E |
|---|---|---|---|---|---|
| `queries/complete-registration.ts` | — | ✅ | ✅ 16 tests | — | Suite 13 planned |
| `queries/refresh-session.ts` | — | — | — | — | 🔴 Suite 01 (auth persistence) |

**Gap**: `refresh-session.ts` — write a C2 test verifying the session is updated with the correct `businessId`/`branchId` after registration.

---

### Billing Engines (pure — Pattern A)

| Source file | Unit A | Integration | E2E |
|---|---|---|---|
| `billing/subscription-engine.ts` | ✅ 68 tests | — | — |
| `billing/subscription-policy.ts` | ✅ 22 tests | — | — |
| `billing/credit-engine.ts` | ✅ 30 tests | — | — |
| `billing/invoice-engine.ts` | ✅ 28 tests | — | — |
| `billing/plan-engine.ts` | ✅ 26 tests | — | — |
| `billing/value-objects/credit-balance.ts` | ✅ 27 tests | — | — |
| `billing/value-objects/subscription-status.ts` | 🔴 0 | — | — |
| `billing/usage-engine.ts` | 🔴 0 | — | — |
| `billing/value-objects/usage-summary.ts` | 🔴 0 | — | — |
| `billing/value-objects/billing-period.ts` | 🔴 0 | — | — |
| `billing/pricing/pricing-engine.ts` | 🔴 0 | — | — |
| `billing/pricing/strategies/feature-based-pricing-strategy.ts` | 🔴 0 | — | — |
| `billing/pricing/strategies/enterprise-pricing-strategy.ts` | 🔴 0 | — | — |
| `billing/pricing/strategies/flat-subscription-pricing-strategy.ts` | 🔴 0 | — | — |
| `billing/pricing/strategies/partner-reseller-pricing-strategy.ts` | 🔴 0 | — | — |
| `billing/pricing/strategies/promotional-pricing-strategy.ts` | 🔴 0 | — | — |
| `billing/strategies/composable-features-strategy.ts` | 🔴 0 | — | — |

**Gap — Unit A needed for zero-coverage engines above (Phase 1 priority).**

---

### Billing Queries (orchestration — Pattern B or C2)

| Source file | Unit B | Integration C2 | E2E |
|---|---|---|---|
| `queries/create-subscription.ts` | — | ⚠️ partial/failing | Suite 14 planned |
| `queries/cancel-subscription.ts` | — | ⚠️ partial (scheduled cancel passes) | Suite 14 planned |
| `queries/grant-credits.ts` | — | ⚠️ failing (mock isolation) | Suite 14 planned |
| `queries/purchase-credit-package.ts` | — | — | 🔴 Suite 14 planned (Stripe Checkout) |
| `queries/accept-pricing-quote.ts` | — | — | 🔴 |
| `queries/create-pricing-quote.ts` | — | — | 🔴 |
| `queries/convert-quote-to-subscription.ts` | — | — | 🔴 |

---

### Entitlement Engine (pure — Pattern A)

| Source file | Unit A | Integration | E2E |
|---|---|---|---|
| `entitlement/entitlement-engine.ts` | 🔴 0 | — | — |
| `entitlement/capability-keys.ts` | — (constants only) | — | — |
| `entitlement/entitlement-types.ts` | — (types only) | — | — |

**Gap — `entitlement-engine.ts` is the gate for every feature in the app. It is pure and should be 100% unit tested. This is the highest priority gap in the entire codebase.**

---

### POS — Core Transaction Flow

| Source file | Unit B | Integration C1 | E2E |
|---|---|---|---|
| `queries/create-pos-transaction.ts` | ✅ ~95% | 🔴 | Suite 04 planned |
| `queries/create-pos-order.ts` | ✅ ~95% | — | Suite 05 planned |
| `queries/create-pos-refund.ts` | ✅ ~100% | 🔴 | Suite 12 planned |
| `queries/fetch-structured-id.ts` | ✅ ~90% | 🔴 concurrency | — |
| `queries/fetch-pos-products.ts` | ✅ | — (useLiveQuery) | Suite 04 |
| `queries/fetch-active-orders.ts` | ✅ | — (useLiveQuery) | Suite 05 |

**Gap — C1 needed for `create-pos-transaction` (atomicity), `create-pos-refund` (FK constraint), `fetch-structured-id` (concurrency).**

---

### Purchase & Inventory

| Source file | Unit B | Integration C1 | E2E |
|---|---|---|---|
| `queries/restock-ingredient.ts` | ✅ ~95% | 🔴 | Suite 07 planned |
| `queries/purchase-workflow.ts` | 🔴 | 🔴 | Suite 07 planned |
| `queries/create-purchase.ts` | 🔴 | 🔴 | Suite 07 planned |
| `queries/create-purchase-request.ts` | 🔴 | 🔴 | — |
| `queries/void-purchase.ts` | 🔴 | 🔴 | — |
| `queries/confirm-goods-receipt.ts` | 🔴 | 🔴 | Suite 07 planned |
| `queries/create-goods-receipt.ts` | 🔴 | 🔴 | Suite 07 planned |
| `queries/receipt-workflow.ts` | 🔴 | 🔴 | — |

**Gap — `purchase-workflow.ts` is completely uncovered at all layers. C2 test covers the multi-step workflow; C1 test verifies inventory FK and atomicity.**

---

### Tasks

| Source file | Unit B | Integration C1 | E2E |
|---|---|---|---|
| `queries/validate-task-transition.ts` | 🔴 | 🔴 | Suite 12 planned |
| `queries/fetch-tasks.ts` | ✅ | — (useLiveQuery) | Suite 12 |

**Gap — `validate-task-transition.ts` is a server-side security guard. It must be covered at C1 to verify the DB read actually enforces the role check.**

---

### Background Jobs

| Source file | Unit A | Integration C1 | E2E |
|---|---|---|---|
| `jobs/subscription-lifecycle.ts` | 🔴 | 🔴 | — |
| `jobs/usage-counter-reset.ts` | 🔴 | 🔴 | — |
| `jobs/billing-invoice-generation.ts` | 🔴 | 🔴 | — |
| `jobs/pricing-quote-expiry.ts` | 🔴 | 🔴 | — |
| `jobs/composable-renewal-preview.ts` | 🔴 | 🔴 | — |

**Gap — Jobs are pure orchestration (engine calls + DB writes) with no HTTP. They are ideal C1 targets: call the job function directly against the test DB and assert the DB state.**

---

### Conversion & Costing (pure — Pattern A)

| Source file | Unit A | Notes |
|---|---|---|
| `conversion/tax-engine.ts` | ✅ ~100% | ✅ |
| `conversion/price-engine.ts` | ✅ ~100% | ✅ |
| `conversion/pos-stock-engine.ts` (was inventory-engine) | ✅ ~98% | ✅ |
| `conversion/unit-engine.ts` | 🔴 TODO | Listed as TODO in TESTING_PLAN.md |
| `costing/fifo-engine.ts` | ✅ 100% | ✅ |
| `costing/moving-average-engine.ts` | ✅ 100% | ✅ |
| `costing/specific-engine.ts` | ✅ 100% | ✅ |

---

### Notification

| Source file | Unit A/B | Integration | E2E |
|---|---|---|---|
| `notification/notification-engine.ts` | ✅ ~90% | — | Suite 12 |

---

## Planned Tests (Phased by Priority)

### Phase 1 — Zero-coverage pure engines (Unit A, `pnpm test`)

These are all pure functions — no DB, no HTTP, no mocks needed. Highest value per effort.

#### 1a. EntitlementEngine (CRITICAL — gates every feature)

**File**: `__tests__/unit/lib/entitlement/entitlement-engine.test.ts`  
**Why critical**: Every `COMPLETE_CHECKOUT`, `CREATE_ORDER`, `MANAGE_EMPLOYEES` call goes through this. Zero coverage means no regression safety on the app's security layer.

**Coverage targets**:
- GRANTED path: ACTIVE + feature in plan + no usage limit
- SUSPENDED → all operational features blocked
- EXPIRED → operational features blocked
- LONG_TERM_INACTIVE → blocked
- CANCELLED → blocked
- EntitlementOverride: explicit grant for feature not in plan
- EntitlementOverride: explicit revoke for feature in plan
- Per-feature usage limit: at limit → USAGE_LIMIT_REACHED
- Per-feature usage limit: under limit → GRANTED
- txRemaining = 0 → TX_ALLOWANCE_EXHAUSTED for COMPLETE_CHECKOUT
- txRemaining = null (unlimited plan) → GRANTED
- creditBalance = 0 (PREPAID_CREDITS) → CREDIT_BALANCE_ZERO
- creditBalance = null (non-prepaid) → GRANTED
- GRACE_PERIOD → operational features still granted
- TRIAL → operational features granted
- Feature not in plan → FEATURE_NOT_IN_PLAN
- Override expired (`expiresAt` in past) → falls back to plan

#### 1b. UsageEngine

**File**: `__tests__/unit/lib/billing/usage-engine.test.ts`  
**Coverage targets**:
- `computeRemaining`: unlimited plan (-1) → null; at allowance → 0; below allowance → positive
- `increment`: normal → increments txCount; over allowance → increments overageTxCount
- `increment`: already closed counter → PRECONDITION_FAILED
- `isExhausted`: false when remaining > 0; true when 0; always false for unlimited
- `shouldBillOverage`: true when overageBillingEnabled and overageTxCount > 0

#### 1c. SubscriptionStatusVO value object

**File**: `__tests__/unit/lib/billing/subscription-status.test.ts`  
**Coverage targets**:
- `isOperationallyBlocked`: true for EXPIRED, SUSPENDED, LONG_TERM_INACTIVE, CANCELLED; false for TRIAL, ACTIVE, GRACE_PERIOD
- `isActive`: true for TRIAL, ACTIVE, GRACE_PERIOD; false otherwise
- `canReactivate`: true for EXPIRED, LONG_TERM_INACTIVE, CANCELLED; false for ACTIVE, TRIAL, SUSPENDED
- `isSuspended`: true only for SUSPENDED
- `isTrial`: true only for TRIAL

#### 1d. UsageSummary and BillingPeriod value objects

**File**: `__tests__/unit/lib/billing/usage-summary.test.ts`  
**Coverage targets**:
- `UsageSummary.of`: txCount, percentUsed, txRemaining, isOverage
- `BillingPeriod.contains`: date inside, before, after period boundaries
- `BillingPeriod.daysRemaining`: correct day count, 0 when expired

#### 1e. PricingEngine + all 5 strategies

**File**: `__tests__/unit/lib/billing/pricing-engine.test.ts`  
**Coverage targets**:
- `FEATURE_BASED`: feature prices summed correctly; bundle discount applied
- `FLAT_SUBSCRIPTION`: single flat price; branch surcharge added
- `ENTERPRISE`: negotiated prices override catalog prices
- `PARTNER_RESELLER`: partner margin applied on top of catalog price
- `PROMOTIONAL`: promo discount applied when promoCodeEnabled=true; ignored when false
- `resolveDependencies`: transitive deps expanded; cycle detection returns opFail
- `validateDependencies`: cycle detected → PRECONDITION_FAILED
- `maxFeatures` exceeded → VALIDATION_FAILED
- `generateQuote`: line items match strategy output; tax line added when vatRate > 0
- `detectBundle`: partial match (minimumItems); full match; no match

#### 1f. unit-engine.ts (listed as TODO in TESTING_PLAN.md)

**File**: `__tests__/unit/lib/conversion/unit-engine.test.ts`  
**Coverage targets**: unit conversion math, conversionFactor arithmetic, incompatible types

---

### Phase 2 — Fix failing C2 tests + complete billing orchestration

#### 2a. Fix billing-journey.integration.test.ts

**Root cause**: `vi.clearAllMocks()` in `beforeEach` wipes `mockImplementation`. Fix:
- Remove `vi.clearAllMocks()` from `beforeEach`
- Call `mockClear()` only on Stripe adapter mocks (to reset call counts)
- Add `STRIPE_PLAN_STARTER_PRICE_ID=price_test_starter` in `beforeEach`, delete in `afterEach`
- Do this AFTER manually validating the billing journey in the running app

**Blocked by**: I2 (Stripe env not configured), I3 (billing journey not manually validated)

#### 2b. refresh-session (C2)

**File**: `__tests__/integration/registration/refresh-session.integration.test.ts`  
**Test cases**:
- After registration: session contains correct `businessId`, `branchId`, `role=ADMIN`
- Session refresh with no membership: returns `success:false`
- Calling refresh twice returns same IDs (idempotent)

---

### Phase 3 — Real DB tests for POS critical paths (C1)

#### 3a. create-pos-transaction — atomicity

**File**: `__tests__/integration/pos/create-pos-transaction.integration.test.ts`  
**Test cases**:
- All 5 records committed atomically (Transaction, Order, Payment, InventoryMovement, CreditLedger)
- Mid-transaction failure → zero rows written, inventory unchanged
- Concurrent sale of last unit: second caller gets stock-insufficient, not a duplicate row
- UsageCounter `txCount` incremented correctly

#### 3b. fetch-structured-id — concurrency

**File**: `__tests__/integration/pos/fetch-structured-id.integration.test.ts`  
**Test cases**:
- 10 concurrent INVOICE calls → 10 unique numbers, no duplicates
- Sequential calls produce 000001–000010 with no gaps
- INVOICE and ORDER counters are independent

#### 3c. create-pos-refund — FK constraint

**File**: `__tests__/integration/pos/create-pos-refund.integration.test.ts`  
**Test cases**:
- Refund Transaction created with FK `originalTransactionId` pointing to original
- Inventory movements type=IN written for each original OUT movement
- Refund on non-existent transactionId → rejected cleanly

---

### Phase 4 — Purchase workflow (C2 + C1)

#### 4a. purchase-workflow — multi-step orchestration (C2)

**File**: `__tests__/integration/purchases/purchase-workflow.integration.test.ts`  
**Test cases**:
- Create purchase → status PENDING, purchase items linked
- Confirm goods receipt → InventoryMovement IN records written per item
- Void purchase → status VOID, no inventory movements
- Partial receipt → `receivedQty` < `orderedQty`, discrepancy note written

#### 4b. restock-ingredient — real DB (C1)

**File**: `__tests__/integration/purchases/restock-ingredient.integration.test.ts`  
**Test cases**:
- Inventory batch created with correct quantity and costPrice
- InventoryMovement type=IN written with correct reason
- Variant costPrice updated to weighted average
- Zero quantity rejected before DB write

---

### Phase 5 — Background jobs (C1)

#### 5a. subscription-lifecycle job

**File**: `__tests__/integration/billing/subscription-lifecycle.integration.test.ts`  
**Test cases**:
- TRIAL with past `trialEndsAt` → transitions to EXPIRED, SubscriptionStatusHistory written
- GRACE_PERIOD with past `gracePeriodEndsAt` → transitions to EXPIRED
- EXPIRED with `expiredAt` > 90 days ago → transitions to LONG_TERM_INACTIVE
- Active subscription → no transition, no history row

#### 5b. usage-counter-reset job

**File**: `__tests__/integration/billing/usage-counter-reset.integration.test.ts`  
**Test cases**:
- Counter for expired billing period → `isClosed=true` set
- New period counter created for the next month
- Counter already closed → no duplicate created

#### 5c. billing-invoice-generation job

**File**: `__tests__/integration/billing/billing-invoice-generation.integration.test.ts`  
**Test cases**:
- Closed counter with overage → invoice created with correct line items
- Free plan (monthlyPrice=0) → no invoice generated
- Already-invoiced counter → no duplicate invoice

---

### Phase 6 — Task security guard (C1)

#### 6a. validate-task-transition — role enforcement

**File**: `__tests__/integration/tasks/validate-task-transition.integration.test.ts`  
**Test cases**:
- ADMIN can approve PENDING task
- CASHIER cannot approve own task → PERMISSION_DENIED
- Wrong clerk cannot start task assigned to another
- Non-existent taskId → NOT_FOUND
- Transition to REVIEWED is irreversible

---

### Phase 7 — Pricing quote lifecycle (C2)

#### 7a. Pricing quote lifecycle

**File**: `__tests__/integration/billing/pricing-quote-lifecycle.integration.test.ts`  
**Test cases**:
- `createPricingQuote` → status CALCULATED, correct line items
- `acceptPricingQuote` → status ACCEPTED
- `convertQuoteToSubscription` → BusinessSubscription created, COMPOSABLE_FEATURES billing
- Quote expired → cannot accept → PRECONDITION_FAILED
- Double conversion → idempotent

---

## Fixture Reference

```ts
import {
  getTestPrisma,    // PrismaClient → start-pos-test (null when DB unavailable)
  withRollback,     // SAVEPOINT per test
  cleanTables,      // TRUNCATE when withRollback can't be used
  dbDescribe,       // describe.runIf(!INTEGRATION_DB_UNAVAILABLE)
  seedTenant,       // User + Business + Branch + Membership + Subscription (TRIAL) + 50 credits
  seedProduct,      // Category + Unit + Product + Variant + Inventory
  seedUnit,         // Standalone Unit row
  seedSupplier,     // Supplier row
} from '#tests/integration/helpers'
```

Adding a new fixture: add a `seedX(prisma, tenant)` function to
`__tests__/integration/helpers/fixtures.ts`, export from `index.ts`, use `crypto.randomUUID()`
for IDs, return a plain object with the created IDs.

---

## Progress Tracker

| Phase | Description | Tests to add | Status |
|---|---|---|---|
| Phase 1a | EntitlementEngine unit | ~20 | 🔴 Not started |
| Phase 1b | UsageEngine unit | ~15 | 🔴 Not started |
| Phase 1c | SubscriptionStatusVO unit | ~10 | 🔴 Not started |
| Phase 1d | UsageSummary + BillingPeriod unit | ~10 | 🔴 Not started |
| Phase 1e | PricingEngine + 5 strategies unit | ~40 | 🔴 Not started |
| Phase 1f | unit-engine unit | ~10 | 🔴 Not started |
| Phase 2a | Fix billing-journey C2 | fix 7 | ⚠️ Blocked on I2+I3 |
| Phase 2b | refresh-session C2 | ~5 | 🔴 Not started |
| Phase 3a | create-pos-transaction C1 | ~10 | 🔴 Not started |
| Phase 3b | fetch-structured-id C1 | ~8 | 🔴 Not started |
| Phase 3c | create-pos-refund C1 | ~6 | 🔴 Not started |
| Phase 4a | purchase-workflow C2 | ~10 | 🔴 Not started |
| Phase 4b | restock-ingredient C1 | ~6 | 🔴 Not started |
| Phase 5a | subscription-lifecycle job C1 | ~8 | 🔴 Not started |
| Phase 5b | usage-counter-reset job C1 | ~5 | 🔴 Not started |
| Phase 5c | billing-invoice-generation job C1 | ~5 | 🔴 Not started |
| Phase 6a | validate-task-transition C1 | ~6 | 🔴 Not started |
| Phase 7a | Pricing quote lifecycle C2 | ~10 | 🔴 Not started |
| **Total** | | **~190** | |

---

## Known Issues & Blockers

| # | Issue | Blocking | Resolution |
|---|---|---|---|
| I1 | `billing-journey.integration.test.ts` — 7 failing tests: `vi.clearAllMocks()` in `beforeEach` wipes `mockImplementation` | Phase 2a | Replace `vi.clearAllMocks()` with `mockClear()` on specific mocks. Unblock after I2 + I3 resolved. |
| I2 | Stripe env vars not configured | Phase 2a, Phase 7a | Add `STRIPE_PLAN_*_PRICE_ID` to `.env.local` once Stripe test keys available |
| I3 | Billing journey not manually validated | Phase 2a | Validate `createSubscription`, `cancelSubscription`, `grantCredits` in the running app first |
| I4 | `withRollback` uses savepoints on a single pg.Client — incompatible with code that opens its own `BEGIN` | Phase 3a | If savepoint nesting fails, fall back to `cleanTables` in `afterEach` |

---

## Running Integration Tests

```bash
# Run all integration tests (prompts if Postgres unavailable)
pnpm test:integration

# Run with coverage (outputs to coverage-integration/)
pnpm coverage:integration

# Skip the DB-unavailable prompt (CI)
CI=true pnpm test:integration
SKIP_DB_PROMPT=true pnpm test:integration

# Run a specific directory
pnpm exec vitest run --config vitest.integration.config.ts -- "__tests__/integration/billing"

# Run both unit and integration coverage
pnpm coverage:all
```

---

## Environment Setup

```bash
# .env.local — add these alongside your existing Postgres vars

# Integration test database (isolated from dev)
TEST_POSTGRES_DB=start-pos-test

# Required for C2 billing tests that call create-subscription
STRIPE_PLAN_STARTER_PRICE_ID=price_test_starter
STRIPE_PLAN_GROWTH_PRICE_ID=price_test_growth
STRIPE_PLAN_PREMIUM_PRICE_ID=price_test_premium
STRIPE_PLAN_TRIAL_PRICE_ID=price_test_trial

# Required for C2 credit purchase tests
STRIPE_CREDIT_PKG_10_PRICE_ID=price_test_credits_10
STRIPE_CREDIT_PKG_50_PRICE_ID=price_test_credits_50
STRIPE_CREDIT_PKG_100_PRICE_ID=price_test_credits_100
```
