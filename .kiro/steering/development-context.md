# Development Context & Priorities

This document captures the current development phase, priorities, and architectural decisions for the POS system.

---

## Current Development Phase

**Status**: 🟡 **Pre-Production / Active Development**

- ✅ Core features implemented
- ✅ Authorization system complete
- 🔄 No live users or production data yet
- 🔄 Testing and refinement phase
- 🎯 Target: Production launch Q1 2027

---

## Architecture Priority: Offline-First

### Core Principle

**The POS system MUST work offline.** This is a foundational requirement, not an enhancement.

**Why**: POS staff need to process sales even when:
- Internet is down
- Network is slow/unreliable
- Branch is in remote location
- During internet service provider outages

### Implementation Strategy

All core operations must use **local collections** with automatic sync:

```typescript
// ✅ Correct: Offline-capable
import { useLiveQuery } from '@tanstack/react-db'
import { transactionCollection } from '@/db/collections'

const transactions = useLiveQuery(() =>
  transactionCollection
    .find({ where: { branchId } })
    .orderBy({ createdAt: 'desc' })
    .toArray()
)

// ❌ Wrong: Online-only
import { fetchTransactionHistory } from '@/lib/server-fn/fetch-transaction-history'

const transactions = await fetchTransactionHistory()
```

---

## What MUST Work Offline

### 🔴 Critical (Core Business Operations)

**POS / Sales**:
- ✅ Create orders and transactions
- ✅ Process payments (cash, card offline mode)
- ✅ View product catalog
- ✅ Search products
- ✅ Print receipts

**Inventory Management**:
- ✅ View stock levels
- ✅ Record stock movements
- ✅ Create purchase orders
- ✅ Record goods receipts

**Product Management**:
- ✅ View products
- ✅ Create/edit products
- ✅ Manage variants
- ✅ Update prices

**Employee Management**:
- ✅ View employees
- ✅ Create employees
- ✅ Assign roles

**Authorization**:
- ✅ Permission checks (MUST work offline!)
- ✅ Role-based access
- ✅ Feature gates

**Reporting (with cached data)**:
- ✅ View transactions
- ✅ View orders
- ✅ View sales summaries
- ✅ Export to CSV (from cached data)

---

## What Can Be Online-Only

### 🟢 Acceptable Online-Only Features

**Billing & Subscriptions** (External APIs):
- Subscription management
- Payment processing (Stripe)
- Invoice viewing
- Credit purchases
- Plan changes

**Business Setup** (Infrequent operations):
- Branch creation
- Initial business setup
- Subscription activation

**Security & Authentication** (Security-critical):
- Login/registration
- Password reset
- Session management
- Login history

**Admin Configuration** (Rare operations):
- Feature flag management
- System configuration
- Platform-level settings

---

## Current Offline Support Status

### ✅ Fully Offline (Collections Exist)

**Core Operations** (33 collections):
- Products, variants, components
- Orders, order items
- Transactions, payments
- Inventory, movements
- Purchases, purchase items
- Employees (users), memberships
- Categories, units
- Suppliers, customers
- Production orders
- Audit logs
- Tasks

### 🔴 BROKEN: Authorization Offline (CRITICAL BUG)

**Problem**: Permission system has no collections

```typescript
// Current (BROKEN offline):
// - Permission model → NO collection
// - UserPermission model → NO collection
// - AuthorizationEngine → uses direct DB queries

// Result: "Permission Denied" errors when offline
```

**Fix Required**:
```typescript
// Add to collections.ts
export const permissionCollection = createSyncableCollection<Permission>({
  apiKey: 'permission',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'eager', // Always sync on login
})

export const userPermissionCollection = createSyncableCollection<UserPermission>({
  apiKey: 'userPermission',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'eager',
})
```

### 🟡 Needs Improvement: Reporting

**Problem**: Some report pages use server functions instead of collections

**Pages affected**:
- `/transactions` - uses `fetchTransactionHistory()`
- `/transactions/$id` - uses `fetchTransactionHistory()`
- `/order-history` - uses `fetchOrderHistory()`
- `/billing/credits` - uses `fetchCreditLedger()`

**Fix**: Use collections with `useLiveQuery`

```typescript
// ❌ Current (online-only)
const transactions = await fetchTransactionHistory({ branchId, from, to })

// ✅ Fix (offline-capable)
const transactions = useLiveQuery(() =>
  transactionCollection
    .find({
      where: {
        branchId,
        createdAt: { gte: from, lte: to }
      }
    })
    .orderBy({ createdAt: 'desc' })
    .toArray()
)
```

---

## Development Priorities (Execution Order)

### Phase 1: Critical Offline Fixes 🔴 (Week 1)

**Goal**: Make authorization work offline

**Tasks**:
1. Create `permissionCollection` and `userPermissionCollection`
2. Update `AuthorizationEngine.buildSummary()` to use collections
3. Update `usePermission` hooks to read from collections
4. Test permission checks work offline

**Why First**: App is unusable offline without this (all protected pages fail)

---

### Phase 2: Offline Reporting 🟡 (Week 2)

**Goal**: Reports work with cached data

**Tasks**:
1. Update `/transactions` to use `transactionCollection`
2. Update `/transactions/$id` to use `transactionCollection`
3. Update order history to use `orderCollection`
4. Update credit ledger to use `creditLedgerCollection`
5. Test all reports work offline

**Why Second**: Better UX, reduces server load, follows offline-first principle

---

### Phase 3: API Security 🔴 (Week 3)

**Goal**: Secure CRUD/Transaction APIs before production

**Tasks**:
1. Add permission mapping to `crud-api.ts`
2. Add entitlement checks to `crud-api.ts`
3. Add permission checks to `transaction-api.ts`
4. Fix 2 quote routes using direct `rootPrisma`
5. Test permission enforcement

**Why Third**: Security gap but low risk during development (no live users)

---

### Phase 4: Optional Enhancements 🟢 (Future)

**Tasks**:
1. Create `capabilityStateCollection` (for offline feature flags)
2. Create `hintCollection` (for offline hints)
3. Add workflow states to collections
4. Optimize sync performance

**Why Last**: Nice-to-have, not blocking

---

## Decision Guidelines

### When Adding a New Feature

**Always ask**: "Does this need to work offline?"

**Decision Tree**:

```
New feature involves core POS operations?
├── Yes → MUST use collections (offline-first)
│   └── Writes: dbTransaction + collection
│   └── Reads: useLiveQuery(collection)
│
└── No → Is it admin/billing/auth?
    ├── Billing/Stripe → OK to be online-only
    ├── Authentication → OK to be online-only
    ├── Rare admin operations → OK to be online-only
    │
    └── Everything else → Prefer offline-capable
        └── Use collections if possible
```

### When Reviewing Code

**Red Flags** (Offline-First Violations):

```typescript
// 🔴 POS/reporting page using server function
const transactions = await fetchTransactionHistory()
// Should use: transactionCollection

// 🔴 Product page using crudAPI
const products = await crudAPI.product('findMany', ...)
// Should use: productCollection

// 🔴 Permission check using database
const hasPermission = await checkPermissionInDB(userId, permission)
// Should use: permissionCollection
```

**Green Lights** (Correct Offline-First):

```typescript
// ✅ POS using collections
const products = useLiveQuery(() =>
  productCollection.find({ where: { branchId } }).toArray()
)

// ✅ Transaction creation using dbTransaction
await dbTransaction(() => {
  transactionCollection.insert({ ...data })
  paymentCollection.insert({ ...payment })
})

// ✅ Permission check using collection
const permissions = useLiveQuery(() =>
  permissionCollection.find({ where: { userId } }).toArray()
)
```

---

## Data Migration Strategy

### Current State: No Live Users

**Implications**:
- No data migration needed
- Can make breaking schema changes
- Can refactor freely
- Can reset dev databases

**What This Means**:

```typescript
// ✅ Safe to do (no live users):
- Add required fields to models
- Change field types
- Rename tables/columns
- Remove unused models
- Reset sequences

// ❌ Don't assume in docs:
- "Existing users" (there are none)
- "Production migration" (not yet)
- "Data backup before changes" (nice-to-have in dev)
- "Rollback procedures" (overkill for dev)
```

### When We Get Live Users

**Then we'll need**:
- Proper migration planning
- Data backfilling scripts
- Rollback procedures
- Maintenance windows
- User communication

**But not yet!** Focus on getting features right first.

---

## Testing Strategy in Development Phase

### What to Test Now

**Focus on**:
- ✅ Core POS workflows
- ✅ Offline capability
- ✅ Permission checks
- ✅ Data sync (online → offline → online)

**Can defer**:
- ⏸️ Load testing (no users yet)
- ⏸️ Migration testing (no data yet)
- ⏸️ Rollback procedures (dev only)

### Testing Offline Scenarios

**Critical tests**:

```typescript
// Test 1: Create transaction offline
it('should create transaction offline and sync when online', async () => {
  // Go offline
  await mockOffline()
  
  // Create transaction
  const result = await createPosTransaction(data)
  
  // Should succeed
  expect(result.success).toBe(true)
  
  // Should be in local collection
  const local = transactionCollection.find({ where: { id: result.id } })
  expect(local).toBeDefined()
  
  // Go online
  await mockOnline()
  
  // Should sync to server
  await waitForSync()
  const server = await crudAPI.transaction('findUnique', { where: { id: result.id } })
  expect(server.isOk()).toBe(true)
})

// Test 2: Permission check offline
it('should check permissions offline', async () => {
  // Sync permissions while online
  await syncPermissions()
  
  // Go offline
  await mockOffline()
  
  // Permission check should still work
  const hasPermission = usePermission(Permissions.BRANCH_CREATE_PRODUCT)
  expect(hasPermission).toBe(true)
})
```

---

## Common Mistakes to Avoid

### ❌ Mistake 1: Using Server Functions for Core Operations

```typescript
// ❌ Wrong
const products = await fetchProducts()

// ✅ Right
const products = useLiveQuery(() =>
  productCollection.find({ where: { branchId } }).toArray()
)
```

### ❌ Mistake 2: Assuming Online Connection

```typescript
// ❌ Wrong
if (!navigator.onLine) {
  showError('No internet')
  return
}

// ✅ Right
// Just use collections - they work offline automatically
const result = await dbTransaction(() => {
  orderCollection.insert(order)
})
```

### ❌ Mistake 3: Fetching Fresh Data for Reports

```typescript
// ❌ Wrong (unnecessary server round-trip)
const transactions = await fetchTransactionHistory()

// ✅ Right (use cached data)
const transactions = useLiveQuery(() =>
  transactionCollection
    .find({ where: { branchId } })
    .toArray()
)
```

### ❌ Mistake 4: Adding Online-Only Features to Core Flows

```typescript
// ❌ Wrong (blocks offline POS)
async function createOrder() {
  await validateWithExternalAPI() // Requires online!
  await dbTransaction(() => {
    orderCollection.insert(order)
  })
}

// ✅ Right (validate online when available, queue offline)
async function createOrder() {
  // Create order offline-first
  const result = await dbTransaction(() => {
    orderCollection.insert(order)
  })
  
  // Validate async when online (doesn't block)
  if (navigator.onLine) {
    validateWithExternalAPI().catch(logError)
  }
}
```

---

## When to Break These Rules

### Exceptions Are Rare But Valid

**OK to use server functions instead of collections when**:
1. External API integration (Stripe, webhooks)
2. Security-critical operations (auth, session management)
3. Platform-level admin operations (rare, admin-only)
4. CSV generation (server-side processing)

**Example** (valid exception):
```typescript
// ✅ OK to be online-only: Stripe integration
export const createBillingPortalSession = createServerFn()
  .middleware([authMiddleware, requirePermission(Permissions.BUSINESS_MANAGE_BILLING)])
  .handler(async ({ context }) => {
    // External API call - must be online
    const session = await stripe.billingPortal.sessions.create({
      customer: context.user.stripeCustomerId,
      return_url: `${APP_URL}/business/billing`,
    })
    
    return { url: session.url }
  })
```

---

## Summary: Key Takeaways

### 🎯 Core Principles

1. **Offline-First**: POS operations MUST work offline
2. **Collections Over APIs**: Use collections for all core data
3. **No Live Users Yet**: Can refactor freely, no migration complexity
4. **Priority: Fix Authorization Offline**: Critical bug blocking offline usage
5. **Security Before Production**: Secure APIs before launch, but not urgent in dev

### 📋 Quick Reference

**For New Features**:
```
Core POS operation? → Use collections (offline-first)
Billing/Stripe? → Server function OK (online-only)
Reporting? → Use collections with live queries
Admin CRUD? → Use collections
```

**For Code Review**:
```
See server function in POS code? → Red flag
See direct Prisma in component? → Red flag
See crudAPI in core operation? → Red flag
See dbTransaction for writes? → Green light
See useLiveQuery for reads? → Green light
```

---

**Last Updated**: 2026-08-23  
**Review Schedule**: Monthly or when development phase changes  
**Owner**: Development Team
