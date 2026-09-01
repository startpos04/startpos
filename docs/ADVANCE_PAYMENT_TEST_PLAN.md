# Advance Payment Test Plan

## Overview
Comprehensive testing strategy for the advance payment feature that enables manual payments to work as a default alternative alongside automated payment providers (Stripe) with 1-12 month advance payment support.

## Test Categories

### 1. Unit Tests

#### 1.1 Advance Payment Service (`advance-payment-service.ts`)
**Location**: `__tests__/unit/lib/billing/advance-payment-service.test.ts`

**Test Cases**:
- ✅ `applyAdvancePayment()` with valid payment
  - Creates advance payment record with correct periods
  - Updates subscription with credits and expiration date
  - Returns success result
- ✅ `applyAdvancePayment()` with 1 month (single period)
  - Credits = 1, expiration = 1 month from now
- ✅ `applyAdvancePayment()` with 12 months (maximum)
  - Credits = 12, expiration = 12 months from now
- ✅ `applyAdvancePayment()` with invalid payment ID
  - Returns failure with NOT_FOUND error
- ✅ `applyAdvancePayment()` with already applied payment
  - Returns failure with ALREADY_APPLIED error
- ✅ `consumeAdvanceCredit()` with active credits
  - Decrements credit counter by 1
  - Returns success
- ✅ `consumeAdvanceCredit()` with zero credits
  - Returns failure with NO_CREDITS error
- ✅ `consumeAdvanceCredit()` with expired credits
  - Returns failure with CREDITS_EXPIRED error
- ✅ `shouldSkipBillingPeriod()` with active advance credits
  - Returns true (skip billing)
- ✅ `shouldSkipBillingPeriod()` with no credits
  - Returns false (proceed with billing)
- ✅ `shouldSkipBillingPeriod()` with expired credits
  - Returns false (proceed with billing)

#### 1.2 Stripe Advance Payment Sync Service (`advance-payment-sync-service.ts`)
**Location**: `__tests__/unit/lib/billing/advance-payment-sync-service.test.ts`

**Test Cases**:
- ✅ `syncPaymentToProvider()` creates subscription schedule
  - Phase 1: Current billing (if any)
  - Phase 2: Paused billing for advance periods
  - Phase 3: Resume normal billing after advance expiry
- ✅ `syncPaymentToProvider()` fallback to invoice credits
  - When subscription schedule creation fails
  - Creates credit balance adjustments
- ✅ `syncPaymentToProvider()` with no provider configuration
  - Returns success without syncing (manual-only mode)
- ✅ `syncPaymentToProvider()` with Stripe API errors
  - Updates payment sync status to FAILED
  - Stores error details
- ✅ `syncPaymentToProvider()` idempotency
  - Does not sync already synced payments (syncStatus = COMPLETED)

#### 1.3 Subscription Engine (`subscription-engine.ts`)
**Location**: `__tests__/unit/lib/billing/subscription-engine-advance.test.ts`

**Test Cases**:
- ✅ `hasActiveAdvanceCredits()` with valid credits
  - Returns true
- ✅ `hasActiveAdvanceCredits()` with zero credits
  - Returns false
- ✅ `hasActiveAdvanceCredits()` with expired credits
  - Returns false
- ✅ `shouldSkipBillingPeriod()` integration
  - Calls advancePaymentService correctly
- ✅ `getEffectiveExpirationDate()` with advance credits
  - Returns advancePaymentExpiresAt instead of currentPeriodEnd
- ✅ `getEffectiveExpirationDate()` without advance credits
  - Returns currentPeriodEnd
- ✅ `evaluateGracePeriodExpiry()` with active advance credits
  - Does NOT transition to EXPIRED
- ✅ `evaluateGracePeriodExpiry()` without advance credits
  - Normal grace period expiry behavior
- ✅ `evaluateAdvancePaymentExpiring()` at 7 days before expiry
  - Returns notification details
- ✅ `evaluateAdvancePaymentExpiring()` more than 7 days before expiry
  - Returns null (no notification needed)

#### 1.4 Payment Notification Service (`payment-notification-service.ts`)
**Location**: `__tests__/unit/lib/services/payment-notification-service.test.ts`

**Test Cases**:
- ✅ `scheduleRenewalReminders()` for subscription
  - Creates 3 notifications (7, 3, 1 days before due)
  - Sets correct scheduled dates
- ✅ `scheduleRenewalReminders()` with notifications disabled
  - Does not create notifications
- ✅ `scheduleAdvanceExpirationWarning()` for advance payment
  - Creates notification 7 days before expiry
- ✅ `sendApprovalNotification()` immediate send
  - Creates and sends notification
  - Status = SENT
- ✅ `sendRejectionNotification()` immediate send
  - Creates and sends notification with reason
- ✅ `processScheduledNotifications()` processes due notifications
  - Sends all notifications with scheduledFor <= now
  - Updates status to SENT
- ✅ `processScheduledNotifications()` skips future notifications
  - Does not send notifications with future scheduledFor
- ✅ `retryFailedNotifications()` retries with exponential backoff
  - Retries failed notifications
  - Respects max attempts (3)

#### 1.5 Stripe Webhook Handlers (`stripe-handlers.ts`)
**Location**: `__tests__/unit/lib/webhook-handlers/stripe-handlers-advance.test.ts`

**Test Cases**:
- ✅ `handleInvoicePaid()` with advance credits
  - Calls consumeAdvanceCredit()
  - Decrements credit counter
- ✅ `handleInvoicePaid()` without advance credits
  - Normal payment processing
- ✅ `handleInvoicePaymentFailed()` with advance credits
  - SKIPS grace period transition
  - Returns SKIPPED status
- ✅ `handleInvoicePaymentFailed()` without advance credits
  - Normal grace period transition
- ✅ `handleInvoicePaid()` with expired advance credits
  - Does NOT consume credits
  - Normal payment processing

#### 1.6 Manual Adapter (`manual-adapter.ts`)
**Location**: `__tests__/unit/lib/billing/adapters/manual-adapter.test.ts`

**Test Cases**:
- ✅ `createSubscription()` with periodsAdvancePaid = 1
  - Sets isAdvancePayment = true
  - Sets periodsAdvancePaid = 1
  - Calculates coversPeriodStart/End correctly
- ✅ `createSubscription()` with periodsAdvancePaid = 6
  - Calculates 6-month coverage period
- ✅ `createSubscription()` with default (no periodsAdvancePaid)
  - Single period payment (1 month)
- ✅ `createSubscription()` sync status initialization
  - syncStatus = NOT_REQUIRED when no provider
  - syncStatus = PENDING when provider exists

### 2. Integration Tests

#### 2.1 Advance Payment Flow (End-to-End)
**Location**: `__tests__/integration/advance-payment-flow.test.ts`

**Test Scenarios**:
- ✅ **Full advance payment lifecycle**:
  1. User submits manual payment for 3 months
  2. Admin approves payment
  3. Advance credits applied to subscription
  4. Stripe sync creates subscription schedule
  5. Approval notification sent
  6. Expiration warning scheduled
- ✅ **Credit consumption over time**:
  1. Apply 3-month advance payment
  2. First invoice.paid webhook → consume 1 credit (2 left)
  3. Second invoice.paid webhook → consume 1 credit (1 left)
  4. Third invoice.paid webhook → consume 1 credit (0 left)
  5. Fourth invoice → normal billing resumes
- ✅ **Payment failure with advance protection**:
  1. Apply advance payment
  2. Stripe payment fails
  3. Grace period NOT triggered
  4. Subscription stays ACTIVE
- ✅ **Manual-only mode (no provider)**:
  1. Submit manual payment
  2. Admin approves
  3. Credits applied
  4. NO sync attempted
  5. Notification sent

#### 2.2 Admin Review Integration
**Location**: `__tests__/integration/admin-review-advance-payment.test.ts`

**Test Scenarios**:
- ✅ **Approve advance payment**:
  - Payment status → SUCCEEDED
  - Credits applied
  - Sync triggered
  - Notification sent
- ✅ **Reject advance payment**:
  - Payment status → FAILED
  - No credits applied
  - Rejection notification sent
- ✅ **Approve with sync failure**:
  - Transaction rollback
  - Payment stays PENDING
  - Error message returned

#### 2.3 Notification Processing Integration
**Location**: `__tests__/integration/notification-processing.test.ts`

**Test Scenarios**:
- ✅ **Scheduled notification delivery**:
  1. Schedule renewal reminders
  2. Run background job
  3. Due notifications sent
  4. Future notifications not sent
- ✅ **Failed notification retry**:
  1. Notification fails to send
  2. Retry job runs
  3. Exponential backoff applied
  4. Max attempts respected

### 3. Edge Cases & Error Scenarios

#### 3.1 Date/Time Edge Cases
**Location**: `__tests__/unit/lib/billing/advance-payment-edge-cases.test.ts`

**Test Cases**:
- ✅ Credits expire exactly at midnight
  - Should NOT be considered active after midnight
- ✅ Credits expire in the current hour
  - Should still be active until exact expiry time
- ✅ Timezone handling
  - All dates in UTC
  - Consistent date comparisons
- ✅ Last credit consumption
  - Credits go from 1 → 0
  - Expiration date cleared
- ✅ Month boundary cases
  - Payment on Jan 31 covering Feb (28/29 days)
  - 3-month payment starting mid-month

#### 3.2 Concurrent Operations
**Location**: `__tests__/integration/advance-payment-concurrency.test.ts`

**Test Cases**:
- ✅ Multiple credit consumption attempts
  - Race condition handling
  - Prevents double-decrement
- ✅ Simultaneous payment approval
  - Atomic transaction isolation
- ✅ Sync retry during active sync
  - Prevents duplicate sync operations

#### 3.3 Data Consistency
**Location**: `__tests__/integration/advance-payment-consistency.test.ts`

**Test Cases**:
- ✅ Payment approval failure mid-transaction
  - Full rollback
  - No partial state
- ✅ Stripe sync failure after credit application
  - Payment marked FAILED sync
  - Credits remain applied
  - Retry mechanism available
- ✅ Orphaned notifications
  - Notifications for deleted payments
  - Graceful handling

### 4. UI Component Tests

#### 4.1 Manual Payment Submission UI
**Location**: `__tests__/unit/components/billing/manual-payment.test.tsx`

**Test Cases**:
- ✅ Period selector renders 1-12 months
- ✅ Amount calculation based on selected periods
  - 1 period = $50
  - 3 periods = $150
  - 12 periods = $600
- ✅ URL parameter support
  - ?periods=3 preselects 3 months
- ✅ Form validation
  - Required fields
  - Minimum/maximum periods
- ✅ Submission success
  - Success message displayed
  - Form reset

#### 4.2 Admin Payment Approvals UI
**Location**: `__tests__/unit/components/admin/payment-approvals.test.tsx`

**Test Cases**:
- ✅ Advance payment badge display
  - Shows "Advance • X months"
- ✅ Monthly rate calculation
  - Total amount / periods
- ✅ Coverage date display
  - Shows start and end dates
- ✅ Provider sync indicator
  - Conditional display based on provider
- ✅ Approval action
  - Confirmation modal
  - Success feedback
- ✅ Rejection action
  - Reason input
  - Confirmation

### 5. Background Job Tests

#### 5.1 Advance Payment Sync Retry Job
**Location**: `__tests__/unit/lib/jobs/advance-payment-sync-retry.test.ts`

**Test Cases**:
- ✅ Retries failed syncs with exponential backoff
  - Attempt 1: immediate
  - Attempt 2: 5 minutes
  - Attempt 3: 15 minutes
  - Attempt 4: 30 minutes
  - Attempt 5+: 60 minutes
- ✅ Max attempts respected (10)
- ✅ Successful retry updates status to COMPLETED
- ✅ Failed retry increments attempt counter
- ✅ Batch processing (10 payments per run)

#### 5.2 Payment Notification Processing Job
**Location**: `__tests__/unit/lib/jobs/process-payment-notifications.test.ts`

**Test Cases**:
- ✅ Processes due notifications
- ✅ Updates status to SENT
- ✅ Batch size limit (100)
- ✅ Failed notifications marked FAILED
- ✅ Idempotency (doesn't resend SENT notifications)

### 6. Database Schema Tests

#### 6.1 Prisma Model Validation
**Location**: `__tests__/integration/database/advance-payment-schema.test.ts`

**Test Cases**:
- ✅ BillingPayment with advance fields
  - isAdvancePayment boolean
  - periodsAdvancePaid integer (1-12)
  - coversPeriodStart/End dates
  - syncStatus enum
- ✅ BusinessSubscription with advance fields
  - advancePaymentCredits integer
  - advancePaymentExpiresAt nullable date
  - notifyBeforePayment boolean
  - notificationLeadDays integer
- ✅ PaymentNotification model
  - All fields present
  - Enums valid
  - Relations correct
- ✅ Enum values
  - PaymentSyncStatus
  - PaymentNotificationType
  - PaymentNotificationStatus
  - PaymentStatus (PARTIALLY_APPLIED, FULLY_APPLIED)

### 7. API Endpoint Tests

#### 7.1 Manual Payment Submission Endpoint
**Location**: `__tests__/integration/api/submit-manual-payment.test.ts`

**Test Cases**:
- ✅ Valid submission with periodsAdvancePaid
- ✅ Validation errors
  - periodsAdvancePaid < 1
  - periodsAdvancePaid > 12
  - Invalid amount
- ✅ Authentication required
- ✅ Business ownership validation

#### 7.2 Payment Review Endpoint
**Location**: `__tests__/integration/api/review-manual-payment.test.ts`

**Test Cases**:
- ✅ Admin-only access
- ✅ Approve action
- ✅ Reject action
- ✅ Invalid payment ID
- ✅ Already reviewed payment

#### 7.3 Cron Job Endpoint
**Location**: `__tests__/integration/api/cron-hourly.test.ts`

**Test Cases**:
- ✅ Advance sync retry job execution
- ✅ Notification processing job execution
- ✅ Error isolation (one job failure doesn't stop others)
- ✅ Response structure validation

## Testing Tools & Mocks

### Required Mocks
- Stripe API client
- Prisma database client (in-memory or test DB)
- Date/time utilities (for time-based tests)
- Notification delivery service (email/SMS)
- Authentication context

### Testing Utilities
- `createMockPayment()` - Generate test payment data
- `createMockSubscription()` - Generate test subscription data
- `advanceTime()` - Fast-forward time for date-based tests
- `mockStripeAPI()` - Mock Stripe responses
- `assertNotificationSent()` - Verify notification delivery

## Coverage Goals

### Minimum Coverage Targets
- **Unit Tests**: 90% line coverage
- **Integration Tests**: Key user flows covered
- **Edge Cases**: All identified edge cases tested
- **Error Scenarios**: All error paths tested

### Critical Paths (Must Have 100% Coverage)
1. Advance payment application (`applyAdvancePayment`)
2. Credit consumption (`consumeAdvanceCredit`)
3. Stripe sync with fallback
4. Webhook credit recognition
5. Admin approval flow
6. Notification scheduling

## Test Execution

### Run Commands
```bash
# All tests
pnpm test

# Unit tests only
pnpm test __tests__/unit

# Integration tests only
pnpm test:integration

# Specific test file
pnpm test advance-payment-service

# Coverage report
pnpm coverage
```

### CI/CD Integration
- Run all tests on PR creation
- Block merge if tests fail
- Generate coverage reports
- Alert on coverage decrease

## Test Data Requirements

### Test Scenarios Need
- Multiple business accounts
- Various subscription states (TRIAL, ACTIVE, GRACE_PERIOD, EXPIRED)
- Different billing models (MONTHLY, ANNUAL, PREPAID_CREDITS)
- Payment providers (Stripe, Manual-only)
- Historical payments for ledger tests
- Advance payments at various stages

### Seed Data Script
Location: `prisma/seeders/advance-payment-test-data.ts`

## Known Limitations & Future Tests

### Not Covered (Out of Scope)
- ❌ Multi-currency support (feature not implemented)
- ❌ Refunds for partial periods (feature not implemented)
- ❌ Provider migration (Stripe → PayMongo)

### Future Test Enhancements
- Performance tests for batch operations
- Load tests for concurrent webhook processing
- Security tests for admin authorization
- Accessibility tests for UI components
- Visual regression tests for UI

## Test Maintenance

### When to Update Tests
- New advance payment features added
- Schema changes affecting payment models
- Provider API changes (Stripe)
- Bug fixes requiring regression tests
- Performance optimizations

### Test Review Schedule
- Weekly: Failed test analysis
- Monthly: Coverage review
- Quarterly: Test suite refactoring
- Annually: Full test strategy review

## Success Criteria

Tests are considered complete when:
1. ✅ All test categories have implementations
2. ✅ Coverage targets met (90% minimum)
3. ✅ All critical paths have 100% coverage
4. ✅ Integration tests cover full user flows
5. ✅ Edge cases identified and tested
6. ✅ Error scenarios validated
7. ✅ CI/CD pipeline passing
8. ✅ Documentation updated

---

**Document Version**: 1.0  
**Last Updated**: December 31, 2026  
**Status**: Ready for Implementation
