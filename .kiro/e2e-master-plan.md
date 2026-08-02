# StartPOS — E2E Test Master Plan (Playwright)

## Overview

End-to-end tests using **Playwright + Chromium** against a live dev server. These tests cover
what Vitest unit/integration tests cannot: real browser interactions, form flows, multi-step
workflows, and the full POS checkout journey from product selection to receipt.

**Stack**: `@playwright/test` (already installed)
**Test dir**: `./__tests__/e2e/` (co-located with unit tests under `__tests__/`)
**Base URL**: `http://localhost:3000`
**CI**: `.github/workflows/playwright.yml` already wired
**Config**: `playwright.config.ts` → `testDir: './__tests__/e2e'`
**Vitest**: `vitest.config.ts` excludes `__tests__/e2e/**`

---

## Directory Structure

```
__tests__/
├── helpers/                        # Shared helpers for unit tests
├── unit/                           # Vitest unit/integration tests
└── e2e/
    ├── fixtures/
    │   ├── auth.fixture.ts         # Login helper, saved auth state per role
    │   └── seed.fixture.ts         # DB seed/teardown helpers
    ├── pages/                      # Page Object Models
    │   ├── login.page.ts
    │   ├── pos.page.ts
    │   ├── orders.page.ts
    │   ├── products.page.ts
    │   ├── ingredients.page.ts
    │   ├── employees.page.ts
    │   └── settings.page.ts
    ├── pages/                      # Page Object Models
    │   ├── login.page.ts
    │   ├── pos.page.ts
    │   ├── orders.page.ts
    │   ├── products.page.ts
    │   ├── ingredients.page.ts
    │   ├── employees.page.ts
    │   ├── settings.page.ts
    │   ├── register.page.ts            # Registration + onboarding flow
    │   └── billing.page.ts             # Billing, credits, subscription pages
    ├── specs/
    │   ├── 01-auth.spec.ts              # Authentication
    │   ├── 02-authorization.spec.ts     # Route guards & role access control
    │   ├── 03-feature-flags.spec.ts     # ENABLE_* system config flags
    │   ├── 04-pos-checkout.spec.ts      # Core POS revenue path
    │   ├── 05-pos-orders.spec.ts        # Order lifecycle & session management
    │   ├── 06-products.spec.ts          # Product CRUD + forms
    │   ├── 07-ingredients.spec.ts       # Ingredient CRUD + restock forms
    │   ├── 08-employees.spec.ts         # Employee CRUD + forms
    │   ├── 09-settings.spec.ts          # Categories, units CRUD
    │   ├── 10-reports.spec.ts           # Reports smoke tests
    │   ├── 11-offline-online.spec.ts    # Offline login, transactions, sync
    │   ├── 12-operational-blockers.spec.ts # Session, orders, tasks, notifications
    │   ├── 13-registration.spec.ts      # Registration + onboarding journey
    │   └── 14-billing.spec.ts           # Subscription + credits + billing journey
    └── global-setup.ts                 # One-time seed + auth state generation
```

---

## Auth Contexts

Three saved `storageState` files generated once in `global-setup.ts`:

| File | Role | Landing page | Access |
|------|------|-------------|--------|
| `admin.json` | ADMIN | `/employees` | Full access |
| `supervisor.json` | SUPERVISOR | `/sales-reports` | Reports + POS + Settings |
| `cashier.json` | CASHIER | `/pos` | POS + Tasks only |

Each spec imports the appropriate context via `use: { storageState: 'admin.json' }`.

---

## On Testing Forms

**Selective, not blanket.** The rule:

| Form | Coverage level | Reason |
|------|---------------|--------|
| POS payment dialog | Full — happy path + validation + edge cases | Revenue-critical, financial amounts |
| Product create/edit | Happy path + duplicate SKU + missing required field | SKU uniqueness hits the DB |
| Ingredient restock | Happy path + zero quantity validation | Inventory integrity |
| Employee create | Happy path + duplicate email only | Validation unit-tested |
| Category / Unit create | Happy path only | Pure CRUD |
| Settings (locations, suppliers) | Happy path only | Supporting data |

Field-level validation is already 100% covered by Zod unit tests. E2E budget is for multi-step
flows that cross page boundaries — not for testing that a required field goes red.

---

## Seed Requirements

Before any suite runs the DB must have:
- 1 admin, 1 supervisor, 1 cashier user (with known credentials)
- 1 open vendor session (for the admin user)
- 3+ products with stock (including 1 with recipe ingredients and 1 with add-ons)
- 2+ ingredients with inventory batches
- 1 active supplier, 1 location, 1 category, 1 unit
- 2+ active orders in various states

---

## Suite 01 — Authentication

**File**: `__tests__/e2e/specs/01-auth.spec.ts`

### Critical
| # | Test | Expected |
|---|------|----------|
| C1 | Valid admin credentials → redirected to `/employees` | `RoleLandingPages[ADMIN]` |
| C2 | Valid cashier credentials → redirected to `/pos` | `RoleLandingPages[CASHIER]` |
| C3 | Valid supervisor credentials → redirected to `/sales-reports` | `RoleLandingPages[SUPERVISOR]` |
| C4 | Wrong password → error message shown | "Invalid credentials" visible |
| C5 | Unauthenticated access to `/products` → redirected to `/login` | Private route guard |

### Normal
| # | Test | Expected |
|---|------|----------|
| N1 | Empty email → field validation fires | Error shown, no network call |
| N2 | Empty password → field validation fires | Error shown |
| N3 | Session persists on page reload | Still logged in |
| N4 | Logout clears session → redirect to `/login` | Private routes inaccessible |
| N5 | Logged-in user visits `/login` → redirected to landing page | `(public)/route.tsx` guard |

### Edge Cases
| # | Test | Expected |
|---|------|----------|
| E1 | Whitespace-only email → blocked, no server call | Validation fires |
| E2 | SQL injection string in email | Normal rejection, no crash |

---

## Suite 02 — Authorization (Route Guards & Role Access)

**File**: `__tests__/e2e/specs/02-authorization.spec.ts`

This suite uses multiple auth contexts in the same spec file.

### Critical — Admin route guard
| # | Test | Auth | Expected |
|---|------|------|----------|
| C1 | Cashier navigates to `/products` directly (URL bar) | cashier | Redirected to `/login` |
| C2 | Cashier navigates to `/employees` directly | cashier | Redirected to `/login` |
| C3 | Cashier navigates to `/ingredients` directly | cashier | Redirected to `/login` |
| C4 | Supervisor navigates to `/products` directly | supervisor | Redirected to `/login` |
| C5 | Admin accesses all admin routes | admin | Renders normally, no redirect |

### Critical — Supervisor route guard
| # | Test | Auth | Expected |
|---|------|------|----------|
| C6 | Cashier navigates to `/sales-reports` directly | cashier | Redirected to `/login` |
| C7 | Cashier navigates to `/inventory-reports` directly | cashier | Redirected to `/login` |
| C8 | Cashier navigates to `/settings` directly | cashier | Redirected to `/login` |
| C9 | Supervisor accesses `/sales-reports` and `/inventory-reports` | supervisor | Renders normally |
| C10 | Admin accesses `/sales-reports` and `/settings` | admin | Renders normally |

### Critical — Unauthenticated access
| # | Test | Auth | Expected |
|---|------|------|----------|
| C11 | No session, direct to `/pos` | none | Redirected to `/login` |
| C12 | No session, direct to `/orders` | none | Redirected to `/login` |
| C13 | No session, direct to `/sales-reports` | none | Redirected to `/login` |

### Normal — Sidebar visibility per role
| # | Test | Auth | Expected |
|---|------|------|----------|
| N1 | Cashier sees only Tasks + POS in sidebar | cashier | Admin/Supervisor nav groups hidden |
| N2 | Supervisor sees Supervisor + Tasks + POS + Settings | supervisor | Admin group hidden |
| N3 | Admin sees all groups | admin | All nav groups visible |

### Known Gap — now fixed
The `(supervisor)/route.tsx` and `settings/route.tsx` guards have been added. Direct URL access
by cashiers to `/sales-reports`, `/inventory-reports`, and `/settings` now throws `redirect('/login')`
at the router level, matching the behaviour of the admin guard.

---

## Suite 03 — Feature Flags (System Config ENABLE_*)

**File**: `__tests__/e2e/specs/03-feature-flags.spec.ts`

Each test requires a seeded business config with the flag set to the tested value.
Use a dedicated seed fixture that overrides system configs for this suite.

| Flag | Where consumed |
|------|----------------|
| `ENABLE_ORDER` | `/orders` renders `FeatureDisabledPage`; `ActiveOrdersButton` hidden in POS mobile header |
| `ENABLE_TASK` | `/tasks` renders `FeatureDisabledPage`; Tasks hidden from sidebar |
| `ENABLE_PRINT_RECEIPT` | Auto-print skipped after transaction |
| `ENABLE_ORDER_TAB` | Kitchen slip page appended to receipt PDF; order routing field on receipt |
| `ENABLE_CASH_RECONCILIATION` | Reconciliation flow available on shift end |

### Critical
| # | Flag | Value | Test | Expected |
|---|------|-------|------|----------|
| C1 | `ENABLE_ORDER` | `false` | Navigate to `/orders` | `FeatureDisabledPage` rendered |
| C2 | `ENABLE_ORDER` | `true` | Navigate to `/orders` | Order list rendered |
| C3 | `ENABLE_TASK` | `false` | Navigate to `/tasks` | `FeatureDisabledPage` rendered |
| C4 | `ENABLE_TASK` | `true` | Navigate to `/tasks` | Task list rendered |
| C5 | `ENABLE_TASK` | `false` | Check sidebar | Tasks item absent |
| C6 | `ENABLE_TASK` | `true` | Check sidebar | Tasks item present |

### Normal
| # | Flag | Value | Test | Expected |
|---|------|-------|------|----------|
| N1 | `ENABLE_ORDER` | `false` | POS mobile header | `ActiveOrdersButton` absent |
| N2 | `ENABLE_ORDER` | `true` | POS mobile header | `ActiveOrdersButton` present |
| N3 | `ENABLE_PRINT_RECEIPT` | `false` | Complete a transaction | No print dialog; success prompt shown |
| N4 | `ENABLE_PRINT_RECEIPT` | `true` | Complete a transaction | Print dialog or print-js triggered |
| N5 | `ENABLE_ORDER_TAB` | `true` | Receipt includes routing field | "Routing" row visible on receipt |

---

## Suite 04 — POS Checkout (Core Revenue Path)

**File**: `__tests__/e2e/specs/04-pos-checkout.spec.ts`
**Auth**: `cashier.json`

### Critical
| # | Test | Expected |
|---|------|----------|
| C1 | Add product to cart → item appears with correct price | Cart badge +1, line total correct |
| C2 | Cash payment ≥ total → transaction saved, cart clears | Success prompt shown |
| C3 | Inventory stock decrements after sale | Stock lower in detail sidebar |
| C4 | Order items written — visible in Orders page | Order with correct items |
| C5 | VAT breakdown shown in payment dialog | Vatable sales + VAT amount lines |
| C6 | Stock limit hit → `+` button disabled | Cannot exceed available yield |
| C7 | Tendered < total → CONFIRM PAYMENT disabled | Button inactive |
| C8 | Double-click CHECKOUT → single transaction only | Processing lock works |

### Normal — Cart
| # | Test | Expected |
|---|------|----------|
| N1 | Add multiple products | All in cart, total is sum |
| N2 | Quantity `+` → line total updates | Price × qty |
| N3 | Quantity `−` at qty 1 → item removed | Item gone |
| N4 | Customer reference → saved on transaction | Visible on order card |
| N5 | NEW ORDER → cart empties | Fresh state |

### Normal — Payment
| # | Test | Expected |
|---|------|----------|
| N6 | Split cash + card → CONFIRM enabled when sum ≥ total | Both lines present |
| N7 | Overpayment → change due shown | Correct change amount |

### Normal — Products
| # | Test | Expected |
|---|------|----------|
| N8 | Search by name → filtered | Matching products only |
| N9 | Search by SKU → found | Partial match works |
| N10 | Variant selection → price updates | Correct variant price |
| N11 | Add add-on → sub-line in cart | Add-on + price, total includes it |
| N12 | Remove add-on → total adjusts | Add-on line gone |

### Edge Cases
| # | Test | Expected |
|---|------|----------|
| E1 | ₱0.00 product → checkout succeeds | No crash |
| E2 | 20+ items in cart → totals correct | No overflow |
| E3 | SC/PWD discount → discount line, VAT recalculated | Compliance fields populated |
| E4 | Product with no recipe → checkout succeeds | No stock error |
| E5 | Double-click CHECKOUT → only one transaction | Lock prevents duplicate |

---

## Suite 05 — POS Order Management

**File**: `__tests__/e2e/specs/05-pos-orders.spec.ts`
**Auth**: `cashier.json`

### Critical
| # | Test | Expected |
|---|------|----------|
| C1 | Pay Later saves order without payment | Appears in active orders |
| C2 | Load existing order → items pre-populated | Cart matches order |
| C3 | Pay Now on existing order → removed from active list | Transaction created |
| C4 | Session not open → `OpenSessionDialog` shown | Cannot use POS |
| C5 | End shift (reconcile later) → session CLOSED | Shift ended |

### Normal
| # | Test | Expected |
|---|------|----------|
| N1 | Active orders badge shows correct count | Matches order count |
| N2 | Cancel order → removed from active list | Gone |
| N3 | Reconcile now with cash count → shift ends | Variance task created if non-zero |

### Edge Cases
| # | Test | Expected |
|---|------|----------|
| E1 | Load order with deleted product → no crash | Missing product skipped |

---

## Suite 06 — Products

**File**: `__tests__/e2e/specs/06-products.spec.ts`
**Auth**: `admin.json`

### Critical
| # | Test | Expected |
|---|------|----------|
| C1 | Create product (happy path) → in list | Name visible |
| C2 | Create product with duplicate SKU → blocked | "SKU already in use" |
| C3 | Create product with empty name → blocked | Required field error |
| C4 | Edit product name → persisted | Updated name in list |
| C5 | Delete product → removed from list | Soft-deleted |

### Normal
| # | Test | Expected |
|---|------|----------|
| N1 | Create with recipe ingredients → visible in Recipe tab | Ingredient names shown |
| N2 | Create with add-ons → visible in detail sidebar | Add-on names shown |
| N3 | Create with multiple variants → Variants tab shows rows | All variant names and prices |
| N4 | Edit — replace ingredient | Old gone, new present |
| N5 | Restock ingredient from Recipe tab | Restock sidebar opens |
| N6 | Grid view → product cards | Cards render |

### Edge Cases
| # | Test | Expected |
|---|------|----------|
| E1 | Create without category → blocked | Required field |
| E2 | Create without base unit → blocked | Required field |

---

## Suite 07 — Ingredients

**File**: `__tests__/e2e/specs/07-ingredients.spec.ts`
**Auth**: `admin.json`

### Critical
| # | Test | Expected |
|---|------|----------|
| C1 | Create ingredient → in list | Name visible |
| C2 | Restock (happy path) → stock increases | Updated count in info strip |
| C3 | Restock with quantity 0 → blocked | Validation error |
| C4 | Edit name → persisted | Updated name |

### Normal
| # | Test | Expected |
|---|------|----------|
| N1 | Restock with supplier + location → purchase record | Visible in inventory reports |
| N2 | Restock with expiry date → batch shows expiry | Date in Batches tab |
| N3 | Recipes tab → host products listed | Correct product names |
| N4 | Low stock badge shown when below threshold | Orange badge visible |

### Edge Cases
| # | Test | Expected |
|---|------|----------|
| E1 | Restock with negative cost → blocked | Validation error |

---

## Suite 08 — Employees

**File**: `__tests__/e2e/specs/08-employees.spec.ts`
**Auth**: `admin.json`

### Critical
| # | Test | Expected |
|---|------|----------|
| C1 | Create employee (happy path) → in list | Name + role |
| C2 | Create with duplicate email → blocked | "Email already in use" |
| C3 | Edit role → persisted | Role badge updated |
| C4 | Disable employee → "Disabled" badge in sidebar | Badge present |

### Normal
| # | Test | Expected |
|---|------|----------|
| N1 | Detail sidebar shows email, join date | Fields populated |
| N2 | Revoke sessions → success toast | Message shown |

### Edge Cases
| # | Test | Expected |
|---|------|----------|
| E1 | Create without selecting role → blocked | Required |

---

## Suite 09 — Settings

**File**: `__tests__/e2e/specs/09-settings.spec.ts`
**Auth**: `admin.json`

### Critical
| # | Test | Expected |
|---|------|----------|
| C1 | Create category → in list | Name visible |
| C2 | Delete category → removed | Gone after confirm |
| C3 | Create unit (all fields) → in list | Name, abbreviation, type |
| C4 | Delete unit → removed | Gone |

### Normal
| # | Test | Expected |
|---|------|----------|
| N1 | Enter key creates category | Same as clicking Add |
| N2 | Cancel dialog → nothing created | List unchanged |
| N3 | `isBaseUnit=true` → "Base Unit" badge | Correct style |

---

## Suite 10 — Reports (Smoke)

**File**: `__tests__/e2e/specs/10-reports.spec.ts`
**Auth**: `supervisor.json`

| # | Test | Expected |
|---|------|----------|
| N1 | Sales reports page loads | Heading visible, no crash |
| N2 | Date range filter → re-renders | Updated content |
| N3 | Inventory reports page loads | Heading visible |
| N4 | Export CSV → download triggered | File download event |

---

## Suite 11 — Offline & Online Scenarios

**File**: `__tests__/e2e/specs/11-offline-online.spec.ts`
**Auth**: `cashier.json` (login tests use no pre-auth state)

Playwright's `page.context().setOffline(true/false)` cuts all network at the browser level.
This matches how `useIsOnline` works — it first checks `navigator.onLine`, then confirms with
a real `HEAD /favicon.ico?t=<timestamp>` fetch. Setting the context offline makes both checks
fail, so no extra mocking is needed.

### How the app branches online vs offline

| Layer | Online | Offline |
|-------|--------|---------|
| Login | `loginOnline` — fetches server, caches hashed password in `localAuthCollection` (SQLite) | `loginOffline` — verifies SHA-256 hash + `expiresAt` against cached record |
| Login page description | Normal text | "Offline Mode: Use your last known credentials." |
| Private route guard | Server user + `syncServerToLocal` | Falls back to `authStore.state.user` from last sync |
| `dbTransaction` | POSTs to `transactionAPI`, syncs server results to collections | Applies mutations locally only, skips server call |
| Feature auth (`authorizeFeature`) | Server check | Uses `profile.localOverrides` from cached supervisor credentials |

### Playwright network control pattern

```ts
test.beforeEach(async ({ page }) => {
  await page.context().setOffline(false) // start online
})
test.afterEach(async ({ page }) => {
  await page.context().setOffline(false) // always restore
})
```

### Critical — Offline Login

| # | Test | Setup | Expected |
|---|------|-------|----------|
| C1 | Login with correct cached credentials while offline | Log in once online (caches password); go offline; log out; log back in | Login succeeds, lands on landing page |
| C2 | Login with wrong password while offline | Go offline; enter wrong password for a cached user | "Invalid credentials" shown, no server call |
| C3 | Login with never-cached user while offline | Fresh browser, no prior login; go offline | Login fails — no cached record to verify |
| C4 | Offline login shows "Offline Mode" description | Go offline; visit `/login` | Offline mode text visible in form |
| C5 | Expired cached credentials while offline | Log in online; manually advance `expiresAt` to past; go offline | Login rejected with expiry-related error |

### Critical — Offline Transactions

| # | Test | Setup | Expected |
|---|------|-------|----------|
| C6 | Complete POS sale while offline | Log in online; go offline; add product; checkout | Success prompt shown; transaction written locally |
| C7 | Offline sale visible immediately in Orders | After C6, navigate to `/orders` in same session | Order card visible without server round-trip |
| C8 | Reconnect after offline sale → no data loss | After C6; go back online; reload page | Transaction still present, not duplicated |
| C9 | Restock ingredient while offline | Log in online; go offline; restock ingredient | Stock count updates locally; success toast shown |

### Critical — Session & Navigation Offline

| # | Test | Setup | Expected |
|---|------|-------|----------|
| C10 | Authenticated user goes offline → can still navigate | Log in online; go offline; navigate between POS and Orders | Pages load from local state, no redirect to login |
| C11 | No cached session, visit private route while offline | Fresh browser; go offline; visit `/pos` directly | Redirected to `/login` |

### Normal — UX Feedback

| # | Test | Setup | Expected |
|---|------|-------|----------|
| N1 | Login description changes when offline | Load `/login` online; go offline; observe description | Offline mode text appears |
| N2 | Reconnect after offline work → sync runs | Log in; go offline; perform write; come back online; reload | Data consistent, `syncServerToLocal` ran |
| N3 | Server-only action while offline (e.g. CSV export) | Go offline; trigger CSV download on reports page | Graceful error or disabled state, no crash |

### Edge Cases

| # | Test | Setup | Expected |
|---|------|-------|----------|
| E1 | Go offline mid-checkout (after opening payment dialog) | Open payment dialog; go offline; complete payment | Offline transaction path used; success shown |
| E2 | Rapidly toggle offline → online → offline | Go offline → online → offline in quick succession | No auth loop, no crash, state settles |
| E3 | Offline sale for ingredient-based product → local inventory decremented | Go offline; sell product with recipe | Local stock count reduced |
| E4 | Supervisor feature auth offline with cached override | Log in as cashier; also log in as supervisor once (caches override); go offline; trigger supervisor action | `authorizeFeature` uses `localOverrides`; succeeds |
| E5 | Supervisor feature auth offline without cached override | Fresh session, no supervisor ever logged in; go offline; trigger supervisor action | Auth fails cleanly with a prompt |

---

## Suite 12 — Operational Blockers Audit

**File**: `__tests__/e2e/specs/12-operational-blockers.spec.ts`

These tests specifically target the flows a user would hit in their first operational hour.
A failure here means the business cannot process sales, close a shift, or track compliance.

### Critical — Vendor Session Lifecycle

| # | Test | Auth | Expected |
|---|------|------|----------|
| C1 | Open session with valid opening cash → POS accessible | cashier | POS loads, no `OpenSessionDialog` on next visit |
| C2 | Open session with negative opening cash → blocked | cashier | Validation error on field |
| C3 | Try to open second session while one is open → blocked | cashier | "You have an existing open session" error |
| C4 | Close session (Reconcile Later) → session CLOSED, task created | cashier | Session ends, `COMPLIANCE_REMINDER` notification sent to admins |
| C5 | Close session (Reconcile Now) → requires ADMIN auth → session CLOSED and REVIEWED | cashier + admin auth | Supervisor auth prompt, task set to REVIEWED, cashier logged out |
| C6 | POS accessed with no open session → `OpenSessionDialog` shown | cashier | Cannot dismiss dialog; must open session or logout |
| C7 | Unverified previous shift → `AlertPrompt` shown before new session | cashier | Cannot start new session until resolved |

### Critical — Order Status Transitions

| # | Test | Auth | Expected |
|---|------|------|----------|
| C8 | PENDING → PREPARING → SERVED full flow | any | Status badge updates at each step |
| C9 | SERVED order → Pay Now → navigates to POS with orderId | any | Cart pre-populated with order items |
| C10 | Cancel PENDING order → confirmation dialog → order removed | any | WarningPrompt shown; order gone from list |
| C11 | Refund a paid (SERVED) order → refund transaction created | admin | Refund flow completes, refund record visible |
| C12 | Back to Pending from PREPARING → order reverts | any | Status badge shows PENDING |

### Critical — Task Lifecycle

| # | Test | Auth | Expected |
|---|------|------|----------|
| C13 | DRAFT → PENDING (Submit for Approval) | cashier | Button visible, status changes |
| C14 | PENDING → APPROVED (Approve) | supervisor/admin | Approve button visible, status changes |
| C15 | APPROVED → IN_PROGRESS (Start) | clerk | Start button visible, status changes |
| C16 | IN_PROGRESS → FULFILLED (Mark Done) | clerk | Fulfilled button visible |
| C17 | FULFILLED → REVIEWED (Verify & Lock) | supervisor/admin | Lock button visible, task terminal |
| C18 | PENDING → CANCELLED (Reject) | supervisor/admin | Cancel button visible, terminal state |
| C19 | Cashier cannot approve own task | cashier | Approve button absent |
| C20 | Wrong clerk cannot start task assigned to another | cashier-B | Start button absent |

### Critical — Notifications

| # | Test | Auth | Expected |
|---|------|------|----------|
| C21 | Notification appears after session close (COMPLIANCE_REMINDER) | admin | Notification visible in `/notifications` |
| C22 | Mark notification as read → unread badge decrements | admin | Badge count decreases |
| C23 | Mark all as read → no unread badges | admin | All notifications show no "New" badge |

### Normal

| # | Test | Expected |
|---|------|----------|
| N1 | Task timeline tab shows status history | Each transition visible with timestamp |
| N2 | Create GENERAL_CHORE task → skips approval, goes directly to IN_PROGRESS | Correct shortcut transition |
| N3 | Task detail sidebar shows correct accountability roles (Creator, Approver, Clerk) | Role names visible |
| N4 | Notification infinite scroll loads more | More notifications load on scroll |
| N5 | Notification click with link → navigates to task | Redirects correctly |
| N6 | Session summary shows correct transaction count and total sales on reconcile screen | Numbers match what was sold in the session |

### Known Gaps (flag for fix, not fail)

| # | Gap | Impact |
|---|-----|--------|
| G1 | **SC/PWD discount has no UI** — `compliance: {}` always passed from POS; cashier cannot enter SC/PWD name or ID; BIR-required fields never captured | High — BIR compliance violation on every senior/PWD transaction |
| G2 | **Task FULFILLED triggers no inventory side effect** — Shelf Refill, Branch Transfer, Stock Count tasks set status to FULFILLED but no inventory record is written | Medium — manual says fulfillment should update stock |
| G3 | **No standalone purchases / supplier management route** — manual chapter 7 describes a full purchase screen; only restock sidebar exists | Medium — operations staff expect a purchase log |

> Mark G1–G3 as `test.fixme()` in the spec file so they appear in the report as known issues
> requiring resolution before the manual's described behaviour is accurate.

---

## Suite 13 — Registration & Onboarding

**File**: `__tests__/e2e/specs/13-registration.spec.ts`

Registration is not covered by any unit or integration test that runs a real browser. The
critical things to verify here are: the session refresh after registration (so `getAuthUser()`
returns a complete `ServerUser` on the next call), the redirect to the correct landing page,
and the business-type-specific config taking effect immediately.

**Auth**: no pre-auth state — registration tests start unauthenticated.

### Critical — Email/Password registration flow

| # | Test | Expected |
|---|------|----------|
| C1 | Register with valid email + password → business setup form shown | `/register/business-setup` visible |
| C2 | Complete business setup (RETAIL) → redirected to `/pos` | CASHIER role landing page |
| C3 | Complete business setup (RESTAURANT) → ENABLE_ORDER_TAB config active | POS page loads, Order Tab feature available |
| C4 | Complete business setup (GROCERY) → ENABLE_ORDER_TAB=false | Order Tab hidden on POS |
| C5 | Register with duplicate email → error shown | "Email already in use" message visible |
| C6 | Register with invalid email format → blocked by form validation | Error shown before submit |
| C7 | Register with password too short → blocked | Validation error shown |
| C8 | After registration, 50 complimentary credits visible on billing page | `/billing/credits` shows balance = 50 |
| C9 | After registration, subscription status shows TRIAL | `/billing` shows TRIAL badge |
| C10 | After registration, trial end date shown (~30 days from now) | Trial banner visible with countdown |

### Critical — OAuth registration flow (Google / Facebook)

| # | Test | Expected |
|---|------|----------|
| C11 | OAuth callback arrives → business setup interstitial shown | `/register/business-setup` rendered |
| C12 | Complete business setup after OAuth → session fully populated | `getAuthUser()` returns businessId + branchId |
| C13 | OAuth user skips business setup (double-submit) → idempotency: existing IDs returned | No duplicate business created |

### Normal — Onboarding state after registration

| # | Test | Expected |
|---|------|----------|
| N1 | First login as newly registered ADMIN — sidebar shows all admin routes | Not stuck in cashier view |
| N2 | `/billing` page loads with correct plan name (Trial) | Plan name "Trial" visible |
| N3 | Subscription history entry: `fromStatus=null, toStatus=TRIAL` | Initial history record created |
| N4 | SystemConfig LOCALE=en-PH, CURRENCY=PHP visible in settings | Locale + currency displayed |
| N5 | Branch "Main Branch" visible in branch selector (future) | Created with branchCode=00001 |
| N6 | User role ADMIN confirmed — navigating to `/employees` does not redirect | Access granted |

### Edge Cases

| # | Test | Expected |
|---|------|----------|
| E1 | Submit business setup twice (double-click) → only one business created | Idempotency guard works |
| E2 | Registration with businessName containing special characters | Slug is sanitised, no crash |
| E3 | Registration with very long businessName (100 chars) | Accepted up to max; truncated gracefully |
| E4 | Unauthenticated user visits `/register/business-setup` directly | Redirected to `/register` or `/login` |

---

## Suite 14 — Billing & Subscription Journey

**File**: `__tests__/e2e/specs/14-billing.spec.ts`
**Auth**: `admin.json` (billing is admin-only)

Billing tests are only meaningful after the Stripe environment variables are configured
(`STRIPE_SECRET_KEY`, `STRIPE_PLAN_*_PRICE_ID`, `STRIPE_CREDIT_PKG_*_PRICE_ID`). When those
vars are absent, Stripe-dependent tests should use `test.skip` with a clear message.

For tests that do **not** require Stripe (credit balance display, trial status, invoice list),
no skip is needed.

### Critical — Subscription status display

| # | Test | Expected |
|---|------|----------|
| C1 | `/billing` shows correct subscription status badge (TRIAL) | Badge text = "Trial" |
| C2 | Trial countdown banner visible on any page during trial period | Banner with days remaining |
| C3 | Trial countdown shows 0 days when expired | "Trial expired" state displayed |
| C4 | `/billing/plans` lists all active plans with prices | Plan cards render, no blank screen |
| C5 | Current plan highlighted on `/billing/plans` | Active plan has visual indicator |

### Critical — Credit balance

| # | Test | Expected |
|---|------|----------|
| C6 | `/billing/credits` shows balance = 50 for new account | Balance card shows "50 credits" |
| C7 | After completing a POS transaction, credit balance decrements by 1 | Balance = 49 |
| C8 | Balance reaching low threshold (≤10) shows low-balance warning | Warning banner visible |
| C9 | Balance = 0 blocks POS checkout with an actionable error | "Top up your credits" message shown |
| C10 | `/billing/credits` shows full ledger history (PROMOTIONAL entry on registration) | At least 1 row in history table |

### Critical — Subscription lifecycle (requires Stripe env)

| # | Test | Stripe required | Expected |
|---|------|----------------|----------|
| C11 | Select a paid plan → redirected to Stripe checkout | ✅ | Stripe checkout URL in browser |
| C12 | Return from Stripe with `?purchase=success` → credits updated | ✅ | Balance increased by package amount |
| C13 | Cancel subscription (immediate) → status changes to CANCELLED | ✅ | Badge shows CANCELLED |
| C14 | Cancel subscription (scheduled) → status remains ACTIVE until period end | ✅ | "Cancels on [date]" shown |
| C15 | Cancelled subscription → resubscribe → status ACTIVE | ✅ | Badge shows ACTIVE |

### Normal — Billing pages render without errors

| # | Test | Expected |
|---|------|----------|
| N1 | `/billing` loads without console errors | No errors in console monitor |
| N2 | `/billing/credits` loads, shows balance card and ledger table | All sections visible |
| N3 | `/billing/plans` loads, shows plan cards with feature list | Cards render |
| N4 | `/billing/invoices` loads (empty state for new account) | Empty state message shown |
| N5 | `/billing/pricing` loads for composable pricing (if enabled) | Pricing calculator renders |
| N6 | Non-admin user cannot access `/billing` | Redirect or access-denied shown |

### Normal — Subscription banner behaviour

| # | Test | Expected |
|---|------|----------|
| N7 | TRIAL subscription → banner shows days remaining | Countdown visible |
| N8 | GRACE_PERIOD subscription → banner shows urgent payment message | Different banner style |
| N9 | EXPIRED subscription → operational features blocked, upgrade prompt shown | POS shows entitlement error |
| N10 | ACTIVE subscription → no trial/expired banner | Clean UI without banners |

### Edge Cases

| # | Test | Expected |
|---|------|----------|
| E1 | Purchase credits with unconfigured Stripe price ID → clear error message | "Not configured" error, no crash |
| E2 | Two concurrent credit deductions (two browser tabs, same account) | Both deductions complete; balance may go temporarily negative (known P3 limitation — R2); no crash |
| E3 | `/billing/invoices` with many invoice rows — pagination works | Next page loads correctly |
| E4 | Webhook arrives for unknown businessId — no crash, 200 returned | Webhook endpoint handles gracefully |

### Seed requirements for Suite 14

The standard e2e seed does not include subscription data (each test uses a freshly registered
account or a pre-seeded admin account). Suite 14 requires one of:

1. **Freshly registered admin** — register via Suite 13 in the same Playwright session, then
   use the resulting session for billing tests. Clean, realistic, but slower.
2. **Pre-seeded admin with subscription** — add a `subscription.csv` to the e2e seed that
   creates a `BusinessSubscription` (TRIAL) + 50 credits for `e2e-admin-1`.

Option 2 is preferred for CI speed. The `global-setup.ts` seed should include subscription
and credit ledger rows for `e2e-org-1` so billing pages render meaningfully without needing
to register first.

---

## Priority Order

| Priority | Suite | Reason |
|----------|-------|--------|
| 🔴 P0 | 01 — Auth | Gate for every other suite |
| 🔴 P0 | 02 — Authorization | Guards enforced, regression value is high |
| 🔴 P0 | 04 — POS Checkout | Core revenue path |
| 🔴 P0 | 12 — Operational Blockers | Session open/close, order flow, task lifecycle — first-hour blockers |
| 🔴 P0 | 13 — Registration | Onboarding is the entry point to the entire product |
| 🟠 P1 | 03 — Feature Flags | Fast to write, high regression value |
| 🟠 P1 | 05 — POS Orders | Session lifecycle |
| 🟠 P1 | 06 — Products | Required before POS works |
| 🟠 P1 | 07 — Ingredients | Inventory accuracy |
| 🟠 P1 | 11 — Offline/Online | Core advertised feature, distinct code paths |
| 🟠 P1 | 14 — Billing | Subscription + credits; blocks POS when expired |
| 🟡 P2 | 08 — Employees | Role management |
| 🟡 P2 | 09 — Settings | Supporting config |
| 🟢 P3 | 10 — Reports | Smoke only |

---

## Running E2E Tests

```bash
# Install browsers (one-time)
pnpm exec playwright install --with-deps

# Run all E2E tests
pnpm exec playwright test

# Run a specific suite
pnpm exec playwright test __tests__/e2e/specs/04-pos-checkout.spec.ts

# Headed browser (debugging)
pnpm exec playwright test --headed

# Interactive UI mode
pnpm exec playwright test --ui

# View last HTML report
pnpm exec playwright show-report
```

---

## Notes

- **Receipt PDF**: Assert the success prompt appears. Don't assert PDF content — intercept
  the print call with `page.on('dialog', ...)` or by checking the success prompt appears
  regardless of print outcome.
- **Async DB sync**: After mutations, use `expect(locator).toBeVisible({ timeout: 5000 })`
  rather than asserting immediately — TanStack DB local sync is async.
- **Feature flag tests**: Require a seed fixture that overrides the specific `SystemConfig`
  key for the test, then resets it after. Use `test.beforeEach` / `test.afterEach` for cleanup.
- **Offline tests**: `page.context().setOffline(true)` cuts all network at the browser level,
  including the `/favicon.ico` connectivity check in `useIsOnline`. No extra mocking needed.
  Always restore with `setOffline(false)` in `afterEach`. Run offline tests in a dedicated
  project or worker to avoid interfering with online suites running in parallel.
- **Known gaps (G1–G3 in Suite 12)**: SC/PWD discount UI, task inventory side effects, and
  standalone purchases route are absent. These are tagged `test.fixme()` — they appear in
  the Playwright HTML report as "known issues" so they don't fail CI but stay visible.
- **Seeding**: `global-setup.ts` runs `pnpm seed` once before the full test session.
  The seeder must be idempotent (upsert, not insert) to support re-runs.

---

## Seed Data Reference

> **Single source of truth** for all reusable E2E seed data.
> All data lives in `prisma/seeders/csv/e2e/`. The seeder `prisma/seeders/e2e.ts`
> is a pure CSV loader — to change seed data, edit the CSV files only.

### How E2E Runs

```
pnpm test:e2e
```

`global-setup.ts` runs automatically before any spec and does three things in order:

1. **Reset** — `prisma db push --force-reset` wipes and rebuilds the schema.
2. **Seed** — runs the full seeder pipeline with `SEED_FOLDER=e2e`, loading every CSV in order.
3. **Auth state** — logs in once per role and saves browser storage to `__tests__/e2e/fixtures/.auth/{role}.json`.

The dev server must already be running (`pnpm dev`) or Playwright's `webServer` block starts it.

```bash
# Full E2E run (resets DB, seeds, runs all specs)
pnpm test:e2e

# Interactive UI mode (same reset + seed, visual runner)
pnpm test:e2e:ui

# Debug a single spec with a visible browser
pnpm test:e2e:headed -- __tests__/e2e/specs/04-pos-checkout.spec.ts

# CI — set these env vars to skip all interactive prompts
RESET_AUTO_CONFIRM=true SEED_AUTO_CONFIRM=true pnpm test:e2e
```

---

### CSV File Map

| File | Rows | Purpose |
|------|------|---------|
| `accounts.csv` | 9 | Businesses, branches, users, memberships |
| `system-configs.csv` | 12 | Feature flags + locale/VAT config (all features ON for E2E) |
| `compliance_registry.csv` | 3 | BIR TIN, PTU number and issue date |
| `units.csv` | 14 | Measurement units across all types |
| `categories.csv` | 9 | Product categories |
| `locations.csv` | 7 | Storage locations per branch |
| `suppliers.csv` | 5 | Supplier directory |
| `customers.csv` | 8 | Customer profiles (walk-in, SC, PWD, corporate, gov, etc.) |
| `product-variants.csv` | 55 | All products + variants + test-scenario SKUs |
| `product-recipes.csv` | 48 | Ingredient mappings and add-on definitions |
| `product-states.csv` | 2 | `isAvailable` overrides (unavailable product, no-stock product) |
| `inventory.csv` | 55 | Initial stock batches per variant + location |
| `tasks.csv` | 12 | Operational tasks in every lifecycle status |
| `vendor-sessions.csv` | 2 | OPEN session (cashier-1) + CLOSED/unverified (cashier-2) |
| `orders.csv` | 4 | 2 active (PENDING, PREPARING) + 2 historical (SERVED) |
| `order-items.csv` | 9 | Line items for all orders |
| `transactions.csv` | 2 | Completed SALE records with VAT compliance data |
| `payments.csv` | 3 | Cash (sale 1) + split cash+card (sale 2) |
| `notifications.csv` | 9 | Mix of unread/read for admin, supervisor, and cashier |
| `purchases.csv` | 2 | Purchase headers linked to suppliers |
| `purchase-items.csv` | 10 | Purchase line items with unit costs |

---

### Test Accounts

All accounts use password `123qwe123!1`.

| ID | Email | Role | Business | Branch | Auth State File |
|----|-------|------|----------|--------|-----------------|
| `e2e-admin-1` | `e2e.admin@test.com` | ADMIN | e2e-org-1 | branch-1 (primary) | `admin.json` |
| `e2e-supervisor-1` | `e2e.supervisor@test.com` | SUPERVISOR | e2e-org-1 | branch-1 | `supervisor.json` |
| `e2e-cashier-1` | `e2e.cashier@test.com` | CASHIER | e2e-org-1 | branch-1 | `cashier.json` |
| `e2e-cashier-2` | `e2e.cashier2@test.com` | CASHIER | e2e-org-1 | branch-1 | — (no pre-auth) |
| `e2e-supervisor-2` | `e2e.supervisor2@test.com` | SUPERVISOR | e2e-org-1 | branch-2 | — |
| `e2e-cashier-3` | `e2e.cashier3@test.com` | CASHIER | e2e-org-1 | branch-2 | — |
| `e2e-admin-2` | `e2e.admin2@test.com` | ADMIN | e2e-org-2 | branch-3 (isolation) | — |
| `e2e-cashier-4` | `e2e.cashier4@test.com` | CASHIER | e2e-org-2 | branch-3 | — |

**Which account to use per suite:**

| Suite | Account |
|-------|---------|
| 01 Auth | all three (no pre-auth for invalid credential tests) |
| 02 Authorization | all three (multi-context spec) |
| 03 Feature Flags | admin (toggle configs), cashier (observe) |
| 04 POS Checkout | `cashier.json` |
| 05 POS Orders | `cashier.json` |
| 06 Products | `admin.json` |
| 07 Ingredients | `admin.json` |
| 08 Employees | `admin.json` |
| 09 Settings | `admin.json` |
| 10 Reports | `supervisor.json` |
| 11 Offline/Online | `cashier.json` (plus no-auth for C3) |
| 12 Operational Blockers | mixed (see suite notes) |

---

### Business & Branch Structure

```
e2e-org-1  (RESTAURANT — primary test business)
├── e2e-branch-1  (Main Branch — all primary test data lives here)
└── e2e-branch-2  (Second Branch — authorization isolation tests)

e2e-org-2  (RETAIL — business isolation tests)
└── e2e-branch-3  (Isolation Branch — cross-tenant data leak tests)
```

---

### Product Catalog

#### Sellable Products (normal stock)

| SKU | Name | Price | Category | Notes |
|-----|------|-------|----------|-------|
| `E2E-COF-SM` | Brewed Coffee — Small | ₱80 | Beverages | 2 variants (SIZE) |
| `E2E-COF-LG` | Brewed Coffee — Large | ₱120 | Beverages | |
| `E2E-MT-STD` | Milk Tea — Standard | ₱130 | Beverages | has pearls recipe + addon |
| `E2E-MT-LG` | Milk Tea — Large | ₱160 | Beverages | |
| `E2E-LEM-REG` | Lemonade — Regular | ₱70 | Beverages | lemon + syrup recipe |
| `E2E-LEM-LG` | Lemonade — Large | ₱100 | Beverages | |
| `E2E-SODA-ORIG` | House Soda — Original | ₱50 | Beverages | 2 flavors (FLAVOR) |
| `E2E-SODA-CITS` | House Soda — Citrus | ₱50 | Beverages | |
| `E2E-BOWL-SISIG` | Sisig Bowl | ₱185 | Main Dishes | rice+sauce recipe; rice+egg addons |
| `E2E-MEAL-CHKN` | Fried Chicken Meal | ₱145 | Main Dishes | chicken+rice+oil recipe; rice+egg addons |
| `E2E-RIBS-HALF` | Pork Ribs — Half Rack | ₱320 | Main Dishes | pork+sauce recipe |
| `E2E-RIBS-FULL` | Pork Ribs — Full Rack | ₱580 | Main Dishes | |
| `E2E-PASTA-REG` | Aglio Olio — Regular | ₱160 | Main Dishes | pasta+oil recipe; cheese addon |
| `E2E-PASTA-LG` | Aglio Olio — Large | ₱230 | Main Dishes | |
| `E2E-BURG-SGL` | Smash Burger — Single | ₱175 | Main Dishes | beef+flour+oil recipe; cheese+bacon addons |
| `E2E-BURG-DBL` | Smash Burger — Double | ₱240 | Main Dishes | |
| `E2E-DSCRT-HALO` | Halo-Halo | ₱95 | Desserts | |
| `E2E-FLAN-SGL` | Leche Flan — Single | ₱85 | Desserts | |
| `E2E-FLAN-BIL` | Leche Flan — Bilao | ₱950 | Desserts | qty=5 |
| `E2E-IC-SGL` | Ube Ice Cream — Single | ₱60 | Desserts | |
| `E2E-IC-DBL` | Ube Ice Cream — Double | ₱100 | Desserts | |
| `E2E-FRY-BBQ/CHZ/SRC` | French Fries | ₱75–80 | Snacks | 3 flavors |
| `E2E-LMP-6/12` | Lumpiang Shanghai | ₱90/₱165 | Snacks | 2 portions |
| `E2E-NACH-REG/SHR` | Loaded Nachos | ₱120/₱220 | Snacks | |

#### Test-Scenario SKUs

| SKU | Product | Purpose |
|-----|---------|---------|
| `E2E-FREE-SMPL` | Zero Price Product | Suite 04 E1 — ₱0 checkout succeeds |
| `E2E-UNAVAIL` | Unavailable Product | `isAvailable=false` — hidden from POS grid |
| `E2E-LOW-STK` | Low Stock Product | qty=3 / threshold=20 → low-stock badge |
| `E2E-NO-STK` | No Stock Product | qty=0 → `+` button disabled |
| `E2E-RECIPE-MAIN` | Product With Recipe | Suite 04 N10 — recipe ingredient deduction |
| `E2E-ADDON-MAIN` | Product With Addons | Suite 04 N11/N12 — add-on flow |
| `E2E-EXEMPT` | Tax Exempt Product | VAT breakdown — exempt line |
| `E2E-ZERO-RTD` | Zero Rated Product | VAT breakdown — zero-rated line |

#### Bundles & Services

| SKU | Product | Price | Notes |
|-----|---------|-------|-------|
| `E2E-CAT-50PAX` | Catering 50-Pax | ₱7,500 | BUNDLE type |
| `E2E-CAT-100PAX` | Catering 100-Pax | ₱14,000 | BUNDLE type |
| `E2E-SVC-SETUP-4H` | Event Setup — Half-Day | ₱2,000 | SERVICE type |
| `E2E-SVC-SETUP-8H` | Event Setup — Full-Day | ₱3,500 | SERVICE type |

---

### Inventory States

| Condition | Variant | qty | threshold | Effect |
|-----------|---------|-----|-----------|--------|
| Normal stock | all regular products | 50–5000 | varies | sells freely |
| Low stock | `e2e-var-low-stock` | **3** | **20** | orange low-stock badge |
| No stock | `e2e-var-no-stock` | **0** | 5 | `+` button disabled |
| Unavailable | `e2e-var-unavailable` | 50 | 5 | hidden from POS grid |

---

### Pre-Seeded Orders

| ID | Status | Items | Purpose |
|----|--------|-------|---------|
| `e2e-order-pending` | PENDING | Coffee Sm ×2, Sisig ×1 | Suite 05 C2 — load into POS cart |
| `e2e-order-preparing` | PREPARING | Chicken ×1, Halo-Halo ×2 | Suite 12 C8 — status transition |
| `e2e-order-served` | SERVED | Coffee Lg ×2, Halo-Halo ×1, Fries ×1 | Reports data; Suite 12 C11 refund target |
| `e2e-order-served-2` | SERVED | Pork Ribs Full ×1, Milk Tea ×2 | Split-payment history for reports |

---

### Pre-Seeded Transactions

| ID | Invoice | Total | Payment | Purpose |
|----|---------|-------|---------|---------|
| `e2e-txn-served` | SI-E2E-2026-000001 | ₱410 | Cash ₱500 | Reports smoke, refund test |
| `e2e-txn-served-2` | SI-E2E-2026-000002 | ₱840 | Cash ₱400 + Card ₱440 | Split-payment report row |

---

### Vendor Sessions

| ID | User | Status | Opening Cash | Purpose |
|----|------|--------|-------------|---------|
| `e2e-session-open` | cashier-1 | **OPEN** | ₱1,000 | All POS checkout tests — no manual session open needed |
| `e2e-session-closed` | cashier-2 | **CLOSED** | ₱1,000 | `verifiedCash=null` → triggers AlertPrompt on Suite 12 C7 |

---

### Pre-Seeded Tasks

| ID | Type | Status | Assigned To | Purpose |
|----|------|--------|-------------|---------|
| `e2e-task-draft` | GENERAL_CHORE | DRAFT | cashier-1 | Suite 12 C13 — submit for approval |
| `e2e-task-pending` | GENERAL_CHORE | PENDING | cashier-1 | Suite 12 C14 — approve/reject |
| `e2e-task-approved` | SHELF_REFILL | APPROVED | cashier-1 | Suite 12 C15 — start |
| `e2e-task-in-progress` | SHELF_REFILL | IN_PROGRESS | cashier-1 | Suite 12 C16 — mark done |
| `e2e-task-fulfilled` | GENERAL_CHORE | FULFILLED | cashier-2 | Suite 12 C17 — review/lock |
| `e2e-task-reviewed` | GENERAL_CHORE | REVIEWED | cashier-2 | Terminal state read-only |
| `e2e-task-cancelled` | GENERAL_CHORE | CANCELLED | cashier-1 | Terminal state read-only |
| `e2e-task-other-clerk` | GENERAL_CHORE | APPROVED | **cashier-2** | Suite 12 C20 — cashier-1 cannot start |
| `e2e-task-session-open` | CASH_RECONCILIATION | DRAFT | cashier-1 | Backs `e2e-session-open` |
| `e2e-task-session-closed` | CASH_RECONCILIATION | IN_PROGRESS | cashier-2 | Backs `e2e-session-closed` |
| `e2e-task-purchase-1` | GENERAL_CHORE | REVIEWED | admin-1 | Backs purchase-1 |
| `e2e-task-purchase-2` | GENERAL_CHORE | REVIEWED | admin-1 | Backs purchase-2 |

---

### Pre-Seeded Notifications

| ID | User | Type | isRead | Purpose |
|----|------|------|--------|---------|
| `e2e-notif-unread-1` | admin | COMPLIANCE_REMINDER | false | Suite 12 C21 — notification appears after session close |
| `e2e-notif-unread-2` | admin | LOW_STOCK | false | Low-stock notification visible |
| `e2e-notif-unread-3` | admin | TASK_ASSIGNED | false | Task approval notification |
| `e2e-notif-read-1` | admin | TASK_ASSIGNED | **true** | Suite 12 C22/C23 — mark-read baseline |
| `e2e-notif-read-2` | admin | COMPLIANCE_REMINDER | **true** | |
| `e2e-notif-sup-1` | supervisor | TASK_ASSIGNED | false | Supervisor inbox has unread item |
| `e2e-notif-sup-2` | supervisor | LOW_STOCK | **true** | |
| `e2e-notif-cash-1` | cashier-1 | TASK_ASSIGNED | false | Cashier inbox has unread item |
| `e2e-notif-cash-2` | cashier-1 | TASK_ASSIGNED | **true** | |

**Unread counts at seed time:** admin = 3, supervisor = 1, cashier-1 = 1

---

### Pre-Seeded Purchases

| ID | PO Number | Supplier | Total | Items |
|----|-----------|----------|-------|-------|
| `e2e-purchase-1` | PO-E2E-2026-000001 | E2E Primary Supplier | ₱4,620 | chicken, pork, rice, sauce, flour, oil |
| `e2e-purchase-2` | PO-E2E-2026-000002 | E2E Beverage Distributor | ₱2,800 | pearls, syrup, lemon, ground beef |

---

### Customers

| Email / Phone | Name | Type | Purpose |
|---------------|------|------|---------|
| (walk-in) | Walk-In Guest | — | Default POS reference |
| `e2e.customer@test.com` | E2E Regular Customer | Regular | Standard customer reference |
| `e2e.sc@test.com` | E2E SC Customer | Senior Citizen | SC/PWD discount path (Suite 04 E3) |
| `e2e.pwd@test.com` | E2E PWD Customer | PWD | SC/PWD discount path |
| `e2e.corporate@test.com` | E2E Corporate Client | Corporate | B2B invoice, appears in sale-2 |
| `e2e.gov@test.com` | E2E Government Account | Government | Tax-exempt purchase path |
| `e2e.loyalty@test.com` | E2E Loyalty Member | Loyalty | Future loyalty program tests |
| `e2e.catering@test.com` | E2E Catering Client | Catering | Bundle/large-order tests |


---

## Testing Philosophy

Each layer in the testing pyramid has a distinct responsibility. E2E tests are not a catch-all — they are the last line of verification for complete operational workflows that lower layers cannot cover.

### Unit Tests (Vitest)

Own the verification of isolated, deterministic logic with no external dependencies.

- Pure business logic
- Domain engines (`TaxEngine`, `CostingEngine`, `InventoryEngine`, `EntitlementEngine`, etc.)
- Utility functions and helpers
- Zod validation schemas
- Calculation functions (VAT, costing, unit conversion)
- Custom React hooks (with `renderHook`)
- Small, isolated components

**Principle:** if the correct answer can be determined by calling a function with sample inputs, it belongs here. Tests run in milliseconds and require no setup.

### Integration Tests

Own the verification of how units cooperate across a boundary.

- Repository interactions (Prisma queries against a test database)
- API route handlers (server function inputs and outputs)
- Database persistence (data written and read back correctly)
- Component integration (composed components with real stores)
- Engine orchestration (multiple engines working together in a workflow)
- Feature interactions (e.g., a task fulfillment triggering an inventory movement)

**Principle:** if the test needs a real database row, a real HTTP response, or two or more real modules cooperating, it belongs here.

### E2E Tests (Playwright)

Own the verification that the entire application — from browser to database — behaves correctly from a user's perspective.

- Complete browser workflows
- Full user journeys from login to task completion
- Multi-module operations that span several routes
- Role-based authorization (what a CASHIER sees vs. what an ADMIN sees)
- Browser-specific behavior (persistence, navigation, state restoration)
- Operational regression testing for critical business flows
- Verification that the system behaves correctly as an integrated whole

**Principle:** E2E validates observable business outcomes after real user interactions. It does not re-verify engine algorithms, validation rules, or repository logic that integration and unit tests already cover.

### What E2E Is Not Responsible For

The following are explicitly out of scope for E2E. Adding them here creates slow, fragile tests that duplicate coverage already owned by lower layers.

| Concern | Correct Layer |
|---|---|
| VAT calculation accuracy | Unit (TaxEngine) |
| Unit conversion math | Unit (UnitEngine) |
| FIFO batch ordering | Unit (CostingEngine) |
| Zod schema validation | Unit |
| Pricing algorithm correctness | Unit (PriceEngine) |
| Prisma query correctness | Integration |
| Repository business logic | Integration |
| API route input/output contracts | Integration |
| Component prop rendering | Unit / Integration |

E2E asserts: "after the user completed checkout, the transaction exists, the inventory decreased, and the session total updated." Not: "the VAT calculation used the correct formula."


---

## Suite S-00 — Smoke Navigation Coverage

**Priority:** P0
**Scope:** Every application route loads without errors, without unexpected redirects, and without blank screens.
**Purpose:** Catch broken routes, missing loaders, and runtime initialization errors before any functional suite runs. These tests are intentionally shallow — they navigate and assert presence, nothing more.

### S-00.1 Unauthenticated Redirect Guard

- Navigate to each protected route as an unauthenticated user
- Verify redirect to `/login`
- Verify no console errors during redirect
- Verify no blank screen flash before redirect completes

Routes to cover: `/pos`, `/orders`, `/products`, `/ingredients`, `/employees`, `/sales-reports`, `/inventory-reports`, `/notifications`, `/settings`, `/purchases`, `/tasks`

### S-00.2 Role-Scoped Route Access (ADMIN)

Login as ADMIN and navigate to each route in sequence:

| Route | Expected Outcome |
|---|---|
| `/pos` | POS interface renders; product search visible |
| `/orders` | Orders list renders |
| `/tasks` | Tasks list renders |
| `/tasks/create` | Create task form renders |
| `/products` | Products list renders |
| `/products/create` | Create product form renders |
| `/ingredients` | Ingredients list renders |
| `/ingredients/create` | Create ingredient form renders |
| `/employees` | Employees list renders |
| `/employees/create` | Create employee form renders |
| `/sales-reports` | Reports page renders |
| `/inventory-reports` | Reports page renders |
| `/notifications` | Notifications list renders |
| `/purchases` | Purchases list renders |
| `/purchases/create` | Create purchase form renders |
| `/settings` | Settings page renders |

For each: assert the page heading or a stable landmark element is visible. Assert no console errors. Assert no `404` or error boundary rendered.

### S-00.3 Role-Scoped Route Access (CASHIER)

Login as CASHIER and verify:

- `/pos` renders correctly
- Admin-only routes (`/employees`, `/settings`, `/purchases`) redirect or show access-denied state
- No uncaught exceptions on any visited route

### S-00.4 Dynamic Route Segments

Navigate to detail routes using seed data IDs:

- `/products/$productId` — product detail renders
- `/ingredients/$ingredientId` — ingredient detail renders
- `/employees/$employeeId` — employee detail renders
- `/tasks/$taskId` — task detail renders

Assert: the detail page renders the entity name. Assert no error boundary. Assert no 404.

### S-00.5 Not Found Handling

- Navigate to `/nonexistent-route`
- Assert a 404 or not-found page renders
- Assert no uncaught exception or blank screen


---

## Suite S-10 — Cross-Module Workflow Testing

**Priority:** P1
**Scope:** Business processes that span multiple modules and routes.
**Purpose:** Verify that data written in one module appears correctly in another. These tests catch integration gaps that unit and integration tests cannot — specifically, that the full stack (UI → server function → database → sync → display) works end to end.

Each workflow below should be tested as a single Playwright test or a small group of dependent tests sharing state via fixtures.

### S-10.1 Ingredient → Recipe → Product Chain

1. Navigate to `/ingredients/create` and create a new ingredient (e.g., "Test Coffee Beans", unit: grams, qty: 1000)
2. Navigate to `/products/create` and create a product (e.g., "Test Espresso") that uses the ingredient in its recipe
3. Navigate to `/products` and confirm the new product appears in the list
4. Navigate to `/ingredients/$ingredientId` and confirm the product appears in the ingredient's usage section (if visible)
5. Navigate to `/pos`, search for "Test Espresso", add to cart, complete a sale
6. Navigate to `/ingredients/$ingredientId` and verify inventory decreased by the recipe yield amount
7. Navigate to `/inventory-reports` and confirm the movement appears

**Assert at each step:** the correct entity name is visible. No error boundary. No stale data.

### S-10.2 Product Variant → POS Sale → Inventory Update

1. Navigate to `/products/create`, create a product with two variants (e.g., "Small" and "Large") with different prices
2. Navigate to `/pos`, search for the product — both variants should appear as selectable options
3. Add the "Large" variant to cart and complete checkout
4. Navigate to `/products/$productId` — verify the Large variant's inventory is decreased
5. Navigate to `/sales-reports` — verify the transaction appears with the correct variant name and price

### S-10.3 Purchase → Inventory Restock → POS Availability

1. Navigate to `/ingredients/$ingredientId` — note current stock level
2. Navigate to `/purchases/create`, create a purchase with that ingredient (e.g., qty: 500g)
3. Navigate back to `/ingredients/$ingredientId` — verify stock increased by the purchased quantity
4. Navigate to `/inventory-reports` — verify the purchase movement appears

### S-10.4 Task Fulfillment → Inventory Side Effect

1. Navigate to `/tasks/create`, create a `SHELF_REFILL` task (source location → target location, ingredient, quantity)
2. Note inventory levels at source and target before fulfillment
3. Navigate to `/tasks/$taskId`, change status to FULFILLED
4. Navigate to `/ingredients/$ingredientId` — verify source decreased and target increased by the task quantity
5. Navigate to `/inventory-reports` — verify both movements appear

### S-10.5 Order Lifecycle → Transaction History

1. From `/pos`, build a cart with multiple items and complete checkout
2. Navigate to `/orders` — verify the order appears with status SERVED
3. Navigate to `/transactions` (once built per Phase 1) — verify the transaction appears with correct invoice number, total, and cashier name
4. Navigate to `/sales-reports` — verify session totals updated


---

## Suite S-11 — End-to-End Operational Journeys

**Priority:** P0
**Scope:** Complete "day in the life" scenarios that represent how the business actually operates.
**Purpose:** Verify the system works end to end under realistic conditions. These journeys are the highest-value E2E tests because they exercise the most critical paths a business depends on daily. A regression in any of these should block a release.

Each journey is written as a single long-running test or a sequence of dependent test steps sharing authenticated session state via Playwright fixtures.

### S-11.1 Morning Opening — Standard Trading Day

This journey simulates a cashier starting their shift and opening for business.

1. **Login** — navigate to `/login`, authenticate as CASHIER, assert redirect to `/pos`
2. **Open vendor session** — start a new vendor session; assert session is active
3. **Process first sale** — search for a product, add to cart, complete cash payment; assert success toast and receipt dialog
4. **Process second sale** — different product, card payment; assert success
5. **Apply SC/PWD discount** — add a product, open payment dialog, expand SC/PWD section, enter beneficiary name and ID, apply discount; assert discounted total is displayed and checkout succeeds
6. **Create pay-later order** — build a cart, save as a pending order instead of checking out; assert order appears in `/orders` with PENDING status
7. **Resume order** — navigate to `/orders`, find the pending order, resume it back to the cart; assert cart is repopulated
8. **Complete checkout** — finalize the resumed order with payment; assert order status updates to SERVED
9. **Review session totals** — navigate to `/sales-reports`; assert today's sales reflect all completed transactions
10. **Close session** — end the vendor session; assert session is closed and totals are locked

### S-11.2 Refund Workflow

1. Login as CASHIER, complete a standard sale and note the invoice number
2. Navigate to `/orders` or `/transactions`, find the completed transaction
3. Initiate a refund on the transaction
4. Assert a refund transaction is created with the correct negative amount
5. Assert the original transaction shows a linked refund
6. Navigate to `/sales-reports` — assert session totals reflect the refund deduction
7. Navigate to `/inventory-reports` — assert inventory was restored (if applicable to the product type)

### S-11.3 End-of-Day Reconciliation (Supervisor)

1. Login as SUPERVISOR
2. Navigate to `/sales-reports` — review daily totals for completeness
3. Initiate cash reconciliation — enter physical cash count
4. Assert reconciliation summary shows expected vs. counted amounts
5. Submit reconciliation with supervisor approval
6. Assert reconciliation record is created and locked from further edits

### S-11.4 Inventory Replenishment Workflow

1. Login as ADMIN
2. Navigate to `/ingredients` — identify an ingredient with low stock
3. Navigate to `/purchases/create` — create a purchase order for that ingredient with a known quantity
4. Submit the purchase
5. Navigate to `/ingredients/$ingredientId` — assert stock increased by the purchased quantity
6. Navigate to `/inventory-reports` — assert the purchase movement appears in the log
7. If a low-stock notification was present before purchase, navigate to `/notifications` and assert it is resolved or cleared

### S-11.5 Employee Onboarding and First Sale

1. Login as ADMIN
2. Navigate to `/employees/create` — create a new employee with CASHIER role
3. Log out
4. Login as the newly created employee
5. Assert redirect to `/pos`
6. Complete a standard sale
7. Assert the transaction is attributed to the new employee
8. Login as ADMIN, navigate to `/employees/$employeeId` — verify the employee record is active

### S-11.6 Product Lifecycle — Create to Sale to Retirement

1. Login as ADMIN, create a new product with a variant, recipe, and initial inventory
2. Login as CASHIER, search for the product on `/pos` — assert it appears
3. Complete a sale of the product
4. Login as ADMIN, navigate to `/products/$productId` — soft-delete or deactivate the product
5. Login as CASHIER, search for the product on `/pos` — assert it no longer appears in search results
6. Navigate to `/sales-reports` — assert the completed sale still appears in history (data preserved after retirement)


---

## Suite S-12 — Business Invariant Verification

**Priority:** P0
**Scope:** Observable system state that must hold true after every critical operation.
**Purpose:** After a workflow completes, certain business outcomes are non-negotiable. These assertions verify the integrated system — not the algorithm — produced the correct observable result. They are appended to operational journey tests and cross-module workflow tests rather than standing alone.

These are **not** algorithm tests. They do not check "was the FIFO batch order correct?" They check "does the inventory page show the updated quantity?"

### S-12.1 Post-Checkout Invariants

After any successful POS checkout, the following must be observable in the UI:

| Observable | Where to Verify | Assert |
|---|---|---|
| Transaction record exists | `/transactions` (Phase 1) or `/orders` | Invoice number visible; status SERVED |
| Inventory decreased | `/ingredients/$id` or `/products/$id` | Stock quantity reduced by sold amount |
| Order status updated | `/orders` | Order no longer in PENDING/PREPARING; shows SERVED |
| Session totals updated | `/sales-reports` | Today's total includes the new transaction amount |
| Reports include transaction | `/sales-reports` | Transaction count incremented |
| Notifications created (where applicable) | `/notifications` | Low-stock notification present if stock crossed threshold |

### S-12.2 Post-Refund Invariants

After a refund is processed:

| Observable | Where to Verify | Assert |
|---|---|---|
| Refund transaction exists | `/transactions` | Type shows REFUND; linked to original invoice |
| Session totals updated | `/sales-reports` | Net total reduced by refunded amount |
| Inventory restored | `/ingredients/$id` | Stock quantity returned to pre-sale level (if applicable) |
| Original transaction shows refund link | `/transactions/$id` | Refund reference visible on original transaction detail |

### S-12.3 Post-Restock Invariants

After a purchase is created:

| Observable | Where to Verify | Assert |
|---|---|---|
| Inventory increased | `/ingredients/$id` | Stock quantity increased by purchased amount |
| Purchase record exists | `/purchases` | Purchase appears in list with correct supplier and total |
| Inventory movement logged | `/inventory-reports` | Movement of type PURCHASE appears |
| Low-stock warning cleared | `/notifications` | If a low-stock notification existed, it is resolved or absent |

### S-12.4 Post-Task-Fulfillment Invariants

After an operational task is marked FULFILLED:

| Observable | Where to Verify | Assert |
|---|---|---|
| Source inventory decreased | `/ingredients/$sourceId` | Quantity at source location reduced |
| Target inventory increased | `/ingredients/$targetId` | Quantity at target location increased (SHELF_REFILL / BRANCH_TRANSFER) |
| Task status locked | `/tasks/$taskId` | Status shows FULFILLED; cannot be changed again |
| Movement logged | `/inventory-reports` | Two movements visible (deduct + add) for SHELF_REFILL |

### S-12.5 Post-Employee-Creation Invariants

After a new employee is created:

| Observable | Where to Verify | Assert |
|---|---|---|
| Employee appears in list | `/employees` | New employee name visible |
| Employee can log in | `/login` | Authentication succeeds with new credentials |
| Role is enforced | Post-login | CASHIER lands on `/pos`; ADMIN lands on dashboard |


---

## Suite S-13 — Cross-Tenant Isolation Coverage

**Priority:** P0
**Scope:** Multi-tenant data boundaries between businesses and branches.
**Purpose:** Verify that Business A cannot observe or manipulate Business B's data under any circumstance. The seed data already contains multiple businesses and branches, making these tests straightforward to implement. A single failure in this suite is a critical security defect.

Isolation is verified by logging in as a user of Business A and attempting to access, observe, or modify data that belongs to Business B. Every assertion expects the data to be absent or the action to be denied.

### S-13.1 Business-Level Data Isolation

Setup: two seeded businesses — Business A (`e2e-org-1`) and Business B (`e2e-org-2`) — each with their own products, employees, orders, and transactions.

| Test | Action | Expected Result |
|---|---|---|
| Product isolation | Log in as Business A admin; navigate to `/products` | Only Business A products visible |
| Ingredient isolation | Navigate to `/ingredients` | Only Business A ingredients visible |
| Employee isolation | Navigate to `/employees` | Only Business A employees visible |
| Order isolation | Navigate to `/orders` | Only Business A orders visible |
| Purchase isolation | Navigate to `/purchases` | Only Business A purchases visible |
| Report isolation | Navigate to `/sales-reports` | Only Business A transaction totals visible |
| Notification isolation | Navigate to `/notifications` | Only Business A notifications visible |

### S-13.2 Direct URL Access Across Tenants

Attempt to access Business B's entity detail pages while authenticated as a Business A user, using known seed data IDs:

- `/products/$businessB_productId` — assert 404, redirect to own products list, or access-denied state
- `/employees/$businessB_employeeId` — assert 404 or redirect
- `/tasks/$businessB_taskId` — assert 404 or redirect
- `/purchases/$businessB_purchaseId` — assert 404 or redirect

No Business B data should be rendered under any circumstance. The response must not leak entity names, prices, or any field values from the other business.

### S-13.3 Branch-Level Isolation

Setup: Business A has two branches — `e2e-branch-1` and `e2e-branch-2`. A cashier is assigned to Branch 1 only.

| Test | Action | Expected Result |
|---|---|---|
| POS product scope | Log in as Branch 1 cashier; open `/pos` | Only Branch 1 products and inventory visible |
| Order scope | Navigate to `/orders` | Only Branch 1 orders visible |
| Report scope | Navigate to `/sales-reports` | Only Branch 1 session totals visible |
| Task scope | Navigate to `/tasks` | Only Branch 1 tasks visible |

### S-13.4 Cross-Tenant Mutation Attempt

Attempt to submit a mutation against a Business B entity while authenticated as Business A:

- Attempt to create an order referencing a Business B product variant ID directly (via crafted payload if applicable)
- Assert the server rejects the request with an authorization error
- Assert no record is created in Business B's data

This test verifies that server-side `businessId` scoping on mutations is enforced, not just UI filtering.

### S-13.5 Session Scope Verification

After completing a sale as Business A Cashier:

- Navigate to `/sales-reports` as Business A Admin — assert the transaction appears
- Log out, log in as Business B Admin — navigate to `/sales-reports`
- Assert the Business A transaction does not appear in Business B's reports


---

## Suite S-14 — Browser State & Persistence

**Priority:** P1
**Scope:** Real browser behavior around persistence, navigation state, and URL-driven state restoration.
**Purpose:** These tests verify behavior that only exists at the browser layer and cannot be covered by unit or integration tests. Component logic tests cannot simulate a real browser refresh, a back-navigation, or OPFS persistence across page loads.

### S-14.1 Cart Persistence Across Refresh

1. Login as CASHIER, navigate to `/pos`
2. Add two products to the cart with different quantities
3. Hard-refresh the page (`page.reload()`)
4. Assert the cart still contains both products with the correct quantities
5. Assert no console errors during restore
6. Complete the checkout — assert it succeeds (cart data was valid after restore)

### S-14.2 Session Persistence Across Refresh

1. Login as any role
2. Hard-refresh the page
3. Assert the user remains authenticated (no redirect to `/login`)
4. Assert the correct branch and business context is still active
5. Assert the correct role-based navigation is still visible

### S-14.3 URL State Restoration — Search

1. Navigate to `/products` and type a search term — assert filtered results appear
2. Navigate away to `/orders`, then use the browser back button
3. Assert the search term is restored and the filtered results reappear
4. Paste the URL in a new tab — assert the search state is restored via URL params

### S-14.4 URL State Restoration — Filters

1. Navigate to `/sales-reports` and apply a date range filter
2. Assert the URL reflects the selected date range
3. Hard-refresh the page
4. Assert the date range filter is still applied and results match

### S-14.5 URL State Restoration — Sort

1. Navigate to `/products` and change the sort order (e.g., by name descending)
2. Assert the URL reflects the sort state (if sort is URL-driven)
3. Hard-refresh the page
4. Assert the sort order is preserved

### S-14.6 Deep Linking

1. While unauthenticated, navigate directly to `/products/create`
2. Assert redirect to `/login`
3. Complete login
4. Assert redirect back to `/products/create` (intended destination preserved)

### S-14.7 Browser Back / Forward Navigation

1. Login, navigate through several routes: `/pos` → `/products` → `/products/create` → `/products`
2. Use the browser back button to navigate to `/products/create`
3. Assert the form is in its initial state (no stale data from a previous fill)
4. Use the browser forward button
5. Assert each route renders correctly without errors or blank screens

### S-14.8 Filter and Search State After Navigation

1. Navigate to `/orders`, apply a status filter (e.g., PENDING only)
2. Click into an order detail, then click back
3. Assert the filter is still applied on the orders list
4. Assert the list did not fully reload to unfiltered state


---

## Suite S-15 — Concurrent User Scenarios

**Priority:** P1
**Scope:** Multi-browser workflows simulating simultaneous users operating the system.
**Purpose:** Verify the system handles concurrent usage correctly — that two cashiers operating at the same time do not corrupt each other's data, that inventory updates from one session are eventually visible to another, and that conflict states are handled gracefully rather than silently producing wrong results.

These tests use Playwright's multi-browser context support: two separate browser contexts (with independent cookies and storage) run in the same test, coordinated via `Promise.all` or sequential steps.

### S-15.1 Two Cashiers Selling the Same Product Simultaneously

Setup: a product with exactly 2 units in stock.

1. Open browser context A (Cashier 1) and browser context B (Cashier 2) — both logged in
2. Both cashiers add the same product (1 unit each) to their respective carts
3. Cashier 1 completes checkout — assert success
4. Cashier 2 completes checkout immediately after — assert success (2 units were available)
5. Navigate to `/ingredients` or `/products/$id` as admin — assert stock is now 0
6. Attempt a third sale of the same product — assert checkout is blocked with a stock-insufficient error, not a silent failure or a crash

**Key assertion:** the system never oversells. If stock reaches zero, the next checkout attempt produces a visible, actionable error message rather than proceeding silently.

### S-15.2 Two Cashiers, Same Pending Order

1. Cashier 1 creates a pending order and navigates away
2. Cashier 2 (same branch) resumes the same order from `/orders`
3. Cashier 1 also attempts to resume the same order
4. Assert: one cashier gets the order in their cart; the other sees a conflict message or the order is no longer resumable
5. Assert: the order is not duplicated and not corrupted

### S-15.3 Two Admins Editing the Same Product

1. Admin A opens `/products/$productId` and begins editing the product name
2. Admin B opens the same route and edits the product price
3. Admin A saves first
4. Admin B saves second
5. Navigate to `/products/$productId` — assert the final state reflects both changes correctly, or assert a conflict warning was shown to Admin B

**Key assertion:** no edit is silently lost. Either both changes are preserved, or the second editor is warned of a conflict.

### S-15.4 Concurrent Inventory Updates

1. Admin A creates a purchase that adds 100g of an ingredient
2. Simultaneously, a cashier completes a sale that consumes 50g of the same ingredient
3. After both operations complete, navigate to `/ingredients/$ingredientId`
4. Assert the final stock reflects both operations correctly (e.g., original + 100 - 50)
5. Assert the inventory report shows two separate movement entries

### S-15.5 Concurrent Session Totals

1. Two cashiers complete sales simultaneously in the same vendor session
2. Navigate to `/sales-reports` as admin
3. Assert the session totals include both transactions — no transaction is missing from the aggregate


---

## Console Error Monitoring

**Purpose:** Automatically fail tests when unexpected browser-level errors occur during execution. This catches runtime regressions — React hydration errors, uncaught promise rejections, missing chunk loads — that would otherwise go unnoticed because the visible UI still renders.

### Strategy

Attach a `console` listener and a `pageerror` listener to every Playwright page before each test. Collect all errors. After the test body completes, assert the collected list is empty.

```ts
// fixtures/console-monitor.ts
import { test as base } from '@playwright/test'

export const test = base.extend({
  page: async ({ page }, use) => {
    const errors: string[] = []

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(`[console.error] ${msg.text()}`)
      }
    })

    page.on('pageerror', (err) => {
      errors.push(`[uncaught] ${err.message}`)
    })

    await use(page)

    expect(errors, `Unexpected browser errors:\n${errors.join('\n')}`).toHaveLength(0)
  },
})
```

All test files import `test` from this fixture rather than directly from `@playwright/test`. This ensures every test in every suite benefits from monitoring automatically.

### Error Categories to Catch

| Error Type | Listener | What It Catches |
|---|---|---|
| `console.error` | `page.on('console')` | React runtime errors, explicit `console.error` calls, failed resource loads |
| Uncaught exceptions | `page.on('pageerror')` | Unhandled promise rejections, thrown errors outside React boundaries |
| React hydration errors | `page.on('console')` | SSR/client mismatch warnings that appear as `console.error` in React 18+ |
| Chunk load failures | `page.on('console')` | Missing JS chunks from bad builds or deploys |

### Allowed Noise — Known Exclusions

Some `console.error` calls are intentional (e.g., third-party library warnings that cannot be suppressed). Maintain an allowlist of known patterns that should not fail the test:

```ts
const ALLOWED_PATTERNS = [
  /Download the React DevTools/,
  // Add project-specific known warnings here
]

page.on('console', (msg) => {
  if (msg.type() === 'error') {
    const text = msg.text()
    if (!ALLOWED_PATTERNS.some((p) => p.test(text))) {
      errors.push(`[console.error] ${text}`)
    }
  }
})
```

Keep the allowlist short and reviewed. A growing allowlist is a signal that errors are being suppressed rather than fixed.

### Application to Suites

- **S-00 (Smoke):** Console monitoring is the primary assertion mechanism alongside route rendering checks.
- **S-10 / S-11 (Workflows / Journeys):** Errors collected throughout the full journey; a hydration error mid-checkout fails the whole test.
- **S-12 (Invariants):** Monitoring ensures post-checkout state reads do not produce React errors while displaying updated data.
- **S-13 (Isolation):** Monitoring catches any React error thrown when unauthorized data is accessed.
- **S-14 (Browser State):** Monitoring is especially important on refresh and back-navigation tests where hydration mismatches are most likely.


---

## Browser Compatibility Strategy

**Purpose:** Ensure critical workflows function correctly across the browsers used by target customers without running the full suite on every browser at every CI run.

### Tiered Browser Execution

| Tier | Browsers | Suites Executed |
|---|---|---|
| **P0 — Every CI run** | Chromium only | S-00, S-11, S-12, S-13 |
| **P1 — Nightly / pre-release** | Chromium + Firefox + WebKit | S-00, S-10, S-11, S-12, S-13, S-14 |
| **P2 — Release gate** | Chromium + Firefox + WebKit | Full suite (all suites) |

The rationale: most users operate on Chromium-based browsers. Firefox and WebKit coverage is valuable but not worth blocking every PR. The nightly run catches cross-browser regressions before they accumulate.

### Playwright Configuration

```ts
// playwright.config.ts
export default defineConfig({
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },

    ...(process.env.FULL_BROWSER_MATRIX === 'true'
      ? [
          { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
          { name: 'webkit', use: { ...devices['Desktop Safari'] } },
        ]
      : []),
  ],
})
```

CI pipelines set `FULL_BROWSER_MATRIX=true` on nightly and release branch runs only.

### Cross-Browser Focus Areas

| Area | Why It Matters Cross-Browser |
|---|---|
| PDF receipt generation (`@react-pdf/renderer`) | PDF rendering and print dialog behavior varies |
| OPFS / TanStack DB persistence | Safari has stricter OPFS quotas and ITP policies |
| `Intl.NumberFormat` currency output | Minor locale formatting differences between engines |
| Clipboard API (barcode / copy actions) | Requires explicit permissions in Firefox and WebKit |
| `<input>` autofocus behavior | Barcode scanner input autofocus differs by browser |
| CSS `@page` / print styles | Print layout rendering varies |

### Mobile Viewport Smoke

Add a lightweight mobile viewport check to the nightly run for the two most critical routes:

```ts
{ name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
{ name: 'mobile-safari', use: { ...devices['iPhone 13'] } },
```

Scope: S-00 smoke navigation only. Full mobile functional testing is deferred to a dedicated mobile testing phase.

---

## Migration & Upgrade Regression Strategy

**Purpose:** Catch regressions introduced by database migrations before they reach production. A migration that silently corrupts seed data, drops a default, or changes an index can cause failures that only manifest at runtime.

### When to Run

Applies to any PR or deployment that includes a Prisma migration file. Runs as a dedicated pre-release gate, not part of the standard CI suite.

### Workflow

```
1. Reset the test database to a clean state
2. Apply all migrations in sequence (prisma migrate deploy)
3. Run the seed script (prisma db seed)
4. Execute the critical operational workflow suite
5. Assert all invariants hold against freshly migrated + seeded data
```

In CI:

```yaml
# .github/workflows/migration-regression.yml
- name: Reset and migrate
  run: npx prisma migrate reset --force --skip-seed

- name: Seed
  run: npx prisma db seed

- name: Run migration regression suite
  run: npx playwright test --project=chromium --grep="@migration"
```

Tag relevant tests with `@migration` in their title:

```ts
test('@migration S-11.1 Morning Opening — post-migration', async ({ page }) => { ... })
```

### Suite Scope for Migration Runs

| Suite | Reason to Include |
|---|---|
| S-00 (Smoke) | Verify all routes still load after migration |
| S-11.1 (Morning Opening) | Exercises Order, Transaction, Payment, InventoryMovement, VendorSession |
| S-11.4 (Inventory Replenishment) | Exercises Purchase, PurchaseItem, Inventory |
| S-12.1 (Post-Checkout Invariants) | Verifies all post-transaction state is correct |
| S-13.1 (Business Isolation) | Verifies tenant scoping still works after schema changes |

### Migration Risk Policy

| Migration Type | Risk Level | Required Gate |
|---|---|---|
| Add nullable column | Low | S-00 smoke only |
| Add new table | Low | S-00 smoke + relevant suite |
| Add non-nullable column with default | Medium | Migration regression suite |
| Rename column | High | Full migration regression suite + manual review |
| Drop column | High | Full migration regression suite + manual review + ADR |
| Change enum values | High | Full migration regression suite + manual review |
| Backfill existing rows | High | Full migration regression suite + data integrity check |


---

## Visual Regression Recommendation

**Purpose:** Detect unintended visual changes to stable, high-traffic pages after UI refactors, dependency upgrades, or style changes. Visual regression is optional and separate from functional testing — a visual diff failure is a signal to review, not a blocker.

### Recommended Approach

Use Playwright's built-in screenshot assertion (`expect(page).toHaveScreenshot()`) against a set of stable reference pages. Reference screenshots are committed to the repository and updated intentionally when UI changes are expected.

```ts
test('dashboard visual baseline', async ({ page }) => {
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')
  await expect(page).toHaveScreenshot('dashboard.png', { maxDiffPixels: 50 })
})
```

### Target Pages for Visual Baselines

| Page | Route | Rationale |
|---|---|---|
| POS Interface | `/pos` | Core customer-facing surface; layout regressions are high-impact |
| Dashboard / Home | `/` | First screen after login; brand and navigation anchors |
| Products List | `/products` | Table-heavy; column and spacing regressions are common |
| Sales Reports | `/sales-reports` | Chart and summary cards; data visualization regressions |
| Employee List | `/employees` | Role-sensitive; visual access changes need quick detection |
| Settings | `/settings` | Tab-based layout; regressions often affect navigation |
| Receipt Preview | receipt dialog | Customer-visible document; layout must be stable |

### Implementation Notes

- **Separate project:** run visual tests as a separate Playwright project (`{ name: 'visual' }`) so they never block the functional suite.
- **Chromium only:** visual snapshots are captured on Chromium. Cross-browser visual diffs are impractical for a v1 strategy.
- **Mask dynamic content:** mask timestamps, invoice numbers, and user-generated text before snapshotting to prevent false positives.

```ts
await expect(page).toHaveScreenshot('pos.png', {
  mask: [page.locator('[data-testid="invoice-number"]')],
  maxDiffPixels: 100,
})
```

- **Update workflow:** run `npx playwright test --update-snapshots` locally when a visual change is intentional, review the diff, commit the updated baseline.
- **CI gate:** visual tests run on PRs but are advisory (non-blocking) until the baseline library is stable. Promote to blocking once the false-positive rate is low.

### What Visual Regression Is Not

Visual regression does not replace functional tests. A page that looks correct can still have broken interactions, incorrect data, or failed server calls. Visual baselines catch pixel-level layout regressions only.

---

## Responsibility Boundaries

This section is the standing reference for what belongs in E2E and what does not. Consult it when writing new tests or reviewing PRs that add E2E coverage.

### What E2E Owns

| Concern | Example |
|---|---|
| Complete browser workflows | Login → add to cart → checkout → verify receipt dialog |
| Full user journeys | Morning Opening journey (S-11.1) from login to session close |
| Multi-module operations | Ingredient created → used in recipe → sold → inventory decremented |
| Role-based authorization | CASHIER cannot access `/employees`; ADMIN can |
| Browser-specific behavior | Cart persists after hard refresh; URL state restores filters |
| Operational regression | Every critical journey passes after a new release |
| Cross-tenant isolation | Business A data not visible to Business B |
| Concurrent user behavior | Two cashiers selling the same last-in-stock item |
| Migration integrity | All routes and workflows pass against freshly migrated data |

### What E2E Does Not Own

| Concern | Correct Layer | Reason |
|---|---|---|
| VAT calculation correctness | Unit → `TaxEngine` | Deterministic math; no browser needed |
| FIFO batch ordering | Unit → `CostingEngine` | Pure algorithm; no browser needed |
| Unit conversion formulas | Unit → `UnitEngine` | Pure math; no browser needed |
| Pricing algorithm accuracy | Unit → `PriceEngine` | Deterministic; no browser needed |
| SC/PWD discount formula | Unit → `TaxEngine` / `DiscountPolicy` | Pure business rule |
| Zod schema validation messages | Unit | Schema logic, not browser behavior |
| Repository query correctness | Integration | Requires DB, not a browser |
| API route input/output contracts | Integration | HTTP boundary testing |
| Database persistence of a single field | Integration | Not a browser concern |
| Component prop rendering | Unit | Isolated component, no workflow |
| Engine orchestration under specific inputs | Integration | Multi-engine coordination without browser |

### The Decision Test

When in doubt, apply this test to any proposed E2E test:

> "Can this be verified by calling a function with sample data, or by making an API call against a test database — without a browser?"

If yes → it belongs in unit or integration tests, not E2E.

> "Does verifying this require a real browser, a real session, real navigation, or real user interaction across multiple pages?"

If yes → it belongs in E2E.

### Suite Priority Summary

| Suite | Priority | CI Gate |
|---|---|---|
| S-00 Smoke Navigation | P0 | Every PR |
| S-11 Operational Journeys | P0 | Every PR |
| S-12 Business Invariants | P0 | Every PR |
| S-13 Cross-Tenant Isolation | P0 | Every PR |
| Suite 13 Registration | P0 | Every PR |
| S-10 Cross-Module Workflows | P1 | Every PR |
| S-14 Browser State & Persistence | P1 | Every PR |
| Suite 14 Billing | P1 | Every PR (Stripe tests skipped when env absent) |
| S-15 Concurrent Users | P1 | Nightly |
| Migration Regression | P0 | Migration PRs only |
| Visual Regression | P2 | Nightly (advisory) |
| Firefox / WebKit compatibility | P1 | Nightly |

P0 suites run on every PR against Chromium and must pass before merge. P1 suites run on every PR but a single flaky failure is investigated before blocking. P2 suites are advisory and inform but do not block.
