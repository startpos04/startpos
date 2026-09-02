# ADR-002: Event Emission via dbTransaction Extension

**Status:** Accepted  
**Date:** August 2026  
**Deciders:** Engineering team  
**Phase:** 2 — Event Infrastructure + First Intelligence

---

## Context

Phase 2 required the platform to emit business events (`SUPPLIER_ADDED`,
`EMPLOYEE_INVITED`, `PURCHASE_ORDER_CREATED`, etc.) whenever a significant write
operation commits to the database. The naive approach — calling
`BusinessEventBus.emit()` manually at the end of every server function — was
considered and rejected.

### The problem with manual emission

Every server function that performs a significant write would need to:
1. Know which event(s) to emit
2. Remember to call `emit()` after the DB write
3. Handle errors in a way that doesn't accidentally suppress the event on success
   or fire it on failure

This creates three failure modes that compound over time:
- **Forgetting** — a developer adds a new server function and doesn't add the emit call
- **Wrong timing** — emitting before the transaction commits (fires even on rollback)
- **Coupling** — the server function now imports `BusinessEventBus`, which (without R3 discipline) could pull in the full subscriber chain

### Why Prisma middleware was evaluated and rejected

The roadmap originally suggested Prisma middleware as the alternative. Middleware
intercepts model-level operations (`prisma.supplier.create`, etc.) and can emit
events automatically. However, this project uses the `dbTransaction` + `transactionAPI`
architecture for all tenant data writes — direct Prisma model calls in server
functions are explicitly discouraged by the API Layer Priority Rule. Middleware would
only capture the writes that reach Prisma directly, missing all writes that go
through `dbTransaction`. This made Prisma middleware the wrong boundary.

---

## Decision

**Extend `dbTransaction` with an optional `events` parameter.**

```ts
await dbTransaction(() => {
  supplierCollection.insert({ id, ...data })
}, [
  { type: 'SUPPLIER_ADDED', businessId, occurredAt: new Date() }
])
```

When `events` is provided:
- Events are emitted to `BusinessEventBus` **after** the DB commit succeeds
- Events are **never** emitted if the transaction throws or the user is offline
- Emission is **fire-and-forget** (not awaited by the call site) — the route
  component already has its result before emission completes
- The `BusinessEventBus` import is **lazy** (dynamic `import()`) inside
  `emitEventsAfterCommit()` so that the full subscriber chain is not loaded
  at module initialisation time (Principal Architect Review R3 requirement)
- Subscriber errors are caught and logged — they never propagate back to the
  server function

### Implementation

File: `src/db/local-db-transaction.ts`

```ts
export const dbTransaction = <T>(
  callback: () => T,
  events?: BusinessEvent[],
): ResultAsync<T, Error>
```

After `transactionAPI.execute()` returns successfully:

```ts
if (events && events.length > 0) {
  emitEventsAfterCommit(events)  // fire-and-forget
}
```

`emitEventsAfterCommit` uses a dynamic import to load `BusinessEventBus`:

```ts
function emitEventsAfterCommit(events: BusinessEvent[]): void {
  ;(async () => {
    try {
      const { BusinessEventBus } = await import('@/lib/evolution/business-event-bus')
      for (const event of events) {
        await BusinessEventBus.emit(event)
      }
    } catch (err) {
      console.error('[dbTransaction] Event emission failed after commit:', err)
    }
  })()
}
```

### Offline mode

When the client is offline, `dbTransaction` applies the mutation locally and does
**not** emit events. The server hasn't committed yet — emitting would produce events
for writes that may not yet have reached the DB. Full offline-event reconciliation
is deferred to a later phase.

---

## Consequences

### Positive

- **Zero manual emit calls in server functions** — developers pass events as data
  to `dbTransaction`, not as imperative calls. Forgetting to emit means the event
  array is just empty, not a silent bug.
- **Correct timing guaranteed** — events only fire after the DB commit succeeds.
  No event can fire for a rolled-back write.
- **R3 compliance** — the lazy import breaks the coupling chain:
  `server function → dbTransaction → (lazy) BusinessEventBus → subscribers`
  A broken subscriber definition cannot crash a server function.
- **Offline-safe** — no stale events are emitted before the server has committed.
- **Testable** — `dbTransaction` is mockable in Pattern B tests; events are just
  data in the mock's input.

### Negative / Trade-offs

- **Caller must declare events explicitly** — there is no automatic mapping from
  a collection write to an event type. If a developer adds a new server function
  and forgets the `events` array, no event fires. This is intentional (explicit
  is better than implicit) but requires code-review discipline.
- **Fire-and-forget has no delivery guarantee** — if the process crashes between
  the DB commit and event emission, the event is lost. For the current use case
  (recalculation scheduling, not billing), this is acceptable. If strong delivery
  guarantees are needed in the future, a transactional outbox pattern would
  replace this approach.
- **Offline events are not reconciled** — a supplier added offline does not trigger
  the `usesSuppliers` observation rule until the next scheduled recalculation sweep
  after the transaction syncs. This is acceptable for the intelligence layer but
  documented here as a known limitation.

---

## Alternatives considered

### A — Manual `emit()` calls in every server function

Rejected. Fragile at scale — any new server function that forgets the call
silently drops an event. The coupling also violates R3 if developers import
`BusinessEventBus` directly alongside their collection imports.

### B — Prisma middleware

Rejected. The primary write path uses `dbTransaction` + `transactionAPI`, not
direct Prisma model calls. Middleware only intercepts the latter, which covers
only a small fraction of writes in this codebase.

### C — Transactional outbox (write-to-DB, poll-and-emit)

Not yet needed. The current event volume is low and the intelligence layer
tolerates occasional event loss without data corruption. If delivery guarantees
become a requirement (e.g. billing events), this ADR should be revisited and
the outbox pattern adopted at that point.

---

## Tests

`src/db/local-db-transaction.ts` is covered by `__tests__/unit/lib/evolution/db-transaction-events.test.ts` (15 tests), which verifies:
- Events are emitted after a successful commit
- Events are NOT emitted when the transaction fails
- Subscriber errors do not propagate to the caller
- The lazy import pattern works correctly in the test environment

---

*See also: ADR-001 (shadow-running strategy), R3 fix in `business-event-bus.ts`.*
