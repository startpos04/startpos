# StartPOS — V1 Master Plan

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

---

## V1 IN — Must Ship

### Core POS & Order Lifecycle

- [ ] **Product variants — create & edit** — schema exists (`ProductVariant`, `productVariantCollection`); forms need to be wired up. Blocks selling products with sizes/options.
- [ ] **Save product snapshot to transaction details** — freeze product name/price/sku into the order item at checkout so historical records don't drift when products are edited later.
- [ ] **Lock cart when payment is processing** — one UI guard on the checkout button to prevent double-submission.
- [ ] **Category & unit management** — confirm settings routes (`-categories`, `-units`) are fully wired to create/edit/delete, not just stubs.

### Compliance & Tax

- [ ] **Finalize VAT/SKU on receipt** — complete the remaining receipt line-item breakdown. PH BIR compliance is a launch blocker.
- [ ] **Feature flag for receipt** — `ENABLE_PRINT_RECEIPT` is already in `ConfigKey`; hook the receipt print action to this flag.

### Infrastructure

- [ ] **Fix transactional rollback (P2003)** — broken foreign-key constraint during rollback leaves data in a half-state. Must be resolved before launch.
- [ ] **Composite DB index on Transactions** — add `@@index([businessId, branchId, createdAt])` to the Transactions table for report query performance.

### UX Foundations

- [ ] **Loading states** — end-shift and payment flows need spinners/skeletons to prevent double-clicks.
- [ ] **Barcode scanner input capture** — auto-focus the POS search input on mount so a physical scanner's keypress stream lands in the right field.
- [ ] **Print stylesheet for thermal receipts** — `@media print` CSS for 58mm/80mm paper; no external dependency needed.

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
