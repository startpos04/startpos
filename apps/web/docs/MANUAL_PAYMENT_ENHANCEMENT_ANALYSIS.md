# Manual Payment Enhancement Analysis

## Document Purpose
Analysis of current manual payment implementation to identify gaps and requirements for enhancing it to work as a default alternative alongside automated providers with advance payment support.

**Date**: 2026-08-31  
**Status**: Analysis Complete

---

## Current Implementation Status

### ✅ What's Already Implemented

1. **Payment Adapter Architecture (COMPLETE)**
   - Provider-agnostic billing system via `BillingProviderAdapter` interface
   - `PaymentProviderRegistry` for multi-provider support
   - `PaymentProviderService` for business-level provider resolution
   - Provider capabilities system for feature detection

2. **Manual Payment Adapter (COMPLETE)**
   - Location: `web/src/lib/billing/adapters/manual-adapter.ts`
   - Implements full `BillingProviderAdapter` interface
   - Creates `BillingPayment` records in `PENDING_APPROVAL` status
   - Supports GCash, Bank Transfer, Maya payment methods
   - No external API calls - all state managed in database

3. **Manual Payment Submission (COMPLETE)**
   - Server function: `submitManualPayment`
   - Creates payment records with proof upload
   - Returns payment ID for tracking
   - Auth middleware protected

4. **Admin Review Workflow (PARTIAL)**
   - Server function: `reviewManualPayment`
   - Approve/reject functionality
   - Permission-based access control
   - ⚠️ **TODO**: Subscription activation logic commented out

5. **Database Schema (COMPLETE)**
   - `BillingPayment` model with provider tracking
   - `BillingPaymentAttempt` for retry tracking
   - `WebhookEvent` for idempotency
   - Payment enums: `PaymentProvider`, `PaymentMethod2`, `PaymentStatus`
   - `Business.preferredPaymentProvider` field

6. **Provider Selection UI (COMPLETE)**
   - Provider selection dialog in plans page
   - Shows Stripe and Manual options
   - Provider capabilities and badges display
   - Provider description and icons

---

## Current Manual Payment Flow

### Subscription Creation Flow
```
User selects plan
    ↓
Provider selection dialog shown (Stripe or Manual)
    ↓
If Manual selected:
    ↓
submitManualPayment called
    ↓
ManualAdapter.createSubscription()
    ↓
Creates BillingPayment with status PENDING_APPROVAL
    ↓
Returns payment ID as synthetic subscription ID
    ↓
Admin notified (future)
    ↓
Admin reviews via reviewManualPayment
    ↓
If approved: status → SUCCEEDED
    ↓
⚠️ Subscription activation (NOT YET IMPLEMENTED)
```

### Provider Resolution Order
```
PaymentProviderService.getProviderForBusiness():
1. Check Business.preferredPaymentProvider
2. Check most recent BillingPayment.provider
3. Fallback to Stripe (platform default)
```

---

## Identified Gaps for Enhancement

### 🔴 Critical Gaps

1. **Manual Payment Always Available**
   - **Current**: Manual payment is shown as alternative provider
   - **Required**: Manual payment should ALWAYS be available regardless of automated provider selection
   - **Impact**: Users with Stripe enabled can't make manual advance payments
   - **Fix Location**: Provider selection UI, payment flow logic

2. **Advance Payment Support**
   - **Current**: Each manual payment is for single billing period
   - **Required**: Support paying for multiple periods in advance
   - **Missing Components**:
     - No field to store number of periods paid
     - No expiration date tracking for advance credits
     - No calculation logic for advance payment amounts
     - No UI for selecting advance payment periods

3. **Stripe Synchronization**
   - **Current**: No sync between manual payments and Stripe subscriptions
   - **Required**: When manual advance payment made + Stripe enabled, sync to prevent duplicate charges
   - **Missing Components**:
     - Stripe sync service to apply advance payment credits
     - Webhook handling to recognize advance-paid periods
     - Metadata updates in Stripe subscription
     - Duplicate charge prevention logic

4. **Subscription Activation**
   - **Current**: `reviewManualPayment` has TODO comment for activation
   - **Required**: Properly activate subscription using SubscriptionEngine
   - **Impact**: Manual payments approved but subscription not activated
   - **Fix Location**: `reviewManualPayment` handler

5. **Payment Notifications**
   - **Current**: No notification system for upcoming payments
   - **Required**: Notify users 7, 3, 1 days before renewal
   - **Missing Components**:
     - Notification scheduling service
     - Notification templates for manual vs automated
     - Advance payment expiration warnings
     - Admin approval notifications

### 🟡 Medium Priority Gaps

6. **No Provider Mode Support**
   - **Current**: Manual payment assumes it's an alternative to Stripe
   - **Required**: Support "manual only" mode when no automated provider selected
   - **Missing**: Skip sync logic when preferredPaymentProvider is null or 'manual'

7. **Payment History UI**
   - **Current**: No unified payment history view
   - **Required**: Show all payments (manual + automated) with source
   - **Missing**: Dashboard showing payment schedule, upcoming renewals, advance credits

8. **Advance Payment UI**
   - **Current**: Single period payment submission form
   - **Required**: UI for selecting multiple periods, showing savings/discounts
   - **Missing**: Period selector, amount calculator, benefit display

9. **Admin Review Enhancement**
   - **Current**: Basic approve/reject
   - **Required**: Handle advance payments, trigger sync, show details
   - **Missing**: Advance payment UI in admin panel, sync triggers

### 🟢 Nice to Have

10. **Payment Method Always Visible**
    - **Current**: Manual shown only in provider selection
    - **Required**: Manual payment option always visible on billing pages
    - **Impact**: UX - users may not know manual payment is available

11. **Mixed Payment Strategy**
    - **Current**: Single provider per business
    - **Required**: Support "Both" - automated recurring + manual advance option
    - **Missing**: UI to clarify how both work together

---

## Data Model Requirements

### Required Schema Changes

```prisma
// BillingPayment enhancements
model BillingPayment {
  // ... existing fields ...
  
  // Advance payment tracking
  isAdvancePayment      Boolean   @default(false)
  periodsAdvancePaid    Int       @default(1)
  advancePaymentAppliedAt DateTime?
  advancePaymentExpiresAt DateTime?
  
  // Stripe synchronization
  syncedToProvider      Boolean   @default(false)
  syncedProviderId      PaymentProvider?
  syncedAt              DateTime?
  syncTransactionId     String?
}

// BusinessSubscription enhancements
model BusinessSubscription {
  // ... existing fields ...
  
  // Advance payment credits
  advancePaymentCredits Int       @default(0)
  advancePaymentExpiresAt DateTime?
  lastAdvancePaymentId  String?
  lastAdvancePaymentAt  DateTime?
  
  // Notification preferences
  notifyBeforePayment   Boolean   @default(true)
  notificationLeadDays  Int       @default(7)
}

// New notification model
model PaymentNotification {
  id             String   @id @default(cuid())
  businessId     String
  subscriptionId String
  
  notificationType PaymentNotificationType
  scheduledFor     DateTime
  sentAt           DateTime?
  
  dueDate      DateTime
  amount       Int
  billingPeriod String
  
  title   String
  message String @db.Text
  
  status        PaymentNotificationStatus
  failureReason String?
  retryCount    Int @default(0)
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@index([businessId, scheduledFor])
  @@index([status, scheduledFor])
}

enum PaymentNotificationType {
  UPCOMING_RENEWAL
  ADVANCE_PAYMENT_EXPIRING
  MANUAL_PAYMENT_APPROVED
  MANUAL_PAYMENT_REJECTED
}

enum PaymentNotificationStatus {
  SCHEDULED
  SENT
  FAILED
  CANCELLED
}
```

---

## Architecture Design for Enhancements

### 1. Manual as Default Alternative Pattern

**Concept**: Manual payment is NOT a provider choice - it's a payment method AVAILABLE WITH ANY PROVIDER.

```
Provider Selection:
├─ Stripe (Automated recurring)
│  └─ Can ALSO make manual advance payments
├─ PayMongo (Future - Automated)
│  └─ Can ALSO make manual advance payments
└─ No Provider (Manual Only)
   └─ Only manual payment available
```

**Implementation Strategy**:
- Remove "Manual" from provider selection dropdown
- Add "Pay Manually" button/section on all billing pages
- Check `preferredPaymentProvider` to determine if sync needed
- If no provider → manual only, no sync
- If Stripe → manual + sync to Stripe
- If other → manual + provider-specific sync logic

### 2. Advance Payment Architecture

```typescript
type AdvancePaymentRequest = {
  planId: string
  periodsCount: number  // 1, 3, 6, 12 months
  amount: number        // Calculated: plan price × periods
  paymentMethod: 'GCASH' | 'BANK_TRANSFER' | 'MAYA'
  proofImageUrl: string
  notes?: string
}

type AdvancePaymentResult = {
  paymentId: string
  periodsGranted: number
  expiresAt: Date
  nextBillingDate: Date
  syncRequired: boolean
  syncedToProvider?: string
}
```

**Flow**:
1. User selects periods (1, 3, 6, 12)
2. Calculate total: `planPrice × periods`
3. Apply discount for multi-period (optional)
4. Submit payment proof
5. Admin approves
6. Apply credits to subscription
7. If provider enabled → sync to provider
8. Schedule notification for expiration

### 3. Stripe Sync Service

```typescript
class StripeAdvancePaymentSyncService {
  /**
   * Sync manual advance payment to Stripe subscription
   * Updates Stripe metadata to recognize advance-paid periods
   * Prevents Stripe from charging during advance period
   */
  async syncAdvancePayment(params: {
    subscriptionId: string
    payment: BillingPayment
    periodsAdvancePaid: number
    expiresAt: Date
  }): Promise<SyncResult>

  /**
   * Check if Stripe should skip charge this period
   * Called by webhook handler before processing payment
   */
  async shouldSkipCharge(params: {
    stripeSubscriptionId: string
    billingPeriodStart: Date
  }): Promise<boolean>

  /**
   * Apply advance payment credit to Stripe subscription
   * Creates invoice credit or subscription schedule pause
   */
  async applyAdvanceCredit(params: {
    stripeSubscriptionId: string
    creditAmount: number
    reason: string
  }): Promise<void>
}
```

### 4. Notification System Architecture

```typescript
class PaymentNotificationService {
  /**
   * Schedule renewal reminder notifications
   * Creates notification records for 7, 3, 1 days before renewal
   */
  async scheduleRenewalReminders(params: {
    subscriptionId: string
    nextBillingDate: Date
    amount: number
  }): Promise<void>

  /**
   * Schedule advance payment expiration warning
   * Reminds user to renew before advance credits run out
   */
  async scheduleAdvanceExpirationWarning(params: {
    subscriptionId: string
    expiresAt: Date
  }): Promise<void>

  /**
   * Send notification immediately
   * Used for approval/rejection notifications
   */
  async sendNow(params: {
    businessId: string
    type: PaymentNotificationType
    title: string
    message: string
  }): Promise<void>

  /**
   * Process scheduled notifications
   * Background job runs hourly
   */
  async processScheduledNotifications(): Promise<void>
}
```

---

## Implementation Priority

### Phase 1: Core Advance Payment (Tasks #2-5)
1. Update database schema for advance payment tracking
2. Enhance ManualAdapter to support advance payments
3. Create Stripe sync service
4. Update SubscriptionEngine for advance payment scenarios
5. Complete subscription activation in reviewManualPayment

**Outcome**: Manual advance payment works, syncs to Stripe

### Phase 2: UI Enhancements (Tasks #7-10)
6. Build advance payment submission UI
7. Update payment method UI to show manual as always available
8. Enhance admin review UI for advance payments
9. Create payment schedule dashboard

**Outcome**: Users can make advance payments via UI

### Phase 3: Notifications (Task #6)
10. Build notification service
11. Implement notification scheduling
12. Add notification preferences

**Outcome**: Users get reminded about upcoming payments

### Phase 4: Testing & Edge Cases (Tasks #11-12)
13. Test pure manual (no provider)
14. Test pure Stripe
15. Test mixed (manual advance + Stripe)
16. Test edge cases (duplicate charges, sync failures)

**Outcome**: All scenarios validated and working

---

## Key Scenarios to Support

### Scenario 1: Pure Manual Payment (No Provider)
```
Business has no preferredPaymentProvider
↓
User subscribes → selects "No automated provider"
↓
Makes manual payment for 3 months
↓
Admin approves
↓
Subscription active for 3 months
↓
No sync needed (no provider to sync to)
↓
Notification sent 7 days before expiration
```

### Scenario 2: Stripe with Manual Advance Payment
```
Business has preferredPaymentProvider = 'stripe'
↓
Stripe subscription active, auto-renews monthly
↓
User wants to pay 6 months in advance manually
↓
Submits manual payment for 6 months
↓
Admin approves
↓
System applies 6 months credit to subscription
↓
Sync to Stripe: metadata updated, charges paused for 6 months
↓
After 6 months, Stripe resumes automatic billing
```

### Scenario 3: Manual Subscription → Switch to Stripe
```
Business starts with manual payment only
↓
Pays manually each month
↓
Decides to enable Stripe for convenience
↓
Sets preferredPaymentProvider = 'stripe'
↓
Creates Stripe subscription
↓
Future payments automatic via Stripe
↓
Can still make manual advance payments if desired
```

---

## Success Criteria

### Functional Requirements Met
- ✅ Manual payment available regardless of provider selection
- ✅ Advance payment for multiple periods supported
- ✅ Stripe sync prevents duplicate charges
- ✅ Notifications sent before renewals
- ✅ Admin can review and approve advance payments
- ✅ Payment history shows all sources

### Technical Requirements Met
- ✅ No breaking changes to existing flows
- ✅ Backward compatible with current subscriptions
- ✅ Type-safe implementation
- ✅ Follows existing architecture patterns
- ✅ Comprehensive test coverage

### UX Requirements Met
- ✅ Clear explanation of how manual + automated work together
- ✅ Easy to make advance payments
- ✅ Transparent payment schedule and credits
- ✅ Notifications don't spam users
- ✅ Admin UI is efficient for approvals

---

## Risks & Mitigation

### Risk 1: Duplicate Charges
**Scenario**: Both manual advance payment and Stripe charge occur in same period  
**Mitigation**: 
- Webhook handler checks advance credits before processing
- Sync service updates Stripe metadata immediately
- Add database constraint to prevent overlapping payments

### Risk 2: Sync Failures
**Scenario**: Manual payment approved but Stripe sync fails  
**Mitigation**:
- Mark payment as `syncedToProvider: false`
- Retry sync via background job
- Admin alert if sync fails repeatedly
- Manual intervention path in admin UI

### Risk 3: Notification Spam
**Scenario**: Multiple notifications sent for same renewal  
**Mitigation**:
- Deduplication logic in notification service
- Track `sentAt` timestamp
- User preferences for notification frequency

### Risk 4: Complex State Management
**Scenario**: Multiple advance payments, partial applications, provider switches  
**Mitigation**:
- Clear state machine in SubscriptionEngine
- Audit trail in BillingPayment records
- Admin dashboard showing full payment history
- Comprehensive integration tests

---

## Next Steps

1. ✅ **Task #1 Complete**: Analysis documented
2. 🔄 **Task #2 Next**: Design advance payment data model
3. 📋 **Task #3-12**: Implementation following priority order

---

## References

- [Payment Adapter Architecture](./PAYMENT_ADAPTER_ARCHITECTURE.md)
- [Payment Adapter Implementation Summary](./PAYMENT_ADAPTER_IMPLEMENTATION_SUMMARY.md)
- [Payment Adapter Validation Checklist](./PAYMENT_ADAPTER_VALIDATION_CHECKLIST.md)

---

**Analysis Complete**: 2026-08-31  
**Ready for Implementation**: Yes ✅
