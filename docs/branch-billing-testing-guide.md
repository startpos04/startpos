# Branch Billing System - Testing Guide

## Overview
This guide covers testing the branch-level credit billing system, including Stripe integration, credit deduction, and offline functionality.

## Prerequisites

### 1. Database Setup
```bash
# Ensure database is running
docker-compose up -d postgres

# Run migrations to add branch billing schema
npm run db:migrate

# Seed permissions (includes new BRANCH_VIEW_BILLING and BRANCH_MANAGE_BILLING)
npm run db:seed:permissions
```

### 2. Stripe Configuration
Ensure these environment variables are set in your `.env` file:

```env
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Branch Credit Package Price IDs (create these in Stripe Dashboard)
STRIPE_BRANCH_CREDIT_10_PRICE_ID=price_...
STRIPE_BRANCH_CREDIT_50_PRICE_ID=price_...
STRIPE_BRANCH_CREDIT_100_PRICE_ID=price_...
STRIPE_BRANCH_CREDIT_500_PRICE_ID=price_...

# App URL for redirects
APP_URL=http://localhost:3000
```

### 3. Stripe Price Setup
Create the following products and prices in your Stripe Dashboard:

1. **10 Branch Credits** - $10.00
2. **50 Branch Credits** - $45.00 
3. **100 Branch Credits** - $85.00
4. **500 Branch Credits** - $400.00

## Test Scenarios

### Scenario 1: Stripe Checkout Integration

#### Test Steps:
1. **Access Branch Billing Dashboard**
   - Navigate to `/billing` (requires BRANCH_VIEW_BILLING permission)
   - Verify dashboard loads with current credit balance and quota information
   - Click "Buy Credits" button in header

2. **Credit Package Selection**
   - Verify BuyBranchCreditsDialog opens
   - Select different credit packages (10, 50, 100, 500 credits)
   - Verify pricing calculations and discounts are displayed correctly
   - Verify "Popular" badge appears on 50 credits package

3. **Stripe Checkout Process**
   - Click "Proceed to payment"
   - Verify redirect to Stripe Checkout with correct:
     - Line items (quantity and pricing)
     - Success URL: `/billing?purchase=success`
     - Cancel URL: `/billing?purchase=cancelled`
     - Metadata includes: `source=branch_credit_purchase`, `branchId`, `businessId`

4. **Test Payment Flow**
   - Complete payment with test card: `4242 4242 4242 4242`
   - Verify redirect back to `/billing?purchase=success`
   - Verify success banner appears

#### Expected Results:
- Checkout session created successfully
- Proper redirect to Stripe
- Payment processing works
- Success redirect with query parameter

### Scenario 2: Webhook Processing

#### Test Steps:
1. **Webhook Endpoint Testing**
   - Use Stripe CLI to forward webhooks: `stripe listen --forward-to localhost:3000/api/billing/webhook`
   - Complete a test purchase
   - Monitor webhook events in console

2. **Verify Webhook Processing**
   - Check that `checkout.session.completed` event is received
   - Verify `handleBranchCreditPurchase` function is called
   - Confirm CreditLedger entry is created with:
     - Correct `branchId` and `businessId`
     - `eventType: PURCHASE`
     - Correct `amount` (positive value)
     - Updated `balanceAfter`
     - `stripeSessionId` for idempotency

#### Expected Results:
- Webhook successfully processed
- CreditLedger entry created
- Branch credit balance updated
- Idempotency prevents duplicate entries

### Scenario 3: Branch Quota Limits

#### Test Setup:
1. **Set Branch Transaction Limit**
   - Set `Branch.txQuotaLimit = 10` in database
   - Ensure branch has 0 credits initially

2. **Test Quota Enforcement**
   - Process 10 transactions to reach limit
   - Attempt 11th transaction
   - Verify transaction is blocked with appropriate error

3. **Test Credit Override**
   - Purchase branch credits via `/billing`
   - Attempt transaction again
   - Verify transaction succeeds and credit is deducted

#### Expected Results:
- Transactions blocked when quota exceeded
- Credits allow overflow transactions
- Credit deduction occurs properly

### Scenario 4: UI Integration

#### Test Steps:
1. **Branch Billing Dashboard**
   - Verify quota display shows: `current usage / limit`
   - Verify credit balance shows correctly
   - Verify alerts appear when limit reached
   - Test credit purchase packages preview

2. **Business Billing Integration**
   - Navigate to `/business/billing`
   - Verify "Branch Credits" section appears (requires MANAGE_BRANCHES)
   - Verify consolidated credit totals
   - Verify per-branch breakdown

3. **Navigation**
   - Verify "Billing" link appears in sidebar
   - Verify proper permission checks (ADMIN/SUPERVISOR only)
   - Test link navigation works correctly

#### Expected Results:
- All UI components render correctly
- Proper permission-based visibility
- Data displays accurately
- Navigation works seamlessly

## Integration Testing Checklist

### Stripe Integration ✓
- [ ] Environment variables configured
- [ ] Price IDs created in Stripe Dashboard
- [ ] Checkout session creation works
- [ ] Webhook endpoint receives events
- [ ] Webhook signature verification passes
- [ ] Idempotency prevents duplicate processing

### Database Integration ✓
- [ ] CreditLedger entries created correctly
- [ ] Branch.txQuotaLimit enforced
- [ ] Transaction validation works
- [ ] Permissions seeded properly

### UI Integration ✓
- [ ] Branch billing dashboard functional
- [ ] Credit purchase dialog works
- [ ] Business consolidated view displays
- [ ] Sidebar navigation appears
- [ ] Permission-based access control

### Error Handling ✓
- [ ] Invalid payment methods handled
- [ ] Network failures graceful
- [ ] Permission denied scenarios
- [ ] Database connection issues

## Common Issues & Solutions

### 1. Stripe Configuration
**Issue**: "No such price" error
**Solution**: Verify STRIPE_BRANCH_CREDIT_*_PRICE_ID environment variables match Stripe Dashboard

### 2. Webhook Failures
**Issue**: Webhook signature verification fails
**Solution**: Ensure STRIPE_WEBHOOK_SECRET matches endpoint secret in Stripe Dashboard

### 3. Permission Issues
**Issue**: Unable to access /billing route
**Solution**: Verify user has BRANCH_VIEW_BILLING permission and permissions are seeded

### 4. Credit Balance Not Updating
**Issue**: Credits purchased but balance unchanged
**Solution**: Check webhook processing and CreditLedger entries in database

## Manual Testing Commands

```bash
# Test server functions directly
npm run test -- purchase-branch-credits
npm run test -- get-branch-credit-balance

# Test webhook locally
stripe listen --forward-to localhost:3000/api/billing/webhook

# Test transaction processing
npm run test -- create-pos-transaction

# Database queries for verification
psql -d startpos -c "SELECT * FROM credit_ledger ORDER BY created_at DESC LIMIT 10;"
psql -d startpos -c "SELECT id, name, tx_quota_limit FROM branches;"
```

## Automated Test Coverage

The following areas should have automated test coverage:

1. **Unit Tests**
   - BranchValidationEngine logic
   - Credit package calculations  
   - Permission validation

2. **Integration Tests**
   - Server function workflows
   - Database operations
   - Webhook processing

3. **E2E Tests**
   - Complete purchase flow
   - Credit deduction on transactions
   - UI interactions

## Security Considerations

- Webhook signature verification prevents unauthorized credit grants
- Permission-based access control limits billing functionality
- Stripe session metadata prevents cross-tenant attacks
- Idempotency keys prevent duplicate processing

## Performance Notes

- Credit balance lookups are O(1) using `balanceAfter` snapshots
- Branch quota checks integrated into existing transaction flow
- Minimal impact on POS transaction processing speed
- Efficient consolidated credit queries for business dashboard