---
inclusion: always
---

# Testing Patterns

These rules apply to every test written in this project. All tests are vibe-coded — Kiro always reads the relevant source file before writing tests, picks the correct pattern below, and produces a complete working test file without asking clarifying questions.

---

## Pre-Test Protocol — Manual Validation Gate

**Before writing any integration (C1/C2) or E2E test for a feature, the feature must be manually validated first.**

This rule exists because writing tests against unvalidated code creates two failure modes that are impossible to distinguish:

1. The test is wrong (bad assertion, wrong mock wiring)
2. The code is wrong (bug in the handler or engine)

When both are possible simultaneously, debugging costs 10× more than it should. The protocol eliminates mode 2 before mode 1 is ever introduced.

### When to apply this rule

Apply to every test that exercises a server function handler, background job, or multi-step workflow — i.e., any test that goes beyond a pure function with deterministic inputs.

| Test type | Manual validation required? |
|---|---|
| Pattern A — pure engine unit test | ❌ No — engines are deterministic, tests are the validation |
| Pattern B — in-memory integration unit test | ⚠️ Recommended for new features, not strictly required |
| Pattern C1 — real DB integration test | ✅ Yes — validate the handler in the running app first |
| Pattern C2 — multi-handler orchestration test | ✅ Yes — validate the entire sequence manually first |
| E2E spec | ✅ Yes — spec must be based on an observed working flow |

### What "manually validated" means

- The feature has been exercised in the running app (not just compiled without errors)
- The happy path produces the expected observable outcome (correct DB rows, correct UI state, correct response)
- Any known edge cases or error paths have been observed at least once
- The developer has confirmed: "this works in the app"

### Protocol when a test is failing and you cannot determine why

If a test fails and the failure is ambiguous — could be a test bug or a code bug — **stop and ask the user to manually validate the scenario before continuing**.

The exact trigger: if a test has been attempted twice and is still failing with an assertion error (not a configuration error), say:

> "I've tried this twice and can't determine if the failure is in the test or in the code. Can you manually validate [specific scenario] in the running app first? Once we've confirmed the behavior is correct, I can fix the test with confidence."

Do not attempt a third fix without that confirmation.

### What this prevents

- Writing 20 assertions against code that has a silent bug — all 20 are wrong but look plausible
- Spending hours debugging mock wiring when the real issue is an unvalidated edge case in the handler
- Shipping tests that pass because the mock was wired to return what the test expected, not what the code actually does

---

## Bug Regression Protocol

When a bug is reported or discovered, follow this exact order. **Never fix the code before writing the test.**

### Step 1 — Reproduce it in a test first

Write the minimal test that demonstrates the bug. The test must **fail** before any code change.
Pick the lowest layer that can reproduce it:

```
Can the bug be reproduced by calling a pure function with specific inputs?
└── Yes → Pattern A test (fastest to write and run)

Does it require a server function handler or DB state?
└── Yes → Pattern B or C1/C2 (whichever is simplest to reproduce)

Does it only manifest in the browser (navigation, session, UI interaction)?
└── Yes → E2E spec
```

### Step 2 — Confirm the test fails for the right reason

Run the test. Read the assertion error carefully.

- If the error matches the bug description → proceed to Step 3
- If the error is something else → the test is not reproducing the bug correctly; fix the test first

### Step 3 — Fix the code

Make the minimum code change that fixes the bug. Do not refactor unrelated code at the same time.

### Step 4 — Confirm the test passes

Run the test again. It must pass now. If it does not, the fix is incomplete.

### Step 5 — Run the full suite

```bash
pnpm test
```

Confirm no regressions were introduced by the fix.

### Step 6 — Document in the test

Add a comment to the test referencing the bug so future developers understand why this specific
case is tested:

```ts
it('does not double-deduct credits on concurrent checkout (bug: R2 race condition)', () => {
  // Regression test for the concurrent deduction issue documented in credit-engine.ts R2.
  // Two concurrent deduct() calls against the same snapshot both passed the balance check
  // before either committed, allowing balance to go temporarily negative.
  ...
})
```

### What this prevents

- Fixing a bug without a test → it silently reappears in a future refactor
- Writing a test after the fix → the test may never have actually been red (false confidence)
- Over-fixing → changing too much code at once hides which change actually resolved the bug

### Example

Bug reported: "POS checkout deducted 2 credits instead of 1."

```
1. Write test: CreditEngine.deduct(snapshot(5), 'tx-001', 10) → expect entry.amount === -1
   → Test FAILS: entry.amount === -2  ✅ reproduces the bug
2. Fix CreditEngine.deduct: change COST_PER_TX from 2 to 1
3. Run test → PASSES ✅
4. Run pnpm test → no regressions ✅
5. Add comment: // Regression: COST_PER_TX was accidentally set to 2 in commit abc123
```

---

## Step 1 — Pick a pattern

```
Is the thing under test a pure function or engine with no IO?
└── Yes → Pattern A

Does it wire collections / dbTransaction / prisma together but IO can be mocked?
└── Yes → Pattern B

Does it need real FK constraints, indexes, or atomic commit verified in Postgres?
└── No external service → Pattern C1
└── External service involved (Stripe, webhooks) → Pattern C2
```

---

## Pattern A — Pure unit test

**File location:** `__tests__/unit/lib/<area>/<name>.test.ts`  
**Run with:** `pnpm test`  
**Trigger:** Target is a pure engine, value object, or utility — no Prisma, no collections, no HTTP.

### Full boilerplate

```ts
/**
 * <name>.test.ts
 *
 * Coverage:
 *  - <list what this covers>
 */

import { describe, expect, it } from 'vitest'
import { MyEngine } from '@/lib/<area>/my-engine'

describe('MyEngine.<method>', () => {
  it('<description>', () => {
    const result = MyEngine.doThing({ input: 42 })
    expect(result.ok).toBe(true)
  })
})
```

**Rules:**
- No `vi.mock` — pure functions need no mocks.
- `OperationResult` failures use `result.code` and `result.reason` (not `result.error.code`).
- Time-dependent functions receive `now: Date` as an explicit parameter — pass a fixed `new Date('2026-06-15T12:00:00Z')`.

**Examples:** `subscription-engine.test.ts`, `credit-engine.test.ts`, `tax-engine.test.ts`, `costing-engine.test.ts`, `invoice-engine.test.ts`

---

## Pattern B — In-memory integration test

**File location:** `__tests__/unit/lib/queries/<name>.test.ts`  
**Run with:** `pnpm test`  
**Trigger:** Target is a query/server function that orchestrates engines + collections/prisma. DB is replaced by in-memory mocks so tests always run without infrastructure.

### Full boilerplate

```ts
/**
 * <name>.test.ts
 *
 * Coverage:
 *  - <list what this covers>
 */

import { ok, err } from 'neverthrow'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockCollections } from '#tests/helpers/mock-collections'

// ── collections mock ──────────────────────────────────────────────────────
const mocks = createMockCollections()
vi.mock('@/db/collections', () => mocks)

// ── dbTransaction mock ────────────────────────────────────────────────────
vi.mock('@/db/local-db-transaction', () => ({
  dbTransaction: vi.fn(async (cb: () => unknown) => {
    try { return ok(cb()) } catch (e) { return err(e instanceof Error ? e : new Error(String(e))) }
  }),
}))

// ── createServerFn mock (if the target uses it) ───────────────────────────
let capturedHandler: ((opts: { data: unknown; context: unknown }) => unknown) | null = null
vi.mock('@tanstack/react-start', () => ({
  createServerFn: vi.fn(() => ({
    middleware: vi.fn().mockReturnThis(),
    inputValidator: vi.fn().mockReturnThis(),
    handler: vi.fn((fn: (opts: { data: unknown; context: unknown }) => unknown) => {
      capturedHandler = fn
      return fn
    }),
  })),
}))
vi.mock('@/lib/better-auth/auth-middleware', () => ({ authMiddleware: {} }))

// ── prisma mock (if the target imports rootPrisma) ────────────────────────
const mockTx = {
  myModel: { create: vi.fn(), update: vi.fn() },
}
const mockPrisma = {
  myModel: { findFirst: vi.fn(), findUnique: vi.fn() },
  $transaction: vi.fn(async (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx)),
}
vi.mock('@/lib/prisma-client', () => ({ prisma: mockPrisma }))

// ── import target AFTER mocks ─────────────────────────────────────────────
await import('@/lib/queries/my-query')

beforeEach(() => {
  vi.clearAllMocks()
  // seed mock return values here
})

afterEach(() => {
  vi.clearAllMocks()
  Object.values(mocks).forEach(col => col._clear())
})

describe('myQuery — happy path', () => {
  it('does the thing', async () => {
    // arrange — seed collections or mock return values
    // act    — call capturedHandler or the exported function directly
    // assert
  })
})
```

**Rules:**
- `vi.mock` calls go before all imports. Import the target module with `await import(...)` after all mocks.
- `mockPrisma` stubs only the models the target actually calls — don't stub everything.
- `vi.clearAllMocks()` in both `beforeEach` and `afterEach`. Also call `col._clear()` on any collections seeded in the test.
- Never import `prisma` from `@/lib/prisma-client` in the test body — use `mockPrisma` directly.

**Examples:** `create-pos-transaction.test.ts`, `create-pos-order.test.ts`, `restock-ingredient.test.ts`, `complete-registration.test.ts`

---

## Pattern C1 — Real Postgres integration test

**File location:** `__tests__/integration/<feature>/<name>.integration.test.ts`  
**Run with:** `pnpm test:integration`  
**Trigger:** Need to verify real FK constraints, unique indexes, `$transaction` atomicity, or rollback correctness.

### Full boilerplate

```ts
/**
 * <name>.integration.test.ts — TYPE 1 (real DB)
 *
 * Coverage:
 *  - <list what this covers>
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getTestPrisma,
  withRollback,
  dbDescribe,
  seedTenant,
  seedProduct,       // include only if needed
} from '#tests/integration/helpers'

// ── createServerFn mock ───────────────────────────────────────────────────
let capturedHandler: ((opts: { data: unknown; context: unknown }) => unknown) | null = null
vi.mock('@tanstack/react-start', () => ({
  createServerFn: vi.fn(() => ({
    middleware: vi.fn().mockReturnThis(),
    inputValidator: vi.fn().mockReturnThis(),
    handler: vi.fn((fn: (opts: { data: unknown; context: unknown }) => unknown) => {
      capturedHandler = fn
      return fn
    }),
  })),
}))
vi.mock('@/lib/better-auth/auth-middleware', () => ({ authMiddleware: {} }))

// ── replace prisma singleton with test DB client ──────────────────────────
vi.mock('@/lib/prisma-client', async () => {
  if (process.env['INTEGRATION_DB_UNAVAILABLE']) return { prisma: {} }
  const { PrismaClient } = await import('prisma/generated/prisma/client')
  const { PrismaPg } = await import('@prisma/adapter-pg')
  const pg = await import('pg')
  const pool = new pg.Pool({ connectionString: process.env['TEST_DATABASE_URL'] ?? '', max: 3 })
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as never)
  return { prisma }
})

await import('@/lib/queries/my-query')

// ── skip guard — all describes use dbDescribe ─────────────────────────────

dbDescribe('<name> — real DB', () => {
  it('<description>', () => withRollback(async () => {
    const prisma = (await getTestPrisma())!
    const tenant = await seedTenant(prisma)

    // call capturedHandler or the query directly
    // assert by querying prisma directly, e.g.:
    // const row = await prisma.myModel.findFirst({ where: { businessId: tenant.businessId } })
    // expect(row).not.toBeNull()
  }))
})
```

**Rules:**
- Every `it()` body is `withRollback(async () => { ... })` — never skip this.
- All `describe()` blocks use `dbDescribe` — never plain `describe()` in C1 files.
- Seed data via `seedTenant`, `seedProduct`, etc. — do not hardcode IDs.
- Assert by querying `prisma` directly after calling the handler — don't trust the return value alone.
- Do not `cleanTables` inside `withRollback` — the rollback handles it.

**Examples:** `complete-registration.integration.test.ts`

---

## Pattern C2 — Multi-handler orchestration test

**File location:** `__tests__/integration/<feature>/<name>.integration.test.ts`  
**Run with:** `pnpm test:integration`  
**Trigger:** Multiple server function handlers called in sequence; external service (Stripe, webhooks) must be mocked at the boundary; real engines run unchanged.

### Full boilerplate

```ts
/**
 * <name>.integration.test.ts — TYPE 2 (mocked DB boundary)
 *
 * Coverage:
 *  - <list what this covers>
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ── createServerFn mock ───────────────────────────────────────────────────
vi.mock('@tanstack/react-start', () => ({
  createServerFn: vi.fn(() => ({
    middleware: vi.fn().mockReturnThis(),
    inputValidator: vi.fn().mockReturnThis(),
    handler: vi.fn((fn: (opts: unknown) => unknown) => fn),
  })),
}))
vi.mock('@/lib/better-auth/auth-middleware', () => ({ authMiddleware: {} }))

// ── prisma mock — stubs only, NO implementations in factory ──────────────
// Implementations are set in beforeEach via mockImplementation so they
// always close over the current `store` object. Never put store access
// inside the vi.mock factory — it runs at hoist time before store exists.
vi.mock('@/lib/prisma-client', () => ({
  prisma: {
    myModel: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    otherModel: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))

// ── external service mock (stable singleton) ──────────────────────────────
vi.mock('@/lib/my-adapter', () => {
  const adapter = {
    doThing: vi.fn(),
    undoThing: vi.fn(),
  }
  return { createMyAdapter: vi.fn(() => adapter) }
})

// ── imports AFTER mocks ───────────────────────────────────────────────────
const { myHandler } = await import('@/lib/queries/my-handler')
const { otherHandler } = await import('@/lib/queries/other-handler')
const { prisma: mockPrisma } = await import('@/lib/prisma-client')
const { createMyAdapter } = await import('@/lib/my-adapter')
const adapter = vi.mocked(createMyAdapter)()

// ── in-memory store ───────────────────────────────────────────────────────
// Carries state between handler calls, mimicking what Postgres holds.
type StoreRow = { id: string; status: string; [key: string]: unknown }
let store: Map<string, StoreRow>

// ── wire prisma implementations in beforeEach ─────────────────────────────
// getStore() indirection ensures closures always read the current store.
function getStore() { return store }

function wireMocks() {
  const p = vi.mocked(mockPrisma)

  p.myModel.findUnique.mockImplementation((args: { where: { id: string } }) =>
    Promise.resolve(getStore().get(args.where.id) ?? null) as never,
  )
  p.myModel.update.mockImplementation((args: { where: { id: string }; data: Partial<StoreRow> }) => {
    const row = getStore().get(args.where.id)
    if (!row) throw new Error(`not found: ${args.where.id}`)
    Object.assign(row, args.data)
    return Promise.resolve(row) as never
  })
  p.myModel.create.mockImplementation((args: { data: StoreRow }) => {
    getStore().set(args.data.id, args.data)
    return Promise.resolve(args.data) as never
  })
  p.$transaction.mockImplementation(async (ops: unknown[] | ((tx: unknown) => Promise<unknown>)) =>
    Array.isArray(ops) ? Promise.all(ops) : ops(p),
  )

  adapter.doThing.mockResolvedValue({ result: 'ok' } as never)
  adapter.undoThing.mockResolvedValue({ result: 'ok' } as never)
}

beforeEach(() => {
  store = new Map()
  wireMocks()
  // Reset call counts only — do NOT call vi.clearAllMocks() which wipes implementations
  adapter.doThing.mockClear()
  adapter.undoThing.mockClear()
})

afterEach(() => {
  delete process.env['MY_FEATURE_ENV_VAR'] // clean up any env vars set in beforeEach
})

// ── helpers ───────────────────────────────────────────────────────────────
function ctx(overrides: Record<string, unknown> = {}) {
  return { user: { businessId: 'biz-001', id: 'user-001', ...overrides } }
}

async function call(fn: unknown, data: unknown, context: unknown) {
  return (fn as (o: { data: unknown; context: unknown }) => Promise<Record<string, unknown>>)(
    { data, context },
  )
}

// ── tests ─────────────────────────────────────────────────────────────────

describe('<feature> — journey', () => {
  it('<description>', async () => {
    // arrange — seed store
    store.set('row-001', { id: 'row-001', status: 'INITIAL' })

    // act — call first handler
    const r1 = await call(myHandler, { input: 'value' }, ctx())
    expect(r1.success).toBe(true)
    expect(store.get('row-001')!.status).toBe('UPDATED')

    // act — call second handler in sequence
    const r2 = await call(otherHandler, { id: 'row-001' }, ctx())
    expect(r2.success).toBe(true)
  })
})
```

**Critical rules for C2:**
- `vi.mock` factory contains **only `vi.fn()` stubs** — no store access, no logic.
- External service mocks use a **stable singleton** (`vi.fn(() => adapter)` returns the same object every call).
- All implementations are set in `wireMocks()` called from `beforeEach`, never in the factory.
- Use `getStore()` indirection inside `wireMocks` implementations — direct `store` closure is unreliable when `store` is reassigned.
- Call `mockClear()` (not `clearAllMocks()`) in `beforeEach` to reset call counts without wiping implementations.
- Set any required environment variables (e.g. `STRIPE_PLAN_*_PRICE_ID`) in `beforeEach` and delete them in `afterEach`.

**Examples:** `billing-journey.integration.test.ts`

---

## Available fixtures (`#tests/integration/helpers`)

```ts
import {
  getTestPrisma,   // PrismaClient → start-pos-test DB (null when DB unavailable)
  withRollback,    // SAVEPOINT per test — use inside every C1 it() body
  cleanTables,     // TRUNCATE named tables — use only when withRollback can't be used
  dbDescribe,      // describe.runIf(!INTEGRATION_DB_UNAVAILABLE) — use in all C1 files
  seedTenant,      // User + Business + Branch + Membership + Subscription (TRIAL) + 50 credits
  seedProduct,     // Category + Unit + Product + Variant + Inventory batch
  seedUnit,        // Standalone Unit row
  seedSupplier,    // Supplier row (for purchase workflow tests)
} from '#tests/integration/helpers'
```

---

## Environment for C1

`.env.local`:
```
TEST_POSTGRES_DB=start-pos-test
```
Inherits `POSTGRES_HOST`, `POSTGRES_HOST_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD` from the normal app config.  
CI: `CI=true` auto-skips Type 1 without prompting.  
Scripts: `SKIP_DB_PROMPT=true` forces auto-skip.
