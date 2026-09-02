# Employee Branch Tracking Architecture

## Overview

Employees have a **business-wide limit** (counted via `Membership`) but their **performance is tracked per-branch** automatically via `Transaction` records.

## Data Model

### Membership (Employee Assignment)

```prisma
model Membership {
  userId     String
  businessId String
  branchId   String?  // Current "home" branch assignment
  
  @@unique([userId, businessId])
}
```

**Key Points:**
- One membership record per employee per business
- `branchId` indicates their current assigned branch
- Employee limit = count of Membership records (business-wide)
- Employee can work at any branch, not restricted to assigned branch

### Transaction (Automatic Performance Tracking)

```prisma
model Transaction {
  cashierId  String  // Which employee processed this transaction
  branchId   String  // Which branch the transaction occurred at
  
  totalAmount Int
  createdAt   DateTime
}
```

**Key Points:**
- Every transaction records who processed it and where
- No separate performance tracking table needed
- Historical data automatically preserved
- Can track employee performance across all branches they've worked at

## Query Patterns

### 1. Business-Wide Employee Count (For Subscription Limit)

```typescript
// Count total employees across all branches
const employeeCount = await prisma.membership.count({
  where: { 
    businessId: 'biz-1',
    deletedAt: null 
  }
})

// Check against plan limit
if (employeeCount >= subscription.plan.maxEmployees) {
  throw new Error('Employee limit reached')
}
```

### 2. Employee's Home Branch Assignment

```typescript
// Get employee's assigned branch
const membership = await prisma.membership.findUnique({
  where: {
    userId_businessId: {
      userId: 'user-123',
      businessId: 'biz-1'
    }
  },
  include: { branch: true }
})

console.log(`Assigned to: ${membership.branch.name}`)
```

### 3. Employee Performance at Specific Branch

```typescript
// Performance at Branch A this month
const performance = await prisma.transaction.aggregate({
  where: {
    cashierId: 'user-123',
    branchId: 'branch-a',
    createdAt: { 
      gte: startOfMonth,
      lte: endOfMonth 
    }
  },
  _count: true,
  _sum: { 
    totalAmount: true,
    totalCost: true 
  }
})

console.log(`Branch A Performance:`)
console.log(`- Transactions: ${performance._count}`)
console.log(`- Revenue: ₱${performance._sum.totalAmount / 100}`)
console.log(`- Profit: ₱${(performance._sum.totalAmount - performance._sum.totalCost) / 100}`)
```

### 4. Employee Performance Across All Branches

```typescript
// Performance grouped by branch
const branchPerformance = await prisma.transaction.groupBy({
  by: ['branchId'],
  where: {
    cashierId: 'user-123',
    businessId: 'biz-1',
    createdAt: { gte: startOfMonth }
  },
  _count: true,
  _sum: { 
    totalAmount: true,
    totalCost: true 
  }
})

// Results:
// [
//   { branchId: 'branch-a', _count: 45, _sum: { totalAmount: 125000 } },
//   { branchId: 'branch-b', _count: 23, _sum: { totalAmount: 67000 } }
// ]
```

### 5. Which Branches Employee Worked At

```typescript
// Find all branches where employee processed transactions
const branchesWorked = await prisma.transaction.findMany({
  where: {
    cashierId: 'user-123',
    businessId: 'biz-1',
    createdAt: { gte: startOfMonth }
  },
  distinct: ['branchId'],
  select: {
    branchId: true,
    branch: {
      select: { name: true }
    }
  }
})

// Results:
// [
//   { branchId: 'branch-a', branch: { name: 'Main Store' } },
//   { branchId: 'branch-b', branch: { name: 'Mall Branch' } }
// ]
```

### 6. Branch Staff Roster (Who's Assigned Here)

```typescript
// List all employees assigned to Branch A
const branchStaff = await prisma.membership.findMany({
  where: {
    branchId: 'branch-a',
    deletedAt: null
  },
  include: {
    user: {
      select: {
        id: true,
        name: true,
        email: true,
        role: true
      }
    }
  }
})
```

### 7. Top Performers (Business-Wide or Per-Branch)

```typescript
// Top 10 cashiers business-wide this month
const topPerformers = await prisma.transaction.groupBy({
  by: ['cashierId'],
  where: {
    businessId: 'biz-1',
    createdAt: { gte: startOfMonth }
  },
  _count: true,
  _sum: { totalAmount: true },
  orderBy: {
    _sum: {
      totalAmount: 'desc'
    }
  },
  take: 10
})

// Top 5 cashiers at Branch A
const branchTopPerformers = await prisma.transaction.groupBy({
  by: ['cashierId'],
  where: {
    branchId: 'branch-a',
    createdAt: { gte: startOfMonth }
  },
  _count: true,
  _sum: { totalAmount: true },
  orderBy: {
    _sum: {
      totalAmount: 'desc'
    }
  },
  take: 5
})
```

## UI/Reporting Use Cases

### Employee Dashboard (Employee View)

Shows their own performance across all branches:

```typescript
const myPerformance = {
  // Total across all branches
  total: await prisma.transaction.aggregate({
    where: { cashierId: currentUserId, createdAt: { gte: startOfMonth } },
    _count: true,
    _sum: { totalAmount: true }
  }),
  
  // Breakdown by branch
  byBranch: await prisma.transaction.groupBy({
    by: ['branchId'],
    where: { cashierId: currentUserId, createdAt: { gte: startOfMonth } },
    _count: true,
    _sum: { totalAmount: true }
  })
}
```

### Branch Manager Dashboard

Shows all employees who worked at their branch:

```typescript
const branchMetrics = {
  // Staff roster (assigned employees)
  assignedStaff: await prisma.membership.count({
    where: { branchId: currentBranchId }
  }),
  
  // Everyone who processed transactions here (includes floaters)
  activeStaff: await prisma.transaction.findMany({
    where: {
      branchId: currentBranchId,
      createdAt: { gte: startOfMonth }
    },
    distinct: ['cashierId'],
    include: {
      cashier: {
        select: { name: true, email: true }
      }
    }
  }),
  
  // Per-employee performance
  staffPerformance: await prisma.transaction.groupBy({
    by: ['cashierId'],
    where: {
      branchId: currentBranchId,
      createdAt: { gte: startOfMonth }
    },
    _count: true,
    _sum: { totalAmount: true }
  })
}
```

### Business Owner Dashboard

Consolidated view across all branches:

```typescript
const businessMetrics = {
  // Total employees (for limit check)
  totalEmployees: await prisma.membership.count({
    where: { businessId, deletedAt: null }
  }),
  
  // Total performance
  totalRevenue: await prisma.transaction.aggregate({
    where: { businessId, createdAt: { gte: startOfMonth } },
    _sum: { totalAmount: true }
  }),
  
  // Per-branch breakdown
  branchBreakdown: await prisma.transaction.groupBy({
    by: ['branchId'],
    where: { businessId, createdAt: { gte: startOfMonth } },
    _count: true,
    _sum: { totalAmount: true }
  }),
  
  // Top performers company-wide
  topPerformers: await prisma.transaction.groupBy({
    by: ['cashierId'],
    where: { businessId, createdAt: { gte: startOfMonth } },
    _count: true,
    _sum: { totalAmount: true },
    orderBy: { _sum: { totalAmount: 'desc' } },
    take: 10
  })
}
```

## Employee Workflow Examples

### Example 1: Regular Assignment

1. Employee hired → Membership created with `branchId = 'branch-a'`
2. Employee works at Branch A → Transactions have `cashierId = user-123`, `branchId = 'branch-a'`
3. Reports show their Branch A performance

### Example 2: Temporary Transfer

1. Employee normally at Branch A (`membership.branchId = 'branch-a'`)
2. Sent to help Branch B for a week
3. During that week, transactions have `branchId = 'branch-b'`
4. After week, Membership.branchId stays 'branch-a' (home branch)
5. Reports show:
   - Assigned to: Branch A
   - This month worked at: Branch A (3 weeks) + Branch B (1 week)
   - Performance tracked separately for each

### Example 3: Permanent Transfer

1. Employee transfers from Branch A to Branch B
2. Update Membership: `branchId = 'branch-b'`
3. Future transactions have `branchId = 'branch-b'`
4. Historical transactions at Branch A remain unchanged
5. Reports show full history across both branches

## Benefits of This Architecture

✅ **Simple Employee Limits**
- Count Membership records for subscription limit
- No complex per-branch quotas

✅ **Flexible Staffing**
- Employees can work at any branch
- Temporary transfers don't require schema changes
- "Home branch" is just metadata, not a restriction

✅ **Automatic Tracking**
- Performance tracked via Transaction records
- No separate tables to maintain
- Historical data preserved forever

✅ **Rich Reporting**
- Per-branch employee performance
- Cross-branch employee performance
- Branch staff rosters
- Business-wide leaderboards

✅ **Audit Trail**
- Every transaction shows who did it and where
- Can track employee movements over time
- No data loss on reassignments

## Collections (Offline Support)

Current collections already support this architecture:

```typescript
// Employee's transactions work offline
const myTransactions = useLiveQuery(() =>
  transactionCollection
    .find({ where: { cashierId: currentUserId } })
    .toArray()
)

// Branch transactions work offline
const branchTransactions = useLiveQuery(() =>
  transactionCollection
    .find({ where: { branchId: currentBranchId } })
    .toArray()
)
```

No schema changes needed - the architecture is already complete!

---

**Last Updated**: 2026-08-27  
**Status**: Implemented (no changes required)
