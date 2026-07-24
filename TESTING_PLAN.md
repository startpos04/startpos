# Testing Plan for Start POS

## Overview

This document outlines a comprehensive testing strategy for the Start POS application, prioritizing critical business logic, financial calculations, and data integrity.

## Current Coverage Status

**Last Updated**: 2026-07-24  
**Coverage Report**: Generated from `pnpm test:coverage`

| Metric | Current | Target (75%) | Gap |
|--------|---------|--------------|-----|
| **Statements** | 13.59% (520/3826) | 75% (2,870/3826) | +2,350 statements |
| **Branches** | 9.93% (239/2406) | 75% (1,805/2406) | +1,566 branches |
| **Functions** | 9.28% (137/1476) | 75% (1,107/1476) | +970 functions |
| **Lines** | 13.84% (467/3373) | 75% (2,530/3373) | +2,063 lines |

---

## Testing Stack (Already Configured)

- **Unit/Integration Tests**: Vitest + React Testing Library + jsdom
- **E2E Tests**: Playwright
- **Coverage Tool**: Vitest Coverage (v8)
- **Test Helpers**: Mock collections, factories, auth mocking

---

## Coverage Gaps Analysis

### ✅ High Coverage (Maintain)
- `src/lib/costing` — **100%** (56/56 statements)
- `src/lib/conversion` — **98%** (148/151 statements)
- `src/store` — **100%** (13/13 statements)
- `src/lib/__tests__/helpers` — **91%** (42/46 statements)

### 🎯 High-Value Gaps (Priority)
| Module | Statements | Current | Gap | Priority |
|--------|-----------|---------|-----|----------|
| `src/routes/(private)/pos/-components` | 421 | 0% | 421 | 🔴 HIGH |
| `src/lib/queries` | 393 | 42% | ~227 | 🔴 HIGH |
| `src/db` | 199 | 28% | ~142 | 🔴 HIGH |
| `src/hooks` | 104 | 26% | ~77 | 🟡 MEDIUM |
| `src/lib/utils` | 64 | 14% | ~55 | 🟡 MEDIUM |
| `src/lib/notification` | 31 | 0% | 31 | 🟡 MEDIUM |

### ⚠️ Excluded from Scope
- `src/lib/server-fn` — **Deprecated** (will be removed)
- `src/lib/columns` — **Deferred** (low-risk column definitions)
- `src/routes/(private)/(dashboard)/(supervisor)/sales-reports/-utils` — **Deferred** (non-critical reporting utilities)
- `src/lib/better-auth` — **External library** (low ROI)
- `src/lib/prisma-client` — **Generated code** (not testable)
- `src/routes/**` (UI routes) — **Covered by E2E** (low unit test ROI)

---

## Completed Tests (as of 2026-07-24)

### ✅ Phase 1 - HIGH Priority (COMPLETED)

#### 1. **Tax Engine** (`src/lib/conversion/tax-engine.ts`) ✅
- **Test File**: `tax-engine.test.ts`
- **Coverage**: ~100% (critical compliance code)
- **Test Cases**:
  - ✅ VAT calculation for inclusive vs exclusive prices
  - ✅ SC/PWD discount calculations (RA 9994 / RA 7277 compliance)
  - ✅ Multiple tax categories (STANDARD, EXEMPT, ZERO_RATED)
  - ✅ Line item breakdown accuracy
  - ✅ Transaction summarization with various discount combinations
  - ✅ Edge cases: zero amounts, negative checks, rounding
  - ✅ Receipt formatting and BIR field mapping
  - ✅ Validation functions
  - ✅ VAT-registered vs non-registered organizations
  - ✅ Price conversion utilities (inclusive/exclusive)

#### 2. **Inventory Engine** (`src/lib/conversion/inventory-engine.ts`) ✅
- **Test File**: `inventory-engine.test.ts`
- **Coverage**: ~100%
- **Test Cases**:
  - ✅ Reserved inventory calculation for cart items
  - ✅ Stock validation with components and addons
  - ✅ Remaining yield calculations
  - ✅ Unit requirements for variants
  - ✅ Physical stock lookup across product trees
  - ✅ Multi-cart + order reservation scenarios
  - ✅ Edge cases: zero stock, negative validation

#### 3. **Costing Engine** (`src/lib/costing/`) ✅
- **Test File**: `costing-engine.test.ts`
- **Coverage**: 100% (56/56 statements)
- **Test Cases**:
  - ✅ FIFO costing strategy
  - ✅ Moving Average costing
  - ✅ Specific Identification costing
  - ✅ Batch consumption planning
  - ✅ Unit conversion integration
  - ✅ Edge cases: insufficient inventory, partial batches

#### 4. **POS Transaction Creation** (`src/lib/queries/create-pos-transaction.ts`) ✅
- **Test File**: `create-pos-transaction.test.ts`
- **Coverage**: ~95%
- **Test Cases**:
  - ✅ Complete transaction flow (order → transaction → payment → inventory)
  - ✅ Stock validation before transaction
  - ✅ Tax calculation integration
  - ✅ Payment processing with multiple methods
  - ✅ Inventory movement creation (FIFO deduction)
  - ✅ Order item and addon creation
  - ✅ Compliance data handling (SC/PWD)
  - ✅ Transaction rollback on errors
  - ✅ Insufficient stock error handling
  - ✅ Multiple payment methods

#### 5. **POS Order Creation** (`src/lib/queries/create-pos-order.ts`) ✅
- **Test File**: `create-pos-order.test.ts`
- **Coverage**: ~95%
- **Test Cases**:
  - ✅ New order creation
  - ✅ Existing order updates
  - ✅ Order item management
  - ✅ Addon handling
  - ✅ Order status transitions
  - ✅ Customer reference tracking

#### 6. **Database Transaction** (`src/db/local-db-transaction.ts`) ✅
- **Test File**: `local-db-transaction.test.ts`
- **Coverage**: ~70%
- **Test Cases**:
  - ✅ Transaction boundaries (commit/rollback)
  - ✅ Error propagation
  - ✅ Sync mode behavior
  - ✅ Result wrapping with neverthrow

#### 7. **Price Engine** (`src/lib/conversion/price-engine.ts`) ✅
- **Test File**: `price-engine.test.ts`
- **Coverage**: ~100%
- **Test Cases**:
  - ✅ Price formatting for different locales
  - ✅ Rounding rules
  - ✅ Currency handling
  - ✅ Inclusive/exclusive conversions

#### 8. **Restock Ingredient** (`src/lib/queries/restock-ingredient.ts`) ✅
- **Test File**: `restock-ingredient.test.ts`
- **Coverage**: ~95%
- **Test Cases**:
  - ✅ Restock workflow with inventory movements
  - ✅ Purchase record creation
  - ✅ Batch upsert logic
  - ✅ Variant cost update
  - ✅ Inventory movement audit trail

#### 9. **Fetch Structured ID** (`src/lib/queries/fetch-structured-id.ts`) ✅
- **Test File**: `fetch-structured-id.test.ts`
- **Coverage**: ~90%
- **Test Cases**:
  - ✅ Sequence counter creation
  - ✅ Counter increment logic
  - ✅ ID formatting for different types
  - ✅ BIR permit limit checks

#### 10. **Custom Hooks** (`src/hooks/`) ✅ (Partial)
- **Test Files**: `use-mobile.test.ts`, `use-is-online.test.ts`
- **Coverage**: ~26% overall (2 of ~10 hooks)
- **Test Cases**:
  - ✅ Mobile detection logic (`use-mobile.ts`)
  - ✅ Online/offline detection (`use-is-online.ts`)

#### 11. **Utility Functions** (`src/lib/utils/`) ✅ (Partial)
- **Test Files**: `download-csv.test.ts`, `utils.test.ts`
- **Coverage**: ~14% overall
- **Test Cases**:
  - ✅ CSV download functionality
  - ✅ General utility functions

#### 12. **Authentication Store** (`src/store/auth-store.ts`) ✅
- **Test File**: `auth-store.test.ts`
- **Coverage**: 100% (13/13 statements)
- **Test Cases**:
  - ✅ User state management
  - ✅ Business/branch context
  - ✅ Session handling

---

## Planned Tests (Path to 75% Coverage)

### 🎯 Phase 1: POS Components (~421 statements, Weeks 1-2)

#### Task 1: Test POS Payment Dialog Component ✅
- **File**: `src/routes/(private)/pos/-components/payment-dialog.tsx`
- **Test File**: `payment-dialog.test.tsx` ✅
- **Estimated Tests**: 12-15 test cases
- **Actual Tests**: 27 test cases
- **Coverage Target**: 85%+

**Test Cases**:
- [x] Single cash payment flow
- [x] Multiple payment methods (cash + card split)
- [x] Validation: insufficient tendered amount
- [x] Validation: missing reference number for digital payments (GCash, Maya, Card)
- [x] Change calculation on overpayment
- [x] Payment line addition and removal
- [x] Platform selection updates method type
- [x] Form reset on dialog close
- [x] Combined payments must meet total bill
- [x] Loading prompt display during submission
- [x] Confirm button disabled when tendered = 0
- [x] Confirm button disabled when tendered < total
- [x] Confirm button enabled when tendered >= total
- [x] Pre-fills remaining due when adding a second payment method
- [x] Pre-fills 0 when already overpaid on second payment method

**Infrastructure added**:
- `src/test-setup.ts` — jest-dom matchers + jsdom polyfills (scrollIntoView, pointerCapture)
- `@testing-library/jest-dom` installed as dev dependency
- `vitest.config.ts` updated with `setupFiles`

**Demo**: Payment dialog renders, validates correctly, and calculates change/splits accurately across all scenarios ✅

---

#### Task 2: Test POS Cart Aside Component ✅
- **File**: `src/routes/(private)/pos/-components/cart-aside.tsx`
- **Test File**: `cart-aside.test.tsx` ✅
- **Estimated Tests**: 15-18 test cases
- **Actual Tests**: 34 test cases
- **Coverage Target**: 85%+

**Test Cases**:
- [x] Cart item list rendering (product name, variant, addons)
- [x] Quantity increment button (respects stock limits)
- [x] Quantity decrement button (removes item at 0)
- [x] Stock limit disables `+` button when no additional yield available
- [x] Addon display with price override
- [x] Addon removal button
- [x] Customer reference input field
- [x] Tax summary breakdown (vatable sales, VAT amount, exempt, zero-rated)
- [x] Grand total calculation
- [x] Checkout button disabled when cart is empty
- [x] Checkout button triggers payment dialog with correct total
- [x] New order button calls navigate (form re-created by POSPage)
- [x] Order number display (existing order vs "New Order")
- [x] Item count and quantity badges

**Infrastructure added**:
- Mocks for `@/db/index`, `@/db/local-auth` to prevent OPFS initialization in jsdom
- `importOriginal` pattern for `@tanstack/react-router` partial mock
- `CartWrapper` test helper — instantiates `useAppForm` and passes form as prop to `CartAside`

**Demo**: Cart displays and controls items correctly, tax totals match TaxEngine output, checkout triggers PaymentDialog ✅

---
#### Task 3: Test POS Product Card Component ✅
- **File**: `src/routes/(private)/pos/-components/product-card.tsx`
- **Test File**: `product-card.test.tsx` ✅
- **Estimated Tests**: 10-12 test cases
- **Actual Tests**: 28 test cases
- **Coverage Target**: 85%+

**Test Cases**:
- [x] Renders product name, price, category badge
- [x] Renders "General" when category is null
- [x] Displays product image fallback (Coffee icon)
- [x] In-stock badge displays available quantity
- [x] Out-of-stock badge and disabled state (grayscale, no cursor-pointer)
- [x] Addon preview (shows first 4, "+N more" for additional)
- [x] No Extras section when product has no addons
- [x] Variant preview (shows first 2, "tap to see N more sizes" prompt)
- [x] No Options section for single-variant product
- [x] Click opens ProductDialog (showModal) when in stock
- [x] Click passes product, cartItems, onAdd to showModal
- [x] Click does nothing when out of stock
- [x] Click does nothing when cart already exhausts stock
- [x] SKU display when present, absent when null
- [x] Stock calculation uses InventoryEngine.calculateRemainingYield (real)

**Infrastructure note**: Fixed root cause of path resolution failures — tsconfig was incorrectly excluding test files, which broke `prisma/*` and `@/*` alias resolution for test files.

**Demo**: Cards render accurately, block clicks when out of stock, show correct availability badges ✅

---

#### Task 4: Test Remaining POS Components ✅
- **Files**: `header.tsx`, `active-orders-btn.tsx` ✅ | `product-items.tsx`, `receipt-ticket.tsx` ⚠️ skipped (see notes)
- **Test Files**: `header.test.tsx` ✅, `active-orders-btn.test.tsx` ✅
- **Estimated Tests**: 15-18 test cases total
- **Actual Tests**: 18 test cases (7 header + 11 active-orders-btn)
- **Coverage Target**: 80%+

**Test Cases**:
- **Header** (`header.test.tsx`):
  - [x] Header element renders
  - [x] SearchInput rendered
  - [x] ThemeToggle rendered
  - [x] ProfileDropdown rendered
  - [x] Title rendered
  - [x] ActiveOrdersButton shown when ENABLE_ORDER = true
  - [x] ActiveOrdersButton hidden when ENABLE_ORDER = false

- **Active Orders Button** (`active-orders-btn.test.tsx`):
  - [x] Button renders
  - [x] Anchor href points to /orders
  - [x] Badge hidden when no active orders
  - [x] Badge shows correct count (1, 3 orders)
  - [x] Badge element absent from DOM when 0 orders
  - [x] Click calls showModal with ActiveOrdersDialog
  - [x] Correct component passed to showModal
  - [x] showModal options include onCancel callback
  - [x] onCancel calls queryClient.invalidateQueries
  - [x] Click handler runs (no navigation)

- **Product Items Modal** ⚠️ Skipped:
  - Deep `withForm` + `MultiView` + column definition dependencies make unit testing low-value; logic covered via `ProductCard` tests and the `handleAddToCart` dedup logic is tested indirectly through integration.

- **Receipt Ticket** ⚠️ Skipped:
  - `@react-pdf/renderer` renders a PDF document tree, not a DOM — not compatible with jsdom/RTL. Needs an E2E or PDF snapshot test approach.

**Demo**: Header and ActiveOrdersButton tested fully. Conditional rendering and click flows verified. ✅

---

### 🎯 Phase 2: Query Functions (~227 statements, Weeks 2-3)

#### Task 5: Test Product & Order Fetch Queries ✅
- **Files**: `fetch-pos-products.ts`, `fetch-active-orders.ts`, `fetch-ingredients.ts`
- **Test Files**: `fetch-pos-products.test.ts` ✅, `fetch-active-orders.test.ts` ✅, `fetch-ingredients.test.ts` ✅
- **Estimated Tests**: 15-18 test cases total
- **Actual Tests**: 36 test cases (12 each)
- **Coverage Target**: 85%+

**Test Cases**:
- **fetch-pos-products**:
  - [x] Returns products with variants, category, baseUnit
  - [x] Attaches matching inventory records to variant.inventory
  - [x] Does not attach inventory from wrong variant
  - [x] Returns multiple products
  - [x] totalItems subtracts 2 when no searchQuery
  - [x] totalItems unchanged when searchQuery provided
  - [x] totalItems clamps to 0 (never negative)
  - [x] isLoading forwarded from useLiveQuery

- **fetch-active-orders**:
  - [x] Returns empty data when no orders
  - [x] Returns orders with items assembled
  - [x] Items filtered to their respective order
  - [x] Order with no items gets empty array
  - [x] Multiple items for same order all included
  - [x] Addons attached to their respective order item
  - [x] Addon not attached to wrong item
  - [x] Transaction attached by orderId
  - [x] Transaction undefined when no match
  - [x] Each order gets its own transaction

- **fetch-ingredients**:
  - [x] Returns empty array when no ingredients
  - [x] Returns product name, type, category, baseUnit
  - [x] Variants populated with inventory and usedIn
  - [x] isLoading forwarded from useLiveQuery
  - [x] Works without ingredientId param
  - [x] Works with ingredientId param
  - [x] ingredientId passed as useLiveQuery dependency

**Infrastructure note**: `useLiveQuery` mocked via `importOriginal` partial mock — inline `vi.fn()` in factory + `vi.mocked(useLiveQuery)` in tests avoids hoisting issues.

**Demo**: All three hooks return correctly shaped, joined data with proper filtering and relationship loading ✅

---

#### Task 6: Test Options Queries & Refund Flow ✅
- **Files**: `fetch-*-options.ts` (branch, category, supplier, location, unit), `create-pos-refund.ts`
- **Test Files**: `fetch-options.test.ts` ✅, `create-pos-refund.test.ts` ✅
- **Estimated Tests**: 15-18 test cases total
- **Actual Tests**: 37 (20 options + 17 refund)
- **Coverage Target**: 90%+

**Test Cases**:
- **Options queries** (`fetch-options.test.ts`):
  - [x] Branch options mapped to `{ label, value, data }`
  - [x] Category options mapped to `{ label, value, data }`
  - [x] Unit options mapped to `{ label: "name (abbrev)", value, data }`
  - [x] Supplier options mapped to `{ label, value, data }`
  - [x] Location options mapped to `{ label, value, data }`
  - [x] Empty array when no records for all hooks
  - [x] Multiple records all mapped correctly
  - [x] isLoading forwarded from useLiveQuery for all hooks

- **create-pos-refund** (`create-pos-refund.test.ts`):
  - [x] Returns refundInvoiceNo (RF- prefix) and transactionId on success
  - [x] Inserts a new REFUND transaction
  - [x] Negates totalAmount, totalCost, taxAmount on refund transaction
  - [x] Sets originalTransactionId to original tx id
  - [x] Negates compliance vatExemptSales and zeroRatedSales
  - [x] Increments inventory quantity for each original movement batch
  - [x] Creates IN movement record for each original OUT movement
  - [x] IN movement reason references the refund invoice number
  - [x] Handles transaction with no movements (no inventory to restock)
  - [x] Inserts negated tax line for each original tax line
  - [x] Inserts negative payment record with correct amount
  - [x] Payment references original invoice number
  - [x] Payment change is 0
  - [x] Returns error when original transaction not found

**Fix applied**: `dayjs.extend(utc)` added to test file — `fetchStructuredId` (called internally by the refund) requires the dayjs UTC plugin.

**Demo**: Options return correctly mapped dropdown data; refund correctly inverts all records from the original transaction ✅

---

#### Task 7: Test Fetch Structured ID — Remaining Edge Cases ✅
- **File**: `fetch-structured-id.ts` (enhance existing coverage)
- **Test File**: `fetch-structured-id.test.ts` ✅ (enhanced — 26 tests total, +13 added)
- **Estimated Tests**: 5-8 additional test cases
- **Actual Added**: 13 additional test cases
- **Coverage Target**: 95%+

**Test Cases**:
- [x] STOCK_TRANSFER sequence type (`ST-{year}-000001`)
- [x] PURCHASE sequence type (`PO-{year}-000001`)
- [x] COLLECTION_RECEIPT sequence type (`CR-{year}-000001`)
- [x] COLLECTION_RECEIPT counter is independent from INVOICE
- [x] COLLECTION_RECEIPT counter is not day-scoped (day = 0)
- [x] BIR limit only applies to INVOICE — REFUND, PURCHASE, STOCK_TRANSFER, COLLECTION_RECEIPT never throw
- [x] 10 consecutive INVOICE calls produce 000001–000010 (no gaps)
- [x] 10 consecutive ORDER calls produce #000001–#000010
- [x] Interleaved types each maintain their own independent counter
- [x] All five main types each produce 000001 on first call (fully independent)
- [x] ORDER counter is day-scoped; INVOICE and PURCHASE are not

**Demo**: All ID formats generate correctly for all sequence types; rapid successive calls produce sequential IDs without gaps ✅

---

#### Task 8: Test Remaining Queries — Tasks & Vendor Sessions ✅
- **Files**: `fetch-tasks.ts`, `fetch-vendor-session-options.ts`, `fetch-user-options.ts`
- **Test File**: `fetch-tasks-and-sessions.test.ts` ✅ (consolidated)
- **Estimated Tests**: 10-12 test cases total
- **Actual Tests**: 20 test cases
- **Coverage Target**: 85%+

**Test Cases**:
- **fetchTasks**:
  - [x] Returns empty array when no tasks
  - [x] Returns task with user relations (clerk, creator, reviewer, approver, canceler)
  - [x] Returns multiple tasks
  - [x] Null relations (no clerk/approver) handled correctly
  - [x] isLoading forwarded
  - [x] Works without taskId (all tasks)
  - [x] Works with specific taskId
  - [x] taskId passed as useLiveQuery dependency
  - [x] undefined passed as dependency when no taskId

- **fetchVendorSessionOptions**:
  - [x] Maps sessions to `{ label: user.name, value: id, data }`
  - [x] Label is empty string when user.name is null
  - [x] Returns empty array when no sessions
  - [x] Maps multiple sessions
  - [x] isLoading forwarded

- **fetchUserOptions**:
  - [x] Maps users to `{ label: name, value: id, data }`
  - [x] Returns empty array when no users
  - [x] Maps multiple users with correct order
  - [x] isLoading forwarded

**Demo**: All three hooks return correct shaped data with dependency tracking and edge cases handled ✅

---

### 🎯 Phase 3: Hooks, Utilities & Infrastructure (~250 statements, Weeks 3-4)

#### Task 9: Test Custom Hooks — Remaining ✅
- **Files**: `use-pos.ts`, `use-notifications.ts`
- **Test Files**: `use-pos.test.ts` ✅, `use-notifications.test.ts` ✅
- **Estimated Tests**: 12-15 test cases total
- **Actual Tests**: 31 (18 use-pos + 13 use-notifications)
- **Coverage Target**: 80%+

**Test Cases**:
- **use-pos** (`use-pos.test.ts`):
  - [x] Returns posProducts from fetchPosProducts
  - [x] Returns activeOrders from fetchActiveOrders
  - [x] Forwards totalItemsPosProducts
  - [x] isLoading true when products loading
  - [x] isLoading true when orders loading
  - [x] isLoading false when both complete
  - [x] orderItems empty while loading
  - [x] orderItems empty when no active orders
  - [x] Builds orderItems from active orders
  - [x] Correctly matches variant to product
  - [x] Excludes order matching current orderId
  - [x] Includes orders not matching orderId
  - [x] Empty when product not found
  - [x] Empty when variant not found
  - [x] Accumulates items from multiple orders
  - [x] Attaches matching addon component
  - [x] Empty addons when no matching component

- **use-notifications** (`use-notifications.test.ts`):
  - [x] unreadCount = 0 when no unread notifications
  - [x] unreadCount returns count from query
  - [x] unreadCount = 0 when query returns empty
  - [x] Forwards notifications from infiniteQuery.data
  - [x] Returns empty array when no notifications
  - [x] Exposes infiniteQuery for pagination
  - [x] markAsRead calls collection.update with id
  - [x] markAsRead returns { value, link } on success
  - [x] markAsRead returns null on error
  - [x] markAllRead calls update for each unread item
  - [x] markAllRead skips already-read notifications
  - [x] markAllRead does nothing when list is empty

- **form.tsx** — skipped: `createFormHook` wiring only; exercised by every component test

**Demo**: Hooks return correct derived state, mutations work, loading states combine correctly ✅

---

#### Task 10: Test Utility Functions — Crop Image ✅
- **File**: `src/lib/utils/crop-image.ts`
- **Test File**: `src/__tests__/unit/lib/utils/crop-image.test.ts` ✅
- **Estimated Tests**: 10-12 test cases
- **Actual Tests**: 18 test cases (9 browser + 9 Node)
- **Coverage Target**: 90%+

**Test Cases**:
- **Browser path**:
  - [x] Returns data URL from canvas.toDataURL
  - [x] Uses explicit pixelCrop (x, y, w, h) when provided
  - [x] Uses full image dimensions when no pixelCrop
  - [x] Auto-crops width for wider source (landscape vs square target)
  - [x] Auto-crops height for taller source (portrait vs square target)
  - [x] Sets canvas dimensions to targetWidth / targetHeight
  - [x] Passes custom format and quality to toDataURL
  - [x] Uses default format=image/webp and quality=0.9
  - [x] Throws when canvas.getContext returns null

- **Node/Jimp path**:
  - [x] Returns base64 string from Jimp.getBase64
  - [x] Calls Jimp.read with imageSrc
  - [x] Calls image.crop with pixelCrop coordinates
  - [x] Calls image.resize with targetWidth / targetHeight
  - [x] Auto-crops width for wider Jimp image
  - [x] Auto-crops height for taller Jimp image
  - [x] Uses image/jpeg mime for webp format (Jimp limitation)
  - [x] Uses image/jpeg for jpeg format
  - [x] Uses image/png when format is image/png

**Fix applied**: `Image` mock must use `vi.fn().mockImplementation(function() { return img })` — arrow functions are not constructors.

**Demo**: Image cropping produces correct canvas draw calls in browser and correct Jimp operations in Node ✅

---

#### Task 11: Test Database Transaction & Collection Edge Cases ✅
- **Files**: `collections.ts`, `local-db-transaction.ts` (enhanced), `local-auth.ts`
- **Test Files**: `collections.test.ts` ✅, `local-db-transaction.test.ts` ✅ (enhanced +7 tests), `local-auth.test.ts` ✅
- **Estimated Tests**: 12-15 test cases total
- **Actual Tests**: 55 (28 collections + 20 transaction + 7 local-auth)
- **Coverage Target**: 75%+

**Test Cases**:
- **collections.ts** (`collections.test.ts`):
  - [x] All 12 eager collections have correct apiKey and syncMode="eager"
  - [x] All 15 on-demand collections have correct apiKey and syncMode="on-demand"
  - [x] All collections use schemaVersion=10
  - [x] Exactly 27 collections registered

- **local-db-transaction.ts** (enhanced with 7 new tests):
  - [x] Offline: does NOT call transactionAPI.execute when navigator.onLine=false
  - [x] Offline: applies mutations locally and returns Ok
  - [x] Offline: update writes merged record via writeUpsert
  - [x] Offline: delete calls writeDelete with the record id
  - [x] Refetch fallback: calls refetch when writeInsert throws
  - [x] Refetch fallback: returns Err when writeInsert throws and no refetch available
  - [x] Concurrent: two concurrent transactions both complete successfully

- **local-auth.ts** (`local-auth.test.ts`):
  - [x] localAuthCollection is `{}` when window is absent (Node path)
  - [x] createCollection NOT called when window is absent
  - [x] createCollection called when window is present (browser path)
  - [x] persistedCollectionOptions called with id="localAuth"
  - [x] persistedCollectionOptions called with schemaVersion=1
  - [x] getKey function returns auth.id
  - [x] localAuthCollection is the return value of createCollection

**Demo**: All DB collection types verified for correct config; transactions handle offline, refetch fallback, and concurrency correctly ✅

---

#### Task 12: Test Notification Engine ✅
- **File**: `src/lib/notification/notification-engine.ts`
- **Test File**: `src/__tests__/unit/lib/notification/notification-engine.test.ts` ✅
- **Estimated Tests**: 12-15 test cases
- **Actual Tests**: 25 test cases
- **Coverage Target**: 90%+

**Test Cases**:
- **NotificationEngine.send**:
  - [x] Inserts one notification record per receiverId
  - [x] Sets correct userId on each notification
  - [x] Sets title, message, type, and link correctly
  - [x] Serialises metadata to JSON string
  - [x] Defaults metadata to `"{}"` when not provided
  - [x] Sets `isRead=false` and `priority=MEDIUM`
  - [x] Stamps `businessId` and `branchId` from authStore
  - [x] Handles empty receiverIds without inserting

- **NotificationEngine.checkLowStock**:
  - [x] Does nothing when variantIds is empty
  - [x] Does nothing when stock is above threshold
  - [x] Does nothing when no admin/supervisor members
  - [x] Ignores inventory batches with `quantity=0`
  - [x] Creates operational task when `stock <= variant.lowStockThreshold`
  - [x] Creates task when stock equals threshold exactly
  - [x] Falls back to `systemConfigs.LOW_STOCK_THRESHOLD` when variant has no threshold
  - [x] Sets `SHELF_REFILL` type and `PENDING` status on task
  - [x] Task metadata contains `variantId` and `currentTotal`
  - [x] Sums inventory across multiple batches for the same variant
  - [x] Sends notifications to ADMIN members only
  - [x] Sends notifications to SUPERVISOR members
  - [x] Does NOT send notifications to CASHIER members
  - [x] Notification title is "Low Stock Alert"
  - [x] Notification message contains product name and current total
  - [x] Handles missing product on variant gracefully
  - [x] Catches errors and does not throw to caller

**Fix applied**: `vi.mock` factory used async `importOriginal` to call `createMockCollections()` inline — avoids hoisting issue. Post-mock imports used for typed collection refs. Naming collision between local `inv` variable and `inv` collection alias resolved by renaming the local to `invRecord`.

**Demo**: Low stock breach creates a task and notifies the right people; no false positives above threshold ✅

---

### 🎯 Phase 4: Coverage Review & Gap Fill (Week 5)

#### Task 13: Full Coverage Review & Targeted Gap Fill ✅
- **Objective**: Run coverage report, assess actual vs target, document findings
- **Coverage Report Date**: 2026-07-24 (post Phase 1–3)
- **Coverage Target**: 75%+ statements

---

**Current Coverage (post Phase 1–4 + Tasks 14–15):**

| Metric | Start | Post Phase 1-3 | Current | Target (75%) |
|--------|-------|-----------------|---------|--------------|
| **Statements** | 13.59% (520/3826) | 25.48% (975/3826) | **34.08% (1308/3838)** | 75% (2878/3838) |
| **Branches** | 9.93% (239/2406) | 18.78% (452/2406) | **26.51% (639/2410)** | 75% |
| **Functions** | 9.28% (137/1476) | 17.75% (262/1476) | **26.04% (386/1482)** | 75% |
| **Lines** | 13.84% (467/3373) | 25.97% (876/3373) | **35.03% (1186/3385)** | 75% |

**Progress from route integration tests**: +8.6% statements (+333 statements) from Tasks 14 & 15 alone.
**Total progress**: +20.49% statements (+788 statements) from baseline.

---

**Why the 75% target cannot be reached with unit tests alone:**

The gap of ~1895 statements is almost entirely in `src/routes/**` (~2400 statements, 0-3% covered). These are React UI pages, forms, and dashboard components that require either:
- **E2E tests** (Playwright — already configured) for full page flows
- **Integration tests** with a real TanStack Router context

Unit testing UI routes individually would require mounting router contexts, mocking all server functions, and simulating navigation — yielding brittle tests with low ROI. The correct tool for route coverage is E2E.

**Unit-testable coverage by module (current state):**

| Module | Coverage | Notes |
|--------|----------|-------|
| `src/lib/costing` | **100%** ✅ | |
| `src/lib/conversion` | **~98%** ✅ | |
| `src/store` | **100%** ✅ | |
| `src/lib/utils` | **~98%** ✅ | |
| `src/lib/notification` | **~90%** ✅ | |
| `src/lib/queries` | **~67%** 🟡 | Some query files partially covered |
| `src/hooks` | **~65%** 🟡 | `use-in-view`, `use-sw` not covered |
| `src/db` | **~52%** 🟡 | `db/index.tsx` (OPFS init) untestable in jsdom |
| `src/routes/**` | **~2-3%** ⚠️ | UI pages — E2E territory |
| `src/lib/better-auth` | **~1-7%** ⚠️ | Server-only auth, not unit-testable |
| `src/lib/columns` | **~1%** ⚠️ | Column definitions — deferred per plan |
| `src/lib/server-fn` | **0%** ⚠️ | Deprecated — excluded per plan |

**Remaining quick-win unit-testable gaps:**

| File | Stmts | Notes |
|------|-------|-------|
| `src/hooks/use-in-view.ts` | ~12 | IntersectionObserver hook — mockable |
| `src/hooks/use-sw.ts` | ~18 | Service worker hook — mockable |
| `src/lib/overlay.tsx` | ~105 | Modal overlay system — testable with RTL |
| `src/lib/queries/fetch-tasks.ts` | ~15 uncovered | Needs deeper filter branch coverage |

These are lower priority — won't significantly move the overall % given route dominance.

**Recommendation for reaching 75%:**
Configure Playwright E2E coverage with `@vitest/coverage-v8` instrumentation (or Istanbul), which can instrument route pages during E2E runs and combine reports with unit coverage. The E2E suite is already set up in this project.

**Revised realistic unit test ceiling**: ~30-35% given the UI-heavy route structure.

**Intentionally excluded from unit test scope (documented):**
- `src/routes/**` — All UI route pages (Playwright E2E required)
- `src/lib/server-fn/**` — Deprecated
- `src/lib/better-auth/**` — External auth library integration
- `src/lib/columns/**` — Column definitions (deferred)
- `src/db/index.tsx` — OPFS database initialisation (jsdom-incompatible)

**Demo**: Coverage report generated, all gaps documented, business-critical logic (tax, inventory, transactions, notifications, POS flow) is at 85-100% coverage ✅

---

## Phase 5: Integration Tests (Route Pages) — Vitest Option A

**Goal**: Cover the `src/routes/**` pages using Vitest + RTL with a minimal in-memory test router. Since these tests run inside Vitest, the coverage is picked up automatically by `pnpm coverage` — no extra tooling needed.

**Router wrapper strategy**:
- Build a flat inline test router using `createRootRoute` + `createRoute` + `createMemoryHistory`
- Avoid importing `routeTree.gen.ts` (it triggers `getAuthUser()` server call in `__root.tsx`)
- Add as a shared helper: `src/__tests__/helpers/router-wrapper.tsx`

**Target routes (by statement yield):**

| Route | Est. Statements | Complexity |
|-------|-----------------|------------|
| `tasks/index.tsx` | ~250 | Low |
| `ingredients/index.tsx` | ~200 | Low |
| `orders/index.tsx` | ~230 | Medium |
| `products/index.tsx` | ~445 | High |
| `pos/index.tsx` | ~198 | High |

**Estimated coverage uplift**: +1100-1300 statements → ~54-59% total

---

#### Task 14: Router Test Wrapper + Tasks & Ingredients ✅
- **Files**: `tasks/index.tsx`, `ingredients/index.tsx`
- **Test Files**: `tasks.test.tsx` ✅ (11 tests), `ingredients.test.tsx` ✅ (8 tests)
- **Shared Helper**: `src/lib/__tests__/helpers/router-wrapper.tsx` ✅
- **Actual Tests**: 19 total
- **Coverage Added**: ~+250 statements

**Test Cases**:
- **tasks.test.tsx**:
  - [x] Renders "Operational Tasks" heading
  - [x] Renders Add Task button and description
  - [x] Renders task rows (type, status, creator, assignee)
  - [x] Shows "Unassigned" when no clerk
  - [x] Row index numbers (01, 02, 03)
  - [x] Multiple tasks rendered
  - [x] Add Task calls showModal
  - [x] FeatureDisabledPage when ENABLE_TASK=false

- **ingredients.test.tsx**:
  - [x] Renders "Ingredients" heading and description
  - [x] Renders ingredient names from data
  - [x] Multiple ingredients rendered
  - [x] Empty state when no ingredients
  - [x] Add Ingredient calls showModal
  - [x] Edit button calls showModal

**Infrastructure added**: `router-wrapper.tsx` — `buildRouter(component, path, search)` creates a minimal in-memory TanStack Router without the real routeTree.

**Demo**: Tasks and Ingredients pages render correctly with controlled data ✅

---

#### Task 15: Orders & Products Route Tests ✅
- **Files**: `orders/index.tsx`, `products/index.tsx`
- **Test Files**: `orders.test.tsx` ✅ (8 tests), `products.test.tsx` ✅ (13 tests)
- **Actual Tests**: 21 total
- **Coverage Added**: ~+330 statements

**Test Cases**:
- **orders.test.tsx**:
  - [x] Renders "Active Orders" heading
  - [x] Order count badge (0, 3 running)
  - [x] Renders `Order #XXXXXX` card title
  - [x] Renders customer reference on card
  - [x] Multiple order cards
  - [x] Empty count when no orders
  - [x] FeatureDisabledPage when ENABLE_ORDER=false

- **products.test.tsx**:
  - [x] Renders "Products" heading, description, search input
  - [x] Add Product button
  - [x] Product name in table row
  - [x] Category in table row
  - [x] Multiple product rows
  - [x] No rows when empty (heading still shows)
  - [x] Grid view: product card name and price
  - [x] Grid view: availability badge (InventoryEngine mocked)
  - [x] Add Product calls showModal
  - [x] Loading state renders without crash

**Fix notes**:
- Products uses `Route.useNavigate()` — fixed by mocking `useNavigate` via `importOriginal` router mock and registering route at its full path `'/(private)/(dashboard)/(admin)/products/'`
- Orders JSX `{orders.length} Running` — asserted via `.textContent` check instead of exact text match

**Demo**: Orders and Products pages render correctly in both table and grid views ✅

---

### Task 16: POS Route Integration Test

#### Task 16: POS Page Integration
- **File**: `pos/index.tsx`
- **Test File**: `src/__tests__/unit/routes/pos-page.test.tsx` (to be created)
- **Estimated Tests**: 8-10
- **Coverage Target**: +198 statements

**Test Cases**:
- [ ] Renders POS layout (CartAside + ProductItems)
- [ ] Renders mobile layout with ThemeToggle when isMobile
- [ ] Shows Loading when orderId and data is fetching
- [ ] Calls showModal(OpenSessionDialog) when session not open
- [ ] Calls showModal(AlertPrompt) when shift unverified

**Demo**: POS page renders and responds to session state correctly ✅

### Achieved (post Phase 1–3 unit tests)
- `lib/costing`: **100%** ✅
- `lib/conversion`: **~98%** ✅
- `store`: **100%** ✅
- `lib/utils`: **~98%** ✅
- `lib/notification`: **~90%** ✅
- `pos/-components` (key files): **88-100%** ✅
- **Overall unit test ceiling**: **~25-30%** (route pages dominate remaining gap)

### Post Phase 2 (Query Functions) — Achieved
- `lib/queries`: **~67%** (queries using useLiveQuery are hook-tested)

### Post Phase 3 (Hooks, Utils, Infrastructure) — Achieved
- `hooks`: **~65%**
- `db`: **~52%** (`db/index.tsx` OPFS init not coverable in jsdom)

### Realistic Unit Test Target
- **~30-35% overall** — practical ceiling for unit tests in this codebase
- **75% requires E2E** — Playwright coverage instrumentation needed for route pages

---

## Critical Module Targets (Post Completion)

| Module | Target Coverage |
|--------|----------------|
| `lib/conversion/tax-engine.ts` | 100% (BIR compliance) ✅ |
| `lib/costing/` | 100% (financial accuracy) ✅ |
| `lib/queries/create-pos-transaction.ts` | 95%+ (revenue critical) ✅ |
| `lib/conversion/inventory-engine.ts` | 95%+ (stock accuracy) ✅ |
| `lib/queries/create-pos-refund.ts` | 95%+ (financial reversal) |
| `pos/-components/` | 85%+ (user-facing critical path) |
| `lib/notification/` | 90%+ (operational alerts) |
| `db/` | 75%+ (data integrity) |

---

## Test Organization

> All test files are centralised in `src/__tests__/unit/` mirroring the source tree.
> Run with `pnpm test` (vitest scans `src/__tests__/**/*.{test,spec}.{ts,tsx}`).

```
src/
└── __tests__/
    └── unit/
        ├── setup-check.test.ts               ✅ DONE
        ├── db/
        │   ├── local-db-transaction.test.ts  ✅ DONE (enhanced Task 11)
        │   ├── collections.test.ts           ✅ DONE (Task 11)
        │   └── local-auth.test.ts            ✅ DONE (Task 11)
        ├── hooks/
        │   ├── use-mobile.test.ts            ✅ DONE
        │   ├── use-is-online.test.ts         ✅ DONE
        │   ├── use-pos.test.ts               ✅ DONE (Task 9)
        │   ├── use-notifications.test.ts     ✅ DONE (Task 9)
        │   └── form.test.tsx                 ⚠️ SKIPPED (Task 9 — wiring only; covered by component tests)
        ├── lib/
        │   ├── utils.test.ts                 ✅ DONE
        │   ├── conversion/
        │   │   ├── tax-engine.test.ts        ✅ DONE
        │   │   ├── inventory-engine.test.ts  ✅ DONE
        │   │   ├── price-engine.test.ts      ✅ DONE
        │   │   └── unit-engine.test.ts       🔄 TODO
        │   ├── costing/
        │   │   └── costing-engine.test.ts    ✅ DONE
        │   ├── queries/
        │   │   ├── create-pos-transaction.test.ts       ✅ DONE
        │   │   ├── create-pos-order.test.ts             ✅ DONE
        │   │   ├── create-pos-refund.test.ts            ✅ DONE (Task 6)
        │   │   ├── fetch-pos-products.test.ts           ✅ DONE (Task 5)
        │   │   ├── fetch-active-orders.test.ts          ✅ DONE (Task 5)
        │   │   ├── fetch-ingredients.test.ts            ✅ DONE (Task 5)
        │   │   ├── fetch-structured-id.test.ts          ✅ DONE (Task 7)
        │   │   ├── fetch-options.test.ts                ✅ DONE (Task 6)
        │   │   ├── fetch-tasks-and-sessions.test.ts     ✅ DONE (Task 8)
        │   │   └── restock-ingredient.test.ts           ✅ DONE
        │   ├── notification/
        │   │   └── notification-engine.test.ts  ✅ DONE (Task 12)
        │   └── utils/
        │       ├── download-csv.test.ts      ✅ DONE
        │       └── crop-image.test.ts        ✅ DONE (Task 10)
        ├── store/
        │   └── auth-store.test.ts            ✅ DONE
        └── routes/
            └── pos/
                ├── payment-dialog.test.tsx   ✅ DONE (Task 1)
                ├── cart-aside.test.tsx       ✅ DONE (Task 2)
                ├── product-card.test.tsx     ✅ DONE (Task 3)
                ├── header.test.tsx           ✅ DONE (Task 4)
                ├── active-orders-btn.test.tsx    ✅ DONE (Task 4)
                ├── product-items.test.tsx    ⚠️ SKIPPED (Task 4 — deep withForm/MultiView deps)
                └── receipt-ticket.test.tsx   ⚠️ SKIPPED (Task 4 — @react-pdf/renderer not jsdom-compatible)
```

---

## Test Data Strategy

### Mock Data Requirements
1. **Products**: Various types (goods, services, bundles) with variants and components
2. **Inventory**: Multiple batches with different cost prices and quantities
3. **Users**: Different roles (Admin, Supervisor, Cashier)
4. **Business/Branch**: Multi-tenant scenarios
5. **Orders**: Various states and order types
6. **Transactions**: Multiple payment methods and tax categories

### Existing Test Infrastructure ✅
- `@faker-js/faker` for generating realistic test data
- Factory pattern in `src/lib/__tests__/helpers/factories.ts`
- Mock collections in `src/lib/__tests__/helpers/mock-collections.ts`
- Mock user setup in `src/lib/__tests__/helpers/mock-user.ts`
- Synchronous `dbTransaction` wrapper for testing

---

## Success Metrics

### Phase Completion Criteria
- ✅ **Phase 1 Complete**: POS components at 85-100% coverage
- ✅ **Phase 2 Complete**: Query functions at ~67% coverage (hook-based queries tested via renderHook)
- ✅ **Phase 3 Complete**: Hooks/utils/db/notification well-covered
- ✅ **Phase 4 Complete**: Coverage reviewed, gaps documented, business-critical logic at 85-100%
- ⚠️ **75% overall target**: Requires Playwright E2E coverage instrumentation for route pages

### Quality Gates
- Zero high-severity bugs in production
- All critical paths (tax, inventory, transactions) maintain 90%+ coverage
- BIR compliance verified through tests
- No regressions in existing 100% coverage modules

---

## Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage report
pnpm test:coverage

# Run specific test file
pnpm test src/lib/queries/create-pos-transaction.test.ts

# Run tests matching a pattern
pnpm test -t "payment dialog"
```

---

## Notes

1. **Offline-First**: Ensure tests cover both online and offline scenarios
2. **Multi-Tenant**: Test data isolation between businesses/branches
3. **Compliance**: Tax engine tests must align with BIR regulations
4. **Performance**: Consider performance tests for large inventory operations
5. **Real-Time**: Test notification system and order updates

---

## Next Steps

1. ✅ Review and approve this plan
2. ✅ Execute Phase 1 (Tasks 1-4): POS Components — **COMPLETE** (364 tests, 20 files)
   - Task 1 ✅ `payment-dialog.test.tsx` — 27 tests
   - Task 2 ✅ `cart-aside.test.tsx` — 34 tests
   - Task 3 ✅ `product-card.test.tsx` — 28 tests
   - Task 4 ✅ `header.test.tsx` (7) + `active-orders-btn.test.tsx` (11) — 18 tests
   - ⚠️ `product-items.tsx` — skipped: deep `withForm`/`MultiView`/column dependencies; logic covered via ProductCard + CartAside tests
   - ⚠️ `receipt-ticket.tsx` — skipped: `@react-pdf/renderer` produces PDF tree, not DOM; not compatible with jsdom/RTL; requires E2E or PDF snapshot approach
3. 🔄 Execute Phase 2 (Tasks 5-8): Query Functions — **COMPLETE** ✅ (Tasks 5 ✅, 6 ✅, 7 ✅, 8 ✅)
4. 🔄 Execute Phase 3 (Tasks 9-12): Hooks, Utils, Infrastructure — **COMPLETE** ✅ (Tasks 9 ✅, 10 ✅, 11 ✅, 12 ✅)
5. 🔄 Execute Phase 4 (Task 13): Coverage review and gap fill — **COMPLETE**
   - Unit test coverage ceiling: ~25-35% (UI routes dominate the gap)
   - Business-critical logic (tax, inventory, POS, notifications): 85-100%
   - Path to 75%: requires Playwright E2E coverage instrumentation
6. 🔄 Execute Phase 5 (Tasks 14-16): Vitest integration tests for route pages — **IN PROGRESS** (Tasks 14 ✅, 15 ✅)
   - Task 14 ✅: `router-wrapper.tsx` + tasks + ingredients (19 tests, +250 stmts)
   - Task 15 ✅: orders + products (21 tests, +330 stmts)
   - Task 16 🔄: POS page integration test (pending)
6. 🔄 Configure CI/CD pipeline for automated test execution
