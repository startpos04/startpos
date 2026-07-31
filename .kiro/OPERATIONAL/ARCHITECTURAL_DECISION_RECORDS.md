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
