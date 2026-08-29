# Branch Billing System - Offline Capability Testing

## Overview

This document covers testing the offline capabilities of the branch billing system. The POS system must continue processing transactions when network connectivity is lost, including proper handling of branch quota limits and credit deductions.

## Offline Architecture Understanding

### Local-First Design
The branch billing system follows the same local-first architecture as the core POS:

1. **Local Collections**: Branch data, credit balances, and usage counters are cached locally
2. **Synchronous Processing**: All billing validation runs synchronously within database transactions
3. **Background Sync**: Changes sync to server when connectivity returns
4. **Conflict Resolution**: Server-side reconciliation handles offline changes

### Key Components in Offline Mode

```typescript
// Local collections used for offline billing
- branchCollection: Branch quota limits (Branch.txQuotaLimit)
- creditLedgerCollection: Credit balance snapshots and transactions
- usageCounterCollection: Branch transaction counts per billing period
- transactionCollection: POS transactions with credit deductions
```

## Offline Testing Scenarios

### Scenario 1: Credit Balance Display Offline

**Setup:**
- Branch has 5 credits available
- Disconnect network
- Navigate to `/billing` dashboard

**Test Steps:**
1. Open branch billing dashboard while offline
2. Verify credit balance shows correct value (5 credits)
3. Check quota usage displays properly
4. Confirm UI shows offline indicator/state

**Expected Results:**
- Credit balance: 5 (from local cache)
- Quota display: Shows current usage from usageCounterCollection
- No network errors in UI
- Dashboard remains functional

**Implementation Notes:**
```typescript
// getBranchCreditBalance should work offline using local collection
const offlineBalance = BranchValidationEngine.getBranchCreditBalance(
  creditLedgerCollection,
  businessId,
  branchId
)
```

### Scenario 2: Transaction Processing with Credit Deduction Offline

**Setup:**
- Branch quota: 5 transactions (at limit)
- Branch credits: 3 available
- Network: Offline
- Current branch usage: 5/5

**Test Steps:**
1. Disconnect network completely
2. Process POS transaction that exceeds quota
3. Verify transaction succeeds using branch credit
4. Check local credit ledger updated
5. Confirm transaction data includes credit deduction
6. Reconnect and verify sync

**Expected Results:**
- Transaction succeeds offline
- Credit balance decreases from 3 to 2 locally
- CreditLedger entry created in local collection:
  ```typescript
  {
    eventType: 'CONSUMED',
    amount: -1,
    balanceAfter: 2,
    transactionId: '<tx-id>',
    createdAt: new Date(),
    // Will sync when online
  }
  ```
- When online: All data syncs without conflicts

### Scenario 3: Quota Enforcement Offline

**Setup:**
- Branch quota: 5 transactions
- Branch credits: 0
- Current usage: 5/5 (at limit)
- Network: Offline

**Test Steps:**
1. Attempt transaction while offline
2. Verify transaction is blocked locally
3. Check error message appropriate for offline context
4. Confirm no partial transaction data created

**Expected Results:**
```typescript
// BranchValidationEngine should block transaction locally
{
  ok: false,
  reason: "Branch has reached its transaction limit (5/month) and has no credits remaining. Purchase credits to continue."
}

// Transaction blocked before creating any records
// Error displayed to user immediately
// No network call attempted
```

### Scenario 4: Credit Purchase Attempt Offline

**Setup:**
- Network: Offline
- User attempts to buy credits via billing dashboard

**Test Steps:**
1. Open branch billing dashboard offline
2. Click "Buy Credits" button
3. Attempt to select credit package
4. Verify appropriate offline handling

**Expected Results:**
- Credit purchase dialog shows offline state
- Stripe checkout disabled with clear messaging
- User informed they need connectivity to purchase
- Alternative messaging suggests reconnecting

**UI Behavior:**
```typescript
// BuyBranchCreditsDialog should detect offline state
if (!navigator.onLine) {
  return (
    <div className="offline-message">
      <AlertTriangle className="h-5 w-5" />
      <p>Credit purchases require an internet connection. Please connect and try again.</p>
    </div>
  )
}
```

### Scenario 5: Sync Behavior When Coming Back Online

**Setup:**
- Process multiple offline transactions with credit deductions
- Various credit ledger changes locally
- Reconnect to network

**Test Steps:**
1. Perform multiple offline transactions using branch credits
2. Verify local credit balance decreases properly
3. Reconnect network
4. Monitor sync process
5. Verify server state matches local state
6. Check for any sync conflicts

**Expected Results:**
- All offline CreditLedger entries sync to server
- Branch credit balances reconcile correctly
- No duplicate credit deductions
- Transaction integrity maintained
- Usage counters sync properly

### Scenario 6: Long-Term Offline Operation

**Setup:**
- Extended offline period (e.g., 8 hours)
- Multiple credit deductions during offline period
- Various transaction types and amounts

**Test Steps:**
1. Remain offline for extended period
2. Process many transactions using branch credits
3. Verify local credit tracking accuracy
4. Monitor local storage/memory usage
5. Test system stability over time
6. Eventually reconnect and verify sync

**Expected Results:**
- System remains stable during extended offline use
- Credit balance tracking stays accurate
- No memory leaks or performance degradation
- Full data integrity when sync resumes
- All offline changes reconcile properly

### Scenario 7: Partial Connectivity (Intermittent Network)

**Setup:**
- Unstable network connection
- Intermittent connectivity during transaction processing

**Test Steps:**
1. Start transaction with good connectivity
2. Lose network during branch validation
3. Complete transaction processing offline
4. Regain connectivity briefly
5. Lose connection again during sync

**Expected Results:**
- Transaction completes successfully using local data
- System gracefully handles network interruptions
- Partial syncs don't corrupt local state
- Full sync completes when stable connection returns

## Offline Data Consistency Tests

### Credit Balance Accuracy

**Test Scenario:**
- Start with 10 branch credits
- Process 5 offline transactions using credits
- Verify balance progression: 10→9→8→7→6→5

**Validation:**
```typescript
// Local credit ledger should show accurate progression
const ledgerEntries = creditLedgerCollection
  .find({ branchId, eventType: 'CONSUMED' })
  .sort('createdAt')

// Verify balanceAfter decreases correctly
expect(ledgerEntries.map(e => e.balanceAfter)).toEqual([9, 8, 7, 6, 5])
```

### Usage Counter Integrity

**Test Scenario:**
- Branch quota: 10 transactions
- Current usage: 7 transactions
- Process 5 more transactions offline (2 within quota, 3 using credits)

**Validation:**
- Usage counter increases to 10 (quota limit)
- Additional 3 transactions use credits
- Total transactions: 12
- Credits used: 3

### Transaction Metadata

**Test Scenario:**
- Verify offline transactions include proper metadata for credit usage

**Expected Transaction Data:**
```typescript
{
  id: '<transaction-id>',
  branchId: '<branch-id>',
  // ... other transaction data
  
  // Associated credit ledger entry (if credit used)
  creditDeduction: {
    ledgerEntryId: '<ledger-id>',
    previousBalance: 5,
    newBalance: 4,
    reason: 'Branch quota exceeded'
  }
}
```

## Error Handling in Offline Mode

### Local Validation Failures

**Scenarios:**
1. Invalid branch configuration (null/corrupt quota data)
2. Negative credit balance states
3. Corrupted usage counter data

**Expected Behavior:**
- Clear error messages for users
- System fails safely (blocks transaction vs corrupting data)
- Recovery options when possible
- Detailed logging for debugging

### Storage Limitations

**Test Cases:**
1. Local storage quota exceeded
2. Memory pressure on device
3. Browser/app crash during offline transaction

**Expected Behavior:**
- Graceful degradation when storage full
- Critical billing data prioritized
- Recovery from incomplete transactions
- Data integrity checks on restart

## Performance Testing Offline

### Response Time Benchmarks

**Metrics to Measure:**
- Branch validation time: < 50ms
- Credit deduction processing: < 100ms
- Dashboard load time: < 200ms
- Transaction processing with credits: < 500ms

**Test Conditions:**
- Large local datasets (1000+ credit entries)
- Multiple concurrent transactions
- Extended offline periods

### Memory Usage Monitoring

**Key Areas:**
- Credit ledger collection growth
- Transaction data accumulation
- UI state management overhead

**Thresholds:**
- Memory usage < 100MB for billing data
- No memory leaks during extended offline use
- Efficient garbage collection of synced data

## Manual Testing Checklist

### Basic Offline Functionality ✓
- [ ] Branch billing dashboard loads offline
- [ ] Credit balance displays from cache
- [ ] Quota information shows offline
- [ ] Transaction processing works with credit deduction
- [ ] Error messages appropriate for offline context

### Data Integrity ✓
- [ ] Credit deductions accurate during offline use
- [ ] Usage counters increment properly
- [ ] Transaction metadata includes credit usage
- [ ] No duplicate entries when syncing

### Sync Behavior ✓
- [ ] Offline changes sync when reconnected
- [ ] No data loss during sync process
- [ ] Conflict resolution works correctly
- [ ] Large offline datasets sync efficiently

### Error Recovery ✓
- [ ] System recovers from partial sync failures
- [ ] Corrupt local data handled gracefully
- [ ] Network interruptions don't break state
- [ ] Clear error messages for users

## Automated Test Framework

### Unit Tests for Offline Components

```typescript
describe('Offline Branch Billing', () => {
  beforeEach(() => {
    // Mock offline environment
    Object.defineProperty(navigator, 'onLine', { value: false })
    
    // Setup local collections with test data
    setupMockCollections()
  })

  it('validates transactions using local branch data', () => {
    const result = BranchValidationEngine.validateTransaction({
      businessId: 'biz-1',
      branchId: 'branch-1', 
      branchQuota: localBranchData,
      branchCredits: localCreditBalance,
      usageCounter: localUsageCounter
    })
    
    expect(result.ok).toBe(true)
  })

  it('deducts credits locally when quota exceeded', () => {
    // Test local credit deduction without network
    const initialBalance = 5
    const result = processOfflineTransactionWithCredit()
    
    expect(result.creditBalance).toBe(initialBalance - 1)
    expect(creditLedgerCollection.find({ eventType: 'CONSUMED' })).toHaveLength(1)
  })
})
```

### Integration Tests

```typescript
describe('Offline-Online Sync', () => {
  it('syncs offline credit deductions when reconnected', async () => {
    // Process transactions offline
    await processOfflineTransactions(5)
    
    // Simulate reconnection
    mockOnline()
    
    // Trigger sync
    await syncBillingData()
    
    // Verify server state matches local state
    const serverBalance = await getBranchCreditBalanceFromServer()
    const localBalance = getLocalCreditBalance()
    
    expect(serverBalance.balance).toBe(localBalance.balance)
  })
})
```

## Monitoring & Debugging

### Key Metrics for Offline Operation

1. **Offline Transaction Success Rate**
   - Percentage of transactions processed successfully offline
   - Credit deduction accuracy rate

2. **Sync Success Metrics**
   - Time to sync offline changes
   - Conflict resolution success rate
   - Data integrity validation results

3. **Performance Metrics**
   - Response time for offline validation
   - Memory usage during offline operation
   - Battery usage impact (mobile devices)

### Debug Information

**Console Logs to Monitor:**
```
[BranchBilling] Operating offline, using local credit balance: 5
[BranchValidation] Transaction requires credit deduction offline
[CreditLedger] Local entry created: CONSUMED, balance: 4
[Sync] Offline credit entries queued for sync: 3 entries
[Sync] Branch credit sync completed successfully
```

**Local Storage Inspection:**
```typescript
// Debug commands for browser console
localStorage.getItem('creditLedgerCollection')
localStorage.getItem('branchCollection') 
localStorage.getItem('usageCounterCollection')
```

This comprehensive offline testing framework ensures the branch billing system maintains full functionality and data integrity even during extended periods without network connectivity.