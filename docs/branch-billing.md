# Billing Architecture Overhaul

**Status**: ❌ **NOT IMPLEMENTED** - Planning Phase  
**Last Updated**: August 28, 2026  
**Scope**: Route reorganization + branch-level billing feature

---

## Overview

This document covers:
1. **Route Reorganization** - Clean up business billing structure
2. **Branch-Level Billing** - Add separate billing for branches to purchase transaction quota top-ups and prepaid credits independently

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

**New addition needed**:

```prisma
model BranchQuotaTopup {
  id                String   @id @default(cuid())
  businessId        String
  branchId          String
  
  additionalTx      Int      // Number of extra transactions purchased
  expiresAt         DateTime?  // null = perpetual, date = expires
  purchasedAt       DateTime @default(now())
  
  // Stripe payment tracking
  stripeSessionId   String?  @unique  // Prevents duplicate webhook processing
  stripePriceId     String?
  amountPaid        Int?     // Amount in cents
  
  @@index([businessId, branchId, expiresAt])
}

model CreditLedger {
  // ... existing fields
  stripeSessionId   String?  @unique  // ADD: Prevents duplicate credit grants on webhook retry
}
```

### Credit Isolation Models

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

#### 1. New Branch Billing Page (`/branch/billing` or `/billing`)

**Route**: `/billing` (branch context assumed from session)

**Sections**:

```typescript
// Branch Billing Dashboard
<BranchBillingPage>
  {/* Current Status Card */}
  <Card>
    <CardHeader>Your Branch Credits & Quota</CardHeader>
    <CardContent>
      <div>
        <Label>Credit Balance</Label>
        <Value>{branchCredits} credits</Value>
        {branchCredits < 10 && <Alert variant="warning">Low credits</Alert>}
      </div>
      <div>
        <Label>Transactions This Period</Label>
        <Value>{txUsed} / {txQuota}</Value>
        <Progress value={(txUsed / txQuota) * 100} />
        <Text muted>Includes base quota + active top-ups</Text>
      </div>
    </CardContent>
    <CardFooter>
      <Button onClick={() => setBuyCreditDialog(true)}>
        Buy Credits
      </Button>
      <Button onClick={() => setBuyQuotaDialog(true)}>
        Buy Quota Top-up
      </Button>
    </CardFooter>
  </Card>

  {/* Credit Purchase History */}
  <CreditHistoryTable branchId={branchId} />
  
  {/* Quota Top-up History */}
  <QuotaTopupHistoryTable branchId={branchId} />
</BranchBillingPage>
```

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
// Calculate effective transaction quota including top-ups
const baseQuota = subscription.plan.includedTxPerMonth

// Sum active quota top-ups for this branch
const activeTopups = await rootPrisma.branchQuotaTopup.findMany({
  where: {
    businessId,
    branchId,
    OR: [
      { expiresAt: null },  // Perpetual
      { expiresAt: { gte: new Date() } },  // Not expired yet
    ]
  },
  select: { additionalTx: true }
})

const topupQuota = activeTopups.reduce((sum, t) => sum + t.additionalTx, 0)
const effectiveQuota = baseQuota + topupQuota

// Return in entitlement summary
return {
  txQuota: effectiveQuota,
  txUsed: currentUsage.txCount,
  txRemaining: Math.max(0, effectiveQuota - currentUsage.txCount),
  // ... other fields
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
  const { businessId, branchId, creditAmount } = metadata
  
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
    }
  })
}

if (metadata.source === 'branch_quota_topup') {
  // Branch quota top-up purchase
  const { businessId, branchId, txAmount, expiresAt } = metadata
  
  await prisma.branchQuotaTopup.create({
    data: {
      businessId,
      branchId,
      additionalTx: Number(txAmount),
      expiresAt: expiresAt === 'perpetual' ? null : new Date(expiresAt),
      stripeSessionId: session.id,  // ← Idempotency key
      stripePriceId: session.line_items?.data[0]?.price?.id,
      amountPaid: session.amount_total,
    }
  })
}
```

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
```

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

### Credit Purchases
1. **Branch-scoped**: Credits purchased by a branch can only be used by that branch
2. **Non-transferable**: No credit transfers between branches (future enhancement)
3. **Persistent**: Credits don't expire unless business subscription ends

### Quota Top-ups
1. **Duration options**:
   - **Monthly**: Expires at end of current billing period
   - **Perpetual**: Never expires, stacks across periods
2. **Additive**: Multiple top-ups stack (e.g., +100 + +500 = +600 total bonus)
3. **Branch-scoped**: Each branch purchases independently

### Transaction Deduction Priority
1. Check branch-specific transaction quota (base + top-ups)
2. If prepaid credits billing model: deduct from branch credit balance
3. Fail if either quota or credits exhausted

## Future Enhancements

### Credit Pools & Transfers (Phase 4+)
- Business admin can create shared credit pool
- Branch managers can request credit transfers
- Approval workflow for credit redistribution

### Branch-Specific Plans (Phase 5+)
- Each branch could have different plan tiers
- High-volume branches get Pro, low-volume get Startup
- Requires moving `BusinessSubscription` to branch level

### Usage Analytics (Phase 3+)
- Compare branch performance
- Predict when branch will run out of quota/credits
- Recommend optimal top-up packages

---

**Last Updated**: 2026-08-27  
**Status**: Design Phase  
**Dependencies**: Per-branch accounting schema (already implemented)
