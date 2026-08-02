# Registration & Onboarding Plan
## StartPOS — Acquisition Funnel + In-App Guidance System

> **Status:** Final — architecture review complete, ready for Phase A implementation
> **Date:** August 1, 2026
> **Depends on:** All SaaS Foundation phases complete (Phases 0–5, Section 6)
> **Author role:** Principal architect — pre-implementation planning only.

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Core Architectural Principles](#2-core-architectural-principles)
3. [Full User Journey](#3-full-user-journey)
4. [Registration Flow](#4-registration-flow)
5. [Incentive Model](#5-incentive-model)
6. [Tutorial System](#6-tutorial-system)
7. [Hint System](#7-hint-system)
8. [Server-Side: `complete-registration` Server Function](#8-server-side-complete-registration-server-function)
9. [Dashboard — Management Overview](#9-dashboard--management-overview)
10. [Schema Changes](#10-schema-changes)
11. [Implementation Phases](#11-implementation-phases)
12. [Decisions Made](#12-decisions-made)
13. [Open Questions](#13-open-questions)
14. [Scope Discipline](#14-scope-discipline)

---

## 1. Problem Statement

The platform has a fully operational billing infrastructure, subscription lifecycle, entitlement
engine, and four subscription plans — but no self-serve entry point. Tenants are created
exclusively by the seed script. There is no registration, no guided first-run experience, and
no path from "discovered the product" to "running POS."

| Currently | Target |
|-----------|--------|
| Seeder-only tenant creation | Self-serve registration |
| Email/password only | Email/password + Google + Facebook OAuth |
| No business after signup | Business auto-created at registration |
| Loading screen if no Membership | App accessible immediately after register |
| No guided first-run experience | Tutorial system: condition-driven, non-blocking |
| No tips or contextual help | Hint system: periodic, auto-dismiss, admin-configurable |
| No incentive to sign up | 50 complimentary transactions, no card required |

---

## 2. Core Architectural Principles

### 2.1 Register → App immediately. No wizard gate.

The registration step creates a `User` record, a `Business`, a `Branch`, a `Membership`, a
`BusinessSubscription` with 50 free credits, and sets sensible `SystemConfig` defaults — all
atomically. By the time the register form submits, the user has a fully operational account.
They are redirected straight into the app. There is no wizard they must complete before seeing
the dashboard.

### 2.2 OAuth = identity only. A 2-field interstitial fills the gap.

Google and Facebook supply name and email but not business name or type. Since those two fields
are required to auto-create the business at registration time, OAuth users see a single
2-field interstitial screen immediately after the OAuth callback — before the app loads.
It asks only: **business name** and **business type**. This screen is not a wizard. It is a
prerequisite that takes under 10 seconds, then the app opens.

### 2.3 Tutorial and Hint are two separate systems with separate responsibilities.

**Tutorial** — actionable, condition-driven, persistent.
Tells the user something they need to do to use the app properly. Tied to live app state.
Stays until the condition is resolved.

**Hint** — informative, periodic, automatic.
Tells the user something useful about the app. Not tied to app state. Auto-dismisses.
Rotates on a configurable schedule.

These two systems share a visual presentation layer (same corner, different style) but have
entirely separate data models, engines, and lifecycles.

### 2.4 Both systems are decoupled from the pages they appear on.

No route file contains tutorial or hint logic. A page does not know which tutorials or hints
apply to it. The systems push guidance to the UI through hooks; the UI renders whatever the
hook returns. Adding a new tutorial or hint never requires touching a route file.

### 2.5 Every successful registration produces a fully operational tenant. No exceptions.

This is the platform's most important registration invariant. After `complete-registration`
commits, the authenticated user always has:

- `User` — their identity record in better-auth
- `Business` — their tenant organisation
- `Branch` — their primary operating location
- `Membership` — the link between User, Business, and Branch with `role = ADMIN`
- `BusinessSubscription` — an active `PREPAID_CREDITS` subscription with 50 complimentary transactions

The rest of the platform is built on this guarantee. No route, engine, or server function
needs to handle a "partially registered" user. `getAuthUser` either returns a complete
`ServerUser` or `undefined` — there is no intermediate state. This is why the onboarding
architecture is intentionally simple: the app is fully functional from the moment registration
completes. The Tutorial and Hint systems guide the user; they do not gate the user.

---

## 3. Full User Journey

### 3.1 Email/Password Registration

```
/register
  name + email + password
        ↓
  better-auth creates User
  complete-registration runs atomically:
    Business + Branch + Membership + SystemConfig + Subscription + 50 credits
        ↓
  session enriched with businessId + branchId
        ↓
  /dashboard  ←  user is inside the app immediately
        ↓
  TutorialEngine evaluates conditions — first tutorials appear in corner
  HintEngine schedules first hint for the session
```

### 3.2 Google / Facebook OAuth Registration

```
/register  →  "Continue with Google" or "Continue with Facebook"
        ↓
  OAuth redirect + provider callback
  better-auth creates User (name + email from provider)
        ↓
  No Membership yet → /register/business-setup  (2-field interstitial)
    ┌─────────────────────────────────────┐
    │  One last thing                     │
    │  Business name: [____________]      │
    │  Business type: [🍽][🛒][🏪]        │
    │                 [Let's go →]        │
    └─────────────────────────────────────┘
        ↓
  complete-registration runs atomically (same as email path)
        ↓
  /dashboard  ←  user is inside the app
```

### 3.3 Returning User Login

```
/login  →  credentials or OAuth
        ↓
  session has businessId + branchId (Membership exists)
        ↓
  getAuthUser() returns full ServerUser
        ↓
  RoleLandingPages[role]  →  /dashboard (ADMIN) or role-specific page
        ↓
  TutorialEngine re-evaluates conditions (may show unfulfilled tutorials)
  HintEngine checks last-shown timestamps → shows hint if due
```

---

## 4. Registration Flow

### 4.1 `/register` page

Fields:
- **Name** — display name; pre-filled from OAuth provider if applicable
- **Email** — standard email
- **Password** — min 6 chars (email/password path only)
- **Business name** — becomes `Business.name`
- **Business type** — three icon cards: 🍽 Restaurant / 🛒 Grocery / 🏪 Retail

OAuth buttons:
- "Continue with Google"
- "Continue with Facebook"

Business name and type are collected **on the register form for email/password** users.
OAuth users are redirected to `/register/business-setup` after the provider callback (Section 4.2).

### 4.2 `/register/business-setup` — OAuth interstitial

A minimal screen shown only to OAuth users after their provider callback, before `complete-registration` runs.

Fields:
- **Business name** (required)
- **Business type** (required — three icon cards)

One button: "Let's go →". No back button, no skip. These two fields are required to create
the business record. The screen is intentionally minimal — no marketing copy, no extra fields.
The user has just authenticated and wants to be in the app.

### 4.3 Authentication configuration changes

**`src/lib/better-auth/auth.ts`** — add `socialProviders`:

```ts
socialProviders: {
  google: {
    clientId: process.env['GOOGLE_CLIENT_ID']!,
    clientSecret: process.env['GOOGLE_CLIENT_SECRET']!,
  },
  facebook: {
    clientId: process.env['FACEBOOK_CLIENT_ID']!,
    clientSecret: process.env['FACEBOOK_CLIENT_SECRET']!,
  },
}
```

**`src/lib/better-auth/auth-client.ts`** — add `socialClient` plugin.

**`src/routes/(private)/route.tsx`** — distinguish session states:
- No better-auth session → redirect to `/login`
- Session exists, no Membership → redirect to `/register/business-setup`
- Session exists, Membership exists → proceed normally

**New env vars:**
```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
FACEBOOK_CLIENT_ID=
FACEBOOK_CLIENT_SECRET=
```

---

## 5. Incentive Model

### 5.1 Free credits on registration (no card required)

Every new business receives **50 complimentary transactions** deposited into their `CreditLedger`
at registration time (`eventType = PROMOTIONAL`). These allow 50 real POS checkouts before any
subscription is needed.

- Non-expiring — persist until consumed
- Business starts on `PREPAID_CREDITS` billing model
- When credits run out, checkout is blocked by the existing entitlement engine
- The existing `NotificationEngine.sendCreditLowBalance` fires when balance is low
- The existing `/billing` upgrade CTA handles conversion — no new logic needed

### 5.2 Payment path (from /billing — not at registration)

Registration never requires payment. Users who want to subscribe go to `/billing` and choose:

**Step A — Choose plan:**
- Starter (₱499/mo)
- Professional (₱1,499/mo)
- Enterprise (₱4,999/mo)

**Step B — Choose billing preference:**
- Monthly
- Annual (discount applied)

On Stripe checkout completion, the billing model switches from `PREPAID_CREDITS` to
`MONTHLY_SUBSCRIPTION` (or `YEARLY_SUBSCRIPTION`). The existing webhook handles this.
An introductory promotion (first period free or discounted) is configurable via `SystemConfig`.

### 5.3 Upgrade funnel

```
50 credits granted at registration
        ↓
Credits consumed at checkout (CreditEngine.deduct — already built)
        ↓
Balance falls below CREDIT_LOW_BALANCE_THRESHOLD
        ↓
Low-balance notification sent (NotificationEngine — already built)
Tutorial: "Running low on transactions" appears in corner
        ↓
User visits /billing  →  plan + billing preference selection
        ↓
Stripe checkout  →  webhook  →  billing model switches
Credits remain in ledger as audit record; no longer deducted
```

### 5.4 Billing model mapping

| User-facing label | Internal `BillingModel` | Notes |
|---|---|---|
| Complimentary | `PREPAID_CREDITS` | Default at registration |
| Monthly | `MONTHLY_SUBSCRIPTION` | Stripe monthly cycle |
| Annual | `YEARLY_SUBSCRIPTION` | Stripe annual cycle; discount applied |

Internal `BillingModel` names are never shown to users. This table is the canonical mapping.

---

---

## 6. Tutorial System

### 6.1 Purpose

The Tutorial system guides users through the actions they need to take to use the app
properly. Tutorials are tied to real app state — they appear when a condition is unmet and
disappear permanently once it is resolved. They are non-blocking: the user can ignore them
and use the app freely. They reappear on next login until the condition is fulfilled.

### 6.2 Architecture

```
TutorialDefinition (static — defined in code)
  id, title, body, ctaLabel, ctaRoute, page, condition, group

TutorialContext (assembled per page load)
  productCount, employeeCount, hasOrders, creditBalance,
  businessNameIsDefault, billingConnected, ...

TutorialEngine (pure domain object — no infrastructure imports)
  evaluate(page, context) → TutorialDefinition[]
  Returns only tutorials whose condition is unmet for the given page.

TutorialStore (client state — session-scoped)
  dismissed: Set<string>   ← tutorial IDs dismissed this session
  dismiss(id)              ← adds to set; cleared on logout
  NOT persisted to DB or localStorage

useTutorials(page) hook (UI layer)
  1. Reads live data from collections (product count, etc.)
  2. Assembles TutorialContext
  3. Calls TutorialEngine.evaluate(page, context)
  4. Filters out IDs in TutorialStore.dismissed
  5. Returns active tutorials for current page

GuidanceBanner component (tutorial variant)
  Corner toast — bottom-right
  Title + body + CTA button + X dismiss
  Visually: primary color border, action-oriented styling
  Pressing X → TutorialStore.dismiss(id) [session only]
  Condition resolution → removed automatically on next evaluation
```

The component is named `GuidanceBanner` rather than `TutorialBanner` because it is the
shared corner-toast primitive used by both the Tutorial system (with CTA + dismiss) and the
Hint system (auto-dismiss variant). Naming it after a specific system would make the component
harder to reuse as the platform's guidance surface grows.

### 6.3 TutorialDefinition type

```ts
interface TutorialDefinition {
  id: string                  // stable, unique — e.g. 'no-products-on-pos'
  group: TutorialGroup        // catalogue organisation — see Section 6.4
  title: string               // e.g. "No products yet"
  body: string                // e.g. "Add your first product to start selling."
  ctaLabel: string            // e.g. "Add product"
  ctaRoute: string            // e.g. "/products/create"
  page: string | string[]     // route(s) where this tutorial appears
  condition: (ctx: TutorialContext) => boolean  // true = show (condition unmet)
}

type TutorialGroup =
  | 'SETUP'       // business profile, system config, first-run actions
  | 'POS'         // checkout, products, variants, pricing
  | 'INVENTORY'   // stock, suppliers, purchases, receiving
  | 'BILLING'     // credits, subscription, payment connection
  | 'EMPLOYEES'   // team members, roles, invitations
  | 'REPORTS'     // sales reports, exports, analytics
```

### 6.4 Tutorial catalogue

All tutorials are defined in a single file: `src/lib/tutorial/tutorial-definitions.ts`.
Adding a new tutorial = adding one object to this file. No route file is touched.

Tutorials are organized by `TutorialGroup`. The group is used by the `SetupChecklist`
on `/dashboard` to render tutorials in logical sections as the catalogue grows.

| Group | ID | Page(s) | Condition | Title | CTA |
|---|---|---|---|---|---|
| `SETUP` | `business-name-default` | `/settings` | `businessNameIsDefault === true` | Update your business name | Open settings → `/settings/business` |
| `POS` | `no-products-on-pos` | `/pos` | `productCount === 0` | No products yet | Add product → `/products/create` |
| `POS` | `no-variants-with-price` | `/pos` | `productCount > 0 && sellableVariantCount === 0` | Products need prices | Fix products → `/products` |
| `POS` | `empty-catalogue` | `/products` | `productCount === 0` | Catalogue is empty | Add product → `/products/create` |
| `POS` | `no-orders` | `/orders` | `hasOrders === false` | No orders yet | Go to POS → `/pos` |
| `INVENTORY` | `no-suppliers` | `/purchases` | `supplierCount === 0` | No suppliers yet | Add supplier → `/suppliers/create` |
| `INVENTORY` | `empty-inventory` | `/inventory` | `inventoryCount === 0` | Inventory is empty | Receive stock → `/purchases` |
| `INVENTORY` | `no-tasks` | `/tasks` | `taskCount === 0` | No tasks yet | Create task → `/tasks/create` |
| `BILLING` | `credits-low` | `/billing`, global | `creditBalance !== null && creditBalance <= threshold` | Running low on transactions | View billing → `/billing` |
| `BILLING` | `billing-not-connected` | `/billing` | `billingConnected === false && creditBalance === 0` | Credits used up | Connect billing → `/billing` |
| `EMPLOYEES` | `solo-team` | `/employees` | `employeeCount <= 1` | You're the only one here | Invite staff → `/employees/invite` |

The `SetupChecklist` on `/dashboard` renders groups as collapsible sections once the catalogue
exceeds ~15 tutorials. For Phase A the flat list is sufficient.

### 6.5 TutorialContext fields

```ts
interface TutorialContext {
  productCount: number
  sellableVariantCount: number      // variants with price > 0
  employeeCount: number
  hasOrders: boolean
  businessNameIsDefault: boolean    // true if name === '{DisplayName}\'s Business'
  billingConnected: boolean         // true if BusinessSubscription.externalId !== null
  creditBalance: number | null      // from authStore.entitlement.creditBalance
  creditLowThreshold: number        // from systemConfigs.CREDIT_LOW_BALANCE_THRESHOLD
  supplierCount: number
  inventoryCount: number
  taskCount: number
}
```

All fields are read from **offline collections** (already synced) — no extra server calls per
page load. The `useTutorials` hook reads from the same collections the page already uses.

### 6.6 SetupChecklist (dashboard view)

The `/dashboard` route uses the same `TutorialEngine` but renders results as a checklist
rather than corner `GuidanceBanner` toasts. This component is named `SetupChecklist` — the
name reflects its long-term responsibility: showing the user's overall setup progress, not
just the tutorial system specifically. As the platform evolves, the checklist may include
non-tutorial items (e.g. subscription activation, branch verification) while the tutorial
corner banners remain focused on page-specific actionable conditions.

```ts
// /dashboard passes a special 'dashboard' key to get all tutorials across all groups
TutorialEngine.evaluate('dashboard', context)
// returns full tutorial list, grouped by TutorialGroup, for the checklist overview
```

Each item shows: group label, title, resolved/unresolved state, CTA link.
A "You're all set" completion state renders when all conditions are resolved.

### 6.7 Lifecycle

```
User logs in
  → useTutorials assembles TutorialContext from collections
  → TutorialEngine.evaluate returns active tutorials
  → TutorialStore has no dismissals (fresh session)
  → First unresolved tutorial appears in corner

User clicks X on a tutorial
  → TutorialStore.dismiss(id) — session memory only
  → Banner disappears for this session
  → Reappears on next login (TutorialStore resets on logout)

User fulfills the condition (e.g. creates a product)
  → useTutorials re-evaluates (reactive — collection change triggers re-render)
  → Tutorial is no longer returned by TutorialEngine
  → Banner disappears permanently (until data changes again)
```

---

## 7. Hint System

### 7.1 Purpose

The Hint system shows users useful information about the app — tips, keyboard shortcuts,
feature highlights. Hints are not tied to app state. They auto-dismiss after a few seconds.
They rotate on a configurable schedule (default: once per day per hint). Contents are
managed in the database so they can be updated without deployment.

### 7.2 Architecture

```
Hint (DB model)
  id, title, body, page (nullable), isActive, sortOrder

HintLog (DB model)
  hintId, userId, shownAt
  — records when each hint was last shown to each user

HintEngine (pure domain object)
  selectHint(hints, logs, userId, frequencyDays, currentPage) → Hint | null
  — filters active hints for the current page (or global hints)
  — filters hints shown to this user within frequencyDays
  — returns the highest-priority eligible hint, or null if none due

useHints(page) hook (UI layer)
  — calls a server function to get the next eligible hint
  — server function: reads Hint table + HintLog for this user + SystemConfig frequency
  — calls HintEngine.selectHint
  — if a hint is returned, schedules auto-dismiss after HINT_DISPLAY_SECONDS
  — writes a HintLog entry after the hint is shown

GuidanceBanner component (hint variant)
  Corner toast — same position as tutorial variant
  Title + body (no CTA button, no X button)
  Auto-dismisses after HINT_DISPLAY_SECONDS (default: 6 seconds)
  Visually: neutral/muted border, informational styling
  Distinct from the tutorial variant: no action required, fades automatically
```

### 7.3 Hint DB model

```prisma
model Hint {
  id        String   @id @default(cuid())
  title     String
  body      String
  page      String?  // null = global (any page); "/pos" = POS only; "/products" = products only
  isActive  Boolean  @default(true)
  sortOrder Int      @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  logs      HintLog[]

  @@map("hints")
}

model HintLog {
  id      String   @id @default(cuid())
  hintId  String
  hint    Hint     @relation(fields: [hintId], references: [id], onDelete: Cascade)
  userId  String
  shownAt DateTime @default(now())

  @@index([userId, hintId])
  @@index([userId, shownAt])
  @@map("hint_logs")
}
```

### 7.4 ConfigKey additions

```prisma
HINT_FREQUENCY_DAYS     // Default: "1" — days between showing the same hint to the same user
HINT_DISPLAY_SECONDS    // Default: "6" — seconds before auto-dismiss
```

### 7.5 Hint selection logic (HintEngine)

```
Given: active hints for page, HintLog entries for this user, frequencyDays, now
  1. Filter hints to: page === null OR page === currentPage
  2. Filter hints to: isActive === true
  3. Exclude hints where the most recent HintLog.shownAt is within frequencyDays
  4. Sort remaining by sortOrder ASC
  5. Return first result, or null if none eligible
```

The engine is pure — it receives all data as parameters. No DB reads inside the engine.
The `useHints` hook is responsible for fetching data and calling the engine.

**Future prioritization evolution:** The current `sortOrder` field is sufficient for Phase A.
The `HintEngine.selectHint` signature is designed to accept the full hint list as a parameter,
which means future prioritization strategies — weighted rotation, campaign-scoped hints,
seasonal content, or user-segment targeting — can be implemented by enriching the `Hint`
model and the engine's selection logic without changing any call site. The schema addition
of a `priority` field or a `campaignId` FK on `Hint` is a non-breaking additive migration
when that capability is needed.

### 7.6 Initial hint seed data

Seeded in `prisma/seeders/hints.ts`. Phase A ships with 10 starter hints covering the most
useful tips across POS, products, reports, and settings.

Example hints:

| Page | Title | Body |
|---|---|---|
| `/pos` | Quick item search | Start typing a product name to filter instantly — no need to scroll. |
| `/pos` | SC/PWD discounts | Select a customer type on the payment screen to apply SC/PWD discounts automatically. |
| `/products` | Bulk variants | Add multiple variants (size, flavor) to a single product from the variants tab. |
| `/sales-reports` | Export to CSV | Click the download icon on any report to export the data as a CSV file. |
| `/inventory` | Low stock alerts | Set a reorder threshold on a variant to get notified when stock runs low. |
| global | Offline mode | StartPOS works without internet. Transactions sync automatically when you reconnect. |
| global | Keyboard shortcuts | Press `/` anywhere in the POS to focus the search bar instantly. |

### 7.7 Future admin UI (Phase C)

The `Hint` table is designed for a future admin interface where platform operators can:
- Create, edit, and deactivate hints without deploying code
- Set page scope, display order, and active status
- View impression counts (aggregated from `HintLog`)
- Configure frequency via `SystemConfig.HINT_FREQUENCY_DAYS`

The schema is ready. The admin UI is a Phase C deliverable.

---

---

## 8. Server-Side: `complete-registration` Server Function

**Location:** `src/lib/queries/complete-registration.ts`

Called once per new user — immediately after the register form submits (email/password) or
after the OAuth interstitial submits. Atomically creates the complete tenant record.

### 8.1 Input

```ts
interface CompleteRegistrationInput {
  userId: string           // from better-auth session
  displayName: string      // from form or OAuth provider
  businessName: string     // from form or OAuth interstitial
  businessType: BusinessType
}
```

### 8.2 Transaction sequence

```
Single rootPrisma.$transaction:

  1. Create Business
       id: cuid()
       name: businessName
       slug: generateSlug(businessName)  ← unique; append -2, -3 on collision
       businessType: businessType

  2. Create Branch
       id: cuid()
       name: 'Main Branch'
       businessId: business.id
       country: 'PH'  (default; editable in Settings)
       serialNumber: generateSerialNumber()
       branchCode: '00001'

  3. Create Membership
       userId: userId
       businessId: business.id
       branchId: branch.id
       role: ADMIN

  4. Create SystemConfig defaults (BUSINESS scope)
       — apply business-type defaults (see table below)
       — all 7 config keys written in one batch

  5. Provision BusinessSubscription
       — SubscriptionEngine.buildInitialSubscription(
           businessId, trialPlanId, PREPAID_CREDITS, thresholds, now
         )
       — same code path as getAuthUser trial auto-provisioning (Phase 0)

  6. Grant 50 complimentary transactions
       — Insert CreditLedger:
           eventType = PROMOTIONAL
           amount = 50
           balanceAfter = 50
           businessId = business.id
           actorId = userId

  7. Return { businessId, branchId }
```

### 8.3 SystemConfig defaults by business type

| ConfigKey | RESTAURANT | GROCERY | RETAIL |
|---|---|---|---|
| `PRICE_CONFIGURATION` | `INCLUSIVE` | `EXCLUSIVE` | `EXCLUSIVE` |
| `IS_VAT_REGISTERED` | `true` | `true` | `false` |
| `ENABLE_ORDER_TAB` | `true` | `false` | `false` |
| `ENABLE_ORDER` | `true` | `false` | `true` |
| `ENABLE_CASH_RECONCILIATION` | `true` | `true` | `true` |
| `ENABLE_TASK` | `true` | `true` | `true` |
| `ENABLE_PRINT_RECEIPT` | `true` | `true` | `true` |

All values editable later in Settings. These are sensible defaults, not locked configuration.

**Future evolution — Business Templates:** The direct mapping from `BusinessType` to
`SystemConfig` defaults is the correct Phase A implementation. As the platform grows, this
mapping may evolve into a formal `BusinessTemplate` abstraction that encapsulates not only
default configuration but also suggested workflows, starter catalogue items, receipt
configuration, and default operational preferences. When that abstraction is introduced,
`complete-registration` should source its `SystemConfig` defaults from the template rather
than from this hardcoded table. The table above is the Phase A source of truth and the
natural specification for the first template records.

### 8.4 Session refresh after registration

**Desired outcome:** immediately after `complete-registration` commits, the user's active
better-auth session must carry the newly created `businessId` and `branchId`. On the next
call to `getAuthUser`, it must return a complete `ServerUser` — not `undefined`.

The existing `databaseHooks.session.create.before` in `auth.ts` already reads `Membership`
and injects `businessId`/`branchId` into any new session. The session refresh mechanism
should leverage whichever better-auth capability most naturally produces a new session after
a membership is created — whether that is a session refresh API, a token rotation hook, or
a silent re-authentication. The specific mechanism is an implementation-time decision.

The user must never see a logout screen. The transition from registration to `/dashboard`
must feel instantaneous.

### 8.5 Idempotency

`Membership` has `@@unique([userId, businessId])`. A double-submit triggers a DB constraint
conflict on step 3. The handler catches this and returns the existing `businessId`/`branchId`
rather than failing. The user proceeds normally.

### 8.6 Future integration point — Activity / Audit log

`complete-registration` creates a significant platform event: a new tenant is live. If the
platform introduces an Activity or Audit Log domain in the future (e.g. `BusinessActivity`
or `AuditEvent` model), the following events should be recorded at registration time:

- `BUSINESS_CREATED` — businessId, businessName, businessType, createdAt
- `SUBSCRIPTION_PROVISIONED` — businessId, planId, billingModel, creditAmount
- `REGISTRATION_COMPLETED` — userId, businessId, registrationMethod (EMAIL / GOOGLE / FACEBOOK)

These are not Phase A requirements. No Activity model exists in the current schema.
This note exists so that when such a system is introduced, the registration server function
is the canonical place to emit these events — not a webhook, not a background job.

---

## 9. Dashboard — Management Overview

**Route:** `src/routes/(private)/(dashboard)/index.tsx`
**Accessible to:** ADMIN, SUPERVISOR
**Capability requirement:** Management capabilities only (included in Trial from day one)

### 9.1 Components

**SetupChecklist** — the dashboard view of the Tutorial system (see Section 6.6)
- Renders all tutorials from `TutorialEngine.evaluate('dashboard', context)` grouped by `TutorialGroup`
- Each item shows: group, title, resolved/unresolved state, CTA link
- "You're all set" completion state when all conditions are resolved
- Not dismissible — always visible until all conditions are met
- Name reflects long-term responsibility: overall setup progress, not just tutorial state

**QuickStatCards**
- Total products in catalogue
- Total team members
- Transactions processed today
- Current credit balance (or subscription status)

**QuickActions**
- "Add product" → `/products/create`
- "Invite employee" → `/employees`
- "View billing" → `/billing`

### 9.2 RoleLandingPages update

```ts
export const RoleLandingPages: Record<Role, string> = {
  [Role.ADMIN]: '/dashboard',        // ← changed from /employees
  [Role.SUPERVISOR]: '/sales-reports',
  [Role.CASHIER]: '/pos',
  [Role.SERVICE_PROVIDER]: '/',
}
```

---

## 10. Schema Changes

### 10.1 New models

```prisma
model Hint {
  id        String    @id @default(cuid())
  title     String
  body      String
  page      String?   // null = global; "/pos" = POS only
  isActive  Boolean   @default(true)
  sortOrder Int       @default(0)
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  logs      HintLog[]

  @@map("hints")
}

model HintLog {
  id      String   @id @default(cuid())
  hintId  String
  hint    Hint     @relation(fields: [hintId], references: [id], onDelete: Cascade)
  userId  String
  shownAt DateTime @default(now())

  @@index([userId, hintId])
  @@index([userId, shownAt])
  @@map("hint_logs")
}
```

### 10.2 New ConfigKey values

```prisma
enum ConfigKey {
  // ... existing keys ...

  // --- GUIDANCE SYSTEM ---
  HINT_FREQUENCY_DAYS     // Default: "1" — days between repeating the same hint per user
  HINT_DISPLAY_SECONDS    // Default: "6" — auto-dismiss duration in seconds
}
```

### 10.3 New BillingModel values

```prisma
enum BillingModel {
  MONTHLY_SUBSCRIPTION
  PREPAID_CREDITS
  HYBRID
  COMPOSABLE_FEATURES
  YEARLY_SUBSCRIPTION    // ← new: annual billing cycle (Phase B)
}
```

`LIFETIME_LICENSE` is deferred indefinitely — not added to the schema until the business
model is defined.

### 10.4 Migration summary

| Migration | Change | Required for |
|---|---|---|
| Migration 16a | Add `Hint`, `HintLog` models; add `HINT_FREQUENCY_DAYS`, `HINT_DISPLAY_SECONDS` to `ConfigKey` | Phase A |
| Migration 16b | Add `YEARLY_SUBSCRIPTION` to `BillingModel` | Phase B |

No existing tables are modified. All changes are additive.

---

## 11. Implementation Phases

---

### Phase A — Registration + Tutorial + Hint Foundation

**Objective:** Self-serve registration via email/password, Google, and Facebook. Business
created atomically at registration. User enters the app immediately. Tutorial system active
with full catalogue. Hint system active with seeded initial hints. `/dashboard` live.

**Deliverables:**
- [ ] `auth.ts` — Google + Facebook `socialProviders`
- [ ] `auth-client.ts` — `socialClient` plugin
- [ ] `/register` — email/password form + business name + business type + OAuth buttons
- [ ] `/register/business-setup` — 2-field OAuth interstitial (business name + type)
- [ ] `(private)/route.tsx` — redirect to `/register/business-setup` when session exists but no Membership
- [ ] `complete-registration` server function — full atomic tenant creation
- [ ] Session refresh after registration
- [ ] `TutorialEngine` — pure engine, full tutorial catalogue
- [ ] `TutorialStore` — session-scoped dismiss state
- [ ] `useTutorials(page)` hook
- [ ] `TutorialBanner` component — corner toast with CTA + dismiss
- [ ] `HintEngine` — pure engine, selection logic
- [ ] `useHints(page)` hook + server function to fetch eligible hint
- [ ] `HintBanner` component — auto-dismiss corner toast, informational style
- [ ] `/dashboard` — `TutorialChecklist` + `QuickStatCards` + `QuickActions`
- [ ] `RoleLandingPages[ADMIN]` → `/dashboard`
- [ ] Migration 16a — `Hint`, `HintLog`, new `ConfigKey` values
- [ ] `prisma/seeders/hints.ts` — initial 10 hints
- [ ] `.env.example` — 4 new OAuth env vars

**New files:**
```
src/routes/(public)/register.tsx
src/routes/(public)/register/business-setup.tsx
src/routes/(private)/(dashboard)/index.tsx
src/lib/tutorial/tutorial-engine.ts
src/lib/tutorial/tutorial-definitions.ts      ← TutorialDefinition catalogue, grouped by TutorialGroup
src/lib/tutorial/tutorial-store.ts
src/lib/tutorial/tutorial-types.ts            ← TutorialDefinition, TutorialContext, TutorialGroup types
src/hooks/use-tutorials.ts
src/lib/hint/hint-engine.ts
src/lib/hint/hint-types.ts
src/hooks/use-hints.ts
src/lib/server-fn/fetch-eligible-hint.ts
src/components/guidance-banner.tsx            ← shared corner-toast primitive (tutorial + hint variants)
src/components/setup-checklist.tsx            ← dashboard grouped setup progress component
src/lib/queries/complete-registration.ts
prisma/seeders/hints.ts
```

**Files to modify:**
```
src/lib/better-auth/auth.ts              ← socialProviders
src/lib/better-auth/auth-client.ts       ← socialClient plugin
src/routes/(private)/route.tsx           ← /register/business-setup redirect
src/lib/better-auth/auth-server.ts       ← RoleLandingPages[ADMIN] → /dashboard
prisma/schema.prisma                     ← Migration 16a
.env.example                             ← OAuth env vars
routeTree.gen.ts                         ← regenerated
```

**No new domain engines for billing** — `complete-registration` reuses
`SubscriptionEngine.buildInitialSubscription` (Phase 0) and `CreditLedger` pattern (Phase 3).

---

### Phase B — Stripe at Billing + Annual Plan

**Objective:** `/billing` upgrade flow supports plan selection and monthly/annual choice.
Annual `BillingModel` activated.

**Deliverables:**
- [ ] `/billing` — plan selection cards (Starter / Professional / Enterprise)
- [ ] `/billing` — billing preference choice (Monthly / Annual)
- [ ] `create-subscription.ts` — annual billing support + introductory promotion option
- [ ] Billing model switch on Stripe checkout completion (webhook already handles it)
- [ ] Migration 16b — `YEARLY_SUBSCRIPTION` to `BillingModel`

---

### Phase C — Hint Admin + Email Verification + Polish

**Objective:** Platform operators can manage hints via admin UI. Email verification added.

**Deliverables:**
- [ ] Admin UI for `Hint` table (CRUD — create, edit, deactivate, reorder)
- [ ] `HintLog` impression aggregates on admin hint list
- [ ] `SystemConfig` UI for `HINT_FREQUENCY_DAYS` and `HINT_DISPLAY_SECONDS`
- [ ] Email verification (`emailVerification` plugin in better-auth)
- [ ] Welcome email on registration (`sendEmail` callback)
- [ ] Apple Sign-In (requires Apple Developer account, separate review process)

---

## 12. Decisions Made

| Decision | Rationale |
|---|---|
| Every registration produces a fully operational tenant | Eliminates the "partially registered" state entirely. `getAuthUser` returns complete `ServerUser` or `undefined` — nothing in between. The rest of the platform needs no special handling for new users. |
| Business created at registration — no wizard gate | Users see the app immediately. The Tutorial and Hint systems guide from inside the app. Patience is never tested by a pre-entry form. |
| OAuth = 2-field interstitial, not a full wizard | OAuth cannot supply business data. Two fields (name + type) are the minimum required to create a meaningful business record. Under 10 seconds of friction before the app opens. |
| Tutorial and Hint are two separate systems | Different lifecycles, different data models, different user intents. Merging them creates coupling that makes both harder to maintain and extend. |
| Tutorial defined in code, Hint in DB | Tutorial conditions are app logic — they belong in code. Hint content is editorial — it belongs in a DB so platform operators can update it without deployment. |
| `GuidanceBanner` as the shared corner-toast primitive | A single component serves both systems with different visual variants. Naming it after neither system keeps it reusable as the platform's guidance surface grows. |
| `SetupChecklist` rather than TutorialChecklist | The dashboard checklist's long-term responsibility is overall setup progress — not just the tutorial system. The name should reflect that broader scope. |
| `TutorialGroup` for catalogue organisation | A flat list of 11+ tutorials becomes hard to maintain and impossible to display well. Groups provide organisation at definition time (code) and at render time (dashboard sections). |
| `TutorialStore` is session-only, no DB | Tutorials reappear each login until resolved. No write path needed. No migration needed. Session memory is sufficient and correct. |
| `HintLog` is in DB | Frequency enforcement ("once per day") requires knowing when a hint was last shown to a specific user across sessions. Session memory cannot survive a logout. |
| `sortOrder` for Phase A hint priority; extensible for future strategies | Phase A needs simple sequential ordering. The `HintEngine.selectHint` signature accepts the full list as a parameter — future weighted rotation, campaigns, or targeting are additive changes to the model and engine, not architectural rewrites. |
| BusinessType defaults as Phase A implementation of future Business Templates | The direct mapping is the correct scope for Phase A. The table doubles as the specification for the first template records if/when a `BusinessTemplate` abstraction is introduced. |
| Session refresh describes intent, not mechanics | better-auth's session infrastructure is the right place to determine the exact refresh strategy. The architecture specifies the desired outcome; the implementation chooses the mechanism. |
| Activity/audit log is a future integration point | `complete-registration` is the canonical place to emit tenant creation events. Documenting this now prevents the events from being scattered across webhooks and jobs when an Activity domain is introduced. |
| `YEARLY_SUBSCRIPTION` in schema, `LIFETIME_LICENSE` deferred | Annual billing is a concrete product decision. Lifetime licensing has undefined business model implications. Not in schema until those are resolved. |
| 50 free credits, non-expiring | The existing upgrade funnel (low-balance notification → upgrade banner) handles conversion naturally. No expiry mechanism, migration, or job needed. |
| Payment not required at registration | Reduces abandonment. The 50 complimentary transactions give users real value before any payment decision is required. |

---

## 13. Open Questions

| Question | Status | Notes |
|---|---|---|
| Free credits billing model | ✅ Closed | `PREPAID_CREDITS` at registration; switches to `MONTHLY_SUBSCRIPTION` on payment connection |
| Credit expiry | ✅ Closed | Non-expiring. No schema change needed. |
| OAuth providers | ✅ Closed | Google + Facebook in Phase A. Apple deferred to Phase C. |
| Plans vs billing separation | ✅ Closed | Plan selection and billing preference are separate steps in `/billing`. |
| Tutorial blocking vs non-blocking | ✅ Closed | Non-blocking. `GuidanceBanner` corner toast. Session-dismissed. |
| Hint frequency default | ✅ Closed | Once per day (`HINT_FREQUENCY_DAYS = "1"`). Configurable via `SystemConfig`. |
| Hint content management | ✅ Closed | DB-backed. Admin UI in Phase C. |
| `LIFETIME_LICENSE` | ✅ Closed | Deferred indefinitely. Not in schema until business model is defined. |
| Session refresh mechanism | Open — implementation-time | Use the most appropriate better-auth capability. Desired outcome: `getAuthUser` returns a complete `ServerUser` immediately after registration, with no visible logout. |
| Slug collision handling | Open — implementation detail | Append `-2`, `-3` in `complete-registration`. |
| Introductory promotion amount | Open — Phase B | Configurable via `SystemConfig`. Default value TBD. |
| Welcome email content | Open — Phase C | Requires copywriting decision. |
| Activity/Audit log events | Open — future domain | Registration events documented in Section 8.6. No action until Activity domain is introduced. |
| Business Template abstraction | Open — future domain | Phase A uses direct BusinessType → SystemConfig mapping. Template abstraction documented in Section 8.3. No action until a second business type set requires it. |

---

## 14. Scope Discipline

This document covers exactly two things: the registration flow and the in-app guidance system.
It does not introduce new billing capabilities, new entitlement rules, new notification types,
or new operational features. Every item in the Phase A and Phase B deliverable lists is
strictly necessary to achieve the objectives stated in those phases.

Future ideas that arose during planning and were explicitly deferred:
- `BusinessTemplate` abstraction (Section 8.3)
- Activity / Audit log (Section 8.6)
- Advanced hint prioritization / campaigns (Section 7.5)
- Apple Sign-In (Phase C)
- Email verification (Phase C)
- `LIFETIME_LICENSE` billing model (indefinitely deferred)

None of these should be added to Phase A or Phase B scope without a deliberate architecture
decision. The platform is built incrementally. The deferral boundary is clean.

---

*End of REGISTRATION_ONBOARDING_PLAN.md*
*StartPOS — Acquisition Funnel + In-App Guidance System*
*Revised: August 1, 2026 (v4 — final architecture review)*
*Status: Final — ready for Phase A implementation*
