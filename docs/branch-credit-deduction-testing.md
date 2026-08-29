# Branch Credit Deduction Testing - Detailed Test Scenarios

## Overview

This document provides comprehensive test scenarios for the branch credit deduction system integrated into POS transaction processing. The system validates branch transaction quotas and automatically deducts credits when quotas are exceeded.

## Test Environment Setup

### Database Preparation
```sql
-- Set up test branch with quota limit
UPDATE branches SET tx_quota_limit = 5 WHERE id = 'test-branch-id';

-- Add some test credits to the branch
INSERT INTO credit_ledger (id, business_id, branch_id, event_type, amount, balance_after, note, created_at)
VALUES (gen_random_uuid(), 'test-business-id', 'test-branch-id', 'PURCHASE', 10, 10, 'Test setup', NOW());

-- Verify setup
SELECT id, name, tx_quota_limit FROM branches WHERE id = 'test-branch-id';
SELECT * FROM credit_ledger WHERE branch_id = 'test-branch-id' ORDER BY created_at DESC LIMIT 5;
```

### Mock Data Configuration
```typescript
// Mock branch configuration for testing
const testBranch = {
  id: 'test-branch-id',
  name: 'Test Branch',
  txQuotaLimit: 5, // Set low limit for easy testing
}

// Mock credit ledger entry
const testCreditBalance = {
  branchId: 'test-branch-id', 
  balance: 10,
  lastUpdated: new Date(),
}

// Mock usage counter
const testUsageCounter = {
  businessId: 'test-business-id',
  branchId: 'test-branch-id',
  txCount: 0, // Start with no usage
  billingPeriodStart: new Date(),
  isClosed: false,
}
```

## Test Scenarios

### Scenario 1: Normal Transaction Within Quota

**Setup:**
- Branch quota: 5 transactions
- Current usage: 2 transactions
- Branch credits: 10

**Test Steps:**
1. Create POS transaction via `createPosTransaction()`
2. Verify branch validation passes
3. Confirm transaction processes successfully
4. Check usage counter increments to 3
5. Verify NO credit deduction occurs

**Expected Results:**
```typescript
// BranchValidationEngine.validateTransaction should return:
{
  allowed: true,
  requiresCredits: false,
  reason: "Branch usage 3/5"
}

// No CreditLedger entry created
// Transaction successful
// Usage counter: txCount = 3
```

### Scenario 2: Transaction at Quota Limit (Boundary Test)

**Setup:**
- Branch quota: 5 transactions
- Current usage: 4 transactions (at limit - 1)
- Branch credits: 10

**Test Steps:**
1. Create POS transaction
2. Verify transaction processes (usage becomes 5/5)
3. Confirm still within quota, no credits used

**Expected Results:**
```typescript
{
  allowed: true,
  requiresCredits: false,
  reason: "Branch usage 5/5"
}
```

### Scenario 3: Transaction Exceeds Quota - Credits Available

**Setup:**
- Branch quota: 5 transactions
- Current usage: 5 transactions (at limit)
- Branch credits: 10

**Test Steps:**
1. Create POS transaction (would be 6th)
2. Verify branch validation requires credits
3. Confirm transaction processes successfully
4. Check credit deduction occurs
5. Verify CreditLedger entry created

**Expected Results:**
```typescript
// Validation result:
{
  allowed: true,
  requiresCredits: true,
  reason: "Branch limit reached, using credits (10 available)",
  newCreditBalance: 9
}

// CreditLedger entry created:
{
  eventType: 'CONSUMED',
  amount: -1,
  balanceAfter: 9,
  transactionId: '<transaction-id>',
  note: 'Transaction processed using branch credit',
  branchId: 'test-branch-id',
  businessId: 'test-business-id'
}

// Transaction successful
// Console log: "[createPosTransaction] Branch credit deducted: { branchId, previousBalance: 10, newBalance: 9, reason: '...' }"
```

### Scenario 4: Transaction Exceeds Quota - No Credits

**Setup:**
- Branch quota: 5 transactions
- Current usage: 5 transactions
- Branch credits: 0

**Test Steps:**
1. Create POS transaction
2. Verify validation fails
3. Confirm transaction is blocked
4. Check error message is descriptive

**Expected Results:**
```typescript
// Validation should fail with error:
Error: "Branch has reached its transaction limit (5/month) and has no credits remaining. Purchase credits to continue."

// No CreditLedger entry created
// Transaction blocked
// Usage counter unchanged
```

### Scenario 5: Unlimited Branch (No Quota)

**Setup:**
- Branch quota: null (unlimited)
- Current usage: 100 transactions
- Branch credits: 5

**Test Steps:**
1. Create POS transaction
2. Verify no quota checking occurs
3. Confirm transaction processes without credit deduction

**Expected Results:**
```typescript
{
  allowed: true,
  requiresCredits: false,
  reason: "Branch has no transaction limit"
}
// No credits deducted, transaction successful
```

### Scenario 6: Multiple Rapid Transactions (Race Condition Test)

**Setup:**
- Branch quota: 5 transactions
- Current usage: 5 transactions
- Branch credits: 2

**Test Steps:**
1. Initiate 3 simultaneous POS transactions
2. Verify only 2 succeed (using available credits)
3. Confirm 3rd transaction fails appropriately
4. Check credit balance becomes 0

**Expected Results:**
- First 2 transactions: Success, credits deducted
- 3rd transaction: Blocked with "no credits remaining"
- Final credit balance: 0

### Scenario 7: Credit Deduction with Business-Level Credits

**Setup:**
- Branch quota: 5 transactions
- Current usage: 5 transactions
- Branch credits: 0
- Business-level billing: PREPAID_CREDITS with balance

**Test Steps:**
1. Create POS transaction
2. Verify branch validation fails (no branch credits)
3. Confirm business-level credit system takes over
4. Check transaction processes with business credits

**Expected Results:**
- Branch validation fails due to no branch credits
- Error thrown: "Branch has reached its transaction limit..."
- Transaction blocked (business credits don't override branch limits)

### Scenario 8: Offline Transaction Credit Deduction

**Setup:**
- Branch quota: 5 transactions
- Current usage: 5 transactions
- Branch credits: 3
- Network: Offline mode

**Test Steps:**
1. Create POS transaction while offline
2. Verify credit deduction occurs in local collection
3. Confirm transaction data includes credit entry
4. Test sync behavior when back online

**Expected Results:**
- Transaction succeeds offline
- Local creditLedgerCollection updated
- Transaction syncs with credit deduction when online
- No duplicate credit entries created

## Validation Logic Testing

### Unit Tests for BranchValidationEngine

```typescript
describe('BranchValidationEngine.validateTransaction', () => {
  it('allows transaction within quota', () => {
    const result = BranchValidationEngine.validateTransaction({
      businessId: 'biz-1',
      branchId: 'branch-1',
      branchQuota: { branchId: 'branch-1', txQuotaLimit: 10, currentUsage: 5 },
      branchCredits: { branchId: 'branch-1', balance: 5, lastUpdated: new Date() },
      usageCounter: null
    })
    
    expect(result.ok).toBe(true)
    expect(result.value.requiresCredits).toBe(false)
  })

  it('requires credits when quota exceeded', () => {
    const result = BranchValidationEngine.validateTransaction({
      businessId: 'biz-1', 
      branchId: 'branch-1',
      branchQuota: { branchId: 'branch-1', txQuotaLimit: 10, currentUsage: 10 },
      branchCredits: { branchId: 'branch-1', balance: 5, lastUpdated: new Date() },
      usageCounter: null
    })
    
    expect(result.ok).toBe(true)
    expect(result.value.requiresCredits).toBe(true)
    expect(result.value.newCreditBalance).toBe(4)
  })

  it('blocks transaction when quota exceeded and no credits', () => {
    const result = BranchValidationEngine.validateTransaction({
      businessId: 'biz-1',
      branchId: 'branch-1', 
      branchQuota: { branchId: 'branch-1', txQuotaLimit: 10, currentUsage: 10 },
      branchCredits: { branchId: 'branch-1', balance: 0, lastUpdated: new Date() },
      usageCounter: null
    })
    
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('no credits remaining')
  })
})
```

### Integration Tests

```typescript
describe('Transaction Credit Deduction Integration', () => {
  it('processes transaction and deducts credit when over quota', async () => {
    // Setup: branch at quota limit with credits
    await setupBranchQuota('branch-1', 5, 5) // limit=5, usage=5
    await setupBranchCredits('branch-1', 3) // 3 credits available
    
    // Create transaction
    const result = await createPosTransaction({
      items: [mockPosItem],
      payments: [mockPayment],
      // ... other params
    })
    
    // Verify transaction succeeded
    expect(result.success).toBe(true)
    
    // Verify credit deducted
    const creditBalance = await getBranchCreditBalance({ branchId: 'branch-1' })
    expect(creditBalance.balance).toBe(2)
    
    // Verify CreditLedger entry
    const ledgerEntry = await getCreditLedgerEntries('branch-1', 1)
    expect(ledgerEntry[0]).toMatchObject({
      eventType: 'CONSUMED',
      amount: -1,
      balanceAfter: 2,
      transactionId: result.transactionId
    })
  })
})
```

## Performance Testing

### Load Testing Scenarios

1. **High Volume Branch Credits**
   - 1000 transactions over quota limit 
   - Verify credit deduction performance
   - Monitor database contention

2. **Concurrent Credit Usage**
   - Multiple cashiers using credits simultaneously
   - Test race condition handling
   - Verify balance accuracy

3. **Mixed Billing Models**
   - Branches with different quota settings
   - Business with mixed credit types
   - Monitor resource usage

## Manual Testing Checklist

### Basic Functionality ✓
- [ ] Transaction within quota (no credit deduction)
- [ ] Transaction exceeds quota with credits (deduction occurs)
- [ ] Transaction blocked when no credits
- [ ] Unlimited branch works correctly

### Edge Cases ✓
- [ ] Zero quota limit
- [ ] Negative credit balance handling
- [ ] Very large quota numbers
- [ ] Branch with null quota limit

### UI Integration ✓
- [ ] Credit balance updates in real-time
- [ ] Quota display shows correct usage
- [ ] Alerts appear when limits reached
- [ ] Error messages are user-friendly

### Data Consistency ✓
- [ ] Credit ledger entries accurate
- [ ] Usage counters increment correctly
- [ ] No duplicate credit deductions
- [ ] Offline sync maintains consistency

## Error Handling Test Cases

1. **Database Connection Lost**
   - During credit deduction
   - During usage counter update
   - During transaction creation

2. **Invalid Data States**
   - Negative credit balance
   - Missing branch configuration  
   - Corrupted usage counter data

3. **Permission Errors**
   - User lacks transaction permissions
   - Branch access revoked mid-transaction
   - Credit purchase permissions missing

## Monitoring & Observability

### Key Metrics to Monitor
- Credit deduction success rate
- Transaction blocking frequency
- Average credit balance per branch
- Quota utilization percentages

### Log Messages to Verify
```
[createPosTransaction] Branch credit deducted: { branchId, previousBalance, newBalance, reason }
[BranchValidationEngine] Transaction blocked: branch quota exhausted, no credits
[BranchValidationEngine] Branch validation passed: usage X/Y
```

### Database Queries for Verification
```sql
-- Check recent credit deductions
SELECT b.name, cl.amount, cl.balance_after, cl.created_at, cl.note
FROM credit_ledger cl
JOIN branches b ON cl.branch_id = b.id  
WHERE cl.event_type = 'CONSUMED'
ORDER BY cl.created_at DESC 
LIMIT 20;

-- Monitor quota utilization
SELECT b.name, b.tx_quota_limit, 
       COUNT(t.id) as current_usage,
       CASE 
         WHEN b.tx_quota_limit IS NULL THEN 'Unlimited'
         ELSE ROUND((COUNT(t.id)::float / b.tx_quota_limit) * 100, 2) || '%'
       END as utilization
FROM branches b
LEFT JOIN transactions t ON b.id = t.branch_id 
  AND t.created_at >= date_trunc('month', CURRENT_DATE)
GROUP BY b.id, b.name, b.tx_quota_limit;
```

This comprehensive testing framework ensures the branch credit deduction system works reliably across all scenarios.