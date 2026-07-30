# Architectural Audit — Operational Domain
## Discovery Phase — Task · Purchase · Notification

> **Scope:** Task, Purchase, Notification domains and all modules they interact with.
> **Mode:** Documentation and discovery only. No code changes. No redesign proposals.
> **Date:** July 30, 2026

---

## Table of Contents

1. [High-Level Architecture](#part-1--high-level-architecture)
2. [Current Workflow Analysis](#part-2--current-workflow-analysis)
3. [Domain Models](#part-3--domain-models)
4. [Engine Interaction](#part-4--engine-interaction)
5. [Event Flow](#part-5--event-flow)
6. [Operational Flow](#part-6--operational-flow)
7. [UI Architecture](#part-7--ui-architecture)
8. [Business Rules](#part-8--business-rules)
9. [Coupling Analysis](#part-9--coupling-analysis)
10. [Architectural Gaps](#part-10--architectural-gaps)
11. [Strengths](#part-11--strengths)
12. [Final Summary](#part-12--final-summary)

---

## Part 1 — High-Level Architecture

### Platform Overview

This is a local-first, multi-tenant POS (Point of Sale) platform built with:

- **Framework:** TanStack Router/Start (React, SSR-capable)
- **ORM:** Prisma (PostgreSQL on server, SQLite-WASM/OPFS on client)
- **Auth:** better-auth
- **Local sync:** TanStack DB with `createSyncableCollection`, persisted via `@tanstack/browser-db-sqlite-persistence`
- **State:** TanStack Store (`authStore`), TanStack Query for server sync
- **Forms:** TanStack Form with Zod validators
- **Transactions:** `dbTransaction` wraps all multi-collection mutations; syncs atomically to the server via `transactionAPI`
- **Cross-tab sync:** `BroadcastChannel("db_sync")` — mutations in one tab propagate to other tabs automatically


### Multi-Tenancy Architecture

Every read and write operation is scoped by `businessId` and `branchId`. The `multiTenantExtension` Prisma extension auto-injects these fields on all writes and enforces them on all reads via a `where` clause. The `crudAPI` proxy (used by all collections) calls `getTenantPrisma(businessId, branchId)` which applies this extension. The schema-level `SCHEMA_METADATA` table tracks which models carry `hasOrg` (businessId) and `hasBranch` (branchId) flags so the extension can recurse into nested relation creates.

The `transactionAPI` runs operations inside a Prisma `$transaction`, using the root prisma instance (without tenant extension) — relying on `crudAPI` to have already scoped inputs.

---

### Domain Responsibility Map

| Domain             | Owns                                                          | Does NOT own                                |
|--------------------|---------------------------------------------------------------|---------------------------------------------|
| **Task**           | OperationalTask lifecycle, role-based state machine, inventory side-effects on FULFILLED | Purchase creation, payment, notification delivery |
| **Purchase**       | Purchase header + line items, inventory IN movement, variant cost update | Task creation, notifications, approval workflow |
| **Notification**   | Notification records, delivery (insert to collection), read-state | Who receives (caller decides), business rules for when to send |
| **Inventory**      | Inventory batches, InventoryMovement audit trail, FIFO costing | Task assignment, purchase approval |
| **Session**        | VendorSession open/close lifecycle, cash reconciliation task ownership | Notification content, inventory adjustments |
| **Employee/User**  | User records, roles, Membership, Session (auth) | Task assignment logic (done by creator at task creation) |
| **Entitlement**    | Capability evaluation, plan/tier enforcement, override management | UI rendering decisions, data fetching |
| **Auth**           | Session tokens, online/offline login, supervisor override flow | Entitlement decisions (delegates to EntitlementEngine) |

---

### Module Dependency Graph

```
AuthEngine ──────────────> better-auth (server)
                          └─> getAuthUser
                              └─> EntitlementEngine.buildSummary
                                  └─> PlanEntitlement + EntitlementOverride (DB)

Task UI ──────────────────> task-workflow.ts (state machine)
                          └─> operationalTaskCollection (local DB)
                          └─> inventoryCollection + inventoryMovementCollection (on FULFILLED)
                          └─> NotificationEngine (auto-task on low stock)

Purchase UI ──────────────> create-purchase.ts
                          └─> purchaseCollection + purchaseItemCollection
                          └─> inventoryCollection (upsert batch)
                          └─> inventoryMovementCollection (IN movement)
                          └─> productVariantCollection (cost update)

NotificationEngine ───────> notificationCollection (insert)
                          └─> operationalTaskCollection (auto-create SHELF_REFILL)
                          └─> inventoryCollection (stock level check)
                          └─> membershipCollection (find ADMIN/SUPERVISOR recipients)

VendorSession ────────────> operationalTaskCollection (CASH_RECONCILIATION task)
                          └─> vendorSessionCollection
                          └─> NotificationEngine (shift-close notification)
                          └─> transactionCollection (expected cash calculation)
```


---

## Part 2 — Current Workflow Analysis

### 2.1 Task Workflow

#### Creation

Tasks are created in two ways:

**Manual (user-initiated):**
1. User navigates to `/tasks` and clicks "Add Task"
2. `CreateTaskSidebar` renders the `CreateTask` form
3. Form uses a discriminated-union Zod schema (7 task types, each with type-specific metadata fields)
4. On submit: `operationalTaskCollection.insert(...)` — status is always `PENDING` on manual creation
5. `creatorId` = current user; `approverId` + `clerkId` are optionally pre-assigned at creation time
6. No server function call — pure local-first collection insert that syncs to the server via `transactionAPI`

**System-initiated (NotificationEngine):**
1. `NotificationEngine.checkLowStock(variantIds)` is called (caller not traced — presumably after POS checkout)
2. Inventory sums are computed from `inventoryCollection`
3. If `currentTotal <= threshold`, a `SHELF_REFILL` task is auto-created at status `IN_PROGRESS` (bypassing DRAFT/PENDING/APPROVED) with `approverId`, `clerkId`, and `approvedAt` all set to the current user
4. A `LOW_STOCK` notification is sent to all ADMIN/SUPERVISOR members

#### State Machine

```
DRAFT ──────────────────────────────────────────────────> [terminal]
  │
  └── Submit for Approval ──> PENDING
                                │
              ┌─────────────────┴──────────────────┐
              ▼                                     ▼
           APPROVED                            CANCELLED [terminal]
              │
              └── Start Execution ──> IN_PROGRESS
                                          │
                              ┌───────────┴───────────┐
                              ▼                       ▼
                          FULFILLED              CANCELLED [terminal]
                              │
                              └── Verify & Lock ──> REVIEWED [terminal]
```

**Special case — GENERAL_CHORE:**
- Skips the APPROVED step
- PENDING → IN_PROGRESS directly (as if APPROVED→IN_PROGRESS config is reused)

#### Assignment

- `clerkId`: the employee who will physically execute the task
- `approverId`: the manager who must approve it
- `reviewerId`: the post-completion auditor
- All are optional at creation. The details tab allows editing `clerkId`, `approverId`, `reviewerId` inline via SelectInput if the task has not yet passed approval

#### Approval

- Any user with role `SUPERVISOR` or `ADMIN` can approve (role check in `TRANSITION_UI_CONFIG`)
- If `approverId` is set, only that specific user can approve (strict identity check in `checkWorkflowPermission`)
- On approval: `approverId` and `approvedAt` are set on the task record

#### Execution (IN_PROGRESS → FULFILLED)

- Any user with `CASHIER`, `SUPERVISOR`, or `ADMIN` role can start execution
- If `clerkId` is set, only that user can advance to IN_PROGRESS or FULFILLED
- On transition to `IN_PROGRESS`: `clerkId` defaults to current user if not pre-assigned; `inProgressAt` is set
- On transition to `FULFILLED`: `fulfilledAt` is set; **inventory side-effects execute immediately in the same `dbTransaction`**

#### Inventory Side-Effects on FULFILLED

| Task Type         | Side Effect                                                      |
|-------------------|------------------------------------------------------------------|
| SHELF_REFILL      | Deduct from `sourceLocationId` batch; upsert into `targetLocationId` batch; create `ADJUST` InventoryMovement |
| BRANCH_TRANSFER   | Deduct from current branch inventory; create `ADJUST` InventoryMovement with `targetBranchId` |
| STOCK_COUNT       | Set inventory quantity to `suggestedQty` (physical count); create `ADJUST` InventoryMovement with diff |
| WASTE_DISPOSAL    | Deduct from batch at `locationId`; create `OUT` InventoryMovement |
| PURCHASE_REQUEST  | No inventory side-effects at FULFILLED (purchase is a separate flow) |
| CASH_RECONCILIATION | No inventory side-effects |
| GENERAL_CHORE    | No inventory side-effects |

#### Completion / Review

- `SUPERVISOR` or `ADMIN` role required
- If `reviewerId` is set, only that user can review
- On `REVIEWED`: `reviewerId` and `reviewedAt` are set; state is terminal and locked

#### Cancellation

- `SUPERVISOR` or `ADMIN` role required
- Cancellation rules: if both `approverId` and `reviewerId` are set, only one of them can cancel
- If only `approverId` is set, only that user can cancel
- On `CANCELLED`: `cancelerId` and `canceledAt` are set; terminal state

#### Deletion

- Any user can delete a task directly from the list view via `operationalTaskCollection.delete(id)`
- No confirmation of workflow state — tasks in any status can be deleted
- No audit trail is created for deletion


---

### 2.2 Purchase Workflow

#### Creation

**Path 1 — Full Purchase Order (`/purchases/create`):**
1. User fills `CreatePurchaseSidebar`: supplier, reference/notes, line items (variant + qty + unit + unitCost)
2. On submit: calls `createPurchase(data)`
3. `createPurchase` runs inside `dbTransaction`:
   - Inserts purchase header (`purchaseCollection`) with a structured PO number from `SequenceCounter`
   - Inserts one `PurchaseItem` per line
   - Updates `productVariant.costPrice` to `unitCost` (overwrites previous cost — no cost history)
   - Upserts inventory batch keyed by `PO-{structuredId}` (adds to existing batch if same PO, creates new batch otherwise)
   - Creates `IN` InventoryMovement for each line item, linked to the purchase
4. No task created, no notification sent, no approval required

**Path 2 — Quick Restock (`/ingredients/{id}` → Restock button):**
1. `RestockIngredientSidebar` — same underlying logic but adds `locationId`, `batchNumber`, `expiryDate` fields
2. Calls `restockIngredient(data)` which follows the same pattern as `createPurchase`
3. Also uses `SequenceType.PURCHASE` for the structured ID
4. Returns hydrated purchase, inventory, and movement records

#### Voiding

1. User clicks "Void Purchase" in `PurchaseDetailsSidebar`
2. `WarningPrompt` confirmation dialog shown
3. Calls `voidPurchase(purchaseId)` inside `dbTransaction`:
   - Marks purchase notes as `[VOIDED] {original notes}`
   - Finds all `IN` movements linked to this purchase
   - Decrements each inventory batch by the movement quantity (floor at 0)
   - Creates corresponding `OUT` InventoryMovements with reason `Void: {PO number}`
   - Fallback: if no movements exist, looks up batch by `PO-{purchaseId}` and decrements directly

**There is no approval, cancellation, or receiving workflow — purchase creation is immediate and irrevocable (only void available).**

#### Status

Purchase has **no status field**. The only state indicator is the `notes` field prefix `[VOIDED]`. There is no DRAFT, PENDING, APPROVED, or RECEIVED state on a purchase.

#### Link to Tasks

- `Purchase.operationalTaskId` field exists in the schema
- **Never populated in any code path** — always set to `null`
- The field implies a planned link between `PURCHASE_REQUEST` tasks and Purchase records, but this link is not implemented

---

### 2.3 Notification Workflow

#### Creation

Notifications are created only by `NotificationEngine.send()`. Two call sites exist:

1. **Low Stock Alert** — called from `NotificationEngine.checkLowStock()`
   - Creates `LOW_STOCK` notifications to all ADMIN/SUPERVISOR members
   - Also creates a `SHELF_REFILL` task automatically

2. **Shift Close Notification** — called from `ReconcileLater` when a cashier ends their shift
   - Creates `COMPLIANCE_REMINDER` notifications to all ADMIN/SUPERVISOR members
   - Payload includes `vendorSessionId`, `taskId`, expected cash, and actual cash

#### Delivery

- Delivery is synchronous and in-process: `notificationCollection.insert(notifications)` inside the same `dbTransaction`
- No push notification, no email, no webhook — purely in-app
- Recipients must be online and on the same branch for the notification to appear in real time (cross-tab BroadcastChannel handles multi-tab scenarios)

#### Persistence

- Notifications are stored in `notificationCollection` (local SQLite) and synced to PostgreSQL via the standard `crudAPI`
- No expiry, no TTL, no automatic cleanup
- No scheduled deletion job exists

#### Read State

- `isRead: Boolean` field on each notification
- `markAsRead(notification)` — updates single notification via `notificationCollection.update`
- `markAllRead()` — iterates all unread and updates each individually (no batch update)
- Read state change is reflected immediately in UI via reactive `useLiveQuery`

#### Dismissal / Cleanup

- No dismissal mechanism exists (no delete button in the UI)
- No bulk delete
- No archive

#### UI Delivery

- Notification bell in the dashboard header — shows unread count badge
- Clicking navigates to `/notifications` page
- Page uses `useLiveInfiniteQuery` with `pageSize=20` and scroll-based pagination (IntersectionObserver)
- First click on an unread notification marks it as read; second click navigates to `notification.link`
- "Mark all as read" button available when `unreadCount > 0`


---

## Part 3 — Domain Models

### 3.1 OperationalTask

**Purpose:** Represents a physical store operation that must be assigned, approved, executed, and audited.

**Prisma Model:**
```prisma
model OperationalTask {
  id      String     @id @default(cuid())
  type    TaskType
  status  TaskStatus @default(DRAFT)
  notes   String?
  dueDate DateTime?

  creatorId  String?   // User who created it
  approverId String?   // Manager who must approve
  clerkId    String?   // Employee who executes
  reviewerId String?   // Supervisor who audits post-completion
  cancelerId String?   // User who cancelled

  metadata Json?      // Type-specific payload (see TaskMetadata)

  approvedAt   DateTime?
  inProgressAt DateTime?
  fulfilledAt  DateTime?
  reviewedAt   DateTime?
  canceledAt   DateTime?

  purchases          Purchase[]
  vendorSessions     VendorSession[]
  inventoryMovements InventoryMovement[]

  businessId String
  branchId   String
  createdAt  DateTime
  updatedAt  DateTime
}
```

**TaskMetadata interface (from `src/lib/types.ts`):**
```typescript
interface TaskMetadata {
  link?: string
  vendorSessionId?: string
  sourceLocation?: string        // Display label (not ID)
  targetLocation?: string        // Display label (not ID)
  variantId?: string | null
  movementId?: string
  currentTotal?: number
  suggestedQty?: number          // Proposed qty (set at creation)
  approvedQty?: number           // Authorized qty (set at approval — currently same as suggestedQty)
  verifiedQty?: number | null    // Confirmed qty (post-execution — currently unused)
  expectedCash?: number | null   // Cash reconciliation
  approvedCash?: number | null
  verifiedCash?: number | null
  variance?: number
  sourceLocationId?: string      // Location UUID
  targetLocationId?: string      // Location UUID
  targetBranchId?: string
  locationId?: string
  supplierId?: string
  batchNumber?: string
}
```

**Enums:**

```
TaskType:
  SHELF_REFILL        — Bodega to front shelf movement
  PURCHASE_REQUEST    — Request for external supplier delivery
  BRANCH_TRANSFER     — Move stock between branches
  STOCK_COUNT         — Physical inventory audit
  WASTE_DISPOSAL      — Write off damaged/expired goods
  CASH_RECONCILIATION — Audit the cash drawer after a shift
  GENERAL_CHORE       — Miscellaneous operational task

TaskStatus:
  DRAFT       — Saved locally, not yet submitted
  PENDING     — Awaiting management review
  APPROVED    — Authorized, ready for execution
  IN_PROGRESS — Clerk has begun physical work
  FULFILLED   — Physical work complete, DB updated
  REVIEWED    — Post-audit complete, locked
  CANCELLED   — Terminal, rejected or scrapped
```

**Lifecycle:**
- Created at `PENDING` (manual) or `IN_PROGRESS` (system auto-gen from low stock)
- Progress tracked via timestamps: `approvedAt`, `inProgressAt`, `fulfilledAt`, `reviewedAt`, `canceledAt`
- `dueDate` is set but never enforced programmatically — only displayed in UI with "Overdue" indicator

**Relationships:**
- `creator`, `approver`, `clerk`, `reviewer`, `canceler` → User (5 separate FK relations)
- `inventoryMovements` → InventoryMovement (1:many via `operationalTaskId`)
- `vendorSessions` → VendorSession (1:1 via `operationalTaskId` unique constraint — only CASH_RECONCILIATION)
- `purchases` → Purchase (1:many via `operationalTaskId` — never populated in current code)

**Indexes:** `(businessId, branchId, status)`, `(type)`, `(clerkId)`, `(reviewerId)`


---

### 3.2 Purchase / PurchaseItem

**Purpose:** Records a stock acquisition event from a supplier, with full line-item detail and inventory audit trail.

**Prisma Models:**
```prisma
model Purchase {
  id         String  @id
  purchaseId String           // Structured display ID (e.g. PO-2025-0001)
  totalCost  Int              // Sum of (unitCost × qty) for all items, in cents
  notes      String?          // Also used as void flag: "[VOIDED] ..."

  supplierId        String?
  operationalTaskId String?   // FK to OperationalTask — never populated currently

  businessId String
  branchId   String
  createdAt  DateTime
  updatedAt  DateTime
}

model PurchaseItem {
  id         String
  purchaseId String            // FK to Purchase
  variantId  String            // FK to ProductVariant
  quantity   Float
  unitId     String            // FK to Unit
  unitCost   Int               // Cost per unit at time of purchase, in cents

  businessId String
  branchId   String
}
```

**Lifecycle:**
- Created atomically with its line items and inventory movements
- No status field — no staging, approval, or receiving workflow
- Soft-voided by prepending `[VOIDED]` to the `notes` field (no deletion, no separate status field)
- Cannot be edited after creation

**Relationships:**
- `supplier` → Supplier (optional)
- `items` → PurchaseItem[] (1:many)
- `inventoryMovements` → InventoryMovement[] (1:many via `purchaseId`)
- `operationalTask` → OperationalTask (optional FK — unused)

**State Transitions:**
```
[created] ──> (no status) ──> [VOIDED via notes prefix]
```

---

### 3.3 Notification

**Purpose:** In-app alert delivered to specific users, with type, priority, read state, and optional deep-link.

**Prisma Model:**
```prisma
model Notification {
  id       String
  title    String
  message  String
  type     NotificationType      // LOW_STOCK | NEW_ORDER | SYSTEM_ALERT | TASK_ASSIGNED | COMPLIANCE_REMINDER
  priority NotificationPriority  // LOW | MEDIUM | HIGH | URGENT
  isRead   Boolean @default(false)
  link     String?               // App route for navigation on click

  metadata Json                  // Arbitrary JSON payload (variantId, taskId, etc.)

  userId     String              // Single target user
  businessId String
  branchId   String?

  createdAt DateTime
}
```

**Lifecycle:**
- Inserted directly — no draft, no queue, no scheduled delivery
- Read state managed client-side via collection update
- No deletion, no expiry, no archival

**Used NotificationTypes (actually invoked in code):**
- `LOW_STOCK` — stock threshold breach
- `COMPLIANCE_REMINDER` — shift close awaiting review

**Declared but never used:**
- `NEW_ORDER`
- `SYSTEM_ALERT`
- `TASK_ASSIGNED`

**Priority:** Always set to `MEDIUM`. The `LOW`, `HIGH`, `URGENT` values are declared but never used.

**Indexes:** `(userId, isRead)`, `(businessId)`


---

### 3.4 Inventory / InventoryMovement

**Purpose:** Inventory tracks the current quantity of a variant in a specific batch and location. InventoryMovement is the audit trail of every stock change.

**Prisma Models:**
```prisma
model Inventory {
  id          String
  variantId   String
  unitId      String
  batchNumber String?
  expiryDate  DateTime?
  quantity    Float
  costPrice   Int       // Cost per unit for this batch (in cents)
  locationId  String?   // FK to Location (nullable = unassigned location)
  lastRestocked DateTime

  businessId String
  branchId   String
}

model InventoryMovement {
  id        String
  variantId String
  userId    String           // Who performed the movement
  type      MovementType     // IN | OUT | ADJUST | WASTE | EXTERNAL_TRANSFER | INTERNAL_TRANSFER
  quantity  Float
  reason    String?

  inventoryId    String      // FK to specific Inventory batch
  targetBranchId String?     // For EXTERNAL_TRANSFER / BRANCH_TRANSFER tasks
  locationId     String?

  transactionId     String?  // FK to Transaction (POS sale deductions)
  purchaseId        String?  // FK to Purchase (stock receipt)
  operationalTaskId String?  // FK to OperationalTask (task-driven movements)

  businessId String
  branchId   String
  createdAt  DateTime
}
```

**MovementType usage by source:**
| Source              | MovementType  |
|---------------------|---------------|
| POS checkout        | `OUT` (deduction per order item) |
| Purchase receipt    | `IN` |
| Purchase void       | `OUT` (reversal) |
| SHELF_REFILL task   | `ADJUST` |
| BRANCH_TRANSFER task | `ADJUST` |
| STOCK_COUNT task    | `ADJUST` |
| WASTE_DISPOSAL task | `OUT` |
| Quick restock       | `IN` |

Note: `WASTE`, `EXTERNAL_TRANSFER`, `INTERNAL_TRANSFER` are declared in the enum but never used in any movement creation code found.

---

### 3.5 VendorSession

**Purpose:** Tracks a cashier's shift — opened at the start of a shift with an opening cash float, closed at the end with cash reconciliation.

**Prisma Model:**
```prisma
model VendorSession {
  id     String
  userId String

  startTime    DateTime
  endTime      DateTime?
  openingCash  Int
  closingCash  Int?
  expectedCash Int?        // openingCash + sum of transactions during session
  verifiedCash Int?        // Actual cash counted at close
  status       SessionStatus  // OPEN | CLOSED
  notes        String?

  operationalTaskId String @unique  // FK to CASH_RECONCILIATION task (1:1)

  businessId String
  branchId   String
}
```

**Lifecycle:**
1. OPEN: Created in `OpenSessionDialog` → simultaneously creates a `CASH_RECONCILIATION` task at `DRAFT` status
2. CLOSED: Via `ReconcileLater` (creates task for supervisor) or `ReconcileNow` (immediate supervisor sign-off)
3. On close: task is updated with `expectedCash`, `approvedCash` metadata; session gets `closingCash`, `expectedCash`, `endTime`

**Session embedded in auth:** The current user's `vendorSession` is embedded in the `authStore` state, fetched on login via `getAuthUser`. The POS uses `user.vendorSession` to gate whether a shift is open.


---

### 3.6 Supporting Models

**User / Membership / Session / Account:**
- `User` — core identity; single `role` field (not per-branch, not per-feature)
- `Membership` — links a user to a business+branch with a `Role` enum
- `Session` — better-auth managed; stores `businessId` and `branchId` (critical for tenant context)
- `Account` — better-auth managed; stores hashed password for offline login

**Supplier:**
- Simple record: `name`, `taxId`, `contactNo`, `email`
- Linked to `Purchase` and to `PURCHASE_REQUEST` task metadata (`supplierId` in task metadata JSON)

**Location:**
- Named physical location within a branch (e.g., "Warehouse A", "Display Rack 1")
- Referenced by `Inventory.locationId` and `InventoryMovement.locationId`
- Used in SHELF_REFILL (source/target), STOCK_COUNT, and WASTE_DISPOSAL tasks

**SequenceCounter:**
- Provides structured, human-readable IDs per `SequenceType` (INVOICE, ORDER, PURCHASE, etc.)
- Keyed by `(businessId, branchId, type, year, month, day)`
- Used by `fetchStructuredId()` called during purchase creation

**Entitlement Models:**

```prisma
model Feature         { key, label, description, isOperational }
model SubscriptionPlan { name, description, sortOrder, monthlyPrice, includedTxPerMonth, overagePerTx }
model PlanEntitlement  { planId, featureKey, usageLimit }
model EntitlementOverride { businessId, featureKey, granted, expiresAt }
```

These are seeded via `prisma/seeders/entitlements.ts` with 4 plans: Trial, Starter, Professional, Enterprise.

**Product / ProductVariant / ProductComponent:**
- `Product` — parent entity with type (`PHYSICAL_GOOD`, `SERVICE`, `RAW_MATERIAL`, `BUNDLE`)
- `ProductVariant` — sellable/purchasable unit; holds `costPrice`, `price`, `lowStockThreshold`, `sku`
- `ProductComponent` — bill-of-materials link between a host variant and a material variant (recipe/ingredient)

---

## Part 4 — Engine Interaction

### 4.1 EntitlementEngine

**Location:** `src/lib/entitlement/entitlement-engine.ts`

**Invocation:** Called once per session in `getAuthUser` (server function) to build `EntitlementSummary`. The summary is embedded in the `authStore` and consumed by the UI for button/route gating.

**Data flow:**
```
getAuthUser (server)
  └─> rootPrisma.planEntitlement.findMany()    → planFeatures[]
  └─> rootPrisma.entitlementOverride.findMany() → overrides[]
  └─> EntitlementEngine.buildOpenContext()      → EntitlementContext (Phase 2 fallback: all features ACTIVE)
  └─> EntitlementEngine.buildSummary()          → { status, capabilities[], txRemaining, creditBalance }
  └─> embedded in ServerUser → authStore.user.entitlement
```

**Current Phase 2 behavior:** `buildOpenContext()` is always used (ACTIVE status, no usage limits, no tx tracking). Real subscription data is planned for Phase 3.

**Capabilities gating Task/Purchase:**
- `CREATE_TASK` — operational capability; gated on subscription status
- `CREATE_PURCHASE` — operational capability; gated on subscription status
- `MANAGE_INVENTORY` — operational capability; gated on subscription status

**Additional feature flag:** `SystemConfig.ENABLE_TASK` — a separate config-level gate that the Task list page checks before rendering (`if (!user.systemConfigs.ENABLE_TASK) return <FeatureDisabledPage />`). This is a dual-gate: entitlement engine AND system config both must allow.


---

### 4.2 NotificationEngine

**Location:** `src/lib/notification/notification-engine.ts`

**Methods:**

| Method | Description |
|--------|-------------|
| `checkLowStock(variantIds)` | Checks stock levels and auto-creates tasks + notifications |
| `send(receiverIds, params)` | Inserts notification records for given user IDs |

**`checkLowStock` data flow:**
```
1. Filter inventoryCollection for given variantIds with quantity > 0
2. Sum quantities per variantId
3. Fetch productVariantCollection + join product names
4. For each variant: compare currentTotal vs (variant.lowStockThreshold ?? user.systemConfigs.LOW_STOCK_THRESHOLD)
5. If threshold breached:
   a. Find all ADMIN/SUPERVISOR members from membershipCollection
   b. Inside dbTransaction:
      - Insert SHELF_REFILL task (status: IN_PROGRESS, all user fields = current user)
      - Call NotificationEngine.send(adminIds, { type: LOW_STOCK, ... })
```

**`send` data flow:**
```
1. Build notification records array (one per receiverId)
2. notificationCollection.insert(notifications)  ← inside caller's dbTransaction
```

Note: `send()` is called inside the `dbTransaction` callback, so notifications are committed atomically with the task creation.

**Who calls `checkLowStock`:** Not traceable within the files read. The call site is not visible in the task or POS routes. It is presumably called after a POS sale deducts inventory, but the exact trigger location was not found during this audit.

---

### 4.3 AuthEngine

**Location:** `src/lib/better-auth/auth-engine.ts`

**Methods:**

| Method | Description |
|--------|-------------|
| `loginOnline(email, password, onSuccess)` | Authenticates via better-auth, fetches full user profile, caches password hash locally |
| `loginOffline(email, password, onSuccess)` | Validates against locally cached hashed password |
| `logout(params)` | Clears authStore, calls server signOut if online |
| `authorizeFeature(values)` | Supervisor override — verifies a supervisor's credentials before a privileged action |
| `syncServerToLocal(serverUser)` | Writes server session to `localAuthCollection` for offline use |
| `hashCredentials(password)` | SHA-256 hash using Web Crypto API |

**Supervisor Override (`authorizeFeature`):**
- Used in `ReconcileNow` — requires ADMIN sign-off before reconciling a shift
- Online path: calls `verifyAuth` server function (re-authenticates without updating session)
- Offline path: checks `localOverrides` array cached in the auth session (ADMIN/SUPERVISOR users whose credentials were cached on this device)

**Session embedding:**
- `getAuthUser` embeds `vendorSession`, `entitlement`, `systemConfigs`, `complianceRegistry`, `localOverrides`, and `landingPage` into the session
- This is a large payload fetched on every login and page refresh

---

### 4.4 FIFOEngine

**Location:** `src/lib/costing/fifo-engine.ts`

**Method:** `FIFOEngine.consume(batches, requiredQty)` — calculates the total cost and consumed batch breakdown for a given quantity using FIFO order.

**Integration:** Declared but its call sites are not visible in the files read. Likely used in POS checkout to calculate `totalCost` for a transaction, but not directly invoked by Task or Purchase flows.

---

### 4.5 PriceEngine

**Referenced throughout UI:** `PriceEngine.format(cents)` — formats an integer cent value into a currency string using `user.systemConfigs.CURRENCY`.

---

### 4.6 Database / Sync Infrastructure

**`crudAPI` proxy:**
- Dynamic Prisma proxy: `crudAPI[modelName](action, args)` → `crudServerFn` → `executeOperation(tenantPrisma, payload)`
- Every collection's `queryFn`, `onInsert`, `onUpdate`, `onDelete` uses this proxy
- Tenant isolation applied via `multiTenantExtension`

**`dbTransaction`:**
- Wraps multi-collection mutations in a TanStack DB `createTransaction`
- When online: batches all operations into `transactionAPI.execute(operations)` → single Prisma `$transaction`
- When offline: applies mutations locally only (no server sync until reconnect)
- Uses `neverthrow` `ResultAsync` for typed error handling

**`createSyncableCollection`:**
- Factory for all domain collections
- `syncMode: 'eager'` — syncs on startup (masters, reference data)
- `syncMode: 'on-demand'` — syncs only when explicitly needed (large transactional collections)


---

## Part 5 — Event Flow

There is **no explicit event bus, pub/sub system, or event emitter** in the codebase. What exists are three implicit event patterns:

### 5.1 In-Process Synchronous Side-Effects

These are function calls made directly inside `dbTransaction` callbacks. They are atomic with the triggering mutation but are not decoupled.

| Trigger | Side Effect | Location |
|---------|-------------|----------|
| Task → FULFILLED | Inventory batch update + InventoryMovement insert | `tasks/$taskId/index.tsx` |
| Task → FULFILLED | (type-specific: SHELF_REFILL, BRANCH_TRANSFER, STOCK_COUNT, WASTE_DISPOSAL) | `tasks/$taskId/index.tsx` |
| Low stock detected | SHELF_REFILL task auto-created + LOW_STOCK notification sent | `notification-engine.ts` |
| Session opened | CASH_RECONCILIATION task created at DRAFT | `open-session-dialog.tsx` |
| Session closed (ReconcileLater) | CASH_RECONCILIATION task updated to IN_PROGRESS + COMPLIANCE_REMINDER notification sent | `reconcile-later.tsx` |
| Session closed (ReconcileNow) | CASH_RECONCILIATION task updated to REVIEWED | `reconcile-now.tsx` |
| Purchase created | Inventory batch upserted + IN movement created + variant costPrice updated | `create-purchase.ts` |
| Purchase voided | Inventory batch decremented + OUT movements created | `void-purchase.ts` |

### 5.2 Cross-Tab Propagation (BroadcastChannel)

When any collection mutation is committed, `createSyncableCollection` posts to `BroadcastChannel("db_sync")`. Other open tabs on the same browser receive this and re-sync the affected collection. This is the only "event" mechanism that crosses process boundaries.

### 5.3 Implicit Business Events (Currently Implemented)

| Event Name (conceptual) | Producer | Consumer | Implemented? |
|-------------------------|----------|----------|--------------|
| LowStockDetected | NotificationEngine.checkLowStock | Task auto-creation, notification to admins | ✅ |
| TaskFulfilled | Task detail view (status change handler) | Inventory side-effects | ✅ |
| PurchaseCreated | createPurchase.ts | Inventory batch upsert, movement | ✅ |
| PurchaseVoided | voidPurchase.ts | Inventory reversal | ✅ |
| SessionOpened | open-session-dialog | CASH_RECONCILIATION task creation | ✅ |
| SessionClosed | reconcile-later / reconcile-now | Task update, notification to admins | ✅ |
| NotificationCreated | NotificationEngine.send | notificationCollection insert | ✅ |
| NotificationRead | useNotifications.markAsRead | notificationCollection update | ✅ |
| TaskApproved | Task status change (→ APPROVED) | No side-effect currently | ✅ (no side-effect) |
| TaskCancelled | Task status change (→ CANCELLED) | No side-effect currently | ✅ (no side-effect) |
| TaskReviewed | Task status change (→ REVIEWED) | No side-effect currently | ✅ (no side-effect) |
| PurchaseRequestFulfilled | Task FULFILLED (PURCHASE_REQUEST type) | **No Purchase record created** | ❌ Gap |
| InventoryAdjusted | Multiple sources | No downstream notification | ✅ (movement only) |


---

## Part 6 — Operational Flow

### 6.1 Low Stock → Auto-Task → Inventory Update

```
[POS Checkout completes]
  │
  └─> NotificationEngine.checkLowStock(variantIds)
        │
        ├─> inventoryCollection: sum quantities per variantId
        ├─> productVariantCollection: get thresholds
        │
        └── if currentTotal <= threshold:
              │
              ├─> membershipCollection: get ADMIN/SUPERVISOR users
              │
              └─> dbTransaction:
                    ├─> operationalTaskCollection.insert (SHELF_REFILL, status=IN_PROGRESS)
                    └─> NotificationEngine.send(adminIds, LOW_STOCK)
                          └─> notificationCollection.insert

[Admin/Supervisor sees notification]
  └─> Click notification → navigates to /tasks/{taskId}

[Admin acts on task]
  └─> Task is already IN_PROGRESS (bypassed DRAFT/PENDING/APPROVED)
  └─> Clicks "Mark as Fulfilled"
        └─> dbTransaction:
              ├─> operationalTaskCollection.update (status=FULFILLED, fulfilledAt)
              └─> inventory side-effects (deduct source, upsert target, create ADJUST movement)

[Supervisor reviews]
  └─> Clicks "Verify & Lock" → status=REVIEWED (terminal)
```

---

### 6.2 Manual Task → Approval → Execution → Review

```
[Any employee creates a task]
  └─> operationalTaskCollection.insert (status=PENDING)

[Supervisor/Admin sees task in list]
  └─> Clicks task → TaskDetailsSidebar
  └─> Clicks "Approve Task"
        └─> operationalTaskCollection.update (status=APPROVED, approverId, approvedAt)

[Assigned clerk or any eligible user]
  └─> Clicks "Start Execution"
        └─> operationalTaskCollection.update (status=IN_PROGRESS, clerkId, inProgressAt)

[Clerk completes physical work]
  └─> Clicks "Mark as Fulfilled"
        └─> dbTransaction:
              ├─> operationalTaskCollection.update (status=FULFILLED, fulfilledAt)
              └─> inventory side-effects based on task.type

[Post-audit by supervisor]
  └─> Clicks "Verify & Lock"
        └─> operationalTaskCollection.update (status=REVIEWED, reviewerId, reviewedAt)
```

---

### 6.3 Purchase → Inventory Update

```
[Admin creates purchase]
  └─> CreatePurchaseSidebar.submit
        └─> createPurchase(data)
              └─> dbTransaction:
                    ├─> purchaseCollection.insert (header)
                    ├─> purchaseItemCollection.insert × n (line items)
                    ├─> productVariantCollection.update × n (costPrice = unitCost)
                    ├─> inventoryCollection.upsert × n (batch keyed by PO number)
                    └─> inventoryMovementCollection.insert × n (IN movements)

[Admin views purchase]
  └─> PurchaseDetailsSidebar
  └─> Clicks "Void Purchase"
        └─> WarningPrompt confirmation
        └─> voidPurchase(purchaseId)
              └─> dbTransaction:
                    ├─> purchaseCollection.update (notes = "[VOIDED] ...")
                    ├─> inventoryCollection.update × n (quantity -= movement.quantity)
                    └─> inventoryMovementCollection.insert × n (OUT reversal movements)
```

---

### 6.4 Shift Open → Transactions → Shift Close → Reconciliation

```
[Cashier opens POS]
  └─> No vendor session detected → OpenSessionDialog shown
  └─> Enter opening cash → submit
        └─> dbTransaction:
              ├─> operationalTaskCollection.insert (CASH_RECONCILIATION, status=DRAFT)
              └─> vendorSessionCollection.insert (status=OPEN)
              └─> authStore.user.vendorSession updated

[Cashier processes sales]
  └─> transactionCollection.insert (linked to vendorSession via sessionId)

[Cashier ends shift]
  └─> CloseSessionDialog
      ├─> Tab: "Create a Task" (ReconcileLater) — available if ENABLE_CASH_RECONCILIATION=true
      │     └─> Enter closing cash → submit
      │           └─> dbTransaction:
      │                 ├─> operationalTaskCollection.update (status=IN_PROGRESS, metadata with cash amounts)
      │                 ├─> vendorSessionCollection.update (status=CLOSED, closingCash, expectedCash)
      │                 └─> NotificationEngine.send(adminIds, COMPLIANCE_REMINDER)
      │
      └─> Tab: "Reconcile Now" (ReconcileNow) — requires ADMIN authentication
            └─> AuthPrompt → verifies ADMIN credentials
            └─> Enter closing cash → submit
                  └─> dbTransaction:
                        ├─> operationalTaskCollection.update (status=REVIEWED — skips FULFILLED)
                        └─> vendorSessionCollection.update (status=CLOSED, closingCash, expectedCash, verifiedCash)
```

Note: `ReconcileNow` sets the task directly to `REVIEWED` (skipping FULFILLED). This bypasses the full workflow.


---

## Part 7 — UI Architecture

### 7.1 Task Module UI

**Routes:**
| Route | Component | Purpose |
|-------|-----------|---------|
| `/(private)/tasks/` | `RouteComponent` | Task list page |
| `/(private)/tasks/create/` | `CreateTaskSidebar` | Create task sidebar |
| `/(private)/tasks/$taskId/` | `TaskDetailsSidebar` | View/act on task |

**Note:** All task routes exist at the `(private)` level (not inside `(dashboard)`) — accessible to Cashier role without the dashboard shell. The list page wraps in `<Dashboard>` for non-Cashier roles.

**Dialogs / Drawers:**
- `CreateTaskSidebar` — full-height slide-in sidebar, rendered inside `MountManager`
- `TaskDetailsSidebar` — full-height sidebar; tabs: "Task Details" | "Timeline"
- `EditTaskSidebar` — full-height sidebar; reuses `CreateTask` form

**Actions (per task status):**
- `DRAFT` → "Submit for Approval" (all roles)
- `PENDING` → "Approve Task" (SUPERVISOR/ADMIN), "Reject/Cancel" (SUPERVISOR/ADMIN)
- `APPROVED` → "Start Execution" (any role)
- `IN_PROGRESS` → "Mark as Fulfilled" (any role), "Halt/Cancel" (SUPERVISOR/ADMIN)
- `FULFILLED` → "Verify & Lock" (SUPERVISOR/ADMIN)

**Status indicators:** Color-coded badges using Tailwind classes. Each status has a defined `colorClass` in `getStatusUIMetadata()`.

**Task Type indicators:** Color-coded icon badges per type in `TYPE_CONFIG`.

**Bulk actions:** None implemented.

**Navigation:** Tasks are accessed via sidebar within the tasks page; no standalone route navigation to individual tasks from within the app (though the `$taskId` route exists for direct URL access).

**Permissions/Visibility:**
- Page hidden behind `ENABLE_TASK` system config
- `CASHIER` role sees the task list without the Dashboard layout (full-screen view)
- Workflow action buttons determined by `getAllowedTransitionsForUser()` — returns only the actions the current user can perform

**Business logic in UI:**
- **Heavy:** All inventory side-effects on FULFILLED live in `tasks/$taskId/index.tsx` (UI component)
- The entire state machine (`WORKFLOW_TRANSITIONS`, `TRANSITION_UI_CONFIG`, `checkWorkflowPermission`) lives in a UI-adjacent file (`task-workflow.ts`) inside the route folder
- Task creation (operationalTaskCollection.insert) is in the route component `tasks/create/index.tsx`

---

### 7.2 Purchase Module UI

**Routes:**
| Route | Component | Purpose |
|-------|-----------|---------|
| `/(private)/(dashboard)/(admin)/purchases/` | `RouteComponent` | Purchase list |
| `/(private)/(dashboard)/(admin)/purchases/create/` | `CreatePurchaseSidebar` | Create purchase |
| `/(private)/(dashboard)/(admin)/purchases/$purchaseId/` | `PurchaseDetailsSidebar` | View + void |

**Note:** Purchases are inside the `(admin)` sub-layout — restricted to ADMIN role.

**Pages:**
- Purchase list: `MultiView` component with table view; columns: No., PurchaseID, Supplier, Items count, Total Cost, Date, Status (voided badge), Reference/Notes

**Drawers/Sidebars:**
- `CreatePurchaseSidebar` — full-height, dynamic line item list (add/remove rows)
- `PurchaseDetailsSidebar` — full-height; tabs: "Items" | "Details"

**Actions:**
- Create — "New Purchase" button opens `CreatePurchaseSidebar`
- Void — button in detail sidebar (disabled if already voided)

**Status indicators:** Voided badge only (derived from `notes` prefix — not a real status field)

**Bulk actions:** None.

**Permissions:** Only accessible to ADMIN role (route layout guard at `(admin)/route.tsx`).

---

### 7.3 Notification Module UI

**Routes:**
| Route | Component | Purpose |
|-------|-----------|---------|
| `/(private)/(dashboard)/notifications` | `RouteComponent` | Full notification page |

**Components:**
- Notification bell button (in dashboard header, assumed — not read but referenced by `useNotifications` hook)
- Notification page: full card list with infinite scroll
- `useNotifications(pageSize)` hook — provides `notifications`, `unreadCount`, `markAsRead`, `markAllRead`

**Actions:**
- Click unread notification → marks as read
- After marking read: if notification has `link`, navigates to that route
- "Mark all as read" button (visible only when `unreadCount > 0`)

**Status indicators:** Unread notifications have a left border accent + "New" badge. Read notifications appear at 80% opacity.

**No dismissal, no delete, no filtering by type or priority.**

**Business logic in UI:**
- `markAllRead` iterates all unread notifications individually — no batch update query
- Notification click behavior (mark then navigate) is defined in the page component

---

### 7.4 Related Module UI (Inventory/Ingredients)

**Ingredients detail:** `/(private)/(dashboard)/(admin)/ingredients/$ingredientId/`
- Tabs: "Recipes" (where this ingredient is used) | "Batches" (inventory batches with location, expiry)
- Actions: "Restock" → `RestockIngredientSidebar`, "Edit"
- Low stock badge shown when `totalStock < lowStockThreshold`

**Inventory Reports:** `/(private)/(dashboard)/(supervisor)/inventory-reports/`
- Date-range filtered view
- Components: TotalStockValue, LowStockAlert, ActiveBatches, WasteRate, StockLevels, RecentStockMovements, InventoryHealth
- Export to CSV via server function `downloadInventoryCsv`


---

## Part 8 — Business Rules

The following rules are extracted directly from the codebase. Each is marked as **Implemented**, **Partially Implemented**, or **Planned/Missing**.

---

### 8.1 Task Rules

#### Who may create a task?
- **Implemented:** Any authenticated user (no role check at creation time). The `CREATE_TASK` capability is checked by the entitlement engine, but the actual insert in `tasks/create/index.tsx` performs no role guard at the application layer.

#### Who may approve a task?
- **Implemented:** Users with role `SUPERVISOR` or `ADMIN` may approve a PENDING task.
- **Implemented:** If `approverId` is pre-assigned at creation, only that specific user may advance to APPROVED — strict identity check in `checkWorkflowPermission`.

#### Who may execute a task (start / fulfill)?
- **Implemented:** Users with role `CASHIER`, `SUPERVISOR`, or `ADMIN` may start or fulfill a task.
- **Implemented:** If `clerkId` is pre-assigned, only that specific user may advance to `IN_PROGRESS` or `FULFILLED`.

#### Who may review a task?
- **Implemented:** Users with role `SUPERVISOR` or `ADMIN` only.
- **Implemented:** If `reviewerId` is pre-assigned, only that user may advance to `REVIEWED`.

#### Who may cancel a task?
- **Implemented:** `SUPERVISOR` or `ADMIN` only.
- **Implemented:** If both `approverId` and `reviewerId` are set, cancellation requires either the approver or reviewer specifically.
- **Implemented:** If only `approverId` is set, only the approver may cancel.

#### Who may delete a task?
- **Implemented (incorrectly):** Any user can delete any task directly from the list view regardless of status. No role guard, no status guard. Terminal tasks (`REVIEWED`, `FULFILLED`) can be deleted.

#### When is a task automatically created?
- **Implemented:** When `NotificationEngine.checkLowStock()` detects stock ≤ threshold — a `SHELF_REFILL` task is auto-created at `IN_PROGRESS` status (bypassing DRAFT → PENDING → APPROVED).
- **Implemented:** When a vendor session is opened — a `CASH_RECONCILIATION` task is created at `DRAFT`.

#### When can a task be edited?
- **Implemented:** The `EditTaskSidebar` is accessible, but no guard in the edit handler restricts editing based on task status. A `REVIEWED` or `FULFILLED` task can be edited.
- **Partial:** The `task-details-tab` uses `rules.hasPassedApproval` to switch inline assignment fields (clerk, approver) to read-only text. But the full edit form (via EditTaskSidebar) has no such gate.

#### When are records locked?
- **Implemented:** `REVIEWED` is the terminal locked state. No further status transitions are possible.
- **Partial:** Editing is not truly locked — the edit sidebar can still be invoked on any task.

#### When is inventory updated by a task?
- **Implemented:** Only on transition to `FULFILLED`. The update happens synchronously inside the `dbTransaction`.
- **Not Implemented:** No inventory update occurs on APPROVED, IN_PROGRESS, or REVIEWED.

#### When does a GENERAL_CHORE task skip approval?
- **Implemented:** `GENERAL_CHORE` tasks go directly from `PENDING` to `IN_PROGRESS`, bypassing `APPROVED`. This is explicitly handled in `getValidNextStatuses` and `checkWorkflowPermission` by reusing the APPROVED→IN_PROGRESS config.

#### Due date enforcement?
- **Not Implemented:** `dueDate` is stored and displayed with an "Overdue" indicator in the list view. No automated escalation, no notifications for overdue tasks, no status change triggered by expiry.

---

### 8.2 Purchase Rules

#### Who may create a purchase?
- **Implemented:** ADMIN role only (purchase routes are behind the `(admin)` layout).
- **Implemented:** `CREATE_PURCHASE` capability must be granted (entitlement check).

#### Who may void a purchase?
- **Implemented:** ADMIN role only (same route guard).
- **Not Implemented:** No secondary confirmation, no approval requirement for voiding.

#### When is inventory updated by a purchase?
- **Implemented:** Immediately on purchase creation — inventory is updated synchronously in the same `dbTransaction`.
- **Implemented:** Immediately on void — inventory is reversed synchronously.

#### Can a purchase be edited after creation?
- **Not Implemented:** No edit path exists for purchases. Creation is permanent; void is the only recourse.

#### Is there an approval step for purchases?
- **Not Implemented:** No approval workflow. Any ADMIN can create any purchase for any amount without review.

#### How is cost price managed?
- **Implemented:** On purchase creation, `productVariant.costPrice` is overwritten with the most recent `unitCost`. This is a destructive last-write-wins update — no cost history is maintained.

#### How are inventory batches keyed?
- **Implemented (create-purchase.ts):** Batches are keyed by `PO-{structuredId}`. If the same PO number is used again (not possible in practice since each purchase gets a new structured ID), the batch accumulates.
- **Implemented (restock-ingredient.ts):** Batches are keyed by a user-provided `batchNumber` (defaults to `DEFAULT` if empty). This can collide across restocks.

#### Is the `operationalTaskId` on Purchase ever set?
- **Not Implemented:** Always `null`. The schema supports linking a `PURCHASE_REQUEST` task to its resulting Purchase, but this bridge is never built.

---

### 8.3 Notification Rules

#### When is a notification generated?
- **Implemented:** When stock falls at or below `lowStockThreshold` — detected by `NotificationEngine.checkLowStock()`.
- **Implemented:** When a cashier ends their shift via "Create a Task" path (ReconcileLater).
- **Not Implemented:** On task assignment (`TASK_ASSIGNED` type exists but is never used).
- **Not Implemented:** On new order creation (`NEW_ORDER` type exists but is never used).
- **Not Implemented:** On system alerts (`SYSTEM_ALERT` type exists but is never used).

#### Who receives notifications?
- **Implemented:** All ADMIN and SUPERVISOR members of the current branch.
- **Not Implemented:** No per-user notification preferences. No opt-out. No notification routing by type.

#### When is notification priority elevated?
- **Not Implemented:** All notifications are created with `MEDIUM` priority. `LOW`, `HIGH`, `URGENT` are defined but never assigned.

#### When are notifications cleaned up?
- **Not Implemented:** Notifications are never deleted or archived. They accumulate indefinitely.

#### Can notifications be dismissed?
- **Not Implemented:** No dismiss or delete action in the UI.

---

### 8.4 Inventory Rules

#### When is the low stock threshold applied?
- **Implemented:** `variant.lowStockThreshold ?? user.systemConfigs.LOW_STOCK_THRESHOLD` — per-variant threshold overrides the global branch/business config.

#### What happens when inventory goes negative?
- **Partial:** `Math.max(0, draft.quantity - movement.quantity)` is used in void and task FULFILLED side-effects to floor at 0. But in the task FULFILLED handler for SHELF_REFILL, the deduction uses `Math.min(qty, sourceBatch.quantity)` — capping the deduction. No error or alert is raised when insufficient stock exists.

#### Is FIFO applied to POS sales?
- **Partial:** `FIFOEngine.consume()` exists but its POS invocation is not visible in the audited files.

#### When is `lastRestocked` updated?
- **Implemented:** On purchase creation and restock — `lastRestocked = new Date()`.


---

## Part 9 — Coupling Analysis

### 9.1 Strong Coupling

#### Task UI → Inventory Domain (Critical)
- `tasks/$taskId/index.tsx` directly manipulates `inventoryCollection` and `inventoryMovementCollection`
- The entire inventory mutation logic (4 task types × location/batch/movement logic) is embedded inside a React route component
- This is the most significant coupling in the operational domain: the Task UI owns inventory side-effects with no service layer between them

#### NotificationEngine → Task Domain
- `NotificationEngine.checkLowStock()` creates `OperationalTask` records directly
- The notification engine is making domain decisions about task type, status, metadata shape, and assignment — concerns that belong to the task domain
- A change to how tasks are created (e.g., adding required fields) would require updating NotificationEngine

#### NotificationEngine → Inventory Domain
- `checkLowStock` reads from `inventoryCollection` and `productVariantCollection` directly
- Computes stock totals inline rather than delegating to an inventory query layer

#### Purchase Creation → Variant Cost Price
- `create-purchase.ts` overwrites `productVariant.costPrice` on every purchase
- This is a destructive side-effect with no history, no locking, no opt-out
- A purchase of a single unit at an unusual price permanently changes the reference cost for all future costing

#### Session Close → Task Domain
- `reconcile-later.tsx` and `reconcile-now.tsx` update `OperationalTask` records directly
- The CASH_RECONCILIATION task lifecycle is split across three files: `open-session-dialog`, `reconcile-later`, `reconcile-now`
- Each file has different knowledge of what task state to set

---

### 9.2 Circular / Hidden Dependencies

#### `dbTransaction` → `transactionAPI` → `executeOperation` → `crudAPI`
- `local-db-transaction.ts` uses `transactionAPI`
- `transactionAPI` uses `executeOperation` from `crud-api.ts`
- `crudAPI` uses `crudServerFn` which uses `executeOperation` with a tenant-scoped prisma instance
- The `transactionAPI` uses the **root prisma** (no tenant extension) but passes payloads already scoped by the client
- This creates a subtle coupling: the batch transaction server function bypasses `multiTenantExtension` and relies on the client to have already scoped inputs correctly

#### `authStore` → `NotificationEngine`
- `NotificationEngine` reads from `authStore.state.user` directly (for `businessId`, `branchId`, `user.id`, `LOW_STOCK_THRESHOLD`)
- This means the notification engine cannot be tested or invoked in any context where `authStore` is not populated
- The engine is not a pure function — it has an implicit dependency on global mutable state

#### `authStore` → `createPurchase`, `voidPurchase`, `restockIngredient`
- All query functions read `authStore.state.user` for `businessId`, `branchId`, `userId`
- These are not injectable — hard dependency on the auth store singleton

---

### 9.3 Cross-Module Knowledge

#### Task metadata shape is duplicated
- The `TaskMetadata` interface is defined in `src/lib/types.ts`
- Zod validators for each task type are defined in `create/-create-task.tsx`
- The inventory side-effect handler in `$taskId/index.tsx` accesses `task.metadata.variantId`, `task.metadata.suggestedQty`, etc. with no type-safe mapping — pure runtime property access
- The details tab components (`ShelfRefillDetails`, etc.) also access metadata fields directly
- Four separate representations of the same data shape exist with no single source of truth validation

#### `NotificationType` enum values exist that have no implementation
- `NEW_ORDER`, `SYSTEM_ALERT`, `TASK_ASSIGNED` are declared in the Prisma schema
- None of them are sent anywhere in the codebase
- Consumers (UI, notification page) cannot filter by type because only one or two types are ever sent

#### `MovementType` enum values exist that have no implementation
- `WASTE`, `EXTERNAL_TRANSFER`, `INTERNAL_TRANSFER` are declared
- Never used in any `inventoryMovementCollection.insert` call found
- `WASTE_DISPOSAL` task uses `OUT` instead of `WASTE`
- `BRANCH_TRANSFER` task uses `ADJUST` instead of `EXTERNAL_TRANSFER`

---

### 9.4 Shared Services With Hidden Consumers

#### `dbTransaction` is used by:
- Task status changes (`$taskId/index.tsx`)
- Purchase creation (`create-purchase.ts`)
- Purchase voiding (`void-purchase.ts`)
- Quick restock (`restock-ingredient.ts`)
- Session open (`open-session-dialog.tsx`)
- Session close (`reconcile-later.tsx`, `reconcile-now.tsx`)
- `NotificationEngine.checkLowStock` (wraps inserts inside caller's transaction context — no explicit dbTransaction call inside the engine itself, but the inserts are inside one upstream)

The transaction wrapper is critical infrastructure used across every domain. Any change to its behavior (retry logic, offline handling, sync strategy) affects all of the above simultaneously.

---

### 9.5 Tight UI Coupling

| Logic | Location | Problem |
|-------|----------|---------|
| Task inventory side-effects | `tasks/$taskId/index.tsx` (React component) | Business logic in UI component |
| Task status transition rules | `tasks/$taskId/-components/task-workflow.ts` | Good extraction, but still in UI layer |
| Task creation | `tasks/create/index.tsx` (route component) | Collection insert inside route handler |
| Purchase creation form + business logic | `purchases/create/index.tsx` | Delegates to `createPurchase()` — acceptable |
| Notification mark-as-read + navigation | `notifications.tsx` (page component) | Navigation logic in page |
| Session open creates task | `open-session-dialog.tsx` | Cross-domain side-effect in UI dialog |
| Session close sends notification | `reconcile-later.tsx` | Cross-domain side-effect in UI dialog |

---

### 9.6 Shared Database Ownership

| Collection | Written by |
|------------|-----------|
| `operationalTaskCollection` | `tasks/create/index.tsx`, `tasks/$taskId/index.tsx`, `open-session-dialog.tsx`, `reconcile-later.tsx`, `reconcile-now.tsx`, `NotificationEngine.checkLowStock` |
| `inventoryCollection` | `tasks/$taskId/index.tsx`, `create-purchase.ts`, `void-purchase.ts`, `restock-ingredient.ts` |
| `inventoryMovementCollection` | `tasks/$taskId/index.tsx`, `create-purchase.ts`, `void-purchase.ts`, `restock-ingredient.ts` |
| `notificationCollection` | `NotificationEngine.send` only |
| `vendorSessionCollection` | `open-session-dialog.tsx`, `reconcile-later.tsx`, `reconcile-now.tsx` |
| `purchaseCollection` | `create-purchase.ts`, `void-purchase.ts`, `restock-ingredient.ts` |

`operationalTaskCollection` is written from 6 different locations. `inventoryCollection` and `inventoryMovementCollection` are written from 4.


---

## Part 10 — Architectural Gaps

### 10.1 Task Domain Gaps

| Gap | Classification |
|-----|---------------|
| `PURCHASE_REQUEST` task fulfillment does not create a Purchase record | **Missing** |
| Task edit has no status guard — fulfilled/reviewed tasks are editable | **Partially Implemented** |
| Task deletion has no role guard and no status guard | **Missing** |
| `dueDate` stored but never enforced; no escalation or overdue notification | **Partially Implemented** |
| `approvedQty` / `verifiedQty` in TaskMetadata are never set separately from `suggestedQty` | **Planned, Not Implemented** |
| `metadata.link` field exists but is only set by auto-generated low-stock tasks | **Partially Implemented** |
| `metadata.movementId` field declared but never populated | **Planned, Not Implemented** |
| No audit trail for task edits (only lifecycle timestamps, no change log) | **Missing** |
| Auto-generated SHELF_REFILL tasks are created at `IN_PROGRESS` bypassing the approval workflow — contradicts the workflow's purpose | **Inconsistency** |
| Timeline tab only shows `createdAt`, `approvedAt`, `inProgressAt` — missing `fulfilledAt`, `reviewedAt`, `canceledAt` | **Partially Implemented** |
| `DRAFT` status is defined in the enum and state machine but manual task creation always inserts at `PENDING` — `DRAFT` is never produced by the UI | **Partially Implemented** |
| `suggestedQty`, `approvedQty`, `fulfilledQty` exist as direct columns on the OperationalTask Prisma model (per schema) but the code uses them only inside `metadata` JSON | **Inconsistency** (schema-to-code mismatch) |

---

### 10.2 Purchase Domain Gaps

| Gap | Classification |
|-----|---------------|
| No approval workflow for purchases | **Missing** |
| No DRAFT or PENDING state — purchase is immediately final | **Missing** |
| No receiving step — inventory is credited at creation, not on physical delivery | **Missing** |
| `Purchase.operationalTaskId` is never populated — PURCHASE_REQUEST tasks have no link to resulting purchases | **Missing** |
| `productVariant.costPrice` is overwritten on every purchase — no cost history | **Missing** |
| No partial void (void is all-or-nothing per purchase) | **Missing** |
| Batch collision risk: `restock-ingredient` uses user-provided batch number (defaults to `DEFAULT`); multiple restocks to `DEFAULT` accumulate into one batch | **Partially Implemented** |
| No supplier invoice number validation — `notes` field is freeform | **Missing** |
| No purchase amount approval threshold | **Missing** |
| No link between purchase and subsequent cost reporting | **Missing** (inferred from FIFOEngine existence) |

---

### 10.3 Notification Domain Gaps

| Gap | Classification |
|-----|---------------|
| `NEW_ORDER`, `SYSTEM_ALERT`, `TASK_ASSIGNED` types declared but never used | **Planned, Not Implemented** |
| `LOW`, `HIGH`, `URGENT` priorities declared but never used | **Planned, Not Implemented** |
| No notification for task assignment (no `TASK_ASSIGNED` notification on `clerkId` set) | **Missing** |
| No notification for task approval | **Missing** |
| No notification for overdue tasks | **Missing** |
| No notification for purchase created/voided | **Missing** |
| No notification cleanup / archival | **Missing** |
| No per-user notification preferences | **Missing** |
| No push notifications, email, or external delivery | **Missing** |
| `markAllRead` iterates individually rather than using a batch update | **Partially Implemented** |
| Notification dismissal / delete not possible | **Missing** |
| Notification filtering in the UI (by type, priority, date) not implemented | **Missing** |

---

### 10.4 Inventory Domain Gaps

| Gap | Classification |
|-----|---------------|
| `WASTE` MovementType declared but never used — WASTE_DISPOSAL uses `OUT` instead | **Inconsistency** |
| `EXTERNAL_TRANSFER` MovementType declared but never used — BRANCH_TRANSFER uses `ADJUST` | **Inconsistency** |
| `INTERNAL_TRANSFER` MovementType declared but never used | **Planned, Not Implemented** |
| `checkLowStock` caller is not visible in audited files — trigger point for low-stock detection is unknown | **Unverified** |
| Insufficient stock on task FULFILLED does not throw an error — silently caps deduction | **Partially Implemented** |
| No inventory reservation when a task moves to APPROVED or IN_PROGRESS | **Missing** |
| No multi-location transfer movement for BRANCH_TRANSFER — deducts from source branch but no corresponding IN movement on target branch | **Missing** |
| Inventory cost price is overwritten on purchase — FIFO batch-level cost exists (`Inventory.costPrice`) but the variant-level `costPrice` is last-write-wins | **Inconsistency** |

---

### 10.5 Session / Reconciliation Gaps

| Gap | Classification |
|-----|---------------|
| `ReconcileNow` sets CASH_RECONCILIATION task directly to `REVIEWED` — skipping FULFILLED | **Inconsistency** |
| `ReconcileLater` creates the task at `IN_PROGRESS` (session close) but the `verifiedCash` is only set in `ReconcileNow` — the "Later" path never captures verified cash | **Partially Implemented** |
| Multiple open sessions are guarded at form validation time (Zod refine) but not at the database layer | **Partially Implemented** |
| `expectedCash` is calculated client-side by summing transactions; no server-side verification | **Partially Implemented** |
| `variance` field in TaskMetadata is set only in `ReconcileNow` but not in `ReconcileLater` | **Partially Implemented** |

---

### 10.6 Entitlement / Auth Gaps

| Gap | Classification |
|-----|---------------|
| Entitlement engine always uses `buildOpenContext` (Phase 2) — real subscription enforcement not active | **Planned, Not Implemented** |
| `BusinessSubscription` model is referenced in comments but does not exist in the schema | **Planned** |
| `ENABLE_TASK` SystemConfig creates a dual-gate with the entitlement engine — two separate mechanisms for the same feature | **Inconsistency** |
| `CREATE_TASK` entitlement is not checked in the task creation handler | **Partially Implemented** |
| No server-side authorization check on task status transitions — all authorization is in the client-side `task-workflow.ts` | **Missing** |
| No server-side authorization check on purchase creation or void | **Missing** |


---

## Part 11 — Strengths

### 11.1 Architecture Decisions Worth Preserving

#### Local-First Sync Architecture
The `createSyncableCollection` + `dbTransaction` pattern is the most consequential architectural decision in the codebase. It gives the application offline capability, optimistic UI updates, and cross-tab consistency through a single unified abstraction. All three domains benefit equally from this. The `syncMode: 'on-demand'` vs `'eager'` distinction for large vs small collections is a well-reasoned tradeoff.

#### `task-workflow.ts` — State Machine Extraction
The complete task state machine (`WORKFLOW_TRANSITIONS`, `TRANSITION_UI_CONFIG`, `checkWorkflowPermission`, `getAllowedTransitionsForUser`, `getStatusUIMetadata`) is extracted into a single, non-React file. This is the right instinct. The state machine is testable in isolation, is the single source of truth for all transition rules, and is well-documented inline. The STATUS_PRIORITY weight system for comparing states is clean and extensible.

#### `dbTransaction` — Atomic Multi-Domain Mutations
The pattern of wrapping multi-collection mutations in a single `dbTransaction` ensures that cross-domain state (e.g., session + task, purchase + inventory + movement) is always committed atomically. The `neverthrow` `ResultAsync` wrapper gives typed error propagation throughout the call stack. Retry-with-backoff on collection inserts is a good resilience addition.

#### EntitlementEngine — Pure Domain Logic
The `EntitlementEngine` is a pure function object with no infrastructure imports. The 8-step evaluation hierarchy is clearly documented and follows a single-exit-point pattern. The `CapabilityKey` registry in `capability-keys.ts` provides compile-time safety for all capability references. The `OPERATIONAL_CAPABILITIES` set clearly demarcates which features are subscription-sensitive.

#### `multiTenantExtension` — Transparent Tenant Isolation
The Prisma extension that auto-injects `businessId` and `branchId` on all writes and enforces them on all reads is transparent to all consumers. No tenant-scoping code is needed in any query or mutation — it is enforced at the infrastructure layer. The recursive injector for nested relation creates is particularly well-designed.

#### `TaskMetadata` Discriminated-Union Form
The Zod discriminated union on `type` for the task creation form, combined with per-type field components in `TASK_FIELD`, is a clean and extensible pattern. Adding a new task type requires only: adding to the `TASK_CONFIG` object, adding a validator shape, and adding a field renderer — all in one file.

#### Entitlement Seeder — Idempotent and Typed
The entitlements seeder imports `CapabilityKey` directly from the domain module — no string drift. All upserts are keyed on natural keys. The plan matrix is fully explicit and readable. The seeder is safe to re-run at any time.

#### `authStore` — Embedded Entitlement Summary
Embedding the `EntitlementSummary` directly into the auth session means the UI never needs to make a separate entitlement check request. The capabilities array is available synchronously on every render from the store. This is a well-architected approach to display-time gating.

#### `FIFOEngine` — Pure Costing Logic
The FIFO engine is a pure function with no side effects, no store reads, and no collection access. It receives `InventoryBatchDTO[]` and returns a costing result. This is exactly the right abstraction for financial computations.

#### Notification Targeting via Role Filter
The pattern of finding all ADMIN/SUPERVISOR members from `membershipCollection` at send-time is simple and correct. It means new admins automatically receive future notifications without any subscription setup.

#### `crudAPI` Proxy — Dynamic Type-Safe Prisma Client
The `crudAPI` proxy that maps model names to Prisma operations provides a thin, type-safe layer over raw Prisma while keeping all operations flowing through the auth middleware and tenant extension. The `DeepStrip` type utility that removes `businessId`/`branchId` from client-visible types is a clever way to prevent consumer confusion.

#### Structured IDs via `SequenceCounter`
Purchase orders get human-readable, sequential IDs (e.g., `PO-2025-0001`) via the `SequenceCounter` model. This provides meaningful audit references without relying on raw UUIDs in user-facing contexts.

### 11.2 Code Quality Observations Worth Noting

- Consistent use of `dayjs` for all date formatting — no `Date.toLocaleString` inconsistencies
- Consistent use of `PriceEngine.format()` for all currency display — no inline formatting scattered across components
- The `MountManager` pattern for sidebars avoids prop-drilling and component nesting for overlay content
- `neverthrow` `Result/ResultAsync` is used consistently in query functions — no try/catch inconsistencies in the data layer
- `useAppForm` / `withForm` wrappers provide a consistent form API across all components


---

## Part 12 — Final Summary

### 12.1 Current Architecture Maturity

**Overall: Early Production — Functional but Pre-Hardened**

The platform successfully runs end-to-end operational workflows. Core data integrity is maintained by `dbTransaction`. The local-first architecture is sound. The Prisma schema is well-modeled with appropriate indexing and tenant scoping. The primary shortfall is that business logic lives in the UI layer rather than a service/domain layer, making the codebase harder to reason about at scale and impossible to test without rendering components.

---

### 12.2 Current Operational Maturity

| Domain | Maturity | Notes |
|--------|----------|-------|
| Task | **Moderate** | State machine is complete. Lifecycle timestamps exist. Inventory side-effects work. Major gaps: no edit guard, no delete guard, no server-side auth, auto-tasks bypass workflow. |
| Purchase | **Low-Moderate** | Creation and void work correctly. But no approval, no receiving step, no status tracking, no link to tasks. Closer to a ledger than a procurement workflow. |
| Notification | **Low** | Delivery works. Read state works. But almost no notification types are used, no priority differentiation, no cleanup, no filtering, and no routing beyond "all admins get everything." |
| Inventory | **Moderate** | Batch tracking works. FIFO engine exists. Movements are audited. Major gaps: BRANCH_TRANSFER has no target-branch IN movement; MovementType enum is inconsistently used. |
| Session/Reconciliation | **Moderate** | Open/close cycle works. Two reconciliation paths exist. The "Later" path is incomplete (no verified cash). ReconcileNow skips task FULFILLED. |

---

### 12.3 Current Workflow Maturity

| Workflow | Maturity |
|----------|----------|
| Task approval workflow | **Implemented** — all transitions, role guards, identity guards present |
| Task inventory execution | **Implemented** — all 4 inventory-bearing task types handled |
| Purchase creation/void | **Implemented** — synchronous, atomic |
| Purchase approval/receiving | **Not Implemented** |
| Notification delivery | **Implemented** — in-app only, synchronous |
| Notification lifecycle (cleanup, filtering) | **Not Implemented** |
| Session open/close | **Implemented** |
| Cash reconciliation (full path) | **Partially Implemented** — ReconcileNow path skips workflow steps |
| Low-stock auto-task | **Implemented** — but bypasses approval workflow |
| PURCHASE_REQUEST → Purchase | **Not Implemented** |

---

### 12.4 Current Coupling Level

**High** in the operational domain. The three most critical coupling problems are:

1. **Task UI owns inventory mutations** — The largest business-logic burden in the codebase lives inside a React route component with no service layer.
2. **NotificationEngine makes task-domain decisions** — Auto-task creation inside the notification engine crosses domain boundaries.
3. **Session close logic is split across 3 UI files** — The CASH_RECONCILIATION task lifecycle has no central owner.

---

### 12.5 Current Extensibility

| Area | Extensibility |
|------|--------------|
| New task types | **Good** — discriminated union + TASK_CONFIG pattern makes addition straightforward |
| New notification types | **Poor** — adding a type requires wiring up a send call-site; no routing or subscription infrastructure |
| New purchase workflows (approval, receiving) | **Poor** — Purchase model has no status field; significant schema changes required |
| New inventory movement types | **Moderate** — MovementType enum exists but several declared types are unused |
| New entitlement capabilities | **Good** — add to `capability-keys.ts` + seeder; engine evaluates automatically |
| New subscription plans | **Good** — add to entitlements seeder; engine evaluates from DB |
| New branches / multi-tenancy | **Good** — `multiTenantExtension` handles all isolation transparently |

---

### 12.6 Biggest Risks

1. **No server-side authorization on task transitions or purchase operations.** All role and identity checks are client-side (`task-workflow.ts`). A motivated actor can bypass these by calling the collection APIs directly. This is the most significant security gap.

2. **Task inventory side-effects in a React component.** As inventory logic grows (e.g., adding reservation, partial fulfillment, multi-step transfers), this code will become difficult to maintain, branch, test, and reuse.

3. **`productVariant.costPrice` overwrite on every purchase.** This will silently corrupt cost reporting if purchases are entered out of order, voided, or re-entered with corrected prices.

4. **Auto-generated tasks bypass the approval workflow.** The system auto-creates tasks at `IN_PROGRESS`, circumventing the checks that exist for manually created tasks. This is an inconsistency that could lead to unauthorized inventory changes.

5. **`dbTransaction` uses root Prisma in `transactionAPI` without tenant extension.** Tenant scoping in batch transactions relies entirely on client-side input correctness — there is no server-side enforcement in the batch path.

6. **Notifications never expire.** Without cleanup, the notification table will grow unboundedly in production environments.

---

### 12.7 Biggest Strengths

1. **Local-first architecture** — the `createSyncableCollection` + `dbTransaction` combination gives offline capability and optimistic UI without complexity at the call site.
2. **`task-workflow.ts` state machine** — a clean, extractable, well-documented state machine that is the single source of truth for task transitions.
3. **`multiTenantExtension`** — completely transparent tenant isolation with no per-query code needed.
4. **`EntitlementEngine`** — pure, testable, extensible, and well-documented with a clear evaluation hierarchy.
5. **`dbTransaction` atomicity** — cross-domain mutations (task + inventory + movement, purchase + inventory + cost) are always committed atomically.

---

### 12.8 Areas Requiring Clarification Before Redesign

The following questions should be answered before any redesign begins:

1. **What is the intended behavior when a PURCHASE_REQUEST task is fulfilled?** Should it automatically create a Purchase record, or is the task a request that a human then fulfills manually via the Purchase form?

2. **Should auto-generated tasks (low-stock SHELF_REFILL, session CASH_RECONCILIATION) follow the full approval workflow?** The current bypass suggests they are intended to be fast-tracked, but this contradicts the purpose of the approval step.

3. **Is the `DRAFT` status intended for client-side task saving before submission?** Currently no UI path produces a `DRAFT` task despite it being the schema default. Is this a planned feature (local draft before submit)?

4. **What is the intended reconciliation flow?** ReconcileNow and ReconcileLater produce different task states (`REVIEWED` vs `IN_PROGRESS`). Is there a canonical path, and is the supervisor sign-off in ReconcileNow intentionally bypassing FULFILLED?

5. **Should purchase void require approval?** Voiding a purchase reverses inventory already credited to the business — this is a significant financial action currently available to any ADMIN without review.

6. **What is the intended notification delivery scope?** Should notification recipients be configurable per notification type, or should all notifications always target all admins/supervisors?

7. **Where is `NotificationEngine.checkLowStock` called?** This could not be verified in the audited files. Confirming the trigger is critical before changing the inventory deduction path.

8. **Are `suggestedQty`, `approvedQty`, `fulfilledQty` on `OperationalTask` intended as top-level columns or should they remain exclusively in `metadata`?** There is currently a schema-to-code mismatch.

---

### 12.9 Confidence Level by Domain

| Domain | Confidence | Basis |
|--------|-----------|-------|
| Task | **High** | Full state machine, all lifecycle handlers, all UI components, Prisma model read |
| Purchase | **High** | All creation/void code, both UI paths, Prisma model read |
| Notification | **High** | Engine, hook, UI page, all creation call sites read |
| Inventory interaction | **High** | All movement creation sites, batch logic, void reversal read |
| Workflow orchestration | **Moderate** | Session close paths fully read; low-stock trigger call-site not located |
| Entitlement | **High** | Engine, context, types, seeder, auth server integration fully read |
| Auth / Session | **High** | Both online and offline login paths, supervisor override, session embedding read |
| Reporting | **Moderate** | Inventory reports page read; sales reports structure seen but not fully audited |
| FIFO / Costing | **Low-Moderate** | Engine itself read; call site in POS checkout not located in this audit |

---

*End of Architectural Audit — Operational Domain (Discovery Phase)*
*Document produced from direct codebase inspection. No assumptions made beyond what was read.*
