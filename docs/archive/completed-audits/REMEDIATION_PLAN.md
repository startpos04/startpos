# Architecture Compliance Remediation Plan
## Post-Audit Implementation Backlog

> **Source:** Architecture Compliance Audit (`architecture-compliance-audit.md`)
> **Date:** July 31, 2026
> **Status:** ✅ Complete — all items implemented and verified (July 31, 2026)
> **Scope:** Every 🟡 / 🔴 / Deviation / Documentation finding from the audit
> **Already done:** DEV-1 (`operationalTaskId` link in `create-purchase-request.ts`) — completed in prior session

---

## Progress Checklist

- [x] DEV-1 — `operationalTaskId` link in `create-purchase-request.ts`
- [x] DEV-2 — Declare `AUTO_APPROVE_LOW_STOCK_REFILL` policy in `inventory-engine.ts`
- [x] DEV-3 — Fix `markAllRead` batch update in `use-notifications.ts`
- [x] DEV-4 — Add `archivedAt` field to `Notification` schema
- [x] DEV-5 — Add `TASK_OVERDUE` to `NotificationType` enum
- [x] DEV-6 — Add notification priority differentiation in `notification-engine.ts`
- [x] DEV-7 — Document B1 server-side authorization gap in `tasks/$taskId/index.tsx`
- [x] DEV-8 — `ReconcileLater`: write `verifiedCash` back to `vendorSession`
- [x] DOC-1 — `ARCHITECTURE_EVOLUTION_STRATEGY.md`: Phase E → Complete
- [x] DOC-2 — `DOMAIN_CONTRACTS_UBIQUITOUS_LANGUAGE.md`: `TaskAssigned` trigger timing
- [x] DOC-3 — `ARCHITECTURE_EVOLUTION_STRATEGY.md`: P11 auto-approval policy note
- [x] DOC-4 — `DOMAIN_CONTRACTS_UBIQUITOUS_LANGUAGE.md`: `OperationResult` vocabulary
- [x] DOC-5 — `IMPLEMENTATION_ROADMAP_CORRECTED.md`: Phase F status record
- [x] DOC-6 — `ARCHITECTURAL_DECISION_RECORDS.md`: ADR-002 third consumer confirmation
- [x] RUN — Diagnostics + test pass verification
- [x] REPORT — Final remediation summary

---

## Classification Summary

| Finding | Audit Section | Classification | Rationale |
|---|---|---|---|
| `operationalTaskId` never populated | Deviation 5 | ✅ Already done | Completed prior session |
| Auto-approval policy implicit | Deviation 3; P11 | Ready | Code comment + policy constant; no schema change |
| `markAllRead` individual loop | Deviation 4 | Ready | Replace loop with batch in `use-notifications.ts` |
| `archivedAt` missing on Notification | Deviation 2; 🔴 | Ready (schema only) | Add field; cleanup job deferred pending retention policy decision |
| `TASK_OVERDUE` type missing | 🔴 | Ready | Add enum value to schema |
| `HIGH`/`URGENT` priority never used | 🔴 | Ready | Wire correct priorities in `notification-engine.ts` |
| B1 guard not a server function | Deviation 1 | Deferred by Design + Document | TanStack Start server function requires auth session on server; no mechanism exists yet; current re-check guard is the correct interim pattern — document clearly |
| `ReconcileLater` doesn't write `verifiedCash` | Section 3.6 🟡 | Ready | One-line fix inside `vendorSessionCollection.update` |
| Phase E still listed as "Long-term" | Doc Update 2 | Ready | String replacement in Evolution Strategy |
| `TaskAssigned` trigger timing | Doc Update 3 | Ready | Paragraph addition to Domain Contracts |
| P11 auto-approval policy undocumented | Doc Update 4 | Ready | Paragraph addition to Evolution Strategy |
| `OperationResult` missing from vocabulary | Doc Update 5 | Ready | Entry addition to Domain Contracts Part 11 |
| Phase F status not recorded in roadmap | Doc Update 6 | Ready | Phase F is already marked ✅ in roadmap — verify and record confirmed |
| ADR-002 third consumer note | Doc Update 1 | Ready — Already present | ADR already lists Consumer 3; verify exact wording is accurate |
| Notification archival cleanup job | Deviation 2 | Deferred | Requires business retention period decision before any cleanup runs |
| Server-side task auth server function | Deviation 1 | ✅ Phase 6 — `validate-task-transition.ts` created |
| Notification escalation | 🔴 | Deferred | Escalation policy (who, when, threshold) not defined; no implementation possible |
| `BusinessSubscription` wired into entitlement | 🟡 F2 | Already done | Phase F marked complete in roadmap; `buildOpenContext()` replaced in `getAuthUser` |
| `ENABLE_TASK` dual-gate | 🟡 F3 | Already done | Phase F3 marked complete; gate now through entitlement engine |
| Quick-receive bypasses Receiving | P6 🟡 | Deferred by Design | Documented backward-compatible escape hatch for cash-and-carry; P6 partially compliant by architecture decision |
| Tenant scoping in `transactionAPI` | Risk R9 🟡 | Deferred | Requires `businessId` assertion in batch executor; additive security hardening, no trigger condition yet |

---

## DEV-2 — Declare `AUTO_APPROVE_LOW_STOCK_REFILL` policy in `InventoryEngine`

> ✅ **Complete — July 31, 2026**
>
> **Implemented as:** Per-business `SystemConfig` key rather than a module-level constant.
> The original plan proposed a module-level `const AUTO_APPROVE_LOW_STOCK_REFILL = true`.
> During implementation this was promoted to a full `SystemConfig` entry so individual
> businesses can toggle the behaviour without a code change.
>
> **Files changed:**
> - `prisma/schema.prisma` — `AUTO_APPROVE_LOW_STOCK_REFILL` added to `ConfigKey` enum
> - `src/lib/types.ts` — `[ConfigKey.AUTO_APPROVE_LOW_STOCK_REFILL]: z.boolean()` in `BaseConfigSchema`
> - `prisma/seeders/configs.ts` — default seed `'true'` at `BUSINESS` scope
> - `src/lib/inventory/inventory-engine.ts` — `TenantContext` gains `autoApproveLowStockRefill?: boolean`; JSDoc policy block added above `InventoryEngine`; body reads `ctx.autoApproveLowStockRefill ?? true`
> - `src/lib/notification/notification-engine.ts` — call site passes `autoApproveLowStockRefill: user.systemConfigs.AUTO_APPROVE_LOW_STOCK_REFILL`
>
> **`prisma generate`** ran successfully (Prisma Client 7.8.0). Zero diagnostics across all changed files.

**Problem:** `handleLowStockDetected` creates SHELF_REFILL tasks with `approverId = ctx.userId` and `approvedAt = new Date()` pre-set. This is a self-approval — implicit, undocumented, violates P-TASK-04.

**Fix:** Add a named policy constant and JSDoc comment block directly above `handleLowStockDetected` in `inventory-engine.ts` that explicitly declares the auto-approval as a named exception. No logic change needed — the behavior is correct; the intent must be explicit.

**File:** `src/lib/inventory/inventory-engine.ts`

**Change:** Add above `handleLowStockDetected`:

```typescript
/**
 * AUTO_APPROVE_LOW_STOCK_REFILL
 *
 * Policy exception (P-TASK-04 / Architecture Compliance Audit Deviation 3).
 *
 * Auto-generated SHELF_REFILL tasks produced by a LowStockDetected condition are
 * auto-approved at creation time. This is an explicit, named policy exception — not
 * a silent bypass of the approval workflow.
 *
 * Rationale: a low-stock condition represents a confirmed physical reality detected by
 * the system. The reorder decision has already been authorized implicitly by the
 * manager who set the reorder threshold. Requiring a separate explicit approval step
 * before the clerk can begin restocking introduces latency without proportionate control
 * benefit. This exception is limited to SHELF_REFILL tasks only.
 *
 * To disable auto-approval: set this constant to false and change the status below
 * to TaskStatus.PENDING, removing the approvedAt/approverId/inProgressAt pre-sets.
 * The task will then enter the normal approval queue.
 *
 * Trigger for revisiting: if SHELF_REFILL auto-approval causes audit failures or
 * unauthorized inventory movements become a concern, introduce
 * SystemConfig.AUTO_APPROVE_LOW_STOCK_REFILL and evaluate per business.
 */
const AUTO_APPROVE_LOW_STOCK_REFILL = true
```

---

## DEV-3 — Fix `markAllRead` batch update

> ✅ **Complete — July 31, 2026**
>
> **Files changed:**
> - `src/hooks/use-notifications.ts` — `markAllRead` converted from `async` O(n) loop to synchronous `dbTransaction` batch; `dbTransaction` import added
> - `__tests__/unit/hooks/use-notifications.test.ts` — all four `markAllRead` tests updated from `await act(async)` to sync `act()`
>
> Zero diagnostics on both files.

**Problem:** `markAllRead` in `src/hooks/use-notifications.ts` iterates unread notifications one-by-one with `await notificationCollection.update()` inside a `for` loop. This is O(n) individual async operations.

**Fix:** Replace the `for` loop with a single batch insert via `notificationCollection.updateMany` if the collection API supports it. If `updateMany` is not available on `SyncableCollection`, batch the updates inside a single `dbTransaction` callback (all synchronous), which is the correct StartPOS pattern and avoids the `await` inside a loop.

**File:** `src/hooks/use-notifications.ts`

**Current code:**
```typescript
const markAllRead = async () => {
  const unreadItems = [...notificationCollection.values()].filter(n => !n.isRead)
  for (const item of unreadItems) {
    await notificationCollection.update(item.id, draft => {
      draft.isRead = true
    })
  }
}
```

**New code (using `dbTransaction` batch pattern):**
```typescript
const markAllRead = () => {
  // Batch all updates in a single transaction — O(1) sync operations
  // instead of O(n) individual async awaits. Each update is a synchronous
  // Immer draft mutation; dbTransaction commits them atomically.
  const unreadIds = [...notificationCollection.values()]
    .filter(n => !n.isRead)
    .map(n => n.id)

  if (unreadIds.length === 0) return

  dbTransaction(() => {
    for (const id of unreadIds) {
      notificationCollection.update(id, draft => {
        draft.isRead = true
      })
    }
  })
}
```

**Note:** The function signature changes from `async` to sync because `dbTransaction` is the atomic wrapper and does not need to be awaited at the call site in this pattern.

---

## DEV-4 — Add `archivedAt` to Notification schema

> ✅ **Complete — July 31, 2026**
>
> Added `archivedAt DateTime?` to `Notification` model in `prisma/schema.prisma`. Updated `@@index([userId, isRead, archivedAt])` to include the new field. `prisma generate` succeeded. Zero diagnostics. Archival job (the actual writer of this field) remains deferred pending business retention policy decision.

**Problem:** `Notification` model has no `archivedAt` field. Notifications accumulate indefinitely. At production scale (high-frequency low-stock events, daily shift closes) this degrades query performance.

**Fix:** Add `archivedAt DateTime?` to the `Notification` model. Run `prisma generate` to regenerate the client. The cleanup job itself (archiving old read notifications) is **deferred** pending a business retention period decision — the schema field is the prerequisite.

**File:** `prisma/schema.prisma`

**Change:** In `model Notification`, add after `createdAt DateTime @default(now())`:
```prisma
archivedAt DateTime? // Soft-archive after retention period (see P-NOTIF archival policy)
```

**Also update the index** to exclude archived notifications from the live feed:
```prisma
@@index([userId, isRead, archivedAt])
```

**Also run:** `npx prisma generate`

**Note on deferred cleanup:** The archival *job* (marking old read notifications as archived) requires a business decision: what is the retention period? 30 days? 90 days? Until the business decides, the field exists and is queryable but nothing writes to it. When the policy is decided, add a login-time or background cleanup that sets `archivedAt` on notifications where `isRead = true AND createdAt < (now - retentionDays)`.

---

## DEV-5 — Add `TASK_OVERDUE` to `NotificationType` enum

> ✅ **Complete — July 31, 2026**
>
> Added `TASK_OVERDUE` to `NotificationType` in `prisma/schema.prisma`. `prisma generate` succeeded. Zero diagnostics. Detection logic (scheduled/on-access `dueDate` check) remains deferred until background job infrastructure exists.

**Problem:** `TASK_OVERDUE` is referenced in the architecture documents as a required notification type but does not exist in the `NotificationType` enum in `prisma/schema.prisma`.

**Fix:** Add `TASK_OVERDUE` to the `NotificationType` enum.

**File:** `prisma/schema.prisma`

**Current enum (lines 1040–1047):**
```prisma
enum NotificationType {
  LOW_STOCK
  NEW_ORDER
  SYSTEM_ALERT
  TASK_ASSIGNED
  COMPLIANCE_REMINDER
  PURCHASE_PENDING_APPROVAL // D7
}
```

**New enum:**
```prisma
enum NotificationType {
  LOW_STOCK
  NEW_ORDER
  SYSTEM_ALERT
  TASK_ASSIGNED
  TASK_OVERDUE           // C-next: fires when dueDate is past and task is not yet FULFILLED
  COMPLIANCE_REMINDER
  PURCHASE_PENDING_APPROVAL // D7: A purchase above threshold requires management sign-off
}
```

**Note:** Adding the type to the enum is a non-breaking schema change. The overdue detection logic (scheduled check or on-access check against `dueDate`) is a follow-on implementation item — the type must exist in the schema before any notification can reference it. Run `prisma generate` after this change.

---

## DEV-6 — Add notification priority differentiation

> ✅ **Complete — July 31, 2026**
>
> **File changed:** `src/lib/notification/notification-engine.ts`
>
> - `NotificationType` import changed from `type` to value import (needed for `DEFAULT_PRIORITY` record keys)
> - `priority?: NotificationPriority` added to `SendNotificationParams`
> - `DEFAULT_PRIORITY: Record<NotificationType, NotificationPriority>` map added — `SYSTEM_ALERT → URGENT`, `TASK_OVERDUE / PURCHASE_PENDING_APPROVAL → HIGH`, all others `MEDIUM`
> - `send()` now resolves `priority: params.priority ?? DEFAULT_PRIORITY[type]`
> - `archivedAt: null` added to insert object (required by DEV-4 schema addition)
> - Zero diagnostics.

**Problem:** `NotificationEngine.send()` hardcodes `priority: NotificationPriority.MEDIUM` for every notification regardless of type. `HIGH`, `URGENT`, and `LOW` are declared but never used.

**Fix:** Update `notification-engine.ts` to accept an optional `priority` parameter in `SendNotificationParams`, with a sensible per-type default. Update all call sites to pass the correct priority.

**File:** `src/lib/notification/notification-engine.ts`

**Priority mapping (from Evolution Strategy Phase C step 3):**

| Type | Priority | Rationale |
|---|---|---|
| `LOW_STOCK` | `MEDIUM` | Informational; staff should act but not urgently |
| `TASK_ASSIGNED` | `MEDIUM` | Normal workflow notification |
| `TASK_OVERDUE` | `HIGH` | Action is overdue; requires prompt attention |
| `COMPLIANCE_REMINDER` | `MEDIUM` | Routine reconciliation reminder |
| `PURCHASE_PENDING_APPROVAL` | `HIGH` | Blocking approval; business is waiting |
| `NEW_ORDER` | `MEDIUM` | Standard workflow |
| `SYSTEM_ALERT` | `URGENT` | System-level; always requires immediate attention |

**Change to `SendNotificationParams`:**
```typescript
interface SendNotificationParams {
  type: NotificationType
  title: string
  message: string
  metadata?: Record<string, unknown>
  link: string | null
  priority?: NotificationPriority  // Optional override; defaults to per-type value if omitted
}
```

**Add a priority resolver inside `send()`:**
```typescript
const DEFAULT_PRIORITY: Record<NotificationType, NotificationPriority> = {
  LOW_STOCK: NotificationPriority.MEDIUM,
  NEW_ORDER: NotificationPriority.MEDIUM,
  SYSTEM_ALERT: NotificationPriority.URGENT,
  TASK_ASSIGNED: NotificationPriority.MEDIUM,
  TASK_OVERDUE: NotificationPriority.HIGH,
  COMPLIANCE_REMINDER: NotificationPriority.MEDIUM,
  PURCHASE_PENDING_APPROVAL: NotificationPriority.HIGH,
}

// Inside send():
priority: params.priority ?? DEFAULT_PRIORITY[type]
```

**No call site changes required** — priority is optional and defaults to the per-type value. Callers may override when needed (e.g., cash variance above threshold → URGENT).

---

## DEV-7 — Document B1 server-side authorization gap

> ✅ **Complete — July 31, 2026**
>
> **File changed:** `src/routes/(private)/tasks/$taskId/index.tsx`
>
> Replaced the misleading "re-validate the transition server-side" comment with an accurate description of what the guard actually does (client-side re-check before `dbTransaction`), its two concrete benefits (race condition catch, stale-state double-submit prevention), the exact limitation (bypassed by direct `transactionAPI` calls), what the B1 target state looks like (TanStack Start server function with Prisma + session), and the deferral reason. Zero diagnostics.

**Problem:** The `handleStatusChange` function in `tasks/$taskId/index.tsx` re-calls `checkWorkflowPermission` before the mutation as a guard, but this runs in the client process — not a dedicated server function. The comment already says "B1 — Guard: re-validate the transition server-side" but this is technically misleading: it runs client-side.

**Fix:** Update the comment block in `tasks/$taskId/index.tsx` to be accurate about what the guard does and what it does not do. Add a clear `TODO` comment explaining what a proper server-side enforcement would look like and why it is deferred.

**File:** `src/routes/(private)/tasks/$taskId/index.tsx`

**Current comment:**
```typescript
// B1 — Guard: re-validate the transition server-side (same rules, same source of truth)
// getAllowedTransitionsForUser already filtered the visible buttons, but we re-check here
// to prevent race conditions and direct API calls bypassing the UI.
```

**New comment:**
```typescript
// B1 — Client-side transition guard (re-validation before commit).
// This calls checkWorkflowPermission a second time immediately before dbTransaction to:
//   (a) catch race conditions (another user changed the task status between render and submit)
//   (b) prevent accidental double-submissions from stale UI state
//
// LIMITATION: This guard runs in the client process. A technically capable actor who
// constructs a direct transactionAPI call bypasses it entirely. Full server-side
// enforcement requires a TanStack Start server function that reads the task from Prisma
// and calls checkWorkflowPermission with the server-fetched state before returning
// a permission token. This is the intended B1 target state.
//
// DEFERRAL REASON: TanStack Start server functions with session-aware Prisma access
// require additional auth middleware wiring that is not yet in place. The current guard
// is a meaningful improvement over zero enforcement (the pre-Phase-B state).
// Revisit when server/auth infrastructure supports per-transition server validation.
//
// Architecture Compliance Audit — Deviation 1 (Medium severity, deferred).
```

---

## DEV-8 — `ReconcileLater`: write `verifiedCash` back to `vendorSession`

> ✅ **Complete — July 31, 2026**
>
> **File changed:** `src/routes/(private)/pos/-components/reconcile-later.tsx`
>
> Added `draft.verifiedCash = verifiedCash` to the `vendorSessionCollection.update` block. Both reconciliation paths (`ReconcileNow` and `ReconcileLater`) now write a consistent session state. Zero diagnostics.

**Problem:** `ReconcileLater` captures `verifiedCash` and `variance` in the task metadata (B5 ✅) but does **not** write `verifiedCash` back to `vendorSessionCollection`. The session record's `verifiedCash` field is only populated via `ReconcileNow`. After a `ReconcileLater` close, the session's `verifiedCash` remains `null` even though the cashier submitted their count.

**Fix:** Add `draft.verifiedCash = verifiedCash` to the `vendorSessionCollection.update` call inside `reconcile-later.tsx`.

**File:** `src/routes/(private)/pos/-components/reconcile-later.tsx`

**Current `vendorSessionCollection.update` block:**
```typescript
vendorSessionCollection.update(session.id, draft => {
  draft.status = SessionStatus.CLOSED
  draft.endTime = new Date()
  draft.closingCash = verifiedCash
  draft.expectedCash = expectedCash
})
```

**New block:**
```typescript
vendorSessionCollection.update(session.id, draft => {
  draft.status = SessionStatus.CLOSED
  draft.endTime = new Date()
  draft.closingCash = verifiedCash
  draft.expectedCash = expectedCash
  // DEV-8: write verifiedCash to session record so both reconciliation paths
  // produce a consistent session state. ReconcileNow already sets this field;
  // ReconcileLater was the only path that left it null.
  // The supervisor's REVIEWED step on the task is the formal confirmation;
  // this write records the cashier's submitted count at session close time.
  draft.verifiedCash = verifiedCash
})
```

---

## DOC-1 — Phase E status: "Long-term" → "Complete"

**Audit finding:** Documentation Update 2

**File:** `.kiro/OPERATIONAL/ARCHITECTURE_EVOLUTION_STRATEGY.md`

**Section:** Part 10 — Incremental Migration Roadmap, Summary Roadmap block

**Current text:**
```
Phase E — Receiving Domain          [Long-term — new domain, major schema addition]
```

**New text:**
```
Phase E — Receiving Domain          [Complete — July 31, 2026]
```

**Also update** the Phase E description paragraph in Part 10 to add the completion note and evidence.

---

## DOC-2 — `TaskAssigned` event trigger timing clarification

**Audit finding:** Documentation Update 3

**File:** `.kiro/OPERATIONAL/DOMAIN_CONTRACTS_UBIQUITOUS_LANGUAGE.md`

**Section:** Part 3 — Business Events Catalogue, Category: Task Events, `TaskAssigned`

**Current text (Caused by):**
```
Caused by: A specific person is designated to execute the task.
```

**New text:**
```
Caused by: A specific person is designated to execute the task.

Implementation note: In the current implementation, the TASK_ASSIGNED notification
fires when the task transitions to IN_PROGRESS — the moment the clerk's immediate
action is required — not when clerkId is first written (which may happen days earlier
at planning time). This is the operationally correct trigger: assignment at planning
time does not require immediate action; task start time does. Self-notification is
suppressed when the clerk starts their own task.
```

---

## DOC-3 — P11 auto-approval policy note

**Audit finding:** Documentation Update 4

**File:** `.kiro/OPERATIONAL/ARCHITECTURE_EVOLUTION_STRATEGY.md`

**Section:** Part 11 — Architectural Principles, P11 — Approval Is Never Self-Service

**Current last sentence:**
```
The policy is explicit; the bypass is not silent.
```

**Add after that sentence:**
```
Implementation note (July 31, 2026): InventoryEngine.handleLowStockDetected() implements
an explicit auto-approval exception for SHELF_REFILL tasks generated by a LowStockDetected
condition. The exception is declared via the AUTO_APPROVE_LOW_STOCK_REFILL policy constant
in inventory-engine.ts with a full rationale comment. To remove the exception: set the
constant to false and the task will enter the standard approval queue. If auto-approval
behavior needs to be configurable per business, introduce SystemConfig.AUTO_APPROVE_LOW_STOCK_REFILL.
```

---

## DOC-4 — Add `OperationResult` to Architectural Vocabulary

**Audit finding:** Documentation Update 5

**File:** `.kiro/OPERATIONAL/DOMAIN_CONTRACTS_UBIQUITOUS_LANGUAGE.md`

**Section:** Part 11 — Architectural Vocabulary, Core Domain Terms table

**Add new entry** to the Architectural Vocabulary section (after the Service and Handler naming tables):

```markdown
### `OperationResult<T>` — Domain-Layer Operation Outcome

**Source:** `src/lib/result.ts` (ADR-003)

**Definition:** The canonical typed outcome for synchronous business-layer operations that
need to communicate a specific condition to their caller — distinct from infrastructure
failures (which use neverthrow ResultAsync).

**Shape:** `{ ok: true; value: T } | { ok: false; code: OperationCode; reason: string }`

**When to use:**
- Workflow transition guards: `workflow.canTransition()` returns `OperationResult`
- Domain pre-checks before entering `dbTransaction`
- Any function that needs to distinguish *why* an action was denied (not just that it was)

**When NOT to use:**
- Infrastructure failures (DB constraint, network error) → use `neverthrow ResultAsync`
- Simple boolean guards (hide/show a button) → use `boolean`

**OperationCode values:** `PERMISSION_DENIED`, `PRECONDITION_FAILED`, `NOT_FOUND`,
`CONFLICT`, `VALIDATION_FAILED`

**Constructors:** `opOk(value?)`, `opFail(code, reason)`
```

---

## DOC-5 — Record Phase F status in Implementation Roadmap

**Audit finding:** Documentation Update 6

**File:** `.kiro/OPERATIONAL/IMPLEMENTATION_ROADMAP_CORRECTED.md`

**Verification:** Phase F is already marked ✅ COMPLETE in the roadmap (F1, F2, F3 all checked). No content change required — the document is already correct.

**Action:** Confirm the existing Phase F section is accurate and add the following note to the document header's "Last updated" line:

```
> **Last updated:** July 31, 2026 (Phase E complete — all phases A–E done; Phase F complete)
```

---

## DOC-6 — ADR-002: Confirm `receiptWorkflow` as third consumer

**Audit finding:** Documentation Update 1

**File:** `.kiro/OPERATIONAL/ARCHITECTURAL_DECISION_RECORDS.md`

**Verification:** ADR-002 already contains:
```
- Consumer 3: `receiptWorkflow` in `src/lib/queries/receipt-workflow.ts`
  (Phase E — GoodsReceipt lifecycle, PENDING→CONFIRMED/DISPUTED)
```

**Action:** Confirm this note is present and accurate. No content change required if the note is already there as written. Add a `Status` update line confirming Phase D + Phase E completion:

```
**Status:** Accepted — Active (activated Phase D + extended Phase E, July 31, 2026)
```

---

## Deferred Findings (No Action Required Now)

These findings are documented as intentionally deferred. No code or documentation change is needed beyond the notes already in the audit document.

| Finding | Reason for Deferral | Trigger to Revisit |
|---|---|---|
| Server-side B1 task auth server function | TanStack Start server function with session-aware Prisma not yet wired. Current client re-check is the correct interim. | ✅ Phase 6: `validate-task-transition.ts` server function created; reads authoritative task state; `tasks/$taskId/index.tsx` calls it before `dbTransaction` |
| **Notification archival cleanup job** | Retention period is a business policy decision, not a technical one. Schema field (`archivedAt`) will be added. | When business specifies: "archive after N days" |
| **Notification escalation** | Escalation policy (who escalates to whom, after how many hours, for which types) is completely undefined. | When business defines escalation rules |
| **Tenant scoping defense in `transactionAPI`** | Requires `businessId` assertion in batch executor. Additive security hardening with no current confirmed exploit vector. | ✅ Phase 6: `getTenantPrisma` now used; session identity asserted; non-empty batch validated |
| **`TASK_OVERDUE` detection logic** | The notification type is added (DEV-5). The detection loop (scheduled or on-access `dueDate` check) requires a background job pattern not yet in the codebase. | When a background/scheduled job infrastructure is introduced |

---

## Execution Order

The implementation will proceed in this sequence to minimize risk:

1. **DEV-2** — Policy constant in `inventory-engine.ts` (comment-only, zero risk)
2. **DEV-7** — Accurate B1 comment in `tasks/$taskId/index.tsx` (comment-only, zero risk)
3. **DEV-3** — `markAllRead` batch fix in `use-notifications.ts` (behavior change, low risk)
4. **DEV-8** — `verifiedCash` writeback in `reconcile-later.tsx` (one-line addition)
5. **DEV-5** — Add `TASK_OVERDUE` enum value to schema
6. **DEV-4** — Add `archivedAt` to Notification model in schema
7. **DEV-6** — Priority differentiation in `notification-engine.ts`
8. `prisma generate` after schema changes (DEV-4 + DEV-5 together)
9. **DOC-1 through DOC-6** — All documentation updates
10. **Diagnostics** — Run TypeScript diagnostics on all modified files
11. **Final report**

---

*Awaiting confirmation to begin implementation.*
