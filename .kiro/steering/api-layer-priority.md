# API Layer Priority Rule

**⚠️ IMPORTANT**: This project follows an **offline-first architecture**. See `development-context.md` for offline requirements and current development priorities.

This project has three data access layers. Always use them in this priority order. Only drop to the next layer when there is a concrete reason the higher-priority layer cannot satisfy the requirement.

---

## Priority 1 — Local-first collection API (default for all tenant data mutations and reads)

Use `dbTransaction` from `@/db/local-db-transaction` for all writes, and `useLiveQuery` from `@tanstack/react-db` for reactive reads that drive UI.

**Mutations (insert / update / delete):**
```ts
import { dbTransaction } from '@/db/local-db-transaction'
import { productCollection, inventoryCollection } from '@/db/collections'

const result = await dbTransaction(() => {
  productCollection.insert({ id: crypto.randomUUID(), ...data })
  inventoryCollection.update(id, draft => { draft.quantity += qty })
})
```

**Reactive reads:**
```ts
import { useLiveQuery, eq } from '@tanstack/react-db'
import { purchaseCollection, supplierCollection } from '@/db/collections'

const { data } = useLiveQuery(q =>
  q.from({ purchase: purchaseCollection })
   .leftJoin({ supplier: supplierCollection }, ({ purchase, supplier }) => eq(purchase.supplierId, supplier.id))
   .select(({ purchase, supplier }) => ({ ...purchase, supplier }))
)
```

`dbTransaction` automatically syncs to the server via `transactionAPI` and handles offline mode — you do not need to call either directly.

---

## Priority 2 — crudAPI (for server-side reads that need relations, pagination, or date filters)

Use `crudAPI` from `@/lib/prisma-client/crud-api` when you need a paginated or filtered server-authoritative query that the local collections cannot satisfy directly (e.g. cross-table full-text search, server-side pagination for history pages, reports that need deep `include` joins).

`crudAPI` is a typed Prisma proxy — it accepts any Prisma `args` including `where`, `include`, `orderBy`, `skip`, and `take`. It always uses `getTenantPrisma`, so tenant isolation is automatic.

```ts
import { crudAPI } from '@/lib/prisma-client/crud-api'

const [rowsResult, countResult] = await Promise.all([
  crudAPI.transaction('findMany', {
    where: { createdAt: { gte: from, lte: to } },
    include: { cashier: true, payments: true },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * pageSize,
    take: pageSize,
  }),
  crudAPI.transaction('count', { where }),
])

if (rowsResult.isErr()) throw new Error(rowsResult.error)
```

Write the enclosing function as a plain `async` function — do **not** wrap it in `createServerFn`. The `crudAPI` proxy already contains its own server function internally.

```ts
// correct
export const fetchTransactionHistory = async (input: Input) => { ... }

// wrong — unnecessary double server-fn wrapping
export const fetchTransactionHistory = createServerFn().handler(async () => {
  crudAPI.transaction('findMany', ...)
})
```

---

## Priority 3 — transactionAPI (used internally by dbTransaction — rarely called directly)

`transactionAPI.execute(operations)` runs a batch of `DBPayload` operations inside a single `Prisma.$transaction`. It is the server-side transport for `dbTransaction`. Only call it directly if you are building a new low-level transaction primitive that cannot use the collection API.

---

## Priority 4 — Individual createServerFn with getTenantPrisma (narrow exceptions only)

Write a raw `createServerFn` with `getTenantPrisma` only when **all** of the following are true:

1. The operation is **not a mutation** (mutations belong in `dbTransaction`).
2. The data is **tenant-scoped** (if it uses `rootPrisma` instead of `getTenantPrisma`, that is a separate case — see below).
3. The query has a **specific process** that must run exclusively on the server AND cannot be expressed as a `crudAPI` call — for example, server-side CSV generation with `PapaParse`, or a workflow permission check that reads authoritative server state before allowing a mutation.

Current legitimate examples:
- `download-inventory.ts` — reads inventory with deep `include`, runs `PapaParse.unparse` server-side, returns a CSV string. The CSV transformation is the reason it cannot be `crudAPI`.
- `download-tranasctions.ts` — same: CSV generation with `PapaParse` must run on the server.
- `validate-task-transition.ts` — reads authoritative task state from the server to enforce workflow permissions before the client proceeds; a security boundary, not a data fetch.

---

## Platform-level data — coreAPI and coreTransactionAPI

Tables with no `businessId`/`branchId` fields are platform-scoped. Use `coreAPI` and `coreTransactionAPI` from `@/lib/prisma-client/core-api` and `@/lib/prisma-client/core-transaction-api` for these — never `crudAPI`, `transactionAPI`, or a raw `createServerFn` with `rootPrisma`.

**Auth contract:**
- **Reads** (`findMany`, `findFirst`, `findUnique`, `count`, `groupBy`) → **no auth required** — safe for public pricing pages, feature listings, unauthenticated surfaces.
- **Mutations** (`create`, `update`, `upsert`, `delete`, etc.) → **ADMIN role required** — enforced server-side.
- `coreTransactionAPI` is always mutation-only → always requires ADMIN.

**Allowed models** (PLATFORM_MODELS whitelist — enforced at runtime):
`subscriptionPlan`, `planEntitlement`, `feature`, `featureBundle`, `featureBundleItem`, `featureBundleVersion`, `featurePrice`, `featureDependency`, `pricingCatalog`, `pricingQuote`, `pricingQuoteItem`, `hint`, `hintLog`, `billingInvoiceItem`, `subscriptionStatusHistory`, `businessSubscriptionFeature`

**Read example (public, no auth):**
```ts
import { coreAPI } from '@/lib/prisma-client/core-api'

export const fetchPlans = async () => {
  const result = await coreAPI.subscriptionPlan('findMany', {
    where: { isActive: true, NOT: { name: 'Trial' } },
    include: { entitlements: true },
    orderBy: { sortOrder: 'asc' },
  })
  if (result.isErr()) throw new Error(result.error)
  return result.value
}
```

Write the enclosing function as a plain `async` function — `coreAPI` has its own server function internally, same as `crudAPI`. Do **not** wrap in `createServerFn`.

**Atomic mutation example (ADMIN only):**
```ts
import { coreTransactionAPI } from '@/lib/prisma-client/core-transaction-api'

const result = await coreTransactionAPI.execute([
  { table: 'subscriptionPlan', action: 'update', args: { where: { id }, data: { monthlyPrice: 999 } } },
  { table: 'planEntitlement', action: 'updateMany', args: { where: { planId: id }, data: { usageLimit: 500 } } },
])
if (result.isErr()) throw new Error(result.error)
```

**Note on billing data (`CreditLedger`, `BillingInvoice`, `UsageCounter`):** These have a `businessId` field backed by a `business` relation, so `getTenantPrisma` automatically scopes them by `businessId` — the same as any other tenant model. Use `crudAPI` for reads and `dbTransaction` for mutations, exactly like other tenant data. They are excluded from `PLATFORM_MODELS` because they are per-business data, not platform-wide.

---

## Decision flowchart

```
Is the data platform-level (no businessId/branchId field)?
│
├── Yes (subscriptionPlan, feature, hint, pricingCatalog, etc.)
│   ├── Read? → coreAPI (plain async fn, no auth needed)
│   └── Write?
│       ├── Single op → coreAPI (ADMIN auth enforced server-side)
│       └── Atomic batch → coreTransactionAPI (ADMIN auth enforced)
│
└── No — tenant data (has businessId or branchId, including CreditLedger/BillingInvoice/UsageCounter)
    ├── Writing (insert / update / delete)?
    │   └── → dbTransaction + collection
    │
    └── Reading?
        ├── Drives reactive UI / works offline?
        │   └── → useLiveQuery on collection
        │
        ├── Server-authoritative, paginated, or needs deep joins?
        │   └── → crudAPI (plain async fn, no createServerFn wrapper)
        │
        └── Needs server-side processing (CSV, security guard, 3rd-party)?
            └── → createServerFn + getTenantPrisma
```

---

## Red flags — things that indicate a violation

- A `createServerFn` that imports `rootPrisma` and queries `subscriptionPlan`, `feature`, `hint`, or other platform models → replace with `coreAPI`.
- A `createServerFn` that imports `getTenantPrisma` and calls `prisma.[model].findMany` or `prisma.[model].create` without any server-side processing → replace with `crudAPI` or `dbTransaction`.
- A `// @ts-nocheck` at the top of a server-fn file — this often means the types were fighting the wrong abstraction.
- A `createServerFn` that only returns raw Prisma rows with no transformation → almost always should be `crudAPI` or `coreAPI`.
- Calling `transactionAPI.execute()` directly from a route component → wrap in `dbTransaction` instead.
- Calling `coreAPI` or `coreTransactionAPI` for a model that has `businessId`/`branchId` → use `crudAPI`/`transactionAPI` instead.
