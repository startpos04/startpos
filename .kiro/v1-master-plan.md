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

- [x] **Fix zero order items bug** — `create-pos-transaction.ts` loop was iterating an empty `items[]` instead of `data.items`. Fixed to `for (const item of data.items)` with push pattern.
- [x] **Product variants — create & edit UI** — Variants section added to `-create-product.tsx` between Inventory and Recipe. Add/remove rows with name, SKU suffix, and price per variant.
- [x] **Save product snapshot to transaction** — `unitPrice` and `unitCost` frozen from `variant.price` / `variant.costPrice` at insert time. Working now that the items loop is fixed.
- [x] **Lock cart when payment is processing** — `isProcessing` ref added to `cart-aside.tsx`. CHECKOUT button disabled during async payment handling; try/finally ensures flag always resets.
- [x] **Category & unit management** — Settings tables now have full create (Dialog form) and soft-delete (WarningPrompt → `deletedAt`) for both categories and units.

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
