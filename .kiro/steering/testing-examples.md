---
inclusion: manual
---

# Testing Examples — Trial Configuration Case Study

This document demonstrates the three-layer testing strategy using the recent trial configuration fix as a concrete example. Use these patterns for similar cross-system consistency requirements.

## The Problem We Solved

**Issue:** Trial copy said "50 free transactions" but actual trial plan was configured for 1,000 transactions. User specification required 500 transaction allowance + 50 permanent credits.

**Root Cause:** Configuration drift between:
- Database seed files (`plans.csv`)
- UI copy (dashboard, register page)  
- Business logic constants (`COMPLIMENTARY_CREDITS`)
- Website marketing copy (`pricing.astro`)

## Three-Layer Solution

### Layer 1: Unit Tests — Verify Configuration Constants

**File:** `__tests__/unit/lib/complete-registration-trial-config.test.ts`

```ts
describe('Trial Configuration Constants', () => {
  it('COMPLIMENTARY_CREDITS is set to 50', () => {
    expect(COMPLIMENTARY_CREDITS).toBe(50)
  })
})

describe('Trial Plan Limits', () => {
  it('should expect trial plan to have 500 transactions per month', () => {
    const EXPECTED_TRIAL_TX_LIMIT = 500
    expect(EXPECTED_TRIAL_TX_LIMIT).toBe(500)
  })
})
```

**Purpose:** Document expected values and catch configuration drift.

**File:** `__tests__/unit/routes/trial-copy.test.tsx`

```ts
describe('Trial Copy Consistency', () => {
  const EXPECTED_TRIAL_COPY = '30-day free trial with 500 transactions plus 50 credits — no card required'

  it('copy includes 500 transactions', () => {
    expect(EXPECTED_TRIAL_COPY).toContain('500 transactions')
  })

  it('copy includes 50 credits', () => {
    expect(EXPECTED_TRIAL_COPY).toContain('50 credits')
  })

  it('copy distinguishes between transactions and credits', () => {
    expect(EXPECTED_TRIAL_COPY).toContain('transactions plus')
    expect(EXPECTED_TRIAL_COPY).toContain('credits')
  })
})
```

**Purpose:** Ensure marketing copy matches technical reality.

### Layer 2: Integration Tests — Verify System Coordination

**File:** `__tests__/integration/registration/trial-configuration.integration.test.ts`

```ts
it('trial plan has correct transaction limit', async () => {
  await withRollback(async () => {
    const trialPlan = await prisma.subscriptionPlan.findFirst({
      where: { name: 'Trial', isActive: true },
    })

    expect(trialPlan!.includedTxPerMonth).toBe(500)
    expect(trialPlan!.monthlyPrice).toBe(0) // Free trial
  })
})

it('grants correct amount of complimentary credits', async () => {
  await withRollback(async () => {
    const businessId = 'test-biz-002'

    await prisma.creditLedger.create({
      data: {
        businessId,
        eventType: CreditEventType.PROMOTIONAL,
        amount: 50,
        balanceAfter: 50,
        transactionId: null,
        note: 'Complimentary transactions on registration',
        actorId: 'system',
      },
    })

    const creditEntry = await prisma.creditLedger.findFirst({
      where: { businessId },
    })

    expect(creditEntry!.amount).toBe(50)
    expect(creditEntry!.eventType).toBe('PROMOTIONAL')
  })
})
```

**Purpose:** Verify database seeds, business logic, and registration flow produce correct data.

### Layer 3: E2E Tests — Verify Customer Experience

**File:** `__tests__/e2e/trial-experience.spec.ts`

```ts
test('register page shows correct trial copy', async ({ page }) => {
  await page.goto('/register')
  
  const EXPECTED_TRIAL_COPY = '30-day free trial with 500 transactions plus 50 credits — no card required'
  await expect(page.getByText(EXPECTED_TRIAL_COPY)).toBeVisible()
})

test('pricing page shows correct trial limits', async ({ page }) => {
  await page.goto('/pricing')
  
  const transactionRow = page.locator('tr:has-text("Transactions / mo")')
  await expect(transactionRow).toBeVisible()
  
  // Check that trial column shows 500 transactions
  const trialTransactionCell = transactionRow.locator('td').first()
  await expect(trialTransactionCell).toContainText('500')
})
```

**Purpose:** Ensure customers see consistent, accurate information across all touchpoints.

## Testing Pattern Analysis

### What Each Layer Caught

**Unit Tests:**
- ✅ Constants were correctly defined in code
- ✅ Copy formatting was consistent
- ✅ Business logic separation (transactions vs credits) was clear

**Integration Tests:**  
- ✅ Database seeded with correct plan limits
- ✅ Registration flow granted correct credit amounts
- ✅ Credit persistence worked correctly (no expiration)

**E2E Tests:**
- ✅ Customer-facing pages showed accurate information
- ✅ Marketing copy matched technical capabilities
- ✅ Pricing table reflected actual system limits

### What Would Have Been Missed With Only One Layer

**Only Unit Tests:** Database could still have wrong values, customers would see incorrect information.

**Only Integration Tests:** UI copy could still be wrong, customers would see inconsistent messaging.

**Only E2E Tests:** Edge cases in business logic might not be caught, false confidence about internal consistency.

## Reusable Patterns for Similar Issues

### Pattern: Configuration Consistency Across Systems

When you have the same business value represented in multiple places:

1. **Unit Test:** Document the canonical value and test that constants match
2. **Integration Test:** Verify the database/seeds contain the correct value  
3. **E2E Test:** Verify customers see the correct value in the UI

### Pattern: Copy-Code Alignment  

When marketing copy needs to match technical capabilities:

1. **Unit Test:** Test that copy constants contain expected claims
2. **Integration Test:** Test that backend can deliver on those claims
3. **E2E Test:** Test that UI displays the accurate copy to users

### Pattern: Multi-File Configuration

When a single business rule spans multiple files:

1. **Create a test that imports from all relevant files**
2. **Assert that the values match between files**  
3. **Document the relationship in comments**

```ts
// Example: Testing that trial duration is consistent
it('trial duration matches across configuration files', () => {
  const BILLING_CONFIG_DAYS = 30  // from billing-config-defaults.csv
  const SUBSCRIPTION_ENGINE_DAYS = 30  // from SubscriptionEngine default
  const UI_COPY_MENTION = '30-day'  // from dashboard copy
  
  expect(BILLING_CONFIG_DAYS).toBe(30)
  expect(SUBSCRIPTION_ENGINE_DAYS).toBe(30)
  expect(UI_COPY_MENTION).toContain('30-day')
})
```

## When to Use This Approach

### Apply This Pattern When:
- ✅ A business value appears in multiple systems (database, UI, business logic)
- ✅ Marketing copy makes specific promises about system capabilities  
- ✅ Configuration drift could mislead customers or break business operations
- ✅ Multiple team members work on related files independently

### Don't Over-Apply When:
- ❌ Value appears in only one place
- ❌ Configuration is purely internal (not customer-facing)
- ❌ System is simple enough that manual verification is sufficient

## Maintenance Strategy

### When Adding New Configuration Values:
1. Add unit test to document the expected value
2. Add integration test to verify it's applied correctly
3. Add E2E test if customers will see the value

### When Changing Existing Values:
1. Update unit tests first (they'll fail until you update all the places)
2. Update all the systems to make unit tests pass
3. Verify integration and E2E tests still pass with new values

### Red Flags (Add Tests Immediately):
- Different numbers in different files that should match
- Marketing copy that makes promises about system capabilities
- Configuration that affects billing or financial calculations
- Settings that determine customer experience or access levels

This layered approach prevents configuration drift and ensures customers always see accurate, consistent information about what the system actually provides.