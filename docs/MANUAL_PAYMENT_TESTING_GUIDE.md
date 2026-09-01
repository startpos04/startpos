# Manual Payment Testing Guide

## Overview

This guide walks through testing the complete manual payment flow for subscription billing, including GCash/bank transfer payments, admin review, and subscription activation.

## Prerequisites

### 1. Enable Manual Payment Provider

Check your `.env` file has:

```env
# Manual Payment Provider (GCash, Bank Transfer)
PAYMENT_PROVIDER_MANUAL_ENABLED=true
PAYMENT_PROVIDER_MANUAL_PAYMENT_METHOD=GCash  # or "Bank Transfer"
PAYMENT_PROVIDER_MANUAL_ACCOUNT_NAME=Your Business Name
PAYMENT_PROVIDER_MANUAL_ACCOUNT_NUMBER=09171234567  # GCash number or bank account
PAYMENT_PROVIDER_MANUAL_BANK_NAME=  # Only for bank transfers
```

### 2. Required User Roles

- **Test User**: Regular business owner account (to submit payments)
- **Admin User**: User with `review-manual-payments` permission (to approve/reject)

### 3. Database State

You need at least one subscription plan in the database. Run migrations if needed:

```powershell
pnpm run prisma:migrate:dev
pnpm run db:seed  # If you have seed data
```

## Testing Flow

### Part 1: User Subscribes with Manual Payment

#### Step 1: Navigate to Plans Page

1. Log in as a **regular user** (business owner)
2. Navigate to `/business/subscription/plans`
3. You should see 3 plan cards: Basic, Premium, Enterprise

#### Step 2: Select a Plan

1. Click "Get [Plan Name]" button on any plan
2. **Provider Selection Dialog** should appear with:
   - ✅ Stripe option (Credit Card)
   - ✅ Manual option (GCash or Bank Transfer)

#### Step 3: Choose Manual Payment

1. Select the **Manual Payment** option
   - Should show: "GCash transfer • Admin approval within 24h • Manual billing"
2. Click **"Continue to Payment"**

#### Step 4: Payment Instructions Page

You should be redirected to `/business/subscription/payment-pending` with:

- ✅ Payment instructions card showing:
  - Account name (from env)
  - Account number (from env)
  - Amount to pay
  - Reference number (auto-generated)
- ✅ Payment submission form with:
  - Reference number field (pre-filled, read-only)
  - Transaction ID field (required)
  - Receipt upload (required)
  - Payment date picker
  - Notes field (optional)

#### Step 5: Submit Payment Proof

1. Fill in the form:
   - **Transaction ID**: Enter your GCash reference number (e.g., `GCASH-2024-123456`)
   - **Receipt**: Upload a screenshot or PDF of your payment receipt
   - **Payment Date**: Select when you made the payment
   - **Notes**: (Optional) Add any additional info

2. Click **"Submit Payment"**

3. Success message should appear:
   - "Payment submitted successfully"
   - "Your payment is pending review by our team"

#### Step 6: Check Subscription Status

1. Navigate to `/business/subscription`
2. You should see:
   - Status: **"Pending"** or **"Payment Under Review"**
   - Payment status card showing "Awaiting Approval"
   - No active subscription features yet

---

### Part 2: Admin Reviews Payment

#### Step 7: Log in as Admin

1. Log out from the regular user account
2. Log in as a user with **`review-manual-payments`** permission

> **How to grant permission:**
> ```sql
> -- In your database
> UPDATE "User" 
> SET permissions = array_append(permissions, 'review-manual-payments')
> WHERE email = 'admin@yourcompany.com';
> ```

#### Step 8: Navigate to Payment Review Page

1. Go to `/admin/billing/payments` (or wherever you've set up the review interface)
   
   **Note**: If this page doesn't exist yet, you can review payments directly via server function:

   ```typescript
   // In browser console or API route:
   import { reviewManualPayment } from '@/lib/server-fn/review-manual-payment'
   
   // Get pending payments first
   // Then review one:
   await reviewManualPayment({
     data: {
       paymentId: 'clx...', // Payment ID from database
       decision: 'approve',  // or 'reject'
       adminNotes: 'Verified payment receipt'
     }
   })
   ```

#### Step 9: Review Payment Details

Admin should see:
- ✅ Customer business name
- ✅ Plan being purchased
- ✅ Amount paid
- ✅ Transaction ID submitted by user
- ✅ Uploaded receipt (downloadable/viewable)
- ✅ Payment date
- ✅ User notes
- ✅ Submission timestamp

#### Step 10a: Approve Payment

1. Click **"Approve"** button
2. (Optional) Add admin notes: "Payment verified via GCash transaction history"
3. Confirm approval

**Expected Results:**
- ✅ Payment status → `COMPLETED`
- ✅ Subscription created/activated for the user
- ✅ User's `entitlement.planId` updated
- ✅ User can now access subscription features
- ✅ `billingPayments` record updated with approval info

#### Step 10b: Reject Payment (Alternative)

1. Click **"Reject"** button
2. Add admin notes explaining rejection: "Receipt does not match amount"
3. Confirm rejection

**Expected Results:**
- ✅ Payment status → `FAILED`
- ✅ Subscription NOT activated
- ✅ User receives rejection notification
- ✅ User can submit new payment proof

---

### Part 3: User Checks Status After Review

#### Step 11: User Logs Back In

1. Log out from admin account
2. Log back in as the regular user

#### Step 12a: If Approved

Navigate to `/business/subscription`:

- ✅ Status: **"Active"**
- ✅ Current plan shows the subscribed plan
- ✅ Payment method: "Manual Payment (GCash)"
- ✅ Next billing date displayed
- ✅ Access to subscription features enabled
- ✅ Success message shown (if first login after approval)

#### Step 12b: If Rejected

Navigate to `/business/subscription`:

- ✅ Status: **"Payment Failed"** or similar
- ✅ Error message explaining rejection
- ✅ Option to "Try Again" or "Submit New Payment"
- ✅ Can view admin's rejection notes
- ✅ Can upload new receipt

---

## Testing Edge Cases

### Test Case 1: Duplicate Submission

1. Submit payment proof
2. Try to submit again before admin review
3. **Expected**: Error message "Payment already submitted and pending review"

### Test Case 2: Invalid Receipt Format

1. Try uploading a non-image/non-PDF file
2. **Expected**: Validation error "Only images and PDFs are allowed"

### Test Case 3: Missing Required Fields

1. Leave Transaction ID empty
2. Try to submit
3. **Expected**: Form validation error "Transaction ID is required"

### Test Case 4: Admin Without Permission

1. Log in as regular user (no admin permission)
2. Try to access `/admin/billing/payments`
3. **Expected**: 403 Forbidden or redirect

### Test Case 5: Expired Payment Window

1. Submit payment proof
2. Wait for expiration (if configured, e.g., 48 hours)
3. **Expected**: Payment auto-rejected or requires resubmission

### Test Case 6: Plan Upgrade with Manual Payment

1. User with existing Stripe subscription
2. Try to change to manual payment
3. **Expected**: Shows appropriate migration warning

---

## Database Verification

### Check Payment Record

```sql
-- View all manual payments
SELECT 
  bp.id,
  bp.status,
  bp."transactionId",
  bp.amount,
  bp."receiptUrl",
  bp."submittedAt",
  bp."reviewedAt",
  bp."approvedById",
  u.email as approved_by,
  b.name as business_name
FROM "BillingPayment" bp
LEFT JOIN "User" u ON u.id = bp."approvedById"
LEFT JOIN "Business" b ON b.id = bp."businessId"
WHERE bp.provider = 'manual'
ORDER BY bp."submittedAt" DESC;
```

### Check Subscription Created

```sql
-- Verify subscription activated
SELECT 
  s.id,
  s.status,
  s."planId",
  s."providerId",
  s."currentPeriodStart",
  s."currentPeriodEnd",
  b.name as business_name
FROM "BillingSubscription" s
JOIN "Business" b ON b.id = s."businessId"
WHERE s."providerId" = 'manual'
ORDER BY s."createdAt" DESC;
```

### Check User Entitlement

```sql
-- Verify user has access to plan features
SELECT 
  u.email,
  u.entitlement->>'planId' as plan_id,
  u.entitlement->>'billingModel' as billing_model,
  b.name as business_name
FROM "User" u
JOIN "Business" b ON b.id = u."businessId"
WHERE u.entitlement IS NOT NULL;
```

---

## Testing Payment Reminders

Manual payment subscriptions need manual renewal. Test the reminder system:

### Test Renewal Reminder Cron

```powershell
# Trigger the renewal reminder job manually
curl http://localhost:3000/api/cron/daily

# Or via code:
# POST /api/cron/daily
```

**Expected**:
- ✅ Users with subscriptions expiring in 7 days get email reminder
- ✅ Users with subscriptions expiring in 3 days get email reminder
- ✅ Users with subscriptions expiring in 1 day get email reminder
- ✅ Check logs: "Sent [X] renewal reminders"

### Verify Reminder Emails

Check your email service (e.g., Resend) for sent emails:

```sql
-- If you log sent emails in DB
SELECT 
  "to",
  subject,
  "sentAt"
FROM "EmailLog"
WHERE subject LIKE '%renewal%'
ORDER BY "sentAt" DESC;
```

---

## Testing Payment Expiration

### Test Subscription Expiration

1. Manually expire a subscription (update DB):

```sql
UPDATE "BillingSubscription"
SET "currentPeriodEnd" = NOW() - INTERVAL '1 day'
WHERE "providerId" = 'manual'
AND id = 'clx...';  -- Specific subscription ID
```

2. Restart the app or trigger a check
3. User should:
   - ✅ Lose access to subscription features
   - ✅ See "Subscription Expired" status
   - ✅ Be prompted to renew
   - ✅ Can submit new payment for renewal

---

## API Testing with Postman/Thunder Client

### Submit Payment Proof

```http
POST /api/billing/manual/submit-payment
Content-Type: multipart/form-data

{
  "referenceNumber": "REF-123456",
  "transactionId": "GCASH-2024-123456",
  "receipt": <file>,
  "paymentDate": "2024-08-29",
  "notes": "Paid via GCash"
}
```

### Review Payment (Admin)

```http
POST /api/admin/billing/review-payment
Content-Type: application/json

{
  "paymentId": "clx...",
  "decision": "approve",
  "adminNotes": "Payment verified"
}
```

---

## Troubleshooting

### Issue: Provider Selection Dialog Not Showing Manual Option

**Check**:
1. `.env` has `PAYMENT_PROVIDER_MANUAL_ENABLED=true`
2. Manual provider config is enabled in `src/lib/billing/provider-config.ts`
3. `paymentProviderRegistry.register('manual', manualAdapter)` is called

### Issue: Upload Failing

**Check**:
1. File upload service is configured (e.g., S3, Cloudinary)
2. `uploadReceiptImage` function in manual adapter is working
3. File size limits (usually 5MB max)
4. Allowed MIME types: image/*, application/pdf

### Issue: Admin Can't Review

**Check**:
1. User has `review-manual-payments` permission in database
2. Permission middleware is properly configured
3. Review UI route is accessible

### Issue: Subscription Not Activating After Approval

**Check**:
1. `createSubscription` in manual adapter is being called
2. No errors in server logs
3. Prisma client is properly configured
4. Database relations are correct

---

## Success Criteria Checklist

✅ **User Flow**:
- [ ] User can see manual payment option
- [ ] Payment instructions display correctly
- [ ] User can upload receipt
- [ ] Payment status shows "Pending"
- [ ] User sees approval/rejection notification

✅ **Admin Flow**:
- [ ] Admin can see pending payments
- [ ] Admin can view receipt
- [ ] Admin can approve payment
- [ ] Admin can reject payment with reason

✅ **System Behavior**:
- [ ] Subscription activates on approval
- [ ] Subscription does NOT activate on rejection
- [ ] Email notifications sent
- [ ] Renewal reminders work
- [ ] Expired subscriptions lose access

✅ **Data Integrity**:
- [ ] Payment records created correctly
- [ ] Subscription records linked properly
- [ ] User entitlements updated
- [ ] Audit trail complete (who approved, when, why)

---

## Next Steps After Testing

1. **Set up admin review UI** if not exists yet
2. **Configure email notifications** for payment status changes
3. **Add webhook endpoints** for manual payment events (if needed)
4. **Set up monitoring** for pending payments (alert if >24h)
5. **Document internal process** for admins reviewing payments

---

## Quick Test Script

For rapid testing, use this sequence:

```bash
# 1. Reset test data (optional)
pnpm run prisma:migrate:reset

# 2. Start dev server
pnpm run dev

# 3. Test as user
# - Navigate to /business/subscription/plans
# - Select plan → Manual payment
# - Submit payment proof

# 4. Check DB
# - Verify BillingPayment record created
# - Status should be PENDING

# 5. Approve manually
# - Connect to DB
# - Run approval SQL or use admin UI

# 6. Verify user
# - Check subscription activated
# - Check entitlement updated
# - Check user has access
```

---

**Testing complete when all flows work end-to-end without errors!** 🎉
