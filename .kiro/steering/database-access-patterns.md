---
inclusion: auto
---

# Database Access Patterns - Mandatory Rules

**CRITICAL**: Never use `prisma` directly from `@/lib/prisma-client`. Always use the appropriate API layer that provides multi-tenancy and soft-delete middleware.

---

## Core Principle

Direct Prisma client usage bypasses critical middleware:
- ❌ **Multi-tenant isolation** - Queries may leak data across businesses
- ❌ **Soft delete** - Deleted records may be returned
- ❌ **Audit trails** - Mutations may not be logged
- ❌ **Authorization** - Permission checks may be bypassed

---

## API Layer Decision Tree

### Is the data **platform-level** (no `businessId`/`branchId` field)?

Platform models: `Permission`, `UserPermission`, `RoleDefaultPermission`, `SubscriptionPlan`, `PlanEntitlement`, `Feature`, `Hint`, `PricingCatalog`, etc.

**✅ Use `coreAPI` for reads:**
```ts
import { coreAPI } from '@/lib/prisma-client/core-api'

// Read (no auth required - safe for public pages)
const result = await coreAPI.permission('findMany', {
  where: { scope: 'BUSINESS' },
  orderBy: { category: 'asc' },
})
```

**✅ Use `coreTransactionAPI` for mutations:**
```ts
import { coreTransactionAPI } from '@/lib/prisma-client/core-transaction-api'

// Mutation (ADMIN role required - enforced automatically)
const result = await coreTransactionAPI.execute([
  {
    table: 'permission',
    action: 'create',
    args: { data: { key: 'business:view:billing', name: 'View Billing' } },
  },
  {
    table: 'roleDefaultPermission',
    action: 'create',
    args: { data: { role: 'ADMIN', permissionId: 'perm_123' } },
  },
])
```

**✅ Use `coreAPI` for single mutations:**
```ts
import { coreAPI } from '@/lib/prisma-client/core-api'

// Single mutation (ADMIN role required)
const result = await coreAPI.userPermission('create', {
  data: {
    userId: 'user123',
    permissionId: 'perm456',
    granted: true,
    grantedBy: 'admin789',
  },
})
```

---

### Is the data **tenant-level** (has `businessId` or `branchId` field)?

Tenant models: `Product`, `Inventory`, `Order`, `Transaction`, `Employee`, `Customer`, `Supplier`, `CreditLedger`, `BillingInvoice`, `UsageCounter`, etc.

**✅ Use `dbTransaction` for mutations:**
```ts
import { dbTransaction } from '@/db/local-db-transaction'
import { productCollection } from '@/db/collections'

const result = await dbTransaction(() => {
  productCollection.insert({ id: crypto.randomUUID(), ...data })
})
```

**✅ Use `useLiveQuery` for reactive UI reads:**
```ts
import { useLiveQuery } from '@tanstack/react-db'
import { productCollection } from '@/db/collections'

const { data } = useLiveQuery(q =>
  q.from({ product: productCollection })
   .where(({ product }) => product.isAvailable)
   .select(({ product }) => product)
)
```

**✅ Use `crudAPI` for server-side reads with complex queries:**
```ts
import { crudAPI } from '@/lib/prisma-client/crud-api'

const result = await crudAPI.transaction('findMany', {
  where: { createdAt: { gte: startDate, lte: endDate } },
  include: { cashier: true, payments: true },
  orderBy: { createdAt: 'desc' },
  skip: (page - 1) * pageSize,
  take: pageSize,
})
```

---

## Common Violations and Fixes

### ❌ WRONG - Direct Prisma Usage
```ts
import { prisma } from '@/lib/prisma-client'

// WRONG - bypasses middleware
const permissions = await prisma.permission.findMany()
const user = await prisma.user.findUnique({ where: { id } })
await prisma.userPermission.create({ data })
```

### ✅ CORRECT - Use Appropriate API

**For platform data (Permission, UserPermission):**
```ts
import { coreAPI } from '@/lib/prisma-client/core-api'

// Reads
const result = await coreAPI.permission('findMany', {})
const userResult = await coreAPI.userPermission('findUnique', {
  where: { userId_permissionId: { userId, permissionId } },
})

// Mutations
const createResult = await coreAPI.userPermission('create', { data })
```

**For tenant data (User, Product, Order):**
```ts
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { dbTransaction } from '@/db/local-db-transaction'

// Reads
const result = await crudAPI.user('findUnique', { where: { id } })

// Mutations
await dbTransaction(() => {
  userCollection.update(id, draft => { draft.name = newName })
})
```

---

## Authorization Engine Pattern

The `AuthorizationEngine` works with platform-level data, so it must use `coreAPI`:

```ts
// ❌ WRONG
import { prisma } from '@/lib/prisma-client'

async buildSummary(ctx) {
  const permissions = await prisma.userPermission.findMany({ ... })
}

// ✅ CORRECT
import { coreAPI } from '@/lib/prisma-client/core-api'

async buildSummary(ctx) {
  const result = await coreAPI.userPermission('findMany', {
    where: { userId: ctx.userId },
    include: { permission: true },
  })
  if (result.isErr()) throw new Error(result.error)
  const permissions = result.value
}
```

---

## Enclosing Functions

When using `coreAPI` or `crudAPI`, write the enclosing function as a **plain async function**. Do NOT wrap in `createServerFn` - these APIs have their own server functions internally.

```ts
// ✅ CORRECT
export const fetchPermissions = async () => {
  const result = await coreAPI.permission('findMany', {})
  if (result.isErr()) throw new Error(result.error)
  return result.value
}

// ❌ WRONG - unnecessary double wrapping
export const fetchPermissions = createServerFn().handler(async () => {
  const result = await coreAPI.permission('findMany', {})
  return result.value
})
```

---

## Red Flags to Watch For

🚨 **Direct imports of `prisma`**:
```ts
import { prisma } from '@/lib/prisma-client'  // ❌ WRONG
```

🚨 **Direct Prisma method calls**:
```ts
await prisma.permission.findMany()     // ❌ WRONG
await prisma.userPermission.create()   // ❌ WRONG
```

🚨 **Using `getTenantPrisma` for platform data**:
```ts
const prisma = await getTenantPrisma()
await prisma.permission.findMany()     // ❌ WRONG - use coreAPI
```

🚨 **Using `rootPrisma` for platform mutations**:
```ts
await rootPrisma.permission.create()   // ❌ WRONG - use coreAPI
```

---

## Summary Checklist

Before committing code that accesses the database:

- [ ] Am I using direct `prisma` imports? → Replace with appropriate API
- [ ] Is this platform data? → Use `coreAPI` or `coreTransactionAPI`
- [ ] Is this tenant data? → Use `dbTransaction`, `useLiveQuery`, or `crudAPI`
- [ ] Am I wrapping `coreAPI`/`crudAPI` in `createServerFn`? → Remove the wrapper
- [ ] Do my operations need to be atomic? → Use transaction APIs
- [ ] Am I handling `Result<T, Error>` return values? → Check `.isErr()` and throw

---

## Reference

See `api-layer-priority.md` for the complete decision flowchart and detailed examples.
