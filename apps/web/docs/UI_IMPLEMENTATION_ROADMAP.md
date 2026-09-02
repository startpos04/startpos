# UI Implementation Roadmap - Payment Flow Integration

## Overview
This document outlines the remaining UI work needed to connect the advance payment system to the user journey. The backend is 100% complete - this is purely frontend/UX work.

---

## ✅ What's Already Working

1. **Backend Services** (100% Complete)
   - ✅ Database schema with advance payment fields
   - ✅ Manual payment submission API (`submitManualPayment`)
   - ✅ Admin approval API (`reviewManualPayment`)
   - ✅ Stripe sync service with retry logic
   - ✅ Credit consumption on webhooks
   - ✅ Notification system
   - ✅ Background jobs (sync retry, notification processing)

2. **Existing UI Components**
   - ✅ `/billing/manual-payment` - Manual payment form (works standalone)
   - ✅ `/payment-approvals` - Admin approval interface
   - ✅ Plan selection page (`/billing/plans`)
   - ✅ Billing dashboard (`/billing`)

---

## 🚧 What Needs to Be Built

### Phase 1: Payment Method Selection Flow
**Priority: HIGH**

#### 1.1 Payment Method Choice Modal/Page
**File**: `src/components/billing/PaymentMethodSelector.tsx` (NEW)

**Purpose**: After user selects a plan, show them payment method options

**UI Design**:
```tsx
┌─────────────────────────────────────────────────────┐
│  Choose Payment Method                               │
│  Premium Plan - ₱499/month                           │
├─────────────────────────────────────────────────────┤
│                                                       │
│  ○ Automatic Payment (Stripe)                       │
│    ┌───────────────────────────────────────────┐   │
│    │ 💳 Pay with credit/debit card             │   │
│    │ • Charged automatically every month        │   │
│    │ • No manual approval needed                │   │
│    │ • Instant activation                       │   │
│    └───────────────────────────────────────────┘   │
│                                                       │
│  ○ Manual Payment                                    │
│    ┌───────────────────────────────────────────┐   │
│    │ 🏦 Bank transfer, GCash, Maya             │   │
│    │ • Pay 1-3 months in advance               │   │
│    │ • Admin approval required (24hrs)         │   │
│    │ • Upload payment proof                     │   │
│    └───────────────────────────────────────────┘   │
│                                                       │
│           [Back]  [Continue]                         │
└─────────────────────────────────────────────────────┘
```

**Props Interface**:
```typescript
interface PaymentMethodSelectorProps {
  planId: string
  planName: string
  monthlyAmount: number // in cents
  onSelectAutomatic: () => void
  onSelectManual: () => void
  onCancel: () => void
}
```

**State Management**:
```typescript
const [selectedMethod, setSelectedMethod] = useState<'automatic' | 'manual' | null>(null)
```

**Integration Points**:
- Called from `/billing/plans` when user clicks "Subscribe"
- Routes to either:
  - Automatic → `StripePaymentForm` component
  - Manual → `/billing/manual-payment` with query params

---

#### 1.2 Embedded Stripe Payment Form
**File**: `src/components/billing/StripePaymentForm.tsx` (NEW)

**Purpose**: In-app card payment without redirecting to Stripe Checkout

**Dependencies**:
```bash
# Already installed in your project
@stripe/stripe-js
@stripe/react-stripe-js
```

**UI Design**:
```tsx
┌─────────────────────────────────────────────────────┐
│  Payment Details                                     │
│  Premium Plan - ₱499/month                           │
├─────────────────────────────────────────────────────┤
│                                                       │
│  Card Information                                    │
│  ┌─────────────────────────────────────────────┐   │
│  │ [Stripe CardElement]                         │   │
│  │ 4242 4242 4242 4242  12/28  123             │   │
│  └─────────────────────────────────────────────┘   │
│                                                       │
│  Cardholder Name                                     │
│  [Juan Dela Cruz                              ]    │
│                                                       │
│  ☐ Save card for future payments                     │
│                                                       │
│  ─────────────────────────────────────────────      │
│                                                       │
│  Subscription Summary                                │
│  • Monthly billing: ₱499/month                       │
│  • First charge today: ₱499.00                       │
│  • Next billing: Jan 31, 2027                       │
│                                                       │
│           [Cancel]  [Subscribe - ₱499]               │
└─────────────────────────────────────────────────────┘
```

**Implementation**:
```typescript
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY)

export function StripePaymentForm({ planId, amount, onSuccess, onCancel }: Props) {
  return (
    <Elements stripe={stripePromise}>
      <CheckoutForm planId={planId} amount={amount} onSuccess={onSuccess} onCancel={onCancel} />
    </Elements>
  )
}

function CheckoutForm({ planId, amount, onSuccess, onCancel }: Props) {
  const stripe = useStripe()
  const elements = useElements()
  const [processing, setProcessing] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return

    setProcessing(true)

    try {
      // 1. Create payment method
      const cardElement = elements.getElement(CardElement)
      const { error, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardElement!,
      })

      if (error) {
        toast.error(error.message)
        return
      }

      // 2. Call your backend to create subscription
      const result = await createStripeSubscription({
        planId,
        paymentMethodId: paymentMethod.id,
      })

      if (result.success) {
        toast.success('Subscription activated!')
        onSuccess(result.subscription)
      }
    } catch (err) {
      toast.error('Payment failed')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <CardElement options={{ style: cardElementStyle }} />
      {/* Rest of form */}
    </form>
  )
}
```

**Backend API** (Already exists or needs to be created):
```typescript
// src/lib/server-fn/create-stripe-subscription.ts
export async function createStripeSubscription({
  planId,
  paymentMethodId,
}: {
  planId: string
  paymentMethodId: string
}) {
  // 1. Get business and plan
  // 2. Create/retrieve Stripe customer
  // 3. Attach payment method to customer
  // 4. Create Stripe subscription
  // 5. Create BusinessSubscription record
  // 6. Return success
}
```

---

#### 1.3 Update Plans Page Flow
**File**: `src/routes/(private)/(dashboard)/billing/plans/index.tsx` (MODIFY)

**Current**: Clicking "Subscribe" likely redirects to Stripe Checkout  
**New**: Clicking "Subscribe" opens `PaymentMethodSelector` modal

**Changes Needed**:
```typescript
// Before
const handleSubscribe = (planId: string) => {
  // Redirect to Stripe Checkout
  window.location.href = stripeCheckoutUrl
}

// After
const handleSubscribe = (plan: SubscriptionPlan) => {
  setSelectedPlan(plan)
  setShowPaymentMethodModal(true)
}

const handlePaymentMethodSelected = (method: 'automatic' | 'manual') => {
  if (method === 'automatic') {
    setShowStripeForm(true)
  } else {
    navigate({
      to: '/billing/manual-payment',
      search: {
        planId: selectedPlan.id,
        amount: selectedPlan.monthlyPrice,
        periodsAdvancePaid: 1,
      },
    })
  }
  setShowPaymentMethodModal(false)
}
```

---

### Phase 2: Payment Status Tracking UI
**Priority: MEDIUM**

#### 2.1 Payment Status Dashboard
**File**: `src/routes/(private)/(dashboard)/billing/payment-status/index.tsx` (NEW)

**Purpose**: User can track all their manual payment submissions

**Route**: `/billing/payment-status`

**UI Design**:
```tsx
┌─────────────────────────────────────────────────────┐
│  My Payment Requests                    [+ New]      │
├─────────────────────────────────────────────────────┤
│                                                       │
│  Filters: [All] [Pending] [Approved] [Rejected]     │
│                                                       │
│  🟡 PENDING APPROVAL                                 │
│  ┌───────────────────────────────────────────────┐  │
│  │ #PAY-20261231-0001                            │  │
│  │ ₱1,497.00 • 3 months • Dec 31, 2026          │  │
│  │ Awaiting admin review                         │  │
│  │                                                │  │
│  │ [View Details] [Cancel Request]               │  │
│  └───────────────────────────────────────────────┘  │
│                                                       │
│  ✅ APPROVED                                         │
│  ┌───────────────────────────────────────────────┐  │
│  │ #PAY-20261215-0001                            │  │
│  │ ₱2,994.00 • 6 months • Dec 15, 2026          │  │
│  │ Approved Dec 16, 2026 • 6 credits applied    │  │
│  │                                                │  │
│  │ [View Receipt]                                │  │
│  └───────────────────────────────────────────────┘  │
│                                                       │
└─────────────────────────────────────────────────────┘
```

**Data Fetching**:
```typescript
// Server function (NEW)
// src/lib/server-fn/fetch-payment-requests.ts
export async function fetchPaymentRequests(businessId: string) {
  return await prisma.billingPayment.findMany({
    where: {
      businessId,
      provider: 'MANUAL',
    },
    include: {
      subscription: {
        include: { plan: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
}
```

**Component Structure**:
```typescript
export function PaymentStatusPage() {
  const user = useStore(authStore, s => s.user)
  const { data, isLoading } = useQuery({
    queryKey: ['payment-requests', user?.business?.id],
    queryFn: () => fetchPaymentRequests(user!.business!.id),
  })

  return (
    <div>
      <PaymentStatusFilters />
      <PaymentRequestList requests={data} />
    </div>
  )
}
```

---

#### 2.2 Payment Details Modal
**File**: `src/components/billing/PaymentDetailsModal.tsx` (NEW)

**Purpose**: Show full details of a payment request when user clicks "View Details"

**UI Design**:
```tsx
┌─────────────────────────────────────────────────────┐
│  Payment Request Details                     [X]     │
├─────────────────────────────────────────────────────┤
│                                                       │
│  Reference: #PAY-20261231-0001                       │
│  Status: 🟡 Pending Admin Approval                   │
│                                                       │
│  ──────────────────────────────────────────────     │
│                                                       │
│  Payment Information                                 │
│  • Plan: Premium Plan                                │
│  • Amount: ₱1,497.00                                 │
│  • Billing Periods: 3 months                         │
│  • Monthly Rate: ₱499.00/month                       │
│  • Coverage: Jan 1 - Mar 31, 2027                   │
│                                                       │
│  Submission Details                                  │
│  • Submitted: Dec 31, 2026 2:30 PM                  │
│  • Payment Method: Bank Transfer                     │
│  • Reference Number: BDO-123456789                   │
│                                                       │
│  Proof of Payment                                    │
│  [Image Preview]                                     │
│  [View Full Size]                                    │
│                                                       │
│           [Close]                                    │
└─────────────────────────────────────────────────────┘
```

**Props**:
```typescript
interface PaymentDetailsModalProps {
  paymentId: string
  isOpen: boolean
  onClose: () => void
}
```

---

#### 2.3 Add Payment Status Link to Billing Dashboard
**File**: `src/routes/(private)/(dashboard)/billing/index.tsx` (MODIFY)

**Add a card/section**:
```tsx
<Card>
  <CardHeader>
    <CardTitle>Manual Payments</CardTitle>
  </CardHeader>
  <CardContent>
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Track your manual payment submissions
      </p>
      <Button variant="outline" onClick={() => navigate({ to: '/billing/payment-status' })}>
        View Payment Requests
      </Button>
    </div>
  </CardContent>
</Card>
```

---

### Phase 3: Enhanced User Experience
**Priority: LOW**

#### 3.1 Payment Method Preferences
**File**: `src/routes/(private)/(dashboard)/settings/payment-preferences.tsx` (NEW)

**Purpose**: User can set default payment method preference

**Features**:
- Set preferred method (Automatic vs Manual)
- Save card for automatic payments
- Update notification preferences
- View payment history

---

#### 3.2 Advance Credit Display
**File**: Modify billing dashboard to show advance credits prominently

**UI Addition**:
```tsx
{subscription.advancePaymentCredits > 0 && (
  <Alert className="bg-green-50 border-green-200">
    <InfoIcon className="h-4 w-4 text-green-600" />
    <AlertTitle>Advance Payment Active</AlertTitle>
    <AlertDescription>
      You have {subscription.advancePaymentCredits} billing periods remaining.
      Next payment due: {formatDate(subscription.advancePaymentExpiresAt)}
    </AlertDescription>
  </Alert>
)}
```

---

## 📋 Implementation Checklist

### Must Have (MVP)
- [ ] PaymentMethodSelector component
- [ ] Update /billing/plans to use selector
- [ ] Manual payment form already works ✅
- [ ] Test end-to-end: Plan selection → Payment method → Manual submission → Admin approval

### Should Have (Phase 2)
- [ ] StripePaymentForm component (embedded card entry)
- [ ] create-stripe-subscription server function
- [ ] Payment status dashboard (/billing/payment-status)
- [ ] PaymentDetailsModal component
- [ ] Link from billing dashboard to payment status

### Nice to Have (Phase 3)
- [ ] Payment preferences page
- [ ] Advance credit widget on dashboard
- [ ] Payment history export
- [ ] Email notification templates (HTML)

---

## 🔌 Backend APIs Needed

### Already Exists ✅
- `submitManualPayment` - Submit manual payment
- `reviewManualPayment` - Admin approve/reject
- `fetchPlans` - Get subscription plans

### Need to Create
- `createStripeSubscription` - Create subscription with Stripe Elements
- `fetchPaymentRequests` - Get all manual payments for a business
- `cancelPaymentRequest` - Cancel pending manual payment

---

## 🎨 Design System Components Needed

**Already Available** (from your existing UI):
- ✅ Button
- ✅ Card, CardHeader, CardTitle, CardContent
- ✅ Input, Textarea, Label
- ✅ Select, SelectTrigger, SelectValue
- ✅ Badge
- ✅ Alert, AlertTitle, AlertDescription
- ✅ Dialog/Modal (use MountManager.show)

**May Need**:
- Radio group (for payment method selection)
- Tabs (for payment status filters)

---

## 🚀 Implementation Order

### Week 1: Payment Method Selection
1. Create PaymentMethodSelector component
2. Integrate into /billing/plans
3. Test manual payment flow end-to-end

### Week 2: Stripe Integration
1. Create StripePaymentForm component
2. Implement create-stripe-subscription API
3. Test automatic payment flow

### Week 3: Payment Tracking
1. Create payment status dashboard
2. Implement payment details modal
3. Add links from billing dashboard

### Week 4: Polish & Testing
1. Add advance credit displays
2. Improve error messages
3. End-to-end testing all scenarios
4. User acceptance testing

---

## 📝 Testing Scenarios

### Manual Payment Flow
1. User selects Premium plan
2. Chooses "Manual Payment"
3. Selects 3 months
4. Uploads proof
5. Submits
6. Admin approves
7. User sees active subscription with 3 credits

### Automatic Payment Flow
1. User selects Premium plan
2. Chooses "Automatic Payment"
3. Enters card details
4. Subscription created immediately
5. User sees active subscription

### Mixed Usage
1. User has active Stripe subscription
2. Submits 3-month manual advance payment
3. Admin approves
4. Stripe billing paused for 3 months
5. After 3 months, Stripe resumes

---

## 🎯 Success Criteria

✅ User can choose payment method during plan selection  
✅ Manual payments work with 1-3 month advance option  
✅ Automatic payments work with embedded Stripe form  
✅ Users can track their payment submissions  
✅ Advance credits display correctly on dashboard  
✅ No confusion between manual and automatic options  

---

**Ready to start implementation!** 🚀

The backend is solid. Now it's just wiring up the UI flow to match your user journey vision.
