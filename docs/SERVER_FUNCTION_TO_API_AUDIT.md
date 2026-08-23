# Server Function to API Consolidation Audit

**Date**: 2026-08-23  
**Purpose**: Audit server functions for potential consolidation into CRUD/Transaction APIs and identify direct Prisma usage

---

## Executive Summary

### Current State

**Server Functions**: 41 functions in `src/lib/server-fn/`  
**CRUD API**: Exists with `authMiddleware` only (no permission/entitlement gates)  
**Transaction API**: Exists with `authMiddleware` only (no permission/entitlement gates)  
**Direct Prisma Usage**: Found in 5 routes, 0 in queries (queries use collections)

### Key Findings

🔴 **CRITICAL**: CRUD API and Transaction API lack permission and entitlement gates  
🟡 **WARNING**: Many server functions are simple CRUD that could use CRUD API  
🟡 **WARNING**: Some routes use `rootPrisma` directly, bypassing all middleware  
🟢 **GOOD**: Queries use collections (offline-first), not direct Prisma

---

## Part 1: CRUD/Transaction API Security Audit

### Current Middleware

**CRUD API** (`crud-api.ts`):
```typescript
.middleware([authMiddleware]) // ❌ Only authentication
```

**Transaction API** (`transaction-api.ts`):
```typescript
.middleware([authMiddleware]) // ❌ Only authentication
```

### Security Gaps

| API | Has Auth | Has Permissions | Has Entitlements | Tenant Isolation |
|-----|----------|----------------|------------------|------------------|
| crudAPI | ✅ Yes | ❌ **NO** | ❌ **NO** | ✅ Yes (getTenantPrisma) |
| transactionAPI | ✅ Yes | ❌ **NO** | ❌ **NO** | ✅ Yes (getTenantPrisma) |

### Risk Assessment

**🔴 HIGH RISK**: Anyone authenticated can:
- Call `crudAPI.product('create', ...)` without `BRANCH_CREATE_PRODUCT` permission
- Call `crudAPI.branch('delete', ...)` without `BUSINESS_DELETE_BRANCH` permission
- Call `transactionAPI.execute([...])` to create transactions without checking limits
- Bypass all entitlement checks (branch limits, employee limits, feature access)

**Impact**:
- Users can access data their role shouldn't allow
- No enforcement of subscription limits
- No audit trail of unauthorized attempts

### Recommended Fix

**Option A: Add Model-Level Permission Mapping** (Recommended)

```typescript
// New file: permission-map.ts
export const MODEL_PERMISSIONS = {
  // Business-level models
  branch: {
    create: Permissions.BUSINESS_CREATE_BRANCH,
    update: Permissions.BUSINESS_MANAGE_BRANCHES,
    delete: Permissions.BUSINESS_DELETE_BRANCH,
    findMany: Permissions.BUSINESS_VIEW_BRANCHES,
  },
  
  // Branch-level models
  product: {
    create: Permissions.BRANCH_CREATE_PRODUCT,
    update: Permissions.BRANCH_EDIT_PRODUCT,
    delete: Permissions.BRANCH_DELETE_PRODUCT,
    findMany: Permissions.BRANCH_VIEW_PRODUCTS,
    findFirst: Permissions.BRANCH_VIEW_PRODUCTS,
    findUnique: Permissions.BRANCH_VIEW_PRODUCTS,
  },
  
  employee: {
    create: Permissions.BRANCH_CREATE_EMPLOYEE,
    // ... etc
  },
  
  // Add all models with their required permissions
}

// Update crud-api.ts handler
.handler(async ({ context, data }): Promise<{ value: any } | { error: any }> => {
  // 1. Check permission
  const requiredPermission = MODEL_PERMISSIONS[data.table]?.[data.action]
  
  if (requiredPermission) {
    const hasPermission = context.authorization?.permissions.includes(requiredPermission)
    if (!hasPermission) {
      return { error: `Permission denied: ${requiredPermission} required` }
    }
  }
  
  // 2. Check entitlements (for creates)
  if (data.action === 'create') {
    // Check if feature is available
    // Check if limits not exceeded
  }
  
  // 3. Execute operation
  const tenantPrisma = getTenantPrisma(context.user.businessId, context.user.branchId!)
  const result = await ResultAsync.fromPromise(
    executeOperation(tenantPrisma, data), 
    (e: any) => e.message || 'Database operation failed'
  )
  
  return result.isOk() ? { value: result.value } : { error: result.error }
})
```

**Option B: Deprecate Generic APIs, Keep Specific Server Functions**

- Keep CRUD/Transaction APIs for internal use only
- All client-facing operations go through specific server functions with proper gates
- Safer but more verbose

---

## Part 2: Server Functions That Could Use CRUD API

### Analysis Criteria

✅ **Can use CRUD API if**:
- Simple CRUD operation (create, update, delete, query)
- No complex business logic
- No multi-step transactions

❌ **Cannot use CRUD API if**:
- Complex validation
- Multi-model transactions
- External API calls (Stripe, etc.)
- Complex calculations
- Event emissions

### Audit Results

| Function | Can Use CRUD? | Reason | Priority |
|----------|---------------|--------|----------|
| **create-branch.ts** | ❌ No | Complex entitlement checks, sequential code generation | - |
| **create-employee.ts** | ❌ No | Multi-model transaction (User + Membership), limit checks | - |
| **update-branch.ts** | ⚠️ Maybe | Simple update but has ownership validation | Low |
| **update-branch-config.ts** | ⚠️ Maybe | Simple update but has ownership validation | Low |
| **update-offline-terminal.ts** | ⚠️ Maybe | Simple update but has ownership validation | Low |
| **fetch-branch-users.ts** | ✅ Yes | Simple query with joins | Medium |
| **fetch-business-profile.ts** | ✅ Yes | Simple query | Medium |
| **fetch-capability-states.ts** | ❌ No | Complex capability resolution logic | - |
| **fetch-dashboard-hints.ts** | ✅ Yes | Simple query with filters | Low |
| **fetch-eligible-hint.ts** | ✅ Yes | Simple query with filters | Low |
| **fetch-feature-flags.ts** | ✅ Yes | Simple query | Low |
| **fetch-credit-ledger.ts** | ✅ Yes | Simple query with ordering | Low |
| **fetch-invoices.ts** | ✅ Yes | Simple query | Low |
| **fetch-login-history.ts** | ✅ Yes | Simple query | Low |
| **fetch-order-history.ts** | ✅ Yes | Simple query | Low |
| **fetch-transaction-history.ts** | ✅ Yes | Simple query | Low |
| **fetch-plans.ts** | ✅ Yes | Simple query (public data) | Low |
| **download-inventory.ts** | ❌ No | CSV generation, complex joins | - |
| **download-transactions.ts** | ❌ No | CSV generation | - |
| **create-billing-portal-session.ts** | ❌ No | External Stripe API call | - |
| **cancel-subscription.ts** | ❌ No | External Stripe API call | - |
| **reactivate-subscription.ts** | ❌ No | External Stripe API call | - |
| **grant-credits.ts** | ❌ No | Credit ledger transaction logic | - |
| **purchase-credit-package.ts** | ❌ No | External Stripe API call | - |
| **purchase-tx-addon.ts** | ❌ No | External Stripe API call | - |
| **purchase-addon-subscription.ts** | ❌ No | External Stripe API call | - |
| **write-audit.ts** | ⚠️ Maybe | Simple create but audit logs are special | Low |

**Summary**:
- **Simple fetches that could use CRUD**: 11 functions
- **Updates that could use CRUD**: 3 functions (with caveats)
- **Must remain server functions**: 27 functions

**Consolidation Potential**: Low-Medium (~25% of functions)

### Recommendation

**DO NOT consolidate** for these reasons:

1. **Most functions have business logic** - Not simple CRUD
2. **CRUD API lacks security gates** - Would need major refactoring
3. **Maintainability** - Specific server functions are clearer than generic API calls
4. **Type safety** - Server functions have better TypeScript inference

**Better approach**: Keep server functions, they're already well-structured with:
- Clear input validation (Zod schemas)
- Proper permission gates
- Proper entitlement checks
- Good error messages

---

## Part 3: Direct Prisma Usage Audit

### Routes Using Direct Prisma

| File | Prisma Import | Why | Issue | Fix |
|------|---------------|-----|-------|-----|
| **billing/quotes/$quoteId/index.tsx** | `rootPrisma` | Loader for quote data | ⚠️ No permission check in loader | Add `beforeLoad` permission check or move to server function |
| **billing/quotes/index.tsx** | `rootPrisma` | Loader for quotes list | ⚠️ No permission check in loader | Add `beforeLoad` permission check or move to server function |
| **api/billing/webhook/index.ts** | `rootPrisma` | Stripe webhook handler | ✅ OK - external webhook | None - this is correct |
| **api/cron/daily/index.ts** | `rootPrisma` | Cron job | ✅ OK - internal job | None - this is correct |
| **preparation/-components/prepare-product-sidebar.tsx** | `sequenceAPI` | Get next sequence number | ✅ OK - uses server API | None - this is correct |

**Summary**:
- 2 routes need fixing (quote routes)
- 2 APIs are correctly used (webhook, cron)
- 1 component correctly uses API

### Quote Routes Issue

**Problem**: Route loaders use `rootPrisma` directly without permission checks

```typescript
// ❌ Current - No permission check
export const Route = createFileRoute('/business/billing/quotes/')({
  loader: async () => {
    // Direct prisma usage - no permission check!
    const quotes = await rootPrisma.pricingQuote.findMany({...})
    return { quotes }
  }
})
```

**Fix**: Add permission check in `beforeLoad` or move to server function

```typescript
// ✅ Option 1: Permission check in beforeLoad
export const Route = createFileRoute('/business/billing/quotes/')({
  beforeLoad: async () => {
    const { authorization } = authStore.state
    if (!authorization?.permissions.includes(Permissions.BUSINESS_VIEW_BILLING)) {
      throw redirect({ to: '/dashboard' })
    }
  },
  loader: async ({ context }) => {
    // Now safe to use rootPrisma
    const quotes = await rootPrisma.pricingQuote.findMany({
      where: { businessId: context.user.businessId }
    })
    return { quotes }
  }
})

// ✅ Option 2: Server function (better)
// Create fetch-pricing-quotes.ts server function
export const fetchPricingQuotes = createServerFn()
  .middleware([
    authMiddleware,
    requirePermission(Permissions.BUSINESS_VIEW_BILLING)
  ])
  .handler(async ({ context }) => {
    const quotes = await rootPrisma.pricingQuote.findMany({
      where: { businessId: context.user.businessId }
    })
    return { quotes }
  })

// In route
export const Route = createFileRoute('/business/billing/quotes/')({
  loader: async () => {
    return await fetchPricingQuotes()
  }
})
```

### Queries Folder - No Issues Found ✅

All queries use:
- **Collections** for offline-first data (product, order, transaction, etc.)
- **Server APIs** for sequences (`sequenceAPI`)
- **No direct Prisma usage** ✅

This is correct architecture.

---

## Part 4: Recommendations

### Priority 1: Secure CRUD/Transaction APIs 🔴 CRITICAL

**Action**: Add permission and entitlement gates to CRUD/Transaction APIs

**Options**:
1. **Model-level permission mapping** (recommended)
   - Create `MODEL_PERMISSIONS` map
   - Check permission before each operation
   - Check entitlements for creates

2. **Deprecate for client use**
   - Mark CRUD/Transaction APIs as internal only
   - All client calls go through specific server functions
   - Keep for internal/test usage

**Timeline**: Immediate (security issue)

---

### Priority 2: Fix Quote Route Loaders 🟡 WARNING

**Action**: Move quote data fetching to server functions

**Files to fix**:
- `billing/quotes/$quoteId/index.tsx`
- `billing/quotes/index.tsx`

**Create**:
- `fetch-pricing-quote.ts` server function
- `fetch-pricing-quotes.ts` server function

**Timeline**: Next sprint

---

### Priority 3: Do NOT Consolidate Server Functions ✅ GOOD

**Decision**: Keep current server function architecture

**Reasons**:
1. Most have business logic (not simple CRUD)
2. Better type safety
3. Clearer code (specific vs generic)
4. Already have proper gates

**Action**: None - keep as-is

---

## Part 5: Architecture Patterns

### Current Patterns (Good)

```
┌─────────────────────────────────────────┐
│           Client Components             │
└────────────┬────────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────┐
│      Local Collections (Offline)        │
│  (products, orders, transactions)       │
└────────────┬────────────────────────────┘
             │
             ↓ (sync when online)
┌─────────────────────────────────────────┐
│       Server Functions (Online)         │
│  - Permission gates ✅                  │
│  - Entitlement checks ✅                │
│  - Business logic ✅                    │
│  - Type safe ✅                         │
└─────────────────────────────────────────┘
```

### Anti-Pattern to Avoid

```
┌─────────────────────────────────────────┐
│           Client Components             │
└────────────┬────────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────┐
│         CRUD API (Generic)              │
│  - ❌ No permission mapping             │
│  - ❌ No entitlement checks             │
│  - ❌ Harder to maintain                │
│  - ❌ Less type safe                    │
└─────────────────────────────────────────┘
```

---

## Conclusion

### Summary of Findings

1. **CRUD/Transaction APIs lack security gates** 🔴
   - No permission checks
   - No entitlement checks
   - High risk for unauthorized access

2. **Most server functions should NOT be consolidated** ✅
   - They have business logic
   - Better type safety
   - Already secure

3. **2 quote routes need fixing** 🟡
   - Direct Prisma usage without permission checks
   - Should use server functions

4. **Queries are well-architected** ✅
   - Use collections (offline-first)
   - No direct Prisma usage

### Action Items

**Immediate (This Sprint)**:
- [ ] Add permission gates to CRUD API
- [ ] Add entitlement gates to CRUD API
- [ ] Add permission gates to Transaction API

**Next Sprint**:
- [ ] Create `fetch-pricing-quote.ts` server function
- [ ] Create `fetch-pricing-quotes.ts` server function
- [ ] Update quote routes to use server functions

**Not Needed**:
- ❌ Do NOT consolidate server functions into CRUD API
- ❌ Do NOT refactor queries (they're good as-is)

---

## Appendix: CRUD API Permission Map Example

```typescript
// lib/authorization/model-permissions.ts

import { Permissions } from './permission-keys'

export const MODEL_PERMISSIONS = {
  // Business-level models (rootPrisma)
  branch: {
    findMany: Permissions.BUSINESS_VIEW_BRANCHES,
    findFirst: Permissions.BUSINESS_VIEW_BRANCHES,
    findUnique: Permissions.BUSINESS_VIEW_BRANCHES,
    create: Permissions.BUSINESS_CREATE_BRANCH,
    update: Permissions.BUSINESS_MANAGE_BRANCHES,
    updateMany: Permissions.BUSINESS_MANAGE_BRANCHES,
    delete: Permissions.BUSINESS_DELETE_BRANCH,
    deleteMany: Permissions.BUSINESS_DELETE_BRANCH,
  },
  
  business: {
    findMany: Permissions.BUSINESS_VIEW_PROFILE,
    findFirst: Permissions.BUSINESS_VIEW_PROFILE,
    findUnique: Permissions.BUSINESS_VIEW_PROFILE,
    update: Permissions.BUSINESS_MANAGE_PROFILE,
  },
  
  // Branch-level models (tenantPrisma)
  product: {
    findMany: Permissions.BRANCH_VIEW_PRODUCTS,
    findFirst: Permissions.BRANCH_VIEW_PRODUCTS,
    findUnique: Permissions.BRANCH_VIEW_PRODUCTS,
    create: Permissions.BRANCH_CREATE_PRODUCT,
    update: Permissions.BRANCH_EDIT_PRODUCT,
    updateMany: Permissions.BRANCH_EDIT_PRODUCT,
    delete: Permissions.BRANCH_DELETE_PRODUCT,
    deleteMany: Permissions.BRANCH_DELETE_PRODUCT,
    count: Permissions.BRANCH_VIEW_PRODUCTS,
  },
  
  employee: {
    findMany: Permissions.BRANCH_VIEW_EMPLOYEES,
    findFirst: Permissions.BRANCH_VIEW_EMPLOYEES,
    findUnique: Permissions.BRANCH_VIEW_EMPLOYEES,
    create: Permissions.BRANCH_CREATE_EMPLOYEE,
    update: Permissions.BRANCH_EDIT_EMPLOYEE,
    updateMany: Permissions.BRANCH_EDIT_EMPLOYEE,
    delete: Permissions.BRANCH_DELETE_EMPLOYEE,
    deleteMany: Permissions.BRANCH_DELETE_EMPLOYEE,
  },
  
  order: {
    findMany: Permissions.BRANCH_VIEW_ORDERS,
    findFirst: Permissions.BRANCH_VIEW_ORDERS,
    findUnique: Permissions.BRANCH_VIEW_ORDERS,
    create: Permissions.BRANCH_CREATE_ORDER,
    update: Permissions.BRANCH_EDIT_ORDER,
    delete: Permissions.BRANCH_CANCEL_ORDER,
    count: Permissions.BRANCH_VIEW_ORDERS,
  },
  
  transaction: {
    findMany: Permissions.BRANCH_VIEW_TRANSACTIONS,
    findFirst: Permissions.BRANCH_VIEW_TRANSACTIONS,
    findUnique: Permissions.BRANCH_VIEW_TRANSACTIONS,
    create: Permissions.BRANCH_CREATE_TRANSACTION,
    count: Permissions.BRANCH_VIEW_TRANSACTIONS,
  },
  
  // Add all other models...
}

// Helper function
export function getRequiredPermission(
  model: string,
  action: string
): string | undefined {
  return MODEL_PERMISSIONS[model]?.[action]
}
```

---

**Audit Complete**: 2026-08-23  
**Auditor**: AI Development Team  
**Status**: Ready for review
