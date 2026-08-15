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
| `/transactions`, `/transactions/$transactionId` | ✅ Done |
| `/order-history`, `/order-history/$orderId` | ✅ Done |

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

### Phase 1 — Transaction & Order History ✅ Complete

- [x] **Fix refund payment method** — `create-pos-refund.ts` was hardcoding `method: 'CASH'`. Now reads the original transaction's payment from `paymentCollection` and mirrors its `method` and `platform`.
- [x] **`/transactions` history page** — Server-side Prisma query via `fetch-transaction-history.ts`. Filters: date range, transaction type (SALE / REFUND / ADJUSTMENT), payment method. Paginated (50/page). TableView + MountManager sidebar pattern identical to purchases/employees/ingredients.
- [x] **`/transactions/$transactionId` detail sidebar** — Three tabs: Items (line items + addons + SKU), Payments (amount/tendered/change/reference per payment record), Tax (summary + tax line breakdown + SC/PWD compliance data). Export single-transaction CSV. Sidebar receives the full pre-loaded row object — no redundant re-fetch.
- [x] **`/order-history` history page** — Server-side Prisma query via `fetch-order-history.ts`. Filters: date range, order status, order type (DINE_IN / TAKEOUT / DELIVERY). Paginated. Same architecture.
- [x] **`/order-history/$orderId` detail sidebar** — Two tabs: Items (line items + addons), Details (order meta + linked transaction card with invoice, cashier, total, payment method).
- [x] **Extend `downloadTransactionsCSV`** — Added `cashierId`, `method`, and `type` filter params. Refund transactions with no order items now produce a row instead of being silently skipped. Added `Type` column to CSV output.
- [x] **Sidebar nav** — "Transactions" and "Order History" added to the Supervisor group (accessible to ADMIN + SUPERVISOR).

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

A `Feature` describes **what the platform provides** — its identity, label, operational classification, and dependency graph. It does not describe how much it costs. Pricing is owned by `FeaturePrice` (see below) and versioned independently through the `PricingCatalog`. This separation allows pricing to evolve — across regions, currencies, promotions, and reseller channels — without touching the feature registry.

```prisma
enum PricingCategory {
  CORE          // Base platform capabilities (always included in composable base)
  OPERATIONAL   // Day-to-day operations features (POS, Orders, Inventory, Purchasing)
  MANAGEMENT    // Back-office and reporting features  
  INTEGRATION   // Post-V1: API access, third-party connectors
  ADVANCED      // Post-V1: Analytics, forecasting, loyalty
}

model Feature {
  id            String  @id @default(cuid())
  key           String  @unique   // e.g. "CREATE_ORDER", "MANAGE_INVENTORY" (V1 capabilities)
  label         String            // Human-readable label for admin UI
  description   String?
  isOperational Boolean @default(false)
  // true = blocked when subscription lapses; false = always accessible

  isSelectableByCustomer Boolean @default(false)
  // When true, this feature appears in the pricing calculator and can be
  // chosen by a business building a composable subscription.

  pricingCategory PricingCategory?
  // Groups features in the calculator UI. Does not affect pricing calculation —
  // the PricingEngine reads category from the active FeaturePrice, not from here.

  sortOrder     Int     @default(0)
  // Controls display order in the pricing calculator UI.

  // --- Dependency Relations ---
  dependencies         FeatureDependency[] @relation("DependentFeature")
  dependents           FeatureDependency[] @relation("RequiredFeature")

  // --- Relations ---
  prices               FeaturePrice[]
  entitlements         PlanEntitlement[]
  subscriptionFeatures BusinessSubscriptionFeature[]
  bundleItems          FeatureBundleItem[]
  overrides            EntitlementOverride[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("features")
}
```

**Design rationale:** Separating `Feature` from `FeaturePrice` keeps two distinct business concerns from becoming entangled. A feature's identity — what it does, whether it's operational, which other features it requires — changes rarely and only by deliberate product decision. Its pricing changes frequently: promotional rates, annual discounts, regional variations, reseller margins, and negotiated enterprise pricing all drive price changes that have nothing to do with the feature itself. By placing pricing in its own model, the full pricing history for any feature is preserved, historical quotes can be recreated exactly, and new pricing dimensions (currency, region, channel) are added to `FeaturePrice` without touching the feature registry or the entitlement engine.

---

#### `FeaturePrice`

The pricing definition for a single feature within a specific `PricingCatalog` version. A feature may have many price records over its lifetime — one per catalog version it participates in.

`FeaturePrice` describes **how much a feature costs** at a point in time, under a specific pricing catalog. The `PricingEngine` always reads prices from `FeaturePrice`, never from `Feature` directly.

```prisma
model FeaturePrice {
  id          String   @id @default(cuid())
  featureKey  String
  feature     Feature  @relation(fields: [featureKey], references: [key], onDelete: Cascade)
  catalogId   String
  catalog     PricingCatalog @relation(fields: [catalogId], references: [id], onDelete: Cascade)

  // Recurring charges (in cents, in the catalog's base currency)
  monthlyPrice  Int    // Monthly recurring price. 0 = included at no extra charge.
  yearlyPrice   Int    // Annual recurring price. Typically monthlyPrice * 12 * (1 - annualDiscount).

  // One-time charges (in cents)
  implementationFee Int @default(0)
  // Charged once when this feature is first activated on a subscription.
  // Example: specialized equipment setup (post-V1 capability).

  setupFee      Int    @default(0)
  // One-time configuration fee, separate from implementation.
  // Both fees are captured in the BusinessSubscriptionFeature snapshot at activation.

  // Metadata
  isActive      Boolean @default(true)
  // When false, this feature is not available for selection in this catalog version.
  // Used to phase out a feature in a new catalog without deleting historical records.

  notes         String?
  // Internal documentation explaining this price point (e.g. "Promo rate Q1 2027").

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([featureKey, catalogId])
  @@map("feature_prices")
}
```

**How FeaturePrice and PricingCatalog work together:**

The `PricingCatalog` (see below) is a versioned container. When a new catalog version is published, new `FeaturePrice` records are created for that version. Existing records from previous catalog versions are never modified — they remain as the permanent pricing history for any quotes or subscriptions that were calculated under that version.

```
PricingCatalog v1 (published 2026-01-01)
  ├── FeaturePrice: CREATE_ORDER    → ₱200/mo
  ├── FeaturePrice: FEATURE_INVENTORY → ₱150/mo
  └── FeaturePrice: ACCESS_API     → ₱500/mo

PricingCatalog v2 (published 2027-01-01)
  ├── FeaturePrice: CREATE_ORDER    → ₱250/mo  ← price increase
  ├── FeaturePrice: FEATURE_INVENTORY → ₱150/mo  ← unchanged
  └── FeaturePrice: ACCESS_API     → ₱500/mo  ← unchanged
```

A quote calculated under v1 always reproduces correctly because its `PricingQuote.catalogVersion` field points back to v1, and all v1 `FeaturePrice` records are immutable.

---

#### `PricingCatalog`

A versioned, named container that represents the complete active pricing configuration at a point in time. The `PricingEngine` always receives a `PricingCatalog` as input — it never reaches into individual `Feature`, `FeaturePrice`, `FeatureBundle`, or promotion records directly. The catalog is the clean boundary between pricing data and pricing logic.

Rather than `PricingEngine` depending directly on scattered persistence models, the Application Layer loads the active catalog (or the catalog referenced by a quote) and passes it as a single structured input. This creates a clear separation: the Application Layer owns data assembly, the `PricingEngine` owns calculation.

```prisma
enum CatalogStatus {
  DRAFT       // Being assembled; not yet used for calculations
  ACTIVE      // Currently the default catalog for new quotes and subscriptions
  ARCHIVED    // Superseded by a newer version; preserved for historical reproduction
}

model PricingCatalog {
  id          String        @id @default(cuid())
  version     String        @unique  // e.g. "2026-Q1", "v1", "2027-PROMO"
  name        String?                // Human label, e.g. "2026 Standard Pricing"
  description String?
  status      CatalogStatus @default(DRAFT)

  // Currency configuration
  currency    String  @default("PHP")
  // ISO 4217 currency code. All prices in this catalog are denominated in this currency.
  // Future: a catalog may target a specific region or channel (e.g. "USD", "SGD").

  // Annual billing discount applied to all features in this catalog
  // unless a FeaturePrice specifies its own yearlyPrice explicitly.
  defaultAnnualDiscountPercent Int @default(15)
  // e.g. 15 = all monthly prices * 12 * 0.85 for annual billing.

  // The catalog becomes the active default on this date.
  // Allows scheduling a catalog transition without a manual promotion step.
  effectiveFrom DateTime?
  effectiveTo   DateTime?   // null = no scheduled end date

  // Relations
  featurePrices      FeaturePrice[]
  bundleVersions     FeatureBundleVersion[]
  quotes             PricingQuote[]

  publishedAt DateTime?  // When status changed to ACTIVE
  publishedBy String?    // userId of the platform admin who activated this catalog

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("pricing_catalogs")
}
```

**What a PricingCatalog owns:**

| Component | Description |
|---|---|
| Feature prices | One `FeaturePrice` per selectable feature — the monthly and annual price in this catalog version |
| Bundle versions | One `FeatureBundleVersion` per active bundle — the discount rule applicable in this catalog |
| Currency | The denomination for all prices in the catalog |
| Annual discount | Default percentage saving for annual billing commitment |
| Validity window | `effectiveFrom` / `effectiveTo` for scheduled transitions |

The catalog intentionally does not own promotion records or tax rules directly — those are applied by the `PricingEngine` as overlays on top of the catalog prices. This keeps the catalog as the stable pricing foundation while allowing promotional and tax logic to change without requiring a new catalog version.

**Catalog lifecycle:**

```
DRAFT
  ↓ (platform admin configures all FeaturePrices and BundleVersions)
ACTIVE  ← one catalog is active at a time; activating a new one archives the previous
  ↓ (new catalog version published)
ARCHIVED  ← preserved forever for historical quote reproduction
```

When a new catalog is activated, the previous `ACTIVE` catalog transitions to `ARCHIVED`. It is never deleted. Any `PricingQuote` or `BusinessSubscriptionFeature` that was calculated under the old catalog remains reproducible by loading that archived catalog by ID.

**How the Application Layer uses the catalog:**

```ts
// Application Layer — assembles the PricingCatalogDTO, passes to the engine
const activeCatalog = await pricingCatalogRepository.loadActive()

// PricingCatalogDTO — a plain DTO, no Prisma types, safe to pass into the engine
const catalogDTO: PricingCatalogDTO = {
  id:             activeCatalog.id,
  version:        activeCatalog.version,
  currency:       activeCatalog.currency,
  annualDiscount: activeCatalog.defaultAnnualDiscountPercent,
  featurePrices:  activeCatalog.featurePrices.map(toFeaturePriceDTO),
  bundles:        activeCatalog.bundleVersions.map(toBundleVersionDTO),
}

// PricingEngine — receives the DTO, knows nothing about Prisma
const result = PricingEngine.calculate(strategy, input, catalogDTO)
```

**Why this abstraction improves auditability and reproducibility:**

Every `PricingQuote` records the `catalogId` it was calculated under. To reproduce a quote from three years ago, the Application Layer loads the archived `PricingCatalog` by that ID — all the exact prices, bundle rules, and currency configuration are preserved. No re-calculation from current prices is needed and no current price change can corrupt historical records.

This also means future pricing dimensions — regional pricing, reseller markups, promotional overlays — can be introduced as new catalog variants or as fields on `PricingCatalog` and `FeaturePrice`, without changing the `PricingEngine` or any existing downstream consumers.

---

#### `FeatureDependency`

Defines which features automatically require other features to be active. When a business selects a feature in the composable pricing calculator, all transitive dependencies are automatically added to the selection. The `PricingEngine` validates this graph before calculating a price.

```prisma
model FeatureDependency {
  id              String  @id @default(cuid())
  dependentKey    String
  dependent       Feature @relation("DependentFeature", fields: [dependentKey], references: [key], onDelete: Cascade)
  requiredKey     String
  required        Feature @relation("RequiredFeature",  fields: [requiredKey],  references: [key], onDelete: Cascade)

  // When true, the required feature is added automatically and cannot be
  // deselected while the dependent feature is active.
  isAutoIncluded  Boolean @default(true)

  reason          String?
  // Human-readable explanation shown in the calculator UI.
  // Example: "Inventory tracking requires an active POS session to record movements."

  createdAt DateTime @default(now())

  @@unique([dependentKey, requiredKey])
  @@map("feature_dependencies")
}
```

**Example dependency seeds:**

| Dependent Feature | Requires | Reason |
|---|---|---|
| `FEATURE_INVENTORY` | `FEATURE_POS` | Inventory movements are triggered by POS sales |
| `FEATURE_PURCHASING` | `FEATURE_INVENTORY` | Purchase records update inventory stock levels |
| Post-V1 capabilities have dependencies but are not exposed in V1 public surfaces |

The dependency graph must be acyclic. The `PricingEngine.validateDependencies` method detects cycles at validation time and returns an error before any price is calculated.

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
  HYBRID              // Subscription base + prepaid overages
  COMPOSABLE_FEATURES // Business-selected feature set with dynamic price calculation
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
  subscriptionFeatures BusinessSubscriptionFeature[]

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
  CONSUMED      // Credits deducted by a billable operation
  REFUNDED      // DEPRECATED - Previously credits restored due to refunds (no longer used per business policy)
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


#### `BusinessSubscriptionFeature`

The subscription snapshot for composable plans. When a business activates a `COMPOSABLE_FEATURES` subscription, every selected feature — along with the agreed price at that exact moment — is written here. This record is immutable after creation.

```prisma
model BusinessSubscriptionFeature {
  id             String               @id @default(cuid())
  subscriptionId String
  subscription   BusinessSubscription @relation(fields: [subscriptionId], references: [id], onDelete: Cascade)
  businessId     String
  business       Business             @relation(fields: [businessId], references: [id], onDelete: Cascade)
  featureKey     String
  feature        Feature              @relation(fields: [featureKey], references: [key], onDelete: Restrict)

  // Agreed pricing — frozen at subscription creation time.
  // These values never change even if the Feature catalog prices are updated.
  agreedMonthlyPrice   Int   // In cents. The price the business pays per month for this feature.
  agreedYearlyPrice    Int   // In cents. Used when billingCycle = ANNUAL.
  agreedImplFee        Int   @default(0) // One-time implementation fee, charged on first activation.
  agreedSetupFee       Int   @default(0) // One-time setup fee, charged on first activation.

  // Negotiated pricing — set by a sales rep for enterprise customers.
  // When present, this overrides the agreed prices above for invoice line items.
  negotiatedMonthlyPrice Int?
  negotiatedYearlyPrice  Int?

  // Effective dates — supports mid-cycle feature adds/removes.
  effectiveFrom  DateTime  @default(now())
  effectiveTo    DateTime? // null = still active

  // Audit
  addedBy        String?   // userId of the rep or admin who added this feature
  addedReason    String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([subscriptionId, featureKey, effectiveFrom])
  @@index([subscriptionId, effectiveFrom])
  @@map("business_subscription_features")
}
```

**Why snapshot instead of recalculate:**

The agreed pricing is frozen at subscription creation for three reasons:

1. **Grandfathered pricing.** When a feature's catalog price increases, active subscribers keep their original price until they explicitly renew or modify their selection. This is a commercial commitment, not a technical accident.
2. **Auditability.** The invoice line items can always be reconciled against the snapshot without knowing what the catalog price was on any given historical date.
3. **Performance.** Generating an invoice or checking overage charges requires reading a small fixed set of snapshot rows, not joining through feature catalog prices and applying historical rate logic.

The `negotiatedMonthlyPrice` and `negotiatedYearlyPrice` fields support enterprise customers where a sales representative has agreed to a custom price. When these are populated, the `InvoiceEngine` uses them instead of the agreed catalog prices. The agreed price on a quote line item (`PricingQuoteItem.agreedPrice = negotiatedPrice ?? catalogMonthlyPrice`) is what flows into this snapshot at conversion time.

---

#### `FeatureBundle`

A named bundle of features that qualifies for a discount or a fixed combined price. Bundles are database records — adding a new promotional bundle requires no code change.

`FeatureBundle` defines the bundle's identity and composition (which features it groups). The discount rules for each catalog version are owned by `FeatureBundleVersion` (see below), keeping bundle identity separate from bundle pricing — exactly the same separation applied to `Feature` and `FeaturePrice`.

```prisma
model FeatureBundle {
  id          String  @id @default(cuid())
  name        String  @unique  // e.g. "Restaurant Essentials", "Retail Starter Pack"
  description String?
  isActive    Boolean @default(true)
  // When false, the bundle is hidden from the pricing calculator entirely.
  // Existing subscriptions that were created under this bundle are unaffected.

  items    FeatureBundleItem[]
  versions FeatureBundleVersion[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("feature_bundles")
}

model FeatureBundleItem {
  id         String        @id @default(cuid())
  bundleId   String
  bundle     FeatureBundle @relation(fields: [bundleId], references: [id], onDelete: Cascade)
  featureKey String
  feature    Feature       @relation(fields: [featureKey], references: [key], onDelete: Cascade)

  // When true, the feature is required to qualify for the bundle discount.
  // When false, the feature is included as a bonus (does not affect qualification).
  isRequired Boolean @default(true)

  @@unique([bundleId, featureKey])
  @@map("feature_bundle_items")
}
```

#### `FeatureBundleVersion`

The pricing and discount configuration for a bundle within a specific `PricingCatalog` version. A bundle may have different discount rules in different catalog versions — the `FeatureBundleVersion` records that history without ever modifying existing data.

```prisma
enum BundlePricingType {
  PERCENTAGE_DISCOUNT // Apply X% discount to the combined à la carte price
  FIXED_PRICE         // Charge a flat monthly price for the bundle regardless of individual prices
  FLAT_DISCOUNT       // Subtract a fixed amount in cents from the combined monthly price
}

model FeatureBundleVersion {
  id          String            @id @default(cuid())
  bundleId    String
  bundle      FeatureBundle     @relation(fields: [bundleId], references: [id], onDelete: Cascade)
  catalogId   String
  catalog     PricingCatalog    @relation(fields: [catalogId], references: [id], onDelete: Cascade)

  pricingType BundlePricingType

  // Meaning depends on pricingType:
  //   PERCENTAGE_DISCOUNT → value = 15 means 15% off combined monthly price
  //   FIXED_PRICE         → value = 150000 means ₱1,500.00/month flat for the bundle
  //   FLAT_DISCOUNT       → value = 50000 means ₱500.00 off combined monthly price
  discountValue Int

  // Annual equivalent — when populated, used instead of discountValue for annual quotes.
  // Falls back to discountValue * 12 if null.
  annualDiscountValue Int?

  isActive    Boolean @default(true)
  // Allows disabling a bundle discount in a specific catalog version without
  // removing it globally (e.g. a promotional bundle that only applied in one quarter).

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([bundleId, catalogId])
  @@map("feature_bundle_versions")
}
```

**Why bundle versioning matters:**

A bundle's discount is a pricing commitment, not just a configuration value. If the "Restaurant Essentials" bundle offered a 15% discount in 2026 and the platform raises that to 20% in 2027, two things must be true simultaneously:

1. **New quotes** use the 2027 catalog and see the 20% discount.
2. **Historical quotes** calculated in 2026 must reproduce exactly with the 15% they were calculated under.

Without `FeatureBundleVersion`, there is no way to achieve both. Updating a single `discountValue` field would silently corrupt every historical quote that referenced it. By tying the discount to the `PricingCatalog` version, historical quotes remain immutable and reproducible forever — the `PricingEngine` simply loads the catalog version the quote was calculated under and finds the exact `FeatureBundleVersion` that applied at that time.

**Example bundle version progression:**

| Bundle | Catalog | Pricing Type | Value | Notes |
|---|---|---|---|---|
| Restaurant Essentials | v1 (2026-Q1) | `PERCENTAGE_DISCOUNT` | 15% | Launch pricing |
| Restaurant Essentials | v2 (2027-Q1) | `PERCENTAGE_DISCOUNT` | 20% | Increased incentive |
| Retail Core | v1 (2026-Q1) | `FLAT_DISCOUNT` | ₱500/mo | |
| Retail Core | v2 (2027-Q1) | `FLAT_DISCOUNT` | ₱600/mo | Adjusted for price increases |

**Bundle detection in PricingEngine:**

The `PricingEngine` receives `FeatureBundleVersionDTO` objects as part of the `PricingCatalogDTO` — it never queries `FeatureBundle` or `FeatureBundleVersion` directly. For each bundle version where every `isRequired = true` item is present in the selection, the engine evaluates the discount. If multiple bundles qualify, the most favorable one (largest absolute saving) wins. This logic is fully contained in the engine — no application code changes when bundles are added or modified.

---

#### `PricingQuote`

A `PricingQuote` is an **immutable business document**. Once calculated, it is a complete, self-contained record of a pricing proposal that must remain reproducible years after it was created, regardless of any subsequent changes to the feature catalog, bundle rules, or pricing strategies.

The quote snapshot contains everything needed to recreate it independently: the feature descriptions, bundle information, tax breakdown, currency, pricing strategy name, catalog version, and all computed totals. It does not rely on joining back to the current `Feature`, `FeaturePrice`, or `FeatureBundleVersion` tables for its meaning — all the relevant data is captured at calculation time.

```prisma
enum QuoteStatus {
  DRAFT       // Being assembled; PricingEngine has not yet run a full calculation
  CALCULATED  // PricingEngine has run; totals are up to date; not yet sent to the business
  SENT        // Shared with the business (link, PDF, or email); awaiting response
  ACCEPTED    // Business confirmed they want to proceed; pending subscription creation
  CONVERTED   // Subscription was successfully created from this quote
  EXPIRED     // validUntil passed without acceptance; no subscription created
  CANCELLED   // Explicitly withdrawn by rep or business before acceptance
}

model PricingQuote {
  id             String      @id @default(cuid())
  businessId     String
  business       Business    @relation(fields: [businessId], references: [id], onDelete: Cascade)
  status         QuoteStatus @default(DRAFT)
  createdBy      String?     // userId of the sales rep; null = self-service

  // --- Pricing Catalog Snapshot ---
  // These fields capture the catalog context at calculation time so the quote
  // can always be reproduced without querying the current catalog state.
  catalogId      String
  catalog        PricingCatalog @relation(fields: [catalogId], references: [id])
  catalogVersion String         // Snapshot of PricingCatalog.version at calculation time
  currency       String         // ISO 4217 — snapshot of PricingCatalog.currency

  // --- Pricing Strategy ---
  pricingStrategy String
  // Name of the PricingEngine strategy used: e.g. "FEATURE_BASED", "ENTERPRISE".
  // Recorded so the quote document is self-describing and auditable.

  billingCycle    String @default("MONTHLY")
  // "MONTHLY" or "ANNUAL" — the billing cycle the totals were calculated for.

  // --- Tax Breakdown (see section 2.17) ---
  // Taxes are recorded as a breakdown, not a single total.
  // This supports different taxation systems across countries (VAT, GST, sales tax, etc.)
  taxBreakdown    Json?
  // Serialised TaxBreakdownDTO — array of { name, rate, taxableAmount, taxAmount }.
  // Example: [{ name: "VAT", rate: 12, taxableAmount: 100000, taxAmount: 12000 }]
  // null = pricing is tax-exclusive and tax is calculated at invoice time.

  taxInclusive    Boolean @default(false)
  // When true, the grand total already includes all taxes.
  // When false, taxes are itemised separately and added to reach the grand total.

  // --- Computed Totals (in cents, in quote currency) ---
  subtotal        Int   // Sum of all feature recurring prices before any discounts
  bundleDiscount  Int   @default(0)  // Discount applied by the qualifying bundle
  promoDiscount   Int   @default(0)  // Discount from promotional or negotiated overrides
  totalDiscount   Int   @default(0)  // bundleDiscount + promoDiscount
  taxTotal        Int   @default(0)  // Sum of all tax amounts from taxBreakdown
  surchargeTotal  Int   @default(0)  // Branch / employee surcharges
  oneTimeFees     Int   @default(0)  // Sum of all implementation + setup fees
  grandTotal      Int   // subtotal - totalDiscount + surchargeTotal + taxTotal
  // oneTimeFees is shown separately on the quote; it is not included in grandTotal
  // because it is charged once, not recurring.

  // --- Applied Bundle Snapshot ---
  appliedBundleName       String?  // Snapshot of FeatureBundle.name at calculation time
  appliedBundleVersionId  String?  // FK to the FeatureBundleVersion used

  // --- Quote Validity & Notes ---
  validUntil      DateTime?
  notes           String?          // Internal sales rep notes; not shown to the business
  externalRef     String?          // Optional CRM or deal reference number

  // --- System Version (optional) ---
  systemVersion   String?
  // Semver of the platform at quote creation. Useful for enterprise support contexts
  // where the product may have changed significantly since the quote was issued.

  lineItems       PricingQuoteItem[]

  // --- Lifecycle ---
  calculatedAt    DateTime?  // When status moved to CALCULATED
  sentAt          DateTime?  // When status moved to SENT
  acceptedAt      DateTime?  // When status moved to ACCEPTED
  convertedAt     DateTime?  // When status moved to CONVERTED
  expiredAt       DateTime?  // When status moved to EXPIRED
  cancelledAt     DateTime?  // When status moved to CANCELLED
  cancelReason    String?

  // When converted, the subscription created from this quote
  convertedSubscriptionId String? @unique

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([businessId, status])
  @@map("pricing_quotes")
}
```

#### `PricingQuoteItem`

Each line item on the quote is a complete, self-contained snapshot. It captures everything needed to describe and reproduce that line years later, including the feature's label and description at quote time. If the feature label changes in the catalog, the quote still shows what the customer was presented with.

```prisma
enum QuoteLineType {
  FEATURE         // A recurring feature price
  BUNDLE_DISCOUNT // The bundle discount line (negative amount)
  PROMO_DISCOUNT  // Promotional or negotiated discount (negative amount)
  SURCHARGE       // Branch or employee surcharge
  TAX             // A tax line item (may be positive or informational)
  ONE_TIME_FEE    // Implementation or setup fee
}

model PricingQuoteItem {
  id              String         @id @default(cuid())
  quoteId         String
  quote           PricingQuote   @relation(fields: [quoteId], references: [id], onDelete: Cascade)
  lineType        QuoteLineType  @default(FEATURE)

  // Feature snapshot (populated for FEATURE lines; null for discount/surcharge lines)
  featureKey      String?
  featureLabel    String?        // Snapshot of Feature.label at quote time
  featureDescription String?     // Snapshot of Feature.description at quote time
  pricingCategory String?        // Snapshot of Feature.pricingCategory at quote time

  // Pricing snapshot (all amounts in cents, in quote currency)
  catalogMonthlyPrice  Int?      // The FeaturePrice.monthlyPrice from the catalog
  catalogYearlyPrice   Int?      // The FeaturePrice.yearlyPrice from the catalog
  negotiatedPrice      Int?      // Rep-overridden price; when set, used instead of catalog price
  agreedPrice          Int       // The final price charged: negotiatedPrice ?? catalog price
  implFee              Int       @default(0)  // Snapshot of FeaturePrice.implementationFee
  setupFee             Int       @default(0)  // Snapshot of FeaturePrice.setupFee

  // Dependency flag
  isAutoAdded     Boolean @default(false)
  // true = added by dependency resolution, not explicitly selected by the customer.
  // Shown with a visual indicator in the quote document.

  // Description for non-feature lines (discounts, surcharges, taxes, fees)
  description     String?

  sortOrder       Int @default(0)

  @@map("pricing_quote_items")
}
```

**Quote lifecycle and state transitions:**

```
DRAFT
  ↓ (PricingEngine.calculate called with current selection)
CALCULATED  ← totals are confirmed; quote is ready to share
  ↓ (rep or self-service shares the quote link or PDF)
SENT
  ↓ (business confirms acceptance)
ACCEPTED
  ↓ (Application Layer creates subscription from quote)
CONVERTED  ← terminal state; subscription exists

SENT / CALCULATED / ACCEPTED
  ↓ (validUntil passes without acceptance)
EXPIRED    ← terminal state; daily background job sets this

DRAFT / CALCULATED / SENT
  ↓ (rep or business withdraws the quote)
CANCELLED  ← terminal state; no subscription created
```

A quote may be recalculated (returning to `CALCULATED`) while in `DRAFT` state as the selection changes. Once `SENT`, the quote is locked — the line items and totals are frozen. To revise a sent quote, a new quote is created; the original is `CANCELLED`.

**Why immutability matters:**

A `PricingQuote` in `CONVERTED` state is a commercial commitment. It is the documented basis for the subscription that was created. The `BusinessSubscriptionFeature` snapshot is derived from it. If the customer disputes a charge two years later, the original quote — with its snapshotted feature labels, catalog version, tax breakdown, and pricing strategy — provides the full audit trail. No current catalog change can ever modify it.

**Quote-to-subscription conversion:**

When a quote is accepted and moves to `CONVERTED`, the Application Layer:
1. Reads each `PricingQuoteItem` with `lineType = FEATURE`.
2. Creates one `BusinessSubscriptionFeature` record per item, copying `agreedPrice`, `implFee`, `setupFee`, and `featureKey`.
3. Creates a `BusinessSubscription` with `billingModel = COMPOSABLE_FEATURES` and `catalogId` pointing to the catalog the quote was calculated under.
4. Sets `PricingQuote.convertedSubscriptionId` and `convertedAt`.
5. Emits `QuoteConverted`.

No re-calculation occurs during conversion. The quote is the sole source of truth for what was agreed.

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
| `Business` | Add `subscriptionFeatures BusinessSubscriptionFeature[]` relation | Composable feature snapshots |
| `Business` | Add `pricingQuotes PricingQuote[]` relation | Quote history for enterprise sales |
| `Transaction` | Add `usageCounterId String?` relation | Link sale to the usage counter it incremented |

No destructive changes to existing columns are required. All new fields are additive.

---

### 2.4 Existing `ConfigKey` Additions

Add the following keys to the `ConfigKey` enum. These are stored in `SystemConfig` at the business scope and are configurable without code changes.

```prisma
// Add to ConfigKey enum:

// Subscription lifecycle policy
TRIAL_DURATION_DAYS           // Default: 30
GRACE_PERIOD_DAYS             // Default: 7 (days after expiry before hard restriction)
LONG_TERM_INACTIVE_DAYS       // Default: 90 (days after expiry before long-term inactive)
CREDIT_LOW_BALANCE_THRESHOLD  // Default: 10 (notify when credits fall below this)
OVERAGE_BILLING_ENABLED       // Default: false (block vs. charge on overage)

// Composable feature-based pricing
COMPOSABLE_BRANCH_MONTHLY_RATE     // Cents per additional branch above included count
COMPOSABLE_EMPLOYEE_MONTHLY_RATE   // Cents per additional employee above included count
COMPOSABLE_INCLUDED_BRANCHES       // Default: 1 (branches included in base composable fee)
COMPOSABLE_INCLUDED_EMPLOYEES      // Default: 5 (employees included in base composable fee)
COMPOSABLE_ANNUAL_DISCOUNT_PERCENT // Default: 15 (percentage saving for annual billing vs. monthly)
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

The architecture supports four billing models via `BillingModel` enum on `BusinessSubscription`. Switching models requires only a field update on the subscription, not a schema redesign. The first three models are predefined-plan models; the fourth — `COMPOSABLE_FEATURES` — allows a business to build its own subscription by selecting the exact features it needs. All four coexist and are treated as interchangeable strategies within the same lifecycle and entitlement infrastructure.

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
- Refunds do not restore credits per business policy (prevents gaming of limits).

#### Hybrid (Subscription + Prepaid Overages)

- Business subscribes to a plan with a monthly TX allowance.
- When allowance is exhausted, instead of blocking or billing per-overage on the subscription, the system switches to deducting from a prepaid credit balance.
- This gives businesses flexibility: they can pre-purchase a credit buffer for busy months without upgrading their entire plan.
- The entitlement engine checks: subscription allowance remaining → credit balance → block.

#### Composable Features (Business-Assembled Subscription)

Rather than selecting a predefined plan tier, a business using `COMPOSABLE_FEATURES` selects only the features applicable to its operations. The system dynamically calculates the subscription price from the selected features and applicable pricing rules. This model is not a replacement for the other three — it is an additional option suited to businesses with specialized needs or enterprise customers who negotiate custom bundles.

**How it works:**
- A sales representative or the business owner opens the pricing calculator (see section 2.16).
- They select features from the published `Feature` registry where `isSelectableByCustomer = true`.
- Feature dependencies are automatically resolved and added to the selection.
- The `PricingEngine` (see section 6.6) calculates a monthly and annual price from the selection, applying any applicable bundle discounts, promotional rules, and negotiated overrides.
- The resulting price and the selected feature set are frozen into a `BusinessSubscriptionFeature` snapshot at the moment the subscription is created.
- The subscription is stored with `billingModel = COMPOSABLE_FEATURES` and a `planId` that points to a special sentinel plan (`COMPOSABLE`) used only to attach lifecycle and status rules.

**Entitlement evaluation for composable subscriptions:**
- The `EntitlementEngine` resolves entitlements from `BusinessSubscriptionFeature` records for the active subscription, not from `PlanEntitlement` records.
- This is handled transparently — the engine checks which source to use based on `billingModel`.
- All subscription lifecycle states (TRIAL, ACTIVE, GRACE_PERIOD, etc.) apply identically to composable subscriptions.

**Pricing recalculation policy:**
- The agreed price is locked at subscription creation via the snapshot model.
- Price changes to individual features do not affect active subscriptions.
- On renewal, the system optionally recalculates the price at the new rates, depending on the renewal policy configured for that subscription.
- A business on a composable plan is shown the updated price ahead of renewal so they can accept or adjust their feature selection.

---

### 2.9 Usage Tracking Strategy

Usage tracking must be efficient. The `UsageCounter` table is the single source of truth for current period usage. Raw transaction counts are never recomputed from the `Transaction` table in real-time.

**Write path:**
When `createPosTransaction` completes successfully:
1. Increment `UsageCounter.txCount` for the current billing period (upsert by `businessId + periodStart`).
2. If `txCount` now exceeds `includedTxPerMonth`, increment `overageTxCount` and calculate overage charges.
3. If billing model is `PREPAID_CREDITS` or `HYBRID`, insert a `CreditLedger` `CONSUMED` entry.
4. If billing model is `COMPOSABLE_FEATURES` and overage billing is enabled, the overage charge is calculated against the composable plan's base `overagePerTx` rate (stored on the sentinel `SubscriptionPlan`). The same `overageTxCount` and `overageCharged` fields on `UsageCounter` are used — no schema difference.

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
4. Does the business's current plan have a `PlanEntitlement` for this feature key? → Proceed if yes. **For `COMPOSABLE_FEATURES` subscriptions:** check `BusinessSubscriptionFeature` records for the active subscription instead of `PlanEntitlement`. A feature is granted if a `BusinessSubscriptionFeature` row exists with `featureKey = key` and `effectiveTo IS NULL` (or `effectiveTo > now`). The engine resolves the source transparently based on `subscription.billingModel`.
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

### 2.13 Composable Pricing Formula

The `PricingEngine` uses a deterministic pipeline to calculate the total subscription price from a set of selected features. Every component of the formula is configurable — no amounts are hardcoded. The Application Layer assembles the `PricingCatalogDTO` and all configuration inputs; the engine performs the calculation and returns a `PricingResult`.

```
Base Platform Fee
+ Σ Feature Recurring Prices        (from PricingCatalog FeaturePrice records)
+ Surcharges                         (branches, employees above included count)
─ Bundle Discount                    (best qualifying FeatureBundleVersion)
─ Promotional / Negotiated Discount  (EntitlementOverride or negotiatedPrice)
+ Taxes                              (applied per TaxBreakdownLine, tax-system agnostic)
────────────────────────────────────────────────────────────────────────────
= Grand Total (recurring)
+ One-Time Fees (implementation + setup, shown separately, not in grand total)
```

**Pipeline stages — executed in order by `PricingEngine.calculate`:**

| Stage | Input | Output |
|---|---|---|
| 1. Dependency resolution | Raw feature key list, `FeatureDependencyDTO[]` | Expanded selection with transitive dependencies auto-added |
| 2. Dependency validation | Expanded selection | Validation result; detects cycles and unresolvable conflicts |
| 3. Base fee lookup | Sentinel plan config from `PricingConfig` | `basePlatformFee` in catalog currency |
| 4. Feature price summation | Expanded selection × `FeaturePriceDTO[]` from catalog | `featureSubtotal` |
| 5. Surcharge calculation | Branch count, employee count, config limits | `surchargeTotal` |
| 6. Bundle detection | Selection, `FeatureBundleVersionDTO[]` from catalog | `appliedBundle`, `bundleDiscount` |
| 7. Discount application | Promotional overrides, negotiated prices per line | `promoDiscount` per line |
| 8. Tax calculation | Net amount, tax rules from `PricingConfig` | `TaxBreakdownLine[]`, `taxTotal` |
| 9. One-time fee calculation | `FeaturePriceDTO.implementationFee`, `setupFee` | `oneTimeFees` |
| 10. Annual price calculation | Monthly totals × 12 × (1 - annualDiscount) | Annual equivalents |
| 11. Result assembly | All above | `PricingResult` value object |

Stage 4 reads prices from `FeaturePriceDTO` objects supplied by the catalog — not from `Feature` directly. The `PricingEngine` never knows the source of pricing data; it only knows the `PricingCatalogDTO` it was given.

**Configurability:**

All thresholds and rates are read by the Application Layer from `SystemConfig` and the active `PricingCatalog`, then passed into the engine as a `PricingConfig` value object. The engine never reads from any config store directly.

```ts
interface PricingConfig {
  basePlatformFee:       number        // Cents — from sentinel COMPOSABLE plan
  includedBranches:      number        // From COMPOSABLE_INCLUDED_BRANCHES ConfigKey
  branchMonthlyRate:     number        // From COMPOSABLE_BRANCH_MONTHLY_RATE ConfigKey
  includedEmployees:     number        // From COMPOSABLE_INCLUDED_EMPLOYEES ConfigKey
  employeeMonthlyRate:   number        // From COMPOSABLE_EMPLOYEE_MONTHLY_RATE ConfigKey
  annualDiscountPercent: number        // From PricingCatalog.defaultAnnualDiscountPercent
  taxRules:              TaxRuleDTO[]  // Applicable tax rules for this business/region
  strategy:              PricingStrategyType
}
```

---

### 2.14 Bundle Pricing

Bundles allow businesses to unlock a discount when they select a qualifying combination of features. All bundle rules are contained in `FeatureBundleVersion` records tied to the active `PricingCatalog` — the `PricingEngine` receives them as `FeatureBundleVersionDTO` objects and never queries the database.

**Qualification rules:**
- A bundle version qualifies when every `FeatureBundleItem` with `isRequired = true` is present in the expanded feature selection (after dependency resolution).
- Optional bundle items (`isRequired = false`) are added to the selection as bonuses if the bundle qualifies, at no extra charge.
- If multiple bundle versions qualify simultaneously, the engine selects the one with the highest absolute savings. Only one bundle discount applies per quote.

**Bundle evaluation sequence (inside `PricingEngine.detectBundle`):**

```
1. Iterate FeatureBundleVersionDTO[] from PricingCatalogDTO
2. For each bundle version:
   a. Check all isRequired items are present in the expanded selection
   b. If qualifying, calculate absolute savings:
      - PERCENTAGE_DISCOUNT: savings = featureSubtotal × (discountValue / 100)
      - FIXED_PRICE:         savings = featureSubtotal - discountValue (skip if negative)
      - FLAT_DISCOUNT:       savings = discountValue
3. Select the bundle version with the highest savings
4. Add bonus (isRequired = false) features to selection, marked as autoAdded
5. Return (appliedBundleVersion, bundleDiscount, updatedSelection)
```

**Annual bundle pricing:**
For annual quotes, `FeatureBundleVersion.annualDiscountValue` is used if populated; otherwise the monthly discount is multiplied by the annual factor from `PricingCatalog.defaultAnnualDiscountPercent`. This allows bundles to offer an enhanced annual incentive independently of the base annual savings rate.

**Adding new bundles:**
A platform administrator creates a `FeatureBundle` with its `FeatureBundleItem` rows, then adds a `FeatureBundleVersion` to the active (or next) `PricingCatalog`. No code deployment is needed. The bundle becomes available for the next quote calculation under that catalog.

**Example bundle seeds:**

| Bundle | Catalog | Required Features | Pricing Type | Value |
|---|---|---|---|---|
| Restaurant Essentials | v1 | POS + Orders + Kitchen Display | `PERCENTAGE_DISCOUNT` | 15% |
| Retail Core | v1 | POS + Inventory + Purchasing | `FLAT_DISCOUNT` | ₱500/mo |
| Full Operations | v1 | POS + Orders + Inventory + Purchasing + Tasks | `FIXED_PRICE` | ₱2,000/mo |

---

### 2.15 Enterprise Quotations

The composable pricing model naturally supports the enterprise sales workflow. A sales representative can assemble a custom subscription, apply negotiated pricing, and generate a formal quote — all without creating a new plan in the database.

**Enterprise sales workflow:**

```
1. Sales rep opens the pricing calculator on the Platform Administration interface
   (or the business owner opens it on the self-service billing page)

2. Rep selects features
   → PricingEngine resolves dependencies and calculates base price
   → PricingQuote created with status = DRAFT

3. Rep reviews PricingResult — line items, discounts, taxes, totals

4. Rep optionally overrides individual line items via negotiatedPrice
   → PricingEngine recalculates → PricingQuote moves to CALCULATED

5. Rep sets validUntil, adds notes
   → PricingQuote moves to SENT; line items and totals frozen

6. Quote shared with the business (link, PDF export, or email)

7. Business accepts → Application Layer reads PricingQuoteItem[] and creates:
   → BusinessSubscription (billingModel = COMPOSABLE_FEATURES)
   → BusinessSubscriptionFeature snapshot per FEATURE line item
   → PricingQuote.status = CONVERTED, convertedAt set, QuoteConverted event emitted

8. If business withdraws → PricingQuote.status = CANCELLED
   If validUntil passes  → background job sets PricingQuote.status = EXPIRED
```

**What makes this enterprise without needing a new plan:**

The `negotiatedPrice` on each `PricingQuoteItem` overrides the catalog price for that line. A rep can set any value. The `agreedPrice` (`negotiatedPrice ?? catalogMonthlyPrice`) is frozen into the `BusinessSubscriptionFeature` snapshot on conversion and never recalculated without explicit action.

**Self-service vs. rep-assisted:**
The same `PricingQuote` model serves both paths. Self-service: `createdBy = null`, quote moves `DRAFT → CALCULATED → SENT → ACCEPTED`. Rep-assisted: `createdBy = userId`, same flow but with the rep setting negotiated prices at the `CALCULATED` stage before moving to `SENT`.

---

### 2.16 Pricing Calculator — UI Recommendation

> This section is documentation only. No UI implementation is required at this stage.

A future pricing calculator should be available in two contexts:

1. **Self-service** — accessible from the business's `/billing` page for businesses exploring the composable model.
2. **Rep-assisted** — accessible from the Platform Administration interface when a sales rep is building a quote.

Both contexts use the same `PricingEngine` calculation; only the input controls and the ability to set negotiated prices differ.

**Recommended capabilities:**

- Feature checklist organized by `PricingCategory` (CORE, OPERATIONAL, MANAGEMENT, INTEGRATION, ADVANCED)
- Required dependency features automatically checked and locked when a dependent feature is selected — with a tooltip explaining why ("Required by Kitchen Display")
- Live price update on every selection change — calls `PricingEngine.calculate` on the server; no client-side price logic
- Monthly / Annual billing toggle — shows both totals and highlights the annual savings amount
- Bundle indicator — when a qualifying bundle version is detected, a badge appears on the affected features and the discount is shown as a distinct line item
- Tax breakdown section — each `TaxBreakdownLine` from the `PricingResult` is shown as a named line item (VAT, GST, etc.)
- One-time fees section — implementation and setup fees listed separately from recurring charges
- Surcharge breakdown — additional branches and employee tiers shown as distinct line items
- Rep-only controls — `negotiatedPrice` override inputs per line item, visible only in Platform Administration context
- Quote export — generates a PDF or shareable link from the `PricingQuote` record; uses the `PricingResult` line items as the document body
- Comparison view — side-by-side comparison of the composable selection against standard Starter, Professional, and Enterprise plans

**What the calculator must not do:**
- Calculate prices client-side. All calculation goes through `PricingEngine` on the server. The UI only renders `PricingResult`.
- Store a partial state as a committed subscription. All in-progress selections live in a `DRAFT` `PricingQuote` until explicitly confirmed.
- Bypass dependency validation. Required features must always be included before the "Accept Quote" action is enabled.

---

### 2.17 PricingEngine — Infrastructure Boundaries

> These are hard constraints, not guidelines. A violation breaks the Business Engine architecture
> and makes pricing logic untestable and non-portable.

`PricingEngine` is a pure Business Engine. It receives data as inputs and returns a `PricingResult` as output. It has no knowledge of where data came from or where results go.

**Explicit prohibitions:**

| Prohibited action | Why | Correct alternative |
|---|---|---|
| Import `prisma-client` or any ORM | Unrunnable in browser or test runner without DB | Application Layer fetches data and maps to DTOs |
| Read from `ConfigKey` / `SystemConfig` | Infrastructure concern | Application Layer reads values and passes as `PricingConfig` |
| Call `Date.now()` or `new Date()` | Non-deterministic | Pass `calculatedAt: Date` as a parameter |
| Format currency or numbers | Presentation concern | `PriceEngine.format` handles formatting; `PricingEngine` returns raw cent integers |
| Know about `PricingCatalog`, `FeaturePrice`, or `FeatureBundleVersion` Prisma types | Couples engine to persistence schema | Application Layer maps to `PricingCatalogDTO`, `FeaturePriceDTO`, `FeatureBundleVersionDTO` |
| Access `authStore`, session, or HTTP context | Framework coupling | All context passed in `PricingInput` |
| Emit domain events | Side effects break engine purity | Application Layer emits after receiving `PricingResult` |

**The Application Layer's assembly responsibility:**

```
Infrastructure (Application Layer)
  1. Load active PricingCatalog via pricingCatalogRepository.loadActive()
  2. Load feature selections, dependencies, overrides from database
  3. Read PricingConfig values from SystemConfig and PricingCatalog
  4. Map everything to DTOs: PricingCatalogDTO, PricingInput, PricingConfig
  ↓
Domain (PricingEngine)
  5. PricingEngine.calculate(strategy, input, catalogDTO) → PricingResult
  ↓
Infrastructure (Application Layer)
  6. Persist PricingResult as PricingQuote + PricingQuoteItem records
  7. Emit QuoteCalculated or QuoteConverted domain event
```

The engine is exercised in step 5 only. Everything before and after is infrastructure.

**`PricingCatalogRepository` — the Application Layer interface:**

```ts
// Lives in infrastructure, not in the engine domain
interface PricingCatalogRepository {
  loadActive(): Promise<PricingCatalogDTO>
  loadById(catalogId: string): Promise<PricingCatalogDTO>
  // loadById is used to reproduce a historical quote under its original catalog
}
```

`PricingEngine` never calls `PricingCatalogRepository` — it receives a `PricingCatalogDTO` that the Application Layer has already assembled.

---

### 2.18 Quote Tax Breakdown

Quotes expose a full tax breakdown rather than a single tax total. This supports different taxation systems across countries — VAT, GST, sales tax, withholding tax — without hardcoding any assumptions about tax structure into the engine or the schema.

**Pricing breakdown formula:**

```
Subtotal                 (sum of all feature recurring prices at catalog rates)
─ Bundle Discount        (from qualifying FeatureBundleVersion)
─ Promotional Discount   (negotiated prices or promotional overrides)
= Discounted Subtotal
+ Surcharges             (additional branches, additional employees)
= Net Recurring Amount
+ Taxes                  (one or more named TaxBreakdownLine entries)
= Grand Total            (recurring, per billing cycle)

──────────────────────────────────────
+ One-Time Fees          (implementation + setup — shown separately, not in Grand Total)
```

Each component is a named, visible line item on the quote document. No rounding or hiding of intermediate values.

**`TaxBreakdownLine` — tax-system agnostic:**

```ts
interface TaxBreakdownLine {
  name:           string   // e.g. "VAT", "GST", "Sales Tax", "Withholding Tax"
  rate:           number   // Percentage, e.g. 12 for 12%
  taxableAmount:  number   // Base amount the rate is applied to (in cents)
  taxAmount:      number   // rate / 100 * taxableAmount, rounded (in cents)
  isInclusive:    boolean  // When true, taxableAmount already includes this tax
}
```

**Tax rules are configuration, not code:**

Tax rules are passed into the engine as `TaxRuleDTO[]` inside `PricingConfig`. The Application Layer reads them from the business's `SystemConfig` or a future `TaxRule` model. The `PricingEngine` applies them mechanically — it does not know which country or tax regime it is operating under.

**Relationship to invoice tax:**

The quote tax breakdown flows directly into the `BillingInvoice` when the subscription is billed. The `InvoiceEngine` reads the `BusinessSubscriptionFeature` snapshot and the original `PricingQuote.taxBreakdown` to reconstruct the same breakdown on the invoice, ensuring the customer sees consistent figures from quote to invoice.

**Tax-inclusive vs. tax-exclusive pricing:**

`PricingQuote.taxInclusive` controls whether the grand total already includes taxes (`true`) or whether taxes are added on top (`false`). The `PricingEngine` calculates both representations from the `TaxBreakdownLine[]` so either display mode is supported without re-running the engine.

---

### 2.19 PricingResult — The Canonical Engine Output

`PricingResult` is the rich, structured value object returned by every `PricingEngine.calculate` call. It is the single source of truth for a pricing calculation — not just a bag of totals, but a complete line-item breakdown that any downstream consumer can render or persist directly.

**Why a rich object rather than totals only:**

| Consumer | What it needs from PricingResult |
|---|---|
| Pricing Calculator UI | Line items, discounts, taxes, one-time fees, auto-added features, validation errors |
| Quote Generator | Everything — result maps 1:1 to `PricingQuote` + `PricingQuoteItem` records |
| Subscription Creation | FEATURE lines only — maps to `BusinessSubscriptionFeature` snapshots |
| Invoice Generation | Recurring totals, tax breakdown, surcharges — maps to `BillingInvoiceItem` records |
| Public API / Webhooks | All fields — external consumers expect a complete pricing document |

If `PricingEngine` returned only totals, each consumer would need its own partial re-implementation of the line-item logic. The rich result eliminates that duplication.

**`PricingResult` full structure:**

```ts
interface PricingResult {
  // Identity & context
  catalogVersion:      string              // PricingCatalog.version used
  currency:            string              // ISO 4217, from the catalog
  pricingStrategy:     string              // e.g. "FEATURE_BASED", "ENTERPRISE"
  billingCycle:        'MONTHLY' | 'ANNUAL'
  calculatedAt:        Date                // Passed in — never Date.now() inside the engine

  // Line items — every price component, named and typed
  lineItems:           PricingLineItem[]

  // Aggregated totals (all amounts in cents)
  subtotal:            number              // Sum of FEATURE lines at catalog prices
  bundleDiscount:      number              // Total bundle savings (positive = saving)
  promoDiscount:       number              // Total promotional/negotiated savings
  totalDiscount:       number              // bundleDiscount + promoDiscount
  surchargeTotal:      number              // Sum of SURCHARGE lines
  taxLines:            TaxBreakdownLine[]  // One entry per applicable tax
  taxTotal:            number              // Sum of taxLine.taxAmount entries
  grandTotal:          number              // subtotal - totalDiscount + surchargeTotal + taxTotal
  oneTimeFees:         number              // Sum of ONE_TIME_FEE lines — shown separately

  // Annual equivalents (populated when billingCycle = ANNUAL)
  annualGrandTotal:    number | null
  annualSavings:       number | null       // monthlyGrandTotal * 12 - annualGrandTotal

  // Applied bundle
  appliedBundle:       AppliedBundleRef | null

  // Dependency resolution
  autoAddedFeatures:   string[]            // Feature keys added automatically
  validationErrors:    string[]            // Non-empty = calculation blocked

  // Grandfathered price detection (populated on renewal calculations)
  priceChanges:        PriceChangeNotice[]
  // Non-empty = features with different catalog prices vs. existing subscription snapshot.
  // Presented to the business before renewal confirmation.
}

interface PricingLineItem {
  lineType:            QuoteLineType       // FEATURE | BUNDLE_DISCOUNT | PROMO_DISCOUNT | SURCHARGE | TAX | ONE_TIME_FEE
  featureKey:          string | null
  featureLabel:        string              // Human-readable; snapshotted into quote
  featureDescription:  string | null
  pricingCategory:     string | null
  catalogPrice:        number              // From FeaturePriceDTO (informational)
  negotiatedPrice:     number | null       // Rep override, if any
  agreedPrice:         number              // negotiatedPrice ?? catalogPrice
  isAutoAdded:         boolean
  sortOrder:           number
}

interface PriceChangeNotice {
  featureKey:          string
  featureLabel:        string
  previousPrice:       number             // Price in existing BusinessSubscriptionFeature snapshot
  currentCatalogPrice: number             // Price in current active PricingCatalog
  difference:          number             // currentCatalogPrice - previousPrice
}
```

All amounts are raw integers in cents. Formatting is always `PriceEngine.format` — never inside `PricingEngine`.

---

### 2.20 Pricing as an Emerging Subdomain

> This section is a roadmap recommendation only. No implementation changes are required now.
> The architecture already accommodates this evolution without redesign.

The Billing domain currently owns Pricing as one of its concerns. As the platform grows, Pricing will develop into a business subdomain with enough distinct rules, models, and engines to justify its own bounded context.

```
Billing Domain
  ├── Subscription        (lifecycle, status, cancellation)
  ├── Credits             (ledger, deduction, low-balance)
  ├── Usage               (counters, period tracking, allowances)
  ├── Invoices            (generation, line items, payment)
  └── Lifecycle           (trial, grace period, long-term inactive)

Pricing Subdomain  (emerging — currently nested in Billing)
  ├── PricingEngine        (calculation, strategies, dependency resolution)
  ├── PricingCatalog       (versioned catalog, FeaturePrice, FeatureBundleVersion)
  ├── Quotes               (PricingQuote lifecycle, immutable snapshots)
  ├── Bundles              (FeatureBundle, FeatureBundleVersion)
  ├── Discounts            (bundle discounts, promotional overrides, negotiated pricing)
  ├── Taxes                (TaxBreakdownLine, tax rules, inclusive/exclusive)
  ├── Pricing Strategies   (FeatureBased, Enterprise, PartnerReseller, Promotional, Flat)
  └── Future extensions
       ├── Regional pricing   (per-country PricingCatalog variants)
       ├── Multi-currency     (currency conversion, catalog currency per region)
       ├── Reseller pricing   (partner margin, retail vs. cost price)
       └── Scheduled pricing  (future-dated catalog activation)
```

**When to make the split:**

The Pricing subdomain should be promoted to a fully independent domain when one or more of the following is true:
- Regional pricing or multi-currency is being implemented
- A dedicated pricing team owns the catalog
- Pricing changes require a different deployment cadence from subscription lifecycle changes
- A public pricing API is introduced for external integrations

Until then, Pricing lives in `src/lib/billing/` organized into its own `pricing/` subdirectory — so the future extraction is a directory move, not a logic refactor.

---

### 3.1 New Database Tables Required

| Table | Purpose |
|---|---|
| `subscription_plans` | Configurable tier registry |
| `features` | Feature registry — identity, entitlement classification, dependency graph, and UI metadata only (no pricing) |
| `feature_prices` | Feature pricing per catalog version — owned by PricingCatalog, not Feature |
| `pricing_catalogs` | Versioned pricing catalog — container for all FeaturePrice and FeatureBundleVersion records at a point in time |
| `feature_dependencies` | Directed acyclic dependency graph between features |
| `plan_entitlements` | Plan-to-feature mapping with optional usage limits |
| `business_subscriptions` | Active subscription record per business |
| `subscription_status_history` | Immutable audit log of status transitions |
| `entitlement_overrides` | Per-business feature exceptions |
| `usage_counters` | Current period TX count and overage tracking |
| `credit_ledger` | Append-only credit event history |
| `billing_invoices` | Invoice records |
| `billing_invoice_items` | Invoice line items |
| `business_subscription_features` | Composable plan snapshot — selected features with agreed pricing frozen at subscription creation |
| `feature_bundles` | Named bundle identity and composition (feature membership) |
| `feature_bundle_items` | Feature membership in a bundle |
| `feature_bundle_versions` | Bundle discount rules per catalog version — versioned alongside FeaturePrice |
| `pricing_quotes` | Immutable quote business documents — full snapshot including feature labels, tax breakdown, catalog version |
| `pricing_quote_items` | Typed line items within a pricing quote (FEATURE, BUNDLE_DISCOUNT, SURCHARGE, TAX, ONE_TIME_FEE) |

### 3.2 Existing Schema Changes

| Model | Change |
|---|---|
| `Business` | Add relations to `BusinessSubscription`, `EntitlementOverride`, `UsageCounter`, `CreditLedger`, `BillingInvoice`, `BusinessSubscriptionFeature`, `PricingQuote` |
| `Transaction` | Add optional `usageCounterId` to link a sale to the counter it incremented |
| `ConfigKey` enum | Add `TRIAL_DURATION_DAYS`, `GRACE_PERIOD_DAYS`, `LONG_TERM_INACTIVE_DAYS`, `CREDIT_LOW_BALANCE_THRESHOLD`, `OVERAGE_BILLING_ENABLED`, `COMPOSABLE_BRANCH_MONTHLY_RATE`, `COMPOSABLE_EMPLOYEE_MONTHLY_RATE`, `COMPOSABLE_INCLUDED_BRANCHES`, `COMPOSABLE_INCLUDED_EMPLOYEES`, `COMPOSABLE_ANNUAL_DISCOUNT_PERCENT` |

### 3.3 Background Jobs

| Job | Trigger | Responsibility |
|---|---|---|
| `subscription-lifecycle` | Daily cron | TRIAL→EXPIRED, EXPIRED→LONG_TERM_INACTIVE transitions |
| `grace-period-expiry` | Daily cron | GRACE_PERIOD→EXPIRED when grace window ends |
| `usage-counter-reset` | Monthly, on `currentPeriodEnd` per business | Create new `UsageCounter` for next period; carry over overage if applicable |
| `credit-low-balance-notify` | On each credit deduction | Check if balance < threshold; emit notification if so |
| `billing-invoice-generation` | Monthly, on period end | Generate subscription invoice; attach overage line items if applicable |
| `pricing-quote-expiry` | Daily cron | Set `PricingQuote.status = EXPIRED` for DRAFT/CALCULATED/SENT quotes past `validUntil` |
| `composable-renewal-preview` | Configurable days before renewal | Run `PricingEngine.validateGrandfatheredPrices`; notify businesses of price changes before renewal |

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
  features: string[]             // Array of granted feature keys for this session.
                                 // For COMPOSABLE_FEATURES subscriptions, derived from
                                 // active BusinessSubscriptionFeature records.
                                 // For predefined plans, derived from PlanEntitlement records.
                                 // EntitlementOverrides are applied on top of both sources.
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
| `/billing/pricing` | Management | Composable pricing calculator — feature selection, live price preview, quote generation |
| `/billing/quotes` | Management | Saved quote history (DRAFT, CALCULATED, SENT, ACCEPTED, CONVERTED) |
| `/billing/quotes/$quoteId` | Management | Quote detail with accept/decline actions |
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
| `featureDependencyCollection` | `eager` | Needed by the pricing calculator for live dependency resolution |
| `featureBundleCollection` | `on-demand` | Bundle definitions; only needed on billing/pricing pages |

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
| Feature dependency cycle in composable selection | Low | `PricingEngine.validateDependencies` detects cycles at quote calculation time and returns a validation error before any subscription is created; cycle detection is enforced at seed time via constraint |
| Stale `BusinessSubscriptionFeature` snapshot after feature key rename | Low | Feature keys are immutable after creation (`onDelete: Restrict` on `FeatureDependency`); renaming a key requires a migration that updates all snapshot rows; key immutability is enforced at the application layer |
| Bundle qualification drift (feature removed from selection after bundle applied) | Medium | Bundle re-validation runs on every pricing calculator load and on every renewal; if a required bundle feature is removed, the bundle discount is automatically withdrawn and the business is notified before confirming |
| Negotiated price lower than cost | Low | `PricingEngine` does not enforce a minimum price floor — that is a sales policy decision; a platform admin UI warning can flag quotes where `negotiatedPrice < catalogPrice * threshold` without hard-blocking |

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
- Credit deduction on `createPosTransaction`
- Low-balance notification (credit restoration removed per business policy)
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

### Phase 7 — Composable Feature-Based Pricing

Deliverables:
- Add `PricingCatalog`, `FeaturePrice`, `FeatureBundleVersion` tables; seed initial v1 catalog with all feature prices and bundle versions
- Refactor `Feature` schema: remove pricing fields, add `FeaturePrice` model with `catalogId` FK
- Refactor `FeatureBundle`: remove `discountValue`/`pricingType` fields, add `FeatureBundleVersion` model
- Add `FeatureDependency`, `BusinessSubscriptionFeature`, `PricingQuote`, `PricingQuoteItem` tables
- Seed `COMPOSABLE` sentinel `SubscriptionPlan` and initial `FeatureBundleVersion` records
- Implement `PricingEngine` with: `resolveDependencies`, `validateDependencies`, `calculate`, `detectBundle`, `generateQuote`, `validateGrandfatheredPrices`; all five pricing strategies
- Implement `PricingCatalogRepository` (Application Layer) with `loadActive()` and `loadById()`
- Add `ComposableFeaturesStrategy` to `SubscriptionEngine`
- Extend `EntitlementEngine` to resolve entitlements from `BusinessSubscriptionFeature` when `billingModel = COMPOSABLE_FEATURES`
- Add `COMPOSABLE_FEATURES` to `BillingModel` enum in `schema.prisma`
- Add composable `ConfigKey` entries (`COMPOSABLE_BRANCH_MONTHLY_RATE`, etc.)
- `/billing/pricing` pricing calculator route — renders `PricingResult` from server; no client-side price logic
- `/billing/quotes` and `/billing/quotes/$quoteId` routes
- `pricing-quote-expiry` background job (DRAFT/CALCULATED/SENT quotes past `validUntil` → EXPIRED)
- `composable-renewal-preview` background job (calls `PricingEngine.validateGrandfatheredPrices`)
- Emit `QuoteConverted` domain event on subscription creation from quote
- Platform Administration: rep-assisted quote builder with `negotiatedPrice` controls per line item

Dependencies: Phase 6 complete (billing provider needed for payment on quote acceptance).

---

## Summary of New Files & Modules

| Path | Purpose |
|---|---|
| `src/lib/entitlement/entitlement-engine.ts` | Core entitlement evaluation logic |
| `src/lib/entitlement/entitlement-types.ts` | `EntitlementResult`, `EntitlementCode` types |
| `src/lib/entitlement/feature-keys.ts` | `FEATURE_*` / capability key string constants |
| `src/lib/billing/credit-engine.ts` | Credit deduction, balance read, low-balance check |
| `src/lib/billing/usage-engine.ts` | TX counter increment and period tracking |
| `src/lib/billing/invoice-engine.ts` | Invoice construction and line item calculation |
| `src/lib/billing/plan-engine.ts` | Plan comparison, capability matrix, upgrade eligibility |
| `src/lib/billing/pricing/pricing-engine.ts` | PricingEngine facade — single source of truth for all pricing calculations |
| `src/lib/billing/pricing/pricing-catalog-repository.ts` | Application Layer interface: `loadActive()`, `loadById()` |
| `src/lib/billing/pricing/types.ts` | `PricingInput`, `PricingConfig`, `PricingCatalogDTO`, `FeaturePriceDTO`, `FeatureBundleVersionDTO` |
| `src/lib/billing/pricing/value-objects/pricing-result.ts` | Immutable `PricingResult` with full line-item breakdown |
| `src/lib/billing/pricing/value-objects/tax-breakdown-line.ts` | Tax-system-agnostic `TaxBreakdownLine` value object |
| `src/lib/billing/pricing/value-objects/price-change-notice.ts` | `PriceChangeNotice` for grandfathered pricing detection |
| `src/lib/billing/billing-provider.ts` | External billing provider adapter interface |
| `src/lib/billing/strategies/monthly-subscription-strategy.ts` | SubscriptionEngine: monthly billing checkout evaluation |
| `src/lib/billing/strategies/prepaid-credits-strategy.ts` | SubscriptionEngine: prepaid credits checkout evaluation |
| `src/lib/billing/strategies/hybrid-strategy.ts` | SubscriptionEngine: hybrid checkout evaluation |
| `src/lib/billing/strategies/composable-features-strategy.ts` | SubscriptionEngine: composable features checkout evaluation |
| `src/lib/billing/pricing/strategies/flat-subscription-pricing-strategy.ts` | PricingEngine: standard plan flat price |
| `src/lib/billing/pricing/strategies/feature-based-pricing-strategy.ts` | PricingEngine: full composable pipeline |
| `src/lib/billing/pricing/strategies/enterprise-pricing-strategy.ts` | PricingEngine: feature-based + negotiated price overrides |
| `src/lib/billing/pricing/strategies/partner-reseller-pricing-strategy.ts` | PricingEngine: partner margin and retail price |
| `src/lib/billing/pricing/strategies/promotional-pricing-strategy.ts` | PricingEngine: promotional discount wrapper |
| `src/lib/jobs/subscription-lifecycle.ts` | Daily status transition job |
| `src/lib/jobs/usage-counter-reset.ts` | Monthly counter reset job |
| `src/lib/jobs/pricing-quote-expiry.ts` | Daily job to expire stale quotes past `validUntil` |
| `src/lib/jobs/composable-renewal-preview.ts` | Pre-renewal job: `validateGrandfatheredPrices` and notify |
| `src/routes/(private)/(dashboard)/transactions/index.tsx` | Transaction history page |
| `src/routes/(private)/(dashboard)/transactions/$transactionId/index.tsx` | Transaction detail page |
| `src/routes/(private)/(dashboard)/order-history/index.tsx` | Order history page |
| `src/routes/(private)/(dashboard)/billing/index.tsx` | Subscription & billing dashboard |
| `src/routes/(private)/(dashboard)/billing/invoices/index.tsx` | Invoice history |
| `src/routes/(private)/(dashboard)/billing/credits/index.tsx` | Credit balance & history |
| `src/routes/(private)/(dashboard)/billing/pricing/index.tsx` | Composable pricing calculator |
| `src/routes/(private)/(dashboard)/billing/quotes/index.tsx` | Saved quote list |
| `src/routes/(private)/(dashboard)/billing/quotes/$quoteId/index.tsx` | Quote detail with accept/decline |
| `src/routes/subscription/reactivate/index.tsx` | Reactivation flow (minimal auth shell) |
| `src/routes/(private)/(dashboard)/billing/credits/index.tsx` | Credit balance & history |
| `src/routes/(private)/(dashboard)/billing/pricing/index.tsx` | Composable pricing calculator |
| `src/routes/(private)/(dashboard)/billing/quotes/index.tsx` | Saved quote list |
| `src/routes/(private)/(dashboard)/billing/quotes/$quoteId/index.tsx` | Quote detail with accept/decline |
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
| `PricingEngine` | `src/lib/billing/pricing-engine.ts` | Composable subscription price calculation — the single source of truth for all pricing decisions |

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

Billing model logic (monthly subscription, prepaid credits, hybrid, composable) should be expressed as strategies behind a `SubscriptionEngine` facade — directly mirroring the `CostingEngine` pattern:

```
SubscriptionEngine.evaluateCheckout(billingModel, context)
  ├─ 'MONTHLY_SUBSCRIPTION' → MonthlySubscriptionStrategy.evaluate(context)
  ├─ 'PREPAID_CREDITS'      → PrepaidCreditsStrategy.evaluate(context)
  ├─ 'HYBRID'               → HybridStrategy.evaluate(context)
  └─ 'COMPOSABLE_FEATURES'  → ComposableFeaturesStrategy.evaluate(context)
```

This means switching a business's billing model is a data change (update `billingModel` on `BusinessSubscription`), not a code change.

---

**PricingEngine — the single source of truth for pricing calculations**

`PricingEngine` is a pure Business Engine that owns all pricing logic for the `COMPOSABLE_FEATURES` model. It follows the same architectural principles as every other engine in this codebase: no database access, no infrastructure dependencies, deterministic output from deterministic input.

**Responsibilities:**

| Method | Input | Output |
|---|---|---|
| `PricingEngine.resolveDependencies` | Raw feature key list, `FeatureDependencyDTO[]` | Expanded feature list with all transitive dependencies included |
| `PricingEngine.validateDependencies` | Expanded feature list, `FeatureDependencyDTO[]` | Validation result; detects cycles and missing required features |
| `PricingEngine.calculate` | `PricingInput`, `PricingConfig`, `PricingCatalogDTO` | `PricingResult` — rich line-item breakdown, totals, tax breakdown, applied bundle |
| `PricingEngine.detectBundle` | Expanded feature list, `FeatureBundleVersionDTO[]` from catalog | Best qualifying bundle version + discount amount |
| `PricingEngine.generateQuote` | `PricingResult`, quote metadata | `PricingQuoteDTO` ready for persistence — maps 1:1 to `PricingQuote` + `PricingQuoteItem` records |
| `PricingEngine.validateGrandfatheredPrices` | `BusinessSubscriptionFeature[]`, `PricingCatalogDTO` | `PriceChangeNotice[]` — features whose catalog price changed since the subscription snapshot |

**What PricingEngine must not contain:**
- Database queries (`prisma`, collection reads) — the Application Layer assembles `PricingCatalogDTO` via `PricingCatalogRepository`
- Config reads (`ConfigKey`, `SystemConfig`) — all config values arrive as `PricingConfig` parameters
- Date/time generation (`Date.now()`, `new Date()`) — dates are passed as explicit parameters
- Formatting logic — formatting is `PriceEngine.format`'s responsibility; `PricingEngine` returns raw cent integers
- HTTP calls or external API interactions
- Any reference to React, routing, or UI frameworks

These constraints are enforced by the engine principles in section 6.3 and documented as explicit prohibitions in section 2.17. The engine can be called identically from the pricing calculator server function, a background renewal job, and a test runner with zero setup.

**Pricing strategies — the strategy pattern applied to PricingEngine**

Following the `CostingEngine` reference implementation, `PricingEngine` dispatches to an interchangeable pricing strategy. The strategy is selected based on the context the Application Layer passes in — not by the engine reading the database.

```
PricingEngine.calculate(strategy, input, config)
  ├─ 'FLAT_SUBSCRIPTION'   → FlatSubscriptionPricingStrategy.calculate(input, config)
  ├─ 'FEATURE_BASED'       → FeatureBasedPricingStrategy.calculate(input, config)
  ├─ 'ENTERPRISE'          → EnterprisePricingStrategy.calculate(input, config)
  ├─ 'PARTNER_RESELLER'    → PartnerResellerPricingStrategy.calculate(input, config)
  └─ 'PROMOTIONAL'         → PromotionalPricingStrategy.calculate(input, config)
```

Every strategy implements the same `(input: PricingInput, config: PricingConfig) → PricingResult` contract. Adding a new strategy — for example a `FRANCHISE` strategy for multi-location franchise pricing — requires one new file and one `case` in the switch. No callers change.

**Strategy responsibilities:**

| Strategy | When Used | Key Behaviour |
|---|---|---|
| `FlatSubscriptionPricingStrategy` | Standard Starter / Professional / Enterprise plan | Returns a fixed plan price; feature prices ignored; no bundle evaluation |
| `FeatureBasedPricingStrategy` | `COMPOSABLE_FEATURES` self-service | Full pipeline: dependency resolution → feature summation → bundle detection → surcharges → discounts |
| `EnterprisePricingStrategy` | Rep-assisted enterprise quotes | Same as feature-based but applies `negotiatedPrices` overrides before finalising totals |
| `PartnerResellerPricingStrategy` | Partner or reseller channel deals | Applies a partner margin factor to the feature-based total; returns both the partner cost and the recommended retail price |
| `PromotionalPricingStrategy` | Limited-time promotions, trial conversion offers | Wraps any strategy with a promotional discount layer; uses `validFrom`/`validUntil` from the promotion config |

**Input and output contracts:**

```ts
// PricingInput — assembled by the Application Layer from DB data; passed to the engine
interface PricingInput {
  selectedFeatureKeys: string[]          // Raw selection from the business
  features:            FeaturePriceDTO[] // Catalog snapshot: key, monthlyPrice, yearlyPrice, deps, etc.
  dependencies:        FeatureDependencyDTO[]
  bundles:             FeatureBundleDTO[]
  billingCycle:        'MONTHLY' | 'ANNUAL'
  branchCount:         number
  employeeCount:       number
  negotiatedPrices?:   Record<string, number> // featureKey → negotiated monthly price in cents
  promotionCode?:      string
}

// PricingConfig — assembled from SystemConfig by the Application Layer
interface PricingConfig {
  basePlatformFee:             number   // Cents
  includedBranches:            number
  branchMonthlyRate:           number   // Cents per additional branch
  includedEmployees:           number
  employeeMonthlyRate:         number   // Cents per additional employee
  annualDiscountPercent:       number   // e.g. 15 = 15% off annual total
  strategy:                    PricingStrategyType
}
```

**Grandfathered pricing:**

When a composable subscription renews, the Application Layer calls `PricingEngine.validateGrandfatheredPrices` to compare the frozen `BusinessSubscriptionFeature.agreedMonthlyPrice` values against the corresponding `FeaturePrice.monthlyPrice` in the current active `PricingCatalog`. If differences are detected, the engine returns a `PriceChangeNotice[]` that the billing page surfaces to the business before they confirm renewal. The business can accept the new prices or adjust their feature selection. No price changes are applied silently.

**Future extensibility:**

New pricing dimensions (e.g., per-transaction pricing for high-volume tiers, or geographic pricing regions) are added by extending `PricingInput` and `PricingConfig` and implementing a new strategy or extending an existing one. The engine's public `calculate` method signature does not change, preserving backward compatibility with all existing callers.

---

### 6.7 Event-Driven Integration Between Engines

As more engines are introduced, avoid coupling them directly. When `createPosTransaction` completes, it should not need to know that billing, reporting, notifications, and analytics all need to react to that event.

Instead, the infrastructure layer emits a domain event after a successful operation. Other modules subscribe to and handle those events independently.

**Domain events this project should eventually support:**

| Event | Emitted By | Consumed By |
|---|---|---|
| `TransactionCompleted` | `createPosTransaction` | UsageEngine (increment counter), CreditEngine (deduct credits), Analytics, Notifications |
| `TransactionRefunded` | `createPosRefund` | Analytics, Inventory (if applicable) - No credit/usage restoration per business policy |
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

Proposed layout for billing and pricing engines:

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
    policies/
      subscription-policy.ts
      billing-policy.ts
    strategies/
      monthly-subscription-strategy.ts     ← SubscriptionEngine strategies
      prepaid-credits-strategy.ts
      hybrid-strategy.ts
      composable-features-strategy.ts
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
      quote-converted.ts
    pricing/                              ← Pricing subdomain (nested in Billing until promoted)
      pricing-engine.ts                   ← PricingEngine facade
      pricing-catalog-repository.ts       ← Application Layer interface: loadActive / loadById
      types.ts                            ← PricingInput, PricingConfig, PricingCatalogDTO, DTOs
      strategies/
        flat-subscription-pricing-strategy.ts   ← PricingEngine strategies
        feature-based-pricing-strategy.ts
        enterprise-pricing-strategy.ts
        partner-reseller-pricing-strategy.ts
        promotional-pricing-strategy.ts
      value-objects/
        pricing-result.ts                 ← Rich PricingResult with line items and tax breakdown
        tax-breakdown-line.ts             ← TaxBreakdownLine (tax-system agnostic)
        price-change-notice.ts            ← PriceChangeNotice for grandfathered pricing detection
  jobs/
    subscription-lifecycle.ts   ← infrastructure; calls SubscriptionEngine
    usage-counter-reset.ts      ← infrastructure; calls UsageEngine
    pricing-quote-expiry.ts     ← infrastructure; expires stale quotes past validUntil
    composable-renewal-preview.ts ← infrastructure; calls PricingEngine.validateGrandfatheredPrices
```

Pricing lives in `billing/pricing/` as a subdirectory rather than a top-level domain directory. This reflects its current status as an emerging subdomain within Billing. When the split criteria in section 2.20 are met, the `pricing/` directory moves to `src/lib/pricing/` — a directory rename, not a logic refactor.

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
| Composable subscription pricing | `PricingEngine` + pricing strategies (in `billing/pricing/`) |
| Pricing catalog versioning | `PricingCatalog` models + `PricingCatalogRepository` (Application Layer) |
| Feature pricing over time | `FeaturePrice` — one record per feature per catalog version |
| Bundle discount versioning | `FeatureBundleVersion` — one record per bundle per catalog version |
| Immutable quote documents | `PricingQuote` + `PricingResult` value object |
| Tax breakdown (multi-country) | `TaxBreakdownLine` value object; rules passed as `TaxRuleDTO[]` in `PricingConfig` |
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
Owns everything related to subscription lifecycle, feature entitlement, usage tracking, credit management, and composable pricing. The Pricing subdomain is nested here until the split criteria in section 2.20 are met.

| Component | Type | Responsibility |
|---|---|---|
| `EntitlementEngine` | Engine | Evaluates whether a business can perform a capability |
| `SubscriptionEngine` | Engine | Subscription state machine and lifecycle transition rules |
| `UsageEngine` | Engine | TX counter logic, period tracking, allowance calculations |
| `CreditEngine` | Engine | Credit balance reads, deduction rules, low-balance detection |
| `InvoiceEngine` | Engine | Invoice construction, line item calculation, totals |
| `PlanEngine` | Engine | Plan comparisons, capability matrix, upgrade eligibility |
| `PricingEngine` | Engine | Composable pricing — dependency resolution, catalog-driven calculation, bundle detection, rich `PricingResult`, grandfathered price validation |
| `PricingCatalogRepository` | Application Layer | Loads `PricingCatalogDTO` from persistence for the engine; never called by the engine itself |
| `SubscriptionPolicy` | Policy | Grace period rules, long-term inactivity thresholds, trial conversion rules |
| `BillingPolicy` | Policy | Overage billing vs. blocking decisions, credit consumption rates |
| `BillingPeriod` | Value Object | Immutable period start/end pair with boundary calculations |
| `CreditBalance` | Value Object | Immutable credit amount with insufficient-balance detection |
| `UsageSummary` | Value Object | Snapshot of txCount, allowance, remaining, and overage |
| `SubscriptionStatus` | Value Object | Typed status with capability resolution methods |
| `PricingResult` | Value Object | Immutable rich output of `PricingEngine.calculate` — line items, totals, tax breakdown, applied bundle, validation errors, price change notices |
| `TaxBreakdownLine` | Value Object | Tax-system-agnostic tax line (name, rate, taxable amount, tax amount, inclusive flag) |
| `PriceChangeNotice` | Value Object | Grandfathered pricing notice — previous vs. current catalog price for a feature |
| `SubscriptionActivated` | Domain Event | |
| `SubscriptionExpired` | Domain Event | |
| `TrialStarted` | Domain Event | |
| `TrialExpired` | Domain Event | |
| `CreditsPurchased` | Domain Event | |
| `CreditsConsumed` | Domain Event | |
| `UsageLimitReached` | Domain Event | |
| `BusinessSuspended` | Domain Event | |
| `BusinessReactivated` | Domain Event | |
| `QuoteCalculated` | Domain Event | Emitted when a `PricingQuote` moves to `CALCULATED`; consumers may trigger notifications or analytics |
| `QuoteConverted` | Domain Event | Emitted when a `PricingQuote` transitions to `CONVERTED` and a composable subscription is created |

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
| `TransactionRefunded` | Commerce | `transactionId`, `originalTransactionId`, `amount` | Reporting (no credit restoration per policy) |
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
| `QuoteCalculated` | Billing | `quoteId`, `businessId`, `catalogVersion`, `grandTotal` | Notifications (quote ready), Analytics |
| `QuoteConverted` | Billing | `quoteId`, `businessId`, `subscriptionId`, `grandTotal` | Entitlement (cache invalidate), Notifications, Billing (invoice generation) |

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

**Defined — now part of this architecture:**

`PricingEngine` — composable subscription pricing, dependency resolution, bundle detection, quote generation, and grandfathered price validation. Fully specified in section 6.6 and implemented in Phase 7. No longer a candidate; it is a first-class billing domain engine.

**Recommended — clear domain with non-trivial logic:**

`ReportingEngine`
Aggregation logic, period-over-period comparison, metric derivation (gross margin, turn rate, sell-through). Currently implicit in the reports pages. As reporting moves server-side, a dedicated engine prevents report logic from living in Prisma queries.

`PromotionEngine`
Discount rules for promotional campaigns: percentage off, buy-X-get-Y, minimum spend thresholds, validity windows. Different from `DiscountPolicy` (which governs when discounts apply) — `PromotionEngine` calculates what the promotion yields. Note: the `PromotionalPricingStrategy` inside `PricingEngine` handles subscription-level promotional discounts; `PromotionEngine` would handle transaction-level promotional discounts (e.g. buy-one-get-one on POS items). These are distinct concerns. Introduced when promotions ship.

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
- Pricing calculator UI state: UI concern; all calculations go through `PricingEngine` on the server

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
| Composable pricing management | Manage `PricingCatalog` versions, `FeaturePrice` records, `FeatureBundle` identity, and `FeatureBundleVersion` discount rules; publish new catalog versions |
| Rep-assisted quote builder | Build `PricingQuote` records with negotiated prices on behalf of enterprise customers; convert accepted quotes to active subscriptions |
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

**Timeline:** Platform Administration is a post-Phase 3 concern. The schema and domain engines are designed with it in mind from the start (hence the `EntitlementOverride`, `SubscriptionStatusHistory`, `BillingInvoice`, and `PricingQuote` models), but the UI and auth system for platform admins are deferred. The rep-assisted quote builder and composable pricing management UI are Phase 7 deliverables of the Platform Administration application.

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
        monthly-subscription-strategy.ts       ← SubscriptionEngine strategies
        prepaid-credits-strategy.ts
        hybrid-strategy.ts
        composable-features-strategy.ts
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
        quote-converted.ts
        quote-calculated.ts
      pricing/                              ← Pricing subdomain (nested; see section 2.20)
        pricing-engine.ts                   ← PricingEngine facade
        pricing-catalog-repository.ts       ← Application Layer interface
        types.ts                            ← PricingInput, PricingConfig, PricingCatalogDTO, DTOs
        strategies/
          flat-subscription-pricing-strategy.ts
          feature-based-pricing-strategy.ts
          enterprise-pricing-strategy.ts
          partner-reseller-pricing-strategy.ts
          promotional-pricing-strategy.ts
        value-objects/
          pricing-result.ts                 ← Rich PricingResult (line items, totals, tax breakdown)
          tax-breakdown-line.ts             ← TaxBreakdownLine (tax-system agnostic)
          price-change-notice.ts            ← PriceChangeNotice (grandfathered pricing)

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
| **Pricing Catalog** | A versioned, named container (`PricingCatalog`) that holds all `FeaturePrice` and `FeatureBundleVersion` records active at a point in time. The `PricingEngine` always receives a catalog; it never fetches one. | Price list, config, settings |
| **Feature Price** | A `FeaturePrice` record — the recurring and one-time cost of a single feature within a specific `PricingCatalog` version. Separate from the feature's identity and entitlement classification. | Feature config, pricing field |
| **Bundle Version** | A `FeatureBundleVersion` record — the discount rules for a bundle within a specific `PricingCatalog` version. Immutable once the catalog is published. | Bundle config, bundle discount |
| **Pricing Catalog DTO** | The plain data object (`PricingCatalogDTO`) assembled by the Application Layer from a `PricingCatalog` and passed into `PricingEngine`. Contains no Prisma types. | Catalog model, catalog entity |
| **Quote snapshot** | A `PricingQuote` in `CALCULATED` or later state — an immutable business document containing snapshotted feature labels, prices, tax breakdown, catalog version, and all components needed for reproduction years later. | Draft quote, saved quote |
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

**ADR-009: Composable Feature-Based Pricing via PricingEngine and Snapshot Model**

_Decision:_ The `COMPOSABLE_FEATURES` billing model uses a dedicated `PricingEngine` as the single source of truth for all pricing calculations. Agreed prices are frozen into `BusinessSubscriptionFeature` snapshot records at subscription creation and never recalculated silently.

_Context:_ Predefined plan tiers (Starter, Professional, Enterprise) cannot accommodate every business's feature needs without creating a combinatorial explosion of plans. Enterprise customers frequently negotiate custom combinations and prices. A composable model allows businesses to build their own subscription while the system remains fully configurable — no new code needed to introduce a new feature price, bundle, or promotional rate.

_Rationale:_ Centralizing all pricing calculations in `PricingEngine` (following the same engine pattern as `TaxEngine`, `CostingEngine`, etc.) prevents pricing logic from scattering across server functions, background jobs, and UI components. The snapshot model solves the historical integrity problem: a price change to a feature catalog entry never retroactively affects active subscriptions, which is both a commercial commitment and an audit requirement.

_Consequences:_ Six new database tables. `PricingEngine` with five strategies must be implemented before the composable model can be activated. `EntitlementEngine` must be extended to resolve entitlements from `BusinessSubscriptionFeature` in addition to `PlanEntitlement`. Existing predefined-plan subscriptions are unaffected.

_Trade-offs:_ Additional schema complexity vs. flexibility. The snapshot model means pricing history is preserved at the cost of more rows per subscription. The benefits — grandfathered pricing, auditability, and zero recalculation risk — outweigh the storage cost at this scale.

---

**ADR-010: Feature and Pricing as Separate Domain Objects**

_Decision:_ The `Feature` model owns identity, entitlement classification, and dependency graph only. Pricing is owned by `FeaturePrice`, versioned through `PricingCatalog`. The `PricingEngine` receives a `PricingCatalogDTO` assembled by the Application Layer — it never reads `Feature` or `FeaturePrice` from the database directly.

_Context:_ The previous iteration placed pricing fields (`monthlyPrice`, `yearlyPrice`, `implementationFee`, `setupFee`) directly on the `Feature` model. This worked for a single pricing tier in a single currency, but created coupling that would have made regional pricing, multi-currency, reseller channels, and promotional pricing difficult to implement correctly. Updating a feature's price under the old model would have silently changed the reproduction of all historical quotes.

_Rationale:_ A feature's identity changes rarely and only by deliberate product decision. Its price changes frequently — across catalog versions, promotions, regions, and negotiated deals. Separating the two concerns means each evolves independently. The `PricingCatalog` version becomes the audit anchor: any quote or subscription snapshot can be reproduced exactly by loading the catalog version it was calculated under. Historical records are never affected by current catalog changes.

_Consequences:_ Three new models: `FeaturePrice` (replaces pricing fields on `Feature`), `PricingCatalog` (versioned container), `FeatureBundleVersion` (replaces pricing fields on `FeatureBundle`). The Application Layer gains a `PricingCatalogRepository` responsibility. `PricingEngine` receives `PricingCatalogDTO` instead of individual persistence model types.

_Trade-offs:_ More models to reason about. Mitigated by clear naming and the consistent pattern of "identity model + versioned pricing model" already established by `FeatureBundle → FeatureBundleVersion`.

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
| `PricingCatalog` records | New catalog versions published via database operations; no code deployment needed |
| `FeaturePrice` records | Pricing changes are new catalog versions; existing versions immutable |
| `FeatureBundleVersion` records | Bundle discount changes are new catalog version records; existing versions immutable |
| `PricingEngine` strategies | New strategies added as new pricing channels emerge; existing strategies unchanged |
| `SystemConfig` / `ConfigKey` enum | New keys added as configuration needs grow |
| Implementation Phases (Part 5) | Phases are delivered sequentially; completed phases become stable |

#### Experimental — Future Roadmap

These are directional decisions. The architecture accommodates them, but the implementation details are not yet settled.

| Area | Status |
|---|---|
| Event bus promotion to durable/async | Currently in-process and synchronous; promoted when three or more consumers need reliability guarantees |
| Value Objects (`Money`, `Quantity`, `TaxBreakdown`) | Defined architecturally; introduced progressively as engines are touched |
| `ReportingEngine` | Defined as a candidate; introduced when reports migrate off local collections |
| `PromotionEngine` | Introduced when promotional campaigns ship (distinct from `PromotionalPricingStrategy` in `PricingEngine`) |
| Platform Administration application (ADR-008) | Schema-ready; UI and auth deferred to post-Phase 3; composable quote builder is a Phase 7 deliverable of the platform admin UI |
| External billing provider integration (Stripe) | Phase 6; provider adapter interface defined, implementation deferred |
| Composable Feature-Based Pricing (`PricingEngine`, `PricingCatalog`, `FeaturePrice`, `FeatureBundleVersion`) | Fully specified (ADR-009, ADR-010); implementation scheduled for Phase 7 after Phase 6 completes |
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
- `SubscriptionEngine` with billing model strategies: four billing models are now defined; strategies are the correct tool when the algorithm varies by a runtime value.
- `EntitlementContext` value object: the entitlement engine has eight evaluation rules; a structured context object is necessary for clarity, not over-engineering.
- Event catalog with 18 events: each event has at least two consumers. An event with one consumer should be a direct call; the threshold is met for all listed events.
- `PricingEngine` with five strategies: five distinct pricing channels (flat plan, feature-based, enterprise, partner/reseller, promotional) exist in the target market from day one of the composable model. The strategy pattern is appropriate — not speculative.
- `BusinessSubscriptionFeature` snapshot model: the grandfathered pricing requirement is a concrete commercial commitment, not a theoretical concern. Snapshot rows are small and bounded by the number of selected features per subscription.
- Nine new tables for composable pricing and pricing catalog: `feature_prices`, `pricing_catalogs`, `feature_dependencies`, `feature_bundles`, `feature_bundle_versions`, `feature_bundle_items`, `business_subscription_features`, `pricing_quotes`, `pricing_quote_items` — each owns a distinct concern and has no viable alternative without merging unrelated data.
- `PricingCatalog` versioning: the immutability requirement for historical quote reproduction makes versioning mandatory. The cost is additional rows per catalog cycle; the benefit is an unbreakable audit trail.
- Rich `PricingResult` value object: five distinct downstream consumers (pricing calculator, quote generator, subscription creation, invoice generation, public API) need different slices of the same calculation. A rich result object eliminates five separate partial re-implementations of line-item logic.

**Confirmed: No under-specified areas remaining**

All areas reviewed are either fully specified or explicitly classified as Experimental in the stability table (Part 8.4). Experimental items have a clear trigger for when specification work begins.

**Resolved: PromotionalPricingStrategy vs. PromotionEngine**

The `PromotionalPricingStrategy` inside `PricingEngine` applies subscription-level promotional discounts during composable price calculation (e.g., 20% off a quote for a new customer). The future `PromotionEngine` will handle transaction-level promotional rules (e.g., buy-one-get-one on POS items). These are distinct concerns in different domains. No overlap; no contradiction.

**Resolved: Feature pricing fields removed — backward compatibility**

The `Feature` model no longer carries `monthlyPrice`, `yearlyPrice`, `implementationFee`, or `setupFee` fields. These have moved to `FeaturePrice`. Existing `Feature` records that were seeded with pricing data require a one-time migration to create corresponding `FeaturePrice` records under the initial `PricingCatalog` v1. The entitlement engine does not read pricing fields from `Feature` and is therefore unaffected. All existing predefined-plan subscriptions continue to work — they use `PlanEntitlement`, not `FeaturePrice`.

**Resolved: QuoteStatus PRESENTED renamed to SENT**

The previous iteration used `PRESENTED` as the status for a quote that has been shared with the business. This has been renamed to `SENT` to better reflect the action (sharing the quote document) rather than the receipt state. All references in the document use `SENT`. No downstream impact on existing subscriptions or entitlement logic.

**Resolved: PricingEngine.convertQuote removed as an engine method**

The previous iteration had `PricingEngine.convertQuote` as an engine method. Converting a quote to a subscription requires writing to the database — a side effect that violates engine purity. The Application Layer now owns this responsibility: it reads `PricingQuoteItem` records and creates `BusinessSubscriptionFeature` and `BusinessSubscription` records directly. The engine's `generateQuote` method returns a `PricingQuoteDTO` that the Application Layer persists. No domain logic was lost; it was correctly placed in infrastructure.


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

**The one pricing rule:**
All composable subscription pricing calculations go through `PricingEngine`. The engine receives a `PricingCatalogDTO` assembled by the Application Layer — it never reads pricing data from the database directly.

**Ten Architecture Decision Records:**

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
| ADR-009 | Composable feature-based pricing via PricingEngine and snapshot model |
| ADR-010 | Feature and Pricing as separate domain objects; PricingCatalog as the versioned pricing container |

**Seven implementation phases:**

1. Transaction & Order History
2. Entitlement Engine Foundation
3. Subscription Lifecycle
4. Usage Tracking & Monthly Billing
5. Prepaid Credits
6. External Billing Integration
7. Composable Feature-Based Pricing (PricingCatalog, FeaturePrice, FeatureBundleVersion, PricingEngine, rich PricingResult, immutable PricingQuote)

**This document is now stable.**
Future architectural changes are made through new ADRs, not revisions to this plan.



---
