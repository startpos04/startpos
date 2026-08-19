# GCash Manual Payment System

## Overview

The GCash Manual Payment System allows Philippine users to pay for subscriptions directly via GCash instead of Stripe. This addresses the blocker where Stripe is not commonly used in the Philippines, while GCash is the dominant payment method.

## Architecture

### Database Schema

**ManualPaymentRequest Model**
- Tracks payment submissions from users
- Stores payment proof images (base64 or URL)
- Includes admin review workflow
- Records subscription extension dates

```prisma
enum ManualPaymentStatus {
  PENDING       // Awaiting admin review
  APPROVED      // Payment verified, subscription activated
  REJECTED      // Payment proof rejected
  EXPIRED       // Request expired without action
}
```

### User Flow

1. **User submits payment**
   - Selects subscription plan
   - Transfers payment to GCash account
   - Uploads payment proof screenshot
   - Optionally provides reference number and notes

2. **Admin reviews payment**
   - Views all pending requests in admin dashboard
   - Examines payment proof image
   - Approves or rejects with notes

3. **Subscription activation** (on approval)
   - System automatically extends/activates subscription
   - Calculates correct period dates (extends from current end if active)
   - Records status history for audit trail
   - Sends notification to business owner

4. **Monthly reminders**
   - System checks daily for expiring subscriptions
   - Sends reminders 7 days before expiry
   - Only reminds businesses that paid manually
   - Prevents duplicate reminders per period

## Components

### User-Facing Pages

**`/billing/gcash-payment`**
- Payment instructions with GCash account details
- Plan selection dropdown
- Payment proof upload with preview
- Reference number and notes input
- Pending request status tracking

**`/billing/gcash-guide`**
- Detailed how-it-works explanation
- FAQ section
- Support contact information

**`/billing` (updated)**
- Added "Pay via GCash" buttons alongside Stripe options
- Info banner explaining payment method choices
- Visible during TRIAL and EXPIRED/CANCELLED states

### Admin Dashboard

**`/(admin)/payment-approvals`**
- Stats cards (pending, approved, rejected counts)
- Searchable/filterable request list
- Full-size image viewer for payment proofs
- Approve/reject dialogs with notes
- Auto-refresh every 30 seconds

### Server Functions

**`submitGcashPayment`**
- Validates plan exists and is active
- Prevents duplicate pending requests within 24 hours
- Creates ManualPaymentRequest with PENDING status

**`reviewPaymentRequest`**
- Admin-only access control
- Handles approve/reject actions
- Automatically activates/extends subscription on approval
- Calculates correct billing period dates
- Records subscription status history

**`fetchPendingPaymentRequests`**
- Returns payment requests for a specific business
- Used by user payment page to show status

**`fetchAllPaymentRequests`**
- Admin-only endpoint
- Returns all requests across all businesses
- Ordered by status (PENDING first)

### Background Jobs

**`manual-payment-reminders`**
- Runs daily at 9:00 AM (configured in `vercel.json`)
- Checks ACTIVE subscriptions expiring within 7 days
- Only reminds if last payment was manual (GCash)
- Prevents duplicate reminders per subscription period
- Sends in-app notifications to admins
- Includes payment instructions and GCash details

**Cron Endpoint:** `/api/cron/manual-payment-reminders`
- Protected by Bearer token authentication
- Returns job execution results

## Configuration

### Environment Variables

```bash
# Cron job authentication
CRON_SECRET=your-secret-token-here
```

### GCash Account Details

Currently hardcoded in `gcash-payment.tsx` and `manual-payment-reminders.ts`:
```typescript
const GCASH_CONFIG = {
  accountName: 'StartPOS Business',
  accountNumber: '09171234567',
}
```

**TODO:** Move to environment variables or system configuration for production.

### Vercel Cron Schedule

Configured in `web/vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/manual-payment-reminders",
      "schedule": "0 9 * * *"
    }
  ]
}
```

## Security Considerations

1. **Admin Access Control**
   - All admin endpoints verify ADMIN or SUPERVISOR role
   - Payment review restricted to authorized users only

2. **Duplicate Prevention**
   - System blocks duplicate pending requests within 24 hours
   - Prevents spam submissions

3. **Cron Authentication**
   - Protected by CRON_SECRET Bearer token
   - Vercel automatically includes Authorization header

4. **Payment Proof Storage**
   - Currently stored as base64 in database
   - **TODO:** Move to secure file storage (S3, Cloudinary) for production

5. **Input Validation**
   - File type and size validation (images only, max 5MB)
   - Amount validation against selected plan
   - Reference number sanitization

## Future Enhancements

### High Priority

1. **Email Notifications**
   - Integrate with Resend (already configured for auth)
   - Send emails on payment submission, approval, rejection
   - Include payment details in reminder emails

2. **File Upload Service**
   - Replace base64 storage with S3/Cloudinary
   - Generate presigned URLs for secure image access
   - Add image compression/optimization

3. **Environment Configuration**
   - Move GCash account details to env vars
   - Add SystemConfig for runtime updates

### Medium Priority

4. **Payment History**
   - Dedicated page showing all past payments
   - Export functionality for accounting
   - Filter by date range and status

5. **Bulk Operations**
   - Admin bulk approval/rejection
   - Batch reminder sending
   - CSV export of payments

6. **Analytics Dashboard**
   - Payment method usage stats
   - Approval time metrics
   - Monthly revenue by payment type

### Low Priority

7. **SMS Notifications**
   - Send SMS reminders via Semaphore/Twilio
   - More reliable for Philippine users

8. **Auto-expiry**
   - Automatically expire old PENDING requests
   - Configurable timeout (default: 7 days)

9. **Receipt Generation**
   - Generate official receipts on approval
   - Include BIR-compliant details
   - PDF download option

## Testing

### Manual Testing Checklist

**User Flow:**
- [ ] Submit GCash payment with valid proof
- [ ] Verify duplicate submission is blocked
- [ ] Check pending request appears in user dashboard
- [ ] Upload different image formats (PNG, JPG)
- [ ] Test with invalid file type/size

**Admin Flow:**
- [ ] View pending requests in admin dashboard
- [ ] Open payment proof image viewer
- [ ] Approve payment and verify subscription activated
- [ ] Reject payment with notes
- [ ] Verify status updates in real-time

**Subscription Activation:**
- [ ] Approve payment for TRIAL user → becomes ACTIVE
- [ ] Approve payment for EXPIRED user → reactivates
- [ ] Approve payment for ACTIVE user → extends period
- [ ] Verify correct billing dates calculated

**Reminders:**
- [ ] Trigger cron job manually
- [ ] Verify notifications sent 7 days before expiry
- [ ] Check no duplicate reminders sent
- [ ] Verify only manual-payment subscriptions reminded

### Automated Tests (TODO)

```typescript
// test/integration/gcash-payment.test.ts
describe('GCash Payment System', () => {
  it('should create pending payment request')
  it('should prevent duplicate submissions')
  it('should activate subscription on approval')
  it('should extend active subscription correctly')
  it('should send reminders to expiring subscriptions')
})
```

## Deployment

1. **Database Migration**
   ```bash
   cd web
   npx prisma migrate deploy
   npx prisma generate
   ```

2. **Environment Variables**
   - Set `CRON_SECRET` in production
   - Update GCash account details (move to env)

3. **Vercel Cron Setup**
   - Vercel automatically configures crons from `vercel.json`
   - No additional setup needed
   - Monitor in Vercel dashboard → Cron

4. **Admin User Setup**
   - Ensure at least one user has ADMIN role
   - Access admin dashboard at `/payment-approvals`

## Monitoring

### Key Metrics

- Pending request count (should stay low)
- Average approval time
- Rejection rate (should be <5%)
- Payment method split (Stripe vs GCash)

### Alerts to Configure

- Pending requests > 10 (need more admin capacity)
- Approval time > 24 hours
- Cron job failures
- High rejection rate (>10%)

## Support

For issues or questions:
- Technical: Review this documentation
- User support: Link to `/billing/gcash-guide`
- Admin help: Contact dev team

---

**Last Updated:** August 18, 2026
**Version:** 1.0
**Status:** Production Ready
