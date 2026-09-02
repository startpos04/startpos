# Billing Architecture Overhaul

**Status**: ❌ **NOT IMPLEMENTED** - Planning Phase  
**Last Updated**: August 28, 2026  
**Scope**: Route reorganization + branch-level billing feature

---

## 🎯 Key Architectural Decisions

### 1. Transaction Quota: **Shared Pool with Per-Branch Limits** ✅
- All branches draw from business-level quota pool (shared)
- Each branch has configurable usage limit (prevents monopolization)
- **Single-branch businesses**: Limit auto-set to total quota (no configuration needed)
- **Multi-branch businesses**: Business owner sets per-branch limits on branches page
- Flexible: limits can sum to more than total pool (soft limits) or less (reserved capacity)

### 2. Credit Balance: **Isolated Per-Branch Model** ✅
- Each branch has separate credit balance
- Credits purchased by branch can only be used by that branch
- Clear accounting and P&L attribution
- No credit transfers between branches (future enhancement)

### 3. Billing Routes: **Two-Tier System** ✅
- `/business/billing/` = Business overview (read-only consolidated view)
- `/business/subscription/` = Subscription management (plans, add-ons, cancel)
- `/billing` = Branch billing (purchase credits & quota top-ups)

### 4. Branch Limits: **Smart Defaults** ✅
- **Single branch**: `branchLimit = totalBusinessQuota` (automatic, no UI)
- **Multi-branch**: Business owner configures on `/business/branches` page
- **Default when adding branch**: `branchLimit = totalBusinessQuota` (owner can adjust)
- **Enforcement**: Hard limit (transaction blocked when branch limit reached)

---

## Quick Reference: Architecture Summary

| Aspect | Implementation | Notes |
|--------|---------------|-------|
| **Quota Pool** | Shared business-wide | Efficient utilization |
| **Branch Limits** | Configurable hard limits | Prevents monopolization |
| **Single Branch** | Auto-limit = total quota | No configuration needed |
| **Multi-Branch** | Owner sets limits | Configured on branches page |
| **Credits** | Isolated per-branch | Clear P&L attribution |
| **Top-ups** | Add to shared pool | Benefits all (within their limits) |

---

## Visual Architecture

### Transaction Flow with Shared Quota + Branch Limits + Isolated Credits

```
┌─────────────────────────────────────────────────────────────────┐
│                      BUSINESS SUBSCRIPTION                       │
│                     (Startup Plan: 1000 TX/month)                │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
        ┌──────────────────────────────────────────────┐
        │     SHARED TRANSACTION QUOTA POOL            │
        │                                              │
        │  Base: 1000 TX                               │
        │  + Branch A purchased: +500 TX               │
        │  + Branch B purchased: +200 TX               │
        │  ────────────────────────────────            │
        │  Total: 1700 TX/month (shared)               │
        │                                              │
        │  Current usage:                              │
        │  - Branch A: 600/800 TX (75%)                │
        │  - Branch B: 300/600 TX (50%)                │
        │  - Branch C: 400/800 TX (50%)                │
        │  ────────────────────────────────            │
        │  Total: 1300/1700 TX used (77%)              │
        │  Remaining: 400 TX in shared pool            │
        └──────────────────────────────────────────────┘
                 │               │               │
                 ▼               ▼               ▼
        ┌────────────┐  ┌────────────┐  ┌────────────┐
        │  BRANCH A  │  │  BRANCH B  │  │  BRANCH C  │
        │            │  │            │  │            │
        │  Limit:    │  │  Limit:    │  │  Limit:    │
        │   800 TX   │  │   600 TX   │  │   800 TX   │
        │  Used:     │  │  Used:     │  │  Used:     │
        │   600 TX   │  │   300 TX   │  │   400 TX   │
        │            │  │            │  │            │
        │  Credits:  │  │  Credits:  │  │  Credits:  │
        │   150 ₱    │  │    50 ₱    │  │   200 ₱    │
        │ (isolated) │  │ (isolated) │  │ (isolated) │
        └────────────┘  └────────────┘  └────────────┘

Sum of limits: 800 + 600 + 800 = 2200 TX (exceeds pool by 500 TX)
This is OK! Branches compete for shared capacity within their limits.

Transaction validation at Branch A:
1. Check branch limit: 600/800 ✅ (200 TX headroom)
2. Check shared pool: 1300/1700 ✅ (400 TX available)
3. Check Branch A credits: 150 ₱ ✅ (sufficient)
4. Process transaction ✅
5. Increment: Branch A → 601/800, Pool → 1301/1700
6. Deduct: Branch A credits → 149 ₱
```

**Blocking scenarios:**

```
Scenario 1: Branch limit blocks before pool exhausted
- Branch B used: 600/600 TX (at limit)
- Shared pool: 1300/1700 TX (capacity available)
- Branch B new TX → ❌ BLOCKED (branch limit)
- Branch A/C can still transact (they have headroom)

Scenario 2: Pool exhausted before branch limit
- Branch A used: 600/800 TX (under limit)
- Shared pool: 1700/1700 TX (exhausted)
- Branch A new TX → ❌ BLOCKED (pool exhausted)
- All branches blocked until pool replenished

Scenario 3: Both pass
- Branch A used: 600/800 TX (under limit)
- Shared pool: 1300/1700 TX (capacity available)
- Branch A new TX → ✅ ALLOWED
```

**Smart defaults for single-branch:**

```
Single-branch business:

┌───────────────────────────────────┐
│  Business Quota: 1000 TX          │
└───────────────────────────────────┘
               │
               ▼
      ┌────────────────┐
      │   BRANCH A     │
      │                │
      │  Limit: 1000 TX│  ← Auto-set to match business quota
      │  Used:  600 TX │
      │                │
      │  Credits: 150 ₱│
      └────────────────┘

When business quota changes (upgrade, top-up):
- Business quota becomes 1500 TX
- Branch A limit auto-updates to 1500 TX
- No manual configuration needed
```

### Purchase Flow Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                    BRANCH BILLING PAGE                            │
│                      (/billing)                                   │
└──────────────────────────────────────────────────────────────────┘
                    │                          │
                    │                          │
         ┌──────────▼──────────┐    ┌─────────▼──────────┐
         │  Buy Credits        │    │  Buy Quota Top-up  │
         │  (Branch-specific)  │    │  (Adds to pool)    │
         └──────────┬──────────┘    └─────────┬──────────┘
                    │                          │
                    ▼                          ▼
         ┌──────────────────┐       ┌──────────────────┐
         │ Stripe Checkout  │       │ Stripe Checkout  │
         │                  │       │                  │
         │ Metadata:        │       │ Metadata:        │
         │ - businessId     │       │ - businessId     │
         │ - branchId       │       │ - branchId       │
         │ - creditAmount   │       │ - txAmount       │
         │ - source: branch │       │ - source: quota  │
         │   _credit_purchase│      │   _topup         │
         └──────────┬────────┘      └─────────┬────────┘
                    │                          │
                    ▼                          ▼
         ┌──────────────────────────────────────────┐
         │      Stripe Webhook Handler              │
         │   (checkout.session.completed)           │
         └──────────┬──────────────┬────────────────┘
                    │              │
         ┌──────────▼──────┐  ┌───▼──────────────┐
         │  CreditLedger   │  │ BranchQuotaTopup │
         │                 │  │                  │
         │  businessId     │  │  businessId      │
         │  branchId       │  │  branchId        │
         │  amount: +100   │  │  additionalTx    │
         │  balanceAfter   │  │  expiresAt       │
         └─────────────────┘  └──────────────────┘
                 │                     │
                 │                     └──┐
                 │                        │
                 ▼                        ▼
    ┌───────────────────┐    ┌──────────────────────┐
    │  Branch A credits │    │  Business quota pool │
    │  increased        │    │  increased           │
    │  (isolated)       │    │  (shared, all        │
    │                   │    │   branches benefit)  │
    └───────────────────┘    └──────────────────────┘
```

### Multi-Branch Business Dashboard View

```
┌────────────────────────────────────────────────────────────────┐
│               /business/billing (Overview)                      │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  Business Transaction Quota (Shared Pool)                │ │
│  │                                                          │ │
│  │  1600 / 1700 TX used this period                        │ │
│  │  ████████████████████████░░░  94%                       │ │
│  │                                                          │ │
│  │  Per-branch breakdown:                                  │ │
│  │  ┌─────────────────────────────────────────────────┐   │ │
│  │  │ Branch A (Flagship) : 800 TX (47%)  █████████   │   │ │
│  │  │ Branch B (New)      : 300 TX (18%)  ███         │   │ │
│  │  │ Branch C (Downtown) : 500 TX (29%)  █████       │   │ │
│  │  └─────────────────────────────────────────────────┘   │ │
│  │                                                          │ │
│  │  Active top-ups contributing to pool:                   │ │
│  │  • +500 TX (purchased by Branch A, perpetual)           │ │
│  │  • +200 TX (purchased by Branch B, expires Feb 28)      │ │
│  │                                                          │ │
│  │  [Buy Quota Top-up] [View Usage Details]                │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  Credit Balances by Branch                               │ │
│  │                                                          │ │
│  │  Branch A: 150 ₱                                        │ │
│  │  Branch B:  50 ₱  ⚠️ Low balance                       │ │
│  │  Branch C: 200 ₱                                        │ │
│  │  ────────────────                                       │ │
│  │  Total:    400 ₱                                        │ │
│  │                                                          │ │
│  │  Note: Credits are branch-specific and cannot be        │ │
│  │  transferred. Each branch manages their own balance.    │ │
│  └──────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

---

## Overview

This document covers:
1. **Route Reorganization** - Clean up business billing structure
2. **Branch-Level Billing** - Add separate billing for branches to purchase transaction quota top-ups and prepaid credits independently
3. **Shared Quota Architecture** - How transaction quotas pool across branches
4. **Isolated Credit Architecture** - How credits remain branch-specific

---

## Part 1: Business Billing Route Reorganization

### Current Structure (Messy)

```
/business/billing/
├─ index.tsx           ← Mixed: status + usage + addons + quick actions (too much)
├─ credits/            ← Credit purchases & history
├─ invoices/           ← Invoice list
├─ plans/              ← Plan selection & upgrade/downgrade
├─ pricing/            ← Custom plan builder
├─ quotes/             ← Quote requests
└─ success/            ← Post-checkout success page
```

**Problems:**
- `/business/billing/` (index) is overloaded - shows status, usage, addons, and CTAs all mixed together
- No clear separation between "subscription management" and "billing overview"
- Hard to navigate - users don't know where to go to change plans vs view invoices

### Proposed Structure (Clean)

```
/business/billing/                    ← Overview dashboard (read-only)
├─ Subscription status card
├─ Current usage summary
├─ Quick links to:
│  ├─ Manage subscription
│  ├─ View invoices
│  ├─ Purchase credits
│  └─ Buy add-ons

/business/subscription/               ← NEW: Subscription management hub
├─ index.tsx                          ← Current plan details + change/cancel CTAs
│  ├─ Plan details card
│  ├─ Feature list
│  ├─ Change plan button → /plans
│  ├─ Add add-ons button
│  └─ Cancel subscription button
├─ plans/                             ← Plan selection (upgrade/downgrade)
├─ pricing/                           ← Custom plan builder
├─ addons/                            ← NEW: Add-on management page
└─ success/                           ← Post-checkout success

/business/billing/credits/            ← Credit purchases (existing)
/business/billing/invoices/           ← Invoice history (existing)
/business/billing/quotes/             ← Quote requests (existing)
```

### Benefits

1. **Clear separation of concerns**:
   - `/billing/` = overview + transactions (credits, invoices)
   - `/subscription/` = plan management + add-ons + cancel

2. **Easier navigation**:
   - Users know exactly where to go
   - "Want to change plan?" → Subscription
   - "Want to view invoices?" → Billing

3. **Better scalability**:
   - Future: Branch billing can be `/branch/billing/` without confusion
   - Business billing stays organized

4. **Reduced cognitive load**:
   - One page = one purpose
   - No more overloaded dashboards

---

## Part 2: Branch-Level Billing Architecture

### Overview

Add separate billing interface for branches to purchase **transaction quota top-ups** and **prepaid credits** independently of the business-level subscription.

## Current State (Business-Level Only)

**Business Billing** (`/business/billing`):
- View business subscription (Trial, Startup, Pro, etc.)
- Upgrade/downgrade plans
- Purchase prepaid credits (applies to all branches)
- View consolidated usage across branches

**Problem**: 
- Branches share the same credit pool (business-level)
- Branch managers can't purchase credits for their own branch
- No way for a branch to buy additional transaction quota independently

## Proposed Architecture

### Two-Tier Billing System

```
Business Level (/business/billing)
├─ Subscription Management (Trial → Paid plans)
├─ Consolidated Usage Reports (all branches)
├─ Credit Purchases (optional, for business-wide pool)
└─ Business-level quota top-ups (future)

Branch Level (/branch/billing) — NEW
├─ Branch-specific usage dashboard
├─ Purchase Credits (for THIS branch only)
├─ Purchase Quota Top-ups (for THIS branch only)
└─ Branch credit/quota history
```

### Schema Changes

Already implemented in `per-branch-accounting.md`:

```prisma
model UsageCounter {
  businessId String
  branchId   String  // ✅ Already added
  
  billingPeriodStart DateTime
  txCount            Int
  
  @@unique([businessId, branchId, billingPeriodStart])
}

model CreditLedger {
  businessId String
  branchId   String  // ✅ Already added
  
  amount       Int
  balanceAfter Int
  eventType    CreditEventType
  
  @@index([businessId, branchId, createdAt])
}
```

**New addition for shared quota with branch limits**:

```prisma
model Branch {
  id                String   @id @default(cuid())
  businessId        String
  name              String
  address           String?
  
  // NEW: Per-branch transaction limit
  txQuotaLimit      Int?     // NULL = no custom limit (uses business total)
  
  // ... other existing fields
  
  business          Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  
  @@index([businessId])
}

model BranchQuotaTopup {
  id                String   @id @default(cuid())
  businessId        String
  branchId          String?   // ← NULL = business purchased, specific = branch purchased
  
  additionalTx      Int       // Number of extra transactions purchased
  purchasedBy       String?   // userId who made the purchase
  expiresAt         DateTime? // null = perpetual, date = expires
  purchasedAt       DateTime  @default(now())
  
  // Stripe payment tracking
  stripeSessionId   String?  @unique  // Prevents duplicate webhook processing
  stripePriceId     String?
  amountPaid        Int?     // Amount in cents
  currency          String?  // e.g., "PHP"
  
  // Relations
  business          Business  @relation(fields: [businessId], references: [id], onDelete: Cascade)
  branch            Branch?   @relation(fields: [branchId], references: [id], onDelete: Cascade)
  
  @@index([businessId, expiresAt])
  @@index([businessId, branchId, expiresAt])
}

model CreditLedger {
  // ... existing fields
  stripeSessionId   String?  @unique  // ADD: Prevents duplicate credit grants on webhook retry
}
```

**Migration notes:**
- No migration needed (no live users per steering guidelines)
- BranchQuotaTopup is a new table, no data to migrate
- Branch.txQuotaLimit added as nullable (defaults to NULL = uses business total)
- CreditLedger.stripeSessionId can be added as nullable column

**Automatic limit management:**
```typescript
// On business creation with first branch
async function createBusinessWithBranch(data) {
  const business = await prisma.business.create({ /* ... */ })
  const baseQuota = getBasePlanQuota(business.subscriptionTier)
  
  await prisma.branch.create({
    data: {
      businessId: business.id,
      name: data.branchName,
      txQuotaLimit: baseQuota, // Single branch gets full quota
    }
  })
}

// When adding second branch (becomes multi-branch)
async function addBranch(businessId, branchData) {
  const branchCount = await prisma.branch.count({ where: { businessId }})
  const totalQuota = await getTotalBusinessQuota(businessId)
  
  await prisma.branch.create({
    data: {
      businessId,
      name: branchData.name,
      txQuotaLimit: totalQuota, // Default: full quota (owner can adjust)
    }
  })
  
  // Note: Existing branch keeps its limit (owner should review/adjust)
}

// When business quota changes (plan upgrade, top-up)
async function onBusinessQuotaChange(businessId) {
  const branchCount = await prisma.branch.count({ where: { businessId }})
  
  if (branchCount === 1) {
    // Single branch: Auto-update to match business quota
    const totalQuota = await getTotalBusinessQuota(businessId)
    await prisma.branch.updateMany({
      where: { businessId },
      data: { txQuotaLimit: totalQuota }
    })
  }
  // Multi-branch: Owner manages manually (don't auto-update)
}
```

### Transaction Quota Models

⚠️ **CRITICAL DECISION POINT**: How should transaction quotas be allocated across branches?

#### SELECTED: Option C - Shared Pool with Branch Limits ✅ **IMPLEMENTED**

**How it works:**
- Business subscription includes base quota (e.g., 1000 TX/month)
- **All branches share the same quota pool** (like Option B)
- **Each branch has a configurable usage limit** (prevents monopolization)
- Business owner sets per-branch limits on `/business/branches` page
- Branch transactions blocked when EITHER: branch limit OR shared pool exhausted

**Smart defaults:**
- **Single-branch business**: Branch limit automatically = total business quota
  - No configuration UI shown
  - Updates automatically when plan changes or top-ups purchased
- **Multi-branch business**: When adding new branch, default limit = total business quota
  - Business owner can adjust limits as needed
  - Limits can be changed anytime on branches management page

**Schema:**
```prisma
model Branch {
  id              String   @id @default(cuid())
  businessId      String
  name            String
  
  // NEW: Transaction limit for this branch
  txQuotaLimit    Int?     // NULL = no limit (uses total business quota)
  
  // ... other fields
  
  @@index([businessId])
}
```

**Validation logic:**
```typescript
async function validateTransaction(businessId: string, branchId: string) {
  // 1. Get business total quota (shared pool)
  const businessQuota = await getBusinessQuotaStatus(businessId)
  if (businessQuota.totalUsed >= businessQuota.totalQuota) {
    throw new Error('Business transaction quota exhausted')
  }
  
  // 2. Get branch limit and current usage
  const branch = await prisma.branch.findUnique({ 
    where: { id: branchId },
    select: { txQuotaLimit: true }
  })
  
  // Determine effective branch limit
  const branchLimit = branch.txQuotaLimit ?? businessQuota.totalQuota
  
  const branchUsage = await getBranchUsageThisPeriod(businessId, branchId)
  
  if (branchUsage >= branchLimit) {
    throw new Error(`Branch quota limit reached (${branchLimit} TX/month)`)
  }
  
  // 3. All checks passed
  return { allowed: true }
}
```

**Automatic limit updates:**
```typescript
// When business quota changes (plan upgrade, top-up, etc.)
async function updateBranchLimitsForSingleBranch(businessId: string) {
  const branchCount = await prisma.branch.count({ where: { businessId }})
  
  if (branchCount === 1) {
    // Single branch: Auto-update limit to match business quota
    const businessQuota = await getTotalBusinessQuota(businessId)
    
    await prisma.branch.updateMany({
      where: { businessId },
      data: { txQuotaLimit: businessQuota }
    })
  }
  // Multi-branch: Don't auto-update (owner manages manually)
}
```

**Examples:**

*Example 1: Single-branch business*
```
Business: 1000 TX/month base + 500 TX top-up = 1500 TX total
Branch A: Limit automatically set to 1500 TX
- No configuration needed
- Limit updates automatically when quota changes
```

*Example 2: Multi-branch with equal distribution*
```
Business: 1500 TX/month total (shared pool)
Branch A: Limit 500 TX
Branch B: Limit 500 TX  
Branch C: Limit 500 TX

Branch A uses 500 TX → ❌ BLOCKED at branch limit
Branch B uses 300 TX → ✅ Allowed
Branch C uses 200 TX → ✅ Allowed
Total: 1000/1500 TX used (shared pool has 500 remaining, but Branch A blocked)
```

*Example 3: Multi-branch with unequal distribution*
```
Business: 1500 TX/month total (shared pool)
Branch A (flagship): Limit 1000 TX
Branch B (new):      Limit 300 TX
Branch C (medium):   Limit 500 TX

Total limits: 1800 TX (exceeds pool by 300 TX - this is OK!)

Branch A uses 800 TX → ✅ Allowed (under branch limit)
Branch B uses 300 TX → ❌ BLOCKED at branch limit  
Branch C uses 400 TX → ✅ Allowed
Total: 1500/1500 TX → Shared pool exhausted
All branches now blocked (pool empty)
```

*Example 4: Reserved capacity*
```
Business: 1500 TX/month total (shared pool)
Branch A: Limit 600 TX
Branch B: Limit 600 TX
Total limits: 1200 TX (300 TX reserved/unused - this is OK!)

Ensures neither branch can use more than 600, leaving buffer
```

**Pros:**
- ✅ **Prevents monopolization**: No single branch can exhaust pool for others
- ✅ **Flexible**: Owner can allocate based on branch needs (unequal is fine)
- ✅ **Efficient**: Shared pool still allows flexible usage within limits
- ✅ **Simple for single-branch**: No configuration, works automatically
- ✅ **Scalable**: Adding branches doesn't require complex setup
- ✅ **Transparent**: Dashboard shows per-branch limit + usage

**Cons:**
- ⚠️ **Requires management**: Multi-branch owners need to set/adjust limits
- ⚠️ **Potential confusion**: Limits vs pool needs clear UI explanation

**UI Indicators:**
```typescript
// Branch Billing Dashboard
<Card>
  <CardTitle>Your Branch Quota</CardTitle>
  <CardContent>
    {/* Branch-specific limit */}
    <div>
      <Label>Your Branch Usage</Label>
      <Value>{branchUsed} / {branchLimit} TX</Value>
      <Progress value={(branchUsed / branchLimit) * 100} />
      <Text muted>Your branch limit: {branchLimit} TX/month</Text>
    </div>
    
    {/* Business pool status */}
    <div className="border-t mt-4 pt-4">
      <Label>Business Pool (All Branches)</Label>
      <Value>{poolUsed} / {poolTotal} TX</Value>
      <Progress value={(poolUsed / poolTotal) * 100} />
      <Text muted>Shared across all branches</Text>
    </div>
    
    {/* Warning states */}
    {branchUsed >= branchLimit * 0.8 && (
      <Alert variant="warning">
        Approaching your branch limit ({branchLimit} TX)
      </Alert>
    )}
    
    {poolUsed >= poolTotal * 0.8 && (
      <Alert variant="warning">
        Business pool nearly full - affects all branches
      </Alert>
    )}
  </CardContent>
</Card>
```

---

#### Option A: Isolated Per-Branch Quota ❌ **REJECTED**

**Reason for rejection:** Inefficient utilization, unfair to unequal branches, requires manual rebalancing.

**How it would work:**
- Business subscription includes base quota (e.g., 1000 TX/month)
- Quota divided equally: 3 branches = 333 TX each
- Each branch tracks independently
- Branch can purchase additional quota top-ups for itself only

**Why rejected:**
- Branches are not equal in transaction volume
- Wasted quota at low-volume branches
- High-volume branches constantly hitting limits
- Poor user experience

---

#### Option B: Pure Shared Pool (No Limits) ⚠️ **CONSIDERED BUT MODIFIED**

**How it would work:**
- Business subscription includes base quota (e.g., 1000 TX/month)
- All branches share the same quota pool
- No per-branch limits
- Any branch can use quota until pool exhausted

**Why modified to Option C:**
- Risk: One busy branch could exhaust quota for all branches
- No protection against monopolization
- Option C (with limits) provides better control while keeping benefits

---

### Credit Isolation Models (Unchanged)

**Option A: Strict Isolation (Recommended)**
- Each branch has completely separate credit balance
- **Business-level `/business/billing/credits` route is REMOVED**
- Branch purchases credits → only that branch can use them
- CreditLedger entries always have `branchId`
- Business owner sees consolidated credit view across branches (read-only)

**Option B: Hybrid Model**
- Business-level credit purchases create a "shared pool" (branchId = null)
- Branch-level credit purchases are branch-specific (branchId = specific ID)
- Transaction deduction priority: branch-specific credits first, then shared pool
- More complex logic but flexible

**Decision: Option A (Strict Isolation)**

**Rationale**: Clearer accounting, simpler implementation, aligns with per-branch P&L goals

**Implementation Impact**:
- Remove `/business/billing/credits/` route entirely
- Business owners view credits at `/business/billing/` overview (consolidated read-only)
- All credit purchases happen at branch level (`/billing` in branch context)
- Webhook handler always requires `branchId` in metadata

### UI Changes

#### 1. New Branch Billing Page (`/billing`)

**Route**: `/billing` (branch context assumed from session)

**Sections**:

```typescript
// Branch Billing Dashboard
<BranchBillingPage>
  {/* Business Quota Status Card (Shared Pool) */}
  <Card>
    <CardHeader>
      <CardTitle>Business Transaction Quota</CardTitle>
      <CardDescription>Shared across all branches</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="space-y-4">
        {/* Total business quota usage */}
        <div>
          <div className="flex justify-between mb-2">
            <Label>Total Usage (All Branches)</Label>
            <Value>{quotaStatus.totalUsed.toLocaleString()} / {quotaStatus.totalQuota.toLocaleString()} TX</Value>
          </div>
          <Progress value={(quotaStatus.totalUsed / quotaStatus.totalQuota) * 100} />
          <Text muted className="mt-1">
            Base: {quotaStatus.baseQuota} TX + Top-ups: {quotaStatus.topupQuota} TX
          </Text>
        </div>
        
        {/* This branch's contribution */}
        <div className="border-t pt-4">
          <div className="flex justify-between mb-2">
            <Label>Your Branch Usage</Label>
            <Value>{quotaStatus.branchUsed.toLocaleString()} TX</Value>
          </div>
          <Text muted>
            Your branch is using {quotaStatus.branchPercent.toFixed(1)}% of total quota
          </Text>
        </div>
        
        {/* Alerts */}
        {quotaStatus.isQuotaExhausted && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Quota Exhausted</AlertTitle>
            <AlertDescription>
              Business has used all {quotaStatus.totalQuota} transactions. 
              Purchase a quota top-up to continue processing transactions.
            </AlertDescription>
          </Alert>
        )}
        
        {quotaStatus.isQuotaNearLimit && !quotaStatus.isQuotaExhausted && (
          <Alert variant="warning">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Quota Nearly Full</AlertTitle>
            <AlertDescription>
              {quotaStatus.remaining.toLocaleString()} transactions remaining. 
              Consider purchasing a top-up before running out.
            </AlertDescription>
          </Alert>
        )}
      </div>
    </CardContent>
    <CardFooter>
      <Button onClick={() => setBuyQuotaDialog(true)}>
        <Plus className="mr-2 h-4 w-4" />
        Buy Quota Top-up
      </Button>
      <Button variant="outline" onClick={() => navigate('/business/billing')}>
        View Business Billing →
      </Button>
    </CardFooter>
  </Card>

  {/* Branch Credit Balance Card (Isolated) */}
  <Card>
    <CardHeader>
      <CardTitle>Your Branch Credits</CardTitle>
      <CardDescription>Used for processing transactions at this branch</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="space-y-4">
        <div>
          <Label>Credit Balance</Label>
          <div className="text-3xl font-bold">{branchCredits} credits</div>
        </div>
        
        {branchCredits < 10 && (
          <Alert variant="warning">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Low Credit Balance</AlertTitle>
            <AlertDescription>
              You have less than 10 credits remaining. 
              Purchase more to avoid transaction disruptions.
            </AlertDescription>
          </Alert>
        )}
        
        <Text muted>
          ℹ️ Credits purchased here can only be used at this branch
        </Text>
      </div>
    </CardContent>
    <CardFooter>
      <Button onClick={() => setBuyCreditDialog(true)}>
        <ShoppingCart className="mr-2 h-4 w-4" />
        Buy Credits
      </Button>
    </CardFooter>
  </Card>

  {/* Purchase History Tabs */}
  <Tabs defaultValue="credits">
    <TabsList>
      <TabsTrigger value="credits">Credit Purchases</TabsTrigger>
      <TabsTrigger value="quotas">Quota Top-ups</TabsTrigger>
      <TabsTrigger value="usage">Usage History</TabsTrigger>
    </TabsList>
    
    <TabsContent value="credits">
      <CreditHistoryTable branchId={branchId} />
    </TabsContent>
    
    <TabsContent value="quotas">
      <QuotaTopupHistoryTable branchId={branchId} showBusinessPurchases />
    </TabsContent>
    
    <TabsContent value="usage">
      <UsageHistoryChart branchId={branchId} />
    </TabsContent>
  </Tabs>
</BranchBillingPage>
```

**Key features:**
- Shows BOTH shared quota pool status AND branch credit balance
- Clearly distinguishes between business-wide quota and branch-specific credits
- Displays this branch's contribution to total quota usage
- Alerts for low quota/credits
- Purchase buttons for both credits and quota top-ups

#### 2. Buy Credits Dialog (Branch-Specific)

Similar to existing `/business/billing/credits` but:
- Metadata includes `branchId`
- Success URL returns to `/billing` (branch context)
- Warning: "These credits can only be used at this branch"

```typescript
// purchase-branch-credits.ts
await adapter.createCreditPurchaseLink({
  externalCustomerId: subscription.externalId,
  externalPriceId: selectedPackage.stripePriceId,
  creditAmount: selectedPackage.creditAmount,
  successUrl: `${appUrl}/billing?purchase=success`,
  cancelUrl: `${appUrl}/billing?purchase=cancelled`,
  metadata: {
    businessId,
    branchId,  // ← NEW: Associates purchase with branch
    userId,
    packageId: selectedPackage.id,
    creditAmount: String(selectedPackage.creditAmount),
    source: 'branch_credit_purchase',
  },
})
```

#### 3. Buy Quota Top-up Dialog (NEW)

**Packages**:
```typescript
const QUOTA_TOPUP_PACKAGES = [
  { id: 'quota_100', label: '+100 Transactions', txAmount: 100, price: '₱150', stripePriceId: env.STRIPE_QUOTA_100_PRICE_ID },
  { id: 'quota_500', label: '+500 Transactions', txAmount: 500, price: '₱650', stripePriceId: env.STRIPE_QUOTA_500_PRICE_ID },
  { id: 'quota_1000', label: '+1000 Transactions', txAmount: 1000, price: '₱1,200', stripePriceId: env.STRIPE_QUOTA_1000_PRICE_ID },
]
```

**Flow**:
1. Branch manager clicks "Buy Quota Top-up"
2. Select package → Stripe Checkout
3. Webhook creates `BranchQuotaTopup` record
4. `fetch-entitlement-details.ts` sums active top-ups to calculate effective quota

### Server Functions

#### New: `purchase-branch-credits.ts`

```typescript
export const purchaseBranchCredits = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requirePermission(Permissions.BRANCH_MANAGE_BILLING)])
  .inputValidator((data: { packageId: string }) => z.object({ packageId: z.string() }).parse(data))
  .handler(async ({ data, context }) => {
    const { businessId, branchId, id: userId } = context.user
    
    // Validate package exists
    const selectedPackage = CREDIT_PACKAGES.find(pkg => pkg.id === data.packageId)
    if (!selectedPackage) throw new Error('Invalid package')
    
    // Create Stripe checkout with branchId in metadata
    const result = await adapter.createCreditPurchaseLink({
      metadata: {
        businessId,
        branchId,  // ← Associates with branch
        creditAmount: String(selectedPackage.creditAmount),
        source: 'branch_credit_purchase',
      },
      // ... other params
    })
    
    return { success: true, checkoutUrl: result.url }
  })
```

#### New: `purchase-branch-quota-topup.ts`

```typescript
export const purchaseBranchQuotaTopup = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requirePermission(Permissions.BRANCH_MANAGE_BILLING)])
  .inputValidator((data: { packageId: string, duration?: 'monthly' | 'perpetual' }) => ...)
  .handler(async ({ data, context }) => {
    const { businessId, branchId } = context.user
    
    // Validate package
    const selectedPackage = QUOTA_TOPUP_PACKAGES.find(pkg => pkg.id === data.packageId)
    
    // Calculate expiry
    const expiresAt = data.duration === 'monthly' 
      ? dayjs().add(1, 'month').toDate() 
      : null  // null = perpetual
    
    // Create Stripe checkout
    const result = await adapter.createOneTimePaymentLink({
      metadata: {
        businessId,
        branchId,
        txAmount: String(selectedPackage.txAmount),
        expiresAt: expiresAt?.toISOString() ?? 'perpetual',
        source: 'branch_quota_topup',
      },
      // ... other params
    })
    
    return { success: true, checkoutUrl: result.url }
  })
```

#### Update: `fetch-entitlement-details.ts`

```typescript
// SHARED QUOTA MODEL: Calculate business-level quota status

// 1. Get base quota from subscription
const baseQuota = subscription.plan.includedTxPerMonth

// 2. Sum ALL active quota top-ups (business-wide, including branch purchases)
const activeTopups = await rootPrisma.branchQuotaTopup.aggregate({
  where: {
    businessId,
    OR: [
      { expiresAt: null },  // Perpetual top-ups
      { expiresAt: { gte: new Date() } },  // Not expired yet
    ]
  },
  _sum: { additionalTx: true }
})

const topupQuota = activeTopups._sum.additionalTx || 0
const totalBusinessQuota = baseQuota + topupQuota

// 3. Sum usage across ALL branches in current period
const currentPeriodStart = dayjs().startOf('month').toDate()

const totalUsage = await rootPrisma.usageCounter.aggregate({
  where: {
    businessId,
    billingPeriodStart: currentPeriodStart
  },
  _sum: { txCount: true }
})

const totalTxUsed = totalUsage._sum.txCount || 0

// 4. Get THIS branch's usage (for display)
const branchUsage = await rootPrisma.usageCounter.findUnique({
  where: {
    businessId_branchId_billingPeriodStart: {
      businessId,
      branchId,
      billingPeriodStart: currentPeriodStart
    }
  },
  select: { txCount: true }
})

const branchTxUsed = branchUsage?.txCount || 0

// Return entitlement summary
return {
  // Business-level quota (shared across branches)
  txQuota: totalBusinessQuota,
  txQuotaBase: baseQuota,
  txQuotaTopup: topupQuota,
  txUsedTotal: totalTxUsed,
  txRemainingTotal: Math.max(0, totalBusinessQuota - totalTxUsed),
  
  // This branch's contribution
  txUsedBranch: branchTxUsed,
  txUsedBranchPercent: totalTxUsed > 0 ? (branchTxUsed / totalTxUsed) * 100 : 0,
  
  // Status flags
  isQuotaExhausted: totalTxUsed >= totalBusinessQuota,
  isQuotaNearLimit: totalTxUsed >= totalBusinessQuota * 0.8,  // 80% threshold
  
  // ... other entitlement fields (credits, branches, etc.)
}
```

### Webhook Changes

#### `stripe-webhook-handler.ts` updates

**checkout.session.completed handler**:

```typescript
const metadata = session.metadata

// Idempotency check — prevent double-processing on webhook retry
const existingCredit = await prisma.creditLedger.findUnique({
  where: { stripeSessionId: session.id }
})
const existingTopup = await prisma.branchQuotaTopup.findUnique({
  where: { stripeSessionId: session.id }
})

if (existingCredit || existingTopup) {
  console.log(`[webhook] Session ${session.id} already processed, skipping`)
  return { success: true, skipped: true }
}

if (metadata.source === 'branch_credit_purchase') {
  // Branch credit purchase
  const { businessId, branchId, creditAmount, userId } = metadata
  
  // Get current branch balance
  const latestEntry = await prisma.creditLedger.findFirst({
    where: { businessId, branchId },
    orderBy: { createdAt: 'desc' }
  })
  
  const previousBalance = latestEntry?.balanceAfter ?? 0
  
  // Create ledger entry with idempotency key
  await prisma.creditLedger.create({
    data: {
      businessId,
      branchId,
      amount: Number(creditAmount),
      balanceAfter: previousBalance + Number(creditAmount),
      eventType: 'PURCHASE',
      stripeSessionId: session.id,  // ← Idempotency key
      metadata: {
        userId,
        packageId: metadata.packageId,
        stripeSessionId: session.id,
      }
    }
  })
  
  console.log(`[webhook] ✅ Branch credit purchase: ${creditAmount} credits added to branch ${branchId}`)
}

if (metadata.source === 'branch_quota_topup') {
  // Branch quota top-up purchase (ADDS TO SHARED POOL)
  const { businessId, branchId, txAmount, expiresAt, userId } = metadata
  
  await prisma.branchQuotaTopup.create({
    data: {
      businessId,
      branchId: branchId || null,  // ← Can be null if business-level purchase
      additionalTx: Number(txAmount),
      expiresAt: expiresAt === 'perpetual' ? null : new Date(expiresAt),
      purchasedBy: userId,
      stripeSessionId: session.id,  // ← Idempotency key
      stripePriceId: session.line_items?.data[0]?.price?.id,
      amountPaid: session.amount_total,
      currency: session.currency?.toUpperCase(),
    }
  })
  
  console.log(`[webhook] ✅ Quota top-up: +${txAmount} TX added to business ${businessId} shared pool (purchased by branch ${branchId || 'business'})`)
  
  // Optional: Send notification to business owner
  // await notifyQuotaTopupSuccess({ businessId, branchId, txAmount })
}

if (metadata.source === 'business_quota_topup') {
  // Business-level quota purchase (rare, but supported)
  const { businessId, txAmount, expiresAt, userId } = metadata
  
  await prisma.branchQuotaTopup.create({
    data: {
      businessId,
      branchId: null,  // ← NULL indicates business-level purchase
      additionalTx: Number(txAmount),
      expiresAt: expiresAt === 'perpetual' ? null : new Date(expiresAt),
      purchasedBy: userId,
      stripeSessionId: session.id,
      stripePriceId: session.line_items?.data[0]?.price?.id,
      amountPaid: session.amount_total,
      currency: session.currency?.toUpperCase(),
    }
  })
  
  console.log(`[webhook] ✅ Business quota top-up: +${txAmount} TX added to shared pool`)
}
```

**Important notes:**
- All quota top-ups (whether purchased by business or branch) go into the SHARED pool
- `branchId` tracks WHO purchased it (for reporting/auditing)
- Quota calculation sums ALL top-ups regardless of `branchId`
- This enables transparency: "Branch A purchased +500 TX, benefiting all branches"

### Permission Changes

**New permissions needed**:

```typescript
// In permission-keys.ts
export const Permissions = {
  // ... existing permissions
  
  BRANCH_VIEW_BILLING: 'branch:view_billing',
  BRANCH_MANAGE_BILLING: 'branch:manage_billing',  // Purchase credits/quota
} as const
```

**Permission assignment**:
- `OWNER`, `ADMIN`: Both view and manage
- `SUPERVISOR`: View only (can see usage, but can't purchase)
- `CASHIER`: None (no billing access)

### Navigation Changes

**Sidebar**:

```typescript
// For single-branch businesses
{
  title: 'Business',
  items: [
    { title: 'Overview', url: '/business' },
    { title: 'Capabilities', url: '/business/capabilities' },
    { title: 'Billing', url: '/billing' },  // ← Branch billing (was /business/billing)
    // ... other items
  ]
}

// For multi-branch businesses (branch context)
{
  title: 'Settings',
  items: [
    { title: 'Branch Settings', url: '/settings' },
    { title: 'Billing', url: '/billing' },  // ← Branch billing
  ]
}

// For multi-branch businesses (business context at /business/*)
{
  title: 'Billing',
  url: '/business/billing',  // ← Business-level billing (consolidated)
}
{
  title: 'Branches',
  url: '/business/branches',  // ← Includes quota limit management
}
```

---

### Branch Limit Management UI

**Location**: `/business/branches` page

**For single-branch businesses:**
- No limit configuration UI shown
- Branch limit is automatically managed
- Display info message: "Your branch automatically uses the full business quota (X TX/month)"

**For multi-branch businesses:**

```typescript
// Branch table with inline limit editing
<DataTable>
  <TableHeader>
    <TableRow>
      <TableHead>Branch Name</TableHead>
      <TableHead>Location</TableHead>
      <TableHead>Usage This Period</TableHead>
      <TableHead>Branch Limit</TableHead>
      <TableHead>Actions</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {branches.map(branch => (
      <TableRow key={branch.id}>
        <TableCell>{branch.name}</TableCell>
        <TableCell>{branch.address}</TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <span>{branch.txUsed} TX</span>
            <Progress 
              value={(branch.txUsed / branch.txQuotaLimit) * 100} 
              className="w-20"
            />
          </div>
        </TableCell>
        <TableCell>
          <LimitEditor 
            branchId={branch.id}
            currentLimit={branch.txQuotaLimit}
            totalBusinessQuota={businessQuota}
            onUpdate={handleLimitUpdate}
          />
        </TableCell>
        <TableCell>
          <Button variant="ghost" size="sm">Edit</Button>
        </TableCell>
      </TableRow>
    ))}
  </TableBody>
</DataTable>

{/* Summary card */}
<Card>
  <CardHeader>
    <CardTitle>Quota Distribution Summary</CardTitle>
  </CardHeader>
  <CardContent>
    <div className="space-y-2">
      <div className="flex justify-between">
        <Label>Business Total Quota:</Label>
        <Value>{businessQuota} TX/month</Value>
      </div>
      <div className="flex justify-between">
        <Label>Sum of Branch Limits:</Label>
        <Value>{sumOfLimits} TX/month</Value>
      </div>
      
      {sumOfLimits > businessQuota && (
        <Alert variant="info">
          <Info className="h-4 w-4" />
          <AlertTitle>Soft Overallocation</AlertTitle>
          <AlertDescription>
            Branch limits sum to more than business quota. This is OK - branches 
            compete for shared pool capacity.
          </AlertDescription>
        </Alert>
      )}
      
      {sumOfLimits < businessQuota && (
        <Alert variant="info">
          <Info className="h-4 w-4" />
          <AlertTitle>Reserved Capacity</AlertTitle>
          <AlertDescription>
            {businessQuota - sumOfLimits} TX reserved (branch limits sum to less than quota).
          </AlertDescription>
        </Alert>
      )}
    </div>
  </CardContent>
</Card>
```

**Limit Editor Component:**

```typescript
function LimitEditor({ 
  branchId, 
  currentLimit, 
  totalBusinessQuota, 
  onUpdate 
}: LimitEditorProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [limit, setLimit] = useState(currentLimit)
  
  return (
    <div className="flex items-center gap-2">
      {isEditing ? (
        <>
          <Input
            type="number"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="w-24"
            min={0}
          />
          <span className="text-sm text-muted-foreground">TX</span>
          <Button 
            size="sm" 
            onClick={() => {
              onUpdate(branchId, limit)
              setIsEditing(false)
            }}
          >
            Save
          </Button>
          <Button 
            size="sm" 
            variant="ghost"
            onClick={() => {
              setLimit(currentLimit)
              setIsEditing(false)
            }}
          >
            Cancel
          </Button>
        </>
      ) : (
        <>
          <span className="font-medium">{currentLimit.toLocaleString()} TX</span>
          <Button 
            size="sm" 
            variant="ghost"
            onClick={() => setIsEditing(true)}
          >
            <Pencil className="h-3 w-3" />
          </Button>
        </>
      )}
    </div>
  )
}
```

**Server function:**

```typescript
export const updateBranchQuotaLimit = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requirePermission(Permissions.BUSINESS_MANAGE_BRANCHES)])
  .inputValidator((data: { branchId: string, limit: number }) => 
    z.object({ 
      branchId: z.string(), 
      limit: z.number().int().min(0) 
    }).parse(data)
  )
  .handler(async ({ data, context }) => {
    const { businessId } = context.user
    
    // Verify branch belongs to this business
    const branch = await prisma.branch.findFirst({
      where: { id: data.branchId, businessId }
    })
    
    if (!branch) {
      throw new Error('Branch not found')
    }
    
    // Prevent editing single-branch business limits (managed automatically)
    const branchCount = await prisma.branch.count({ where: { businessId }})
    if (branchCount === 1) {
      throw new Error('Single-branch limits are managed automatically')
    }
    
    // Update limit
    await prisma.branch.update({
      where: { id: data.branchId },
      data: { txQuotaLimit: data.limit }
    })
    
    return { success: true }
  })
```

---

## Implementation Plan

### Phase 1: Business Billing Route Reorganization

#### Step 1.1: Create New Routes
- [ ] Create `/business/subscription/` route (index.tsx)
- [ ] Create `/business/subscription/addons/` page
- [ ] Move `/business/billing/plans/` → `/business/subscription/plans/`
- [ ] Move `/business/billing/pricing/` → `/business/subscription/pricing/`
- [ ] Move `/business/billing/success/` → `/business/subscription/success/`

#### Step 1.2: Simplify Billing Overview
- [ ] Refactor `/business/billing/index.tsx` to be a simple overview dashboard
- [ ] Remove complex subscription management logic (move to `/subscription/`)
- [ ] Add quick links to subscription, invoices, credits, quotes

#### Step 1.3: Update Navigation
- [ ] Update sidebar links
- [ ] Update all internal links (CTAs, buttons, breadcrumbs)
- [ ] Update success/cancel URLs in Stripe checkout sessions

#### Step 1.4: Testing
- [ ] Test all navigation paths
- [ ] Test Stripe checkout redirects
- [ ] Test cancellation flow
- [ ] Test reactivation flow

### Phase 2: Branch Billing Implementation

#### Step 2.1: Schema & Infrastructure
- [ ] Add `BranchQuotaTopup` model to Prisma schema
- [ ] Update `CreditLedger` to always require `branchId` (already done)
- [ ] Create Stripe products for quota top-ups
- [ ] Update webhook handler to support branch credit & quota purchases

#### Step 2.2: Server Functions
- [ ] Create `purchase-branch-credits.ts`
- [ ] Create `purchase-branch-quota-topup.ts`
- [ ] Update `fetch-entitlement-details.ts` to include top-up quota
- [ ] Create `fetch-branch-billing-history.ts`

#### Step 2.3: UI Components
- [ ] Create `/billing` route (branch billing dashboard)
- [ ] Create `BuyBranchCreditsDialog` component
- [ ] Create `BuyQuotaTopupDialog` component
- [ ] Create `BranchCreditHistoryTable` component
- [ ] Create `QuotaTopupHistoryTable` component

#### Step 2.4: Permissions & Navigation
- [ ] Add `BRANCH_VIEW_BILLING` and `BRANCH_MANAGE_BILLING` permissions
- [ ] Update sidebar to show branch billing link
- [ ] Update permission middleware

#### Step 2.5: Testing & Validation
- [ ] Test branch credit purchase flow
- [ ] Test quota top-up purchase flow
- [ ] Test webhook handling for both purchase types
- [ ] Test quota calculation with top-ups
- [ ] Test credit deduction from correct branch balance

---

## Detailed Specifications

### Business Billing Routes

#### `/business/billing/` (Overview Dashboard)

**Purpose**: High-level billing overview with quick links

**Content**:
```typescript
<BillingOverview>
  {/* Status Banner */}
  <StatusBanner status={status} trialEndsAt={trialEndsAt} />
  
  {/* Key Metrics - 3 cards */}
  <MetricsGrid>
    <Card title="Subscription">
      <PlanName>Pro Plan</PlanName>
      <Status>Active</Status>
      <Link to="/business/subscription">Manage →</Link>
    </Card>
    
    <Card title="Usage This Period">
      <UsageBar current={800} limit={1000} />
      <Link to="/business/subscription/addons">Add TX addon →</Link>
    </Card>
    
    <Card title="Credits">
      <Balance>{creditBalance}</Balance>
      <Link to="/business/billing/credits">Purchase →</Link>
    </Card>
  </MetricsGrid>
  
  {/* Quick Actions */}
  <QuickActions>
    <Link to="/business/subscription/plans">Change Plan</Link>
    <Link to="/business/billing/invoices">View Invoices</Link>
    <Link to="/business/subscription/addons">Manage Add-ons</Link>
    <Link to="/business/billing/quotes">Request Quote</Link>
  </QuickActions>
</BillingOverview>
```

---

#### `/business/subscription/` (Subscription Management Hub)

**Purpose**: Manage everything subscription-related (plan, add-ons, cancel)

**Content**:
```typescript
<SubscriptionManagement>
  {/* Current Plan Card */}
  <Card title="Your Plan">
    <PlanBadge>Pro Plan</PlanBadge>
    <PlanPrice>₱999/month</PlanPrice>
    <BillingCycle>Next bill: March 27, 2026</BillingCycle>
    
    {!cancelledAt && <Button to="/business/subscription/plans">Change Plan</Button>}
    {!cancelledAt && <Button onClick={openCancelDialog}>Cancel Subscription</Button>}
    {cancelledAt && <Button to="/business/subscription/plans">Reactivate</Button>}
  </Card>
  
  {/* Features Included */}
  <Card title="Features Included">
    <FeatureList>
      <Feature icon={Check}>1000 TX/month</Feature>
      <Feature icon={Check}>Up to 3 branches</Feature>
      <Feature icon={Check}>Unlimited employees</Feature>
      <Feature icon={Check}>Inventory management</Feature>
      <Feature icon={Check}>Sales reports</Feature>
    </FeatureList>
  </Card>
  
  {/* Active Add-ons */}
  <Card title="Add-ons">
    <AddonList>
      <Addon name="Extra Branch" price="₱99/mo" />
      <Addon name="+500 TX/month" price="₱149/mo" />
    </AddonList>
    <Button to="/business/subscription/addons">Manage Add-ons</Button>
  </Card>
  
  {/* Billing History */}
  <Card title="Recent Invoices">
    <InvoiceList limit={3} />
    <Link to="/business/billing/invoices">View all →</Link>
  </Card>
</SubscriptionManagement>
```

---

### Branch Billing Specifications

**No migration needed** (no live users per steering guidelines).

When seeding:
- All `CreditLedger` entries need `branchId`
- Existing business-level credit logic can remain as "business purchases for all branches" OR be removed entirely

## Business Rules

### Transaction Quota (Shared Pool with Branch Limits)
1. **Shared pool**: All branches draw from the same business-level quota
2. **Branch limits**: Each branch has configurable hard limit
3. **Smart defaults**: 
   - Single branch: Limit = total business quota (auto-updates)
   - Multi-branch: New branch default limit = total business quota
4. **Dual validation**: Transaction must pass BOTH checks:
   - Branch usage < branch limit ✅
   - Total business usage < business quota ✅
5. **Limit flexibility**: Limits can sum to more OR less than business quota
6. **Top-ups benefit all**: Quota top-ups add to shared pool (all branches benefit within their limits)

**Transaction validation flow:**
```typescript
async function validateTransaction(businessId: string, branchId: string) {
  // 1. Check branch-specific limit
  const branch = await prisma.branch.findUnique({ 
    where: { id: branchId },
    select: { txQuotaLimit: true }
  })
  
  const branchUsage = await getBranchUsageThisPeriod(businessId, branchId)
  const businessQuota = await getTotalBusinessQuota(businessId)
  
  // Determine effective branch limit
  const branchLimit = branch.txQuotaLimit ?? businessQuota
  
  if (branchUsage >= branchLimit) {
    throw new TransactionError(
      'BRANCH_LIMIT_EXCEEDED',
      `Branch quota limit reached (${branchLimit} TX/month)`
    )
  }
  
  // 2. Check shared business pool
  const totalUsage = await getTotalBusinessUsage(businessId)
  if (totalUsage >= businessQuota) {
    throw new TransactionError(
      'BUSINESS_QUOTA_EXHAUSTED',
      'Business transaction quota exhausted. Purchase quota top-up.'
    )
  }
  
  // 3. If using credit billing, check branch credits
  const creditBalance = await getBranchCreditBalance(businessId, branchId)
  if (subscription.billingModel === 'PREPAID' && creditBalance <= 0) {
    throw new TransactionError(
      'INSUFFICIENT_CREDITS',
      'Branch credit balance exhausted. Purchase credits.'
    )
  }
  
  // All checks passed
  return { allowed: true }
}
```

**Example scenarios:**

*Scenario 1: Branch limit reached, pool has capacity*
```
Business quota: 1500 TX (shared pool)
Branch A limit: 500 TX
Branch A usage: 500 TX
Total business usage: 800 TX

Branch A new transaction → ❌ BLOCKED (branch limit)
Reason: Branch A reached its 500 TX limit
Solution: Business owner can increase Branch A's limit
```

*Scenario 2: Pool exhausted, branch has capacity*
```
Business quota: 1500 TX (shared pool)
Branch A limit: 1000 TX
Branch A usage: 600 TX
Total business usage: 1500 TX (all branches combined)

Branch A new transaction → ❌ BLOCKED (business pool exhausted)
Reason: Shared pool is full (other branches used the rest)
Solution: Purchase quota top-up (benefits all branches)
```

*Scenario 3: Both checks pass*
```
Business quota: 1500 TX
Branch A limit: 800 TX
Branch A usage: 600 TX
Total business usage: 1200 TX

Branch A new transaction → ✅ ALLOWED
- Branch A: 600/800 (under limit) ✅
- Business: 1200/1500 (has capacity) ✅
```

### Credit Purchases (Isolated Model)
1. **Branch-scoped**: Credits purchased by a branch can only be used by that branch
2. **Non-transferable**: No credit transfers between branches (future enhancement)
3. **Persistent**: Credits don't expire unless business subscription ends
4. **Separate balances**: Each branch maintains independent credit ledger

### Quota Top-up Options
1. **Duration options**:
   - **Monthly**: Expires at end of current billing period
   - **Perpetual**: Never expires, stacks across periods
2. **Additive**: Multiple top-ups stack (e.g., +100 + +500 = +600 total bonus)
3. **Shared benefit**: Top-up purchased by any branch increases shared pool
4. **Within limits**: Each branch can use top-ups up to their individual limit

### Branch Limit Management
1. **Single-branch businesses**: 
   - Limit automatically set to total business quota
   - No UI for changing limit (not needed)
   - Auto-updates when plan changes or top-ups purchased
2. **Multi-branch businesses**:
   - Limits configured on `/business/branches` page
   - Owner can set any value (can exceed business quota)
   - No automatic updates when quota changes (manual control)
3. **Flexibility**:
   - Limits can sum to more than pool (soft overallocation)
   - Limits can sum to less than pool (reserved capacity)
   - Owner responsible for distribution strategy

### Notification Thresholds
- **80% branch limit**: Warning to branch manager
- **90% branch limit**: Critical warning to branch manager
- **100% branch limit**: Transaction blocked, notification sent
- **80% business quota**: Warning to business owner
- **90% business quota**: Critical notification to owner + all branch managers
- **100% business quota**: All transactions blocked, urgent notification
- **Branch credit < 10**: Low credit warning to branch manager

## Future Enhancements

### Phase 3: Usage Analytics Dashboard
- **Cross-branch comparison**: Visual charts showing which branches use most quota
- **Trend analysis**: Predict when business will run out of quota
- **Smart recommendations**: "Branch A consistently uses 60% of quota. Consider upgrading plan or setting soft limit"
- **Cost attribution**: Show approximate cost per branch based on usage patterns

### Phase 4: Credit Pools & Transfers
- **Shared credit pool**: Business admin can create shared credit pool
- **Credit transfers**: Branch managers can request credit transfers from pool
- **Approval workflow**: Business owner approves credit redistribution
- **Transfer limits**: Set monthly transfer limits per branch

### Phase 5: Branch-Specific Plans
- **Individual subscriptions**: Each branch could have different plan tiers
- **Usage-based pricing**: High-volume branches get Pro, low-volume get Startup
- **Flexible billing**: Requires moving `BusinessSubscription` to branch level
- **Complex but powerful**: Better cost optimization for franchises

### Phase 6: Advanced Quota Management (Hybrid Model)
- **Optional soft limits**: Business owner can set per-branch warnings
- **Hard limits**: Prevent single branch from monopolizing shared quota
- **Dynamic limits**: Automatically adjust limits based on historical usage
- **Quota reservations**: Reserve minimum quota for critical branches

### Phase 7: Multi-tier Credits
- **Credit types**: Regular credits vs priority credits (never expire)
- **Credit packages**: Bulk discounts for large purchases
- **Subscription credits**: Monthly credit allotment included in plan
- **Rollover credits**: Unused credits roll to next period (limited)

---

## Implementation Checklist

### Pre-implementation
- [x] Design shared quota pool architecture
- [x] Design isolated credit model
- [x] Document business rules and validation logic
- [ ] Create Stripe products for quota top-ups (production)
- [ ] Design notification system for quota/credit alerts
- [ ] Create mockups for branch billing UI

### Phase 1: Business Billing Route Reorganization

#### Step 1.1: Create New Routes
- [ ] Create `/business/subscription/` route (index.tsx)
- [ ] Create `/business/subscription/addons/` page
- [ ] Move `/business/billing/plans/` → `/business/subscription/plans/`
- [ ] Move `/business/billing/pricing/` → `/business/subscription/pricing/`
- [ ] Move `/business/billing/success/` → `/business/subscription/success/`

#### Step 1.2: Simplify Billing Overview
- [ ] Refactor `/business/billing/index.tsx` to be a simple overview dashboard
- [ ] Remove complex subscription management logic (move to `/subscription/`)
- [ ] Add quick links to subscription, invoices, credits, quotes
- [ ] Add consolidated multi-branch usage view

#### Step 1.3: Update Navigation
- [ ] Update sidebar links
- [ ] Update all internal links (CTAs, buttons, breadcrumbs)
- [ ] Update success/cancel URLs in Stripe checkout sessions

#### Step 1.4: Testing
- [ ] Test all navigation paths
- [ ] Test Stripe checkout redirects
- [ ] Test cancellation flow
- [ ] Test reactivation flow

### Phase 2: Branch Billing Implementation

#### Step 2.1: Schema & Infrastructure
- [ ] Add `BranchQuotaTopup` model to Prisma schema
- [ ] Add `Branch.txQuotaLimit` field (nullable Int)
- [ ] Add `stripeSessionId` to `CreditLedger` (idempotency)
- [ ] Run migration (no data migration needed)
- [ ] Create Stripe products for quota top-ups (test mode first)
- [ ] Add environment variables for Stripe price IDs
- [ ] Add automatic limit management for single-branch businesses

#### Step 2.2: Server Functions
- [ ] Create `purchase-branch-credits.ts`
- [ ] Create `purchase-branch-quota-topup.ts`
- [ ] Update `fetch-entitlement-details.ts` to calculate shared quota
- [ ] Create `fetch-branch-billing-history.ts`
- [ ] Create `fetch-business-quota-breakdown.ts` (for multi-branch view)
- [ ] Update webhook handler for branch purchases

#### Step 2.3: Core Business Logic
- [ ] Create `validateTransactionQuota()` helper (checks branch limit + pool)
- [ ] Update transaction processing to check both branch limit and shared quota pool
- [ ] Implement quota calculation with top-ups
- [ ] Add quota exhaustion handling (differentiate branch vs pool)
- [ ] Implement credit balance validation per branch
- [ ] Add automatic branch limit updates for single-branch businesses
- [ ] Create helper to calculate effective branch limit (uses txQuotaLimit or falls back to business quota)

#### Step 2.4: UI Components
- [ ] Create `/billing` route (branch billing dashboard)
- [ ] Create `BusinessQuotaCard` component (shows shared pool)
- [ ] Create `BranchCreditCard` component (shows branch credits)
- [ ] Create `BuyBranchCreditsDialog` component
- [ ] Create `BuyQuotaTopupDialog` component
- [ ] Create `CreditHistoryTable` component
- [ ] Create `QuotaTopupHistoryTable` component
- [ ] Create `UsageHistoryChart` component

#### Step 2.5: Business-Level Views
- [ ] Update `/business/billing/` to show consolidated quota status
- [ ] Add multi-branch quota breakdown table with per-branch limits
- [ ] Show which branches purchased which top-ups
- [ ] Add "Top-up purchased by Branch A benefits all branches" messaging
- [ ] **Add branch limit management to `/business/branches` page**
- [ ] Create `BranchLimitEditor` inline component
- [ ] Add quota distribution summary card (shows limit totals vs pool)
- [ ] Handle single-branch case (hide limit UI, show auto-managed message)

#### Step 2.6: Permissions & Navigation
- [ ] Add `BRANCH_VIEW_BILLING` permission
- [ ] Add `BRANCH_MANAGE_BILLING` permission
- [ ] Update permission middleware
- [ ] Update sidebar to show branch billing link
- [ ] Add permission checks to branch billing routes

#### Step 2.7: Notifications
- [ ] Implement branch limit threshold notifications (80%, 90%, 100%)
- [ ] Implement business quota threshold notifications (80%, 90%, 100%)
- [ ] Differentiate between "branch limit" vs "pool exhausted" messages
- [ ] Implement low credit warnings (< 10 credits)
- [ ] Add email templates for quota/credit alerts
- [ ] Create in-app notification system
- [ ] Add notification when single-branch limit auto-updates

#### Step 2.8: Testing & Validation
- [ ] Test branch credit purchase flow end-to-end
- [ ] Test quota top-up purchase flow end-to-end
- [ ] Test webhook handling for both purchase types
- [ ] Test idempotency (retry webhook calls)
- [ ] Test quota calculation with multiple top-ups
- [ ] Test credit deduction from correct branch balance
- [ ] **Test branch limit enforcement (transaction blocked at limit)**
- [ ] **Test dual validation (branch limit + pool exhaustion scenarios)**
- [ ] **Test single-branch automatic limit updates**
- [ ] **Test multi-branch limit management UI**
- [ ] **Test soft overallocation scenarios (limits exceed pool)**
- [ ] **Test reserved capacity scenarios (limits less than pool)**
- [ ] Test multi-branch quota exhaustion scenarios
- [ ] Test permission enforcement
- [ ] Load test with concurrent transactions at limit boundaries

---

## Technical Specifications

### Quota Top-up Packages

```typescript
// src/lib/billing/quota-topup-packages.ts

export const QUOTA_TOPUP_PACKAGES = [
  {
    id: 'quota_100',
    label: '+100 Transactions',
    txAmount: 100,
    price: 150, // PHP cents (₱1.50)
    priceDisplay: '₱150',
    stripePriceId: env.STRIPE_QUOTA_100_PRICE_ID,
    recommended: false,
  },
  {
    id: 'quota_500',
    label: '+500 Transactions',
    txAmount: 500,
    price: 650, // ₱6.50 (13% discount vs buying 5x100)
    priceDisplay: '₱650',
    stripePriceId: env.STRIPE_QUOTA_500_PRICE_ID,
    recommended: true,
    savings: '₱100 savings',
  },
  {
    id: 'quota_1000',
    label: '+1,000 Transactions',
    txAmount: 1000,
    price: 1200, // ₱12.00 (20% discount)
    priceDisplay: '₱1,200',
    stripePriceId: env.STRIPE_QUOTA_1000_PRICE_ID,
    recommended: false,
    savings: '₱300 savings',
  },
  {
    id: 'quota_5000',
    label: '+5,000 Transactions',
    txAmount: 5000,
    price: 5500, // ₱55.00 (27% discount)
    priceDisplay: '₱5,500',
    stripePriceId: env.STRIPE_QUOTA_5000_PRICE_ID,
    recommended: false,
    savings: '₱2,000 savings',
    badge: 'Best Value',
  },
] as const

export type QuotaTopupPackage = typeof QUOTA_TOPUP_PACKAGES[number]
```

### Environment Variables

```bash
# .env.example additions

# Quota Top-up Stripe Price IDs (test mode)
STRIPE_QUOTA_100_PRICE_ID=price_xxx_test_100tx
STRIPE_QUOTA_500_PRICE_ID=price_xxx_test_500tx
STRIPE_QUOTA_1000_PRICE_ID=price_xxx_test_1000tx
STRIPE_QUOTA_5000_PRICE_ID=price_xxx_test_5000tx

# Quota Top-up Stripe Price IDs (production)
STRIPE_QUOTA_100_PRICE_ID_PROD=price_xxx_live_100tx
STRIPE_QUOTA_500_PRICE_ID_PROD=price_xxx_live_500tx
STRIPE_QUOTA_1000_PRICE_ID_PROD=price_xxx_live_1000tx
STRIPE_QUOTA_5000_PRICE_ID_PROD=price_xxx_live_5000tx
```

### API Endpoints Summary

```typescript
// Branch Billing
POST /api/branch/billing/purchase-credits
POST /api/branch/billing/purchase-quota-topup
GET  /api/branch/billing/history
GET  /api/branch/billing/status

// Business Billing (multi-branch view)
GET  /api/business/billing/quota-breakdown  // Shows per-branch usage
GET  /api/business/billing/quota-topups     // Lists all top-ups with purchaser
GET  /api/business/billing/credit-summary   // Consolidated credits across branches

// Entitlements (updated)
GET  /api/entitlements  // Now returns shared quota + branch credits
```

---

## Frequently Asked Questions

### General Architecture

**Q: Why shared pool with branch limits instead of purely shared or purely isolated?**

A: This hybrid approach provides the best of both worlds:
- **Shared pool** = Efficient utilization (no wasted quota at slow branches)
- **Branch limits** = Protection against monopolization (one branch can't exhaust pool for all)
- **Flexible limits** = Owner can allocate based on actual branch needs (unequal distribution)

Single-branch businesses get the simplicity of automatic management, while multi-branch businesses get control.

**Q: How do branch limits work with the shared pool?**

A: Think of it as two checks:
1. **Branch limit**: Maximum this branch can use (regardless of pool capacity)
2. **Shared pool**: Maximum all branches can use combined

Both checks must pass. Whichever is hit first blocks the transaction.

Example: Branch has 500 TX limit, pool has 200 TX remaining → Branch can only use 200 TX more

**Q: What happens when shared quota is exhausted?**

A: All branches are blocked from processing transactions until:
1. The billing period resets (monthly), OR
2. Business/any branch purchases a quota top-up

The dashboard shows which branches consumed the most quota and which are at their limits.

**Q: Can branch limits exceed the business quota?**

A: Yes! This is called "soft overallocation" and it's intentional:

```
Business quota: 1000 TX
Branch A limit: 600 TX
Branch B limit: 600 TX
Total limits: 1200 TX (exceeds quota by 200 TX)
```

This is fine because branches compete for the shared 1000 TX pool. Setting high limits gives branches flexibility, knowing the pool is the real constraint.

**Q: Can a branch purchase credits for another branch?**

A: No. Credits purchased by Branch A can only be used by Branch A. This is intentional for accounting clarity. Future enhancement may add approved credit transfers.

### Branch Limits

**Q: How are branch limits set for single-branch businesses?**

A: For single-branch businesses, the limit is **automatically** set to match the total business quota. There's no configuration UI - it just works.

When your business quota changes (plan upgrade, quota top-up), the branch limit automatically updates. No manual intervention needed.

**Q: How do I set branch limits for multi-branch businesses?**

A: Go to `/business/branches` page. Each branch has an editable "Branch Limit" column. Click the edit icon, enter the new limit, and save.

When you add a new branch, its default limit is set to the total business quota. You can adjust it immediately or later.

**Q: What's a good strategy for setting branch limits?**

A: Common approaches:

1. **Equal distribution**: Each branch gets quota ÷ branch count
   - 1500 TX ÷ 3 branches = 500 TX each
   - Fair but may not match actual usage patterns

2. **Usage-based**: Allocate based on historical usage
   - Busy branch: 800 TX, Medium: 500 TX, Slow: 200 TX
   - Total: 1500 TX (matches pool exactly)

3. **Soft overallocation**: Set high limits, let pool be the constraint
   - Each branch: 1000 TX limit (3 branches × 1000 = 3000 TX)
   - Pool: 1500 TX (real constraint)
   - Gives branches flexibility, shared pool prevents overuse

4. **Reserved capacity**: Set conservative limits
   - Each branch: 400 TX (3 branches × 400 = 1200 TX)
   - Pool: 1500 TX (300 TX reserved buffer)
   - Ensures no branch can monopolize

**Q: Can I change branch limits anytime?**

A: Yes! For multi-branch businesses, you can adjust limits anytime on the `/business/branches` page. Changes take effect immediately.

Single-branch businesses don't need manual changes - limits auto-update with quota changes.

**Q: What happens if a branch hits its limit mid-month?**

A: Transactions at that branch are blocked until:
1. Next billing period (limit resets monthly), OR
2. Business owner increases that branch's limit, OR  
3. Branch waits for other branches to stop using quota (if pool has capacity)

Other branches with headroom can continue transacting.

**Q: Do branch limits reset monthly?**

A: Yes, usage counters reset at the start of each billing period (monthly). All branches start fresh with their full limits.

**Q: If Branch A purchases a quota top-up, does it benefit all branches?**

A: Yes! All quota top-ups (regardless of who purchases them) go into the shared business pool. This is tracked transparently:
- Dashboard shows "Purchased by Branch A: +500 TX (benefits all branches)"
- Business owner can see which branches are contributing vs consuming

**Important**: Even though the quota pool increases, each branch is still constrained by their individual limit. The top-up gives more pool capacity, but branches can't exceed their limits.

Example:
```
Before top-up:
- Business pool: 1000 TX
- Branch A limit: 500 TX, used 400 TX
- Branch B limit: 500 TX, used 500 TX (at limit)

Branch A purchases +500 TX top-up:
- Business pool: 1500 TX (increased)
- Branch A limit: 500 TX, used 400 TX (can use 100 more)
- Branch B limit: 500 TX, used 500 TX (still at limit, can't use more)

Branch B is still blocked until owner increases Branch B's limit.
```

**Q: Do quota top-ups expire?**

A: Depends on the package selected:
- **Monthly**: Expires at end of current billing period (unused quota lost)
- **Perpetual**: Never expires, stacks across months (until subscription ends)

**Q: Can we get refunds for unused quota top-ups?**

A: No. Quota top-ups are non-refundable once purchased. Choose monthly packages if you're unsure about future usage.

**Q: Should I increase my plan or buy top-ups?**

A: Rule of thumb:
- **Consistent high usage**: Upgrade plan (better value long-term)
- **Temporary spike**: Buy top-up (one-time need)
- **Uncertain growth**: Try top-ups first, then upgrade if usage stays high

### Credit Management

**Q: Why can't we have a shared credit pool like quotas?**

A: Credits are prepaid funds that need clear financial attribution for:
- Per-branch profit & loss tracking
- Accounting and auditing requirements
- Branch manager accountability

Shared credits would muddy these waters. Future enhancement may add OPTIONAL shared pools with transfer approval workflows.

**Q: What happens to branch credits if subscription is cancelled?**

A: When a subscription is cancelled:
- Unused credits are lost (no refunds)
- Branches should use remaining credits before cancellation
- We'll add a warning when cancelling with remaining credits

**Q: Can business owners transfer credits between branches?**

A: Not in Phase 2. Phase 4 will add:
- Optional shared credit pool
- Approval workflow for transfers
- Transfer limits per branch

### Multi-Branch Scenarios

**Q: We have 5 branches but only 1 is busy. How should we set limits?**

A: Perfect use case for the hybrid model! Set high limits for the busy branch, lower limits for others:

```
Business quota: 1000 TX
Branch A (busy):    700 TX limit → uses 650 TX
Branch B-E (slow):  100 TX each  → use 50 TX each (200 total)
Total limits: 1100 TX (soft overallocation)
Total used: 850/1000 TX (efficient)
```

This gives the busy branch the capacity it needs while ensuring slow branches don't waste allocation.

**Q: How do I prevent one branch from monopolizing the quota?**

A: **This is now built-in!** Set appropriate branch limits on the `/business/branches` page.

Example:
- Business quota: 1500 TX
- Branch A (can be problematic): 500 TX limit
- Branch B: 600 TX limit
- Branch C: 600 TX limit

Branch A cannot use more than 500 TX even if the pool has capacity. Problem solved!

**Q: How do we handle a branch that consistently hits its limit?**

A: Options:
1. **Increase branch limit**: Go to `/business/branches`, increase that branch's limit
2. **Purchase quota top-up**: Increases shared pool capacity
3. **Upgrade plan**: Get more base quota for all branches
4. **Investigate usage**: Is the branch actually that busy, or is there waste?

### Billing & Payments

**Q: Can branches use different payment methods?**

A: No. All purchases (credits & quota) are charged to the business's Stripe customer account. Branch managers initiate purchases, but the business card is charged.

Future enhancement may add per-branch payment methods for larger franchises.

**Q: Will branches get invoices for their purchases?**

A: Invoices are sent to business owner email (Stripe customer). Branch managers can view purchase history in their branch billing dashboard.

Future enhancement may add branch-specific invoice downloads.

**Q: How are prices determined for quota top-ups?**

A: Pricing includes bulk discounts:
- 100 TX: ₱150 (₱1.50 per TX)
- 500 TX: ₱650 (₱1.30 per TX) - 13% discount
- 1000 TX: ₱1,200 (₱1.20 per TX) - 20% discount
- 5000 TX: ₱5,500 (₱1.10 per TX) - 27% discount

Larger packages = better value.

### Technical

**Q: What prevents a branch from purchasing credits/quota multiple times rapidly?**

A: Stripe checkout sessions use idempotency keys (`stripeSessionId`). If the webhook is called multiple times (retry), we check if that session was already processed and skip it.

**Q: How do we handle concurrent transactions at quota limit?**

A: Race condition handling:
1. Database transaction wraps quota check + increment
2. If multiple transactions arrive simultaneously, only those within quota succeed
3. Others fail with "quota exhausted" error
4. Frontend should implement retry logic with exponential backoff

**Q: Can we change from shared to isolated quota later?**

A: Yes, but requires significant refactoring:
1. Data migration (distribute current usage across branches)
2. UI changes (show per-branch quota instead of pool)
3. Business logic refactor
4. Migration of branch limits to isolated quotas

Going from isolated → shared → shared with limits was the design progression. **Recommendation**: The current hybrid model (shared pool + branch limits) should handle most scenarios. If it doesn't, discuss with architecture team before changing.

---

## Document History

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2026-08-27 | 1.0 | Initial draft with isolated quota model | - |
| 2026-08-28 | 2.0 | Changed to shared quota pool model, added visual diagrams, FAQ section | - |
| 2026-08-28 | 3.0 | **Final architecture**: Shared pool with per-branch limits (hybrid model). Added branch limit management UI, automatic limits for single-branch, smart defaults | - |

---

## Related Documents

- `per-branch-accounting.md` - Schema changes for per-branch usage tracking (prerequisite)
- `billing-models.md` - Original billing architecture (subscription vs prepaid)
- `subscription-tiers.md` - Plan details and pricing
- `stripe-integration.md` - Stripe webhook implementation guide

---

**Status**: ❌ **NOT IMPLEMENTED** - Planning Phase  
**Ready for Implementation**: ⏳ Pending final architecture review  
**Estimated Effort**: 3-4 weeks (Phase 1 + Phase 2)  
**Priority**: High (Required for multi-branch support)  
**Dependencies**: Per-branch accounting schema (✅ Completed)

---

**Last Updated**: August 28, 2026  
**Next Review**: Before Phase 2 implementation kickoff  
**Contact**: Architecture team for questions or feedback
