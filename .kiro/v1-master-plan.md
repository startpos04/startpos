# StartPOS — V1 Master Plan

---

## Already Built

| Route | Status |
|---|---|
| `/login` | ✅ Done |
| `/pos` | ✅ Done |
| `/orders` | ✅ Done |
| `/tasks`, `/tasks/create`, `/tasks/$taskId` | ✅ Done |
| `/products`, `/products/create`, `/products/$productId` | ✅ Done |
| `/ingredients`, `/ingredients/create`, `/ingredients/$ingredientId` | ✅ Done |
| `/employees`, `/employees/create`, `/employees/$employeeId` | ✅ Done |
| `/sales-reports` | ✅ Done |
| `/inventory-reports` | ✅ Done |
| `/notifications` | ✅ Done |
| `/settings` (categories, units, customers, locations, suppliers) | ✅ Done |
| `/purchases`, `/purchases/create` | ✅ Done |

---

## V1 IN — Must Ship

### Core POS & Order Lifecycle

- [x] **Fix zero order items bug** — `create-pos-transaction.ts` loop was iterating an empty `items[]` instead of `data.items`. Fixed to `for (const item of data.items)` with push pattern.
- [x] **Product variants — create & edit UI** — Variants section added to `-create-product.tsx` between Inventory and Recipe. Add/remove rows with name, SKU suffix, and price per variant.
- [x] **Save product snapshot to transaction** — `unitPrice` and `unitCost` frozen from `variant.price` / `variant.costPrice` at insert time. Working now that the items loop is fixed.
- [x] **Lock cart when payment is processing** — `isProcessing` ref added to `cart-aside.tsx`. CHECKOUT button disabled during async payment handling; try/finally ensures flag always resets.
- [x] **Category & unit management** — Settings tables now have full create (Dialog form) and soft-delete (WarningPrompt → `deletedAt`) for both categories and units.
- [x] **SC/PWD discount UI** — Collapsible SC/PWD section added to the payment dialog: beneficiary name, ID number, and discount amount. Discount is subtracted from the total before payment validation. Compliance data flows `cart-aside` → `pos/index.tsx` → `createPosTransaction` and is frozen into `complianceData` on the transaction. BIR-required fields now captured per transaction.

### Compliance & Tax

- [x] **Finalize VAT on receipt** — VAT breakdown fully present in `receipt-ticket.tsx`.
- [x] **SKU on receipt line items** — SKU printed as a small sub-line below each item description.
- [x] **Feature flag for receipt** — `ENABLE_PRINT_RECEIPT` checked in `pos/index.tsx` before printing.

### Infrastructure

- [x] **Fix transactional rollback (P2003)** — `dbTransaction` wraps in `ResultAsync` with refetch fallback on error.
- [x] **Composite DB index on Transactions** — `@@index([businessId, branchId, createdAt])` confirmed present in `schema.prisma`.

### UX Foundations

- [x] **Barcode scanner input capture** — `autoFocus` added to the POS `<Input>` in `search-input.tsx`.
- [x] **Print stylesheet for thermal receipts** — N/A. Receipts use `@react-pdf/renderer` PDF → system print dialog. No `@media print` CSS needed.

### Operational Integrity (found via user manual audit)

- [x] **Task FULFILLED → inventory side effect** — `handleStatusChange` wrapped in `dbTransaction`. On FULFILLED: `SHELF_REFILL` deducts from source location and adds to target; `BRANCH_TRANSFER` deducts with `targetBranchId` movement log; `STOCK_COUNT` reconciles to physically counted qty; `WASTE_DISPOSAL` deducts wasted qty. All transitions write to `inventoryMovementCollection`.
- [x] **Purchases / supplier management route** — `/purchases` list and `/purchases/create` sidebar added under admin layout. Form has supplier, reference/invoice number, and multi-line items (product/variant, qty, unit, unit cost). Creates `purchaseCollection` + `purchaseItemCollection` records and calls `restockIngredient` per item to update inventory and cost price. Added to Admin sidebar nav. Fully wired in `routeTree.gen.ts`.

---

## V1 OUT — Post-Launch

| Feature | Reason deferred |
|---|---|
| Onboarding flow for new users | Can onboard manually for now |
| Push notifications | Requires notification service infrastructure |
| Accessibility / tab index / keyboard nav | Iterate post-launch |
| Animation & transitions | Pure polish |
| Theme refactor (enterprise look) | Polish |
| Rich text input | No v1 field requires it |
| Order splitting | Edge case for small POS operations |
| Full hardware integration (printer protocol, cash drawer) | Barcode *input* is v1; full HID protocol is v2 |
| Cash reconciliation discrepancy audit | Flow exists; deep audit is v2 |
| Type-safe polymorphic metadata / compliance config | Refactor, doesn't break current function |
| Multi-device local sync | Significant architecture work |
| Resort / clinic vertical (Appointments, Reservations) | Separate business domain |
| Effect library migration | Infrastructure refactor, not a feature |
| In-memory caching for SystemConfig hot loops | Optimization, not a blocker |
| Creatable select / select2 integration | Progressive enhancement |
| Grocery table-view restock | Grocery vertical is post-launch |


---

# Expansion Architecture: Orders, Transaction History & SaaS Monetization

> This section is a planning and architecture blueprint only.
> No implementation exists yet. All recommendations are grounded in the current codebase reviewed at the time of writing.

---

## Codebase Review Summary

Before any architecture was proposed, the following were reviewed:

**Existing models:** `Business`, `Branch`, `Membership`, `User`, `Role`, `Session`, `SystemConfig`, `ComplianceRegistry`, `Order`, `OrderItem`, `OrderItemAddon`, `Transaction`, `TransactionTaxLine`, `Payment`, `InventoryMovement`, `VendorSession`, `OperationalTask`, `SequenceCounter`, `Product`, `ProductVariant`, `ProductComponent`, `Inventory`, `Purchase`, `PurchaseItem`, `Supplier`, `Customer`, `Location`, `Unit`, `Notification`.

**Existing enums:** `OrderStatus` (PENDING, PREPARING, SERVED, CANCELLED), `TransactionType` (SALE, REFUND, ADJUSTMENT), `PaymentMethod`, `Role` (ADMIN, SUPERVISOR, CASHIER, SERVICE_PROVIDER), `ConfigKey` (includes `ENABLE_ORDER`, `ENABLE_TASK`, `ENABLE_CASH_RECONCILIATION`, etc.), `MovementType`.

**Current POS flow:** `createPosOrder` → `createPosTransaction` (stock guard → TaxEngine → FIFO inventory depletion → Payment insert → TransactionTaxLine insert) → `createPosRefund`.

**Current auth model:** better-auth + Prisma adapter. Session carries `businessId` and `branchId`. `getAuthUser` merges Business/Branch/User-level `SystemConfig` into a single flat config map at session load.

**What does NOT exist yet:** subscription models, billing models, feature entitlement engine, trial management, usage tracking counters, transaction history page, order history page, SaaS lifecycle management.


---

## Part 1 — Orders & Transaction History

### 1.1 Current State

The `Order` model already exists. An `Order` has a 1:1 relationship with a `Transaction`. The `/orders` route currently shows only **active orders** (PENDING and PREPARING), with today's transacted orders mixed in. There is no dedicated history page, no filtering, no pagination, and no per-order detail view.

The `Transaction` model already captures `invoiceNo`, `totalAmount`, `totalCost`, `taxAmount`, `discount`, `complianceData`, `payments[]`, `taxLines[]`, and `inventoryMovements[]`. A CSV export server function (`downloadTransactionsCSV`) exists but is the only access point for historical data.

### 1.2 Order Lifecycle

An order moves through the following states:

```
PENDING → PREPARING → SERVED → (linked to a completed Transaction)
                    ↘ CANCELLED
```

| State | Meaning |
|---|---|
| `PENDING` | Order created in cart, not yet sent to kitchen |
| `PREPARING` | Kitchen acknowledged, actively being prepared |
| `SERVED` | Delivered to the customer, awaiting payment |
| `CANCELLED` | Voided before transaction; no financial record created |

**Current gap:** `SERVED` status exists in the enum but is not enforced by the UI workflow. The transition from `PREPARING` → `SERVED` and then to a completed `Transaction` should be made explicit.

No schema change is required for the order state machine. The `OrderStatus` enum already covers all states.

### 1.3 Transaction Lifecycle

```
Cart assembled
↓
Order created (PENDING)
↓
Payment processed → Transaction created (SALE)
↓
Order marked SERVED (status update on transaction commit)
↓
[Optional] Refund issued → Transaction created (REFUND, originalTransactionId set)
```

A transaction is immutable after creation. Refunds create a new inverse transaction linked via `originalTransactionId`. This is correct and should not change.

**Missing:** There is no explicit `status` field on `Transaction`. The type (`SALE` / `REFUND` / `ADJUSTMENT`) serves as status. This is acceptable; no schema change needed.

### 1.4 Payment Lifecycle

Payments are modeled as a 1:many relationship on `Transaction`. Each `Payment` record captures method, amount, tendered, change, platform, and referenceNo. This supports split payments in the future.

**Current gap:** The refund flow always creates a `CASH` payment regardless of the original method. This should be corrected: the refund payment method should mirror the original payment's method.

No schema change required. This is a logic fix in `create-pos-refund.ts`.

### 1.5 Receipt Generation

The current receipt uses `@react-pdf/renderer` and is triggered by the `ENABLE_PRINT_RECEIPT` feature flag. The receipt data is read from the in-memory transaction immediately after creation.

For history, a receipt must be regenerable from stored data at any future point. The current `Transaction` model plus its `Order → OrderItem[]`, `Payment[]`, and `TransactionTaxLine[]` relations contain all required data for receipt reconstruction. No additional fields are needed.

### 1.6 Transaction History Page

**New route:** `/transactions`

This is a **management feature** (always available regardless of subscription status). It reads from the server via Prisma (not the offline collections) to ensure complete historical accuracy.

Required capabilities:
- List transactions with date, invoice number, cashier name, order number, total amount, payment method, and type (SALE / REFUND)
- Filter by: date range, cashier, payment method, transaction type
- Pagination: cursor-based, 50 records per page
- Per-transaction detail view: full line items, payments, tax breakdown, compliance data, linked refund or original sale
- Reprint receipt from history
- Export to CSV (extends the existing `downloadTransactionsCSV` server function with filter params)

**Recommended server function shape:**

```ts
fetchTransactionHistory({
  from: string,        // ISO date
  to: string,          // ISO date
  cashierId?: string,
  method?: PaymentMethod,
  type?: TransactionType,
  cursor?: string,     // last transaction ID for pagination
  limit?: number,      // default 50
})
```

The offline `transactionCollection` is synced `on-demand`. History pages should always fetch from Prisma server-side, not from the local collection, to avoid partial data.

### 1.7 Order History Page

**New route:** `/order-history`

Complementary to transaction history. Shows orders with their linked transaction status.

Required capabilities:
- List orders with order number, date, customer reference, item count, total, and status
- Filter by: date range, status, order type (DINE_IN / TAKEOUT / DELIVERY)
- Pagination: cursor-based
- Per-order detail view: items, addons, linked transaction

### 1.8 Audit History

The existing `InventoryMovement` table already serves as an audit trail for all stock changes. No new model is needed for inventory auditing.

For **financial audit**, the `Transaction` → `TransactionTaxLine` chain is the audit record. Refunds preserve the full chain via `originalTransactionId`.

For **order audit**, the `Order` table with its `createdAt` / `updatedAt` timestamps is sufficient. If granular order mutation tracking is needed in the future, an `OrderAuditLog` table can be added without breaking existing structure.

### 1.9 Search

Both history pages should support a full-text search field that queries:
- Invoice number (transactions)
- Order number (orders)
- Customer reference / name
- Cashier name

These can be implemented as `ILIKE` Prisma queries with a debounced input. Full-text search indexes can be added to PostgreSQL later if performance requires it.

### 1.10 Offline Synchronization Considerations

The application is offline-first using TanStack DB with SQLite OPFS persistence. Transaction and order data is written locally first and synced to the server.

For **history pages**, always read from the Prisma server API rather than local collections. The local collection is optimized for POS operations, not historical queries. Mixing local and server data on history pages introduces inconsistency risks.

The `syncMode: 'on-demand'` setting on `transactionCollection` and `orderCollection` is correct. History pages should not trigger full collection loads; they should use dedicated server functions with pagination.

### 1.11 Reporting Implications

The existing `sales-reports` and `inventory-reports` pages currently query from the local collections. As data volume grows, these must migrate to server-side Prisma queries with date range filters. This is a post-v1 performance concern but should be planned for.

The `Transaction` model already has `@@index([businessId, branchId, createdAt])` which supports efficient date-range reporting queries.


---

## Part 2 — SaaS Monetization Architecture

### 2.1 Design Philosophy

The monetization system is built around three non-negotiable principles:

1. **Businesses never lose their data because of billing issues.** Data is always preserved. Billing problems restrict operations, not access to history.
2. **Entitlement is a core domain, not a feature flag.** Every protected action routes through a single entitlement engine rather than scattering billing checks across the codebase.
3. **Everything is configurable.** No prices, limits, tier names, or inactivity periods are hardcoded. All values live in the database and can be changed without a deployment.

---

### 2.2 New Database Models

The following models do not exist yet and must be added to `schema.prisma`.

#### `SubscriptionPlan`

Defines a configurable tier. Names like "Starter" or "Professional" are just labels — the application logic never checks the plan name, only the entitlements it carries.

```prisma
model SubscriptionPlan {
  id          String  @id @default(cuid())
  name        String  @unique          // "Starter", "Professional", "Enterprise"
  description String?
  isActive    Boolean @default(true)   // Soft-disable without deleting
  sortOrder   Int     @default(0)      // Display ordering

  // Billing
  monthlyPrice      Int   // In cents. 0 = free trial base plan
  includedTxPerMonth Int  // Monthly transaction allowance. -1 = unlimited
  overagePerTx      Int  @default(0) // Cents charged per tx over allowance. 0 = block instead of charge

  // Relations
  entitlements      PlanEntitlement[]
  subscriptions     BusinessSubscription[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("subscription_plans")
}
```

#### `Feature`

A registry of every feature the application can gate. Decoupled from plan names so new features can be added without altering plan logic.

```prisma
model Feature {
  id          String  @id @default(cuid())
  key         String  @unique   // e.g. "FEATURE_POS", "FEATURE_ANALYTICS", "FEATURE_API_ACCESS"
  label       String            // Human-readable label for admin UI
  description String?
  isOperational Boolean @default(false) // true = blocks on subscription lapse; false = always accessible

  entitlements PlanEntitlement[]
  overrides    EntitlementOverride[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("features")
}
```

#### `PlanEntitlement`

The join table between a plan and its features. A plan "has" a feature if a record exists here.

```prisma
model PlanEntitlement {
  id        String @id @default(cuid())
  planId    String
  plan      SubscriptionPlan @relation(fields: [planId], references: [id], onDelete: Cascade)
  featureKey String
  feature   Feature @relation(fields: [featureKey], references: [key], onDelete: Cascade)

  // Optional per-entitlement limits (overrides plan-level limits for a specific feature)
  usageLimit Int? // e.g. max branches, max employees. null = unlimited

  @@unique([planId, featureKey])
  @@map("plan_entitlements")
}
```

#### `BusinessSubscription`

The active subscription record for a business. One business has one active subscription at a time.

```prisma
enum SubscriptionStatus {
  TRIAL
  ACTIVE
  GRACE_PERIOD
  EXPIRED
  SUSPENDED
  CANCELLED
  LONG_TERM_INACTIVE
}

enum BillingModel {
  MONTHLY_SUBSCRIPTION
  PREPAID_CREDITS
  HYBRID // Subscription base + prepaid overages
}

model BusinessSubscription {
  id         String             @id @default(cuid())
  businessId String             @unique
  business   Business           @relation(fields: [businessId], references: [id], onDelete: Cascade)
  planId     String
  plan       SubscriptionPlan   @relation(fields: [planId], references: [id])
  status     SubscriptionStatus @default(TRIAL)
  billingModel BillingModel     @default(MONTHLY_SUBSCRIPTION)

  // Trial
  trialEndsAt DateTime?

  // Billing period
  currentPeriodStart DateTime?
  currentPeriodEnd   DateTime?

  // Grace period (after expiry, before hard restriction)
  gracePeriodEndsAt DateTime?

  // Long-term inactivity
  expiredAt         DateTime?        // When the subscription first lapsed
  longTermInactiveAt DateTime?       // When the account was downgraded to long-term inactive

  // Cancellation
  cancelledAt    DateTime?
  cancelReason   String?

  // External billing reference (e.g. Stripe subscription ID)
  externalId     String?

  usageCounters  UsageCounter[]
  creditLedger   CreditLedger[]
  invoices       BillingInvoice[]
  statusHistory  SubscriptionStatusHistory[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("business_subscriptions")
}
```

#### `SubscriptionStatusHistory`

Immutable audit log of every status transition.

```prisma
model SubscriptionStatusHistory {
  id             String             @id @default(cuid())
  subscriptionId String
  subscription   BusinessSubscription @relation(fields: [subscriptionId], references: [id], onDelete: Cascade)
  fromStatus     SubscriptionStatus?
  toStatus       SubscriptionStatus
  reason         String?
  triggeredBy    String?            // userId or "system"

  createdAt DateTime @default(now())

  @@index([subscriptionId, createdAt])
  @@map("subscription_status_history")
}
```

#### `EntitlementOverride`

Allows per-business exceptions — promotional access, enterprise contracts, temporary grants — without changing the plan.

```prisma
model EntitlementOverride {
  id         String   @id @default(cuid())
  businessId String
  business   Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  featureKey String
  feature    Feature  @relation(fields: [featureKey], references: [key], onDelete: Cascade)
  granted    Boolean  @default(true)  // false = explicitly revoke a feature even if plan includes it
  expiresAt  DateTime?
  reason     String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([businessId, featureKey])
  @@map("entitlement_overrides")
}
```

#### `UsageCounter`

Tracks billable usage per business per billing period. Designed for fast reads; never recomputed from raw transactions.

```prisma
model UsageCounter {
  id             String @id @default(cuid())
  subscriptionId String
  subscription   BusinessSubscription @relation(fields: [subscriptionId], references: [id], onDelete: Cascade)
  businessId     String
  business       Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  periodStart    DateTime
  periodEnd      DateTime
  txCount        Int @default(0)       // Completed sales transactions this period
  overageTxCount Int @default(0)       // Transactions beyond the plan allowance
  overageCharged Int @default(0)       // Total overage billed in cents

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([businessId, periodStart])
  @@index([businessId, periodStart, periodEnd])
  @@map("usage_counters")
}
```

#### `CreditLedger`

Immutable append-only log of every credit event. Current balance is derived from the sum of all entries for a business.

```prisma
enum CreditEventType {
  PURCHASE      // Business bought a credit package
  CONSUMED      // Credits deducted by a billable operation
  REFUNDED      // Credits restored due to a transaction refund
  EXPIRED       // Credits that lapsed past their expiry date
  ADJUSTMENT    // Manual admin correction
  PROMOTIONAL   // Granted credits (onboarding bonus, etc.)
}

model CreditLedger {
  id             String          @id @default(cuid())
  subscriptionId String
  subscription   BusinessSubscription @relation(fields: [subscriptionId], references: [id], onDelete: Cascade)
  businessId     String
  business       Business        @relation(fields: [businessId], references: [id], onDelete: Cascade)
  eventType      CreditEventType
  amount         Int             // Positive = credit added, Negative = credit consumed
  balanceAfter   Int             // Snapshot balance after this event (avoids full-table SUM)
  referenceId    String?         // e.g. transactionId for CONSUMED, invoiceId for PURCHASE
  description    String?

  createdAt DateTime @default(now())

  @@index([businessId, createdAt])
  @@map("credit_ledger")
}
```

#### `BillingInvoice`

A record of every charge issued to a business.

```prisma
enum InvoiceStatus {
  DRAFT
  OPEN
  PAID
  VOID
  UNCOLLECTIBLE
}

model BillingInvoice {
  id             String         @id @default(cuid())
  subscriptionId String
  subscription   BusinessSubscription @relation(fields: [subscriptionId], references: [id], onDelete: Cascade)
  businessId     String
  business       Business       @relation(fields: [businessId], references: [id], onDelete: Cascade)
  status         InvoiceStatus  @default(OPEN)
  amountDue      Int            // In cents
  amountPaid     Int @default(0)
  currency       String @default("PHP")
  description    String?
  periodStart    DateTime?
  periodEnd      DateTime?
  paidAt         DateTime?
  dueAt          DateTime?
  externalId     String?        // Stripe invoice ID

  lineItems      BillingInvoiceItem[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([businessId, createdAt])
  @@map("billing_invoices")
}

model BillingInvoiceItem {
  id          String         @id @default(cuid())
  invoiceId   String
  invoice     BillingInvoice @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  description String
  quantity    Int @default(1)
  unitAmount  Int            // In cents
  totalAmount Int            // In cents

  @@map("billing_invoice_items")
}
```


---

### 2.3 Existing Schema Changes Required

The following changes must be made to models that already exist:

| Model | Change | Reason |
|---|---|---|
| `Business` | Add `subscription BusinessSubscription?` relation | Link business to its subscription record |
| `Business` | Add `entitlementOverrides EntitlementOverride[]` relation | Per-business feature exceptions |
| `Business` | Add `usageCounters UsageCounter[]` relation | Usage tracking |
| `Business` | Add `creditLedger CreditLedger[]` relation | Prepaid credit history |
| `Business` | Add `billingInvoices BillingInvoice[]` relation | Invoice history |
| `Transaction` | Add `usageCounterId String?` relation | Link sale to the usage counter it incremented |

No destructive changes to existing columns are required. All new fields are additive.

---

### 2.4 Existing `ConfigKey` Additions

Add the following keys to the `ConfigKey` enum for inactivity policy configuration. These are stored in `SystemConfig` at the business scope and are configurable without code changes.

```prisma
// Add to ConfigKey enum:
TRIAL_DURATION_DAYS           // Default: 30
GRACE_PERIOD_DAYS             // Default: 7 (days after expiry before hard restriction)
LONG_TERM_INACTIVE_DAYS       // Default: 90 (days after expiry before long-term inactive)
CREDIT_LOW_BALANCE_THRESHOLD  // Default: 10 (notify when credits fall below this)
OVERAGE_BILLING_ENABLED       // Default: false (block vs. charge on overage)
```

---

### 2.5 Subscription Lifecycle

Each state determines what a business can and cannot do.

```
TRIAL
  ↓ (trial period ends, auto-converts if payment method on file)
ACTIVE
  ↓ (billing fails or subscription cancelled)
GRACE_PERIOD  ← configurable window (default 7 days)
  ↓ (grace period ends, no payment)
EXPIRED  ← operational features disabled; management features still accessible
  ↓ (no reactivation after configurable period, default 90 days)
LONG_TERM_INACTIVE  ← heavily restricted; only billing/reactivation accessible
  ↑ (business subscribes again at any point)
ACTIVE  ← immediately restored, all historical data preserved
```

| Status | Operational Features | Management Features | Auth | Notes |
|---|---|---|---|---|
| `TRIAL` | ✅ Full access | ✅ Full access | ✅ | Trial entitlements are plan-defined |
| `ACTIVE` | ✅ Full access | ✅ Full access | ✅ | |
| `GRACE_PERIOD` | ✅ Still accessible | ✅ Full access | ✅ | Warning banner shown |
| `EXPIRED` | ❌ Blocked | ✅ Read-only access | ✅ | Upgrade prompt shown |
| `SUSPENDED` | ❌ Blocked | ✅ Read-only access | ✅ | Admin-triggered; cannot self-reactivate |
| `LONG_TERM_INACTIVE` | ❌ Blocked | ⚠️ Billing & reactivation only | ✅ | All data intact; most UI hidden |
| `CANCELLED` | ❌ Blocked | ⚠️ Billing & reactivation only | ✅ | Data retained indefinitely |

**Key principle:** Authentication is never revoked for billing reasons. A business owner can always sign in to manage their billing, view invoices, and reactivate. Data is never deleted.

---

### 2.6 Free Trial

New businesses receive a **30-day free trial** (configurable via `TRIAL_DURATION_DAYS`). There is no permanent free tier.

The trial maps to a designated `SubscriptionPlan` with `monthlyPrice: 0`. The entitlements for that plan define what is available during trial.

**Recommended trial entitlement matrix** (based on current feature set):

| Feature Key | Available in Trial | Notes |
|---|---|---|
| `FEATURE_POS` | ✅ | Core value proposition |
| `FEATURE_ORDERS` | ✅ | Kitchen tab system |
| `FEATURE_PRODUCTS` | ✅ | Required for POS |
| `FEATURE_INVENTORY` | ✅ | Required for stock tracking |
| `FEATURE_CUSTOMERS` | ✅ | Basic CRM |
| `FEATURE_PURCHASES` | ✅ | Required for restocking |
| `FEATURE_TASKS` | ✅ | Operational workflow |
| `FEATURE_EMPLOYEES` | ✅ | Required to use the system |
| `FEATURE_SALES_REPORTS` | ✅ | Encourages adoption |
| `FEATURE_INVENTORY_REPORTS` | ✅ | Encourages adoption |
| `FEATURE_TRANSACTION_HISTORY` | ✅ | |
| `FEATURE_MULTI_BRANCH` | ❌ | Premium — requires upgrade |
| `FEATURE_ADVANCED_REPORTS` | ❌ | Premium |
| `FEATURE_ANALYTICS` | ❌ | Premium |
| `FEATURE_API_ACCESS` | ❌ | Premium |
| `FEATURE_DATA_EXPORT` | ⚠️ | Limited (CSV only, current month) |

The trial includes a **transaction count limit** derived from the trial plan's `includedTxPerMonth`. When the limit is approached, a conversion prompt is shown. When the limit is hit, checkout is blocked until the business upgrades.

This creates a conversion pressure point without making the trial unusable: businesses can still manage existing data, view reports, and configure the system, but cannot continue generating new sales.

---

### 2.7 Subscription Tiers — Initial Feature Matrix

Tiers are database records, not hardcoded enums. The following is the recommended initial seed data.

| Feature Key | Starter | Professional | Enterprise |
|---|---|---|---|
| `FEATURE_POS` | ✅ | ✅ | ✅ |
| `FEATURE_ORDERS` | ✅ | ✅ | ✅ |
| `FEATURE_PRODUCTS` | ✅ | ✅ | ✅ |
| `FEATURE_INVENTORY` | ✅ | ✅ | ✅ |
| `FEATURE_CUSTOMERS` | ✅ | ✅ | ✅ |
| `FEATURE_PURCHASES` | ✅ | ✅ | ✅ |
| `FEATURE_TASKS` | ✅ | ✅ | ✅ |
| `FEATURE_EMPLOYEES` | ✅ (up to 5) | ✅ (up to 20) | ✅ (unlimited) |
| `FEATURE_SALES_REPORTS` | ✅ | ✅ | ✅ |
| `FEATURE_INVENTORY_REPORTS` | ✅ | ✅ | ✅ |
| `FEATURE_TRANSACTION_HISTORY` | ✅ | ✅ | ✅ |
| `FEATURE_DATA_EXPORT` | ⚠️ CSV only | ✅ Full | ✅ Full |
| `FEATURE_MULTI_BRANCH` | ❌ | ✅ | ✅ |
| `FEATURE_ADVANCED_REPORTS` | ❌ | ✅ | ✅ |
| `FEATURE_ANALYTICS` | ❌ | ✅ | ✅ |
| `FEATURE_API_ACCESS` | ❌ | ❌ | ✅ |
| Monthly TX Allowance | 500 | 2,000 | Unlimited |

Per-feature usage limits (e.g., max 5 employees for Starter) are stored in `PlanEntitlement.usageLimit`, not hardcoded.


---

### 2.8 Billing Models

The architecture supports three billing models via `BillingModel` enum on `BusinessSubscription`. Switching models requires only a field update on the subscription, not a schema redesign.

#### Monthly Subscription

- Business is charged a fixed monthly fee for their plan tier.
- The `UsageCounter` tracks transactions in the current billing period.
- When `txCount` exceeds `includedTxPerMonth`:
  - If `OVERAGE_BILLING_ENABLED = true`: overage charges accumulate and are billed at period end via a `BillingInvoice`.
  - If `OVERAGE_BILLING_ENABLED = false`: checkout is blocked. The business must upgrade their plan or wait for the next period.

#### Prepaid Credits

- Business purchases a credit package; a `CreditLedger` `PURCHASE` event is created.
- Each completed sale deducts credits. The consumption rule (e.g., 1 credit per completed sale) is configurable per `Feature` via an additional `creditCostPerUse` field that can be added to `PlanEntitlement`.
- The `CreditLedger.balanceAfter` snapshot means current balance is always an O(1) read of the most recent ledger entry for the business, not a full-table sum.
- When balance reaches `CREDIT_LOW_BALANCE_THRESHOLD`, a notification is triggered.
- When balance reaches zero, checkout is blocked until credits are purchased.
- Refunds restore credits via a `REFUNDED` ledger event.

#### Hybrid (Subscription + Prepaid Overages)

- Business subscribes to a plan with a monthly TX allowance.
- When allowance is exhausted, instead of blocking or billing per-overage on the subscription, the system switches to deducting from a prepaid credit balance.
- This gives businesses flexibility: they can pre-purchase a credit buffer for busy months without upgrading their entire plan.
- The entitlement engine checks: subscription allowance remaining → credit balance → block.

---

### 2.9 Usage Tracking Strategy

Usage tracking must be efficient. The `UsageCounter` table is the single source of truth for current period usage. Raw transaction counts are never recomputed from the `Transaction` table in real-time.

**Write path:**
When `createPosTransaction` completes successfully:
1. Increment `UsageCounter.txCount` for the current billing period (upsert by `businessId + periodStart`).
2. If `txCount` now exceeds `includedTxPerMonth`, increment `overageTxCount` and calculate overage charges.
3. If billing model is `PREPAID_CREDITS` or `HYBRID`, insert a `CreditLedger` `CONSUMED` entry.

This increment happens inside the existing `dbTransaction` wrapper so it rolls back if the sale fails.

**Read path:**
- Current period usage: single row lookup on `UsageCounter` by `businessId + periodStart`.
- Remaining allowance: `includedTxPerMonth - txCount` (or credit balance for prepaid).
- Historical usage: paginated query on `UsageCounter` by `businessId` ordered by `periodStart DESC`.

**Offline consideration:**
The `UsageCounter` increment must be synced to the server before the next entitlement check. If the device is offline, the entitlement engine uses the last known counter value from the local collection. A conservative offline buffer (e.g., allow up to 10 transactions while offline before requiring sync) can be configured to prevent abuse while avoiding friction for genuinely offline environments.

---

### 2.10 Centralized Entitlement Engine

The entitlement engine is a single module — `EntitlementEngine` — that every protected action calls before proceeding. It is treated the same as authentication: a foundational cross-cutting concern.

**Location:** `src/lib/entitlement/entitlement-engine.ts`

**Inputs:**
- `businessId`
- `featureKey: string` — the feature being requested
- `context?: { txCount?: number, creditBalance?: number }` — optional real-time counters

**Evaluation order:**
1. Is the business `SUSPENDED` or `LONG_TERM_INACTIVE`? → Block all operational features.
2. Is the subscription `EXPIRED` (past grace period)? → Block all operational features.
3. Is there an `EntitlementOverride` for this business + feature key that is not expired? → Honor it (can grant or revoke).
4. Does the business's current plan have a `PlanEntitlement` for this feature key? → Proceed if yes.
5. Is there a usage limit on the entitlement? → Check against current counter.
6. Is the TX allowance exhausted this period? → Check overage policy.
7. For prepaid: is credit balance sufficient? → Block if zero.
8. → Granted.

**Output:**

```ts
interface EntitlementResult {
  granted: boolean
  reason?: string          // Human-readable reason for denial
  code?: EntitlementCode   // Machine-readable code for UI branching
  remaining?: number       // Remaining uses (for usage-limited features)
}

enum EntitlementCode {
  GRANTED
  SUBSCRIPTION_EXPIRED
  SUBSCRIPTION_SUSPENDED
  FEATURE_NOT_IN_PLAN
  USAGE_LIMIT_REACHED
  TX_ALLOWANCE_EXHAUSTED
  CREDIT_BALANCE_ZERO
  LONG_TERM_INACTIVE
  OVERRIDE_REVOKED
}
```

**Usage in application code:**

```ts
// Before createPosTransaction
const entitlement = await EntitlementEngine.check(businessId, 'FEATURE_POS')
if (!entitlement.granted) {
  throw new EntitlementError(entitlement.code, entitlement.reason)
}
```

The engine result is also used by the UI to disable buttons, show upgrade prompts, and display credit balance warnings — all driven by `EntitlementCode`, not scattered `if` statements.

**Caching:**
The entitlement result for the current session user should be cached in `authStore` and refreshed on session load and on subscription status change events. This avoids repeated DB calls on every POS action. The cache TTL should be short (5 minutes) or invalidated by a server-sent event when the subscription changes.

---

### 2.11 Operational vs. Management Features

This distinction drives how the UI behaves when a subscription lapses.

**Management features** (always accessible, regardless of subscription status):
- Dashboard / home
- Transaction history
- Order history
- Sales reports
- Inventory reports
- Products (read-only when expired)
- Customers (read-only when expired)
- Inventory (read-only when expired)
- Employees (read-only when expired)
- Notifications
- Settings (read-only when expired)
- Subscription management
- Billing & invoices
- Data exports (subject to entitlement)

**Operational features** (blocked when subscription is EXPIRED, SUSPENDED, LONG_TERM_INACTIVE):
- Creating new orders
- Editing active orders
- Completing POS checkout
- Recording payments
- Printing / issuing new receipts
- Starting new vendor sessions
- Creating purchases (new stock intake)
- Creating tasks (operational workflow)
- Any workflow that writes a new business-value record

The `Feature` model's `isOperational: Boolean` field controls this classification. The entitlement engine uses it to determine whether to apply the subscription-lapsed block.

---

### 2.12 Long-Term Inactive Account Policy

The full lifecycle:

```
TRIAL (30 days)
↓ trial ends, no subscription
EXPIRED → immediately (or after auto-convert attempt)
↓ grace period expires (configurable, default 7 days)
GRACE_PERIOD → EXPIRED (hard block on operational features)
↓ no reactivation for configurable period (default 90 days)
LONG_TERM_INACTIVE
↓ business subscribes again at any time
ACTIVE (all data immediately restored)
```

A scheduled background job (runs daily) is responsible for the transitions:
- `TRIAL` → `EXPIRED`: when `trialEndsAt < now` and no active subscription
- `EXPIRED` → `LONG_TERM_INACTIVE`: when `expiredAt + LONG_TERM_INACTIVE_DAYS < now`

Every transition writes a `SubscriptionStatusHistory` record.

**In LONG_TERM_INACTIVE state:**
- The business can still authenticate.
- The UI shows only the billing/subscription management pages and a reactivation CTA.
- All historical data (transactions, orders, inventory, employees) is intact in the database.
- After subscribing, the status transitions back to `ACTIVE` and the full UI is immediately restored.
- No data migration or restore process is needed.


---

## Part 3 — Architecture Review

### 3.1 New Database Tables Required

| Table | Purpose |
|---|---|
| `subscription_plans` | Configurable tier registry |
| `features` | Feature key registry |
| `plan_entitlements` | Plan-to-feature mapping with optional usage limits |
| `business_subscriptions` | Active subscription record per business |
| `subscription_status_history` | Immutable audit log of status transitions |
| `entitlement_overrides` | Per-business feature exceptions |
| `usage_counters` | Current period TX count and overage tracking |
| `credit_ledger` | Append-only credit event history |
| `billing_invoices` | Invoice records |
| `billing_invoice_items` | Invoice line items |

### 3.2 Existing Schema Changes

| Model | Change |
|---|---|
| `Business` | Add relations to `BusinessSubscription`, `EntitlementOverride`, `UsageCounter`, `CreditLedger`, `BillingInvoice` |
| `Transaction` | Add optional `usageCounterId` to link a sale to the counter it incremented |
| `ConfigKey` enum | Add `TRIAL_DURATION_DAYS`, `GRACE_PERIOD_DAYS`, `LONG_TERM_INACTIVE_DAYS`, `CREDIT_LOW_BALANCE_THRESHOLD`, `OVERAGE_BILLING_ENABLED` |

### 3.3 Background Jobs

| Job | Trigger | Responsibility |
|---|---|---|
| `subscription-lifecycle` | Daily cron | TRIAL→EXPIRED, EXPIRED→LONG_TERM_INACTIVE transitions |
| `grace-period-expiry` | Daily cron | GRACE_PERIOD→EXPIRED when grace window ends |
| `usage-counter-reset` | Monthly, on `currentPeriodEnd` per business | Create new `UsageCounter` for next period; carry over overage if applicable |
| `credit-low-balance-notify` | On each credit deduction | Check if balance < threshold; emit notification if so |
| `billing-invoice-generation` | Monthly, on period end | Generate subscription invoice; attach overage line items if applicable |

### 3.4 Middleware Changes

A new **entitlement middleware** must be added to the server function middleware chain (alongside the existing `authMiddleware`). It:
1. Reads the business's current subscription status from `BusinessSubscription`.
2. Populates an `entitlementContext` that server functions can inspect.
3. Does not hard-block at the middleware level (to preserve management access); blocking decisions are made per-action by the `EntitlementEngine`.

### 3.5 Authentication & Authorization Changes

The `getAuthUser` server function currently merges `SystemConfig` into the session payload. The same pattern should be extended to include a lightweight entitlement summary:

```ts
// Added to the getAuthUser response
entitlement: {
  status: SubscriptionStatus
  creditBalance: number | null
  txRemaining: number | null     // null = unlimited
  features: string[]             // Array of granted feature keys for this session
}
```

This avoids per-action DB round-trips for the most common entitlement checks (is the feature in my plan?) while still routing dynamic checks (is my TX allowance exhausted?) through the engine.

### 3.6 New Routes Required

| Route | Access Level | Purpose |
|---|---|---|
| `/transactions` | Management | Full transaction history with search, filter, pagination |
| `/transactions/$transactionId` | Management | Per-transaction detail with reprint |
| `/order-history` | Management | Full order history with search, filter, pagination |
| `/billing` | Management | Subscription status, plan details, upgrade/downgrade |
| `/billing/invoices` | Management | Invoice history |
| `/billing/credits` | Management | Credit balance, purchase credits, credit history |
| `/subscription/reactivate` | Always accessible | Reactivation flow for LONG_TERM_INACTIVE accounts |

### 3.7 Feature Flag Migration

The existing `ConfigKey` enum contains `ENABLE_ORDER`, `ENABLE_TASK`, `ENABLE_CASH_RECONCILIATION`, `ENABLE_ORDER_TAB`. These are currently used as feature flags.

Long-term, these should be migrated to the `Feature` / `PlanEntitlement` system so that feature access is controlled by the entitlement engine, not manually set config values. However, this is a **breaking change to the existing flag resolution path** and should be done in a dedicated migration phase after the entitlement system is stable. The two systems can coexist during transition: the entitlement engine can fall back to checking `SystemConfig` flags if no `PlanEntitlement` record exists for a feature.

### 3.8 Offline Synchronization Additions

New collections needed in `src/db/collections.ts`:

| Collection | Sync Mode | Reason |
|---|---|---|
| `businessSubscriptionCollection` | `eager` | Status must be available immediately on session load |
| `usageCounterCollection` | `eager` | Needed for real-time checkout entitlement checks |
| `creditLedgerCollection` | `on-demand` | Credit history; only needed on billing pages |
| `featureCollection` | `eager` | Feature key registry for entitlement checks |

The `entitlement` summary on `authStore` (derived from the above) is the primary source for UI-level feature gating. Full entitlement engine validation is performed server-side on all mutations.

### 3.9 API Implications

If `FEATURE_API_ACCESS` is introduced as a premium feature in the future, the existing API routes under `/api/auth/$` will need to be gated by the entitlement engine. The foundation should be laid by ensuring all API routes pass through the entitlement middleware even before API access is a paid feature.

---

## Part 4 — Risks & Trade-offs

| Risk | Severity | Mitigation |
|---|---|---|
| Offline TX counter drift | Medium | Conservative offline buffer; require sync before blocking; reconcile on reconnect |
| Credit balance race condition (two devices checkout simultaneously) | Medium | Server-side increment with optimistic locking on `CreditLedger.balanceAfter`; reject if balance was zero at read time |
| Entitlement cache staleness | Low | Short TTL (5 min) + server-sent event invalidation on subscription change |
| Billing period reset job failures | Medium | Idempotent job design; `UsageCounter` upsert by `businessId + periodStart` prevents duplicate resets |
| Data migration complexity when adding subscription to existing businesses | Medium | All new fields are nullable or have defaults; existing businesses get a default `TRIAL` record on first entitlement check |
| External billing provider coupling (e.g. Stripe) | Low | All billing logic references `externalId` only; provider-specific code is isolated to a `billing-provider` adapter |

---

## Part 5 — Implementation Phases

### Phase 1 — Transaction & Order History (No Billing)

Deliverables:
- `/transactions` page with server-side Prisma queries, filters, pagination
- `/transactions/$transactionId` detail view with reprint
- `/order-history` page
- Extend `downloadTransactionsCSV` with full filter params
- Fix refund payment method to mirror original

Dependencies: None. Pure additive work on existing data.

### Phase 2 — Entitlement Engine Foundation

Deliverables:
- Add `Feature`, `SubscriptionPlan`, `PlanEntitlement`, `EntitlementOverride` tables
- Seed initial feature registry and three plan tiers
- Implement `EntitlementEngine` module
- Extend `getAuthUser` to return `entitlement` summary
- Add entitlement middleware to server function chain
- Migrate existing `ENABLE_*` flags to dual-check mode (SystemConfig + EntitlementEngine)

Dependencies: Phase 1 complete (routes already exist to gate).

### Phase 3 — Subscription Lifecycle

Deliverables:
- Add `BusinessSubscription`, `SubscriptionStatusHistory` tables
- Trial auto-provisioning on business creation
- Subscription status transitions (manual first; automated jobs later)
- `/billing` route: subscription status, plan details
- UI restriction enforcement for EXPIRED / LONG_TERM_INACTIVE states
- `SubscriptionStatusHistory` audit log

Dependencies: Phase 2 complete (entitlement engine must exist to enforce restrictions).

### Phase 4 — Usage Tracking & Monthly Billing

Deliverables:
- Add `UsageCounter` table and increment logic in `createPosTransaction`
- Usage counter reset background job
- TX allowance entitlement check in the engine
- `/billing` extended with usage stats and remaining allowance
- `BillingInvoice` generation (manual trigger first; automated job later)
- Overage billing logic (if `OVERAGE_BILLING_ENABLED`)

Dependencies: Phase 3 complete.

### Phase 5 — Prepaid Credits

Deliverables:
- Add `CreditLedger` table
- Credit purchase flow (manual admin credit grant first; payment integration later)
- Credit deduction on `createPosTransaction`
- Credit restoration on `createPosRefund`
- Low-balance notification
- `/billing/credits` route: balance, history, purchase CTA

Dependencies: Phase 4 complete (usage counter infrastructure already in place).

### Phase 6 — External Billing Integration

Deliverables:
- Billing provider adapter (e.g., Stripe)
- Webhook handler for payment events (invoice paid, subscription cancelled, etc.)
- `/billing/invoices` route
- Automated invoice generation job
- Credit package purchase via payment provider

Dependencies: Phase 5 complete.

---

## Summary of New Files & Modules

| Path | Purpose |
|---|---|
| `src/lib/entitlement/entitlement-engine.ts` | Core entitlement evaluation logic |
| `src/lib/entitlement/entitlement-types.ts` | `EntitlementResult`, `EntitlementCode` types |
| `src/lib/entitlement/feature-keys.ts` | `FEATURE_*` string constants |
| `src/lib/billing/credit-engine.ts` | Credit deduction, balance read, low-balance check |
| `src/lib/billing/usage-engine.ts` | TX counter increment and period tracking |
| `src/lib/billing/billing-provider.ts` | External billing provider adapter interface |
| `src/lib/jobs/subscription-lifecycle.ts` | Daily status transition job |
| `src/lib/jobs/usage-counter-reset.ts` | Monthly counter reset job |
| `src/routes/(private)/(dashboard)/transactions/index.tsx` | Transaction history page |
| `src/routes/(private)/(dashboard)/transactions/$transactionId/index.tsx` | Transaction detail page |
| `src/routes/(private)/(dashboard)/order-history/index.tsx` | Order history page |
| `src/routes/(private)/(dashboard)/billing/index.tsx` | Subscription & billing dashboard |
| `src/routes/(private)/(dashboard)/billing/invoices/index.tsx` | Invoice history |
| `src/routes/(private)/(dashboard)/billing/credits/index.tsx` | Credit balance & history |
| `src/routes/subscription/reactivate/index.tsx` | Reactivation flow (minimal auth shell) |


---

## Part 6 — Business Engine Architecture

> This section formalizes a design pattern that has emerged naturally throughout the project and establishes it as a first-class architectural principle. All future domain development should follow this pattern.

---

### 6.1 What Is a Business Engine?

A **Business Engine** is a domain module that owns all the business rules for a single business capability. It is the authoritative source of truth for calculations, decisions, and transformations within its domain.

Business Engines are **not** services. They do not talk to databases, make HTTP requests, or interact with any framework. They receive data as inputs and return results as outputs. That is their entire contract.

The pattern already exists in this codebase:

| Engine | Location | Domain |
|---|---|---|
| `UnitEngine` | `src/lib/conversion/unit-engine.ts` | Unit conversion and precision |
| `PriceEngine` | `src/lib/conversion/price-engine.ts` | Currency arithmetic and formatting |
| `TaxEngine` | `src/lib/conversion/tax-engine.ts` | VAT calculation and BIR compliance |
| `InventoryEngine` | `src/lib/conversion/inventory-engine.ts` | Stock reservation, yield calculation, physical stock lookup |
| `CostingEngine` | `src/lib/costing/index.ts` | Inventory consumption cost via pluggable strategies (FIFO, Moving Average, Specific) |

These engines are already used together in `createPosTransaction`: the infrastructure layer fetches product and inventory data from the local collections, then passes that data into the engines for all business decisions. The engines never know where the data came from.

---

### 6.2 Why This Pattern

The pattern solves a problem that compounds as the codebase grows: **business logic that is entangled with infrastructure becomes untestable, unreusable, and fragile**.

When a VAT rule, a stock deduction algorithm, or a subscription check lives inside a database query function or a React component, it can only be exercised through that exact infrastructure path. You cannot unit test it in isolation, you cannot reuse it in a background job, and you cannot run it offline.

Extracting business logic into engines solves all three:

- **Testability.** Engines are pure functions or deterministic objects. You can test every edge case — every discount combination, every costing batch scenario, every entitlement state — by calling the engine directly with sample data. No mocking, no database setup.
- **Reusability.** The same `TaxEngine.summarize` runs in the browser during checkout, on the server during receipt generation, and in a background job during tax report reconciliation. It is the same code, not a copy.
- **Clarity.** When someone asks "how does SC/PWD discount affect the VAT base?", the answer is in `TaxEngine`. Not spread across five files.

---

### 6.3 Engine Principles

Every Business Engine in this project must follow these rules:

**Ownership**
- Owns exactly one business domain.
- Is the single source of truth for all rules in that domain.
- Does not delegate domain decisions to another engine (it may call another engine for a sub-calculation, but never for a domain decision).

**Purity**
- Contains only business logic: calculations, validation, strategy selection, domain transformations.
- Deterministic: the same inputs always produce the same outputs.
- No side effects: does not write to any store, collection, or external system.

**Independence**
- No UI dependencies. No React, no hooks, no component state.
- No routing dependencies. No TanStack Router, no navigation.
- No HTTP awareness. No fetch, no API calls, no request/response handling.
- No database access. No Prisma, no ORM, no collection reads or writes.
- No framework-specific logic of any kind.

**Portability**
- Can be called from any layer: browser client, server function, background job, scheduled job, test runner.
- Can be imported from both `prisma/generated/prisma/browser` and `prisma/generated/prisma/client` type roots (use DTOs where necessary rather than raw Prisma model types to avoid platform splits).

---

### 6.4 The Infrastructure Layer

Infrastructure is the layer that connects engines to the real world. Its job is to:
1. Read data from the database, local collections, or external APIs.
2. Pass that data to the appropriate Business Engine.
3. Persist the engine's output back to the database or collection.
4. Handle errors, retries, and transactional integrity.

Infrastructure should contain **no business logic**. If an infrastructure function is making a domain decision — computing a discount, deciding which inventory batch to consume first, evaluating whether a business is entitled to perform an action — that logic belongs in an engine.

```
Infrastructure reads data
      ↓
Business Engine makes decisions
      ↓
Infrastructure writes results
```

The direction of dependency is always one way: **infrastructure calls engines, engines never call infrastructure**.

Current examples of this pattern in the codebase:

- `createPosTransaction` (infrastructure) calls `TaxEngine.summarize`, `InventoryEngine.getReservedMap`, and `CostingEngine.prepareConsumption` (engines) — then writes the results to the local collections.
- `fetchActiveOrders` (infrastructure) fetches from collections and assembles the data shape — no business logic lives inside it.

---

### 6.5 The Strategy Pattern — CostingEngine as the Reference

The `CostingEngine` demonstrates the most important extension of this pattern: **pluggable strategies behind a unified interface**.

The facade (`CostingEngine.prepareConsumption`) accepts a `CostingStrategyType` parameter and dispatches to the correct engine:

```
CostingEngine.prepareConsumption(strategy, params, inventory)
  ├─ 'FIFO'           → FIFOEngine.consume(batches, qty)
  ├─ 'MOVING_AVERAGE' → MovingAverageEngine.consume(batches, qty)
  └─ 'SPECIFIC'       → SpecificEngine.consume(batches, qty)
```

Each strategy implements the same `(batches, qty) → CostingResult` contract. The caller never needs to know which strategy is running. Adding a new strategy (e.g., `WEIGHTED_AVERAGE`) requires creating one new file and adding one `case` to the switch — no changes to callers.

This is the model for any domain where the algorithm can vary by context. The billing domain is the next place this pattern should be applied.

---

### 6.6 Expanding to the Billing Domain

The billing, subscription, and entitlement domain should follow the same engine architecture rather than being implemented as large service classes that mix business logic with infrastructure.

The proposed engines for the billing domain:

| Engine | Location | Domain |
|---|---|---|
| `EntitlementEngine` | `src/lib/entitlement/entitlement-engine.ts` | Evaluates whether a business can perform an action |
| `SubscriptionEngine` | `src/lib/billing/subscription-engine.ts` | Subscription state transitions and lifecycle rules |
| `UsageEngine` | `src/lib/billing/usage-engine.ts` | TX counter logic, period boundaries, allowance calculations |
| `CreditEngine` | `src/lib/billing/credit-engine.ts` | Credit balance reads, deduction rules, low-balance detection |
| `InvoiceEngine` | `src/lib/billing/invoice-engine.ts` | Invoice construction, line item calculation, total computation |
| `PlanEngine` | `src/lib/billing/plan-engine.ts` | Plan comparisons, upgrade/downgrade eligibility, feature matrix |

Each engine owns only its domain. Infrastructure (server functions, background jobs, middleware) calls these engines with data it fetched from the database and persists the results.

**Example: EntitlementEngine**

The infrastructure layer fetches the business's subscription status, current usage counter, credit balance, and feature list from the database. It passes all of this to `EntitlementEngine.check` as a plain data object. The engine evaluates the rules and returns an `EntitlementResult`. The infrastructure layer acts on the result — blocking the action, logging the denial, or proceeding.

```ts
// Infrastructure: fetches data, then calls engine
const context: EntitlementContext = {
  status: subscription.status,
  features: plan.entitlements.map(e => e.featureKey),
  txRemaining: counter.includedTxPerMonth - counter.txCount,
  creditBalance: latestLedgerEntry.balanceAfter,
  overrides: entitlementOverrides,
}

// Engine: pure business rules, no DB access
const result = EntitlementEngine.check('FEATURE_POS', context)

// Infrastructure: acts on result
if (!result.granted) throw new EntitlementError(result.code)
```

**Example: SubscriptionEngine with strategies**

Billing model logic (monthly subscription, prepaid credits, hybrid) should be expressed as strategies behind a `SubscriptionEngine` facade — directly mirroring the `CostingEngine` pattern:

```
SubscriptionEngine.evaluateCheckout(billingModel, context)
  ├─ 'MONTHLY_SUBSCRIPTION' → MonthlySubscriptionStrategy.evaluate(context)
  ├─ 'PREPAID_CREDITS'      → PrepaidCreditsStrategy.evaluate(context)
  └─ 'HYBRID'               → HybridStrategy.evaluate(context)
```

This means switching a business's billing model is a data change (update `billingModel` on `BusinessSubscription`), not a code change.

---

### 6.7 Event-Driven Integration Between Engines

As more engines are introduced, avoid coupling them directly. When `createPosTransaction` completes, it should not need to know that billing, reporting, notifications, and analytics all need to react to that event.

Instead, the infrastructure layer emits a domain event after a successful operation. Other modules subscribe to and handle those events independently.

**Domain events this project should eventually support:**

| Event | Emitted By | Consumed By |
|---|---|---|
| `TransactionCompleted` | `createPosTransaction` | UsageEngine (increment counter), CreditEngine (deduct credits), Analytics, Notifications |
| `TransactionRefunded` | `createPosRefund` | CreditEngine (restore credits), UsageEngine (decrement if applicable), Analytics |
| `OrderCompleted` | Order status update | Analytics, Notifications |
| `TrialStarted` | Business creation | Notifications (welcome), Analytics |
| `TrialExpired` | Subscription lifecycle job | EntitlementEngine (re-evaluate), Notifications (conversion prompt) |
| `SubscriptionActivated` | Billing webhook / admin action | EntitlementEngine (invalidate cache), Notifications |
| `SubscriptionExpired` | Subscription lifecycle job | EntitlementEngine (re-evaluate), Notifications (warning) |
| `CreditsPurchased` | Billing flow | CreditEngine (add credits), Notifications (confirmation) |
| `CreditsConsumed` | `createPosTransaction` | CreditEngine (balance check), Notifications (low-balance alert) |
| `UsageLimitReached` | UsageEngine | Notifications (upgrade prompt), EntitlementEngine (re-evaluate checkout permission) |
| `BusinessSuspended` | Admin action | EntitlementEngine (invalidate cache), Notifications |
| `BusinessReactivated` | Billing flow | EntitlementEngine (invalidate cache), Notifications |

This is **architectural guidance for future phases**, not an immediate implementation requirement. The initial billing implementation can use direct calls. The event-driven model becomes valuable once three or more modules need to react to the same event, to avoid a growing web of direct dependencies.

The preferred approach for this stack is a lightweight in-process event bus before any external message queue is introduced. Events are typed, synchronous within a request, and can be promoted to async/durable later without changing the emitter code.

---

### 6.8 Directory Structure

Current layout (existing engines):

```
src/lib/
  conversion/
    unit-engine.ts
    price-engine.ts
    tax-engine.ts
    inventory-engine.ts
  costing/
    index.ts          ← CostingEngine facade
    types.ts
    fifo-engine.ts
    moving-average-engine.ts
    specific-engine.ts
```

Proposed layout for billing engines:

```
src/lib/
  entitlement/
    entitlement-engine.ts
    entitlement-types.ts
    feature-keys.ts
  billing/
    subscription-engine.ts
    usage-engine.ts
    credit-engine.ts
    invoice-engine.ts
    plan-engine.ts
    types.ts
    strategies/
      monthly-subscription-strategy.ts
      prepaid-credits-strategy.ts
      hybrid-strategy.ts
  jobs/
    subscription-lifecycle.ts   ← infrastructure; calls SubscriptionEngine
    usage-counter-reset.ts      ← infrastructure; calls UsageEngine
```

The pattern is consistent: a `types.ts` file per domain, a facade engine that owns the public API, and strategy files where the algorithm can vary.

---

### 6.9 Summary

| Concern | Where It Lives |
|---|---|
| Unit conversion math | `UnitEngine` |
| Currency arithmetic, formatting | `PriceEngine` |
| VAT calculation, BIR compliance | `TaxEngine` |
| Stock reservation, yield calculation | `InventoryEngine` |
| Inventory consumption cost | `CostingEngine` + strategies |
| Entitlement evaluation | `EntitlementEngine` |
| Subscription state rules | `SubscriptionEngine` + strategies |
| Usage tracking logic | `UsageEngine` |
| Credit balance rules | `CreditEngine` |
| Invoice construction | `InvoiceEngine` |
| Database access | Server functions, background jobs |
| React, routing, UI | Routes and components |
| Authentication | better-auth + `authMiddleware` |
| Transactional writes | `dbTransaction` wrapper |

The rule is simple: if it is a business decision, it belongs in an engine. If it is talking to a database, a network, or a UI framework, it belongs in infrastructure.

---

## Part 7 — Final Architecture Review: Domains, Layers & Principles

> This is the architectural handbook section. It does not add features. It organizes and formalizes
> everything already planned into a coherent, named architecture that future contributors can follow
> consistently. Where the previous sections defined *what* to build, this section defines *how to
> think* about building it.

---

### 7.1 Business Domains

Part 6 introduced Business Engines as the atomic unit of business logic. This section organizes engines one level higher into **Business Domains** — cohesive groupings that own a complete business concern end to end.

A Business Domain owns:
- Its Business Engines
- Its Domain Policies
- Its Value Objects
- Its Domain Events
- Its strategy variants
- Its shared type contracts

Everything that belongs to a domain lives together. No domain reaches into another domain's internals. Domains communicate through well-defined contracts and events.

**The domains of this platform:**

#### Commerce Domain
The core selling concern. Owns everything that happens between a customer entering the store and a receipt being issued.

| Component | Type | Responsibility |
|---|---|---|
| `TaxEngine` | Engine | VAT calculation, BIR compliance, discount application |
| `PriceEngine` | Engine | Currency arithmetic, formatting, rate application |
| `InventoryEngine` | Engine | Stock reservation, yield calculation, physical stock lookup |
| `CostingEngine` | Engine | Inventory consumption cost via FIFO, Moving Average, Specific strategies |
| `DiscountPolicy` | Policy | Rules for when and how discounts apply (SC/PWD, general, promotional) |
| `PricingPolicy` | Policy | Inclusive vs. exclusive pricing decisions, buffer rate application |
| `Money` | Value Object | Immutable representation of a monetary amount with currency |
| `Quantity` | Value Object | Amount + unit pair, prevents unitless arithmetic |
| `TaxBreakdown` | Value Object | Immutable VAT summary (vatableSales, vatAmount, exemptSales, etc.) |
| `TransactionCompleted` | Domain Event | Emitted after a successful sale |
| `TransactionRefunded` | Domain Event | Emitted after a refund is processed |
| `OrderCompleted` | Domain Event | Emitted when an order reaches SERVED status |

#### Inventory Domain
Owns all rules governing physical stock: what exists, where it is, and how it moves.

| Component | Type | Responsibility |
|---|---|---|
| `InventoryEngine` | Engine (shared) | Stock calculations (shared with Commerce, Commerce is the consumer) |
| `CostingEngine` | Engine (shared) | Batch consumption cost (shared with Commerce) |
| `InventoryPolicy` | Policy | Low stock thresholds, reorder rules, batch expiry behavior |
| `Quantity` | Value Object | Shared with Commerce domain |
| `InventoryAdjusted` | Domain Event | Emitted on any movement (sale, purchase, task, manual adjust) |
| `LowStockReached` | Domain Event | Emitted when stock falls below threshold |

#### Billing Domain
Owns everything related to subscription lifecycle, feature entitlement, usage tracking, and credit management.

| Component | Type | Responsibility |
|---|---|---|
| `EntitlementEngine` | Engine | Evaluates whether a business can perform a capability |
| `SubscriptionEngine` | Engine | Subscription state machine and lifecycle transition rules |
| `UsageEngine` | Engine | TX counter logic, period tracking, allowance calculations |
| `CreditEngine` | Engine | Credit balance reads, deduction rules, low-balance detection |
| `InvoiceEngine` | Engine | Invoice construction, line item calculation, totals |
| `PlanEngine` | Engine | Plan comparisons, capability matrix, upgrade eligibility |
| `SubscriptionPolicy` | Policy | Grace period rules, long-term inactivity thresholds, trial conversion rules |
| `BillingPolicy` | Policy | Overage billing vs. blocking decisions, credit consumption rates |
| `BillingPeriod` | Value Object | Immutable period start/end pair with boundary calculations |
| `CreditBalance` | Value Object | Immutable credit amount with insufficient-balance detection |
| `UsageSummary` | Value Object | Snapshot of txCount, allowance, remaining, and overage |
| `SubscriptionStatus` | Value Object | Typed status with capability resolution methods |
| `SubscriptionActivated` | Domain Event | |
| `SubscriptionExpired` | Domain Event | |
| `TrialStarted` | Domain Event | |
| `TrialExpired` | Domain Event | |
| `CreditsPurchased` | Domain Event | |
| `CreditsConsumed` | Domain Event | |
| `UsageLimitReached` | Domain Event | |
| `BusinessSuspended` | Domain Event | |
| `BusinessReactivated` | Domain Event | |

#### Identity Domain
Owns authentication, authorization, role resolution, and multi-tenancy concerns. Already implemented via better-auth + Membership model. Remains thin by design.

| Component | Type | Responsibility |
|---|---|---|
| `authMiddleware` | Infrastructure | Session validation and context injection |
| `getAuthUser` | Infrastructure | Assembles merged session payload (user + business + branch + configs + entitlement) |
| `RoleLandingPages` | Policy | Role-to-route mapping |
| `Membership` | Domain Model | User ↔ Business ↔ Branch association with role |

#### Operations Domain
Owns the internal back-office workflows: procurement, task management, cash reconciliation, and employee management.

| Component | Type | Responsibility |
|---|---|---|
| `InventoryPolicy` | Policy (shared) | Governs what task fulfillment does to stock |
| `ProcurementEngine` | Engine (future) | Purchase cost calculations, supplier pricing |
| `TaskCompleted` | Domain Event | Emitted when an OperationalTask reaches FULFILLED |
| `PurchaseCreated` | Domain Event | Emitted when a purchase is recorded |

#### Reporting Domain
Owns all analytics, report generation, and data export concerns. Currently implicit (sales-reports, inventory-reports pages). Formally a domain in future phases.

| Component | Type | Responsibility |
|---|---|---|
| `ReportingEngine` | Engine (future) | Aggregation logic, metric calculation, period comparison |
| `DateRange` | Value Object | Shared immutable date boundary object |


---

### 7.2 Engines vs. Policies — Drawing the Line

Part 6 described Business Engines as the home for business logic. This section distinguishes two types of business logic that live in separate constructs.

**Business Engines execute logic.** They receive data, apply an algorithm, and return a result. The algorithm is deterministic. There is no human judgment involved.

Examples: compute VAT on a set of line items, calculate how many units remain after reserving stock, determine the weighted average cost of consumed batches.

**Domain Policies make decisions.** They codify the business's rules about what is allowed, what is required, and what happens in edge cases. Policies answer "should we?" rather than "how do we?".

Examples: should this transaction be blocked because the allowance is exhausted? Should a low-stock notification fire at 5 units or 10? Is a 20% SC/PWD discount applicable to this line item?

The distinction matters because policies change with business decisions. An engine that mixes calculation with policy becomes fragile — when the policy changes, you risk breaking the calculation. Keeping them separate means the `TaxEngine` never needs to change when the company revises its discount rules.

**Practical boundary:**

| Question | Belongs In |
|---|---|
| "What is the VAT on these items?" | Engine |
| "Should SC/PWD discount apply to this transaction?" | Policy |
| "How many units did we consume from batch A?" | Engine |
| "Should we block checkout when stock is zero, or allow it?" | Policy |
| "What is the remaining credit balance?" | Engine |
| "Should we notify the business at 10 credits or 20?" | Policy |
| "What is the pro-rated amount for a mid-cycle upgrade?" | Engine |
| "Are we allowed to upgrade mid-cycle without penalty?" | Policy |

Policies are implemented as plain objects or functions, co-located with their domain. They read their configuration from `SystemConfig` or domain-level settings — they never hardcode thresholds. Engines call policies when they need a decision; policies call engines when they need a calculation.

**Planned Domain Policies:**

| Policy | Domain | Governs |
|---|---|---|
| `DiscountPolicy` | Commerce | When discounts apply; SC/PWD eligibility rules |
| `PricingPolicy` | Commerce | Inclusive vs. exclusive pricing; buffer rate application |
| `InventoryPolicy` | Inventory | Low-stock threshold; reorder trigger; batch expiry behavior |
| `SubscriptionPolicy` | Billing | Grace period duration; long-term inactivity threshold; trial conversion |
| `BillingPolicy` | Billing | Overage: block vs. charge; credit consumption rate per operation |


---

### 7.3 Application Layers

Business Domains define *what* the rules are. Application layers define *where* those rules get called and how data flows between them. Every request travels through these layers in one direction.

```
UI Layer
  ↓ user actions, form submissions
Application Layer  (Use Cases / Server Functions)
  ↓ calls engines and policies with fetched data
Domain Layer  (Engines, Policies, Value Objects)
  ↓ returns results; never calls upward
Infrastructure Layer  (DB, collections, external APIs, jobs)
  ↓ persists results, emits events
```

**UI Layer**
- React components and routes
- Reads from `authStore` and local collections for display
- Calls Application Layer server functions on mutations
- Uses `EntitlementCode` from the entitlement summary to disable buttons and show upgrade prompts
- Contains zero business logic
- Never reads from Prisma directly

**Application Layer (Use Cases)**
- TanStack Start server functions: `createPosTransaction`, `createPosOrder`, `createPosRefund`, future billing functions
- Coordinates a complete workflow: fetch data → call engines → persist results → emit events
- The only layer allowed to read from and write to the database and local collections
- Does not contain business rules — it only orchestrates
- Validates inputs (Zod), then delegates decisions to Domain engines and policies
- Handles transactional integrity via `dbTransaction`

**Domain Layer**
- Business Engines, Domain Policies, Value Objects, Domain Events
- Pure business logic; no infrastructure dependencies
- The same code runs in the browser, on the server, in background jobs, and in tests
- Does not know where its inputs came from or where its outputs go
- Cannot be replaced by infrastructure concerns; if something here needs a DB call, the design is wrong

**Infrastructure Layer**
- Prisma (server-side queries for history, reports, billing)
- TanStack DB + OPFS collections (offline-first POS operations)
- better-auth (session management)
- Background job runners (subscription lifecycle, usage counter resets)
- External provider adapters (billing provider, future notification service)
- Event bus (in-process initially; durable queue later)

**A complete workflow — POS Checkout:**

```
1. UI Layer
   User taps CHECKOUT in cart-aside.tsx
   → Calls createPosTransaction server function with cart data

2. Application Layer (createPosTransaction)
   a. Fetches products and inventory from local collections (Infrastructure)
   b. Fetches entitlement context from subscription collection (Infrastructure)
   c. Calls EntitlementEngine.check('COMPLETE_CHECKOUT', context) → granted ✅ (Domain)
   d. Calls InventoryEngine.getReservedMap(cartItems) → reservedMap (Domain)
   e. Calls TaxEngine.summarize(lineItems, config, discounts) → vatSummary (Domain)
   f. Calls CostingEngine.prepareConsumption('FIFO', params, batches) → costingPlan (Domain)
   g. Calls UsageEngine.incrementCounter(counter, billingModel) → updatedCounter (Domain)
   h. Calls CreditEngine.deduct(balance, consumption) → updatedBalance (Domain)
   i. Writes Order, OrderItems, Transaction, Payments, TaxLines, InventoryMovements (Infrastructure)
   j. Emits TransactionCompleted event (Infrastructure)

3. Infrastructure (event bus)
   TransactionCompleted → UsageCounter upsert
   TransactionCompleted → CreditLedger insert (if prepaid)
   TransactionCompleted → Notification check (if low balance)

4. UI Layer
   authStore receives updated entitlement summary
   Receipt dialog opens
```

Every decision in step 2 lives in a Domain engine or policy. The Application layer is a coordinator, not a decision-maker.


---

### 7.4 Value Objects

Value Objects are small, immutable types that represent a domain concept with inherent rules. They replace primitive types (`number`, `string`) in places where the primitive alone is ambiguous or unsafe.

**Why they matter:**

A `number` named `price` could mean cents or dollars, could be negative, could be zero. A `Money` value object always carries its unit (cents), validates non-negativity at construction, and exposes only safe arithmetic operations. A function that accepts `Money` instead of `number` is self-documenting and cannot be passed an inventory quantity by accident.

**Value Object rules:**
- Immutable: once constructed, values do not change
- Equality by value, not by reference
- Constructed through a factory that validates invariants
- Contains domain behavior (arithmetic, comparisons, formatting)
- No database identity (no `id` field)

**Planned Value Objects and where they prevent bugs:**

`Money`
```ts
// Prevents: passing raw cents vs. dollars to the wrong function
// Prevents: currency mismatch in multi-currency future
type Money = { amount: number; currency: string }
Money.of(1000, 'PHP')         // ₱10.00
money.add(other)              // validates same currency before adding
money.format(locale)          // formats with Intl.NumberFormat
```

`Quantity`
```ts
// Prevents: adding kg to pieces; consuming more than available
type Quantity = { amount: number; unit: Unit }
Quantity.of(2.5, kgUnit)
qty.toBase()                  // always in base unit for comparison
qty.isInsufficient(reserved)  // explicit API, no raw subtraction
```

`TaxBreakdown`
```ts
// Replaces VatSummary with a proper value object
// Ensures BIR invariants (vatAmount ≈ vatableSales * rate) are checked at construction
// Prevents: manually assembling partial summaries across multiple call sites
TaxBreakdown.from(lineItems, config, discounts)
breakdown.validate()          // throws if BIR integrity check fails
breakdown.toReceiptLines()    // presentation method
```

`BillingPeriod`
```ts
// Prevents: off-by-one period boundary errors in usage tracking
// Prevents: overlapping or gap periods in UsageCounter resets
BillingPeriod.currentMonth(subscriptionStartDay)
period.contains(date)
period.next()
period.overlaps(other)
```

`CreditBalance`
```ts
// Prevents: checking raw numbers for insufficiency across the codebase
// Prevents: negative balance after race conditions
CreditBalance.of(latestLedgerEntry.balanceAfter)
balance.isSufficient(cost)
balance.deduct(cost)          // returns new CreditBalance; throws if insufficient
```

`UsageSummary`
```ts
// Snapshot of a business's current period state
// Passed to EntitlementEngine instead of raw integers
UsageSummary.from(counter, plan)
summary.isAllowanceExhausted()
summary.remaining              // null if unlimited
summary.overageCount
```

`DateRange`
```ts
// Shared across Reporting and Billing domains
DateRange.of(from, to)
range.contains(date)
range.duration('days')
range.toISOStrings()          // for Prisma where clauses
```

Value objects should be introduced at the domain boundary — when data enters an engine, it should arrive as a value object, not as a raw primitive from the database row.


---

### 7.5 Business Capabilities (Replacing Feature Flags)

The current `ConfigKey` enum contains `ENABLE_ORDER`, `ENABLE_TASK`, `ENABLE_CASH_RECONCILIATION`, `ENABLE_ORDER_TAB`. These are boolean flags that turn specific UI sections on or off. They are a v1 expedient, not a long-term architecture.

The problem with feature flags is that they answer the wrong question. "Is ENABLE_ORDER true?" tells you a configuration value. It tells you nothing about whether this specific business, with this specific subscription, in this specific state, is allowed to create an order right now.

**Business Capabilities** answer the right question. A capability is a named permission that the system can grant or deny, evaluated in full context.

Rather than:
```ts
if (user.systemConfigs.ENABLE_ORDER) { ... }
```

The architecture uses:
```ts
const result = EntitlementEngine.check('CREATE_ORDER', context)
if (!result.granted) { ... }
```

**Capability naming convention:**

Capabilities use verb-noun form, scoped to an action the business is performing. This makes them self-documenting and prevents ambiguity.

```
CREATE_ORDER              COMPLETE_CHECKOUT         RECORD_PAYMENT
CREATE_TRANSACTION        ISSUE_REFUND              PRINT_RECEIPT
MANAGE_PRODUCTS           MANAGE_INVENTORY          MANAGE_EMPLOYEES
MANAGE_CUSTOMERS          MANAGE_SUPPLIERS          MANAGE_TASKS
MANAGE_PURCHASES          MANAGE_BRANCHES           MANAGE_SETTINGS
VIEW_SALES_REPORTS        VIEW_INVENTORY_REPORTS    VIEW_TRANSACTION_HISTORY
VIEW_ANALYTICS            EXPORT_DATA               ACCESS_API
START_VENDOR_SESSION      MANAGE_BILLING            REACTIVATE_SUBSCRIPTION
```

**How capabilities map to the existing `Feature` model:**

The `Feature` model already stores `key: String` and `isOperational: Boolean`. The capability names above replace the `FEATURE_*` key convention with a cleaner verb-noun form. The `isOperational` flag remains: `true` means the capability is blocked on subscription lapse; `false` means it is always accessible.

**Migration from feature flags:**

The `ENABLE_*` flags in `ConfigKey` are not removed immediately. During the transition, the entitlement engine checks `PlanEntitlement` first. If no record exists, it falls back to the `SystemConfig` flag. This allows the two systems to coexist until all features have been migrated.

**Capability resolution in the UI:**

The `authStore` entitlement summary includes a `capabilities: string[]` array derived from the business's current plan and subscription status. UI components check membership in this array:

```ts
// In a component
const canCreateOrder = entitlement.capabilities.includes('CREATE_ORDER')

<Button disabled={!canCreateOrder}>New Order</Button>
```

This is the only place capabilities are checked in the UI. No scattered billing conditionals in route components.


---

### 7.6 Domain Events — Full Specification

A **Domain Event** is a record that something significant happened in the domain. It is named in the past tense, immutable, and carries enough information for any consumer to act on it without querying additional data.

**What qualifies as a Domain Event:**
- It represents a state change that has already occurred (past tense)
- Multiple domains may need to react to it independently
- It has a stable identity: `id`, `occurredAt`, `payload`
- It is not a command ("CreateOrder") — events describe facts, not intentions

**What does NOT qualify:**
- A synchronous calculation result (engine output is not an event)
- An internal implementation detail (updating a local variable is not an event)
- An infrastructure signal (a DB trigger is not a domain event)

**Domain Event catalog:**

| Event | Domain | Key Payload Fields | Consumers |
|---|---|---|---|
| `TransactionCompleted` | Commerce | `transactionId`, `businessId`, `totalAmount`, `txCount` | Billing (usage), Billing (credits), Reporting, Notifications |
| `TransactionRefunded` | Commerce | `transactionId`, `originalTransactionId`, `amount` | Billing (credit restore), Reporting |
| `OrderCompleted` | Commerce | `orderId`, `businessId` | Reporting, Notifications |
| `InventoryAdjusted` | Inventory | `variantId`, `movementType`, `quantity`, `businessId` | Reporting, Notifications (low stock) |
| `LowStockReached` | Inventory | `variantId`, `currentStock`, `threshold` | Notifications |
| `TaskCompleted` | Operations | `taskId`, `taskType`, `businessId` | Inventory (side effects), Reporting |
| `PurchaseCreated` | Operations | `purchaseId`, `supplierId`, `totalCost` | Inventory (restock), Reporting |
| `TrialStarted` | Billing | `businessId`, `trialEndsAt` | Notifications (welcome) |
| `TrialExpired` | Billing | `businessId` | Entitlement (cache invalidate), Notifications |
| `SubscriptionActivated` | Billing | `businessId`, `planId`, `status` | Entitlement (cache invalidate), Notifications |
| `SubscriptionExpired` | Billing | `businessId` | Entitlement (cache invalidate), Notifications |
| `CreditsPurchased` | Billing | `businessId`, `amount`, `balanceAfter` | Notifications |
| `CreditsConsumed` | Billing | `businessId`, `amount`, `balanceAfter` | Notifications (low balance check) |
| `UsageLimitReached` | Billing | `businessId`, `txCount`, `limit` | Entitlement (re-evaluate), Notifications |
| `BusinessSuspended` | Billing | `businessId`, `reason` | Entitlement (cache invalidate), Notifications |
| `BusinessReactivated` | Billing | `businessId` | Entitlement (cache invalidate), Notifications |

**Publication and consumption:**

Events are published by the **Application Layer** (server functions, background jobs) after a successful state change — never from inside engines or policies. Engines return results; the application layer decides whether to emit an event based on that result.

Consumers are registered with an in-process event bus. In v1, the event bus is synchronous and in-process:

```ts
// Application layer, after createPosTransaction succeeds
EventBus.publish(new TransactionCompleted({
  transactionId: transaction.id,
  businessId: user.business.id,
  totalAmount: vatSummary.totalAmount,
  txCount: updatedCounter.txCount,
}))

// Billing subscriber (registered at app startup)
EventBus.subscribe('TransactionCompleted', async (event) => {
  await usageCounterRepository.upsert(event.businessId, event.txCount)
  if (billingModel === 'PREPAID_CREDITS') {
    await creditLedgerRepository.insert(CONSUMED, event.businessId)
  }
})
```

**When to use events vs. direct calls:**

Use events when: the caller does not need the result, multiple consumers need to react, or the consumer belongs to a different domain.

Use direct calls when: the result is needed immediately (e.g., entitlement check before proceeding), only one consumer exists, or failure in the consumer should fail the caller.

The entitlement check before `createPosTransaction` remains a direct call. The usage counter increment after the transaction succeeds becomes an event.


---

### 7.7 Future Engine Candidates

Every engine candidate below was evaluated against the same criteria: does it represent a cohesive business domain with enough logic to warrant extraction? Utilities and infrastructure concerns are excluded.

**Recommended — clear domain with non-trivial logic:**

`ReportingEngine`
Aggregation logic, period-over-period comparison, metric derivation (gross margin, turn rate, sell-through). Currently implicit in the reports pages. As reporting moves server-side, a dedicated engine prevents report logic from living in Prisma queries.

`PromotionEngine`
Discount rules for promotional campaigns: percentage off, buy-X-get-Y, minimum spend thresholds, validity windows. Different from `DiscountPolicy` (which governs when discounts apply) — `PromotionEngine` calculates what the promotion yields. Introduced when promotions ship.

`ProcurementEngine`
Supplier pricing logic, purchase cost vs. moving average cost comparison, reorder quantity suggestions. Currently the purchase creation flow has no cost analysis. This becomes relevant when procurement reporting is added.

**Speculative — introduce only when the domain is well-understood:**

`LoyaltyEngine` — points accrual and redemption rules. Only relevant when a loyalty program ships. Do not create ahead of time.

`ForecastEngine` — demand forecasting and reorder suggestions. Requires historical data volume to be meaningful. Post-v2.

`RecommendationEngine` — product upsell and cross-sell logic. Requires behavioral data. Post-v2.

**Not engines — these are infrastructure or utilities:**

- CSV export: infrastructure concern (formatting + file generation), not a domain engine
- PDF receipt generation: infrastructure concern
- Barcode parsing: utility function, not a domain
- Notification dispatch: infrastructure concern (delivery mechanism)
- Email templates: infrastructure concern

The test: if it does not make a domain decision — if it is purely transformation, formatting, or I/O — it does not belong in an engine.


---

### 7.8 Architectural Anti-Patterns & Mitigations

These are the failure modes this architecture is specifically designed to prevent.

**God Object / God Service**

A single class or module that accumulates responsibilities across multiple domains. Symptom: a `BusinessService` with 40 methods spanning billing, inventory, tax, and employees.

Mitigation: the domain boundary is the guard. If a module grows methods that belong to more than one domain, the methods that don't belong are extracted to their correct domain. The domain model in 7.1 is the authority — not the file structure.

**Mega Engine**

An engine that starts small and absorbs adjacent logic until it owns half the codebase. Symptom: `TaxEngine` starts handling discount eligibility, then pricing strategy, then receipt formatting.

Mitigation: each engine has a written domain definition (as in 7.1). When a proposed method does not fit the definition, it goes in a new engine or policy. `TaxEngine` computes tax. Discount eligibility is `DiscountPolicy`. Receipt formatting is infrastructure.

**Business Logic in the UI**

A React component that contains a VAT calculation, a stock check, or a subscription eligibility rule. Symptom: a `<CheckoutButton>` that re-implements `TaxEngine.summarize` inline.

Mitigation: the UI Layer rule is strict — components read state, call server functions, and use `EntitlementCode` to toggle disabled states. They never compute domain results. If logic appears in a component, it is extracted to its engine immediately.

**Business Logic in Infrastructure**

A Prisma query function that contains a business rule. Symptom: `downloadTransactionsCSV` computing gross margin inline instead of calling a reporting engine.

Mitigation: infrastructure functions fetch and persist. Any computation they need comes from a domain engine called with the fetched data. If a Prisma query file contains arithmetic beyond simple aggregation, it is extracted.

**Circular Domain Dependencies**

Domain A calls Domain B which calls Domain A. Symptom: `EntitlementEngine` imports from `SubscriptionEngine` which imports from `EntitlementEngine`.

Mitigation: the domain dependency graph must be a directed acyclic graph. The planned dependency directions are: Commerce depends on nothing; Billing depends on Commerce events but never imports Commerce engines; Identity depends on nothing. If a circular reference appears, one of the dependencies is wrong — extract the shared concept into a shared value object or a new domain.

**Leaky Abstractions**

An engine that returns a Prisma model type, coupling all callers to the ORM schema. Symptom: `CostingEngine.prepareConsumption` returns `Inventory[]` instead of `CostingResult`.

Mitigation: all engine inputs and outputs use DTOs or Value Objects defined in the domain's `types.ts`. The existing `CostingEngine` already does this correctly — `InventoryBatchDTO` is a plain object, not a Prisma type. All new engines follow the same rule.

**Scattered Entitlement Checks**

Subscription checks littered across route components, server functions, and UI event handlers. Symptom: 15 different places checking `subscription.status === 'ACTIVE'`.

Mitigation: the single `EntitlementEngine.check(capability, context)` call is the only place entitlement is evaluated. The entitlement summary on `authStore` is the only place the UI reads capability state. Any PR that introduces a new direct subscription status check outside these two paths should be rejected.

**Framework-Coupled Business Logic**

Business rules that can only run inside a React component or a TanStack server function. Symptom: a tax calculation that uses `useStore` to read the VAT rate.

Mitigation: the engine portability rule (7.3, Domain Layer) is enforced by the absence of framework imports in engine files. The existing `TaxEngine` already accepts `TaxEngineConfig` as a plain argument rather than reading from `authStore` directly. New engines follow the same pattern. Configuration is passed in; it is never pulled from a store.


---

### 7.9 Platform Administration

The current architecture focuses entirely on the **tenant application** — the interface a business uses to operate its POS. As the platform grows, a second application becomes necessary: the **Platform Administration** interface used by the platform operators to manage the businesses themselves.

**What Platform Administration owns:**

| Concern | Description |
|---|---|
| Business management | View, search, suspend, restore tenant businesses |
| Subscription management | Override subscription status, extend trials, force-expire accounts |
| Entitlement management | Grant or revoke `EntitlementOverride` records per business |
| Credit management | Issue promotional credits, adjust credit balances |
| Invoice management | View all invoices, mark as paid, void invoices |
| Billing configuration | Manage `SubscriptionPlan` tiers and `PlanEntitlement` records |
| Platform analytics | Cross-tenant metrics: active businesses, churn, MRR, usage trends |
| Feature rollouts | Manage `Feature` registry, enable/disable features globally |
| Operational support | Audit subscription status history, investigate billing disputes |

**Architecture decision: separate application, shared domain**

Platform Administration should be a **separate application** — its own route tree, its own auth flow (platform admin users are not tenant users), and its own UI. It is not a route added to the existing tenant application.

However, it shares the same **domain layer**. The same `EntitlementEngine`, `SubscriptionEngine`, `CreditEngine`, and other engines that power the tenant application also power the platform admin. The engines do not know who is calling them.

This means:
- A single Prisma schema serves both applications
- Domain logic is written once and tested once
- Platform admin operations go through the same engine rules as tenant operations — no special-casing

**Timeline:** Platform Administration is a post-Phase 3 concern. The schema and domain engines are designed with it in mind from the start (hence the `EntitlementOverride`, `SubscriptionStatusHistory`, and `BillingInvoice` models), but the UI and auth system for platform admins are deferred.

**Auth separation:**

Platform admin users will require a separate authentication path. They are not `Membership` records in the tenant schema. A `PlatformAdmin` model with its own session management (separate `better-auth` instance or separate credential store) is the correct approach. This prevents any risk of a tenant user gaining platform admin access through misconfigured roles.


---

### 7.10 Complete Directory Structure

The directory structure enforces domain boundaries at the filesystem level. A developer opening `src/lib` should immediately understand which domain they are in.

```
src/
  lib/
    // --- COMMERCE DOMAIN ---
    conversion/
      unit-engine.ts          ← UnitEngine
      price-engine.ts         ← PriceEngine
      tax-engine.ts           ← TaxEngine
      inventory-engine.ts     ← InventoryEngine
    costing/
      index.ts                ← CostingEngine facade
      types.ts
      fifo-engine.ts
      moving-average-engine.ts
      specific-engine.ts
    commerce/
      policies/
        discount-policy.ts    ← DiscountPolicy
        pricing-policy.ts     ← PricingPolicy
      value-objects/
        money.ts              ← Money
        quantity.ts           ← Quantity
        tax-breakdown.ts      ← TaxBreakdown
      events/
        transaction-completed.ts
        transaction-refunded.ts
        order-completed.ts

    // --- BILLING DOMAIN ---
    entitlement/
      entitlement-engine.ts   ← EntitlementEngine
      entitlement-types.ts
      capability-keys.ts      ← COMPLETE_CHECKOUT, CREATE_ORDER, etc.
    billing/
      subscription-engine.ts  ← SubscriptionEngine
      usage-engine.ts         ← UsageEngine
      credit-engine.ts        ← CreditEngine
      invoice-engine.ts       ← InvoiceEngine
      plan-engine.ts          ← PlanEngine
      types.ts
      policies/
        subscription-policy.ts
        billing-policy.ts
      strategies/
        monthly-subscription-strategy.ts
        prepaid-credits-strategy.ts
        hybrid-strategy.ts
      value-objects/
        billing-period.ts     ← BillingPeriod
        credit-balance.ts     ← CreditBalance
        usage-summary.ts      ← UsageSummary
        subscription-status.ts
      events/
        subscription-activated.ts
        subscription-expired.ts
        trial-started.ts
        trial-expired.ts
        credits-purchased.ts
        credits-consumed.ts
        usage-limit-reached.ts
        business-suspended.ts
        business-reactivated.ts

    // --- SHARED ---
    shared/
      value-objects/
        date-range.ts         ← DateRange (shared by Billing & Reporting)
      events/
        event-bus.ts          ← In-process event bus
        domain-event.ts       ← Base DomainEvent type

    // --- INFRASTRUCTURE ---
    better-auth/
      auth.ts
      auth-server.ts
      auth-middleware.ts
    prisma-client.ts
    jobs/
      subscription-lifecycle.ts
      usage-counter-reset.ts
    queries/                  ← Application layer server functions
      create-pos-transaction.ts
      create-pos-order.ts
      create-pos-refund.ts
      fetch-pos-products.ts
      fetch-active-orders.ts
      fetch-structured-id.ts
      fetch-transaction-history.ts   ← new
      fetch-order-history.ts         ← new
    server-fn/
      download-transactions.ts
```

The rule: files inside a domain directory (`commerce/`, `billing/`, `entitlement/`) do not import from other domain directories. Cross-domain communication happens through events or shared value objects in `shared/`.

---

### 7.11 Architectural Principles

These are the decisions that should not require debate on every PR. They are the standing architectural choices of this project.

**1. Business logic belongs in Business Engines and Domain Policies.**
If you are writing a calculation, a validation, or a business rule, and you find yourself reaching for a Prisma import or a React hook, stop. Extract the logic to the appropriate engine or policy, then call it from infrastructure or the UI.

**2. Infrastructure depends on the domain. The domain never depends on infrastructure.**
Engines and policies import from `types.ts` and other engines/policies only. They never import from `db/`, `prisma-client`, `better-auth`, or any framework package. If a violation appears, the design is wrong — not the rule.

**3. Business Domains own their rules completely.**
A domain's engine is the only place its rules live. No billing logic in a route component. No tax logic in a Prisma query. No inventory policy in a UI store. If you cannot find a rule by looking in the domain's directory, it does not have a canonical home yet — that is a problem to fix immediately.

**4. Prefer composition over inheritance.**
The codebase uses plain objects and functions, not class hierarchies. `CostingEngine` delegates to strategy objects rather than subclassing. Engines are composed from smaller engines when needed. Inheritance introduces implicit coupling across levels; composition makes dependencies explicit.

**5. Prefer configuration over hardcoding.**
No monetary amounts, time periods, stock thresholds, or tier limits are hardcoded in source. They live in `SystemConfig` (per-business/branch/user scope) or in the `SubscriptionPlan`/`PlanEntitlement` database records. When a business rule changes, the change is a data update, not a deployment.

**6. Build for extensibility without unnecessary complexity.**
Add the abstraction when the second use case appears, not when the first one is written. `CostingEngine` has strategies because three different costing methods existed at the time it was designed. `EntitlementEngine` has a capabilities model because the subscription tiers make it necessary from day one. Do not create a strategy layer for something that has exactly one implementation.

**7. Keep domain logic deterministic and testable.**
An engine method, given the same inputs, must always return the same output. No random numbers, no `Date.now()` reads, no external state reads inside engines. If a timestamp is needed, pass it as a parameter. This makes every engine trivially unit-testable: call it with input, assert the output, done.

**8. Preserve clear boundaries between domains.**
The domain boundary is a hard wall, not a guideline. Direct imports between domain directories are a design error. When two domains need to share a concept, that concept belongs in `shared/` or in a domain event. This discipline prevents the architecture from collapsing into a monolith over time.

**9. Authentication and entitlement are cross-cutting concerns, not features.**
Every server function and background job that touches business data passes through `authMiddleware`. Every operational action evaluates `EntitlementEngine.check` before proceeding. These are non-negotiable, and their absence in any new code path is a security defect, not a missing feature.

**10. Data is never deleted for billing reasons.**
Businesses that lapse, expire, or cancel retain all their historical data indefinitely. The subscription status controls access, not data existence. This is both a product commitment and a technical constraint: no cascade deletes, no archival jobs, no data truncation based on billing state.


---

## Part 8 — Governance & Architecture Validation

> This is the final pass before implementation begins. It does not redesign the architecture.
> It validates, governs, and stabilizes it. After this section, the document is considered
> the project's architectural constitution. Future changes go through ADRs, not revisions.

---

### 8.1 Ubiquitous Language

One of the most common causes of architectural drift is terminology inconsistency. The same concept gets called different things in different parts of the codebase, and over time contributors work from different mental models of the same system.

The following terms are the canonical vocabulary of this project. Every PR, commit message, comment, and conversation should use these terms consistently.

| Term | Definition | Never call it |
|---|---|---|
| **Business Domain** | A cohesive grouping that owns a complete business concern end-to-end (Commerce, Billing, Inventory, Identity, Operations, Reporting) | Module, package, service, namespace |
| **Business Engine** | A pure, deterministic module that executes business logic for one domain. No infrastructure dependencies. | Service, helper, utility, manager, handler |
| **Domain Policy** | A module that codifies configurable business decisions ("should we?"). Reads from SystemConfig; never hardcodes thresholds. | Rule, validator, guard, config reader |
| **Value Object** | An immutable type that represents a domain concept with built-in invariants. Equality by value; no identity. | DTO, model, type (in isolation) |
| **Domain Event** | An immutable, past-tense record that something significant happened. Published by the Application Layer, consumed by subscribers. | Callback, hook, trigger, notification |
| **Business Capability** | A named, verb-noun permission that the entitlement system grants or denies. (`CREATE_ORDER`, `COMPLETE_CHECKOUT`) | Feature flag, permission, role check |
| **Application Service** | A server function that orchestrates a workflow: fetch → engine → persist → publish event. Contains no business rules. | Use case, controller, action, resolver |
| **Infrastructure Adapter** | Any module that communicates with the external world: Prisma, TanStack DB collections, better-auth, external billing API, job runner. | Repository (avoid), service (avoid) |
| **Strategy** | A swappable algorithm variant that implements a shared interface. Selected at runtime by a facade engine. | Plugin, provider (in this context) |
| **EntitlementContext** | The plain data object passed into `EntitlementEngine.check` — assembled by infrastructure, consumed by the engine. | Session, user context (ambiguous) |
| **Capability key** | A string constant in `SCREAMING_SNAKE_CASE` verb-noun form registered in the `Feature` table and evaluated by `EntitlementEngine`. | Feature flag, permission name, scope |
| **Billing period** | The window of time covered by a `UsageCounter` record. Defined by `periodStart` and `periodEnd`. | Billing cycle, subscription period |
| **Tenant** | A `Business` record. The unit of multi-tenancy. | Account, organisation, client |

**Terminology conflicts in the current document to be aware of:**

- Part 2 and Part 6 use `FEATURE_*` key format (e.g., `FEATURE_POS`). Part 7.5 introduces the preferred verb-noun capability format (`CREATE_ORDER`). Both are valid during the transition period. New capabilities should use verb-noun. Existing `FEATURE_*` keys are migrated progressively as described in Part 3.7.
- "Feature" as used in the `Feature` database model refers to the same concept as a "Business Capability". The model is correctly named `Feature` in the schema; the capability key stored in `Feature.key` should use verb-noun format going forward.


---

### 8.2 Architectural Dependency Rules

These are hard constraints, not guidelines. A violation is a design defect, not a style preference.

#### Layer Dependency Rules

```
UI Layer           → may call: Application Layer, read authStore, read local collections
Application Layer  → may call: Domain Layer, Infrastructure Layer
Domain Layer       → may call: Domain Layer (same or shared domain only), nothing else
Infrastructure     → may call: Domain Layer, external systems
```

| From \ To | UI | Application | Domain | Infrastructure |
|---|---|---|---|---|
| UI | ✅ | ✅ (server fn calls) | ❌ | ❌ |
| Application | ❌ | ✅ (within reason) | ✅ | ✅ |
| Domain | ❌ | ❌ | ✅ (same domain) | ❌ |
| Infrastructure | ❌ | ❌ | ✅ | ✅ |

The hardest rule: **Domain never imports from Infrastructure**. If an engine file contains an import from `prisma-client`, `collections`, `better-auth`, or any external SDK, it is a violation.

#### Domain Cross-Dependency Rules

Domains may emit events consumed by other domains. They must not directly import from another domain's engines or policies.

```
Commerce   → emits: TransactionCompleted, TransactionRefunded, OrderCompleted
           → imports from: shared/ only
           → never imports: billing/, entitlement/

Billing    → consumes: TransactionCompleted (via event bus)
           → imports from: shared/ only
           → never imports: commerce/, inventory/, operations/

Inventory  → consumes: TransactionCompleted, TaskCompleted, PurchaseCreated (via event bus)
           → imports from: shared/ only

Identity   → standalone; no domain imports
           → consumed by: Application Layer only (via authMiddleware)

Operations → emits: TaskCompleted, PurchaseCreated
           → may read Inventory state via Application Layer, never via direct import

Reporting  → consumes events from all domains
           → imports from: shared/ (DateRange) only
           → never imports from any business domain's engines
```

#### Event Rules

- Only the **Application Layer** may publish Domain Events.
- Engines and Policies must never publish events directly — they return results, the Application Layer decides what to emit.
- Event handlers (subscribers) live in the **Infrastructure Layer**. They read the event payload and call infrastructure or Application Layer code. They must not call Domain engines directly without going through an Application Service.
- Event payloads must be self-contained. A handler must not need to query additional data to act on an event.

#### Infrastructure Access Rules

- Only the **Application Layer** may read from or write to Prisma or TanStack DB collections.
- The **UI Layer** may read from local TanStack DB collections for display purposes. It must never call Prisma directly.
- Background jobs are Application Layer code, not Infrastructure. They call engines and use infrastructure to persist results, like any other Application Service.
- The `authMiddleware` is the only place session data is read from the auth provider. No engine or Application Service accesses session state directly.


---

### 8.3 Architecture Decision Records

The following decisions are foundational. They are unlikely to change, and any proposal to change them should be treated as a major architectural event requiring explicit discussion. Each is recorded here with the context that drove it.

---

**ADR-001: Business Engine Architecture**

_Decision:_ All business logic lives in pure, deterministic Business Engines with no infrastructure dependencies.

_Context:_ The POS transaction flow (`createPosTransaction`) was already calling isolated calculation modules (`TaxEngine`, `InventoryEngine`, `CostingEngine`) by the time this pattern was formalized. The pattern existed in practice; this ADR names and governs it.

_Rationale:_ Framework-independent business logic can be tested without mocking databases, reused across browser and server, and reasoned about in isolation. The cost of this discipline is low; the benefit compounds with every new feature.

_Consequences:_ Every domain module must pass the portability test: can it be called from a test runner with plain data inputs and no setup? If not, it is not an engine.

_Trade-offs:_ Requires more upfront thought about what data an engine needs vs. what it can fetch itself. Application services become responsible for data assembly.

---

**ADR-002: Business Domains**

_Decision:_ The codebase is organized into named Business Domains. Each domain owns its engines, policies, value objects, and events. Domains do not import from each other.

_Context:_ Without explicit domain boundaries, related logic scatters into wherever it was first needed. Billing logic ends up in the POS flow, inventory logic ends up in the reporting page, and the codebase becomes a web of implicit dependencies.

_Rationale:_ Named boundaries make ownership unambiguous. When a new feature is planned, the first question is "which domain does this belong to?" — not "which file should I put this in?"

_Consequences:_ New features must be assigned to a domain before implementation begins. Cross-domain needs are met through events or shared value objects, never direct imports.

_Trade-offs:_ Requires discipline. The filesystem alone cannot enforce domain boundaries; that requires code review. Consider adding an import linting rule (e.g., eslint-plugin-import boundaries) to automate enforcement.

---

**ADR-003: Offline-First Architecture**

_Decision:_ POS operational data (orders, transactions, inventory) is written to a local TanStack DB + SQLite OPFS store first. The server is the source of authority; local is the source of availability.

_Context:_ Small businesses in the Philippine market frequently experience unreliable internet connectivity. A POS that requires a live server connection for every transaction is not viable as a daily operational tool.

_Rationale:_ Offline-first removes network latency from the critical path of a sale, enables operation during connectivity disruptions, and provides a snappier UI for common operations.

_Consequences:_ All POS operational collections must have defined sync modes (`eager` or `on-demand`). History pages and reports must always read from the server via Prisma, not the local collection. Usage counter increments must be reconciled on reconnection.

_Trade-offs:_ Dual-write complexity. Conflict resolution on reconnect. The offline usage counter buffer introduces a small window where entitlement checks may be based on stale data. This is an accepted trade-off; the buffer is configurable and defaults conservatively.

---

**ADR-004: Centralized Entitlement Engine**

_Decision:_ All access control decisions for business capabilities are evaluated by a single `EntitlementEngine`. No direct subscription status checks appear outside of this engine.

_Context:_ The previous architecture used `ConfigKey` boolean flags (`ENABLE_ORDER`, `ENABLE_TASK`). This works for simple on/off switches but cannot express subscription status, usage limits, credit balances, or per-business overrides.

_Rationale:_ A single evaluation point means a single place to audit, a single place to add new rules, and a single place to test. Scattered checks become inconsistent over time and create security gaps when new states (e.g., `LONG_TERM_INACTIVE`) are introduced.

_Consequences:_ Every new operational feature must define a capability key and register it in the `Feature` table. The entitlement check must happen server-side on every mutation. The UI reads a pre-computed capability array from `authStore` for display-time gating.

_Trade-offs:_ Adds a dependency on subscription data in every operational server function. Mitigated by the `authStore` capability cache, which prevents per-action DB round-trips for the common case.

---

**ADR-005: Domain Events for Cross-Domain Communication**

_Decision:_ Domains communicate through typed Domain Events published by the Application Layer and consumed by subscribers. Direct domain-to-domain imports are prohibited.

_Context:_ As more domains are added (Billing reacting to Commerce transactions, Reporting reacting to Inventory movements), direct function calls between domains create tight coupling. Adding a new consumer requires modifying the emitting domain.

_Rationale:_ Events decouple producers from consumers. A new consumer (e.g., a future Loyalty domain) can subscribe to `TransactionCompleted` without touching `createPosTransaction`. The event bus is the integration point, not the function call.

_Consequences:_ The Application Layer is responsible for publishing events. Event payloads must be self-contained. Consumers must be idempotent (a duplicate event should not cause a duplicate effect).

_Trade-offs:_ Events are harder to trace than direct calls. Start with synchronous in-process events (easy to trace) and promote to durable async only when justified by reliability requirements.

---

**ADR-006: Business Capabilities over Feature Flags**

_Decision:_ Feature access is expressed as named Business Capabilities (`CREATE_ORDER`, `COMPLETE_CHECKOUT`) registered in the `Feature` table, not as boolean `ConfigKey` flags.

_Context:_ `ConfigKey` flags answer "is this setting enabled?" — a configuration question. Capabilities answer "is this business allowed to do this right now?" — a business policy question. The two are fundamentally different.

_Rationale:_ Capabilities can express subscription state, usage limits, credit balance, and per-business overrides in a single evaluation. Flags cannot. Capabilities also self-document: `CREATE_ORDER` is unambiguous; `ENABLE_ORDER` is not.

_Consequences:_ Existing `ENABLE_*` flags are deprecated and migrated progressively (see Part 3.7). New features must define a capability key, not a flag.

_Trade-offs:_ More setup per feature (register in DB, add to plan entitlements). Mitigated by seed scripts and the dual-check fallback during transition.

---

**ADR-007: Data Preservation on Billing Lapse**

_Decision:_ No business data is deleted or archived because of a billing status change. Subscription status controls access; it never controls data existence.

_Context:_ For small business operators, their transaction history, customer records, and inventory data represent years of business records. Losing that data due to a missed payment would be catastrophic and a trust-destroying event.

_Rationale:_ Data preservation is a product commitment and a competitive differentiator. It also simplifies the technical model: reactivation is a status change, not a data restore. There are no archival jobs, no restoration flows, no data migration risks.

_Consequences:_ Storage grows without bound for inactive tenants. This is an accepted cost. The platform's storage model must account for indefinite retention.

_Trade-offs:_ Database size grows for long-term inactive accounts. Mitigated by the fact that inactive accounts are not generating new data, and PostgreSQL row-level storage for historical records is inexpensive at this scale.

---

**ADR-008: Platform Administration as a Separate Application**

_Decision:_ Platform operators manage the multi-tenant platform through a separate application with its own authentication path. It shares the domain layer but not the UI, routing, or auth infrastructure.

_Context:_ A separate platform admin application was not needed for launch. However, the schema (EntitlementOverride, SubscriptionStatusHistory, BillingInvoice) was designed with it in mind from the start to avoid a painful migration later.

_Rationale:_ Mixing platform admin routes into the tenant application creates privilege escalation risks, UX confusion, and architectural coupling. A clear separation keeps both applications simpler.

_Consequences:_ Two applications to maintain. Shared domain layer must remain portable (no tenant-specific assumptions).

_Trade-offs:_ Additional deployment surface. Accepted as the correct long-term model.


---

### 8.4 Architecture Stability Classification

Not all parts of the architecture carry the same risk of change. This classification helps contributors understand where to invest in stability vs. where to expect evolution.

#### Core — Stable Foundation

These decisions are foundational. Changing them would require a cross-cutting refactor. They should not change without an explicit ADR and team consensus.

| Area | Why it is stable |
|---|---|
| Business Engine Architecture (ADR-001) | Already in use; proven in the codebase |
| Offline-first with TanStack DB + OPFS (ADR-003) | Fundamental to the product's value proposition |
| Prisma + PostgreSQL as the server-of-record | Already deployed; all models depend on it |
| better-auth for session management | Integrated into every server function |
| Multi-tenancy model (`Business` → `Branch` → `Membership`) | Every table has `businessId`/`branchId`; changing this is a full migration |
| `dbTransaction` wrapper for atomic writes | Used across all operational flows |
| `TransactionType` + `OrderStatus` state machines | Immutable transaction records are a compliance requirement |

#### Growing — Expected to Evolve

These are well-defined but will expand as features ship. The shape is stable; the content grows.

| Area | Expected evolution |
|---|---|
| Business Domains (ADR-002) | New domains (Loyalty, Procurement, CRM) will be added; existing ones will grow engines |
| Entitlement Engine + Capability Keys (ADR-004/006) | New capabilities added as features ship; evaluation logic may gain new rules |
| Subscription lifecycle states | May add new states (e.g., `PAUSED`) without breaking existing logic |
| Domain Event catalog (ADR-005) | New events added; existing events gain consumers |
| `SubscriptionPlan` tier data | Tier names, prices, and limits change via database seed; no code changes |
| `SystemConfig` / `ConfigKey` enum | New keys added as configuration needs grow |
| Implementation Phases (Part 5) | Phases are delivered sequentially; completed phases become stable |

#### Experimental — Future Roadmap

These are directional decisions. The architecture accommodates them, but the implementation details are not yet settled.

| Area | Status |
|---|---|
| Event bus promotion to durable/async | Currently in-process and synchronous; promoted when three or more consumers need reliability guarantees |
| Value Objects (`Money`, `Quantity`, `TaxBreakdown`) | Defined architecturally; introduced progressively as engines are touched |
| `ReportingEngine` | Defined as a candidate; introduced when reports migrate off local collections |
| `PromotionEngine` | Introduced when promotional campaigns ship |
| Platform Administration application (ADR-008) | Schema-ready; UI and auth deferred to post-Phase 3 |
| External billing provider integration (Stripe) | Phase 6; provider adapter interface defined, implementation deferred |
| `ProcurementEngine`, `LoyaltyEngine` | Post-v2; introduced only when those domains are well-understood |


---

### 8.5 Performance Philosophy

This section establishes engineering norms around performance. It is not an optimization guide — premature optimization is explicitly out of scope. These are principles that prevent performance problems from being built in from the start.

**Engines never query databases.**
The cost of an engine call must be O(1) relative to the data. If an engine needs data, that data is fetched by the Application Layer before calling the engine. This keeps engine calls synchronous, fast, and testable.

**Usage counters are incremented, not recomputed.**
`UsageCounter.txCount` is a running total, not a count derived from the `Transaction` table. Incrementing by 1 per sale is O(1). Counting all transactions for a business per period is O(n). The counter model is the correct approach at any scale.

**Credit balance uses append-only ledger with balance snapshot.**
`CreditLedger.balanceAfter` snapshots the balance after every event. Reading the current balance is an O(1) lookup of the most recent row. A full-table sum is never needed in the hot path.

**Entitlement checks are cached at session load.**
The `authStore` capability array is computed once per session (at login and on subscription change events). Per-action entitlement checks against the cache are O(1) string array lookups. Server-side validation still occurs on every mutation, but the cache prevents unnecessary round-trips for UI gating.

**History pages always read from Prisma, not local collections.**
The offline collections are optimized for POS operations and hold only the current working set. Querying history from a local SQLite store that may have partial data is incorrect. All paginated history queries go to Prisma with indexed date range filters.

**Prefer cursor-based pagination over offset pagination.**
All paginated list queries use cursor-based pagination. Offset pagination becomes expensive on large tables because the database must scan and skip rows. Cursors are O(log n) with a proper index.

**Design event handlers to be idempotent.**
A domain event may be delivered more than once if the event bus is promoted to durable. Every handler must produce the same result whether it runs once or ten times. Upsert operations, conditional inserts, and duplicate detection by `referenceId` are the standard tools.

**Batch writes inside `dbTransaction`.**
All writes that belong to the same logical operation (order + items + addons + transaction + payments + tax lines + inventory movements) are batched inside a single `dbTransaction` call. This is already the pattern in `createPosTransaction` and must be preserved for all new operational flows.

**Avoid N+1 queries on history pages.**
Server functions serving history pages must use Prisma `include` or `select` to fetch relations in a single query, not loop through results and query per record. The `downloadTransactionsCSV` function already demonstrates the correct pattern with a single Prisma `findMany` with nested `include`.


---

### 8.6 Future Platform Evolution

The architecture does not need to be redesigned to accommodate these future domains. Each one slots into the existing layer model: new Business Domain with its engines and policies, new domain events added to the catalog, new Application Services that coordinate the workflows.

| Future Domain | Slots Into | Key Architectural Fit |
|---|---|---|
| **Procurement / Supply Chain** | Operations Domain → `ProcurementEngine` | Uses existing `Supplier`, `Purchase`, `Inventory` models. Engine handles reorder quantity logic, supplier price comparison. Events: `PurchaseApproved`, `ReorderTriggered`. |
| **CRM / Customer Loyalty** | New: Customer Domain | `LoyaltyEngine` handles points accrual/redemption. Uses existing `Customer` model. `TransactionCompleted` event is the trigger — no changes to Commerce domain. |
| **Advanced Reporting / Analytics** | Reporting Domain → `ReportingEngine` | Reads from Prisma server-side with `DateRange` value object. Events from all domains feed aggregation. No schema changes required. |
| **AI Assistance** | Cross-cutting | AI features are Application Layer integrations. Domain engines provide the data (inventory levels, sales trends). AI models are Infrastructure Adapters (like any external API). No domain logic changes. |
| **Demand Forecasting** | Reporting Domain → `ForecastEngine` | Consumes historical `Transaction` and `InventoryMovement` data. Pure calculation engine. No new domain required. |
| **Integrations / Webhooks** | Infrastructure Layer | Outbound webhooks are Infrastructure Adapters subscribed to Domain Events. Adding a new integration means adding a subscriber — no changes to emitting code. |
| **Marketplace / Multi-Vendor** | New: Marketplace Domain | Would require new models. The existing `Branch` and `Membership` multi-tenancy model provides the structural foundation. `BusinessCapability` would gate marketplace features. |
| **Plugin Ecosystem** | Infrastructure + Entitlement | Plugins are external integrations gated by a `Plugin` capability key. The Entitlement Engine already supports per-business overrides, which is the correct mechanism for per-business plugin grants. |
| **Multi-Currency** | Commerce Domain | `Money` value object carries currency. `TaxEngine` config can be extended for multi-currency. `PriceEngine.format` already uses `Intl.NumberFormat` with the session locale. The path is clear and non-breaking. |
| **Mobile Application** | Application + Infrastructure | The same Application Layer server functions serve any client. A mobile app is a new UI Layer calling the same server functions. Domain engines are already client-portable (compiled for browser, equally valid for mobile). |

The common pattern: every future domain either subscribes to existing events, adds a new domain that emits new events, or adds an Infrastructure Adapter. The core layer model and the existing domains do not change.


---

### 8.7 Architecture Governance

This section defines how architectural decisions should be made going forward. The master plan is now considered stable. It does not get revised in large batches.

#### How to Make Architectural Changes

1. **New feature within a defined domain:** No ADR needed. Implement following the existing domain's patterns. Add a capability key, register in `Feature` table, implement the engine or policy, wire through the Application Layer.

2. **New Business Domain:** Write an ADR. Define the domain's engines, policies, value objects, and events. Get team consensus before building. The domain catalog in Part 7.1 is the authority.

3. **Change to a foundational decision (any ADR):** Write a new ADR referencing the superseded one. Describe why the previous decision no longer holds. The old ADR remains in the document as historical record, marked superseded.

4. **New cross-domain communication pattern:** Write an ADR. Adding a new domain event is low risk (additive). Adding a direct domain-to-domain import is prohibited without an ADR that justifies why the event model is insufficient.

5. **Schema migration:** Any migration that adds new tables or nullable columns is low risk. Any migration that renames or removes columns requires a migration plan and an ADR if it affects a stable domain model.

#### PR Review Checklist

Every PR that touches domain logic should be reviewed against these questions:

- Does the new code belong to a clearly defined domain?
- Do any engine files import from infrastructure (`prisma-client`, `collections`, `better-auth`, any external SDK)?
- Do any route components contain business logic that belongs in an engine or policy?
- Are new capabilities registered in the `Feature` table and checked through `EntitlementEngine`?
- Are any new cross-domain dependencies introduced via direct import rather than events?
- Are engine inputs and outputs plain DTOs or Value Objects — not raw Prisma model types?
- Are all new write operations batched inside `dbTransaction`?
- If a new domain event was added, is its handler idempotent?

#### Naming Conventions

These conventions must be consistent across all new code:

| Artifact | Convention | Example |
|---|---|---|
| Business Engine | `PascalCase` + `Engine` suffix | `TaxEngine`, `UsageEngine` |
| Domain Policy | `PascalCase` + `Policy` suffix | `DiscountPolicy`, `BillingPolicy` |
| Value Object | `PascalCase`, noun | `Money`, `BillingPeriod`, `TaxBreakdown` |
| Domain Event | `PascalCase`, past tense | `TransactionCompleted`, `TrialExpired` |
| Capability key | `SCREAMING_SNAKE_CASE`, verb-noun | `CREATE_ORDER`, `COMPLETE_CHECKOUT` |
| Application Service | verb-noun, camelCase | `createPosTransaction`, `fetchTransactionHistory` |
| Infrastructure Adapter | descriptive, camelCase | `billingProviderAdapter`, `getTenantPrisma` |
| Strategy | `PascalCase` + domain context + `Strategy` | `MonthlySubscriptionStrategy`, `FIFOEngine` |
| Domain event file | kebab-case, past tense | `transaction-completed.ts`, `trial-expired.ts` |
| Policy file | kebab-case + `-policy` | `discount-policy.ts`, `billing-policy.ts` |


---

### 8.8 Final Consistency Review

This section documents the inconsistencies found during the governance pass and their resolutions. It is a record of decisions made, not outstanding issues.

**Resolved: FEATURE_* key format vs. verb-noun capability format**

Parts 2 and 6 use `FEATURE_POS`, `FEATURE_ORDERS`, etc. Part 7.5 introduces the canonical verb-noun format (`CREATE_ORDER`, `COMPLETE_CHECKOUT`). Both are present in the document because the migration is progressive, not immediate.

Resolution: `FEATURE_*` keys are the legacy format used in existing `ConfigKey` flags and the initial `Feature` table seed. New capabilities added after Phase 2 use verb-noun format. The dual-check fallback in Part 3.7 governs the transition. The ubiquitous language table in Part 8.1 acknowledges this explicitly. No contradiction — two states of the same migration.

**Resolved: EntitlementEngine inputs use `featureKey` string in Part 2.10, `capability` string in Part 7.5**

Part 2.10 shows `EntitlementEngine.check(businessId, 'FEATURE_POS')`. Part 7.5 shows `EntitlementEngine.check('CREATE_ORDER', context)`.

Resolution: Part 7.3 (Application Layers) shows the canonical signature: `EntitlementEngine.check(capability, context)` where `context` is an `EntitlementContext` object. The `businessId` is included inside `EntitlementContext`, not as a separate parameter. The Part 2.10 signature is an early draft; Part 7.3 is authoritative. Implementation follows Part 7.3.

**Resolved: Inventory Domain and Commerce Domain share engines**

Part 7.1 lists `InventoryEngine` and `CostingEngine` under both Commerce Domain and Inventory Domain.

Resolution: `InventoryEngine` and `CostingEngine` physically live in the Commerce domain's directory (`conversion/`, `costing/`). The Inventory Domain is their *subject matter* (they compute inventory-related results), but Commerce is their *owner* (they are called from the POS checkout flow). The Inventory Domain owns `InventoryPolicy` and the inventory-related domain events. This is an accurate representation of the current codebase and requires no change. The table note "(shared)" in Part 7.1 remains correct.

**Resolved: `Feature.key` field vs. capability key convention**

The `Feature` database model uses `key: String` with examples like `FEATURE_POS`. The capability convention is verb-noun like `CREATE_ORDER`. These are the same field in different naming stages.

Resolution: The `Feature.key` field stores capability keys. During Phase 2, initial seed data may use `FEATURE_*` format for backward compatibility with existing `ConfigKey` flags. All new entries from Phase 2 onward use verb-noun format. No schema change required; the `key` field is a plain string.

**Resolved: Duplicate mention of event-driven guidance in Part 6.7 and Part 7.6**

Part 6.7 introduced the event-driven pattern as "architectural guidance for future phases." Part 7.6 expanded it into a full domain event catalog with publication rules.

Resolution: Part 6.7 remains as the introduction of the concept. Part 7.6 is the authoritative full specification. There is no contradiction — the two sections describe the same system at different levels of detail. Part 7.6 supersedes Part 6.7 where they overlap.

**Confirmed: No over-engineering detected**

The following were reviewed and confirmed as appropriately scoped — not over-engineered for the problem size:

- Strategy pattern in `CostingEngine`: three costing methods exist today; the pattern is already in production.
- `SubscriptionEngine` with billing model strategies: three billing models are planned for Phase 5; strategies are the correct tool when the algorithm varies by a runtime value.
- `EntitlementContext` value object: the entitlement engine has eight evaluation rules; a structured context object is necessary for clarity, not over-engineering.
- Event catalog with 16 events: each event has at least two consumers. An event with one consumer should be a direct call; the threshold is met for all listed events.

**Confirmed: No under-specified areas remaining**

All areas reviewed are either fully specified or explicitly classified as Experimental in the stability table (Part 8.4). Experimental items have a clear trigger for when specification work begins.


---

### 8.9 Architecture at a Glance

A single-page reference for contributors. Everything here is defined in detail elsewhere in the document; this is the quick-reference view.

**The five Business Domains:**
Commerce · Inventory · Billing · Identity · Operations · Reporting

**The four layers (top to bottom):**
UI → Application Services → Domain (Engines + Policies + Value Objects + Events) → Infrastructure

**The one unbreakable rule:**
The Domain Layer never imports from Infrastructure. Infrastructure always calls Domain, never the reverse.

**The one access control rule:**
All capability checks go through `EntitlementEngine.check(capability, context)`. No direct subscription status comparisons anywhere else.

**The one data rule:**
Business data is never deleted for billing reasons. Subscription status controls access; it never controls data existence.

**Eight Architecture Decision Records:**

| ADR | Decision |
|---|---|
| ADR-001 | Business Engine Architecture |
| ADR-002 | Business Domains as organizational unit |
| ADR-003 | Offline-first with TanStack DB + OPFS |
| ADR-004 | Centralized Entitlement Engine |
| ADR-005 | Domain Events for cross-domain communication |
| ADR-006 | Business Capabilities over feature flags |
| ADR-007 | Data preservation on billing lapse |
| ADR-008 | Platform Administration as a separate application |

**Six implementation phases:**

1. Transaction & Order History
2. Entitlement Engine Foundation
3. Subscription Lifecycle
4. Usage Tracking & Monthly Billing
5. Prepaid Credits
6. External Billing Integration

**This document is now stable.**
Future architectural changes are made through new ADRs, not revisions to this plan.



---
