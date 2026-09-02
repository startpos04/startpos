# Per-Branch Accounting Architecture

## Overview

The system implements **per-branch accounting for transaction quotas and credits** while maintaining **business-level limits for employees and products** with a **single business-level subscription** for simplified billing.

## Design Decisions

### Subscription Scope
- ✅ **Business-level subscription**: One subscription per business (easier billing relationship)
- ✅ **Branch-level quotas**: Each branch tracks its own transaction usage independently
- ✅ **Branch-level credits**: Branches purchase and consume credits independently
- ✅ **Business-level employee limit**: Employees can rotate between branches as needed

### Why Per-Branch for Transactions/Credits?

**Accounting Clarity**: Each branch operates independently with its own P&L:
- Branch A revenue/costs don't mix with Branch B
- Each branch manager sees their own performance
- Business owner sees consolidated view across all branches

**Operational Independence**: Branches don't affect each other:
- Branch A running out of credits doesn't block Branch B
- Branch B high transaction volume doesn't impact Branch A's quota
- Each location can be scaled independently

### Why Business-Level for Employees?

**Employee Flexibility**: Staff can work at different branches:
- Cashier works at Branch A on Monday, Branch B on Tuesday
- Manager floats between multiple locations
- Employee limit is based on total headcount, not per-location
- Single subscription covers all employees regardless of branch assignment

## Data Model

### UsageCounter (Per-Branch Transaction Tracking)

```prisma
model UsageCounter {
  businessId String  // Which business owns this
  branchId   String  // Which branch this tracks
  
  billingPeriodStart DateTime
  txCount            Int  // Transactions processed at THIS branch
  
  @@unique([businessId, branchId, billingPeriodStart])
}
```

**Query Pattern**:
```typescript
// Per-branch usage (for branch dashboard)
const branchUsage = await prisma.usageCounter.findUnique({
  where: {
    businessId_branchId_billingPeriodStart: {
      businessId: 'biz-1',
      branchId: 'branch-a',
      billingPeriodStart: periodStart,
    }
  }
})

// Business-wide consolidation (for owner dashboard)
const allBranches = await prisma.usageCounter.findMany({
  where: {
    businessId: 'biz-1',
    billingPeriodStart: periodStart,
  }
})
const totalTx = allBranches.reduce((sum, b) => sum + b.txCount, 0)
```

### CreditLedger (Per-Branch Credit Tracking)

```prisma
model CreditLedger {
  businessId String  // Which business owns this
  branchId   String  // Which branch this credit belongs to
  
  amount       Int   // +100 (purchase), -1 (consumed by transaction)
  balanceAfter Int   // Running balance for this branch
  
  @@index([businessId, branchId, createdAt])
}
```

**Credit Flow**:
1. Branch A purchases 1000 credits → `CreditLedger` entry for Branch A
2. Branch A POS transaction → deducts 1 credit from Branch A balance
3. Branch B purchases 500 credits → separate `CreditLedger` entry for Branch B
4. Branch B POS transaction → deducts from Branch B balance (doesn't affect Branch A)

**Query Pattern**:
```typescript
// Get current balance for a branch
const latestEntry = await prisma.creditLedger.findFirst({
  where: { businessId: 'biz-1', branchId: 'branch-a' },
  orderBy: { createdAt: 'desc' },
})
const branchBalance = latestEntry?.balanceAfter ?? 0

// Get total credits across all branches (consolidated view)
const latestPerBranch = await prisma.$queryRaw`
  SELECT DISTINCT ON (branch_id) balance_after
  FROM credit_ledger
  WHERE business_id = 'biz-1'
  ORDER BY branch_id, created_at DESC
`
const totalCredits = latestPerBranch.reduce((sum, row) => sum + row.balance_after, 0)
```

### Membership (Employee Limits - Business-Level)

```prisma
model Membership {
  businessId String  // Business-wide employee tracking
  branchId   String? // Current assignment (can change)
  
  @@unique([userId, businessId])
}
```

**Business-level counting**: Employees are counted across all branches, since they can rotate between locations.

**Query Pattern**:
```typescript
// Business-wide employee count (for subscription limit check)
const totalEmployees = await prisma.membership.count({
  where: { businessId: 'biz-1', deletedAt: null }
})

// Per-branch employee roster (for operational scheduling)
const branchStaff = await prisma.membership.findMany({
  where: { branchId: 'branch-a', deletedAt: null }
})
```

## Reporting Architecture

### Branch-Level Reports (Branch Manager View)

**What Branch Managers See**:
- Their branch's transaction count
- Their branch's credit balance
- Their branch's employee count
- Their branch's revenue/costs
- Their branch's P&L

**Implementation**: Filter by `branchId`

```typescript
const branchMetrics = {
  transactions: await prisma.transaction.count({ 
    where: { branchId, createdAt: { gte: startDate } } 
  }),
  revenue: await prisma.transaction.aggregate({
    where: { branchId, createdAt: { gte: startDate } },
    _sum: { totalAmount: true }
  }),
  employees: await prisma.membership.count({ 
    where: { branchId, deletedAt: null } 
  }),
}
```

### Business-Level Reports (Owner View)

**What Business Owners See**:
- Total transactions across all branches
- Total credits across all branches
- Total employees across all branches
- Per-branch breakdown (which branch contributes what)
- Consolidated P&L

**Implementation**: Aggregate across `businessId`

```typescript
// Consolidated totals
const businessMetrics = {
  totalTransactions: await prisma.transaction.count({ 
    where: { businessId, createdAt: { gte: startDate } } 
  }),
  totalRevenue: await prisma.transaction.aggregate({
    where: { businessId, createdAt: { gte: startDate } },
    _sum: { totalAmount: true }
  }),
}

// Per-branch breakdown
const branchBreakdown = await prisma.transaction.groupBy({
  by: ['branchId'],
  where: { businessId, createdAt: { gte: startDate } },
  _count: true,
  _sum: { totalAmount: true }
})
```

## Credit Purchase Flow

**Current Flow** (Business-level):
```
Business Owner → Stripe Checkout → Credits added to business
```

**New Flow** (Branch-level):
```
Branch Manager → Stripe Checkout → Credits added to THAT branch
                                   ↓
                          CreditLedger entry with branchId
```

**Webhook Handler Change**:
```typescript
// OLD (business-level)
await prisma.creditLedger.create({
  data: {
    businessId: session.metadata.businessId,
    amount: creditAmount,
    balanceAfter: previousBalance + creditAmount,
  }
})

// NEW (branch-level)
await prisma.creditLedger.create({
  data: {
    businessId: session.metadata.businessId,
    branchId: session.metadata.branchId,  // ← NEW
    amount: creditAmount,
    balanceAfter: previousBalance + creditAmount,
  }
})
```

## Entitlement Checks

### Transaction Quota Check (Before Creating Transaction)

```typescript
// Check branch's usage for current period
const counter = await prisma.usageCounter.findUnique({
  where: {
    businessId_branchId_billingPeriodStart: {
      businessId,
      branchId,
      billingPeriodStart: currentPeriodStart,
    }
  }
})

const branchTxUsed = counter?.txCount ?? 0
const planLimit = subscription.plan.includedTxPerMonth

// Branch-specific quota check
if (branchTxUsed >= planLimit) {
  throw new Error('Branch transaction quota exceeded')
}
```

### Credit Balance Check (Before Creating Transaction)

```typescript
// Check branch's current credit balance
const latestCredit = await prisma.creditLedger.findFirst({
  where: { businessId, branchId },
  orderBy: { createdAt: 'desc' },
})

const branchCredits = latestCredit?.balanceAfter ?? 0

if (branchCredits < 1) {
  throw new Error('Insufficient credits at this branch')
}
```

## Migration Notes

**No migration needed** per steering guidelines (no live users yet).

When schema is regenerated:
- `UsageCounter`: All new records will have `branchId` (required field)
- `CreditLedger`: All new records will have `branchId` (required field)
- Existing seeders will need `branchId` added

## Future Enhancements

### Quota Allocation (Phase 4+)
Business owner could distribute quotas across branches:
- Total plan: 1000 tx/month
- Branch A: 400 tx/month
- Branch B: 300 tx/month
- Branch C: 300 tx/month

**Implementation**: Add `allocatedQuota` field to `UsageCounter` or branch config.

### Credit Transfers (Phase 5+)
Branch managers could transfer credits between branches (with business owner approval).

**Implementation**: New `CreditEventType.TRANSFER` with `sourceBranchId` field.

### Branch-Specific Plans (Future)
Each branch could have different subscription tiers.

**Implementation**: Move `BusinessSubscription` to have `branchId`, or create `BranchSubscription` table.

---

**Last Updated**: 2026-08-27  
**Status**: Proposed (schema changes ready, not yet migrated)
