# Implementation Roadmap — Corrected
## Phase 5 — Course Correction Against Real Code

> **Supersedes:** The implementation plan implied by Phase 3 (Architecture Evolution Strategy).
> **Principle:** No abstraction may exist simply because it is common in other architectures.
>   Every abstraction must emerge from at least two real implementations or from a demonstrated
>   failure of the existing architecture to express the required behavior cleanly.
> **Last updated:** July 31, 2026 (Phase E complete — all phases A–E done; Phase F complete)

---

## Table of Contents

1. [Re-Evaluation Summary](#part-1--re-evaluation-summary)
2. [InventoryService Review](#part-2--inventoryservice-review)
3. [Workflow Framework Review](#part-3--workflow-framework-review)
4. [Shared Foundation Review](#part-4--shared-foundation-review)
5. [Corrected Implementation Roadmap](#part-5--corrected-implementation-roadmap)
6. [What Was Removed and Why](#part-6--what-was-removed-and-why)
7. [Architectural Evolution Rule](#part-7--architectural-evolution-rule)

---

## Part 1 — Re-Evaluation Summary

Before this document was written, the following question was applied to every proposed abstraction:

> **Can this responsibility be handled by an existing architectural concept
> before introducing a new one?**

The existing architectural concepts are:

- `FIFOEngine`, `PriceEngine`, `EntitlementEngine`, `AuthEngine`, `NotificationEngine` — pure or nearly-pure objects with named methods, no infrastructure imports
- `task-workflow.ts` — domain state machine as flat exported functions, no class, no framework
- Query functions in `src/lib/queries/*.ts` — plain functions that receive context, call collections
- `dbTransaction` — the atomicity wrapper for all multi-collection mutations
- `createSyncableCollection` + `crudAPI` — the sync and proxy infrastructure
- `result.ts` (OperationResult, opOk, opFail) — already-established operation result type

The evaluation found that **most of the Phase 3 abstractions are correct in direction but wrong in timing**. The architecture needs fewer new concepts than originally proposed, introduced later, and named to match the existing vocabulary.

---

## Part 2 — InventoryService Review

### The Question

What responsibility would `InventoryService` own that `InventoryEngine` could not?

### Evidence from the Codebase

The audit (Phase 1, Part 9.1 and Part 9.6) confirmed that inventory mutations are written from four locations:

| Location | What it writes |
|----------|---------------|
| `tasks/$taskId/index.tsx` | inventoryCollection, inventoryMovementCollection |
| `create-purchase.ts` | inventoryCollection, inventoryMovementCollection, productVariantCollection |
| `void-purchase.ts` | inventoryCollection, inventoryMovementCollection |
| `restock-ingredient.ts` | inventoryCollection, inventoryMovementCollection |

This is real evidence of a multiple-owner problem that exists today. It is not anticipated — it is confirmed.

### The Name Question: Service vs Engine

The name `InventoryService` was proposed in Phase 3. Before accepting that name, examine what the word "engine" means in this codebase:

| Name | What it is | Has write side effects? |
|------|-----------|------------------------|
| `FIFOEngine` | Pure costing computation | No |
| `PriceEngine` | Pure formatting | No |
| `EntitlementEngine` | Pure capability evaluation | No |
| `AuthEngine` | Login/logout methods, credential checks | Yes (writes auth state) |
| `NotificationEngine` | Notification creation and delivery | Yes (inserts to collection) |

`AuthEngine` and `NotificationEngine` both have write side effects and are still called engines. The "Engine" suffix in this codebase means *a domain-specific object with named methods*, not *a pure computation*. `InventoryEngine` is the correct name. `InventoryService` would introduce a naming inconsistency that signals "this came from a different architectural tradition."

### Conclusion: InventoryEngine Should Be Introduced

**Verdict: Introduce `InventoryEngine`. The name `InventoryService` should not be used.**

Evidence base: 4 confirmed mutation owners exist today. The problem is real. The fix is clear.

What `InventoryEngine` cannot do that an "evolution of existing code" could: there is no existing inventory-owning file to evolve. The inventory logic is scattered across 4 unrelated files. The Engine is not a replacement of something — it is the consolidation point that does not yet exist.

**What expanding `InventoryEngine` could simplify:**
- Eliminates rule duplication (inventory floor-at-zero logic, movement creation, batch upsert logic all exist in multiple forms)
- Ensures FIFO is applied consistently (currently unverified at 3 of 4 call sites)
- Makes offline behavior testable as a unit
- Removes business logic from a React route component

**Would introducing another layer improve clarity or simply increase indirection?**

There is no "another layer" here. There is currently no layer at all — inventory logic is flat inside query files and a React component. The Engine is the first layer, not an additional one.

**Is this solving today's problem or anticipating tomorrow's?**

Today's problem. Four confirmed write owners. This is not anticipation.

### Design of InventoryEngine

`InventoryEngine` follows the existing Engine pattern:

```typescript
// src/lib/inventory/inventory-engine.ts

export const InventoryEngine = {

  /**
   * Apply inventory side-effects when a task is marked as FULFILLED.
   * Called from the FULFILLED transition handler inside dbTransaction.
   * Receives the task and the collection references — no global store reads.
   */
  applyTaskFulfillment(params: {
    task: feTask
    inventoryCollection: SyncableCollection<Inventory>
    movementCollection: SyncableCollection<InventoryMovement>
    userId: string
    branchId: string
    businessId: string
  }): void { ... }

  /**
   * Apply inventory side-effects when a purchase is created (goods received).
   * Called from create-purchase.ts inside dbTransaction.
   */
  applyPurchaseReceipt(params: {
    purchaseId: string
    structuredId: string
    items: PurchaseLineItem[]
    inventoryCollection: SyncableCollection<Inventory>
    movementCollection: SyncableCollection<InventoryMovement>
    userId: string
    branchId: string
    businessId: string
  }): void { ... }

  /**
   * Reverse inventory side-effects when a purchase is voided.
   * Called from void-purchase.ts inside dbTransaction.
   */
  applyPurchaseVoid(params: {
    purchaseId: string
    purchaseIdDisplay: string
    movementsToReverse: InventoryMovement[]
    inventoryCollection: SyncableCollection<Inventory>
    movementCollection: SyncableCollection<InventoryMovement>
    userId: string
  }): void { ... }

  /**
   * Apply a manual inventory adjustment with a stated reason.
   * Called from restock-ingredient.ts inside dbTransaction.
   */
  applyAdjustment(params: {
    variantId: string
    batchNumber: string
    quantity: number
    locationId: string | null
    costPrice: number
    expiryDate: Date | null
    purchaseId: string
    structuredId: string
    reason: string
    inventoryCollection: SyncableCollection<Inventory>
    movementCollection: SyncableCollection<InventoryMovement>
    userId: string
    branchId: string
    businessId: string
  }): void { ... }

}
```

**Critical design constraint (from Phase 3, Risk R1):**

All methods must be synchronous. They must be callable from inside a `dbTransaction` callback without introducing an async boundary. They are code-organization changes, not async service calls. The existing code is synchronous collection writes; the Engine methods remain synchronous collection writes, just consolidated in one place.

---

## Part 3 — Workflow Framework Review

### The Question

Does `workflow.ts` (the generic `createWorkflow()` factory) represent a genuinely reusable pattern today, or does it currently solve only one implementation?

### Evidence from the Codebase

`workflow.ts` was written at `src/lib/workflow.ts`. Its current consumer count: **zero**.

`task-workflow.ts` exists at `src/routes/(private)/tasks/$taskId/-components/task-workflow.ts`. It is well-designed flat functions — STATUS_PRIORITY, WORKFLOW_TRANSITIONS, TRANSITION_UI_CONFIG, checkWorkflowPermission, getAllowedTransitionsForUser. It works. It is the only workflow in the codebase.

No Purchase status field exists. No GRN model exists. Session is OPEN/CLOSED — a two-state lifecycle with no guards, not a candidate for the framework.

### Assessment

`workflow.ts` is sound engineering. The `createWorkflow()` factory is:
- Generic over state and context types
- Pure — no infrastructure imports
- O(1) transition lookup via pre-built maps
- Consistent with the existing `result.ts` (OperationResult) pattern it already imports

However, it currently has no consumers. It was written in anticipation of a second workflow (Purchase). That second workflow does not exist yet because Purchase has no status field.

The framework is justified **conditionally** — it is justified the moment the Purchase status field is introduced (Phase D1). At that point, two workflows exist, both would need the same boilerplate that `createWorkflow()` eliminates, and the framework earns its existence.

### Conclusion: Keep workflow.ts. Do NOT migrate task-workflow.ts yet.

**Verdict: workflow.ts is retained but not consumed until Phase D1.**

The correct adoption sequence:
1. Phase D1: Purchase status field is introduced → a `purchaseWorkflow` is needed
2. At that point, `createWorkflow()` is used to define `purchaseWorkflow`
3. When `purchaseWorkflow` exists alongside `taskWorkflow`, both are migrated to `createWorkflow()` simultaneously
4. The migration of `task-workflow.ts` is justified by the existence of a second consumer, not by the framework's existence alone

**Why not migrate task-workflow.ts now?**

`task-workflow.ts` works. It is tested by the fact that the entire task lifecycle operates correctly. Rewriting a working, well-designed file with zero behavior change is pure churn — it introduces risk with no immediate benefit. The benefit materializes when a second workflow must exist.

**Condition for revisiting:**
If Purchase status field is introduced and no second workflow consumer appears within that phase, `workflow.ts` should be removed rather than kept as dead code.

---

## Part 4 — Shared Foundation Review

Each proposed shared file is evaluated below.

---

### `result.ts` — OperationResult, opOk, opFail

| | |
|--|--|
| **Purpose** | Typed operation outcome for workflow transitions and query-layer guards |
| **Existing Alternative** | `neverthrow` ResultAsync is used at the infrastructure layer. OperationResult fills a different gap: business outcomes (PERMISSION_DENIED, PRECONDITION_FAILED) that are not errors. |
| **Justification** | The file already exists and is already consumed by `workflow.ts`. The infrastructure layer uses neverthrow; the domain layer uses OperationResult. The two are intentionally separate. |
| **Evidence** | `workflow.ts` imports from `result.ts`. `task-workflow.ts` returns booleans — the migration to OperationResult is natural as server-side validation is added. |
| **Recommendation** | **Keep. Already exists. No change needed.** |

---

### `workflow.ts` — createWorkflow()

| | |
|--|--|
| **Purpose** | Generic state machine factory that eliminates boilerplate for any aggregate with a defined lifecycle |
| **Existing Alternative** | `task-workflow.ts` flat functions. They work today. They would need to be duplicated for Purchase. |
| **Justification** | Not yet justified by two consumers. Justified conditionally — the moment Phase D1 adds a Purchase workflow. |
| **Evidence** | No second workflow consumer exists today. |
| **Recommendation** | **Keep. Do not consume yet. Activate at Phase D1 when a second workflow is required.** |

---

### `src/lib/inventory/inventory-engine.ts` — InventoryEngine

| | |
|--|--|
| **Purpose** | Sole owner of all inventory mutations; consolidates logic from 4 confirmed write sites |
| **Existing Alternative** | No existing alternative — there is no current consolidation point. The existing pattern is direct collection writes in 4 separate files. |
| **Justification** | 4 confirmed mutation owners today. Business rules are duplicated or absent at some call sites (e.g., FIFO not confirmed at 3 sites, floor-at-zero inconsistently applied). |
| **Evidence** | Phase 1 Part 9.1 and Part 9.6 confirm the 4 write sites directly from code inspection. |
| **Recommendation** | **Introduce. Highest architectural priority. Rename from InventoryService to InventoryEngine.** |

---

### `src/lib/events/types.ts` — Business Event Type Definitions

| | |
|--|--|
| **Purpose** | TypeScript types for business events (LowStockDetected, TaskFulfilled, etc.) |
| **Existing Alternative** | Events are currently implicit — anonymous in-process function calls. No event type system exists. |
| **Justification** | Not justified today. The codebase has no event routing. Adding TypeScript types for events that have no routers or consumers is documentation that lives in the wrong layer. |
| **Evidence** | All cross-domain calls are direct function calls inside `dbTransaction`. There is no event bus, no pub/sub, no handlers registered against event types. |
| **Recommendation** | **Delay. Introduce only after InventoryEngine and NotificationEngine checkLowStock separation are complete. At that point, the call boundaries become natural event shapes.** |

---

### `TaskService` / Extracted Task Mutation Layer

| | |
|--|--|
| **Purpose** | Own task creation, transition validation, and side-effect triggering |
| **Existing Alternative** | `task-workflow.ts` owns the state machine logic. Task creation is a single `operationalTaskCollection.insert()` call. The business logic for task transitions already lives in `task-workflow.ts`. |
| **Justification** | Not justified yet. The task mutation problem is: a React component owns inventory side-effects. The fix for that is `InventoryEngine.applyTaskFulfillment()`, not a TaskService. After inventory is extracted, the remaining task mutation logic is simple status updates — no "service" is needed for that. |
| **Evidence** | Task mutations are in one UI component (`tasks/$taskId/index.tsx`). The problem is the inventory logic inside it, not the task update calls themselves. |
| **Recommendation** | **Delay. The inventory extraction (InventoryEngine) resolves the task UI coupling problem. Revisit if a second domain requires task mutations.** |

---

### Generic Infrastructure (Event bus, workflow registry, service locator)

| | |
|--|--|
| **Purpose** | Infrastructure for routing events and discovering services |
| **Existing Alternative** | Direct function calls inside `dbTransaction`. This is the StartPOS pattern. It works. It is offline-safe. |
| **Justification** | None. No evidence in the codebase that the direct call pattern is insufficient. |
| **Evidence** | None. |
| **Recommendation** | **Remove from plan entirely.** |

---

### `NotificationEngine` refactor (internal only)

| | |
|--|--|
| **Purpose** | Separate `checkLowStock` task-creation logic from notification delivery |
| **Existing Alternative** | The existing `NotificationEngine` handles both. Splitting is a code-organization change inside the existing Engine, not a new abstraction. |
| **Justification** | `NotificationEngine.checkLowStock()` creates `OperationalTask` records — a confirmed cross-domain violation (Phase 1 Part 9.2). The task-creation logic belongs in `InventoryEngine.handleLowStockDetected()`. |
| **Evidence** | Confirmed call site in `notification-engine.ts` that calls `operationalTaskCollection.insert()`. |
| **Recommendation** | **Do as part of InventoryEngine introduction. Move task creation to InventoryEngine.handleLowStockDetected(). NotificationEngine.checkLowStock() retains only the notification send call.** |

---

## Part 5 — Corrected Implementation Roadmap

This roadmap applies the Architectural Evolution Rule: every new abstraction must emerge from at least two real implementations, or from a confirmed failure of the existing architecture.

The phases from Phase 3 are retained but their task lists are trimmed, reordered, and renamed to use StartPOS vocabulary.

---

### Phase A — Domain Decontamination ✅ COMPLETE
**Goal:** Extract inventory mutations out of the wrong locations. Zero schema changes. Zero user-visible changes. Highest coupling reduction per unit of effort.

**New abstraction introduced: `InventoryEngine`**
Justified by 4 confirmed mutation owners. See ADR-001.

> **Status: Fully implemented — July 30, 2026**
>
> Naming note: `src/lib/conversion/inventory-engine.ts` (the POS availability calculator) was renamed to `src/lib/conversion/pos-stock-engine.ts` and its export renamed from `InventoryEngine` to `PosStockEngine` to eliminate the name collision with the new mutation engine. All 13 import sites updated.

| Task | Action | Justification | Status |
|------|--------|---------------|--------|
| **A1** | Create `src/lib/inventory/inventory-engine.ts` with `applyTaskFulfillment`, `applyPurchaseReceipt`, `applyPurchaseVoid`, `applyAdjustment`, `handleLowStockDetected` methods | 4 mutation owners confirmed in Phase 1 audit | ✅ Done |
| **A2** | Migrate `create-purchase.ts` — replace inline inventory writes with `InventoryEngine.applyPurchaseReceipt(...)` | Lowest-risk call site (no state machine) | ✅ Done |
| **A3** | Migrate `void-purchase.ts` — replace inline inventory writes with `InventoryEngine.applyPurchaseVoid(...)` | Lowest-risk call site | ✅ Done |
| **A4** | Migrate `restock-ingredient.ts` — replace inline inventory writes with `InventoryEngine.applyAdjustment(...)` | Low-risk call site | ✅ Done |
| **A5** | Migrate `tasks/$taskId/index.tsx` — replace all inline inventory mutation blocks with `InventoryEngine.applyTaskFulfillment(task, ...)` | Highest-value migration — removes business logic from React component | ✅ Done |
| **A6** | Move task-creation logic out of `NotificationEngine.checkLowStock()` into `InventoryEngine.handleLowStockDetected()` | Confirmed cross-domain violation (Phase 1 Part 9.2) | ✅ Done |

**Implementation notes:**
- All engine methods are synchronous — called inside `dbTransaction` callbacks without introducing async boundaries (Risk R1 preserved)
- `TenantContext` (`userId`, `branchId`, `businessId`) is passed explicitly to every method — no `authStore` reads inside the engine (Risk R6 resolved)
- `applyAdjustment` returns `inventoryId` (string) to allow callers to include the batch in their return value
- B6 MovementType corrections applied early inside `applyTaskFulfillment`: `WASTE_DISPOSAL → WASTE`, `BRANCH_TRANSFER → EXTERNAL_TRANSFER`, `SHELF_REFILL → INTERNAL_TRANSFER`

**What is NOT introduced in Phase A:**
- No TaskService
- No event type system
- No workflow migration
- No schema changes
- No new routes or UI

**Deploy gate:** All existing E2E tests for task fulfillment and purchase creation pass. Manual verification of offline behavior after A5.

---

### Phase B — Integrity and Security ✅ COMPLETE
**Goal:** Enforce existing rules at the right layer. Fix behavioral inconsistencies. No new abstractions — only guard functions and conditional checks.

**No new abstraction introduced.** All work is additions to existing files or guard conditions.

> **Status: Fully implemented — July 30, 2026**

| Task | Action | Justification | Status |
|------|--------|---------------|--------|
| **B1** | Add transition permission guard in `handleStatusChange` — calls `checkWorkflowPermission` from `task-workflow.ts` before entering `dbTransaction`; returns `toast.error` and bails if denied | Phase 1 Part 10.6: all auth is client-side only | ✅ Done |
| **B2** | Add status guard to `EditTaskSidebar` — new `taskStatus` prop; `LOCKED_STATUSES = [FULFILLED, REVIEWED, CANCELLED]`; form replaced with locked-state UI; `handleSubmit` also guards as safety net | Phase 1 Part 10.1: no edit guard exists | ✅ Done |
| **B3** | Add role+status guard to task delete — `DELETABLE_ROLES = [ADMIN, SUPERVISOR]`, `DELETABLE_STATUSES = [DRAFT, PENDING]`; button hidden for ineligible combinations; re-checked at confirm time | Phase 1 Part 10.1: no delete guard exists | ✅ Done |
| **B4** | Fix `ReconcileNow` — task transitions to `FULFILLED` (not `REVIEWED` directly); metadata now includes `verifiedCash` and `variance`; `vendorSession.verifiedCash` set to actual counted cash (was `expectedCash`) | Phase 1 Part 10.5: reconciliation lifecycle inconsistency | ✅ Done |
| **B5** | Fix `ReconcileLater` — task metadata now captures `verifiedCash = Number(value.closingCash)` and `variance = verifiedCash - expectedCash`; fields required by `CashReconciliationDetails` display | Phase 1 Part 10.5: verifiedCash never set in this path | ✅ Done |
| **B6** | Fix `MovementType` — WASTE_DISPOSAL tasks → `WASTE`, BRANCH_TRANSFER tasks → `EXTERNAL_TRANSFER`, SHELF_REFILL tasks → `INTERNAL_TRANSFER` | Phase 1 Part 10.4: declared enum values never used | ✅ Done (applied inside `InventoryEngine.applyTaskFulfillment` in Phase A) |
| **B7** | Add missing target-branch IN movement for BRANCH_TRANSFER tasks — second `movementCollection.insert` with `type: IN`, `branchId: targetBranchId`; only inserted when `targetBranchId` is non-null | Phase 1 Part 10.4: branch transfers deduct source but never credit destination | ✅ Done |

**Implementation notes:**
- B1 uses `checkWorkflowPermission` directly from `task-workflow.ts` — no logic duplication, single source of truth preserved
- B2 guard activates at both render time (locked UI) and submit time (safety net for stale props)
- B3 `useMemo` dependency updated to `[user]` so the delete button visibility recalculates when the user changes
- B4 corrects the session `verifiedCash` field which was incorrectly set to `expectedCash` in the original code
- B7 scopes the IN movement to the receiving branch via `branchId: targetBranchId`; the inventory record credit itself is deferred to when the receiving branch accepts the transfer via `InventoryEngine.applyAdjustment`

**Files modified:**
- `src/routes/(private)/tasks/$taskId/index.tsx` — B1
- `src/routes/(private)/tasks/$taskId/-edit-task.tsx` — B2
- `src/routes/(private)/tasks/index.tsx` — B3
- `src/routes/(private)/pos/-components/reconcile-now.tsx` — B4
- `src/routes/(private)/pos/-components/reconcile-later.tsx` — B5
- `src/lib/inventory/inventory-engine.ts` — B6 (Phase A), B7

---

### Phase C — Task Model Maturity ✅ COMPLETE
**Goal:** Activate the declared but unused parts of the task model. Surface three-quantity model. Complete the Timeline tab.

**No new abstraction introduced.** All work is behavioral changes to existing task forms and handlers.

> **Status: Fully implemented — July 31, 2026**

| Task | Action | Justification | Status |
|------|--------|---------------|--------|
| **C1** | Change task creation default to DRAFT; "Submit for Approval" action surfaces automatically via existing `DRAFT→PENDING` workflow config | Phase 1 Part 10.1: DRAFT status declared but never produced | ✅ Done |
| **C2** | `QuantityStrip` component in `task-details-tab.tsx` renders all three quantities with distinct color-coded badges (blue/purple/indigo) for all five quantity-bearing task types | Phase 1 Part 10.1: three columns exist but all collapse to same value | ✅ Done |
| **C3** | At `PENDING` status, `approvedQty` cell becomes an editable input with save-in-place button; writes directly to `operationalTaskCollection.update` | Business Invariant TASK-3 | ✅ Done |
| **C4** | At `IN_PROGRESS` status, `verifiedQty` cell becomes an editable input with save-in-place button; `InventoryEngine.applyTaskFulfillment` now resolves `verifiedQty ?? approvedQty ?? suggestedQty ?? 0` | Business Invariant TASK-3; requires Phase A complete | ✅ Done |
| **C5** | Timeline tab now renders all six lifecycle events conditionally: `createdAt`, `approvedAt`, `inProgressAt`, `fulfilledAt`, `reviewedAt`, `canceledAt`; each references the responsible actor from joined user fields | Phase 1 Part 10.1: timeline is incomplete | ✅ Done |
| **C6** | `TASK_ASSIGNED` notification fires after `IN_PROGRESS` transaction commits; targets the assigned clerk; self-notification suppressed when clerk starts their own task | Phase 1 Part 10.3: type declared, never used | ✅ Done |

**Files modified:**
- `src/routes/(private)/tasks/create/index.tsx` — C1
- `src/routes/(private)/tasks/$taskId/-components/task-details-tab.tsx` — C2, C3, C4
- `src/lib/inventory/inventory-engine.ts` — C4 (quantity resolution chain)
- `src/routes/(private)/tasks/$taskId/-components/task-timeline-tab.tsx` — C5
- `src/routes/(private)/tasks/$taskId/index.tsx` — C6

**What is NOT introduced in Phase C:**
- No schema changes (all three quantities already existed in `TaskMetadata` JSON)
- No new abstractions
- No new routes

---

### Phase D — Purchase Model Maturity ✅ COMPLETE
**Goal:** Introduce the Purchase status lifecycle. This is the trigger for adopting `workflow.ts`.

**New abstractions activated: `src/lib/result.ts`, `src/lib/workflow.ts` (via `purchaseWorkflow`)**
Justified at this phase by the existence of two workflows needing the same pattern. See ADR-002, ADR-003.

> **Status: Fully implemented — July 31, 2026**

| Task | Action | Justification | Status |
|------|--------|---------------|--------|
| **D1** | Add `PurchaseStatus` enum (DRAFT, PENDING_APPROVAL, APPROVED, RECEIVED, VOIDED, CLOSED) + `status` field to Purchase model; `@default(RECEIVED)` preserves backward compat. Add `PURCHASE_PENDING_APPROVAL` to `NotificationType`. Run `prisma generate`. | Phase 1 Part 10.2: no status field; void via notes prefix | ✅ Done |
| **D2** | `void-purchase.ts` — set `status = VOIDED` on void; retain `[VOIDED]` notes prefix during transition window; guard on both field and prefix | Phase 1 Part 9.3: void detection fragility | ✅ Done |
| **D3** | Create `src/lib/result.ts` — `OperationResult<T>`, `OperationCode`, `opOk()`, `opFail()` | ADR-003: domain-layer result type distinct from infrastructure `neverthrow` | ✅ Done |
| **D4** | Create `src/lib/workflow.ts` — `createWorkflow()` factory, `Workflow<S,C>` interface, `TransitionDef`, `TransitionGuard`, `WorkflowConfig` | ADR-002: now activated — two consumers exist simultaneously | ✅ Done |
| **D5** | Create `src/lib/queries/purchase-workflow.ts` — `purchaseWorkflow` via `createWorkflow()` (first consumer); `getPurchaseStatusUIMetadata()` display helper | First production consumer of `workflow.ts` | ✅ Done |
| **D6** | Migrate `task-workflow.ts` to use `createWorkflow()` (second consumer); all existing exports preserved — `checkWorkflowPermission`, `getAllowedTransitionsForUser`, `getStatusUIMetadata`, `STATUS_PRIORITY`, `WORKFLOW_TRANSITIONS`, `TRANSITION_UI_CONFIG` | Justified by simultaneous existence of `purchaseWorkflow` | ✅ Done |
| **D7** | `create-purchase.ts` — set `status = RECEIVED` on quick-receive insert | Explicit status on all new records | ✅ Done |
| **D8** | Create `src/lib/queries/create-purchase-request.ts` — creates purchase at `PENDING_APPROVAL`; creates line items; does NOT credit inventory; sends `PURCHASE_PENDING_APPROVAL` notification to admins/supervisors | D5 from original plan: Purchase Request path | ✅ Done |
| **D9** | `purchases/index.tsx` — status badge driven by `getPurchaseStatusUIMetadata(row.original.status)` instead of notes-prefix heuristic | Status field is now authoritative | ✅ Done |
| **D10** | `purchases/$purchaseId/index.tsx` — full rewrite: status badge from `PurchaseStatus` field; `purchaseWorkflow.allowedTransitions()` drives footer action buttons; `APPROVED→RECEIVED` calls `InventoryEngine.applyPurchaseReceipt()` inside `dbTransaction`; destructive actions confirmed via `WarningPrompt`; `isTerminal()` hides footer when no actions available | Workflow actions driven by declarative config | ✅ Done |
| **D11** | `purchases/create/index.tsx` — mode toggle: "Quick Receive" (→ RECEIVED immediately) vs "Request Approval" (→ PENDING_APPROVAL, notifies admins) | D5 from original plan: new path surfaced in UI | ✅ Done |

**Implementation notes:**
- `result.ts` and `workflow.ts` live at `src/lib/` — shared domain layer, not query-specific
- `purchaseWorkflow` guards use `requireRole()` and the `PurchaseWorkflowContext` shape `{ userRole, userId }`
- `taskWorkflow` guards use `requireRole()` + `requireAssignedOrUnset()` + `requireApproverOrReviewerForCancel()` — identity guards preserved exactly as the original `checkWorkflowPermission` logic
- `exactOptionalPropertyTypes` TS config required widening `TaskWorkflowContext` optional fields to `string | null | undefined`
- `APPROVED → RECEIVED` transition credits inventory via `InventoryEngine.applyPurchaseReceipt()` — the same engine method used by the quick-receive path, ensuring a single code path for inventory crediting regardless of purchase origin
- Quick-receive path (`create-purchase.ts`) is unchanged for existing cash-and-carry operations
- `[VOIDED]` notes prefix retained during transition window so any code that still reads it continues to work

**Files created:**
- `src/lib/result.ts`
- `src/lib/workflow.ts`
- `src/lib/queries/purchase-workflow.ts`
- `src/lib/queries/create-purchase-request.ts`

**Files modified:**
- `prisma/schema.prisma` — D1
- `src/lib/queries/create-purchase.ts` — D7
- `src/lib/queries/void-purchase.ts` — D2
- `src/routes/(private)/tasks/$taskId/-components/task-workflow.ts` — D6
- `src/routes/(private)/(dashboard)/(admin)/purchases/index.tsx` — D9
- `src/routes/(private)/(dashboard)/(admin)/purchases/$purchaseId/index.tsx` — D10
- `src/routes/(private)/(dashboard)/(admin)/purchases/create/index.tsx` — D11

**What is NOT introduced in Phase D:**
- No configurable approval threshold (deferred — requires SystemConfig plumbing, no two implementations to justify it yet)
- No GoodsReceipt model (Phase E)
- No TaskService

---

### Phase E — Receiving Domain ✅ COMPLETE
**Goal:** Introduce the GRN (Goods Receipt Note) concept — the formal bridge between a supplier delivery event and inventory credit. Separates "a purchase was ordered/approved" from "goods were physically received and counted."

**New abstractions introduced: `GoodsReceipt` + `GoodsReceiptItem` models, `receiptWorkflow`**
Justified by the need to track partial receipts, discrepancies, and multi-delivery purchases — none of which are expressible with the current single-step APPROVED→RECEIVED transition.

> **Status: Fully implemented — July 31, 2026**

| Task | Action | Justification | Status |
|------|--------|---------------|--------|
| **E1** | Add `GoodsReceipt` model to Prisma schema — `id`, `purchaseId`, `receivedById`, `notes`, `status` (GoodsReceiptStatus enum: PENDING/CONFIRMED/DISPUTED), `branchId`, `businessId`. Back-refs on Purchase, User, Business, Branch | New domain concept — not expressible today | ✅ Done |
| **E2** | Add `GoodsReceiptItem` model — `receiptId`, `purchaseItemId`, `variantId`, `unitId`, `orderedQty`, `receivedQty`, `unitCost`, `discrepancyNotes`. Back-refs on PurchaseItem, ProductVariant, Unit | Captures variance between PO quantity and actual delivery | ✅ Done |
| **E3** | Add `receiptWorkflow` using `createWorkflow()` — states: PENDING → CONFIRMED / DISPUTED; CONFIRMED requires SUPERVISOR or ADMIN, DISPUTED requires any role. `getReceiptStatusUIMetadata()` helper added | Third `createWorkflow()` consumer — framework fully validated by 3 simultaneous consumers | ✅ Done |
| **E4** | Create `create-goods-receipt.ts` — validates APPROVED status, inserts GRN at PENDING + one GoodsReceiptItem per PO line (receivedQty defaults to orderedQty). No inventory credit | Decouples "approval" from "physical receipt" | ✅ Done |
| **E5** | Create `confirm-goods-receipt.ts` — `receiptWorkflow.canTransition` pre-check, `dbTransaction` advances GRN to CONFIRMED, calls `InventoryEngine.applyPurchaseReceipt` with `receivedQty`, updates variant costPrice, advances Purchase to RECEIVED. `disputeGoodsReceipt` in same file | Inventory credited at confirmation, not at PO creation (INV-01 satisfied) | ✅ Done |
| **E6** | Create `fetch-goods-receipts.ts` — `useLiveQuery` filtered by `purchaseId`, joins receiver/variant/product/unit, exports `feGoodsReceipt` and `feGoodsReceiptItem` types | Live query for GRN data | ✅ Done |
| **E7** | `purchases/$purchaseId/index.tsx` rewritten — `APPROVED→RECEIVED` now calls `createGoodsReceipt()` instead of direct inventory credit. Receipts tab added (visible for APPROVED/RECEIVED/CLOSED purchases) with per-line qty comparison, discrepancy highlighting (amber), and Confirm/Dispute buttons driven by `receiptWorkflow.allowedTransitions` | UI surface for Receiving domain | ✅ Done |

**Implementation notes:**
- `GoodsReceiptStatus` uses `PENDING/CONFIRMED/DISPUTED` (not DRAFT as originally proposed in Phase 3) — PENDING is a clearer name for "arrived but not yet verified"
- Quick-receive path (`create-purchase.ts` → RECEIVED directly) is completely untouched — backward compatible for cash-and-carry operations
- SCHEMA_VERSION bumped 10→11 in `collections.ts` to force clean resync after schema additions
- All 7 modified files: zero diagnostics
- `prisma validate` and `prisma generate` both pass

**Files created:**
- `src/lib/queries/receipt-workflow.ts`
- `src/lib/queries/create-goods-receipt.ts`
- `src/lib/queries/confirm-goods-receipt.ts`
- `src/lib/queries/fetch-goods-receipts.ts`

**Files modified:**
- `prisma/schema.prisma` — GoodsReceiptStatus enum, GoodsReceipt model, GoodsReceiptItem model, back-refs on 7 models
- `src/db/collections.ts` — GoodsReceipt/Item imports, SCHEMA_VERSION 10→11, two new collections
- `src/routes/(private)/(dashboard)/(admin)/purchases/$purchaseId/index.tsx` — APPROVED→RECEIVED redirected to GRN creation, Receipts tab added

---

### Phase F — Entitlement Maturity (Parallel) ✅ COMPLETE
**Goal:** Replace `buildOpenContext()` fallback with real subscription data. Planned separately from the above phases; driven by billing roadmap.

> **Status: Fully implemented — July 31, 2026**

| Task | Action | Status |
|------|--------|--------|
| **F1** | Introduce `BusinessSubscription` model + `SubscriptionStatus` enum in Prisma schema; add `subscription` relation to `Business`; `SubscriptionPlan` gains `businessSubscriptions` back-ref; run `prisma generate` | ✅ Done |
| **F2** | Wire real subscription data into `getAuthUser` — when a `BusinessSubscription` record exists, build `EntitlementContext` from actual plan entitlements, status, txRemaining, and creditBalance; open-context fallback retained when no subscription record exists (dev / onboarding) | ✅ Done |
| **F3** | Remove `ENABLE_TASK` SystemConfig dual-gate; sidebar and tasks route now gate via `entitlement.capabilities.includes(Capabilities.CREATE_TASK)`; mock-user helper gains default `entitlement` field; sidebar and tasks tests updated; `collections.test.ts` corrected for Phase E schema version 11 and 29 collections | ✅ Done |

---

### Roadmap Summary

```
Phase A — InventoryEngine introduction         ✅ COMPLETE  [0 schema changes]
Phase B — Integrity & Security guards          ✅ COMPLETE  [0 schema changes]
Phase C — Task model maturity                  ✅ COMPLETE  [0 schema changes]
Phase D — Purchase status + workflow adoption  ✅ COMPLETE  [1 schema migration — PurchaseStatus enum + status field]
Phase E — Receiving domain (GRN)               ✅ COMPLETE  [2 schema additions — GoodsReceipt, GoodsReceiptItem]
Phase F — Entitlement go-live                  ✅ COMPLETE  [1 schema addition — BusinessSubscription, SubscriptionStatus enum]
```

---

## Part 6 — What Was Removed and Why

These abstractions were proposed in Phase 3 and are removed or deferred from the active plan.

| Removed / Deferred | Original Proposal | Reason for Removal |
|-------------------|------------------|-------------------|
| `InventoryService` name | Phase 3, Part 3 | Name inconsistent with codebase vocabulary. Replaced by `InventoryEngine`. |
| `TaskService` | Phase 3, Part 7 | The coupling problem is inventory logic in a React component. `InventoryEngine.applyTaskFulfillment()` solves it. A TaskService adds a layer without evidence. Deferred until a second domain requires task mutations. |
| `ProcurementService` | Phase 3, Part 7 | Purchase logic is already in query functions (`create-purchase.ts`, `void-purchase.ts`). No evidence of duplication requiring a service. |
| `ReconciliationService` | Phase 3, Part 7 | Session close is 3 dialog files. After B4/B5 fixes, behavior is correct. No evidence of rule duplication requiring a service. |
| `EntitlementSessionService` | Phase 3, Part 7 | Phase 3 future concern. Not actionable until Phase F. |
| `src/lib/events/types.ts` | Phase 3, Part 4 | No event bus, no routers, no consumers. TypeScript event types with no infrastructure are unused documentation. Defer until call boundaries naturally become event shapes. |
| Generic workflow registry | Not explicitly proposed but implied | No registry needed. `createWorkflow()` returns a plain object stored in a module constant. |
| Generic service locator / DI | Not explicitly proposed but implied | StartPOS uses module imports, not injection. No evidence of a DI need. |
| Immediate migration of `task-workflow.ts` to `createWorkflow()` | Phase 3, implied | `task-workflow.ts` works. Migrating it before a second workflow exists is uncharged refactoring. Deferred to Phase D. |

---

## Part 7 — Architectural Evolution Rule

This rule is now an official engineering standard for StartPOS.

> **Shared architectural abstractions must emerge from at least two real implementations.**

Applied to concrete decisions:

| Decision | Applied Rule | Outcome |
|---------|-------------|---------|
| `InventoryEngine` | 4 confirmed write owners exist today | **Introduce now** |
| `workflow.ts` adoption | Only 1 workflow exists (Task). Purchase workflow comes at Phase D1. | **Keep, delay consumption to Phase D** |
| Business event types | 0 event routing infrastructure exists | **Delay until call boundaries emerge naturally** |
| `TaskService` | 1 mutation location (UI component). Problem is inventory logic inside it, not task mutations. | **Delay. InventoryEngine extraction resolves the symptom.** |
| `ProcurementService` | 1 set of purchase query functions. No duplication observed. | **Delay.** |

The test for any future proposed abstraction:

1. How many existing implementations demonstrate the same pattern?
2. Can the existing Engine or query function pattern express the required behavior?
3. Is the abstraction solving a problem that exists today in the code?

If the answer to question 1 is fewer than 2, and question 2 is yes, defer until the second implementation naturally appears.

---

*End of Implementation Roadmap — Corrected*
*Phase 5 — Course Correction Against Real Code*
*Every decision grounded in Phase 1 (code inspection) and the Architectural Evolution Rule.*
