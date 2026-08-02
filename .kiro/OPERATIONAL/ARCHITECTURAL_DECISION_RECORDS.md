# Architectural Decision Records
## StartPOS Operational Domain

> **Status:** Authoritative. Each ADR records a single architectural decision that introduces
>   or retains a shared abstraction. Decisions that defer or reject abstractions are recorded
>   in the corrected roadmap, not here.
> **Scope:** Every new abstraction that survives the Phase 5 course correction.
> **Last updated:** July 31, 2026 (Phase D + Phase E complete)

---

## Index

| ADR | Title | Status |
|-----|-------|--------|
| [ADR-001](#adr-001--inventoryengine) | InventoryEngine | Accepted — Active |
| [ADR-002](#adr-002--workflowts--createworkflow) | workflow.ts / createWorkflow() | Accepted — Active (Phase D) |
| [ADR-003](#adr-003--resultts--operationresult) | result.ts / OperationResult | Accepted — Active |
| [ADR-004](#adr-004--notificationengine-checkLowStock-separation) | NotificationEngine checkLowStock separation | Accepted — Active (Phase A) |


---

## ADR-001 — InventoryEngine

**Date:** July 30, 2026
**Status:** Accepted
**Introduced in:** Phase A
**File:** `src/lib/inventory/inventory-engine.ts`

---

### Problem Being Solved

Inventory mutations are currently owned by four separate locations in the codebase:

| Location | Mutations it writes |
|----------|-------------------|
| `src/routes/(private)/tasks/$taskId/index.tsx` | `inventoryCollection`, `inventoryMovementCollection` |
| `src/lib/queries/create-purchase.ts` | `inventoryCollection`, `inventoryMovementCollection`, `productVariantCollection` |
| `src/lib/queries/void-purchase.ts` | `inventoryCollection`, `inventoryMovementCollection` |
| `src/lib/queries/restock-ingredient.ts` | `inventoryCollection`, `inventoryMovementCollection` |

This was confirmed by direct code inspection during the Phase 1 audit (Part 9.1 and Part 9.6). It is not an anticipated problem — it exists today.

The consequence is that inventory business rules must either be duplicated across all four sites or are simply absent at some of them. Confirmed gaps found during the audit:

- FIFO batch consumption order: confirmed only at the purchase creation path; unverified at the three other sites
- Floor-at-zero guard: implemented inconsistently (`Math.max(0, ...)` in void and some task types; `Math.min(qty, sourceBatch.quantity)` silently caps in shelf refill without an error)
- BRANCH_TRANSFER creates an OUT movement on the source branch but never creates a corresponding IN movement on the target branch
- WASTE_DISPOSAL uses `OUT` MovementType instead of the declared `WASTE` type
- BRANCH_TRANSFER uses `ADJUST` MovementType instead of the declared `EXTERNAL_TRANSFER` type

Additionally, the most severe instance — the task fulfillment path — embeds all inventory mutation logic inside a React route component (`tasks/$taskId/index.tsx`). Business rules that belong to the Inventory domain are being enforced (or not enforced) inside a UI rendering layer.

---

### Alternatives Considered

**Alternative 1: Leave the code as-is and fix bugs in-place**

Fix the MovementType inconsistencies, the missing target-branch movement, and the floor-at-zero gaps at each of their respective locations.

*Why rejected:* This is treating symptoms without addressing the cause. Four mutation owners will produce four more inconsistencies as the inventory domain grows. The next developer adding a new inventory path has no guidance toward the canonical rules.

**Alternative 2: Extract an InventoryService (the Phase 3 proposal)**

Create `src/lib/inventory/inventory-service.ts` following a service-layer pattern common in layered DDD architectures.

*Why rejected as named:* The name "Service" signals a pattern that does not exist elsewhere in the StartPOS codebase. The existing pattern is Engines (`FIFOEngine`, `EntitlementEngine`, `AuthEngine`, `NotificationEngine`). Introducing a "Service" naming convention alongside "Engine" naming would create two parallel vocabulary conventions for objects at the same architectural layer. The naming inconsistency is a maintenance cost that compounds over time.

**Alternative 3: Introduce an InventoryEngine (the chosen approach)**

Follow the existing Engine pattern. A static object with named methods. Each method receives all necessary context as parameters. No global store reads. No infrastructure imports at the module level. Callable from inside `dbTransaction` callbacks without introducing an async boundary.

*Why chosen:* Matches the existing architectural vocabulary exactly. `InventoryEngine.applyTaskFulfillment()` reads identically to `FIFOEngine.consume()` and `EntitlementEngine.buildSummary()` — a domain-specific capability object called with explicit parameters. The four call sites become single-line delegations to the engine.

---

### Why Existing Patterns Were Insufficient

The existing pattern — direct collection writes inside query functions — works correctly for single-domain operations. It breaks down when the same domain's rules need to be applied consistently from multiple call sites. The query function pattern does not provide a natural consolidation point for shared mutation logic. There is no existing `inventoryQuery.ts` file that all four sites could be redirected to, because the mutation logic is domain behavior (rules about batches, movements, types, and floors), not a query.

The Engine pattern is the existing mechanism for domain behavior objects. Introducing `InventoryEngine` is not adding a new pattern — it is applying the existing Engine pattern to the one domain that currently lacks it.

---

### Why This Abstraction Was Chosen

1. **Naming consistency:** `InventoryEngine` matches `FIFOEngine`, `EntitlementEngine`, `AuthEngine`, `NotificationEngine`
2. **Pattern consistency:** Static object with named methods receiving context as parameters — identical to every other Engine in the codebase
3. **Zero new dependencies:** The Engine imports only types and collection interfaces. No new infrastructure. No new framework.
4. **Offline-safe:** All methods are synchronous. They are called from inside `dbTransaction` callbacks, preserving the existing atomicity guarantee. Introducing an async boundary here would break offline behavior.
5. **Testable:** Because the Engine receives collections as parameters rather than reading from a global store, it can be tested by passing mock collections.
6. **Incremental adoption:** The four migration steps (A2 through A5) can be done and deployed independently. Each is a pure code relocation with identical behavior.

---

### Expected Long-Term Benefits

- Inventory business rules exist in exactly one place. Future rules (reservation, partial fulfillment, FEFO) are added to `InventoryEngine` and apply to all call sites automatically.
- FIFO enforcement can be verified once, in one place, rather than assumed at four separate sites.
- The React route component (`tasks/$taskId/index.tsx`) loses ~150 lines of inventory mutation logic. It becomes a UI orchestration layer only.
- MovementType correctness is enforced by the Engine. The Engine always uses `WASTE` for waste disposals and `EXTERNAL_TRANSFER` for branch transfers — callers do not choose the type.
- The missing target-branch IN movement for BRANCH_TRANSFER is fixed in the Engine once and applies to all future transfers.

---

### Conditions for Removal or Reconsideration

Remove `InventoryEngine` if:
- The inventory domain is refactored into a separate service process with its own API boundary — at that point, the Engine becomes an internal implementation detail of that service, not a shared library object.
- A strongly-typed event bus is introduced and all four call sites are replaced by event handlers — at that point, the Engine methods become the event handler bodies, and the Engine as a named object may be dissolved into the event handler registrations.

Reconsider the name if:
- A second pattern class appears that is genuinely a "Service" (async, infrastructure-aware, cross-context orchestrator) — at that point, Engine and Service become meaningfully distinct and the naming should be revisited.

---

### Design Constraints That Must Be Preserved

1. **All methods must be synchronous.** The `dbTransaction` callback is synchronous. Any async method would require restructuring the transaction pattern across all call sites.
2. **No global store reads inside Engine methods.** `authStore.state.user` must not be read inside the Engine. All context (`userId`, `branchId`, `businessId`) is passed as parameters. This is testability and correctness — the Engine should not depend on a populated browser auth store.
3. **All methods must create an `InventoryMovement` for every mutation.** This is Business Invariant INV-02. The Engine enforces this invariant at the consolidation point so no future call site can bypass it.
4. **The Engine does not determine task business rules.** `applyTaskFulfillment` receives a fulfilled task and applies its inventory consequence. It does not re-evaluate whether the task should have been fulfilled. That decision was made before the Engine was called.


---

## ADR-002 — workflow.ts / createWorkflow()

**Date:** July 30, 2026
**Status:** Accepted — Active (activated Phase D + extended Phase E, July 31, 2026)
**Introduced in:** Written at Phase 5. Consumed at Phase D.
**File:** `src/lib/workflow.ts`

**Activation evidence:**
- Consumer 1: `purchaseWorkflow` in `src/lib/queries/purchase-workflow.ts` (Phase D)
- Consumer 2: `taskWorkflow` in `src/routes/(private)/tasks/$taskId/-components/task-workflow.ts` (Phase D migration)
- Both consumers exist simultaneously in the same PR — the two-implementation rule is satisfied.
- Consumer 3: `receiptWorkflow` in `src/lib/queries/receipt-workflow.ts` (Phase E — GoodsReceipt lifecycle, PENDING→CONFIRMED/DISPUTED)

---

### Problem Being Solved

The StartPOS operational domain contains aggregates with defined lifecycles, named states, and role-guarded transitions. The Task aggregate is the first. The Purchase aggregate will be the second when it receives a status field in Phase D.

Lifecycle state machines require the same structural components every time they are defined:
- A mapping of valid (from → to) transition pairs
- Role guards per transition
- Identity guards per transition (is this the assigned approver? the assigned clerk?)
- UI metadata per transition (button label, visual variant)
- Terminal state detection
- "What actions can this user take right now?" query

`task-workflow.ts` implements all of these as flat, hand-written functions for the Task aggregate. It works correctly. Its structure would need to be fully replicated to define a Purchase workflow — the same boilerplate, the same lookup patterns, the same guard evaluation loops.

The problem `workflow.ts` solves is: when the second workflow is needed, the developer should not need to rediscover and re-implement the same structural pattern. The framework captures the pattern once, and both workflows use it.

---

### Why It Is Dormant Until Phase D

At the time of writing, only one workflow exists (Task). The framework has zero consumers.

Introducing a framework to generalize a pattern that has only one instance is premature. The single-instance rule: do not abstract until the second case demonstrates that the abstraction is necessary and correct. The first case tells you what the pattern might be. The second case tells you whether the abstraction you derived from the first case actually fits.

The correct moment to consume `workflow.ts` is when the Purchase status field is added (Phase D1). At that moment:

1. A `purchaseWorkflow` must be defined. Without the framework it would be ~120 lines of structural boilerplate.
2. The developer writes `purchaseWorkflow = createWorkflow(config)` — the second consumer proves the framework.
3. In the same phase, `task-workflow.ts` is migrated to `createWorkflow()` — both workflows now use the same foundation.
4. The migration of `task-workflow.ts` is justified by the simultaneous existence of the second consumer, not by the framework's existence alone.

---

### Alternatives Considered

**Alternative 1: Delete workflow.ts now; write it again at Phase D**

Re-derive the framework from scratch when Purchase workflow is needed.

*Why rejected:* The framework has already been written and is correct. Deleting correct, principled code only to rewrite it later is waste. The file costs nothing to keep. It costs real effort to rediscover.

**Alternative 2: Migrate task-workflow.ts to createWorkflow() immediately**

Use the framework now with a single consumer to validate it in production.

*Why rejected:* `task-workflow.ts` is a tested, working file. The entire Task lifecycle depends on it. Rewriting it with zero behavior change and zero new capability is pure risk with no immediate benefit. The migration should happen when the second consumer simultaneously justifies it.

**Alternative 3: Keep workflow.ts as-is, document the dormancy (the chosen approach)**

The file stays. It is not consumed. A clear condition is documented for when it should be consumed. The developer who implements Phase D reads this ADR, understands the condition is now met, and activates the framework for both workflows simultaneously.

*Why chosen:* Preserves the correct engineering work already done. Avoids premature refactoring of a working file. Creates a clear, documented activation condition.

---

### Why Existing Patterns Were Insufficient

The existing pattern — `task-workflow.ts` flat functions — is sufficient for a single workflow. It is insufficient for two workflows because it would require full structural duplication: a second `WORKFLOW_TRANSITIONS` record, a second `TRANSITION_UI_CONFIG` record, a second `checkWorkflowPermission` function with the same guard evaluation pattern, a second `getAllowedTransitionsForUser` with the same filtering pattern.

The `createWorkflow()` framework captures the structure (maps, guards, terminal set, allowedTransitions query) once. Each workflow declares only its domain-specific configuration (states, transitions, guards, labels). The structural machinery is not duplicated.

---

### Why This Abstraction Was Chosen

1. **It is already written.** The engineering work is done. The types (`TransitionGuard`, `TransitionDef`, `WorkflowConfig`, `Workflow`) are well-designed and general.
2. **It is pure.** `createWorkflow()` has no infrastructure imports. It builds O(1) lookup maps at construction time. The returned `Workflow` object has no side effects.
3. **It uses existing result types.** `workflow.ts` imports `OperationResult`, `opOk`, `opFail` from `result.ts` — the already-established shared vocabulary. No new patterns are introduced.
4. **The activation condition is concrete and imminent.** Phase D1 (Purchase status field) is the next major schema change planned. When it happens, the condition is met automatically.
5. **It does not force premature adoption.** The file exists but nothing forces its consumption. `task-workflow.ts` continues to work unchanged until Phase D makes the second consumer appear.

---

### Expected Long-Term Benefits

- Any new aggregate with a lifecycle (GoodsReceipt, ApprovalRequest) uses `createWorkflow()` rather than inventing its own transition infrastructure
- `allowedTransitions(from, context)` gives every workflow a consistent "what can this user do right now?" API that the UI can call without knowing the specific transition rules
- `isTerminal(state)` gives every workflow a consistent guard for edit and delete operations
- Transition errors throw `WorkflowTransitionError` (programming error) vs return `opFail` (expected business condition) — a distinction that does not exist in `task-workflow.ts` today and which improves debugging
- The `meta` field on `TransitionDef` moves UI metadata (button label, visual variant, confirmation text) into the workflow config, where it is co-located with the transition definition that produced it

---

### Conditions for Removal

Remove `workflow.ts` if:

- Phase D1 is implemented and `purchaseWorkflow` is defined **without** using `createWorkflow()` — meaning the developer found the framework unsuitable for the Purchase case. At that point the framework has failed its own two-implementation test and should be removed.
- Phase D1 does not happen within two major development cycles — at that point the file is dead code and should be removed rather than preserved indefinitely.
- The codebase moves to a code-generation approach for state machines (e.g., XState, a schema-driven generator) that supersedes hand-written workflow configs.

---

### Migration Path for task-workflow.ts (At Phase D)

When Phase D1 is implemented:

1. Define `purchaseWorkflow` using `createWorkflow()` — this is the first production consumer
2. In the same PR, migrate `task-workflow.ts` to define `taskWorkflow` using `createWorkflow()`
3. The existing exported functions (`getStatusUIMetadata`, `STATUS_PRIORITY`) that have no equivalent in the framework are kept as-is alongside the workflow object — the framework does not replace UI display utilities, only transition logic
4. The server-side transition validator introduced in Phase B1 can use `taskWorkflow.canTransition()` instead of directly calling `checkWorkflowPermission`
5. `getAllowedTransitionsForUser` is replaced by `taskWorkflow.allowedTransitions(status, context)`

The migration is a refactor with identical externally-observable behavior. It should be behind a feature flag if the team requires independent rollback capability.


---

## ADR-003 — result.ts / OperationResult

**Date:** July 30, 2026
**Status:** Accepted — Active (created Phase D, July 31, 2026)
**Introduced in:** Phase D (file did not exist prior; referenced as "already active" in the original roadmap because `workflow.ts` was written expecting it)
**File:** `src/lib/result.ts`

---

### Problem Being Solved

The codebase uses two distinct error-handling mechanisms at two distinct layers:

- **Infrastructure layer** (`dbTransaction`, `crudAPI`, `transactionAPI`): uses `neverthrow` `ResultAsync<T, Error>`. This is correct for async operations that can fail with infrastructure errors (network down, sync conflict, DB constraint violation). These are unexpected failures.

- **Domain layer** (workflow transitions, guard functions, business rule checks): needs to communicate *why* an expected business condition prevented an action. "You don't have the role to approve this task" is not an infrastructure error — it is a valid business outcome that the UI must branch on to show the right message. Using `throw` for these outcomes is semantically wrong and forces `try/catch` in UI handlers that should use `if/else`.

`OperationResult<T>` fills the gap between "everything succeeded" and "an infrastructure error occurred" by providing a third category: "the action was not taken for a specific, known business reason."

---

### Alternatives Considered

**Alternative 1: Use boolean returns from guard functions**

`checkWorkflowPermission` in `task-workflow.ts` returns `boolean`. The UI reads the result and decides what to show.

*Why insufficient going forward:* A boolean tells the UI whether the action is allowed, but not why it was denied. The UI cannot show the specific denial reason ("Only the assigned approver can approve this task" vs "Only SUPERVISOR or ADMIN can approve tasks") without this information. As server-side authorization is added in Phase B1, the server needs to return a reason that the client can display.

**Alternative 2: Throw exceptions with custom types**

Throw `PermissionDeniedError` or `PreconditionFailedError` from guard functions.

*Why rejected:* Exceptions are for unexpected failures, not expected business conditions. Wrapping all guard function calls in `try/catch` in every UI handler is more verbose than the discriminated union, and it conflates infrastructure failures with business conditions in the same catch block.

**Alternative 3: Return OperationResult (the chosen approach)**

The discriminated union `{ ok: true, value: T } | { ok: false, code: OperationCode, reason: string }` gives callers:
- Type-safe narrowing: `if (!result.ok)` gives access to `result.code` and `result.reason`
- Machine-readable code (`OperationCode`) for programmatic branching
- Human-readable reason string safe to display directly in a toast or tooltip
- No try/catch required anywhere in the call chain

*Why chosen:* Already established. `workflow.ts` already imports from `result.ts`. `OperationCode` already defines the relevant failure categories. The pattern is in the codebase and working.

---

### Why Existing Patterns Were Insufficient

`neverthrow` `ResultAsync` wraps async operations and propagates `Error` instances. It is correct for infrastructure. It is the wrong tool for synchronous business condition checks because:
1. Guard functions are synchronous. Wrapping them in `ResultAsync` adds unnecessary async overhead and complicates calling code.
2. `Error` instances have a message string but no machine-readable code. `OperationCode` provides the code needed for UI branching.

---

### Why This Abstraction Was Chosen

It already exists. The decision was previously made and is validated by `workflow.ts` importing it. This ADR documents it for completeness and to establish its scope precisely — it is the domain-layer result type, distinct from the infrastructure-layer `ResultAsync`.

---

### Expected Long-Term Benefits

- Server-side authorization (Phase B1) returns `OperationResult` from the validator server function. The client receives a structured denial with a displayable reason.
- `workflow.ts` uses `OperationResult` for `transition()` return values. When `task-workflow.ts` is migrated in Phase D, `checkWorkflowPermission` (boolean) becomes `taskWorkflow.canTransition()` (TransitionCheckResult, which is the same shape as OperationResult for the failure case).
- New domain rules added to `InventoryEngine` methods can return `OperationResult` when they need to communicate a specific business condition to the caller (e.g., insufficient stock on a fulfillment).

---

### Conditions for Removal or Reconsideration

Do not remove this file. `OperationResult` is a foundational type that fills a real gap between infrastructure error handling and business condition communication.

Reconsider the design if:
- TypeScript introduces native discriminated result types that supersede this pattern
- The codebase adopts a full effect system (e.g., `fp-ts`) that subsumes both `OperationResult` and `neverthrow` — at that point the two should be unified rather than kept as parallel patterns


---

## ADR-004 — NotificationEngine checkLowStock Separation

**Date:** July 30, 2026
**Status:** Accepted — Implemented as Part of Phase A
**Introduced in:** Phase A6 (part of InventoryEngine introduction)
**Files affected:** `src/lib/notification/notification-engine.ts`, `src/lib/inventory/inventory-engine.ts`

---

### Problem Being Solved

`NotificationEngine.checkLowStock()` currently does two things:

1. Detects that a product's stock has fallen to or below its reorder threshold
2. Creates an `OperationalTask` record in response to that detection

The second responsibility belongs to the Inventory domain, not the Notification domain. The Notification domain's contract (Phase 4, Part 2, Bounded Context Contracts) is explicit: the Notification domain "never creates business records."

This was confirmed as a cross-domain violation in Phase 1, Part 9.2: "NotificationEngine makes task-domain decisions — auto-task creation inside the notification engine crosses domain boundaries."

The consequence of the current design:
- A change to how tasks are created (required fields, default status, task type configuration) requires updating `notification-engine.ts`
- The low-stock task-creation path bypasses the approval workflow by creating the task directly at `IN_PROGRESS` status with all accountability fields set to the current user — `NotificationEngine` is making task-domain authorization decisions that do not belong to it
- Testing low-stock task creation requires constructing a full `NotificationEngine` context including membership queries and inventory queries

---

### Alternatives Considered

**Alternative 1: Leave it in NotificationEngine and add a comment**

Document the violation, acknowledge it is wrong, and defer the fix indefinitely.

*Why rejected:* The violation is confirmed and its consequences are active. The notification engine already creates tasks with `IN_PROGRESS` status, bypassing the workflow that Phase B is designed to enforce. Documenting it without fixing it means Phase B cannot achieve consistent workflow enforcement — the low-stock path will remain a silent exception.

**Alternative 2: Create a separate LowStockService**

Extract low-stock handling into a third file distinct from both `NotificationEngine` and `InventoryEngine`.

*Why rejected:* This adds a new concept (LowStockService) without justification. There are not two implementations of "low stock handling" that would justify extracting a shared concept. The logic belongs naturally to the Inventory domain — it is a reaction to an inventory condition. `InventoryEngine` is the Inventory domain's behavioral object.

**Alternative 3: Move task creation to InventoryEngine.handleLowStockDetected() (the chosen approach)**

Extract the task-creation logic from `NotificationEngine.checkLowStock()` into `InventoryEngine.handleLowStockDetected()`. `checkLowStock` calls `InventoryEngine.handleLowStockDetected()` for the task creation, then calls `NotificationEngine.send()` for the notification. The notification engine no longer creates tasks.

*Why chosen:*
- Aligns with the Inventory domain boundary: detecting a stock condition and responding to it is Inventory's responsibility
- The call sequence is unchanged: the same task is created, the same notification is sent — only the code location of the task creation changes
- `NotificationEngine` retains `send()` as its sole responsibility: delivering messages
- This migration is a direct parallel of Phase A5 (removing inventory mutations from a React component) — the pattern is consistent

---

### Why Existing Patterns Were Insufficient

The existing pattern — everything in `checkLowStock` — worked as a single function for the initial implementation. It breaks down when:
1. The task creation rules change (adding a required approver, changing the default status from `IN_PROGRESS` to `PENDING` to enforce the approval workflow)
2. The notification routing rules change (sending to different recipients based on product category)

These two concerns have different rates of change. Separating them means each can be modified independently.

---

### Why This Abstraction Was Chosen

This is not a new abstraction — it is a responsibility migration within an existing abstraction (`InventoryEngine`, introduced in ADR-001). The decision is included as a separate ADR because the change to `NotificationEngine` is a boundary correction with long-term architectural implications.

The allocation of responsibilities after this change:

| Responsibility | Owner |
|---------------|-------|
| Detect that stock is below threshold | `InventoryEngine` (called from `NotificationEngine.checkLowStock` until event routing exists) |
| Create a SHELF_REFILL task in response | `InventoryEngine.handleLowStockDetected()` |
| Send a LOW_STOCK notification | `NotificationEngine.send()` |

The calling code in `checkLowStock` remains the trigger point for now. It calls both. The distinction is that the two operations are in the right modules, not that the trigger mechanism has changed.

---

### Expected Long-Term Benefits

- When Phase B1 enforces the approval workflow on all tasks, the low-stock auto-task path can be changed from `IN_PROGRESS` to `PENDING` in one place (`InventoryEngine.handleLowStockDetected()`), and the fix applies consistently
- The Notification domain's contract is restored: it delivers messages and creates nothing else
- `NotificationEngine.checkLowStock()` becomes a thin coordinator: check stock → if below threshold, call InventoryEngine, call NotificationEngine.send() — each call has a clear owner
- Future low-stock policy changes (auto-approval for certain task types, routing to a specific approver) are Inventory domain decisions, implemented in `InventoryEngine`, not scattered into the notification layer

---

### Conditions for Removal or Reconsideration

Reconsider this separation if:
- A formal event bus is introduced: at that point `checkLowStock` becomes unnecessary — `InventoryEngine` emits a `LowStockDetected` event, `NotificationEngine` and `TaskEngine` each subscribe independently. The explicit `handleLowStockDetected` call becomes an event handler body and the `checkLowStock` coordinator is replaced by the event routing mechanism.
- The low-stock detection is moved to a scheduled background job: at that point the call site changes but the responsibility allocation (Inventory handles task creation, Notification handles delivery) remains correct.

---

## Non-Decision Records (Deferred Abstractions)

These are abstractions that were considered and explicitly deferred. They are recorded here so the decision is not re-litigated without new evidence.

---

### DEFERRED: TaskService

**Considered for:** Phase A
**Decision:** Deferred to a future phase, pending a second mutation owner or a demonstrated failure of the current pattern.
**Reasoning:** The coupling problem in the Task domain is that a React component owns inventory side-effects. `InventoryEngine.applyTaskFulfillment()` resolves that problem directly. After the inventory extraction, the remaining task mutations are simple status updates — one call per transition. There is no rule duplication, no second mutation owner, no demonstrated need for a consolidated task mutation object.
**Trigger for reconsideration:** A second domain requires task mutations (e.g., Approval domain creates or updates tasks as part of an approval flow), OR the server-side authorization layer (Phase B1) grows into more than a single validation function and requires a coordinating object.

---

### DEFERRED: ProcurementService

**Considered for:** Phase D
**Decision:** Deferred — trigger condition not yet met after Phase D.
**Reasoning:** Phase D introduced `create-purchase-request.ts` as a second purchase mutation path. The trigger condition for `ProcurementService` is: a third path OR rule duplication between existing paths. After Phase D the two paths are:
  - `create-purchase.ts` (quick-receive → RECEIVED)
  - `create-purchase-request.ts` (approval path → PENDING_APPROVAL)

Both paths share `InventoryEngine.applyPurchaseReceipt()` for inventory credit — no duplication exists at that layer. The purchase header insert logic differs by design (different status, different notification). A ProcurementService would combine them without evidence of shared rules being violated.
**Trigger for reconsideration:** A third purchase mutation path is introduced (partial void, purchase amendment, GRN-triggered receipt) that requires the same validation rules as the existing two, OR the approval routing logic (threshold checks, approver assignment) grows complex enough that both `create-purchase.ts` and `create-purchase-request.ts` independently re-implement it.

---

### DEFERRED: Business Event Type Definitions (src/lib/events/types.ts)

**Considered for:** Phase A (based on Phase 3 suggestion)
**Decision:** Deferred until call boundaries naturally become event shapes.
**Reasoning:** Event type definitions without an event routing mechanism are TypeScript types that describe the shapes of function parameters. They add a layer of indirection (define the event type, construct the event object, pass it to a handler) without the corresponding benefit (decoupled producers and consumers, independent scaling, replay). The existing pattern — direct function calls inside `dbTransaction` — is simpler, offline-safe, and appropriate for the current scale. When two or more domains independently need to react to the same business condition, the event type and routing mechanism are justified by that evidence.
**Trigger for reconsideration:** Two distinct domains need to react to the same business fact (e.g., both `TaskEngine` and `NotificationEngine` independently need to receive `LowStockDetected`), AND the `checkLowStock` coordinator pattern becomes unwieldy because there are more than 2-3 consumers of the same event.

---

### DEFERRED: ReconciliationService

**Considered for:** Phase B
**Decision:** Deferred indefinitely.
**Reasoning:** Session close logic is split across 3 UI files. Phase B fixes make the behavior correct (B4, B5). After those fixes, session close becomes: update task status, update session record, send notification — three simple collection writes with no shared rules and no duplication. A ReconciliationService would wrap these three writes in an object for the sake of it.
**Trigger for reconsideration:** The reconciliation flow gains enough domain logic (multi-step verification, escalation, variance approval threshold) that the 3 files develop duplicated rules between them.


---

## How to Use These ADRs

### When Implementing a Phase

Before writing any code, read the relevant ADR. The ADR tells you:
- What problem the abstraction solves (do not solve a different problem with the same abstraction)
- What design constraints must be preserved (do not violate them for convenience)
- What the activation condition is for dormant abstractions (do not activate them early)

### When Proposing a New Abstraction

Before creating a new file, write the ADR first. If you cannot answer "which two real implementations demonstrate this pattern?", the abstraction is premature. Add it to the Deferred section instead and document the trigger condition.

### When Removing an Abstraction

When a "Conditions for Removal" criterion is met, update the ADR status to "Superseded" and record what replaced it. Do not delete ADRs — they are history, not active code.

### When the Trigger Condition Is Met

When a deferred abstraction's trigger condition is met:
1. Write the ADR before writing the code
2. Include the evidence that the trigger condition was satisfied
3. Reference the two (or more) existing implementations that justify the abstraction

---

*End of Architectural Decision Records*
*StartPOS Operational Domain*
*Version 1.0 — July 30, 2026*

---

## ADR-005 — UsageEngine

**Date:** August 1, 2026
**Status:** Accepted — Active
**Introduced in:** Phase 2 (Usage Tracking + Monthly Billing Foundation)
**File:** `src/lib/billing/usage-engine.ts`

---

### Problem Being Solved

Transaction usage tracking requires incrementing a counter on every POS checkout, checking the allowance on every checkout, and resetting the counter at the end of each billing period. These three operations share the same counter data structure (`UsageCounterSnapshot`) and the same business rules (unlimited at -1, floor at 0, overage at exhaustion).

Without an engine, the increment logic would live in `createPosTransaction`, the allowance check would be duplicated in the entitlement engine's inline check, and the reset logic would live in the background job — three locations with shared rules that diverge over time.

`createPosTransaction` is also the most critical path in the application: it is the only code that runs inside a `dbTransaction` callback during a checkout. Any async boundary introduced here would break the offline-first behavior. The engine must be synchronous.

---

### Alternatives Considered

**Alternative 1: Inline increment logic in `createPosTransaction`**

Write the counter arithmetic directly in `create-pos-transaction.ts`.

*Why rejected:* `createPosTransaction` already coordinates TaxEngine, CostingEngine, PosStockEngine, CreditEngine, and InventoryEngine. Adding raw counter arithmetic would grow the file further and duplicate the boundary calculation in the reset job. The two call sites (checkout + reset job) already justify extraction per the Engine pattern.

**Alternative 2: Extend EntitlementEngine with counter logic**

Add a `checkAndIncrementCounter()` method to `EntitlementEngine`.

*Why rejected:* `EntitlementEngine` is a pure evaluation engine — it checks a context and returns a result without side effects. Adding mutation logic (incrementing a counter) would violate its contract. The entitlement check and the counter increment are separate operations at separate points in time.

**Alternative 3: Introduce UsageEngine (the chosen approach)**

Extract the counter arithmetic, exhaustion check, and overage logic into `UsageEngine`. The engine receives a `UsageCounterSnapshot` DTO, applies the rules, and returns an updated snapshot or an `OperationResult` failure. The Application Layer reads from the collection, calls the engine, and writes the result back to the collection.

*Why chosen:* Exactly two call sites use usage counter logic (`createPosTransaction` and `usage-counter-reset.ts`). The shared rules are non-trivial (unlimited plan detection, overage routing, floor-at-zero). The Engine pattern is the established mechanism for this class of problem. The method is synchronous — it can be called inside `dbTransaction` without any architectural change.

---

### Why Existing Patterns Were Insufficient

The existing pattern — inline arithmetic in query functions — is correct when a single function owns the logic. It breaks down when the same arithmetic must apply from two separate call sites (`createPosTransaction` and the reset job) and when the rules are rich enough to warrant a name (`isExhausted`, `computeRemaining`, `increment`).

`UsageEngine` is the fourth domain engine in the billing layer. Its introduction follows the same two-call-site justification as `CreditEngine` and mirrors the exact synchronous/DTO pattern established by `InventoryEngine`.

---

### Why This Abstraction Was Chosen

1. **Two call sites before introduction:** `createPosTransaction` and `usage-counter-reset.ts` both need the same counter arithmetic before the engine exists — the standard activation condition is met.
2. **Synchronous methods:** All `UsageEngine` methods are synchronous. `increment()` can be called inside `dbTransaction` without breaking offline behavior.
3. **No infrastructure imports:** `UsageEngine` receives `UsageCounterSnapshot` as a plain DTO. It never reads from a Prisma model or a collection. It is fully testable with mock data.
4. **Returns `OperationResult`:** `increment()` returns `opFail` when the allowance is exhausted and overage is disabled, instead of throwing. The caller blocks the checkout by returning an error from the `dbTransaction` callback.
5. **Mirrors InventoryEngine pattern:** The call sequence — read from collection → call engine → write result to collection — is identical to how `InventoryEngine` is used in `createPosTransaction`.

---

### Design Constraints That Must Be Preserved

1. **All methods must be synchronous.** The `dbTransaction` callback is synchronous. Any async method would require restructuring the checkout path and breaking offline behavior.
2. **No Prisma imports.** `UsageEngine` must remain importable from any layer without pulling in database infrastructure.
3. **`increment()` returns `OperationResult`.** Blocking behavior (exhaustion) must be communicated through the result type, not via exceptions. The caller throws inside `dbTransaction` to roll back the local write.
4. **The engine does not read from the auth store.** `includedTxPerMonth` and `overageBillingEnabled` are passed as parameters from the Application Layer.

---

### Conditions for Removal or Reconsideration

Remove `UsageEngine` if:

- The usage tracking domain is promoted to a separate service with its own API — at that point the engine becomes an internal implementation detail of that service.
- The `UsageCounter` model is replaced by a metered event stream — at that point the counter increment pattern is replaced by event publication and the engine's methods are replaced by event handler bodies.

---

## ADR-006 — CreditEngine

**Date:** August 1, 2026
**Status:** Accepted — Active
**Introduced in:** Phase 3 (Prepaid Credits)
**File:** `src/lib/billing/credit-engine.ts`

---

### Problem Being Solved

Prepaid credit management requires the same balance read and deduction rules in two separate call sites that run in different contexts:

- `createPosTransaction` — reads the latest ledger entry, deducts 1 credit, builds a CONSUMED entry, checks the low-balance threshold.
- `createPosRefund` — reads the latest ledger entry, restores 1 credit, builds a REFUNDED entry.

Without an engine, both files would independently implement:
- The "read `balanceAfter` from the latest ledger entry or default to 0" pattern
- The "new balance = current balance + signed amount" arithmetic
- The "is balance < threshold?" check
- The ledger entry DTO construction pattern

This is exactly the duplication pattern that Engine introduction resolves.

Additionally, `createPosTransaction` is offline-first. The credit deduction must be synchronous — it runs inside a `dbTransaction` callback. An async credit deduction would break checkout offline behavior in the same way an async usage counter increment would.

---

### Alternatives Considered

**Alternative 1: Duplicate credit logic in both query files**

Write the balance read, arithmetic, and DTO construction inline in both `createPosTransaction` and `createPosRefund`.

*Why rejected:* Two call sites with shared business rules is the minimum justification for Engine extraction per the established pattern. The rules are non-trivial (balance floor, low-balance detection, signed amount semantics). A future change to the deduction rule (e.g., variable credit cost per transaction type) would need to be applied in both files.

**Alternative 2: Extract a utility module (not an Engine)**

Create `src/lib/billing/credit-utils.ts` with exported functions.

*Why rejected:* The project uses the Engine naming convention for domain behavior objects (`InventoryEngine`, `UsageEngine`, `EntitlementEngine`). A `credit-utils.ts` would introduce a parallel naming convention for the same architectural role. Naming consistency is an explicit architectural constraint (ADR-001, §"Why Existing Patterns Were Insufficient").

**Alternative 3: Introduce CreditEngine (the chosen approach)**

Follow the established Engine pattern. `CreditEngine` receives a `CreditLedgerSnapshot` DTO (the latest ledger row), applies rules, and returns either an `OperationResult<CreditDeductionResult>` (for deduct) or a new entry DTO (for restore). The Application Layer inserts the returned entry into the collection.

*Why chosen:* Two simultaneous call sites at introduction. Synchronous methods. No infrastructure imports. Returns `OperationResult`. Identical pattern to `UsageEngine`.

---

### Known Limitation — R2 Race Condition

Two concurrent checkouts on different devices may both pass the balance check before either deduction commits, allowing the balance to go temporarily negative. The `CreditLedger` append-only model makes this auditable: both transactions are recorded with their signed amounts, and a correction `ADJUSTMENT` entry can restore the correct balance.

A server-side optimistic lock (compare-and-insert) is the planned mitigation for a future hardening phase. It is not implemented in Phase 3 because the scope is an accepted risk for the initial prepaid model.

This limitation is documented as a code comment on `CreditEngine.deduct()`.

---

### Why This Abstraction Was Chosen

1. **Two simultaneous call sites:** `createPosTransaction` and `createPosRefund` both need credit logic before the engine exists.
2. **Synchronous methods:** `deduct()` and `restore()` are synchronous. Both are called inside `dbTransaction` callbacks.
3. **No infrastructure imports:** `CreditEngine` receives `CreditLedgerSnapshot` as a plain DTO and never reads from Prisma or collections.
4. **Returns `OperationResult`:** `deduct()` returns `opFail(CREDIT_BALANCE_ZERO)` when balance is 0 — the caller throws inside `dbTransaction` to block the checkout.
5. **Billing-model-conditional:** The Application Layer wraps the engine call in `if (billingModel === PREPAID_CREDITS)`. The engine itself does not check the billing model — it is a pure arithmetic engine.

---

### Design Constraints That Must Be Preserved

1. **All methods must be synchronous.** Same constraint as `UsageEngine`.
2. **`deduct()` does not check billing model.** The conditional is the Application Layer's responsibility.
3. **Low-balance check is part of `deduct()` result.** The `isLowBalance` flag on `CreditDeductionResult` is computed inside the engine call so the Application Layer can fire the notification after `dbTransaction` commits, without re-reading state.
4. **No Prisma imports.** Same constraint as all billing engines.

---

### Conditions for Removal or Reconsideration

Remove or replace `CreditEngine` if:

- The credit balance model is replaced by a real-time balance service (e.g., a separate credit ledger microservice with atomic deduction) — the engine's arithmetic is replaced by an API call.
- The R2 race condition is addressed via a server-side optimistic lock, which may require restructuring `deduct()` into an async server function pattern rather than a synchronous engine call.

---

## ADR-007 — BillingProviderAdapter Pattern

**Date:** August 1, 2026
**Status:** Accepted — Active
**Introduced in:** Phase 4 (External Billing Integration)
**Files:** `src/lib/billing/billing-provider.ts` (interface), `src/lib/billing/adapters/stripe-adapter.ts` (implementation)

---

### Problem Being Solved

Integrating an external payment provider (Stripe) into the billing infrastructure requires making HTTP calls to an external SDK at multiple points: subscription creation, cancellation, invoice retrieval, credit package purchase, and webhook signature verification.

Without an adapter boundary, the Stripe SDK would be imported directly in server functions, background jobs, and the webhook handler. A provider swap (or a mock for testing) would require changing every import site. SDK types would leak into the Application Layer, coupling all billing logic to Stripe's type definitions.

The webhook handler in particular creates a security constraint: signature verification must happen before any payload is processed. If the verification call is embedded inside a handler alongside business logic, a refactor that reorders the code could introduce a security regression.

---

### Alternatives Considered

**Alternative 1: Import Stripe SDK directly in every call site**

Use `import Stripe from 'stripe'` in webhook handler, server functions, and jobs.

*Why rejected:* Three or more call sites means a provider swap affects every file that has the import. Stripe's type system is large — SDK types leaking into the Application Layer would make the billing types Stripe-specific. Testing requires mocking the Stripe SDK at every call site individually.

**Alternative 2: Create a BillingService class**

A class that encapsulates all Stripe calls, instantiated with a Stripe API key.

*Why rejected:* A class is the correct approach for stateful services. The adapter is essentially stateless — its behavior is determined by configuration (API key, webhook secret), not by accumulated state. A class adds `this` binding without benefit. The existing codebase uses the Engine pattern (static objects or factories returning plain objects) for domain behavior objects, not classes. Introducing a class pattern here would create a naming inconsistency.

**Alternative 3: Provider adapter interface with concrete implementation (the chosen approach)**

Define `BillingProviderAdapter` as a TypeScript interface in `billing-provider.ts`. The concrete Stripe implementation lives entirely in `src/lib/billing/adapters/stripe-adapter.ts`. Application Layer code depends only on the interface.

*Why chosen:*
- The only file in the entire codebase that imports from `stripe` is `stripe-adapter.ts`. A provider swap changes exactly one file.
- Testing: the Application Layer can be tested with a mock `BillingProviderAdapter` implementation — no Stripe SDK required.
- Security: `verifyWebhookSignature()` is a named method on the interface. The webhook handler calls it first before any other method. The interface contract makes the verification step impossible to miss or reorder.
- Follows the same infrastructure isolation principle as Engines: the domain/application layer depends on abstractions, not concrete implementations.

---

### Why This Abstraction Was Chosen

1. **Zero SDK imports in application code.** `billing-provider.ts` is pure TypeScript. Application Layer code (`create-subscription.ts`, `webhook/index.ts`, `billing-invoice-generation.ts`) depends only on the interface.
2. **Security property.** `verifyWebhookSignature()` being a first-class interface method prevents the security check from being skipped. The webhook handler's pattern is: verify → process. This ordering is enforced by convention and code review, not just documentation.
3. **Testability.** A mock `BillingProviderAdapter` can implement the interface with deterministic responses. All Phase 4 integration tests use mock adapters instead of live Stripe API calls.
4. **Idempotency is the caller's responsibility.** The adapter interface does not enforce idempotency — that is the Application Layer's job. Each call site checks the current state before calling the adapter, so duplicate adapter calls are harmless (the state check prevents re-application).

---

### Design Constraints That Must Be Preserved

1. **`stripe` package is only imported in `src/lib/billing/adapters/`.** No file outside this directory may import from `stripe`. Enforced by code review; a linting rule is recommended.
2. **The interface is provider-agnostic.** No method on `BillingProviderAdapter` uses Stripe-specific terminology (no `checkoutSession`, no `paymentIntent`). The adapter normalizes provider concepts to domain concepts.
3. **All adapter methods are async.** They make network calls. The caller handles failures via `try/catch` or `ResultAsync`.
4. **`normaliseStripeEvent()` in the adapter maps provider event types to domain `WebhookEventType`.** The webhook handler works only with domain types — it has no switch on Stripe event strings.

---

### Conditions for Removal or Reconsideration

This abstraction is correct as long as there is exactly one external payment provider. If a second provider is added:

- Add a second adapter file implementing `BillingProviderAdapter`.
- A factory or configuration key selects the active adapter at startup.
- No Application Layer code changes.

Remove the abstraction only if the external billing integration is replaced by a fully internal system — at that point the interface and adapter collapse into direct Prisma writes.

---

## ADR-008 — Data Preservation on Billing Lapse

**Date:** August 1, 2026
**Status:** Accepted — Active
**Relevant phases:** Phase 0 (SubscriptionEngine), Phase 1 (UI Enforcement)
**Decision source:** `v1-master-plan.md` §8.3

---

### Decision

No business data is deleted, archived, or hidden because of a billing status change. Subscription status controls operational access; it never controls data existence.

---

### Problem Being Solved

When a subscription expires, there are two approaches to inactive tenants:
1. Archive or delete their data after a retention window.
2. Preserve all data indefinitely and control access via subscription status only.

The first approach is common in consumer SaaS to manage storage costs. The second is the correct model for small business operators whose transaction history, customer records, and inventory data represent years of operational records — data they cannot afford to lose.

---

### Rationale

**Commercial commitment:** Data preservation is a product differentiator and a trust signal. A POS operator who loses transaction records because of a missed payment would have cause for regulatory, financial, and reputational harm. The risk to the platform outweighs the storage cost savings.

**Technical simplicity:** Reactivation is a `BusinessSubscription.status` change from `EXPIRED` (or `LONG_TERM_INACTIVE`) to `ACTIVE`. There is no data restore, no migration, no job to reverse archival. This reduces the `SubscriptionEngine` state machine complexity significantly.

**Audit trail:** The `SubscriptionStatusHistory` table records every status transition. If a business disputes access loss, the exact transition timestamps and triggers are available.

---

### Consequences

- Storage grows without bound for long-term inactive tenants. This is an accepted cost at the current scale.
- The `LONG_TERM_INACTIVE` state exists to signal platform-level de-prioritization of the tenant without deleting data.
- No archival jobs are needed. The `src/lib/jobs/` directory has no "archive tenant" or "purge inactive business data" job and must never have one.
- The entitlement engine blocks operational access (`isOperational = true` capabilities) for EXPIRED and LONG_TERM_INACTIVE subscriptions. Data reads (reports, transaction history) remain accessible regardless of status.

---

### Trade-offs

Storage grows for inactive accounts. At current data volumes (POS transactions, ~1–10 KB per transaction), a business with 10,000 historical transactions consumes roughly 10–100 MB. Indefinite retention at this scale is inexpensive on PostgreSQL. If the platform grows to millions of tenants with years of inactivity, a soft-archive strategy (cold storage, not deletion) can be layered on without changing the access control model.

---

## ADR-009 — Composable Feature-Based Pricing via PricingEngine and Snapshot Model

**Date:** August 1, 2026
**Status:** Accepted — Active
**Introduced in:** Phase 5 (Composable Feature-Based Pricing)
**Files:** `src/lib/billing/pricing/pricing-engine.ts`, `src/lib/billing/pricing/pricing-catalog-repository.ts`
**Decision source:** `v1-master-plan.md` §8.3

---

### Decision

The `COMPOSABLE_FEATURES` billing model uses a dedicated `PricingEngine` as the single source of truth for all pricing calculations. Agreed prices are frozen into `BusinessSubscriptionFeature` snapshot records at subscription creation and are never recalculated silently. The `PricingEngine` receives all data as DTOs from the Application Layer — it has zero Prisma or collection imports.

---

### Problem Being Solved

Predefined plan tiers cannot accommodate every business's feature needs without a combinatorial explosion of plans. Enterprise customers negotiate custom combinations. A composable model allows businesses to build their own subscription while the system remains configurable — no code deployment needed to introduce a new feature price, bundle, or promotional rate.

The challenge is: pricing calculations are complex (dependency resolution, bundle qualification, tax calculation, annual pricing), and they must be correct at the moment of quote generation, not recalculated when a subscription renews. A price change in the catalog must not retroactively change what a business agreed to pay.

---

### Why a Dedicated Engine

Centralizing all pricing calculations in `PricingEngine` follows the same pattern as `TaxEngine` and `CostingEngine` — both are pure calculation engines that receive data as DTOs and return structured results. Scattering pricing logic across server functions, background jobs, and UI components would create the same rule-duplication problem that motivated `InventoryEngine`.

The Engine pattern has been validated by three prior engines in the billing domain (`UsageEngine`, `CreditEngine`, `InvoiceEngine`). The `PricingEngine` is the most complex but not architecturally different.

---

### Why the Snapshot Model

When a business accepts a quote, the agreed prices are written as `BusinessSubscriptionFeature` records — one per selected feature, storing the `priceAtSubscription` at the time of acceptance. These records never change after creation.

If the `FeaturePrice` for a feature changes in a subsequent `PricingCatalog` version, that change:
- Does NOT affect existing subscriptions (they read from their snapshot records).
- DOES affect new quotes (they calculate from the active catalog version).
- IS detected by `PricingEngine.validateGrandfatheredPrices()`, which compares snapshot prices against the current catalog.

This means:
1. A business that negotiated a price 12 months ago continues to pay that price until renewal.
2. The renewal preview job (`composable-renewal-preview.ts`) runs before renewal, calls `validateGrandfatheredPrices`, and notifies the business if their price is changing.
3. No price change is ever silent.

---

### Architectural Constraints (Hard Gates — Phase 5 Compliance)

- **Zero Prisma imports in `src/lib/billing/pricing/`.** The pricing subdomain is the strictest infrastructure isolation in the codebase. A linting rule or `import/no-restricted-paths` configuration should enforce this. Verified by unit tests that run without a database.
- **`PricingEngine` receives `calculatedAt` as a parameter.** The engine never calls `new Date()` internally. This makes calculations reproducible for testing and audit.
- **`PricingResult.grandTotal` does not include `oneTimeFees`.** One-time fees are shown separately in the quote and are not part of the recurring total.
- **`PricingCatalogRepository` is the only code that reads `FeaturePrice` and `PricingCatalog` from Prisma.** The Engine receives a `PricingCatalogDTO` — a plain DTO assembled by the repository.

---

### Consequences

Six new database tables. `PricingEngine` with five strategies must be implemented before the composable model is activated. `EntitlementEngine` is extended to resolve entitlements from `BusinessSubscriptionFeature` when `billingModel = COMPOSABLE_FEATURES`. Existing predefined-plan subscriptions are entirely unaffected.

---

## ADR-010 — Feature and Pricing as Separate Domain Objects

**Date:** August 1, 2026
**Status:** Accepted — Active
**Introduced in:** Phase 5 (Composable Feature-Based Pricing)
**Files:** `prisma/schema.prisma` (`Feature`, `FeaturePrice`, `PricingCatalog` models)
**Decision source:** `v1-master-plan.md` §8.3

---

### Decision

The `Feature` model owns identity, entitlement classification, and dependency graph only. Pricing is owned by `FeaturePrice`, versioned through `PricingCatalog`. The `PricingEngine` receives a `PricingCatalogDTO` assembled by the Application Layer — it never reads `Feature` or `FeaturePrice` from the database directly.

---

### Problem Being Solved

The previous iteration placed pricing fields (`monthlyPrice`, `yearlyPrice`, `implementationFee`, `setupFee`) directly on the `Feature` model. This worked for a single pricing tier in a single currency, but created coupling that made regional pricing, multi-currency, reseller channels, and promotional pricing architecturally difficult:

1. Updating a feature's price would silently change the reproduction of all historical quotes (no price history).
2. Applying a promotional rate required either modifying the Feature record (destructive) or adding a parallel override mechanism.
3. A reseller's margin could not be expressed without a separate price column on `Feature`.
4. Currency-specific pricing required either multiple `Feature` records or a denormalized price map on the model.

---

### Why Separation Is the Right Model

A feature's **identity** changes rarely and only by deliberate product decision (renaming `CREATE_ORDER` to `PLACE_ORDER`, for example). Its **price** changes frequently — across catalog versions, promotions, regions, and negotiated deals.

Separating the two concerns means each evolves at its own rate. The `PricingCatalog` version becomes the audit anchor: any quote or subscription snapshot can be reproduced exactly by loading the catalog version it was calculated under. Historical records are never affected by current catalog changes.

This mirrors the same pattern used for `FeatureBundle → FeatureBundleVersion`: the bundle identity is stable; its discount terms are versioned separately.

---

### The Three-Model Pattern

| Model | Responsibility |
|-------|---------------|
| `Feature` | Identity, `CapabilityKey`, `isSelectableByCustomer`, `pricingCategory`, dependency graph |
| `FeaturePrice` | Price per billing cycle for a specific feature in a specific catalog version |
| `PricingCatalog` | Version container with status (`DRAFT`, `ACTIVE`, `ARCHIVED`); only one `ACTIVE` catalog at a time |

---

### Consequences

Three additional models at Phase 5 schema expansion. The `PricingCatalogRepository` gains the `loadActive()` and `loadById()` methods as the sole read path for pricing data from the Application Layer.

The initial `PricingCatalog v1` seed is applied after Migration 15b. The seeder must atomically insert the catalog, all `FeaturePrice` records, and the initial `FeatureBundleVersion` records in one transaction.

---

### Trade-offs

More models to reason about at the schema level. Mitigated by clear naming, consistent documentation, and the fact that pricing administrators interact with catalog records via the Platform Administration UI (ADR-011, deferred), not by editing `Feature` records.

The `Feature` model becomes leaner — it no longer contains any monetary values. This simplifies the entitlement path: `EntitlementEngine` reads `Feature` keys for capability checks and never touches pricing data.
