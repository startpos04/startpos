# Architecture Evolution Strategy — Operational Domain
## Phase 3 — Principal Architect Roadmap

> **Mode:** Incremental evolution of an existing production system toward the Business Domain Model.
> **Constraint:** No rewrites. No big-bang migrations. Application must remain operational throughout.
> **Inputs:** Architecture Discovery Audit (Phase 1) · Business Domain Model (Phase 2)
> **Date:** July 30, 2026

---

## Table of Contents

1. [Executive Comparison](#part-1--executive-comparison)
2. [Domain Evolution Analysis](#part-2--domain-evolution-analysis)
3. [Responsibility Migration](#part-3--responsibility-migration)
4. [Event Architecture Evolution](#part-4--event-architecture-evolution)
5. [Workflow Evolution](#part-5--workflow-evolution)
6. [Data Model Evolution](#part-6--data-model-evolution)
7. [API & Service Evolution](#part-7--api--service-evolution)
8. [Preserve Existing Strengths](#part-8--preserve-existing-strengths)
9. [Risk Assessment](#part-9--risk-assessment)
10. [Incremental Migration Roadmap](#part-10--incremental-migration-roadmap)
11. [Architectural Principles](#part-11--architectural-principles)
12. [Validation Matrix](#part-12--validation-matrix)
13. [Final Executive Summary](#part-13--final-executive-summary)

---

## Part 1 — Executive Comparison

### Side-by-Side: Current vs. Target

| Dimension | Current Architecture | Target Business Architecture | Alignment |
|-----------|---------------------|------------------------------|-----------|
| **Purchase lifecycle** | Single-step: creation = receipt = inventory credit | Multi-stage: Request → Approval → PO → Receiving → GRN → Inventory | ❌ Misaligned |
| **Purchase status** | No status field; voided via `notes` prefix string | Explicit status: DRAFT → APPROVED → ORDERED → PARTIALLY_RECEIVED → RECEIVED → CLOSED | ❌ Misaligned |
| **Receiving** | Does not exist as a domain | Independent domain between Procurement and Inventory | ❌ Missing |
| **Task lifecycle** | Complete 7-stage state machine | Matches target closely; 3-quantity model incomplete | 🔶 Partial |
| **Task authorization** | Client-side only (`task-workflow.ts`) | Server-enforced at every transition | 🔶 Partial |
| **Inventory mutation ownership** | Task UI component, purchase queries, notification engine (4 locations) | Single owner: Inventory domain, triggered by business events | ❌ Misaligned |
| **Inventory movements** | Implemented, immutable, traceable | Matches target — strong foundation | ✅ Aligned |
| **Batch tracking** | Implemented (batchNumber, costPrice per batch) | Matches target | ✅ Aligned |
| **Notification delivery** | In-process, synchronous, in-app only | Decoupled event-driven delivery, multi-channel optional | 🔶 Partial |
| **Notification types** | 2 of 5 declared types used | All relevant business events produce notifications | ❌ Incomplete |
| **Notification cleanup** | None | Archival/expiry policy | ❌ Missing |
| **Approval** | Embedded in task state machine (client-side) | Independent domain with routing, escalation, authorization limits | 🔶 Partial |
| **Approval for purchases** | None | Required before any purchase commitment | ❌ Missing |
| **Event system** | No event bus; in-process side-effects only | Explicit business events as first-class domain outputs | ❌ Missing |
| **Server-side authorization** | Not implemented for task transitions or purchases | All state transitions enforced server-side | ❌ Missing |
| **Multi-tenant isolation** | Fully implemented via `multiTenantExtension` | Matches target | ✅ Aligned |
| **Local-first offline** | Fully implemented | Matches target | ✅ Aligned |
| **Entitlement engine** | Pure, well-designed (Phase 2 open-context mode) | Matches target structure; Phase 3 subscription data needed | 🔶 Partial |
| **Task quantity model** | `suggestedQty` only (in metadata) | Three distinct fields: suggested, approved, verified | 🔶 Partial |
| **Cost tracking** | Last-write-wins on `costPrice`; no cost history | Batch-level cost established at receiving, never retroactively overwritten | 🔶 Partial |
| **Session reconciliation** | Two paths (ReconcileNow/Later) with inconsistent task states | Single authoritative reconciliation path with proper lifecycle | 🔶 Partial |
| **DRAFT task status** | Declared but never produced by any UI path | Used as the initial saved-but-not-submitted state | ❌ Unused |
| **Audit trail** | Inventory movements only; task edits untracked | Immutable event log for every domain state change | 🔶 Partial |
| **FIFO costing** | Engine exists, POS call site not confirmed | FIFO applied to all inventory consumption | 🔶 Partial |

---

### Classification Summary

**Stable Foundations (protect, build on):**
- Local-first sync (`createSyncableCollection`, `dbTransaction`)
- Multi-tenant Prisma extension
- Inventory movement history (immutable, traceable)
- Task state machine extraction (`task-workflow.ts`)
- `EntitlementEngine` (pure, extensible)
- `crudAPI` / `transactionAPI` infrastructure
- `dbTransaction` atomicity pattern
- `FIFOEngine` (pure costing logic)
- Structured ID generation (`SequenceCounter`)

**Architectural Debt (must fix, can be incremental):**
- Inventory mutations owned by 4+ different locations
- Task business logic and inventory side-effects inside UI component
- No server-side authorization on task transitions
- NotificationEngine crossing domain boundaries (creates tasks)
- Purchase creation collapses 7 lifecycle stages into 1

**Missing Functionality (add without breaking existing):**
- Receiving domain (GRN concept)
- Purchase status field and lifecycle
- Purchase approval workflow
- Three-quantity model on tasks (suggested / approved / verified)
- Task edit and delete guards by status
- Notification types for task assignment, overdue, approval events
- Notification archival/cleanup

**Temporary Implementation (will be superseded by Phase 3 of entitlement):**
- `buildOpenContext()` fallback in auth session assembly
- `ENABLE_TASK` SystemConfig as a dual-gate alongside entitlement engine

**Acceptable Compromises (acknowledge, document, leave as-is):**
- Single-step purchase for cash-and-carry operations (acceptable as the "Simple" purchase path)
- In-app-only notification delivery (acceptable for current scale)
- Client-side overdue task indicator without automated escalation


---

## Part 2 — Domain Evolution Analysis

---

### 2.1 Purchase Domain

**Current State** *(from Phase 1, Part 2.2 and Part 9)*

Purchase creation is a single atomic event: the user fills a form, clicks submit, and simultaneously a purchase header, line items, inventory batches, and IN movements are created. There is no status field on the Purchase model. Voiding is the only post-creation action, implemented by prepending `[VOIDED]` to the `notes` field. No approval workflow exists. The `operationalTaskId` FK on Purchase is never populated. Cost price is overwritten on every purchase (last-write-wins).

**Target State** *(from Phase 2, Part 3.1)*

Purchase should be a multi-stage document: identified need → approved request → committed order → physical delivery → acceptance of goods → inventory credit → closed. Purchase Request and Purchase Order are distinct concepts. Receiving is a separate domain with its own GRN record. Inventory credit happens only after goods are formally accepted, not when the order is placed.

**Gap Analysis**

| Gap | Type |
|-----|------|
| No Purchase Request concept | Missing concept |
| No approval step before inventory credit | Missing lifecycle stage |
| No Receiving / GRN concept | Missing domain |
| No status field on Purchase | Missing lifecycle |
| Void uses `notes` prefix — not a real state | Incorrect ownership |
| `operationalTaskId` FK exists but never populated | Unused planned feature |
| Cost price overwritten on every purchase | Business rule violation (INV-5) |
| Creating a purchase immediately credits inventory | Violates business invariant INV-1 |

**Evolution Strategy**

Do not rebuild the purchase flow. Instead, evolve it in layers:

1. **Layer 1 (non-breaking):** Add a `status` column to the `Purchase` model with values `DRAFT | PENDING | APPROVED | RECEIVED | VOIDED | CLOSED`. Existing purchases get `RECEIVED` status (they were already fulfilled). This introduces the vocabulary without changing any existing behaviour.

2. **Layer 2 (additive):** Introduce the Purchase Request as a lightweight concept — initially as a `DRAFT` or `PENDING` purchase that has not yet received its inventory. The existing "create purchase" flow becomes the "quick receive" path (status auto-advances to `RECEIVED`). New workflows can use the staged path.

3. **Layer 3 (new capability):** Introduce the Goods Receipt concept as a sub-record of a Purchase. A Purchase in `APPROVED` status generates a GRN record when goods arrive. The GRN confirmation triggers the inventory credit. This is a new capability — existing quick-receive purchases bypass the GRN step and remain backward-compatible.

4. **Layer 4 (later):** Enforce approval workflow on purchases above a configurable threshold. Low-value or routine purchases can be auto-approved by policy. This aligns with business invariant PUR-1 without breaking existing operations.

---

### 2.2 Receiving Domain

**Current State** *(from Phase 1, Part 10.2)*

Does not exist. The concept of physically receiving goods, inspecting them, and accepting or rejecting them is collapsed entirely into the purchase creation event.

**Target State** *(from Phase 2, Part 2 and Part 9)*

An independent domain between Procurement and Inventory. Produces the Goods Receipt Note (GRN) as its primary aggregate. The GRN is the bridge between a supplier's delivery and the business's inventory — inventory only increases when a GRN is accepted.

**Gap Analysis**

The Receiving domain is entirely absent. Its absence means:
- Inventory is credited before goods are physically confirmed
- Partial deliveries cannot be recorded
- Quality rejection has no formal path
- The PO vs. reality discrepancy cannot be tracked
- Business invariant INV-1 is currently violated on every purchase

**Evolution Strategy**

Receiving is the one domain that cannot be introduced without a schema change. The strategy is to introduce it as an additive, opt-in path:

1. Introduce a `GoodsReceipt` model linked to `Purchase` (one PO, many receipts).
2. A new "Receive Goods" action on a Purchase advances it from `APPROVED` to partially or fully received.
3. The GoodsReceipt confirmation — not the purchase creation — triggers the inventory IN movement.
4. Existing "quick receive" purchases bypass this by being created directly at `RECEIVED` status, skipping the GRN step. This is the backward-compatible escape hatch for cash-and-carry operations.

---

### 2.3 Inventory Domain

**Current State** *(from Phase 1, Parts 3.4, 9.1, 9.6)*

Inventory mutations are owned by four separate locations: the Task UI component (`tasks/$taskId/index.tsx`), `create-purchase.ts`, `void-purchase.ts`, and `restock-ingredient.ts`. The `inventoryCollection` and `inventoryMovementCollection` are written directly from all four locations. There is no inventory service or domain layer. The `FIFOEngine` exists as a pure computation function but its invocation in the POS checkout is unconfirmed.

**Target State** *(from Phase 2, Part 2 and Part 6)*

The Inventory domain owns all mutations. Other domains do not call `inventoryCollection.update()` directly — they produce business events (TaskFulfilled, GoodsAccepted, SaleCompleted) and the Inventory domain applies the mutations as a reaction to those events.

**Gap Analysis**

| Gap | Type |
|-----|------|
| 4 separate mutation owners | Incorrect ownership |
| No inventory service layer | Missing abstraction |
| `WASTE` MovementType declared but `OUT` used for waste | Enum inconsistency |
| `EXTERNAL_TRANSFER` declared but `ADJUST` used for branch transfer | Enum inconsistency |
| No inventory reservation concept | Missing concept |
| Branch transfer has no target-branch IN movement | Missing lifecycle stage |
| Insufficient stock is silently capped, no error raised | Business rule gap |

**Evolution Strategy**

1. **Extract an Inventory Service** — create a dedicated `src/lib/inventory/inventory-service.ts` file that exposes named operations: `applyTaskFulfillment(task)`, `applyPurchaseReceipt(items)`, `applyPurchaseVoid(purchaseId)`, `applyAdjustment(params)`. These functions contain the logic currently scattered across 4 files.

2. **Migrate callers one by one** — replace the direct collection mutations in each of the 4 call sites with calls to the inventory service. This is low-risk because the logic is identical — only the location changes.

3. **Fix MovementType usage** — align WASTE_DISPOSAL tasks to use `WASTE` movement type, and BRANCH_TRANSFER to use `EXTERNAL_TRANSFER`. This is a data-level fix with no behavioral change.

4. **Add the missing target-branch IN movement** for BRANCH_TRANSFER tasks — a branch transfer deducting from source but never crediting the destination is incorrect. This is a functional fix.

---

### 2.4 Task Domain

**Current State** *(from Phase 1, Parts 2.1, 7.1, 9.1)*

The task state machine is well-designed and extracted into `task-workflow.ts`. However, all authorization is client-side only. Inventory side-effects for task fulfillment live inside a React route component. The `DRAFT` status is declared but never produced. The three-quantity model (suggested/approved/verified) exists in `TaskMetadata` as intent but is not enforced — all three quantities collapse to `suggestedQty`. Task edit and delete have no status guards. Auto-generated tasks (low stock, session open) bypass the approval workflow.

**Target State** *(from Phase 2, Parts 3.2, 6, 8)*

The task domain should: enforce authorization server-side; separate the suggested, approved, and verified quantities as distinct fields; produce immutable completion records; never directly mutate inventory; and ensure all tasks — whether manual or auto-generated — follow the same authorization rules (with configurable bypass for routine work).

**Gap Analysis**

| Gap | Type |
|-----|------|
| All authorization is client-side | Missing server enforcement |
| Inventory side-effects in UI component | Incorrect ownership |
| 3-quantity model incomplete | Partially implemented |
| DRAFT status unused by any UI path | Unused planned feature |
| Task edit has no status guard | Missing business rule |
| Task delete has no role or status guard | Missing business rule |
| Auto-tasks bypass approval | Inconsistent with workflow |
| Timeline tab missing fulfilledAt, reviewedAt, canceledAt | Partially implemented |
| No notification on task assignment | Missing lifecycle event |

**Evolution Strategy**

1. **Extract inventory side-effects to the Inventory Service** (see 2.3) — move them out of the UI component first. This is the highest-priority change and has no user-visible effect.

2. **Add server-side authorization middleware** for task status transitions — introduce a `validateTaskTransition(taskId, targetStatus, userId)` server function that replicates the logic from `task-workflow.ts`. The client still drives the UI, but the server validates the transition before committing.

3. **Enforce edit/delete guards by status** — a task that has reached `FULFILLED`, `REVIEWED`, or `CANCELLED` should not be editable or deleteable. This is a guard in the edit handler and delete handler, not a schema change.

4. **Activate the DRAFT status** — make the task creation form save at `DRAFT` when the user does not explicitly submit. This restores the intended workflow: staff save work-in-progress tasks, then submit them for approval. This requires no schema change.

5. **Introduce the three-quantity fields explicitly** — add `suggestedQty`, `approvedQty`, and `verifiedQty` as first-class task fields (they already exist as top-level columns in the Prisma schema per the audit). The metadata JSON fields should reference these, not replace them.

---

### 2.5 Notification Domain

**Current State** *(from Phase 1, Parts 2.3, 7.3, 9)*

Two of five declared `NotificationType` values are used (`LOW_STOCK`, `COMPLIANCE_REMINDER`). All three unused priorities (`LOW`, `HIGH`, `URGENT`) are declared. The `NotificationEngine` crosses domain boundaries by creating operational tasks inside `checkLowStock()`. There is no notification cleanup. No escalation. No per-user preferences. `markAllRead` iterates individually rather than batch-updating.

**Target State** *(from Phase 2, Parts 2, 5)*

The Notification domain is a pure delivery mechanism. It receives business events from other domains and routes messages to recipients. It never creates tasks. It never changes business state. It supports priority, archival, and eventually escalation.

**Gap Analysis**

| Gap | Type |
|-----|------|
| `NotificationEngine.checkLowStock()` creates tasks | Incorrect ownership |
| 3 of 5 declared types never used | Incomplete |
| All priorities default to MEDIUM | Incomplete |
| No cleanup / archival | Missing lifecycle |
| No task assignment notification | Missing event |
| No overdue task notification | Missing event |
| No purchase approval notification | Missing event |
| `markAllRead` iterates individually | Performance gap |

**Evolution Strategy**

1. **Separate task-creation logic from notification logic** in `checkLowStock` — the low-stock detection and auto-task creation belongs to an Inventory domain service; the notification is a side-effect of the `LowStockDetected` event.

2. **Add missing notification types** incrementally — `TASK_ASSIGNED` when `clerkId` is set, `TASK_OVERDUE` when `dueDate` is passed and task is not yet fulfilled, `PURCHASE_PENDING_APPROVAL` when a purchase requires review.

3. **Add a `deletedAt` / `archivedAt` field to Notification** — enable cleanup by marking old notifications rather than hard-deleting. A background job (or a cleanup on login) removes notifications older than a configured retention period.

4. **Fix `markAllRead`** to use a single `updateMany` call through the `crudAPI` rather than iterating individually.

---

### 2.6 Approval Domain

**Current State** *(from Phase 1, Parts 2.1, 8.1)*

Approval is not an independent domain. It is embedded inside the task state machine as role-based checks on status transitions. There is no approval for purchases. There is no escalation. There is no authorization limit concept. All checks are client-side.

**Target State** *(from Phase 2, Parts 2, 3.5)*

An independent domain that accepts approval requests from any domain, routes them to the correct approver based on type and scope, records the decision, and handles escalation.

**Gap Analysis**

Approval currently exists only as embedded logic in the task state machine. There is no approval aggregate, no approval record, no approval service. The entire concept is missing as a standalone domain.

**Evolution Strategy**

The Approval domain should be introduced gradually, beginning with the Task domain (where approval already exists informally) and extending to Purchase later:

1. **Phase A:** Formalize the approval record on tasks — explicitly record `approverId`, `approvedAt`, `approvalNotes` (already in schema for tasks). No separate approval domain needed yet.

2. **Phase B:** Introduce a lightweight `ApprovalRequest` record — when a task is submitted for approval, create an `ApprovalRequest` linked to the task. The request has its own status. This decouples "task waiting for approval" from "task approved."

3. **Phase C:** Extend `ApprovalRequest` to cover purchases — a purchase above a value threshold creates an `ApprovalRequest` rather than immediately committing.

4. **Phase D:** Add escalation — an `ApprovalRequest` that is not acted upon within a configured window auto-escalates to the next authority level.

---

### 2.7 Reporting Domain

**Current State:** Read-only views over local collections. Inventory reports, sales reports, and order history pages exist. All report components query collections directly. Export via server function.

**Target State:** Same — reporting is inherently read-only. No structural changes needed. The reporting domain becomes richer as upstream domains produce better data (GRNs, approval records, three-quantity task data).

**Evolution Strategy:** No structural change to reporting itself. Reporting improves naturally as domains produce richer events and data models. Add task completion rate and purchase cycle time reports as task and purchase domains mature.

---

### 2.8 Session Domain

**Current State** *(from Phase 1, Parts 3.5, 2.3, 10.5)*

Session open creates a CASH_RECONCILIATION task directly. Two close paths exist (`ReconcileNow` sets task to `REVIEWED`, `ReconcileLater` sets it to `IN_PROGRESS`). `verifiedCash` is only set by ReconcileNow. Variance is not calculated in the Later path.

**Target State** *(from Phase 2, Part 9)*

Session close produces a `ShiftClosed` event. The Task domain creates the reconciliation task in response. The reconciliation task follows the standard task lifecycle: `IN_PROGRESS` → `FULFILLED` (cashier submits count) → `REVIEWED` (supervisor confirms). Both ReconcileNow and ReconcileLater are paths through the same lifecycle, not structurally different things.

**Gap Analysis**

| Gap | Type |
|-----|------|
| ReconcileNow skips to REVIEWED bypassing FULFILLED | Lifecycle violation |
| ReconcileLater never captures `verifiedCash` | Incomplete lifecycle |
| Session open directly creates task (not event-driven) | Incorrect ownership |
| Variance not calculated in the Later path | Partially implemented |

**Evolution Strategy**

1. Fix ReconcileNow to set task to `FULFILLED` (cashier submits count), then require supervisor to advance to `REVIEWED` — consistent with the task workflow.

2. Set `verifiedCash` in both reconciliation paths when the supervisor confirms.

3. Extract the session-close notification to `NotificationEngine.send()` without the task-creation side-effect embedded inside it (task already exists from session open).

---

### 2.9 Audit Domain

**Current State:** `InventoryMovement` is the only true audit trail. Task lifecycle timestamps (`approvedAt`, `inProgressAt`, etc.) provide partial audit of task state changes. Task edits and deletions produce no audit record.

**Target State:** Every state change in every domain is traceable to a person, a timestamp, and a business reason. Task edits and deletions are either prevented (for locked tasks) or recorded.

**Evolution Strategy:** Audit is not a separate domain to build — it is a discipline applied to all domains. The evolution is: (a) enforce immutability on terminal task states, (b) add deletion protection on locked records, (c) extend the task timeline to show all six lifecycle events.

---

### 2.10 Events Domain

**Current State:** No event bus, no pub/sub. All cross-domain side-effects are synchronous in-process function calls inside `dbTransaction` callbacks.

**Target State:** Business events as first-class domain outputs. Producers emit events; consumers react. The synchronous `dbTransaction` pattern is acceptable as the implementation mechanism — the evolution is about making the event contracts explicit and standardized.

**Evolution Strategy:** Events do not require a message broker to be first-class. The immediate evolution is: (a) define TypeScript event types for every business event, (b) route all cross-domain calls through named event handlers rather than direct function calls. This creates the event vocabulary without requiring infrastructure change.


---

## Part 3 — Responsibility Migration

Each entry below identifies a responsibility that currently lives in the wrong place and describes how to migrate it with minimum disruption.

---

### R1 — Inventory Mutations

**Current Owner:** Four locations — `tasks/$taskId/index.tsx`, `create-purchase.ts`, `void-purchase.ts`, `restock-ingredient.ts`

**Target Owner:** `src/lib/inventory/inventory-service.ts` (new, single-owner service)

**Reason:** Phase 1, Part 9.1 identified this as the most significant coupling in the codebase. Phase 2, Part 6 establishes the invariant: "Inventory domain owns all mutations." Having 4 mutation owners means inventory business rules must be duplicated or are simply absent in some paths.

**Migration Strategy:**
1. Create `src/lib/inventory/inventory-service.ts` with explicit, named operation functions
2. Migrate `create-purchase.ts` first (lowest risk — no task state machine involved)
3. Migrate `void-purchase.ts` second
4. Migrate `restock-ingredient.ts` third
5. Migrate `tasks/$taskId/index.tsx` last (most complex, requires extracting from the React component)
6. Each migration step is independently deployable. Nothing changes visually or functionally — only the code location of the logic changes.

**Backward Compatibility:** Complete. The collection writes are identical — only the calling location changes. No schema changes required.

**Dependencies:** None. This migration is self-contained.

---

### R2 — Auto-Task Creation (from NotificationEngine)

**Current Owner:** `NotificationEngine.checkLowStock()` creates OperationalTask records

**Target Owner:** An Inventory domain event handler creates the task when `LowStockDetected` is produced

**Reason:** Phase 1, Part 9.2 identifies this as a cross-domain violation. Phase 2, Part 2 establishes: the Notification domain "never creates tasks or makes decisions." Phase 2, Part 5 establishes `LowStockDetected` as an Inventory domain event, with Task domain as a consumer.

**Migration Strategy:**
1. Extract the task-creation logic from `checkLowStock` into a separate function: `handleLowStockDetected(variantId, currentTotal, threshold)`
2. `checkLowStock` calls this function, then calls `NotificationEngine.send()` — the notification engine no longer creates tasks
3. In a later phase, this `handleLowStockDetected` function becomes a formal event handler registered against the `LowStockDetected` event

**Backward Compatibility:** Complete. Same task is created, same notification is sent. The call sequence is unchanged; only the code organization changes.

**Dependencies:** R1 (Inventory Service), to ensure the task creation can reference clean inventory data.

---

### R3 — Task Authorization (client-only → server-enforced)

**Current Owner:** `task-workflow.ts` (client-side, no server enforcement)

**Target Owner:** Server function `validateTaskTransition(taskId, targetStatus, userId)` + existing client-side checks as a UX aid

**Reason:** Phase 1, Part 10.6 identifies this as a security gap: "No server-side authorization check on task status transitions." Phase 2, Business Invariant TASK-4: "Every task that affects inventory must be authorized before execution."

**Migration Strategy:**
1. Create a server function that replicates `checkWorkflowPermission` — same logic, server-side, called before any status mutation is committed
2. The client-side checks remain as UX guards (hide buttons the user cannot use)
3. The server function is the authoritative enforcement point
4. Initially the server function just validates and returns allowed/denied — the client still drives the mutation
5. Later phases can move the full transition logic to the server function

**Backward Compatibility:** Existing behavior is preserved. The server adds a validation layer; it does not change what is permitted, only where it is enforced.

**Dependencies:** Existing `authMiddleware` already provides userId and role context.

---

### R4 — Purchase Approval

**Current Owner:** Does not exist

**Target Owner:** Approval domain (initially: a purchase status gate that requires an authorized user to advance)

**Reason:** Phase 1, Part 8.2: "No approval workflow for purchases." Phase 2, Business Invariant PUR-1: "A Purchase Order cannot be created without an approval."

**Migration Strategy:**
1. Introduce purchase status field (Layer 1 from 2.1 strategy)
2. Add a `PENDING_APPROVAL` status between `DRAFT` and `RECEIVED`
3. Purchases above a configurable threshold require an approver to advance the status
4. Low-value routine purchases can be set to auto-approve on creation (maintaining backward compatibility for existing flow)
5. The approval gesture is the same pattern as task approval: an authorized user advances the status with their identity recorded

**Backward Compatibility:** Existing quick-receive flow continues to work by auto-advancing to `RECEIVED`. The approval step only activates for purchases above a threshold or when explicitly required by configuration.

**Dependencies:** Purchase status field (Data Model Evolution, Part 6).

---

### R5 — Session Close → Task Creation

**Current Owner:** `open-session-dialog.tsx` creates the CASH_RECONCILIATION task; `reconcile-later.tsx` updates its status

**Target Owner:** Session domain produces `ShiftClosed` event → Task domain creates/updates reconciliation task as a reaction

**Reason:** Phase 1, Part 9.1 identifies session close as cross-domain knowledge split across 3 UI files. Phase 2, Part 5: `ShiftClosed` is produced by Session, consumed by Task.

**Migration Strategy:**
1. Do not move the session logic yet — it works
2. Standardize the reconciliation task lifecycle: ReconcileNow should set status to `FULFILLED` (matching the business invariant that task fulfillment = physical work recorded), then advance to `REVIEWED` only after supervisor confirmation
3. Ensure `verifiedCash` and `variance` are recorded consistently in both paths
4. This is a behavioral fix, not a structural migration

**Backward Compatibility:** Minor behavior change for ReconcileNow (adds one extra step). Clear UX improvement — supervisor explicitly confirms rather than the system assuming.

---

### R6 — Task Edit/Delete Ownership

**Current Owner:** Any user, any status, no guards

**Target Owner:** Task domain enforces: locked tasks (FULFILLED, REVIEWED, CANCELLED) cannot be edited or deleted

**Reason:** Phase 1, Part 10.1: "Task edit has no status guard. Task deletion has no role guard." Phase 2, Business Invariant TASK-5: "A completed and reviewed task is a permanent record."

**Migration Strategy:**
1. Add a status guard to the `EditTaskSidebar` handler — reject edits on terminal status tasks
2. Add a role+status guard to the delete handler in the task list — only ADMIN/SUPERVISOR can delete, and only DRAFT/PENDING tasks
3. These are two simple conditional checks — no schema change required

**Backward Compatibility:** This is a restriction, not a feature removal. Some currently-possible actions become impossible — which is the correct behavior.


---

## Part 4 — Event Architecture Evolution

### Current Event Flow (Phase 1 Finding)

All cross-domain side-effects are synchronous, in-process function calls. There is no event type system, no event routing, and no separation between the event producer and its consumers. The following patterns currently exist:

```
LowStock Condition
  └─> NotificationEngine.checkLowStock()
        ├─> operationalTaskCollection.insert()     [creates task — wrong owner]
        └─> NotificationEngine.send()              [correct — notification delivery]

Task → FULFILLED
  └─> React component handler
        ├─> operationalTaskCollection.update()     [task state — correct]
        ├─> inventoryCollection.update()           [inventory — wrong owner]
        └─> inventoryMovementCollection.insert()   [movement — wrong owner]

Session Closed
  └─> reconcile-later.tsx
        ├─> operationalTaskCollection.update()     [task — mixed ownership]
        ├─> vendorSessionCollection.update()       [session — correct]
        └─> NotificationEngine.send()              [notification — correct]
```

---

### Target Event Flow

```
LowStock Condition (produced by Inventory domain)
  └─> LowStockDetected event
        ├─> [Task domain consumer] → creates SHELF_REFILL task
        └─> [Notification domain consumer] → sends LOW_STOCK notification

Task → FULFILLED (produced by Task domain)
  └─> TaskFulfilled event
        ├─> [Inventory domain consumer] → applies inventory mutation
        └─> [Notification domain consumer] → notifies reviewer

Purchase Created (produced by Procurement domain)
  └─> PurchaseCreated event
        └─> [Inventory domain consumer] → credits inventory (after GRN, not at creation)

Session Closed (produced by Session domain)
  └─> ShiftClosed event
        ├─> [Task domain consumer] → updates reconciliation task
        └─> [Notification domain consumer] → notifies supervisors
```

---

### Event Migration Table

| Event | Current Producer | Current Consumer | Future Producer | Future Consumer | Migration |
|-------|-----------------|-----------------|-----------------|----------------|-----------|
| LowStockDetected | `NotificationEngine.checkLowStock` (implicit) | Task creation (wrong), notification send | Inventory service | Task service handler, Notification service | Extract to `InventoryService.onLowStockDetected()` |
| TaskFulfilled | UI component (implicit) | Inventory mutations (wrong), status update | Task service | Inventory service handler | Extract to `InventoryService.applyTaskFulfillment()` |
| TaskApproved | UI component (implicit) | No consumer currently | Task service | Notification service (notify clerk) | Add `NotificationEngine.send()` call on approval |
| TaskAssigned | Does not exist | — | Task service | Notification service | New: send TASK_ASSIGNED notification on `clerkId` set |
| TaskCancelled | UI component (implicit) | No consumer currently | Task service | Notification service | New: notify affected parties |
| PurchaseCreated | `create-purchase.ts` | Inventory (inline — wrong owner) | Procurement service | Inventory service | Migrate to Inventory Service |
| PurchaseVoided | `void-purchase.ts` | Inventory reversal (inline) | Procurement service | Inventory service | Migrate to Inventory Service |
| GoodsAccepted | Does not exist | — | Receiving service (future) | Inventory service | New domain — Phase 4+ |
| ShiftClosed | `reconcile-later.tsx` | Task update, notification | Session service | Task service, Notification service | Formalize as named event |
| ReconciliationCompleted | `reconcile-now.tsx` (implicit) | None currently | Session/Task service | Reporting domain | New consumer hook |

---

### Events That Must Never Exist

These event types represent architectural anti-patterns that should be rejected if they appear in future development:

| Anti-Pattern Event | Why It Must Not Exist |
|-------------------|----------------------|
| `NotificationCreatedTask` | Notifications never create business records |
| `InventoryMutatedByUI` | UI components never own inventory state |
| `TaskApprovedItself` | No domain approves its own requests |
| `PurchaseInventoryUpdatedAtCreation` | Inventory credit before goods acceptance violates INV-1 |
| `ReportUpdatedBusinessRecord` | Reports are read-only |

---

### Introducing Event Types (TypeScript First)

Before introducing any infrastructure, define events as plain TypeScript types in `src/lib/events/types.ts`:

```
type LowStockDetectedEvent = {
  type: 'LOW_STOCK_DETECTED'
  variantId: string
  currentTotal: number
  threshold: number
  branchId: string
  businessId: string
  detectedAt: Date
}

type TaskFulfilledEvent = {
  type: 'TASK_FULFILLED'
  taskId: string
  taskType: TaskType
  fulfilledBy: string
  metadata: TaskMetadata
  fulfilledAt: Date
}
```

This creates the vocabulary without requiring any infrastructure. Existing code calls the handler functions directly; the event type provides a contract.


---

## Part 5 — Workflow Evolution

### 5.1 Purchase Workflow

**Current:**
```
User fills form → submit
  └─> dbTransaction: header + items + inventory batch + IN movement
        [single step — no approval, no receiving, no status]
```

**Target:**
```
Need identified → PR raised → PR approved → PO created → 
Goods arrive → GRN recorded → GRN accepted → Inventory credited → PO closed
```

**Incremental Migration Path:**

```
STEP 1 (Non-breaking — additive schema change):
  Add status field to Purchase: DRAFT | PENDING_APPROVAL | APPROVED | RECEIVED | VOIDED | CLOSED
  Existing purchases → RECEIVED status (no behavior change)

STEP 2 (New UI path — existing path unchanged):
  "Quick Receive" button: existing flow, sets status=RECEIVED immediately
  "Create Purchase Request" button: new flow, sets status=DRAFT or PENDING_APPROVAL
  Both paths coexist. Users choose based on their operation.

STEP 3 (Approval gate — configurable):
  Purchase above threshold requires approval before inventory credit
  Below threshold: auto-approve (status=APPROVED immediately)
  System config: PURCHASE_APPROVAL_THRESHOLD

STEP 4 (Receiving step — additive, optional):
  Purchases in APPROVED status can have a GoodsReceipt sub-record created
  GoodsReceipt confirmation triggers inventory credit (instead of purchase creation)
  Quick-receive path skips GoodsReceipt, credits directly (backward-compatible)

STEP 5 (Partial receiving — later):
  A PO can have multiple GoodsReceipt records
  PO status: PARTIALLY_RECEIVED when some items received, RECEIVED when complete
```

---

### 5.2 Task Workflow

**Current:**
```
Insert at PENDING → Approve → IN_PROGRESS → FULFILLED [inventory mutations here] → REVIEWED
  [all authorization client-side]
  [DRAFT unused]
  [inventory mutations in React component]
```

**Target:**
```
DRAFT (optional save) → PENDING → APPROVED → IN_PROGRESS → FULFILLED → REVIEWED
  [server-side authorization at every transition]
  [inventory mutations in Inventory Service, triggered by TaskFulfilled]
  [DRAFT available for staff to save work-in-progress tasks]
```

**Incremental Migration Path:**

```
STEP 1 (Non-breaking — code relocation):
  Extract inventory side-effects from tasks/$taskId/index.tsx
  → src/lib/inventory/inventory-service.ts:applyTaskFulfillment(task)
  No visible change. Identical behavior. Reduced coupling.

STEP 2 (Additive — security improvement):
  Add server-side transition validation server function
  Client calls server function before committing status update
  Server rejects unauthorized transitions
  Client-side checks remain as UX aids

STEP 3 (Behavioral fix — task guards):
  Add status guard to EditTaskSidebar: reject edits on FULFILLED/REVIEWED/CANCELLED
  Add role+status guard to delete: ADMIN/SUPERVISOR only, DRAFT/PENDING only

STEP 4 (Additive — DRAFT activation):
  Change task creation default status from PENDING to DRAFT
  Add "Submit for Approval" action that advances DRAFT → PENDING
  Existing tasks created at PENDING remain valid (no migration)

STEP 5 (Additive — three-quantity model):
  Surface suggestedQty, approvedQty, verifiedQty as distinct UI fields
  Approver can modify the approved quantity at approval time
  Clerk records the actual verified quantity at fulfillment time
  Inventory mutation uses verifiedQty (actual), not suggestedQty (proposed)
```

---

### 5.3 Notification Workflow

**Current:**
```
Business condition detected
  └─> Direct call to NotificationEngine.send() or NotificationEngine.checkLowStock()
        └─> notificationCollection.insert()
```

**Target:**
```
Business event produced by domain
  └─> Notification domain subscribes to event
        └─> Resolves recipients (by role, assignment, preference)
        └─> Delivers notification (in-app, optionally push/email)
        └─> Tracks read state, schedules reminder if unread
```

**Incremental Migration Path:**

```
STEP 1 (Code organization — non-breaking):
  Separate task-creation logic from NotificationEngine.checkLowStock()
  The engine only sends notifications — task creation moves elsewhere

STEP 2 (New notification types — additive):
  Add TASK_ASSIGNED notification when clerkId is set or task is approved
  Add TASK_OVERDUE notification (batch check, or on-access if dueDate passed)
  Add PURCHASE_PENDING_APPROVAL notification when purchase enters approval queue

STEP 3 (Priority differentiation — additive):
  LOW_STOCK → MEDIUM priority (current, maintain)
  TASK_OVERDUE → HIGH priority
  COMPLIANCE_REMINDER → MEDIUM priority (current, maintain)
  Cash variance > threshold → URGENT priority

STEP 4 (Archival — additive schema change):
  Add archivedAt field to Notification
  Notifications older than X days auto-archived (not deleted)
  UI shows active notifications only; archive accessible separately

STEP 5 (Escalation — future):
  Unread URGENT notifications after Y hours escalate to next authority
  Tracked via a scheduled check against unread HIGH/URGENT notifications
```

---

### 5.4 Reconciliation Workflow

**Current (two divergent paths):**
```
ReconcileLater: session.close → task=IN_PROGRESS → notification sent [verifiedCash never set]
ReconcileNow:   session.close → ADMIN auth → task=REVIEWED [skips FULFILLED]
```

**Target (single lifecycle, two entry points):**
```
Session closed → task=IN_PROGRESS (cashier submits closing count = FULFILLED)
               → ADMIN/Supervisor reviews → task=REVIEWED (verifiedCash confirmed)
```

**Incremental Migration Path:**

```
STEP 1 (Behavioral fix — ReconcileNow):
  Change ReconcileNow to set task=FULFILLED (not REVIEWED directly)
  Set verifiedCash at this point (cashier's count)
  Supervisor still needs to advance to REVIEWED — same ADMIN auth, separate step

STEP 2 (Consistency fix — ReconcileLater):
  Ensure variance is calculated and stored in both paths
  Set verifiedCash in ReconcileLater at submission time (cashier's count)
  The "Later" part means the supervisor REVIEWS later, not that the data is captured later

STEP 3 (UX improvement):
  The supervisor sees FULFILLED reconciliation tasks in their review queue
  One-click "Verify & Lock" advances to REVIEWED
  Identical to all other task reviews — no special reconciliation UI needed
```


---

## Part 6 — Data Model Evolution

No Prisma schemas are proposed here. Only conceptual evolution of the business entities is described.

---

### New Concepts to Introduce

**Purchase Status**
The `Purchase` model requires a formal `status` field replacing the current `notes` string-prefix pattern for void detection. Values: `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `RECEIVED`, `VOIDED`, `CLOSED`. This is the single most impactful schema addition in the purchase domain.

**Goods Receipt Note (GRN)**
A sub-record of `Purchase` representing a specific delivery event. Contains: received quantities per line item, inspection notes, receiver identity, acceptance status, and the date received. One Purchase can have many GRNs (partial deliveries). This concept does not exist yet.

**Purchase Approval Record**
When a purchase requires approval, an explicit approval record should be created — who approved, when, any conditions, and whether the approval was automatic or manual. Initially this can be captured as additional fields on Purchase (`approverId`, `approvedAt`), then extracted to a shared `ApprovalRecord` model later.

---

### Existing Concepts That Remain Unchanged

**OperationalTask** — the core aggregate is correct. The metadata JSON approach is appropriate for flexible task types. The accountability fields (creator, approver, clerk, reviewer, canceler) with timestamps are correct.

**InventoryMovement** — immutable, traceable, correctly structured. The `MovementType` enum just needs its declared values applied consistently.

**Inventory (batch)** — correct structure. `batchNumber`, `costPrice`, `expiryDate`, `locationId` are all appropriate batch-level fields.

**Notification** — correct structure. Needs `archivedAt` field. `branchId` being nullable is appropriate for business-wide notifications.

**VendorSession** — correct structure. All required fields exist.

**Entitlement models** — Feature, SubscriptionPlan, PlanEntitlement, EntitlementOverride are well-designed and require no changes.

---

### Concepts Requiring Separation

**Purchase Request vs. Purchase Order**
Currently both are collapsed into `Purchase`. The recommended evolution is to use the `status` field to distinguish them rather than introducing a new model: a `Purchase` at `DRAFT` or `PENDING_APPROVAL` is a Purchase Request; a `Purchase` at `APPROVED` or beyond is a Purchase Order. This avoids a model split while maintaining the conceptual distinction.

**Suggested / Approved / Verified Quantities on Task**
Currently these are mixed inside the `metadata` JSON. The Prisma schema already has `suggestedQty`, `approvedQty`, and `fulfilledQty` as top-level columns (audit finding, Part 10.1). The evolution is to move the code to use these top-level columns and stop relying on the metadata JSON for quantities. The metadata JSON should contain only type-specific context (locationId, variantId, batchNumber, etc.).

**MovementType enum corrections**
`WASTE_DISPOSAL` tasks should produce `WASTE` type movements, not `OUT`.
`BRANCH_TRANSFER` tasks should produce `EXTERNAL_TRANSFER` type movements, not `ADJUST`.
`INTERNAL_TRANSFER` is the correct type for `SHELF_REFILL` within the same branch.
These corrections align the movement type with the declared business vocabulary without requiring model changes.

---

### Concepts Requiring Consolidation

**`ENABLE_TASK` SystemConfig + `CREATE_TASK` EntitlementCapability**
Two separate mechanisms gate the same feature. The evolution is to eventually let the EntitlementEngine be the single gate. The `ENABLE_TASK` config should become a plan-level or override-level entitlement configuration, not a separate SystemConfig key. This is a Phase 3 entitlement concern (after subscription data is live).

---

### Lifecycle Changes

**Purchase lifecycle:** Gains explicit status with a defined state machine. The current boolean-equivalent (exists = active, `[VOIDED]` prefix = voided) is replaced by a proper status column.

**Task lifecycle:** `DRAFT` status becomes active. The `suggestedQty`/`approvedQty`/`verifiedQty` columns become the authoritative quantity fields. The metadata JSON retains type-specific context only.

**Notification lifecycle:** Gains `archivedAt`. The notification becomes logically soft-deleteable after a retention period.

---

### State Machine Evolution

**Purchase state machine (new):**
```
DRAFT → PENDING_APPROVAL → APPROVED → RECEIVED → CLOSED
                         ↘ VOIDED (from any pre-RECEIVED state)
```

**Task state machine (refined):**
```
DRAFT → PENDING → APPROVED → IN_PROGRESS → FULFILLED → REVIEWED [terminal]
                ↘ CANCELLED [from PENDING, APPROVED, IN_PROGRESS]
```
The GENERAL_CHORE shortcut (PENDING → IN_PROGRESS) is a configuration rule on the task type, not a state machine exception — it is encoded as "approval not required for this task type."


---

## Part 7 — API & Service Evolution

### Services With Good Existing Boundaries

**`EntitlementEngine`** — pure function, no side effects, no infrastructure. This is the gold standard for domain logic in the codebase. Every future domain service should follow this pattern.

**`FIFOEngine`** — pure costing function. Correctly isolated. No changes needed.

**`crudAPI` / `transactionAPI`** — well-designed infrastructure proxy. The dynamic Prisma proxy approach correctly handles all standard CRUD and batch operations. The `authMiddleware` and `multiTenantExtension` integration is clean.

**`task-workflow.ts`** — well-extracted state machine. All transition logic, role checks, and UI metadata in one file. The evolution here is to make the server-side validation call this same logic rather than duplicate it.

**`NotificationEngine.send()`** — the send function itself has a clean interface. The problem is only in `checkLowStock`, which crosses domain boundaries.

---

### Services With Mixed Responsibilities

**`NotificationEngine`** — conflates notification delivery with task creation (in `checkLowStock`). The send function is clean; the check function is not. These should be separated. The result is two services: `InventoryService.checkLowStock()` (owns the detection and task creation) and `NotificationEngine.send()` (owns only delivery).

**`create-purchase.ts`** — correctly handles the purchase record and line items, but also owns inventory mutations and cost price updates. The inventory portions belong in the Inventory Service. The cost price update (which violates INV-5) should become explicit: update cost only if this is a first purchase, or expose it as an explicit "Update Reference Cost" action.

**`AuthEngine` / `getAuthUser`** — correctly handles auth concerns, but the entitlement summary building inside `getAuthUser` is substantial. This is acceptable for Phase 2; in Phase 3, when real subscription data is live, the entitlement assembly should move to a dedicated `EntitlementSessionService`.

---

### Infrastructure Leakage Points

**`authStore` inside query functions** — `create-purchase.ts`, `void-purchase.ts`, `restock-ingredient.ts`, and `notification-engine.ts` all read `authStore.state.user` directly for `businessId`, `branchId`, and `userId`. These functions should receive tenant context as parameters rather than reading global state. This makes them testable and reusable.

**`dbTransaction` inside UI dialogs** — `open-session-dialog.tsx` and the reconcile components call `dbTransaction` directly. The transaction infrastructure should be called from service functions, not from UI components. This does not change behavior but creates a clear call hierarchy.

---

### Business Logic Leakage Points

**`tasks/$taskId/index.tsx`** — contains all inventory side-effects for task fulfillment. This is the most severe business logic leak: a React route component owns 150+ lines of inventory mutation logic. The extraction to `InventoryService.applyTaskFulfillment()` is the primary business logic decontamination effort.

**`reconcile-later.tsx` / `reconcile-now.tsx`** — contain session close logic, task update logic, and notification logic. These should delegate to service functions; the UI components should only handle form state and user confirmation.

**`tasks/create/index.tsx`** — contains the `operationalTaskCollection.insert()` call. This is acceptable for now since task creation has no complex domain logic. However, as the three-quantity model, approval routing, and auto-assignment logic grows, this should move to a `TaskService.create()` function.

---

### Potential Service Extraction Opportunities

The following service boundaries are recommended as the target state. These should be introduced incrementally, one at a time, as the need arises:

| Service | Responsibility | When to Extract |
|---------|----------------|----------------|
| `InventoryService` | All inventory mutations | Immediately — highest coupling issue |
| `TaskService` | Task creation, status transitions, validation | After inventory extraction |
| `ProcurementService` | Purchase creation, approval, void | After task service is stable |
| `NotificationService` | Event-to-notification routing, recipient resolution | After task and inventory separation |
| `ReconciliationService` | Session close, variance calculation, task update | After session workflow is standardized |
| `EntitlementSessionService` | Entitlement summary assembly at login | Phase 3 entitlement go-live |

**Important:** These services should not be introduced prematurely. Extract only when the logic warrants it — when a domain has more than one mutation owner, when business rules are duplicated, or when the call site is a UI component.


---

## Part 8 — Preserve Existing Strengths

The following architectural elements must not be disrupted by the evolution process. Every migration decision should actively protect these assets.

---

### 1. Local-First Sync Architecture (`createSyncableCollection` + `dbTransaction`)

**Why it must be preserved:** This is the foundational architectural decision that gives the application offline capability, optimistic UI, and cross-tab consistency. It is the correct technology choice for a POS application. The `dbTransaction` atomicity pattern is used by every domain and is the most reliable behavior in the system.

**What the evolution must not do:** Extract domain logic in a way that bypasses `dbTransaction`. Any new service function that mutates state must accept being called from within a `dbTransaction` callback. The service extraction migrations must preserve atomic behavior — they are not permitted to split a single transaction into multiple sequential calls.

---

### 2. Multi-Tenant Prisma Extension (`multiTenantExtension`)

**Why it must be preserved:** Tenant isolation is enforced transparently at the infrastructure layer. No query or mutation anywhere in the codebase needs to manually scope `businessId`/`branchId`. This is a rare and valuable pattern.

**What the evolution must not do:** Introduce any new database access path that bypasses this extension. Every new server function must use `getTenantPrisma()`. The `transactionAPI` path (which uses root Prisma) must remain aware that it relies on client-side input scoping.

---

### 3. `task-workflow.ts` State Machine

**Why it must be preserved:** The complete task transition logic — allowed transitions, role requirements, identity constraints, UI metadata — is extracted into one testable, non-React file. This is the cleanest domain logic in the codebase.

**What the evolution must not do:** Duplicate this logic in a server function from scratch. The server-side validation should import and reuse the same functions. The client-side checks remain as UX guards. One source of truth.

---

### 4. `EntitlementEngine`

**Why it must be preserved:** Pure function, 8-step evaluation hierarchy, infrastructure-free, clearly documented, type-safe capability keys. This is architecture that works and will last.

**What the evolution must not do:** Add infrastructure imports to the engine, add side effects, or duplicate the capability key list. When Phase 3 subscription data goes live, the context assembly changes — the engine itself does not.

---

### 5. Inventory Movement History

**Why it must be preserved:** `InventoryMovement` is the only true audit trail in the system. Every stock change is permanently recorded with the authorizing source (taskId, purchaseId, transactionId). This is the correct foundation for FIFO costing, dispute resolution, and regulatory reporting.

**What the evolution must not do:** Add any inventory mutation path that does not create an `InventoryMovement` record. The Inventory Service must enforce this as an invariant: no inventory change without a movement record.

---

### 6. `crudAPI` / `transactionAPI` Infrastructure

**Why it must be preserved:** The dynamic Prisma proxy cleanly abstracts all client-server communication. The batch transaction pattern is the correct approach for multi-collection operations. The retry-with-backoff on collection inserts is a good resilience mechanism.

**What the evolution must not do:** Bypass `crudAPI` with direct server function calls per collection. All operations must flow through the proxy so that middleware, logging, and tenant isolation are consistently applied.

---

### 7. `FIFOEngine`

**Why it must be preserved:** A pure, correctly implemented FIFO costing function with no infrastructure dependencies. This is the right architecture for financial computation.

**What the evolution must not do:** Move costing logic into collection mutation callbacks or UI components.

---

### 8. Structured ID Generation (`SequenceCounter`)

**Why it must be preserved:** Human-readable, sequential IDs for purchase orders and invoices are a business requirement. The `SequenceCounter` approach is correct and scalable.

**What the evolution must not do:** Use raw UUIDs for user-facing document identifiers. Any new aggregate that needs a human-readable ID (GRN, ApprovalRequest) should use the same pattern.

---

### 9. `authStore` Embedded Entitlement Summary

**Why it must be preserved:** Capability checks available synchronously at render time without a network call is the correct UX pattern for a POS application that must operate at counter speed.

**What the evolution must not do:** Move to async capability checks that require a server round-trip. The summary is computed once at login and cached. This is the right trade-off.

---

### 10. Discriminated-Union Task Form (`TASK_CONFIG`)

**Why it must be preserved:** The pattern of defining per-task-type field configurations and validators in one place, with dynamic form rendering, is the correct extensibility pattern for a growing task type catalogue.

**What the evolution must not do:** Spread task-type-specific logic across multiple files. When a new task type is added, all its configuration should live in `TASK_CONFIG`.


---

## Part 9 — Risk Assessment

Each risk is classified by probability (Low/Medium/High) and impact (Low/Medium/High/Critical), with a mitigation strategy.

---

### R1 — Inventory Service Extraction Breaks Offline Behavior

**What could go wrong:** The new `InventoryService` functions are written as async functions that cannot be called inside a synchronous `dbTransaction` callback, breaking the offline transaction atomicity.

**Probability:** Medium | **Impact:** Critical

**Mitigation:** The Inventory Service functions must be designed as synchronous collection-operation wrappers — not async service calls. They receive the collections as implicit context (same pattern as current code) and are called from within `dbTransaction` callbacks. The service is a code organization change, not an async boundary introduction.

**Migration order:** This is prerequisite to all other migrations. Test offline behavior explicitly after each migration step.

---

### R2 — Server-Side Task Authorization Rejects Valid Client Actions

**What could go wrong:** The server-side transition validator is slightly stricter than the client-side `task-workflow.ts` logic due to subtle differences in implementation, causing valid user actions to be rejected.

**Probability:** Medium | **Impact:** High

**Mitigation:** The server-side validator must import and reuse the exact same `checkWorkflowPermission` function from `task-workflow.ts` — not reimplement it. Only the data-fetching layer differs (server reads from Prisma; client reads from collections). Test each role/transition combination before enabling server-side enforcement.

---

### R3 — Purchase Status Migration Corrupts Existing Records

**What could go wrong:** Adding a `status` field to `Purchase` with a non-null default creates migration conflicts on existing production records.

**Probability:** Low | **Impact:** High

**Mitigation:** Add `status` with a default value of `RECEIVED` — all existing purchases are already effectively "received." Provide the migration as a Prisma migration with explicit `UPDATE purchases SET status = 'RECEIVED'` before the constraint is applied. Test on a staging environment with production data volume.

---

### R4 — Moving from `notes` Void Flag to Status Field

**What could go wrong:** Existing code that checks `purchase.notes?.startsWith('[VOIDED]')` to detect voided purchases continues to work but becomes the only void detection path if the status field is not populated on void.

**Probability:** High (during transition) | **Impact:** Medium

**Mitigation:** When void action is performed, set both `notes` prefix AND `status = 'VOIDED'` during the transition period. Remove the `notes` prefix check only after all consumers are migrated to use `status`. This is a two-phase backward-compatible migration.

---

### R5 — ReconcileNow Behavioral Change Breaks Shift-Close UX

**What could go wrong:** Changing ReconcileNow to require a separate supervisor "Verify & Lock" step (instead of completing immediately) introduces friction where cashiers previously had a single-click close.

**Probability:** Medium | **Impact:** Medium

**Mitigation:** The ADMIN authentication already exists in ReconcileNow. The "Verify & Lock" step can be presented immediately after the ADMIN authentication — same UX flow, just correctly named. The supervisor who authenticated to open the reconciliation dialog can immediately verify and lock in the same session. No additional navigation required.

---

### R6 — `authStore` Reading in Service Functions Prevents Testing

**What could go wrong:** New Inventory Service functions that read `authStore.state.user` cannot be unit-tested without a populated auth store, and cannot be called from server-side contexts where the store is unavailable.

**Probability:** High | **Impact:** Low-Medium

**Mitigation:** Design service function signatures to accept `{ userId, businessId, branchId }` as explicit parameters. The call sites (which have access to `authStore`) pass these values at invocation time. The service functions themselves have no dependency on the store. This is a better design pattern even without testing concerns.

---

### R7 — Three-Quantity Model Migration Breaks Existing Task Metadata

**What could go wrong:** Moving quantities from `metadata.suggestedQty` to top-level columns while existing tasks still reference the metadata fields creates inconsistency.

**Probability:** Medium | **Impact:** Medium

**Mitigation:** Write a data migration that copies `metadata.suggestedQty` → `suggestedQty` column for all existing tasks. After migration, the column is authoritative. The metadata field can be left in place for backward compatibility during a transition window, then deprecated. Never remove the metadata field from old tasks — the column becomes the write target, the metadata field becomes read-only historical data.

---

### R8 — Notification Cleanup Removes Read Notifications Still in UI

**What could go wrong:** An archival job removes notifications that users have read but not navigated to yet, causing broken links.

**Probability:** Low | **Impact:** Low

**Mitigation:** Archival policy: only archive notifications that are `isRead = true` AND older than N days. Unread notifications are never archived automatically. The `link` on archived notifications should remain valid — the target records are not deleted.

---

### R9 — `transactionAPI` Root Prisma Tenant Scoping Gap

**What could go wrong:** A new service function passes un-scoped data to `transactionAPI`, and since it uses root Prisma without `multiTenantExtension`, data from another tenant could be accessed.

**Probability:** Low | **Impact:** Critical

**Mitigation:** All `transactionAPI` operations must be validated by adding explicit `businessId` and `branchId` assertions in the batch executor — if any operation's `args` does not contain the session's `businessId`, the transaction is rejected. This is a defense-in-depth addition to the existing client-side scoping.

---

### Recommended Migration Order (Risk-Adjusted)

| Priority | Migration | Reason |
|----------|-----------|--------|
| 1 | Extract Inventory Service (R1) | Prerequisite for all other domain migrations; highest coupling risk; offline safety must be verified first |
| 2 | Fix MovementType enum usage | Zero-risk code change; improves data correctness immediately |
| 3 | Task edit/delete guards (R6 responsibility) | Security fix; zero schema changes required |
| 4 | Reconciliation workflow fix (R5) | Behavioral consistency; low risk with ADMIN auth already in place |
| 5 | Server-side task authorization (R2) | Security improvement; import same logic, don't reimplement |
| 6 | Purchase status field (R3, R4) | Schema change; requires staged rollout; high value |
| 7 | Three-quantity task model (R7) | Data migration required; enables richer task execution records |
| 8 | Missing notification types | Additive; no schema changes except notification type values |
| 9 | Notification archival | Additive schema change; low risk |
| 10 | GoodsReceipt / Receiving domain | New domain; additive; highest effort; lowest immediate business risk |


---

## Part 10 — Incremental Migration Roadmap

Each phase is independently deployable, keeps the application fully operational, and delivers standalone value. No phase requires completing the next one before going live.

---

### Phase A — Domain Decontamination
*Prerequisite foundation. No new features. Highest architectural value.*

**Goal:** Extract business logic out of UI components into domain service functions. Zero user-visible changes.

| Task | What Changes | Value Delivered |
|------|-------------|-----------------|
| A1: Create `InventoryService` with `applyTaskFulfillment`, `applyPurchaseReceipt`, `applyPurchaseVoid`, `applyAdjustment` | Code relocation only | Single ownership of all inventory mutations |
| A2: Migrate `create-purchase.ts` to call `InventoryService.applyPurchaseReceipt` | Code relocation only | Inventory logic consolidated |
| A3: Migrate `void-purchase.ts` to call `InventoryService.applyPurchaseVoid` | Code relocation only | Void logic consolidated |
| A4: Migrate `restock-ingredient.ts` to call `InventoryService.applyPurchaseReceipt` | Code relocation only | Third inventory mutation path consolidated |
| A5: Migrate `tasks/$taskId/index.tsx` to call `InventoryService.applyTaskFulfillment` | Extract from React component | Task UI decoupled from inventory domain |
| A6: Separate `NotificationEngine.checkLowStock` — move task creation to `InventoryService.handleLowStockDetected` | Code relocation only | Notification engine no longer creates tasks |

**Risk:** Low. Identical behavior, different code location. Offline behavior must be verified after A5.

**Deploy gate:** All existing E2E tests for task fulfillment and purchase creation pass.

---

### Phase B — Integrity & Security
*Fix business rule violations. No new features except authorization hardening.*

**Goal:** Enforce the rules that already exist in the state machine at the server level, and protect terminal records from mutation.

| Task | What Changes | Value Delivered |
|------|-------------|-----------------|
| B1: Add server-side task transition validator (reuse `checkWorkflowPermission`) | New server function | Unauthorized transitions rejected server-side |
| B2: Add status guard to `EditTaskSidebar` — reject edits on FULFILLED/REVIEWED/CANCELLED | Client guard added | Terminal tasks cannot be modified |
| B3: Add role+status guard to task delete — ADMIN/SUPERVISOR only, DRAFT/PENDING only | Client+server guard | Locked tasks cannot be deleted |
| B4: Fix `ReconcileNow` — set task to FULFILLED, require separate supervisor REVIEWED step | Behavioral change | Reconciliation workflow matches task lifecycle |
| B5: Fix `ReconcileLater` — capture `verifiedCash` and `variance` at submission | Behavioral fix | Both reconciliation paths capture complete data |
| B6: Fix `MovementType` — WASTE_DISPOSAL → WASTE, BRANCH_TRANSFER → EXTERNAL_TRANSFER | Data type correction | Enum values match declared business vocabulary |
| B7: Add missing target-branch IN movement for BRANCH_TRANSFER tasks | Functional fix | Branch transfers create both debit and credit movements |

**Risk:** Low-Medium. B4/B5 have UX impact; validate with end users. B6/B7 are data-level changes.

---

### Phase C — Task Model Maturity
*Make the task model reflect full business intent.*

**Goal:** Activate DRAFT status, expose the three-quantity model, complete the timeline, add assignment notifications.

| Task | What Changes | Value Delivered |
|------|-------------|-----------------|
| C1: Change task creation default to DRAFT; add "Submit" action to advance to PENDING | Behavioral change | Staff can save work-in-progress tasks |
| C2: Surface `suggestedQty`, `approvedQty`, `verifiedQty` as first-class task fields | UI + data model | Three-quantity model fully operational |
| C3: Approver can modify `approvedQty` at approval time | UI behavior | Business invariant TASK-3 met |
| C4: Clerk records `verifiedQty` at fulfillment time; inventory uses `verifiedQty` | Behavioral change | Actual outcome recorded separately from proposal |
| C5: Complete Timeline tab — add fulfilledAt, reviewedAt, canceledAt events | UI addition | Full audit trail visible in task detail |
| C6: Send TASK_ASSIGNED notification when `clerkId` is set | New notification type | Clerks are informed of their assignments |
| C7: Send notification when task approval is granted | New notification type | Workflow participants stay informed |

**Risk:** Medium. C1 (DRAFT activation) changes task creation behavior. C2-C4 require careful data migration for existing tasks that use `metadata.suggestedQty`.

---

### Phase D — Purchase Model Maturity
*Introduce purchase lifecycle without breaking the existing quick-receive path.*

**Goal:** Give purchases an explicit status lifecycle and optional approval workflow.

| Task | What Changes | Value Delivered |
|------|-------------|-----------------|
| D1: Add `status` column to Purchase; existing records → RECEIVED | Schema change + migration | Purchase status is a first-class field |
| D2: Change void to set `status = VOIDED` (retain notes prefix during transition) | Behavioral change | Void state is explicit, not a text hack |
| D3: Introduce Purchase Request path: create purchase at PENDING_APPROVAL status | New UI flow | Procurement now has a request→approval→receive path |
| D4: Implement purchase approval gate (configurable threshold) | New business rule | Purchases require authorization above threshold |
| D5: Link PURCHASE_REQUEST task completion to creating a Purchase in PENDING_APPROVAL status | Cross-domain link | Task→Purchase lifecycle connected |
| D6: Add PURCHASE_PENDING_APPROVAL notification to designated approver | New notification type | Approver is notified automatically |

**Risk:** Medium-High. D1 requires a schema migration. D3-D6 are new capabilities that do not affect existing behavior.

---

### Phase E — Receiving Domain ✅ COMPLETE
*Introduce GRN concept for businesses that need formal receiving workflows.*

**Goal:** Separate the acceptance of goods from the ordering of goods. This is the highest-effort phase with the lowest immediate business risk for the current customer base.

> **Status: Fully implemented — July 31, 2026**
> GoodsReceipt and GoodsReceiptItem models introduced. receiptWorkflow (third createWorkflow() consumer)
> added. create-goods-receipt.ts and confirm-goods-receipt.ts created. APPROVED→RECEIVED path in
> purchases/$purchaseId/index.tsx now goes through GRN creation and confirmation; inventory credit
> fires only on GRN confirmation (INV-01 satisfied). Quick-receive path unchanged.

| Task | What Changes | Value Delivered |
|------|-------------|-----------------|
| E1: Introduce `GoodsReceipt` model linked to Purchase | Schema change | GRN concept exists |
| E2: Add "Receive Goods" action on an approved purchase | New UI flow | Physical delivery confirmation before inventory credit |
| E3: GoodsReceipt confirmation triggers inventory credit (not purchase creation) | Business rule change | Inventory invariant INV-1 fully met |
| E4: Partial receiving: multiple GRNs per PO, PO status tracks completion | Business logic | Supplier partial deliveries handled correctly |
| E5: GRN discrepancy recording and supplier dispute flag | New concept | Quality/quantity issues have a formal path |

**Risk:** High. This changes when inventory is credited — a fundamental behavioral change. Must be introduced as an opt-in path initially, with the quick-receive path remaining for businesses that do not need formal receiving.

---

### Phase F — Entitlement Maturity (Parallel with other phases)
*Activate real subscription enforcement (Phase 3 of the entitlement roadmap).*

**Goal:** Replace `buildOpenContext()` fallback with real subscription data. This is already planned in the codebase.

| Task | What Changes | Value Delivered |
|------|-------------|-----------------|
| F1: Introduce `BusinessSubscription` model | Schema change | Subscription lifecycle is tracked |
| F2: Wire subscription data into `getAuthUser` entitlement assembly | Session change | Real plan features and limits enforced |
| F3: Remove `ENABLE_TASK` SystemConfig; gate through entitlement engine only | Config simplification | Single feature gate |

---

### Summary Roadmap

```
Phase A — Domain Decontamination    [Immediate — 0 schema changes]
Phase B — Integrity & Security      [Short-term — 0 schema changes]
Phase C — Task Model Maturity       [Medium-term — minor schema changes]
Phase D — Purchase Model Maturity   [Medium-term — 1 schema migration]
Phase F — Entitlement Maturity      [Parallel — depends on subscription model]
Phase E — Receiving Domain          [Complete — July 31, 2026]
```


---

## Part 11 — Architectural Principles

These principles govern all future development decisions in the operational domain. They are technology-agnostic and should remain valid regardless of framework or infrastructure changes.

---

### P1 — Single Ownership of Business Decisions

Every business decision has exactly one owner. No domain approves its own actions. No domain changes another domain's state directly. When domain A needs something from domain B, A produces an event and B reacts.

*Evidence base: Phase 1, Part 9.6 (shared database ownership table); Phase 2, Part 6 (Ownership Matrix)*

---

### P2 — Events Describe Completed Business Facts

A business event is a statement about something that has already happened, not a command to do something. `TaskFulfilled` means the work is done. `GoodsAccepted` means the goods passed inspection. Events are named in the past tense and are immutable — they cannot be recalled.

*Evidence base: Phase 2, Part 5 (Operational Events); Phase 1, Part 5 (Event Flow)*

---

### P3 — Tasks Coordinate People, Not Domains

An operational task is a work instruction for a human being. It authorizes a person to perform physical work. It does not perform the work itself. It does not own the inventory it involves. When a task is fulfilled, it signals that the work is done — the relevant domain (Inventory) applies the consequence.

*Evidence base: Phase 2, Part 2 (Task domain responsibilities); Business Invariant TASK-1 and TASK-2*

---

### P4 — Notifications Communicate, They Never Decide

A notification is a message. It informs a person that something happened and may require their attention. It does not create records, trigger workflows, or change business state. The logic that decides what needs to happen belongs to the domain that detected the condition.

*Evidence base: Phase 2, Part 2 (Notification domain); Business Invariant NOTIF-1; Phase 1, Part 9.2 (NotificationEngine crosses domain boundaries)*

---

### P5 — Every Inventory Mutation Has a Business Reason

Inventory does not change without a traceable business event. Every change is linked to: a confirmed goods receipt, a completed sale, an authorized and fulfilled task, or an authorized and reviewed adjustment. An inventory mutation with no business event reference is an audit failure.

*Evidence base: Phase 2, Business Invariant INV-2; Phase 1, Part 10.4 (MovementType inconsistencies)*

---

### P6 — Goods Are Not Available Before Acceptance

Inventory increases only when goods have been physically received, counted, and formally accepted. A purchase order does not increase inventory. A delivery arriving at the door does not increase inventory. Only the acceptance record does.

*Evidence base: Phase 2, Business Invariant INV-1; Phase 1, Part 10.2 (purchase creation immediately credits inventory)*

---

### P7 — Business Workflows Own Their Lifecycle

Each domain owns the full lifecycle of its primary aggregate. Purchase owns the purchase lifecycle from request to closure. Task owns the task lifecycle from creation to review. Inventory owns the inventory lifecycle from receipt to consumption. No lifecycle stage is owned by a UI component.

*Evidence base: Phase 1, Part 9.5 (tight UI coupling); Phase 2, Part 3 (Operational Lifecycle)*

---

### P8 — UI Never Owns Domain Logic

UI components present state and capture user input. They never contain business rules, inventory calculations, approval logic, or state transition validation. Business rules belong in domain service functions that can be called from any context — UI, server function, automated trigger, or test.

*Evidence base: Phase 1, Part 9.5 (business logic in UI); Phase 1, Part 10.6 (server-side authorization missing)*

---

### P9 — Terminal States Are Immutable

A record that has reached a terminal state (REVIEWED, FULFILLED in audit context, CLOSED, VOIDED) cannot be modified or deleted. Corrections to terminal records are handled through new records: a corrective task, a credit note, a new adjustment. The original record remains as historical evidence.

*Evidence base: Phase 2, Business Invariant TASK-5; Phase 1, Part 10.1 (no edit/delete guards)*

---

### P10 — Authorization Is Enforced at the Service Layer

Business authorization rules — who can do what to which records — are enforced in service functions, not in UI components. UI components use authorization data to show or hide elements as a UX aid. Service functions enforce the rules as a correctness requirement. The two are complementary, not redundant.

*Evidence base: Phase 1, Part 10.6 (server-side authorization missing); Phase 2, Part 6 (Ownership Matrix — Approval)*

---

### P11 — Approval Is Never Self-Service

No domain approves its own actions. A user who creates a purchase cannot approve it. A system that auto-creates a task cannot auto-approve it for immediate execution without first passing through an authorization decision — even if that decision is automated by policy (e.g., tasks of type GENERAL_CHORE are auto-approved). The policy is explicit; the bypass is not silent.

*Implementation note (July 31, 2026):* `InventoryEngine.handleLowStockDetected()` implements
an explicit auto-approval exception for SHELF_REFILL tasks generated by a LowStockDetected
condition. The exception is governed by the `AUTO_APPROVE_LOW_STOCK_REFILL` SystemConfig key
(default: `true`) which is configurable per business. When `true`, tasks are inserted at
`IN_PROGRESS` with all accountability fields pre-set — the decision is explicit, logged, and
revocable. To disable: set `AUTO_APPROVE_LOW_STOCK_REFILL = false` for the business and the
task will enter the standard approval queue at `PENDING`. See `inventory-engine.ts` for the
full policy rationale comment.

*Evidence base: Phase 2, Business Invariant APPR-1; Phase 1, Part 10.1 (auto-generated tasks bypass approval)*

---

### P12 — Cost Is Established at Receipt, Not at Order

The cost price of a batch of goods is recorded when those goods are accepted into inventory. It does not change when a later purchase happens at a different price. The batch retains its original cost for FIFO and reporting purposes. The "reference cost" on the product variant is a display convenience, not the authoritative cost record.

*Evidence base: Phase 2, Business Invariant INV-5; Phase 1, Part 10.2 (last-write-wins costPrice)*

---

### P13 — Atomic Operations Remain Atomic

Any operation that involves multiple domain records must be committed atomically or not at all. The `dbTransaction` pattern is the mechanism for this guarantee. No multi-domain mutation should be implemented as a sequence of independent writes that could partially succeed.

*Evidence base: Phase 1, Part 11.3 (dbTransaction atomicity); Phase 8 preservation requirement*

---

### P14 — The Sync Infrastructure Is Not a Business Rule Engine

The local-first sync system (`createSyncableCollection`, `BroadcastChannel`) is infrastructure. It synchronizes state — it does not enforce business rules, route approvals, or trigger domain logic. Business logic runs in service functions; the sync layer propagates the results.

*Evidence base: Phase 1, Part 11.1 (local-first sync architecture)*


---

## Part 12 — Validation Matrix

Every architectural change proposed in this document is traced back to its evidence sources and forward to its value delivered.

---

| Change | Why Necessary | Phase 1 Finding | Phase 2 Principle | Future Capabilities | Risks Reduced | Strengths Preserved |
|--------|--------------|-----------------|-------------------|---------------------|---------------|---------------------|
| **Extract Inventory Service** | 4 mutation owners; business rules duplicated or missing | Part 9.1 (shared DB ownership), Part 9.5 (UI coupling) | P1 (single ownership), P5 (every mutation has a reason) | Inventory reservation, partial fulfillment, multi-step transfers | R1 (offline behavior), R2 (duplicate logic drift) | Movement history, dbTransaction atomicity |
| **Fix MovementType enum usage** | WASTE used as OUT; EXTERNAL_TRANSFER unused | Part 10.4 (MovementType inconsistencies) | P5 (business reason traceability) | Waste rate reporting by type, transfer audit by direction | Data quality in reports | Movement history (makes it more accurate) |
| **Server-side task authorization** | All role checks are client-side only | Part 10.6 (authorization gaps) | P10 (service-layer enforcement) | Workflow APIs, third-party integrations | R3 (security gap) | task-workflow.ts state machine (reused) |
| **Task edit/delete guards** | Terminal tasks are modifiable/deleteable | Part 10.1 (missing guards) | P9 (terminal states immutable) | Audit trail integrity, regulatory compliance | R6 (data integrity) | Audit trail |
| **Reconciliation workflow fix** | ReconcileNow skips FULFILLED; verifiedCash not always captured | Part 10.5 (session gaps) | P7 (workflows own lifecycle), P3 (tasks coordinate people) | Consistent cash audit trail | R5 (behavioral inconsistency) | Session model, task workflow |
| **Add missing target-branch movement** | Branch transfer deducts source but never credits destination | Part 10.4 (missing lifecycle stage) | P5 (every mutation traceable), P13 (atomicity) | Accurate multi-branch inventory reports | Data accuracy | Movement history |
| **Purchase status field** | No lifecycle state; void is a string hack | Part 10.2 (no status), Part 9.3 (void detection) | P7 (lifecycle ownership) | Purchase approval, partial receiving, PO closure | R4 (void detection fragility) | SequenceCounter (IDs remain stable) |
| **Separate NotificationEngine from task creation** | Notification engine creates OperationalTask records | Part 9.2 (cross-domain violation) | P4 (notifications never decide) | Notification routing rules independent of task rules | R9 (domain coupling) | NotificationEngine.send() (preserved as-is) |
| **Three-quantity task model** | suggested=approved=verified (collapsed) | Part 10.1 (quantity model gap) | P3 (tasks coordinate people, record outcome) | Discrepancy detection, operational accuracy reporting | Data quality | Task state machine, discriminated union form |
| **DRAFT status activation** | DRAFT declared but never produced | Part 10.1 (DRAFT unused) | P9 (lifecycle stages meaningful) | Offline task drafting, mobile field use | None — additive | Task form (TASK_CONFIG unchanged) |
| **Purchase approval gate** | No authorization before inventory commit | Part 8.2 (no approval), Part 10.2 | P11 (approval not self-service), PUR-1 (invariant) | Spend controls, multi-level approval, audit | R4 (unauthorized spending) | Entitlement engine (approval scope can be gated) |
| **Notification archival** | Notifications never cleaned up | Part 10.3 (no cleanup) | NOTIF domain lifecycle | Long-term scalability | R8 (DB growth) | Notification structure (additive only) |
| **Task assignment notification** | No TASK_ASSIGNED notification despite type existing | Part 10.3 (unused type) | P4 (notifications inform people about events) | Staff awareness, SLA tracking | None — additive | Notification engine |
| **PURCHASE_REQUEST task → Purchase link** | PURCHASE_REQUEST task has no connection to a resulting Purchase | Part 10.1, 10.2 (operationalTaskId never set) | P1 (single ownership), P7 (lifecycle continuity) | Full procurement cycle traceability | Workflow coherence | Task model, purchase model |
| **Tenant scoping defense in transactionAPI** | Batch executor uses root Prisma, relies on client scoping | Part 4.4 (transactionAPI tenant gap) | P13 (atomicity), multi-tenant integrity | Enterprise multi-branch security | R9 (critical) | multiTenantExtension |

---

### Changes Not Supported by Evidence (Rejected)

The following changes are **not recommended** because they are not supported by findings from Phase 1 or principles from Phase 2:

| Proposed Change | Why Rejected |
|-----------------|-------------|
| Rewrite the task state machine | The current `task-workflow.ts` is identified as a strength. No finding supports its replacement. |
| Replace `dbTransaction` with a message queue | No finding indicates the current sync model is insufficient. Introducing async messaging would break offline atomicity. |
| Separate the Approval domain into its own database schema | Phase 1 found no multi-tenancy or scale evidence warranting microservice extraction. Approval is currently embedded in task — evolve it in place. |
| Replace the `crudAPI` proxy with REST endpoints | The proxy is identified as a strength. No finding supports its replacement. |
| Migrate to a different ORM | No finding supports this. Prisma + multiTenantExtension is a stable foundation. |


---

## Part 13 — Final Executive Summary

### Overall Architecture Maturity

**Current: Functional Prototype Hardening Toward Production**

The system successfully delivers its core operational workflows. The local-first architecture is a genuine competitive advantage — most POS systems are online-only. The multi-tenant isolation is correctly implemented. The state machine for tasks is well-designed. However, the system has not yet made the transition from "everything works" to "everything is in the right place" — business logic lives in UI components, domain boundaries are informal, and several business invariants are technically violable.

---

### Domain-Level Maturity Assessment

| Domain | Current Maturity | After Phase A+B | After Phase C+D |
|--------|-----------------|-----------------|-----------------|
| Inventory mutations | Low (4 owners) | **High** (single service) | High |
| Task lifecycle | Moderate | Moderate | **High** |
| Purchase lifecycle | Low | Moderate | **High** |
| Notification | Low | Low-Moderate | Moderate |
| Approval | Low (client-only) | Moderate | Moderate |
| Receiving | None | None | Low-Moderate |
| Session/Reconciliation | Moderate | **High** | High |
| Audit trail | Low-Moderate | Moderate | Moderate |
| Entitlement | High (structure) / Low (active) | High | High |

---

### Primary Architectural Strengths

1. **Local-first sync** — the most valuable single architectural decision; enables offline capability, optimistic UI, and cross-tab consistency with a unified abstraction
2. **Multi-tenant extension** — transparent, infrastructure-layer enforcement; zero per-query tenant-scoping code
3. **Task state machine** — extracted, documented, testable; the right pattern for workflow logic
4. **`EntitlementEngine`** — pure, extensible, infrastructure-free; will scale to any billing model
5. **Inventory movement history** — immutable, traceable, complete; the correct audit foundation
6. **`dbTransaction` atomicity** — cross-domain mutations commit atomically; offline behavior is preserved

---

### Primary Architectural Weaknesses

1. **Inventory mutations in 4 locations** — the most urgent architectural debt; creates rule duplication and makes inventory behavior unpredictable
2. **Business logic in UI components** — task fulfillment inventory side-effects live in a React component; violates P8
3. **No server-side authorization** — task transitions and purchase creation are client-enforced only; security risk
4. **Purchase lifecycle collapsed to a single event** — no receiving, no approval, no GRN; business invariants INV-1 and PUR-1 are both violated
5. **Notification engine creates tasks** — cross-domain violation that will tighten coupling as both domains grow

---

### Highest-Priority Evolution Opportunities

These deliver the highest architectural value at the lowest disruption cost:

1. **Phase A — Extract Inventory Service** — one migration, 4 call sites, zero schema changes, maximum coupling reduction
2. **Phase B — Add server-side authorization** — reuse existing logic, add one server function, close security gap
3. **Phase B — Fix reconciliation lifecycle** — behavioral consistency fix, no schema changes, closes audit gap
4. **Phase B — Fix MovementType** — two-line change per call site, fixes data quality immediately

---

### Lowest-Risk Migration Opportunities

These can be done in any sprint without risk of regression:

1. Fix `MovementType` enum usage (B6) — change constant values in 4 places
2. Add task edit guard for terminal states (B2) — add one `if` statement
3. Add task delete guard (B3) — add one `if` statement
4. Fix missing target-branch IN movement for BRANCH_TRANSFER (B7) — additive logic in inventory service after extraction
5. Add `TASK_ASSIGNED` notification on `clerkId` set (C6) — additive `NotificationEngine.send()` call

---

### Recommended Implementation Order

```
1. Phase A (complete) → Domain decontamination — foundational prerequisite
2. Phase B1, B2, B3 → Authorization & immutability guards — security baseline
3. Phase B4, B5 → Reconciliation consistency — operational accuracy
4. Phase B6, B7 → MovementType correction — data quality
5. Phase C1, C5 → DRAFT activation + Timeline completion — task UX maturity
6. Phase D1, D2 → Purchase status field — data model foundation for D3-D6
7. Phase C2, C3, C4 → Three-quantity model — requires D schema work as precedent
8. Phase D3, D4, D5, D6 → Purchase approval and request path — new capability
9. Phase F → Entitlement go-live (parallel, driven by billing roadmap)
10. Phase E → Receiving domain — long-term, significant new capability
```

---

### Long-Term Architectural Vision

The operational domain should converge toward a model where:

- **Every domain has exactly one service** that owns its mutations and enforces its rules
- **Every business event is a named TypeScript type** consumed by explicit handlers — no anonymous in-process side-effects
- **Every state transition is validated server-side** before being committed, using the same logic that drives the UI
- **The UI is a presentation layer only** — it presents domain state and captures user intent; all business logic runs in services
- **The Inventory Service is the single gate** for all stock changes — no collection is written directly from any other domain
- **The Task domain tracks all three quantities** — proposed, authorized, and verified — making operational discrepancies visible and auditable
- **The Purchase domain has a full lifecycle** — request, approval, order, receiving, acceptance — with each stage independently recorded and traceable
- **The Notification domain is a pure router** — it receives events and delivers messages; it creates nothing and decides nothing

This vision can be reached incrementally, phase by phase, without a single day of downtime.

---

### Confidence Assessment

| Recommendation | Confidence | Basis |
|---------------|------------|-------|
| Extract Inventory Service (Phase A) | **High** | Direct evidence from 4 mutation sites; zero behavior change |
| Server-side task authorization (B1) | **High** | Security gap confirmed; existing logic is reusable |
| Task edit/delete guards (B2, B3) | **High** | Missing guards directly confirmed in audit |
| Reconciliation fix (B4, B5) | **High** | Behavioral inconsistency documented in audit |
| MovementType correction (B6) | **High** | Enum values confirmed incorrect in audit |
| Missing branch transfer movement (B7) | **High** | Gap directly confirmed in audit |
| Purchase status field (D1, D2) | **High** | No status field confirmed; migration path is standard |
| Three-quantity model (C2-C4) | **High** | Schema columns already exist; business value is clear |
| DRAFT status activation (C1) | **High** | Status declared but unused; no schema change |
| Purchase approval (D3-D4) | **Medium** | Business principle is clear; threshold configuration policy needs team decision |
| Notification archival (Phase C/D) | **Medium** | Policy retention period needs business input |
| PURCHASE_REQUEST → Purchase link (D5) | **Medium** | Technical path is clear; business workflow confirmation needed |
| Receiving domain (Phase E) | **Medium** | Business model is correct; customer adoption path requires validation |
| Tenant scoping defense in transactionAPI | **High** | Security gap confirmed; mitigation is defensive, additive |
| Notification escalation (future) | **Requires Further Discovery** | Escalation policy (who, when, threshold) not defined |
| Multi-level approval (future) | **Requires Further Discovery** | Authorization limit values not defined by business |
| Entitlement Phase 3 (Phase F) | **Requires Further Discovery** | Depends on subscription model decisions outside this document's scope |

---

*End of Architecture Evolution Strategy — Operational Domain*
*Phase 3 — Principal Architect Roadmap*
*Every recommendation is grounded in Phase 1 (Architecture Discovery Audit) and Phase 2 (Business Domain Model).*
*No code has been written. No rewrites are proposed. The application continues to operate throughout the evolution.*
